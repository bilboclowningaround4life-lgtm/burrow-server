"use strict";

const {logText} = require("./logtext.js");
const accounts = require("./accounts.js");

// custom colours. the game stores a colour as four palette indexes packed in
// one number, which leaves no room for "any hex colour". so a number in a
// range no real colour uses (CUSTOM_BASE and up) is instead the id of an
// entry here: the four RGB values that layer is drawn with. the patched
// client keeps the same table (PaletteHelper.customColors); the server sends
// it at login and announces every new entry to everyone before anybody can
// receive a colour that uses it.

const CUSTOM_BASE = 0xFD000000; // top byte 0xFD: unused by every item and animal def
const config = require("../config.js");
const MAX_ID = 0xFDFFFFFF; // the last id with the top byte 0xFD
const MAX_RGB = 0xFFFFFF;

const SCHEMA = "CREATE TABLE IF NOT EXISTS custom_colours (id INTEGER PRIMARY KEY, rgb TEXT NOT NULL UNIQUE)";

const byKey = new Map(); // "r1,r2,r3,r4" -> id
const entries = new Map(); // id -> [r1, r2, r3, r4]
let nextId = CUSTOM_BASE; // one past the highest id ever given: ids are never used twice

const load = () => {
  const db = accounts.database();
  db.exec(SCHEMA);
  for (const row of db.prepare("SELECT id, rgb FROM custom_colours").all()) {
    byKey.set(row.rgb, row.id);
    entries.set(row.id, row.rgb.split(",").map(Number));
    nextId = Math.max(nextId, row.id + 1);
  }
  console.log(`[colours] ${logText(entries.size)} custom colours`);
};

const valid = rgbs => rgbs.length === 4 && rgbs.every(value => Number.isInteger(value) && value >= 0 && value <= MAX_RGB);

// the id for these four RGB values, making the entry if it is new and
// `mayCreate` is not false. returns {id, rgbs, created}; null when the
// values are bad, and {full: true} when a new entry would be needed and may
// not be made (the table is full, or the asker has made enough today).
const allocate = (rgbs, mayCreate = true) => {
  if (!valid(rgbs)) {
    return null;
  }
  const key = rgbs.join(",");
  if (byKey.has(key)) {
    return {id: byKey.get(key), rgbs, created: false};
  }
  if (!mayCreate || entries.size >= config.maxCustomColours || nextId > MAX_ID) {
    return {full: true};
  }
  const id = nextId++;
  accounts.database().prepare("INSERT INTO custom_colours (id, rgb) VALUES (?, ?)").run(id, key);
  byKey.set(key, id);
  entries.set(id, rgbs);
  return {id, rgbs, created: true};
};

// [id, r1, r2, r3, r4] for every entry, in groups small enough for one message.
const chunks = (size = 200) => {
  const all = [...entries].map(([id, rgbs]) => [id, ...rgbs]);
  const out = [];
  for (let i = 0; i < all.length; i += size) {
    out.push(all.slice(i, i + size));
  }
  return out;
};

// is this number a colour the game can draw: one of its own (anything below
// the custom range), or an entry of the table?
const known = id => id < CUSTOM_BASE || id > MAX_ID || entries.has(id);

// the four RGB values of an entry, or null.
const rgbsOf = id => entries.get(id) || null;

module.exports = {CUSTOM_BASE, load, allocate, chunks, known, rgbsOf, count: () => entries.size};
