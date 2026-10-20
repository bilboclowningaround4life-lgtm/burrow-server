"use strict";

require("./lib/log.js"); // first, so everything printed reaches the admin panel's log view

const fs = require("fs");
const accounts = require("./lib/accounts.js");
const bans = require("./lib/bans.js");
const devices = require("./lib/devices.js");
const discord = require("./lib/discord.js");
const chatlog = require("./lib/chatlog.js");
const modlog = require("./lib/modlog.js");
const retention = require("./lib/retention.js");
const colours = require("./lib/colours.js");
const customItems = require("./lib/customitems.js");
const customMusic = require("./lib/custommusic.js");
const config = require("./config.js");
const defpacks = require("./lib/defpacks.js");
const http = require("./lib/http.js");
const masterpieces = require("./lib/masterpieces.js");
const panel = require("./lib/panel.js");
const reports = require("./lib/reports.js");
const roomInfo = require("./lib/roominfo.js");
const support = require("./lib/support.js");
const sfs = require("./lib/sfs.js");
const stats = require("./lib/stats.js");
const world = require("./lib/world.js");

// files this server makes are its own to read: accounts, logs, the cache.
process.umask(0o077);

const main = async () => {
  if (config.problems.length) {
    throw new Error(config.problems.join("; "));
  }
  if (!fs.existsSync(config.clientSwf)) {
    throw new Error(`Client SWF not found at ${config.clientSwf} (set AJ_CLIENT_SWF)`);
  }
  await defpacks.init();
  await roomInfo.preload();
  accounts.load();
  fs.chmodSync(config.dataDir, 0o700);
  accounts.startBackups();
  colours.load();
  customItems.load();
  customMusic.load();
  reports.load();
  support.load();
  bans.load();
  devices.load();
  discord.startup();
  chatlog.load();
  modlog.load();
  masterpieces.load();
  retention.load();
  stats.load(() => world.players().length);
  panel.load();
  await http.start();
  await sfs.start(world);
  console.log(`[server] ready at ${config.baseUrl}`);
};

// stopped on purpose: what is waiting to be written is written first.
const stop = code => {
  stats.flush();
  try {
    accounts.flush();
  }
  catch (err) {
    console.error(`[server] could not save while stopping: ${err.message}`);
  }
  process.exit(code);
};
process.on("SIGTERM", () => stop(0));
process.on("SIGINT", () => stop(0));
// the last resort. message handlers, timers and goodbyes each catch their
// own errors; what gets here was thrown somewhere nobody thought of, and the
// server's state can no longer be vouched for. it is written down, what can
// be saved is saved, and the process ends for whatever started it (systemd,
// with Restart=always) to start it again.
process.on("uncaughtException", err => {
  console.error(`[server] uncaught error, stopping: ${err && err.stack ? err.stack : err}`);
  stop(1);
});
process.on("unhandledRejection", err => {
  console.error(`[server] unhandled rejection: ${err && err.stack ? err.stack : err}`);
});

main().catch(err => {
  console.error(`[server] failed to start: ${err.message}`);
  process.exit(1);
});
