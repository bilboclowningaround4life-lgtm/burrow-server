"use strict";

// end to end: what a sign-in takes besides a password. Discord says who
// someone is, but the moderator and admin panels open only with their 2FA
// code as well (lib/modpanel.js, lib/panel.js); and a recovery email resets
// a password, but removes 2FA only with the password too, never right after
// a password reset by email, and never for staff (lib/manage.js). Discord's
// API is test/fake-discord.js, and recovery mail goes to a server of ours.

const assert = require("assert");
const crypto = require("crypto");
const http = require("http");
const path = require("path");
const harness = require("./harness.js");

const HTTP_PORT = 18096;
const GAME_PORT = 19356;
const MAIL_PORT = 18097;
const BASE = `http://127.0.0.1:${HTTP_PORT}`;

// the authenticator app's side of 2FA (as in test/staff.js)
const STEP = 30;
const base32Decode = text => {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = text.replace(/=+$/, "").toUpperCase().split("").map(c => alphabet.indexOf(c).toString(2).padStart(5, "0")).join("");
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
};
const codeAt = (secret, step) => {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = crypto.createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = mac[mac.length - 1] & 0x0F;
  return String((mac.readUInt32BE(offset) & 0x7FFFFFFF) % 1000000).padStart(6, "0");
};
const stepNow = () => Math.floor(Date.now() / 1000 / STEP);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
// a code is taken once: each use needs a later step than the last.
const used = {};
const freshCode = async (who, secret) => {
  while (used[who] !== undefined && stepNow() <= used[who]) {
    await sleep(250);
  }
  used[who] = stepNow();
  return codeAt(secret, used[who]);
};

// a browser: keeps every cookie it is given, follows no redirects.
const browser = () => {
  const jar = new Map();
  const request = async (where, {body, method} = {}) => {
    const headers = {cookie: [...jar].map(([name, value]) => `${name}=${value}`).join("; ")};
    const options = {method: method || (body === undefined ? "GET" : "POST"), headers, redirect: "manual"};
    if (body !== undefined) {
      options.headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    }
    const res = await fetch(where.startsWith("http") ? where : `${BASE}${where}`, options);
    for (const line of res.headers.getSetCookie()) {
      const [pair, ...attributes] = line.split(";");
      const [name, value] = pair.split("=");
      if (attributes.some(attribute => /^\s*max-age=0$/i.test(attribute)) || value === "") {
        jar.delete(name.trim());
      }
      else {
        jar.set(name.trim(), value);
      }
    }
    return {status: res.status, location: res.headers.get("location") || "", data: await res.json().catch(() => ({})), cookies: res.headers.getSetCookie()};
  };
  request.has = name => jar.has(name);
  return request;
};

// a Discord sign-in through the fake Discord: start at `start`, come back
// to `callback` as `who`. the redirect's address.
const throughDiscord = async (page, start, callback, who) => {
  const begun = await page(start);
  assert.strictEqual(begun.status, 302, JSON.stringify(begun));
  const state = new URL(begun.location).searchParams.get("state");
  assert.ok(state, begun.location);
  const back = await page(`${callback}?state=${state}&code=${who}`);
  assert.strictEqual(back.status, 302);
  return back;
};

