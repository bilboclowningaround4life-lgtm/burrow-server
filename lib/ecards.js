"use strict";

const {logText} = require("./logtext.js");
const fs = require("fs");
const path = require("path");
const accounts = require("./accounts.js");
const achievements = require("./achievements.js");
const chatFilter = require("./chatfilter.js");
const chatlog = require("./chatlog.js");
const defpacks = require("./defpacks.js");
const dens = require("./dens.js");
const limits = require("./limits.js");
const {isSilenced} = require("./moderation.js");
const {CURRENCIES, hasRoom, addClothing, sendClothingAdded, sendClothingRemoved} = require("./player.js");

// Jam-A-Grams (client side: ECardManager, ECardInbox, ECardCreation,
// ECardXtCommManager): a card, a stamp, a short message and perhaps a gift,
// kept in the receiver's inbox (account.ecards) until they delete it.
//
// which cards and stamps exist was a list on the official servers. the cards
// offered here were found by looking through the CDN's media files for card
// artwork (tools/find-art.py found what is in lib/ecard-art.json); the
// stamps are the official list itself, as a recording of the official game
// has it (lib/official-lists.json, list 44): the ones guessed before were
// partly not stamps at all, and showed nothing.

// ECard.type: what, if anything, comes with the card
const TYPE_PLAIN = 0;
const TYPE_CLOTHING = 1;
const TYPE_DEN_ITEM = 3;
const TYPE_GEMS = 4;
const TYPE_DIAMONDS = 9;
const CURRENCY_OF = {[TYPE_GEMS]: 0, [TYPE_DIAMONDS]: 3};

// ECard senderType
const FROM_PLAYER = 0;
// "The voice": Animal Jam HQ. the sender's name is then the id of a
// localization string, the inbox shows the AJ badge in place of a stamp and
// the gift comes in the HQ gift popup (ECardInbox.setupGiftPopup).
const FROM_HQ = 1;
// A card the client never lists: it opens as a gift popup by itself, at
// login or when told to look (StartupPopups.redemptionCardsRequest). the
// inbox cannot open gems or diamonds, so those come this way.
const FROM_REDEMPTION = 2;
const HQ_NAME_STRING = 15964; // "Animal Jam HQ" in the game's text, "Burrow HQ" as this server sends it (lib/defpacks.js)
const HQ_NAME = "Burrow HQ";
const MEMBER = 2; // account type the client draws a full name bar for
// ECard specialType: the receiver is shown "Secret Valentine" as the sender.
const SECRET_VALENTINE = 1;

// ECardCreation.onSentResponseCallback
const SENT = 1;
const INBOX_FULL = -1;
const NOT_ACCEPTING = -2;
const FAILED = 0;

// who may send to a player, as kept (account.ecardPrivacy).
const FROM_EVERYONE = 0;
const FROM_BUDDIES = 1;
const FROM_NOBODY = 2;
// ECardInbox's settings popup sends the place of the option picked, and its
// artwork has Nobody first and Everyone last: the other way round from the
// above. turned over both ways between the two (buddies is in the middle).
const SETTING_COUNT = 3;
const turnedOver = value => SETTING_COUNT - 1 - value;

const LIST_CARDS = 10;
const LIST_STAMPS = 44;
const MAX_INBOX = 500;
const MAX_MESSAGE = 200;
const USERNAME_SHOWN = 1;

const art = JSON.parse(fs.readFileSync(path.join(__dirname, "ecard-art.json"), "utf8"));
const sendsPerTenMinutes = limits.limiter(40, 600000);

const now = () => Math.floor(Date.now() / 1000);
const clean = text => String(text).replace(/[\u0000-\u001f\u007f%]/g, " ").trim().slice(0, MAX_MESSAGE);

