"use strict";

const {logText} = require("./logtext.js");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const accounts = require("./accounts.js");
const achievements = require("./achievements.js");
const adopt = require("./adopt.js");
const badges = require("./badges.js");
const discordLinks = require("./discord.js");
const discordBot = require("./discordbot.js");
const bans = require("./bans.js");
const colours = require("./colours.js");
const chatlog = require("./chatlog.js");
const config = require("../config.js");
const devices = require("./devices.js");
const defpacks = require("./defpacks.js");
const limits = require("./limits.js");
const log = require("./log.js");
const masterpieces = require("./masterpieces.js");
const modlog = require("./modlog.js");
const modpanel = require("./modpanel.js");
const playerItems = require("./playeritems.js");
const erase = require("./erase.js");
const reports = require("./reports.js");
const roles = require("./roles.js");
const sales = require("./sales.js");
const stats = require("./stats.js");
const staff = require("./staff.js");
const support = require("./support.js");
const totp = require("./totp.js");
const manage = require("./manage.js");
const world = require("./world.js");
const codes = require("./codes.js");
const {activeAvatar} = require("./player.js");

// the admin panel at /admin: the only place the server is administered from.
// it has one password, chosen the first time the panel is opened and kept as
// a salted scrypt hash in the database. no game account has admin powers.
//
// signing in sets a cookie that only this panel's pages send back (HttpOnly,
// SameSite=Strict, Path=/admin); sessions live in memory, so restarting the
// server signs everyone out.

const PASSWORD_SETTING = "admin_password"; // "salt:hash"
const COOKIE = "ajc_admin";
const DISCORD_COOKIE = "ajc_admin_discord";
const SESSION_HOURS = 12;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 200;
const MAX_MESSAGE_LENGTH = 200;
const MAX_BAN_HOURS = 24 * 365 * 10;
const MAX_GEMS = 1000000000;
const TEN_MINUTES_MS = 600000;
const DAY_SECONDS = 86400;
const MAX_ANNOUNCEMENT = 300;
const MAX_OWNED_LISTED = 300;
const MAX_LISTED = 100; // accounts in one search of the Accounts page
// currencies the panel can hand out, as indexes into CURRENCIES.
const GIFT_CURRENCIES = {gems: 0, tickets: 1, diamonds: 3};
// who a ban is written down as given by. the panel has one password and so
// one name; moderators with sign-ins of their own will each have theirs.
const BY = "admin";

// wrong passwords (and wrong setup codes) allowed per address before further
// tries from it are refused for a while. there is deliberately no overall
// limit: it would let a stranger lock the real admin out.
const failuresByAddress = limits.limiter(8, TEN_MINUTES_MS);

const sessions = new Map(); // SHA-256 of a session token -> expiry (ms)
let setupCode = null; // needed to choose the first password from another machine

const sha256 = text => crypto.createHash("sha256").update(text).digest("hex");
const now = () => Math.floor(Date.now() / 1000);

const hasPassword = () => accounts.setting(PASSWORD_SETTING) !== null;

const storePassword = password => {
  const salt = crypto.randomBytes(16).toString("hex");
  accounts.setSetting(PASSWORD_SETTING, `${salt}:${accounts.hashPassword(password, salt)}`);
};

const passwordMatches = password => {
  const [salt, hash] = (accounts.setting(PASSWORD_SETTING) || ":").split(":");
  if (typeof password !== "string" || !salt || password.length > MAX_PASSWORD_LENGTH) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(accounts.hashPassword(password, salt), "hex"), Buffer.from(hash, "hex"));
};

const passwordAcceptable = password =>
  typeof password === "string" && password.length >= MIN_PASSWORD_LENGTH && password.length <= MAX_PASSWORD_LENGTH;

const load = () => {
  // the number of worlds the admin chose last (world.setWorldCount)
  const worlds = accounts.setting(world.WORLD_COUNT_SETTING);
  if (worlds !== null) {
    world.setWorldCount(worlds, false);
  }
  if (!hasPassword()) {
    setupCode = crypto.randomBytes(5).toString("hex");
    console.log(`[admin] no admin password yet: open ${logText(config.baseUrl)}admin to choose one`
      + ` (from another machine it will ask for this setup code: ${setupCode})`);
  }
};

const cookieToken = req => {
  const match = new RegExp(`(?:^|;\\s*)${COOKIE}=([0-9a-f]{48})(?:;|$)`).exec(req.headers.cookie || "");
  return match ? match[1] : null;
};

const signedIn = req => {
  const token = cookieToken(req);
  const expiry = token && sessions.get(sha256(token));
  if (!expiry || expiry < Date.now()) {
    return false;
  }
  return true;
};

const cookieHeader = (token, maxAgeSeconds) =>
  `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${config.secureCookies ? "; Secure" : ""}`;

const discordCookie = (value, maxAgeSeconds) =>
  `${DISCORD_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${config.secureCookies ? "; Secure" : ""}`;

// a Discord sign-in waiting for the 2FA code of the account it is linked
// to: SHA-256 of the token in its cookie -> {id, expiry, tries}. Discord
// alone does not open this panel, as the password alone does not open the
// moderator panel.
const pendingDiscord = new Map();
const PENDING_COOKIE = "ajc_admin_pending";
const PENDING_MINUTES = 5;
const PENDING_TRIES = 5;
const pendingCookieHeader = (token, maxAgeSeconds) =>
  `${PENDING_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${config.secureCookies ? "; Secure" : ""}`;
const pendingToken = req => (new RegExp(`(?:^|;\\s*)${PENDING_COOKIE}=([0-9a-f]{48})(?:;|$)`).exec(req.headers.cookie || "") || [])[1] || null;
// may this account still sign in here with Discord?
const discordAdmin = account => Boolean(account && account.adminDashboardAccess && account.discordId && totp.isOn(account) && !account.locked);

// `extraCookies` go out with the session's own.
const signIn = (res, extraCookies = []) => {
  for (const [hash, expiry] of sessions) {
    if (expiry < Date.now()) {
      sessions.delete(hash);
    }
  }
  const token = crypto.randomBytes(24).toString("hex");
  sessions.set(sha256(token), Date.now() + SESSION_HOURS * 3600000);
  res.setHeader("Set-Cookie", [cookieHeader(token, SESSION_HOURS * 3600), ...extraCookies]);
};

const signOut = (req, res) => {
  const token = cookieToken(req);
  if (token) {
    sessions.delete(sha256(token));
  }
  res.setHeader("Set-Cookie", cookieHeader("", 0));
};

