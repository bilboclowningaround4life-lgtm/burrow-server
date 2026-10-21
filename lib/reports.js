"use strict";

const {logText} = require("./logtext.js");
const accounts = require("./accounts.js");
const limits = require("./limits.js");

// player reports (client side: ReportAPlayer, FacilitatorXtCommManager). A
// report is who, about whom, one of the game's fixed reasons, and what the
// reporter typed about it (the patched report window has a text box; the
// game's own had none). they wait in the admin panel's Reports page.

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS reports (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at INTEGER NOT NULL,
    reporter   TEXT NOT NULL,
    target     TEXT NOT NULL,
    reason     INTEGER NOT NULL,
    detail     TEXT NOT NULL,
    context    TEXT NOT NULL,
    room       TEXT NOT NULL,
    handled_at INTEGER
  );
`;

// ReportAPlayer.reasonIdForReason, in the game's own words.
const REASONS = {
  1: "Being a bully",
  2: "Bad words",
  3: "Personal info",
  4: "Safety",
  5: "Inappropriate den",
  6: "Scamming",
  7: "Inappropriate behavior",
  13: "Inappropriate username",
  14: "Inappropriate Jam-A-Gram",
  15: "Inappropriate Jammer Wall post",
  16: "Inappropriate Masterpiece",
};
const MAX_DETAIL = 200;
const MAX_CONTEXT = 4000;
const MAX_OPEN = 5000; // reports waiting; further ones are dropped
const MERGE_SECONDS = 10;

const perTenMinutes = limits.limiter(10, 600000);
const now = () => Math.floor(Date.now() / 1000);
const clean = (text, max) => String(text === undefined ? "" : text).replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ").trim().slice(0, max);
const listeners = new Set();

const load = () => accounts.database().exec(SCHEMA);

const openCount = () => accounts.database().prepare("SELECT COUNT(*) AS count FROM reports WHERE handled_at IS NULL").get().count;

// files a report. the patched client sends what was typed in a message of
// its own just before the game's usual report message, so a second report
// by the same player about the same player within a few seconds is the
// same one: its typed text is kept and nothing new is filed.
// returns false when the reporter has sent too many.
const file = ({reporter, target, reason, detail = "", context = "", room = ""}) => {
  const db = accounts.database();
  const recent = db.prepare("SELECT id, detail FROM reports WHERE reporter = ? AND target = ? AND created_at >= ? ORDER BY id DESC LIMIT 1")
    .get(reporter, target, now() - MERGE_SECONDS);
  if (recent) {
    if (!recent.detail && detail) {
      db.prepare("UPDATE reports SET detail = ? WHERE id = ?").run(clean(detail, MAX_DETAIL), recent.id);
    }
    return true;
  }
  if (!perTenMinutes.allow(reporter.toLowerCase()) || openCount() >= MAX_OPEN) {
    return false;
  }
  const inserted = db.prepare("INSERT INTO reports (created_at, reporter, target, reason, detail, context, room) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(now(), reporter, target, Number.isInteger(reason) ? reason : 0, clean(detail, MAX_DETAIL), clean(context, MAX_CONTEXT), clean(room, 100));
  console.log(`[world] ${logText(reporter)} reported "${logText(target)}" (${logText(REASONS[reason] || `reason ${reason}`)})`);
  const report = row(db.prepare("SELECT * FROM reports WHERE id = ?").get(Number(inserted.lastInsertRowid)));
  for (const listener of listeners) {
    try {
      listener(report);
    }
    catch (err) {
      console.error(`[reports] listener failed: ${logText(err.message)}`);
    }
  }
  return true;
};

const row = report => ({
  id: report.id,
  createdAt: report.created_at,
  reporter: report.reporter,
  target: report.target,
  reason: REASONS[report.reason] || `Reason ${report.reason}`,
  detail: report.detail,
  context: report.context,
  room: report.room,
  handledAt: report.handled_at,
});

// reports waiting, oldest first; or with `handled`, the latest dealt with.
const list = (handled = false) => accounts.database()
  .prepare(handled
    ? "SELECT * FROM reports WHERE handled_at IS NOT NULL ORDER BY handled_at DESC LIMIT 200"
    : "SELECT * FROM reports WHERE handled_at IS NULL ORDER BY id LIMIT 500")
  .all().map(row);

const markHandled = id => accounts.database().prepare("UPDATE reports SET handled_at = ? WHERE id = ? AND handled_at IS NULL").run(now(), id).changes > 0;

// Lets optional integrations (the Discord bot) receive a newly filed report
// without making a report depend on an external service being available.
const onFile = listener => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

// the reports about one player, newest first, for their timeline.
const about = username => accounts.database().prepare("SELECT * FROM reports WHERE target = ? COLLATE NOCASE ORDER BY id DESC LIMIT 100")
  .all(String(username)).map(row);

module.exports = {load, file, list, about, markHandled, onFile, openCount, MAX_DETAIL};
