"use strict";

const net = require("net");
const config = require("../config.js");

// small in-memory rate limits for the parts of the server that strangers can
// reach: logins, sign-ups, error reports and the game socket; and who a web
// request is from.

const LOOPBACK = ["127.0.0.1", "::1"];
const MAX_KEYS = 100000;
const MAX_KEY_LENGTH = 64;

// an address as limits count it. an IPv4 address is itself (also when it
// arrives written as an IPv6 one, "::ffff:1.2.3.4"). an IPv6 address is its
// first four groups, the /64: that is what one customer is given, and all
// 2^64 addresses in it are theirs to use.
const key = address => {
  const text = String(address || "").replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, "").toLowerCase();
  if (!text.includes(":")) {
    return text.slice(0, MAX_KEY_LENGTH);
  }
  const [head, tail = ""] = text.split("%")[0].split("::");
  const front = head ? head.split(":") : [];
  const back = tail ? tail.split(":") : [];
  const groups = text.includes("::") ? [...front, ...Array(Math.max(0, 8 - front.length - back.length)).fill("0"), ...back] : front;
  return groups.slice(0, 4).map(group => group.replace(/^0+(?=.)/, "")).join(":").slice(0, MAX_KEY_LENGTH);
};

const isLoopback = address => LOOPBACK.includes(String(address || "").replace(/^::ffff:/i, ""));

// the addresses Cloudflare's edge connects from, as it publishes them at
// https://www.cloudflare.com/ips/ (they seldom change; add any new range here).
const CLOUDFLARE = new net.BlockList();
for (const range of ["173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22", "141.101.64.0/18",
  "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20", "197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15",
  "104.16.0.0/13", "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22"]) {
  const [prefix, bits] = range.split("/");
  CLOUDFLARE.addSubnet(prefix, Number(bits), "ipv4");
}
for (const range of ["2400:cb00::/32", "2606:4700::/32", "2803:f800::/32", "2405:b500::/32", "2405:8100::/32",
  "2a06:98c0::/29", "2c0f:f248::/32"]) {
  const [prefix, bits] = range.split("/");
  CLOUDFLARE.addSubnet(prefix, Number(bits), "ipv6");
}
const fromCloudflare = address => {
  const family = net.isIP(address);
  return family !== 0 && CLOUDFLARE.check(address, family === 4 ? "ipv4" : "ipv6");
};

// is this address the server's own machine, and does that count for
// anything here? (It must not when a local reverse proxy forwards everyone.)
const isTrustedLocal = address => config.trustLocalRequests && isLoopback(address);

// who a web request is from: {address, key, local, direct}.
//   address  the visitor's, for showing (the last hop a trusted proxy
//            reports, else the connection's own)
//   key      the same as limits count it (above)
//   direct   it came from this machine and through no proxy: somebody at
//            the server itself, or an SSH tunnel to it
//   local    direct, and requests from this machine are trusted (config)
// A request that carries a forwarding header came through a proxy or a
// tunnel, whatever else is set, and is never taken for this machine's own.
const clientOf = req => {
  const own = String(req.socket.remoteAddress || "").replace(/^::ffff:/i, "");
  const forwarded = req.headers["x-forwarded-for"] || req.headers.forwarded || req.headers["cf-connecting-ip"] || req.headers["x-real-ip"];
  const hops = String(req.headers["x-forwarded-for"] || "").split(",").map(hop => hop.trim()).filter(Boolean);
  // the last X-Forwarded-For entry is the one the local proxy appended: who
  // connected to it (the first is whatever the visitor sent, so it is never
  // used). Behind Cloudflare that is Cloudflare's own edge, which made every
  // visitor one address (and left remoteip out of the Turnstile check), so
  // then CF-Connecting-IP is the visitor. Only when that hop is Cloudflare:
  // anyone who reaches the server directly can send the header too. Neither
  // header counts unless the local reverse proxy has been trusted.
  const lastHop = (hops.at(-1) || "").replace(/^::ffff:/i, "");
  const cloudflareAddress = String(req.headers["cf-connecting-ip"] || "").trim().replace(/^::ffff:/i, "");
  const reported = net.isIP(cloudflareAddress) && fromCloudflare(lastHop) ? cloudflareAddress : lastHop;
  const address = config.trustedProxy && isLoopback(own) && reported ? reported.replace(/^::ffff:/i, "").slice(0, 60) : own;
  const direct = isLoopback(own) && !forwarded;
  return {address, key: key(address), direct, local: direct && config.trustLocalRequests};
};

