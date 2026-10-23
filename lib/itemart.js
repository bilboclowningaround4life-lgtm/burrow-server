"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const config = require("../config.js");
const customItems = require("./customitems.js");
const imageModeration = require("./image-moderation.js");

// custom items' own pictures: uploaded by the item's maker (or staff), shown
// by the patched client in place of the item's icon, and for a den item in
// place of the item standing in a den (AJClient.customArtUrl). worn
// clothing keeps the art it was made from: that is drawn for every animal
// and pose, which one picture cannot be.
//
// a picture is checked before it is kept: a PNG, a JPEG or a GIF by its own
// bytes (whatever it is called), of a sensible size, and kept without what
// else such files carry (a photo's EXIF, with where it was taken; PNG text;
// GIF comments). a BMP is made a PNG. (the pages and the game turn other
// kinds, and pictures too big, into a PNG before they send them.)
// kept as data/itemart/<kind>-<id>.<png|jpg|gif>; its version, a hash, is on
// the item (customItems.setArt), so a new picture is a new address.

const MAX_BYTES = 100 * 1024; // a picture kept: every player who sees the item downloads it
const MAX_UPLOAD = 2 * 1024 * 1024; // one sent (a BMP is bigger than the PNG it becomes)
const MAX_SIDE = 256; // drawn fitted to the item anyway (a den item's place is 160)
const MIN_SIDE = 8;
const DIR = path.join(config.dataDir, "itemart");
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
// the PNG chunks a picture needs; text, times, EXIF and the like are dropped
const PNG_KEPT = new Set(["IHDR", "PLTE", "IDAT", "IEND", "tRNS", "gAMA", "cHRM", "sRGB", "iCCP", "sBIT", "pHYs"]);

const TYPES = ["png", "jpeg", "gif"];
const EXTENSION = {png: "png", jpeg: "jpg", gif: "gif"};
const VERSION_MARK = {png: "p", jpeg: "j", gif: "g"};

const fileOf = (kind, id, type) => path.join(DIR, `${kind}-${Number(id)}.${EXTENSION[type]}`);

// a GIF's blocks, without comments, plain text and any application block but
// the one that says it loops; null when it is not a whole GIF. kept animated.
const cleanGif = data => {
  const head = data.toString("latin1", 0, 6);
  if (data.length < 14 || (head !== "GIF87a" && head !== "GIF89a")) {
    return null;
  }
  const width = data.readUInt16LE(6);
  const height = data.readUInt16LE(8);
  const packed = data[10];
  let at = 13 + (packed & 0x80 ? 3 * (2 << (packed & 7)) : 0);
  if (at > data.length) {
    return null;
  }
  const kept = [data.subarray(0, at)];
  // sub-blocks from `from`: where they end (after the 0 that ends them)
  const subBlocksEnd = from => {
    let i = from;
    while (i < data.length && data[i] !== 0) {
      i += data[i] + 1;
    }
    return i < data.length ? i + 1 : -1;
  };
  let images = 0;
  while (at < data.length) {
    const block = data[at];
    if (block === 0x3B) {
      kept.push(data.subarray(at, at + 1));
      return images ? {data: Buffer.concat(kept), width, height, type: "gif"} : null;
    }
    if (block === 0x2C) {
      if (at + 10 > data.length) {
        return null;
      }
      const local = data[at + 9];
      const start = at;
      at += 10 + (local & 0x80 ? 3 * (2 << (local & 7)) : 0) + 1; // the descriptor, its colours, the LZW code size
      const end = subBlocksEnd(at);
      if (end === -1) {
        return null;
      }
      kept.push(data.subarray(start, end));
      at = end;
      images++;
      continue;
    }
    if (block === 0x21 && at + 2 <= data.length) {
      const label = data[at + 1];
      const end = subBlocksEnd(at + 2);
      if (end === -1) {
        return null;
      }
      const loops = label === 0xFF && data.toString("latin1", at + 3, at + 14) === "NETSCAPE2.0";
      if (label === 0xF9 || loops) {
        kept.push(data.subarray(at, end));
      }
      at = end;
      continue;
    }
    return null;
  }
  return null;
};

