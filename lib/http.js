"use strict";

const {logText} = require("./logtext.js");
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");
const accounts = require("./accounts.js");
const customItems = require("./customitems.js");
const itemArt = require("./itemart.js");
const emoji = require("./emoji.js");
const modlog = require("./modlog.js");
const roles = require("./roles.js");
const admin = require("./admin.js");
const bans = require("./bans.js");
const captcha = require("./captcha.js");
const cdn = require("./cdn.js");
const config = require("../config.js");
const devices = require("./devices.js");
const defpacks = require("./defpacks.js");
const limits = require("./limits.js");
const manage = require("./manage.js");
const modpanel = require("./modpanel.js");
const badges = require("./badges.js");
const extraMusic = require("./extramusic.js");
const customMusic = require("./custommusic.js");
const itemControl = require("./itemcontrol.js");
const masterpieces = require("./masterpieces.js");
const panel = require("./panel.js");
const totp = require("./totp.js");
const world = require("./world.js");

// stands in for every web service the launcher and the SWF talk to:
// www (flashvars), authenticator, player-session-data, ajelectronapi, the
// game host page and the content CDN.

const CROSS_DOMAIN = '<?xml version="1.0"?><cross-domain-policy><site-control permitted-cross-domain-policies="all"/>'
  + '<allow-access-from domain="*" to-ports="*"/><allow-http-request-headers-from domain="*" headers="*"/></cross-domain-policy>';

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".json": "application/json",
  ".xml": "text/xml",
  ".swf": "application/x-shockwave-flash",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".mp3": "audio/mpeg",
  ".txt": "text/plain",
  ".otf": "font/otf",
};

// The desktop webview caches the SWF aggressively.  Include the local SWF's
// timestamp in its URL so a freshly built client is actually picked up after
// the server restarts, without making an operator remember to bump a config
// value by hand.
const clientRevision = () => {
  try {
    return Math.floor(fs.statSync(config.clientSwf).mtimeMs).toString(36);
  }
  catch (_) {
    return "unknown";
  }
};

const flashVars = () => ({
  content: config.baseUrl,
  // the game's own server to the SWF, whatever its name: it loads the card
  // badges, the bio and ban icons and the chat filter's lists from here,
  // and calls /api here. the client lets the game load from no other name.
  website: config.baseUrl,
  mdUrl: `${config.baseUrl}game/`,
  playerWallHost: `${config.baseUrl}wall`,
  smartfoxServer: config.host,
  blueboxServer: config.host,
  smartfoxPort: String(config.gamePort),
  blueboxPort: String(config.httpPort),
  build_version: config.buildVersion,
  deploy_version: config.deployVersion,
  // for the custom client: are its advanced login settings honoured here?
  loginChoices: config.loginChoices,
  // member or not may be chosen on any server (lib/accounts.js)
  membershipChoice: true,
  smoke_version: config.deployVersion,
  clientURL: `${config.baseUrl}${config.deployVersion}/ajclient.swf?v=${config.buildVersion}-${clientRevision()}`,
  startupRoom: config.startupRoom,
  // "-1" turns the client's stats socket off.
  sbStatTrackerIp: "-1",
  // the client's Discord rich presence (its app/discord.js): the Discord
  // application it shows as, "" for none, and where its button goes.
  discordAppId: config.discord.clientId,
  presenceUrl: `${config.siteUrl}download`,
  sbStatModulator: "0",
  currentTimestamp: Math.floor(Date.now() / 1000),
  country: "US",
  locale: "en",
});

const readJson = req => new Promise((resolve, reject) => {
  const chunks = [];
  let size = 0;
  req.on("data", chunk => {
    size += chunk.length;
    if (size > 64 * 1024) {
      reject(new Error("body too large"));
      req.destroy();
    }
    else {
      chunks.push(chunk);
    }
  });
  req.on("end", () => {
    try {
      resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {});
    }
    catch (err) {
      reject(err);
    }
  });
  req.on("error", reject);
});

const readBody = (req, maxBytes) => new Promise((resolve, reject) => {
  const chunks = [];
  let size = 0;
  req.on("data", chunk => {
    size += chunk.length;
    if (size > maxBytes) {
      reject(new Error("body too large"));
      req.destroy();
    }
    else {
      chunks.push(chunk);
    }
  });
  req.on("end", () => resolve(Buffer.concat(chunks)));
  req.on("error", reject);
});

// the parts of a multipart/form-data body, as a Map of field name ->
// Buffer. empty when the body is not one.
const formParts = (contentType, body) => {
  const parts = new Map();
  const boundary = /boundary=("?)([^";]{1,200})\1/.exec(contentType || "");
  if (!boundary) {
    return parts;
  }
  const mark = Buffer.from(`--${boundary[2]}`);
  let at = body.indexOf(mark);
  while (at !== -1) {
    const next = body.indexOf(mark, at + mark.length);
    const headEnd = body.indexOf("\r\n\r\n", at);
    if (next === -1 || headEnd === -1 || headEnd > next) {
      break;
    }
    const name = /name="([^"]{1,100})"/.exec(body.toString("latin1", at + mark.length, headEnd));
    if (name) {
      parts.set(name[1], body.subarray(headEnd + 4, next - 2)); // without the line break before the mark
    }
    at = next;
  }
  return parts;
};

