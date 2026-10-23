"use strict";

// the variants (colours) each den item's art has, into lib/den-variants.json,
// which the item giver offers (lib/admin.js). the art says so itself, in
// ActionScript: getVersions() returns them, and setVersion(n) shows one.
// the server cannot run that, so tools/den-variants.sh reads it once:
//
//   node tools/den-variants.js fetch <folder>    every den item's art, as SWFs
//   (ffdec decompiles <folder>/swf into <folder>/out)
//   node tools/den-variants.js index <folder>    reads <folder>/out
//
// most items with variants draw each as a frame of their own; some colour
// parts of themselves from a table instead (colArray, one row of RGB values
// per variant), and for those the table's colours are kept too, as a
// preview. items with no variants are left out.

const fs = require("fs");
const path = require("path");
const amf3 = require("../lib/amf3.js");
const cdn = require("../lib/cdn.js");
const defpacks = require("../lib/defpacks.js");

const OUT = path.join(__dirname, "..", "lib", "den-variants.json");
const AT_ONCE = 16;
const MAX_VARIANTS = 64;
const PREVIEW_COLOURS = 4;

// DenItem.getIconId: which of an item's pictures the den shows, by its sort category.
const iconId = sortCat => ([0, 99, 6, 5].includes(sortCat) ? 1 : sortCat === 1 ? 2 : [2, 3, 4].includes(sortCat) ? 3 : sortCat + 1);

const fetchAll = async folder => {
  await defpacks.init();
  fs.mkdirSync(path.join(folder, "swf"), {recursive: true});
  const ids = defpacks.denItemIds();
  let next = 0;
  let written = 0;
  const work = async () => {
    while (next < ids.length) {
      const id = ids[next++];
      const def = defpacks.denItemDef(id);
      const file = await cdn.get(cdn.hashedPath(`items/${((id << 16) | iconId(Number(def.sortCat))) >>> 0}`));
      try {
        const wrapped = file && amf3.decode(file);
        if (wrapped && wrapped.ba) {
          fs.writeFileSync(path.join(folder, "swf", `${id}.swf`), Buffer.from(wrapped.ba));
          written++;
        }
      }
      catch (err) {
        // not art this can read: left out.
      }
    }
  };
  await Promise.all(Array.from({length: AT_ONCE}, work));
  console.log(`${written} of ${ids.length} den items' art written`);
};

const hex = ([r, g, b]) => ((r << 16) | (g << 8) | b).toString(16).padStart(6, "0");

// one item's decompiled scripts: its variants, and the colour table's first
// colours for each when it has one.
const readItem = scripts => {
  let versions = null;
  for (const text of scripts) {
    const literal = /function getVersions\(\)\s*:\s*Array\s*\{\s*return \[([\d,\s]*)\];/.exec(text);
    if (literal) {
      const list = literal[1].split(",").map(value => Number(value.trim())).filter(Number.isInteger);
      if (!versions || list.length > versions.length) {
        versions = list;
      }
    }
  }
  if (!versions || versions.length < 2) {
    return null;
  }
  const entry = {versions: versions.slice(0, MAX_VARIANTS)};
  const rows = {};
  for (const text of scripts) {
    for (const match of text.matchAll(/colArray\[(\d+)\] = (\[\[[\d,\s[\]]*\]\]);/g)) {
      try {
        rows[match[1]] = JSON.parse(match[2]).slice(0, PREVIEW_COLOURS).map(hex);
      }
      catch (err) {
        // not a plain table
      }
    }
  }
  if (entry.versions.every(version => rows[version])) {
    entry.colours = entry.versions.map(version => rows[version]);
  }
  return entry;
};

const scriptsIn = folder => {
  const found = [];
  const walk = dir => {
    for (const name of fs.readdirSync(dir, {withFileTypes: true})) {
      const full = path.join(dir, name.name);
      if (name.isDirectory()) {
        walk(full);
      }
      else if (name.name.endsWith(".as")) {
        found.push(fs.readFileSync(full, "utf8"));
      }
    }
  };
  walk(folder);
  return found;
};

const index = folder => {
  const out = path.join(folder, "out");
  const result = {};
  for (const name of fs.readdirSync(out)) {
    const id = /^(\d+)\.swf$/.exec(name);
    const entry = id && readItem(scriptsIn(path.join(out, name)));
    if (entry) {
      result[id[1]] = entry;
    }
  }
  const sorted = Object.fromEntries(Object.entries(result).sort((a, b) => Number(a[0]) - Number(b[0])));
  fs.writeFileSync(OUT, `${JSON.stringify(sorted)}\n`);
  console.log(`${Object.keys(sorted).length} den items with variants, ${Object.values(sorted).filter(entry => entry.colours).length} with colour previews: ${OUT}`);
};

const [command, folder] = process.argv.slice(2);
if (command === "fetch" && folder) {
  fetchAll(folder).then(() => process.exit(0), err => {
    console.error(err);
    process.exit(1);
  });
}
else if (command === "index" && folder) {
  index(folder);
}
else {
  console.error("node tools/den-variants.js fetch|index <folder>");
  process.exit(1);
}
