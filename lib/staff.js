"use strict";

const accounts = require("./accounts.js");
const bans = require("./bans.js");
const devices = require("./devices.js");
const limits = require("./limits.js");
const manage = require("./manage.js");
const modlog = require("./modlog.js");
const reports = require("./reports.js");
const support = require("./support.js");
const world = require("./world.js");

// what the admin panel (lib/panel.js) and the moderator panel
// (lib/modpanel.js) both do. `by` is who is doing it, for the record:
// "admin", or a moderator's username.

const disciplined = () => accounts.all()
  .map(account => {
    const ban = world.moderation.banOf(account);
    return {
      username: account.username,
      banned: ban ? ban.seconds : 0,
      reason: ban ? ban.reason : "",
      by: ban ? ban.by : "",
      since: ban ? ban.since : null,
      silenced: world.moderation.silenceRemaining(account),
    };
  })
  .filter(entry => entry.banned !== 0 || entry.silenced !== 0)
  .sort((a, b) => a.username.localeCompare(b.username));

// accounts by name, for both panels' search: at most `limit`, those named
// exactly what was typed first, then those whose names start with it, then
// those with it anywhere, online players first within each and then by
// name. so "John" is never lost among John123 and Johnathan. with nothing
// typed: online players, then the ones seen last. `keep` narrows it
// (online, banned...). returns {found, total}: total is how many matched.
const MAX_FOUND = 50;
const findAccounts = (query, keep = () => true, limit = MAX_FOUND) => {
  const wanted = String(query || "").trim().toLowerCase().slice(0, 100);
  const online = new Set(world.players().map(player => player.username));
  const rank = name => {
    const low = name.toLowerCase();
    return low === wanted ? 0 : low.startsWith(wanted) ? 1 : 2;
  };
  const matched = accounts.all().filter(account => account.username.toLowerCase().includes(wanted) && keep(account, online));
  const sorted = wanted
    ? matched.sort((a, b) => rank(a.username) - rank(b.username) || Number(online.has(b.username)) - Number(online.has(a.username))
      || a.username.localeCompare(b.username))
    : matched.sort((a, b) => Number(online.has(b.username)) - Number(online.has(a.username))
      || (b.lastSeen || b.lastLogin || 0) - (a.lastSeen || a.lastLogin || 0));
  return {found: sorted.slice(0, limit), total: matched.length};
};

// the accounts that signed in from an address, or from any address that
// starts with what was typed ("203.0.113." for the lot): from the sign-in
// histories, which hold the last 90 days (lib/accounts.js). failed tries
// are left out, being anyone's. returns {error} or {players: [{username,
// online, addresses: [{address, at}], lastAt}]}, the latest first.
const MIN_ADDRESS_QUERY = 3;
const MAX_ADDRESS_FOUND = 100;
const byAddress = query => {
  const wanted = String(query || "").trim().toLowerCase().replace(/^::ffff:/, "").slice(0, 60);
  if (wanted.length < MIN_ADDRESS_QUERY || !/^[0-9a-f.:]+$/.test(wanted) || !/[.:]/.test(wanted)) {
    return {error: "Type at least the start of an IP address, like 203.0.113."};
  }
  const players = [];
  for (const account of accounts.all()) {
    const seen = new Map();
    for (const login of account.logins) {
      if (login.ok && login.address && login.address.toLowerCase().startsWith(wanted)) {
        seen.set(login.address, Math.max(seen.get(login.address) || 0, login.at));
      }
    }
    if (seen.size > 0) {
      const addresses = [...seen].map(([address, at]) => ({address, at})).sort((one, other) => other.at - one.at);
      players.push({username: account.username, online: Boolean(world.findOnline(account.username)), addresses, lastAt: addresses[0].at});
    }
  }
  return {players: players.sort((one, other) => other.lastAt - one.lastAt).slice(0, MAX_ADDRESS_FOUND)};
};

const ADDRESS_ERRORS = {
  not_an_address: "Not an IP address.",
  own_address: "That is this machine's own address: with a proxy or a tunnel in front, everyone's.",
  already: "Already banned.",
  too_many: "Too many banned addresses.",
};

