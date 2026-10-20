"use strict";

const {logText} = require("./logtext.js");
const accounts = require("./accounts.js");
const defpacks = require("./defpacks.js");
const limits = require("./limits.js");

// items the staff make while the server runs, with no restart of the server
// or of anybody's game. each is an existing item's art (the clothing piece
// or den item it is made from) under an id, name, price and colours of its
// own. the server's tables and the packs new games fetch have it at once
// (defpacks.setCustomItem); games already playing are sent its def row
// ("xdi", which the patched client adds to its tables), and so is a game at
// login if its packs may be older than the item (sendAll).
//
// an item can be taken out of the shop, renamed and repriced, or deleted:
// then it goes from every inventory too (lib/itemcontrol.js).

// ids far above the game's own (clothing to about 4,600, den items to about
// 6,000), one range per pack; names go under localization ids above the
// server's other added strings (lib/defpacks.js ADDED_STRINGS, 9000001 on).
const FIRST_ID = 50000;
const STRING_BASE = {clothing: 9100000, den: 9200000};
const KINDS = ["clothing", "den"];
const MAX_NAME = 40;
const MAX_COST = 1000000;
const MAX_COLOURS = 16;
const MAX_ITEMS = 5000; // per kind
const CHUNK = 40; // def rows per "xdi" message
const TYPE_CLOTHING = "1";
const OFFERED_SPECIAL_TYPES = ["0", "4"]; // den items that can be copied: plain, mannequin
const CURRENCY_GEMS = "0";
// the fields of a def row the patched client reads from "xdi"
// (ItemXtCommManager.addItemDef, DenXtCommManager.addDenItemDef): the rest of
// the base's row is only weight, ~600 bytes a row and 5000 rows at login.
const CLIENT_FIELDS = {
  clothing: ["id", "layerDefId", "layerId", "type", "value", "titleStrId", "isGiftable", "membersOnly", "itemStatus", "enviroType",
    "avatarUseFlags", "recycleValue", "currencyType", "defense", "attack", "attackMediaRefId", "combatType", "modifierType",
    "modifierValue", "criticalHit", "combinedCost", "colors", "availabilityStartTime", "availabilityEndTime"],
  den: ["id", "abbrName", "combinedCost", "cost", "currencyType", "enviroType", "flag", "gameDefId", "itemStatus", "layer",
    "mannequinAvatarDefId", "mannequinCatId", "membersOnly", "nameStrId", "parentArrayId", "promoType", "recycleValue",
    "scalePercent", "sortCat", "specialType", "typeCat", "availabilityStartTime", "availabilityEndTime", "ecoPower"],
};
// how long a fetch of the packs is taken to describe a game of that address
// that logs in (sendAll). a game logs in minutes after it fetched them.
const PACKS_SEEN_MS = 2 * 3600000;
const MAX_PACKS_SEEN = 100000; // addresses

const SCHEMA = `CREATE TABLE IF NOT EXISTS custom_items (
  kind TEXT NOT NULL, id INTEGER NOT NULL, base INTEGER NOT NULL, name TEXT NOT NULL,
  cost INTEGER NOT NULL, members INTEGER NOT NULL, colors TEXT NOT NULL, in_shop INTEGER NOT NULL,
  created_by TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (kind, id))`;

const items = new Map(KINDS.map(kind => [kind, new Map()])); // kind -> id -> entry
let made = 0; // entries in the order they were made (`seq`), for lists
let broadcast = () => {}; // (cmd, ...params) to every game playing; set by lib/world.js
// address key -> {at, clothing, den, names}: the version (defpacks
// customVersion) of the packs with custom items in that address last
// fetched, the oldest within PACKS_SEEN_MS (players behind one address
// fetch at different times). an entry's `changed` is the version of its last change.
const packsSeen = new Map();

const db = () => accounts.database();
const now = () => Math.floor(Date.now() / 1000);

const baseDef = (kind, id) => (kind === "den" ? defpacks.denItemDef(id) : defpacks.itemDef(id));

// the file name an uploaded music track is asked for by (lib/custommusic.js):
// a new upload is a new name, so no game plays an old copy from its cache.
const audioName = entry => `CustomMusic${entry.id}_${entry.audio}`;
let audioGone = () => {}; // (entry): an uploaded track's item was deleted; set by lib/custommusic.js

