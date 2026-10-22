"use strict";

const accounts = require("./accounts.js");
const bans = require("./bans.js");
const captcha = require("./captcha.js");
const defpacks = require("./defpacks.js");
const devices = require("./devices.js");
const config = require("../config.js");
const roles = require("./roles.js");
const dens = require("./dens.js");
const itemControl = require("./itemcontrol.js");
const customItems = require("./customitems.js");
const limits = require("./limits.js");
const world = require("./world.js");
const {addClothing, sendClothingAdded, isUint} = require("./player.js");

// backs the item finder page (/shop): look any item up by id or name and put
// it straight into an account, since in-game shops only stock a slice each.

const MAX_RESULTS = 60;
const givesPerMinute = limits.limiter(120, 60000); // per account, from anywhere but this machine
const MAX_FAVOURITES = 200; // finder items remembered per account
// the nine animals the official sign-up page offers (public/register.html
// has their pictures): tiger, wolf, koala, panda, monkey, bunny, rhino, seal, penguin.
const STARTER_ANIMALS = [1, 4, 5, 6, 7, 8, 13, 18, 24];

let catalog = null;
let catalogVersion = -1; // defpacks.customVersion() it was built at: staff add items as the server runs

const buildCatalog = () => [
  ...defpacks.clothingIds().map(id => {
    const def = defpacks.itemDef(id);
    return {kind: "clothing", id, name: defpacks.string(def.titleStrId), cost: Number(def.value), colors: String(def.colors).split(",").length};
  }),
  ...defpacks.denItemIds().map(id => {
    const def = defpacks.denItemDef(id);
    return {kind: "den", id, name: defpacks.string(def.nameStrId) || def.abbrName, cost: Number(def.cost), colors: 1};
  }),
].map(entry => ({...entry, search: entry.name.toLowerCase()}));

// `favourites` is an account's finderGiven, or null: with nothing typed, the
// items that account took most often come first, the latest first among
// equals. (The in-game finder says whose search it is.) items locked out of
// the finder (lib/itemcontrol.js) are left out, unless `seesLocked`: then
// they are marked. an item a player made (lib/playeritems.js) is found by
// its maker only (`askerId`), and by those who see locked ones. with
// "base=1", only the game's own items that can be made into a new one.
const search = (params, favourites = null, seesLocked = false, askerId = null) => {
  if (!catalog || catalogVersion !== defpacks.customVersion()) {
    catalog = buildCatalog();
    catalogVersion = defpacks.customVersion();
  }
  const kind = params.get("kind") || "all";
  const words = (params.get("q") || "").toLowerCase().split(/\s+/).filter(Boolean);
  const matches = catalog.filter(entry => (kind === "all" || entry.kind === kind)
    && words.every(word => entry.search.includes(word) || String(entry.id) === word)
    && (seesLocked || !itemControl.isLocked(entry.kind, entry.id))
    && (seesLocked || [null, askerId].includes(customItems.ownerOf(entry.kind, entry.id)))
    && (params.get("base") !== "1" || customItems.copyable(entry.kind, entry.id)));
  matches.sort((a, b) => words.includes(String(b.id)) - words.includes(String(a.id)));
  if (words.length === 0 && favourites) {
    const taken = entry => favourites[`${entry.kind}:${entry.id}`] || {count: 0, at: 0};
    matches.sort((a, b) => taken(b).count - taken(a).count || taken(b).at - taken(a).at);
  }
  return {
    total: matches.length,
    results: matches.slice(0, MAX_RESULTS).map(({kind: entryKind, id, name, cost, colors}) => {
      const locked = seesLocked && itemControl.isLocked(entryKind, id);
      return {kind: entryKind, id, name: locked ? `${name} (locked)` : name, cost, colors, ...(locked ? {locked} : {})};
    }),
  };
};

// one to four "#RRGGBB", spaces or commas between. the # is wanted: six
// digits alone are a colour id
const HEX_COLOURS = /^#[0-9a-f]{6}([\s,]+#[0-9a-f]{6}){0,3}$/i;

