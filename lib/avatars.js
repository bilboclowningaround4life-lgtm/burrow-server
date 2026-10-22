"use strict";

const accounts = require("./accounts.js");
const colours = require("./colours.js");
const badges = require("./badges.js");
const defpacks = require("./defpacks.js");
const {activeAvatar, activePet, wornItems, lastSeenField, isUint} = require("./player.js");

// owning several animals (client side: AvatarSwitch, AvatarXtCommManager).
// new animals are free.

const MAX_AVATARS = 1000; // where the client's animal switcher stops counting

// AvatarXtCommManager.avatarGetResponse status
const PLAYER_OFFLINE = 0;
const PLAYER_ONLINE = 1;
const PLAYER_UNKNOWN = 3;

// avatar.NameBar: colour ids 0-10, a badge by its place in the badge list,
// and one bit for "hide my adventure level".
const NAME_BAR_COLORS = 10;
const validNameBarData = (value, account) => Number.isInteger(value) && value >= 0
  && (value & 0xFF) <= NAME_BAR_COLORS
  && (value >> 8 & 0xFF) < defpacks.badgeIds().length
  && badges.mayWear(account, defpacks.badgeIds()[value >> 8 & 0xFF]) // the ones the admin gives: lib/badges.js
  && (value >> 16) <= 1;