// the def row of an entry: its base's row with its own id, name, price and
// colours, always on sale and marked new.
const rowOf = entry => {
  const base = baseDef(entry.kind, entry.base);
  const own = {
    id: String(entry.id),
    membersOnly: entry.members ? "1" : "0",
    itemStatus: "1",
    availabilityStartTime: "0",
    availabilityEndTime: "0",
    currencyType: CURRENCY_GEMS,
    recycleValue: "0",
    combinedCost: "",
  };
  if (entry.kind === "den") {
    // a music track uploaded by staff (lib/custommusic.js): the game plays
    // "audio/<abbrName>.mp3", which the server answers with its file
    if (entry.audio) {
      own.abbrName = audioName(entry);
    }
    return {...base, ...own, nameStrId: String(STRING_BASE.den + entry.id - FIRST_ID), cost: String(entry.cost)};
  }
  return {...base, ...own, titleStrId: String(STRING_BASE.clothing + entry.id - FIRST_ID), value: String(entry.cost), colors: entry.colors.join(","), isGiftable: "1"};
};

const apply = entry => {
  defpacks.setCustomItem(entry.kind, rowOf(entry), entry.name, entry.inShop);
  entry.changed = defpacks.customVersion();
};

// what "xdi" carries of an entry: the fields the client reads, its name and
// picture. clothing goes through the clients' pack transform, so the wear
// rules reach custom items too.
const clientRow = entry => {
  const row = entry.kind === "clothing" ? defpacks.clientItemRow(rowOf(entry)) : rowOf(entry);
  const out = {};
  for (const field of CLIENT_FIELDS[entry.kind]) {
    if (row[field] !== undefined) {
      out[field] = row[field];
    }
  }
  return {...out, name: entry.name, art: entry.artPending ? "" : entry.art || "", artMode: entry.artMode || "sticker"};
};

// "xdi" [.., .., kind, json]: def rows with their names, as JSON. a field
// may not hold "%" (lib/sfs.js drops it), so a "%" in a name is written as
// JSON's %.
const xtRows = rows => JSON.stringify(rows).replace(/%/g, "\\u0025");

const messages = entries => {
  const out = [];
  for (const kind of KINDS) {
    // a picture waiting for a moderator is not shown yet
    const rows = entries.filter(entry => entry.kind === kind && !entry.pending).map(clientRow);
    for (let at = 0; at < rows.length; at += CHUNK) {
      out.push([kind, xtRows(rows.slice(at, at + CHUNK))]);
    }
  }
  return out;
};

// The patched client accepts ordinary clothing rows through xdi as well as
// newly made ones.  That lets a moderation rule take effect in an already
// open editor instead of waiting for its next def-pack download.
const sendClothingDefs = ids => {
  const rows = [...new Set(ids.map(Number))].map(id => {
    const entry = items.get("clothing").get(id);
    // A refreshed custom row must retain the extra xdi-only fields. Omitting
    // them makes a live client lose its custom name or picture while its
    // avatar-use flag is being updated.
    return entry ? {...defpacks.clientItemRow(rowOf(entry)), name: entry.name, art: entry.artPending ? "" : entry.art || "",
      artMode: entry.artMode || "sticker"} : defpacks.clientItemDef(id);
  }).filter(row => row && row.type === TYPE_CLOTHING);
  for (let at = 0; at < rows.length; at += CHUNK) {
    broadcast("xdi", "clothing", xtRows(rows.slice(at, at + CHUNK)));
  }
};

const announce = entry => {
  if (entry.pending) {
    return;
  }
  for (const params of messages([entry])) {
    broadcast("xdi", ...params);
  }
};

const fromRow = row => ({
  kind: row.kind, id: row.id, base: row.base, name: row.name, cost: row.cost, members: row.members === 1,
  colors: row.colors ? row.colors.split(",").map(Number) : [], inShop: row.in_shop === 1, createdBy: row.created_by, createdAt: row.created_at,
  ownerId: row.owner_id ?? null,
  art: row.art || null,
  artMode: LOOKS.includes(row.art_mode) ? row.art_mode : "sticker",
  pending: row.pending === 1,
  artPending: row.art_pending === 1,
  audio: /^[0-9a-f]{8,64}$/.test(row.audio || "") ? row.audio : null,
});

