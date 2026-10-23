"use strict";

const {logText} = require("./logtext.js");
const zlib = require("zlib");
const amf3 = require("./amf3.js");
const cdn = require("./cdn.js");
const config = require("../config.js");
const sales = require("./sales.js");
const badges = require("./badges.js");
const extraMusic = require("./extramusic.js");
const wearRules = require("./wearrules.js");

// defPack ids, from loader.DefPacksDefHelper in the client.
const DEF_ITEM = 1000;
const DEF_AVATAR = 1003;
const DEF_ROOM = 1011;
const DEF_LOCALIZATION_EN = 10230;
const DEF_DEN_ITEM = 1030;
const DEF_GENERIC_LIST_TYPE = 1038;
const DEF_DEN_ROOM = 1040;
const DEF_DIAMOND = 1054;
const DEF_PET = 1046;
const DEF_AVATAR_CUSTOM = 1057;
// custom animals whose def has no pattern (patternRefId 0): their patterns
// were only in the generic list the official server sent. these are the
// pattern items locked to a special animal (bLockAvatarFlags) made after
// the last def that names its own, in release order; 2121 starts with the
// raccoon's overrideColorLayer2. a list of 0 made the avatar editor throw
// (#1009 in AvatarEditor.setCustomPatternColorIdx) and never open.
const CUSTOM_PATTERNS = new Map([
  [8, [1963, 1964, 1965, 1966]], // Legendary Eagle
  [9, [1976]], // Fearsome Falcon
  [10, [1981]], // Royal Red Panda
  [11, [2073]], // Frolicking Fox
  [12, [2121]], // Rainbow Raccoon
]);
const DEF_ACHIEVEMENTS = 1042;
const DEF_PARTY = 1047;
const DEF_CURRENCY_EXCHANGE = 1051;
const DEF_ADOPT_A_PET = 1061;
const DEF_PET_FOOD = 1062;
const DEF_PET_TOY = 1063;
const DEF_WORLD_ITEMS = 1064;
const DEF_NPC = 1025;
const DEF_NAMEBAR_BADGE = 1049;
const DEF_EMOTICON = 1036;

const OFFERED_SPECIAL_TYPES = ["0", "4"]; // den items: plain, mannequin
const DEN_ITEM_MASTERPIECE = 2725;

const packs = new Map();

// A defPack is a raw-deflated AMF3 object.
const loadRaw = async id => {
  const raw = await cdn.get(cdn.hashedPath(`defPacks/${id}`));
  if (!raw) {
    throw new Error(`defPack ${id} is not available (offline and not cached?)`);
  }
  return amf3.decode(zlib.inflateRawSync(raw));
};

// the pack with this server's rows in it (SHARED_CHANGES, further down).
const loadChanged = async id => {
  const pack = await loadRaw(id);
  if (SHARED_CHANGES.has(id)) {
    SHARED_CHANGES.get(id)(pack);
  }
  return pack;
};

const LAYER_EYES = "3";
const TYPE_CLOTHING = "1";
const EVERY_AVATAR = "9007199254740991"; // avatarUseFlags with a bit set for each animal type

// ItemXtCommManager checks bit (avatar type - 1).  BigInt avoids losing a
// bit in JavaScript's 53-bit Number representation while preserving the
// string form the AMF def pack uses.
const clientAvatarUseFlags = itemId => {
  let flags = BigInt(EVERY_AVATAR);
  for (const type of wearRules.blockedTypes(itemId)) {
    if (type <= 53) {
      flags &= ~(1n << BigInt(type - 1));
    }
  }
  return String(flags);
};

// One transform is used for fetched packs and for the live `xdi` definition
// updates sent to games that are already running.
const clientItemRow = def => {
  const row = {...def};
  if (row.type === TYPE_CLOTHING) {
    row.avatarUseFlags = clientAvatarUseFlags(row.id);
  }
  else if (row.type === "0" && row.layerId === LAYER_EYES) {
    row.avatarUseFlags = EVERY_AVATAR;
  }
  return row;
};

// rooms the official room pack no longer lists but whose files an older
// build on the CDN still has (lib/cdn.js looks there): the Summer Carnival,
// dropped after build 1828.
const RESTORED_ROOMS = [
  {id: "273", pathName: "party/venue_carnival", type: "0", isPlatformer: "0"},
];

const withRestoredRooms = pack => {
  const paths = new Set(Object.values(pack).map(def => def.pathName));
  let next = Math.max(-1, ...Object.keys(pack).map(Number).filter(Number.isInteger)) + 1;
  for (const room of RESTORED_ROOMS) {
    if (!paths.has(room.pathName)) {
      pack[next++] = {...room};
    }
  }
  return pack;
};