module.exports = ({others, findOnline, findBySfsId, refreshForOthers, petFields}) => {
  // A player's card: who they are, the animal they are using and what it
  // wears. AvatarXtCommManager.avatarGetResponse reads [username, uuid,
  // status, accountType, isGuide, daysSinceLogin, perUserAvId, avInvId,
  // nameBarData, avatarType, customAvatarId, 3 colours, avatarName, eyesDefId,
  // patternDefId, questLevel, clothingCount, sfsUserId, moderatedFlag, pet
  // lBits/uBits/eBits/name, (itemDefId, colour)...].
  const sendPlayerCard = (session, account, requestedName) => {
    if (!account) {
      session.sendXt("ag", -1, requestedName, "", PLAYER_UNKNOWN);
      return;
    }
    const targetSession = findOnline(account.username);
    const avatar = activeAvatar(account);
    const worn = wornItems(account, avatar);
    session.sendXt("ag", -1, account.username, account.uuid, targetSession ? PLAYER_ONLINE : PLAYER_OFFLINE,
      account.accountType, account.isGuide ? 1 : 0, lastSeenField(account, Boolean(targetSession)),
      avatar.perUserAvId, avatar.avInvId, account.nameBarData, avatar.type, avatar.customAvId, ...avatar.colors, avatar.name,
      avatar.eyes, avatar.pattern, avatar.questLevel || 0, worn.length, targetSession ? targetSession.id : -1, 1,
      ...petFields(activePet(account)).slice(0, 4),
      ...worn.flatMap(item => [item.def, item.color]));
  };

  return {
  // [username, ?]
  ag(session, roomId, [username]) {
    sendPlayerCard(session, accounts.byName(username), username);
  },

  // [sfsUserId, ?]: the same, for a player met in a room
  ags(session, roomId, [sfsUserId]) {
    const target = findBySfsId(Number(sfsUserId));
    if (target) {
      sendPlayerCard(session, target.account, target.account.username);
    }
  },

  // AvatarSwitch.addNewWorldAvatar: [nameId1, nameId2, nameId3, avatarType,
  // customAvatarId, diamondDefId, shopId]. the name is kept as its three
  // localization ids, which is what LocalizationManager.translateAvatarName reads.
  aa(session, roomId, [name1, name2, name3, type, customAvId]) {
    const {account} = session;
    const custom = defpacks.customAvatarDef(customAvId);
    if (![name1, name2, name3].every(isUint) || !defpacks.avatarDef(type) || account.avatars.length >= MAX_AVATARS
      || (custom && Number(custom.avatarRef) !== Number(type))) {
      // AvatarSwitch.addAvatarResponse: [status, perUserAvId, avInvId]
      session.sendXt("aa", -1, 0, 0, 0);
      return;
    }
    // the inventory id is a slot: the client cannot count past 1,023 there
    // (accounts.freeAvatarSlot).
    const avatar = accounts.newAvatar({perUserAvId: account.nextInv++, avInvId: accounts.freeAvatarSlot(account)}, `${name1}|${name2}|${name3}`, type, customAvId);
    account.avatars.push(avatar);
    accounts.save(account);
    session.sendXt("aa", -1, 1, avatar.perUserAvId, avatar.avInvId);
  },

  // AvatarSwitch.switchAvatars: [perUserAvId]. everyone in the room gets the
  // reply (AvatarSwitch.avatarSwitchResponse / transformEnterFrameHandler);
  // it ends differently for the player who switched.
  as(session, roomId, [perUserAvId]) {
    const {account} = session;
    const avatar = account.avatars.find(candidate => candidate.perUserAvId === Number(perUserAvId));
    if (!avatar) {
      session.sendXt("as", -1, 0);
      return;
    }
    account.activeAvatar = avatar.perUserAvId;
    accounts.save(account);
    const messageRoom = session.room ? session.room.id : -1;
    const common = [1, session.id, avatar.perUserAvId, avatar.avInvId, avatar.customAvId, avatar.type, ...avatar.colors, avatar.name];
    session.sendXt("as", messageRoom, ...common, avatar.petInvId, avatar.questLevel || 0);
    // Nothing more goes to the switching player here.  The client swaps the
    // animals during the transform animation (AvatarSwitch "hideAvatar"),
    // copying the in-world avatar into the switcher slot first and asking
    // for "ad" itself when it needs to.  An unasked "ad"/"il" lands on the
    // in-world avatar before that copy, so the old animal vanished from the
    // switcher and the new one showed twice.
    if (session.pos) {
      for (const other of others(session)) {
        other.sendXt("as", messageRoom, ...common, ...petFields(activePet(account)), avatar.questLevel || 0);
      }
    }
  },

  // AvatarSwitch.avatarKillResponse: [success, gems]
  ak(session, roomId, [perUserAvId]) {
    const {account} = session;
    const avatar = account.avatars.find(candidate => candidate.perUserAvId === Number(perUserAvId));
    if (!avatar || avatar === activeAvatar(account) || account.avatars.length < 2) {
      session.sendXt("ak", -1, 0, account.currency.gems);
      return;
    }
    account.avatars = account.avatars.filter(candidate => candidate !== avatar);
    for (const item of account.items) {
      item.on = item.on.filter(avInvId => avInvId !== avatar.avInvId);
    }
    accounts.save(account);
    // [success, gems]: the animal switcher (AvatarSwitcher.recycleAvatarCallback)
    // shows the second as the player's gems, so it is their total, unchanged.
    session.sendXt("ak", -1, 1, account.currency.gems);
  },

  // AvatarXtCommManager.requestColorChange: [color1, color2, color3, nameBarData]
  ap(session, roomId, colors) {
    if (!colors.slice(0, 3).every(isUint) || colors.length < 3 || !colors.slice(0, 3).every(color => colours.known(Number(color)))) {
      session.sendXt("ap", -1, 0);
      return;
    }
    activeAvatar(session.account).colors = colors.slice(0, 3).map(Number);
    // the name tag is the account's, not the animal's. the client only
    // sends it along here, changed or not.
    const nameBarData = Number(colors[3]);
    const tagChanged = colors.length > 3 && validNameBarData(nameBarData, session.account) && nameBarData !== session.account.nameBarData;
    if (tagChanged) {
      session.account.nameBarData = nameBarData;
    }
    accounts.save(session.account);
    session.sendXt("ap", -1, 1);
    refreshForOthers(session);
    if (tagChanged) {
      // AvatarXtCommManager "an": [sfsUserId, nameBarData]
      for (const other of others(session)) {
        other.sendXt("an", session.room.id, session.id, nameBarData);
      }
    }
  },
  };
};