// `seesLocked`: who asks may take items locked out of the finder.
const give = (body, seesLocked = false) => {
  const account = accounts.byName(body.username);
  if (!account) {
    return {status: 404, body: {error: "No such account"}};
  }
  const maker = customItems.ownerOf(body.kind, body.id);
  if (!seesLocked && maker !== null && maker !== account.id) {
    return {status: 403, body: {error: "That item is another player's own."}};
  }
  if (!seesLocked && itemControl.isLocked(body.kind, body.id)) {
    return {status: 403, body: {error: "That item is locked out of the item finder."}};
  }
  const session = world.findOnline(account.username);
  if (body.kind === "clothing") {
    const def = defpacks.itemDef(body.id);
    const colors = def ? String(def.colors).split(",") : [];
    // `color` is a raw colour id of the caller's choosing, or one to four hex
    // colours ("#FF8800", "#FF0000 #FFFFFF") for the item's four colour bands
    // in order, the last filling the rest: a custom colour (lib/colours.js),
    // made as the animal editor's hex box makes one. otherwise one of the
    // item's own colours is picked by `colorIndex`.
    let custom = body.color !== undefined && body.color !== "" ? String(body.color).trim() : "";
    const hexes = custom.match(HEX_COLOURS) ? custom.split(/[\s,]+/).filter(Boolean) : null;
    if (hexes) {
      const rgbs = [0, 1, 2, 3].map(slot => parseInt(hexes[Math.min(slot, hexes.length - 1)].replace("#", ""), 16));
      const entry = world.makeColour(account, rgbs, session);
      if (!entry) {
        return {status: 400, body: {error: "Bad colour"}};
      }
      if (entry.full) {
        return {status: 429, body: {error: "No more new colours today. Colours made before can still be used."}};
      }
      custom = String(entry.id);
    }
    // a colour id written signed, as lists of the game's colours often do
    // them: the same 32 bits, kept as the game keeps colours (unsigned), so
    // -16777216 is 4278190080.
    if (/^-\d{1,10}$/.test(custom) && Number(custom) >= -0x80000000) {
      custom = String(Number(custom) >>> 0);
    }
    if (custom && !isUint(custom)) {
      return {status: 400, body: {error: "Colour: an id, or #RRGGBB"}};
    }
    const color = custom || colors[Number(body.colorIndex) || 0];
    if (!def || !defpacks.clothingIds().includes(Number(def.id)) || color === undefined) {
      return {status: 400, body: {error: "No such clothing item or colour"}};
    }
    const item = addClothing(account, def.id, color);
    if (!item) {
      return {status: 409, body: {error: "That inventory is full"}};
    }
    accounts.save(account);
    if (session) {
      sendClothingAdded(session, item);
    }
  }
  else if (body.kind === "den") {
    if (!defpacks.denItemIds().includes(Number(body.id))) {
      return {status: 400, body: {error: "No such den item"}};
    }
    if (!dens.giveDenItem(account, body.id)) {
      return {status: 409, body: {error: "That inventory is full"}};
    }
    if (session) {
      dens.sendDenItems(session);
    }
  }
  else {
    return {status: 400, body: {error: "Unknown item kind"}};
  }
  // what this account takes from the finder, for its favourites.
  const key = `${body.kind}:${Number(body.id)}`;
  account.finderGiven[key] = {count: ((account.finderGiven[key] || {}).count || 0) + 1, at: Math.floor(Date.now() / 1000)};
  const kept = Object.entries(account.finderGiven).sort((one, other) => other[1].at - one[1].at).slice(0, MAX_FAVOURITES);
  account.finderGiven = Object.fromEntries(kept);
  accounts.save(account);
  return {status: 200, body: {ok: true, online: Boolean(session)}};
};

const FORBIDDEN = {status: 403, body: {error: "forbidden"}};

// may whoever asks see and take items locked out of the finder? staff who
// may lock them (admins and developers) do; so does the owner, on this
// machine, asking with no account's token (the /shop page).
const seesLocked = (account, from) => (account ? roles.can(account, "items.create") : from.local);

// the account a login token is for, while it may play. A ban leaves the
// token alone (so that the client can ask about the ban with it, below),
// and it is good for nothing else until the ban is over.
const holderOf = token => {
  const account = accounts.byToken(token);
  return account && world.moderation.banRemaining(account) === 0 ? account : null;
};