const accountRow = (account, playing) => {
  const ban = world.moderation.banRemaining(account);
  return {
    id: account.id,
    username: account.username,
    createdAt: account.createdAt,
    lastLogin: account.lastLogin || null,
    lastSeen: account.lastSeen || null,
    locked: account.locked,
    twoStep: totp.isOn(account),
    discord: account.discord,
    adminDashboardAccess: Boolean(account.adminDashboardAccess),
    guide: account.guideGiven === true,
    bio: account.bio,
    badges: account.badges,
    featuresOff: accounts.FEATURES.filter(name => !accounts.featureOn(account, name)),
    logins: account.numLogins,
    playtime: account.playtime,
    playtimePublic: account.playtimePublic,
    online: playing.has(account.username),
    room: playing.get(account.username) || null,
    // seconds left, -1 for permanent, 0 for not banned
    banned: ban,
    banReason: ban === 0 ? "" : account.banReason || bans.NO_REASON,
    moderator: Boolean(roles.roleOf(account)),
    role: roles.roleOf(account),
    // what they may do (their role's, with their own grants and denies)
    permissions: roles.permissionsOf(account),
    permGrants: account.permGrants || [],
    permDenies: account.permDenies || [],
    nameRejected: Boolean(account.nameRejected),
    silenced: world.moderation.isSilenced(account),
    animals: account.avatars.length,
    level: activeAvatar(account).questLevel || 0,
    items: account.items.length + account.denItems.length,
    gems: account.currency.gems || 0,
    deviceBanned: devices.bannedId(account) !== 0,
    devicesKnown: devices.knownFor(account).ids,
    stoppedThisWeek: chatlog.notSentCount(account, 7),
    paintings: masterpieces.madeBy(account).length,
  };
};

const overview = () => {
  const players = world.players();
  const all = accounts.all();
  const rooms = new Map();
  for (const player of players) {
    const room = player.room || "(between rooms)";
    rooms.set(room, (rooms.get(room) || 0) + 1);
  }
  return {
    stats: {
      online: players.length,
      accounts: all.length,
      newToday: all.filter(account => account.createdAt > now() - DAY_SECONDS).length,
      activeToday: all.filter(account => (account.lastLogin || 0) > now() - DAY_SECONDS).length,
      banned: all.filter(account => world.moderation.banRemaining(account) !== 0).length,
      clientErrors: log.recent(0, "[client-error]", Infinity).length,
      reports: reports.openCount(),
      support: support.openCount() + bans.openAppeals(),
      masterpieces: masterpieces.list(masterpieces.PENDING).length,
    },
    server: {
      address: config.baseUrl,
      uptimeSeconds: Math.floor(process.uptime()),
      memoryMb: Math.round(process.memoryUsage().rss / 1048576),
      node: process.version,
      reachableFromOtherMachines: config.isPublic,
      encrypted: config.secureCookies,
      packetLog: config.logPackets,
      customColours: colours.count(),
    },
    players,
    rooms: [...rooms].map(([name, count]) => ({name, count})).sort((a, b) => b.count - a.count),
  };
};

const ownedBy = account => {
  const counted = (entries, nameOf) => {
    const counts = new Map();
    for (const entry of entries) {
      counts.set(entry.def, (counts.get(entry.def) || 0) + 1);
    }
    return [...counts].map(([def, count]) => ({id: def, name: nameOf(def) || `#${def}`, count}))
      .sort((a, b) => a.name.localeCompare(b.name)).slice(0, MAX_OWNED_LISTED);
  };
  const clothingName = def => defpacks.string((defpacks.itemDef(def) || {}).titleStrId);
  const denItemName = def => {
    const item = defpacks.denItemDef(def) || {};
    return defpacks.string(item.nameStrId) || item.abbrName;
  };
  return {
    username: account.username,
    currency: Object.fromEntries(Object.keys(GIFT_CURRENCIES).map(name => [name, account.currency[name] || 0])),
    animals: account.avatars.map(avatar => defpacks.string((defpacks.avatarDef(avatar.type) || {}).titleStrId) || `Animal type ${avatar.type}`),
    pets: account.pets.map(pet => defpacks.string((defpacks.petDef(pet.lBits & 0xFF) || {}).titleStrId) || `Pet type ${pet.lBits & 0xFF}`),
    dens: account.dens.length,
    clothing: counted(account.items, clothingName),
    clothingTotal: account.items.length,
    denItems: counted(account.denItems, denItemName),
    denItemsTotal: account.denItems.length,
    buddies: account.buddies,
    blocked: account.blocked,
    achievements: account.achievements.length,
    adoptAPets: account.adoptAPets.length,
    jamAGrams: account.ecards.length,
    wallPosts: account.wall.posts.length,
    outfits: account.outfits.map(outfit => outfit.name),
    denLayouts: account.denLayouts.map(layout => layout.name),
    hidesBlockedPlayers: account.hideBlocked,
  };
};

// ---- the Debug page: getting into rooms nothing leads to, and seeing what
// sale dates hide. for whoever runs the server to look around with; it gives
// a player nothing they keep.

// rooms found to be unused, unfinished or otherwise out of reach (see
// DISCOVERIES.md), with what they are.
const ROOM_NOTES = {
  "lost_temple_of_zios/room_chamberbase": "reached from a hidden spot on the world map (bottom left, under Appondale); its shop sells the odd den items",
  "appondale/room_museum_ant": "the museum with its Antlers and Tusks exhibit; shown in place of the usual one in even months",
  "first_five/room_firstfive": "the new-player tutorial room",
  "canyon_path/room_main_main": "the Canyons Pathway with the plushie hunt's stand; shown in March and April",
  "activitygeography/room_main": "scene of a geography activity",
  "world_map/room_main": "the world map, as a room",
  "reuseplayer_den/content/pd_burrow/pd_burrow": "a stray copy of the burrow den",
  "holidays_and_celebrations/halloween/room_main": "Halloween room no portal leads to",
  "party/venue_pl_birthday_cake": "earlier copy of a hostable venue; now the Birthday Party",
  "party/venue_pl_vet_science": "earlier copy of a hostable venue; now the Science Party",
  "party/venue_pl_res_bakery": "earlier copy of a hostable venue; now the Bakery Party",
  "party/venue_pl_castle_medieval": "earlier copy of a hostable venue; now the Medieval Party",
  "player_den/room_castle_lrg": "a draft den; sold in the den shops now",
  "player_den/room_main_waterpark3": "a draft den; sold in the den shops now",
  "player_den/room_main_waterpark4": "a draft den; sold in the den shops now",
  "player_den/room_main_epicpalace": "a draft den; sold in the den shops now",
  "riverraceassets/room_main_new": "a newer River Race scene",
  "prototypehorserace/room_main": "prototype of Jamaa Derby",
};
const ROOM_GROUP_NOTES = {
  epic_dens: "the Epic Dens showcase; twenty a day are in the world map's Epic Dens list",
  holidays_and_celebrations: "Halloween rooms: copies of the Phantom Vortex room the lands lead to in October",
  rholidays_and_celebrations: "Halloween rooms, older set",
  adventures: "adventure maps; nothing in them moves",
};

