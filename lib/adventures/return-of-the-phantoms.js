"use strict";

// return of the Phantoms (script def 14), normal mode, written from a
// recording of the official game of 2026-10-12: one player, who plugged
// the four pipes, watered the eight plants, fetched the key from the
// burrow, freed the four bunnies and took a prize; was zapped down once,
// fed four phantoms to the plants and opened two chests. what was sent
// there is sent here. marked "guessed" below is what that run did not do.
//
// commands ("qcmd"): 1 sets an actor's [state, visible, needs a click],
// and state 99 takes it out of the adventure (all that belongs to hard
// mode goes that way at the start); 2 has an actor say a string; 3 has it
// talk and wait for an answer; 7 takes what the player carries; 14 puts
// the player at a spawn point; 38 is the line under the top of the
// screen; 19 ends the adventure. "qcmdVT" sets a counter or a timer,
// "qsp" a phantom's path.

// kinds of prize (QuestManager.handlePickGift).
const GIFT_DEN_ITEM = 1;
const GIFT_GEMS = 3;

const set = (q, name, state, visible, click) => q.send("qcmd", 1, name, state, visible, click);
const counter = (q, name, value) => q.send("qcmdVT", 1, name, value, 0, 0);
const say = (q, name, text) => q.send("qcmd", 2, name, text, 1);
const goal = (q, text) => q.send("qcmd", 38, text);
// the official game counts its page views this way; the client is told.
const page = (q, flag, name) => {
  counter(q, flag, 1);
  q.send("qposturi", `/adventure1-returnofthephantoms/#${name}/#0#001`);
  counter(q, flag, 99);
};
const lizaAppears = (q, name) => {
  q.send("qswfs", name, "facesw");
  q.send("qswfs", name, "appear");
  set(q, name, 1, 1, 1);
};
const phantoms = (q, list) => {
  for (const [name, path] of list) {
    if (path) {
      q.send("qsp", name, path);
    }
    set(q, name, 1, 1, 1);
  }
};
const pick = letters => letters[Math.floor(Math.random() * letters.length)];

const NORMAL_FLOWERS = [1, 2, 3, 4, 9, 10, 11, 12];
const flowerTrigger = number => (number < 10 ? `flowertrig_${number}` : `flowertrig${number}`);
// everything of hard mode, taken out when a normal adventure begins.
const HARD_ONLY = ["hard", "phan_door_h", "phan_block_h", "phan_trig_h", "blocker_e", "pipe_5", "pipe_6", "sludge_5", "sludge_6",
  "flowers_5", "flowers_6", "flowers_7", "flowers_8", "well_1h", "checkpoint2", "spawn_2"];
const PIPE_GOALS = {5: 3546, 6: 3547}; // "Find 2 more CORKS...", "Find the last CORK..."
// chests the recording opened; the others are guessed at 50.
const CHEST_GEMS = {treasure_3: 100, treasure_4: 50};
const GUESSED_CHEST_GEMS = 50;
const PRIZES = [[GIFT_DEN_ITEM, 1288, 0], [GIFT_DEN_ITEM, 1289, 0], [GIFT_DEN_ITEM, 1290, 0], [GIFT_GEMS, 500, 500], [GIFT_DEN_ITEM, 1291, 0]];

const pipePlugged = (q, pipe) => {
  const number = pipe.slice("pipetrig_".length);
  // guessed: without a cork in hand the pipe says a cork fits in it.
  if (!/^cork_/.test(q.held() || "")) {
    say(q, pipe, 3468);
    return;
  }
  if (q.vars.plugged.has(pipe)) {
    return;
  }
  q.vars.plugged.add(pipe);
  q.use();
  set(q, `pipe_${number}`, 1, 1, 0);
  set(q, `sludge_${number}`, 1, 0, 0);
  set(q, pipe, 2, 0, 0);
  if (q.vars.plugged.size === 1) {
    // the first, with the bunny's cork: phantoms come, and the other three
    // pipes can be plugged.
    counter(q, "watervar", 1);
    phantoms(q, [["phantom_2", "path_2"], ["phantom_3", "path_3"], ["phantom_4", null]]);
    q.xp(5, pipe);
    q.after(650, () => {
      set(q, "bunny_2", 1, 1, 1);
      say(q, "bunny_2", 3467);
      set(q, "bunny_2", 2, 1, 0);
      counter(q, "watervar", 4);
      goal(q, 3472);
      for (const other of ["pipetrig_2", "pipetrig_3", "pipetrig_4"]) {
        set(q, other, 1, 1, 1);
      }
      q.after(2000, () => {
        set(q, "vineblock_2", 1, 0, 0);
        set(q, "vine_2", 1, 1, 0);
      });
    });
    return;
  }
  const water = 3 + q.vars.plugged.size; // 5, 6, then 7 for the last
  counter(q, "watervar", water);
  if (water < 7) {
    goal(q, PIPE_GOALS[water]);
    q.xp(5, pipe);
    return;
  }
  // the water runs clean: pails at the well, and eight plants to revive.
  set(q, "sludgewall", 1, 0, 0);
  set(q, "waterfall", 1, 1, 0);
  set(q, "water_1", 0, 1, 0);
  set(q, "well_1", 0, 1, 0);
  set(q, "pail_1", 1, 1, 0);
  set(q, "pail_2", 1, 1, 0);
  goal(q, 14989);
  counter(q, "flower_count", 4);
  goal(q, 3478);
  set(q, "watervol_1", 1, 0, 0);
  for (const number of NORMAL_FLOWERS) {
    set(q, flowerTrigger(number), 1, 1, 1);
  }
  set(q, "bunny_2", 3, 1, 1);
  set(q, "bunny_1", 2, 1, 1);
  q.xp(15, "waterdone");
  page(q, "10_uri", "10-plugthepipes");
  q.xp(5, pipe);
  q.after(2560, () => q.send("qsnd", "ajq_riverclear"));
};

