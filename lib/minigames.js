"use strict";

const accounts = require("./accounts.js");
const achievements = require("./achievements.js");
const defpacks = require("./defpacks.js");
const buddyGames = require("./buddygames.js");
const masterpieces = require("./masterpieces.js");
const dens = require("./dens.js");
const customItems = require("./customitems.js");
const limits = require("./limits.js");
const {activeAvatar, addClothing, sendClothingAdded} = require("./player.js");

// minigames (client side: MinigameManager, MinigameXtCommManager and the
// game.* classes). the games themselves are compiled into the client; what
// the official server kept was the table saying which game def id is which
// game (the "game" defPack is gone from the CDN) and the session around a
// game: the room it runs in, the start signal, gem awards, and for some
// games a few messages of their own.
//
// lib/games.json is that table, put back together from what still names the
// ids: arcade-machine den items (gameDefId and a name), the room files (which
// id stands where), the names GameCardPopup has for each game class, and the
// achievement defs (which user vars a game counts in). entries:
//   id      game def id
//   swf     the game's key in game.IncludeMinigames
//   title   its name; sent as the id of the localization string that says so
//   type    0 runs in a window over the room ("in-room"), 1 replaces the room
//   vars    user vars: games played, and two the game uses as it likes
//   pet     pet species the player must have out (the pet games)
//   start   what the game waits for after it says "ready": see START
//   ready   false: needs more from the server than is here yet; not playable
//   tickets a carnival game: how many points of its score make one ticket
//   icon    media id of its picture in the HUD's Games window; the games with
//           one are the ones that window lists
//   buddy   true: one of the eight games two players play from a player's
//           card (lib/buddygames.js). their ids are ours: nothing in the
//           client names them, and the official table is gone.
//   card    a buddy game's picture, on the card's game tab and in the
//           invitation
//
// every other game is played alone (minPlayers = maxPlayers = 1): the
// multiplayer ones each have a protocol of their own between the players.

const games = new Map(require("./games.json").map(game => [game.id, game]));

const GAME_AFTERGLOW_MS = 15000; // how long a game's room id is still taken after leaving it (leave)
const IN_ROOM = 0;
const MAX_GEMS_PER_AWARD = 5000;
const MAX_MASTERY_PER_AWARD = 100;
const MASTERY_FULL = 100;
const CURRENCY_GEMS = 0;
const CLAW_COST = 5; // gems a go
const CLAW_WIN_CHANCE = 0.4;
const SKY_HIGH_PRIZE_CHANCE = 0.5;
const SAFETY_QUIZ_PRIZE = 1179; // den item, SafetyQuiz.init
const TOUCH_POOL_PRIZES = [867, 869, 872, 868, 870, 871]; // den items, TouchPool.init
const LANG_ENG = 0;
const FALLBACK_TITLE = "Games";
const MAX_INFO_REQUEST = 100;
// A game id the table does not have: it still gets its sign, and says
// "not ready" when clicked.
const UNKNOWN_GAME = {swf: "", title: FALLBACK_TITLE, type: 0, ready: false};
const INVASION_WIN = 11; // MicroGameInvasion.keptItem
const CARNIVAL_COST = 5; // gems a go
const MAX_TICKETS_PER_GO = 300;
const CURRENCY_TICKETS = 1;
const INVASION_COST = 10; // gems a go, as the machine's own screen says
const SMOOTHIE_COLOURS = new Set(["purple", "orange", "red", "yellow"]);
// The game's attachment state is client-defined (for example, the cocoa
// recipe). It is not an item id and must never become protocol markup.
const attachmentExtra = value => String(value ?? "").replace(/[\r\n%,]/g, "").slice(0, 128);

const awardsPerMinute = limits.limiter(120, 60000);
const invitesPerMinute = limits.limiter(20, 60000);
const LEFT_NOTICE_DELAY_MS = 2500;
const GAME_PAINTING = 51;
const GAME_PIXEL_PAINTING = 139;
// marbles sends the shooter's aim four times a second; nothing needs more.
const messagesPerMinute = limits.limiter(900, 60000);

// the "start" message a game waits for once it has said it is ready.
const START = {
  seed: () => [serial()],
  // then each player's sfs id and a field the game skips: a game knows
  // which player is its own by the id (GemBreakerPlayer.init), and only
  // that one aims and shoots.
  seedAndPlayers: game => [serial(), game.players.length, ...game.players.flatMap(player => [player.id, 0])],
};