const run = async mail => {
  const people = {Mira: "KettlePass21", Hal: "KettlePass22", Pip: "KettlePass23"};
  for (const [username, password] of Object.entries(people)) {
    const res = await fetch(`${BASE}/api/register`, {method: "POST", headers: {"Content-Type": "application/json"},
      body: JSON.stringify({username, password, email: `${username.toLowerCase()}@example.com`, avatarType: 1, agreed: true})});
    assert.strictEqual(res.status, 200, await res.text());
  }

  // Mira and Hal turn on 2FA and link their Discord accounts.
  const secrets = {};
  for (const username of ["Mira", "Hal"]) {
    const page = browser();
    assert.strictEqual((await page("/account/api/login", {body: {username, password: people[username]}})).status, 200);
    const begun = await page("/account/api/act", {body: {action: "twoStepStart", current: people[username]}});
    secrets[username] = begun.data.setup.secret;
    const confirmed = await page("/account/api/act", {body: {action: "twoStepConfirm", code: await freshCode(username, secrets[username])}});
    assert.ok(confirmed.data.ok, JSON.stringify(confirmed.data));
    const linked = await throughDiscord(page, "/account/discord/link", "/account/discord/callback", username.toLowerCase());
    assert.match(linked.location, /discord=linked/);
  }

  // the admin makes Mira a moderator, and lets Hal into this dashboard with Discord.
  const admin = browser();
  assert.strictEqual((await admin("/admin/api/setup", {body: {password: "AdminPass99!"}})).status, 200);
  assert.strictEqual((await admin("/admin/api/login", {body: {password: "AdminPass99!"}})).status, 200);
  assert.match((await admin("/admin/api/account", {body: {username: "Mira", action: "role", role: "moderator"}})).data.ok, /moderator/);
  assert.ok((await admin("/admin/api/account", {body: {username: "Hal", action: "adminDashboardAccess", on: true}})).data.ok);

  // --- the moderator panel: Discord, then the code
  const mod = browser();
  const back = await throughDiscord(mod, "/dashboard/staff/discord/login", "/dashboard/staff/discord/callback", "mira");
  assert.match(back.location, /discord=code$/);
  assert.ok(!mod.has("ajc_mod"), "Discord alone opened the moderator panel");
  assert.ok(mod.has("ajc_mod_pending"));
  assert.strictEqual((await mod("/dashboard/api/staff/state")).data.signedIn, false);
  assert.strictEqual((await mod("/dashboard/api/staff/players")).status, 401);
  const wrong = await mod("/dashboard/api/staff/discord/code", {body: {code: "000000"}});
  assert.strictEqual(wrong.status, 401);
  assert.strictEqual(wrong.data.expired, undefined);
  const right = await mod("/dashboard/api/staff/discord/code", {body: {code: await freshCode("Mira", secrets.Mira)}});
  assert.strictEqual(right.status, 200, JSON.stringify(right.data));
  assert.strictEqual(right.data.username, "Mira");
  assert.ok(mod.has("ajc_mod") && !mod.has("ajc_mod_pending"));
  assert.strictEqual((await mod("/dashboard/api/staff/state")).data.signedIn, true);
  // a waiting sign-in is used once
  const again = await mod("/dashboard/api/staff/discord/code", {body: {code: await freshCode("Mira", secrets.Mira)}});
  assert.strictEqual(again.data.expired, true);

  // a few wrong codes, and it must start again at Discord
  const guesser = browser();
  await throughDiscord(guesser, "/dashboard/staff/discord/login", "/dashboard/staff/discord/callback", "mira");
  for (let i = 1; i <= 5; i++) {
    const guess = await guesser("/dashboard/api/staff/discord/code", {body: {code: String(100000 + i)}});
    assert.strictEqual(guess.status, 401);
    assert.strictEqual(Boolean(guess.data.expired), i === 5);
  }
  assert.strictEqual((await guesser("/dashboard/api/staff/discord/code", {body: {code: await freshCode("Mira", secrets.Mira)}})).data.expired, true);
  assert.ok(!guesser.has("ajc_mod"));

  // a Discord account linked to no staff gets nowhere
  const player = browser();
  const denied = await throughDiscord(player, "/dashboard/staff/discord/login", "/dashboard/staff/discord/callback", "hal");
  assert.match(denied.location, /discord=denied$/);
  assert.ok(!player.has("ajc_mod_pending"));

  // --- the admin dashboard: the same
  const owner = browser();
  const adminBack = await throughDiscord(owner, "/dashboard/admin/discord/login", "/dashboard/admin/discord/callback", "hal");
  assert.match(adminBack.location, /discord=code$/);
  assert.ok(!owner.has("ajc_admin"), "Discord alone opened the admin dashboard");
  assert.strictEqual((await owner("/dashboard/api/admin/state")).data.signedIn, false);
  assert.strictEqual((await owner("/dashboard/api/admin/discord/code", {body: {code: "000000"}})).status, 401);
  const adminRight = await owner("/dashboard/api/admin/discord/code", {body: {code: await freshCode("Hal", secrets.Hal)}});
  assert.strictEqual(adminRight.status, 200, JSON.stringify(adminRight.data));
  assert.strictEqual((await owner("/dashboard/api/admin/state")).data.signedIn, true);

  // --- recovery by email
  const recover = async (username, kind) => {
    const before = mail.length;
    const sent = await (browser())("/account/api/recover/request", {body: {username, email: `${username.toLowerCase()}@example.com`, kind}});
    assert.strictEqual(sent.status, 200);
    if (mail.length === before) {
      return null;
    }
    const message = mail.at(-1);
    assert.strictEqual(message.to, `${username.toLowerCase()}@example.com`);
    return new URL(/https?:\/\/\S+/.exec(message.text)[0]).searchParams.get("token");
  };
  const page = browser();

  // a password, by the email alone
  const pipToken = await recover("Pip", "password");
  assert.strictEqual((await page("/account/api/recover/check", {body: {token: pipToken}})).data.kind, "password");
  assert.strictEqual((await page("/account/api/recover/complete", {body: {token: pipToken, password: "KettlePass33"}})).status, 200);
  // and then not 2FA as well, by the email, for a week
  const pipTwoStep = await recover("Pip", "twoStep");
  assert.match((await page("/account/api/recover/check", {body: {token: pipTwoStep}})).data.error, /within 7 days/);
  assert.match((await page("/account/api/recover/complete", {body: {token: pipTwoStep, password: "KettlePass33"}})).data.error, /within 7 days/);

  // 2FA, by the email and the password
  const halToken = await recover("Hal", "twoStep");
  assert.strictEqual((await page("/account/api/recover/check", {body: {token: halToken}})).data.kind, "twoStep");
  const noPassword = await page("/account/api/recover/complete", {body: {token: halToken, password: "not it"}});
  assert.strictEqual(noPassword.status, 401);
  assert.strictEqual((await page("/account/api/recover/complete", {body: {token: halToken, password: people.Hal}})).status, 200);
  const halNow = browser();
  assert.strictEqual((await halNow("/account/api/login", {body: {username: "Hal", password: people.Hal}})).status, 200, "2FA was not removed");

  // never for staff: a mailbox does not make anyone a moderator
  const miraToken = await recover("Mira", "twoStep");
  assert.match((await page("/account/api/recover/check", {body: {token: miraToken}})).data.error, /Staff accounts/);
  assert.match((await page("/account/api/recover/complete", {body: {token: miraToken, password: people.Mira}})).data.error, /Staff accounts/);
  assert.strictEqual((await mod("/dashboard/api/staff/state")).data.signedIn, true, "Mira's 2FA went");

  // a few recovery emails an hour for one account, from anywhere
  assert.ok(await recover("Mira", "password"));
  assert.ok(await recover("Mira", "password"));
  assert.strictEqual(await recover("Mira", "password"), null);
};