const flowerWatered = (q, trigger) => {
  const number = trigger.replace(/\D/g, "");
  if (!/^pail_/.test(q.held() || "") || q.vars.watered.has(trigger)) {
    return;
  }
  q.vars.watered.add(trigger);
  q.use();
  set(q, `flowers_${number}`, 0, 1, 0);
  set(q, trigger, 2, 0, 0);
  const count = 4 + q.vars.watered.size; // the counter starts at 4 and ends at 12
  counter(q, "flower_count", count);
  goal(q, 3474 + count); // 3479 "... 7 more PLANTS" to 3486
  if (count === 12) {
    // the burrow opens.
    set(q, "trig_1a", 1, 1, 1);
    set(q, "nobody_home", 1, 0, 0);
    set(q, "bunnyblocker", 1, 0, 0);
    set(q, "burrow_door", 1, 1, 0);
    for (const pail of ["pail_1", "pail_2", "pail_3"]) {
      set(q, pail, 2, 0, 0);
    }
    q.xp(15, "flower_count");
    set(q, "bunny_12", 1, 1, 0);
    page(q, "20_uri", "20-revivetheplants");
  }
  q.xp(5, trigger);
};

const bunnyFreed = (q, bunny) => {
  const number = Number(bunny.slice("bunny_".length));
  if (!/^bunny_key_/.test(q.held() || "") || q.vars.freed.has(bunny)) {
    return;
  }
  q.vars.freed.add(bunny);
  q.use();
  q.xp(10, bunny);
  set(q, `cage${number}_f`, 1, 1, 0);
  set(q, `cage${number}_b`, 1, 1, 0);
  q.send("qswfs", bunny, "dance");
  set(q, bunny, 1, 1, 0);
  const count = q.vars.freed.size;
  counter(q, "trap_count", count);
  goal(q, 3572 + count); // "Find 3 KEYS..." down to "Adventure COMPLETE!"
  if (count === 4) {
    q.xp(25, "trap_count");
    lizaAppears(q, "liza_2");
    page(q, "30_uri", "30-rescuethebunnies");
  }
  say(q, bunny, 3561 + number); // bunny_7 says 3568, ... bunny_10 3571
};