// a PNG of RGBA pixels (`pixels`, width * height * 4 bytes, rows top down).
const CRC_TABLE = Array.from({length: 256}, (unused, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  }
  return c >>> 0;
});
const crc32 = buffer => {
  let c = 0xFFFFFFFF;
  for (const byte of buffer) {
    c = CRC_TABLE[(c ^ byte) & 0xFF] ^ (c >>> 8);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
};
const pngChunk = (type, body) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  const typed = Buffer.concat([Buffer.from(type, "latin1"), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
};
const encodePng = (width, height, pixels) => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bits a channel
  header[9] = 6; // RGBA
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    pixels.copy(rows, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([PNG_SIGNATURE, pngChunk("IHDR", header), pngChunk("IDAT", zlib.deflateSync(rows)), pngChunk("IEND", Buffer.alloc(0))]);
};

// RGBA pixels shrunk to fit `side` (each new pixel the mean of those it covers).
const shrink = (width, height, pixels, side) => {
  const scale = Math.min(1, side / width, side / height);
  if (scale === 1) {
    return {width, height, pixels};
  }
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y / scale);
    const y1 = Math.min(height, Math.max(y0 + 1, Math.floor((y + 1) / scale)));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x / scale);
      const x1 = Math.min(width, Math.max(x0 + 1, Math.floor((x + 1) / scale)));
      const sum = [0, 0, 0, 0];
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          for (let c = 0; c < 4; c++) {
            sum[c] += pixels[(sy * width + sx) * 4 + c];
          }
        }
      }
      const count = (y1 - y0) * (x1 - x0);
      for (let c = 0; c < 4; c++) {
        out[(y * w + x) * 4 + c] = Math.round(sum[c] / count);
      }
    }
  }
  return {width: w, height: h, pixels: out};
};

// a BMP (uncompressed, or bit fields: 1, 4, 8, 24 or 32 bits a pixel) as a
// PNG, shrunk to fit; null when it is not one this can read.
const MAX_BMP_SIDE = 4096;
const bmpToPng = data => {
  if (data.length < 54 || data.toString("latin1", 0, 2) !== "BM") {
    return null;
  }
  const offset = data.readUInt32LE(10);
  const headerSize = data.readUInt32LE(14);
  if (headerSize < 40) {
    return null;
  }
  const width = data.readInt32LE(18);
  const rawHeight = data.readInt32LE(22);
  const height = Math.abs(rawHeight);
  const bits = data.readUInt16LE(28);
  const compression = data.readUInt32LE(30);
  if (width < 1 || height < 1 || width > MAX_BMP_SIDE || height > MAX_BMP_SIDE || ![1, 4, 8, 24, 32].includes(bits) || ![0, 3].includes(compression)) {
    return null;
  }
  const stride = Math.ceil(width * bits / 32) * 4;
  if (offset + stride * height > data.length) {
    return null;
  }
  const paletteAt = 14 + headerSize;
  const pixels = Buffer.alloc(width * height * 4);
  const hasAlpha = bits === 32 && (headerSize >= 56 || compression === 3);
  for (let y = 0; y < height; y++) {
    const row = offset + (rawHeight > 0 ? height - 1 - y : y) * stride;
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      let b;
      let g;
      let r;
      let a = 255;
      if (bits >= 24) {
        const p = row + x * (bits / 8);
        [b, g, r] = [data[p], data[p + 1], data[p + 2]];
        if (hasAlpha) {
          a = data[p + 3];
        }
      }
      else {
        const perByte = 8 / bits;
        const byte = data[row + Math.floor(x / perByte)];
        const index = (byte >> ((perByte - 1 - (x % perByte)) * bits)) & ((1 << bits) - 1);
        const entry = paletteAt + index * 4;
        if (entry + 3 > data.length) {
          return null;
        }
        [b, g, r] = [data[entry], data[entry + 1], data[entry + 2]];
      }
      pixels[o] = r;
      pixels[o + 1] = g;
      pixels[o + 2] = b;
      pixels[o + 3] = a;
    }
  }
  const small = shrink(width, height, pixels, MAX_SIDE);
  return {data: encodePng(small.width, small.height, small.pixels), width: small.width, height: small.height, type: "png"};
};

// a PNG's chunks, without the ones not kept; null when it is not a whole PNG.
const cleanPng = data => {
  if (data.length < 33 || !data.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return null;
  }
  const kept = [PNG_SIGNATURE];
  let at = 8;
  let width = 0;
  let height = 0;
  let ended = false;
  while (at + 12 <= data.length) {
    const length = data.readUInt32BE(at);
    const type = data.toString("latin1", at + 4, at + 8);
    if (at + 12 + length > data.length) {
      return null;
    }
    if (type === "IHDR") {
      width = data.readUInt32BE(at + 8);
      height = data.readUInt32BE(at + 12);
    }
    if (PNG_KEPT.has(type)) {
      kept.push(data.subarray(at, at + 12 + length));
    }
    at += 12 + length;
    if (type === "IEND") {
      ended = true;
      break;
    }
  }
  return ended && width && height ? {data: Buffer.concat(kept), width, height, type: "png"} : null;
};