// parties. five party defs point at rooms that are in no build's room list
// and whose files are nowhere to be found (the 2012 New Year's party, an
// older Jamaaliday Jam, the Trading Party, a leap-year room, one hostable
// venue), and seven party rooms on the CDN have no party def pointing at
// them. put together here:
//   - the Trading Party is held in the trading barn (the unused twin of the
//     barn players can host in), since its own room is gone;
//   - the restaurant and the dance club among the unused rooms become
//     parties of their own, with a title and list picture borrowed from
//     what is nearest.
//   - the other four unused rooms are earlier copies of venues players can
//     host in (cake, vet, bakery, medieval castle). they become parties too,
//     under the names the game has for those venues and with their pictures.
//   - party 36 is the "AJHQ" button of the world map's Epic Dens window. it
//     led to whichever showcase den was on that month; lib/epicdens.js picks
//     the room, so here it only gets a title that fits them all.
const PARTY_STAND_IN_ROOMS = new Map([["6", "515"]]); // party def id -> room def id
const ADDED_PARTIES = [
  // "Restaurant", the Dinner Party's picture, party/venue_p_diner
  {id: "52", titleStrId: "703", mediaRefId: "1234", roomDefId: "472"},
  // "Dance Party", the hostable dance club's picture, party/venue_pl_dance_club
  {id: "53", titleStrId: "24279", mediaRefId: "4424", roomDefId: "519"},
  // "Birthday Party", "Science Party", "Bakery Party", "Medieval Party":
  // party/venue_pl_birthday_cake, _vet_science, _res_bakery, _castle_medieval
  {id: "54", titleStrId: "24271", mediaRefId: "4422", roomDefId: "514"},
  {id: "55", titleStrId: "24277", mediaRefId: "4425", roomDefId: "517"},
  {id: "56", titleStrId: "24275", mediaRefId: "4421", roomDefId: "518"},
  {id: "57", titleStrId: "24273", mediaRefId: "4423", roomDefId: "520"},
];
const PARTY_EPIC_DENS = "36";
const STRING_EPIC_DENS = "8700";
const PARTY_DEFAULTS = {iconMediaRefId: "0", avatarDefId: "0", restrictions: "0", avatarDefFlags: "0", petDefScalableFlags: "0", isGame: "0", isCustom: "0"};

const withRestoredParties = pack => {
  const ids = new Set();
  for (const def of Object.values(pack)) {
    ids.add(String(def.id));
    if (PARTY_STAND_IN_ROOMS.has(String(def.id))) {
      def.roomDefId = PARTY_STAND_IN_ROOMS.get(String(def.id));
    }
    if (String(def.id) === PARTY_EPIC_DENS) {
      def.titleStrId = STRING_EPIC_DENS;
    }
  }
  let next = Math.max(-1, ...Object.keys(pack).map(Number).filter(Number.isInteger)) + 1;
  for (const party of ADDED_PARTIES) {
    if (!ids.has(party.id)) {
      pack[next++] = {...PARTY_DEFAULTS, ...party};
    }
  }
  return pack;
};

// text of our own, for things the game has no string for. added to the
// English localization pack under ids far above the game's (about 41,000).
const ADDED_STRINGS = {
  // the login popup for a launcher too old to send device ids (lib/world.js
  // LOGIN_OUTDATED), in place of "Your account is currently under maintenance."
  11198: "Your client is outdated. Update at https://burrow.moe/download",
  9000001: "Castle (2010 draft)",
  9000002: "Water Park (three slides)",
  9000003: "Water Park (five slides)",
  9000004: "Crystal Palace (concept)",
  // the buddy game the client's files call "fourGem"; no string says so.
  9000005: "Four Gems",
  // a shop's title when its room gives it none (lib/world.js SHOP_KIND_TITLES)
  9000010: "Clothing Shop",
  9000011: "Den Shop",
  9000012: "Den Rooms",
  9000013: "Shop",
  9000014: "Exchange",
  9000015: "Diamond Shop",
};