module.exports = {
  defId: 14,
  title: "Return of the Phantoms",
  lobby: true,
  rooms: {
    start: {room: "adventures.room_adventure_1x", name: "On An Adventure", nameStringId: 18324, music: "ajq_musquest"},
    burrow: {room: "adventures.room_adventure_1a", name: "On an Adventure", nameStringId: 18324, music: "ajq_musbunnyburrow"},
  },
  written: "2017-10-30 22:02:01",
  objective: 3465, // "TALK to Liza."
  refills: /^pail_/, // a pail in hand is filled again at the well

  // name, type, def, state, visible, needs a click, path, artwork state
  actors: [
    ["queststart", 18, 0, 0, 1, 1, "", ""],
    ["questready", 7, 0, 0, 1, 1, "", ""],
    ["checkpoint2", 27, 0, 0, 1, 1, "", ""],
    ["checkpoint4", 27, 0, 0, 1, 1, "", ""],
    ["start_init", 8, 0, 0, 0, 1, "", ""],
    ["water_time", 8, 0, 0, 0, 1, "", ""],
    ["bunnytimer_1", 8, 0, 0, 0, 1, "", ""],
    ["bunnytimer_2", 8, 0, 0, 0, 1, "", ""],
    ["bunnytimer_3", 8, 0, 0, 0, 1, "", ""],
    ["bunnytimer_4", 8, 0, 0, 0, 1, "", ""],
    ["blocktimer_1", 8, 0, 0, 0, 1, "", ""],
    ["phan_timer_1", 8, 0, 0, 0, 1, "", ""],
    ["gifttimer", 8, 0, 0, 0, 1, "", ""],
    ["players", 7, 0, 0, 1, 1, "", ""],
    ["waterdone", 7, 0, 0, 1, 1, "", ""],
    ["watervar", 7, 0, 0, 0, 1, "", ""],
    ["flower_count", 7, 0, 0, 0, 1, "", ""],
    ["trap_count", 7, 0, 0, 0, 1, "", ""],
    ["spawn_1_a", 9, 1, 0, 1, 1, "", ""],
    ["trig_1_a", 3, 0, 0, 1, 1, "", ""],
    ["spawn_1a", 9, 0, 0, 1, 1, "", ""],
    ["trig_1a", 3, 0, 0, 0, 1, "", ""],
    ["spawn_1_b", 9, 2, 0, 1, 1, "", ""],
    ["trig_1_b", 3, 0, 0, 1, 1, "", ""],
    ["spawn_1b", 9, 0, 0, 1, 1, "", ""],
    ["trig_1b", 3, 0, 0, 1, 1, "", ""],
    ["liza_1", 1, 21, 0, 0, 1, "", ""],
    ["liza_2", 1, 21, 0, 0, 1, "", ""],
    ["bunny_1", 1, 88, 0, 1, 1, "", "facesw"],
    ["bunny_2", 1, 89, 0, 1, 1, "", ""],
    ["bunny_3", 1, 90, 0, 1, 1, "", "facesw"],
    ["bunnytrig_3", 3, 0, 0, 1, 1, "", ""],
    ["bunny_4", 1, 91, 0, 1, 1, "", "facesw"],
    ["bunny_5", 1, 92, 0, 1, 1, "", ""],
    ["bunny_6", 1, 93, 0, 1, 1, "", ""],
    ["bunny_7", 1, 94, 0, 1, 1, "", ""],
    ["bunny_8", 1, 95, 0, 1, 1, "", ""],
    ["bunny_9", 1, 96, 0, 1, 1, "", "facesw"],
    ["bunny_10", 1, 97, 0, 1, 1, "", "facesw"],
    ["bunny_11", 1, 98, 0, 1, 1, "", ""],
    ["bunny_12", 1, 101, 0, 1, 1, "", "facesw"],
    ["nobody_home", 1, 44, 0, 1, 1, "", ""],
    ["pipeinfo_1", 1, 116, 0, 0, 1, "", ""],
    ["pipeinfo_2", 1, 116, 0, 0, 1, "", ""],
    ["pipeinfo_3", 1, 116, 0, 0, 1, "", ""],
    ["pipeinfo_4", 1, 116, 0, 0, 1, "", ""],
    ["pipeinfo_5", 1, 116, 0, 0, 1, "", ""],
    ["pipeinfo_6", 1, 116, 0, 0, 1, "", ""],
    ["pipetrig_1", 1, 69, 0, 0, 1, "", ""],
    ["pipetrig_2", 1, 69, 0, 0, 1, "", ""],
    ["pipetrig_3", 1, 69, 0, 0, 1, "", ""],
    ["pipetrig_4", 1, 69, 0, 0, 1, "", ""],
    ["pipetrig_5", 1, 69, 0, 0, 1, "", ""],
    ["pipetrig_6", 1, 69, 0, 0, 1, "", ""],
    ["flowerinfo_1", 1, 116, 0, 0, 1, "", ""],
    ["flowerinfo_2", 1, 116, 0, 0, 1, "", ""],
    ["flowerinfo_3", 1, 116, 0, 0, 1, "", ""],
    ["flowerinfo_4", 1, 116, 0, 0, 1, "", ""],
    ["flowerinfo_5", 1, 116, 0, 0, 1, "", ""],
    ["flowerinfo_6", 1, 116, 0, 0, 1, "", ""],
    ["flowerinfo_7", 1, 116, 0, 0, 1, "", ""],
    ["flowerinfo_8", 1, 116, 0, 0, 1, "", ""],
    ["flowerinfo_9", 1, 116, 0, 0, 1, "", ""],
    ["flowerinfo10", 1, 116, 0, 0, 1, "", ""],
    ["flowerinfo11", 1, 116, 0, 0, 1, "", ""],
    ["flowerinfo12", 1, 116, 0, 0, 1, "", ""],
    ["flowertrig_1", 1, 67, 0, 0, 1, "", ""],
    ["flowertrig_2", 1, 67, 0, 0, 1, "", ""],
    ["flowertrig_3", 1, 67, 0, 0, 1, "", ""],
    ["flowertrig_4", 1, 67, 0, 0, 1, "", ""],
    ["flowertrig_5", 1, 67, 0, 0, 1, "", ""],
    ["flowertrig_6", 1, 67, 0, 0, 1, "", ""],
    ["flowertrig_7", 1, 67, 0, 0, 1, "", ""],
    ["flowertrig_8", 1, 67, 0, 0, 1, "", ""],
    ["flowertrig_9", 1, 67, 0, 0, 1, "", ""],
    ["flowertrig10", 1, 67, 0, 0, 1, "", ""],
    ["flowertrig11", 1, 67, 0, 0, 1, "", ""],
    ["flowertrig12", 1, 67, 0, 0, 1, "", ""],
    ["plant_1", 21, 100, 0, 1, 1, "", ""],
    ["plant_2", 21, 100, 0, 1, 1, "", ""],
    ["plant_3", 21, 100, 0, 1, 1, "", ""],
    ["plant_4", 21, 100, 0, 1, 1, "", ""],
    ["plant_5", 21, 100, 0, 1, 1, "", ""],
    ["plant_6", 21, 100, 0, 1, 1, "", ""],
    ["plant_7", 21, 100, 0, 1, 1, "", ""],
    ["plant_8", 21, 100, 0, 1, 1, "", ""],
    ["plant_9", 21, 100, 0, 1, 1, "", ""],
    ["plant_10", 21, 100, 0, 1, 1, "", ""],
    ["plant_11", 21, 100, 0, 1, 1, "", ""],
    ["plant_12", 21, 100, 0, 1, 1, "", ""],
    ["plant_13", 21, 100, 0, 1, 1, "", ""],
    ["plant_14", 21, 100, 0, 1, 1, "", ""],
    ["plant_15", 21, 100, 0, 1, 1, "", ""],
    ["plant_16", 21, 100, 0, 1, 1, "", ""],
    ["plant_17", 21, 100, 0, 1, 1, "", ""],
    ["plant_18", 21, 100, 0, 1, 1, "", ""],
    ["path_1", 20, 0, 0, 0, 1, "", ""],
    ["path_2", 20, 0, 0, 0, 1, "", ""],
    ["path_2_h", 20, 0, 0, 0, 1, "", ""],
    ["path_3", 20, 0, 0, 0, 1, "", ""],
    ["path_3_h", 20, 0, 0, 0, 1, "", ""],
    ["path_5", 20, 0, 0, 0, 1, "", ""],
    ["path_5_h", 20, 0, 0, 0, 1, "", ""],
    ["path_6", 20, 0, 0, 0, 1, "", ""],
    ["path_7", 20, 0, 0, 0, 1, "", ""],
    ["path_8a", 20, 0, 0, 0, 1, "", ""],
    ["path_8b", 20, 0, 0, 0, 1, "", ""],
    ["path_9", 20, 0, 0, 0, 1, "", ""],
    ["path_9_h", 20, 0, 0, 0, 1, "", ""],
    ["path_11", 20, 0, 0, 0, 1, "", ""],
    ["path_11_h", 20, 0, 0, 0, 1, "", ""],
    ["path_12", 20, 0, 0, 0, 1, "", ""],
    ["path_12_h", 20, 0, 0, 0, 1, "", ""],
    ["path_13_h", 20, 0, 0, 0, 1, "", ""],
    ["path_14_h", 20, 0, 0, 0, 1, "", ""],
    ["path_15_h", 20, 0, 0, 0, 1, "", ""],
    ["path_17_h", 20, 0, 0, 0, 1, "", ""],
    ["path_18_h", 20, 0, 0, 0, 1, "", ""],
    ["path_19_h", 20, 0, 0, 0, 1, "", ""],
    ["pail_1", 17, 1955, 0, 0, 1, "", ""],
    ["pail_2", 17, 1955, 0, 0, 1, "", ""],
    ["pail_3", 17, 1955, 0, 0, 1, "", ""],
    ["cork_1", 15, 1937, 0, 0, 1, "", ""],
    ["cork_2a", 15, 1937, 0, 0, 1, "", ""],
    ["cork_2a_h", 15, 1937, 0, 0, 1, "", ""],
    ["cork_2b", 15, 1937, 0, 0, 1, "", ""],
    ["cork_2b_h", 15, 1937, 0, 0, 1, "", ""],
    ["cork_2c", 15, 1937, 0, 0, 1, "", ""],
    ["cork_2c_h", 15, 1937, 0, 0, 1, "", ""],
    ["cork_3a", 15, 1937, 0, 0, 1, "", ""],
    ["cork_3a_h", 15, 1937, 0, 0, 1, "", ""],
    ["cork_3b", 15, 1937, 0, 0, 1, "", ""],
    ["cork_3b_h", 15, 1937, 0, 0, 1, "", ""],
    ["cork_3c", 15, 1937, 0, 0, 1, "", ""],
    ["cork_3c_h", 15, 1937, 0, 0, 1, "", ""],
    ["cork_4a", 15, 1937, 0, 0, 1, "", ""],
    ["cork_4a_h", 15, 1937, 0, 0, 1, "", ""],
    ["cork_4b", 15, 1937, 0, 0, 1, "", ""],
    ["cork_4b_h", 15, 1937, 0, 0, 1, "", ""],
    ["cork_4c", 15, 1937, 0, 0, 1, "", ""],
    ["cork_4c_h", 15, 1937, 0, 0, 1, "", ""],
    ["cork_5a_h", 15, 1937, 0, 0, 1, "", ""],
    ["cork_5b_h", 15, 1937, 0, 0, 1, "", ""],
    ["cork_5c_h", 15, 1937, 0, 0, 1, "", ""],
    ["cork_6a_h", 15, 1937, 0, 0, 1, "", ""],
    ["cork_6b_h", 15, 1937, 0, 0, 1, "", ""],
    ["cork_6c_h", 15, 1937, 0, 0, 1, "", ""],
    ["spawn_1", 16, "ajq_spawnpointlp", 0, 1, 1, "", ""],
    ["spawn_2", 16, "ajq_spawnpointlp", 0, 1, 1, "", ""],
    ["spawn_3", 16, "ajq_spawnpointlp", 0, 1, 1, "", ""],
    ["spawn_4", 16, "ajq_spawnpointlp", 0, 1, 1, "", ""],
    ["waterfall", 16, "ajq_waterfall_lp", 0, 0, 1, "", ""],
    ["sludgewall", 16, "ajq_sludge_lp", 0, 1, 1, "", ""],
    ["sludge_1", 16, "ajq_sludge_lp", 0, 1, 1, "", ""],
    ["sludge_2", 16, "ajq_sludge_lp", 0, 1, 1, "", ""],
    ["sludge_3", 16, "ajq_sludge_lp", 0, 1, 1, "", ""],
    ["sludge_4", 16, "ajq_sludge_lp", 0, 1, 1, "", ""],
    ["sludge_5", 16, "ajq_sludge_lp", 0, 1, 1, "", ""],
    ["sludge_6", 16, "ajq_sludge_lp", 0, 1, 1, "", ""],
    ["portal", 16, "ajq_portalgatelp", 0, 0, 1, "", ""],
    ["diffvol_1", 5, 0, 0, 1, 1, "", ""],
    ["diffvol_2", 5, 0, 0, 1, 1, "", ""],
    ["diffvol_3", 5, 0, 0, 1, 1, "", ""],
    ["bunnyblocker", 5, 0, 0, 1, 1, "", ""],
    ["phan_block_e", 5, 0, 0, 1, 1, "", ""],
    ["phan_block_h", 5, 0, 0, 1, 1, "", ""],
    ["watervol_1", 5, 0, 0, 1, 1, "", ""],
    ["vineblock_1", 5, 0, 0, 1, 1, "", ""],
    ["vineblock_2", 5, 0, 0, 1, 1, "", ""],
    ["blocker_h", 5, 0, 0, 1, 1, "", ""],
    ["blocker_e", 5, 0, 0, 1, 1, "", ""],
    ["exit_block", 5, 0, 0, 1, 1, "", ""],
    ["bunnyvol_1", 5, 0, 0, 1, 1, "", ""],
    ["bunnytrig_1", 1, 45, 0, 1, 1, "", ""],
    ["cheatchq", 3, 0, 0, 1, 1, "", ""],
    ["phan_trig_e", 1, 44, 0, 1, 1, "", ""],
    ["phan_trig_h", 1, 44, 0, 1, 1, "", ""],
    ["phan_key_1", 15, 1912, 0, 0, 1, "", ""],
    ["cage10_f", 2, 0, 0, 1, 1, "", ""],
    ["cage10_b", 2, 0, 0, 1, 1, "", ""],
    ["cage9_f", 2, 0, 0, 1, 1, "", ""],
    ["cage9_b", 2, 0, 0, 1, 1, "", ""],
    ["cage8_f", 2, 0, 0, 1, 1, "", ""],
    ["cage8_b", 2, 0, 0, 1, 1, "", ""],
    ["cage7_f", 2, 0, 0, 1, 1, "", ""],
    ["cage7_b", 2, 0, 0, 1, 1, "", ""],
    ["burrow_door", 2, 0, 0, 1, 1, "", ""],
    ["bunnytile_1", 2, 0, 0, 1, 1, "", ""],
    ["bunnyblock_1", 2, 0, 0, 1, 1, "", ""],
    ["phan_door_e", 2, 0, 0, 1, 1, "", ""],
    ["phan_door_h", 2, 0, 0, 1, 1, "", ""],
    ["vine_1", 2, 0, 0, 1, 1, "", ""],
    ["vine_2", 2, 0, 0, 1, 1, "", ""],
    ["well_1", 2, 0, 0, 1, 1, "", ""],
    ["well_1h", 2, 0, 0, 1, 1, "", ""],
    ["water_1", 2, 0, 0, 1, 1, "", ""],
    ["easy", 2, 0, 0, 1, 1, "", ""],
    ["hard", 2, 0, 0, 1, 1, "", ""],
    ["pipe_1", 2, 0, 0, 1, 1, "", ""],
    ["pipe_2", 2, 0, 0, 1, 1, "", ""],
    ["pipe_3", 2, 0, 0, 1, 1, "", ""],
    ["pipe_4", 2, 0, 0, 1, 1, "", ""],
    ["pipe_5", 2, 0, 0, 1, 1, "", ""],
    ["pipe_6", 2, 0, 0, 1, 1, "", ""],
    ["flowers_1", 2, 0, 0, 1, 1, "", ""],
    ["flowers_2", 2, 0, 0, 1, 1, "", ""],
    ["flowers_3", 2, 0, 0, 1, 1, "", ""],
    ["flowers_4", 2, 0, 0, 1, 1, "", ""],
    ["flowers_5", 2, 0, 0, 1, 1, "", ""],
    ["flowers_6", 2, 0, 0, 1, 1, "", ""],
    ["flowers_7", 2, 0, 0, 1, 1, "", ""],
    ["flowers_8", 2, 0, 0, 1, 1, "", ""],
    ["flowers_9", 2, 0, 0, 1, 1, "", ""],
    ["flowers_10", 2, 0, 0, 1, 1, "", ""],
    ["flowers_11", 2, 0, 0, 1, 1, "", ""],
    ["flowers_12", 2, 0, 0, 1, 1, "", ""],
    ["exit_port", 2, 0, 0, 1, 1, "", ""],
    ["phantom_1", 11, 2, 0, 0, 1, "", ""],
    ["phantom_2", 11, 2, 0, 0, 1, "", ""],
    ["phantom_2_h", 11, 2, 0, 0, 1, "", ""],
    ["phantom_3", 11, 2, 0, 0, 1, "", ""],
    ["phantom_3_h", 11, 2, 0, 0, 1, "", ""],
    ["phantom_4", 11, 2, 0, 0, 1, "", ""],
    ["phantom_5__a", 11, 2, 0, 0, 1, "", ""],
    ["phantom_5__b", 11, 2, 0, 0, 1, "", ""],
    ["phantom_5__c", 11, 2, 0, 0, 1, "", ""],
    ["phantom_5_h", 11, 2, 0, 0, 1, "", ""],
    ["phantom_6", 11, 2, 0, 0, 1, "", ""],
    ["phantom_7", 11, 2, 0, 0, 1, "", ""],
    ["phantom_8__a", 11, 2, 0, 0, 1, "", ""],
    ["phantom_8__b", 11, 2, 0, 0, 1, "", ""],
    ["phantom_9", 11, 2, 0, 0, 1, "", ""],
    ["phantom_9a_h", 11, 2, 0, 0, 1, "", ""],
    ["phantom_9b_h", 11, 2, 0, 0, 1, "", ""],
    ["phantom_9c_h", 11, 2, 0, 0, 1, "", ""],
    ["phantom_10", 11, 2, 0, 0, 1, "", ""],
    ["phantom_11", 11, 2, 0, 0, 1, "", ""],
    ["phantom_11_h", 11, 2, 0, 0, 1, "", ""],
    ["phantom_12", 11, 2, 0, 0, 1, "", ""],
    ["phantom_12_h", 11, 2, 0, 0, 1, "", ""],
    ["phantom_13", 11, 2, 0, 0, 1, "", ""],
    ["phantom_13_h", 11, 2, 0, 0, 1, "", ""],
    ["phantom_14", 11, 2, 0, 0, 1, "", ""],
    ["phantom_14_h", 11, 2, 0, 0, 1, "", ""],
    ["phantom_15", 11, 2, 0, 0, 1, "", ""],
    ["phantom_15_h", 11, 2, 0, 0, 1, "", ""],
    ["phantom_16_h", 11, 2, 0, 0, 1, "", ""],
    ["phantom_17_h", 11, 2, 0, 0, 1, "", ""],
    ["phantom_18_h", 11, 2, 0, 0, 1, "", ""],
    ["phantom_19_h", 11, 2, 0, 0, 1, "", ""],
    ["phantoff1", 8, 0, 0, 0, 1, "", ""],
    ["phantoff2", 8, 0, 0, 0, 1, "", ""],
    ["phantoff2h", 8, 0, 0, 0, 1, "", ""],
    ["phantoff3", 8, 0, 0, 0, 1, "", ""],
    ["phantoff3h", 8, 0, 0, 0, 1, "", ""],
    ["phantoff4", 8, 0, 0, 0, 1, "", ""],
    ["phantoff5a", 8, 0, 0, 0, 1, "", ""],
    ["phantoff5b", 8, 0, 0, 0, 1, "", ""],
    ["phantoff5c", 8, 0, 0, 0, 1, "", ""],
    ["phantoff5h", 8, 0, 0, 0, 1, "", ""],
    ["phantoff6", 8, 0, 0, 0, 1, "", ""],
    ["phantoff7", 8, 0, 0, 0, 1, "", ""],
    ["phantoff8a", 8, 0, 0, 0, 1, "", ""],
    ["phantoff8b", 8, 0, 0, 0, 1, "", ""],
    ["phantoff9", 8, 0, 0, 0, 1, "", ""],
    ["phantoff9a", 8, 0, 0, 0, 1, "", ""],
    ["phantoff9b", 8, 0, 0, 0, 1, "", ""],
    ["phantoff9c", 8, 0, 0, 0, 1, "", ""],
    ["phantoff10", 8, 0, 0, 0, 1, "", ""],
    ["phantoff11", 8, 0, 0, 0, 1, "", ""],
    ["phantoff11h", 8, 0, 0, 0, 1, "", ""],
    ["phantoff12", 8, 0, 0, 0, 1, "", ""],
    ["phantoff12h", 8, 0, 0, 0, 1, "", ""],
    ["phantoff13", 8, 0, 0, 0, 1, "", ""],
    ["phantoff13h", 8, 0, 0, 0, 1, "", ""],
    ["phantoff14", 8, 0, 0, 0, 1, "", ""],
    ["phantoff14h", 8, 0, 0, 0, 1, "", ""],
    ["phantoff15", 8, 0, 0, 0, 1, "", ""],
    ["phantoff15h", 8, 0, 0, 0, 1, "", ""],
    ["phantoff16h", 8, 0, 0, 0, 1, "", ""],
    ["phantoff17h", 8, 0, 0, 0, 1, "", ""],
    ["phantoff18h", 8, 0, 0, 0, 1, "", ""],
    ["phantoff19h", 8, 0, 0, 0, 1, "", ""],
    ["treasure_1", 13, 39, 0, 1, 1, "", ""],
    ["treasure_2", 13, 39, 0, 1, 1, "", ""],
    ["treasure_3", 13, 39, 0, 1, 1, "", ""],
    ["treasure_4", 13, 39, 0, 1, 1, "", ""],
    ["treasure_5", 13, 39, 0, 1, 1, "", ""],
    ["treasure_6", 13, 39, 0, 1, 1, "", ""],
    ["treasure_7", 13, 39, 0, 1, 1, "", ""],
    ["bunny_key_1a", 15, 1912, 0, 0, 1, "", ""],
    ["bunny_key_1b", 15, 1912, 0, 0, 1, "", ""],
    ["bunny_key_1c", 15, 1912, 0, 0, 1, "", ""],
    ["bunny_key_1d", 15, 1912, 0, 0, 1, "", ""],
    ["bunny_key_1e", 15, 1912, 0, 0, 1, "", ""],
    ["bunny_key_1f", 15, 1912, 0, 0, 1, "", ""],
    ["bunny_key_2a", 15, 1912, 0, 0, 1, "", ""],
    ["bunny_key_2b", 15, 1912, 0, 0, 1, "", ""],
    ["bunny_key_2c", 15, 1912, 0, 0, 1, "", ""],
    ["bunny_key_2d", 15, 1912, 0, 0, 1, "", ""],
    ["bunny_key_2e", 15, 1912, 0, 0, 1, "", ""],
    ["bunny_key_2f", 15, 1912, 0, 0, 1, "", ""],
    ["bunny_key_3a", 15, 1912, 0, 0, 1, "", ""],
    ["bunny_key_3b", 15, 1912, 0, 0, 1, "", ""],
    ["bunny_key_3c", 15, 1912, 0, 0, 1, "", ""],
    ["bunny_key_3d", 15, 1912, 0, 0, 1, "", ""],
    ["bunny_key_3e", 15, 1912, 0, 0, 1, "", ""],
    ["bunny_key_3f", 15, 1912, 0, 0, 1, "", ""],
    ["bunny_key_4a", 15, 1912, 0, 0, 1, "", ""],
    ["bunny_key_4b", 15, 1912, 0, 0, 1, "", ""],
    ["bunny_key_4c", 15, 1912, 0, 0, 1, "", ""],
    ["bunny_key_4d", 15, 1912, 0, 0, 1, "", ""],
    ["bunny_key_4e", 15, 1912, 0, 0, 1, "", ""],
    ["bunny_key_4f", 15, 1912, 0, 0, 1, "", ""],
    ["exit_vol", 3, 0, 0, 1, 1, "", ""],
    ["secret_1", 3, 0, 0, 1, 1, "", ""],
    ["secret_2", 3, 0, 0, 1, 1, "", ""],
    ["00_uri", 7, 0, 0, 0, 1, "", ""],
    ["10_uri", 7, 0, 0, 0, 1, "", ""],
    ["20_uri", 7, 0, 0, 0, 1, "", ""],
    ["30_uri", 7, 0, 0, 0, 1, "", ""],
    ["40_uri", 7, 0, 0, 0, 1, "", ""],
    ["diff_level", 7, 0, 0, 1, 1, "", ""],
    ["live_players", 7, 0, 1, 0, 1, "", ""],
    ["playermember", 7, 0, 0, 1, 1, "", ""],  ],

  on: {
    trigger: {
      // sent by the client each time one of the rooms is up.
      questready(q) {
        if (q.vars.begun) {
          return;
        }
        Object.assign(q.vars, {begun: true, plugged: new Set(), watered: new Set(), freed: new Set(), eaten: new Set(), opened: new Set()});
        counter(q, "start_init", 1);
        q.after(270, () => {
          lizaAppears(q, "liza_1");
          set(q, "well_1", 1, 1, 0);
          set(q, "water_1", 1, 1, 0);
          for (const number of NORMAL_FLOWERS) {
            set(q, `flowers_${number}`, 1, 1, 0);
          }
          for (const name of HARD_ONLY) {
            set(q, name, 99, 0, 0);
          }
          // each cork and key has several places it may lie in; the
          // recording had corks 2a, 3a, 4a and keys 1c to 4c. guessed:
          // that the place is drawn by lot.
          for (const number of [2, 3, 4]) {
            set(q, `cork_${number}${pick("abc")}`, 1, 1, 0);
          }
          // the last key's other places lie off where an animal can walk:
          // players had to jump to it. it lies where the recording had it.
          for (const number of [1, 2, 3]) {
            set(q, `bunny_key_${number}${pick("abcdef")}`, 1, 1, 0);
          }
          set(q, "bunny_key_4c", 1, 1, 0);
        });
      },

      liza_1: q => q.send("qcmd", 3, 0, "liza_1", 1, 3461),
      liza_2: q => q.send("qcmd", 3, 0, "liza_2", 1, 3495),
      bunny_1: q => say(q, "bunny_1", 3462),
      bunny_2(q) {
        if (q.vars.corkGiven) {
          return;
        }
        q.vars.corkGiven = true;
        say(q, "bunny_2", 3463);
        set(q, "bunny_2", 2, 1, 0);
        set(q, "cork_1", 1, 1, 0);
        q.after(47, () => set(q, "pipetrig_1", 1, 1, 1));
      },
      bunnytrig_3: q => say(q, "bunny_3", 3469),
      bunny_6(q) {
        say(q, "bunny_6", 3488);
        set(q, "bunny_6", 1, 1, 0);
        if (!q.vars.keyShown) {
          q.vars.keyShown = true;
          set(q, "phan_key_1", 1, 1, 0);
        }
      },

      // the burrow's door and back. the second pair was not walked through
      // in the recording and is guessed from the first.
      trig_1a: q => q.room("burrow", "spawn_1_a"),
      trig_1_a: q => q.room("start", "spawn_1a"),
      trig_1b: q => q.room("burrow", "spawn_1_b"),
      trig_1_b: q => q.room("start", "spawn_1b"),

      // the phantoms' door, with the burrow's key.
      phan_trig_e(q) {
        if (q.held() !== "phan_key_1" || q.vars.doorOpen) {
          return;
        }
        q.vars.doorOpen = true;
        q.use();
        set(q, "phan_door_e", 1, 1, 0);
        set(q, "phan_trig_e", 1, 0, 0);
        q.xp(15, "phan_trig_e");
        goal(q, 3490);
        phantoms(q, [["phantom_1", "path_1"], ["phantom_6", "path_6"], ["phantom_7", "path_7"], ["phantom_10", null],
          ["phantom_11", "path_1"], ["phantom_12", "path_12"], ["phantom_13", null], ["phantom_14", null], ["phantom_15", null]]);
        q.after(2964, () => set(q, "phan_block_e", 1, 0, 0));
      },

      exit_vol: q => q.send("qcmd", 19),
    },

    triggerLike: [
      [/^pipetrig_[1-4]$/, pipePlugged],
      [/^flowertrig_?\d+$/, flowerWatered],
      [/^bunny_(7|8|9|10)$/, bunnyFreed],
      // QuestActor.handleTriggerTreasure: [actor, 3, gems, 0, 1]
      [/^treasure_\d+$/, (q, chest) => {
        if (!q.vars.opened.has(chest)) {
          q.send("qatt", chest, 3, CHEST_GEMS[chest] || GUESSED_CHEST_GEMS, 0, 1);
        }
      }],
      // the gem an eaten phantom leaves, walked into.
      [/^phantom_\w+__give_gem$/, (q, gem) => {
        const phantom = gem.slice(0, -"__give_gem".length);
        if (q.vars.eaten.has(phantom) && !q.vars.opened.has(gem)) {
          q.vars.opened.add(gem);
          q.gems(25);
          q.send("qad", gem, 0, "null");
        }
      }],
    ],

    // a talk read to its end
    answer: {
      liza_1(q) {
        counter(q, "00_uri", 1);
        counter(q, "players", 1);
        q.send("qposturi", "/adventure1-returnofthephantoms/#00-start/#0#001");
        counter(q, "00_uri", 99);
        set(q, "vineblock_1", 1, 0, 0);
        set(q, "vine_1", 1, 1, 0);
        q.send("qswfs", "liza_1", "disappear");
        set(q, "liza_1", 2, 1, 1);
        set(q, "liza_1", 3, 1, 0);
        goal(q, 3466);
      },
      liza_2(q) {
        if (q.vars.thanked) {
          return;
        }
        q.vars.thanked = true;
        set(q, "liza_2", 2, 1, 1);
        set(q, "exit_port", 1, 1, 0);
        set(q, "portal", 1, 1, 0);
        q.xp(50, "liza_2");
        set(q, "liza_2", 3, 1, 0);
        q.after(565, () => {
          page(q, "40_uri", "40-exit");
          q.offer(PRIZES);
        });
      },
    },

    pickedUp: {
      // the bunnies outside hear of the key.
      phan_key_1(q) {
        q.after(47, () => {
          set(q, "bunny_1", 3, 1, 1);
          set(q, "bunny_2", 4, 1, 1);
          set(q, "bunny_4", 2, 1, 1);
        });
      },
    },

    // A plant ate a phantom ([actor, 50, 1, x, y, ""] has it die there),
    // which leaves a gem worth 25 behind.
    eaten(q, plant, phantom, x, y) {
      if (!/^phantom_\w+$/.test(phantom) || q.vars.eaten.has(phantom)) {
        return;
      }
      q.vars.eaten.add(phantom);
      q.send("qad", phantom, 50, 1, x, y, "");
      q.send("qspn", phantom, `${phantom}__give_gem`, 200, 42, 3, 25, "null", "null", "null");
      q.xp(5, phantom);
      set(q, phantom, 3, 1, 0);
      q.after(1500, () => set(q, phantom, 99, 0, 0));
    },

    // a chest, opened
    openedLike: [
      [/^treasure_\d+$/, (q, chest) => {
        if (!q.vars.opened.has(chest)) {
          q.vars.opened.add(chest);
          q.gems(CHEST_GEMS[chest] || GUESSED_CHEST_GEMS);
          q.xp(5, chest);
        }
      }],
    ],

    // the prize taken
    gifted(q) {
      q.after(960, () => set(q, "exit_block", 1, 0, 0));
    },
  },
};
