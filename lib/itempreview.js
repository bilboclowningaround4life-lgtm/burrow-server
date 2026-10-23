"use strict";

// pictures of items for the web item giver (public/items.html), from the
// game's own files on the CDN:
//
// - clothing: the icon the game shows in a closet (item.SimpleIcon), a
//   paletted bitmap the page colours itself as the game does
//   (LayerBitmap.paintFrame), so any four colours show without asking again.
// - den items: their art, a SWF, which public/item-preview.html plays with
//   Ruffle through public/item-preview.swf (tools/preview-host).
//
// both are the same for everyone, so no sign-in is asked for them.

const zlib = require("zlib");
const amf3 = require("./amf3.js");
const cdn = require("./cdn.js");
const customItems = require("./customitems.js");
const defpacks = require("./defpacks.js");

const ICON_AVATAR = 1; // the avatar every closet icon is drawn for (Item.makeSmallIcon)
const ICON_LARGE = 25; // SimpleIcon.AN_ICON_L
const ICON_SMALL = 26; // SimpleIcon.AN_ICON_S
const IMAGE_VERSION = 0x7080900; // what ImageServerURL accepts

// DenItem.getIconId: which of an item's pictures the den shows, by its sort category.
const iconId = sortCat => ([0, 99, 6, 5].includes(sortCat) ? 1 : sortCat === 1 ? 2 : [2, 3, 4].includes(sortCat) ? 3 : sortCat + 1);

// a custom item is drawn as the game's item it was made from.
const baseIdOf = (kind, id) => {
  const entry = customItems.get(kind, id);
  return entry ? entry.base : Number(id);
};

// a clothing item's closet icon, large if there is one: {w, h, b} with b the
// first frame's run-length bytes, base64 (LayerBitmap.paintFrame reads them).
// null when it has none.
const clothingIcon = async id => {
  const def = defpacks.itemDef(id);
  if (!def || !Number.isInteger(Number(def.layerDefId))) {
    return null;
  }
  for (const size of [ICON_LARGE, ICON_SMALL]) {
    const file = await cdn.get(cdn.hashedPath(`imageArrays/${((ICON_AVATAR << 24) | (size << 16) | Number(def.layerDefId)) >>> 0}`));
    try {
      const image = file && amf3.decode(zlib.inflateSync(file));
      const frame = image && image.v === IMAGE_VERSION && Array.isArray(image.f) && image.f[0];
      if (frame && Buffer.isBuffer(frame.b) && frame.w > 0 && frame.h > 0) {
        return {w: frame.w, h: frame.h, b: frame.b.toString("base64")};
      }
    }
    catch (err) {
      // not an icon this can read: the next size, or none.
    }
  }
  return null;
};

// a den item's art as the SWF it holds, or null.
const denArt = async id => {
  const def = defpacks.denItemDef(id);
  const baseId = baseIdOf("den", id);
  const baseDef = defpacks.denItemDef(baseId);
  if (!def || !baseDef) {
    return null;
  }
  const file = await cdn.get(cdn.hashedPath(`items/${((baseId << 16) | iconId(Number(baseDef.sortCat))) >>> 0}`));
  try {
    const wrapped = file && amf3.decode(file);
    return wrapped && wrapped.ba ? Buffer.from(wrapped.ba) : null;
  }
  catch (err) {
    return null;
  }
};

module.exports = {clothingIcon, denArt};
