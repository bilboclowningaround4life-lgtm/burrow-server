"use strict";

const accounts = require("./accounts.js");
const achievements = require("./achievements.js");
const config = require("../config.js");
const defpacks = require("./defpacks.js");

// the eco den items: producers (special type 6, the Eco Solar Panel and
// Eco Wind Turbine) and consumers (7, the eco lamps and fan), sold for eco
// credits in the Eco Shop (list 778). client side: gui.EcoScorePopup (a
// producer clicked), gui.EcoPointsPopup (a consumer clicked),
// DenItemHolder.updateConsumers. the official server's rules were never
// recorded; these are this server's:
//
//   - a den's generation is the eco power of the producers placed in its
//     owner's den in use; consumers switched on take theirs from it, in
//     inventory order, and one that no longer fits is "offline" (state 2)
//     until there is power for it again. its switch stays on.
//   - generation turns into credits, config.ecoCreditsPerPointHour a point
//     an hour, waiting to be collected ("Get Your Credits") up to the
//     meter's full 240. an account's first look (an eco window, or the
//     Eco Shop) gets it config.ecoStartCredits, enough for its first producer.
//   - the eco score (generation less use) earns the three eco plaques, one
//     at a time, through user var 465 (a bit each).

const SPECIAL_PRODUCER = "6";
const SPECIAL_CONSUMER = "7";
const WIND_TURBINE = 4541;
const SOLAR_PANEL = 4540;
const CURRENCY_ECO = 11;
const ECO_SHOP_LIST = 778;
const MAX_WAITING = 240; // EcoScorePopup.updateCreditProgressMeter: the meter is full at 240
const USER_VAR_REWARDS = 465;
const REWARDS = [
  {bit: 0, score: 5, def: 4611}, // Wood Eco Plaque
  {bit: 1, score: 15, def: 4610}, // Silver Eco Plaque
  {bit: 2, score: 30, def: 4609}, // Gold Eco Plaque
];
const HOUR_MS = 3600000;

const OFF = 0;
const ON = 1;
const OFFLINE = 2;

const special = item => {
  const def = defpacks.denItemDef(item.def);
  return def ? String(def.specialType) : "";
};
const power = item => Number((defpacks.denItemDef(item.def) || {}).ecoPower) || 0;
const placedInUse = account => account.denItems.filter(item => item.spots && item.spots[account.activeDen]);

// the den in use as the eco windows see it: {generation, consumption,
// turbines, panels, consumers: [item], states: Map(inv -> 0 off, 1 on, 2 offline)}
const stateOf = account => {
  const placed = placedInUse(account);
  const producers = placed.filter(item => special(item) === SPECIAL_PRODUCER);
  const consumers = placed.filter(item => special(item) === SPECIAL_CONSUMER).sort((one, other) => one.inv - other.inv);
  const generation = producers.reduce((sum, item) => sum + power(item), 0);
  let consumption = 0;
  const states = new Map();
  for (const item of consumers) {
    if (!item.ecoOn) {
      states.set(item.inv, OFF);
    }
    else if (consumption + power(item) <= generation) {
      consumption += power(item);
      states.set(item.inv, ON);
    }
    else {
      states.set(item.inv, OFFLINE);
    }
  }
  return {
    generation,
    consumption,
    turbines: producers.filter(item => item.def === WIND_TURBINE).length,
    panels: producers.filter(item => item.def === SOLAR_PANEL).length,
    consumers,
    states,
  };
};

// a den item's eco field in the den's state (DenStateItem's last): 0 for
// all but consumers
const consumerState = (account, item) => (special(item) === SPECIAL_CONSUMER ? stateOf(account).states.get(item.inv) || OFF : OFF);

const perHour = generation => generation * (Number(config.ecoCreditsPerPointHour) || 0);

// brings the waiting credits up to now, at the rate the den has now. the
// caller saves.
const accrue = account => {
  const now = Date.now();
  if (!account.eco) {
    account.eco = {waiting: 0, at: now};
    const start = Math.max(0, Math.floor(Number(config.ecoStartCredits) || 0));
    account.currency.ecoCredits = (account.currency.ecoCredits || 0) + start;
    return;
  }
  const rate = perHour(stateOf(account).generation);
  const hours = Math.max(0, now - account.eco.at) / HOUR_MS;
  account.eco.waiting = Math.min(MAX_WAITING, (Number(account.eco.waiting) || 0) + rate * hours);
  account.eco.at = now;
};

// seconds until one more whole credit waits, 0 when none will
const secondsToNext = account => {
  const rate = perHour(stateOf(account).generation);
  if (rate <= 0 || account.eco.waiting >= MAX_WAITING) {
    return 0;
  }
  const short = 1 - (account.eco.waiting % 1);
  return Math.max(1, Math.ceil(short / rate * 3600));
};