// a JPEG without its APP1..APP15 (EXIF, XMP, ...) and comment segments;
// null when it is not one. its size is read from the frame header.
const cleanJpeg = data => {
  if (data.length < 4 || data[0] !== 0xFF || data[1] !== 0xD8) {
    return null;
  }
  const kept = [data.subarray(0, 2)];
  let at = 2;
  let width = 0;
  let height = 0;
  while (at + 4 <= data.length) {
    if (data[at] !== 0xFF) {
      return null;
    }
    const marker = data[at + 1];
    if (marker === 0xD9) {
      kept.push(data.subarray(at, at + 2));
      break;
    }
    const length = data.readUInt16BE(at + 2);
    if (length < 2 || at + 2 + length > data.length) {
      return null;
    }
    const segment = data.subarray(at, at + 2 + length);
    // start of frame (not DHT, JPG or DAC): the size
    if (marker >= 0xC0 && marker <= 0xCF && ![0xC4, 0xC8, 0xCC].includes(marker)) {
      height = data.readUInt16BE(at + 5);
      width = data.readUInt16BE(at + 7);
    }
    const dropped = (marker >= 0xE1 && marker <= 0xEF) || marker === 0xFE;
    if (!dropped) {
      kept.push(segment);
    }
    at += 2 + length;
    // start of scan: the compressed data runs to the end
    if (marker === 0xDA) {
      kept.push(data.subarray(at));
      break;
    }
  }
  return width && height ? {data: Buffer.concat(kept), width, height, type: "jpeg"} : null;
};

// checks and cleans an upload: {data, type} or {error}.
const check = data => {
  if (!Buffer.isBuffer(data) || data.length === 0) {
    return {error: "Choose a picture first."};
  }
  if (data.length > MAX_UPLOAD) {
    return {error: `That picture is too big: ${Math.round(MAX_UPLOAD / 1024 / 1024)} MB at most.`};
  }
  const image = cleanPng(data) || cleanJpeg(data) || cleanGif(data) || bmpToPng(data);
  if (!image) {
    return {error: "That is not a PNG, JPEG, GIF or BMP picture."};
  }
  if (image.data.length > MAX_BYTES) {
    return {error: `That picture is too big: ${Math.round(MAX_BYTES / 1024)} KB at most once cleaned. A smaller one, please.`};
  }
  if (image.width > MAX_SIDE || image.height > MAX_SIDE || image.width < MIN_SIDE || image.height < MIN_SIDE) {
    return {error: `A picture from ${MIN_SIDE} to ${MAX_SIDE} pixels on each side, please.`};
  }
  return image;
};

const digest = data => crypto.createHash("sha256").update(data).digest("hex");

// sets an item's picture. resolves to {ok, art} or {error}.
// `pending`: it waits for a moderator before anyone is shown it (lib/playeritems.js).
// `refused(hash)`: whether a picture of that SHA-256 (once cleaned) was
// turned away before, and may not be sent again.
const set = async (kind, id, data, pending = false, refused = null) => {
  const entry = customItems.get(kind, id);
  if (!entry) {
    return {error: "No such custom item."};
  }
  const image = check(data);
  if (image.error) {
    return image;
  }
  if (refused && refused(digest(image.data))) {
    return {error: "A moderator turned that picture away before. Choose another one."};
  }
  const safety = await imageModeration.scan(image.data);
  if (safety.blocked) {
    return {error: safety.error};
  }
  fs.mkdirSync(DIR, {recursive: true});
  for (const type of TYPES) {
    fs.rmSync(fileOf(kind, entry.id, type), {force: true});
  }
  fs.writeFileSync(fileOf(kind, entry.id, image.type), image.data);
  const art = `${VERSION_MARK[image.type]}${crypto.createHash("sha256").update(image.data).digest("hex").slice(0, 12)}`;
  customItems.setArt(kind, entry.id, art, pending);
  return {ok: pending ? `${entry.name}'s new picture is waiting for a moderator to approve it.` : `${entry.name} has a new picture.`, art};
};

// takes an item's picture away (its maker's choice, or staff's).
const remove = (kind, id) => {
  const entry = customItems.get(kind, id);
  if (!entry || !entry.art) {
    return {error: "That item has no picture of its own."};
  }
  for (const type of TYPES) {
    fs.rmSync(fileOf(kind, entry.id, type), {force: true});
  }
  customItems.setArt(kind, entry.id, null);
  return {ok: `${entry.name}'s picture was taken away.`};
};

// the picture to serve: {data, type} or null. one waiting for a moderator
// only `withPending`: for the maker and the moderators (lib/http.js).
const file = (kind, id, withPending = false) => {
  const entry = customItems.get(kind, id);
  if (!entry || !entry.art || (entry.artPending && !withPending)) {
    return null;
  }
  const type = TYPES.find(one => entry.art.startsWith(VERSION_MARK[one])) || "png";
  try {
    return {data: fs.readFileSync(fileOf(kind, entry.id, type)), type};
  }
  catch {
    return null;
  }
};

// the SHA-256 of an item's picture as kept, waiting or not: null for none.
const digestOf = (kind, id) => {
  const picture = file(kind, id, true);
  return picture ? digest(picture.data) : null;
};

// where a page shows an item's picture: the public address once anyone may
// see it; while it waits, `base` (the page's own /…/api/itemart, which asks
// who it is first).
const urlOf = (entry, base) => (!entry.art ? null : entry.artPending
  ? `${base}?kind=${entry.kind}&id=${entry.id}&v=${entry.art}` : `/itemart/${entry.kind}/${entry.id}.png?v=${entry.art}`);

module.exports = {set, remove, file, check, digestOf, urlOf, MAX_BYTES, MAX_UPLOAD};
