"use strict";

const {logText} = require("./logtext.js");
const accounts = require("./accounts.js");
const achievements = require("./achievements.js");
const adopt = require("./adopt.js");
const config = require("../config.js");
const colours = require("./colours.js");
const customItems = require("./customitems.js");
const roles = require("./roles.js");
const modlog = require("./modlog.js");
const playerItems = require("./playeritems.js");
const commandModule = require("./commands.js");
const limits = require("./limits.js");
const masterpieces = require("./masterpieces.js");
const defpacks = require("./defpacks.js");
const avatarHandlers = require("./avatars.js");
const badges = require("./badges.js");
const bans = require("./bans.js");
const devices = require("./devices.js");
const chatlog = require("./chatlog.js");
const chatFilter = require("./chatfilter.js");
const chatSpam = require("./chatspam.js");
const buddyModule = require("./buddies.js");
const dens = require("./dens.js");
const disguises = require("./disguises.js");
const ecardModule = require("./ecards.js");
const epicDens = require("./epicdens.js");
const itemHandlers = require("./items.js");
const minigameModule = require("./minigames.js");
const adventureModule = require("./adventures.js");
const moderationModule = require("./moderation.js");
const partyModule = require("./parties.js");
const petModule = require("./pets.js");
const reports = require("./reports.js");
const roomInfo = require("./roominfo.js");
const shopStock = require("./shopstock.js");
const signup = require("./signup.js");
const tradeHandlers = require("./trades.js");
const stubHandlers = require("./stubs.js");
const wallModule = require("./walls.js");
const worldItems = require("./worlditems.js");
const stats = require("./stats.js");
const {CURRENCIES, DIAMOND_TYPES, activeAvatar, avatarById, activePet, equippedBits, wornItems, lastSeenField, sendClothingRemoved} = require("./player.js");

// game logic behind the socket. field orders below mirror the client's
// parsers; the class that reads each message is named next to it.

const GENERIC_LIST_AVATARS = 64;
const GENERIC_LIST_NEWSPAPER = 627;
// the worlds' names (ServerSelector.getShardName): localization ids, the
// game's own river names, world N being the Nth.
const GENERIC_LIST_WORLD_NAMES = 16;
const WORLD_NAME_IDS = Array.from({length: 29}, (_, i) => 551 + i);
// the settings menu's "Find Open World" switch (gui.MySettings
// SETTINGS_AUTO_SERVER_TRAVEL): a set bit is off. on, a room that is full in
// the player's world is joined in another world that has space.
const SETTING_FIND_OPEN_WORLD = 3;
const USER_VAR_NEWSPAPER_READ = 455;
const USER_VAR_GEM_BONUS = 214;
// not one of the game's: the patched client's "hide blocked players" setting
// (gui.MySettings), kept with the user vars so it reaches the client at login.
const USER_VAR_HIDE_BLOCKED = 9001;
// "Graphics" in the game's settings menu: 1 Default (smooth graphics off),
// 2 Smooth, unset for the server's default (config.smooth).
const USER_VAR_GRAPHICS = 9003;
const GENERIC_LIST_WORLD_ITEMS = 583;
const DEF_PET_FOOD = 1062;
const DEF_PET_TOY = 1063;
// the two exchange counters: gems for tickets (114), diamonds for gems (169).
const CURRENCY_GEMS = 0;
const CURRENCY_DIAMONDS = 3;
const EXCHANGE_LIST_PAID_WITH = new Map([[114, CURRENCY_GEMS], [169, CURRENCY_DIAMONDS]]);
// the phrase menus ("safe chat": SafeChatManager) of the chat bar (47),
// Jam-A-Grams and reports (66), the photo booth (158), adventures (170) and
// Jammer Walls (333). an entry is the id of a localization string holding
// one menu, a phrase to a line; when the first line ends in "..." the rest
// complete it. which menus each list had is not in any file; these are the
// game's own menu strings, sorted by what they are evidently for. the lists
// must not be empty: the Jam-A-Gram window reads the first phrase of 66.
const range = (first, last) => Array.from({length: last - first + 1}, (_, i) => first + i);
const DEF_NAMEBAR_BADGE = 1049;
const GENERIC_LIST_GAMES = 341; // GameJoinPopup: game def ids
const SAFE_CHAT_LISTS = new Map([
  [47, [36, 22, 23, 24, 25, 33, 26, 30, 29, 31, 32, 34, 35, 28]],
  [66, [1759, 1760, 1769, 1758, 1761, 1762, 1763, 1764, 1765, 1768, 1767, 1770, 1771, 3126, 1766]],
  [158, [36, 26, 33]],
  [170, [...range(3549, 3556), ...range(3585, 3592)]],
  [333, [27, 36, 25, 33, 26, 28]],
]);
// the client shows a cut-down party list to accounts less than a day old
// (PartyPopup) and a "refer a friend" button to ones older than three
// (BuddyList). neither is wanted, so every account says it is two days old.
const ACCOUNT_AGE_SHOWN_SECONDS = 2 * 86400;
const MOTD_SETTING = "motd";
const MAX_ANNOUNCEMENT = 300;
const RECENT_CHAT_LINES = 15;
// bit flags for tutorials already seen: the den editor's and den shop's
// talking prompts (379) and the trade list help boxes (129). every bit is kept
// set so none of them ever shows. for these two the client sends the number
// of the bit to set, not a new value (UserVarCache.isBitSet).
const USER_VAR_DEN_TUTORIAL = 379;
const USER_VAR_TRADE_TUTORIAL = 129;
const TUTORIALS_ALL_SEEN = 65535;
const BIT_FLAG_VARS = [USER_VAR_DEN_TUTORIAL, USER_VAR_TRADE_TUTORIAL];
// the settings menu's switches, a bit each (gui.MySettings): the client sends
// the bit's number and 1 to set it or 0 to clear it. unset is -1, every bit clear.
const USER_VAR_SETTINGS = 363;
const GEM_BONUS_NEVER_DUE = 65535;
// pets the pet picker must not offer (PetCreator.onNotViewablePetDefsLoaded); none here.
const GENERIC_LIST_HIDDEN_PETS = 574;
// word lists for the animal (first, second, third word) and pet (first,
// second) name pickers. entries are localization string ids; the id ranges
// were read off the English localization defPack, where each list sits in one
// alphabetical block.
const NAME_LISTS = new Map([
  [200, [15136, 15223]],
  [202, [15224, 15298]],
  [203, [15299, 15385]],
  [205, [15386, 15427]],
  [206, [15428, 15475]],
]);
const DEF_ITEM = 1000;
const DEF_PET = 1046;
const DEF_DEN_ITEM = 1030;
const DEF_COMBINED_LIST = 1060;
const DEF_DEN_ROOM = 1040;
const DEF_CURRENCY_EXCHANGE = 1051;
const DEF_DIAMOND = 1054;
const SHOP_LIST_TYPES = [DEF_ITEM, DEF_DEN_ITEM, DEF_DEN_ROOM, DEF_COMBINED_LIST, DEF_CURRENCY_EXCHANGE, DEF_DIAMOND];
// diamond lists the client reads at login to learn which animals and pets
// cost diamonds. they stay empty: animals and pets are free here.
const DIAMOND_ANIMAL_AND_PET_LISTS = [166, 214, 293];
// the Diamond Shop's two den displays ("one" and "two" in its room file).
// taken for the dens sold for diamonds: nothing else in the room is.
const DIAMOND_DEN_LIST = 196;
const LANG_ENG = 0;
const IDLE_ANIM_LAND = 14;
const IDLE_ANIM_OCEAN = 29;
const MAX_PATH_POINTS = 12;
// Action messages are client-side animation names (":dance:", ":sitNW:",
// etc.). Keep the currently playing one only while the avatar is standing
// still, so someone who enters the room can see it once their client has
// created that avatar.
const ACTION_NAME = /^:[A-Za-z][A-Za-z0-9]*:$/;
const TYPED_NAME = /^[A-Za-z0-9][A-Za-z0-9 '.-]{0,19}$/; // an animal's or pet's name typed by its owner
const MAX_BLOCKED = 1000; // from the account page; the game's own button has no limit
const TYPED_CHAT_TYPES = ["0", "9"];
const MAX_CHAT_EXTRA = 100; // the field after a chat line's type
const MAX_USER_VARS = 2000;
const MAX_FILTER_WORDS = 100; // a player's own words for their chat filter
const MAX_FILTER_WORD = 30;
const LOGIN_BANNED = -15; // MainFrame.MSG_ID_LOGIN_BANNED
// MainFrame.MSG_ID_LOGIN_ACCT_MAINT: its popup (GamePlay.onWorldLogIn) shows
// localization string 11198, which lib/defpacks.js makes the "update your
// client" message. the official servers' account maintenance never happens
// here.
const LOGIN_OUTDATED = -12;

const THEME_PATH_PREFIX = "theme_"; // lib/http.js looks for this
const chatLines = limits.limiter(config.chatLinesPerWindow, config.chatWindowMs);
const online = new Map(); // lowercased username -> session
const rooms = new Map(); // "path.name#shard" -> room

// worlds (config.shards): a land room's name ends in "#<world>"; dens,
// parties and adventures have none and belong to no world. each player has
// a world (session.worldId), picked when they arrive and changed by walking
// into a room of another.
const worldOf = name => {
  const found = /#(\d+)$/.exec(name || "");
  return found && config.shards.some(shard => shard.id === Number(found[1])) ? Number(found[1]) : 0;
};
const worldName = id => (config.shards.find(shard => shard.id === id) || {name: `World ${id}`}).name;
const inWorld = id => [...online.values()].filter(session => session.worldId === id);
const findOpenWorld = account => !((Number((account.userVars || {})[USER_VAR_SETTINGS]) >> SETTING_FIND_OPEN_WORLD) & 1)
  || Number((account.userVars || {})[USER_VAR_SETTINGS]) < 0;
let nextRoomId = 100;

const others = session => session.room ? [...session.room.sessions].filter(s => s !== session) : [];

// blocking. A player who blocked another never gets their chat, cannot be
// visited, written to or joined by them; with their "hide blocked players"
// setting on, they do not get that player's animal drawn at all.
const nameKey = account => account.username.toLowerCase();
const blocks = {
  has: (blocker, target) => blocker.blocked.includes(nameKey(target)),
  either: (a, b) => a.blocked.includes(nameKey(b)) || b.blocked.includes(nameKey(a)),
};
// staff gone invisible (setInvisible, below) are drawn for staff only.
const sees = (viewer, subject) => (!subject.invisible || roles.isActiveStaff(viewer.account))
  && !(viewer.account.hideBlocked && blocks.has(viewer.account, subject.account));
// everyone else in the room who should hear about this player's animal.
const watchers = session => others(session).filter(other => sees(other, session));
const TYPING_EVERY_MS = 2000; // "typing" passed on at most this often per player (xty)

// tags ("@name") in chat and on Jammer Walls (xmn): the longest player's
// name that the text after an "@" starts with, ending where a word does
// ("@John Smith hi" is John Smith if there is one, else John; "@Bobby" is
// never Bob). {length, name} or null.
const MAX_MENTION_TEXT = 40;
const MAX_MENTIONS = 10; // per question
const mentionLookups = limits.limiter(120, 60000); // questions a minute, per player
const mentionOf = text => {
  for (let length = Math.min(text.length, MAX_MENTION_TEXT); length > 0; length--) {
    if (length < text.length && /[A-Za-z0-9]/.test(text[length])) {
      continue;
    }
    const name = accounts.nameOf(text.slice(0, length));
    if (name) {
      return {length, name};
    }
  }
  return null;
};

const decodeEntities = text => text
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&apos;/g, "'")
  .replace(/&quot;/g, '"')
  .replace(/&amp;/g, "&");

