"use strict";

// end to end: items the staff make while the server runs
// (lib/customitems.js), from the moderator panel and in the game: games
// already playing are sent them, the packs have them, the shop sells them,
// and they are still there after a restart.

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const zlib = require("zlib");
const harness = require("./harness.js");
const {decode} = require("../lib/amf3.js");
const cdn = require("../lib/cdn.js");

const HTTP_PORT = 18093;
const GAME_PORT = 19352;
const BASE = `http://127.0.0.1:${HTTP_PORT}`;
const TOWNSHIP = "jamaa_township.room_main#1";
const ODD_CLOTHING_SHOP = 666;
const ODD_DEN_SHOP = 396;
const {postJson} = harness;

// the authenticator app's side of 2FA (lib/totp.js), as in test/staff.js.
const STEP = 30;
const base32Decode = text => {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = text.replace(/=+$/, "").toUpperCase().split("").map(c => alphabet.indexOf(c).toString(2).padStart(5, "0")).join("");
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
};
const codeAt = (secret, step) => {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = crypto.createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = mac[mac.length - 1] & 0x0F;
  return String((mac.readUInt32BE(offset) & 0x7FFFFFFF) % 1000000).padStart(6, "0");
};
const stepNow = () => Math.floor(Date.now() / 1000 / STEP);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const waitForStep = async step => {
  while (stepNow() < step) {
    await sleep(250);
  }
};

const webSession = () => {
  let cookie = "";
  return async (urlPath, body) => {
    const headers = {cookie};
    const options = body === undefined ? {headers} : {method: "POST", headers: {...headers, "Content-Type": "application/json"}, body: JSON.stringify(body)};
    const res = await fetch(`${BASE}${urlPath}`, options);
    const set = res.headers.get("set-cookie");
    if (set) {
      cookie = set.split(";")[0];
    }
    return {status: res.status, data: await res.json().catch(() => ({}))};
  };
};

const say = (client, roomId, text) =>
  client.send(`<msg t='sys'><body action='pubMsg' r='${roomId}'><txt><![CDATA[${text}%0]]></txt></body></msg>`);

// `onLogin(client)` runs before the room is joined, for what the server
// sends with the login (joining skips everything else on the way).
const arrive = async (username, password, totp, onLogin = async () => {}) => {
  const res = await postJson(`${BASE}/authenticate`, {username, password, ...(totp ? {totp} : {})});
  const auth = await res.json();
  assert.strictEqual(res.status, 200, `${username} could not sign in: ${JSON.stringify(auth)}`);
  const client = new harness.GameClient(GAME_PORT);
  await client.connect();
  const login = await client.logIn(username, auth.auth_token);
  assert.strictEqual(login.status, "1");
  await onLogin(client);
  client.xt("rj", 1, TOWNSHIP, 1, 0, 0);
  const rj = await client.untilXt("rj");
  await client.untilXt("rp");
  return {client, roomId: rj[4], token: auth.auth_token};
};

// a pack as the clients get it.
const pack = async id => Object.values(decode(zlib.inflateRawSync(Buffer.from(await (await fetch(`${BASE}/${cdn.hashedPath(`defPacks/${id}`)}`)).arrayBuffer()))));
const strings = async () => decode(zlib.inflateRawSync(Buffer.from(await (await fetch(`${BASE}/${cdn.hashedPath("defPacks/10230")}`)).arrayBuffer())));
const byId = (rows, id) => rows.find(row => String(row.id) === String(id));

// Ask for the same full clothing list the item editor does, then find one
// inventory entry in its five-field rows. Keeping this on the real protocol
// lets the rule tests cover both server state and what an open game receives.
const ownInventory = async (client, roomId, username, perUserAvId = 1) => {
  client.xt("il", roomId, username, perUserAvId, 1);
  for (;;) {
    const list = await client.untilXt("il");
    if (list[2] === "0" && list[5] === username) {
      return list;
    }
  }
};
const inventoryPiece = (list, defId) => {
  for (let index = 0; index < Number(list[8]); index++) {
    const at = 9 + index * 5;
    if (Number(list[at]) === Number(defId)) {
      return {inv: Number(list[at + 1]), equipped: list[at + 3]};
    }
  }
  return null;
};

// "xdi" [.., .., kind, rows as JSON], the next one of `kind`.
const untilDefs = async (client, kind) => {
  for (;;) {
    const fields = await client.untilXt("xdi");
    if (fields[2] === kind) {
      return JSON.parse(fields[3]);
    }
  }
};
// a game on another address: it fetches the packs with custom items in, and
// at login is sent of them only what they may lack (customItems.sendAll),
// all of it before the chat filter settings ("xfl").
const ELSEWHERE = "127.0.0.2";
const packsFrom = address => Promise.all([1000, 1030, 10230].map(id => new Promise((resolve, reject) => {
  http.get(`${BASE}/${cdn.hashedPath(`defPacks/${id}`)}`, {localAddress: address}, res => {
    assert.strictEqual(res.statusCode, 200);
    res.resume();
    res.on("end", resolve);
  }).on("error", reject);
})));
const defsAtLogin = async (username, password, address) => {
  const auth = await (await postJson(`${BASE}/authenticate`, {username, password})).json();
  const client = new harness.GameClient(GAME_PORT, address);
  await client.connect();
  assert.strictEqual((await client.logIn(username, auth.auth_token)).status, "1");
  const defs = {clothing: [], den: []};
  for (;;) {
    const fields = (await client.next()).split("%").slice(2, -1);
    if (fields[0] === "xfl") {
      client.socket.destroy();
      return defs;
    }
    if (fields[0] === "xdi") {
      defs[fields[2]].push(...JSON.parse(fields[3]));
    }
  }
};
const nextBox = async client => (await client.untilXt("xtl"))[2];
const shopList = async (client, roomId, shop) => {
  client.xt("gl", roomId, shop);
  return (await client.untilXt("gl")).slice(9);
};

