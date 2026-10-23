"use strict";

// end-to-end check of the sign-up page's rules and the account page
// (/account, lib/manage.js): signing in, password, username requests,
// feedback, the lock, the switches for parts of the game, login history,
// and the admin panel's side of it. simulated players, a real server.

const assert = require("assert");
const art = require("../lib/ecard-art.json");
const harness = require("./harness.js");

const HTTP_PORT = 18084;
const GAME_PORT = 19343;
const BASE = `http://127.0.0.1:${HTTP_PORT}`;
const TOWNSHIP = "jamaa_township.room_main#1";
const {postJson} = harness;

const authenticate = (username, password) => postJson(`${BASE}/authenticate`, {username, password});

const arrive = async (username, password) => {
  const auth = await (await authenticate(username, password)).json();
  const client = new harness.GameClient(GAME_PORT);
  await client.connect();
  const login = await client.logIn(username, auth.auth_token);
  assert.strictEqual(login.status, "1");
  client.xt("rj", 1, TOWNSHIP, 1, 0, 0);
  const roomId = (await client.untilXt("rj"))[4];
  await client.untilXt("rp");
  client.xt("au", roomId, 1, 400, 400, 14, 1);
  return {client, roomId, token: auth.auth_token};
};

// A request to one of the two cookie-guarded pages' APIs.
const page = prefix => async (pathname, body, cookie, headers = {}) => {
  const response = await fetch(`${BASE}/${prefix}/api/${pathname}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {"Content-Type": "application/json", ...(cookie ? {Cookie: cookie} : {}), ...headers},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {status: response.status, data: await response.json(), cookie: (response.headers.get("set-cookie") || "").split(";")[0]};
};
const mine = page("account");
const panel = page("admin");

const run = async () => {
  const register = (username, avatarType) => fetch(`${BASE}/api/register`, {method: "POST", headers: {"Content-Type": "application/json"},
    body: JSON.stringify({username, password: "KettlePass01", avatarType, agreed: true})});
  assert.strictEqual((await register("Ann", 4)).status, 200);
  assert.strictEqual((await register("Ben", 24)).status, 200);
  // what a client shows beside its login form.
  const status = await (await fetch(`${BASE}/api/status`)).json();
  assert.ok(status.online === 0 && status.uptimeSeconds >= 0);

  // --- the page and who may use it
  assert.match(await (await fetch(`${BASE}/account`)).text(), /Your account/);
  assert.strictEqual((await mine("me")).status, 401);
  assert.strictEqual((await mine("login", {username: "Ann", password: "wrong"})).status, 401);
  assert.strictEqual((await mine("login", {username: "Nobody", password: "KettlePass01"})).status, 401);
  const signedIn = await mine("login", {username: "ann", password: "KettlePass01"});
  assert.strictEqual(signedIn.status, 200);
  assert.match(signedIn.cookie, /^ajc_account=[0-9a-f]{48}$/);
  const ann = signedIn.cookie;
  assert.strictEqual((await mine("act", {action: "lock", locked: true}, ann, {Origin: "http://evil.example"})).status, 403);
  let me = (await mine("me", undefined, ann)).data;
  assert.deepStrictEqual([me.username, me.animalType, me.locked, me.features.chat], ["Ann", 4, false, true]); // the wolf she picked
  // the wrong password and the sign-in are both in her history, newest first.
  assert.deepStrictEqual(me.history.map(login => [login.via, login.ok]), [["web", true], ["web", false]]);

  // --- signing in with the Burrow client: the page's nonce, the client's
  // token for a ticket, and the ticket only for the browser that started it
  const clientStart = async () => {
    const started = await mine("client-start", {});
    assert.strictEqual(started.status, 200);
    assert.match(started.cookie, /^ajc_clink=[0-9a-f]{48}$/);
    return {nonce: started.data.nonce, cookie: started.cookie};
  };
  const openTicket = async (link, cookie) => {
    const response = await fetch(`${BASE}${new URL(link).pathname}${new URL(link).search}`, {headers: cookie ? {Cookie: cookie} : {}});
    const result = /client=(\w+)/.exec(await response.text())[1];
    const session = response.headers.getSetCookie().map(line => line.split(";")[0]).find(line => /^ajc_account=[0-9a-f]{48}$/.test(line));
    return {result, session};
  };
  const annToken = (await (await authenticate("Ann", "KettlePass01")).json()).auth_token;
  const browser = await clientStart();
  assert.strictEqual((await mine("client-ticket", {token: annToken, nonce: "0".repeat(48)})).status, 400);
  assert.strictEqual((await mine("client-ticket", {token: "f".repeat(annToken.length), nonce: browser.nonce})).status, 401);
  const ticket = await mine("client-ticket", {token: annToken, nonce: browser.nonce});
  assert.deepStrictEqual([ticket.status, ticket.data.username], [200, "Ann"]);
  // another browser (no cookie, or another start's) gets nothing from it, and it is then used up
  const other = await clientStart();
  assert.deepStrictEqual(await openTicket(ticket.data.url, other.cookie), {result: "elsewhere", session: undefined});
  assert.deepStrictEqual(await openTicket(ticket.data.url, browser.cookie), {result: "expired", session: undefined});
  const second = await mine("client-ticket", {token: annToken, nonce: browser.nonce});
  assert.deepStrictEqual(await openTicket(second.data.url), {result: "elsewhere", session: undefined});
  const third = await mine("client-ticket", {token: annToken, nonce: browser.nonce});
  const opened = await openTicket(third.data.url, browser.cookie);
  assert.strictEqual(opened.result, "ok");
  assert.strictEqual((await mine("me", undefined, opened.session)).data.username, "Ann");
  // the start is used up with the sign-in
  assert.strictEqual((await mine("client-ticket", {token: annToken, nonce: browser.nonce})).status, 400);

  // --- the item giver on the web (/account/items): signed in as on this page
  assert.match(await (await fetch(`${BASE}/account/items`)).text(), /Item giver/);
  // (an account of its own: the others' inventories are counted further down)
  assert.strictEqual((await register("Cleo", 5)).status, 200);
  const cleo = (await mine("login", {username: "Cleo", password: "KettlePass01"})).cookie;
  assert.strictEqual((await mine("giver?q=top%20hat")).status, 401);
  const hats = (await mine("giver?q=top%20hat&kind=clothing", undefined, cleo)).data;
  const hat = hats.results.find(entry => entry.id === 21);
  assert.ok(hat.presets.length > 1 && hat.presets[0].colours.every(colour => /^[0-9a-f]{6}$/.test(colour)));
  const ownColour = await mine("give", {kind: "clothing", id: 21, colorIndex: 1}, cleo);
  assert.deepStrictEqual([ownColour.status, ownColour.data.color], [200, hat.presets[1].id]);
  // four colours of one's own: a custom colour (lib/colours.js), the same one for the same four
  const hexColours = await mine("give", {kind: "clothing", id: 21, color: "#ff0000 #00ff00 #0000ff #ffffff"}, cleo);
  assert.strictEqual(hexColours.status, 200);
  assert.ok(hexColours.data.color >= 0xFD000000 && hexColours.data.color <= 0xFDFFFFFF);
  assert.strictEqual((await mine("give", {kind: "clothing", id: 21, color: "#ff0000 #00ff00 #0000ff #ffffff"}, cleo)).data.color, hexColours.data.color);
  // the page's colour boxes: the palette, a custom colour's four, the custom colour four make
  assert.strictEqual((await mine("colour", undefined, cleo)).data.palette.length, 256);
  assert.deepStrictEqual((await mine(`colour?id=${hexColours.data.color | 0}`, undefined, cleo)).data.colours, ["ff0000", "00ff00", "0000ff", "ffffff"]);
  assert.strictEqual((await mine("colour?rgbs=ff0000,00ff00,0000ff,ffffff", undefined, cleo)).data.id, hexColours.data.color);
  assert.strictEqual((await mine("colour?rgbs=123456,00ff00,0000ff,ffffff", undefined, cleo)).data.id, null);
  assert.strictEqual((await mine("colour?id=4261412863", undefined, cleo)).status, 404);
  // a colour as the game writes it, signed or not; a custom one only if it is made
  assert.strictEqual((await mine("give", {kind: "clothing", id: 21, color: "-16777216"}, cleo)).data.color, 0xFF000000);
  assert.strictEqual((await mine("give", {kind: "clothing", id: 21, color: "4261412863"}, cleo)).status, 400);
  // a den item's variants (lib/den-variants.json) and a tint: 1 + the tint's colour entry above the variant's 8 bits
  const chair = (await mine("giver?q=1&kind=den", undefined, cleo)).data.results.find(entry => entry.id === 1);
  assert.deepStrictEqual([chair.variants, chair.variantColours.length, chair.tintable], [[0, 1, 2, 3, 4, 5, 6, 7], 8, true]);
  assert.deepStrictEqual((await mine("give", {kind: "den", id: 1, version: 5}, cleo)).data.version, 5);
  assert.strictEqual((await mine("give", {kind: "den", id: 1, version: 9}, cleo)).status, 400);
  assert.strictEqual((await mine("give", {kind: "den", id: 1, tint: "red"}, cleo)).status, 400);
  assert.strictEqual((await mine("give", {kind: "den", id: 1, tint: "#ff8800", tintStrength: 0}, cleo)).status, 400);
  const tinted = await mine("give", {kind: "den", id: 1, version: 3, tint: "#ff8800", tintStrength: 60}, cleo);
  assert.strictEqual(tinted.status, 200);
  assert.strictEqual(tinted.data.version & 0xFF, 3);
  assert.ok(tinted.data.version >> 8 >= 1);
  // only from this server's own pages
  assert.strictEqual((await mine("give", {kind: "den", id: 1}, cleo, {Origin: "http://evil.example"})).status, 403);
  // its previews (lib/itempreview.js), the same for anyone: a clothing icon to colour, a den item's SWF
  const icon = await (await fetch(`${BASE}/account/art/clothing/21`)).json();
  assert.ok(icon.w > 0 && icon.h > 0 && Buffer.from(icon.b, "base64").length > 0);
  const denArt = await fetch(`${BASE}/account/art/den/1`);
  assert.strictEqual(denArt.headers.get("access-control-allow-origin"), "*");
  assert.match(Buffer.from(await denArt.arrayBuffer()).subarray(0, 3).toString(), /^[CFZ]WS$/);
  assert.strictEqual((await fetch(`${BASE}/account/art/den/999999`)).status, 404);
  assert.match((await fetch(`${BASE}/account/item-preview`)).headers.get("content-security-policy"), /sandbox allow-scripts$/);
  assert.match(Buffer.from(await (await fetch(`${BASE}/account/item-preview.swf`)).arrayBuffer()).subarray(0, 3).toString(), /^[CFZ]WS$/);

  // --- parts of the game switched off
  const {client: a, roomId} = await arrive("Ann", "KettlePass01");
  const {client: b} = await arrive("Ben", "KettlePass01");
  await a.untilXt("ac");
  const set = async (feature, on) => assert.strictEqual((await mine("act", {action: "feature", feature, on}, ann)).status, 200);
  assert.strictEqual((await mine("act", {action: "feature", feature: "flying", on: false}, ann)).status, 400);

  await set("buddies", false);
  b.xt("ba", roomId, "Ann");
  assert.deepStrictEqual((await b.untilXt("ba")).slice(2, 4), ["3", "Ann"]); // not accepting requests
  a.xt("ba", roomId, "Ben");
  assert.strictEqual((await a.untilXt("ba"))[2], "3");
  await set("buddies", true);
  b.xt("ba", roomId, "Ann");
  assert.strictEqual((await a.untilXt("ba"))[3], "Ben"); // it arrives now

  await set("chat", false);
  a.send(`<msg t='sys'><body action='pubMsg' r='${roomId}'><txt><![CDATA[hello%0]]></txt></body></msg>`);
  assert.deepStrictEqual((await a.untilXt("uc")).slice(3), ["-1", "5"]); // her line goes nowhere
  b.send(`<msg t='sys'><body action='pubMsg' r='${roomId}'><txt><![CDATA[anyone%0]]></txt></body></msg>`);
  assert.strictEqual((await b.untilXt("uc"))[3], "anyone");
  await set("chat", true);
  b.send(`<msg t='sys'><body action='pubMsg' r='${roomId}'><txt><![CDATA[again%0]]></txt></body></msg>`);
  assert.strictEqual((await a.untilXt("uc"))[3], "again"); // "anyone" never reached her

  await set("trading", false);
  b.xt("ti", roomId, 0, "Ann", 0, 1, 0, 0, 0, 0);
  assert.deepStrictEqual((await b.untilXt("ti")).slice(2, 4), ["4", "Ann"]); // unavailable, before anything else is looked at
  await set("jamagrams", false);
  b.xt("es", roomId, "Ann", art.cards[0], art.stamps[0], 0, "hi", 0, 0, 0);
  assert.strictEqual((await b.untilXt("es"))[2], "-2"); // not accepting them
  await set("jamagrams", true);
  b.xt("es", roomId, "Ann", art.cards[0], art.stamps[0], 0, "hi", 0, 0, 0);
  assert.strictEqual((await b.untilXt("es"))[2], "1");
  await set("jamagrams", false);
  me = (await mine("me", undefined, ann)).data;
  assert.deepStrictEqual([me.features.trading, me.features.jamagrams, me.features.buddies, me.online], [false, false, true, true]);

  // --- buddies with a note, the block list, achievements, den visitors
  b.xt("bc", roomId, "Ann", 1); // ben says yes to her request from before
  a.xt("ba", roomId, "Ben");
  await b.untilXt("ba");
  b.xt("bc", roomId, "Ann", 1);
  await a.untilXt("bs");
  assert.strictEqual((await mine("act", {action: "buddyNote", name: "Ben", note: "  met at the fountain "}, ann)).status, 200);
  assert.strictEqual((await mine("act", {action: "buddyNote", name: "Nobody", note: "x"}, ann)).status, 400);
  assert.strictEqual((await mine("act", {action: "block", name: "Nobody"}, ann)).status, 400);
  assert.strictEqual((await mine("act", {action: "block", name: "Ben"}, ann)).status, 200);
  await a.untilXt("bl"); // her game hears of it: its buddy list, then its block list
  assert.deepStrictEqual((await a.untilXt("bl")).slice(2, 5), ["1", "1", "ben"]);
  assert.strictEqual((await mine("act", {action: "block", name: "Ben"}, ann)).status, 400);
  b.xt("dj", roomId, "denAnn", 1, -1);
  await b.untilXt("rj"); // locked out: she blocked him
  assert.strictEqual((await mine("act", {action: "unblock", name: "ben"}, ann)).status, 200);
  b.xt("dj", roomId, "denAnn", 1, -1);
  const inDen = await b.untilXt("rj");
  assert.strictEqual(inDen[3], "denAnn");
  b.xt("rj", inDen[4], TOWNSHIP, 1, 0, 0);
  await b.untilXt("rp");
  me = (await mine("me", undefined, ann)).data;
  assert.deepStrictEqual(me.buddyList, [{name: "Ben", online: true, note: "met at the fountain"}]);
  assert.deepStrictEqual([me.blocked, me.denVisits.map(visit => visit.name), me.trades, me.offers], [[], ["Ben"], [], {incoming: [], outgoing: []}]);
  assert.ok(me.achievements.of > 200 && me.achievements.counted.some(counted => counted.name === "Gems Earned" && counted.next > 0));

  // --- a trade offer left for someone, answered from their page
  const giveTo = async (username, query) => {
    const found = (await (await fetch(`${BASE}/api/search?q=${query}&kind=clothing`)).json()).results[0];
    await fetch(`${BASE}/api/give`, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({username, kind: "clothing", id: found.id, colorIndex: 0})});
    return found.name;
  };
  const hatName = await giveTo("Ann", "top+hat");
  const scarfName = await giveTo("Ben", "scarf");
  let benHas = await b.untilXt("il");
  while (benHas[2] !== "2" || benHas[5] !== "Ben") { // past the lists he was sent of Ann's clothes
    benHas = await b.untilXt("il");
  }
  b.xt("ts", roomId, 0, 1, 0, benHas[9]); // ben puts his scarf up for trade, in the game
  await b.untilXt("tl");
  const benPageCookie = (await mine("login", {username: "Ben", password: "KettlePass01"})).cookie;
  const tradable = (await mine("tradable?of=ben", undefined, ann)).data;
  assert.deepStrictEqual([tradable.found, tradable.theirs.map(item => item.name), tradable.mine.map(item => item.name)], [true, [scarfName], [hatName]]);
  assert.strictEqual((await mine("act", {action: "offer", to: "Ben", wanted: tradable.theirs[0], offered: []}, ann)).status, 400);
  assert.strictEqual((await mine("act", {action: "offer", to: "Ben", wanted: {type: 0, inv: 999999}, offered: tradable.mine}, ann)).status, 400);
  assert.strictEqual((await mine("act", {action: "offer", to: "Ben", wanted: tradable.theirs[0], offered: tradable.mine}, ann)).status, 400); // she has trading off
  await set("trading", true);
  assert.strictEqual((await mine("act", {action: "offer", to: "Ben", wanted: tradable.theirs[0], offered: tradable.mine}, ann)).status, 200);
  let benPage = (await mine("me", undefined, benPageCookie)).data;
  assert.deepStrictEqual(benPage.offers.incoming.map(offer => [offer.from, offer.wanted.name, offer.offered.map(item => item.name)]), [["Ann", scarfName, [hatName]]]);
  assert.strictEqual((await mine("me", undefined, ann)).data.offers.outgoing.length, 1);
  assert.strictEqual((await mine("act", {action: "answerOffer", id: benPage.offers.incoming[0].id, accept: true}, benPageCookie)).status, 200);
  await a.untilXt("di"); // both are in the game: their inventories are sent afresh
  await b.untilXt("di");
  benPage = (await mine("me", undefined, benPageCookie)).data;
  assert.deepStrictEqual([benPage.offers.incoming, benPage.trades.map(trade => [trade.with, trade.got, trade.gave])], [[], [["Ann", [hatName], [scarfName]]]]);
  assert.deepStrictEqual((await mine("tradable?of=ben", undefined, ann)).data.mine.map(item => item.name), [scarfName]);

  // --- a username request, approved from the admin panel
  assert.strictEqual((await mine("act", {action: "requestName", newName: "Ben"}, ann)).status, 400); // taken
  assert.strictEqual((await mine("act", {action: "requestName", newName: "Ann"}, ann)).status, 400); // hers already
  assert.strictEqual((await mine("act", {action: "requestName", newName: "x"}, ann)).status, 400);
  const asked = await mine("act", {action: "requestName", newName: "Annabel", reason: "my real nickname"}, ann);
  assert.strictEqual(asked.status, 200);
  assert.deepStrictEqual(asked.data.account.nameRequests.map(request => [request.newName, request.status]), [["Annabel", "waiting"]]);
  assert.strictEqual((await mine("act", {action: "feedback", kind: "bug", text: "  the slide is stuck  "}, ann)).status, 200);
  assert.strictEqual((await mine("act", {action: "feedback", kind: "bug", text: "   "}, ann)).status, 400);
  assert.strictEqual((await mine("act", {action: "feedback", kind: "rant", text: "x"}, ann)).status, 400);

  const admin = (await panel("setup", {password: "admin-password-1"})).cookie;
  const waiting = (await panel("support?handled=0", undefined, admin)).data;
  assert.deepStrictEqual([waiting.open, waiting.names[0].newName, waiting.names[0].reason, waiting.feedback[0].text],
    [2, "Annabel", "my real nickname", "the slide is stuck"]);
  assert.strictEqual((await panel("overview", undefined, admin)).data.stats.support, 2);
  assert.strictEqual((await panel("support", {action: "read", id: waiting.feedback[0].id}, admin)).status, 200);
  assert.strictEqual((await panel("support", {action: "approve", id: waiting.names[0].id}, admin)).status, 200);
  assert.strictEqual((await panel("support", {action: "approve", id: waiting.names[0].id}, admin)).status, 400); // only once
  assert.strictEqual((await mine("me", undefined, ann)).status, 401); // renamed: sign in again, with the new name
  assert.strictEqual((await authenticate("Ann", "KettlePass01")).status, 401);
  const annabel = (await mine("login", {username: "Annabel", password: "KettlePass01"})).cookie;
  me = (await mine("me", undefined, annabel)).data;
  assert.deepStrictEqual([me.username, me.nameRequests[0].status, me.feedback[0].handledAt > 0], ["Annabel", "approved", true]);

  // --- the lock: out of the game, and no way back in until it is undone
  const {token} = await arrive("Annabel", "KettlePass01");
  assert.strictEqual((await mine("act", {action: "lock", locked: true}, annabel)).status, 200);
  assert.strictEqual((await authenticate("Annabel", "KettlePass01")).status, 401);
  assert.strictEqual((await postJson(`${BASE}/authenticate`, {refresh_token: token})).status, 401); // the saved sign-in is gone
  assert.strictEqual((await panel("accounts", undefined, admin)).data.accounts.find(account => account.username === "Annabel").locked, true);
  assert.strictEqual((await mine("login", {username: "Annabel", password: "KettlePass01"})).status, 200); // the page still lets her in
  assert.strictEqual((await mine("act", {action: "lock", locked: false}, annabel)).status, 200);
  assert.strictEqual((await authenticate("Annabel", "KettlePass01")).status, 200);

  // --- the password: the old one is asked for, and stops working
  assert.strictEqual((await mine("act", {action: "password", current: "wrong", password: "KettlePass02"}, annabel)).status, 400);
  assert.strictEqual((await mine("act", {action: "password", current: "KettlePass01", password: "short"}, annabel)).status, 400);
  assert.strictEqual((await mine("act", {action: "password", current: "KettlePass01", password: "KettlePass02"}, annabel)).status, 200);
  assert.strictEqual((await authenticate("Annabel", "KettlePass01")).status, 401);
  assert.strictEqual((await authenticate("Annabel", "KettlePass02")).status, 200);
  me = (await mine("me", undefined, annabel)).data;
  assert.ok(me.history.some(login => login.via === "launcher" && !login.ok) && me.history.some(login => login.via === "game" && login.ok));

  assert.strictEqual((await mine("logout", {}, annabel)).status, 200);
  assert.strictEqual((await mine("me", undefined, annabel)).status, 401);

  // --- deleting one's own account: the password and the name, then it is gone
  const {client: b2} = await arrive("Ben", "KettlePass01");
  const ben = (await mine("login", {username: "Ben", password: "KettlePass01"})).cookie;
  assert.strictEqual((await mine("act", {action: "delete", current: "wrong", confirm: "Ben"}, ben)).status, 400);
  assert.strictEqual((await mine("act", {action: "delete", current: "KettlePass01", confirm: "Annabel"}, ben)).status, 400);
  const gone = await mine("act", {action: "delete", current: "KettlePass01", confirm: "ben"}, ben);
  assert.deepStrictEqual([gone.status, gone.data.deleted, gone.data.account], [200, true, undefined]);
  assert.strictEqual((await mine("me", undefined, ben)).status, 401);
  assert.strictEqual((await authenticate("Ben", "KettlePass01")).status, 401);
  assert.ok(!(await panel("accounts", undefined, admin)).data.accounts.some(account => account.username === "Ben"));
  // the name is held for a while (lib/accounts.js, NAME_HELD_DAYS): the
  // players Ben met still know him by it.
  assert.deepStrictEqual(await (await register("Ben", 5)).json(), {error: "username_taken"});
  b2.socket.destroy();
  a.socket.destroy();
  b.socket.destroy();
};

harness.withServer("account page test", HTTP_PORT, GAME_PORT, run).catch(err => {
  console.error(err);
  process.exit(1);
});