// GamePlay.onWorldLogIn
const loginParams = session => {
  const {account} = session;
  const params = {
    userId: session.id,
    userName: account.username,
    dbUserId: account.id,
    uuid: account.uuid,
    accountType: account.accountType,
    accountTypeChanged: false,
    avName: activeAvatar(account).name,
    perUserAvId: activeAvatar(account).perUserAvId,
    activeDenRoomInvId: account.activeDen,
    activePetInvId: activeAvatar(account).petInvId,
    createdAt: Math.floor(Date.now() / 1000) - ACCOUNT_AGE_SHOWN_SECONDS,
    numLogins: account.numLogins,
    sessionId: session.id,
    jamaaDate: Math.floor(Date.now() / 86400000),
    // bit 0: tutorial finished, and what most name tag badges ask for. bit 2
    // unlocks the one badge that asks for more (defPack 1049,
    // pendingFlagsBit). bit 4 would force the "fast pass" avatar flow.
    // bit 1 is the "extended inventory" (more den items placed, bigger
    // inventories); the patched client counts to 5,000 of each either way
    // (shop.ShopManager).
    // from bit 8 up: the name tag badges the admin gave this account
    // (lib/badges.js).
    pendingFlags: 7 | badges.loginFlags(account),
    // this account's own staff role and what it allows (lib/roles.js), for a
    // client to show staff tools only to staff. empty for everyone else, and
    // only ever about the account logging in.
    staffRole: roles.isActiveStaff(account) ? roles.roleOf(account) : "",
    staffPermissions: roles.isActiveStaff(account) ? roles.permissionsOf(account).join(",") : "",
    dailyGiftIndex: -1,
    hasOnlineBuddies: buddies.hasOnlineBuddies(account),
    // one bit per kind of interaction (Utility.canBuddy, canTrade, canGift,
    // canChat, ...); everything is allowed.
    interactions: 1023,
    isGuide: account.isGuide,
    isModerator: account.isModerator,
    userNameModerated: 1,
    sgChatType: 1,
    sgChatTypeNonDegraded: 1,
    denPrivacySettings: account.denPrivacy,
    playerWallSettings: account.wall.privacy,
    // not 0: PlayerWallManager only opens walls for accounts with them on.
    webWallStatus: 1,
    eCardPrivacySettings: account.ecardPrivacy,
    // not empty: with neither address set, every fifth login opens a
    // "parent's email" window (GuiManager.showAjEmailBtn). accounts here
    // have no email.
    email: "-",
    pendingEmail: "",
    lastBroadcastMessage: "",
    numAJHQGiftCards: 0,
    numAJHQBulkGiftCards: 0,
    numRedemptionCards: ecards.redemptions(account),
    numUnreadECards: ecards.unread(account),
    numDaysLeftOnSubscription: account.membershipDays,
    subscriptionSourceType: 0,
    recyclePercentage: 0.3,
    usableAdoptAPetDefs: adopt.loginList(account),
    newspaperDefs: [],
  };
  for (const name of CURRENCIES) {
    account.currency[name] = Math.max(account.currency[name] || 0, config.minimumCurrency);
    params[`${name}Count`] = account.currency[name];
  }
  return params;
};

const loginFailed = (session, statusId, message) => {
  session.sendXtJson(-1, {_cmd: "login", status: "0", statusId, message, params: {}});
};

// SmartFoxClient.login: nick is "username%sessionId%language%deployVersion%
// platform%platformVersion%os%df" and pword is the auth token.
const login = (session, msg) => {
  if (new RegExp(`<login z='${signup.SIGNUP_ZONE}'>`).test(msg.raw)) {
    // guest login for the Create Account screens (SysHandler.handleLoginOk).
    session.signingUp = true;
    session.sendSys("logOK", 0, `<login id='${session.id}' mod='0' n=''/>`);
    return;
  }
  // one login to a socket: a second would leave the first account looking online.
  if (session.account) {
    session.close();
    return;
  }
  const username = (msg.cdata("nick") || "").split("%")[0];
  const account = accounts.byToken(msg.cdata("pword"));
  if (!account || account.username.toLowerCase() !== username.toLowerCase()) {
    console.log(`[world] login rejected for "${logText(username)}"`);
    loginFailed(session, 0, "Invalid login");
    return;
  }
  if (moderation.banRemaining(account) !== 0) {
    console.log(`[world] login rejected for banned account "${logText(account.username)}"`);
    loginFailed(session, LOGIN_BANNED, "Banned");
    return;
  }
  // A banned address (lib/bans.js). the client is told at /authenticate,
  // with the reason; this is for a game that got here another way.
  if (bans.addressBan(session.address)) {
    console.log(`[world] login rejected for "${logText(account.username)}" from a banned address`);
    loginFailed(session, LOGIN_BANNED, "Banned");
    return;
  }
  // a banned computer (lib/devices.js), and a game that never said which
  // computer it is on: told at /authenticate too, which is the way in.
  if (devices.banOfAccount(account)) {
    console.log(`[world] login rejected for "${logText(account.username)}": hardware banned`);
    loginFailed(session, LOGIN_BANNED, "Banned");
    return;
  }
  // a launcher that sent no device ids (before 1.3.0): signed in at
  // /authenticate, refused here, where the game's popup can say why.
  if (config.requireDevice && (devices.launcherOutdated(msg.cdata("pword"))
    || devices.knownFor(account).lastAt < Math.floor(Date.now() / 1000) - 90 * 86400)) {
    console.log(`[world] login rejected for "${logText(account.username)}": client outdated (no device ids)`);
    loginFailed(session, LOGIN_OUTDATED, "Client outdated");
    return;
  }
  // its username was rejected (lib/moderation.js): a new one first, which
  // the client or the account page asks for.
  if (account.nameRejected) {
    console.log(`[world] login rejected for "${logText(account.username)}": the name was rejected`);
    loginFailed(session, 0, "Username rejected");
    return;
  }
  // locked by its owner on the account page (lib/manage.js).
  if (account.locked) {
    console.log(`[world] login rejected for locked account "${logText(account.username)}"`);
    loginFailed(session, 0, "Account locked");
    return;
  }
  const key = account.username.toLowerCase();
  const existing = online.get(key);
  if (existing && existing !== session) {
    existing.close();
    leaveWorld(existing);
  }
  session.account = account;
  accounts.hold(account);
  account.numLogins++;
  session.playingSince = Date.now();
  session.playStarted = Date.now();
  stats.login(account, account.numLogins === 1);
  accounts.recordLogin(account, "game", session.address);
  account.lastLogin = Math.floor(Date.now() / 1000);
  session.recentChat = [];
  session.greeted = false;
  session.arrived = false; // not yet put in a first room
  if (account.randomTheme) {
    const names = Object.keys(config.themes);
    account.theme = names[Math.floor(Math.random() * names.length)];
  }
  account.pets.forEach(pets.giveCharacter);
  adopt.dailyFind(account);
  // before the session is findable, so that nothing is sent ahead of the
  // login reply.
  achievements.refresh(account);
  accounts.save(account);
  online.set(key, session);
  console.log(`[world] ${logText(account.username)} logged in as sfs user ${logText(session.id)}`);
  session.sendXtJson(-1, {_cmd: "login", status: "1", params: loginParams(session)});
  // every custom colour, before anything that might be drawn with one
  // (XtReplyDemuxer -> PaletteHelper.handleCustomColors in the patched SWF).
  for (const chunk of colours.chunks()) {
    session.sendXt("xcc", -1, chunk.length, ...chunk.flat());
  }
  // and the items staff have made (lib/customitems.js), for a game started
  // before they were.
  customItems.sendAll(session);
  // staff: their role and what it allows, for the patched client's staff
  // window (AJClient.onStaff). nobody else is sent anything.
  if (roles.isActiveStaff(account)) {
    session.sendXt("xsp", -1, roles.roleOf(account), roles.permissionsOf(account).join(","));
  }
  sendFilter(session);
  buddies.announce(account);
};

// ItemXtCommManager.itemListResponse ("0": everything the player owns, five
// fields per item) / itemsInUseResponse ("1": what one animal is wearing,
// three fields per item). both start with the animal's eyes and pattern.
const sendItemList = (to, target, full, perUserAvId) => {
  const {account} = target;
  const avatar = avatarById(account, perUserAvId);
  const items = full
    ? account.items.flatMap(item => [item.def, item.inv, item.color, equippedBits(item, account), 0])
    : wornItems(account, avatar).flatMap(item => [item.def, item.inv, item.color]);
  const count = full ? account.items.length : wornItems(account, avatar).length;
  to.sendXt("il", -1, full ? "0" : "1", 0, avatar.perUserAvId, account.username, avatar.eyes, avatar.pattern, count, ...items);
};

// lBits, uBits, eBits, name, createdTs, personality, favourite toy, favourite food
const petFields = pet => pet
  ? [pet.lBits, pet.uBits, pet.eBits, pet.name, pet.createdAt, pet.personality || 0, pet.toy || 0, pet.food || 0]
  : [0, 0, 0, "", 0, 0, 0, 0];

// AvatarXtCommManager.avatarDataResponse
const sendAvatarData = (to, target, perUserAvId) => {
  const {account} = target;
  const avatar = avatarById(account, perUserAvId);
  const enviroType = target.room ? target.room.enviroType : 0;
  const head = [
    account.username, account.uuid,
    account.nameBarData,
    enviroType,
    1, // userNameModeratedFlag
    parties.timeLeft(account), // timeLeftHostingCustomParty
    lastSeenField(account, Boolean(findOnline(account.username))), // daysSinceLastLogin: see lib/player.js
    avatar.perUserAvId, avatar.type, avatar.customAvId,
    ...avatar.colors,
    avatar.name,
    avatar.questLevel || 0, // the admin sets it: setQuestLevel
  ];
  const tail = to === target
    // avInvId, landPetInvId, oceanPetInvId, attackBase, attackMax, defenseBase, defenseMax, healthBase
    ? [avatar.avInvId, avatar.petInvId, avatar.petInvId, 0, 0, 0, 0, 100]
    // pet lBits, uBits, eBits, name
    : petFields(activePet(account)).slice(0, 4);
  to.sendXt("ad", -1, ...head, ...tail);
};