// the game under this server's name. its text says "Animal Jam", "Animal
// Jam Classic", "AJ Classic" and "AJ" in some six hundred places (shop and
// item names, phrases of the chat menus, popups, "AJHQ"); here they all say
// "Burrow", in capitals where the game shouted. web addresses are left as
// they are: "animaljam.com" is a place, not a name.
const NAME = "Burrow";
const renamed = text => text
  .replace(/Animal Jam Classic|AJ Classic|Animal Jam(?!\.com)|\bAJ(?=HQ\b)|\bAJ\b/gi, (found, at) => {
    // "aj" in small letters is somebody's word, not the game's name.
    if (/^aj$/i.test(found) && found !== "AJ") {
      return found;
    }
    const shouted = found === found.toUpperCase() && !/^AJ/.test(found);
    return (shouted ? NAME.toUpperCase() : NAME) + (text.slice(at + found.length, at + found.length + 2) === "HQ" ? " " : "");
  });
const withOurName = pack => {
  for (const [id, text] of Object.entries(pack)) {
    if (typeof text === "string" && /Animal Jam|AJ/i.test(text)) {
      pack[id] = renamed(text);
    }
  }
  return pack;
};

// the moderators' message boxes (FacilitatorXtCommManager "fp") keep
// "\n" as two characters, which the client shows just as written
// ("--Message From Moderator--\n\nhello"). real line breaks in their place.
const LITERAL_LINE_BREAKS = ["11134", "11135"];
const withLineBreaks = pack => {
  for (const id of LITERAL_LINE_BREAKS) {
    if (typeof pack[id] === "string") {
      pack[id] = pack[id].replace(/\\n/g, "\n");
    }
  }
  return pack;
};

// items the staff make while the server runs (lib/customitems.js): an
// existing item's art under a new id, name and price. their rows and names
// are kept here, and go into the packs like the rows above, after the
// renaming (a name staff chose is left as they wrote it).
const customRows = new Map([[DEF_ITEM, new Map()], [DEF_DEN_ITEM, new Map()]]); // pack -> id -> row
const customStrings = {}; // localization id -> name
const customInShop = {clothing: new Set(), den: new Set()}; // ids on sale
let customVersion = 0; // goes up with every change, for anything that keeps a list of items

const withCustomRows = id => pack => {
  const at = new Map(Object.entries(pack).map(([key, def]) => [String(def.id), key]));
  let next = Math.max(-1, ...Object.keys(pack).map(Number).filter(Number.isInteger)) + 1;
  for (const row of customRows.get(id).values()) {
    // a changed row replaces the one the pack was made with.
    pack[at.has(row.id) ? at.get(row.id) : next++] = {...row};
  }
  return pack;
};

// colours of clothing items from a dump of a beta-era inventory (art id,
// then the colour as 4 bytes, little-endian), added after each item's own
// so the colours already given keep their place. the shop shows a list's
// first 8 only, so these are had from the item givers.
const DUMP_COLOURS = new Map([
  [231, [0x6929C069]], // Rare Eyeball Hat (Beta EyeBall; tried in the game)
  [224, [0x67520169]], // Creature Mask (Beta Creature Mask)
  [136, [0x2C083069, 0x55153131]], // Tiara (Beta Tiara, Milky Tiara)
  [135, [0x83550505]], // Arctic Hood (Beta Hood)
  [169, [0x937FF63B]], // Elf Helmet (Beta Elf)
  [714, [0x00000069]], // Furry Hat (Real Magenta Furry Hat)
  [649, [0x2E2D1906]], // Turquoise Ring (1st Glitched Ring)
]);

const withDumpColours = pack => {
  for (const def of Object.values(pack)) {
    const added = def && DUMP_COLOURS.get(Number(def.id));
    if (added) {
      const colours = String(def.colors).split(",").filter(Boolean);
      def.colors = [...colours, ...added.map(String).filter(colour => !colours.includes(colour))].join(",");
    }
  }
  return pack;
};

const withAddedStrings = pack => Object.assign(withLineBreaks(withOurName(Object.assign(pack, ADDED_STRINGS, extraMusic.strings()))), customStrings);

// the extra music tracks (lib/extramusic.js), as den items like the
// official tracks.
const withExtraMusic = pack => {
  const rows = Object.values(pack);
  const template = rows.find(def => Number(def.id) === extraMusic.TEMPLATE);
  const present = new Set(rows.map(def => String(def.id)));
  let next = Math.max(-1, ...Object.keys(pack).map(Number).filter(Number.isInteger)) + 1;
  for (const def of template ? extraMusic.defs(template) : []) {
    if (!present.has(def.id)) {
      pack[next++] = def;
    }
  }
  return pack;
};