// a custom item's picture set or taken away (?kind=&id=[&remove=1], the
// picture as the body): by its maker, or by staff who make items. who asks
// is the holder of a game's token (/api/itemart?token=, the client's Item
// Maker), or `signedIn` (req) -> account: the account page's or the
// moderator panel's session, whose cookies only go to their own paths
// (/account/api/itemart, /mod/api/itemart), from this server's own pages.
// every answer is 200, with {ok} or {error}: the game's Flash cannot read
// the body of any other.
// `adminSignedIn` (req) -> boolean: the admin panel's session, which acts as
// staff who make items, and is written down as "admin".
const itemArtUpload = async (req, res, url, from, signedIn = null, adminSignedIn = null) => {
  if ((req.method === "GET" || req.method === "HEAD") && (signedIn || adminSignedIn)) {
    itemArtView(req, res, url, signedIn, adminSignedIn);
    return;
  }
  if (req.method !== "POST" || !limits.originAllowed(req)) {
    send(res, 200, {error: "forbidden"});
    return;
  }
  const token = url.searchParams.get("token");
  const holder = token ? accounts.byToken(token) : null;
  const asAdmin = Boolean(adminSignedIn && adminSignedIn(req));
  const account = asAdmin ? null : signedIn ? signedIn(req) : holder && world.moderation.banRemaining(holder) === 0 ? holder : null;
  if (!account && !asAdmin) {
    send(res, 200, {error: "Sign in first."});
    return;
  }
  const kind = url.searchParams.get("kind");
  const entry = customItems.get(kind, url.searchParams.get("id"));
  if (!entry) {
    send(res, 200, {error: "No such custom item."});
    return;
  }
  const staffMay = asAdmin || roles.can(account, "items.create");
  if (!staffMay && entry.ownerId !== account.id) {
    send(res, 200, {error: "That is not one of your items."});
    return;
  }
  const playerItems = require("./playeritems.js");
  const refusal = staffMay || url.searchParams.get("remove") === "1" ? null : playerItems.uploadRefusal(account, from.local);
  if (refusal) {
    send(res, 200, refusal);
    return;
  }
  if (!from.local && !asAdmin && !artUploads.allow(account.id)) {
    send(res, 200, {error: "Too many pictures today. Try again tomorrow."});
    return;
  }
  let result;
  if (url.searchParams.get("remove") === "1") {
    result = itemArt.remove(kind, entry.id);
  }
  else {
    const data = await readBody(req, itemArt.MAX_UPLOAD + 1).catch(() => null);
    // a player's own picture waits for a moderator unless the admin says not;
    // one turned away before may not come back.
    const waits = !staffMay && playerItems.pictureWaits();
    result = data ? await itemArt.set(kind, entry.id, data, waits, staffMay ? null : playerItems.pictureRefused)
      : {error: `That picture is too big: ${Math.round(itemArt.MAX_UPLOAD / 1024 / 1024)} MB at most.`};
  }
  if (result.ok) {
    const owner = entry.ownerId === null ? null : accounts.byId(entry.ownerId);
    modlog.record(asAdmin ? "admin" : account.username, url.searchParams.get("remove") === "1" ? "item picture removed" : "item picture set",
      owner && owner !== account ? owner.username : "", `${kind} ${entry.id} ${entry.name}`);
  }
  send(res, 200, result);
};

// music tracks uploaded in the panels (lib/custommusic.js), at
// /mod/api/music (staff with "music.upload") and /admin/api/music:
//   GET: the tracks; GET ?play=<id>: one's file, to listen to;
//   POST ?name=&cost=&inShop=1, the MP3 as the body: a new track;
//   POST ?delete=<id>: the track deleted, and taken from every player.
// `signedIn` (req) -> account: the moderator panel's session;
// `adminSignedIn` (req) -> boolean: the admin panel's, written down as "admin".
const musicUploads = limits.limiter(30, 3600000); // tracks an hour, per staff member
const musicRoute = async (req, res, url, from, signedIn = null, adminSignedIn = null) => {
  res.setHeader("Cache-Control", "no-store");
  const asAdmin = Boolean(adminSignedIn && adminSignedIn(req));
  const account = asAdmin ? null : signedIn ? signedIn(req) : null;
  if (!asAdmin && !(account && roles.can(account, "music.upload"))) {
    send(res, 403, {error: "Your role cannot upload music."});
    return;
  }
  const by = asAdmin ? "admin" : account.username;
  if (req.method === "GET" || req.method === "HEAD") {
    if (url.searchParams.has("play")) {
      const track = customMusic.file(url.searchParams.get("play"));
      if (!track) {
        send(res, 404, "Not found", "text/plain");
        return;
      }
      res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
      res.setHeader("X-Content-Type-Options", "nosniff");
      send(res, 200, track.data, "audio/mpeg");
      return;
    }
    send(res, 200, {tracks: customMusic.list(), maxBytes: customMusic.MAX_BYTES});
    return;
  }
  if (req.method !== "POST" || !limits.originAllowed(req)) {
    send(res, 403, {error: "forbidden"});
    return;
  }
  if (url.searchParams.has("delete")) {
    const entry = customItems.get("den", url.searchParams.get("delete"));
    if (!entry || !entry.audio) {
      send(res, 404, {error: "No such uploaded track."});
      return;
    }
    const result = itemControl.deleteCustom("den", entry.id, world);
    if (result.ok) {
      modlog.record(by, "music deleted", "", `den ${entry.id} ${entry.name}`);
    }
    send(res, result.ok ? 200 : 400, result);
    return;
  }
  if (!asAdmin && !musicUploads.allow(account.id)) {
    send(res, 429, {error: "Too many uploads. Try again later."});
    return;
  }
  const data = await readBody(req, customMusic.MAX_BYTES + 1).catch(() => null);
  if (!data) {
    send(res, 413, {error: `That file is too big: ${customMusic.MAX_BYTES / 1024 / 1024} MB at most.`});
    return;
  }
  const result = customMusic.add(data, {name: url.searchParams.get("name"), cost: url.searchParams.get("cost") || 0,
    inShop: url.searchParams.get("inShop") === "1"}, by);
  if (result.error) {
    send(res, 400, result);
    return;
  }
  modlog.record(by, "music uploaded", "", `den ${result.item.id} ${result.item.name}`);
  send(res, 200, {ok: `"${result.item.name}" is den item ${result.item.id}. Players can get it from the item finder now${result.item.inShop ? ", and the shop" : ""}.`,
    item: {id: result.item.id, name: result.item.name}});
};

// a picture still waiting for a moderator, which /itemart/ does not serve:
// to its maker (the account page) and to staff who review or make items.
const itemArtView = (req, res, url, signedIn, adminSignedIn) => {
  res.setHeader("Cache-Control", "private, no-store");
  const asAdmin = Boolean(adminSignedIn && adminSignedIn(req));
  const account = asAdmin ? null : signedIn ? signedIn(req) : null;
  const entry = customItems.get(url.searchParams.get("kind"), url.searchParams.get("id"));
  const allowed = entry && (asAdmin || (account && (entry.ownerId === account.id || roles.can(account, "items.approve") || roles.can(account, "items.create"))));
  const picture = allowed ? itemArt.file(entry.kind, entry.id, true) : null;
  if (!picture) {
    send(res, 404, "Not found", "text/plain");
    return;
  }
  res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
  res.setHeader("X-Content-Type-Options", "nosniff");
  send(res, 200, picture.data, `image/${picture.type}`);
};

const send = (res, status, body, type = "application/json") => {
  const data = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === "string" ? body : JSON.stringify(body));
  res.writeHead(status, {"Content-Type": type, "Content-Length": data.length});
  res.end(res.req && res.req.method === "HEAD" ? undefined : data);
};

