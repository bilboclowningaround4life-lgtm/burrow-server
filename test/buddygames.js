"use strict";

// end-to-end check of the buddy games: the invitation, and each of the
// eight games played through by two simulated players against a real server.

const assert = require("assert");
const harness = require("./harness.js");

const HTTP_PORT = 18083;
const GAME_PORT = 19342;
const BASE = `http://127.0.0.1:${HTTP_PORT}`;
const TOWNSHIP = "jamaa_township.room_main#1";
const {postJson} = harness;
const GAMES = {ticTacToe: 1, fourGems: 31, rockPaperScissors: 32, shellGame: 38, pairs: 101, scooped: 53, bowling: 108, marbles: 45};

const arrive = async username => {
  const auth = await (await postJson(`${BASE}/authenticate`, {username, password: "KettlePass01"})).json();
  const client = new harness.GameClient(GAME_PORT);
  await client.connect();
  const login = await client.logIn(username, auth.auth_token);
  assert.strictEqual(login.status, "1");
  client.xt("rj", 1, TOWNSHIP, 1, 0, 0);
  const roomId = (await client.untilXt("rj"))[4];
  await client.untilXt("rp");
  client.xt("au", roomId, 1, 400, 400, 14, 1);
  return {client, roomId, id: String(login.params.userId), animal: String(login.params.perUserAvId)};
};

