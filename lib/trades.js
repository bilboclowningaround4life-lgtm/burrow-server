"use strict";

const accounts = require("./accounts.js");
const defpacks = require("./defpacks.js");
const masterpieces = require("./masterpieces.js");
const {MAX_ITEMS, MAX_DEN_ITEMS} = require("./player.js");

// trading (client side: TradeXtCommManager, TradeManager). A player keeps a
// trade list of items on offer. someone else asks for one of them, offering
// items of their own; the owner accepts or declines; then both confirm and
// the items change hands.

// TradeItem.itemType
const TYPE_CLOTHING = 0;
const TYPE_DEN_ITEM = 1;
const TYPE_PET = 3;

const MAX_TRADE_ITEMS = 200; // on a trade list (the game sets no end to it; past this the rest were dropped)
const MAX_PETS = 1000; // as in lib/pets.js

// "ti" request steps (first parameter from the client)
const STEP_OFFER = "0";
const STEP_ANSWER = "1";
const STEP_CANCEL = "2";
const STEP_CONFIRM = "3";

// "ti" reply statuses (TradeManager.onTradeItemsResponse)
const TRADE_REQUESTED = 0; // to the owner: here is an offer
const TRADE_PROGRESS = 1; // followed by 0 = please confirm, 1 = done
const TRADE_DECLINED = 2;
const TRADE_ITEM_GONE = 3;
const TRADE_UNAVAILABLE = 4;
const TRADE_CLOSED = 6; // just close the trade windows

const AWAITING_CONFIRMATION = 0;
const COMPLETED = 1;

// item kinds inside a completed trade (TradeManager.displayTradeDone)
const DONE_CLOTHING = 0;
const DONE_DEN_ITEM = 1;
const DONE_PET = 2;

const USERNAME_SHOWN = 1;
const MAX_OFFERED = 50; // the patched client lets this many be offered (gui.TradeManager)
const TRADES_KEPT = 50; // per account, for its page
const MAX_WAITING_OFFERS = 50; // offers left on one account
const MAX_OFFERS_MADE = 20; // by one account, still waiting