// the theatre's browser (experimental; the server's game.html and client
// 1.3.3): off unless the admin turns it on. what players see in it never
// reaches the server; this only says whether the game offers it.
const THEATRE_BROWSER_SETTING = "theatreBrowser";
const theatreBrowserOn = () => accounts.setting(THEATRE_BROWSER_SETTING) === "on";

const debugState = () => ({
  players: world.players().map(player => player.username).sort((a, b) => a.localeCompare(b)),
  rooms: defpacks.roomPaths().map(roomPath => {
    const group = roomPath.split("/")[0];
    return {path: roomPath, group, note: ROOM_NOTES[roomPath] || ROOM_GROUP_NOTES[group] || ""};
  }).sort((a, b) => a.path.localeCompare(b.path)),
  everythingOnSale: sales.everythingOnSale(),
  theatreBrowser: theatreBrowserOn(),
  worlds: config.shards.length,
  maxWorlds: config.worldNames.length,
});

const debugAct = body => {
  if (body.action === "teleport") {
    const account = accounts.byName(String(body.username || ""));
    if (!account) {
      return {error: "No such account."};
    }
    const problem = world.teleport(account, String(body.room || ""));
    return problem ? {error: `${problem}.`} : {ok: `${account.username} is on the way to ${body.room}.`};
  }
  if (body.action === "everythingOnSale") {
    sales.setEverythingOnSale(body.on === true);
    return {ok: body.on === true
      ? "Sale dates are off: every item shows, for players who start the game from now on."
      : "Sale dates are back on, for players who start the game from now on."};
  }
  if (body.action === "worlds") {
    const count = world.setWorldCount(body.count);
    return count ? {ok: `${count} ${count === 1 ? "world" : "worlds"}: ${config.shards.map(shard => shard.name).join(", ")}.`}
      : {error: "A number of worlds, please."};
  }
  if (body.action === "theatreBrowser") {
    accounts.setSetting(THEATRE_BROWSER_SETTING, body.on === true ? "on" : "off");
    return {ok: body.on === true
      ? "The theatre browser is on, for players on client 1.3.3 or newer once their game page loads again."
      : "The theatre browser is off, once players' game pages load again."};
  }
  return {error: "Unknown debug action."};
};

// what was done about an account's bans, its appeal, and the addresses it
// signed in from (newest first, each once), for banning one of them.
const banRecord = account => {
  const seen = new Map();
  for (const login of account.logins) {
    if (login.address && !seen.has(login.address)) {
      seen.set(login.address, {address: login.address, at: login.at, banned: Boolean(bans.addressBan(login.address)),
        own: limits.isLoopback(login.address)});
    }
  }
  return {history: bans.historyOf(account), appeal: bans.appealOf(account), addresses: [...seen.values()]};
};

// bans an address for good, or lifts that. returns {ok: text} or {error: text}.
const addressAct = body => {
  if (body.action === "ban") {
    const result = staff.banAddress(body.address, body.reason, BY);
    if (result.error) {
      return result;
    }
    const {out} = result;
    return {ok: `${result.ban.key} is banned.${out ? ` ${out} playing from it ${out === 1 ? "was" : "were"} disconnected.` : ""}`};
  }
  if (body.action === "unban") {
    return bans.unbanAddress(String(body.address || ""), BY) ? {ok: "No longer banned."} : {error: "Not banned."};
  }
  return {error: "Unknown action."};
};

// A gift from the panel. gems, diamonds and items arrive as a Jam-A-Gram
// from Animal Jam HQ, whether or not the player is online: an item waits in
// their inbox, gems and diamonds open as a gift popup (lib/ecards.js). the
// rest has no such card and goes straight into the account.
const gift = (account, body) => {
  const name = account.username;
  const text = String(body.text || "").trim().slice(0, MAX_MESSAGE_LENGTH) || "A gift for you!";
  if (Object.hasOwn(GIFT_CURRENCIES, body.kind)) {
    const amount = wholeNumber(body.amount, 1, MAX_GEMS);
    if (amount === null) {
      return {error: "Give a whole number above zero."};
    }
    if (body.kind === "tickets") {
      world.moderation.actions.grantCurrency(account, GIFT_CURRENCIES.tickets, amount);
      return {ok: `${name} was given ${amount.toLocaleString()} tickets.`};
    }
    const problem = world.ecards.sendFromHq(account, text, {kind: body.kind, amount});
    return problem ? {error: `${problem}.`} : {ok: `A Jam-A-Gram with ${amount.toLocaleString()} ${body.kind} is on its way to ${name}.`};
  }
  if (body.kind === "clothing" || body.kind === "den") {
    const color = body.color === undefined || body.color === "" ? undefined : wholeNumber(Number(body.color), 0, 0xFFFFFFFF);
    if (color === null) {
      return {error: "The colour id must be a whole number from 0 to 4294967295."};
    }
    const problem = world.ecards.sendFromHq(account, text, {kind: body.kind, id: body.id, color});
    return problem ? {error: `${problem}.`} : {ok: `A Jam-A-Gram with that item is in ${name}'s inbox.`};
  }
  if (body.kind === "adopt") {
    const ids = body.id === "all" ? defpacks.adoptAPetIds() : [body.id];
    const given = ids.filter(id => adopt.give(account, id)).length;
    accounts.save(account);
    return given ? {ok: `${name} has ${given} more on their Adopt-A-Pet checklist (it shows after their next login).`}
      : {error: "No such Adopt-A-Pet, or they already have it."};
  }
  if (body.kind === "achievement") {
    return achievements.grant(account, body.id) ? {ok: `${name} has that achievement now.`}
      : {error: "No such achievement, or they already have it."};
  }
  return {error: "Unknown kind of gift."};
};

const MAX_QUEST_LEVEL = 100;

// a password for a player who lost theirs: read out or pasted to them, so
// nothing that looks like something else (0 O, 1 l I).
const TEMP_PASSWORD_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const TEMP_PASSWORD_LENGTH = 12;
const randomPassword = () => Array.from({length: TEMP_PASSWORD_LENGTH},
  () => TEMP_PASSWORD_LETTERS[crypto.randomInt(TEMP_PASSWORD_LETTERS.length)]).join("");

const wholeNumber = (value, min, max) => (Number.isInteger(value) && value >= min && value <= max ? value : null);

