"use strict";

const {logText} = require("./logtext.js");
const customItems = require("./customitems.js");
const itemControl = require("./itemcontrol.js");
const playerItems = require("./playeritems.js");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const accounts = require("./accounts.js");
const config = require("../config.js");
const limits = require("./limits.js");
const achievements = require("./achievements.js");
const badges = require("./badges.js");
const discord = require("./discord.js");
const bans = require("./bans.js");
const captcha = require("./captcha.js");
const chatlog = require("./chatlog.js");
const chatFilter = require("./chatfilter.js");
const erase = require("./erase.js");
const masterpieces = require("./masterpieces.js");
const defpacks = require("./defpacks.js");
const support = require("./support.js");
const totp = require("./totp.js");
const recoveryMail = require("./recoverymail.js");
const world = require("./world.js");
const chatStyles = require("./chatstyles.js");
const roles = require("./roles.js");
const admin = require("./admin.js");
const itemPreview = require("./itempreview.js");

// the account page at /account: what a player can do about their own
// account from a browser. they sign in with the game's username and
// password; that sets a cookie only this page's requests send back
// (HttpOnly, SameSite=Strict, Path=/account). sessions live in memory, so
// restarting the server signs everyone out of the page (not out of the game).
//
// A locked account can still sign in here: this is where it is unlocked.
//
// A banned account, or anyone signing in from a banned address, gets another
// page altogether: what the ban is and why, one appeal, and the way out
// (signing out, or deleting the account). the password and two-step sign-in
// stay within reach, in case the account is in other hands. nothing else of
// the account is sent or may be changed until the ban is over.

const COOKIE = "ajc_account";
// A device that gave its two-step code keeps this for 30 days (lib/totp.js).
const DEVICE_COOKIE = "ajc_device";
// a Discord link under way (lib/discord.js): the browser that started it
// must be the one that comes back. Lax, as Discord's redirect back is from
// another site, which the page's own (Strict) cookie is not sent from.
const DISCORD_COOKIE = "ajc_dlink";
const discordCookie = (value, maxAgeSeconds) =>
  `${DISCORD_COOKIE}=${value}; Path=/account/discord; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${config.secureCookies ? "; Secure" : ""}`;
const SESSION_HOURS = 12;
const TEN_MINUTES_MS = 600000;
// "Sign in with the Burrow client": the page starts it, and keeps this
// cookie; the link it opens (burrow://account?n=<nonce>) has the client ask
// for a ticket with its own login token, which it then opens in the
// browser at /account/client. the ticket signs in only the browser that
// holds the nonce it was asked for, so a burrow:// link from anywhere else
// signs nobody in, and a ticket sent to someone else opens nothing for them.
const CLIENT_COOKIE = "ajc_clink";
const clientCookie = (value, maxAgeSeconds) =>
  `${CLIENT_COOKIE}=${value}; Path=/account/client; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${config.secureCookies ? "; Secure" : ""}`;
const CLIENT_START_MS = 5 * 60 * 1000;
const CLIENT_TICKET_MS = 2 * 60 * 1000;
const MAX_CLIENT_STARTS = 10000;
const clientStarts = new Map(); // SHA-256 of a nonce -> expiry (ms)
const clientTickets = new Map(); // SHA-256 of a ticket -> {id: account id, nonce: SHA-256 of its nonce, expiry: ms}
const clientStartsByAddress = limits.limiter(20, TEN_MINUTES_MS);
const clientTicketsByAccount = limits.limiter(10, TEN_MINUTES_MS);
const dropExpired = map => {
  for (const [hash, entry] of map) {
    if ((typeof entry === "number" ? entry : entry.expiry) < Date.now()) {
      map.delete(hash);
    }
  }
};
const MAX_NOTE = 120;
const RECOVERY_TOKEN_MS = 30 * 60 * 1000;
const recoveryHash = token => crypto.createHash("sha256").update(token).digest("hex");

// wrong passwords before further tries from an address are refused for a
// while, as for the launcher's sign-in (lib/http.js).
const failuresByAddress = limits.limiter(config.failedLoginsPerTenMinutes, TEN_MINUTES_MS);
// the password is asked for again before the changes that matter. A page
// left open, or one that fell into other hands, gets this many wrong tries
// at it and is then signed out.
const WRONG_PASSWORDS_ALLOWED = 5;
const wrongPasswords = limits.limiter(WRONG_PASSWORDS_ALLOWED, TEN_MINUTES_MS);
const recoveryRequests = limits.limiter(5, TEN_MINUTES_MS);
// recovery mail sent for one account, from any address: a few an hour.
const recoveryMailsPerAccount = limits.limiter(3, 3600000);
// a 2FA reset by email waits this long after a password reset by email, so
// that someone who has only the mailbox cannot do one after the other.
const EMAIL_RESET_GAP_MS = 7 * 24 * 3600000;
// why a 2FA reset by email cannot be done for this account now, or null.
// it also needs the account's password (recover/complete). staff ask the
// admin (lib/panel.js), whose 2FA reset ends their role's use until they
// turn it on again: a mailbox must not make someone staff.
const twoStepResetProblem = account => roles.roleOf(account)
  ? "Staff accounts cannot remove 2FA by email. Ask the admin."
  : account.emailPasswordResetAt && Date.now() - account.emailPasswordResetAt < EMAIL_RESET_GAP_MS
    ? "2FA cannot be removed by email within 7 days of a password reset by email."
    : null;