// den rooms on the CDN that no den def sells: four early drafts, each one
// drawing where the finished den has many parts. they are sold like any
// den, with the picture of the den they turned into.
const ADDED_DENS = [
  {id: "62", titleStrRef: "9000001", mediaRef: "83", iconMediaRef: "84", roomDefId: "130"}, // player_den/room_castle_lrg
  {id: "63", titleStrRef: "9000002", mediaRef: "425", iconMediaRef: "1026", roomDefId: "187"}, // room_main_waterpark3
  {id: "64", titleStrRef: "9000003", mediaRef: "425", iconMediaRef: "1026", roomDefId: "186"}, // room_main_waterpark4
  {id: "65", titleStrRef: "9000004", mediaRef: "2777", iconMediaRef: "2776", roomDefId: "441"}, // room_main_epicpalace
];
const DEN_DEFAULTS = {cost: "5000", enviroType: "0", storeStatus: "0", membersOnly: "0", availabilityStartTime: null, availabilityEndTime: null};

const withAddedDens = pack => {
  const ids = new Set(Object.values(pack).map(def => String(def.id)));
  let next = Math.max(-1, ...Object.keys(pack).map(Number).filter(Number.isInteger)) + 1;
  for (const den of ADDED_DENS) {
    if (!ids.has(den.id)) {
      pack[next++] = {...DEN_DEFAULTS, ...den};
    }
  }
  return pack;
};

// with config.freeShops everything in every shop costs nothing: every
// account has ten million of each currency anyway (config.minimumCurrency),
// so a price is only a number to read past. the field a price is in differs
// by pack.
const PRICE_FIELDS = new Map([[DEF_ITEM, "value"], [DEF_DEN_ITEM, "cost"], [DEF_DIAMOND, "cost"], [DEF_PET, "cost"], [DEF_DEN_ROOM, "cost"]]);
const withoutPrices = (id, change = pack => pack) => pack => {
  change(pack);
  if (config.freeShops && PRICE_FIELDS.has(id)) {
    for (const def of Object.values(pack)) {
      if (def && def[PRICE_FIELDS.get(id)] !== undefined) {
        def[PRICE_FIELDS.get(id)] = "0";
      }
    }
  }
  return pack;
};

// what both the server and the clients get changed: rows put back or added.
const SHARED_CHANGES = new Map([
  [DEF_ROOM, withRestoredRooms],
  [DEF_PARTY, withRestoredParties],
  [DEF_DEN_ROOM, withoutPrices(DEF_DEN_ROOM, withAddedDens)],
  [DEF_DEN_ITEM, withoutPrices(DEF_DEN_ITEM, pack => withCustomRows(DEF_DEN_ITEM)(withExtraMusic(pack)))],
  [DEF_ITEM, withoutPrices(DEF_ITEM, pack => withCustomRows(DEF_ITEM)(withDumpColours(pack)))],
  [DEF_DIAMOND, withoutPrices(DEF_DIAMOND)],
  [DEF_PET, withoutPrices(DEF_PET)],
  [DEF_LOCALIZATION_EN, withAddedStrings],
  [DEF_NAMEBAR_BADGE, badges.addTagDefs], // the name tag badges the admin gives: lib/badges.js
]);

// den items and clothing that are in the tables and were never, or not for
// years, in a shop: the Beta set, items named for testing, and items with
// no name. they get a shop each (ODDITY_SHOPS in lib/world.js) and are on
// sale there whatever their dates say. worked out in init().
const TEST_DEN_ITEMS = [584, 1517, 1518, 2196, 2199, 2200, 3118, 3123];
const FOUNDERS_HAT = 215;
let oddDenItemIds = [];
let oddClothingIds = [];

const alwaysOnSale = (pack, ids) => {
  const wanted = new Set(ids.map(String));
  for (const def of Object.values(pack)) {
    if (wanted.has(String(def.id))) {
      def.availabilityStartTime = "0";
      def.availabilityEndTime = "0";
    }
  }
};