// a player-made item (lib/playeritems.js) has the maker's account id;
// staff-made ones none. an item with a picture of its own (lib/itemart.js)
// has its version. the columns came later than the table.
const addOwnerColumn = () => {
  const columns = db().prepare("PRAGMA table_info(custom_items)").all().map(column => column.name);
  if (!columns.includes("owner_id")) {
    db().exec("ALTER TABLE custom_items ADD COLUMN owner_id INTEGER");
  }
  if (!columns.includes("art")) {
    db().exec("ALTER TABLE custom_items ADD COLUMN art TEXT");
  }
  if (!columns.includes("art_mode")) {
    db().exec("ALTER TABLE custom_items ADD COLUMN art_mode TEXT");
  }
  // waiting for a moderator (lib/playeritems.js, when the admin asks for it):
  // the item itself, or only its newest picture
  if (!columns.includes("pending")) {
    db().exec("ALTER TABLE custom_items ADD COLUMN pending INTEGER");
  }
  if (!columns.includes("art_pending")) {
    db().exec("ALTER TABLE custom_items ADD COLUMN art_pending INTEGER");
  }
  // a music track uploaded by staff (lib/custommusic.js): its file's version
  if (!columns.includes("audio")) {
    db().exec("ALTER TABLE custom_items ADD COLUMN audio TEXT");
  }
};

const load = () => {
  db().exec(SCHEMA);
  addOwnerColumn();
  for (const row of db().prepare("SELECT * FROM custom_items ORDER BY rowid").all()) {
    const entry = {...fromRow(row), seq: made++};
    if (!baseDef(entry.kind, entry.base)) {
      console.log(`[custom items] ${logText(entry.kind)} ${logText(entry.id)} is made from ${logText(entry.base)}, which is not in the packs; left out`);
      continue;
    }
    items.get(entry.kind).set(entry.id, entry);
    if (!entry.pending) {
      apply(entry);
    }
  }
  console.log(`[custom items] ${logText(items.get("clothing").size)} clothing, ${logText(items.get("den").size)} den items`);
};

