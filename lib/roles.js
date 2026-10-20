"use strict";

const accounts = require("./accounts.js");
const totp = require("./totp.js");

// staff roles, and what each may do. an account holds at most one role
// (`role` on the account), set by the admin. an account from before roles
// that is only marked `moderator` counts as a moderator, so nothing that
// worked before stops working.
//
// a role is a list of permissions, and every staff action checks the one it
// needs, in the moderator panel (lib/modpanel.js) and in the game
// (lib/commands.js) alike. a higher role holds everything a lower one does.
// staff never act on staff of their own rank or above: that is for someone
// higher up, and for the admin in the end.

const PERMISSIONS = {
  "server.view": "see read-only server health in the moderator panel",
  "player.view": "see players, chat, reports, requests, bans and paintings in the moderator panel, and keep notes on players (!note, !notes)",
  "staff.list": "see which staff are online (!staff)",
  "player.warn": "warn a player, take a warning back, send them a message and mark a report dealt with (!warn, !unwarn, !warnings, !message)",
  "player.goto": "go to the room a player is in (!goto)",
  "chat.silence": "silence and unsilence a player (!silence)",
  "player.kick": "disconnect a player (!kick)",
  "player.summon": "bring a player to the room you are in (!summon)",
  "staff.invisible": "go unseen in rooms, as the game's moderators could (!invisible)",
  "player.ban": "ban, unban, change a ban's reason and answer ban appeals",
  "player.names": "reject or accept a name, answer requests for a new one, clear a bio, remove a player's Jammer Wall posts",
  "address.ban": "ban the address a player last signed in from, or the computers they use, and lift those bans",
  "items.approve": "approve or turn away the items and pictures players make, when the admin has asked for that",
  "items.restrict": "stop a clothing item from being worn by selected animal types",
  "items.create": "make new items from the game's art, change and delete them, lock items out of the item finder and take items from players (!item, !lock, !unlock, !locked, !take)",
  "room.effects": "run temporary room-wide size and colour effects (!roomfx)",
  "theater.control": "play or stop a YouTube video for everyone in the theatre",
  "music.upload": "upload MP3s as den music tracks, and delete those uploaded (the Music page)",
};

const HELPER = ["server.view", "player.view", "staff.list", "player.warn", "player.goto", "chat.silence"];
const MODERATOR = [...HELPER, "player.kick", "player.summon", "staff.invisible", "player.ban", "player.names", "address.ban", "items.approve", "items.restrict", "theater.control"];
const ADMIN = [...MODERATOR, "items.create", "room.effects", "music.upload"];
// a developer makes things, and moderates nobody.
const DEVELOPER = ["server.view", "staff.list", "items.create", "room.effects", "theater.control"];

const ROLES = {
  developer: {rank: 1, label: "Developer", permissions: DEVELOPER},
  helper: {rank: 1, label: "Helper", permissions: HELPER},
  moderator: {rank: 2, label: "Moderator", permissions: MODERATOR},
  admin: {rank: 3, label: "Admin", permissions: ADMIN},
};

// the role an account holds, or null.
const roleOf = account => {
  if (!account) {
    return null;
  }
  if (Object.hasOwn(ROLES, account.role)) {
    return account.role;
  }
  return account.moderator ? "moderator" : null;
};

const rankOf = account => {
  const role = roleOf(account);
  return role ? ROLES[role].rank : 0;
};

// may this account act as staff at all right now? as for the moderator
// panel: a role, 2FA turned on, not locked and not banned. `banned` says
// whether the account is banned (passed in, so that this file needs nothing
// of the world's).
const isActiveStaff = (account, banned = false) =>
  Boolean(roleOf(account) && totp.isOn(account) && !account.locked && !banned);

// what each role may do can be changed by the admin (the admin panel's
// Moderators page): kept as a setting, {role: [permission, ...]}, a role
// not in it holding its defaults above. one staff member can be given more
// than their role, or less (`permGrants`, `permDenies` on the account, from
// their page in the admin panel). a role and 2FA are still what makes
// someone staff at all (isActiveStaff).
const ROLE_SETTING = "rolePermissions";
let roleOverrides = null;

const overrides = () => {
  if (!roleOverrides) {
    try {
      const saved = JSON.parse(accounts.setting(ROLE_SETTING) || "{}");
      roleOverrides = saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
    }
    catch {
      roleOverrides = {};
    }
  }
  return roleOverrides;
};

// the permissions in a list that are ones, each once
const known = list => [...new Set(Array.isArray(list) ? list.map(String) : [])].filter(permission => Object.hasOwn(PERMISSIONS, permission));

const rolePermissions = role => (Object.hasOwn(overrides(), role) ? known(overrides()[role]) : [...ROLES[role].permissions]);

const roleChanged = role => Object.hasOwn(overrides(), role);

// a role's permissions, or its defaults again (`list` null). false for no such role.
const setRolePermissions = (role, list) => {
  if (!Object.hasOwn(ROLES, role)) {
    return false;
  }
  const changed = {...overrides()};
  if (list === null) {
    delete changed[role];
  }
  else {
    changed[role] = known(list);
  }
  accounts.setSetting(ROLE_SETTING, JSON.stringify(changed));
  roleOverrides = changed;
  return true;
};

const permissionsOf = account => {
  const role = roleOf(account);
  if (!role) {
    return [];
  }
  const denied = new Set(known(account.permDenies));
  return [...new Set([...rolePermissions(role), ...known(account.permGrants)])].filter(permission => !denied.has(permission));
};

// one staff member's own: given beyond their role, and taken from it. a
// permission in both is given. the caller saves the account.
const setAccountPermissions = (account, grants, denies) => {
  const given = known(grants);
  const taken = known(denies).filter(permission => !given.includes(permission));
  if (given.length) {
    account.permGrants = given;
  }
  else {
    delete account.permGrants;
  }
  if (taken.length) {
    account.permDenies = taken;
  }
  else {
    delete account.permDenies;
  }
};

const can = (account, permission, banned = false) =>
  isActiveStaff(account, banned) && permissionsOf(account).includes(permission);

// may `actor` act on `target`? never on themselves, nor on staff of their
// own rank or above.
const outranks = (actor, target) => actor !== target && rankOf(actor) > rankOf(target);

// sets the role (one of ROLES, or null for none). `moderator` is kept in
// step for anything that still reads it.
const setRole = (account, role) => {
  if (role === null || role === "" || role === "none") {
    delete account.role;
    delete account.moderator;
    return true;
  }
  if (!Object.hasOwn(ROLES, role)) {
    return false;
  }
  account.role = role;
  account.moderator = true;
  return true;
};

module.exports = {PERMISSIONS, ROLES, roleOf, rankOf, isActiveStaff, permissionsOf, rolePermissions, roleChanged, setRolePermissions,
  setAccountPermissions, can, outranks, setRole};