// the room games several players play together: "Multiplayer" on the
// game's waiting list (MinigameManager.setupWaitListPopup), for players in
// the same room. each client plays the same game from the same start, and
// the server passes each player's moves on to the others: `relay` names
// the messages passed on, true for those that go with the sender's sfs id
// first. a full list starts the game.
const MULTIPLAYER = {
  // GemBreaker.message: "pos" [sfsUserId, cannon angle], "shoot" [the shot's
  // nine numbers], "playerLost" [the next round's seed]. two players, a
  // field each, first to win two rounds.
  GemBreaker: {max: 2, relay: {pos: true, shoot: false, playerLost: false}},
};
const MAX_RELAYED_FIELDS = 12;
const RELAYED_FIELD = /^[-0-9a-zA-Z.]{1,32}$/;

// serial numbers the client mixes into its award messages; any number will do.
function serial() {
  return 1 + Math.floor(Math.random() * 1000000);
}

let nextGameRoomId = 500000; // well clear of the world's room ids

module.exports = ({tell, leaveRoom, findOnline, blocks, watchers}) => {
  // MinigameInfo.init, the 19 fields the "mi" reply carries for a game.
  const info = game => [
    game.id,
    // never 0: the client throws on a string it cannot find.
    defpacks.stringId(game.title) || defpacks.stringId(FALLBACK_TITLE),
    game.swf, // extName
    game.swf, // swfName
    // min and max players: more than one gives the game a waiting list
    // with "Single Player" and "Multiplayer" (lib/minigames.js MULTIPLAYER).
    game.buddy ? 2 : MULTIPLAYER[game.swf] ? MULTIPLAYER[game.swf].max : 1,
    game.buddy ? 2 : MULTIPLAYER[game.swf] ? MULTIPLAYER[game.swf].max : 1,
    0, // max spectators
    game.type,
    // the game card: the title picture on the "play" popup (not known), and
    // for a buddy game the picture in the invitation.
    game.card || 0,
    ...(game.vars || [0, 0, 0]),
    game.buddy ? 1 : 0, // ready for player-versus-player: listed on players' cards
    1, // gem multiplier
    game.pet || 0,
    0, // pro mode user var
    0, // leaderboard user var
    game.icon || game.card || 0, // its picture in the Games window or on a card's game tab
    0, // required avatar type
  ];

  // an invitation to a buddy game that has not been answered: both players
  // have {def, sender, target} as `invite`. dropping it tells the other
  // side "no" (MinigameManager.pvpResponse: [gameDefId, 1]).
  const dropInvite = (session, tellOther = true) => {
    const {invite} = session;
    if (!invite) {
      return;
    }
    invite.sender.invite = invite.target.invite = null;
    const other = invite.sender === session ? invite.target : invite.sender;
    if (tellOther) {
      other.sendXt("mp", -1, invite.def.id, 1);
    }
  };

  // A buddy game's bubble over a player's head, which anyone else in the
  // room can click to play them (UserCommXtCommManager.sendCustomPVPMessage:
  // a chat line "on|off" of type 12 with the game's id after it). the client
  // reads it back as "on|<gameDefId>" or "off", and its sender waits for
  // their own before going on. `session.pvpBubble` is the game's id.
  const BUBBLE = "12";
  const bubbleLine = session => [`on|${session.pvpBubble}`, BUBBLE, 0];
  const bubbleSeers = session => watchers(session).filter(other => !blocks.either(other.account, session.account));
  // the bubble goes for everyone else. the player's own "off" waits, when
  // they are in a game, till they are out of it: it would end the game the
  // client has only just set up (MinigameManager.readySelfForPvpGame).
  const dropBubble = session => {
    if (!session.pvpBubble) {
      return;
    }
    session.pvpBubble = null;
    if (session.room) {
      for (const other of bubbleSeers(session)) {
        other.sendXt("uc", session.room.id, session.id, "off", BUBBLE);
      }
    }
  };
  const bubbleOff = session => {
    if (session.game) {
      session.bubbleOffOwed = true;
    }
    else if (session.room) {
      session.bubbleOffOwed = false;
      session.sendXt("uc", session.room.id, session.id, "off", BUBBLE);
    }
  };
  const bubble = (session, word, gameDefId) => {
    if (word !== "on") {
      dropBubble(session);
      bubbleOff(session);
      return;
    }
    const def = games.get(Number(gameDefId));
    if (!def || !def.buddy || !Object.hasOwn(buddyGames, def.swf) || !session.room || session.game || session.invite
      || session.invisible || !accounts.featureOn(session.account, "gameInvites")) {
      if (session.room && !session.game) {
        tell(session, session.invisible ? "Nobody can see you to play with you." : "You cannot ask for a game right now.");
      }
      dropBubble(session);
      bubbleOff(session);
      return;
    }
    session.pvpBubble = def.id;
    for (const other of [session, ...bubbleSeers(session)]) {
      other.sendXt("uc", session.room.id, session.id, ...bubbleLine(session));
    }
  };
  // a bubble that is up, for a player who has just been shown its owner.
  const showBubble = (to, owner) => {
    if (owner.pvpBubble && owner.room && to !== owner && !blocks.either(to.account, owner.account)) {
      to.sendXt("uc", owner.room.id, owner.id, ...bubbleLine(owner));
    }
  };

  // Food-machine games reward a short-lived avatar attachment.  Replying
  // with "_a" is important: MinigameManager turns it into the same local
  // attachment action used by den objects, which then sends the normal
  // user-communication packet to the room.  Sending that packet ourselves
  // skips the local state and leaves the player with nothing visible.
  const grantAttachment = (session, game, reply, emoticonDefId, extra = "") => {
    if (game.attachmentGranted) {
      return;
    }
    const state = attachmentExtra(extra);
    if (!defpacks.emoticonMediaId(emoticonDefId)) {
      return;
    }
    game.attachmentGranted = true;
    reply("_a", emoticonDefId, state);
  };

  // takes the player out of the game they are in, if any, and out of an
  // invitation.
  const leave = session => {
    dropInvite(session);
    const {game} = session;
    if (!game) {
      return;
    }
    session.game = null;
    // an in-room game may say it is done just before it hands over what it
    // made (the Juice Bar's smoothie, the Cocoa Hut's drink: an attachment,
    // lib/world.js pubMsg), labelled with the game's room
    session.lastGame = {roomId: game.roomId, until: Date.now() + GAME_AFTERGLOW_MS};
    if (session.bubbleOffOwed) {
      bubbleOff(session);
    }
    game.players = game.players.filter(player => player !== session);
    if (game.lobby) {
      if (game.players.length === 0) {
        lobbies.delete(game.lobby);
      }
      tellLobby(game);
      return;
    }
    // the games' own "player left": [sfsUserId]. A buddy game takes it for
    // a win, so the one still looking at the result of a game that has been
    // decided is not told. three of them only the clients know the end of
    // (lib/buddygames.js), and at their end both players leave within a
    // moment of each other: there the news waits a little, and reaches
    // only a player who is still in the game by then.
    const tellOthers = () => {
      for (const other of game.players.filter(player => player.game === game)) {
        other.sendXt("ml", game.roomId, session.id);
      }
    };
    if (!game.match) {
      tellOthers();
    }
    else if (!game.match.finished) {
      setTimeout(() => {
        try {
          tellOthers();
        }
        catch (err) {
          console.error(`[minigames] could not tell of a player leaving: ${err.message}`);
        }
      }, LEFT_NOTICE_DELAY_MS).unref();
    }
  };

  // MinigameManager.startGame: [playerCount, sfsUserId..., then for each
  // player an id and their username, then whatever the game adds], which
  // the game reads as "ms". the id is the animal's (perUserAvId): the games
  // that draw their players ask for that animal by it.
  const start = game => {
    game.started = true;
    for (const player of game.players) {
      player.sendXt("ms", game.roomId, game.players.length, ...game.players.map(other => other.id),
        ...game.players.flatMap(other => [activeAvatar(other.account).perUserAvId, other.account.username]),
        ...(game.startData || []));
    }
  };

  // RoomXtCommManager.roomJoinResponse for a game's own room: a temporary
  // game room, which for a game that runs in a window is a "sub room"
  // beside the room the player stays in. then the serial numbers the game's
  // first awards are to be signed with (MinigameManager.minigameGems,
  // minigamePetMastery) and who is in the game (joinGameResponse).
  const seat = (session, game, music) => {
    const avatar = activeAvatar(session.account);
    // off to a game: a bubble still up goes (and its owner is told after).
    if (session.pvpBubble) {
      dropBubble(session);
      session.bubbleOffOwed = true;
    }
    session.game = game;
    session.sendXt("rj", -1, 1, `game${game.def.id}_${game.roomId}`, game.roomId, game.players.length, game.players.length, 0, 0,
      0, 1, 0, 1, game.def.type === IN_ROOM ? 1 : 0, // isPrivate, isGame, isLimbo, isTemp, isSubRoom
      "", 0, avatar.perUserAvId, avatar.petInvId, LANG_ENG, music, 1);
    session.gemSerial = serial();
    session.masterySerial = serial();
    session.sendXt("mg", game.roomId, session.gemSerial, 1);
    session.sendXt("ma", game.roomId, session.masterySerial, 0);
    session.sendXt("mj", game.roomId, ...game.players.map(player => player.id));
  };

  // the waiting lists of multiplayer room games: "<gameDefId> <room>" -> a
  // game not started yet. one is answered "mj" from the room the players
  // wait in, with who waits: the client draws them from that room, so they
  // stay in it till the list is full.
  const lobbies = new Map();
  const tellLobby = game => {
    for (const player of game.players) {
      player.sendXt("mj", game.waitRoom.id, ...game.players.map(other => other.id));
    }
  };
  const joinLobby = (session, def, multi) => {
    const key = `${def.id} ${session.room.name}`;
    let game = lobbies.get(key);
    if (game && game.players.some(player => blocks.either(player.account, session.account))) {
      session.sendXt("mj", -1, "as", 0);
      tell(session, "Someone already waiting for that game is not someone you play with. Try again later.");
      return;
    }
    if (!game) {
      game = {roomId: nextGameRoomId++, def, multi, players: [], started: false, ready: new Set(), lobby: key, waitRoom: session.room};
      lobbies.set(key, game);
    }
    game.players.push(session);
    session.game = game;
    tellLobby(game);
    if (game.players.length >= multi.max) {
      lobbies.delete(key);
      game.lobby = null;
      for (const player of game.players) {
        const music = player.room ? player.room.customMusicDef : 0;
        if (def.type !== IN_ROOM) {
          leaveRoom(player);
        }
        seat(player, game, music);
      }
      start(game);
    }
  };

  // a move in a multiplayer room game, passed on to the other players.
  const relay = (session, game, word, params) => {
    const withId = game.multi.relay[word];
    if (!game.started || params.length > MAX_RELAYED_FIELDS || !params.every(field => RELAYED_FIELD.test(String(field)))
      || !messagesPerMinute.allow(session.account.id)) {
      return;
    }
    for (const other of game.players) {
      if (other !== session) {
        other.sendXt("mm", game.roomId, word, ...(withId ? [session.id] : []), ...params);
      }
    }
  };

  // starts a buddy game between two players (lib/buddygames.js says what
  // `match` is). it runs in a window over whatever room each is in.
  const startMatch = (def, sender, target) => {
    const referee = buddyGames[def.swf];
    const game = {roomId: nextGameRoomId++, def, players: [sender, target], started: false, ready: new Set(),
      startData: referee.startData ? referee.startData() : []};
    const seats = [sender, target];
    game.match = {
      ids: seats.map(session => session.id),
      state: null,
      finished: false,
      ready: new Set(),
      send: (player, ...fields) => seats[player].sendXt("mm", game.roomId, ...fields),
      broadcast: (...fields) => seats.forEach(session => session.sendXt("mm", game.roomId, ...fields)),
      over() {
        game.match.finished = true;
      },
      seatOf: session => seats.indexOf(session),
    };
    for (const session of seats) {
      seat(session, game, session.room ? session.room.customMusicDef : 0);
    }
    start(game);
  };

  const matchMessage = (session, game, word, params) => {
    const {match} = game;
    const referee = buddyGames[game.def.swf];
    const player = match.seatOf(session);
    // nothing more is refereed once the game is decided or a player has gone.
    if (player === -1 || match.finished || game.players.length < 2 || !messagesPerMinute.allow(session.account.id)) {
      return;
    }
    if (word === "ready") {
      // both say so before the first round, and again before each further one.
      if (match.ready.add(player).size === 2) {
        match.ready.clear();
        referee.ready(match);
      }
    }
    else if (Object.hasOwn(referee.messages, word)) {
      referee.messages[word](match, player, params);
    }
  };

  // den items a claw machine can drop: the plushies, of the machine's own
  // animal when it is named for one ("The Wolf Claw").
  let plushies = null;
  // the game's own den items only: a custom item (and a player's own, which
  // is nobody else's to win) may be missing from the winner's game, whose
  // prize popup then threw (DenItem.initShopItem) and left the game frozen.
  const gameOwnDenItemIds = () => defpacks.denItemIds().filter(id => id < customItems.FIRST_ID);
  const clawPrizes = game => {
    plushies = plushies || gameOwnDenItemIds().filter(id => /plush/i.test(defpacks.denItemDef(id).abbrName));
    const item = defpacks.denItemIds().map(id => defpacks.denItemDef(id)).find(def => Number(def.gameDefId) === game.id);
    const animal = item ? /^ArcCraneGame(.+)$/.exec(item.abbrName) : null;
    const own = animal ? plushies.filter(id => defpacks.denItemDef(id).abbrName.toLowerCase().includes(animal[1].toLowerCase())) : [];
    return own.length ? own : plushies;
  };

  // what Phantom Invasion gives: den items named for phantoms, the arcade
  // machines aside.
  let phantomItems = null;
  const invasionPrizes = () => {
    phantomItems = phantomItems || gameOwnDenItemIds().filter(id => /phantom/i.test(defpacks.denItemDef(id).abbrName)
      && !/^Arc/.test(defpacks.denItemDef(id).abbrName) && defpacks.string(defpacks.denItemDef(id).nameStrId));
    return phantomItems.length ? phantomItems : defpacks.denItemIds().slice(0, 1);
  };

  // the Summer Carnival's games (Skeeball and the rest share one protocol):
  // the server opens with "pz" and a serial number, "pg" pays for a go and
  // brings a second one, and "gr" reports the score, signed with both, and
  // is answered with the tickets it earned. how many points make a ticket
  // was the official server's to know; games.json has a guess per game.
  const hideSerial = sn => (sn + 5) * 3 - 7; // undone by the games as (x + 7) / 3 - 5
  const carnival = {
    pg(session, game, params, reply) {
      const {account} = session;
      if ((account.currency.gems || 0) < CARNIVAL_COST) {
        reply("pg", "0");
        return;
      }
      account.currency.gems -= CARNIVAL_COST;
      achievements.currencyChanged(account, "gems", -CARNIVAL_COST);
      accounts.save(account);
      session.sendXt("cu", -1, CURRENCY_GEMS, account.currency.gems, 0);
      game.serial2 = serial();
      reply("pg", "1", hideSerial(game.serial2));
    },
    gr(session, game, [a, b, c], reply) {
      const {account} = session;
      const score = (Number(a) - (game.serial1 + 49) * 5) / 7 - 29;
      const valid = game.serial2 !== undefined && Number.isInteger(score) && score >= 0
        && Number(b) === (score + 49) * 3 + (game.serial2 + 83) * 5
        && Number(c) === (game.serial1 + score) * 3 + score * 3
        && awardsPerMinute.allow(account.id);
      game.serial2 = undefined; // one score a go
      const tickets = valid ? Math.min(MAX_TICKETS_PER_GO, Math.ceil(score / game.def.tickets)) : 0;
      if (tickets > 0) {
        account.currency.tickets = (account.currency.tickets || 0) + tickets;
        achievements.currencyChanged(account, "tickets", tickets);
        accounts.save(account);
        session.sendXt("cu", -1, CURRENCY_TICKETS, account.currency.tickets, 0);
      }
      reply("gr", tickets);
    },
  };

  // refused to an account under a day old: the game shows its "could not
  // send" popup, and a plain message box ("xtl") says why.
  const uploadToken = (session, game, [, purpose], reply) => {
    const token = masterpieces.issueToken(session.account);
    if (!token) {
      const why = masterpieces.tooNew(session.account) || "Your Masterpiece could not be sent. Try again later.";
      session.sendXt("xtl", -1, why.replace(/%/g, " percent"));
    }
    reply("tkn", token ? 1 : 0, 0, token || "", 0, purpose === undefined ? 1 : Number(purpose) || 1);
  };

  // what a game asks of the server while it runs, by game class and then by
  // the message's first word. `reply` answers the asker as an "mm".
  const MESSAGES = {
    // These machines do not give an inventory item.  They award temporary
    // Holdable Icons: popcorn (emoticon 1), smoothies (2), and hot cocoa
    // (5).  The final field carries the selected visual state.
    MicroPopcorn: {
      _a(session, game, [kind], reply) {
        if (kind === "1") {
          grantAttachment(session, game, reply, 1);
        }
      },
    },
    MicroSmoothie: {
      _a(session, game, [kind, colour], reply) {
        const selected = String(colour || "").toLowerCase();
        if (kind === "2" && SMOOTHIE_COLOURS.has(selected)) {
          grantAttachment(session, game, reply, 2, selected);
        }
      },
    },
    MicroHotCocoa: {
      _a(session, game, [kind, cocoaInfo], reply) {
        if (kind === "5") {
          grantAttachment(session, game, reply, 5, cocoaInfo);
        }
      },
    },
    CottonCandy: {
      _a(session, game, [kind, emoticonInfo], reply) {
        if (kind === "30") {
          grantAttachment(session, game, reply, 30, emoticonInfo);
        }
      },
    },
    BradyChemistrySet: {
      _a(session, game, [kind, emoticonInfo], reply) {
        if (kind === "6") {
          grantAttachment(session, game, reply, 6, emoticonInfo);
        }
      },
    },
    // the claw machines: "cp" pays for a go and learns whether the claw
    // will hold and what on ([won, isDenItem, defId, ?, version]; anything
    // but 1 or 0 for `won` means "not enough gems"); "cd" keeps (1) or
    // leaves (0) what came out.
    MicroCrane: {
      cp(session, game, params, reply) {
        const {account} = session;
        if ((account.currency.gems || 0) < CLAW_COST) {
          reply("cp", "2");
          return;
        }
        account.currency.gems -= CLAW_COST;
        achievements.currencyChanged(account, "gems", -CLAW_COST);
        accounts.save(account);
        session.sendXt("cu", -1, CURRENCY_GEMS, account.currency.gems, 0);
        const prizes = clawPrizes(game.def);
        const won = prizes.length > 0 && Math.random() < CLAW_WIN_CHANCE;
        session.clawPrize = won ? prizes[Math.floor(Math.random() * prizes.length)] : null;
        reply("cp", won ? "1" : "0", "1", session.clawPrize || 0, 0, 0);
      },
      cd(session, game, [keep]) {
        if (keep === "1" && session.clawPrize) {
          dens.giveDenItem(session.account, session.clawPrize);
          dens.sendDenItems(session);
        }
        session.clawPrize = null;
      },
    },
    // sky High: "gw" on reaching the top -> [won, clothingDefId, ?, colour];
    // "gd" keeps (1) or leaves (0) the prize.
    WindRider: {
      go() {},
      gw(session, game, params, reply) {
        const ids = defpacks.clothingIds().filter(id => id < customItems.FIRST_ID);
        const def = Math.random() < SKY_HIGH_PRIZE_CHANCE ? defpacks.itemDef(ids[Math.floor(Math.random() * ids.length)]) : null;
        session.gamePrize = def ? {def: Number(def.id), color: Number(String(def.colors).split(",")[0])} : null;
        reply("gw", def ? "1" : "0", def ? def.id : 0, 0, def ? session.gamePrize.color : 0);
      },
      gd(session, game, [keep]) {
        if (keep === "1" && session.gamePrize) {
          sendClothingAdded(session, addClothing(session.account, session.gamePrize.def, session.gamePrize.color));
          accounts.save(session.account);
        }
        session.gamePrize = null;
      },
    },
    // the safety quiz: "hs" asks for a serial number, and "hp", signed with
    // it, claims the quiz's one prize.
    SafetyQuiz: {
      hs(session, game, params, reply) {
        session.prizeSerial = serial();
        reply("hs", session.prizeSerial);
      },
      hp(session, game, [, check]) {
        if (session.prizeSerial !== undefined && Number(check) === (session.prizeSerial + session.id) * 3) {
          dens.giveDenItem(session.account, SAFETY_QUIZ_PRIZE);
          dens.sendDenItems(session);
        }
        session.prizeSerial = undefined;
      },
    },
    // brady Barr's expeditions ask for the same serial; their prizes hang on
    // the theatre's films and are not given.
    BradyExpeditions: {
      hs(session, game, params, reply) {
        reply("hs", serial());
      },
      hp() {},
    },
    // the touch pool: the same again, with six prizes; which one is in the
    // first number.
    TouchPool: {
      ts(session, game, params, reply) {
        session.prizeSerial = serial();
        reply("ts", session.prizeSerial);
      },
      tp(session, game, [signed, check]) {
        const sn = session.prizeSerial;
        const prize = sn === undefined ? -1 : (Number(signed) - (session.id + 99) * 3 - (sn + 49) * 5) / 5;
        if (TOUCH_POOL_PRIZES[prize] !== undefined && Number(check) === (sn + session.id + prize) * 3 + prize * 3) {
          dens.giveDenItem(session.account, TOUCH_POOL_PRIZES[prize]);
          dens.sendDenItems(session);
        }
        session.prizeSerial = undefined; // one prize a serial number
      },
    },
    // phantom Invasion: "cp" pays for a go and names the prize a win will
    // bring, [ok, serial, isDenItem, defId, ?, version]; the game itself
    // decides whether it was won. "cd", signed with the serial, keeps it;
    // "cd 2" leaves it and "cd 0" is a lost round.
    MicroGameInvasion: {
      cp(session, game, params, reply) {
        const {account} = session;
        if ((account.currency.gems || 0) < INVASION_COST) {
          reply("cp", "2");
          return;
        }
        account.currency.gems -= INVASION_COST;
        achievements.currencyChanged(account, "gems", -INVASION_COST);
        accounts.save(account);
        session.sendXt("cu", -1, CURRENCY_GEMS, account.currency.gems, 0);
        const prizes = invasionPrizes();
        session.prizeSerial = serial();
        session.gamePrize = prizes[Math.floor(Math.random() * prizes.length)];
        reply("cp", "1", session.prizeSerial, "1", session.gamePrize, 0, 0);
      },
      cd(session, game, [signed, check]) {
        const sn = session.prizeSerial;
        const won = sn !== undefined && session.gamePrize
          && Number(signed) === INVASION_WIN * 5 + (session.id + 99) * 3 + (sn + 49) * 5
          && Number(check) === (sn + session.id + INVASION_WIN) * 3 + INVASION_WIN * 3;
        if (won) {
          dens.giveDenItem(session.account, session.gamePrize);
          dens.sendDenItems(session);
        }
        session.prizeSerial = undefined;
        session.gamePrize = null;
      },
    },
    // the Art Studio's two easels: "gmtkn" asks for a token to post a
    // painting with (lib/masterpieces.js). the game reads [word, ok, ?,
    // token, ?, what the token is for], the last as it was sent.
    ArtStudioPainting: {gmtkn: uploadToken},
    ArtStudioGridDrawing: {gmtkn: uploadToken},
    // the Phantom Vortex's prize machine: anything but "0" is "no prize".
    MicroPhantom: {
      pi(session, game, params, reply) {
        reply("cp", "1");
      },
    },
  };

  const handlers = {
    // MinigameXtCommManager.handleMinigameInfo: [count, 19 fields a game...].
    // RoomManagerWorld asks for every game standing in a room at once and
    // draws none of their signs unless it hears about all of them.
    mi(session, roomId, ids) {
      const asked = ids.slice(0, MAX_INFO_REQUEST).map(Number).filter(id => Number.isInteger(id) && id > 0);
      // the easel's "play" popup offers both painting games and reads the
      // second one's description without having asked for it
      // (GameCardPopup, for game 51): it goes along.
      if (asked.includes(GAME_PAINTING) && !asked.includes(GAME_PIXEL_PAINTING)) {
        asked.push(GAME_PIXEL_PAINTING);
      }
      const known = asked.map(id => games.get(id) || {...UNKNOWN_GAME, id});
      session.sendXt("mi", -1, known.length, ...known.flatMap(info));
    },

    // MinigameManager.launchGame: [gameDefId, multiplayer, proModeId, ?].
    mj(session, roomId, [gameDefId, multiplayer]) {
      leave(session); // a game left without a word, if any
      const def = games.get(Number(gameDefId));
      if (!def || def.ready === false || def.buddy || !session.room) {
        // "as": the one refusal that puts the client back as it was. it
        // comes with a popup about switching animals, hence one of our own.
        session.sendXt("mj", -1, "as", 0);
        tell(session, "That game is not ready on this server yet.");
        return;
      }
      if (multiplayer === "1" && Object.hasOwn(MULTIPLAYER, def.swf)) {
        joinLobby(session, def, MULTIPLAYER[def.swf]);
        return;
      }
      const game = {roomId: nextGameRoomId++, def, players: [session], started: false, ready: new Set()};
      const music = session.room.customMusicDef; // the client takes this from every room join
      if (def.type !== IN_ROOM) {
        // the game takes the room's place: the player is gone from the
        // world until they come back with an ordinary room join.
        game.returnTo = session.room.name;
        leaveRoom(session);
      }
      seat(session, game, music);
      start(game);
      if (def.tickets) {
        game.serial1 = serial();
        session.sendXt("mm", game.roomId, "pz", hideSerial(game.serial1));
      }
    },

    // "Start now", from a waiting list; nobody waits here.
    ms() {},

    // MinigameManager.msg: [gameDefId, word, ...]. the game's own protocol.
    mm(session, roomId, [gameDefId, word, ...params]) {
      const {game} = session;
      if (!game || game.def.id !== Number(gameDefId)) {
        return;
      }
      if (game.match) {
        matchMessage(session, game, String(word), params);
        return;
      }
      if (game.multi && Object.hasOwn(game.multi.relay, String(word))) {
        relay(session, game, String(word), params);
        return;
      }
      const reply = (...fields) => session.sendXt("mm", game.roomId, ...fields);
      const own = game.def.tickets ? carnival : MESSAGES[game.def.swf];
      if (own && Object.hasOwn(own, word)) {
        own[word](session, game, params, reply);
      }
      else if (word === "ready" && game.def.start && Object.hasOwn(START, game.def.start)) {
        game.ready.add(session);
        if (game.ready.size === game.players.length) {
          for (const player of game.players) {
            player.sendXt("mm", game.roomId, "start", ...START[game.def.start](game));
          }
        }
      }
    },

    // leaving an in-room game: [subRoomId]. (A game that took the room's
    // place is left by joining a room again.)
    rl(session) {
      leave(session);
    },
    ml(session) {
      leave(session);
    },

    // MinigameManager.sendGemAward: three numbers made of the amount, the
    // game, the player's sfs id and the serial number last handed out (the
    // second, which names the game, is not checked: not every game says
    // which it is). the reply is the next serial number.
    mg(session, roomId, [a, , c]) {
      const {account, game} = session;
      const sn = session.gemSerial;
      const amount = (Number(a) - (session.id + 99) * 3 - (sn + 49) * 5) / 7 - 29;
      const valid = game && sn !== undefined && Number.isInteger(amount) && amount > 0 && amount <= MAX_GEMS_PER_AWARD
        && Number(c) === (sn + session.id + amount) * 3 + amount * 3
        && awardsPerMinute.allow(account.id);
      if (valid) {
        account.currency.gems = (account.currency.gems || 0) + amount;
        achievements.currencyChanged(account, "gems", amount);
        accounts.save(account);
      }
      session.gemSerial = serial();
      session.sendXt("mg", -1, session.gemSerial, 0);
    },

    // MinigameManager.sendMasteryPoints, the same for the pet's mastery. the
    // second field of the reply says its mastery is now full.
    ma(session, roomId, [a, b, c]) {
      const {account, game} = session;
      const sn = session.masterySerial;
      const amount = (Number(a) - (session.id + 99) * 3 - (sn + 49) * 5) / 7 - 29;
      const pet = account.pets.find(candidate => candidate.inv === activeAvatar(account).petInvId);
      const valid = game && pet && sn !== undefined && Number.isInteger(amount) && amount > 0 && amount <= MAX_MASTERY_PER_AWARD
        && Number(c) === (sn + session.id + amount) * 3 + amount * 3 && Number(b) === (game.def.id + 49) * 3 + (sn + 83) * 5;
      let nowFull = false;
      if (valid && (pet.mastery || 0) < MASTERY_FULL) {
        pet.mastery = Math.min(MASTERY_FULL, (pet.mastery || 0) + amount);
        nowFull = pet.mastery === MASTERY_FULL;
        accounts.save(account);
      }
      session.masterySerial = serial();
      session.sendXt("ma", -1, session.masterySerial, nowFull ? 1 : 0);
    },

    // high scores for the leaderboards, which are not kept.
    msv() {},
    // MinigameManager.leaderBoardResponse: [gameDefId, count, ...]
    mlb(session, roomId, [gameDefId]) {
      session.sendXt("mlb", -1, gameDefId, 0);
    },
    // the buddy games (MinigameXtCommManager.sendMinigamePvpMsg): [gameDefId,
    // 0, username] invites that player; [gameDefId, 0] from the invited
    // player says yes, and [gameDefId, 1] from either says no or never mind.
    // MinigameManager.pvpResponse reads [gameDefId, 0, who is asking, their
    // name may be shown] and [gameDefId, 1] for "no".
    mp(session, roomId, [gameDefId, status, username]) {
      const def = games.get(Number(gameDefId));
      if (status !== "0") {
        dropInvite(session);
        return;
      }
      if (username === undefined || username === "") {
        const {invite} = session;
        if (invite && invite.target === session && invite.def === def && !invite.sender.game && !session.game) {
          dropInvite(session, false);
          startMatch(def, invite.sender, session);
        }
        else {
          dropInvite(session);
        }
        return;
      }
      const target = findOnline(username);
      const free = other => other && other.room && !other.game && !other.invite;
      if (!def || !def.buddy || !free(session) || !free(target) || target === session
        || blocks.either(session.account, target.account) || !invitesPerMinute.allow(session.account.id)
        || !accounts.featureOn(session.account, "gameInvites") || !accounts.featureOn(target.account, "gameInvites")) {
        // "They said no" is all the client has for an invitation that cannot be made.
        dropInvite(session);
        session.sendXt("mp", -1, def ? def.id : Number(gameDefId) || 0, 1);
        return;
      }
      session.invite = target.invite = {def, sender: session, target};
      target.sendXt("mp", -1, def.id, 0, session.account.username, 1);
    },
    // a click on another player's game bubble (MinigameXtCommManager
    // .sendMinigameCustomPvpJoinMsg): [gameDefId, 0, their username]. the
    // game starts at once, as an invitation said yes to; a bubble that is
    // gone by now is answered as an invitation said no to
    // (MinigameManager.pvpResponse), which puts the clicker back as they were.
    mcp(session, roomId, [gameDefId, , username]) {
      const def = games.get(Number(gameDefId));
      const host = findOnline(String(username || ""));
      const free = player => player && player.room && !player.game && !player.invite;
      if (!def || !host || host === session || host.pvpBubble !== def.id || host.room !== session.room
        || !free(session) || !free(host) || blocks.either(session.account, host.account)
        || !accounts.featureOn(session.account, "gameInvites")) {
        session.sendXt("mp", -1, def ? def.id : Number(gameDefId) || 0, 1);
        return;
      }
      startMatch(def, host, session);
    },
  };

  // the HUD's Games window (GameJoinPopup, generic list 341): the playable
  // games that have a picture for it, by name. A buddy game's card picture
  // is drawn the same way, and picking one there puts its bubble up.
  const library = [...games.values()].filter(game => (game.icon || (game.buddy && game.card)) && game.ready !== false)
    .sort((one, other) => one.title.localeCompare(other.title)).map(game => game.id);

  // the buddy games' descriptions, sent unasked when a player arrives: a
  // player's card lists whichever games the client has heard are ready to
  // be played against another player (MinigameInfoCache.getAllReadyForPvpGameDefs).
  const greet = session => {
    const buddy = [...games.values()].filter(game => game.buddy && Object.hasOwn(buddyGames, game.swf));
    session.sendXt("mi", -1, buddy.length, ...buddy.flatMap(info));
  };

  return {
    handlers,
    leave,
    greet,
    bubble,
    showBubble,
    // out of the room: nobody there is left to see the bubble.
    roomLeft: session => {
      session.pvpBubble = null;
    },
    library: () => library,
    // the room a player in a room-replacing game came from, for the panel.
    playing: session => (session.game ? session.game.def.title : null),
  };
};