module.exports = ({findOnline, blocks}) => {
  // A card from the server carrying gems or diamonds: one of the popups.
  const isRedemption = card => Boolean(card.hq && card.gift && Object.hasOwn(CURRENCY_OF, card.gift.type));

  // who sent a card: by account id, and for cards from before ids were
  // kept by the name on them.
  const senderOf = card => (card.fromId ? accounts.byId(card.fromId) : accounts.byName(card.from));

  // the card's gift id: for clothing the id of its picture (ECardInbox hands
  // it to SimpleIcon as an accId, which is the def's layerDefId), for the
  // rest the def id or the amount.
  const giftId = gift => {
    const def = gift.type === TYPE_CLOTHING && defpacks.itemDef(gift.def);
    return def ? Number(def.layerDefId) : gift.def;
  };

  // the 17 fields ECard.init takes, for one card. A secret valentine's
  // sender is known here (reports about it reach them) but not sent.
  const fields = card => {
    const sender = card.hq ? null : senderOf(card);
    const senderType = isRedemption(card) ? FROM_REDEMPTION : card.hq ? FROM_HQ : FROM_PLAYER;
    const name = card.secret ? "" : senderType === FROM_HQ ? HQ_NAME_STRING : card.hq ? HQ_NAME : card.from;
    return [
      card.id, name, card.card, card.stamp, card.read ? 1 : 0, card.msg, card.gift ? card.gift.type : TYPE_PLAIN,
      card.gift ? giftId(card.gift) : 0, card.gift ? card.gift.color : 0, card.gift ? card.gift.name : 0,
      card.hq || card.secret ? MEMBER : sender ? sender.accountType : 0,
      0, // name bar data
      0, // secondary type
      senderType,
      USERNAME_SHOWN,
      // additional gift data: for clothing, "item|<def id>", so that the
      // patched client (ECardInbox) can show a custom item as itself (its
      // own picture and name) and not as the art it was made from. (the
      // "|" keeps the game from taking it for an HQ gift's own message.)
      card.gift && card.gift.type === TYPE_CLOTHING ? `item|${card.gift.def}` : "",
      card.secret ? SECRET_VALENTINE : 0,
    ];
  };

  const inInbox = account => account.ecards.filter(card => !isRedemption(card));
  const unread = account => inInbox(account).filter(card => !card.read).length;
  // gift popups waiting for the player: numRedemptionCards in the login message.
  const redemptions = account => account.ecards.filter(isRedemption).length;

  // puts a card in an inbox and, if its owner is playing, on their screen
  // (ECardXtCommManager.eCardPushHandler). the caller saves.
  const deliver = (to, card) => {
    const stored = {id: to.nextInv++, read: false, ts: now(), ...card};
    to.ecards.push(stored);
    const session = findOnline(to.username);
    if (session && isRedemption(stored)) {
      // GameRedemptionXtCommManager.handleRedeemCodeResponse: "a code was
      // redeemed", which has the client fetch its cards and open the popups.
      session.sendXt("grc", -1, 1, "", 0);
    }
    else if (session) {
      session.sendXt("ep", -1, ...fields(stored));
    }
    return stored;
  };

  // A gift from the server itself (the admin panel), as a Jam-A-Gram from
  // Animal Jam HQ. `gift` is {kind: "clothing" | "den", id, color} for an
  // item, which waits in the inbox, or {kind: "gems" | "diamonds", amount},
  // which pops up by itself. returns null, or why it could not be sent.
  const sendFromHq = (to, text, gift) => {
    if (to.ecards.length >= MAX_INBOX) {
      return "Their Jam-A-Gram inbox is full";
    }
    let attached;
    if (gift.kind === "clothing") {
      const def = defpacks.itemDef(gift.id);
      const colors = def ? String(def.colors).split(",") : [];
      if (!def || !defpacks.clothingIds().includes(Number(def.id))) {
        return "No such clothing item";
      }
      attached = {type: TYPE_CLOTHING, def: Number(def.id), color: Number(gift.color === undefined ? colors[0] : gift.color), name: Number(def.titleStrId)};
    }
    else if (gift.kind === "den") {
      const def = defpacks.denItemIds().includes(Number(gift.id)) && defpacks.denItemDef(gift.id);
      if (!def) {
        return "No such den item";
      }
      attached = {type: TYPE_DEN_ITEM, def: Number(def.id), color: 0, name: Number(def.nameStrId), version: 0};
    }
    else {
      // for these the card's "gift id" and "gift name" are both the amount.
      attached = {type: gift.kind === "gems" ? TYPE_GEMS : TYPE_DIAMONDS, def: gift.amount, color: 0, name: gift.amount};
    }
    // the gift popup takes a message that starts with a number for the id of
    // a localization string (StartupPopups.setupGiftPopup).
    const message = clean(text).replace(/^(?=[\s+-]*\d)/, "Gift: ");
    deliver(to, {from: HQ_NAME, hq: true, card: art.cards[0], stamp: 0, msg: message, gift: attached});
    accounts.save(to);
    return null;
  };

  // A card from Animal Jam HQ with words and nothing else, for news the
  // server has for one player. false when their inbox is full.
  const noteFromHq = (to, text) => {
    if (to.ecards.length >= MAX_INBOX) {
      return false;
    }
    deliver(to, {from: HQ_NAME, hq: true, card: art.cards[0], stamp: 0, msg: clean(text).replace(/^(?=[\s+-]*\d)/, "Note: "), gift: null});
    accounts.save(to);
    return true;
  };

  // the gift a sender attached: one of their own items, taken out of their
  // inventory until the receiver accepts or throws the card away.
  const takeGift = (session, type, invIdx) => {
    const {account} = session;
    if (type === TYPE_CLOTHING) {
      const item = account.items.find(candidate => candidate.inv === invIdx);
      const def = item && defpacks.itemDef(item.def);
      if (!def) {
        return null;
      }
      account.items.splice(account.items.indexOf(item), 1);
      account.tradeList = account.tradeList.filter(listed => !(listed.type === 0 && listed.inv === item.inv));
      sendClothingRemoved(session, item.inv);
      return {type, def: item.def, color: item.color, name: Number(def.titleStrId)};
    }
    if (type === TYPE_DEN_ITEM) {
      const item = account.denItems.find(candidate => candidate.inv === invIdx);
      const def = item && defpacks.denItemDef(item.def);
      // mannequins and the like stay home, and so do paintings: a card has
      // no way to say which painting it carries.
      if (!def || def.specialType !== "0" || item.image) {
        return null;
      }
      account.denItems.splice(account.denItems.indexOf(item), 1);
      account.tradeList = account.tradeList.filter(listed => !(listed.type === 1 && listed.inv === item.inv));
      dens.sendDenItems(session);
      return {type, def: item.def, color: 0, name: Number(def.nameStrId), version: item.version};
    }
    return null;
  };

  const giveGift = (session, gift) => {
    const {account} = session;
    if (gift.type === TYPE_CLOTHING) {
      sendClothingAdded(session, addClothing(account, gift.def, gift.color));
    }
    else if (gift.type === TYPE_DEN_ITEM) {
      dens.giveDenItem(account, gift.def, gift.version);
      dens.sendDenItems(session);
    }
    else if (Object.hasOwn(CURRENCY_OF, gift.type)) {
      const currency = CURRENCIES[CURRENCY_OF[gift.type]];
      account.currency[currency] = (account.currency[currency] || 0) + gift.def;
      achievements.currencyChanged(account, currency, gift.def);
      // ItemXtCommManager.currencyUpdateResponse: [currencyType, newAmount, reason]
      session.sendXt("cu", -1, CURRENCY_OF[gift.type], account.currency[currency], 0);
    }
  };

  const mayReceiveFrom = (to, from) => {
    if (blocks.either(to, from) || to.ecardPrivacy === FROM_NOBODY || !accounts.featureOn(to, "jamagrams")) {
      return false;
    }
    return to.ecardPrivacy !== FROM_BUDDIES || to.buddies.includes(from.username.toLowerCase());
  };

  const handlers = {
    // ECardXtCommManager.eCardListResponse: [count, 17 fields per card...].
    // the client reverses what it is sent, to show the newest first.
    // [forPopups]: "1" when it is looking for gift popups to open rather
    // than filling the inbox; only then are those cards in the list.
    el(session, roomId, [forPopups]) {
      const cards = forPopups === "1" ? session.account.ecards : inInbox(session.account);
      session.sendXt("el", -1, cards.length, ...cards.flatMap(fields));
    },

    // ECardCreation.sendECard: [to, cardMediaId, stampMediaId, messageType,
    // message, giftType, giftInvIdx, isValentine]
    es(session, roomId, [toName, card, stamp, , message, giftType, giftInvIdx, isValentine]) {
      const {account} = session;
      const to = accounts.byName(toName);
      const reply = status => session.sendXt("es", -1, status);
      // silenced: no words of their own reach anyone, in a card either.
      if (!to || to === account || !art.cards.includes(Number(card)) || !art.stamps.includes(Number(stamp))
        || !accounts.featureOn(account, "jamagrams") || (isSilenced(account) && clean(message || "") !== "")
        // The client also skips its per-recipient cap for moderators.
        || (!account.isModerator && !sendsPerTenMinutes.allow(account.id))) {
        reply(FAILED);
        return;
      }
      // secret valentines are off on this server: the patched client no
      // longer offers them, and a card asked for as one from an older copy
      // is not sent with its sender's name shown instead.
      if (isValentine === "1") {
        reply(FAILED);
        return;
      }
      // the server's filter (lib/chatfilter.js).
      const rule = chatFilter.broken(clean(message || ""));
      if (rule) {
        chatFilter.warn(session);
        console.log(`[filter] ${logText(account.username)} in a Jam-a-Gram to ${logText(to.username)}: "${logText(clean(message || ""))}" (${logText(rule)})`);
        chatlog.recordTo(account, chatlog.JAMAGRAM, to.username, chatlog.NOT_SENT + clean(message || ""));
        reply(FAILED);
        return;
      }
      if (!mayReceiveFrom(to, account)) {
        reply(NOT_ACCEPTING);
        return;
      }
      if (to.ecards.length >= MAX_INBOX) {
        reply(INBOX_FULL);
        return;
      }
      const wantsGift = [TYPE_CLOTHING, TYPE_DEN_ITEM].includes(Number(giftType));
      const gift = wantsGift ? takeGift(session, Number(giftType), Number(giftInvIdx)) : null;
      if (wantsGift && !gift) {
        reply(FAILED);
        return;
      }
      deliver(to, {from: account.username, fromId: account.id, card: Number(card), stamp: Number(stamp), msg: clean(message || ""), gift});
      // for the panels (lib/chatlog.js), as typed chat is.
      chatlog.recordTo(account, chatlog.JAMAGRAM, to.username, clean(message || "") + (gift ? " [with a gift]" : ""));
      achievements.add(account, achievements.VARS.jamAGramsSent);
      if (gift) {
        achievements.add(account, achievements.VARS.giftsSent);
      }
      accounts.save(account, to);
      reply(SENT);
    },

    // [msgId] -> eCardReadResponse: [msgId, success]
    er(session, roomId, [msgId]) {
      const card = session.account.ecards.find(candidate => candidate.id === Number(msgId));
      if (card) {
        card.read = true;
        accounts.save(session.account);
      }
      session.sendXt("er", -1, msgId, card ? 1 : 0);
    },

    // [msgId] -> eCardDeleteResponse: [success, count, msgId...]. A gift
    // still in the card goes with it.
    ed(session, roomId, [msgId]) {
      const {account} = session;
      const before = account.ecards.length;
      account.ecards = account.ecards.filter(card => card.id !== Number(msgId));
      accounts.save(account);
      session.sendXt("ed", -1, 1, before - account.ecards.length, ...(before === account.ecards.length ? [] : [msgId]));
    },

    // [msgId, "1" keep | "0" discard] -> eCardGiftResponse: [msgId, success]
    eg(session, roomId, [msgId, accept]) {
      const card = session.account.ecards.find(candidate => candidate.id === Number(msgId));
      if (!card || !card.gift) {
        session.sendXt("eg", -1, msgId, 0);
        return;
      }
      const {gift} = card;
      // no room for it: it stays in the card until there is.
      if (accept === "1" && ((gift.type === TYPE_CLOTHING && !hasRoom(session.account, "items"))
        || (gift.type === TYPE_DEN_ITEM && !hasRoom(session.account, "denItems")))) {
        session.sendXt("eg", -1, msgId, 0);
        return;
      }
      if (isRedemption(card)) {
        // A popup's card is gone once answered, as the client assumes.
        session.account.ecards = session.account.ecards.filter(candidate => candidate !== card);
      }
      card.gift = null;
      if (accept === "1") {
        giveGift(session, gift);
      }
      accounts.save(session.account);
      session.sendXt("eg", -1, msgId, 1);
    },

    // [setting] -> eCardIsolationHandler: [success]
    ei(session, roomId, [setting]) {
      const value = turnedOver(Number(setting));
      const valid = [FROM_EVERYONE, FROM_BUDDIES, FROM_NOBODY].includes(value);
      if (valid) {
        session.account.ecardPrivacy = value;
        accounts.save(session.account);
      }
      session.sendXt("ei", -1, valid ? 1 : 0);
    },

    // answering a buddy request that came as a card; requests here do not.
    eb() {},
    // "I closed the inbox after deleting something": nothing is cached here.
    ec() {},
  };

  // GenericListXtCommManager.handleMediaResponse: (mediaId, name) pairs; null
  // when `listId` is neither the cards' nor the stamps' list.
  const list = listId => {
    const ids = {[LIST_CARDS]: art.cards, [LIST_STAMPS]: art.stamps}[Number(listId)];
    return ids ? ids.flatMap(id => [id, 0]) : null;
  };

  // who sent the newest secret valentine in this inbox: the game reports
  // such a card as being from "Secret Valentine".
  const secretSender = account => {
    const card = [...account.ecards].reverse().find(candidate => candidate.secret);
    return card ? senderOf(card) : null;
  };

  // the setting as the inbox's settings popup shows it (above)
  const privacyShown = account => turnedOver(account.ecardPrivacy || FROM_EVERYONE);
  return {handlers, list, unread, redemptions, privacyShown, sendFromHq, noteFromHq, secretSender, SECRET_NAME: "Secret Valentine"};
};