// what may be done from the page of a ban (above).
const BANNED_MAY = ["password", "twoStepStart", "twoStepConfirm", "twoStepOff", "forgetDevices", "delete", "appeal"];
// and from the page of a rejected username: the same, with a new name in
// place of an appeal.
const RENAMING_MAY = ["password", "twoStepStart", "twoStepConfirm", "twoStepOff", "forgetDevices", "delete", "newName"];
// things that write to the database, per account.
const writesPerTenMinutes = limits.limiter(60, TEN_MINUTES_MS);

const sessions = new Map(); // SHA-256 of a session token -> {id: account id, expiry: ms}

const sha256 = text => crypto.createHash("sha256").update(text).digest("hex");

const cookieToken = req => {
  const match = new RegExp(`(?:^|;\\s*)${COOKIE}=([0-9a-f]{48})(?:;|$)`).exec(req.headers.cookie || "");
  return match ? match[1] : null;
};

const cookieHeader = (token, maxAgeSeconds, name = COOKIE) =>
  `${name}=${token}; Path=/account; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${config.secureCookies ? "; Secure" : ""}`;

const deviceCookie = req => {
  const match = new RegExp(`(?:^|;\\s*)${DEVICE_COOKIE}=([0-9a-f]{48})(?:;|$)`).exec(req.headers.cookie || "");
  return match ? match[1] : null;
};

const signedInAs = req => {
  const token = cookieToken(req);
  const session = token && sessions.get(sha256(token));
  return session && session.expiry > Date.now() ? accounts.byId(session.id) : null;
};

const signIn = (res, account, otherCookies = []) => {
  for (const [hash, session] of sessions) {
    if (session.expiry < Date.now()) {
      sessions.delete(hash);
    }
  }
  const token = crypto.randomBytes(24).toString("hex");
  sessions.set(sha256(token), {id: account.id, expiry: Date.now() + SESSION_HOURS * 3600000});
  res.setHeader("Set-Cookie", [cookieHeader(token, SESSION_HOURS * 3600), ...otherCookies]);
};

// ends the account's sessions on this page, all but the one making `req`.
const signOutOthers = (account, req) => {
  const keep = req && cookieToken(req) ? sha256(cookieToken(req)) : null;
  for (const [hash, session] of sessions) {
    if (session.id === account.id && hash !== keep) {
      sessions.delete(hash);
    }
  }
};

// ends the account's sessions in the moderator panel (lib/modpanel.js, which
// needs this file, so it is asked for when used): with the others when the
// password changes or the owner signs out everywhere, and when the account
// locks or turns 2FA off, so that a session from before does not come back
// with it.
const endStaffSessions = account => require("./modpanel.js").forget(account);

const twoStepOf = account => ({on: totp.isOn(account), since: account.totp ? account.totp.since : null,
  recoveryLeft: account.totp ? account.totp.recovery.length : 0, devices: totp.freshDevices(account).length, deviceDays: totp.DEVICE_DAYS});

// the ban in the way of this account from where it is asked about: its own,
// or else the one on that address. {kind, permanent, seconds, reason,
// since, addressKey}, or null.
const banFor = (account, from) => {
  const own = world.moderation.banOf(account);
  if (own) {
    return {kind: "account", permanent: own.seconds === world.moderation.PERMANENT, seconds: own.seconds, reason: own.reason, since: own.since, addressKey: ""};
  }
  const address = bans.addressBan(from.address);
  return address ? {kind: "address", permanent: true, seconds: world.moderation.PERMANENT, reason: address.reason, since: address.createdAt, addressKey: address.key} : null;
};

// all the page of a ban is given.
const bannedProfile = (account, ban) => {
  const appeal = bans.appealOf(account);
  return {
    username: account.username,
    banned: {kind: ban.kind, permanent: ban.permanent, seconds: ban.seconds, reason: ban.reason, since: ban.since},
    appeal: appeal && {createdAt: appeal.createdAt, text: appeal.text, status: appeal.status, reply: appeal.reply, handledAt: appeal.handledAt},
    appealLimit: bans.MAX_APPEAL,
    twoStep: twoStepOf(account),
  recoveryEmail: account.recoveryEmail ? `${account.recoveryEmail.slice(0, 2)}…${account.recoveryEmail.slice(account.recoveryEmail.lastIndexOf("@"))}` : "",
  };
};

