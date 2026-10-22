"use strict";

// end-to-end check against a real server process: plays the launcher's HTTP
// calls and then two game clients speaking the SWF's socket protocol.

const assert = require("assert");
const crypto = require("crypto");
const harness = require("./harness.js");

const HTTP_PORT = 18080;
const GAME_PORT = 19339;
const BASE = `http://127.0.0.1:${HTTP_PORT}`;

class GameClient extends harness.GameClient {
  constructor() {
    super(GAME_PORT);
  }
}

const {postJson} = harness;

const run = async () => {
  // --- launcher HTTP flow
  const flashVars = await (await fetch(`${BASE}/flashvars`)).json();
  assert.strictEqual(flashVars.smartfoxPort, String(GAME_PORT));
  assert.ok(flashVars.content && flashVars.website && flashVars.blueboxServer && flashVars.blueboxPort);

  // --- registration: the web form's API, and no accounts made by logging in
  assert.match(await (await fetch(`${BASE}/register`)).text(), /Create an account/);
  const registerJson = body => fetch(`${BASE}/api/register`, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({avatarType: 1, agreed: true, ...body})});
  assert.strictEqual((await postJson(`${BASE}/authenticate`, {username: "Alice", password: "KettlePass01"})).status, 401);
  assert.strictEqual((await registerJson({username: "Alice", password: "KettlePass01"})).status, 200);
  assert.deepStrictEqual(await (await registerJson({username: "alice", password: "KettlePass01"})).json(), {error: "username_taken"});
  assert.deepStrictEqual(await (await registerJson({username: "a!", password: "KettlePass01"})).json(), {error: "invalid_username"});
  assert.deepStrictEqual(await (await registerJson({username: "Shorty", password: "pw"})).json(), {error: "invalid_password"});
  // no default animal: whoever signs up picks one of the nine on the page.
  assert.deepStrictEqual(await (await registerJson({username: "Noanimal", password: "KettlePass01", avatarType: undefined})).json(), {error: "choose_animal"});
  assert.deepStrictEqual(await (await registerJson({username: "Noanimal", password: "KettlePass01", avatarType: 2})).json(), {error: "choose_animal"});
  assert.match(await (await fetch(`${BASE}/register`)).text(), /Choose an animal/);
  assert.strictEqual((await fetch(`${BASE}/signup/thumb_wolf.svg`)).headers.get("content-type"), "image/svg+xml");
  assert.strictEqual((await fetch(`${BASE}/signup/..%2Faccount.html`)).status, 404);
  for (const [username, password] of [["Bob", "KettlePass02"], ["Carol", "KettlePass03"], ["foo", "KettlePass04"]]) {
    assert.strictEqual((await registerJson({username, password})).status, 200);
  }

  let res = await postJson(`${BASE}/authenticate`, {username: "Alice", password: "KettlePass01", domain: "flash", df: "x"});
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers.get("access-control-allow-origin"), "null");
  const alice = await res.json();
  assert.strictEqual((await postJson(`${BASE}/authenticate`, {username: "alice", password: "wrong"})).status, 401);
  assert.strictEqual((await postJson(`${BASE}/authenticate`, {username: "constructor", password: "KettlePass01"})).status, 401);
  assert.strictEqual((await postJson(`${BASE}/authenticate`, {refresh_token: alice.refresh_token})).status, 200);
  const bob = await (await postJson(`${BASE}/authenticate`, {username: "Bob", password: "KettlePass02"})).json();

  res = await fetch(`${BASE}/player?domain=flash&client_version=1830`, {headers: {Authorization: `Bearer ${alice.auth_token}`}});
  assert.strictEqual((await res.json()).screen_name, "Alice");
  assert.strictEqual((await fetch(`${BASE}/player`, {headers: {Authorization: "Bearer nope"}})).status, 401);

  assert.match(await (await fetch(`${BASE}/gameClient/game/index.html`)).text(), /flashVarsReady/);
  const swf = Buffer.from(await (await fetch(flashVars.clientURL)).arrayBuffer());
  assert.ok(["CWS", "ZWS", "FWS"].includes(swf.toString("latin1", 0, 3)));
  assert.strictEqual((await fetch(`${BASE}/../../etc/passwd`)).status, 404);
  assert.strictEqual((await fetch(`${BASE}/%2e%2e/%2e%2e/config.js`)).status, 404);

  // --- socket policy request (Flash asks before opening the real connection)
  const policy = new GameClient();
  await policy.connect();
  policy.send("<policy-file-request/>");
  assert.match(await policy.next(), /cross-domain-policy/);

  // --- the client's Create Account screens: guest zone, name check, create
  const guest = new GameClient();
  await guest.connect();
  guest.send("<msg t='sys'><body action='verChk' r='0'><ver v='165' /></body></msg>");
  await guest.next();
  guest.send("<msg t='sys'><body action='rndK' r='-1'></body></msg>");
  const guestKey = /<k>([0-9a-f]+)<\/k>/.exec(await guest.next())[1];
  guest.send("<msg t='sys'><body action='login' r='0'><login z='sbiAccountZone'><nick><![CDATA[]]></nick><pword><![CDATA[]]></pword></login></body></msg>");
  assert.match(await guest.next(), /action='logOK'/);
  guest.xt("la", 1, 0, "Alice", 0, 0, 0, 0, 1830);
  assert.deepStrictEqual((await guest.nextXt("la")).slice(2), ["-3"]);
  guest.xt("la", 1, 0, "Dave", 0, 0, 0, 0, 1830);
  assert.deepStrictEqual((await guest.nextXt("la")).slice(2), ["1"]);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", crypto.createHash("sha256").update(guestKey).digest(), iv);
  const encrypted = Buffer.concat([iv, cipher.update("TulipKettle01"), cipher.final()]).toString("base64");
  guest.xt("lc", 1, "Dave", encrypted, "2000-01-01", 0, "", 15136, 15224, 15299, 4, 0, "US", 1830);
  assert.deepStrictEqual((await guest.nextXt("lc")).slice(2, 3), ["1"]);
  guest.socket.destroy();
  assert.strictEqual((await postJson(`${BASE}/authenticate`, {username: "Dave", password: "TulipKettle01"})).status, 200);

  // --- first player: login and world entry
  const a = new GameClient();
  await a.connect();
  const bad = new GameClient();
  await bad.connect();
  assert.strictEqual((await bad.logIn("Alice", "bogus")).status, "0");
  bad.socket.destroy();

  const login = await a.logIn("Alice", alice.auth_token);
  assert.strictEqual(login._cmd, "login");
  assert.strictEqual(login.status, "1");
  assert.strictEqual(login.params.userName, "Alice");
  assert.strictEqual(login.params.gemsCount, 10000000);
  assert.strictEqual(login.params.pendingFlags & 1, 1);
  const aliceId = login.params.userId;

  a.xt("al", 1, "Alice");
  const al = await a.nextXt("al");
  assert.deepStrictEqual(al.slice(2, 4), ["Alice", "4294967295"]);
  assert.strictEqual(al[5], "1");

  a.xt("gl", 1, 64);
  const gl = await a.nextXt("gl");
  assert.deepStrictEqual(gl.slice(2, 4), ["64", "1003"]);
  assert.strictEqual(Number(gl[8]), gl.length - 9);

  a.xt("rj", 1, "jamaa_township.room_main#-1", 1, 0, 0);
  const rj = await a.nextXt("rj");
  assert.deepStrictEqual(rj.slice(2, 4), ["1", "jamaa_township.room_main#1"]);
  // the name for the corner of the screen, and 0 for "no string id in its place".
  assert.deepStrictEqual(rj.slice(14, 16), ["Jamaa Township", "0"]);
  const roomId = rj[4];
  const rp = await a.nextXt("rp");
  assert.deepStrictEqual(rp.slice(1, 4), [roomId, "jamaa_township.room_main", "0"]);

  a.xt("ad", roomId, "Alice", 1, 1);
  const ad = await a.nextXt("ad");
  assert.strictEqual(ad[2], "Alice");
  assert.strictEqual(ad.length, 2 + 15 + 8);
  assert.deepStrictEqual((await a.nextXt("il")).slice(2, 6), ["0", "0", "1", "Alice"]);
  a.xt("au", roomId, 1, 500, 400, 14, 1);

  a.xt("rj", roomId, "no_such.room#1", 1, 0, 0);
  assert.strictEqual((await a.nextXt("rj"))[2], "0");

  // --- second player sees the first, and vice versa
  const b = new GameClient();
  await b.connect();
  const bobId = (await b.logIn("Bob", bob.auth_token)).params.userId;
  b.xt("rj", 1, "jamaa_township.room_main#1", 1, 0, 0);
  assert.strictEqual((await b.nextXt("rj"))[4], roomId);
  await b.nextXt("rp");
  const ac = await b.nextXt("ac");
  assert.deepStrictEqual(ac.slice(1, 7), [roomId, String(aliceId), "500", "400", "14", "Alice"]);
  await b.nextXt("il");

  b.xt("au", roomId, 1, 100, 200, 14, 1);
  assert.deepStrictEqual((await a.nextXt("ac")).slice(2, 5), [String(bobId), "100", "200"]);
  await a.nextXt("il");

  b.xt("au", roomId, 2, 110, 210, 120, 220, 14, 0);
  assert.deepStrictEqual((await a.nextXt("au")).slice(2), ["1", String(bobId), "2", "110", "210", "120", "220", "0"]);
  b.xt("au", roomId, 999, 1, 1, 14, 0); // malformed: ignored

  b.send(`<msg t='sys'><body action='pubMsg' r='${roomId}'><txt><![CDATA[hi &amp; bye%0]]></txt></body></msg>`);
  assert.deepStrictEqual((await a.nextXt("uc")).slice(1), [roomId, String(bobId), "hi & bye", "0"]);
  assert.deepStrictEqual((await b.nextXt("uc")).slice(1), [roomId, String(bobId), "hi & bye", "0"]);
  b.send(`<msg t='sys'><body action='pubMsg' r='${roomId}'><txt><![CDATA[7%2]]></txt></body></msg>`); // emote: not echoed
  assert.deepStrictEqual((await a.nextXt("uc")).slice(3), ["7", "2"]);

  // A saved bubble style is acknowledged with every customization field and
  // travels with the next public line so every patched client renders it.
  const chatStyle = ["112233", "445566", "ffffff", "abcdef", "85", "flow", "150", "radial", "225", "75", "2", "112233:0;ff0069:45;445566:100"];
  b.xt("xcs", roomId, ...chatStyle);
  assert.deepStrictEqual((await b.nextXt("xcs")).slice(2), chatStyle);
  b.send(`<msg t='sys'><body action='pubMsg' r='${roomId}'><txt><![CDATA[styled%0]]></txt></body></msg>`);
  const styledPacket = [roomId, String(bobId), "styled", "0", "", chatStyle.join(",")];
  assert.deepStrictEqual((await a.nextXt("uc")).slice(1), styledPacket);
  assert.deepStrictEqual((await b.nextXt("uc")).slice(1), styledPacket);

  // Actions are sent to every other player in the room. The sender has
  // already applied the action locally, so it is not echoed back to them.
  b.send(`<msg t='sys'><body action='pubMsg' r='${roomId}'><txt><![CDATA[:sitS:%3%m1]]></txt></body></msg>`);
  assert.deepStrictEqual((await a.nextXt("uc")).slice(3), [":sitS:", "3", "m1"]);

  // --- player cards
  a.xt("ag", roomId, "bob", 1);
  const card = await a.nextXt("ag");
  assert.deepStrictEqual([card[2], card[4], card[21]], ["Bob", "1", String(bobId)]);
  a.xt("ags", roomId, bobId, 0);
  assert.strictEqual((await a.nextXt("ag"))[2], "Bob");
  a.xt("ag", roomId, "nobody", 1);
  assert.deepStrictEqual((await a.nextXt("ag")).slice(2), ["nobody", "", "3"]);
  a.xt("sphp", roomId, "x");
  assert.deepStrictEqual((await a.nextXt("sphp")).slice(2), ["-1"]);

  // --- buddies: request, accept, list, location, block, remove
  b.xt("ba", roomId, "alice");
  assert.deepStrictEqual((await a.nextXt("ba")).slice(2), ["0", "Bob", "1"]);
  assert.deepStrictEqual((await b.nextXt("ba")).slice(2), ["1", "Alice", "1"]);
  a.xt("bc", roomId, "Bob", 1);
  const aliceSees = await a.nextXt("bs");
  assert.deepStrictEqual([aliceSees[3], aliceSees[6], aliceSees[8]], ["Bob", "1", "0"]);
  const bobSees = await b.nextXt("bs");
  assert.deepStrictEqual([bobSees[3], bobSees[6], bobSees[8]], ["Alice", "1", "1"]); // 1 = accepted your request
  a.xt("bl", roomId);
  assert.deepStrictEqual((await a.nextXt("bl")).slice(2, 5).concat((await a.nextXt("bl")).slice(2)), ["0", "1", "Bob", "1", "0"]);
  assert.deepStrictEqual((await a.nextXt("xls")).slice(2), ["0"]); // when offline buddies were last seen: none are offline
  a.xt("br", roomId, "Bob");
  assert.deepStrictEqual((await a.nextXt("br")).slice(2), ["jamaa_township.room_main#1", "Jamaa Township", "0", "0"]); // last 0: "go to" allowed
  a.xt("bb", roomId, "Bob");
  assert.deepStrictEqual((await a.nextXt("bb")).slice(2), ["Bob", "1"]);
  b.xt("bi", roomId, "Alice");
  assert.deepStrictEqual((await b.nextXt("bi")).slice(2), ["Alice", "1"]);
  a.xt("bu", roomId, "Bob");
  assert.deepStrictEqual((await a.nextXt("bu")).slice(2), ["Bob", "1"]);
  a.xt("bd", roomId, "Bob");
  assert.deepStrictEqual((await a.nextXt("bd")).slice(2), ["Bob"]);
  assert.deepStrictEqual((await b.nextXt("bd")).slice(2), ["Alice"]);

  b.socket.destroy();
  assert.deepStrictEqual((await a.nextXt("ar")).slice(1), [roomId, String(bobId)]);

  // --- lists, user vars and the den
  a.xt("gl", roomId, 741);
  assert.deepStrictEqual((await a.nextXt("gl")).slice(2, 4), ["741", "1000"]);
  a.xt("zs", roomId, 66, 1, 1);
  // var 66 at 1 is what the "Welcome to the Club" achievement (def 134) asks for.
  const clubVar = await a.nextXt("zs");
  assert.deepStrictEqual([...clubVar.slice(2, 5), clubVar[6]], ["66", "1", "1", "134"]);
  a.xt("za", roomId, "Alice", -1);
  const aliceAchievements = await a.nextXt("za");
  assert.strictEqual(aliceAchievements[2], "Alice");
  // 134, and "Buddy Added" (def 90) from making friends with Bob above.
  assert.deepStrictEqual(aliceAchievements.slice(4).filter((_, i) => i % 2 === 1).sort(), ["134", "90"]);
  // A counter the server keeps is not the client's to set.
  a.xt("zs", roomId, 1, 999999, 1);
  assert.deepStrictEqual((await a.nextXt("zs")).slice(2), ["1", "0", "0"]);
  a.xt("gl", roomId, 627);
  const pushedVars = await a.nextXt("zg");
  // 129 and 379: every tutorial marked as seen. 214: the daily wheel never due.
  const varsById = {};
  for (let i = 3; i < pushedVars.length; i += 3) {
    varsById[pushedVars[i]] = pushedVars[i + 2];
  }
  assert.strictEqual(Number(pushedVars[2]), Object.keys(varsById).length);
  // 40: buddies added, counted by the server. 9001: "hide blocked players", off.
  assert.deepStrictEqual([varsById[66], varsById[129], varsById[214], varsById[379], varsById[40], varsById[9001]], ["1", "65535", "65535", "65535", "1", "0"]);
  assert.strictEqual((await a.nextXt("gl"))[2], "627");
  a.xt("dl", roomId);
  assert.deepStrictEqual((await a.nextXt("dl")).slice(2), ["1", "0", "1"]);
  a.xt("dj", roomId, "denNobody", 1, -1);
  assert.strictEqual((await a.nextXt("rj"))[2], "0");
  a.xt("dj", roomId, "denalice", 1, -1);
  const denJoin = await a.nextXt("rj");
  assert.deepStrictEqual([denJoin[2], denJoin[3], denJoin[14], denJoin[15]], ["1", "denAlice", "Alice's Den", "0"]);
  assert.match((await a.nextXt("rp"))[2], /^player_den\./);
  assert.deepStrictEqual((await a.nextXt("ds")).slice(2), ["0", "0", "1"]);

  // --- shops, clothing, animals and pets (Carol watches from the same den)
  const carol = await (await postJson(`${BASE}/authenticate`, {username: "Carol", password: "KettlePass03"})).json();
  const c = new GameClient();
  await c.connect();
  await c.logIn("Carol", carol.auth_token);
  c.xt("dj", 1, "denAlice", 1, -1);
  const denId = (await c.nextXt("rj"))[4];
  await c.nextXt("rp");
  await c.nextXt("ds");
  a.xt("au", denId, 1, 300, 300, 14, 1);
  c.xt("au", denId, 1, 310, 310, 14, 1);
  await a.nextXt("ac");
  await a.nextXt("il");
  await c.nextXt("ac");
  await c.nextXt("il");

  a.xt("gl", denId, 200);
  const names = await a.nextXt("gl");
  assert.deepStrictEqual(names.slice(3, 4).concat(names.slice(8, 10)), ["1023", "88", "15136"]);

  // the den shop inside a den is a "combined" list: kinds, counts, entries.
  a.xt("gl", denId, 384);
  const denRoomShop = await a.nextXt("gl");
  assert.deepStrictEqual(denRoomShop.slice(3, 5).concat(denRoomShop[9]), ["1060", "", "1040"]);
  assert.ok(Number(denRoomShop[8]) > 50 && denRoomShop[8] === denRoomShop[10] && Number(denRoomShop[10]) === denRoomShop.length - 11);

  a.xt("gl", denId, 5);
  const shop = await a.nextXt("gl");
  assert.strictEqual(shop[3], "1000");
  assert.ok(Number(shop[8]) > 5 && Number(shop[8]) < 200 && Number(shop[8]) === shop.length - 9);
  const itemDef = shop[9];

  a.xt("ib", denId, 5, 1, itemDef, 0, 0, -1, "");
  const added = await a.nextXt("il");
  assert.deepStrictEqual(added.slice(2, 6).concat(added.slice(7)), ["2", "0", "1", "Alice", "1", "0", added[9], itemDef]);
  const itemInv = added[9];
  const bought = await a.nextXt("ib");
  assert.deepStrictEqual(bought.slice(2, 4), ["1", "5"]);
  assert.ok(Number(bought[4]) <= 10000000);
  a.xt("ib", denId, 5, 1, 1, 0, 0, -1, ""); // a body part, not clothing
  assert.strictEqual((await a.nextXt("ib"))[2], "0");

  a.xt("iu", denId, 1, 0, itemInv);
  assert.strictEqual((await a.nextXt("iu"))[2], "1");
  // her own game redraws her animal from this, not from the reply.
  assert.deepStrictEqual((await a.nextXt("il")).slice(2), ["3", "1", "1", "Alice", "0", "1", "0", itemInv, itemDef]);
  const worn = await c.nextXt("il");
  assert.deepStrictEqual(worn.slice(2, 6).concat(worn.slice(8, 11)), ["1", "0", "1", "Alice", "1", itemDef, itemInv]);
  a.xt("il", denId, "Alice", 1, 1);
  const full = await a.nextXt("il");
  assert.deepStrictEqual(full.slice(8), ["1", itemDef, itemInv, full[11], "2", "0"]); // "2" = bit 1 = avInvId 1

  // --- trade list: put the item up, see it, a trade request is declined
  a.xt("ts", denId, 0, 1, 0, itemInv);
  assert.deepStrictEqual((await a.nextXt("tl")).slice(2, 7), ["Alice", "1", itemDef, itemInv, full[11]]);
  c.xt("tl", denId, "alice");
  assert.deepStrictEqual((await c.untilXt("tl")).slice(2, 5), ["Alice", "1", itemDef]);

  // --- a trade: Carol offers an item of hers for Alice's listed one
  c.xt("ib", denId, 5, 1, shop[10], 0, 0, -1, "");
  const carolItemInv = (await c.untilXt("il"))[9];
  await c.nextXt("ib");
  c.xt("ti", denId, 0, "Alice", 0, 999999, 1, 0, 0, 0, carolItemInv); // not an item Alice has
  assert.deepStrictEqual((await c.nextXt("ti")).slice(2), ["3", "Alice", "1"]);
  c.xt("ti", denId, 0, "Alice", 0, itemInv, 1, 0, 0, 0, carolItemInv);
  const request = await a.nextXt("ti");
  assert.deepStrictEqual(request.slice(2, 10), ["0", "Carol", "1", request[5], itemInv, "1", "0", "0"]);
  assert.strictEqual(request[10], shop[10]);
  a.xt("ti", denId, 1, 0); // declined
  assert.deepStrictEqual((await c.nextXt("ti")).slice(2), ["2", "Alice", "1"]);
  c.xt("ti", denId, 0, "Alice", 0, itemInv, 1, 0, 0, 0, carolItemInv);
  await a.nextXt("ti");
  a.xt("ti", denId, 1, 1); // accepted
  assert.deepStrictEqual((await a.nextXt("ti")).slice(2), ["1", "0"]);
  assert.deepStrictEqual((await c.nextXt("ti")).slice(2), ["1", "0"]);
  a.xt("ti", denId, 3, 1);
  c.xt("ti", denId, 3, 1);
  const carolGot = await c.nextXt("ti");
  assert.deepStrictEqual(carolGot.slice(2, 7).concat(carolGot.slice(9)), ["1", "1", "1", "0", itemDef, "1", "0", carolItemInv]);
  const aliceGot = await a.nextXt("ti");
  assert.deepStrictEqual(aliceGot.slice(2, 7).concat(aliceGot.slice(9)), ["1", "1", "1", "0", shop[10], "1", "0", itemInv]);
  a.xt("tl", denId, "Alice");
  assert.deepStrictEqual((await a.nextXt("tl")).slice(2, 4), ["Alice", "0"]); // the traded item left the list
  const tradedInv = aliceGot[7];

  a.xt("ap", denId, 1, 2, 3, 0);
  assert.strictEqual((await a.nextXt("ap"))[2], "1");
  await c.nextXt("ar");
  assert.deepStrictEqual((await c.nextXt("ac")).slice(12, 15), ["1", "2", "3"]);
  await c.nextXt("il");

  a.xt("aa", denId, 15136, 15224, 15299, 4, -1, 0, 0);
  const aa = await a.nextXt("aa");
  assert.strictEqual(aa[2], "1");
  a.xt("as", denId, aa[3]);
  const switched = await a.nextXt("as");
  assert.deepStrictEqual(switched.slice(2, 4).concat(switched.slice(4, 8)), ["1", String(aliceId), aa[3], aa[4], "-1", "4"]);
  assert.strictEqual(switched[11], "15136|15224|15299");
  assert.strictEqual((await c.nextXt("as")).length, switched.length + 7);
  // The switch is followed by the animal's data and its full item list, so
  // that the editor can open on the new animal (lib/avatars.js "as").
  assert.strictEqual((await a.nextXt("ad"))[2], "Alice");
  assert.strictEqual((await a.nextXt("il"))[2], "0");
  a.xt("al", denId, "Alice");
  assert.deepStrictEqual((await a.nextXt("al")).slice(5, 7), ["2", aa[3]]);
  a.xt("ak", denId, aa[3]); // cannot remove the animal in use
  const notRemoved = await a.nextXt("ak");
  assert.strictEqual(notRemoved[2], "0");
  // the second field is the gems the animal switcher then shows: the total
  assert.ok(Number(notRemoved[3]) > 0, `gems after "ak": ${notRemoved[3]}`);

  a.xt("gl", denId, 312);
  const petShop = await a.nextXt("gl");
  assert.strictEqual(petShop[3], "1046");
  assert.strictEqual(Number(petShop[8]) * 2, petShop.length - 9);
  a.xt("gl", denId, 574);
  assert.strictEqual((await a.nextXt("gl"))[8], "0");
  a.xt("pc", denId, 312, petShop[9], 0, 0, 15386, 15428, 0);
  const pet = await a.nextXt("pc");
  assert.deepStrictEqual(pet.slice(2, 3).concat(pet.slice(6, 10)), ["1", petShop[9], "0", "0", "15386|15428"]);
  a.xt("ps", denId, pet[5]);
  assert.deepStrictEqual((await a.nextXt("ps")).slice(2), ["1", String(aliceId), pet[5]]);
  assert.deepStrictEqual((await c.nextXt("ps")).slice(2, 8), ["1", String(aliceId), petShop[9], "0", "0", "15386|15428"]);
  a.xt("pl", denId, "Alice");
  assert.deepStrictEqual((await a.nextXt("pl")).slice(2, 6), ["1", "Alice", "1", pet[5]]);
  assert.match((await a.nextXt("pu"))[2], /^4294967295(,4294967295)*$/);

  // --- den items: buy, place (Carol sees it), recycle
  a.xt("gl", denId, 9);
  const denShop = await a.nextXt("gl");
  assert.strictEqual(denShop[3], "1030");
  assert.ok(Number(denShop[8]) > 5 && Number(denShop[8]) < 200); // the Mystery Emporium's shelf (lib/shopstock.js)
  a.xt("db", denId, 0, 9, denShop[9], 0, 0, 0, 0, "");
  assert.deepStrictEqual((await a.nextXt("db")).slice(2, 3), ["1"]);
  const denItems = await a.nextXt("di");
  assert.deepStrictEqual(denItems.slice(2, 5).concat(denItems.slice(6, 8)), ["0", "1", "0", denShop[9], "0"]);
  const denInv = denItems[5];
  a.xt("ds", denId, 1, 0, denInv, 1, 250, 260, 1, "off", 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
  assert.deepStrictEqual((await a.nextXt("dss")).slice(2), [denInv]);
  assert.deepStrictEqual((await c.nextXt("ds")).slice(2, 12), ["1", "0", "0", denInv, denShop[9], "1", "250", "260", "0", "1"]);
  a.xt("dp", denId, 1, "Carol");
  assert.deepStrictEqual((await a.nextXt("dp")).slice(2), ["Carol", "2"]); // 2 = open to everyone

  // --- den rooms: buy a second den and switch to it (the visitor follows); lock the den
  a.xt("gl", denId, 13);
  const denRooms = await a.nextXt("gl");
  assert.strictEqual(denRooms[3], "1040");
  const newDenDef = denRooms.slice(9).find(id => id !== "1");
  a.xt("db", denId, -1, 13, newDenDef, 0, 0);
  assert.deepStrictEqual((await a.nextXt("db")).slice(2, 3), ["1"]);
  const denList = await a.nextXt("dl");
  assert.deepStrictEqual([denList[2], denList[3], denList[4], denList[6]], ["2", "0", "1", newDenDef]);
  a.xt("dc", denId, denList[5]);
  assert.deepStrictEqual((await a.nextXt("dc")).slice(2, 3), [newDenDef]);
  const moved = await c.nextXt("rp");
  assert.deepStrictEqual([moved[4], moved[5]], ["2", newDenDef]); // room type 2 = den, then the den type
  assert.deepStrictEqual((await c.nextXt("ds")).slice(2, 3), ["0"]); // the furniture stayed in the first den
  // the owner is also sent the den's items ("di") on a switch
  assert.deepStrictEqual((await a.untilXt("ds")).slice(2, 3), ["0"]);
  a.xt("dc", denId, 0);
  await a.nextXt("dc");
  await c.nextXt("rp");
  assert.deepStrictEqual((await c.nextXt("ds")).slice(2, 3), ["1"]);
  await a.untilXt("ds");
  a.xt("dp", denId, 0, 0);
  {
    const stranger = new GameClient();
    await stranger.connect();
    await stranger.logIn("Dave", (await (await postJson(`${BASE}/authenticate`, {username: "Dave", password: "TulipKettle01"})).json()).auth_token);
    stranger.xt("dj", 1, "denAlice", 1, -1);
    assert.strictEqual((await stranger.nextXt("rj"))[2], "0");
    stranger.socket.destroy();
  }
  a.xt("dp", denId, 0, 2);
  a.xt("dr", denId, 0, denInv);
  assert.deepStrictEqual((await a.nextXt("dr")).slice(2, 3).concat((await c.nextXt("ds")).slice(2, 3)), ["1", "0"]);
  await a.nextXt("di"); // what the recycling window waits for

  a.xt("ir", denId, tradedInv);
  const recycled = await a.nextXt("ir");
  assert.deepStrictEqual([recycled[2], recycled[4]], ["1", tradedInv]);
  // the recycling window waits for the list to change before it closes.
  const gone = await a.nextXt("il");
  assert.deepStrictEqual([gone[2], gone[5], ...gone.slice(7)], ["2", "Alice", "0", "1", tradedInv]);

  // --- item finder: search by name and id, give to a connected player
  assert.match(await (await fetch(`${BASE}/shop`)).text(), /Item giver/);
  const found = await (await fetch(`${BASE}/api/search?q=top+hat&kind=clothing`)).json();
  assert.ok(found.total > 0 && found.results.every(item => /top/i.test(item.name) && /hat/i.test(item.name)));
  const hat = found.results[0];
  assert.strictEqual((await (await fetch(`${BASE}/api/search?q=${hat.id}`)).json()).results[0].id, hat.id);
  assert.ok((await (await fetch(`${BASE}/api/accounts`)).json()).some(entry => entry.username === "Alice" && entry.online));
  assert.strictEqual((await fetch(`${BASE}/api/accounts`, {headers: {Origin: "https://example.com"}})).status, 403);
  const giveJson = body => fetch(`${BASE}/api/give`, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)});
  assert.strictEqual((await giveJson({username: "Alice", kind: "clothing", id: hat.id, colorIndex: 0})).status, 200);
  const pushed = await a.nextXt("il");
  assert.deepStrictEqual([pushed[2], pushed[10]], ["2", String(hat.id)]);
  // a colour id written signed is the same colour, kept unsigned (lib/admin.js)
  assert.strictEqual((await giveJson({username: "Alice", kind: "clothing", id: hat.id, color: "-16777216"})).status, 200);
  assert.strictEqual((await a.nextXt("il"))[6], "4278190080");
  assert.strictEqual((await giveJson({username: "Alice", kind: "clothing", id: hat.id, color: "-99999999999"})).status, 400);
  assert.strictEqual((await giveJson({username: "Alice", kind: "clothing", id: 1})).status, 400);
  assert.strictEqual((await giveJson({username: "Nobody", kind: "den", id: 6})).status, 404);
  assert.strictEqual((await giveJson({username: "Alice", kind: "den", id: 6})).status, 200);
  assert.deepStrictEqual((await a.nextXt("di")).slice(3, 4), ["1"]);

  // --- no game account has admin powers: "foo" is an ordinary player now
  const foo = await (await postJson(`${BASE}/authenticate`, {username: "foo", password: "KettlePass04"})).json();
  const f = new GameClient();
  await f.connect();
  const fooLogin = await f.logIn("foo", foo.auth_token);
  assert.strictEqual(fooLogin.params.accountType, 2);
  f.xt("rj", 1, "jamaa_township.room_main#1", 1, 0, 0);
  const fooRoom = (await f.nextXt("rj"))[4];
  await f.nextXt("rp");
  f.send(`<msg t='sys'><body action='pubMsg' r='${fooRoom}'><txt><![CDATA[!gems alice 5%0]]></txt></body></msg>`);
  assert.deepStrictEqual((await f.nextXt("uc")).slice(3), ["!gems alice 5", "0"]); // just chat
  f.xt("fb", fooRoom, "Carol", 7200, 0, "");
  assert.deepStrictEqual((await f.nextXt("fb")).slice(2), ["0"]);
  f.xt("fk", fooRoom, "Alice", "");
  assert.deepStrictEqual((await f.nextXt("fk")).slice(2), ["0"]);

  // --- the admin panel: first-time password, then everything behind it
  const panel = async (pathname, body, cookie, headers = {}) => {
    const response = await fetch(`${BASE}/admin/api/${pathname}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {"Content-Type": "application/json", ...(cookie ? {Cookie: cookie} : {}), ...headers},
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {status: response.status, data: await response.json(), cookie: (response.headers.get("set-cookie") || "").split(";")[0]};
  };
  const oldAdmin = await fetch(`${BASE}/admin`, {redirect: "manual"});
  assert.strictEqual(oldAdmin.status, 302);
  assert.strictEqual(oldAdmin.headers.get("location"), "/dashboard/admin");
  const oldMod = await fetch(`${BASE}/mod`, {redirect: "manual"});
  assert.strictEqual(oldMod.status, 302);
  assert.strictEqual(oldMod.headers.get("location"), "/dashboard/staff");
  assert.match(await (await fetch(`${BASE}/dashboard`)).text(), /Burrow dashboard/);
  const dashboardSlash = await fetch(`${BASE}/dashboard/`, {redirect: "manual"});
  assert.strictEqual(dashboardSlash.status, 302);
  assert.strictEqual(dashboardSlash.headers.get("location"), "/dashboard");
  assert.match(await (await fetch(`${BASE}/dashboard/admin`)).text(), /Server admin/);
  assert.match(await (await fetch(`${BASE}/dashboard/staff`)).text(), /Moderators/);
  assert.deepStrictEqual((await panel("state")).data, {needsSetup: true, needsSetupCode: false, signedIn: false, discordLogin: false});
  assert.strictEqual((await panel("overview")).status, 401);
  assert.strictEqual((await panel("login", {password: "anything"})).status, 401);
  assert.strictEqual((await panel("setup", {password: "short"})).status, 400);
  const setup = await panel("setup", {password: "admin-password-1"});
  assert.strictEqual(setup.status, 200);
  assert.match(setup.cookie, /^ajc_admin=[0-9a-f]{48}$/);
  assert.strictEqual((await panel("setup", {password: "another-password"})).status, 409); // only once
  assert.strictEqual((await panel("login", {password: "wrong-password"})).status, 401);
  const admin = (await panel("login", {password: "admin-password-1"})).cookie;
  assert.strictEqual((await panel("state", undefined, admin)).data.signedIn, true);
  assert.strictEqual((await panel("account", {username: "Alice", action: "kick"}, admin, {Origin: "http://evil.example"})).status, 403);

  const seen = (await panel("overview", undefined, admin)).data;
  assert.ok(seen.stats.online >= 3 && seen.stats.accounts >= 5 && seen.players.some(player => player.username === "foo"));
  const listed = (await panel("accounts", undefined, admin)).data.accounts;
  assert.strictEqual(listed.find(account => account.username === "Alice").online, true);
  assert.ok((await panel("logs?filter=%5Badmin%5D", undefined, admin)).data.lines.some(line => line.text.includes("admin password chosen")));

  assert.strictEqual((await panel("account", {username: "Nobody", action: "kick"}, admin)).status, 404);
  assert.strictEqual((await panel("account", {username: "Alice", action: "gems", amount: -5}, admin)).status, 200);
  assert.deepStrictEqual((await a.untilXt("cu")).slice(2, 3), ["0"]);
  assert.strictEqual((await panel("account", {username: "Alice", action: "message", text: "hello from the panel"}, admin)).status, 200);

  assert.deepStrictEqual((await a.untilXt("fd")).slice(2, 4), ["fp", "hello from the panel"]);

  // --- last seen: a card carries the time its player left, -2 while they
  // are online, and the panel can set it for testing
  const cardOf = async name => {
    a.xt("ag", denId, name, 0);
    return Number((await a.untilXt("ag"))[7]);
  };
  assert.strictEqual(await cardOf("Alice"), -2);
  assert.ok(Math.abs(await cardOf("Dave") - Date.now() / 1000) < 600); // he left moments ago
  const threeDaysAgo = Math.floor(Date.now() / 1000) - 3 * 86400;
  assert.strictEqual((await panel("account", {username: "Dave", action: "lastSeen", when: threeDaysAgo}, admin)).status, 200);
  assert.strictEqual(await cardOf("Dave"), threeDaysAgo);
  assert.strictEqual((await panel("account", {username: "Dave", action: "lastSeen", when: threeDaysAgo + 30 * 86400}, admin)).status, 400); // not the future

  assert.strictEqual((await panel("account", {username: "Carol", action: "ban", hours: 2}, admin)).status, 200);
  assert.deepStrictEqual((await c.untilXt("fd")).slice(2), ["fb", "1", "7200"]);
  // A player card asks whether its player is banned, for its red label.
  a.xt("xbn", denId, "carol");
  const banned = await a.untilXt("xbn");
  assert.ok(banned[2] === "Carol" && Number(banned[3]) > 7190 && Number(banned[3]) <= 7200);
  a.xt("xbn", denId, "Alice");
  const notBanned = await a.untilXt("xbn");
  assert.deepStrictEqual(notBanned.slice(2, 4), ["Alice", "0"]);
  assert.ok(Number(notBanned[4]) > 1700000000); // and when she joined
  assert.deepStrictEqual(notBanned.slice(5), ["", "early|Early Member", ""]); // no Discord username; the badge of the first hundred accounts; no bio (lib/badges.js)
  assert.strictEqual((await fetch(`${BASE}/ban-icon.png`)).headers.get("content-type"), "image/png");
  const carolAgain = new GameClient();
  await carolAgain.connect();
  const refused = await carolAgain.logIn("Carol", carol.auth_token);
  assert.deepStrictEqual([refused.status, refused.statusId], ["0", -15]);
  carolAgain.socket.destroy();
  assert.ok((await panel("accounts", undefined, admin)).data.accounts.find(account => account.username === "Carol").banned > 7000);

  // A new username: buddies follow it, the player is disconnected, and the
  // same password works under the new name.
  assert.deepStrictEqual((await panel("account", {username: "Bob", action: "rename", newName: "alice"}, admin)).data, {error: "That username is taken."});
  for (const unusable of ["", "   ", "50% off", "tab\there", "x".repeat(101)]) {
    assert.strictEqual((await panel("account", {username: "Bob", action: "rename", newName: unusable}, admin)).status, 400);
  }
  // names sign-up would refuse are fine from the panel, and can log in.
  for (const odd of ["x", "~*Bob*~ <3", "Ünïcødé 名前", "a name well past twenty characters"]) {
    assert.strictEqual((await panel("account", {username: "Bob", action: "rename", newName: odd}, admin)).status, 200);
    assert.strictEqual((await postJson(`${BASE}/authenticate`, {username: odd, password: "KettlePass02"})).status, 200);
    assert.strictEqual((await panel("account", {username: odd, action: "rename", newName: "Bob"}, admin)).status, 200);
  }
  assert.strictEqual((await registerJson({username: "x", password: "KettlePass09"})).status, 400); // sign-up rules unchanged
  const renamed = await panel("account", {username: "Bob", action: "rename", newName: "Robert"}, admin);
  assert.deepStrictEqual([renamed.status, renamed.data.username], [200, "Robert"]);
  assert.strictEqual((await postJson(`${BASE}/authenticate`, {username: "Bob", password: "KettlePass02"})).status, 401);
  assert.strictEqual((await postJson(`${BASE}/authenticate`, {username: "robert", password: "KettlePass02"})).status, 200);
  assert.ok(!(await panel("accounts", undefined, admin)).data.accounts.some(account => account.username === "Bob"));
  assert.strictEqual((await panel("account", {username: "Robert", action: "rename", newName: "ROBERT"}, admin)).status, 200);
  assert.strictEqual((await panel("account", {username: "robert", action: "rename", newName: "Bob"}, admin)).status, 200);

  // Staff cannot take over an account by setting its password; recovery is
  // email-only from the account recovery page.
  assert.strictEqual((await panel("account", {username: "foo", action: "password", password: "short"}, admin)).status, 400);
  assert.strictEqual((await panel("account", {username: "foo", action: "password", password: "New-password-4"}, admin)).status, 400);
  assert.strictEqual((await postJson(`${BASE}/authenticate`, {username: "foo", password: "KettlePass04"})).status, 200);
  assert.strictEqual((await postJson(`${BASE}/authenticate`, {refresh_token: foo.refresh_token})).status, 200);
  assert.strictEqual((await panel("account", {username: "foo", action: "delete"}, admin)).status, 200);
  assert.strictEqual((await postJson(`${BASE}/authenticate`, {username: "foo", password: "KettlePass04"})).status, 401);

  // changing the admin password signs every other session out.
  assert.strictEqual((await panel("password", {current: "nope", password: "admin-password-2"}, admin)).status, 403);
  const changed = await panel("password", {current: "admin-password-1", password: "admin-password-2"}, admin);
  assert.strictEqual(changed.status, 200);
  assert.strictEqual((await panel("overview", undefined, admin)).status, 401);
  assert.strictEqual((await panel("overview", undefined, changed.cookie)).status, 200);
  assert.strictEqual((await panel("logout", {}, changed.cookie)).status, 200);
  assert.strictEqual((await panel("overview", undefined, changed.cookie)).status, 401);

  // --- diamonds
  // Items priced in diamonds are bought by their diamond def id: 76 is a
  // clothing item, 3457 a den item and 3436 a den room.
  a.xt("gl", denId, 415); // the Diamond Shop's clothing
  const diamondShop = await a.untilXt("gl");
  assert.deepStrictEqual(diamondShop.slice(3, 5), ["1054", ""]);
  assert.ok(Number(diamondShop[8]) > 20 && Number(diamondShop[8]) === diamondShop.length - 9);
  a.xt("gl", denId, 293);
  assert.deepStrictEqual((await a.untilXt("gl")).slice(3, 9), ["1054", "", "0", "0", "0", "0"]);
  // A shop nothing is known of has empty shelves, whatever its kind.
  for (const [unknownShop, kind] of [[390, "1030"], [338, "1000"], [796, "1054"]]) {
    a.xt("gl", denId, unknownShop);
    assert.deepStrictEqual((await a.untilXt("gl")).slice(3, 9), [kind, "", "0", "0", "0", "0"]);
  }
  a.xt("gl", denId, 794);
  assert.deepStrictEqual((await a.untilXt("gl")).slice(8), ["1", "1030", "0"]);
  a.xt("ib", denId, 11, 1, 76, 0, 1, -1, "");
  assert.strictEqual((await a.untilXt("il"))[10], "584");
  assert.deepStrictEqual((await a.untilXt("ib")).slice(2), ["1", "11", "9999999", "3"]);
  a.xt("db", denId, 0, 234, 3457, 0, 1, 0, 0, "");
  assert.deepStrictEqual((await a.untilXt("db")).slice(2), ["1", "9999998", "0", "3", "0"]);
  assert.ok((await a.untilXt("di")).includes("5755"));
  a.xt("db", denId, -1, 384, 3436, 1, 1);
  assert.deepStrictEqual((await a.untilXt("db")).slice(2), ["1", "9999991", "0", "3", "0"]);
  assert.strictEqual((await a.untilXt("dl")).at(-1), "58");
  a.xt("ib", denId, 11, 1, 3436, 0, 1, -1, ""); // a den room's diamond def is not clothing
  assert.strictEqual((await a.untilXt("ib"))[2], "0");

  // --- tutorials stay switched off, seasonal themes, custom colour ids
  a.xt("zs", denId, 379, 2, 1); // the client names the bit it wants set
  assert.deepStrictEqual((await a.untilXt("zs")).slice(2), ["379", "65535", "0"]);
  a.xt("rj", denId, "sarepia.room_main#1", 1, 0, 0);
  await a.untilXt("rj");
  assert.strictEqual((await a.untilXt("rp"))[2], "sarepia.room_main");
  const themeJson = theme => fetch(`${BASE}/api/theme`, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({username: "Alice", theme})});
  assert.strictEqual((await themeJson("easter")).status, 400);
  assert.strictEqual((await themeJson("jamaalidays")).status, 200);
  // reloaded where she stands, from the December build's files.
  assert.strictEqual((await a.untilXt("rp"))[2], "theme_1810.sarepia.room_main");
  // an older design is a build too, or another room file of one.
  assert.strictEqual((await themeJson("fall2022")).status, 200);
  assert.strictEqual((await a.untilXt("rp"))[2], "theme_1636.sarepia.room_main");
  assert.strictEqual((await themeJson("freedom2021")).status, 200);
  assert.strictEqual((await a.untilXt("rp"))[2], "theme_1824.sarepia.room_main_freedom");
  assert.strictEqual((await themeJson("friendship2018")).status, 200);
  assert.strictEqual((await a.untilXt("rp"))[2], "theme_1815.sarepia.room_main"); // not one of its rooms
  const roomFile = name => `roomDefs/${name}sarepia/${crypto.createHash("md5").update("placeholder").digest("hex")}`;
  assert.strictEqual((await fetch(`${BASE}/1830/${roomFile("theme_9999/")}`)).status, 404);
  assert.strictEqual((await themeJson("")).status, 200);
  assert.strictEqual((await giveJson({username: "Alice", kind: "clothing", id: hat.id, color: "123456789"})).status, 200);
  await a.untilXt("il");
  a.xt("il", denId, "Alice", 1, 1);
  assert.ok((await a.untilXt("il")).includes("123456789"));
  // negative: the same colour written signed (-5 is 4294967291); not a number at all is refused
  assert.strictEqual((await giveJson({username: "Alice", kind: "clothing", id: hat.id, color: "-5"})).status, 200);
  assert.ok((await a.untilXt("il")).includes("4294967291"));
  assert.strictEqual((await giveJson({username: "Alice", kind: "clothing", id: hat.id, color: "5x"})).status, 400);

  // --- the item defs clients get: ocean eyes (314) allowed on every animal
  const {decode} = require("../lib/amf3.js");
  const zlib = require("zlib");
  const itemDefsPath = require("../lib/cdn.js").hashedPath("defPacks/1000");
  const servedDefs = decode(zlib.inflateRawSync(Buffer.from(await (await fetch(`${BASE}/${itemDefsPath}?v=4`)).arrayBuffer())));
  const servedById = Object.fromEntries(Object.values(servedDefs).map(def => [def.id, def]));
  assert.strictEqual(servedById[314].avatarUseFlags, "9007199254740991");
  // ... and every piece of clothing wearable by every animal.
  assert.ok(Object.values(servedDefs).filter(def => def.type === "1").every(def => def.avatarUseFlags === "9007199254740991"));
  assert.strictEqual(servedById[316].avatarUseFlags, "12453376"); // an ocean pattern: untouched
  assert.strictEqual(Object.keys(servedDefs).length, 4497);
  a.xt("iu", denId, 1, 0, -314);
  assert.strictEqual((await a.untilXt("iu"))[2], "1");

  // --- the custom client's login choices: honoured for that session only
  assert.strictEqual((await (await fetch(`${BASE}/flashvars`)).json()).loginChoices, true);
  // (a fresh account: Carol is banned by now, and a banned account's
  // sign-in is refused with "account_banned", so it gets no token.)
  assert.strictEqual((await registerJson({username: "Erin", password: "KettlePass05"})).status, 200);
  const chosen = await (await postJson(`${BASE}/authenticate`, {username: "Erin", password: "KettlePass05",
    login_choices: {accountType: 0, isGuide: true, membershipDays: 12, isModerator: "yes"}})).json();
  assert.strictEqual((await (await fetch(`${BASE}/player`, {headers: {Authorization: `Bearer ${chosen.auth_token}`}})).json()).game_account_type, 0);
  a.xt("ag", denId, "Erin", 0);
  // account type, guide: asking to be a guide is refused unless the admin made them one
  assert.deepStrictEqual((await a.untilXt("ag")).slice(5, 7), ["0", "0"]);
  await postJson(`${BASE}/authenticate`, {username: "Erin", password: "KettlePass05"}); // and back to normal
  a.xt("ag", denId, "Erin", 0);
  assert.deepStrictEqual((await a.untilXt("ag")).slice(5, 7), ["2", "0"]);

  // --- custom colours: an id for four RGB values, announced to everyone
  a.xt("xcc", denId, 0xff8800, 0x123456, 0, 0xffffff);
  const colour = await a.untilXt("xcc");
  assert.deepStrictEqual(colour.slice(2), ["1", String(0xFD000000), "16746496", "1193046", "0", "16777215"]);
  a.xt("xcc", denId, 0xff8800, 0x123456, 0, 0xffffff); // the same colours again
  assert.strictEqual((await a.untilXt("xcc"))[3], String(0xFD000000));
  a.xt("xcc", denId, 0x1000000, 0, 0, 0); // not a colour
  a.xt("ap", denId, 0xFD000000, 0, 0);
  assert.strictEqual((await a.untilXt("ap"))[2], "1");
  const late = new GameClient();
  await late.connect();
  const dev = await (await postJson(`${BASE}/authenticate`, {username: "Alice", password: "KettlePass01", login_choices: {accountType: 4, membershipDays: 7}})).json();
  const devLogin = await late.logIn("Alice", dev.auth_token);
  assert.deepStrictEqual([devLogin.params.accountType, devLogin.params.numDaysLeftOnSubscription, devLogin.params.isGuide, devLogin.params.isModerator], [4, 7, false, false]);
  assert.deepStrictEqual((await late.untilXt("xcc")).slice(2, 4), ["1", String(0xFD000000)]); // the table at login
  late.socket.destroy();

  c.socket.destroy();
  policy.socket.destroy();
};

harness.withServer("smoke test", HTTP_PORT, GAME_PORT, run).catch(err => {
  console.error(err);
  process.exit(1);
});