// AvatarManager.avatarCreateResponse: puts `target` on `to`'s screen.
const sendAvatarCreate = (to, target) => {
  const {account, room} = target;
  const avatar = activeAvatar(account);
  const pet = activePet(account);
  to.sendXt("ac", room.id,
    target.id, target.pos.x, target.pos.y,
    room.enviroType === 0 ? IDLE_ANIM_LAND : IDLE_ANIM_OCEAN,
    account.username, account.uuid,
    avatar.perUserAvId, avatar.name, avatar.type, avatar.customAvId,
    ...avatar.colors,
    avatar.questLevel || 0,
    1, // userNameModeratedFlag
    lastSeenField(account, Boolean(findOnline(account.username))), // daysSinceLastLogin: see lib/player.js
    // optional-field flags: bit 0 accountType, bit 1 nameBarData, bit 2 pet,
    // bit 3 a blend colour (none: 0), bit 4 guide (the name tag and bubble
    // every client draws for a guide)
    3 | (pet ? 4 : 0) | (account.isGuide ? 24 : 0),
    account.accountType,
    account.nameBarData,
    ...(pet ? petFields(pet) : []),
    ...(account.isGuide ? [0, 1] : []));
  sendItemList(to, target, false);
  disguises.show(to, target);
  if (target.invisible) {
    to.sendXt("xiv", -1, target.id, 1);
  }
  if (pets.inPetForm(account)) {
    to.sendXt("uc", room.id, target.id, "on", "13");
  }
  // `ac` only creates the avatar. Actions normally travel as live `uc`
  // type-3 packets, so replay a standing player's current action after `ac`
  // for a player who has just entered (or reloaded) the room.
  if (target.activeAction) {
    to.sendXt("uc", room.id, target.id, target.activeAction.name, "3", target.activeAction.extra);
  }
  minigames.showBubble(to, target);
};

// redraws `session`'s animal for everyone else in the room, for changes the
// protocol has no dedicated broadcast for (colours).
const refreshForOthers = session => {
  if (!session.pos) {
    return;
  }
  for (const other of watchers(session)) {
    other.sendXt("ar", session.room.id, session.id);
    sendAvatarCreate(other, session);
  }
};

const denRoomsForSale = () => defpacks.denRoomIds().filter(id => defpacks.denRoomName(id));

// the Summer Carnival's three shops sell what is priced in tickets, and
// nobody else does: clothing, den items, and the plushie stand.
const CURRENCY_TYPE_TICKETS = "1";
const TICKET_SHOPS = new Map([[101, "clothing"], [165, "denItems"], [102, "plushies"]]);
let stock = null;
const sortStock = () => {
  if (!stock) {
    const forTickets = def => def.currencyType === CURRENCY_TYPE_TICKETS;
    const clothing = defpacks.clothingIds();
    const denItems = defpacks.denItemIds().filter(id => !defpacks.unsoldDenItemIds().includes(id));
    const ticketDenItems = denItems.filter(id => forTickets(defpacks.denItemDef(id)));
    const isPlushie = id => /plush/i.test(defpacks.denItemDef(id).abbrName);
    stock = {
      clothing: clothing.filter(id => forTickets(defpacks.itemDef(id))),
      denItems: ticketDenItems.filter(id => !isPlushie(id)),
      plushies: ticketDenItems.filter(isPlushie),
    };
  }
  return stock;
};
// two out-of-the-way shops keep what was never in one: the shop in the
// Chamber of Knowledge's base (reached from a hidden spot on the world map)
// has the den items, the one in the Zios archives the clothing. see
// oddDenItemIds in lib/defpacks.js.
const ODDITY_SHOPS = new Map([[396, () => defpacks.oddDenItemIds()], [666, () => defpacks.oddClothingIds()]]);
// the items staff have made (lib/customitems.js) are sold there too, first.
const CUSTOM_ITEM_SHOPS = new Map([[396, "den"], [666, "clothing"]]);
const ticketStock = kind => sortStock()[kind];
// the den shops of the lands (Coral Canyons, Deep Blue) and the one inside
// a den: lists that mix kinds, selling den rooms.
const DEN_SHOP_LISTS = [213, 375, 384];

// AchievementXtCommManager.getUserVarsResponse: [count, (varId, type, value)...]
const sendUserVars = session => {
  const vars = session.account.userVars;
  // there is no newspaper on this server; a "last read" time stops the
  // client opening an empty one at every login (NewspaperManager).
  if (vars[USER_VAR_NEWSPAPER_READ] === undefined) {
    vars[USER_VAR_NEWSPAPER_READ] = Math.floor(Date.now() / 1000);
  }
  // likewise the daily gem-bonus wheel: GuiManager.guiStartupChecks spins it
  // when the low 16 bits of this var (the day it was last spun) are before
  // today's jamaaDate. the far-future day keeps it shut.
  vars[USER_VAR_GEM_BONUS] = GEM_BONUS_NEVER_DUE;
  vars[USER_VAR_DEN_TUTORIAL] = TUTORIALS_ALL_SEEN;
  vars[USER_VAR_TRADE_TUTORIAL] = TUTORIALS_ALL_SEEN;
  vars[USER_VAR_HIDE_BLOCKED] = session.account.hideBlocked ? 1 : 0;
  const entries = Object.entries(vars);
  // smooth graphics off by default: told to the client as "Graphics:
  // default", and kept nowhere, so the default can change back.
  if (!config.smooth && !(Number(vars[USER_VAR_GRAPHICS]) > 0)) {
    entries.push([String(USER_VAR_GRAPHICS), 1]);
  }
  session.sendXt("zg", -1, entries.length, ...entries.flatMap(([id, value]) => [id, 0, value]));
};

const findOnline = username => online.get(String(username).toLowerCase());
const STAFF_WINDOW_COMMANDS = ["warn", "unwarn", "message", "silence", "kick", "summon", "goto", "warnings", "reject"];
const MAX_STAFF_WINDOW_WORDS = 3; // username, then a reason, hours or the message (each one field)

// a custom colour (lib/colours.js) for these four RGB values, made if it is
// new and the account has not made its day's worth; everyone online is told
// of a new one before anybody can be given it, and `asker` (a session) of an
// old one. returns what colours.allocate does.
const makeColour = (account, rgbs, asker = null) => {
  const today = Math.floor(Date.now() / 86400000);
  const made = account.coloursMade && account.coloursMade.day === today ? account.coloursMade.count : 0;
  const entry = colours.allocate(rgbs, made < config.customColoursPerDay);
  if (!entry || entry.full) {
    return entry;
  }
  if (entry.created) {
    account.coloursMade = {day: today, count: made + 1};
    accounts.save(account);
  }
  for (const recipient of entry.created ? online.values() : asker ? [asker] : []) {
    recipient.sendXt("xcc", -1, 1, entry.id, ...entry.rgbs);
  }
  return entry;
};

// a message for every game playing (custom items, lib/customitems.js).
customItems.connect((cmd, ...params) => {
  for (const session of online.values()) {
    session.sendXt(cmd, -1, ...params);
  }
});

// the account's chat filter, for its game to apply: [chosen, level, mode, own words].
const sendFilter = session => {
  const {filter} = session.account;
  session.sendXt("xfl", -1, filter.chosen ? 1 : 0, filter.level, filter.mode, filter.words);
};

// the player called `username` as the senders above take one: their session
// when they are playing, else just their account. A player's card can be
// opened for anybody (the buddy list, the player search), and it asks for
// their animals and what those wear whether or not they are in the game.
const findPlayer = username => {
  const account = accounts.byName(username);
  return findOnline(username) || (account ? {account, room: null} : null);
};