const profile = (account, from) => {
  const ban = banFor(account, from);
  if (ban) {
    return bannedProfile(account, ban);
  }
  // A rejected username (lib/moderation.js): a new one before anything else.
  if (account.nameRejected) {
    return {username: account.username, banned: null, nameRejected: true, twoStep: twoStepOf(account)};
  }
  const avatar = account.avatars.find(candidate => candidate.perUserAvId === account.activeAvatar) || account.avatars[0];
  return {
    username: account.username,
    createdAt: account.createdAt,
    lastSeen: account.lastSeen || account.lastLogin || null,
    online: Boolean(world.findOnline(account.username)),
    logins: account.numLogins || 0,
    playtime: account.playtime,
    playtimePublic: account.playtimePublic,
    chatStyle: chatStyles.normalize(account.chatStyle),
    animals: account.avatars.length,
    animalType: avatar ? avatar.type : null,
    items: account.items.length,
    denItems: account.denItems.length,
    // what they made in the game's Item Maker (lib/playeritems.js)
    customItems: playerItems.madeBy(account).map(entry => ({kind: entry.kind, id: entry.id, name: entry.name,
      art: require("./itemart.js").urlOf(entry, "/account/api/itemart"), artWaiting: Boolean(entry.artPending), look: entry.artMode || "sticker"})),
    picturesStopped: Boolean(account.artBlocked),
    customItemLimits: {perDay: playerItems.PER_DAY, inAll: playerItems.IN_ALL},
    pets: account.pets.length,
    buddies: account.buddies.length,
    banned: null,
    locked: account.locked,
    twoStep: twoStepOf(account),
    recoveryEmail: account.recoveryEmail ? `${account.recoveryEmail.slice(0, 2)}…${account.recoveryEmail.slice(account.recoveryEmail.lastIndexOf("@"))}` : "",
    discord: account.discord,
    discordLinked: Boolean(account.discordId),
    discordLinking: discord.linking(),
    bio: account.bio,
    bioLimit: badges.MAX_BIO,
    badges: badges.of(account).map(badge => badge.label),
    features: Object.fromEntries(accounts.FEATURES.map(name => [name, accounts.featureOn(account, name)])),
    history: account.logins,
    denVisits: account.denVisits,
    trades: account.tradeHistory,
    buddyList: account.buddies.map(key => {
      const buddy = accounts.byName(key);
      return {name: buddy ? buddy.username : key, online: Boolean(buddy && world.findOnline(buddy.username)), note: account.buddyNotes[key] || ""};
    }).sort((one, other) => one.name.localeCompare(other.name)),
    blocked: account.blocked.map(key => (accounts.byName(key) || {username: key}).username).sort(),
    achievements: achievements.progress(account),
    offers: {incoming: world.tradeOffers.incoming(account), outgoing: world.tradeOffers.outgoing(account)},
    nameRequests: support.nameRequestsOf(account),
    feedback: support.feedbackOf(account),
  };
};

// everything kept about the account, for its owner to take away: the
// account as it is stored, without what would let someone in (the password's
// hash, the 2FA secret, device passes), and what other tables hold of it.
// what others wrote about it (reports, a moderator's notes) is not theirs
// to be handed, and is not here.
const SECRET_FIELDS = ["salt", "hash", "totp", "totpSetup", "devices", "modNotes", "recoveryTokens"];
const dataOf = account => ({
  exportedAt: new Date().toISOString(),
  server: config.baseUrl,
  account: {...Object.fromEntries(Object.entries(account).filter(([field]) => !SECRET_FIELDS.includes(field))), twoStepOn: totp.isOn(account)},
  chat: chatlog.saidBy(account),
  banRecord: bans.historyOf(account),
  appeal: bans.appealOf(account),
  usernameRequests: support.nameRequestsOf(account),
  feedback: support.feedbackOf(account),
  paintings: masterpieces.madeBy(account),
});

const NAME_ERRORS = {
  invalid_username: "3 to 20 letters, digits, spaces, dots or dashes, with at least three letters.",
  username_taken: "Username taken.",
  name_not_allowed: "That name is not allowed.",
  same_name: "That is already your username.",
};
const OFFER_ERRORS = {
  unavailable: "You cannot trade with them.",
  not_listed: "No longer on their trade list.",
  nothing: "Pick something to give.",
  not_yours: "You no longer have one of those.",
  too_many: "Too many offers waiting.",
};
const FEEDBACK_ERRORS = {
  empty: "Write something first.",
  unknown_kind: "Pick feedback or a bug report.",
  too_many: "Too many today. Try tomorrow.",
};

// is `password` the account's own? A wrong one counts, and after a few the
// page is signed out (the caller of `act` sees to that).
const passwordAgain = (account, password) => {
  if (wrongPasswords.blocked(account.id)) {
    return false;
  }
  const right = accounts.authenticate(account.username, password) === account;
  if (!right) {
    wrongPasswords.record(account.id);
  }
  return right;
};