// wrong passwords allowed per address before further tries from it are
// refused for a while. the address is what is blocked, never the account:
// blocking an account would let anybody keep its owner out by guessing at
// it, and guessing from many addresses is what makes it dear.
const TEN_MINUTES_MS = 600000;
const failuresByAddress = limits.limiter(config.failedLoginsPerTenMinutes, TEN_MINUTES_MS);
const searches = limits.limiter(120, 60000); // item finder searches, per address
const MISSING_ASSET_SECONDS = 600; // how long a client may keep the CDN's "no such file"
const cacheMisses = limits.limiter(config.cacheMissesPerTenMinutes, TEN_MINUTES_MS); // files fetched from the official CDN for one address
const errorReports = limits.limiter(config.errorReportsPerMinute, 60000);
const paintingPosts = limits.limiter(60, TEN_MINUTES_MS); // per address; each also needs a token from the game
const artUploads = limits.limiter(10, 24 * 3600000); // custom items' pictures, per account a day
const emojiFetches = limits.limiter(600, TEN_MINUTES_MS); // emoji pictures not kept yet, asked of the upstream, per address
const PAINTING_PATH = /^\/masterpieces\/([0-9a-f-]{36})$/;

// where clients ask for the HUD artwork; ours is a changed copy.
const HUD_ASSETS_PATH = cdn.hashedPath("assets/HUDAssets.swf");
const MAX_REPORT_LENGTH = 4000;

// client errors are also kept in a file of their own, so they outlive a
// server whose output only went to a terminal.
const CLIENT_ERROR_FILE = path.join(config.dataDir, "client-errors.log");
const MAX_CLIENT_ERROR_FILE = 5 * 1024 * 1024;
const keepClientError = text => {
  fs.promises.stat(CLIENT_ERROR_FILE).then(stat => stat.size, () => 0)
    .then(size => (size < MAX_CLIENT_ERROR_FILE ? fs.promises.appendFile(CLIENT_ERROR_FILE, text) : null))
    .catch(() => {});
};
// the same error from many clients (one broken item, met by everyone who
// sees it) is written once in REPEAT_WINDOW_MS, and the next time after that
// with how many there were between: a log, and a thread that waits for it,
// had a stack of twenty lines several times a second. null for one to leave
// out; else what to add to its line.
const REPEAT_WINDOW_MS = 600000;
const MAX_REMEMBERED_ERRORS = 1000;
const recentErrors = new Map(); // section and message -> {at, more}
const repeatedError = text => {
  const seen = recentErrors.get(text);
  if (seen && Date.now() - seen.at < REPEAT_WINDOW_MS) {
    seen.more++;
    return null;
  }
  recentErrors.delete(text);
  if (recentErrors.size >= MAX_REMEMBERED_ERRORS) {
    recentErrors.delete(recentErrors.keys().next().value);
  }
  recentErrors.set(text, {at: Date.now(), more: 0});
  return seen && seen.more > 0 ? `\n\t(and ${seen.more} more like it in the ${Math.round(REPEAT_WINDOW_MS / 60000)} minutes before)` : "";
};
const THEMED_ROOM = /^(\d+)\/roomDefs\/theme_(\d+)\/(.+)$/;

// the web pages, as against what the game and the client load
const SITE_PAGES = /^\/(?:register|terms|privacy|commands|shop|account|mod|admin|dashboard|download)?\/?$/;

// the installers /download offers, those of them config.downloadsDir has
const DOWNLOADS = [
  {file: "Burrow-Setup.exe", system: "Windows", detail: "SmartScreen may warn you about this file. Click 'More info', then 'Run anyway'."},
  // shown as coming until there is one
  {file: "Burrow-macos.dmg", system: "macOS", detail: "The first time: right-click Burrow, then Open", soon: true},
  {file: "Burrow-x86_64.AppImage", system: "Linux", detail: "AppImage, for any distribution"},
  {file: "burrow_amd64.deb", system: "Debian, Ubuntu, Mint", detail: ".deb"},
  {file: "burrow.x86_64.rpm", system: "Fedora, openSUSE", detail: ".rpm"},
];
const DOWNLOAD_PATH = /^\/download\/(Burrow-Setup\.exe|Burrow-macos\.dmg|Burrow-x86_64\.AppImage|burrow_amd64\.deb|burrow\.x86_64\.rpm|SHA256SUMS)$/;
// a file's address carries this, so that a new upload is a new address that
// no cache (cloudflare keeps such files for hours) answers with the old one
const fileVersion = stat => `${stat.size.toString(36)}${Math.floor(stat.mtimeMs).toString(36)}`;
const statOf = file => fs.promises.stat(path.join(config.downloadsDir, file)).catch(() => null);
// what each installer is: RELEASES beside them, written by the client's
// build, a line each: "Burrow-Setup.exe 1.1.0 2026-10-14". a file it does
// not name shows the day it was put there.
const releasesOf = async () => {
  const text = await fs.promises.readFile(path.join(config.downloadsDir, "RELEASES"), "utf8").catch(() => "");
  const releases = {};
  for (const line of text.split("\n")) {
    const [file, version, date] = line.trim().split(/\s+/);
    if (file) {
      releases[file] = {version, date};
    }
  }
  return releases;
};
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const releaseLine = (release, stat) => {
  const version = release && /^\d{1,5}\.\d{1,5}\.\d{1,5}$/.test(release.version) ? `Version ${release.version}` : "";
  const day = release && /^\d{4}-\d{2}-\d{2}$/.test(release.date) ? new Date(`${release.date}T12:00:00Z`) : stat.mtime;
  return [version, `${day.getUTCDate()} ${MONTHS[day.getUTCMonth()]} ${day.getUTCFullYear()}`].filter(Boolean).join(" · ");
};

// origins a client's own page has: a file, as browsers name it.
const CLIENT_ORIGINS = ["null", "file://"];

// one of this server's plain pages (sign-up, the commands, the item finder),
// with the headers the account page and the panel have: nothing loaded from
// elsewhere, nothing sent elsewhere, no frame.
const PAGE_HEADERS = {
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self'; "
    + "form-action 'none'; frame-ancestors 'none'; base-uri 'none'",
};
// the same, for the pages that show the captcha (lib/captcha.js)
const CAPTCHA_PAGE_HEADERS = {...PAGE_HEADERS, "Content-Security-Policy": captcha.policy(PAGE_HEADERS["Content-Security-Policy"])};
// the terms and the privacy policy carry who runs this server and where to
// write, from config.js.
const LEGAL_VALUES = {legalEmail: config.legalEmail, adminEmail: config.adminEmail, operator: config.operator, hostedIn: config.hostedIn,
  version: config.termsVersion, site: new URL(config.siteUrl).host};
