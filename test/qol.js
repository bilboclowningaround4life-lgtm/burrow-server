"use strict";

// end-to-end check of the small comforts added on 2026-10-11: bigger
// limits, the newer chat commands, whispers, names typed over, looks per
// room, eggs that hatch at once. simulated players, a real server.

const assert = require("assert");
const harness = require("./harness.js");

const HTTP_PORT = 18085;
const GAME_PORT = 19344;
const BASE = `http://127.0.0.1:${HTTP_PORT}`;
const TOWNSHIP = "jamaa_township.room_main#1";
const {postJson} = harness;

const say = (client, roomId, text) =>
  client.send(`<msg t='sys'><body action='pubMsg' r='${roomId}'><txt><![CDATA[${text}%0]]></txt></body></msg>`);
// what a command's message box said.
const told = async client => (await client.untilXt("xtl"))[2];

// logs in and asks for the township, as the game always does first.
// returns where the server put them.
const arrive = async username => {
  const auth = await (await postJson(`${BASE}/authenticate`, {username, password: "KettlePass01"})).json();
  const client = new harness.GameClient(GAME_PORT);
  await client.connect();
  const login = await client.logIn(username, auth.auth_token);
  assert.strictEqual(login.status, "1");
  client.xt("rj", 1, TOWNSHIP, 1, 0, 0);
  const joined = await client.untilXt("rj");
  const file = (await client.untilXt("rp"))[2];
  client.xt("au", joined[4], 1, 400, 400, 14, 1);
  return {client, login, roomId: joined[4], room: joined[3], file};
};

