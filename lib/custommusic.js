"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {logText} = require("./logtext.js");
const cdn = require("./cdn.js");
const config = require("../config.js");
const customItems = require("./customitems.js");
const extraMusic = require("./extramusic.js");

// music tracks staff upload in the panels (permission "music.upload",
// lib/roles.js): an MP3 made a den music item while the server runs, as the
// extra tracks of lib/extramusic.js are. each is a custom den item
// (lib/customitems.js) made from the game's "Jam On", with an `audio`
// version of its own: games are sent its def row at once, players get it
// from the item finder (or the shop, if staff put it on sale), and deleting
// it takes it from everyone, as with any custom item.
//
// a den music item plays "audio/<abbrName>.mp3" from the content server
// (DenItemHolder); for these the server answers with the file uploaded, kept
// in data/custom-music/<item id>-<version>.mp3 (the data folder is the one
// place the server writes to).

const MAX_BYTES = 15 * 1024 * 1024;
const MIN_BYTES = 4 * 1024;
const VERSION_LENGTH = 12;
const FOLDER = () => path.join(config.dataDir, "custom-music");
const fileOf = entry => path.join(FOLDER(), `${entry.id}-${entry.audio}.mp3`);

// MPEG audio layer III, as the game's Flash plays it: an ID3v2 tag may come
// first; then a frame header whose next frame is where its length says.
const BITRATES = {
  1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const SAMPLE_RATES = {3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000]};

// the frame at `at`: {length, sampleRate} or null.
const frameAt = (data, at) => {
  if (at + 4 > data.length || data[at] !== 0xFF || (data[at + 1] & 0xE0) !== 0xE0) {
    return null;
  }
  const version = (data[at + 1] >> 3) & 3; // 3 MPEG-1, 2 MPEG-2, 0 MPEG-2.5
  const layer = (data[at + 1] >> 1) & 3; // 1 is layer III
  const bitrateIndex = data[at + 2] >> 4;
  const rateIndex = (data[at + 2] >> 2) & 3;
  const padding = (data[at + 2] >> 1) & 1;
  if (version === 1 || layer !== 1 || bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) {
    return null;
  }
  const bitrate = BITRATES[version === 3 ? 1 : 2][bitrateIndex] * 1000;
  const sampleRate = SAMPLE_RATES[version][rateIndex];
  return {length: Math.floor(((version === 3 ? 144 : 72) * bitrate) / sampleRate) + padding, sampleRate};
};

// null for an MP3 the game can play, or what is wrong with it.
const problem = data => {
  if (!Buffer.isBuffer(data) || data.length < MIN_BYTES) {
    return "That file is too small to be a song.";
  }
  if (data.length > MAX_BYTES) {
    return `That file is too big: ${MAX_BYTES / 1024 / 1024} MB at most.`;
  }
  let at = 0;
  if (data.toString("latin1", 0, 3) === "ID3" && data.length > 10) {
    at = 10 + (((data[6] & 0x7F) << 21) | ((data[7] & 0x7F) << 14) | ((data[8] & 0x7F) << 7) | (data[9] & 0x7F)) + (data[5] & 0x10 ? 10 : 0);
  }
  // the first frame: the header, then two more where their lengths say
  for (const end = Math.min(data.length, at + 64 * 1024); at < end; at++) {
    const first = frameAt(data, at);
    const second = first && frameAt(data, at + first.length);
    const third = second && frameAt(data, at + first.length + second.length);
    if (third) {
      return null;
    }
  }
  return "That is not an MP3 file (MPEG audio layer III).";
};

const tracks = () => customItems.list().filter(entry => entry.kind === "den" && entry.audio);

// content path ("1830/audio/<hash>") -> entry, made again when the tracks change.
let paths = null;
const pathMap = () => {
  if (!paths) {
    paths = new Map(tracks().map(entry => [cdn.hashedPath(`audio/${customItems.audioName(entry)}.mp3`), entry]));
  }
  return paths;
};

// what to answer a content request with when it is for one of these
// tracks: {body, type}; undefined when it is not.
const asset = async relPath => {
  const entry = pathMap().get(relPath);
  if (!entry) {
    return undefined;
  }
  const body = await fs.promises.readFile(fileOf(entry)).catch(() => null);
  return {body, type: "audio/mpeg"};
};

// an upload made a track: {item} or {error}. `fields`: {name, cost, inShop, members}.
const add = (data, fields, by) => {
  const wrong = problem(data);
  if (wrong) {
    return {error: wrong};
  }
  const audio = crypto.createHash("sha256").update(data).digest("hex").slice(0, VERSION_LENGTH);
  fs.mkdirSync(FOLDER(), {recursive: true, mode: 0o700});
  // written before the item exists, so no game asks for a file not there yet
  const waiting = path.join(FOLDER(), `new-${audio}-${process.pid}.mp3`);
  fs.writeFileSync(waiting, data, {mode: 0o600});
  const result = customItems.create("den", {name: fields.name, cost: fields.cost, members: fields.members,
    inShop: fields.inShop === true, base: extraMusic.TEMPLATE, audio}, by);
  if (result.error) {
    fs.rmSync(waiting, {force: true});
    return result;
  }
  fs.renameSync(waiting, fileOf(result.item));
  paths = null;
  console.log(`[custom music] ${logText(by)} uploaded "${logText(result.item.name)}" (den item ${logText(result.item.id)}, ${logText(data.length)} bytes)`);
  return result;
};

// the file of a track, for staff to listen to before or after: {data} or null.
const file = id => {
  const entry = tracks().find(track => track.id === Number(id));
  if (!entry) {
    return null;
  }
  const data = (() => {
    try {
      return fs.readFileSync(fileOf(entry));
    }
    catch (err) {
      return null;
    }
  })();
  return data ? {data, entry} : null;
};

// for the panels: newest first
const list = () => tracks().map(entry => ({id: entry.id, name: entry.name, cost: entry.cost, inShop: entry.inShop,
  createdBy: entry.createdBy, createdAt: entry.createdAt,
  bytes: (() => {
    try {
      return fs.statSync(fileOf(entry)).size;
    }
    catch (err) {
      return 0;
    }
  })()}));

// a track's item was deleted (lib/itemcontrol.js deleteCustom): its file goes too.
customItems.onAudioGone(entry => {
  fs.rmSync(fileOf(entry), {force: true});
  paths = null;
});

// at start: files of tracks no longer there (and of uploads cut short) go.
const load = () => {
  const kept = new Set(tracks().map(entry => path.basename(fileOf(entry))));
  let gone = 0;
  for (const name of fs.existsSync(FOLDER()) ? fs.readdirSync(FOLDER()) : []) {
    if (!kept.has(name)) {
      fs.rmSync(path.join(FOLDER(), name), {force: true});
      gone++;
    }
  }
  console.log(`[custom music] ${logText(kept.size)} uploaded tracks${gone ? `, ${logText(gone)} stray files removed` : ""}`);
};

module.exports = {MAX_BYTES, problem, asset, add, file, list, load};