const people = {Dev: "KettlePass21", Hal: "KettlePass22", Pat: "KettlePass23", Lou: "KettlePass24"};
const secret = {};
let usedStep = 0;
let made = {};

const first = async () => {
  const registerJson = body => fetch(`${BASE}/api/register`, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({avatarType: 1, agreed: true, ...body})});
  for (const [username, password] of Object.entries(people)) {
    assert.strictEqual((await registerJson({username, password})).status, 200);
  }
  const admin = webSession();
  assert.strictEqual((await admin("/admin/api/setup", {password: "AdminPass99!"})).status, 200);
  assert.strictEqual((await admin("/admin/api/login", {password: "AdminPass99!"})).status, 200);
  for (const username of ["Dev", "Hal"]) {
    const page = webSession();
    assert.strictEqual((await page("/account/api/login", {username, password: people[username]})).status, 200);
    secret[username] = (await page("/account/api/act", {action: "twoStepStart", current: people[username]})).data.setup.secret;
    usedStep = Math.max(usedStep, stepNow());
    assert.ok((await page("/account/api/act", {action: "twoStepConfirm", code: codeAt(secret[username], stepNow())})).data.ok);
  }
  assert.match((await admin("/admin/api/account", {username: "Dev", action: "role", role: "developer"})).data.ok, /developer/);
  assert.match((await admin("/admin/api/account", {username: "Hal", action: "role", role: "helper"})).data.ok, /helper/);

  // a game started before anything is made
  const pat = await arrive("Pat", people.Pat);

  // --- the panel: a developer makes items, and sees no players
  usedStep++;
  await waitForStep(usedStep);
  const dev = webSession();
  assert.strictEqual((await dev("/mod/api/login", {username: "Dev", password: people.Dev, code: codeAt(secret.Dev, usedStep)})).status, 200);
  const me = (await dev("/mod/api/me")).data;
  assert.strictEqual(me.role, "developer");
  assert.ok(me.permissions.includes("items.create") && !me.permissions.includes("player.view"));
  for (const page of ["/mod/api/players", "/mod/api/chat", "/mod/api/reports", "/mod/api/overview"]) {
    assert.strictEqual((await dev(page)).status, 403, page);
  }
  assert.deepStrictEqual((await dev("/mod/api/items")).data.items, []);

  // something to make them from: a clothing piece with several colours, and the bean bag chair
  const clothing = await pack(1000);
  const base = clothing.find(row => row.type === "1" && String(row.colors).split(",").length >= 3);
  const looked = (await dev(`/mod/api/items/base?kind=clothing&id=${base.id}`)).data;
  assert.strictEqual(looked.art, Number(base.layerDefId));
  assert.strictEqual(looked.colors.length, String(base.colors).split(",").length);
  const bodyPart = clothing.find(row => row.type === "0");
  assert.strictEqual((await dev(`/mod/api/items/base?kind=clothing&id=${bodyPart.id}`)).status, 404);

  // bad requests
  const make = fields => dev("/mod/api/items", {action: "create", kind: "clothing", base: base.id, name: "Test Crown", cost: 25, ...fields});
  assert.match((await make({name: ""})).data.error, /name/);
  assert.match((await make({name: "<b>hi</b>"})).data.error, /name/);
  assert.match((await make({cost: -1})).data.error, /price/);
  assert.match((await make({base: bodyPart.id})).data.error, /body part/);
  assert.match((await make({base: 999999})).data.error, /No clothing/);
  assert.match((await make({colors: []})).data.error, /colours/);

  // made: Pat's game is told at once
  const colours = looked.colors.slice(0, 2);
  const crown = await make({colors: colours});
  assert.match(crown.data.ok, /^Test Crown \(clothing 50000\) made\.$/);
  const [row] = await untilDefs(pat.client, "clothing");
  assert.deepStrictEqual([row.id, row.name, row.layerDefId, row.layerId, row.colors, row.titleStrId],
    ["50000", "Test Crown", base.layerDefId, base.layerId, colours.join(","), "9100000"]);

  // the packs a new game fetches have it, and its name
  const crownRow = byId(await pack(1000), 50000);
  assert.strictEqual(crownRow.layerDefId, base.layerDefId);
  assert.strictEqual(crownRow.avatarUseFlags, "9007199254740991"); // any animal, like all clothing here
  assert.strictEqual(row.avatarUseFlags, crownRow.avatarUseFlags); // and so in what games playing are sent
  assert.strictEqual((await strings())[9100000], "Test Crown");

  // first in the shop of oddities, and Pat can buy it in a colour it has
  assert.strictEqual((await shopList(pat.client, pat.roomId, ODD_CLOTHING_SHOP))[0], "50000");
  pat.client.xt("ib", pat.roomId, ODD_CLOTHING_SHOP, 1, 50000, 2, 0);
  assert.strictEqual((await pat.client.untilXt("ib"))[2], "0"); // a third colour it was not given
  pat.client.xt("ib", pat.roomId, ODD_CLOTHING_SHOP, 1, 50000, 1, 0);
  const bought = await pat.client.untilXt("il");
  assert.ok(bought.includes("50000"));
  assert.strictEqual((await pat.client.untilXt("ib"))[2], "1");

  // a den item, from the bean bag chair
  const chair = await dev("/mod/api/items", {action: "create", kind: "den", base: 1, name: "Test Chair", cost: 10});
  assert.match(chair.data.ok, /^Test Chair \(den item 50000\) made\.$/);
  const [chairRow] = await untilDefs(pat.client, "den");
  assert.deepStrictEqual([chairRow.id, chairRow.abbrName, chairRow.name, chairRow.nameStrId], ["50000", "BeanBagChair", "Test Chair", "9200000"]);
  assert.strictEqual((await shopList(pat.client, pat.roomId, ODD_DEN_SHOP))[0], "50000");
  assert.strictEqual(byId(await pack(1030), 50000).abbrName, "BeanBagChair");

  // the item finder has them
  const found = await (await fetch(`${BASE}/api/search?kind=all&q=50000`)).json();
  assert.deepStrictEqual(found.results.filter(entry => entry.id === 50000).map(entry => `${entry.kind} ${entry.name}`).sort(), ["clothing Test Crown", "den Test Chair"]);

  // changed: renamed and taken off sale, and Pat is told the new name
  assert.match((await dev("/mod/api/items", {action: "update", kind: "clothing", id: 50000, name: "Gold Crown", inShop: false})).data.ok, /Gold Crown .* changed/);
  assert.strictEqual((await untilDefs(pat.client, "clothing"))[0].name, "Gold Crown");
  assert.ok(!(await shopList(pat.client, pat.roomId, ODD_CLOTHING_SHOP)).includes("50000"));
  assert.strictEqual((await strings())[9100000], "Gold Crown");

  // --- in the game: !item, for whoever may make items
  usedStep++;
  await waitForStep(usedStep);
  // a game logging in is sent every item made so far
  let atLogin = null;
  const devGame = await arrive("Dev", people.Dev, codeAt(secret.Dev, usedStep), async client => {
    atLogin = await untilDefs(client, "clothing");
  });
  assert.deepStrictEqual(atLogin.map(entry => entry.name), ["Gold Crown"]);
  say(devGame.client, devGame.roomId, `!item clothing ${base.id} Quick Hat`);
  assert.strictEqual(await nextBox(devGame.client), "Made Quick Hat, clothing 50001. It is in the item finder now.");
  assert.strictEqual((await untilDefs(pat.client, "clothing"))[0].name, "Quick Hat");
  // a game whose address fetched the packs since has every item from them,
  // and is sent none again; then only the one changed after
  await packsFrom(ELSEWHERE);
  assert.deepStrictEqual(await defsAtLogin("Lou", people.Lou, ELSEWHERE), {clothing: [], den: []});
  assert.match((await dev("/mod/api/items", {action: "update", kind: "clothing", id: 50000, cost: 7})).data.ok, /changed/);
  assert.strictEqual((await untilDefs(pat.client, "clothing"))[0].value, "7");
  const changedSince = await defsAtLogin("Lou", people.Lou, ELSEWHERE);
  assert.deepStrictEqual(changedSince.clothing.map(row => `${row.id} ${row.name} ${row.value}`), ["50000 Gold Crown 7"]);
  assert.deepStrictEqual(changedSince.den, []);
  // a row carries what the client reads of it, not the whole base row
  const wire = ["id", "layerDefId", "layerId", "type", "value", "titleStrId", "isGiftable", "membersOnly", "itemStatus", "enviroType",
    "avatarUseFlags", "recycleValue", "currencyType", "defense", "attack", "attackMediaRefId", "combatType", "modifierType",
    "modifierValue", "criticalHit", "combinedCost", "colors", "availabilityStartTime", "availabilityEndTime", "name", "art", "artMode"];
  assert.deepStrictEqual(Object.keys(changedSince.clothing[0]).filter(field => !wire.includes(field)), []);
  say(devGame.client, devGame.roomId, "!item list");
  assert.match(await nextBox(devGame.client), /^Latest items made: 50001 Quick Hat \(clothing\); 50000 Test Chair \(den\); 50000 Gold Crown \(clothing, off sale\)$/);
  say(devGame.client, devGame.roomId, "!item hat 12 x");
  assert.match(await nextBox(devGame.client), /^Use: !item/);

  // a helper may not: it is chat (another account: the same step will do)
  const hal = await arrive("Hal", people.Hal, codeAt(secret.Hal, usedStep));
  say(hal.client, hal.roomId, `!item clothing ${base.id} Nope`);
  for (;;) {
    const line = await pat.client.untilXt("uc");
    if (line[3] === `!item clothing ${base.id} Nope`) {
      break;
    }
  }
  assert.strictEqual((await dev("/mod/api/items")).data.items.length, 3);

  // --- locked out of the item finder (lib/itemcontrol.js): players do not
  // find it or take it; the owner here, and staff who may lock, still do
  const searchAs = async (q, who) => (await (await fetch(`${BASE}/api/search?kind=clothing&q=${q}${who ? `&username=${who.name}&token=${who.token}` : ""}`)).json()).results;
  // (as the item finder page and the client send it: no Origin of another site)
  const giveAs = (body, token) => fetch(`${BASE}/api/give`, {method: "POST", headers: {"Content-Type": "application/json"},
    body: JSON.stringify({...body, ...(token ? {token} : {})})});
  const patAs = {name: "Pat", token: pat.token};
  assert.ok((await searchAs(50001, patAs)).some(entry => entry.id === 50001));
  assert.match((await dev("/mod/api/items", {action: "lock", kind: "clothing", id: 50001})).data.ok, /^Quick Hat \(clothing 50001\) is locked out of the item finder\.$/);
  assert.match((await dev("/mod/api/items", {action: "lock", kind: "clothing", id: 50001})).data.error, /already locked/);
  assert.ok(!(await searchAs(50001, patAs)).some(entry => entry.id === 50001));
  const refused = await giveAs({username: "Pat", kind: "clothing", id: 50001}, pat.token);
  assert.deepStrictEqual([refused.status, (await refused.json()).error], [403, "That item is locked out of the item finder."]);
  assert.deepStrictEqual((await searchAs(50001)).filter(entry => entry.id === 50001).map(entry => [entry.name, entry.locked]), [["Quick Hat (locked)", true]]);
  assert.strictEqual((await searchAs(50001, {name: "Dev", token: devGame.token})).find(entry => entry.id === 50001).name, "Quick Hat (locked)");
  assert.deepStrictEqual((await dev("/mod/api/items")).data.locked, [{kind: "clothing", id: 50001, name: "Quick Hat"}]);
  // the dashboards' lock finds it by name, marked locked, with the count
  const findLock = (await dev("/mod/api/items/find?q=quick%20hat&kind=clothing")).data;
  assert.deepStrictEqual([findLock.lockedCount, findLock.results.find(entry => entry.id === 50001)],
    [1, {kind: "clothing", id: 50001, cost: findLock.results.find(entry => entry.id === 50001).cost, name: "Quick Hat", locked: true, custom: true}]);
  say(devGame.client, devGame.roomId, "!locked");
  assert.strictEqual(await nextBox(devGame.client), "Locked out of the item finder: clothing 50001 Quick Hat");

  // --- taken from a player: every one of it, their game told
  assert.strictEqual((await giveAs({username: "Pat", kind: "clothing", id: 50001, colorIndex: 0})).status, 200); // the owner, here
  assert.strictEqual((await giveAs({username: "Pat", kind: "clothing", id: 50001, colorIndex: 0})).status, 200);
  say(devGame.client, devGame.roomId, "!take Pat clothing 50001");
  assert.strictEqual(await nextBox(devGame.client), "Took 2 of Quick Hat (clothing 50001) from Pat.");
  for (;;) {
    const changed = await pat.client.untilXt("il");
    if (changed[2] === "2" && changed[8] === "2") { // two removed
      break;
    }
  }
  say(devGame.client, devGame.roomId, "!take Pat clothing 50001");
  assert.strictEqual(await nextBox(devGame.client), "Pat has no Quick Hat (clothing 50001).");
  assert.strictEqual((await giveAs({username: "Pat", kind: "den", id: 50000})).status, 200);
  assert.match((await dev("/mod/api/items", {action: "take", username: "Pat", kind: "den", id: 50000})).data.ok, /^Took 1 of Test Chair \(den item 50000\) from Pat\.$/);
  assert.match((await dev("/mod/api/items", {action: "unlock", kind: "clothing", id: 50001})).data.ok, /back in the item finder/);
  assert.ok((await searchAs(50001, patAs)).some(entry => entry.id === 50001));

  // --- a custom item deleted: out of the game and every inventory
  say(devGame.client, devGame.roomId, `!item clothing ${base.id} Doomed Hat`);
  assert.strictEqual(await nextBox(devGame.client), "Made Doomed Hat, clothing 50002. It is in the item finder now.");
  assert.strictEqual((await giveAs({username: "Pat", kind: "clothing", id: 50002, colorIndex: 0})).status, 200);
  assert.match((await dev("/mod/api/items", {action: "delete", kind: "clothing", id: 50002})).data.ok, /^Deleted Doomed Hat \(clothing 50002\), and took 1 from players\.$/);
  assert.ok(!(await searchAs(50002)).some(entry => entry.id === 50002));
  assert.strictEqual((await giveAs({username: "Pat", kind: "clothing", id: 50002, colorIndex: 0})).status, 400);
  assert.ok(!byId(await pack(1000), 50002));
  assert.strictEqual((await dev("/mod/api/items")).data.items.length, 3);

  // --- a player's own items (lib/playeritems.js, the client's Item Maker):
  // free, given to them, found by them only, at most five a day
  const maker = async (...params) => {
    pat.client.xt("xcm", pat.roomId, ...params);
    const answer = await pat.client.untilXt("xcm");
    return {ok: answer[2] === "1", said: answer[3], today: Number(answer[4]), inAll: Number(answer[5]), mine: JSON.parse(answer[6])};
  };
  assert.deepStrictEqual(await maker("info"), {ok: true, said: "", today: 5, inAll: 20, mine: []});
  const own = await maker("make", "clothing", base.id, "Pat Hat");
  assert.deepStrictEqual([own.ok, own.said, own.today, own.inAll], [true, "Made Pat Hat. It is in your clothing now.", 4, 19]);
  const patHat = own.mine[0];
  assert.deepStrictEqual([patHat.kind, patHat.name, patHat.base], ["clothing", "Pat Hat", Number(base.id)]);
  assert.ok((await searchAs(patHat.id, patAs)).some(entry => entry.id === patHat.id));
  const halAs = {name: "Hal", token: hal.token};
  assert.ok(!(await searchAs(patHat.id, halAs)).some(entry => entry.id === patHat.id));
  assert.strictEqual((await giveAs({username: "Hal", kind: "clothing", id: patHat.id, colorIndex: 0}, hal.token)).status, 403);
  assert.ok((await searchAs(patHat.id, {name: "Dev", token: devGame.token})).some(entry => entry.id === patHat.id)); // staff who make items
  assert.match((await maker("make", "clothing", base.id, "Admin Hat")).said, /not allowed/);
  assert.match((await maker("make", "clothing", bodyPart.id, "Body")).said, /cannot be made into one of your own/);
  // the base list offers only what can be copied
  assert.ok(!(await (await fetch(`${BASE}/api/search?base=1&kind=clothing&q=${bodyPart.id}`)).json()).results.some(entry => entry.id === bodyPart.id));
  for (let count = 2; count <= 5; count++) {
    assert.ok((await maker("make", "den", 1, `Pat Chair ${count}`)).ok);
  }
  const full = await maker("make", "den", 1, "One Too Many");
  assert.deepStrictEqual([full.ok, full.today], [false, 0]);
  assert.match(full.said, /made 5 items today/);
  // --- its own picture (lib/itemart.js): checked and cleaned, served, and
  // every game told; only by its maker or staff who make items
  const crc32 = buf => {
    let c = ~0;
    for (const byte of buf) {
      c ^= byte;
      for (let k = 0; k < 8; k++) {
        c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
      }
    }
    return (~c) >>> 0;
  };
  const chunk = (type, data) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length);
    head.write(type, 4, "latin1");
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])));
    return Buffer.concat([head, data, crc]);
  };
  const png = (side, extra = []) => {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(side, 0);
    ihdr.writeUInt32BE(side, 4);
    ihdr[8] = 8;
    ihdr[9] = 2;
    const raw = Buffer.alloc((side * 3 + 1) * side, 0x7F);
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), chunk("IHDR", ihdr), ...extra,
      chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
  };
  const upload = (who, entry, body, extra = "") => fetch(`${BASE}/api/itemart?kind=${entry.kind}&id=${entry.id}&token=${who.token}${extra}`,
    {method: "POST", headers: {"Content-Type": "application/octet-stream"}, body}).then(response => response.json());
  const hatEntry = (await maker("info")).mine.find(entry => entry.name === "Pat Hat");
  // by default a player's picture waits for a moderator, even with items
  // let in at once: nobody else is shown it, not even by its address
  assert.match((await upload(pat, hatEntry, png(30))).ok, /waiting for a moderator/);
  assert.strictEqual((await maker("info")).mine.find(entry => entry.kind === hatEntry.kind && entry.id === hatEntry.id).art, "");
  assert.strictEqual((await fetch(`${BASE}/itemart/clothing/${hatEntry.id}.png`)).status, 404);
  const pendingUrl = (await admin("/admin/api/review")).data.waiting.find(entry => entry.id === hatEntry.id).artUrl;
  assert.match(pendingUrl, /^\/admin\/api\/itemart\?kind=clothing&id=\d+&v=p[0-9a-f]{12}$/);
  assert.strictEqual((await admin(pendingUrl)).status, 200);
  assert.strictEqual((await fetch(`${BASE}${pendingUrl}`)).status, 404); // signed in to nothing
  assert.match((await admin("/admin/api/review", {kind: "clothing", id: hatEntry.id, approve: true})).data.ok, /picture is shown now/);
  assert.strictEqual((await fetch(`${BASE}/itemart/clothing/${hatEntry.id}.png`)).status, 200);
  while (!(await untilDefs(pat.client, "clothing")).some(row => row.art)) {
    // every game is told of it waiting (no picture), then of it shown
  }
  // the rest of these, shown at once (the admin's switch)
  assert.strictEqual((await admin("/admin/api/item-switches", {artApproval: false})).status, 200);
  assert.strictEqual((await admin("/admin/api/review")).data.artApproval, false);
  assert.match((await upload(pat, hatEntry, png(32, [chunk("tEXt", Buffer.from("Author\x00Pat at home"))]))).ok, /new picture/);
  const told = (await untilDefs(pat.client, "clothing")).map(row => [row.id, row.art]);
  const sameItem = entry => entry.kind === hatEntry.kind && entry.id === hatEntry.id;
  const withArt = (await maker("info")).mine.find(sameItem);
  assert.match(withArt.art, /^p[0-9a-f]{12}$/);
  assert.deepStrictEqual(told, [[String(hatEntry.id), withArt.art]]);
  // the packs have no pictures: a game logging in is sent each one, however new its packs
  await packsFrom(ELSEWHERE);
  const pictured = (await defsAtLogin("Lou", people.Lou, ELSEWHERE)).clothing;
  assert.deepStrictEqual(pictured.filter(row => row.art).map(row => [row.id, row.art]), [[String(hatEntry.id), withArt.art]]);
  const served = await fetch(`${BASE}/itemart/clothing/${hatEntry.id}.png?v=${withArt.art}`);
  assert.deepStrictEqual([served.status, served.headers.get("content-type"), served.headers.get("x-content-type-options")], [200, "image/png", "nosniff"]);
  const bytes = Buffer.from(await served.arrayBuffer());
  assert.ok(!bytes.includes(Buffer.from("tEXt")) && !bytes.includes(Buffer.from("Pat at home")), "the text chunk was left in");
  assert.match((await upload(pat, hatEntry, Buffer.from("<html><script>alert(1)</script></html>"))).error, /not a PNG, JPEG, GIF or BMP/);
  // a GIF is kept a GIF (without its comment); a BMP is made a PNG
  const gif = Buffer.concat([Buffer.from("GIF89a"), Buffer.from([16, 0, 16, 0, 0x80, 0, 0]), Buffer.alloc(6, 0x55),
    Buffer.from([0x21, 0xFE, 4]), Buffer.from("Bob!"), Buffer.from([0]), Buffer.from([0x2C, 0, 0, 0, 0, 16, 0, 16, 0, 0, 2, 3, 1, 2, 3, 0, 0x3B])]);
  assert.match((await upload(pat, hatEntry, gif)).ok, /new picture/);
  const gifArt = (await maker("info")).mine.find(entry => entry.kind === hatEntry.kind && entry.id === hatEntry.id).art;
  const gifServed = await fetch(`${BASE}/itemart/clothing/${hatEntry.id}.png?v=${gifArt}`);
  assert.strictEqual(gifServed.headers.get("content-type"), "image/gif");
  assert.ok(!Buffer.from(await gifServed.arrayBuffer()).includes(Buffer.from("Bob!")), "the GIF comment was left in");
  const bmp = Buffer.alloc(54 + 32 * 3 * 32);
  bmp.write("BM");
  bmp.writeUInt32LE(bmp.length, 2);
  bmp.writeUInt32LE(54, 10);
  bmp.writeUInt32LE(40, 14);
  bmp.writeInt32LE(32, 18);
  bmp.writeInt32LE(32, 22);
  bmp.writeUInt16LE(1, 26);
  bmp.writeUInt16LE(24, 28);
  assert.match((await upload(pat, hatEntry, bmp)).ok, /new picture/);
  const bmpArt = (await maker("info")).mine.find(entry => entry.kind === hatEntry.kind && entry.id === hatEntry.id).art;
  assert.strictEqual((await fetch(`${BASE}/itemart/clothing/${hatEntry.id}.png?v=${bmpArt}`)).headers.get("content-type"), "image/png");
  assert.match((await upload(pat, hatEntry, png(600))).error, /512 pixels/);
  assert.match((await upload(hal, hatEntry, png(16))).error, /not one of your items/);
  assert.match((await fetch(`${BASE}/api/itemart?kind=clothing&id=${hatEntry.id}`, {method: "POST", body: png(16)}).then(r => r.json())).error, /Sign in/);
  // a JPEG keeps its picture and loses its EXIF (where a photo was taken)
  const segment = (marker, data) => Buffer.concat([Buffer.from([0xFF, marker, (data.length + 2) >> 8, (data.length + 2) & 0xFF]), data]);
  const jpeg = Buffer.concat([Buffer.from([0xFF, 0xD8]), segment(0xE0, Buffer.from("JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00", "latin1")),
    segment(0xE1, Buffer.from("Exif\x00\x00GPS 51.5N 0.12W", "latin1")), segment(0xC0, Buffer.from([8, 0, 20, 0, 30, 1, 1, 0x11, 0])),
    segment(0xDA, Buffer.from([1, 1, 0, 0, 0x3F, 0])), Buffer.from([0x12, 0x34, 0xFF, 0xD9])]);
  assert.match((await upload(pat, hatEntry, jpeg)).ok, /new picture/);
  const jpegArt = (await maker("info")).mine.find(sameItem).art;
  const jpegBytes = Buffer.from(await (await fetch(`${BASE}/itemart/clothing/${hatEntry.id}.png?v=${jpegArt}`)).arrayBuffer());
  assert.ok(jpegBytes.includes(Buffer.from("JFIF")) && !jpegBytes.includes(Buffer.from("GPS")), "the EXIF was left in");
  assert.match((await upload(pat, hatEntry, Buffer.alloc(0), "&remove=1")).ok, /taken away/);
  assert.strictEqual((await fetch(`${BASE}/itemart/clothing/${hatEntry.id}.png`)).status, 404);
  assert.match((await upload(pat, hatEntry, png(24))).ok, /new picture/); // deleted with the item, below
  assert.match((await maker("rename", "clothing", hatEntry.id, "Party Hat")).said, /^Renamed it Party Hat\.$/);
  // how it is worn: a sticker by default, a texture when its maker says so, every game told
  pat.client.xt("xcm", pat.roomId, "look", "clothing", hatEntry.id, "texture");
  assert.strictEqual((await untilDefs(pat.client, "clothing"))[0].artMode, "texture");
  assert.strictEqual((await pat.client.untilXt("xcm"))[2], "1"); // its own answer, after every game was told
  const wornAs = await maker("info");
  assert.strictEqual(wornAs.mine.find(entry => entry.kind === "clothing" && entry.id === hatEntry.id).artMode, "texture");
  assert.match((await maker("look", "clothing", hatEntry.id, "melted")).said, /sticker or texture/);

  // --- animal wear rules: a live custom item keeps its xdi-only name and
  // picture, existing use is removed, and neither packet nor saved-outfit
  // routes may put it back on the animal that staff blocked.
  const partyHat = wornAs.mine.find(sameItem);
  assert.ok(partyHat && partyHat.art, "the custom clothing to restrict is missing its picture");
  const partyPiece = inventoryPiece(await ownInventory(pat.client, pat.roomId, "Pat"), partyHat.id);
  assert.ok(partyPiece, "Pat does not own Party Hat");
  pat.client.xt("iu", pat.roomId, 1, 0, partyPiece.inv);
  assert.strictEqual((await pat.client.untilXt("iu"))[2], "1");
  let changedWear = await pat.client.untilXt("il");
  assert.deepStrictEqual(changedWear.slice(2), ["3", "1", "1", "Pat", "0", "1", "0", String(partyPiece.inv), String(partyHat.id)]);
  say(pat.client, pat.roomId, "!outfit save partyhat");
  assert.strictEqual(await nextBox(pat.client), "Outfit partyhat saved (1 items).");
  // A no-op item-editor request records what was worn for !outfit undo,
  // without taking Party Hat off before the dashboard removes it.
  pat.client.xt("iu", pat.roomId, 0, 0);
  await pat.client.untilXt("iu");
  await pat.client.untilXt("il");
  assert.strictEqual(byId(await pack(1000), partyHat.id).avatarUseFlags, "9007199254740991");
  assert.strictEqual((await admin("/admin/api/items/wear-rules", {id: partyHat.id, blockedTypes: ["1"]})).status, 400);
  assert.strictEqual((await admin("/admin/api/items/wear-rules", {id: bodyPart.id, blockedTypes: [1]})).status, 400);
  const partyRule = await admin("/admin/api/items/wear-rules", {id: partyHat.id, blockedTypes: [1]});
  assert.match(partyRule.data.ok, /cannot be worn/);
  // The owner receives a fresh full list immediately, with the old equipped
  // bit actually gone rather than merely hidden in the renderer.
  const afterRule = await pat.client.untilXt("il");
  assert.strictEqual(afterRule[2], "0");
  assert.strictEqual(inventoryPiece(afterRule, partyHat.id).equipped, "0");
  const partyUpdate = byId(await untilDefs(pat.client, "clothing"), partyHat.id);
  assert.deepStrictEqual([partyUpdate.avatarUseFlags, partyUpdate.name, partyUpdate.art, partyUpdate.artMode],
    ["9007199254740990", "Party Hat", partyHat.art, "texture"]);
  assert.strictEqual(byId(await pack(1000), partyHat.id).avatarUseFlags, "9007199254740990"); // cached pack was invalidated
  say(pat.client, pat.roomId, "!outfit undo");
  changedWear = await pat.client.untilXt("il");
  assert.strictEqual(changedWear[7], "0");
  assert.ok(!changedWear.includes(String(partyHat.id)));
  assert.match(await nextBox(pat.client), /Back to what you wore before/);
  say(pat.client, pat.roomId, "!outfit wear partyhat");
  changedWear = await pat.client.untilXt("il");
  assert.strictEqual(changedWear[7], "0");
  assert.ok(!changedWear.includes(String(partyHat.id)));
  assert.match(await nextBox(pat.client), /Wearing partyhat/);
  // A crafted/stale editor packet still succeeds as a request but cannot add
  // a blocked inventory entry to the response or persisted outfit.
  pat.client.xt("iu", pat.roomId, 1, 0, partyPiece.inv);
  assert.strictEqual((await pat.client.untilXt("iu"))[2], "1");
  changedWear = await pat.client.untilXt("il");
  assert.strictEqual(changedWear[7], "0");
  assert.ok(!changedWear.includes(String(partyHat.id)));

  // deleting: their own only, and gone from everyone
  assert.match((await maker("delete", "clothing", 50001)).said, /not one of your items/);
  for (const entry of full.mine) {
    assert.match((await maker("delete", entry.kind, entry.id)).said, /^Deleted /);
  }
  assert.deepStrictEqual((await maker("info")).mine, []);
  assert.strictEqual((await fetch(`${BASE}/itemart/clothing/${hatEntry.id}.png`)).status, 404);
  assert.strictEqual((await dev("/mod/api/items")).data.items.length, 3);
  assert.ok(!(await admin(`/admin/api/items/wear-rules?q=${hatEntry.id}`)).data.rules.some(rule => rule.id === hatEntry.id),
    "deleting custom clothing should remove its wear rule");

  // --- the admin's switches: what players make waits for a moderator first,
  // out of the game till then; or the Item Maker is off
  assert.strictEqual((await admin("/admin/api/item-switches", {enabled: true, approval: true})).status, 200);
  const asked = await maker("make", "clothing", base.id, "Waiting Hat");
  assert.match(asked.said, /waiting for a moderator/);
  const waitingHat = asked.mine.find(entry => entry.name === "Waiting Hat");
  assert.strictEqual(waitingHat.waiting, "item");
  assert.ok(!(await searchAs(waitingHat.id)).some(entry => entry.id === waitingHat.id)); // not in the game yet
  const queue = (await admin("/admin/api/review")).data;
  assert.deepStrictEqual([queue.enabled, queue.approval, queue.waiting.map(entry => `${entry.name} ${entry.waiting} ${entry.maker}`)],
    [true, true, ["Waiting Hat item Pat"]]);
  assert.strictEqual((await dev("/mod/api/review")).status, 403); // a developer approves nothing
  assert.match((await admin("/admin/api/review", {kind: "clothing", id: waitingHat.id, approve: true})).data.ok, /in the game, and Pat has one/);
  for (;;) {
    const changed = await pat.client.untilXt("il");
    if (changed[2] === "2" && changed[10] === String(waitingHat.id)) { // given to Pat
      break;
    }
  }
  assert.ok((await searchAs(waitingHat.id, patAs)).some(entry => entry.id === waitingHat.id));
  // a new picture waits too, and is not shown till then
  assert.match((await upload(pat, waitingHat, png(20))).ok, /waiting for a moderator/);
  assert.strictEqual((await maker("info")).mine.find(entry => entry.id === waitingHat.id && entry.kind === "clothing").waiting, "picture");
  assert.match((await admin("/admin/api/review", {kind: "clothing", id: waitingHat.id, approve: false})).data.ok,
    /picture was turned away\. Pat has had 1 of 3 pictures turned away\.$/);
  assert.strictEqual((await admin("/admin/api/review")).data.waiting.length, 0);
  // the same picture cannot come back; after three turned away, uploads stop
  assert.match((await upload(pat, waitingHat, png(20))).error, /turned that picture away before/);
  assert.match((await upload(pat, waitingHat, png(21))).ok, /waiting/);
  assert.match((await admin("/admin/api/review", {kind: "clothing", id: waitingHat.id, approve: false})).data.ok, /2 of 3/);
  assert.match((await upload(pat, waitingHat, png(22))).ok, /waiting/);
  assert.match((await admin("/admin/api/review", {action: "takePicture", kind: "clothing", id: waitingHat.id})).data.ok,
    /taken away\. That is 3 for Pat: their picture uploads are stopped\.$/);
  assert.match((await upload(pat, waitingHat, png(23))).error, /turned off picture uploads/);
  assert.deepStrictEqual((await admin("/admin/api/review")).data.stopped, ["Pat"]);
  assert.match((await admin("/admin/api/review", {action: "uploads", username: "Pat", blocked: false})).data.ok, /Pat can upload pictures again/);
  assert.match((await upload(pat, waitingHat, png(23))).ok, /waiting/);
  assert.match((await admin("/admin/api/review", {kind: "clothing", id: waitingHat.id, approve: true})).data.ok, /shown now/);
  // off: nothing is made
  assert.strictEqual((await admin("/admin/api/item-switches", {enabled: false, approval: false})).status, 200);
  assert.match((await maker("make", "clothing", base.id, "No Hat")).said, /turned off/);
  assert.strictEqual((await admin("/admin/api/item-switches", {enabled: true})).status, 200);
  assert.match((await maker("delete", "clothing", waitingHat.id)).said, /^Deleted /);

  // A developer can create items but is not silently granted the moderation
  // control. Once made a moderator, the existing panel session is checked
  // against the new role and can create a rule that survives the restart.
  assert.strictEqual((await dev("/mod/api/items/wear-rules")).status, 403);
  assert.strictEqual((await dev("/mod/api/items/wear-rules", {id: 50000, blockedTypes: [1]})).status, 403);
  assert.match((await admin("/admin/api/account", {username: "Dev", action: "role", role: "moderator"})).data.ok, /moderator/);
  const moderatorMe = (await dev("/mod/api/me")).data;
  assert.ok(moderatorMe.permissions.includes("items.restrict") && !moderatorMe.permissions.includes("items.create"));
  const crownRule = await dev("/mod/api/items/wear-rules", {id: 50000, blockedTypes: [1]});
  assert.match(crownRule.data.ok, /cannot be worn/);
  const moderatorRules = (await dev("/mod/api/items/wear-rules?q=Gold%20Crown")).data;
  assert.deepStrictEqual(moderatorRules.results.find(entry => entry.id === 50000).blockedTypes, [1]);
  assert.strictEqual(byId(await pack(1000), 50000).avatarUseFlags, "9007199254740990");

  // written down under the maker's name
  const log = (await admin("/admin/api/moderators")).data.log.map(entry => `${entry.by} ${entry.action} ${entry.detail}`);
  for (const line of ["Dev item made clothing 50000 Test Crown", "Dev item made den 50000 Test Chair", "Dev item changed clothing 50000 Gold Crown",
    "Dev item made (in game) clothing 50001 Quick Hat", "Dev item locked clothing 50001", "Dev item taken (in game) clothing 50001 x2",
    "Dev item taken den 50000 x1", "Dev item deleted clothing 50002"]) {
    assert.ok(log.includes(line), `missing from the log: ${line}\n${log.join("\n")}`);
  }
  made = {base, restrictedId: 50000};
  for (const {client} of [pat, devGame, hal]) {
    client.socket.destroy();
  }
};