const run = async () => {
  for (const username of ["Ann", "Ben", "Cat"]) {
    const response = await fetch(`${BASE}/api/register`, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({username, password: "KettlePass01", avatarType: 1, agreed: true})});
    assert.strictEqual(response.status, 200);
  }
  const ann = await arrive("Ann");
  const ben = await arrive("Ben");
  const cat = await arrive("Cat");
  const [a, b, c] = [ann.client, ben.client, cat.client];
  // everything about arriving and seeing each other arrive is behind them
  // once each has had an answer to something asked afterwards.
  for (const [client, me] of [[a, ann], [b, ben], [c, cat]]) {
    client.xt("zg", me.roomId);
    await client.untilXt("zg");
  }

  // --- a player who arrives is told of the eight games, each for two players and ready to be played against another
  const told = a.unaskedGames[0];
  assert.strictEqual(told[2], "8");
  const perGame = (told.length - 3) / 8;
  assert.strictEqual(perGame, 19);
  const first = told.slice(3, 3 + perGame);
  assert.deepStrictEqual([first[0], first[2], first[4], first[5], first[7], first[8], first[12], first[17]], ["1", "PVP_TicTacToe", "2", "2", "0", "5055", "1", "5063"]);

  // --- invitations
  // Ann asks Ben; he says no, and she is told.
  a.xt("mp", ann.roomId, GAMES.ticTacToe, 0, "Ben");
  assert.deepStrictEqual((await b.nextXt("mp")).slice(2), ["1", "0", "Ann", "1"]);
  // while that is open neither can be asked, nor ask, anything else.
  c.xt("mp", cat.roomId, GAMES.pairs, 0, "Ann");
  assert.deepStrictEqual((await c.nextXt("mp")).slice(2), ["101", "1"]);
  b.xt("mp", ben.roomId, GAMES.ticTacToe, 1);
  assert.deepStrictEqual((await a.nextXt("mp")).slice(2), ["1", "1"]);
  // asked again, and taken back.
  a.xt("mp", ann.roomId, GAMES.ticTacToe, 0, "Ben");
  await b.nextXt("mp");
  a.xt("mp", ann.roomId, GAMES.ticTacToe, 1);
  assert.deepStrictEqual((await b.nextXt("mp")).slice(2), ["1", "1"]);
  // nobody of that name, a game that is not a buddy game, oneself: all "no".
  for (const [game, name] of [[GAMES.ticTacToe, "Nobody"], [4, "Ben"], [GAMES.ticTacToe, "Ann"]]) {
    a.xt("mp", ann.roomId, game, 0, name);
    assert.strictEqual((await a.nextXt("mp"))[3], "1");
  }
  // A buddy game cannot be started alone.
  a.xt("mj", ann.roomId, GAMES.ticTacToe, 0, 0, 0);
  assert.deepStrictEqual((await a.nextXt("mj")).slice(2), ["as", "0"]);
  await a.untilXt("ua");

  // starts `game` between Ann (who asks) and Ben, up to both saying they
  // are ready. returns the game room's id and what the start message added.
  const begin = async game => {
    a.xt("mp", ann.roomId, game, 0, "Ben");
    await b.untilXt("mp");
    b.xt("mp", ben.roomId, game, 0);
    let room;
    let extra;
    for (const [client, me] of [[a, ann], [b, ben]]) {
      const joined = await client.untilXt("rj");
      assert.deepStrictEqual([joined[3].split("_")[0], joined[10], joined[13]], [`game${game}`, "1", "1"]); // a game's room, beside the one they are in
      room = joined[4];
      assert.deepStrictEqual((await client.untilXt("mj")).slice(1), [room, ann.id, ben.id]);
      const started = await client.nextXt("ms");
      // two players, their ids, then each one's animal and name
      assert.deepStrictEqual(started.slice(1, 9), [room, "2", ann.id, ben.id, ann.animal, "Ann", ben.animal, "Ben"]);
      extra = started.slice(9);
      void me;
    }
    a.xt("mm", room, game, "ready");
    b.xt("mm", room, game, "ready");
    return {room, extra};
  };
  // what both players are told next, checked to be the same.
  const both = async word => {
    const [toAnn, toBen] = [await a.nextXt("mm"), await b.nextXt("mm")];
    assert.deepStrictEqual(toAnn, toBen);
    assert.strictEqual(toAnn[2], word);
    return toAnn.slice(3);
  };
  const say = (who, room, game, ...words) => (who === 0 ? a : b).xt("mm", room, game, ...words);
  const finish = async room => {
    // each game ends itself: "quit", then out of its room. after a game
    // that was decided nobody is told the other "left".
    for (const client of [a, b]) {
      client.xt("rl", room, room);
    }
    a.xt("zg", ann.roomId);
    assert.strictEqual((await a.nextXt("zg"))[0], "zg");
    b.xt("zg", ben.roomId);
    assert.strictEqual((await b.nextXt("zg"))[0], "zg");
  };

  // --- Tic Tac Toe: the top row for whoever starts
  {
    const {room} = await begin(GAMES.ticTacToe);
    const [turn, ...ids] = await both("round");
    assert.deepStrictEqual(ids, [ann.id, ben.id]);
    const x = Number(turn);
    const o = 1 - x;
    say(o, room, GAMES.ticTacToe, "mark", 1, 1); // not their turn
    assert.deepStrictEqual((await (o === 0 ? a : b).nextXt("mm")).slice(2), ["invalid", String(x)]);
    say(x, room, GAMES.ticTacToe, "mark", 0, 0);
    assert.deepStrictEqual(await both("mark"), [String(x), "0", "0", "0", "0", String(o)]);
    say(o, room, GAMES.ticTacToe, "mark", 0, 0); // taken
    assert.deepStrictEqual((await (o === 0 ? a : b).nextXt("mm")).slice(2), ["invalid", String(o)]);
    say(o, room, GAMES.ticTacToe, "time"); // and then they run out of time: the turn passes
    assert.deepStrictEqual(await both("invalid"), [String(x)]);
    say(x, room, GAMES.ticTacToe, "mark", 1, 0);
    await both("mark");
    say(o, room, GAMES.ticTacToe, "mark", 1, 1);
    await both("mark");
    say(x, room, GAMES.ticTacToe, "mark", 2, 0);
    assert.deepStrictEqual(await both("mark"), [String(x), "2", "0", "1", "0", String(x)]); // won
    await finish(room);
  }

  // --- Four Gems: four in one column
  {
    const {room} = await begin(GAMES.fourGems);
    const x = Number((await both("round"))[0]);
    const o = 1 - x;
    for (let move = 0; move < 3; move++) {
      say(x, room, GAMES.fourGems, "mark", 3);
      assert.deepStrictEqual(await both("mark"), [String(x), "3", "0", "0", String(o)]);
      say(o, room, GAMES.fourGems, "mark", 4);
      await both("mark");
    }
    say(x, room, GAMES.fourGems, "mark", 9); // no such column
    assert.strictEqual((await (x === 0 ? a : b).nextXt("mm"))[2], "invalid");
    say(x, room, GAMES.fourGems, "mark", 3);
    assert.deepStrictEqual(await both("mark"), [String(x), "3", "1", "0", String(x)]);
    await finish(room);
  }

  // --- Rock Paper Scissors: a draw, then Ben wins two rounds
  {
    const game = GAMES.rockPaperScissors;
    const {room} = await begin(game);
    const round = async (annHand, benHand) => {
      assert.deepStrictEqual(await both("round"), [ann.id, ben.id]);
      say(0, room, game, "time", annHand);
      say(1, room, game, "time", benHand);
      const result = await both("mark");
      return result;
    };
    assert.deepStrictEqual(await round("rock", "rock"), ["rock", "rock", "0", "0"]);
    say(0, room, game, "ready");
    say(1, room, game, "ready");
    assert.deepStrictEqual(await round("rock", "paper"), ["rock", "paper", "0", "1", "1"]);
    say(0, room, game, "ready");
    say(1, room, game, "ready");
    assert.deepStrictEqual(await round("nonsense", "scissors"), ["off", "scissors", "1", "1"]); // no hand loses to any
    await finish(room);
  }

  // --- the Shell Game: the right shell against the wrong one, twice
  {
    const game = GAMES.shellGame;
    const {room} = await begin(game);
    for (const over of [false, true]) {
      const [first, second, shell] = await both("round");
      assert.deepStrictEqual([first, second], [ann.id, ben.id]);
      assert.ok(["1", "2", "3"].includes(shell));
      const wrong = String(Number(shell) % 3 + 1);
      say(0, room, game, "time", shell);
      say(1, room, game, "time", wrong);
      assert.deepStrictEqual(await both("mark"), over ? [shell, wrong, "1", "0"] : [shell, wrong, "0", "1", "0"]);
      if (!over) {
        say(0, room, game, "ready");
        say(1, room, game, "ready");
      }
    }
    await finish(room);
  }

  // --- Pairs: whoever starts turns up all eight pairs
  {
    const game = GAMES.pairs;
    const {room} = await begin(game);
    const [starter, , count, ...cards] = await both("round");
    assert.deepStrictEqual([count, cards.length, [...cards].map(Number).sort((one, two) => one - two).join()], ["16", 16, "1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16"]);
    const me = starter === ann.id ? 0 : 1;
    const them = 1 - me;
    const watcher = them === 0 ? a : b;
    const at = picture => cards.indexOf(String(picture));
    // A miss first, by the other player's clock running out... no: by two cards that do not match.
    say(me, room, game, "c1", at(1));
    assert.deepStrictEqual((await watcher.nextXt("mm")).slice(2), ["c1", String(at(1))]);
    say(me, room, game, "c2", at(2));
    assert.deepStrictEqual((await watcher.nextXt("mm")).slice(2), ["c2", String(at(2))]);
    assert.deepStrictEqual(await both("results"), ["0", "0"]);
    say(them, room, game, "c1", at(3)); // nothing moves until both have watched the result
    say(0, room, game, "rp");
    say(1, room, game, "rp");
    await both("nextround");
    say(them, room, game, "time"); // the other player's turn now; they let it run out
    await both("time");
    say(0, room, game, "rp");
    say(1, room, game, "rp");
    await both("nextround");
    say(me, room, game, "emote", 3);
    assert.deepStrictEqual((await watcher.nextXt("mm")).slice(2), ["emote", "3"]);
    for (let picture = 1; picture <= 8; picture++) {
      say(me, room, game, "c1", at(picture));
      say(me, room, game, "c2", at(picture + 8));
      await watcher.nextXt("mm");
      await watcher.nextXt("mm");
      if (picture < 8) {
        assert.deepStrictEqual(await both("results"), ["0", "1"]);
        say(0, room, game, "rp");
        say(1, room, game, "rp");
        await both("nextround");
      }
    }
    assert.deepStrictEqual(await both("results"), ["1", starter]);
    await finish(room);
  }

  // --- Scooped: scoops are shown to the other player; the first to finish wins
  {
    const game = GAMES.scooped;
    const {room} = await begin(game);
    assert.deepStrictEqual(await both("start"), []);
    say(0, room, game, "sc_click", "flavor3");
    assert.deepStrictEqual((await b.nextXt("mm")).slice(2), ["sc_click", "flavor3"]);
    say(1, room, game, "sc_done");
    assert.deepStrictEqual(await both("sc_done"), ["1"]);
    await finish(room);
  }

  // --- Bowling: balls and the wait between them are passed across
  {
    const game = GAMES.bowling;
    const {room} = await begin(game);
    const [bowler] = await both("round");
    const thrower = bowler === ann.id ? 0 : 1;
    say(thrower, room, game, "ball", "12.5", "-3.25", "410");
    assert.deepStrictEqual((await (thrower === 0 ? b : a).nextXt("mm")).slice(2), ["ball", "12.5", "-3.25", "410"]);
    say(0, room, game, "rp");
    say(1, room, game, "rp");
    assert.deepStrictEqual(await both("nextround"), []);
    say(thrower, room, game, "time");
    assert.deepStrictEqual(await both("time"), []);
    // Ann walks off mid-game: Ben's game is told she left.
    a.xt("rl", room, room);
    assert.deepStrictEqual((await b.nextXt("ml")).slice(1), [room, ann.id]);
    b.xt("rl", room, room);
  }

  // --- Marbles: a layout with the start, then aim, shot and end of turn
  {
    const game = GAMES.marbles;
    const {room, extra} = await begin(game);
    assert.ok(extra.length === 1 && Number(extra[0]) >= 1 && Number(extra[0]) <= 14);
    assert.ok(["0", "1"].includes((await both("start"))[0]));
    say(0, room, game, "pos", 300, 200);
    assert.deepStrictEqual((await b.nextXt("mm")).slice(2), ["pos", "300", "200"]);
    say(0, room, game, "shoot", "301.5", "199", "-40.25", "12");
    assert.deepStrictEqual((await b.nextXt("mm")).slice(2), ["shoot", "301.5", "199", "-40.25", "12"]);
    say(0, room, game, "endTurn");
    say(1, room, game, "endTurn");
    assert.deepStrictEqual(await both("endTurn"), []);
    say(0, room, game, "shoot", "1%2", "x", "3", "4"); // not numbers: dropped
    // the server cannot tell when this game is over (the clients keep the
    // score), so the one who stays is told when the other goes.
    a.xt("rl", room, room);
    assert.deepStrictEqual((await b.nextXt("ml")).slice(1), [room, ann.id]);
    b.xt("rl", room, room);
  }

  // --- game bubbles: Ann puts up Pairs over her head (a chat line of type
  // 12), everyone in the room sees it as "on|<game>", and whoever clicks it
  // plays her
  const bubble = (client, me, word, game) => client.send(`<msg t='sys'><body action='pubMsg' r='${me.roomId}'><txt><![CDATA[${word}%12%${game}]]></txt></body></msg>`);
  bubble(a, ann, "on", GAMES.pairs);
  for (const client of [a, b, c]) {
    assert.deepStrictEqual((await client.untilXt("uc")).slice(1), [ann.roomId, ann.id, "on|101", "12", "0"]);
  }
  // A game that is not the one in the bubble, or a bubble nobody has up: "no".
  c.xt("mcp", cat.roomId, GAMES.ticTacToe, 0, "Ann");
  assert.deepStrictEqual((await c.untilXt("mp")).slice(2), ["1", "1"]);
  c.xt("mcp", cat.roomId, GAMES.pairs, 0, "Ben");
  assert.deepStrictEqual((await c.untilXt("mp")).slice(2), ["101", "1"]);
  // Ben clicks it: the game starts for the two of them and the bubble goes
  // for Cat. Ann hears her own "off" only once the game is over.
  b.xt("mcp", ben.roomId, GAMES.pairs, 0, "Ann");
  assert.deepStrictEqual((await c.untilXt("uc")).slice(1), [ann.roomId, ann.id, "off", "12"]);
  let pairsRoom;
  for (const client of [a, b]) {
    pairsRoom = (await client.untilXt("rj"))[4];
    assert.deepStrictEqual((await client.untilXt("ms")).slice(1, 5), [pairsRoom, "2", ann.id, ben.id]);
  }
  // too late for Cat
  c.xt("mcp", cat.roomId, GAMES.pairs, 0, "Ann");
  assert.deepStrictEqual((await c.untilXt("mp")).slice(2), ["101", "1"]);
  // while in it, Ann's client turning the bubble off is not answered yet
  bubble(a, ann, "off", 0);
  b.xt("rl", pairsRoom, pairsRoom);
  a.xt("rl", pairsRoom, pairsRoom);
  assert.deepStrictEqual((await a.untilXt("uc")).slice(1), [ann.roomId, ann.id, "off", "12"]);
  // put up and taken down again outside a game: answered at once
  bubble(a, ann, "on", GAMES.bowling);
  assert.deepStrictEqual((await a.untilXt("uc")).slice(3), ["on|108", "12", "0"]);
  assert.deepStrictEqual((await c.untilXt("uc")).slice(3), ["on|108", "12", "0"]);
  bubble(a, ann, "off", 0);
  assert.deepStrictEqual((await a.untilXt("uc")).slice(3), ["off", "12"]);
  assert.deepStrictEqual((await c.untilXt("uc")).slice(3), ["off", "12"]);
  // not a buddy game: refused, and the client is put back with an "off"
  bubble(a, ann, "on", 4);
  assert.deepStrictEqual((await a.untilXt("uc")).slice(3), ["off", "12"]);
  await b.untilXt("uc"); // the bowling bubble's two lines, which Ben saw as well
  await b.untilXt("uc");

  // somebody who walks in sees a bubble that is already up, with its owner
  bubble(a, ann, "on", GAMES.shellGame);
  await a.untilXt("uc");
  for (const client of [b, c]) {
    await client.untilXt("uc");
  }
  const reg = await fetch(`${BASE}/api/register`, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({username: "Dee", password: "KettlePass01", avatarType: 1, agreed: true})});
  assert.strictEqual(reg.status, 200);
  const dee = await arrive("Dee");
  let seen;
  do {
    seen = await dee.client.untilXt("uc");
  } while (seen[2] !== ann.id);
  assert.deepStrictEqual(seen.slice(3), ["on|38", "12", "0"]);
  bubble(a, ann, "off", 0);
  await a.untilXt("uc");
  dee.client.socket.destroy();

  // --- the HUD's Games window lists the buddy games too, Pairs among them
  a.xt("gl", ann.roomId, 341);
  const gameList = await a.untilXt("gl");
  for (const id of Object.values(GAMES)) {
    assert.ok(gameList.includes(String(id)), `game ${id} in the Games window`);
  }

  // --- a player who logs off takes their invitation with them
  a.xt("mp", ann.roomId, GAMES.marbles, 0, "Ben");
  await b.untilXt("mp");
  a.socket.destroy();
  assert.deepStrictEqual((await b.untilXt("mp")).slice(2), ["45", "1"]);

  // --- a room game played together (lib/minigames.js MULTIPLAYER): Gem
  // Breaker offers its waiting list, Ben waits in the room, Cat joins, both
  // are taken in, and each one's moves reach the other
  // (and first, typing: Cat's "..." reaches Ben, said again too soon is not
  // passed on, and stopping is)
  c.xt("xty", cat.roomId, 1);
  assert.deepStrictEqual((await b.untilXt("xty")).slice(2), [cat.id, "1"]);
  c.xt("xty", cat.roomId, 1);
  c.xt("xty", cat.roomId, 0);
  assert.deepStrictEqual((await b.nextXt("xty")).slice(2), [cat.id, "0"]);

  const GEM_BREAKER = 30;
  b.xt("mi", ben.roomId, GEM_BREAKER);
  const gemInfo = (await b.untilXt("mi")).slice(3);
  assert.deepStrictEqual([gemInfo[0], gemInfo[4], gemInfo[5]], ["30", "2", "2"]);
  b.xt("mj", ben.roomId, GEM_BREAKER, 1, 0, -1);
  assert.deepStrictEqual((await b.untilXt("mj")).slice(1), [ben.roomId, ben.id]);
  c.xt("mj", cat.roomId, GEM_BREAKER, 1, 0, -1);
  for (const client of [b, c]) {
    assert.deepStrictEqual((await client.untilXt("mj")).slice(1), [ben.roomId, ben.id, cat.id]);
  }
  const gemRoom = (await b.untilXt("rj"))[4];
  for (const client of [b, c]) {
    assert.deepStrictEqual((await client.untilXt("mj")).slice(1), [gemRoom, ben.id, cat.id]);
    assert.deepStrictEqual((await client.untilXt("ms")).slice(2, 5), ["2", ben.id, cat.id]);
  }
  b.xt("mm", gemRoom, GEM_BREAKER, "ready");
  c.xt("mm", gemRoom, GEM_BREAKER, "ready");
  for (const client of [b, c]) {
    const go = await client.untilXt("mm");
    assert.deepStrictEqual([go[2], ...go.slice(4)], ["start", "2", ben.id, "0", cat.id, "0"]);
  }
  b.xt("mm", gemRoom, GEM_BREAKER, "pos", "-45");
  assert.deepStrictEqual((await c.nextXt("mm")).slice(2), ["pos", ben.id, "-45"]);
  c.xt("mm", gemRoom, GEM_BREAKER, "shoot", "0.5", "-0.8", "210", "40", "3", "1", "300", "0", "5");
  assert.deepStrictEqual((await b.nextXt("mm")).slice(2), ["shoot", "0.5", "-0.8", "210", "40", "3", "1", "300", "0", "5"]);
  c.xt("mm", gemRoom, GEM_BREAKER, "pos", "<b>");
  c.xt("mm", gemRoom, GEM_BREAKER, "playerLost", "12345");
  assert.deepStrictEqual((await b.nextXt("mm")).slice(2), ["playerLost", "12345"]); // and not the one with markup
  // one leaving: the other is told, as the game expects
  c.xt("ml", gemRoom);
  assert.deepStrictEqual((await b.untilXt("ml")).slice(1), [gemRoom, cat.id]);
  // alone, the start names its one player, whose cannon it is
  b.xt("rj", gemRoom, TOWNSHIP, 1, 0, 0);
  const back = (await b.untilXt("rj"))[4];
  b.xt("mj", back, GEM_BREAKER, 0, 0, -1);
  const soloRoom = (await b.untilXt("mj"))[1];
  b.xt("mm", soloRoom, GEM_BREAKER, "ready");
  assert.deepStrictEqual((await b.untilXt("mm")).slice(4), ["1", ben.id, "0"]);

  b.socket.destroy();
  c.socket.destroy();
};

harness.withServer("buddy games test", HTTP_PORT, GAME_PORT, run).catch(err => {
  console.error(err);
  process.exit(1);
});