const run = async () => {
  for (const username of ["Ann", "Ben"]) {
    const response = await fetch(`${BASE}/api/register`, {method: "POST", headers: {"Content-Type": "application/json"},
      body: JSON.stringify({username, password: "KettlePass01", avatarType: 1, agreed: true})});
    assert.strictEqual(response.status, 200);
  }
  let {client: a, login, roomId, room} = await arrive("Ann");
  const {client: b, roomId: benRoom} = await arrive("Ben");
  await a.untilXt("ac");
  assert.strictEqual(room, TOWNSHIP);
  assert.strictEqual(login.params.pendingFlags & 2, 2); // the client's bigger inventories

  // --- !go: by short name, by a room's own name, and not to nowhere
  say(a, roomId, "!go nowhere");
  assert.match(await told(a), /no place called nowhere/);
  say(a, roomId, "!go list");
  assert.match(await told(a), /township.*sarepia/);
  say(a, roomId, "!go sarepia");
  let moved = await a.untilXt("rj");
  assert.strictEqual(moved[3], "sarepia.room_main#1");
  assert.strictEqual((await a.untilXt("rp"))[2], "sarepia.room_main");
  roomId = moved[4];

  // --- a look for this room only, and for no other
  say(a, roomId, "!theme here fall2022");
  assert.strictEqual((await a.untilXt("rp"))[2], "theme_1636.sarepia.room_main");
  say(a, roomId, "!theme here easter");
  assert.match(await told(a), /Use: !theme/);
  say(a, roomId, "!go sarepia.flag_shop");
  moved = await a.untilXt("rj");
  assert.strictEqual((await a.untilXt("rp"))[2], "sarepia.flag_shop");
  say(a, moved[4], "!go sarepia");
  moved = await a.untilXt("rj");
  assert.strictEqual((await a.untilXt("rp"))[2], "theme_1636.sarepia.room_main"); // remembered
  roomId = moved[4];
  say(a, roomId, "!theme here off");
  assert.strictEqual((await a.untilXt("rp"))[2], "sarepia.room_main");

  // --- whispers: buddies only; a popup from afar, a bubble for two in one room
  say(a, roomId, "!w Ben Psst, over HERE");
  assert.match(await told(a), /not one of your buddies/);
  a.xt("ba", roomId, "Ben");
  await b.untilXt("ba");
  b.xt("bc", benRoom, "Ann", 1);
  await a.untilXt("bs");
  say(a, roomId, "!w Ben Psst, over HERE");
  assert.deepStrictEqual((await b.untilXt("xw")).slice(2), ["0", "Ann", "Psst, over HERE"]); // from afar: a box; capitals kept
  assert.match(await told(a), /Whispered to Ben/);
  say(b, benRoom, "!go sarepia");
  const benMoved = await b.untilXt("rj");
  await b.untilXt("rp");
  b.xt("au", benMoved[4], 1, 300, 300, 14, 1);
  await a.untilXt("ac");
  say(b, benMoved[4], "!w ann hello");
  assert.deepStrictEqual((await a.untilXt("xw")).slice(2), ["1"]); // in one room: the next bubble is a green one
  assert.deepStrictEqual((await a.nextXt("uc")).slice(3), ["hello", "0"]);

  // --- names typed over in the switcher windows: an animal's, a pet's
  a.xt("xrn", roomId, "a", 1, "Sir Fluffy Paws");
  assert.strictEqual((await a.untilXt("ad"))[15], "Sir Fluffy Paws");
  assert.deepStrictEqual((await a.untilXt("xrn")).slice(2), ["a", "1", "1", "Sir Fluffy Paws"]);
  a.xt("xrn", roomId, "a", 1, "<b>");
  assert.deepStrictEqual((await a.untilXt("xrn")).slice(2), ["a", "1", "0", "Sir Fluffy Paws"]);
  a.xt("xrn", roomId, "p", 999, "Biscuit");
  assert.deepStrictEqual((await a.untilXt("xrn")).slice(2, 5), ["p", "999", "0"]);
  say(a, roomId, "!name Nope"); // no longer a command: just something said
  assert.strictEqual((await a.untilXt("uc"))[3], "!name Nope");

  // --- clothes: everything off and back
  const give = async query => {
    const found = (await (await fetch(`${BASE}/api/search?q=${query}&kind=clothing`)).json()).results[0];
    assert.strictEqual((await fetch(`${BASE}/api/give`, {method: "POST", headers: {"Content-Type": "application/json"},
      body: JSON.stringify({username: "Ann", kind: "clothing", id: found.id, colorIndex: 0})})).status, 200);
    return (await a.untilXt("il"))[9]; // its inventory id
  };
  const hat = await give("top+hat");
  const scarf = await give("scarf");
  a.xt("iu", roomId, 2, 0, hat, scarf);
  await a.untilXt("iu");
  await a.untilXt("il");
  say(a, roomId, "!outfit off");
  let changed = await a.untilXt("il");
  assert.deepStrictEqual([changed[2], changed[7], changed[8]], ["3", "0", "2"]);
  assert.match(await told(a), /Everything is off/);
  say(a, roomId, "!outfit undo");
  changed = await a.untilXt("il");
  assert.deepStrictEqual([changed[2], changed[7], changed[8]], ["3", "2", "0"]);
  assert.match(await told(a), /Back to what you wore before/);
  say(a, roomId, "!again");
  assert.match(await told(a), /Buy something in a shop first/);
  // A purchase, then more of it: only after a yes to the question.
  a.xt("gl", roomId, 5);
  const shop = await a.untilXt("gl");
  a.xt("ib", roomId, 5, 1, shop[9], 0, 0, -1, "");
  await a.untilXt("ib");
  const owned = async () => {
    a.xt("il", roomId, "Ann", 1, 1);
    let list = await a.untilXt("il");
    while (list[2] !== "0") {
      list = await a.untilXt("il");
    }
    return Number(list[8]);
  };
  const before = await owned();
  say(a, roomId, "!again 101");
  assert.match(await told(a), /from 1 to 100/);
  say(a, roomId, "!again 3");
  const question = await a.untilXt("xyn");
  assert.match(question[3], /Buy 3 more/);
  a.xt("xyn", roomId, question[2], 0); // no
  assert.strictEqual(await owned(), before);
  say(a, roomId, "!again 3");
  a.xt("xyn", roomId, (await a.untilXt("xyn"))[2], 1); // yes
  assert.strictEqual(await owned(), before + 3);
  say(a, roomId, "!help"); // gone: the list is at /commands
  assert.strictEqual((await a.untilXt("uc"))[3], "!help");
  assert.match(await (await fetch(`${BASE}/commands`)).text(), /!outfit save <i>NAME<\/i>/); // the page sets what to type in italics

  // --- den undo, mail, music
  say(a, roomId, "!den undo");
  assert.match(await told(a), /nothing to put back/);
  say(a, roomId, "!den name Beach House");
  assert.match(await told(a), /now called Beach House/);
  b.xt("dj", benMoved[4], "denAnn", 1, -1);
  assert.strictEqual((await b.untilXt("rj"))[14], "Ann's Beach House");
  b.xt("rj", 1, "sarepia.room_main#1", 1, 0, 0);
  await b.untilXt("rp");
  say(a, roomId, "!mail clear");
  assert.match(await told(a), /0 read Jam-A-Grams deleted/);
  say(a, roomId, "!music all");
  const tracks = await a.untilXt("di");
  // the game's 55 tracks and this server's own (lib/extramusic.js)
  const allTracks = 55 + require("../lib/extramusic.js").TRACKS.length;
  assert.match(await told(a), new RegExp(`${allTracks} music tracks added`));
  assert.ok(Number(tracks[3]) >= allTracks);
  say(a, roomId, "!music all");
  await a.untilXt("di");
  assert.match(await told(a), /every music track already/);

  // --- an egg is hatched as soon as it is bought (three days by the game's clock)
  const eggDef = require("../lib/defpacks.js");
  await eggDef.init();
  const egg = eggDef.petIds().find(id => eggDef.petDef(id).isEgg === "1");
  a.xt("pc", roomId, 312, egg, 0, 0, 1, 2, 0);
  const made = await a.untilXt("pc");
  assert.strictEqual(made[2], "1");
  assert.ok(Number(made[10]) <= Date.now() / 1000 - 259200);
  // ... and named from the hatched popup (EggPetHatchedPopup waits for this answer)
  a.xt("pn", roomId, made[5], 15386, 15428);
  assert.deepStrictEqual((await a.untilXt("pn")).slice(2), ["1", made[5], "15386|15428"]);

  // --- she starts in the township as ever, in a look picked at random if she asked for one
  say(a, roomId, "!theme random on");
  assert.match(await told(a), /picked at random/);
  a.socket.destroy();
  await new Promise(resolve => setTimeout(resolve, 200));
  const again = await arrive("Ann");
  assert.match(again.file, /^theme_\d+\.jamaa_township\.room_main/);
  again.client.socket.destroy();
  await new Promise(resolve => setTimeout(resolve, 200));

  // --- "start in your own den" (asked for at sign-in): the game asks for the township and is put in the den
  const denAuth = await (await postJson(`${BASE}/authenticate`, {username: "Ann", password: "KettlePass01", login_choices: {startInDen: true}})).json();
  const home = new harness.GameClient(GAME_PORT);
  await home.connect();
  await home.logIn("Ann", denAuth.auth_token);
  home.xt("rj", 1, TOWNSHIP, 1, 0, 0);
  assert.strictEqual((await home.untilXt("rj"))[3], "denAnn");
  home.socket.destroy();
  b.socket.destroy();
};

harness.withServer("comforts test", HTTP_PORT, GAME_PORT, run).catch(err => {
  console.error(err);
  process.exit(1);
});