const nextReward = account => {
  const bits = Number(account.userVars[USER_VAR_REWARDS]) || 0;
  return REWARDS.find(reward => !(bits & (1 << reward.bit))) || null;
};

module.exports = ({others, ecards}) => {
  const sendCredits = session => session.sendXt("cu", -1, CURRENCY_ECO, session.account.currency.ecoCredits || 0, 0);

  // the consumers' states to the owner and, when they are in it, everyone
  // else in the den: DenXtCommManager.denEcoConsumerResponse [consumption,
  // generation, count, (invIdx, state)...].
  const sendConsumers = session => {
    const {account} = session;
    const state = stateOf(account);
    const fields = [state.consumption, state.generation, state.consumers.length,
      ...state.consumers.flatMap(item => [item.inv, state.states.get(item.inv)])];
    session.sendXt("dEc", -1, ...fields);
    if (session.room && session.room.denOwner === account) {
      for (const other of others(session)) {
        other.sendXt("dEc", -1, ...fields);
      }
    }
  };

  const handlers = {
    // requestDenEcoCreditRefresh -> EcoStateResponse: [turbines, panels,
    // consumers, generation, consumption, score required, next reward bit,
    // credits waiting, seconds to the next].
    dEf(session) {
      const {account} = session;
      const firstLook = !account.eco;
      accrue(account);
      accounts.save(account);
      if (firstLook) {
        sendCredits(session);
      }
      const state = stateOf(account);
      const reward = nextReward(account);
      session.sendXt("dEf", -1, state.turbines, state.panels, state.consumers.length, state.generation, state.consumption,
        reward ? reward.score : REWARDS[REWARDS.length - 1].score, reward ? reward.bit : -1,
        Math.floor(account.eco.waiting), secondsToNext(account));
    },

    // requestDenEcoCreditRedeem: the waiting credits collected -> [success,
    // seconds to the next].
    dEr(session) {
      const {account} = session;
      accrue(account);
      const credits = Math.floor(account.eco.waiting);
      if (credits < 1) {
        accounts.save(account);
        session.sendXt("dEr", -1, 0, secondsToNext(account));
        return;
      }
      account.eco.waiting -= credits;
      account.currency.ecoCredits = (account.currency.ecoCredits || 0) + credits;
      achievements.currencyChanged(account, "ecoCredits", credits);
      accounts.save(account);
      sendCredits(session);
      session.sendXt("dEr", -1, 1, secondsToNext(account));
    },

    // requestDenEcoConsumer: [invIdx, "1" on | "0" off]
    dEc(session, roomId, [invIdx, on]) {
      const {account} = session;
      const item = account.denItems.find(candidate => candidate.inv === Number(invIdx));
      if (item && special(item) === SPECIAL_CONSUMER) {
        accrue(account);
        item.ecoOn = on === "1";
        accounts.save(account);
      }
      sendConsumers(session);
    },
  };

  // user var 465, set by the eco score window's gift: the value is the bit
  // of the reward asked for. given when it is the next one and the score is
  // there; the plaque comes as a gift from HQ. true when the var was this.
  const userVar = (session, id, bit) => {
    if (Number(id) !== USER_VAR_REWARDS) {
      return false;
    }
    const {account} = session;
    const reward = nextReward(account);
    const state = stateOf(account);
    if (reward && reward.bit === Number(bit) && state.generation - state.consumption >= reward.score
      && !ecards.sendFromHq(account, "Eco Reward", {kind: "den", id: reward.def})) {
      account.userVars[USER_VAR_REWARDS] = (Number(account.userVars[USER_VAR_REWARDS]) || 0) | (1 << reward.bit);
      accounts.save(account);
    }
    if (account.userVars[USER_VAR_REWARDS] === undefined) {
      account.userVars[USER_VAR_REWARDS] = 0;
    }
    achievements.sendVar(session, USER_VAR_REWARDS);
    return true;
  };

  // the Eco Shop opened: an account that never had eco credits is given
  // its first, to buy its first producer with.
  const shopOpened = session => {
    if (!session.account.eco) {
      accrue(session.account);
      accounts.save(session.account);
      sendCredits(session);
    }
  };

  return {handlers, userVar, shopOpened, SHOP_LIST: ECO_SHOP_LIST};
};

module.exports.accrue = accrue;
module.exports.consumerState = consumerState;
module.exports.SPECIAL_TYPES = [SPECIAL_PRODUCER, SPECIAL_CONSUMER];