// `from.local` marks a request made on the server's own machine: the owner,
// who may use the finder for any account. everyone else can only give items
// to the account whose login token they hold, which is how the in-game
// finder calls it.
const handle = async (route, params, body, from) => {
  switch (route) {
    case "GET /api/search": {
      const asking = accounts.byName(params.get("username") || "");
      const known = asking && (from.local || holderOf(params.get("token")) === asking);
      return {status: 200, body: search(params, known ? asking.finderGiven : null, seesLocked(params.get("token") ? holderOf(params.get("token")) : null, from),
        known ? asking.id : null)};
    }
    case "GET /api/accounts":
      if (!from.local) {
        return FORBIDDEN;
      }
      return {status: 200, body: accounts.all().map(account => ({username: account.username, online: Boolean(world.findOnline(account.username))}))};
    case "POST /api/give": {
      const owner = holderOf((body || {}).token);
      if (!from.local && (!owner || owner !== accounts.byName((body || {}).username))) {
        return FORBIDDEN;
      }
      if (!from.local && !givesPerMinute.allow(owner.id)) {
        return {status: 429, body: {error: "Too many at once. Try again in a minute."}};
      }
      return give(body || {}, seesLocked((body || {}).token ? owner : null, from));
    }
    case "POST /api/theme": {
      const account = accounts.byName((body || {}).username);
      if (!account || (!from.local && holderOf((body || {}).token) !== account)) {
        return FORBIDDEN;
      }
      return world.setTheme(account, String((body || {}).theme))
        ? {status: 200, body: {ok: true, theme: account.theme}}
        : {status: 400, body: {error: "Unknown theme"}};
    }
    // for the settings menu's Outfits and Den layouts lists (gui.MySettings
    // in the patched client): the names saved, and a way to run the chat
    // commands that save, wear and load them.
    case "GET /api/saved": {
      const account = accounts.byName(params.get("username"));
      if (!account || (!from.local && holderOf(params.get("token")) !== account)) {
        return FORBIDDEN;
      }
      return {status: 200, body: {outfits: account.outfits.map(entry => entry.name), layouts: account.denLayouts.map(entry => entry.name)}};
    }
    case "POST /api/command": {
      const account = accounts.byName((body || {}).username);
      if (!account || (!from.local && holderOf((body || {}).token) !== account)) {
        return FORBIDDEN;
      }
      const text = String((body || {}).text || "");
      if (!/^!(outfit|den) (wear|load|savenew|off|undo)( [a-z0-9]{1,20})?$/.test(text)) {
        return {status: 400, body: {error: "Unknown command"}};
      }
      return world.runCommand(account, text) ? {status: 200, body: {ok: true}} : {status: 409, body: {error: "Not in the game"}};
    }
    // what a client shows beside its login form and in the game's top bar:
    // how many are playing (the world map says as much), and since when the
    // server has been up.
    case "GET /api/status":
      return {status: 200, body: {online: world.players().length, uptimeSeconds: Math.floor(process.uptime())}};
    // is the holder of this login token banned, or the address they ask
    // from? the client asks when its game stops, to say why. the reason is
    // for the banned player, and the token says that is who asks.
    case "POST /api/ban": {
      const account = accounts.byToken((body || {}).token);
      if (!account) {
        return FORBIDDEN;
      }
      const ban = world.moderation.banOf(account);
      const addressBan = ban ? null : bans.addressBan(from.address);
      const deviceBan = ban || addressBan ? null : devices.banOfAccount(account);
      return {status: 200, body: ban ? {banned: "account", banned_seconds: ban.seconds, ban_reason: ban.reason}
        : addressBan ? {banned: "address", banned_seconds: world.moderation.PERMANENT, ban_reason: addressBan.reason}
          : deviceBan ? {banned: "device", banned_seconds: world.moderation.PERMANENT, ban_reason: deviceBan.reason} : {banned: null}};
    }
    case "POST /api/register": {
      if (bans.addressBan(from.address)) {
        return {status: 403, body: {error: "address_banned"}};
      }
      // the client says which computer it is on (lib/devices.js); the sign-up
      // page cannot, and an account made there still signs in through the client.
      const device = devices.read((body || {}).device);
      if (device && devices.banOf(device)) {
        return {status: 403, body: {error: "device_banned"}};
      }
      const {username, password, avatarType, email} = body || {};
      if (config.recoveryMail && (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))) {
        return {status: 400, body: {error: "invalid_email"}};
      }
      // the terms and the privacy policy, and old enough to agree to them:
      // said by the one signing up, on the page or in the client.
      if ((body || {}).agreed !== true) {
        return {status: 400, body: {error: "agree_first"}};
      }
      const captchaProblem = await captcha.check(body, from, "signup");
      if (captchaProblem) {
        return {status: captchaProblem === "captcha_unavailable" ? 503 : 400, body: {error: captchaProblem}};
      }
      const problem = accounts.usernameProblem(typeof username === "string" ? username.trim() : username);
      if (problem) {
        return {status: 400, body: {error: problem}};
      }
      if (!limits.registrationAllowed(from.address, from.local)) {
        return {status: 429, body: {error: "too_many_registrations"}};
      }
      // the animals the sign-up page offers; the game's own Create Account
      // screens (lib/signup.js) offer theirs.
      if (!STARTER_ANIMALS.includes(avatarType)) {
        return {status: 400, body: {error: "choose_animal"}};
      }
      const result = await accounts.registerAsync(username, password, {type: avatarType, email});
      if (result.account) {
        result.account.agreed = {version: config.termsVersion, at: Math.floor(Date.now() / 1000)};
        accounts.save(result.account);
      }
      // the client signs in straight after, and is not asked again.
      return result.error ? {status: 400, body: {error: result.error}}
        : {status: 200, body: {username: result.account.username, captcha_pass: captcha.issuePass(result.account, from)}};
    }
    default:
      return {status: 404, body: {error: "not_found"}};
  }
};

module.exports = {handle, search};
