"use strict";

const {logText} = require("./logtext.js");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const accounts = require("./accounts.js");
const chatFilter = require("./chatfilter.js");
const chatlog = require("./chatlog.js");
const masterpieces = require("./masterpieces.js");
const limits = require("./limits.js");
const {isUint} = require("./player.js");
const {isSilenced} = require("./moderation.js");

// Jammer Walls (client side: PlayerWallManager, PlayerWallGui,
// PlayerWallXtCommManager): a page per player where they and their visitors
// leave short messages, decorated by its owner.
//
// the client does this in two parts. over the game socket it asks for a
// token for one player's wall ("wt"); with that token it then talks JSON
// over HTTP to the address in the playerWallHost flashvar (POST /wall here):
// CHK "has it changed?", GET, PUT a message, DEL one, and a few more.
//
// A wall is account.wall: {privacy, posts, params, visits, hidden, modified,
// readAt}; a new account's empty one is made in lib/accounts.js.

// who may open a wall (BuddyCard.onPlayerWallPrivacyGet), as for dens.
const NOBODY = 0;
const BUDDIES = 1;
const EVERYONE = 2;

// PlayerWallManager.handleTokenResponse
const TOKEN_OK = 1;
const WALL_LOCKED = -1;
const BUDDIES_ONLY = -2;
const UNAVAILABLE = 0;

const TOKEN_MINUTES = 60;
const MAX_TOKENS = 20000;
const MAX_WALLS_OPEN = 20; // walls one player holds a token for at a time
const MAX_POSTS = 100;
const MAX_MESSAGE = 200; // the client's own box stops at 70
const MAX_PARAMS_JSON = 8000;
const MAX_HIDDEN = 500;
const USERNAME_SHOWN = 1;
// what an owner may set about their wall (PlayerWallGui.checkForWallParameterChanges):
// background, stickers, masterpieces, the photo booth picture, status line.
const OWNER_PARAMS = ["bg", "stk", "mp", "pb", "tag", "langId"];

// generic lists the wall window asks for: the wallpapers' buttons in the
// "customize" popup, the wallpapers themselves (a wall's "bg" parameter is a
// place in this list, 19 until its owner picks another), and stickers.
// like the Jam-A-Gram cards these lists only existed on the official
// servers; lib/wall-art.json holds what tools/find-art.py found on the
// CDN. without the wallpaper list a wall never appears at all.
const LIST_WALLPAPER_BUTTONS = 313;
const LIST_WALLPAPERS = 314;
const LIST_STICKERS = 646;
const RESOURCE_WALL_LIKES = "jammerwall";
const RESOURCE_MASTERPIECE_LIKES = "masterpiece";
const art = JSON.parse(fs.readFileSync(path.join(__dirname, "wall-art.json"), "utf8"));

const postsPerTenMinutes = limits.limiter(60, 600000);

const clean = text => String(text).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, MAX_MESSAGE);
// A wall parameter is read by every visitor's game: a number or a short
// text, or a short list of those or of small flat objects of those (the
// stickers and paintings on a wall). nothing nested deeper, nothing long.
const MAX_PARAM_TEXT = 300;
const MAX_PARAM_ENTRIES = 60;
const scalar = value => value === null || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))
  || (typeof value === "string" && value.length <= MAX_PARAM_TEXT);
const flat = value => scalar(value) || (typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length <= 12 && Object.values(value).every(scalar));
const plainParam = value => flat(value) || (Array.isArray(value) && value.length <= MAX_PARAM_ENTRIES && value.every(flat));
const whole = value => (Number.isInteger(Number(value)) ? Number(value) : 0);
// the photo booth picture ("pb", PlayerWallGui): one level deeper than the
// rest, {avatar: {id, color1.., eyes, pattern}, bgid, pet: {ts, lbits, ..} |
// null, items: [{id, color}, ..]}. it was turned away as too deep, and the
// owner's whole change with it: the photo never stayed. an animal wearing
// nothing has no items list at all (null), which was turned away too.
const MAX_PHOTO_ITEMS = 30;
const photoParam = value => value === null || (typeof value === "object" && !Array.isArray(value) && Object.keys(value).length <= 6
  && Object.entries(value).every(([key, part]) => (key === "items" ? part === null || (Array.isArray(part) && part.length <= MAX_PHOTO_ITEMS && part.every(flat))
    : key === "avatar" || key === "pet" ? part === null || flat(part) : scalar(part))));