// the packs clients get in a form of their own, each made by changing the
// official one:
//   items       every eye type usable by every animal. the official pack
//               keeps the two ocean eyes to the animals that have art for
//               them; on any other animal they are simply not drawn, which
//               is wanted here as a way to have no eyes.
//               (ItemXtCommManager.canUseItem is the check.) Clothing
//               likewise: the official pack keeps each item to the animals
//               it was drawn for (no beret on a penguin). and sale dates.
//   den items, the diamond shop
//               sale dates (lib/sales.js), which is why these are made
//               again each day.
//   animals, pets, dens
//               no sale dates at all.
//   rooms, parties, dens, strings, name tag badges
//               the rows put back or added (SHARED_CHANGES).
const CLIENT_PACKS = new Map([
  [DEF_ITEM, pack => {
    for (const [key, def] of Object.entries(pack)) {
      if (def.type === TYPE_CLOTHING || (def.type === "0" && def.layerId === LAYER_EYES)) {
        pack[key] = clientItemRow(def);
      }
    }
    sales.stamp("clothing", pack);
    alwaysOnSale(pack, oddClothingIds);
  }],
  [DEF_DEN_ITEM, pack => {
    sales.stamp("denItems", pack);
    alwaysOnSale(pack, oddDenItemIds);
  }],
  [DEF_DIAMOND, pack => sales.stamp("diamond", pack)],
  // animals, pets and dens are never out of season here. the official pack
  // dates the "travelling" animals and a few pets and dens, and the client
  // will not offer what its dates do not cover.
  [DEF_AVATAR, sales.always],
  [DEF_PET, sales.always],
  [DEF_DEN_ROOM, sales.always],
  [DEF_ROOM, () => {}],
  [DEF_PARTY, () => {}],
  [DEF_LOCALIZATION_EN, () => {}],
  [DEF_NAMEBAR_BADGE, () => {}],
]);
const clientPackPaths = new Map([...CLIENT_PACKS.keys()].map(id => [cdn.hashedPath(`defPacks/${id}`), id]));
const clientPackBodies = new Map(); // id -> {day, allOnSale, body, version, madeAt}
const clientPacksChanged = new Set(); // ids whose body is older than a custom item change
const clientPacksMaking = new Map(); // id -> the promise of the body being made
// a pack is made again after a custom item change at most every
// config.packRemakeMs: the item pack takes ~70 ms of the one thread at 5000
// items (~300 ms at 50000), and players make items many times a minute.
// until then the body made before goes out, with the version it has; a
// game logging in is sent what changed after it (lib/customitems.js sendAll).
const deflateRaw = require("util").promisify(zlib.deflateRaw);
// the packs custom items are in: their rows, and their names
const CUSTOM_PACK_KINDS = new Map([[DEF_ITEM, "clothing"], [DEF_DEN_ITEM, "den"], [DEF_LOCALIZATION_EN, "names"]]);

const makeClientPack = async id => {
  // the version before the rows are read: a change while it is made counts
  // as after, and is sent at login (more than needed, never less)
  const version = customVersion;
  const pack = await loadChanged(id);
  CLIENT_PACKS.get(id)(pack);
  // deflated on libuv's threads, not this one
  const body = await deflateRaw(amf3.encode(pack));
  const made = {day: sales.today(), allOnSale: sales.everythingOnSale(), body, version, madeAt: Date.now()};
  clientPackBodies.set(id, made);
  if (customVersion === version) {
    clientPacksChanged.delete(id);
  }
  return made;
};

// the pack at `relPath` as clients should get it, {body, version}, or null
// when it is not one of the above (and comes straight from the CDN).
// `version`: customVersion() of the custom items in it.
const clientPack = async relPath => {
  const id = clientPackPaths.get(relPath);
  if (id === undefined) {
    return null;
  }
  const made = clientPackBodies.get(id);
  if (made && made.day === sales.today() && made.allOnSale === sales.everythingOnSale()
    && (!clientPacksChanged.has(id) || Date.now() - made.madeAt < config.packRemakeMs)) {
    return made;
  }
  if (!clientPacksMaking.has(id)) {
    clientPacksMaking.set(id, makeClientPack(id).finally(() => clientPacksMaking.delete(id)));
  }
  return clientPacksMaking.get(id);
};

// most packs are tables: an object of rows keyed by row index.
const load = async id => {
  if (!packs.has(id)) {
    packs.set(id, Object.values(await loadChanged(id)));
  }
  return packs.get(id);
};

let avatarDefs = new Map();
let roomDefsByPath = new Map();
let itemDefs = new Map();
let clothingIds = [];
let petIds = [];
let customAvatarDefs = new Map();
let denItemDefs = new Map();
let denItemIds = [];
let petDefs = new Map();
let strings = {}; // localization id -> English text
let stringIds = null; // English text -> localization id, built when first asked
let denRoomPaths = new Map();
let diamondDefs = new Map(); // diamond def id -> {id, type, refId, cost}
let denRoomDefs = new Map(); // den room def id -> "player_den/..." room path
let listTypes = new Map(); // generic list id -> defPack type of its entries
let patternLists = new Map(); // generic list id -> pattern item ids of a custom avatar
let achievementDefs = []; // {id, userVarRef, triggerAmount}
let exchangeDefs = new Map(); // id -> {cost, costType, result, resultType}
let adoptAPetDefs = new Map();
let partyDefs = new Map(); // id -> {id, room ("party.venue_x"), restrictions, avatarDefFlags, isCustom, isGame}
let worldItemDefs = new Map();
let petFoodDefs = [];
let petToyDefs = [];
let musicIds = []; // den items that are music tracks
let roomDefsById = new Map();
let badgeIds = []; // name tag badges, ascending
let npcDefs = new Map(); // the characters of the adventures, see lib/disguises.js
// An avatar attachment is named by its emoticon definition id on the wire,
// while AvatarWorldView needs the media id stored by that definition.
let emoticonMediaIds = new Map();

