"use strict";

const {logText} = require("./logtext.js");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const accounts = require("./accounts.js");
const config = require("../config.js");

// the computers players sign in from, for telling alts apart and keeping a
// banned player's computer out (the "device ban" of the panels).
//
// the client (1.3.0 and on) sends, with every sign-in, hashes of what it
// can read about the computer: the system's own id (MachineGuid on Windows,
// IOPlatformUUID on macOS, /etc/machine-id on Linux), the board's id or
// serial, the disks' serials, the network cards' addresses, and an id of
// its own it keeps in two or three places. none of them is sent as it is:
// each is SHA-256 of "burrow-device:<kind>:<value>", and here that is keyed
// again with a secret of this server's (data/device-key), so what is kept
// is of no use anywhere else.
//
// two computers are taken for one when they share at least MIN_MATCHING of
// these (owner, 2026-10-23: one or two in common was too often someone
// else's), for a ban and for an alt alike: someone who edits
// /etc/machine-id or deletes MachineGuid still has the same board, disks
// and the client's own id. the network card's address (MAC_KIND) does not
// count towards them: it is easily changed and sometimes shared, so it bans
// nothing; it is written down for the moderators instead. values every cheap board or VM has ("To be filled by
// O.E.M.", all zeros) are left out here, so that no ban falls on everyone
// who has one. what the client noticed was wrong (the system id missing, or
// not shaped as it always is) comes as notes, and is written down too.
//
// the client is open source, so a player who builds their own can send
// anything; this keeps out the usual ban evader (a VPN, a new account),
// not a determined one. the moderators see the alerts and decide.

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS device_bans (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ids         TEXT NOT NULL,
    reason      TEXT NOT NULL,
    by          TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    account_id  INTEGER,
    username    TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS device_alerts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    at          INTEGER NOT NULL,
    account_id  INTEGER NOT NULL,
    username    TEXT NOT NULL,
    kind        TEXT NOT NULL,
    detail      TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS device_alerts_account ON device_alerts (account_id, id);
`;

const KINDS = ["os", "board", "disk", "install", "mac"];
const STRONG = ["os", "board", "disk", "install"];
const MAC_KIND = "mac";
const MIN_MATCHING = 3; // ids but a network card's two computers share to be taken for one
const LISTS = ["disk", "mac"]; // sent as lists; the rest one each
const MAX_IN_LIST = 8;
const MAX_KEPT = 60; // ids an account keeps, the latest
const DAYS_KEPT = 90; // what a ban by account takes, and alts look at
const ALERT_EVERY_SECONDS = 86400; // one alert of a kind for an account a day
const MAX_ALERTS_SHOWN = 200;
const MAX_REASON = 300;
const HASH = /^[0-9a-f]{64}$/;
const NOTE = /^[a-z_]{1,24}$/;
// notes from the client that mean someone has been at the computer's ids.
const TAMPER_NOTES = {
  os_missing: "the system id is missing",
  os_odd: "the system id is not shaped like one",
  install_mismatch: "the client's own ids disagree",
};

// values that are everyone's: on cheap boards, in VMs, or where the maker
// wrote nothing. the client sends them hashed like any other, so they are
// hashed here the same way to be known.
const JUNK = {
  os: ["00000000-0000-0000-0000-000000000000", "ffffffff-ffff-ffff-ffff-ffffffffffff", "00000000000000000000000000000000",
    "ffffffffffffffffffffffffffffffff"],
  board: ["00000000-0000-0000-0000-000000000000", "ffffffff-ffff-ffff-ffff-ffffffffffff", "03000200-0400-0500-0006-000700080009",
    "12345678-1234-5678-90ab-cddeefaabbcc", "to be filled by o.e.m.", "default string", "system serial number", "chassis serial number",
    "not applicable", "not specified", "none", "n/a", "0", "0123456789", "123456789", "1234567890", "serial", "invalid"],
  disk: ["0", "none", "0000_0000_0000_0000", "default string", "to be filled by o.e.m.", "not specified"],
  mac: ["00:00:00:00:00:00", "ff:ff:ff:ff:ff:ff"],
};
const clientHash = (kind, value) => crypto.createHash("sha256").update(`burrow-device:${kind}:${value}`).digest("hex");
const JUNK_HASHES = new Set(Object.entries(JUNK).flatMap(([kind, values]) => values.map(value => clientHash(kind, value))));

const now = () => Math.floor(Date.now() / 1000);
const db = () => accounts.database();
const clean = (text, max) => String(text === undefined || text === null ? "" : text).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
const NO_REASON = "Not provided";

let key = null; // this server's secret for keying the ids
const banned = new Map(); // "kind:id" -> ban {id, ids, reason, by, createdAt, accountId, username}
const holders = new Map(); // "kind:id" -> Set of account ids that used it

const keyFile = () => path.join(config.dataDir, "device-key");

// the account's ids: [{kind, id, first, last}], the latest first.
const idsOf = account => {
  if (!Array.isArray(account.hwids)) {
    account.hwids = [];
  }
  return account.hwids;
};
const tag = entry => `${entry.kind}:${entry.id}`;
const isStrong = id => STRONG.includes(id.split(":")[0]);

const banRow = row => ({id: row.id, ids: JSON.parse(row.ids), reason: row.reason, by: row.by, createdAt: row.created_at,
  accountId: row.account_id, username: row.username});

const load = () => {
  try {
    key = fs.readFileSync(keyFile());
  }
  catch (err) {
    key = crypto.randomBytes(32);
    fs.writeFileSync(keyFile(), key, {mode: 0o600});
  }
  db().exec(SCHEMA);
  for (const row of db().prepare("SELECT * FROM device_bans").all()) {
    const ban = banRow(row);
    for (const id of ban.ids) {
      banned.set(id, ban);
    }
  }
  for (const account of accounts.all()) {
    for (const entry of idsOf(account)) {
      remember(account, tag(entry));
    }
  }
};

const remember = (account, id) => {
  if (!holders.has(id)) {
    holders.set(id, new Set());
  }
  holders.get(id).add(account.id);
};

// what a sign-in said about its computer (`device` from its body), keyed:
// {ids: [{kind, id}], notes: [..]}, or null when it said nothing usable.
const read = device => {
  if (!device || typeof device !== "object" || device.v !== 1 || !device.ids || typeof device.ids !== "object") {
    return null;
  }
  const ids = [];
  for (const kind of KINDS) {
    const given = device.ids[kind];
    const values = LISTS.includes(kind) ? (Array.isArray(given) ? given.slice(0, MAX_IN_LIST) : []) : [given];
    for (const value of values) {
      const hash = String(value || "").toLowerCase();
      if (HASH.test(hash) && !JUNK_HASHES.has(hash)) {
        ids.push({kind, id: crypto.createHmac("sha256", key).update(`${kind}:${hash}`).digest("hex").slice(0, 32)});
      }
    }
  }
  const notes = Array.isArray(device.notes) ? device.notes.slice(0, 8).map(String).filter(note => NOTE.test(note)) : [];
  // something to tell one computer by, beyond a network card.
  return ids.some(entry => STRONG.includes(entry.kind)) ? {ids, notes} : null;
};

// the ban that has at least MIN_MATCHING of these "kind:id" in it, or
// null. network cards' addresses are not counted (see the top).
const banMatching = ids => {
  const strong = new Set(ids.filter(isStrong));
  const looked = new Set();
  for (const id of strong) {
    const ban = banned.get(id);
    if (ban && !looked.has(ban.id)) {
      looked.add(ban.id);
      if (ban.ids.filter(one => strong.has(one)).length >= MIN_MATCHING) {
        return ban;
      }
    }
  }
  return null;
};

// the ban that keeps this computer out, or null.
const banOf = device => banMatching(device.ids.map(tag));

// the ban on any computer the account signed in from lately, or null: for
// the client asking why its game was stopped.
const banOfAccount = account => banMatching(idsOf(account).filter(entry => entry.last > now() - DAYS_KEPT * 86400).map(tag));

const alert = (account, kind, detail) => {
  const last = db().prepare("SELECT at FROM device_alerts WHERE account_id = ? AND kind = ? ORDER BY id DESC LIMIT 1").get(account.id, kind);
  if (last && last.at > now() - ALERT_EVERY_SECONDS) {
    return;
  }
  db().prepare("INSERT INTO device_alerts (at, account_id, username, kind, detail) VALUES (?, ?, ?, ?, ?)").run(now(), account.id, account.username, kind, detail);
  console.log(`[devices] ${logText(account.username)}: ${logText(kind)} (${logText(detail)})`);
};

// an account signed in from this computer: its ids are kept, and what looks
// wrong is written down. `isBanned(account)` says whether another account is
// banned now (lib/moderation.js), for "shares a computer with a banned one".
const seen = (account, device, isBanned) => {
  const list = idsOf(account);
  const at = now();
  for (const entry of device.ids) {
    const kept = list.find(other => other.kind === entry.kind && other.id === entry.id);
    if (kept) {
      kept.last = at;
    }
    else {
      list.push({kind: entry.kind, id: entry.id, first: at, last: at});
    }
    remember(account, tag(entry));
  }
  list.sort((one, other) => other.last - one.last);
  for (const dropped of list.splice(MAX_KEPT)) {
    const set = holders.get(tag(dropped));
    if (set) {
      set.delete(account.id);
    }
  }
  const tampered = device.notes.filter(note => TAMPER_NOTES[note]).map(note => TAMPER_NOTES[note]);
  if (tampered.length) {
    alert(account, "tampered", tampered.join(", "));
  }
  const nearBan = device.ids.find(entry => entry.kind === MAC_KIND && banned.has(tag(entry)));
  if (nearBan) {
    alert(account, "near_ban", `same network card as a hardware ban (${banned.get(tag(nearBan)).username || "no account"})`);
  }
  const shared = new Map(); // account id -> ids in common
  for (const entry of device.ids.filter(one => STRONG.includes(one.kind))) {
    for (const id of holders.get(tag(entry)) || []) {
      if (id !== account.id) {
        shared.set(id, (shared.get(id) || 0) + 1);
      }
    }
  }
  const sharers = new Set();
  for (const [id, count] of shared) {
    const other = count >= MIN_MATCHING ? accounts.byId(id) : null;
    if (other && isBanned(other)) {
      sharers.add(other.username);
    }
  }
  if (sharers.size) {
    alert(account, "shares_banned", `same hardware as banned ${[...sharers].slice(0, 5).join(", ")}`);
  }
};

// the other accounts that used one of this one's computers, sharing at
// least MIN_MATCHING of its ids: [{username, kinds: [kind]}], most in
// common first.
const alts = account => {
  const found = new Map(); // account id -> {kinds: Set, strong: ids in common but network cards}
  for (const entry of idsOf(account)) {
    for (const id of holders.get(tag(entry)) || []) {
      if (id !== account.id) {
        if (!found.has(id)) {
          found.set(id, {kinds: new Set(), strong: 0});
        }
        found.get(id).kinds.add(entry.kind);
        found.get(id).strong += STRONG.includes(entry.kind) ? 1 : 0;
      }
    }
  }
  return [...found].filter(([, shared]) => shared.strong >= MIN_MATCHING)
    .map(([id, shared]) => ({account: accounts.byId(id), kinds: [...shared.kinds], strong: shared.strong}))
    .filter(entry => entry.account)
    .sort((one, other) => other.strong - one.strong || other.kinds.length - one.kinds.length || one.account.username.localeCompare(other.account.username))
    .map(entry => ({username: entry.account.username, kinds: entry.kinds}));
};

// how many computers' worth of ids an account has, for the panels.
const knownFor = account => ({ids: idsOf(account).length, lastAt: idsOf(account).reduce((latest, entry) => Math.max(latest, entry.last), 0)});

// bans every computer the account signed in from in the last DAYS_KEPT
// days. returns {ban} or {error}. `out(ban)` puts out whoever plays from
// one of them.
const banAccount = (account, reason, by) => {
  const ids = [...new Set(idsOf(account).filter(entry => entry.last > now() - DAYS_KEPT * 86400).map(tag))];
  if (ids.filter(isStrong).length < MIN_MATCHING) {
    return {error: `Fewer than ${MIN_MATCHING} hardware IDs known for them.`};
  }
  if (ids.filter(isStrong).every(id => banned.has(id))) {
    return {error: "Their hardware is banned already."};
  }
  const text = clean(reason, MAX_REASON) || NO_REASON;
  const result = db().prepare("INSERT INTO device_bans (ids, reason, by, created_at, account_id, username) VALUES (?, ?, ?, ?, ?, ?)")
    .run(JSON.stringify(ids), text, by, now(), account.id, account.username);
  const ban = {id: Number(result.lastInsertRowid), ids, reason: text, by, createdAt: now(), accountId: account.id, username: account.username};
  for (const id of ids) {
    banned.set(id, ban);
  }
  return {ban};
};

// the accounts playing from one of a ban's computers, by their latest ids:
// those with at least MIN_MATCHING of its ids.
const accountsUnder = ban => {
  const found = new Map(); // account id -> ids in common
  for (const id of new Set(ban.ids.filter(isStrong))) {
    for (const accountId of holders.get(id) || []) {
      found.set(accountId, (found.get(accountId) || 0) + 1);
    }
  }
  return [...found].filter(([, count]) => count >= MIN_MATCHING).map(([id]) => accounts.byId(id)).filter(Boolean);
};

const unban = id => {
  const row = db().prepare("SELECT * FROM device_bans WHERE id = ?").get(Number(id));
  if (!row) {
    return null;
  }
  const ban = banRow(row);
  db().prepare("DELETE FROM device_bans WHERE id = ?").run(ban.id);
  for (const one of ban.ids) {
    if (banned.get(one) && banned.get(one).id === ban.id) {
      banned.delete(one);
    }
  }
  return ban;
};

// one ban as kept, with the account it was made with (accountId), or null:
// for the moderator panel to see whose it is before lifting it.
const banById = id => {
  const row = db().prepare("SELECT * FROM device_bans WHERE id = ?").get(Number(id));
  return row ? banRow(row) : null;
};

// the bans, newest first: their ids, and the accounts that used them.
const MAX_LISTED_ACCOUNTS = 20;
const list = () => db().prepare("SELECT * FROM device_bans ORDER BY id DESC").all().map(banRow)
  .map(ban => ({id: ban.id, username: ban.username, reason: ban.reason, by: ban.by, createdAt: ban.createdAt,
    ids: ban.ids.map(one => ({kind: one.split(":")[0], id: one.split(":")[1]})),
    accounts: accountsUnder(ban).map(account => account.username).sort().slice(0, MAX_LISTED_ACCOUNTS)}));

// the account's ids for the panels, the latest first: [{kind, id, first,
// last, banned: the ban's id or 0, others: how many other accounts used it}].
const idsFor = account => idsOf(account).map(entry => {
  const ban = banned.get(tag(entry));
  const set = holders.get(tag(entry));
  return {kind: entry.kind, id: entry.id, first: entry.first, last: entry.last, banned: ban ? ban.id : 0,
    others: set ? [...set].filter(id => id !== account.id).length : 0};
});

// the bans that keep the account's computers out (by any of its ids but a
// network card's, however old), and those made with it: what "unban
// computers" on its page lifts.
const bansOfAccount = account => {
  const found = new Map();
  for (const entry of idsOf(account)) {
    const ban = banned.get(tag(entry));
    if (ban && STRONG.includes(entry.kind)) {
      found.set(ban.id, ban);
    }
  }
  for (const ban of banned.values()) {
    if (ban.accountId === account.id) {
      found.set(ban.id, ban);
    }
  }
  return [...found.values()];
};

// the accounts that used an id, or any id starting with what was typed (a
// "kind:" in front is let be): {error} or {players: [{account, kinds,
// lastAt}]}, the latest first.
const MIN_ID_QUERY = 6;
const MAX_ID_FOUND = 100;
const search = query => {
  const wanted = String(query || "").trim().toLowerCase().replace(/^[a-z]+:/, "").slice(0, 32);
  if (wanted.length < MIN_ID_QUERY || !/^[0-9a-f]+$/.test(wanted)) {
    return {error: `Type at least ${MIN_ID_QUERY} characters of a hardware ID.`};
  }
  const found = new Map(); // account id -> {kinds, lastAt}
  for (const [key, set] of holders) {
    const [kind, id] = key.split(":");
    if (!id.startsWith(wanted)) {
      continue;
    }
    for (const accountId of set) {
      const account = accounts.byId(accountId);
      const entry = account && idsOf(account).find(one => one.kind === kind && one.id === id);
      if (entry) {
        const kept = found.get(accountId) || {account, kinds: new Set(), lastAt: 0};
        kept.kinds.add(kind);
        kept.lastAt = Math.max(kept.lastAt, entry.last);
        found.set(accountId, kept);
      }
    }
  }
  return {players: [...found.values()].map(entry => ({...entry, kinds: [...entry.kinds]}))
    .sort((one, other) => other.lastAt - one.lastAt).slice(0, MAX_ID_FOUND)};
};

// is any of the account's computers banned? the ban's id, or 0.
const bannedId = account => {
  const ban = banOfAccount(account);
  return ban ? ban.id : 0;
};

const ALERT_NAMES = {tampered: "Hardware IDs tampered with", near_ban: "Network card of a hardware ban", shares_banned: "Same hardware as a banned player"};
const alertRow = row => ({id: row.id, at: row.at, username: row.username, kind: row.kind, name: ALERT_NAMES[row.kind] || row.kind, detail: row.detail});
const alerts = () => db().prepare("SELECT * FROM device_alerts ORDER BY id DESC LIMIT ?").all(MAX_ALERTS_SHOWN).map(alertRow);
const alertsOf = account => db().prepare("SELECT * FROM device_alerts WHERE account_id = ? ORDER BY id DESC LIMIT 50").all(account.id).map(alertRow);

// an account being deleted: its ids and alerts go. bans stay: they are of
// computers, not of the account.
const forget = account => {
  for (const entry of idsOf(account)) {
    const set = holders.get(tag(entry));
    if (set) {
      set.delete(account.id);
    }
  }
  db().prepare("DELETE FROM device_alerts WHERE account_id = ?").run(account.id);
};

// sign-in tokens last given to (or brought back by) a launcher that sent no
// device ids: one from before 1.3.0, or not ours. with config.requireDevice
// its sign-in still goes through, so that the game loads and its own login
// popup can say to update (lib/world.js), which a refused sign-in cannot.
// kept by hash, in memory: such a launcher signs in again each time it starts.
const MAX_OUTDATED = 20000;
const outdatedTokens = new Set();
const tokenKey = token => crypto.createHash("sha256").update(String(token)).digest("hex");
const noteLauncher = (token, hasIds) => {
  const key = tokenKey(token);
  if (hasIds) {
    outdatedTokens.delete(key);
    return;
  }
  if (outdatedTokens.size >= MAX_OUTDATED) {
    outdatedTokens.delete(outdatedTokens.values().next().value);
  }
  outdatedTokens.add(key);
};
const launcherOutdated = token => outdatedTokens.has(tokenKey(token));

module.exports = {noteLauncher, launcherOutdated, load, read, banOf, banOfAccount, seen, alts, knownFor, banAccount, accountsUnder, unban, banById, list, idsFor, bansOfAccount, search, bannedId, alerts, alertsOf, forget, clientHash};