// bans an address for good and puts out whoever plays from it.
// returns {ban, out} or {error: text}.
const banAddress = (address, reason, by) => {
  const result = bans.banAddress(address, reason, by);
  return result.error ? {error: ADDRESS_ERRORS[result.error]} : {ban: result.ban, out: world.disconnectAddress(result.ban.address)};
};

// bans every computer the account signed in from lately (lib/devices.js),
// and puts out whoever plays from one of them, whichever account. their
// sign-ins stay, as with an address ban: the client asks with one why its
// game stopped, and the account page stays open to them for an appeal; the
// game itself turns them away (lib/world.js). returns {ok, detail} or {error}.
const banDevices = (account, reason, by) => {
  const result = devices.banAccount(account, reason, by);
  if (result.error) {
    return result;
  }
  const under = devices.accountsUnder(result.ban);
  const out = world.disconnectBanned(under);
  bans.record({account, action: "device_ban", seconds: -1, reason: result.ban.reason, by});
  const others = under.filter(one => one !== account).map(one => one.username);
  return {ok: `${account.username} is hardware banned (${result.ban.ids.length} IDs).${out ? ` ${out} playing from them ${out === 1 ? "was" : "were"} put out.` : ""}`
    + `${others.length ? ` Also used by: ${others.slice(0, 10).join(", ")}${others.length > 10 ? "…" : ""}.` : ""}`, detail: result.ban.reason};
};

const unbanDevices = (id, by) => {
  const ban = devices.unban(id);
  if (!ban) {
    return {error: "No such hardware ban."};
  }
  bans.record({account: accounts.byId(ban.accountId), action: "device_unban", by});
  return {ok: `The hardware ban made with ${ban.username || "that account"} is lifted.`, username: ban.username};
};

// every computer ban that keeps the account out, or was made with it, lifted.
const unbanDevicesOf = (account, by) => {
  const lifted = devices.bansOfAccount(account).map(ban => unbanDevices(ban.id, by)).filter(result => result.ok);
  if (!lifted.length) {
    return {error: "None of their hardware is banned."};
  }
  const names = [...new Set(lifted.map(result => result.username).filter(Boolean))];
  return {ok: `${lifted.length === 1 ? "1 hardware ban was" : `${lifted.length} hardware bans were`} lifted${names.length ? ` (made with ${names.join(", ")})` : ""}.`,
    detail: names.join(", ")};
};

// the accounts that used a computer id, or one starting with what was
// typed (lib/devices.js): {error} or {players: [{username, kinds, lastAt}]}.
const byDevice = query => {
  const found = devices.search(query);
  return found.error ? found : {players: found.players.map(entry => ({username: entry.account.username, kinds: entry.kinds, lastAt: entry.lastAt}))};
};

// other accounts the same person may have: those that used one of its
// computers (lib/devices.js), and those that signed in from one of its
// addresses in the last 90 days. [{username, devices: [kind],
// addresses: count, online, banned}], the likeliest first. the addresses
// themselves are not given: moderators do not see them.
const altsOf = account => {
  const found = new Map();
  const entry = username => {
    if (!found.has(username)) {
      found.set(username, {username, devices: [], addresses: 0});
    }
    return found.get(username);
  };
  for (const alt of devices.alts(account)) {
    Object.assign(entry(alt.username), {devices: alt.kinds});
  }
  const mine = new Set(account.logins.filter(login => login.ok && login.address && !limits.isLoopback(login.address)).map(login => login.address));
  if (mine.size) {
    for (const other of accounts.all()) {
      if (other !== account) {
        const shared = new Set(other.logins.filter(login => login.ok && mine.has(login.address)).map(login => login.address));
        if (shared.size) {
          entry(other.username).addresses = shared.size;
        }
      }
    }
  }
  return [...found.values()].map(alt => {
    const other = accounts.byName(alt.username);
    return {...alt, online: Boolean(world.findOnline(alt.username)), banned: other ? world.moderation.banRemaining(other) : 0,
      deviceBanned: other ? devices.bannedId(other) !== 0 : false};
  }).sort((one, other) => Number(other.devices.length > 0) - Number(one.devices.length > 0)
    || other.devices.length - one.devices.length || other.addresses - one.addresses || one.username.localeCompare(other.username)).slice(0, 100);
};