module.exports = ({blocks, findOnline}) => {
  const tokens = new Map(); // token -> {viewer: account id, owner: account id, expires}

  const mayOpen = (owner, viewer) => {
    if (owner === viewer) {
      return TOKEN_OK;
    }
    if (owner.wall.privacy === NOBODY || blocks.either(owner, viewer) || !accounts.featureOn(owner, "wall") || !accounts.featureOn(viewer, "wall")) {
      return WALL_LOCKED;
    }
    if (owner.wall.privacy === BUDDIES && !owner.buddies.includes(viewer.username.toLowerCase())) {
      return BUDDIES_ONLY;
    }
    return TOKEN_OK;
  };

  // one token for a viewer and a wall, given again while it is good, and
  // tokens for no more than MAX_WALLS_OPEN walls a viewer: asking in a loop
  // gets the same few back and pushes nobody else's out.
  const issue = (viewer, owner) => {
    const mine = [];
    for (const [token, entry] of tokens) {
      if (entry.expires < Date.now()) {
        tokens.delete(token);
      }
      else if (entry.viewer === viewer.id) {
        mine.push([token, entry]);
      }
    }
    const same = mine.find(([, entry]) => entry.owner === owner.id);
    if (same) {
      same[1].expires = Date.now() + TOKEN_MINUTES * 60000;
      return same[0];
    }
    for (const [token] of mine.sort((one, other) => one[1].expires - other[1].expires).slice(0, Math.max(0, mine.length - MAX_WALLS_OPEN + 1))) {
      tokens.delete(token);
    }
    if (tokens.size >= MAX_TOKENS) {
      tokens.delete(tokens.keys().next().value);
    }
    const token = crypto.randomBytes(18).toString("hex");
    tokens.set(token, {viewer: viewer.id, owner: owner.id, expires: Date.now() + TOKEN_MINUTES * 60000});
    return token;
  };

  // {viewer, owner} accounts for a token still good, else null.
  const resolve = token => {
    const entry = typeof token === "string" ? tokens.get(token) : null;
    if (!entry || entry.expires < Date.now()) {
      return null;
    }
    const viewer = accounts.byId(entry.viewer);
    const owner = accounts.byId(entry.owner);
    return viewer && owner && mayOpen(owner, viewer) === TOKEN_OK ? {viewer, owner} : null;
  };

  // PlayerWallXtCommManager.getResponse: r = posts, n = notifications (replies
  // to the viewer elsewhere; not kept here), p = the wall's parameters with
  // the visit count and the time its owner last read it, t = last change.
  const getReply = (owner, viewer) => {
    const {wall} = owner;
    const hidden = new Set(wall.hidden);
    const reply = {
      s: true,
      r: wall.posts.filter(post => !hidden.has(post.x)),
      n: [],
      p: {...wall.params, visits: wall.visits, rdt: wall.readAt},
      t: wall.modified,
    };
    if (viewer === owner) {
      wall.readAt = Date.now();
    }
    return reply;
  };

  const put = (owner, viewer, body) => {
    const colours = Array.isArray(body.ac) ? body.ac.slice(0, 3).map(String) : [];
    const message = clean(body.m === undefined ? "" : body.m);
    // the server's filter (lib/chatfilter.js) too.
    const rule = message ? chatFilter.broken(message) : null;
    if (rule) {
      console.log(`[filter] ${logText(viewer.username)} on ${logText(owner.username)}'s wall: "${logText(message)}" (${logText(rule)})`);
      chatlog.recordTo(viewer, chatlog.WALL, owner.username, chatlog.NOT_SENT + message);
      const session = findOnline(viewer.username);
      if (session) {
        chatFilter.warn(session);
      }
    }
    if (!message || rule || isSilenced(viewer) || !colours.every(isUint) || !postsPerTenMinutes.allow(viewer.id)) {
      // PlayerWallGui.onMessageSent: cs -1 = "could not be posted"
      return {PUT: {s: false, cs: -1}};
    }
    const post = {
      x: crypto.randomBytes(8).toString("hex"),
      m: message,
      uid: viewer.id,
      un: viewer.username,
      um: USERNAME_SHOWN,
      u: viewer.uuid,
      s: whole(body.s), // pattern behind the message
      c: whole(body.c), // its colour
      t: Date.now(),
      ai: whole(body.ai), // the poster's animal, for the little portrait
      ac: colours.map(Number),
      ae: whole(body.ae),
      ap: whole(body.ap),
      l: whole(body.l),
      aci: whole(body.aci),
    };
    if (typeof body.pp === "string" && owner.wall.posts.some(other => other.x === body.pp)) {
      post.pp = body.pp; // a reply to that post
    }
    // for the panels (lib/chatlog.js), as typed chat is.
    chatlog.recordTo(viewer, chatlog.WALL, owner.username, message);
    owner.wall.posts.push(post);
    owner.wall.posts = owner.wall.posts.slice(-MAX_POSTS);
    owner.wall.modified = post.t;
    accounts.save(owner);
    return {PUT: {s: true}, x: post.x, t: post.t, GET: getReply(owner, viewer)};
  };

  // POST /wall: one JSON command, one JSON answer.
  const http = body => {
    const cmd = String(body && body.cmd);
    const who = resolve(body && body.t);
    if (!who) {
      // any command but PUT reads "e" at the top; PUT reads it inside PUT.
      return cmd === "PUT" ? {PUT: {s: false, e: "token"}} : {s: false, e: "token"};
    }
    const {owner, viewer} = who;
    const {wall} = owner;
    const mine = owner === viewer;
    switch (cmd) {
      case "CHK":
        return {s: true, t: wall.modified};
      case "GET":
        return getReply(owner, viewer);
      case "PUT":
        return put(owner, viewer, body);
      case "DEL": {
        // the owner may remove anything; anyone may remove what they wrote.
        const post = wall.posts.find(candidate => candidate.x === body.x);
        if (!post || !(mine || post.uid === viewer.id)) {
          return {s: false};
        }
        wall.posts = wall.posts.filter(candidate => candidate !== post && candidate.pp !== post.x);
        wall.modified = Date.now();
        accounts.save(owner);
        return {s: true};
      }
      case "GMB": // posts the owner chose to hide
        return {s: true, r: mine ? wall.hidden : []};
      case "AMB":
        if (!mine || typeof body.x !== "string" || !wall.posts.some(post => post.x === body.x)) {
          return {s: false};
        }
        wall.hidden = [...new Set([...wall.hidden, body.x])].slice(-MAX_HIDDEN);
        accounts.save(owner);
        return {s: true};
      case "CLW":
        if (!mine) {
          return {s: false};
        }
        wall.posts = [];
        wall.hidden = [];
        wall.modified = Date.now();
        accounts.save(owner);
        return {s: true};
      case "RMP": // masterpieces taken off the wall; there are none
      case "ACK": // notifications marked as read; there are none
        return {s: true};
      default:
        return {s: false, e: "unavailable"};
    }
  };

  const byUuid = uuid => accounts.all().find(account => account.uuid === uuid) || null;
  const likes = owner => owner.wall.likes || [];

  const handlers = {
    // the wall's like button (ResourceArrayXtCommManager): ["jammerwall",
    // ownerUuid, myUuid, ...] -> [success, likedByMe, likes].
    crg(session, roomId, [resource, ownerUuid]) {
      if (resource === RESOURCE_MASTERPIECE_LIKES) {
        // A masterpiece's likes: the second field is the painting's id.
        const painting = masterpieces.get(ownerUuid);
        session.sendXt("crg", -1, painting ? 1 : 0, painting && painting.likes.includes(session.account.id) ? 1 : 0, painting ? painting.likes.length : 0);
        return;
      }
      const owner = resource === RESOURCE_WALL_LIKES ? byUuid(ownerUuid) : null;
      session.sendXt("crg", -1, owner ? 1 : 0, owner && likes(owner).includes(session.account.id) ? 1 : 0, owner ? likes(owner).length : 0);
    },

    // the same, pressed: -> [success]. one like a player, and not one's own wall.
    crp(session, roomId, [resource, ownerUuid]) {
      if (resource === RESOURCE_MASTERPIECE_LIKES) {
        session.sendXt("crp", -1, masterpieces.like(ownerUuid, session.account) ? 1 : 0);
        return;
      }
      const owner = resource === RESOURCE_WALL_LIKES ? byUuid(ownerUuid) : null;
      const allowed = Boolean(owner) && owner !== session.account && !likes(owner).includes(session.account.id)
        && mayOpen(owner, session.account) === TOKEN_OK;
      if (allowed) {
        owner.wall.likes = [...likes(owner), session.account.id];
        accounts.save(owner);
      }
      session.sendXt("crp", -1, allowed ? 1 : 0);
    },

    // [username] -> [status, token, mayRead, mayWrite, username]
    wt(session, roomId, [username]) {
      const owner = accounts.byName(username);
      const status = owner ? mayOpen(owner, session.account) : UNAVAILABLE;
      if (status !== TOKEN_OK) {
        session.sendXt("wt", -1, status);
        return;
      }
      session.sendXt("wt", -1, TOKEN_OK, issue(session.account, owner), 1, 1, owner.username);
    },

    // [setting]: who may open my wall -> [success]
    wss(session, roomId, [setting]) {
      const value = Number(setting);
      const valid = [NOBODY, BUDDIES, EVERYONE].includes(value);
      if (valid) {
        session.account.wall.privacy = value;
        accounts.save(session.account);
      }
      session.sendXt("wss", -1, valid ? 1 : 0);
    },

    // [username] -> that player's setting
    wsg(session, roomId, [username]) {
      const owner = accounts.byName(username);
      session.sendXt("wsg", -1, owner ? owner.wall.privacy : NOBODY);
    },

    // [JSON of the parameters that changed] -> [success]
    wps(session, roomId, params) {
      const {wall} = session.account;
      let changes;
      try {
        // "%" cannot travel inside a field, so nothing was split apart.
        changes = JSON.parse(params.join("%"));
      }
      catch (err) {
        changes = null;
      }
      const merged = changes && typeof changes === "object" && !Array.isArray(changes) ? {...wall.params} : null;
      for (const key of merged ? OWNER_PARAMS : []) {
        if (changes[key] !== undefined) {
          if (!(key === "pb" ? photoParam(changes[key]) : plainParam(changes[key]))) {
            session.sendXt("wps", -1, 0);
            return;
          }
          merged[key] = changes[key];
        }
      }
      if (!merged || JSON.stringify(merged).length > MAX_PARAMS_JSON) {
        session.sendXt("wps", -1, 0);
        return;
      }
      wall.params = merged;
      wall.modified = Date.now();
      accounts.save(session.account);
      session.sendXt("wps", -1, 1);
    },

    // [username]: "I looked at that wall" -> [success]
    wci(session, roomId, [username]) {
      const owner = accounts.byName(username);
      if (owner && owner !== session.account && mayOpen(owner, session.account) === TOKEN_OK) {
        owner.wall.visits++;
        accounts.save(owner);
      }
      session.sendXt("wci", -1, owner ? 1 : 0);
    },
  };

  // GenericListXtCommManager.handleMediaResponse: (mediaId, name) pairs;
  // null when `listId` is not one of the wall window's lists.
  const list = listId => {
    const ids = {
      [LIST_WALLPAPER_BUTTONS]: art.wallpapers.map(wallpaper => wallpaper.button),
      [LIST_WALLPAPERS]: art.wallpapers.map(wallpaper => wallpaper.media),
      [LIST_STICKERS]: art.stickers,
    }[Number(listId)];
    return ids ? ids.flatMap(id => [id, 0]) : null;
  };

  return {handlers, http, list};
};