// returns {ok: text} or {error: text}.
const act = (account, body) => {
  const {actions, PERMANENT} = world.moderation;
  const name = account.username;
  switch (body.action) {
    // the owner locks and unlocks on the account page; this is for when
    // they cannot.
    case "unlock":
      account.locked = false;
      accounts.save(account);
      return {ok: `${name} is unlocked.`};
    case "rename": {
      world.disconnect(account);
      manage.forget(account);
      modpanel.forget(account);
      // the admin may pick any name the server can store and the game can carry.
      const problem = accounts.rename(account, body.newName, true);
      if (problem) {
        return {error: problem === "username_taken" ? "That username is taken."
          : "That name cannot be used: it must not be empty, be over 100 characters, or contain % or control characters."};
      }
      return {ok: `${name} is now called ${account.username}. They log in with the new name and the same password.`, username: account.username};
    }
    // for trying out what a player's card says about when they were last
    // seen: any time in the past, in seconds. it is overwritten the next
    // time they leave the game.
    case "lastSeen": {
      const when = wholeNumber(body.when, 1, Math.floor(Date.now() / 1000));
      if (when === null) {
        return {error: "Pick a date and time in the past."};
      }
      account.lastSeen = when;
      accounts.save(account);
      return {ok: `${name} was last seen ${new Date(when * 1000).toISOString().replace("T", " ").slice(0, 16)} UTC, as far as the game knows.`};
    }
    // the adventure level of the animal they are using.
    case "level": {
      const level = wholeNumber(body.level, 0, MAX_QUEST_LEVEL);
      if (level === null) {
        return {error: `0 to ${MAX_QUEST_LEVEL}.`};
      }
      world.setQuestLevel(account, level);
      return {ok: `${name}'s animal is level ${level}.`};
    }
    // their badges (lib/badges.js): the whole set at once.
    case "badges": {
      if (!Array.isArray(body.badges) || !body.badges.every(badges.known)) {
        return {error: "Unknown badge."};
      }
      badges.set(account, body.badges);
      accounts.save(account);
      world.checkNameTag(account);
      return {ok: account.badges.length ? `${name} has: ${badges.of(account).map(badge => badge.label).join(", ")}.` : `${name} has no badges.`};
    }
    // their linked Discord account (lib/discord.js), taken off.
    case "discord": {
      // only taken off: a player links their own (lib/discord.js)
      if (String(body.name || "") !== "") {
        return {error: "Players link their Discord themselves, on the account page."};
      }
      return discordLinks.unlink(account) ? {ok: "Discord unlinked."} : {error: `${name} has no Discord linked.`};
    }
    // their bio, which they otherwise write on the account page; empty
    // takes it off.
    case "bio": {
      const bio = badges.bioText(body.text);
      if (bio === null) {
        return {error: `At most ${badges.MAX_BIO} characters on ${badges.MAX_BIO_LINES} lines.`};
      }
      account.bio = bio;
      accounts.save(account);
      return {ok: bio ? "Bio set." : "Bio cleared."};
    }
    case "ban": {
      const hours = wholeNumber(body.hours, 0, MAX_BAN_HOURS);
      if (hours === null) {
        return {error: "Give the ban a whole number of hours, or 0 for permanent."};
      }
      actions.ban(account, hours === 0 ? PERMANENT : hours * 3600, body.reason, BY);
      // out of the account page as well. (They may sign in to it again: it
      // shows them the ban and little else, lib/manage.js.) Saved sign-ins
      // are left: nothing takes one while the ban lasts but the client's
      // question about the ban itself (lib/admin.js).
      manage.forget(account);
      return {ok: hours === 0 ? `${name} is banned permanently.` : `${name} is banned for ${hours} hours.`};
    }
    case "banReason":
      return actions.banReason(account, body.reason, BY) ? {ok: "Reason saved."} : {error: `${name} is not banned.`};
    case "unban":
      actions.unban(account, BY);
      return {ok: `${name} is no longer banned.`};
    case "kick":
      return actions.kick(account) ? {ok: `${name} was disconnected.`} : {error: `${name} is not online.`};
    // every computer they signed in from lately (lib/devices.js).
    case "banDevices":
      return staff.banDevices(account, body.reason, BY);
    case "unbanDevices":
      return staff.unbanDevicesOf(account, BY);
    // counted in hours; the game's own notice counts minutes.
    case "silence": {
      const hours = wholeNumber(body.hours, 0, MAX_BAN_HOURS);
      if (hours === null) {
        return {error: "Give a whole number of hours, or 0 for until lifted."};
      }
      actions.silence(account, hours === 0 ? PERMANENT : hours * 3600);
      return {ok: hours === 0 ? `${name} cannot chat until you lift it.` : `${name} cannot chat for ${hours} hours.`};
    }
    // A moderator may use the moderator panel (lib/modpanel.js), with this
    // account's password and its 2FA, which it has to have.
    // (the older on/off switch; "role" below is the full one.)
    case "moderator":
      roles.setRole(account, body.on === true ? "moderator" : null);
      if (body.on !== true) {
        modpanel.forget(account);
      }
      accounts.save(account);
      return {ok: body.on === true
        ? `${name} is a moderator.${totp.isOn(account) ? "" : " They have no 2FA yet and cannot sign in to the moderator panel until they turn it on."}`
        : `${name} is no longer a moderator.`};
    // A staff role (lib/roles.js): helper, moderator, admin, or none. What
    // each allows is listed under "GET /admin/api/roles".
    case "role": {
      const role = body.role === null || body.role === "" || body.role === "none" ? null : String(body.role);
      if (!roles.setRole(account, role)) {
        return {error: `No such role. Roles: ${Object.keys(roles.ROLES).join(", ")}, or none.`};
      }
      if (role === null) {
        modpanel.forget(account);
      }
      accounts.save();
      world.refreshStaff(account);
      if (role === null) {
        return {ok: `${name} has no staff role.`};
      }
      const label = roles.ROLES[role].label.toLowerCase();
      return {ok: `${name} is now ${/^[aeiou]/.test(label) ? "an" : "a"} ${label}.${totp.isOn(account) ? "" : " They have no 2FA yet, so their role does nothing until they turn it on."}`};
    }
    // one staff member's own permissions, beyond their role's or taken from
    // it ({grants: [...], denies: [...]}).
    case "permissions": {
      if (!roles.roleOf(account)) {
        return {error: `${name} has no staff role: give them one first.`};
      }
      roles.setAccountPermissions(account, body.grants, body.denies);
      accounts.save();
      world.refreshStaff(account);
      modlog.record("admin", "permissions changed", account.username,
        `+${(account.permGrants || []).join(",") || "none"} -${(account.permDenies || []).join(",") || "none"}`);
      return {ok: `${name}'s permissions are saved.`};
    }
    // guide: lets the player log in as one (lib/accounts.js setLoginChoices).
    // it shows from their next login.
    // lost access: a new random password, shown here once. it signs them out
    // everywhere (lib/accounts.js setPassword); with `twoStepOff` their 2FA
    // goes as well, for a lost authenticator.
    case "tempPassword": {
      let password = randomPassword();
      // the account rules want a capital, a small letter and a digit, and no
      // common word or the username in it: draw again until it has them.
      while (accounts.setPassword(account, password)) {
        password = randomPassword();
      }
      const twoStepOff = body.twoStepOff === true && totp.isOn(account);
      if (twoStepOff) {
        totp.turnOff(account);
      }
      accounts.save(account);
      world.disconnect(account);
      manage.forget(account);
      modpanel.forget(account);
      modlog.record("admin", "temporary password set", account.username, twoStepOff ? "2FA turned off" : "");
      return {ok: `${name}'s password is now ${password}${twoStepOff ? " and their 2FA is off" : ""}. Ask them to change it on their account page.`, password};
    }
    case "guide": {
      const on = body.on === true;
      account.guideGiven = on;
      accounts.save(account);
      modlog.record("admin", on ? "made a guide" : "no longer a guide", account.username, "");
      return {ok: on ? `${name} is a guide from their next login.` : `${name} is no longer a guide from their next login.`};
    }
    case "adminDashboardAccess": {
      const on = body.on === true;
      if (on && !account.discordId) {
        return {error: `${name} must link their Discord account before it can be allowed.`};
      }
      account.adminDashboardAccess = on;
      accounts.save(account);
      modlog.record("admin", on ? "admin dashboard access given" : "admin dashboard access removed", account.username, account.discord || "");
      return {ok: on ? `${name} may now sign in to this dashboard with their linked Discord account.` : `${name}'s Discord dashboard access was removed.`};
    }
    case "rejectName":
      actions.rejectName(account, BY);
      manage.forget(account);
      modpanel.forget(account);
      return {ok: `${name} is signed out and picks a new name at the next sign-in.`};
    case "acceptName":
      actions.acceptName(account);
      return {ok: `${name} keeps the name.`};
    case "unsilence":
      actions.silence(account, 0);
      return {ok: `${name} can chat again.`};
    case "message": {
      const text = String(body.text || "").trim().slice(0, MAX_MESSAGE_LENGTH);
      if (!text) {
        return {error: "The message is empty."};
      }
      return actions.message(account, text) ? {ok: `Message shown to ${name}.`} : {error: `${name} is not online.`};
    }
    case "clearDen":
      actions.clearDen(account);
      return {ok: `Everything in ${name}'s den went back to their inventory.`};
    case "clearWallPosts": {
      const {posts, replies, walls} = actions.clearWallPosts(account);
      if (!posts) {
        return {error: `${name} has no posts on any Jammer Wall.`};
      }
      const text = `${posts} wall ${posts === 1 ? "post" : "posts"} by ${name} removed from ${walls} ${walls === 1 ? "wall" : "walls"}`
        + `${replies ? ` (with ${replies} ${replies === 1 ? "reply" : "replies"} to them)` : ""}.`;
      return {ok: text, detail: `${posts} posts, ${replies} replies, ${walls} walls`};
    }
    case "gems": {
      const amount = wholeNumber(body.amount, -MAX_GEMS, MAX_GEMS);
      if (amount === null) {
        return {error: "Give a whole number of gems (negative to take away)."};
      }
      actions.grantGems(account, amount);
      return {ok: `${name} now has ${account.currency.gems} gems.`};
    }
    case "gift":
      return gift(account, body);
    case "delete":
      world.disconnect(account);
      manage.forget(account);
      modpanel.forget(account);
      erase(account);
      return {ok: `${name} was deleted.`};
    default:
      return {error: "Unknown action."};
  }
};