// one player's story, newest first: bans given and lifted, what staff did
// to them, the reports about them, and what their computers gave away
// (lib/devices.js). [{at, kind, text, by}].
const BAN_WORDS = {ban: "Banned", unban: "Ban lifted", reason: "Ban reason changed", appeal: "Appealed", appeal_approved: "Appeal approved",
  appeal_denied: "Appeal denied", device_ban: "Hardware banned", device_unban: "Hardware ban lifted"};
const timelineOf = account => {
  const events = [];
  for (const entry of bans.historyOf(account)) {
    const length = entry.action === "ban" ? (entry.seconds === -1 ? "for good" : `${Math.round(entry.seconds / 3600)} h`) : "";
    events.push({at: entry.at, kind: "ban", text: [BAN_WORDS[entry.action] || entry.action, length, entry.reason].filter(Boolean).join(" · "), by: entry.by});
  }
  for (const entry of modlog.about(account.username)) {
    events.push({at: entry.at, kind: "staff", text: [entry.action, entry.detail].filter(Boolean).join(" · "), by: entry.by});
  }
  for (const report of reports.about(account.username)) {
    events.push({at: report.createdAt, kind: "report", text: `Reported: ${report.reason}${report.detail ? ` · ${report.detail}` : ""}${report.handledAt ? "" : " (waiting)"}`,
      by: report.reporter});
  }
  for (const entry of devices.alertsOf(account)) {
    events.push({at: entry.at, kind: "alert", text: `${entry.name} · ${entry.detail}`, by: ""});
  }
  return events.sort((one, other) => other.at - one.at).slice(0, 200);
};

// appeals with what each is against, as it stands now.
const appealsFor = handled => bans.appeals(handled).map(appeal => {
  const account = accounts.byId(appeal.accountId);
  const ban = account ? world.moderation.banOf(account) : null;
  const address = appeal.addressKey ? bans.addressBan(appeal.addressKey) : null;
  return {...appeal, username: account ? account.username : appeal.username, gone: !account,
    ban: ban && {seconds: ban.seconds, reason: ban.reason}, address: address && {key: address.key, reason: address.reason}};
});

// an appeal answered: approved lifts the account's ban, and the ban on the
// address it was written from when it was about that.
const answerAppeal = (accountId, approved, reply, by) => {
  const appeal = bans.waitingAppeal(accountId);
  if (!appeal) {
    return {error: "No such appeal waiting."};
  }
  bans.answerAppeal(appeal.accountId, approved, reply, by);
  const account = accounts.byId(appeal.accountId);
  if (!approved) {
    return {ok: `${appeal.username} stays banned.`, username: appeal.username};
  }
  if (account) {
    world.moderation.actions.unban(account, by);
  }
  if (appeal.addressKey) {
    bans.unbanAddress(appeal.addressKey, by);
  }
  return {ok: `${appeal.username} is no longer banned.`, username: appeal.username};
};

// A player's request for another username, approved or denied. the player
// picked the name under the sign-up rules; they are checked again, since it
// may have been taken while it waited.
const answerNameRequest = (id, approve) => {
  const request = support.nameRequestById(id);
  const account = request && accounts.byId(request.accountId);
  if (!request) {
    return {error: "No such request waiting."};
  }
  if (!approve || !account) {
    support.answerNameRequest(request.id, false);
    return {ok: account ? `${account.username} keeps their name.` : "That account is gone; the request was closed.", username: account ? account.username : ""};
  }
  world.disconnect(account);
  manage.forget(account);
  const oldName = account.username;
  const problem = accounts.rename(account, request.newName);
  if (problem) {
    return {error: problem === "username_taken" ? "That username has been taken since. Deny the request."
      : "That name does not pass the sign-up rules."};
  }
  support.answerNameRequest(request.id, true);
  return {ok: `${oldName} is now called ${account.username}. They log in with the new name and the same password.`, username: account.username};
};

module.exports = {disciplined, findAccounts, byAddress, banAddress, banDevices, unbanDevices, unbanDevicesOf, byDevice, altsOf, timelineOf, appealsFor, answerAppeal, answerNameRequest};