// A pack whose feature can be done without: missing (offline and never
// cached) just leaves that feature empty.
const loadOptional = async id => {
  try {
    return await load(id);
  }
  catch (err) {
    console.log(`[defs] ${logText(err.message)}; the feature that uses it is off`);
    return [];
  }
};

const init = async () => {
  avatarDefs = new Map((await load(DEF_AVATAR)).map(def => [Number(def.id), def]));
  roomDefsByPath = new Map((await load(DEF_ROOM)).map(def => [String(def.pathName).toLowerCase(), def]));
  const roomPathsById = new Map((await load(DEF_ROOM)).map(def => [Number(def.id), String(def.pathName)]));
  denRoomDefs = new Map((await load(DEF_DEN_ROOM)).map(def => [Number(def.id), def]));
  denRoomPaths = new Map((await load(DEF_DEN_ROOM)).map(def => [Number(def.id), roomPathsById.get(Number(def.roomDefId))]));
  diamondDefs = new Map((await load(DEF_DIAMOND)).map(def => [Number(def.id), def]));
  badgeIds = (await loadOptional(DEF_NAMEBAR_BADGE)).map(def => Number(def.id)).sort((one, other) => one - other);
  listTypes = new Map((await load(DEF_GENERIC_LIST_TYPE)).map(def => [Number(def.id), Number(def.typeId)]));
  itemDefs = new Map((await load(DEF_ITEM)).map(def => [Number(def.id), def]));
  // type 1 = clothing and accessories; type 0 = body parts, eyes and patterns
  clothingIds = [...itemDefs].filter(([, def]) => def.type === "1").map(([id]) => id);
  petDefs = new Map((await load(DEF_PET)).map(def => [Number(def.id), def]));
  petIds = [...petDefs.keys()];
  denItemDefs = new Map((await load(DEF_DEN_ITEM)).map(def => [Number(def.id), def]));
  // special types carry extra state (a den portal's destination, a shop's
  // stock, ...). of those only mannequins (4) are modelled, in lib/dens.js,
  // so plain den items and mannequins are what is offered.
  // the Masterpiece item is a painting's frame, made in the Art Studio and
  // nowhere else (lib/masterpieces.js).
  denItemIds = [...denItemDefs].filter(([id, def]) => OFFERED_SPECIAL_TYPES.includes(def.specialType) && id !== DEN_ITEM_MASTERPIECE).map(([id]) => id);
  strings = await loadChanged(DEF_LOCALIZATION_EN);
  // the Beta set first, then the test items, then the nameless ones (some
  // 260, many of them one item in several colours): a shop shows its list
  // in the order given.
  const isBeta = id => /beta/i.test(denItemDefs.get(id).abbrName);
  const isTest = id => TEST_DEN_ITEMS.includes(id);
  const isNameless = id => !strings[denItemDefs.get(id).nameStrId];
  oddDenItemIds = [
    ...denItemIds.filter(isBeta),
    ...denItemIds.filter(id => isTest(id) && !isBeta(id)),
    ...denItemIds.filter(id => isNameless(id) && !isBeta(id) && !isTest(id)),
  ];
  oddClothingIds = [FOUNDERS_HAT, ...clothingIds.filter(id => id !== FOUNDERS_HAT && !strings[itemDefs.get(id).titleStrId])];
  customAvatarDefs = new Map((await load(DEF_AVATAR_CUSTOM)).map(def => [Number(def.id), def]));
  for (const def of await load(DEF_AVATAR_CUSTOM)) {
    const listId = Number(def.patternListRefId);
    const patterns = Number(def.patternRefId) ? [Number(def.patternRefId)] : CUSTOM_PATTERNS.get(Number(def.id)) || [];
    patternLists.set(listId, [...(patternLists.get(listId) || []), ...patterns]);
  }
  roomDefsById = new Map((await load(DEF_ROOM)).map(def => [Number(def.id), def]));
  // typeCat 4 is music (the jukebox tracks; also what a hosted party plays)
  musicIds = [...denItemDefs].filter(([id, def]) => def.typeCat === "4" && def.specialType === "0" && !extraMusic.ids.includes(id)).map(([id]) => id);
  achievementDefs = (await loadOptional(DEF_ACHIEVEMENTS))
    .map(def => ({id: Number(def.id), userVarRef: Number(def.userVarRef), triggerAmount: Number(def.triggerAmount), name: String(def.name)}))
    .filter(def => def.userVarRef > 0 && !/REUSE/.test(def.name));
  exchangeDefs = new Map((await loadOptional(DEF_CURRENCY_EXCHANGE)).map(def => [Number(def.id),
    {id: Number(def.id), cost: Number(def.cost), costType: Number(def.costType), result: Number(def.result), resultType: Number(def.resultType)}]));
  adoptAPetDefs = new Map((await loadOptional(DEF_ADOPT_A_PET)).map(def => [Number(def.id), def]));
  worldItemDefs = new Map((await loadOptional(DEF_WORLD_ITEMS)).map(def => [Number(def.id), def]));
  petFoodDefs = await loadOptional(DEF_PET_FOOD);
  petToyDefs = await loadOptional(DEF_PET_TOY);
  npcDefs = new Map((await loadOptional(DEF_NPC)).map(def => [Number(def.id), def]));
  emoticonMediaIds = new Map((await loadOptional(DEF_EMOTICON)).map(def => [Number(def.id), Number(def.mediaRef)]));
  partyDefs = new Map((await loadOptional(DEF_PARTY)).map(def => {
    const room = roomPathsById.get(Number(def.roomDefId));
    return [Number(def.id), {
      id: Number(def.id),
      room: room && room.replace(/\//g, ".").toLowerCase(),
      titleStrId: Number(def.titleStrId),
      restrictions: Number(def.restrictions),
      avatarDefFlags: String(def.avatarDefFlags),
      isCustom: def.isCustom === "1",
      isGame: def.isGame === "1",
    }];
  }));
  console.log(`[defs] ${logText(avatarDefs.size)} avatars, ${logText(roomDefsByPath.size)} rooms, ${logText(clothingIds.length)} clothing items, ${logText(denItemIds.length)} den items, ${logText(petIds.length)} pets`);
};

// puts a custom item (lib/customitems.js) in, or changes one already in:
// `kind` "clothing" or "den", `row` its full def row (strings, as in the
// packs), `name` its English name under the row's string id. the server's
// tables have it at once, and the packs clients fetch are made again.
// `inShop` false takes it out of the shop (the ones players have still draw).
const setCustomItem = (kind, row, name, inShop = true) => {
  const pack = kind === "den" ? DEF_DEN_ITEM : DEF_ITEM;
  const id = Number(row.id);
  const stringId = kind === "den" ? row.nameStrId : row.titleStrId;
  customRows.get(pack).set(id, row);
  customStrings[stringId] = name;
  strings[stringId] = name;
  stringIds = null;
  if (packs.has(pack)) {
    packs.set(pack, [...packs.get(pack).filter(def => Number(def.id) !== id), row]);
  }
  if (kind === "den") {
    denItemDefs.set(id, row);
    denItemIds = denItemIds.includes(id) ? denItemIds : [...denItemIds, id];
  }
  else {
    itemDefs.set(id, row);
    clothingIds = clothingIds.includes(id) ? clothingIds : [...clothingIds, id];
  }
  customInShop[kind][inShop ? "add" : "delete"](id);
  clientPacksChanged.add(pack);
  clientPacksChanged.add(DEF_LOCALIZATION_EN);
  customVersion++;
};

// a custom item deleted (lib/customitems.js): out of the tables and the
// packs new games fetch. its name stays under its string id, unused.
const unsetCustomItem = (kind, id) => {
  const pack = kind === "den" ? DEF_DEN_ITEM : DEF_ITEM;
  const number = Number(id);
  customRows.get(pack).delete(number);
  if (packs.has(pack)) {
    packs.set(pack, packs.get(pack).filter(def => Number(def.id) !== number));
  }
  if (kind === "den") {
    denItemDefs.delete(number);
    denItemIds = denItemIds.filter(one => one !== number);
  }
  else {
    itemDefs.delete(number);
    clothingIds = clothingIds.filter(one => one !== number);
  }
  customInShop[kind].delete(number);
  clientPacksChanged.add(pack);
  customVersion++;
};

module.exports = {
  init,
  setCustomItem,
  unsetCustomItem,
  // the custom items on sale, the newest first.
  customShopIds: kind => [...customInShop[kind]].reverse(),
  customVersion: () => customVersion,
  // a change of a custom item that is not in the packs (its picture): one
  // more version, for a game logging in to be told of it
  customChanged: () => ++customVersion,
  // the avatarUseFlags every clothing row has in the clients' pack (any animal)
  EVERY_AVATAR,
  // "clothing", "den" or "names" for a pack path with custom items in (lib/customitems.js sawPack), else null.
  customPackKind: relPath => CUSTOM_PACK_KINDS.get(clientPackPaths.get(relPath)) || null,
  load,
  itemDef: id => itemDefs.get(Number(id)),
  clothingIds: () => clothingIds,
  petIds: () => petIds,
  denItemDef: id => denItemDefs.get(Number(id)),
  denItemIds: () => denItemIds,
  clientPack,
  // A changing rule must not leave the cached item pack permissive. The next
  // client request remakes it, and current games receive an xdi row too.
  invalidateClientItemPack: () => clientPackBodies.delete(DEF_ITEM),
  clientItemRow,
  clientItemDef: id => {
    const def = itemDefs.get(Number(id));
    return def ? clientItemRow(def) : null;
  },
  string: id => (Object.hasOwn(strings, id) ? String(strings[id]) : ""),
  stringId: text => {
    if (!stringIds) {
      stringIds = new Map();
      for (const [id, value] of Object.entries(strings)) {
        if (typeof value === "string" && !stringIds.has(value)) {
          stringIds.set(value, Number(id));
        }
      }
    }
    return stringIds.get(text) || 0;
  },
  badgeIds: () => badgeIds,
  npcDef: id => npcDefs.get(Number(id)),
  emoticonMediaId: id => emoticonMediaIds.get(Number(id)) || 0,
  oddDenItemIds: () => oddDenItemIds,
  // den items that exist to be given by id and are in no shop.
  unsoldDenItemIds: () => extraMusic.ids,
  oddClothingIds: () => oddClothingIds,
  roomPaths: () => [...roomDefsByPath.keys()],
  customAvatarDef: id => customAvatarDefs.get(Number(id)),
  avatarDef: type => avatarDefs.get(Number(type)),
  denRoomName: denDefId => {
    const pathName = denRoomPaths.get(Number(denDefId));
    return pathName && pathName.replace(/\//g, ".");
  },
  denRoomDef: id => denRoomDefs.get(Number(id)),
  denRoomIds: () => [...denRoomDefs.keys()],
  // what a diamond-priced thing is sold as: `type` says what `refId` is the
  // def id of (see DIAMOND_TYPES), `cost` is in diamonds.
  diamondDef: id => diamondDefs.get(Number(id)),
  diamondIds: () => [...diamondDefs.keys()],
  listType: listId => listTypes.get(Number(listId)),
  // every generic list id whose entries are of this defPack type, ascending.
  listsOfType: type => [...listTypes].filter(([, listType]) => listType === type).map(([id]) => id).sort((a, b) => a - b),
  achievementDefs: () => achievementDefs,
  exchangeDef: id => exchangeDefs.get(Number(id)),
  exchangeDefs: () => [...exchangeDefs.values()],
  adoptAPetDef: id => adoptAPetDefs.get(Number(id)),
  adoptAPetIds: () => [...adoptAPetDefs.keys()],
  partyDef: id => partyDefs.get(Number(id)),
  partyDefs: () => [...partyDefs.values()],
  worldItemDef: id => worldItemDefs.get(Number(id)),
  worldItemIds: () => [...worldItemDefs.keys()],
  petDef: id => petDefs.get(Number(id)),
  petFoodDefs: () => petFoodDefs,
  petToyDefs: () => petToyDefs,
  musicIds: () => musicIds,
  extraMusicIds: () => extraMusic.ids,
  roomDefById: id => roomDefsById.get(Number(id)),
  patternList: listId => patternLists.get(Number(listId)),
  // the pattern a custom animal starts with
  customPattern: id => {
    const def = customAvatarDefs.get(Number(id));
    return def ? (patternLists.get(Number(def.patternListRefId)) || [0])[0] : 0;
  },
  avatarTypes: () => [...avatarDefs.keys()],
  // first non-member land animal, falling back to whatever the pack lists
  // first.
  defaultAvatarType: () => {
    for (const [id, def] of avatarDefs) {
      if (def.membersOnly !== "1" && (Number(def.enviroTypeFlags) & 1)) {
        return id;
      }
    }
    return avatarDefs.keys().next().value;
  },
  // "jamaa_township.room_main" -> row of the room defPack
  roomDef: roomName => roomDefsByPath.get(roomName.replace(/\./g, "/").toLowerCase()),
};
