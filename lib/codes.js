"use strict";

const accounts = require("./accounts.js");
const defpacks = require("./defpacks.js");

// codes players type into the game's "Redeem Code" window
// (gameRedemption.CodeRedemptionPopup, "grc" in lib/world.js), made in the
// admin panel. a code gives one thing: a clothing item (in a colour), a den
// item, gems or diamonds, as a gift from Burrow HQ (lib/ecards.js
// sendFromHq). each account may use a code once; a code may also have an
// end to how many times it is used in all, and is then spent.

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS redeem_codes (
    code       TEXT PRIMARY KEY,
    kind       TEXT NOT NULL,
    item       INTEGER NOT NULL DEFAULT 0,
    amount     INTEGER NOT NULL DEFAULT 0,
    color      INTEGER,
    uses       INTEGER NOT NULL DEFAULT 0,
    used       INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS redeem_uses (
    code       TEXT NOT NULL,
    account_id INTEGER NOT NULL,
    at         INTEGER NOT NULL,
    PRIMARY KEY (code, account_id)
  );
`;

const KINDS = ["clothing", "den", "gems", "diamonds"];
const CODE = /^[A-Z0-9-]{3,32}$/; // what the game's box lets be typed (and in capitals)
const MAX_AMOUNT = 10000000;
const MAX_USES = 1000000;

let made = false;
const db = () => {
  const database = accounts.database();
  if (!made) {
    database.exec(SCHEMA);
    made = true;
  }
  return database;
};
const now = () => Math.floor(Date.now() / 1000);
const normal = code => String(code || "").trim().toUpperCase();

const row = entry => ({code: entry.code, kind: entry.kind, item: entry.item, amount: entry.amount, color: entry.color,
  uses: entry.uses, used: entry.used, createdAt: entry.created_at});

const list = () => db().prepare("SELECT * FROM redeem_codes ORDER BY created_at DESC").all().map(row);

// {code, kind, item, amount, color, uses}: returns {ok} or {error}.
const create = fields => {
  const code = normal(fields.code);
  const kind = String(fields.kind || "");
  const uses = Number(fields.uses) || 0;
  if (!CODE.test(code)) {
    return {error: "A code is 3 to 32 letters, digits and dashes."};
  }
  if (!KINDS.includes(kind)) {
    return {error: "A code gives clothing, a den item, gems or diamonds."};
  }
  if (!Number.isInteger(uses) || uses < 0 || uses > MAX_USES) {
    return {error: "Uses: 0 for any number, or how many in all."};
  }
  let item = 0;
  let amount = 0;
  let color = null;
  if (kind === "clothing") {
    item = Number(fields.item);
    const def = defpacks.itemDef(item);
    if (!def || !defpacks.clothingIds().includes(item)) {
      return {error: "No clothing item with that id."};
    }
    const own = String(def.colors).split(",").map(Number);
    const chosen = fields.color === undefined || String(fields.color).trim() === "" ? own[0] : Number(fields.color);
    if (!Number.isInteger(chosen) || chosen < -0x80000000 || chosen > 0xFFFFFFFF) {
      return {error: "A colour as the game writes it (a whole number), or none for the item's own."};
    }
    color = chosen >>> 0;
  }
  else if (kind === "den") {
    item = Number(fields.item);
    if (!defpacks.denItemIds().includes(item)) {
      return {error: "No den item with that id."};
    }
  }
  else {
    amount = Number(fields.amount);
    if (!Number.isInteger(amount) || amount < 1 || amount > MAX_AMOUNT) {
      return {error: "An amount from 1 to 10,000,000."};
    }
  }
  if (db().prepare("SELECT 1 FROM redeem_codes WHERE code = ?").get(code)) {
    return {error: "That code is taken."};
  }
  db().prepare("INSERT INTO redeem_codes (code, kind, item, amount, color, uses, used, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)")
    .run(code, kind, item, amount, color, uses, now());
  return {ok: `${code} made.`};
};

const remove = code => db().prepare("DELETE FROM redeem_codes WHERE code = ?").run(normal(code)).changes > 0;

// a code typed in the game, for `account`: {gift} for lib/ecards.js
// sendFromHq, or {error: "unknown" | "used" | "spent"}. the use is noted.
const redeem = (account, typed) => {
  const code = normal(typed);
  const entry = CODE.test(code) ? db().prepare("SELECT * FROM redeem_codes WHERE code = ?").get(code) : null;
  if (!entry) {
    return {error: "unknown"};
  }
  if (db().prepare("SELECT 1 FROM redeem_uses WHERE code = ? AND account_id = ?").get(code, account.id)) {
    return {error: "used"};
  }
  if (entry.uses > 0 && entry.used >= entry.uses) {
    return {error: "spent"};
  }
  db().prepare("INSERT INTO redeem_uses (code, account_id, at) VALUES (?, ?, ?)").run(code, account.id, now());
  db().prepare("UPDATE redeem_codes SET used = used + 1 WHERE code = ?").run(code);
  const gift = entry.kind === "clothing" ? {kind: "clothing", id: entry.item, color: entry.color}
    : entry.kind === "den" ? {kind: "den", id: entry.item} : {kind: entry.kind, amount: entry.amount};
  return {gift, code};
};

// a use taken back, when the gift could not be sent after all
const unredeem = (account, code) => {
  if (db().prepare("DELETE FROM redeem_uses WHERE code = ? AND account_id = ?").run(code, account.id).changes > 0) {
    db().prepare("UPDATE redeem_codes SET used = MAX(used - 1, 0) WHERE code = ?").run(code);
  }
};

module.exports = {list, create, remove, redeem, unredeem, KINDS};