// one change to the signed-in account. returns {ok: text} or {error: text}.
const act = (account, body, req, from, res) => {
  const ban = banFor(account, from);
  if (ban && !BANNED_MAY.includes(body.action)) {
    return {error: "Not while banned."};
  }
  if (!ban && account.nameRejected && !RENAMING_MAY.includes(body.action)) {
    return {error: "Choose a new username first."};
  }
  switch (body.action) {
    // in place of a rejected username, at once and under the sign-up rules.
    case "newName": {
      if (!account.nameRejected || ban) {
        return {error: "Your username was not rejected."};
      }
      const wanted = typeof body.newName === "string" ? body.newName.trim() : "";
      if (wanted.toLowerCase() === account.username.toLowerCase()) {
        return {error: NAME_ERRORS.same_name};
      }
      world.disconnect(account);
      const problem = accounts.rename(account, wanted);
      if (problem) {
        return {error: NAME_ERRORS[problem] || NAME_ERRORS.invalid_username};
      }
      delete account.nameRejected;
      accounts.save(account);
      console.log(`[account] a rejected username was replaced by "${logText(account.username)}" from ${logText(from.address)}`);
      return {ok: "Saved."};
    }
    // one for each account, ever: an answer that wants a follow-up says
    // where to go with it.
    case "appeal": {
      if (!ban) {
        return {error: "You are not banned."};
      }
      const result = bans.appeal(account, body.text, ban.addressKey);
      return result.error ? {error: result.error === "empty" ? "Write something first." : "Already appealed."} : {ok: "Sent."};
    }
    case "password": {
      // asked for again: a page left open is not enough to take an account over.
      if (!passwordAgain(account, body.current)) {
        return {error: "Wrong password."};
      }
      const passwordProblem = accounts.setPassword(account, body.password);
      if (passwordProblem) {
        return {error: passwordProblem === "weak_password" ? "That password is too easy to guess: it is a common one, or has your username in it."
          : "Passwords need 10 characters or more, with a capital letter, a small letter and a digit."};
      }
      world.moderation.actions.kick(account);
      signOutOthers(account, req);
      endStaffSessions(account);
      console.log(`[account] "${logText(account.username)}" changed their password from ${logText(from.address)}`);
      return {ok: "Password changed."};
    }
    case "requestName": {
      const result = support.requestName(account, body.newName, body.reason);
      return result.error ? {error: NAME_ERRORS[result.error]} : {ok: `Requested "${result.request.newName}".`};
    }
    case "withdrawName":
      return support.withdrawNameRequest(account) ? {ok: "Withdrawn."} : {error: "No request waiting."};
    case "feedback": {
      const result = support.sendFeedback(account, String(body.kind), body.text);
      return result.error ? {error: FEEDBACK_ERRORS[result.error]} : {ok: body.kind === "bug" ? "Bug report sent." : "Feedback sent."};
    }
    case "lock": {
      account.locked = body.locked === true;
      if (account.locked) {
        // out of the game now, and no saved sign-in gets back in.
        accounts.revokeTokens(account);
        world.moderation.actions.kick(account);
        endStaffSessions(account);
      }
      accounts.save(account);
      console.log(`[account] "${logText(account.username)}" ${logText(account.locked ? "locked" : "unlocked")} from ${logText(from.address)}`);
      return {ok: account.locked ? "Locked." : "Unlocked."};
    }
    case "feature": {
      if (!accounts.FEATURES.includes(body.feature) || typeof body.on !== "boolean") {
        return {error: "Unknown setting."};
      }
      account.features[body.feature] = body.on;
      accounts.save(account);
      return {ok: "Saved."};
    }
    // two-step sign-in (lib/totp.js). turning it on: the password again,
    // then a secret for their authenticator app, then a code from the app
    // to show it took. saved sign-ins end, so every device passes it once.
    case "twoStepStart": {
      if (totp.isOn(account)) {
        return {error: "2FA is already on."};
      }
      if (!passwordAgain(account, body.current)) {
        return {error: "Wrong password."};
      }
      const setup = totp.begin(account);
      accounts.save(account);
      return {ok: "Scan the code.", setup};
    }
    case "twoStepConfirm": {
      const recovery = totp.confirm(account, body.code);
      if (!recovery) {
        accounts.save(account);
        // confirm() drops a setup older than 15 minutes: no code can match it now.
        return {error: account.totpSetup ? "Wrong code." : "Setup timed out. Turn 2FA on again and scan the new QR code."};
      }
      accounts.revokeTokens(account);
      accounts.save(account);
      console.log(`[account] "${logText(account.username)}" turned two-step sign-in on from ${logText(from.address)}`);
      return {ok: "2FA is on.", recovery};
    }
    // turning it off: the password and a code (or a recovery code).
    case "twoStepOff": {
      if (!totp.isOn(account)) {
        return {error: "2FA is not on."};
      }
      if (!passwordAgain(account, body.current)) {
        return {error: "Wrong password."};
      }
      if (!totp.verify(account, String(body.code || ""))) {
        accounts.save(account);
        return {error: "Wrong code."};
      }
      totp.turnOff(account);
      accounts.save(account);
      endStaffSessions(account);
      res.setHeader("Set-Cookie", cookieHeader("", 0, DEVICE_COOKIE));
      console.log(`[account] "${logText(account.username)}" turned two-step sign-in off from ${logText(from.address)}`);
      return {ok: "2FA is off."};
    }
    case "forgetDevices":
      totp.forgetDevices(account);
      accounts.save(account);
      return {ok: "Trusted devices forgotten."};
    // their bio, for the Bio tab of their card in the game. empty takes it off.
    // their own custom items: a new name, or gone (from everyone who has
    // one). a picture is sent to /api/itemart.
    case "itemLook":
      return playerItems.setLook(account, String(body.kind), body.id, String(body.look));
    case "itemRename":
      return playerItems.rename(account, String(body.kind), body.id, body.name);
    case "itemDelete": {
      const entry = customItems.get(String(body.kind), body.id);
      if (!entry || entry.ownerId !== account.id) {
        return {error: "That is not one of your items."};
      }
      const result = itemControl.deleteCustom(entry.kind, entry.id, world);
      return result.error ? result : {ok: `Deleted ${entry.name}.`};
    }
    case "bio": {
      // typed words others read: not while they cannot chat.
      if (world.moderation.isSilenced(account)) {
        return {error: "You cannot change your bio while silenced."};
      }
      const bio = badges.bioText(body.text);
      if (bio === null) {
        return {error: `At most ${badges.MAX_BIO} characters on ${badges.MAX_BIO_LINES} lines.`};
      }
      // the server's chat filter, as for anything else players write to
      // each other (lib/chat-filter.txt).
      const rule = chatFilter.broken(bio);
      if (rule) {
        console.log(`[filter] "${logText(account.username)}" bio not saved (${logText(rule)}): ${logText(JSON.stringify(bio))}`);
        return {error: "Your bio has words that are not allowed here."};
      }
      account.bio = bio;
      accounts.save(account);
      return {ok: bio ? "Saved." : "Removed."};
    }
    // whether their card in the game shows how long they have played.
    case "playtimePublic":
      account.playtimePublic = body.on === true;
      accounts.save(account);
      return {ok: account.playtimePublic ? "Others can see your playtime on your card." : "Your playtime is private."};
    // A player can choose every colour, opacity, animation and animation
    // speed. Validation is deliberately here as well as in the page: saved
    // state is not trusted just because it came from our own browser UI.
    case "chatStyle": {
      if (!chatStyles.valid(body.style)) {
        return {error: "Choose valid chat colours and animation settings."};
      }
      account.chatStyle = chatStyles.normalize(body.style);
      accounts.save(account);
      return {ok: "Chat style saved. Your next message will use it."};
    }
    // their Discord account, for their card in the game: it is linked by
    // signing in to Discord (GET /account/discord/link), and only taken off
    // here, with the booster badge it brought.
    case "discord":
      if (String(body.name || "") !== "") {
        return {error: "Link your Discord account instead."};
      }
      discord.unlink(account);
      return {ok: "Removed."};
    // the player's own words about a buddy; only they see them.
    case "buddyNote": {
      const key = String(body.name || "").toLowerCase();
      if (!account.buddies.includes(key)) {
        return {error: "Not a buddy."};
      }
      const note = String(body.note || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, MAX_NOTE);
      if (note) {
        account.buddyNotes[key] = note;
      }
      else {
        delete account.buddyNotes[key];
      }
      accounts.save(account);
      return {ok: "Saved."};
    }
    // blocking and unblocking, as the game's own buttons do it.
    case "block":
    case "unblock": {
      const target = accounts.byName(String(body.name || "").trim());
      if (!target || target === account) {
        return {error: "No such player."};
      }
      return world.setBlocked(account, target, body.action === "block")
        ? {ok: body.action === "block" ? "Blocked." : "Unblocked."}
        : {error: body.action === "block" ? "Already blocked, or your list is full." : "Not blocked."};
    }
    // an offer for something on another player's trade list, left for them
    // to answer on their own page.
    case "offer": {
      const problem = world.tradeOffers.make(account, accounts.byName(String(body.to || "").trim()), body.wanted, body.offered);
      return problem ? {error: OFFER_ERRORS[problem]} : {ok: "Offer sent."};
    }
    case "answerOffer": {
      const problem = world.tradeOffers.answer(account, body.id, body.accept === true, world.refreshInventories);
      return problem ? {error: problem === "gone" ? "That offer is no longer possible." : "No such offer."}
        : {ok: body.accept === true ? "Traded." : "Declined."};
    }
    case "withdrawOffer":
      return world.tradeOffers.withdraw(account, String(body.to || ""), body.id) ? {ok: "Withdrawn."} : {error: "No such offer."};
    case "signOutEverywhere":
      accounts.revokeTokens(account);
      totp.forgetDevices(account);
      accounts.save(account);
      world.moderation.actions.kick(account);
      signOutOthers(account, req);
      endStaffSessions(account);
      return {ok: "Signed out everywhere."};
    // for good: the password again, and the username typed out.
    case "delete": {
      if (!passwordAgain(account, body.current)) {
        return {error: "Wrong password."};
      }
      if (String(body.confirm || "").trim().toLowerCase() !== account.username.toLowerCase()) {
        return {error: "Username does not match."};
      }
      const name = account.username;
      world.disconnect(account);
      signOutOthers(account, null);
      endStaffSessions(account);
      erase(account);
      console.log(`[account] "${logText(name)}" deleted their account from ${logText(from.address)}`);
      return {ok: "Account deleted.", deleted: true};
    }
    default:
      return {error: "Unknown action."};
  }
};

