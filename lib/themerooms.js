"use strict";

const zlib = require("zlib");
const amf3 = require("./amf3.js");

// a room file of a seasonal theme comes from an older build (lib/http.js,
// roomAsSeenBy in lib/world.js), and so do its clickable spots: a shop there
// names the generic list it had then, which today's lists may have as
// something else or as nothing, so one theme's shops worked and another's
// did not. each spot the room has today too (by its name) is given today's
// list, kind and message; what only the old room has stays as it was.

// the volume fields that say what a click does (RoomManagerWorld: type 1 a
// minigame by typeDefId, 7 a message, 12 a generic list)
const ACTION_FIELDS = ["type", "typeDefId", "message"];
const MAX_KEPT = 40; // rooms remembered, made once each (files of up to a few MB)

const kept = new Map(); // old file's path -> the file with today's spots, or null for "as it was"

const volumes = room => (room && room.actors && Array.isArray(room.actors.ActorVolume) ? room.actors.ActorVolume : []);

const withTodaysSpots = (oldBody, currentBody) => {
  const old = amf3.decode(zlib.inflateSync(oldBody));
  const today = new Map(volumes(amf3.decode(zlib.inflateSync(currentBody))).filter(volume => volume && volume.name).map(volume => [volume.name, volume]));
  let changed = false;
  for (const volume of volumes(old)) {
    const now = volume && today.get(volume.name);
    if (now && ACTION_FIELDS.some(field => volume[field] !== now[field])) {
      for (const field of ACTION_FIELDS) {
        if (now[field] === undefined) {
          delete volume[field];
        }
        else {
          volume[field] = now[field];
        }
      }
      changed = true;
    }
  }
  return changed ? zlib.deflateSync(amf3.encode(old)) : oldBody;
};

// `oldBody` with today's spots, `current` giving today's file (or null);
// the old one as it was when that cannot be had or read.
const fix = async (key, oldBody, current) => {
  if (kept.has(key)) {
    return kept.get(key) || oldBody;
  }
  let body = oldBody;
  try {
    const currentBody = await current();
    if (currentBody) {
      body = withTodaysSpots(oldBody, currentBody);
    }
  }
  catch (err) {
    console.log(`[themes] ${key}: ${err.message}`);
    body = oldBody;
  }
  if (kept.size >= MAX_KEPT) {
    kept.delete(kept.keys().next().value);
  }
  kept.set(key, body === oldBody ? null : body);
  return body;
};

module.exports = {fix};