// checks what staff typed. returns {error} or the cleaned values.
const NAME_PATTERN = /^[\p{L}\p{N} '&!?.,:()#+\-]+$/u;
const clean = (kind, fields, current = null) => {
  const out = {};
  if (fields.name !== undefined || !current) {
    const name = String(fields.name || "").trim().replace(/\s+/g, " ");
    if (!name || name.length > MAX_NAME || !NAME_PATTERN.test(name)) {
      return {error: `A name of 1 to ${MAX_NAME} letters, numbers, spaces and simple punctuation, please.`};
    }
    out.name = name;
  }
  if (fields.cost !== undefined || !current) {
    const cost = Number(fields.cost === undefined || fields.cost === "" ? 0 : fields.cost);
    if (!Number.isInteger(cost) || cost < 0 || cost > MAX_COST) {
      return {error: `A price from 0 to ${MAX_COST} gems, please.`};
    }
    out.cost = cost;
  }
  if (fields.members !== undefined || !current) {
    out.members = fields.members === true || fields.members === "1" || fields.members === 1;
  }
  if (fields.inShop !== undefined || !current) {
    out.inShop = fields.inShop === undefined ? true : fields.inShop === true || fields.inShop === "1" || fields.inShop === 1;
  }
  if (kind === "clothing" && (fields.colors !== undefined || !current)) {
    const base = baseDef(kind, current ? current.base : fields.base);
    const baseColours = String(base.colors).split(",").map(Number);
    let colors = fields.colors;
    if (colors === undefined || colors === null || colors === "") {
      colors = baseColours;
    }
    else {
      colors = (Array.isArray(colors) ? colors : String(colors).split(",")).map(value => Number(String(value).trim()));
    }
    // a colour is a packed palette number, as in the packs (or a custom colour
    // id, lib/colours.js).
    if (colors.length === 0 || colors.length > MAX_COLOURS || !colors.every(value => Number.isInteger(value) && value >= 0 && value <= 0xFFFFFFFF)) {
      return {error: `1 to ${MAX_COLOURS} colours, each a number as the packs have them.`};
    }
    out.colors = colors;
  }
  return out;
};

// makes an item from `base`, an existing clothing piece or den item.
// `ownerId`: the player who made it (lib/playeritems.js), or null for staff.
// `pending`: it waits for a moderator (approve), out of the game till then.
// returns {item} or {error}.
const create = (kind, fields, by, ownerId = null, pending = false) => {
  if (!KINDS.includes(kind)) {
    return {error: "The kind is clothing or den."};
  }
  const baseId = Number(fields.base);
  const base = Number.isInteger(baseId) ? baseDef(kind, baseId) : null;
  if (!base || baseId >= FIRST_ID) {
    return {error: `No ${kind === "den" ? "den item" : "clothing"} with the id ${fields.base} to make it from (it must be one of the game's own).`};
  }
  if (kind === "clothing" && base.type !== TYPE_CLOTHING) {
    return {error: `${baseId} is a body part, not clothing.`};
  }
  if (kind === "den" && !OFFERED_SPECIAL_TYPES.includes(base.specialType)) {
    return {error: `Den item ${baseId} does something of its own (a portal, a game, ...) and cannot be copied.`};
  }
  if (items.get(kind).size >= MAX_ITEMS) {
    return {error: "There are as many custom items of that kind as there can be."};
  }
  const values = clean(kind, {...fields, base: baseId});
  if (values.error) {
    return values;
  }
  const id = Math.max(FIRST_ID - 1, ...items.get(kind).keys()) + 1;
  // `fields.audio`: an uploaded music track's version (lib/custommusic.js)
  const audio = kind === "den" && /^[0-9a-f]{8,64}$/.test(String(fields.audio || "")) ? String(fields.audio) : null;
  const entry = {kind, id, base: baseId, colors: [], ...values, createdBy: String(by), createdAt: now(), ownerId, artMode: "sticker", pending, artPending: false,
    audio, seq: made++};
  db().prepare("INSERT INTO custom_items (kind, id, base, name, cost, members, colors, in_shop, created_by, created_at, owner_id, pending, audio) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(kind, id, baseId, entry.name, entry.cost, entry.members ? 1 : 0, entry.colors.join(","), entry.inShop ? 1 : 0, entry.createdBy, entry.createdAt, ownerId, pending ? 1 : 0, audio);
  items.get(kind).set(id, entry);
  if (!pending) {
    apply(entry);
    announce(entry);
  }
  return {item: entry};
};

// changes the name, price, members-only, colours or whether it is on sale.
const update = (kind, id, fields) => {
  const entry = items.has(kind) && items.get(kind).get(Number(id));
  if (!entry) {
    return {error: "No such custom item."};
  }
  const values = clean(kind, fields, entry);
  if (values.error) {
    return values;
  }
  Object.assign(entry, values);
  db().prepare("UPDATE custom_items SET name = ?, cost = ?, members = ?, colors = ?, in_shop = ? WHERE kind = ? AND id = ?")
    .run(entry.name, entry.cost, entry.members ? 1 : 0, entry.colors.join(","), entry.inShop ? 1 : 0, kind, entry.id);
  if (!entry.pending) {
    apply(entry);
    announce(entry);
  }
  return {item: entry};
};

// how a clothing item with a picture of its own is worn: "sticker" (the
// picture where the item would be) or "texture" (the item's shape, painted
// with the picture). the patched client draws it (LayerBitmap.paintLayer).
const LOOKS = ["sticker", "texture"];

// returns {item} or {error}; every game is told.
const setArtMode = (kind, id, mode) => {
  const entry = items.has(kind) && items.get(kind).get(Number(id));
  if (!entry) {
    return {error: "No such custom item."};
  }
  if (!LOOKS.includes(mode)) {
    return {error: "The look is sticker or texture."};
  }
  entry.artMode = mode;
  db().prepare("UPDATE custom_items SET art_mode = ? WHERE kind = ? AND id = ?").run(mode, kind, entry.id);
  entry.changed = defpacks.customChanged();
  announce(entry);
  return {item: entry};
};

// its picture's version (lib/itemart.js), or null for none; every game is told.
// `pending`: the picture waits for a moderator, and is not shown till then.
const setArt = (kind, id, art, pending = false) => {
  const entry = items.has(kind) && items.get(kind).get(Number(id));
  if (!entry) {
    return;
  }
  entry.art = art || null;
  entry.artPending = Boolean(art && pending);
  db().prepare("UPDATE custom_items SET art = ?, art_pending = ? WHERE kind = ? AND id = ?").run(entry.art, entry.artPending ? 1 : 0, kind, entry.id);
  entry.changed = defpacks.customChanged();
  announce(entry);
};

// a moderator lets an item, or its picture, in (lib/playeritems.js approve).
// returns the entry, or null when there was nothing waiting.
const approve = (kind, id) => {
  const entry = items.has(kind) && items.get(kind).get(Number(id));
  if (!entry || (!entry.pending && !entry.artPending)) {
    return null;
  }
  entry.pending = false;
  entry.artPending = false;
  db().prepare("UPDATE custom_items SET pending = 0, art_pending = 0 WHERE kind = ? AND id = ?").run(kind, entry.id);
  apply(entry);
  announce(entry);
  return entry;
};

// deletes it from the tables (games playing keep its def row, which nothing
// uses now). taking it from the players who have it is the caller's.
// returns {item} or {error}.
const remove = (kind, id) => {
  const entry = items.has(kind) && items.get(kind).get(Number(id));
  if (!entry) {
    return {error: "No such custom item."};
  }
  db().prepare("DELETE FROM custom_items WHERE kind = ? AND id = ?").run(kind, entry.id);
  items.get(kind).delete(entry.id);
  defpacks.unsetCustomItem(kind, entry.id);
  if (entry.audio) {
    audioGone(entry);
  }
  return {item: entry};
};

const list = () => KINDS.flatMap(kind => [...items.get(kind).values()])
  .sort((one, other) => other.seq - one.seq);

module.exports = {
  KINDS,
  FIRST_ID,
  audioName,
  onAudioGone: callback => {
    audioGone = callback;
  },
  load,
  create,
  update,
  remove,
  setArt,
  setArtMode,
  approve,
  // what waits for a moderator: items, and pictures, the oldest first
  waiting: () => list().filter(entry => entry.pending || entry.artPending).reverse(),
  LOOKS,
  list,
  get: (kind, id) => (items.has(kind) && items.get(kind).get(Number(id))) || null,
  // the account id of the player who made an item, or null (staff's, or
  // one of the game's own).
  ownerOf: (kind, id) => {
    const entry = items.has(kind) && items.get(kind).get(Number(id));
    return entry ? entry.ownerId : null;
  },
  // can this base be made into an item? (the checks of create, for a list
  // to offer only those.)
  copyable: (kind, id) => {
    const def = baseDef(kind, id);
    return Boolean(def) && Number(id) < FIRST_ID && (kind === "clothing" ? def.type === TYPE_CLOTHING : OFFERED_SPECIAL_TYPES.includes(def.specialType));
  },
  // the base an item's art is from, for a list showing what each is.
  baseName: entry => {
    const def = baseDef(entry.kind, entry.base);
    return def ? defpacks.string(entry.kind === "den" ? def.nameStrId : def.titleStrId) || String(def.abbrName || entry.base) : String(entry.base);
  },
  // an address was sent a pack with custom items in: "clothing", "den" or
  // "names" (lib/defpacks.js customPackKind), made at `version`.
  sawPack(key, packKind, version) {
    const time = Date.now();
    const seen = packsSeen.get(key);
    if (seen && time - seen.at < PACKS_SEEN_MS) {
      if (seen[packKind] === undefined) {
        seen[packKind] = version;
      }
      return;
    }
    packsSeen.delete(key);
    packsSeen.set(key, {at: time, [packKind]: version});
    // the oldest are first
    for (const [oldKey, old] of packsSeen) {
      if (packsSeen.size <= MAX_PACKS_SEEN && time - old.at < PACKS_SEEN_MS) {
        break;
      }
      packsSeen.delete(oldKey);
    }
  },
  // the custom items a game logging in may not have: those changed since its
  // address fetched the packs, and those with a picture (which the packs do
  // not carry); every one when the address fetched none lately.
  sendAll(session) {
    const seen = packsSeen.get(limits.key(session.address));
    const fresh = seen && Date.now() - seen.at < PACKS_SEEN_MS && seen.names !== undefined ? seen : null;
    const since = kind => (fresh && fresh[kind] !== undefined ? Math.min(fresh[kind], fresh.names) : -1);
    const needed = entry => !entry.pending && (entry.changed > since(entry.kind) || (entry.art && !entry.artPending));
    for (const params of messages(list().reverse().filter(needed))) {
      session.sendXt("xdi", -1, ...params);
    }
  },
  sendClothingDefs,
  // lib/world.js says how to reach every game playing.
  connect(broadcastXt) {
    broadcast = broadcastXt;
  },
};