// the same database, a new server: everything is still there.
const second = async () => {
  const atLogin = {};
  const lou = await arrive("Lou", people.Lou, null, async client => {
    atLogin.clothing = await untilDefs(client, "clothing");
    atLogin.den = await untilDefs(client, "den");
  });
  assert.deepStrictEqual(atLogin.clothing.map(entry => `${entry.id} ${entry.name}`), ["50000 Gold Crown", "50001 Quick Hat"]);
  assert.deepStrictEqual(atLogin.den.map(entry => entry.name), ["Test Chair"]);
  assert.strictEqual(byId(await pack(1000), 50001).layerDefId, made.base.layerDefId);
  assert.strictEqual(byId(atLogin.clothing, made.restrictedId).avatarUseFlags, "9007199254740990");
  assert.strictEqual(byId(await pack(1000), made.restrictedId).avatarUseFlags, "9007199254740990");
  assert.strictEqual((await strings())[9100001], "Quick Hat");
  const shop = await shopList(lou.client, lou.roomId, ODD_CLOTHING_SHOP);
  assert.ok(shop.includes("50001") && !shop.includes("50000"));
  lou.client.socket.destroy();
};

// the packs made again at most every AJ_PACK_REMAKE_MS after a change: one
// fetched before then is the one made before, and a game whose address
// fetched it is sent at login the item it lacks.
const REMAKE_MS = 5000;
const third = async () => {
  const fetchedEarlier = "127.0.0.3";
  await packsFrom(fetchedEarlier);
  const lou = await arrive("Lou", people.Lou);
  lou.client.xt("xcm", lou.roomId, "make", "clothing", made.base.id, "Lou Hat");
  const answer = await lou.client.untilXt("xcm");
  assert.strictEqual(answer[2], "1", answer[3]);
  const louHat = JSON.parse(answer[6]).find(entry => entry.name === "Lou Hat");
  assert.ok(!byId(await pack(1000), louHat.id)); // the pack of before, for a moment
  const atLogin = await defsAtLogin("Pat", people.Pat, fetchedEarlier);
  assert.deepStrictEqual(atLogin.clothing.filter(row => row.id === String(louHat.id)).map(row => row.name), ["Lou Hat"]);
  await new Promise(resolve => setTimeout(resolve, REMAKE_MS + 200));
  assert.strictEqual(byId(await pack(1000), louHat.id).titleStrId, String(9100000 + louHat.id - 50000));
  assert.strictEqual((await strings())[9100000 + louHat.id - 50000], "Lou Hat");
  lou.client.socket.destroy();
};

(async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "aj-test-"));
  try {
    await harness.withServer("items test", HTTP_PORT, GAME_PORT, first, {dataDir});
    await harness.withServer("items test (after a restart)", HTTP_PORT, GAME_PORT, second, {dataDir});
    process.env.AJ_PACK_REMAKE_MS = String(REMAKE_MS);
    await harness.withServer("items test (packs made again at most so often)", HTTP_PORT, GAME_PORT, third, {dataDir});
  }
  finally {
    fs.rmSync(dataDir, {recursive: true, force: true, maxRetries: 10, retryDelay: 200});
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});