const PAGE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; media-src 'self'; font-src 'self'; "
    + "form-action 'none'; frame-ancestors 'none'; base-uri 'none'",
};

// A request that changes something must come from the panel's own page.
const sameOrigin = limits.originAllowed;

const tooManyFailures = address => failuresByAddress.blocked(address);
const recordFailure = address => failuresByAddress.record(address);

// `from` is {address, local}; `web` is {send, readJson} from lib/http.js.
const handle = async (req, res, url, from, web) => {
  for (const [name, value] of Object.entries(PAGE_HEADERS)) {
    res.setHeader(name, value);
  }
  const reply = (status, body) => web.send(res, status, body);
  const route = `${req.method} ${url.pathname.replace(/\/$/, "") || "/admin"}`;

  if (route === "GET /admin") {
    web.send(res, 200, await stats.withView(await fs.promises.readFile(path.join(config.publicDir, "admin.html"))), "text/html; charset=utf-8");
    return;
  }
  // Discord redirects do not carry the normal Strict admin cookie, so their
  // own short-lived nonce cookie is Lax and scoped to this callback alone.
  if (route === "GET /admin/discord/login") {
    if (!hasPassword() || !discordLinks.linking()) {
      res.writeHead(302, {Location: "/dashboard/admin?discord=off"});
      res.end();
      return;
    }
    const {url: to, nonce} = discordLinks.startAdmin();
    res.setHeader("Set-Cookie", discordCookie(nonce, 600));
    res.writeHead(302, {Location: to});
    res.end();
    return;
  }
  if (route === "GET /admin/discord/callback") {
    const nonce = (new RegExp(`(?:^|;\\s*)${DISCORD_COOKIE}=([0-9a-f]{48})(?:;|$)`).exec(req.headers.cookie || "") || [])[1];
    const result = url.searchParams.get("error") ? {error: "cancelled"}
      : await discordLinks.finishAdmin(url.searchParams.get("state"), nonce, url.searchParams.get("code"));
    // Discord has said who this is; the panel opens once that account's 2FA
    // code is given too (POST /admin/api/discord/code).
    if (result.ok && !discordAdmin(result.account)) {
      result.ok = false;
      result.error = totp.isOn(result.account) ? "denied" : "twostep";
    }
    const cookies = [discordCookie("", 0)];
    if (result.ok) {
      for (const [hash, pending] of pendingDiscord) {
        if (pending.expiry < Date.now()) {
          pendingDiscord.delete(hash);
        }
      }
      const token = crypto.randomBytes(24).toString("hex");
      pendingDiscord.set(sha256(token), {id: result.account.id, expiry: Date.now() + PENDING_MINUTES * 60000, tries: 0});
      cookies.push(pendingCookieHeader(token, PENDING_MINUTES * 60));
    }
    res.setHeader("Set-Cookie", cookies);
    res.writeHead(302, {Location: `/dashboard/admin?discord=${result.ok ? "code" : result.error}`});
    res.end();
    return;
  }
  if (req.method === "POST" && !sameOrigin(req)) {
    reply(403, {error: "forbidden"});
    return;
  }
  const body = req.method === "POST" ? await web.readJson(req) : {};

  switch (route) {
    case "GET /admin/api/state":
      reply(200, {needsSetup: !hasPassword(), needsSetupCode: !from.local, signedIn: signedIn(req), discordLogin: discordLinks.linking()});
      return;

    // choosing the first password. whoever is at the server's own machine may;
    // anyone else must give the code the server printed when it started.
    case "POST /admin/api/setup": {
      if (hasPassword()) {
        reply(409, {error: "The admin password has already been chosen."});
        return;
      }
      if (tooManyFailures(from.key)) {
        reply(429, {error: "Too many attempts. Try again in a few minutes."});
        return;
      }
      setupCode = setupCode || crypto.randomBytes(5).toString("hex");
      const code = String(body.code || "").trim().toLowerCase();
      if (!from.local && (code.length !== setupCode.length || !crypto.timingSafeEqual(Buffer.from(code), Buffer.from(setupCode)))) {
        recordFailure(from.key);
        reply(403, {error: "That is not the setup code. It is in the server's output, on the line starting [admin]."});
        return;
      }
      if (!passwordAcceptable(body.password)) {
        reply(400, {error: `Choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`});
        return;
      }
      storePassword(body.password);
      setupCode = null;
      console.log(`[admin] admin password chosen from ${logText(from.address)}`);
      signIn(res);
      reply(200, {ok: true});
      return;
    }

    case "POST /admin/api/login": {
      if (tooManyFailures(from.key)) {
        reply(429, {error: "Too many attempts. Try again in a few minutes."});
        return;
      }
      if (!hasPassword() || !passwordMatches(body.password)) {
        recordFailure(from.key);
        console.log(`[admin] failed sign-in from ${logText(from.address)}`);
        reply(401, {error: "Wrong password."});
        return;
      }
      console.log(`[admin] signed in from ${logText(from.address)}`);
      signIn(res);
      reply(200, {ok: true});
      return;
    }

    // the second half of a Discord sign-in: the linked account's 2FA code.
    case "POST /admin/api/discord/code": {
      if (tooManyFailures(from.key)) {
        reply(429, {error: "Too many attempts. Try again in a few minutes."});
        return;
      }
      const token = pendingToken(req);
      const hash = token ? sha256(token) : null;
      const pending = hash ? pendingDiscord.get(hash) : null;
      const account = pending && pending.expiry > Date.now() ? accounts.byId(pending.id) : null;
      if (!discordAdmin(account)) {
        if (hash) {
          pendingDiscord.delete(hash);
        }
        res.setHeader("Set-Cookie", pendingCookieHeader("", 0));
        reply(401, {error: "The Discord sign-in expired. Sign in with Discord again.", expired: true});
        return;
      }
      if (!totp.verify(account, String(body.code || ""))) {
        recordFailure(from.key);
        console.log(`[admin] wrong 2FA code after Discord for ${logText(account.username)} from ${logText(from.address)}`);
        pending.tries++;
        if (pending.tries >= PENDING_TRIES) {
          pendingDiscord.delete(hash);
          res.setHeader("Set-Cookie", pendingCookieHeader("", 0));
          reply(401, {error: "Too many wrong codes. Sign in with Discord again.", expired: true});
          return;
        }
        reply(401, {error: "Wrong code."});
        return;
      }
      pendingDiscord.delete(hash);
      signIn(res, [pendingCookieHeader("", 0)]);
      console.log(`[admin] ${logText(account.username)} signed in with Discord and a code from ${logText(from.address)}`);
      reply(200, {ok: true});
      return;
    }

    case "POST /admin/api/logout":
      signOut(req, res);
      reply(200, {ok: true});
      return;
  }

  if (!signedIn(req)) {
    reply(401, {error: "Sign in first."});
    return;
  }

  // what players made that waits (the moderator panel's Review), and the
  // admin's switches for the Item Maker: {enabled, approval}.
  if (url.pathname === "/admin/api/review" || url.pathname === "/admin/api/item-switches") {
    const done = (result, action, target = "", detail = "") => {
      if (result.ok) {
        modlog.record("admin", action, target, result.detail || detail);
      }
      reply(result.ok ? 200 : 400, result.ok ? {ok: result.ok} : {error: result.error});
    };
    if (route === "POST /admin/api/item-switches") {
      const flag = value => (value === undefined ? undefined : value === true);
      playerItems.setSwitches({enabled: flag(body.enabled), approval: flag(body.approval), artApproval: flag(body.artApproval)});
      const pictures = playerItems.pictureWaits() ? "pictures wait for a moderator" : "pictures are shown at once";
      done({ok: `The Item Maker is ${playerItems.enabled() ? "on" : "off"}; new items ${playerItems.approvalOn() ? "wait for a moderator first" : "are in the game at once"}; ${pictures}.`},
        "item maker settings", "", `${playerItems.enabled() ? "on" : "off"}, approval ${playerItems.approvalOn() ? "on" : "off"}, pictures ${playerItems.pictureWaits() ? "wait" : "at once"}`);
      return;
    }
    modpanel.reviewRoutes(route.replace(" /admin/api/", " "), body, reply, done, "admin", "/admin/api/itemart");
    return;
  }
  // custom items (lib/customitems.js): the moderator panel's pages, the
  // admin written down as "admin", and free to take from anyone.
  if (url.pathname.startsWith("/admin/api/items")) {
    const done = (result, action, target = "", detail = "") => {
      if (result.ok) {
        modlog.record("admin", action, target, result.detail || detail);
      }
      reply(result.ok ? 200 : 400, result.ok ? {ok: result.ok} : {error: result.error});
    };
    modpanel.itemRoutes(route.replace(" /admin/api/", " "), url, body, reply, done, {username: "admin", artBase: "/admin/api/itemart", mayTake: () => true});
    return;
  }

  switch (route) {
    case "GET /admin/api/overview":
      reply(200, overview());
      return;

    case "GET /admin/api/discord":
      reply(200, discordBot.dashboardStatus());
      return;

    case "POST /admin/api/discord/status": {
      const statusCard = discordBot.setStatusSettings({title: body.title, note: body.note, banner: body.banner});
      if (statusCard.error) {
        reply(400, {error: statusCard.error});
        return;
      }
      modlog.record("admin", "Discord public status card changed", "", `title: ${statusCard.title}, banner: ${statusCard.banner || "none"}`);
      reply(200, {ok: "Status-card text saved. Use Publish now to update Discord.", statusCard});
      return;
    }

    case "POST /admin/api/discord/status/publish": {
      const result = await discordBot.publishStatus();
      if (result.ok) {
        modlog.record("admin", "Discord public status card published");
      }
      reply(result.ok ? 200 : 400, result);
      return;
    }

    case "POST /admin/api/discord/config": {
      const result = discordBot.updateDashboardConfig(body);
      if (result.ok) {
        modlog.record("admin", "Discord bot routing settings changed");
      }
      reply(result.ok ? 200 : 400, result);
      return;
    }

    case "POST /admin/api/discord/security": {
      const result = discordBot.updateSecuritySettings(body);
      if (result.ok) {
        modlog.record("admin", "Discord security settings changed");
      }
      reply(result.ok ? 200 : 400, result);
      return;
    }

    case "POST /admin/api/discord/community": {
      const result = discordBot.updateCommunitySettings(body);
      if (result.ok) modlog.record("admin", "Discord community and ticket settings changed");
      reply(result.ok ? 200 : 400, result);
      return;
    }

    case "POST /admin/api/discord/control": {
      const action = String(body.action || "");
      const result = await discordBot.control(action);
      if (result.ok) {
        modlog.record("admin", `Discord bot ${action}`);
      }
      reply(result.ok ? 200 : 400, result);
      return;
    }

    // a page of accounts by name (lib/staff.js says in what order), never
    // all of them: with thousands, sending every one every few seconds
    // slowed the page and the game alike.
    case "GET /admin/api/accounts": {
      const playing = new Map(world.players().map(player => [player.username, player.room || "(between rooms)"]));
      const filter = url.searchParams.get("filter");
      const keep = filter === "online" ? (account, online) => online.has(account.username)
        : filter === "banned" ? account => world.moderation.banRemaining(account) !== 0 : () => true;
      const {found, total} = staff.findAccounts(url.searchParams.get("q"), keep, MAX_LISTED);
      reply(200, {accounts: found.map(account => accountRow(account, playing)), total, badges: badges.BADGES});
      return;
    }

    // one account's row, for the one that is open whatever the list shows.
    case "GET /admin/api/account": {
      const account = accounts.byName(url.searchParams.get("username") || "");
      const playing = new Map(world.players().map(player => [player.username, player.room || "(between rooms)"]));
      reply(account ? 200 : 404, account ? {account: accountRow(account, playing), badges: badges.BADGES} : {error: "No such account."});
      return;
    }

    // the graphs (lib/stats.js): the last `days` days, by the viewer's clock.
    case "GET /admin/api/stats":
      reply(200, stats.report(Number(url.searchParams.get("days")), Number(url.searchParams.get("offset"))));
      return;

    // who signed in from an address, or from addresses starting so.
    case "GET /admin/api/address-search": {
      const found = staff.byAddress(url.searchParams.get("q"));
      reply(found.error ? 400 : 200, found);
      return;
    }
    // who signed in from a computer, by one of its ids or the start of one.
    case "GET /admin/api/device-search": {
      const found = staff.byDevice(url.searchParams.get("q"));
      reply(found.error ? 400 : 200, found.error ? found : {players: found.players.map(entry => ({...entry,
        online: Boolean(world.findOnline(entry.username))}))});
      return;
    }

    // what players typed, sent and posted (lib/chatlog.js), as the moderators see it.
    case "GET /admin/api/chat": {
      const params = url.searchParams;
      const lines = chatlog.search({username: (params.get("username") || "").trim().slice(0, 100), room: (params.get("room") || "").trim().slice(0, 100),
        text: (params.get("text") || "").trim().slice(0, 100), kind: params.get("kind") || "", direction: params.get("direction") || "", until: Number(params.get("until")) || 0,
        before: Number(params.get("before")) || 0});
      reply(200, {lines, more: lines.length === chatlog.PAGE, days: config.chatLogDays});
      return;
    }
    case "GET /admin/api/chat/around": {
      const found = chatlog.around(url.searchParams.get("id"));
      reply(found ? 200 : 404, found || {error: "No such line."});
      return;
    }

    case "GET /admin/api/logs": {
      const lines = log.recent(Number(url.searchParams.get("after")) || 0, (url.searchParams.get("filter") || "").slice(0, 100));
      reply(200, {lines, newest: log.count()});
      return;
    }

    case "POST /admin/api/account": {
      const account = accounts.byName(String(body.username || ""));
      if (!account) {
        reply(404, {error: "No such account."});
        return;
      }
      const result = act(account, body);
      if (result.ok) {
        console.log(`[admin] ${logText(body.action)} on "${logText(account.username)}"`);
        // in the record beside the moderators', for the player's timeline.
        if (!["password", "lastSeen", "level"].includes(body.action)) {
          modlog.record(BY, body.action, account.username, result.detail || "");
        }
      }
      reply(result.ok ? 200 : 400, result);
      return;
    }

    case "GET /admin/api/owned": {
      const account = accounts.byName(url.searchParams.get("username") || "");
      reply(account ? 200 : 404, account ? ownedBy(account) : {error: "No such account."});
      return;
    }

    case "GET /admin/api/bans":
      reply(200, {accounts: staff.disciplined(), addresses: bans.addressBans(), devices: devices.list(), alerts: devices.alerts()});
      return;

    // A device ban lifted (lib/devices.js).
    case "POST /admin/api/device": {
      const result = staff.unbanDevices(body.id, BY);
      if (result.ok) {
        console.log(`[admin] device ban ${logText(Number(body.id))} lifted`);
        modlog.record(BY, "hardware ban lifted", result.username || "");
      }
      reply(result.ok ? 200 : 400, result);
      return;
    }

    // other accounts the same person may have, their story, and who the
    // chat filter stopped most this week (lib/staff.js, lib/chatlog.js).
    case "GET /admin/api/alts": {
      const account = accounts.byName(url.searchParams.get("username") || "");
      reply(account ? 200 : 404, account ? {alts: staff.altsOf(account), ids: devices.idsFor(account)} : {error: "No such account."});
      return;
    }
    case "GET /admin/api/timeline": {
      const account = accounts.byName(url.searchParams.get("username") || "");
      reply(account ? 200 : 404, account ? {events: staff.timelineOf(account)} : {error: "No such account."});
      return;
    }
    case "GET /admin/api/filterhits":
      reply(200, {players: chatlog.mostStopped(7, 50)});
      return;

    // what waits, for the tabs and the page's title, on every page.
    case "GET /admin/api/counts":
      reply(200, {reports: reports.openCount(), support: support.openCount() + bans.openAppeals(), masterpieces: masterpieces.list(masterpieces.PENDING).length});
      return;

    // who may use the moderator panel, and what each did there.
    // the staff roles and what each may do.
    case "GET /admin/api/roles":
      reply(200, {roles: Object.entries(roles.ROLES).map(([id, role]) => ({id, label: role.label, rank: role.rank, permissions: roles.rolePermissions(id),
        defaults: role.permissions, changed: roles.roleChanged(id)})), permissions: roles.PERMISSIONS});
      return;
    // a role's permissions changed ({role, permissions: [...]}), or back to
    // its defaults ({role, reset: true}). its staff who are playing are told.
    case "POST /admin/api/roles": {
      const role = String(body.role || "");
      if (!roles.setRolePermissions(role, body.reset === true ? null : Array.isArray(body.permissions) ? body.permissions : [])) {
        reply(400, {error: "No such role."});
        return;
      }
      for (const player of accounts.all().filter(account => roles.roleOf(account) === role)) {
        world.refreshStaff(player);
      }
      console.log(`[admin] permissions of the ${logText(role)} role ${logText(body.reset === true ? "reset" : "changed")}`);
      modlog.record("admin", body.reset === true ? "role permissions reset" : "role permissions changed", "", `${role}: ${roles.rolePermissions(role).join(", ")}`);
      reply(200, {ok: `${roles.ROLES[role].label}: ${body.reset === true ? "back to its defaults" : "saved"}.`});
      return;
    }
    case "GET /admin/api/moderators":
      reply(200, {moderators: modpanel.moderators(), log: modlog.recent()});
      return;

    case "GET /admin/api/banrecord": {
      const account = accounts.byName(url.searchParams.get("username") || "");
      reply(account ? 200 : 404, account ? banRecord(account) : {error: "No such account."});
      return;
    }

    case "POST /admin/api/address": {
      const result = addressAct(body);
      if (result.ok) {
        console.log(`[admin] address ${logText(body.action)}: ${logText(limits.key(body.address))}`);
      }
      reply(result.ok ? 200 : 400, result);
      return;
    }

    case "GET /admin/api/messages":
      reply(200, {motd: world.motd(), rooms: world.rooms()});
      return;

    case "GET /admin/api/debug":
      reply(200, debugState());
      return;

    case "POST /admin/api/debug": {
      const result = debugAct(body);
      if (result.ok) {
        console.log(`[admin] debug: ${logText(body.action)} ${logText(body.action === "teleport" ? `${body.username} -> ${body.room}` : body.on === true)}`);
      }
      reply(result.ok ? 200 : 400, result);
      return;
    }

    // codes for the game's Redeem Code window (lib/codes.js), each giving
    // an item, gems or diamonds
    case "GET /admin/api/codes":
      reply(200, {codes: codes.list(), kinds: codes.KINDS});
      return;

    case "POST /admin/api/codes": {
      const result = body.action === "remove"
        ? (codes.remove(body.code) ? {ok: "Code deleted."} : {error: "No such code."})
        : codes.create(body);
      if (result.ok) {
        console.log(`[admin] redemption code ${logText(body.action === "remove" ? "deleted" : "made")}: ${logText(String(body.code || "").toUpperCase())}`);
      }
      reply(result.ok ? 200 : 400, result);
      return;
    }

    // the message everyone is shown when they arrive; empty for none.
    case "POST /admin/api/motd":
      world.setMotd(String(body.text || ""));
      console.log("[admin] message of the day changed");
      reply(200, {ok: world.motd() ? "Players will see this when they arrive." : "There is no message of the day now.", motd: world.motd()});
      return;

    // A message for everyone playing, or everyone in one room.
    case "POST /admin/api/announce": {
      const text = String(body.text || "").trim().slice(0, MAX_ANNOUNCEMENT);
      if (!text) {
        reply(400, {error: "The message is empty."});
        return;
      }
      const reached = world.announce(text, body.room ? String(body.room) : null);
      console.log(`[admin] announcement to ${logText(body.room ? `room ${body.room}` : "everyone")} (${logText(reached)} players)`);
      reply(200, {ok: reached === 1 ? "Shown to 1 player." : `Shown to ${reached} players.`});
      return;
    }

    // paintings players made masterpieces of (lib/masterpieces.js): the
    // ones waiting to be looked at, and the ones on show.
    case "GET /admin/api/masterpieces":
      reply(200, {
        review: masterpieces.needsReview(),
        ...masterpieces.listsFor(url.searchParams.get("creator")),
        waitingCount: masterpieces.list(masterpieces.PENDING).length,
      });
      return;

    case "GET /admin/api/masterpiece": {
      const picture = masterpieces.image(url.searchParams.get("id") || "");
      if (!picture) {
        reply(404, {error: "No such painting."});
        return;
      }
      res.setHeader("Cache-Control", "private, max-age=3600");
      web.send(res, 200, picture, "image/jpeg");
      return;
    }

    case "POST /admin/api/masterpiece": {
      const id = String(body.id || "");
      let result;
      if (body.action === "review") {
        masterpieces.setNeedsReview(body.on === true);
        result = {ok: body.on === true ? "New masterpieces wait here until you approve them."
          : "New masterpieces are approved as they are made. Ones already waiting still wait."};
      }
      else if (body.action === "approve") {
        result = world.approveMasterpiece(id, "admin") ? {ok: "Approved. Its maker has been told and can hang it now."} : {error: "No such painting waiting."};
      }
      else if (body.action === "reject" || body.action === "remove") {
        result = world.removeMasterpiece(id)
          ? {ok: "Removed for good. Its maker has been told and given a Masterpiece Token."} : {error: "No such painting."};
      }
      else {
        result = {error: "Unknown action."};
      }
      if (result.ok) {
        console.log(`[admin] masterpiece ${logText(body.action)} ${logText(id || body.on === true)}`);
      }
      reply(result.ok ? 200 : 400, result);
      return;
    }

    case "GET /admin/api/reports":
      reply(200, {reports: reports.list(url.searchParams.get("handled") === "1"), open: reports.openCount()});
      return;

    case "POST /admin/api/report":
      if (!reports.markHandled(Number(body.id))) {
        reply(404, {error: "No such report waiting."});
        return;
      }
      reply(200, {ok: "Marked as dealt with."});
      return;

    // what players sent from the account page: requests for a new username,
    // and feedback and bug reports (lib/support.js).
    case "GET /admin/api/support": {
      const handled = url.searchParams.get("handled") === "1";
      reply(200, {names: support.nameRequests(handled), feedback: support.feedback(handled), appeals: staff.appealsFor(handled),
        open: support.openCount() + bans.openAppeals()});
      return;
    }

    case "POST /admin/api/support": {
      let result;
      if (body.action === "appealApprove" || body.action === "appealDeny") {
        result = staff.answerAppeal(body.id, body.action === "appealApprove", body.reply, BY);
      }
      else if (body.action === "read") {
        result = support.markFeedbackRead(body.id) ? {ok: "Marked as read."} : {error: "No such message waiting."};
      }
      else if (body.action === "approve" || body.action === "deny") {
        result = staff.answerNameRequest(body.id, body.action === "approve");
      }
      else {
        result = {error: "Unknown action."};
      }
      if (result.ok) {
        console.log(`[admin] support: ${logText(body.action)} ${logText(Number(body.id))}`);
      }
      reply(result.ok ? 200 : 400, result);
      return;
    }

    case "POST /admin/api/password": {
      if (!passwordMatches(body.current)) {
        reply(403, {error: "The current password is wrong."});
        return;
      }
      if (!passwordAcceptable(body.password)) {
        reply(400, {error: `Choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`});
        return;
      }
      storePassword(body.password);
      sessions.clear();
      signIn(res);
      console.log("[admin] admin password changed");
      reply(200, {ok: true});
      return;
    }

    default:
      reply(404, {error: "not_found"});
  }
};

module.exports = {load, handle, signedIn, theatreBrowserOn, PASSWORD_SETTING};