// the names this server answers to: what a Host header, or the Origin of a
// request that changes something, may say. A page from anywhere else that
// got a browser to send a request here (DNS rebinding, a cross-site form)
// names another.
const ownHosts = (() => {
  const base = new URL(config.baseUrl);
  const site = new URL(config.siteUrl);
  const names = new Set([base.host, base.hostname, site.host, site.hostname]);
  for (const name of ["127.0.0.1", "localhost", "[::1]", config.bindAddress, config.host]) {
    names.add(`${name}:${config.httpPort}`);
  }
  return names;
})();
// an SSH tunnel to the server (`ssh -L <port>:127.0.0.1:8080`) arrives on
// this machine's loopback with no forwarding header, under a loopback name
// and whatever port its far end chose: that is the server's own too.
const TUNNEL_HOST = /^(?:127\.0\.0\.1|localhost|\[::1\]):\d{1,5}$/;
const throughTunnel = req => TUNNEL_HOST.test(String(req.headers.host || "").toLowerCase()) && clientOf(req).direct;
const hostAllowed = req => ownHosts.has(String(req.headers.host || "").toLowerCase()) || throughTunnel(req);
// A request that changes something must come from this server's own pages.
// one with no Origin is not a browser's cross-site request.
const originAllowed = req => {
  const {origin} = req.headers;
  if (!origin) {
    return true;
  }
  try {
    const from = new URL(origin).host;
    // through a tunnel only the page of that very address: another page on
    // this computer's loopback, on another port, is another site.
    return ownHosts.has(from) || (throughTunnel(req) && from === String(req.headers.host).toLowerCase());
  }
  catch (err) {
    return false;
  }
};

// allows `max` events per `windowMs` for each key.
const limiter = (max, windowMs) => {
  const events = new Map(); // key -> timestamps inside the window
  const named = name => String(name).slice(0, MAX_KEY_LENGTH);
  const recent = name => (events.get(named(name)) || []).filter(time => time > Date.now() - windowMs);
  const timer = setInterval(() => {
    for (const name of events.keys()) {
      if (recent(name).length === 0) {
        events.delete(name);
      }
    }
  }, Math.max(windowMs, 10000));
  timer.unref();
  return {
    blocked: name => recent(name).length >= max,
    record(name) {
      const times = [...recent(name), Date.now()];
      // full: the keys longest in the table make room, a few at a time.
      // (Emptying it would let whoever filled it start afresh.)
      if (!events.has(named(name)) && events.size >= MAX_KEYS) {
        let dropped = 0;
        for (const oldest of events.keys()) {
          events.delete(oldest);
          if (++dropped >= 100) {
            break;
          }
        }
      }
      events.delete(named(name)); // so that it counts as the newest
      events.set(named(name), times.slice(-max));
    },
    allow(name) {
      if (this.blocked(name)) {
        return false;
      }
      this.record(name);
      return true;
    },
  };
};

// sign-ups from one address, shared by the /register page and the client's
// Create Account screens. `trusted` is for a request already known to be
// this machine's own.
const registrations = limiter(config.registrationsPerHour, 3600000);
const registrationAllowed = (address, trusted = false) => trusted || registrations.allow(key(address));

module.exports = {limiter, key, isLoopback, isTrustedLocal, clientOf, hostAllowed, originAllowed, registrationAllowed};
