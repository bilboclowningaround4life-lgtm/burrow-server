"use strict";

const {logText} = require("./logtext.js");
const zlib = require("zlib");
const amf3 = require("./amf3.js");
const cdn = require("./cdn.js");
const defpacks = require("./defpacks.js");

// what a room's own file says about it: its name ("Jam Mart Clothing"),
// which the client shows in the corner of the screen, and which shops stand
// in it. the room defPack has neither, and a shop's title is not in any
// defPack at all: the official server sent both along. the file is the
// same one the client loads to draw the room (roomDefs/<path>.xroom: zlib,
// then AMF3), so reading it here costs no extra download once anyone has
// been in the room.

// what the room editor left in files nobody named ("default": the museum's
// theatre).
const UNNAMED = ["display name", "default"];
// rooms whose file has no name and whose path does not spell it either.
const NAMES = new Map([
  ["jamaa_township.room_diamonds", "Diamond Shop"],
  ["jamaa_township.room_alphahq", "Alpha Headquarters"],
  ["oceans.deep_sea", "Deep Blue"],
  ["aussie.room_main", "Kimbara Outback"],
  ["aussie.room_aushop", "Outback Imports"],
  ["aussie.room_hos", "Medical Center"],
  ["appondale.room_museumtheater", "Museum Theater"],
  ["crystal_sands.room_tiertheater", "Tierney's Theater"],
  ["lost_temple_of_zios.bb_theater", "Temple Theater"],
]);
const VOLUME_SHOP = 12; // ActorVolume.type: clicking it opens generic list `typeDefId`

const rooms = new Map(); // "jamaa_township.clothes_shop" -> {name, shops: Set of list ids}
const loading = new Map();

const filePath = base => cdn.hashedPath(`roomDefs/${base.replace(/\./g, "/")}.xroom`);

const parse = body => {
  const room = amf3.decode(zlib.inflateSync(body));
  const settings = (room.actors.ActorSettings || [])[0] || {};
  const volumes = room.actors.ActorVolume || [];
  return {
    name: typeof settings.name === "string" && !UNNAMED.includes(settings.name.trim().toLowerCase()) ? settings.name.trim() : "",
    shops: new Set(volumes.filter(volume => Number(volume.type) === VOLUME_SHOP).map(volume => Number(volume.typeDefId))),
  };
};

const remember = (base, body) => {
  try {
    rooms.set(base, body ? parse(body) : {name: "", shops: new Set()});
  }
  catch (err) {
    rooms.set(base, {name: "", shops: new Set()});
  }
};

// reads the room's file, downloading it if nobody has been there yet.
// nothing waits on this: the first player ever to enter a room gets the
// fallback name below, everyone after them the real one.
const ensure = base => {
  if (rooms.has(base) || loading.has(base)) {
    return;
  }
  loading.set(base, cdn.get(filePath(base))
    .then(body => remember(base, body), () => {})
    .finally(() => loading.delete(base)));
};

// at start: every room whose file is already in the cache.
const preload = async () => {
  for (const path of defpacks.roomPaths()) {
    const base = path.replace(/\//g, ".");
    const body = await cdn.cached(filePath(base));
    if (body) {
      remember(base, body);
    }
  }
  console.log(`[rooms] names of ${logText(rooms.size)} rooms read from the cache`);
};

// A name made from the path, for a room not read yet or left unnamed:
// "jamaa_township.room_main" -> "Jamaa Township", "oceans.crystal_reef" ->
// "Crystal Reef". the seasonal versions of a land ("room_main_summer") are
// that land.
const titleCase = text => text.split("_").filter(Boolean).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
const fallbackName = base => {
  const [folder, room = ""] = base.split(".");
  return NAMES.get(base) || (/^room_main|^main_room|^$/.test(room) ? titleCase(folder) : titleCase(room.replace(/^room_/, "")));
};

const name = base => (rooms.get(base) || {}).name || fallbackName(base);

// the title of a shop opened in this room, as the id of a localization
// string (Shop.gotItemListCallback), or "" to leave the shop window's own.
// A shop's title was its room's name ("Jam Mart Clothing", "Epic Wonders");
// a shop standing in a land's main room has no name of its own to be found.
const shopTitle = (base, listId) => {
  const room = rooms.get(base);
  if (!room || !room.shops.has(Number(listId)) || /\.room_main/.test(base)) {
    return "";
  }
  return defpacks.stringId(name(base)) || "";
};

module.exports = {ensure, preload, name, shopTitle};
