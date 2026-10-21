"use strict";

const {logText} = require("./logtext.js");
const accounts = require("./accounts.js");

// what each moderator did in the moderator panel (lib/modpanel.js), for
// whoever runs the server to read in the admin panel. never pruned.

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS mod_log (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    at     INTEGER NOT NULL,
    by     TEXT NOT NULL,
    action TEXT NOT NULL,
    target TEXT NOT NULL DEFAULT '',
    detail TEXT NOT NULL DEFAULT ''
  );
`;
const MAX_DETAIL = 400;
const SHOWN = 300;
const listeners = new Set();

const load = () => accounts.database().exec(SCHEMA);

const record = (by, action, target = "", detail = "") => {
  const entry = {at: Math.floor(Date.now() / 1000), by: String(by), action: String(action), target: String(target), detail: String(detail).slice(0, MAX_DETAIL)};
  accounts.database().prepare("INSERT INTO mod_log (at, by, action, target, detail) VALUES (?, ?, ?, ?, ?)")
    .run(entry.at, entry.by, entry.action, entry.target, entry.detail);
  console.log(`[mod] ${logText(by)}: ${logText(action)}${logText(target ? ` "${target}"` : "")}`);
  for (const listener of listeners) {
    try {
      listener(entry);
    }
    catch (err) {
      console.error(`[modlog] listener failed: ${logText(err.message)}`);
    }
  }
};

const recent = () => accounts.database().prepare("SELECT at, by, action, target, detail FROM mod_log ORDER BY id DESC LIMIT ?").all(SHOWN);

// what staff did to one player, newest first, for their timeline.
const about = username => accounts.database().prepare("SELECT at, by, action, target, detail FROM mod_log WHERE target = ? COLLATE NOCASE ORDER BY id DESC LIMIT 100")
  .all(String(username));

// Optional integrations subscribe here rather than wrapping record(), so an
// unavailable Discord channel can never stop a moderation action or its DB
// audit record from being written.
const onRecord = listener => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

module.exports = {load, record, recent, about, onRecord};