const main = async () => {
  const mail = [];
  const mailServer = http.createServer((req, res) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
    });
    req.on("end", () => {
      assert.strictEqual(req.headers.authorization, "Bearer test-mail-token");
      mail.push(JSON.parse(body));
      res.writeHead(200);
      res.end();
    });
  });
  await new Promise(resolve => mailServer.listen(MAIL_PORT, "127.0.0.1", resolve));
  Object.assign(process.env, {
    // forward slashes: NODE_OPTIONS reads a backslash as an escape (Windows)
    NODE_OPTIONS: `${process.env.NODE_OPTIONS || ""} --require "${path.join(__dirname, "fake-discord.js").replace(/\\/g, "/")}"`.trim(),
    AJ_DISCORD_CLIENT_ID: "123456789012345678",
    AJ_DISCORD_CLIENT_SECRET: "test-secret",
    AJ_RECOVERY_MAIL_URL: `http://127.0.0.1:${MAIL_PORT}/mail`,
    AJ_RECOVERY_MAIL_TOKEN: "test-mail-token",
  });
  try {
    await harness.withServer("sign-in test", HTTP_PORT, GAME_PORT, () => run(mail));
  }
  finally {
    mailServer.close();
  }
};

main().catch(err => {
  console.error(err);
  process.exit(1);
});