const escapeHtml = text => String(text).replace(/[&<>"]/g, sign => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;"})[sign]);
const sendLegalPage = async (res, file) => {
  for (const [name, value] of Object.entries(PAGE_HEADERS)) {
    res.setHeader(name, value);
  }
  const page = (await fs.promises.readFile(path.join(config.publicDir, file), "utf8"))
    .replace(/\{\{(\w+)\}\}/g, (whole, name) => (Object.hasOwn(LEGAL_VALUES, name) ? escapeHtml(LEGAL_VALUES[name]) : whole));
  send(res, 200, page, MIME[".html"]);
};
// a web address or a path on this server; anything else is dropped
const pageLink = text => (/^https?:\/\/[^\s"<>]+$/.test(text) || /^\/[^/\s"<>][^\s"<>]*$/.test(text) ? text : "");
const HOME_VALUES = {downloadUrl: pageLink(config.downloadUrl), githubUrl: pageLink(config.githubUrl), discordUrl: pageLink(config.discordUrl)};
const sendHomePage = async res => {
  for (const [name, value] of Object.entries(PAGE_HEADERS)) {
    res.setHeader(name, value);
  }
  const page = (await fs.promises.readFile(path.join(config.publicDir, "home.html"), "utf8"))
    .replace(/\{\{(\w+)\}\}/g, (whole, name) => (Object.hasOwn(HOME_VALUES, name) ? escapeHtml(HOME_VALUES[name]) : whole));
  send(res, 200, page, MIME[".html"]);
};
const sendDownloadPage = async res => {
  for (const [name, value] of Object.entries(PAGE_HEADERS)) {
    res.setHeader(name, value);
  }
  const rows = [];
  const releases = await releasesOf();
  for (const entry of DOWNLOADS) {
    const stat = await statOf(entry.file);
    if (stat && stat.isFile()) {
      rows.push(`<div class="row"><div><div class="system">${escapeHtml(entry.system)}</div>`
        + `<div class="detail">${escapeHtml(entry.detail)}</div>`
        + `<div class="detail">${escapeHtml(releaseLine(releases[entry.file], stat))} · ${Math.round(stat.size / 1048576)} MB</div></div>`
        + `<a class="get" href="/download/${entry.file}?v=${fileVersion(stat)}" download>Download</a></div>`);
    }
    else if (entry.soon) {
      rows.push(`<div class="row"><div><div class="system">${escapeHtml(entry.system)}</div></div><span class="soon">Soon</span></div>`);
    }
  }
  const sums = await statOf("SHA256SUMS");
  const values = {
    rows: rows.length ? rows.join("\n      ") : '<p class="none">Coming soon.</p>',
    sums: sums ? `<a href="/download/SHA256SUMS?v=${fileVersion(sums)}">Checksums</a>` : "",
  };
  const page = (await fs.promises.readFile(path.join(config.publicDir, "download.html"), "utf8"))
    .replace(/\{\{(\w+)\}\}/g, (whole, name) => (Object.hasOwn(values, name) ? values[name] : whole));
  send(res, 200, page, MIME[".html"]);
};

// one installer, read from disk as it goes out: they are tens of MB.
const sendDownload = async (req, res, file) => {
  const full = path.join(config.downloadsDir, file);
  const stat = await statOf(file);
  if (!stat || !stat.isFile()) {
    send(res, 404, "Not found", "text/plain");
    return;
  }
  res.writeHead(200, {
    "Content-Type": file === "SHA256SUMS" ? "text/plain; charset=utf-8" : "application/octet-stream",
    "Content-Length": stat.size,
    "Content-Disposition": file === "SHA256SUMS" ? "inline" : `attachment; filename="${file}"`,
    "Cache-Control": "public, max-age=86400",
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  const stream = fs.createReadStream(full);
  stream.on("error", () => res.destroy());
  res.on("close", () => stream.destroy());
  stream.pipe(res);
};

const sendPage = async (res, file, headers = PAGE_HEADERS) => {
  for (const [name, value] of Object.entries(headers)) {
    res.setHeader(name, value);
  }
  send(res, 200, captcha.withScriptVersion(await fs.promises.readFile(path.join(config.publicDir, file))), MIME[".html"]);
};

// A username that was rejected (lib/moderation.js) is replaced as part of
// signing in: the sign-in that proved who it is gets a ticket in place of a
// login token, and the ticket with a new name finishes the sign-in. A ticket
// is good for a few minutes and a few tries.
const RENAME_TICKET_MS = 600000;
const RENAME_TRIES = 20;
const renameTickets = new Map(); // SHA-256 of a ticket -> {id, expiry, tries, deviceToken}
const ticketHash = ticket => crypto.createHash("sha256").update(String(ticket)).digest("hex");

const renameTicket = (account, deviceToken) => {
  for (const [hash, entry] of renameTickets) {
    if (entry.expiry < Date.now() || entry.id === account.id) {
      renameTickets.delete(hash);
    }
  }
  const ticket = crypto.randomBytes(24).toString("hex");
  renameTickets.set(ticketHash(ticket), {id: account.id, expiry: Date.now() + RENAME_TICKET_MS, tries: 0, deviceToken});
  return ticket;
};

// the second half of such a sign-in: {rename_ticket, new_username}.
const renameAndSignIn = (res, body, from) => {
  const hash = ticketHash(body.rename_ticket);
  const entry = renameTickets.get(hash);
  const account = entry && entry.expiry > Date.now() ? accounts.byId(entry.id) : null;
  if (!account || !account.nameRejected || account.locked || world.moderation.banRemaining(account) !== 0 || bans.addressBan(from.address)
    || ++entry.tries > RENAME_TRIES) {
    renameTickets.delete(hash);
    send(res, 401, {error_code: 101, error: "rename_expired"});
    return;
  }
  const wanted = typeof body.new_username === "string" ? body.new_username.trim() : "";
  world.disconnect(account);
  const problem = wanted.toLowerCase() === account.username.toLowerCase() ? "same_name" : accounts.rename(account, wanted);
  if (problem) {
    send(res, 401, {error_code: 101, error: "name_rejected", rename_ticket: body.rename_ticket, name_error: problem});
    return;
  }
  renameTickets.delete(hash);
  delete account.nameRejected;
  manage.forget(account);
  accounts.recordLogin(account, "launcher", from.address);
  accounts.save(account);
  console.log(`[accounts] a rejected username was replaced by "${logText(account.username)}"`);
  accounts.setLoginChoices(account, body.login_choices);
  const token = accounts.issueToken(account);
  devices.noteLauncher(token, Boolean(devices.read(body.device)));
  send(res, 200, {auth_token: token, refresh_token: token, device_token: entry.deviceToken});
};

const authenticate = async (req, res, from) => {
  const body = await readJson(req);
  if (body.rename_ticket !== undefined) {
    renameAndSignIn(res, body, from);
    return;
  }
  // the computer it is on (lib/devices.js): a client that does not say is
  // out of date (before 1.3.0) or not ours. it is signed in all the same,
  // and its token noted (signInChecked): with config.requireDevice the game
  // then loads and its login popup says to update (lib/world.js), where a
  // refusal here only ever showed "The server refused the login (426)".
  const device = devices.read(body.device);
  const accountKey = String(body.username).trim().toLowerCase();
  if (!from.local && failuresByAddress.blocked(from.key)) {
    send(res, 429, {error_code: 429, error: "too_many_attempts"});
    return;
  }
  // A saved sign-in ("remember me"): the account its token is good for,
  // which is what the rest goes by. a token is only ever given after a
  // whole sign-in (password, captcha and 2FA code), so one that is good
  // stands in for them; one that is not is refused here, whatever else
  // the request says. (Whether the request offers a token is not what
  // decides: only the server's own answer for it.)
  const saved = accounts.byToken(body.refresh_token); // null for none, or for one that is not good
  if (saved) {
    await signInChecked(res, body, from, saved, true, device);
    return;
  }
  if (body.refresh_token !== undefined) {
    failuresByAddress.record(from.key);
    // error_code 100 = expired refresh token
    send(res, 401, {error_code: 100});
    return;
  }
  // a password is not looked at before the captcha. the custom client
  // knows these errors; the official launcher shows them as a wrong password.
  const captchaProblem = await captcha.check(body, from, "login", accounts.byName(accountKey));
  if (captchaProblem) {
    send(res, captchaProblem === "captcha_unavailable" ? 503 : 401, {error_code: 101, error: captchaProblem});
    return;
  }
  const account = await accounts.authenticateAsync(body.username, body.password);
  if (!account) {
    failuresByAddress.record(from.key);
    // A wrong password shows in the account's own login history.
    const tried = accounts.byName(accountKey);
    if (tried) {
      accounts.recordLogin(tried, "launcher", from.address, false);
      accounts.save(tried);
    }
    // error_code 101 = wrong credentials
    send(res, 401, {error_code: 101});
    return;
  }
  await signInChecked(res, body, from, account, false, device);
};

// the rest of a sign-in, for an account whose password was right (`saved`
// false) or whose saved sign-in's token was good (`saved` true; then it is
// not asked for a 2FA code again, and the token it has is the one it keeps).
// `device`: the computer it is on (lib/devices.js), or null for a client that does not say.
const signInChecked = async (res, body, from, account, saved, device) => {
  const byRefresh = saved === true;
  // banned: said here, with how long is left (-1 for good), where a client
  // can show it. the game itself would only be refused at its socket with
  // the one line it has for that, which says neither. the password (or the
  // saved sign-in) was right, so this tells nobody anything a player's card
  // does not.
  // the reason goes with it: whoever got this far is the banned player.
  const ban = world.moderation.banOf(account);
  if (ban) {
    send(res, 401, {error_code: 101, error: "account_banned", banned_seconds: ban.seconds, ban_reason: ban.reason});
    return;
  }
  // A banned address (lib/bans.js): for good, whoever signs in from it.
  const addressBan = bans.addressBan(from.address);
  if (addressBan) {
    send(res, 401, {error_code: 101, error: "address_banned", banned_seconds: world.moderation.PERMANENT, ban_reason: addressBan.reason});
    return;
  }
  // A banned computer (lib/devices.js): for good, whichever account. a
  // client that sent no ids (before 1.3.0) is judged by the hardware the
  // account was seen on.
  const deviceBan = device ? devices.banOf(device) : devices.banOfAccount(account);
  if (deviceBan) {
    console.log(`[devices] "${logText(account.username)}" refused: hardware banned (ban ${logText(deviceBan.id)})`);
    send(res, 401, {error_code: 101, error: "device_banned", banned_seconds: world.moderation.PERMANENT, ban_reason: deviceBan.reason});
    return;
  }
  // locked by its owner on the account page: the password is right, and
  // still nobody gets in. the launcher shows this as a failed sign-in.
  if (account.locked) {
    send(res, 401, {error_code: 101, error: "account_locked"});
    return;
  }
  // two-step sign-in (lib/totp.js): after the password, a code from the
  // player's authenticator app, unless this device gave one in the last 30
  // days and kept the token it got for it. A saved sign-in is not asked:
  // it was given after a code, and lasts no longer than such a token. the
  // custom client knows these errors; the official launcher shows them as a
  // wrong password, and cannot give a code.
  let deviceToken;
  if (!byRefresh && totp.isOn(account) && !totp.deviceTrusted(account, body.device_token)) {
    if (body.totp === undefined || body.totp === "") {
      send(res, 401, {error_code: 101, error: "totp_required", captcha_pass: captcha.issuePass(account, from)});
      return;
    }
    if (!totp.verify(account, String(body.totp))) {
      failuresByAddress.record(from.key);
      accounts.recordLogin(account, "launcher", from.address, false);
      accounts.save(account);
      send(res, 401, {error_code: 101, error: "totp_wrong", captcha_pass: captcha.issuePass(account, from)});
      return;
    }
    if (body.remember_device === true) {
      deviceToken = totp.trustDevice(account, "launcher");
    }
  }
  // its username was rejected: a new one first (above). the official
  // launcher shows this as a wrong password; the account page asks too.
  if (account.nameRejected) {
    accounts.save(account); // a two-step code just used stays used
    send(res, 401, {error_code: 101, error: "name_rejected", rename_ticket: renameTicket(account, deviceToken)});
    return;
  }
  if (device) {
    devices.seen(account, device, other => world.moderation.banRemaining(other) !== 0);
  }
  if (!byRefresh) {
    accounts.recordLogin(account, "launcher", from.address);
  }
  accounts.save(account);
  // the custom client's advanced settings; the official launcher sends none.
  accounts.setLoginChoices(account, body.login_choices);
  const token = byRefresh ? body.refresh_token : accounts.issueToken(account);
  devices.noteLauncher(token, Boolean(device));
  send(res, 200, {auth_token: token, refresh_token: token, device_token: deviceToken});
};

const player = (req, res) => {
  const match = /^Bearer (.+)$/.exec(req.headers.authorization || "");
  const account = match && accounts.byToken(match[1]);
  if (!account) {
    send(res, 401, {error: "invalid_token"});
    return;
  }
  send(res, 200, {
    id: account.id,
    screen_name: account.username,
    game_account_type: account.accountType,
    language: "en",
    game_server: config.host,
  });
};

const handle = async (req, res) => {
  // over https, browsers are told to keep to it (a year)
  if (config.secureCookies) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000");
  }
  const url = new URL(req.url, config.baseUrl);
  const route = `${req.method} ${url.pathname}`;

  const from = limits.clientOf(req);

  // the web pages live under the site's name (config.siteUrl): one asked
  // for under the game server's name is sent there. what the game and the
  // client load stays here, the client's captcha page among it.
  if ((req.method === "GET" || req.method === "HEAD") && config.siteUrl !== config.baseUrl
    && String(req.headers.host || "").toLowerCase() === new URL(config.baseUrl).host && SITE_PAGES.test(url.pathname)) {
    res.writeHead(301, {Location: new URL(url.pathname + url.search, config.siteUrl).href, "Content-Length": 0});
    res.end();
    return;
  }

  const dashboardAdmin = url.pathname === "/dashboard/admin" || url.pathname.startsWith("/dashboard/admin/")
    || url.pathname === "/dashboard/api/admin" || url.pathname.startsWith("/dashboard/api/admin/");
  const dashboardStaff = url.pathname === "/dashboard/staff" || url.pathname.startsWith("/dashboard/staff/")
    || url.pathname === "/dashboard/api/staff" || url.pathname.startsWith("/dashboard/api/staff/");
  const isDashboard = url.pathname === "/dashboard" || dashboardAdmin || dashboardStaff;
  const isAdmin = url.pathname === "/admin" || url.pathname.startsWith("/admin/") || dashboardAdmin;
  const isAccount = url.pathname === "/account" || url.pathname.startsWith("/account/");
  const isMod = url.pathname === "/mod" || url.pathname.startsWith("/mod/") || dashboardStaff;

  // the pages that keep a cookie answer only under this server's own names:
  // a request sent here by a page of another name (one whose name was made
  // to point at this machine, say) is not theirs to make. nor is such a
  // request ever this machine's own, wherever it came from.
  if (!limits.hostAllowed(req)) {
    if (isDashboard || isAdmin || isAccount || isMod) {
      send(res, 421, {error: "wrong_host"});
      return;
    }
    from.local = false;
  }

  // One entry point for the owner and staff dashboards.  The old addresses
  // stay as bookmark-friendly redirects; their APIs remain available for
  // installed tools and are not redirected.
  if (req.method === "GET" && url.pathname === "/dashboard/") {
    res.writeHead(302, {Location: `/dashboard${url.search}`, "Content-Length": 0});
    res.end();
    return;
  }
  if (req.method === "GET" && url.pathname === "/dashboard") {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    send(res, 200, await fs.promises.readFile(path.join(config.publicDir, "dashboard.html")), "text/html; charset=utf-8");
    return;
  }
  if (req.method === "GET" && url.pathname === "/admin") {
    res.writeHead(302, {Location: "/dashboard/admin", "Content-Length": 0});
    res.end();
    return;
  }
  if (req.method === "GET" && url.pathname === "/mod") {
    res.writeHead(302, {Location: "/dashboard/staff", "Content-Length": 0});
    res.end();
    return;
  }

  // the admin panel sets its own, stricter headers: none of the cross-origin
  // allowances below apply to it. on a public server it is not there at all
  // for anyone but this machine and the addresses named (config.adminAllow).
  if (isAdmin) {
    if (config.isPublic && !from.direct && !config.adminAllow.includes(from.address)) {
      send(res, 404, "Not found", "text/plain");
      return;
    }
    if (dashboardAdmin) {
      url.pathname = url.pathname.startsWith("/dashboard/api/admin")
        ? url.pathname.replace("/dashboard/api/admin", "/admin/api")
        : url.pathname.replace("/dashboard/admin", "/admin");
    }
    if (url.pathname === "/admin/api/itemart") {
      res.setHeader("Cache-Control", "no-store");
      await itemArtUpload(req, res, url, from, null, panel.signedIn);
      return;
    }
    if (url.pathname === "/admin/api/music") {
      await musicRoute(req, res, url, from, null, panel.signedIn);
      return;
    }
    await panel.handle(req, res, url, from, {send, readJson});
    return;
  }

  if (isAccount && url.pathname === "/account/api/itemart") {
    res.setHeader("Cache-Control", "no-store");
    await itemArtUpload(req, res, url, from, manage.signedInAs);
    return;
  }
  if (isAccount) {
    await manage.handle(req, res, url, from, {send, readJson});
    return;
  }

  // and the moderator panel (lib/modpanel.js), which is there for anyone to
  // reach: its moderators are players, wherever they are.
  if (dashboardStaff) {
    url.pathname = url.pathname.startsWith("/dashboard/api/staff")
      ? url.pathname.replace("/dashboard/api/staff", "/mod/api")
      : url.pathname.replace("/dashboard/staff", "/mod");
  }
  if (isMod && url.pathname === "/mod/api/itemart") {
    res.setHeader("Cache-Control", "no-store");
    await itemArtUpload(req, res, url, from, modpanel.signedInAs);
    return;
  }
  if (isMod && url.pathname === "/mod/api/music") {
    await musicRoute(req, res, url, from, modpanel.signedInAs);
    return;
  }
  if (isMod) {
    await modpanel.handle(req, res, url, from, {send, readJson});
    return;
  }

  // the clients' own pages are files, which browsers call the origin "null":
  // those and this server's pages may read what the rest answers. no cookie
  // is used outside /account and /admin.
  const {origin} = req.headers;
  if (origin && (CLIENT_ORIGINS.includes(origin) || limits.originAllowed(req))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // custom items' own pictures (lib/itemart.js): served as the picture
  // they are and nothing else.
  const artPath = /^\/itemart\/(clothing|den)\/(\d{1,9})\.png$/.exec(url.pathname);
  if (artPath && (req.method === "GET" || req.method === "HEAD")) {
    const picture = itemArt.file(artPath[1], artPath[2]);
    if (!picture) {
      send(res, 404, "Not found", "text/plain");
      return;
    }
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    res.setHeader("Content-Disposition", "inline");
    send(res, 200, picture.data, `image/${picture.type}`);
    return;
  }
  // emoji pictures for chat bubbles (lib/emoji.js)
  const emojiPath = /^\/emoji\/([0-9a-f-]{2,80})\.png$/.exec(url.pathname);
  if (emojiPath && (req.method === "GET" || req.method === "HEAD")) {
    const picture = await emoji.get(emojiPath[1], () => from.local || emojiFetches.allow(from.key));
    if (!picture) {
      send(res, 404, "Not found", "text/plain");
      return;
    }
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    send(res, 200, picture, "image/png");
    return;
  }
  if (url.pathname === "/api/itemart") {
    await itemArtUpload(req, res, url, from);
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    // the item finder's API changes accounts, so other sites open in a
    // browser on this machine must not be able to call it.
    if (!limits.originAllowed(req)) {
      send(res, 403, {error: "forbidden"});
      return;
    }
    if (url.pathname === "/api/search" && !from.local && !searches.allow(from.key)) {
      send(res, 429, {error: "too_many_requests"});
      return;
    }
    const result = await admin.handle(route, url.searchParams, req.method === "POST" ? await readJson(req) : null, from);
    send(res, result.status, result.body);
    return;
  }

  const signupArt = req.method === "GET" && /^\/signup\/((?:thumb|hero)_[a-z]+\.svg)$/.exec(url.pathname);
  if (signupArt) {
    const art = await fs.promises.readFile(path.join(config.publicDir, "signup", signupArt[1])).catch(() => null);
    res.setHeader("Cache-Control", "public, max-age=86400");
    send(res, art ? 200 : 404, art || "Not found", art ? MIME[".svg"] : "text/plain");
    return;
  }

  // the font of the web pages, which is the game's own text font and the
  // client's (public/fonts/).
  const font = req.method === "GET" && /^\/fonts\/(CCDigitalDelivery-(?:Regular|Bold)\.otf)$/.exec(url.pathname);
  if (font) {
    res.setHeader("Cache-Control", "public, max-age=604800");
    send(res, 200, await fs.promises.readFile(path.join(config.publicDir, "fonts", font[1])), MIME[".otf"]);
    return;
  }

  // the chat filter's two word lists (public/filter/), which each player's
  // game fetches and applies itself. read from disk each time, so that a
  // change to a list is there for the next player to start the game.
  const wordList = req.method === "GET" && /^\/filter\/(level[12]\.txt)$/.exec(url.pathname);
  if (wordList) {
    const list = await fs.promises.readFile(path.join(config.publicDir, "filter", wordList[1])).catch(() => null);
    send(res, list ? 200 : 404, list || "Not found", "text/plain; charset=utf-8");
    return;
  }

  // updates for the installed clients (config.clientUpdatesDir). each is
  // signed, and the clients check that themselves; the bundle's name
  // carries its version, so it never changes once published.
  const clientUpdate = req.method === "GET" && /^\/client\/(latest\.json|app-\d+\.\d+\.\d+\.burrow)$/.exec(url.pathname);
  if (clientUpdate) {
    const file = await fs.promises.readFile(path.join(config.clientUpdatesDir, clientUpdate[1])).catch(() => null);
    const manifest = clientUpdate[1] === "latest.json";
    res.setHeader("Cache-Control", manifest ? "no-cache" : "public, max-age=31536000, immutable");
    send(res, file ? 200 : 404, file || "Not found", file ? (manifest ? MIME[".json"] : "application/octet-stream") : "text/plain");
    return;
  }

  const download = (req.method === "GET" || req.method === "HEAD") && DOWNLOAD_PATH.exec(url.pathname);
  if (download) {
    await sendDownload(req, res, download[1]);
    return;
  }

  // the badges and the Discord mark on player cards (public/badges/, lib/badges.js).
  const badgeArt = req.method === "GET" && /^\/badges\/([a-z0-9]{1,30}\.png)$/.exec(url.pathname);
  if (badgeArt) {
    const art = await fs.promises.readFile(path.join(config.publicDir, "badges", badgeArt[1])).catch(() => null);
    res.setHeader("Cache-Control", "public, max-age=3600");
    send(res, art ? 200 : 404, art || "Not found", art ? MIME[".png"] : "text/plain");
    return;
  }

  switch (route) {
    case "GET /download":
      await sendDownloadPage(res);
      return;
    case "GET /register":
      await sendPage(res, "register.html", CAPTCHA_PAGE_HEADERS);
      return;
    // the captcha on its own, for the client, whose login page is a file
    // that cloudflare's widget does not run in.
    case "GET /captcha":
      await sendPage(res, "captcha.html", CAPTCHA_PAGE_HEADERS);
      return;
    case "GET /captcha.js": {
      const text = await fs.promises.readFile(path.join(config.publicDir, "captcha.js"), "utf8");
      send(res, 200, captcha.script(text), "text/javascript; charset=utf-8");
      return;
    }
    case "GET /terms":
      await sendLegalPage(res, "terms.html");
      return;
    case "GET /privacy":
      await sendLegalPage(res, "privacy.html");
      return;
    case "GET /":
      await sendHomePage(res);
      return;
    case "GET /logo.png":
    case "GET /logo-square.png":
    case "GET /favicon.ico":
      res.setHeader("Cache-Control", "public, max-age=86400");
      send(res, 200, await fs.promises.readFile(path.join(config.publicDir, url.pathname === "/logo.png" ? "logo.png" : "logo-square.png")), MIME[".png"]);
      return;
    case "GET /ban-icon.png": // the banned label on player cards (swf-src/BuddyCard.as)
      res.setHeader("Cache-Control", "public, max-age=86400");
      send(res, 200, await fs.promises.readFile(path.join(config.publicDir, "ban-icon.png")), MIME[".png"]);
      return;
    case "GET /bio-icon.png": // the button of the card's Bio tab
      res.setHeader("Cache-Control", "public, max-age=86400");
      send(res, 200, await fs.promises.readFile(path.join(config.publicDir, "bio-icon.png")), MIME[".png"]);
      return;
    case "GET /commands":
      await sendPage(res, "commands.html");
      return;
    case "GET /shop":
      await sendPage(res, "shop.html");
      return;
    case "GET /flashvars":
      send(res, 200, flashVars());
      return;
    case "POST /authenticate":
      await authenticate(req, res, from);
      return;
    case "GET /player":
      player(req, res);
      return;
    case "POST /v1/login":
      await readJson(req);
      send(res, 200, {});
      return;
    case "POST /v1/reportError": {
      // the launcher and the SWF both report crashes here; they are the best
      // clue for what the server got wrong. the patched SWF also sends
      // progress traces for media loads this way, which are only worth
      // having while debugging locally.
      const report = await readJson(req);
      // later lines are indented so a report cannot pass off its own text as
      // one of the server's log lines.
      const message = String(report.message).slice(0, MAX_REPORT_LENGTH).replace(/[^\x20-\x7e\n\t]/g, "?").replace(/\n\s*/g, "\n\t");
      const section = String(report.section).slice(0, 20).replace(/[^\w-]/g, "?");
      const trace = message.startsWith("media ");
      if (trace ? config.logPackets : from.local || errorReports.allow(from.key)) {
        const again = trace ? "" : repeatedError(`${section} ${message}`);
        if (again !== null) {
          console.log(`[${logText(trace ? "client-trace" : "client-error")}] (${logText(section)}) ${logText(message)}${logText(again)}`);
          if (!trace) {
            keepClientError(`${new Date().toISOString()} (${section}) ${message}${again}\n`);
          }
        }
      }
      send(res, 200, {});
      return;
    }
    // the Jammer Wall service (playerWallHost in the flashvars); every
    // command carries a token the game socket handed out, see lib/walls.js.
    case "POST /wall":
      send(res, 200, world.walls.http(await readJson(req)));
      return;
    // the Art Studio posts a painting to be made a masterpiece of (the
    // mdUrl flashvar + "mp"): a form with the token the game socket handed
    // out and the picture. ArtStudioPainting.onSendComplete reads the reply.
    case "POST /game/mp": {
      if (!from.local && !paintingPosts.allow(from.key)) {
        send(res, 429, {success: false});
        return;
      }
      const parts = formParts(req.headers["content-type"], await readBody(req, masterpieces.MAX_IMAGE_BYTES + 16 * 1024));
      const {uuid, refusal, maker} = await masterpieces.upload(String(parts.get("authToken") || ""), parts.get("image"));
      // the game only says it could not be sent: HQ says why
      if (refusal && maker) {
        world.tellAccount(maker, refusal);
      }
      send(res, 200, uuid ? {success: true, uuid} : {success: false});
      return;
    }
    case "GET /crossdomain.xml":
      send(res, 200, CROSS_DOMAIN, "text/xml");
      return;
    case "GET /gameClient/game/index.html":
      // not to be put in a frame of anyone's; the client shows it in a view of its own.
      res.setHeader("X-Frame-Options", "DENY");
      res.setHeader("Referrer-Policy", "no-referrer");
      send(res, 200, await fs.promises.readFile(path.join(config.publicDir, "game.html")), MIME[".html"]);
      return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    console.log(`[http] unhandled ${logText(route)}`);
    send(res, 404, {error: "not_found"});
    return;
  }

  if (config.logPackets) {
    console.log(`[http] GET ${logText(url.pathname)}`);
  }

  // asset SWFs import their fonts from this fixed path next to the game page;
  // the launcher ships its own copy.
  if (url.pathname === "/gameClient/sharedFonts.swf") {
    send(res, 200, await fs.promises.readFile(config.sharedFontsSwf), MIME[".swf"]);
    return;
  }

  // the patched client is served in place of the CDN's own copy.
  if (url.pathname.endsWith("/ajclient.swf")) {
    send(res, 200, await fs.promises.readFile(config.clientSwf), MIME[".swf"]);
    return;
  }

  // A painting, by its id (MasterpieceFileServer).
  const painting = PAINTING_PATH.exec(url.pathname);
  if (painting) {
    const playingFrom = account => {
      const session = world.findOnline(account.username);
      return session ? limits.key(session.address) : null;
    };
    const picture = masterpieces.mayView(painting[1], from.key, playingFrom) || from.local ? masterpieces.image(painting[1]) : null;
    send(res, picture ? 200 : 404, picture || "Not found", picture ? MIME[".jpg"] : "text/plain");
    return;
  }

  const relPath = decodeURIComponent(url.pathname).replace(/^\/+/, "");
  if (relPath === HUD_ASSETS_PATH) {
    send(res, 200, await fs.promises.readFile(config.hudAssetsSwf), MIME[".swf"]);
    return;
  }
  // the name tag badges of ours and the card's Bio tab, which the CDN has no file for.
  const badgeMedia = badges.mediaFile(relPath) || badges.cardMedia(relPath);
  if (badgeMedia) {
    const body = await fs.promises.readFile(badgeMedia).catch(() => null);
    send(res, body ? 200 : 404, body || "Not found", body ? MIME[".swf"] : "text/plain");
    return;
  }
  // the extra den music tracks, which the CDN does not have as files, and
  // those uploaded by staff.
  const extra = await extraMusic.asset(relPath) || await customMusic.asset(relPath);
  if (extra) {
    send(res, extra.body ? 200 : 404, extra.body || "Not found", extra.body ? extra.type : "text/plain");
    return;
  }
  const clientPack = await defpacks.clientPack(relPath);
  if (clientPack) {
    // what custom items this game has from its packs (customItems.sendAll)
    const packKind = defpacks.customPackKind(relPath);
    if (packKind) {
      customItems.sawPack(from.key, packKind, clientPack.version);
    }
    send(res, 200, clientPack.body, "application/octet-stream");
    return;
  }
  // A room file in a seasonal theme ("<build>/roomDefs/theme_<other
  // build>/...", see roomAsSeenBy in world.js) comes from that other build,
  // or from the current one when the room did not exist yet back then.
  const themed = THEMED_ROOM.exec(relPath);
  const mayFetch = () => from.local || cacheMisses.allow(from.key);
  const body = (themed && Object.values(config.themes).some(theme => theme.build === Number(themed[2])) && await cdn.get(`${themed[2]}/roomDefs/${themed[3]}`, mayFetch))
    || await cdn.get(themed ? `${themed[1]}/roomDefs/${themed[3]}` : relPath, mayFetch);
  if (!body) {
    // one the CDN does not have is asked for again and again (the same few
    // hundred, by every client that meets them): its client may keep the
    // answer a while, and it was logged when the CDN said so ([cdn] 404).
    if (cdn.knownMissing(themed ? `${themed[1]}/roomDefs/${themed[3]}` : relPath)) {
      res.setHeader("Cache-Control", `public, max-age=${MISSING_ASSET_SECONDS}`);
    }
    else {
      console.log(`[http] 404 ${logText(url.pathname)}`);
    }
    send(res, 404, "Not found", "text/plain");
    return;
  }
  res.setHeader("Cache-Control", "public, max-age=86400");
  send(res, 200, body, MIME[path.extname(relPath).toLowerCase()] || "application/octet-stream");
};

const start = () => new Promise((resolve, reject) => {
  const onRequest = (req, res) => {
    handle(req, res).catch(err => {
      // the path only: a query may hold a login token (the item finder's, the Item Maker's)
      console.log(`[http] ${logText(req.method)} ${logText(String(req.url).split("?")[0])} failed: ${logText(err.message)}`);
      if (!res.headersSent) {
        send(res, 500, {error: "server_error"});
      }
      else {
        res.destroy();
      }
    });
  };
  const server = config.webTls
    ? https.createServer({cert: fs.readFileSync(config.webTls.certFile), key: fs.readFileSync(config.webTls.keyFile)}, onRequest)
    : http.createServer(onRequest);
  // nobody gets to hold a request open by trickling it in, nor a reply by
  // never reading it; and there is an end to how many connections there
  // may be, in all and from one address. a proxy in front (nginx) keeps
  // its own count of those; its connections here are not counted, since
  // turning them away only had it fail the requests of players it had
  // already let in, who then asked again.
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  server.timeout = config.httpSocketTimeoutMs;
  const open = new Map(); // address, as limits count it -> connections
  let openInAll = 0;
  server.on("connection", socket => {
    const address = limits.key(socket.remoteAddress);
    // behind a proxy every connection is the proxy's own.
    if (limits.isLoopback(socket.remoteAddress)) {
      return;
    }
    const count = (open.get(address) || 0) + 1;
    if (count > config.maxHttpConnectionsPerAddress || openInAll >= config.maxHttpConnections) {
      socket.destroy();
      return;
    }
    open.set(address, count);
    openInAll++;
    socket.once("close", () => {
      openInAll--;
      const left = open.get(address) - 1;
      if (left > 0) {
        open.set(address, left);
      }
      else {
        open.delete(address);
      }
    });
  });
  server.once("error", reject);
  server.listen(config.httpPort, config.bindAddress, () => {
    console.log(`[http] listening on ${logText(config.bindAddress)}:${logText(config.httpPort)}${logText(config.webTls ? " (TLS)" : "")}`);
    resolve(server);
  });
});

module.exports = {start};