const handlers = {
  // KeepAlive: no reply expected.
  ka() {},

  // the chat filter's window in the patched client (AJClient.saveChatFilter):
  // [level, mode, the player's own words with commas between]. kept with
  // the account and sent back, which is what takes effect in their game.
  // the filtering is all theirs: nothing here reads chat for it.
  xfl(session, roomId, [level, mode, ...words]) {
    const own = words.join(",").split(/[\s,]+/).map(word => word.replace(/[^\p{L}\p{N}@$*'-]/gu, "").slice(0, MAX_FILTER_WORD))
      .filter(Boolean).slice(0, MAX_FILTER_WORDS);
    session.account.filter = {level: [0, 1, 2].includes(Number(level)) ? Number(level) : 0, mode: Number(mode) === 1 ? 1 : 0,
      words: [...new Set(own)].join(","), chosen: true};
    accounts.save(session.account);
    sendFilter(session);
  },

  // the patched client's hex colour picker (gui.ColorTable): [rgb1, rgb2,
  // rgb3, rgb4], the four colours of one layer. everyone online is told the
  // entry's id, the asker included, who then uses it as that layer's colour.
  // A colour somebody made before is anybody's to use; a new one counts
  // against the day's allowance of whoever asks (config.customColoursPerDay).
  xcc(session, roomId, params) {
    const entry = makeColour(session.account, params.slice(0, 4).map(Number), session);
    if (entry && entry.full) {
      tell(session, "No more new colours today. Colours made before can still be used.");
    }
  },

  // AvatarXtCommManager.avatarListResponse. the animal in use is listed first.
  al(session, roomId, [username]) {
    const target = findPlayer(username);
    if (!target) {
      session.sendXt("al", -1, username, 0);
      return;
    }
    const {account} = target;
    const active = activeAvatar(account);
    const avatars = [active, ...account.avatars.filter(avatar => avatar !== active)];
    if (target === session) {
      // 0xFFFFFFFF marks every avatar slot as available (AvatarSwitch.availSlotFlags).
      session.sendXt("al", -1, account.username, 4294967295, account.uuid, avatars.length,
        ...avatars.flatMap(avatar => [avatar.perUserAvId, avatar.avInvId, avatar.name, avatar.type, avatar.customAvId]));
    }
    else {
      session.sendXt("al", -1, account.username, avatars.length, ...avatars.map(avatar => avatar.perUserAvId));
    }
  },

  // [username, perUserAvId, "0" no items | "1" full item list | "2" items in use]
  ad(session, roomId, [username, perUserAvId, itemFlag]) {
    const target = findPlayer(username);
    if (!target) {
      return;
    }
    sendAvatarData(session, target, perUserAvId);
    if (itemFlag === "1" || itemFlag === "2") {
      sendItemList(session, target, itemFlag === "1" && target === session, perUserAvId);
    }
  },

  // [username, perUserAvId, "1" full list | "0" items in use]
  il(session, roomId, [username, perUserAvId, full]) {
    const target = findPlayer(username);
    if (target) {
      sendItemList(session, target, full === "1" && target === session, perUserAvId);
    }
  },

  // AvatarManager.processQueuedPositions / updateAvatar:
  // [count, x1, y1, ..., animAndFlip, teleport]
  au(session, roomId, params) {
    if (!session.room) {
      return;
    }
    const count = Number(params[0]);
    const coords = params.slice(1, 1 + count * 2).map(Number);
    if (!Number.isInteger(count) || count < 1 || count > MAX_PATH_POINTS
      || coords.length !== count * 2 || !coords.every(Number.isInteger)) {
      return;
    }
    const teleport = params[params.length - 1] === "1" ? 1 : 0;
    const firstUpdate = !session.pos;
    session.pos = {x: coords[coords.length - 2], y: coords[coords.length - 1]};
    // Walking, swimming, or a teleport replaces a looping action on every
    // client. Do not replay it to somebody entering later.
    delete session.activeAction;
    if (!session.greeted) {
      // the first room has loaded: the client can show a popup now.
      session.greeted = true;
      const motd = accounts.setting(MOTD_SETTING);
      if (motd) {
        tell(session, motd);
      }
      if (session.account.guideRefused) {
        session.sendXt("xtl", -1, "Guide is only for players the Burrow team has made guides.");
      }
      buddies.greet(session);
      minigames.greet(session);
      moderation.greet(session);
      // never asked what chat they want filtered: the window is put to
      // them, this once (the patched client's "xfa").
      if (!session.account.filter.chosen) {
        session.sendXt("xfa", -1, 1);
      }
    }
    if (firstUpdate) {
      // the player's own animal is on their screen now: its disguise, if any,
      // and see-through if they are invisible.
      disguises.show(session, session);
      if (session.invisible) {
        session.sendXt("xiv", -1, session.id, 1);
      }
    }
    for (const other of watchers(session)) {
      if (firstUpdate) {
        // nobody could see this avatar until it reported where it spawned.
        sendAvatarCreate(other, session);
      }
      else {
        other.sendXt("au", session.room.id, 1, session.id, count, ...coords, teleport);
      }
    }
  },

  // GenericListXtCommManager.handleNewData: [listId, entryType, 4 unused
  // fields, count, ...entries]. the entry type comes from the list-type
  // defPack. list contents live on the official servers, so apart from the two
  // kinds that can be rebuilt from defPacks every list is answered empty; that
  // still releases whatever the client had waiting on it.
  // the settings menu's world list (ServerSelector, GamePlay.showServerSelectorMore):
  // a node's name, then each world as id, language, how full (0 to 4, 4
  // being full) and how many of the player's buddies are in it. the game
  // leaves out the world the player is in.
  rm(session) {
    const fields = [];
    const capacity = config.spawnRooms.length * config.maxUsersPerRoom;
    for (const shard of config.shards) {
      const here = inWorld(shard.id);
      const full = config.spawnRooms.every(base => roomFull(`${base}#${shard.id}`));
      const bars = full ? 4 : Math.min(3, Math.ceil(4 * here.length / capacity));
      const buddyCount = here.filter(other => session.account.buddies.includes(other.account.username.toLowerCase())).length;
      fields.push(shard.id, LANG_ENG, bars, buddyCount);
    }
    session.sendXt("rm", -1, "burrow", ...fields);
  },

  gl(session, roomId, [listId]) {
    if (Number(listId) === GENERIC_LIST_NEWSPAPER) {
      // the client decides whether to pop the newspaper open when this list
      // arrives, from the "last read" user var, so its saved vars must get
      // there first. it never asks for them; the server pushes them.
      sendUserVars(session);
    }
    const type = defpacks.listType(listId);
    if (type === undefined) {
      unhandled("gl", [listId]);
      return;
    }
    let entries = [];
    let count;
    if (Number(listId) === GENERIC_LIST_AVATARS) {
      entries = defpacks.avatarTypes();
    }
    else if (Number(listId) === GENERIC_LIST_WORLD_NAMES) {
      entries = WORLD_NAME_IDS;
    }
    else if (defpacks.patternList(listId)) {
      entries = defpacks.patternList(listId);
    }
    else if (parties.list(listId)) {
      // the hosted-party window: party rooms, its three name wheels, music.
      entries = parties.list(listId);
    }
    else if (ecards.list(listId)) {
      // Jam-A-Gram cards or stamps, as (mediaId, name) pairs.
      entries = ecards.list(listId);
      count = entries.length / 2;
    }
    else if (Number(listId) === pets.PERSONALITY_LIST) {
      entries = pets.personalityList();
    }
    else if (type === DEF_PET_FOOD || type === DEF_PET_TOY) {
      // what a kind of pet may favour, as (defId, name string id) pairs.
      entries = pets.favouritesList(type, listId);
      count = entries.length / 2;
    }
    else if (type === DEF_CURRENCY_EXCHANGE) {
      const paidWith = EXCHANGE_LIST_PAID_WITH.get(Number(listId));
      entries = defpacks.exchangeDefs().filter(def => paidWith === undefined || def.costType === paidWith).map(def => def.id);
    }
    else if (Number(listId) === GENERIC_LIST_WORLD_ITEMS) {
      entries = worldItems.usable(session.account);
    }
    else if (type === DEF_NAMEBAR_BADGE) {
      // every badge, in id order: a name tag names its badge by its place
      // in this list (NameBar.setBadgeIcon).
      entries = defpacks.badgeIds();
    }
    else if (Number(listId) === GENERIC_LIST_GAMES) {
      entries = minigames.library();
    }
    else if (adventures.list(listId)) {
      entries = adventures.list(listId);
    }
    else if (masterpieces.frameList(listId)) {
      // the frames a painting can be given, as (mediaId, name) pairs.
      entries = masterpieces.frameList(listId);
      count = entries.length / 2;
    }
    else if (SAFE_CHAT_LISTS.has(Number(listId))) {
      entries = SAFE_CHAT_LISTS.get(Number(listId));
    }
    else if (walls.list(listId)) {
      // wallpapers and stickers, as (mediaId, name) pairs.
      entries = walls.list(listId);
      count = entries.length / 2;
    }
    else if (NAME_LISTS.has(Number(listId))) {
      const [first, last] = NAME_LISTS.get(Number(listId));
      entries = Array.from({length: last - first + 1}, (_, i) => first + i);
    }
    else if (TICKET_SHOPS.has(Number(listId))) {
      entries = ticketStock(TICKET_SHOPS.get(Number(listId)));
    }
    else if (ODDITY_SHOPS.has(Number(listId))) {
      // what the shop really sold comes first.
      const real = shopStock.list(listId, type);
      entries = [...new Set([...defpacks.customShopIds(CUSTOM_ITEM_SHOPS.get(Number(listId))), ...(real ? real.entries : []), ...ODDITY_SHOPS.get(Number(listId))()])];
    }
    else if (Number(listId) === DIAMOND_DEN_LIST) {
      entries = defpacks.diamondIds().filter(id => {
        const def = defpacks.diamondDef(id);
        return def.type === DIAMOND_TYPES.denRoom && denRoomsForSale().includes(Number(def.refId));
      });
    }
    else if (shopStock.list(listId, type)) {
      // A shop whose shelves the AJ Classic Wiki records: lib/shopstock.js.
      ({entries, count} = shopStock.list(listId, type));
    }
    else if (type === DEF_DEN_ROOM) {
      // every den shop sells every den room.
      entries = denRoomsForSale();
    }
    else if (type === DEF_COMBINED_LIST) {
      // A shop mixing kinds of item: [kinds, count per kind, entries of
      // each kind in turn] (ItemXtCommManager.setupShopItemObject). the den
      // shops get every den room. any other is a shop nothing is known of,
      // and gets one kind with nothing in it: a reply with no kinds at all
      // would leave the shop on its loading spinner for good.
      const rooms = DEN_SHOP_LISTS.includes(Number(listId)) ? denRoomsForSale() : [];
      count = Math.max(rooms.length, 1);
      entries = rooms.length > 0 ? [DEF_DEN_ROOM, rooms.length, ...rooms] : [DEF_DEN_ITEM, 0];
    }
    // A clothing, den item or diamond shop that gets here is one no record
    // was found of. its shelves are empty: the owner would have that
    // rather than things it never sold.
    else if (type === DEF_PET && Number(listId) !== GENERIC_LIST_HIDDEN_PETS) {
      // GenericListXtCommManager.handlePetResponse: (petDefId, available) pairs
      count = defpacks.petIds().length;
      entries = defpacks.petIds().flatMap(id => [id, 1]);
    }
    // for shops the first unused field is the title's string id; left empty
    // it keeps the shop window's own title (Shop.gotItemListCallback).
    const title = SHOP_LIST_TYPES.includes(type) ? (session.room ? roomInfo.shopTitle(session.room.base, listId) : "") : 0;
    session.sendXt("gl", -1, listId, type, title, 0, 0, 0, count === undefined ? entries.length : count, ...entries);
  },

  // DenXtCommManager.requestDenJoinFull: ["den<owner>", confirmLanguage, ?]
  dj(session, roomId, [roomName]) {
    joinDen(session, String(roomName));
  },

  // AchievementXtCommManager.requestSetUserVar: [varId, value, ?]. the reply
  // (setUserVarResponse) is [varId, value, newAchievementCount].
  zs(session, roomId, [id, value, set]) {
    if (!/^\d{1,4}$/.test(id) || !Number.isFinite(Number(value))) {
      return;
    }
    const {account} = session;
    const vars = account.userVars;
    // the game's own vars and this server's are all below 10,000, and there
    // are a few hundred of them: an account does not get to keep more.
    if (vars[id] === undefined && Object.keys(vars).length >= MAX_USER_VARS) {
      return;
    }
    if (Number(id) === USER_VAR_HIDE_BLOCKED) {
      setHideBlocked(session, Number(value) === 1);
    }
    else if (BIT_FLAG_VARS.includes(Number(id))) {
      vars[id] = TUTORIALS_ALL_SEEN;
    }
    else if (Number(id) === USER_VAR_SETTINGS) {
      const bit = Number(value);
      if (!Number.isInteger(bit) || bit < 0 || bit > 30) {
        return;
      }
      const bits = Math.max(0, Number(vars[id]) || 0);
      vars[id] = set === "0" ? bits & ~(1 << bit) : bits | (1 << bit);
    }
    else if (achievements.counts(id)) {
      // A var that achievements count in: the games report "one more" as 1
      // and a best score as the score, and the official server knew which
      // each var was. here 1 adds one and anything else only ever raises it.
      const current = Number(vars[id]) || 0;
      vars[id] = Number(value) === 1 ? current + 1 : Math.max(current, Number(value));
    }
    else if (!achievements.SERVER_VARS.has(Number(id))) {
      // the counters the server keeps itself are not the client's to set.
      vars[id] = Number(value);
    }
    if (vars[id] === undefined) {
      vars[id] = 0;
    }
    const earned = achievements.award(account, id);
    accounts.save(account);
    achievements.sendVar(session, id, earned);
  },

  zg(session) {
    sendUserVars(session);
  },

  // ReportAPlayer -> FacilitatorXtCommManager: [username, reasonId]. the
  // reply (facilitatorReportAPlayerResponse) is [success].
  fr(session, roomId, [username, reason]) {
    session.sendXt("fr", -1, fileReport(session, username, reason) ? 1 : 0);
  },

  // the same about a wall post or a Jam-A-Gram: [username, reasonId, what
  // (7 wall post, 8 Jam-A-Gram), the post or message].
  fra(session, roomId, [username, reason, what, ...data]) {
    const about = `${what === "7" ? "Jammer Wall post" : "Jam-A-Gram"}: ${data.join("%")}`;
    session.sendXt("fra", -1, fileReport(session, username, reason, "", about) ? 1 : 0);
  },

  // the staff's window of the patched client (AJClient.openModerate):
  // [command, username, ...words], one of the staff commands about a player,
  // run as if typed (lib/commands.js checks the permission and logs it).
  xmd(session, roomId, [command, ...words]) {
    if (roles.isActiveStaff(session.account) && STAFF_WINDOW_COMMANDS.includes(command) && words.length > 0 && words.length <= MAX_STAFF_WINDOW_WORDS) {
      commands.run(session, `!${command} ${words.join(" ")}`);
    }
  },

  // The host/event overlay only sends one of these fixed room effects.  Its
  // permission check lives here as well, so a forged client packet cannot
  // change a room.
  xrc(session, roomId, [effect]) {
    const choice = String(effect || "").toLowerCase();
    if (roles.isActiveStaff(session.account) && roles.can(session.account, "room.effects")
      && ["small", "normal", "big", "rainbow", "clear"].includes(choice)) {
      commands.run(session, `!roomfx ${choice}`);
    }
  },

  // The browser host renders the YouTube iframe; the game receives only a
  // validated video id and keeps it shared by the people in this theatre.
  xtv(session, roomId, [action, value = ""]) {
    const {room} = session;
    // Some theatre maps report an internal room path which has no "theatre"
    // in it (the visible room title does). Staff permission is the boundary;
    // restricting by that unreliable path made Play for room silently fail.
    if (!roles.isActiveStaff(session.account) || !roles.can(session.account, "theater.control") || !room) {
      return;
    }
    let videoId = "";
    if (action === "play") {
      const text = String(value).trim();
      const match = text.match(/^(?:[A-Za-z0-9_-]{11}|(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?:[?&#].*)?)$/i);
      videoId = match ? (match[1] || text) : "";
      if (!videoId) {
        session.sendXt("xtl", -1, "Paste a YouTube watch, share, or embed link.");
        return;
      }
    }
    else if (action !== "stop") {
      return;
    }
    room.theatreVideo = videoId;
    for (const viewer of room.sessions) {
      viewer.sendXt("xtv", room.id, videoId);
    }
    modlog.record(session.account.username, videoId ? "played theatre video" : "stopped theatre video", "", room.name);
  },

  // the patched client's chat box: whether its player is typing, for a
  // "..." over their animal in everyone else's game (gui.ChatHistory):
  // xty [1 | 0], passed on as "xty" [.., .., sfsId, 1 | 0]. a client says
  // it again every few seconds while typing; more often is not passed on.
  xty(session, roomId, [on]) {
    const typing = on === "1";
    const now = Date.now();
    if (!session.room || session.invisible || (typing && session.typingAt && now - session.typingAt < TYPING_EVERY_MS)
      || (!typing && !session.typingAt)) {
      return;
    }
    session.typingAt = typing ? now : 0;
    for (const other of watchers(session)) {
      other.sendXt("xty", -1, session.id, typing ? 1 : 0);
    }
  },

  // the patched client's tags (AJClient.resolveMentions): xmn [id, the text
  // after each "@", ...] -> "xmn" [.., .., id, then for each text: how many
  // of its characters are a player's name (0 for none), the name as it is
  // spelled, 1 if they are online]. what a text is not a name of stays text.
  xmn(session, roomId, [id, ...texts]) {
    if (!mentionLookups.allow(session.account.id)) {
      return;
    }
    const reply = [];
    for (const text of texts.slice(0, MAX_MENTIONS)) {
      const found = mentionOf(String(text));
      reply.push(found ? found.length : 0, found ? found.name : "", found && findOnline(found.name) ? 1 : 0);
    }
    session.sendXt("xmn", -1, Number.isInteger(Number(id)) ? Number(id) : 0, ...reply);
  },

  // the patched client's staff window: going invisible, or being seen again.
  xiv(session) {
    if (session.invisible || roles.can(session.account, "staff.invisible")) {
      setInvisible(session, !session.invisible);
    }
  },

  // the patched report window (gui.ReportAPlayer), just before its "fr" or
  // "fra": [username, reasonId, what the reporter typed].
  xrd(session, roomId, [username, reason, ...text]) {
    fileReport(session, username, reason, text.join("%"));
  },

  // the answer to a yes-or-no box this server put up (ask, below): [id, "1" yes | "0" no].
  xyn(session, roomId, [id, answer]) {
    const asked = session.asked;
    session.asked = null;
    if (asked && asked.id === Number(id) && answer === "1") {
      asked.run();
    }
  },

  // A new name typed over an animal's or a pet's in the patched switcher
  // windows (gui.AvatarSwitcher, gui.PetInventory): ["a", perUserAvId, name]
  // or ["p", petInvIdx, name]. the reply is [kind, id, "1" | "0", name as it
  // now is]. A typed name is shown as it is; the game's own are word ids.
  xrn(session, roomId, [kind, id, ...words]) {
    const {account} = session;
    const wanted = words.join(" ").trim();
    const thing = kind === "a" ? account.avatars.find(avatar => avatar.perUserAvId === Number(id))
      : kind === "p" ? account.pets.find(pet => pet.inv === Number(id)) : null;
    // typed words others read: not while silenced.
    const ok = Boolean(thing) && TYPED_NAME.test(wanted) && !moderation.isSilenced(account);
    if (ok) {
      thing.name = wanted;
      accounts.save(account);
      if (kind === "a" && thing === activeAvatar(account)) {
        sendAvatarData(session, session, thing.perUserAvId);
      }
      if (thing === activeAvatar(account) || thing === activePet(account)) {
        refreshForOthers(session);
      }
    }
    session.sendXt("xrn", -1, kind, id, ok ? 1 : 0, thing ? thing.name : "");
  },

  // the patched player card (buddy.BuddyCard) asks whether the player it
  // shows is banned: [username]. the reply starts [username, seconds of ban
  // left | -1 permanent | 0 not banned], and the card draws a red "Banned"
  // label from it.
  xbn(session, roomId, [username]) {
    const account = accounts.byName(String(username));
    if (account) {
      // ... then when the account was made, for the card's "Joined" label,
      // their Discord username and their badges ("id|label,id|label"), for
      // the icons after the name, and their bio, for the Bio tab
      // (lib/badges.js).
      session.sendXt("xbn", -1, account.username, moderation.banRemaining(account), account.createdAt,
        account.discord, badges.cardField(account), cardBio(account));
    }
  },

  // VolumeSelector.handleRoomCountResponse: the head-count shown on each land
  // of the world map, as [count, (roomName, players)...].
  rc(session) {
    // the lands and their shops, as the map shows them: not dens, parties,
    // or anybody's adventure, whose names are nobody else's business.
    const counts = [...rooms.values()].filter(room => !room.denOwner && room.roomType === 0).flatMap(room => [room.name, room.sessions.size]);
    session.sendXt("rc", -1, counts.length / 2, ...counts);
  },

  // RoomXtCommManager.sendRoomJoinRequestFull: [nameOrId, confirmLanguage, invisible, joinType]
  rj(session, roomId, [roomName]) {
    joinRoom(session, String(roomName));
  },
};

const findBySfsId = id => [...online.values()].find(session => session.id === id);

// an "Animal Jam HQ" popup, also kept in the chat history
// (UserCommXtCommManager.userCommAdminMessageResponse). the text travels
// where a room id usually does; the 1 marks a system message.
const tell = (session, text) => session.sendXt("ua", String(text).slice(0, MAX_ANNOUNCEMENT), 1);

// puts a yes-or-no box in front of the player ("xyn", shown by the patched
// client) and runs `run` if they say yes. one question waits at a time.
let nextQuestion = 1;
const ask = (session, text, run) => {
  session.asked = {id: nextQuestion++, run};
  session.sendXt("xyn", -1, session.asked.id, String(text).replace(/%/g, " percent"));
};

// files a report by this player; false when it was not taken.
const fileReport = (session, username, reason, detail = "", about = "") => {
  // A secret valentine is reported under the name the game showed for it.
  const target = username === ecards.SECRET_NAME ? ecards.secretSender(session.account) : accounts.byName(username);
  if (!target || target === session.account) {
    return false;
  }
  const targetSession = findOnline(target.username);
  const said = targetSession ? targetSession.recentChat.join("\n") : "";
  return reports.file({
    reporter: session.account.username,
    target: target.username,
    reason: Number(reason),
    detail,
    context: [about, said].filter(Boolean).join("\n"),
    room: session.room ? session.room.name : "",
  });
};

// what the modules below may use of this one. `others` here is everyone who
// should see the player's animal change; dens get everyone in the room.
// invisible staff (the "staff.invisible" permission): their animal is drawn
// for staff only, half see-through ("xiv" [.., .., sfsId, 1 | 0], for the
// patched client), on their own screen too. the game's own invisible mode
// ("fi") is not used: with it the client stops sending where it walks, and
// staff could not see them move. they say nothing while invisible (pubMsg).
const setInvisible = (session, invisible) => {
  if (Boolean(session.invisible) === invisible) {
    return;
  }
  const {room} = session;
  const shown = Boolean(room && session.pos);
  const before = shown ? watchers(session) : [];
  session.invisible = invisible;
  const after = shown ? watchers(session) : [];
  for (const other of before.filter(other => !after.includes(other))) {
    other.sendXt("ar", room.id, session.id);
  }
  for (const other of after) {
    if (before.includes(other)) {
      other.sendXt("xiv", -1, session.id, invisible ? 1 : 0);
    }
    else {
      sendAvatarCreate(other, session);
    }
  }
  if (shown) {
    session.sendXt("xiv", -1, session.id, invisible ? 1 : 0);
  }
  // the patched client's message box, as the staff commands answer in
  session.sendXt("xtl", -1, invisible ? "You are invisible: only staff see you, and you cannot chat. Say !invisible again to be seen."
    : "You can be seen again.");
  modlog.record(session.account.username, invisible ? "went invisible (in game)" : "became visible (in game)", "", room ? room.name : "");
};

// what an account's game knows of its staff role ("xsp", AJClient.onStaff),
// sent again when the admin changed it: nothing for one no longer staff.
// one that may no longer go invisible is seen again.
const refreshStaff = account => {
  const session = findOnline(account.username);
  if (!session) {
    return;
  }
  const active = roles.isActiveStaff(account);
  session.sendXt("xsp", -1, active ? roles.roleOf(account) : "", active ? roles.permissionsOf(account).join(",") : "");
  if (session.invisible && !roles.can(account, "staff.invisible")) {
    setInvisible(session, false);
  }
};

// items taken from an account (lib/itemcontrol.js): its game, if playing,
// and anybody in its den are told. `worn`: clothing it had on went too.
const itemsTaken = (account, kind, invs, worn) => {
  const session = findOnline(account.username);
  if (session && kind === "den") {
    dens.sendDenItems(session);
  }
  else if (session) {
    sendClothingRemoved(session, invs);
    if (worn) {
      sendItemList(session, session, false);
      refreshForOthers(session);
    }
  }
  const den = kind === "den" ? rooms.get(`den${account.username}`) : null;
  for (const other of den ? den.sessions : []) {
    dens.sendDenState(other, den, false);
  }
};

// A dashboard clothing rule can affect several animals and mannequins at
// once. Their persisted references have already been removed by
// itemcontrol.js; refresh both the owner's full inventory and anyone seeing
// their animal or den so an open game cannot keep displaying the old outfit.
const wearRulesChanged = (account, mannequinChanged = false) => {
  const session = findOnline(account.username);
  if (session) {
    sendItemList(session, session, true);
    refreshForOthers(session);
    if (mannequinChanged) {
      dens.sendDenItems(session);
    }
  }
  if (mannequinChanged) {
    const den = rooms.get(`den${account.username}`);
    for (const visitor of den ? den.sessions : []) {
      dens.sendDenState(visitor, den, false);
    }
  }
};

// staff moving a player: `whoName` to the room `toName` is in (summon is
// the player to the staff member, goto the staff member to the player). both
// online, `toName` in a room. This privileged movement deliberately bypasses
// a full room, locked den, or hosted-party block; regular joins do not.
// they land where `toName` stands (the patched client's "xgt": [x, y,
// "1" same room, teleported now | "0" the spot to spawn on in the next
// room], or [] to forget a spot not used). with nobody's spot known yet,
// it is the room's usual spawn.
const staffMove = (whoName, toName) => {
  const who = findOnline(whoName);
  const to = findOnline(toName);
  if (!who) {
    return {error: `${whoName} is not online.`};
  }
  if (!to || !to.room) {
    return {error: `${toName} is not in a room.`};
  }
  const room = to.room;
  const shown = room.displayName || room.name;
  const spot = to.pos ? [to.pos.x, to.pos.y] : null;
  if (who.room === room) {
    if (!spot) {
      return {error: "Already in the same room."};
    }
    who.sendXt("xgt", -1, ...spot, 1);
    return {ok: true, room: shown};
  }
  if (spot) {
    who.sendXt("xgt", -1, ...spot, 0);
  }
  // staffMove is only reached through permission-checked commands. The flag
  // is consumed by enterRoom/joinDen, preserving normal rules for all other
  // joins.
  who.staffTravel = true;
  joinRoom(who, room.name);
  delete who.staffTravel;
  if (who.room !== room) {
    if (spot) {
      who.sendXt("xgt", -1);
    }
    return {error: `Could not get into ${shown}.`};
  }
  return {ok: true, room: shown};
};

const context = {
  others: watchers,
  watchers,
  findOnline,
  findBySfsId,
  sendItemList,
  sendAvatarCreate,
  refreshForOthers,
  petFields,
  blocks,
  players: () => [...online.values()],
  enterRoom: (...args) => enterRoom(...args),
  setHideBlocked: (...args) => setHideBlocked(...args),
  onBlocked: (...args) => onBlocked(...args),
  onUnblocked: (...args) => onUnblocked(...args),
  partyTimeLeft: account => parties.timeLeft(account),
  tell: (...args) => tell(...args),
  leaveRoom: (...args) => leaveRoom(...args),
  ask: (...args) => ask(...args),
  travel: (session, base) => joinRoom(session, `${base}#${session.worldId || config.shards[0].id}`),
  worldOf,
  worldName,
  joinRoom: (...args) => joinRoom(...args),
  staffMove: (...args) => staffMove(...args),
  setInvisible: (...args) => setInvisible(...args),
  // the moderation module, made after this context (lib/commands.js uses it)
  staffModeration: () => moderation,
  reloadRoom: session => reloadRoom(session),
  buyAgain: session => handlers[session.lastPurchase.cmd](session, session.lastPurchase.roomId, session.lastPurchase.params),
};
const pets = petModule(context);
const parties = partyModule(context);
const ecards = ecardModule(context);
const walls = wallModule(context);
const commands = commandModule(context);
const minigames = minigameModule(context);
const adventures = adventureModule(context);
const buddies = buddyModule(context);
const moderation = moderationModule(context);
const trades = tradeHandlers(context);
achievements.setFinder(findOnline);
Object.assign(handlers, avatarHandlers(context), itemHandlers(context), pets.handlers, dens.handlers({...context, others}),
  buddies.handlers, moderation.handlers, trades.handlers, achievements.handlers, adopt.handlers, worldItems.handlers,
  parties.handlers, ecards.handlers, walls.handlers, minigames.handlers, adventures.handlers, stubHandlers,
  playerItems.handlers({itemsTaken: (...args) => itemsTaken(...args)}));

const leaveRoom = session => {
  const {room} = session;
  if (!room) {
    return;
  }
  room.sessions.delete(session);
  session.room = null;
  session.pos = null;
  delete session.activeAction;
  minigames.roomLeft(session);
  for (const other of room.sessions) {
    // AvatarManager.avatarRemoveResponse
    if (sees(other, session)) {
      other.sendXt("ar", room.id, session.id);
    }
  }
  if (room.sessions.size === 0) {
    rooms.delete(room.name);
  }
};

// the Bio tab's words: the bio, under the time played when the player
// shows it (their account page). the card makes the words smaller to fit.
const playedText = seconds => {
  const hours = Math.floor(seconds / 3600);
  if (hours >= 1) {
    return `Played ${hours.toLocaleString("en-US")} hour${hours === 1 ? "" : "s"}`;
  }
  const minutes = Math.floor(seconds / 60);
  return `Played ${minutes} minute${minutes === 1 ? "" : "s"}`;
};
const cardBio = account => {
  // a bio from before the chat filter, or one a newer rule catches, is not
  // shown (lib/chat-filter.txt).
  const bio = account.bio && !chatFilter.broken(account.bio) ? account.bio : "";
  if (!account.playtimePublic) {
    return bio;
  }
  const session = online.get(account.username.toLowerCase());
  if (session) {
    countPlaytime(session);
  }
  return bio ? `${playedText(account.playtime)}\n\n${bio}` : playedText(account.playtime);
};

// the time since it was last counted, added to the account's playtime.
const countPlaytime = session => {
  if (session.account && session.playingSince) {
    const elapsed = Date.now() - session.playingSince;
    session.account.playtime += Math.floor(elapsed / 1000);
    session.playingSince = Date.now() - (elapsed % 1000);
  }
};
// counted every minute too, so that a server that stops without warning
// loses no more than that, and what others see is never far behind.
setInterval(() => {
  for (const session of online.values()) {
    countPlaytime(session);
  }
  if (online.size > 0) {
    accounts.save();
  }
}, 60000).unref();

const leaveWorld = session => {
  minigames.leave(session);
  trades.forget(session);
  leaveRoom(session);
  if (session.account && online.get(session.account.username.toLowerCase()) === session) {
    online.delete(session.account.username.toLowerCase());
    session.account.lastSeen = Math.floor(Date.now() / 1000);
    countPlaytime(session);
    stats.session(session.account, (Date.now() - session.playStarted) / 1000);
    accounts.release(session.account);
    accounts.save(session.account);
    buddies.announce(session.account);
  }
};

// A room that has another version of itself on the CDN which nothing leads
// to shows that version in the months config.roomSwaps gives it. it stays
// the same room to everyone (same name, same doors in); only the file the
// clients draw is the other one.
const swappedRoom = (base, month = new Date().getUTCMonth() + 1) => {
  const swap = config.roomSwaps.find(candidate => candidate.room === base && candidate.months.includes(month));
  return swap && defpacks.roomDef(swap.shown) ? swap.shown : base;
};

// the room as this player should see it: the same room, loaded from the
// build that has the look they picked, and as another room file of that
// build where the theme names one. the client turns the path
// into a file request, which lib/http.js answers from that build. dens keep
// their one look.
const roomAsSeenBy = (session, room) => {
  if (room.denOwner) {
    return room;
  }
  // A room may have been given a look of its own ("!theme here").
  const chosen = Object.hasOwn(session.account.roomThemes, room.base) ? session.account.roomThemes[room.base] : session.account.theme;
  const theme = Object.hasOwn(config.themes, chosen) ? config.themes[chosen] : null;
  const themed = theme && theme.rooms && theme.rooms[room.base];
  const base = themed && defpacks.roomDef(themed) ? themed : swappedRoom(room.base);
  return theme ? {...room, base: `${THEME_PATH_PREFIX}${theme.build}.${base}`} : {...room, base};
};

// has the player's client load the room they stand in again, in whatever
// look it should have for them now.
const reloadRoom = session => {
  if (session.room && !session.room.denOwner) {
    dens.sendRoomProperties(session, roomAsSeenBy(session, session.room));
    for (const other of others(session)) {
      if (other.pos && sees(session, other)) {
        sendAvatarCreate(session, other);
      }
    }
  }
};

// changes a player's seasonal theme ("" for none) and, if they are standing
// in a room, has their client load it again. false for an unknown theme.
const setTheme = (account, theme) => {
  if (theme !== "" && !Object.hasOwn(config.themes, theme)) {
    return false;
  }
  account.theme = theme;
  accounts.save(account);
  const session = findOnline(account.username);
  if (session) {
    reloadRoom(session);
  }
  return true;
};

// RoomXtCommManager.roomJoinResponse failure branch
const joinFailed = (session, reason) => {
  console.log(`[world] ${logText(session.name)} could not join: ${logText(reason)}`);
  session.sendXt("rj", -1, 0, reason);
};

// moves the session into the room called `name`, creating it from `base`
// (a "path.name" from the room defPack) when nobody is in it yet. `props`
// are what sets a den or a party room apart from a land: roomType,
// secondaryDefId, denOwner, partyHost, customMusicDef. the client is told to
// change rooms whether or not it asked to, which is also how a player is
// sent somewhere (out of a den they were blocked from, say).
// who came into whose den, for the owner's account page: the latest
// visits, one line per visitor.
const DEN_VISITS_KEPT = 50;
const noteDenVisit = (owner, visitor) => {
  owner.denVisits = [{at: Math.floor(Date.now() / 1000), name: visitor.username},
    ...owner.denVisits.filter(visit => visit.name !== visitor.username)].slice(0, DEN_VISITS_KEPT);
};

const enterRoom = (session, name, base, displayName, shardId, props = {}) => {
  const def = defpacks.roomDef(base);
  let room = rooms.get(name);
  if (room && room === session.room) {
    return;
  }
  // Moderators, a one-use staff teleport, and a player arriving when every
  // spawn room is full (spawnRoom) may enter a full room.
  const overflow = session.spawnOverflow;
  const staffTravel = session.staffTravel === true;
  session.spawnOverflow = false;
  delete session.staffTravel;
  if (room && room.sessions.size >= config.maxUsersPerRoom && !roles.isActiveStaff(session.account) && !staffTravel && !overflow) {
    joinFailed(session, "This room is currently full");
    return;
  }
  minigames.leave(session); // walking into a room is how a full-screen game is left
  leaveRoom(session);
  if (!room) {
    room = {id: nextRoomId++, name, base, defId: Number(def.id), enviroType: Number(def.type), roomType: 0, secondaryDefId: 0,
      customMusicDef: 0, displayName, sessions: new Set(), ...props};
    rooms.set(name, room);
  }
  room.sessions.add(session);
  session.room = room;
  // a land room is in a world, which is the player's now; a den or a party
  // is in none, and the game is told the world the player was in, which it
  // goes back to when they walk out (RoomManagerWorld.shardId).
  if (worldOf(name)) {
    session.worldId = worldOf(name);
  }
  const worldId = session.worldId || shardId;
  if (props.denOwner && props.denOwner !== session.account) {
    noteDenVisit(props.denOwner, session.account);
  }
  roomInfo.ensure(base);
  const avatar = activeAvatar(session.account);
  pets.walked(session.account);

  // RoomXtCommManager.roomJoinResponse
  session.sendXt("rj", -1, 1,
    room.name, room.id,
    room.sessions.size, config.maxUsersPerRoom,
    0, 0, // spectators, maxSpectators
    ...(room.joinFlags || [0, 0, 0, 0, 0]), // isPrivate, isGame, isLimbo, isTemp, isSubRoom (an adventure's room sets them)
    // the name shown in the corner of the screen, then the id of a
    // localization string to show in its place (GuiManager.setRoomNameDisplay);
    // 0 for "use the name".
    room.displayName, room.nameStringId || 0,
    avatar.perUserAvId,
    avatar.petInvId,
    LANG_ENG,
    room.customMusicDef,
    worldId);
  dens.sendRoomProperties(session, roomAsSeenBy(session, room));
  if (room.theatreVideo !== undefined) {
    session.sendXt("xtv", room.id, room.theatreVideo);
  }

  for (const other of others(session)) {
    if (other.pos && sees(session, other)) {
      sendAvatarCreate(session, other);
    }
  }
  return room;
};

const sendHome = session => {
  const shard = session.worldId || config.shards[0].id;
  enterRoom(session, `${config.startupRoom}#${shard}`, config.startupRoom, roomInfo.name(config.startupRoom), shard);
};

const emptyRoom = name => {
  const room = rooms.get(name);
  for (const session of room ? [...room.sessions] : []) {
    sendHome(session);
  }
};

// the player's "hide blocked players" setting: with it on, animals of
// players they blocked are not drawn for them. those in the room now come
// or go at once.
const setHideBlocked = (session, hide) => {
  const {account} = session;
  if (account.hideBlocked === hide) {
    return;
  }
  const blocked = others(session).filter(other => other.pos && blocks.has(account, other.account));
  if (hide) {
    for (const other of blocked) {
      session.sendXt("ar", session.room.id, other.id);
    }
  }
  account.hideBlocked = hide;
  account.userVars[USER_VAR_HIDE_BLOCKED] = hide ? 1 : 0;
  accounts.save(account);
  if (!hide) {
    for (const other of blocked) {
      sendAvatarCreate(session, other);
    }
  }
};

// `session`'s player has just blocked `target`: out of their den or party
// goes the blocked player, and out of sight if that is how they have it set.
const onBlocked = (session, target) => {
  const targetSession = findOnline(target.username);
  if (!targetSession || !targetSession.room) {
    return;
  }
  const {room} = targetSession;
  if (room.denOwner === session.account || room.partyHost === session.account) {
    if (room.denOwner) {
      // DenXtCommManager.denPrivacyKickResponse: the client then explains
      // why it finds itself somewhere else.
      targetSession.sendXt("dpk", -1);
    }
    sendHome(targetSession);
  }
  else if (room === session.room && targetSession.pos && session.account.hideBlocked) {
    session.sendXt("ar", room.id, targetSession.id);
  }
};

const onUnblocked = (session, target) => {
  const targetSession = findOnline(target.username);
  if (targetSession && targetSession.pos && targetSession.room === session.room && session.account.hideBlocked) {
    sendAvatarCreate(session, targetSession);
  }
};

// a world for a player arriving: one at random of those whose spawn rooms
// are not all full; with every one full, the emptiest.
const pickWorld = () => {
  const open = config.shards.filter(shard => config.spawnRooms.some(base => !roomFull(`${base}#${shard.id}`)));
  if (open.length > 0) {
    return open[Math.floor(Math.random() * open.length)].id;
  }
  return config.shards.reduce((emptiest, shard) => (inWorld(shard.id).length < inWorld(emptiest.id).length ? shard : emptiest)).id;
};

const roomFull = name => {
  const room = rooms.get(name);
  return Boolean(room) && room.sessions.size >= config.maxUsersPerRoom;
};

// a spawn room (config.spawnRooms) at random, of those with space; with
// all of them full, the emptiest, which lets this player in over the cap.
const spawnRoom = (session, shardId) => {
  const known = config.spawnRooms.filter(base => defpacks.roomDef(base));
  if (known.length === 0) {
    return config.startupRoom;
  }
  const open = known.filter(base => !roomFull(`${base}#${shardId}`));
  if (open.length > 0) {
    return open[Math.floor(Math.random() * open.length)];
  }
  const size = base => (rooms.get(`${base}#${shardId}`) || {sessions: new Set()}).sessions.size;
  session.spawnOverflow = true;
  return known.reduce((emptiest, base) => (size(base) < size(emptiest) ? base : emptiest));
};

const joinRoom = (session, requested) => {
  // "jamaa_township.room_main#-1": path, then shard (-1 = pick one for me).
  let [base, shardText] = requested.split("@")[0].split("#");
  // A party's room, which is where a buddy's "go to" can lead.
  if (parties.joinByRoomName(session, base)) {
    return;
  }
  // coming back from a full-screen game the client asks for the room it
  // was in by name, a den included (RoomManagerWorld.minigameJoinRoom).
  if (/^den/i.test(base) && accounts.byName(base.slice(3))) {
    joinDen(session, base);
    return;
  }
  base = base.toLowerCase();
  // the game always asks for the same room first. A player who chose to
  // start in their den is put there instead (the game goes wherever the
  // reply says; a starting room in the flashvars it does not honour).
  if (!session.arrived) {
    session.arrived = true;
    // the client asks for its buddy list only when a window wants it
    // (BuddyList.requestBuddyListIfNeeded), and draws every name tag as a
    // non-buddy's until then: it is sent ahead of the first room, as the
    // client takes it unasked (BuddyManager.buddyListResponseHandler).
    handlers.bl(session);
    // the game asks for world -1 ("pick one for me") unless it is going back
    // to one (after a reconnect, say).
    session.worldId = worldOf(`#${shardText}`) || pickWorld();
    const {startInDen, startRoom, username} = session.account;
    const den = startInDen ? username : /^den/i.test(startRoom || "") ? startRoom.slice(3) : null;
    if (den !== null && accounts.byName(den)) {
      joinDen(session, `den${den}`);
      return;
    }
    // any other name asked for that is a room here and has space; else one
    // of the spawn rooms that has, so nobody's login ends at "room is full".
    const asked = (startRoom || "").split("#")[0].toLowerCase();
    const shardId = session.worldId;
    base = !startInDen && defpacks.roomDef(asked) && !asked.startsWith("den") && !roomFull(`${asked}#${shardId}`)
      ? asked : spawnRoom(session, shardId);
    shardText = String(shardId);
  }
  // switching worlds (the settings menu's world list asks for the township of
  // the one picked): a full room there is swapped for one with space.
  else if (worldOf(`#${shardText}`) && session.worldId && worldOf(`#${shardText}`) !== session.worldId
    && roomFull(`${base}#${shardText}`) && config.spawnRooms.includes(base)) {
    base = spawnRoom(session, Number(shardText));
  }
  if (!defpacks.roomDef(base) || base.startsWith("den")) {
    joinFailed(session, `Room "${requested}" is not supported by this server`);
    return;
  }
  // a world that is not one here (-1, or one the game made up because every
  // world was full) is the player's own.
  let shard = config.shards.find(s => s.id === Number(shardText)) || config.shards.find(s => s.id === session.worldId) || config.shards[0];
  // full there: with "Find Open World" on, the same room in a world that
  // has space (moderators get into a full room anyway).
  if (roomFull(`${base}#${shard.id}`) && !roles.isActiveStaff(session.account) && findOpenWorld(session.account)) {
    shard = config.shards.find(other => !roomFull(`${base}#${other.id}`)) || shard;
  }
  enterRoom(session, `${base}#${shard.id}`, base, roomInfo.name(base), shard.id);
};

// dens are rooms named "den<owner>"; the client takes the owner from the name
// and compares it to its own username, so the stored casing is used.
const joinDen = (session, requested) => {
  const owner = accounts.byName(requested.slice(3));
  // A row of the world map's Epic Dens list: a showcase den, which is a
  // room like any other (lib/epicdens.js). A player of that name comes first.
  const showcase = owner ? null : epicDens.byName(requested.slice(3));
  if (showcase) {
    const shard = session.worldId || config.shards[0].id;
    enterRoom(session, `${showcase.base}#${shard}`, showcase.base, showcase.name, shard);
    return;
  }
  if (!requested.toLowerCase().startsWith("den") || !owner) {
    joinFailed(session, `Den "${requested}" does not exist`);
    return;
  }
  const staffTravel = session.staffTravel === true;
  if ((!dens.canEnter(owner, session.account) || blocks.has(owner, session.account)) && !staffTravel) {
    joinFailed(session, "This den is locked");
    return;
  }
  // "<owner>'s Den" is what the client looks for to put a den's name in its
  // own words (GuiManager.setRoomNameDisplay).
  // ... unless the owner named the den themselves ("!den name").
  const denName = owner.denNames[owner.activeDen];
  const room = enterRoom(session, `den${owner.username}`, dens.denRoom(owner).base, denName ? `${owner.username}'s ${denName}` : `${owner.username}'s Den`, config.shards[0].id,
    {...dens.denRoom(owner), denOwner: owner});
  if (room) {
    dens.sendDenState(session, room);
  }
};

const seenUnhandled = new Set();
const unhandled = (cmd, params) => {
  const key = cmd === "gl" ? `gl ${params[0]}` : cmd;
  if (!seenUnhandled.has(key) && seenUnhandled.size < 500) {
    seenUnhandled.add(key);
    console.log(`[world] no handler for xt "${logText(key)}" (params: ${logText(JSON.stringify(params).slice(0, 200))}) - the client gets no reply`);
  }
};

// hosted parties end on the clock, not on anyone's request.
setInterval(() => {
  try {
    parties.expire(emptyRoom);
  }
  catch (err) {
    console.error(`[world] ending parties failed: ${err.stack}`);
  }
}, 60000).unref();

module.exports = {
  sys(session, msg) {
    if (msg.action === "login") {
      login(session, msg);
      return;
    }
    if (!session.account) {
      return;
    }
    switch (msg.action) {
      case "pubMsg": {
        // UserCommXtCommManager sends "<text>%<type>[%<extra>]" and reads it
        // back in userCommChatResponse as [sfsUserId, text, type, extra].
        // An in-room minigame keeps the player in their world room, but its
        // embedded SWF labels outgoing user messages with the minigame's
        // temporary sub-room id. Accept that id as well so its attachment
        // reward can make the normal round trip back to the avatar.
        if (session.room && (session.room.id === msg.roomId || (session.game && session.game.roomId === Number(msg.roomId)))) {
          // at most text, type and one extra field, and no essays.
          const fields = decodeEntities(msg.cdata("txt") || "").split("%").slice(0, 3);
          if (fields[0].length > config.maxChatLength || (fields[2] || "").length > MAX_CHAT_EXTRA) {
            return;
          }
          // the type as the client will read it (int(), which makes 0 of
          // "00", of "abc" and of nothing at all): a whole number, written
          // one way, or the line is dropped. otherwise typed chat could be
          // sent as "00" and pass for something else here.
          if (!/^\d{1,2}$/.test(fields[1] || "")) {
            return;
          }
          fields[1] = String(Number(fields[1]));
          // A buddy game's bubble over the player's head (lib/minigames.js).
          if (fields[1] === "12") {
            minigames.bubble(session, fields[0], fields[2]);
            return;
          }
          // Per-player pet form (the pet chooser's switch, lib/pets.js).  It
          // is deliberately a user-communication message so every client
          // already in the room updates the same avatar, while the normal
          // pet-out state stays unchanged.
          if (fields[1] === "13") {
            pets.setPetForm(session, fields[0] === "on");
            return;
          }
          // Type 3 is the action packet. It used to be sent only to people
          // already in the room, leaving late arrivals with an idle avatar
          // until the player performed the action again. Save the safe action
          // name and its mirror marker for the next avatar-create packet.
          if (fields[1] === "3") {
            if (!ACTION_NAME.test(fields[0])) {
              return;
            }
            session.activeAction = {name: fields[0], extra: fields[2] || ""};
          }
          // Attachment messages carry an emoticon *definition* id from the
          // sender, while the recipient's avatar view needs that definition's
          // media id.  This is the normal path used by den attachments and
          // the food-machine minigames.
          if (fields[1] === "4") {
            const [defId, ...extra] = fields[0].split(",");
            if (defId === "0") {
              fields[0] = "0,";
            }
            else {
              const mediaId = defpacks.emoticonMediaId(defId);
              if (!mediaId) {
                return;
              }
              fields[0] = `${mediaId},${extra.join(",").replace(/[\r\n%,]/g, "").slice(0, 128)}`;
            }
          }
          // typed chat shows as "..." over the sender until the server sends
          // it back (UserCommXtCommManager.sendChatMessage); everything else
          // the sender has already shown themselves.
          const echo = TYPED_CHAT_TYPES.includes(fields[1]);
          // An attachment is only drawn after the server sends it back. The
          // local client deliberately does not draw it optimistically, unlike
          // typed chat and normal emotes.
          const attachmentEcho = fields[1] === "4";
          // silenced, or chat switched off on the account page: the line
          // goes nowhere.
          if (echo && (moderation.isSilenced(session.account) || !accounts.featureOn(session.account, "chat"))) {
            session.sendXt("uc", session.room.id, session.id, -1, 5);
            return;
          }
          // A few lines in a few seconds, and no more: the bubble waiting
          // for this one is cleared, as for a silenced player.
          if (echo && !limits.isTrustedLocal(session.address) && !chatLines.allow(session.account.id)) {
            session.sendXt("uc", session.room.id, session.id, -1, 5);
            return;
          }
          if (echo) {
            // "!help" and the like (lib/commands.js). A command's line is
            // still echoed to its sender, whose chat bubble waits for it.
            const said = commands.run(session, fields[0]);
            if (said === null) {
              session.sendXt("uc", session.room.id, session.id, ...fields);
              return;
            }
            // invisible staff give commands and say nothing: the bubble
            // waiting goes, as for a silenced player.
            if (session.invisible) {
              session.sendXt("uc", session.room.id, session.id, -1, 5);
              return;
            }
            // how much there is of it (lib/chatspam.js): a key held down, a
            // word over and over, shouting, a wall of emoji are cut down; the
            // same line again and again is not sent.
            const line = chatSpam.tidy(said);
            if (!line || chatSpam.repeated(session, line)) {
              session.sendXt("uc", session.room.id, session.id, -1, 5);
              return;
            }
            fields[0] = line;
            // the server's filter (lib/chatfilter.js): the line reaches
            // nobody, the sender sees the game's warning screen, and it is
            // kept in the chat log for the moderators, marked as not sent.
            const rule = chatFilter.broken(line);
            if (rule) {
              session.sendXt("uc", session.room.id, session.id, -1, 5);
              chatFilter.warn(session);
              chatlog.record(session.account, session.room.name, `(not sent) ${line}`);
              console.log(`[filter] ${logText(session.name)} in ${logText(session.room.name)}: "${logText(line)}" (${logText(rule)})`);
              return;
            }
            session.recentChat.push(`${new Date().toISOString().slice(11, 19)} ${line}`);
            session.recentChat = session.recentChat.slice(-RECENT_CHAT_LINES);
            chatlog.record(session.account, session.room.name, line);
          }
          // nobody hears a player they have blocked, and with chat switched
          // off nobody's typed lines arrive at all.
          // an invisible staff member's emotes and the like reach staff only.
          for (const recipient of (echo || attachmentEcho) ? session.room.sessions : others(session)) {
            if (session.invisible && recipient !== session && !roles.isActiveStaff(recipient.account)) {
              continue;
            }
            if (recipient === session || (!blocks.has(recipient.account, session.account) && (!echo || accounts.featureOn(recipient.account, "chat")))) {
              recipient.sendXt("uc", session.room.id, session.id, ...fields);
            }
          }
        }
        return;
      }
      case "logout":
        session.close();
        return;
      default:
        console.log(`[world] unhandled sys "${logText(msg.action)}" from ${logText(session.name)}`);
    }
  },

  xt(session, cmd, roomId, params) {
    if (!session.account) {
      if (session.signingUp && Object.hasOwn(signup.handlers, cmd)) {
        signup.handlers[cmd](session, roomId, params);
      }
      return;
    }
    if (Object.hasOwn(handlers, cmd)) {
      // clothing and den item purchases, for "!again".
      if (cmd === "ib" || cmd === "db") {
        session.lastPurchase = {cmd, roomId, params};
      }
      handlers[cmd](session, roomId, params);
    }
    else {
      unhandled(cmd, params);
    }
  },

  close: leaveWorld,

  findOnline,
  makeColour,
  sendItemList,
  wearRulesChanged,
  setTheme,
  // offers left on the account page (lib/trades.js); `refresh` shows a
  // playing account its inventories as they are now.
  tradeOffers: trades.offers,
  refreshInventories(account) {
    const session = findOnline(account.username);
    if (session) {
      sendItemList(session, session, true);
      dens.sendDenItems(session);
    }
  },
  // runs a chat command for an account that is playing, as if typed. false
  // when it is not in the game.
  runCommand(account, text) {
    const session = findOnline(account.username);
    if (!session || !session.room) {
      return false;
    }
    commands.run(session, text);
    return true;
  },
  // blocks or unblocks `target` for `account` from outside the game (the
  // account page). false when there was nothing to change.
  setBlocked(account, target, block) {
    const key = target.username.toLowerCase();
    if (account.blocked.includes(key) === block || (block && account.blocked.length >= MAX_BLOCKED)) {
      return false;
    }
    account.blocked = block ? [...account.blocked, key] : account.blocked.filter(name => name !== key);
    accounts.save(account);
    const session = findOnline(account.username);
    if (session) {
      (block ? onBlocked : onUnblocked)(session, target);
      buddies.handlers.bl(session); // their game's own lists, brought up to date
    }
    return true;
  },
  moderation,
  staffMove,
  itemsTaken,
  refreshStaff,
  walls,
  ecards,
  // called when the admin changed an account's badges: a name tag showing
  // one it no longer holds goes back to the first badge, for everyone who
  // sees it.
  checkNameTag(account) {
    if (badges.mayWear(account, defpacks.badgeIds()[account.nameBarData >> 8 & 0xFF])) {
      return;
    }
    account.nameBarData &= ~0xFF00;
    accounts.save(account);
    const session = findOnline(account.username);
    if (session && session.room) {
      // AvatarXtCommManager "an": [sfsUserId, nameBarData]
      for (const viewer of session.room.sessions) {
        viewer.sendXt("an", session.room.id, session.id, account.nameBarData);
      }
    }
  },
  // the adventure level of the animal an account is using, set from the
  // admin panel. clients in the room hear of it through an `ad` they did
  // not ask for; a name tag draws the new level when it is next made.
  setQuestLevel(account, level) {
    const avatar = activeAvatar(account);
    avatar.questLevel = level;
    avatar.questXp = adventureModule.levelXp(level);
    accounts.save(account);
    const session = findOnline(account.username);
    if (session && session.room) {
      for (const viewer of session.room.sessions) {
        sendAvatarData(viewer, session, avatar.perUserAvId);
      }
    }
  },
  motd: () => accounts.setting(MOTD_SETTING) || "",
  setMotd(text) {
    accounts.setSetting(MOTD_SETTING, String(text).trim().slice(0, MAX_ANNOUNCEMENT));
  },
  // shows a message to everyone playing, or to everyone in one room. returns
  // how many players got it.
  announce(text, roomName = null) {
    const audience = [...online.values()].filter(session => session.pos && (!roomName || (session.room && session.room.name === roomName)));
    for (const session of audience) {
      tell(session, text);
    }
    return audience.length;
  },
  // an "Animal Jam HQ" popup for one player; false when they are not playing.
  tellAccount(account, text) {
    const session = findOnline(account.username);
    if (session && session.pos) {
      tell(session, text);
    }
    return Boolean(session && session.pos);
  },
  rooms: () => [...rooms.values()].map(room => ({name: room.name, title: commands.roomTitle(room), players: room.sessions.size})),

  // the panel's Masterpieces page. A painting waiting for review is an
  // item its maker cannot use yet; approving it tells them so, by a
  // Jam-A-Gram from Animal Jam HQ and at once if they are playing. `by`
  // is who approved it: a moderator's username, or "admin". the same
  // picture waiting elsewhere is approved with it, and its makers told too.
  approveMasterpiece(id, by) {
    const approved = masterpieces.approve(id, by);
    for (const painting of approved) {
      const maker = masterpieces.creatorOf(painting.id);
      if (maker) {
        ecards.noteFromHq(maker, "Your Masterpiece has been approved! It is with your den items.");
        const session = findOnline(maker.username);
        if (session) {
          dens.sendDenItems(session);
        }
      }
    }
    return approved.length > 0;
  },
  // takes a painting away for good, from whoever has it by now: one that
  // was not approved, or one that should not have been. its maker gets a
  // Masterpiece Token to frame another with, and word of it.
  removeMasterpiece(id) {
    const painting = masterpieces.get(id);
    const maker = masterpieces.creatorOf(id);
    if (!painting) {
      return false;
    }
    const changed = new Set(maker ? [maker] : []);
    const shownIn = [];
    for (const account of accounts.all()) {
      const held = account.denItems.filter(item => item.image === painting.id);
      if (held.length === 0) {
        continue;
      }
      changed.add(account);
      if (held.some(dens.isPlaced)) {
        shownIn.push(rooms.get(`den${account.username}`));
      }
      account.denItems = account.denItems.filter(item => item.image !== painting.id);
      account.tradeList = account.tradeList.filter(listed => !(listed.type === 1 && held.some(item => item.inv === listed.inv)));
    }
    masterpieces.forget(painting.id, true);
    if (maker) {
      dens.giveDenItem(maker, masterpieces.TOKEN_DEN_ITEM);
      ecards.noteFromHq(maker, "Your Masterpiece was not approved. Here is a Masterpiece Token to frame another one with.");
    }
    for (const account of changed) {
      const session = findOnline(account.username);
      if (session) {
        dens.sendDenItems(session);
      }
    }
    for (const room of shownIn.filter(Boolean)) {
      for (const visitor of room.sessions) {
        dens.sendDenState(visitor, room, false);
      }
    }
    accounts.save(...changed, maker);
    return true;
  },

  // the panel's Debug page: puts a playing account into any room of the room
  // list, as that room and nothing more (a den's file without its owner, a
  // party's without the party). returns what is wrong, or null.
  teleport(account, path) {
    const session = findOnline(account.username);
    const base = String(path).replace(/\//g, ".").toLowerCase();
    if (!session || !session.room) {
      return "They are not in the game right now";
    }
    if (!defpacks.roomDef(base)) {
      return "There is no such room";
    }
    minigames.leave(session);
    const shard = session.worldId || config.shards[0].id;
    enterRoom(session, `${base}#${shard}`, base, roomInfo.name(base), shard);
    return null;
  },
  // an address was just banned (lib/bans.js): whoever plays from it is told
  // as for a ban of their own, and put out. returns how many.
  disconnectAddress(address) {
    const there = [...online.values()].filter(session => limits.key(session.address) === limits.key(address));
    for (const session of there) {
      session.sendXt("fd", -1, "fb", 1, moderation.PERMANENT);
      session.close();
    }
    return there.length;
  },
  // puts out these accounts, if playing, with the game's banned notice:
  // their computer was banned (lib/devices.js). returns how many were.
  disconnectBanned(list) {
    let out = 0;
    for (const account of list) {
      const session = findOnline(account.username);
      if (session) {
        session.sendXt("fd", -1, "fb", 1, moderation.PERMANENT);
        session.close();
        out++;
      }
    }
    return out;
  },
  // takes the account out of the world at once (not when its socket gets
  // round to closing), so the caller can go on to rename or delete it.
  disconnect(account) {
    parties.forget(account, emptyRoom);
    const session = findOnline(account.username);
    if (session) {
      leaveWorld(session);
      session.close();
    }
  },
  players: () => [...online.values()].map(session => ({
    username: session.account.username,
    room: session.room ? session.room.name.replace(/#(\d+)$/, (whole, id) => (worldOf(whole) ? ` (${worldName(Number(id))})` : whole)) : null,
    address: session.address,
  })),
};