const PAGE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": captcha.policy("default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self'; "
    + "form-action 'none'; frame-ancestors 'none'; base-uri 'none'"),
};

// the web item giver shows den items in frames of public/item-preview.html,
// which plays them with Ruffle (a Flash player, from jsDelivr).
const ITEMS_PAGE_POLICY = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self'; "
  + "frame-src 'self'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'";
const RUFFLE = "https://cdn.jsdelivr.net/npm/@ruffle-rs/ruffle@0.7.1/";
const PREVIEW_POLICY = `default-src 'none'; script-src 'unsafe-inline' 'wasm-unsafe-eval' ${RUFFLE}; connect-src 'self' ${RUFFLE}; `
  + "style-src 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; worker-src blob:; "
  + "form-action 'none'; frame-ancestors 'self'; base-uri 'none'; sandbox allow-scripts";
const artFetches = limits.limiter(600, 600000); // item pictures for the web item giver, per address in ten minutes

// A request that changes something must come from this server's own page.
const sameOrigin = limits.originAllowed;

// `from` is {address, local}; `web` is {send, readJson} from lib/http.js.
const handle = async (req, res, url, from, web) => {
  for (const [name, value] of Object.entries(PAGE_HEADERS)) {
    res.setHeader(name, value);
  }
  const reply = (status, body) => web.send(res, status, body);
  const route = `${req.method} ${url.pathname.replace(/\/$/, "") || "/account"}`;

  if (route === "GET /account") {
    web.send(res, 200, captcha.withScriptVersion(await fs.promises.readFile(path.join(config.publicDir, "account.html"))), "text/html; charset=utf-8");
    return;
  }
  // the item giver on the web (public/items.html), with this page's sign-in.
  if (route === "GET /account/items") {
    res.setHeader("Content-Security-Policy", ITEMS_PAGE_POLICY);
    web.send(res, 200, await fs.promises.readFile(path.join(config.publicDir, "items.html")), "text/html; charset=utf-8");
    return;
  }
  // its den item previews (lib/itempreview.js): a page of their own in a
  // frame, sandboxed, as they run a Flash player from elsewhere (Ruffle).
  if (route === "GET /account/item-preview") {
    res.setHeader("Content-Security-Policy", PREVIEW_POLICY);
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    web.send(res, 200, await fs.promises.readFile(path.join(config.publicDir, "item-preview.html")), "text/html; charset=utf-8");
    return;
  }
  const art = /^GET \/account\/(item-preview\.swf|art\/(clothing|den)\/(\d{1,9}))$/.exec(route);
  if (art) {
    // fetched from the preview's sandbox, which has no origin of its own
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (art[1] === "item-preview.swf") {
      web.send(res, 200, await fs.promises.readFile(path.join(config.publicDir, "item-preview.swf")), "application/x-shockwave-flash");
      return;
    }
    if (!artFetches.allow(from.address)) {
      reply(429, {error: "Too many at once. Try again in a minute."});
      return;
    }
    const found = art[2] === "den" ? await itemPreview.denArt(Number(art[3])) : await itemPreview.clothingIcon(Number(art[3]));
    if (!found) {
      reply(404, {error: "No picture."});
      return;
    }
    res.setHeader("Cache-Control", "public, max-age=3600");
    web.send(res, 200, found, art[2] === "den" ? "application/x-shockwave-flash" : "application/json");
    return;
  }
  if (route === "GET /account/recover") {
    web.send(res, 200, captcha.withScriptVersion(await fs.promises.readFile(path.join(config.publicDir, "recover.html"))), "text/html; charset=utf-8");
    return;
  }
  if (req.method === "POST" && !sameOrigin(req)) {
    reply(403, {error: "forbidden"});
    return;
  }
  const body = req.method === "POST" ? await web.readJson(req) : {};

  switch (route) {
    case "POST /account/api/recover/request": {
      // Always give the same reply: neither account names nor email addresses
      // can be discovered from this endpoint.
      if (!from.local && !recoveryRequests.allow(from.key)) {
        reply(429, {ok: "If the account and recovery email match, we sent a recovery link."});
        return;
      }
      const account = accounts.byName(String(body.username || ""));
      const email = String(body.email || "").trim().toLowerCase();
      const kind = body.kind === "twoStep" ? "twoStep" : "password";
      if (account && account.recoveryEmail && account.recoveryEmail === email && recoveryMail.available()
        && recoveryMailsPerAccount.allow(account.id)) {
        const token = crypto.randomBytes(32).toString("hex");
        account.recoveryTokens = (account.recoveryTokens || []).filter(entry => entry.expires > Date.now());
        account.recoveryTokens.push({hash: recoveryHash(token), kind, expires: Date.now() + RECOVERY_TOKEN_MS});
        accounts.save(account);
        const link = new URL(`/account/recover?token=${token}`, config.siteUrl).href;
        const sent = await recoveryMail.send({to: account.recoveryEmail, subject: "Burrow account recovery",
          text: `A ${kind === "twoStep" ? "2FA reset" : "password reset"} was requested for ${account.username}. Open this link within 30 minutes:\n${link}\n\nIf this was not you, ignore this email.`});
        if (!sent) {
          account.recoveryTokens = account.recoveryTokens.filter(entry => entry.hash !== recoveryHash(token));
          accounts.save(account);
        }
      }
      reply(200, {ok: "If the account and recovery email match, we sent a recovery link."});
      return;
    }
    case "POST /account/api/recover/check": {
      const token = String(body.token || "");
      const account = [...accounts.all()].find(candidate => (candidate.recoveryTokens || []).some(entry => entry.hash === recoveryHash(token) && entry.expires > Date.now()));
      const entry = account && account.recoveryTokens.find(candidate => candidate.hash === recoveryHash(token) && candidate.expires > Date.now());
      const refused = entry && entry.kind === "twoStep" ? twoStepResetProblem(account) : null;
      reply(entry && !refused ? 200 : 400, entry && !refused ? {kind: entry.kind} : {error: refused || "This recovery link is invalid or expired."});
      return;
    }
    case "POST /account/api/recover/complete": {
      const token = String(body.token || "");
      const account = [...accounts.all()].find(candidate => (candidate.recoveryTokens || []).some(entry => entry.hash === recoveryHash(token) && entry.expires > Date.now()));
      const entry = account && account.recoveryTokens.find(candidate => candidate.hash === recoveryHash(token) && candidate.expires > Date.now());
      if (!entry) {
        reply(400, {error: "This recovery link is invalid or expired."});
        return;
      }
      if (entry.kind === "password") {
        const problem = accounts.setPassword(account, body.password);
        if (problem) {
          reply(400, {error: problem === "weak_password" ? "That password is too easy to guess." : "Use 10+ characters with an uppercase letter, lowercase letter and digit."});
          return;
        }
        account.emailPasswordResetAt = Date.now();
      }
      else {
        const refused = twoStepResetProblem(account);
        if (refused) {
          reply(400, {error: refused});
          return;
        }
        // the mailbox and the password: the link alone does not remove 2FA.
        if (!from.local && failuresByAddress.blocked(from.key)) {
          reply(429, {error: "Too many attempts. Try later."});
          return;
        }
        if (await accounts.authenticateAsync(account.username, body.password) !== account) {
          failuresByAddress.record(from.key);
          reply(401, {error: "Wrong password."});
          return;
        }
        if (totp.isOn(account)) {
          totp.turnOff(account);
          accounts.revokeTokens(account);
        }
      }
      account.recoveryTokens = [];
      accounts.save(account);
      signOutOthers(account, null);
      endStaffSessions(account);
      world.moderation.actions.kick(account);
      console.log(`[recovery] ${logText(entry.kind)} reset for "${logText(account.username)}" after email verification from ${logText(from.address)}`);
      reply(200, {ok: entry.kind === "password" ? "Password reset. You can sign in now." : "2FA reset. You can sign in now."});
      return;
    }
    case "POST /account/api/login": {
      const key = String(body.username || "").trim().toLowerCase();
      if (!from.local && failuresByAddress.blocked(from.key)) {
        reply(429, {error: "Too many attempts. Try later."});
        return;
      }
      // looked up first: with AJ_REGISTER=1 authenticate() would make the account.
      const known = accounts.byName(key);
      const captchaProblem = await captcha.check({captcha: body.captcha, captcha_pass: body.captchaPass}, from, "login", known);
      if (captchaProblem) {
        reply(captchaProblem === "captcha_unavailable" ? 503 : 401, {error: captcha.MESSAGES[captchaProblem], captcha: true});
        return;
      }
      const account = known && await accounts.authenticateAsync(known.username, body.password) === known ? known : null;
      if (!account) {
        failuresByAddress.record(from.key);
        if (known) {
          accounts.recordLogin(known, "web", from.address, false);
          accounts.save(known);
        }
        reply(401, {error: "Wrong username or password."});
        return;
      }
      // two-step sign-in: a code after the password, unless this browser
      // gave one in the last 30 days (lib/totp.js).
      const cookies = [];
      if (totp.isOn(account) && !totp.deviceTrusted(account, deviceCookie(req))) {
        if (!body.code) {
          reply(401, {error: "Enter your 2FA code.", twoStep: true, captchaPass: captcha.issuePass(account, from)});
          return;
        }
        if (!totp.verify(account, String(body.code))) {
          failuresByAddress.record(from.key);
          accounts.recordLogin(account, "web", from.address, false);
          accounts.save(account);
          reply(401, {error: "Wrong code.", twoStep: true, captchaPass: captcha.issuePass(account, from)});
          return;
        }
        if (body.rememberDevice === true) {
          cookies.push(cookieHeader(totp.trustDevice(account, "web"), totp.DEVICE_DAYS * 86400, DEVICE_COOKIE));
        }
      }
      accounts.recordLogin(account, "web", from.address);
      accounts.save(account);
      signIn(res, account, cookies);
      reply(200, {ok: true});
      return;
    }
    case "POST /account/api/logout": {
      const token = cookieToken(req);
      if (token) {
        sessions.delete(sha256(token));
      }
      res.setHeader("Set-Cookie", cookieHeader("", 0));
      reply(200, {ok: true});
      return;
    }
    // "Sign in with the Burrow client" (above), from the page: the nonce for
    // the burrow:// link, which this browser keeps as a cookie too.
    case "POST /account/api/client-start": {
      if (!from.local && !clientStartsByAddress.allow(from.key)) {
        reply(429, {error: "Too many attempts. Try later."});
        return;
      }
      dropExpired(clientStarts);
      if (clientStarts.size >= MAX_CLIENT_STARTS) {
        reply(503, {error: "Try again in a few minutes."});
        return;
      }
      const nonce = crypto.randomBytes(24).toString("hex");
      clientStarts.set(sha256(nonce), Date.now() + CLIENT_START_MS);
      res.setHeader("Set-Cookie", clientCookie(nonce, CLIENT_START_MS / 1000));
      reply(200, {nonce});
      return;
    }
    // ... from the client, with its login token (no Origin: the client's main
    // process): where to send the browser, which signs in there. a token is
    // only given after a whole sign-in, 2FA code included (lib/http.js).
    case "POST /account/api/client-ticket": {
      const nonce = typeof body.nonce === "string" && /^[0-9a-f]{48}$/.test(body.nonce) ? body.nonce : "";
      const started = nonce && clientStarts.get(sha256(nonce));
      if (!started || started < Date.now()) {
        reply(400, {error: "Start again from the account page."});
        return;
      }
      if (!from.local && failuresByAddress.blocked(from.key)) {
        reply(429, {error: "Too many attempts. Try later."});
        return;
      }
      const account = accounts.byToken(body.token);
      if (!account) {
        failuresByAddress.record(from.key);
        reply(401, {error: "Log in to Burrow again first."});
        return;
      }
      if (!clientTicketsByAccount.allow(account.id)) {
        reply(429, {error: "Too many attempts. Try later."});
        return;
      }
      dropExpired(clientTickets);
      const ticket = crypto.randomBytes(24).toString("hex");
      clientTickets.set(sha256(ticket), {id: account.id, nonce: sha256(nonce), expiry: Date.now() + CLIENT_TICKET_MS});
      reply(200, {url: new URL(`/account/client?ticket=${ticket}`, config.siteUrl).href, username: account.username});
      return;
    }
  }

  // ... and the ticket, opened by the client in the browser: signed in when
  // this browser started it (its cookie). a ticket is good once, whatever
  // happens. the page that follows says how it went.
  if (route === "GET /account/client") {
    const given = String(url.searchParams.get("ticket") || "");
    const ticket = /^[0-9a-f]{48}$/.test(given) ? clientTickets.get(sha256(given)) : null;
    if (ticket) {
      clientTickets.delete(sha256(given));
    }
    const nonce = (new RegExp(`(?:^|;\\s*)${CLIENT_COOKIE}=([0-9a-f]{48})(?:;|$)`).exec(req.headers.cookie || "") || [])[1];
    const account = ticket && ticket.expiry > Date.now() ? accounts.byId(ticket.id) : null;
    const result = !account ? "expired" : !nonce || sha256(nonce) !== ticket.nonce ? "elsewhere" : "ok";
    const cookies = [clientCookie("", 0)];
    if (result === "ok") {
      clientStarts.delete(ticket.nonce);
      accounts.recordLogin(account, "web", from.address);
      accounts.save(account);
      signIn(res, account, cookies);
    }
    else {
      res.setHeader("Set-Cookie", cookies);
    }
    // a page of this site's own that goes on to the account page, rather than
    // a redirect: the (SameSite=Strict) cookie then surely goes with it.
    res.setHeader("Cache-Control", "no-store");
    web.send(res, 200, `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=/account?client=${result}"><title>Burrow</title>`,
      "text/html; charset=utf-8");
    return;
  }

  // back from Discord (lib/discord.js): the state and the nonce must be the
  // ones the link began with. the page then says how it went.
  if (route === "GET /account/discord/callback") {
    const nonce = (new RegExp(`(?:^|;\\s*)${DISCORD_COOKIE}=([0-9a-f]{48})(?:;|$)`).exec(req.headers.cookie || "") || [])[1];
    const result = url.searchParams.get("error") ? {error: "cancelled"}
      : await discord.finish(url.searchParams.get("state"), nonce, url.searchParams.get("code"));
    res.setHeader("Set-Cookie", discordCookie("", 0));
    res.writeHead(302, {Location: `/account?discord=${result.ok ? "linked" : result.error}`});
    res.end();
    return;
  }

  const account = signedInAs(req);
  if (!account) {
    reply(401, {error: "Sign in first."});
    return;
  }
  switch (route) {
    // the page's "Link Discord": off to Discord's sign-in, which comes back
    // to /account/discord/callback.
    case "GET /account/discord/link": {
      if (!discord.linking() || banFor(account, from)) {
        res.writeHead(302, {Location: "/account?discord=off"});
        res.end();
        return;
      }
      const {url: to, nonce} = discord.start(account);
      res.setHeader("Set-Cookie", discordCookie(nonce, 600));
      res.writeHead(302, {Location: to});
      res.end();
      return;
    }
    // A copy of their data, as a file. also from the page of a ban.
    case "GET /account/api/export":
      if (!writesPerTenMinutes.allow(account.id)) {
        reply(429, {error: "Too many. Try later."});
        return;
      }
      res.setHeader("Content-Disposition", `attachment; filename="burrow-data-${account.id}.json"`);
      web.send(res, 200, JSON.stringify(dataOf(account), null, 2));
      return;
    case "GET /account/api/me":
      reply(200, profile(account, from));
      return;
    // the item giver (above, and lib/admin.js): for the account signed in
    // here only, as the in-game one is for the one playing; not while banned.
    case "GET /account/api/giver":
    case "GET /account/api/colour":
    case "POST /account/api/give": {
      if (banFor(account, from) || account.nameRejected) {
        reply(403, {error: "Not now."});
        return;
      }
      if (route === "GET /account/api/colour") {
        const result = await admin.colourLookup(url.searchParams);
        reply(result.status, result.body);
        return;
      }
      if (req.method === "GET") {
        reply(200, await admin.searchFor(account, url.searchParams));
        return;
      }
      const result = admin.giveAs(account, body);
      reply(result.status, result.body);
      return;
    }
    // for the trade offer form: what the player could give, and what
    // another player has up for trade.
    case "GET /account/api/tradable": {
      if (banFor(account, from) || account.nameRejected) {
        reply(403, {error: "Not now."});
        return;
      }
      const other = accounts.byName(url.searchParams.get("of") || "");
      reply(200, {mine: world.tradeOffers.owned(account), theirs: other && other !== account ? world.tradeOffers.listed(other) : [],
        found: Boolean(other && other !== account)});
      return;
    }
    case "POST /account/api/act": {
      if (!writesPerTenMinutes.allow(account.id)) {
        reply(429, {error: "Too many changes. Try later."});
        return;
      }
      const result = act(account, body, req, from, res);
      // too many wrong passwords on this page: it is signed out.
      if (!result.deleted && wrongPasswords.blocked(account.id)) {
        signOutOthers(account, null);
        res.setHeader("Set-Cookie", cookieHeader("", 0));
        reply(401, {error: "Too many wrong passwords. Sign in again."});
        return;
      }
      if (result.deleted) {
        res.setHeader("Set-Cookie", cookieHeader("", 0));
      }
      reply(result.ok ? 200 : 400, result.ok && !result.deleted ? {...result, account: profile(account, from)} : result);
      return;
    }
    default:
      reply(404, {error: "not_found"});
  }
};

// called when an account's name changes or it is deleted: its page sessions end.
const forget = account => signOutOthers(account, null);

module.exports = {handle, forget, signedInAs};