module.exports = ({findOnline, blocks}) => {
  // TradeManager.onTradeListReceived: [username, clothingCount, (defId,
  // invIdx, color)..., denItemCount, (defId, invIdx, version, approved,
  // imageId, creatorDbId, creatorUuid)..., petCount, (speciesId, invIdx,
  // createdTs, lBits, uBits, eBits, name, personality, toy, food)...]
  const sendTradeList = (to, account) => {
    const listed = type => account.tradeList.filter(entry => entry.type === type).map(entry => entry.inv);
    // one whose def is gone (a custom item deleted) is left out: the client
    // cannot make an item of it, and the list stopped there.
    const clothing = account.items.filter(item => listed(TYPE_CLOTHING).includes(item.inv) && defpacks.itemDef(item.def));
    const denItems = account.denItems.filter(item => listed(TYPE_DEN_ITEM).includes(item.inv) && masterpieces.itemApproved(item)
      && defpacks.denItemDef(item.def));
    const pets = account.pets.filter(pet => listed(TYPE_PET).includes(pet.inv));
    to.sendXt("tl", -1, account.username,
      clothing.length, ...clothing.flatMap(item => [item.def, item.inv, item.color]),
      denItems.length, ...denItems.flatMap(item => [item.def, item.inv, item.version, "true", ...masterpieces.itemFields(item)]),
      pets.length, ...pets.flatMap(pet => [pet.lBits & 0xFF, pet.inv, pet.createdAt, pet.lBits, pet.uBits, pet.eBits, pet.name, 0, 0, 0]));
  };

  const owns = (account, type, inv) => {
    const collection = type === TYPE_CLOTHING ? account.items : type === TYPE_DEN_ITEM ? account.denItems : type === TYPE_PET ? account.pets : [];
    return collection.some(entry => entry.inv === inv);
  };

  const collectionOf = (account, type) =>
    (type === TYPE_CLOTHING ? account.items : type === TYPE_DEN_ITEM ? account.denItems : type === TYPE_PET ? account.pets : []);

  // A masterpiece still waiting for review is nobody's to trade.
  // nor one whose def is gone.
  const find = (account, type, inv) => collectionOf(account, type)
    .find(entry => entry.inv === inv && (type !== TYPE_DEN_ITEM || masterpieces.itemApproved(entry))
      && (type === TYPE_CLOTHING ? Boolean(defpacks.itemDef(entry.def)) : type === TYPE_DEN_ITEM ? Boolean(defpacks.denItemDef(entry.def)) : true));

  // the field layouts differ between the offer the owner is shown (no
  // inventory ids for clothing and den items) and the completed trade.
  const offerFields = (type, entry) => {
    if (type === TYPE_CLOTHING) {
      return [entry.def, entry.color];
    }
    if (type === TYPE_DEN_ITEM) {
      return [entry.def, entry.version, "true", ...masterpieces.itemFields(entry)];
    }
    return [entry.createdAt, entry.lBits & 0xFF, entry.inv, entry.lBits, entry.uBits, entry.eBits, 0, 0, 0, entry.name];
  };

  const doneFields = (type, entry) => {
    if (type === TYPE_CLOTHING) {
      return [DONE_CLOTHING, entry.def, entry.inv, entry.color];
    }
    if (type === TYPE_DEN_ITEM) {
      // the inventory id first here, unlike clothing (TradeManager.displayTradeDone).
      return [DONE_DEN_ITEM, entry.inv, entry.def, entry.version, "true", ...masterpieces.itemFields(entry)];
    }
    return [DONE_PET, entry.createdAt, entry.inv, entry.lBits & 0xFF, entry.lBits, entry.uBits, entry.eBits, 0, 0, 0, entry.name];
  };

  const doneType = type => (type === TYPE_CLOTHING ? DONE_CLOTHING : type === TYPE_DEN_ITEM ? DONE_DEN_ITEM : DONE_PET);

  // the code the owner's client uses to check it has room: clothing 0-2 and
  // den items 3-5 by environment (land, ocean, both), pets 6.
  const wantedCode = (type, entry) => {
    if (type === TYPE_PET) {
      return 6;
    }
    const def = type === TYPE_CLOTHING ? defpacks.itemDef(entry.def) : defpacks.denItemDef(entry.def);
    const environment = {0: 0, 1: 1, 3: 2}[def ? Number(def.enviroType) : 0] || 0;
    return type === TYPE_CLOTHING ? environment : 3 + environment;
  };

  // what a traded thing is called, for the trade history.
  const nameOf = (type, entry) => {
    if (type === TYPE_PET) {
      return defpacks.string((defpacks.petDef(entry.lBits & 0xFF) || {}).titleStrId) || "Pet";
    }
    const def = type === TYPE_CLOTHING ? defpacks.itemDef(entry.def) : defpacks.denItemDef(entry.def);
    return (def && defpacks.string(type === TYPE_CLOTHING ? def.titleStrId : def.nameStrId)) || (def && def.abbrName) || `Item ${entry.def}`;
  };
  const note = (account, other, got, gave) => {
    account.tradeHistory = [{at: Math.floor(Date.now() / 1000), with: other.username, got, gave}, ...account.tradeHistory].slice(0, TRADES_KEPT);
  };

  // would `account` have room for what it gets, once what it gives is gone?
  const LIMITS = new Map([[TYPE_CLOTHING, MAX_ITEMS], [TYPE_DEN_ITEM, MAX_DEN_ITEMS], [TYPE_PET, MAX_PETS]]);
  const fits = (account, gets, gives) => [...LIMITS].every(([type, max]) => {
    const coming = gets.filter(item => item.type === type).length;
    return coming === 0 || collectionOf(account, type).length + coming - gives.filter(item => item.type === type).length <= max;
  });

  const endTrade = trade => {
    trade.requester.trade = trade.owner.trade = null;
  };

  // ends the trade `session` is part of, telling the other side with `status`.
  const abandon = (session, status) => {
    const {trade} = session;
    if (!trade) {
      return;
    }
    const other = trade.requester === session ? trade.owner : trade.requester;
    endTrade(trade);
    other.sendXt("ti", -1, status, session.account.username, USERNAME_SHOWN);
  };

  // moves one entry between accounts. it gets a fresh inventory id, and
  // leaves the giver's trade list, animals and den.
  const transfer = (from, to, type, entry) => {
    const collection = collectionOf(from, type);
    collection.splice(collection.indexOf(entry), 1);
    from.tradeList = from.tradeList.filter(listed => !(listed.type === type && listed.inv === entry.inv));
    if (type === TYPE_PET) {
      for (const avatar of from.avatars) {
        avatar.petInvId = avatar.petInvId === entry.inv ? 0 : avatar.petInvId;
      }
    }
    const moved = {...entry, inv: to.nextInv++};
    if (type === TYPE_CLOTHING) {
      moved.on = [];
    }
    else if (type === TYPE_PET) {
      delete moved.inDen; // it was standing in the giver's den
    }
    else if (type === TYPE_DEN_ITEM) {
      moved.spots = {}; // it stood in the giver's dens
      delete moved.mannequin; // a mannequin changes hands bare
    }
    collectionOf(to, type).push(moved);
    return moved;
  };

  // TradeXtCommManager.sendTradeItemsRequest: [0, ownerName, wantedType,
  // wantedInvIdx, clothingCount, denCount, extraDenCount, petCount,
  // ...clothingInvIdx, ...denInvIdx, ...petInvIdx]
  const offer = (session, params) => {
    const owner = findOnline(params[1]);
    const refuse = status => session.sendXt("ti", -1, status, owner ? owner.account.username : params[1], USERNAME_SHOWN);
    const numbers = params.slice(2).map(Number);
    // nor is there any trading between two players when one has blocked the other.
    if (!owner || owner === session || owner.trade || session.trade || !numbers.every(Number.isInteger)
      || blocks.either(owner.account, session.account)
      || !accounts.featureOn(owner.account, "trading") || !accounts.featureOn(session.account, "trading")) {
      refuse(TRADE_UNAVAILABLE);
      return;
    }
    const [wantedType, wantedInv, clothingCount, denCount, extraDenCount, petCount, ...invs] = numbers;
    // checked before anything is counted through: these numbers are the client's.
    const total = clothingCount + denCount + extraDenCount + petCount;
    if (![clothingCount, denCount, extraDenCount, petCount].every(count => count >= 0 && count <= MAX_OFFERED)
      || total > MAX_OFFERED || invs.length !== total) {
      refuse(TRADE_UNAVAILABLE);
      return;
    }
    const wanted = find(owner.account, wantedType, wantedInv);
    if (!wanted || !owner.account.tradeList.some(listed => listed.type === wantedType && listed.inv === wantedInv)) {
      refuse(TRADE_ITEM_GONE);
      return;
    }
    const counts = [[TYPE_CLOTHING, clothingCount], [TYPE_DEN_ITEM, denCount + extraDenCount], [TYPE_PET, petCount]];
    const offered = [];
    let index = 0;
    for (const [type, count] of counts) {
      for (let i = 0; i < count; i++) {
        const entry = find(session.account, type, invs[index++]);
        if (entry && !offered.some(item => item.entry === entry)) {
          offered.push({type, entry});
        }
      }
    }
    if (offered.length !== total) {
      refuse(TRADE_UNAVAILABLE);
      return;
    }
    session.trade = owner.trade = {requester: session, owner, wantedType, wanted, offered, accepted: false, confirmed: new Set()};
    // TradeManager.displayTradeRequested: [0, requesterName, moderatedFlag,
    // wantedCode, wantedInvIdx, clothingCount, denCount, petCount, ...items]
    const ofType = type => offered.filter(item => item.type === type);
    owner.sendXt("ti", -1, TRADE_REQUESTED, session.account.username, USERNAME_SHOWN,
      wantedCode(wantedType, wanted), wanted.inv,
      ofType(TYPE_CLOTHING).length, ofType(TYPE_DEN_ITEM).length, ofType(TYPE_PET).length,
      ...[TYPE_CLOTHING, TYPE_DEN_ITEM, TYPE_PET].flatMap(type => ofType(type).flatMap(item => offerFields(type, item.entry))));
  };

  // TradeXtCommManager.sendTradeItemAcceptOrReject: 1 accept, 0 decline, 2 busy
  const answer = (session, choice) => {
    const {trade} = session;
    if (!trade || trade.owner !== session || trade.accepted) {
      return;
    }
    if (choice !== "1") {
      abandon(session, choice === "2" ? TRADE_UNAVAILABLE : TRADE_DECLINED);
      return;
    }
    trade.accepted = true;
    trade.requester.sendXt("ti", -1, TRADE_PROGRESS, AWAITING_CONFIRMATION);
    trade.owner.sendXt("ti", -1, TRADE_PROGRESS, AWAITING_CONFIRMATION);
  };

  // both sides must confirm; then the items change hands and each side is
  // told what it received and lost (TradeManager.displayTradeDone:
  // [1, 1, receivedCount, ...received, lostCount, (kind, invIdx)...]).
  const confirm = (session, yes) => {
    const {trade} = session;
    if (!trade || !trade.accepted) {
      return;
    }
    if (!yes) {
      abandon(session, TRADE_DECLINED);
      return;
    }
    trade.confirmed.add(session);
    if (trade.confirmed.size < 2) {
      return;
    }
    const {requester, owner, wantedType, wanted, offered} = trade;
    endTrade(trade);
    // either side may have recycled or re-traded something while deciding.
    const stillThere = collectionOf(owner.account, wantedType).includes(wanted)
      && offered.every(item => collectionOf(requester.account, item.type).includes(item.entry))
      && fits(requester.account, [{type: wantedType}], offered) && fits(owner.account, offered, [{type: wantedType}]);
    if (!stillThere) {
      requester.sendXt("ti", -1, TRADE_ITEM_GONE, owner.account.username, USERNAME_SHOWN);
      owner.sendXt("ti", -1, TRADE_ITEM_GONE, requester.account.username, USERNAME_SHOWN);
      return;
    }
    const toRequester = transfer(owner.account, requester.account, wantedType, wanted);
    const toOwner = offered.map(item => ({type: item.type, entry: transfer(requester.account, owner.account, item.type, item.entry)}));
    // for each side's account page: what went which way.
    const wantedName = [nameOf(wantedType, toRequester)];
    const offeredNames = toOwner.map(item => nameOf(item.type, item.entry));
    note(requester.account, owner.account, wantedName, offeredNames);
    note(owner.account, requester.account, offeredNames, wantedName);
    accounts.save(requester.account, owner.account);
    requester.sendXt("ti", -1, TRADE_PROGRESS, COMPLETED, 1, ...doneFields(wantedType, toRequester),
      offered.length, ...offered.flatMap(item => [doneType(item.type), item.entry.inv]));
    owner.sendXt("ti", -1, TRADE_PROGRESS, COMPLETED, toOwner.length, ...toOwner.flatMap(item => doneFields(item.type, item.entry)),
      1, doneType(wantedType), wanted.inv);
  };

  // A player who disconnects mid-trade leaves the other side's windows open.
  const forget = session => abandon(session, TRADE_CLOSED);

  const handlers = {
    // [username]
    tl(session, roomId, [username]) {
      const account = accounts.byName(username);
      if (account) {
        sendTradeList(session, account);
      }
    },

    // TradeXtCommManager.sendTradeSetRequest: [removeCount, (type, invIdx)...,
    // addCount, (type, invIdx)...]
    ts(session, roomId, params) {
      const {account} = session;
      const numbers = params.map(Number);
      if (!numbers.every(Number.isInteger)) {
        return;
      }
      const removeCount = numbers[0];
      const removals = numbers.slice(1, 1 + removeCount * 2);
      const addCount = numbers[1 + removeCount * 2];
      const additions = numbers.slice(2 + removeCount * 2, 2 + (removeCount + addCount) * 2);
      for (let i = 0; i + 1 < removals.length; i += 2) {
        account.tradeList = account.tradeList.filter(entry => !(entry.type === removals[i] && entry.inv === removals[i + 1]));
      }
      for (let i = 0; i + 1 < additions.length; i += 2) {
        const [type, inv] = [additions[i], additions[i + 1]];
        if (account.tradeList.length < MAX_TRADE_ITEMS && owns(account, type, inv)
          && !account.tradeList.some(entry => entry.type === type && entry.inv === inv)) {
          account.tradeList.push({type, inv});
        }
      }
      accounts.save(account);
      sendTradeList(session, account);
    },

    // ["1"/"0"]: busy flag while the trade window is open; nothing to
    // answer.
    tb() {},

    ti(session, roomId, params) {
      switch (params[0]) {
        case STEP_OFFER:
          offer(session, params);
          break;
        case STEP_ANSWER:
          answer(session, params[1]);
          break;
        case STEP_CANCEL:
          abandon(session, TRADE_CLOSED);
          break;
        case STEP_CONFIRM:
          confirm(session, params[1] === "1");
          break;
      }
    },
  };

  // ---- offers left for someone who is not there (the account page)
  //
  // an offer asks for one thing on another player's trade list and gives
  // clothing or den items of one's own for it, as a trade in the game does,
  // but waits on the other account until its owner answers on their page.
  // it is account.tradeOffers of whoever is asked: {id, fromId, at, wanted:
  // {type, inv}, offered: [{type, inv}]}, `fromId` the account id of who
  // made it (an id, never a name: a name can pass to somebody else).

  const describe = (account, {type, inv}) => {
    const entry = find(account, type, inv);
    return entry ? {type, inv, name: nameOf(type, entry)} : null;
  };

  const offers = {
    // what `account` could give: its clothing and den items, by name.
    owned: account => [TYPE_CLOTHING, TYPE_DEN_ITEM].flatMap(type => collectionOf(account, type)
      .filter(entry => type !== TYPE_DEN_ITEM || (masterpieces.itemApproved(entry) && Object.keys(entry.spots || {}).length === 0))
      .map(entry => ({type, inv: entry.inv, name: nameOf(type, entry)})))
      .sort((one, other) => one.name.localeCompare(other.name)),

    // what `account` has up for trade (pets aside: they are not offered here).
    listed: account => account.tradeList.filter(entry => entry.type !== TYPE_PET).map(entry => describe(account, entry)).filter(Boolean),

    // offers waiting on `account`, and the ones it made that still wait.
    incoming: account => account.tradeOffers.map(offer => {
      const from = accounts.byId(offer.fromId);
      return from && {id: offer.id, from: from.username, at: offer.at, wanted: describe(account, offer.wanted),
        offered: offer.offered.map(item => describe(from, item)).filter(Boolean)};
    }).filter(offer => offer && offer.wanted),
    outgoing: account => accounts.all().flatMap(other => other.tradeOffers.filter(offer => offer.fromId === account.id)
      .map(offer => ({id: offer.id, to: other.username, at: offer.at, wanted: describe(other, offer.wanted),
        offered: offer.offered.map(item => describe(account, item)).filter(Boolean)}))).filter(offer => offer.wanted),

    // returns null, or why not: "unavailable" | "not_listed" | "nothing" | "not_yours" | "too_many".
    make(from, to, wanted, offered) {
      if (!to || to === from || blocks.either(from, to) || !accounts.featureOn(from, "trading") || !accounts.featureOn(to, "trading")) {
        return "unavailable";
      }
      const want = {type: Number(wanted && wanted.type), inv: Number(wanted && wanted.inv)};
      if (want.type === TYPE_PET || !find(to, want.type, want.inv) || !to.tradeList.some(listed => listed.type === want.type && listed.inv === want.inv)) {
        return "not_listed";
      }
      const give = (Array.isArray(offered) ? offered : []).map(item => ({type: Number(item && item.type), inv: Number(item && item.inv)}));
      if (give.length === 0 || give.length > MAX_OFFERED) {
        return "nothing";
      }
      if (new Set(give.map(item => `${item.type}:${item.inv}`)).size !== give.length
        || !give.every(item => [TYPE_CLOTHING, TYPE_DEN_ITEM].includes(item.type) && find(from, item.type, item.inv))) {
        return "not_yours";
      }
      if (to.tradeOffers.length >= MAX_WAITING_OFFERS || offers.outgoing(from).length >= MAX_OFFERS_MADE) {
        return "too_many";
      }
      to.tradeOffers.push({id: to.nextInv++, fromId: from.id, at: Math.floor(Date.now() / 1000), wanted: want, offered: give});
      accounts.save(to);
      return null;
    },

    // the asked account says yes or no. returns null, "no_offer", or "gone"
    // when something in it has left one of the inventories since (the offer
    // is dropped then).
    answer(account, id, accept, refresh) {
      const offer = account.tradeOffers.find(candidate => candidate.id === Number(id));
      if (!offer) {
        return "no_offer";
      }
      account.tradeOffers = account.tradeOffers.filter(candidate => candidate !== offer);
      const from = accounts.byId(offer.fromId);
      const wanted = find(account, offer.wanted.type, offer.wanted.inv);
      const given = from ? offer.offered.map(item => ({type: item.type, entry: find(from, item.type, item.inv)})) : [];
      if (accept && (!from || !wanted || given.some(item => !item.entry) || blocks.either(from, account)
        || !fits(from, [offer.wanted], given) || !fits(account, given, [offer.wanted]))) {
        accounts.save(account);
        return "gone";
      }
      if (accept) {
        const wantedName = [nameOf(offer.wanted.type, wanted)];
        const givenNames = given.map(item => nameOf(item.type, item.entry));
        transfer(account, from, offer.wanted.type, wanted);
        given.forEach(item => transfer(from, account, item.type, item.entry));
        note(from, account, wantedName, givenNames);
        note(account, from, givenNames, wantedName);
        // whoever is in the game sees their inventories change.
        [account, from].forEach(refresh);
      }
      accounts.save(account, from);
      return null;
    },

    withdraw(from, toName, id) {
      const to = accounts.byName(toName);
      const before = to ? to.tradeOffers.length : 0;
      if (to) {
        to.tradeOffers = to.tradeOffers.filter(offer => !(offer.id === Number(id) && offer.fromId === from.id));
        accounts.save(to);
      }
      return Boolean(to) && to.tradeOffers.length < before;
    },
  };

  return {handlers, forget, offers};
};
