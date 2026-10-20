"use strict";

const accounts = require("./accounts.js");
const achievements = require("./achievements.js");
const defpacks = require("./defpacks.js");
const {activeAvatar, isUint} = require("./player.js");

// pets (client side: PetManager, PetXtCommManager). A pet's species and look
// are packed into three integers by PetManager.packPetBits; the species is
// the low byte of the first. pets are free.

const MAX_PETS = 1000;
const DEF_PET_FOOD = 1062;
const DEF_PET_TOY = 1063;
// generic list 432: the personalities a pet can have, as the ids of their
// names in the localization defPack ("Adventurous" ... "Zany").
const PERSONALITY_LIST = 432;
const PERSONALITIES = [25865, 25932];
// A pet has ten foods and ten toys it might favour (its def's foodListId and
// toyListId). which ten is not in any file: only the lists' ids and all the
// foods and toys are. both packs run in the order the lists were made, ten
// to a list, so a list is taken to be the ten at its place in that order.
// the newest pet's two lists (437, 438) have the lowest ids but come last.
const PER_LIST = 10;
const LATE_LISTS = [437, 438];
// mastery (PetInventory: at 100 the pet may wear its mastery item). it grew
// from playing minigames with the pet; here it grows as the pet is walked
// from room to room.
const MASTERY_FULL = 100;
const MASTERY_PER_ROOM = 5;
const MASTERY_BITS = 0xF00; // the part of uBits PetInventory writes
const SECONDS_TO_HATCH = 259200; // PetManager.hasHatched

const random = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

const listOrder = type => {
  const ids = defpacks.listsOfType(type);
  return [...ids.filter(id => !LATE_LISTS.includes(id)), ...ids.filter(id => LATE_LISTS.includes(id))];
};

// the foods (DEF_PET_FOOD) or toys (DEF_PET_TOY) of one list, as defs.
const favourites = (type, listId) => {
  const index = listOrder(type).indexOf(Number(listId));
  const defs = type === DEF_PET_FOOD ? defpacks.petFoodDefs() : defpacks.petToyDefs();
  return index === -1 ? [] : defs.slice(index * PER_LIST, (index + 1) * PER_LIST);
};

// GenericListXtCommManager.handleMediaResponse: (defId, name string id) pairs.
const favouritesList = (type, listId) => favourites(type, listId).flatMap(def => [def.id, def.titleStrId]);

const personalityList = () => Array.from({length: PERSONALITIES[1] - PERSONALITIES[0] + 1}, (_, i) => PERSONALITIES[0] + i);

const pick = list => (list.length ? Number(list[random(0, list.length - 1)].id) : 0);

// what PetCertificatePopup shows: a personality, a favourite toy and food.
const giveCharacter = pet => {
  const def = defpacks.petDef(pet.lBits & 0xFF) || {};
  // eggs hatch at once here; one bought when they took three days has its
  // wait ended.
  if (def.isEgg === "1") {
    pet.createdAt = Math.min(pet.createdAt, Math.floor(Date.now() / 1000) - SECONDS_TO_HATCH);
  }
  pet.personality = pet.personality || random(...PERSONALITIES);
  pet.toy = pet.toy || pick(favourites(DEF_PET_TOY, def.toyListId));
  pet.food = pet.food || pick(favourites(DEF_PET_FOOD, def.foodListId));
};

// called when a player walks into a room with a pet out.
const walked = account => {
  const pet = account.pets.find(candidate => candidate.inv === activeAvatar(account).petInvId);
  if (pet && (pet.mastery || 0) < MASTERY_FULL) {
    pet.mastery = Math.min(MASTERY_FULL, (pet.mastery || 0) + MASTERY_PER_ROOM);
  }
};

module.exports = ({others, findOnline, petFields}) => {
  // PetManager.onPetCreateResponse: [success, newAmount, currencyType, invIdx,
  // lBits, uBits, eBits, name, createdTs, personality, toy, food, ?]
  const create = (session, [lBits, uBits, eBits, name1, name2]) => {
    const {account} = session;
    if (![lBits, uBits, eBits, name1, name2].every(isUint) || !defpacks.petIds().includes(Number(lBits) & 0xFF)
      || account.pets.length >= MAX_PETS) {
      session.sendXt("pc", -1, 0);
      return;
    }
    const isEgg = (defpacks.petDef(Number(lBits) & 0xFF) || {}).isEgg === "1";
    const pet = {
      inv: account.nextInv++,
      lBits: Number(lBits),
      uBits: Number(uBits),
      eBits: Number(eBits),
      // two localization ids, read by LocalizationManager.translatePetName.
      // an egg is named when it has hatched (EggPetHatchedPopup, "pn").
      name: isEgg ? "" : `${name1}|${name2}`,
      // an egg hatches three days after this (PetManager.hasHatched), so
      // an egg is made that much in the past: it hatches at once.
      createdAt: Math.floor(Date.now() / 1000) - (isEgg ? SECONDS_TO_HATCH : 0),
      mastery: 0,
    };
    giveCharacter(pet);
    account.pets.push(pet);
    achievements.set(account, achievements.VARS.pets, Math.max(Number(account.userVars[achievements.VARS.pets]) || 0, account.pets.length));
    accounts.save(account);
    session.sendXt("pc", -1, 1, account.currency.gems || 0, 0, pet.inv, ...petFields(pet), 0);
  };

  const ownPet = (account, invIdx) => account.pets.find(candidate => candidate.inv === Number(invIdx));

  const handlers = {
    // PetManager.onPetListResponse: [found, username, count, (invIdx,
    // createdTs, name, lBits, uBits, eBits, mastery, personality, toy, food,
    // denStoreInvId)...]
    pl(session, roomId, [username]) {
      // anybody's, playing or not: a player's card shows their pets.
      const owner = accounts.byName(username);
      const target = findOnline(username);
      const pets = owner ? owner.pets : [];
      session.sendXt("pl", -1, 1, username, pets.length,
        ...pets.flatMap(pet => [pet.inv, pet.createdAt, pet.name, pet.lBits, pet.uBits, pet.eBits,
          pet.mastery || 0, pet.personality || 0, pet.toy || 0, pet.food || 0, 0]));
      if (target === session) {
        // PetManager.unlockedPets: a bit per pet species (bit = id - 1). the
        // pet picker dereferences this, so it must arrive before the picker
        // opens; every species is unlocked.
        const words = Math.ceil(Math.max(...defpacks.petIds()) / 32);
        session.sendXt("pu", -1, Array(words).fill(4294967295).join(","));
      }
    },

    // PetCreator: [shopId, lBits, uBits, eBits, nameId1, nameId2, fromRedemption]
    pc(session, roomId, params) {
      create(session, params.slice(1));
    },

    // same, for diamond-shop pets: [shopId, diamondDefId, lBits, uBits, eBits, nameId1, nameId2, fromRedemption]
    pb(session, roomId, params) {
      create(session, params.slice(2));
    },

    // [petInvIdx], 0 = walk without a pet. PetManager.onPetSwitchResponse reads
    // the pet's inventory id for its owner and the pet's look for everyone else.
    ps(session, roomId, [invIdx]) {
      const {account} = session;
      const pet = account.pets.find(candidate => candidate.inv === Number(invIdx)) || null;
      if (!pet && invIdx !== "0") {
        session.sendXt("ps", -1, 0);
        return;
      }
      activeAvatar(account).petInvId = pet ? pet.inv : 0;
      if (!pet && session.petPlayerMode) {
        session.petPlayerMode = false;
        if (session.pos) {
          for (const other of [session, ...others(session)]) {
            other.sendXt("uc", session.room.id, session.id, "off", "13");
          }
        }
      }
      accounts.save(account);
      const messageRoom = session.room ? session.room.id : -1;
      session.sendXt("ps", messageRoom, 1, session.id, pet ? pet.inv : 0);
      if (session.pos) {
        for (const other of others(session)) {
          other.sendXt("ps", messageRoom, 1, session.id, ...petFields(pet));
        }
      }
    },

    // PetManager.onPetDismissResponse: [success, invIdx]
    pd(session, roomId, [invIdx]) {
      const {account} = session;
      const pet = account.pets.find(candidate => candidate.inv === Number(invIdx));
      if (!pet) {
        session.sendXt("pd", -1, 0, invIdx);
        return;
      }
      account.pets = account.pets.filter(candidate => candidate !== pet);
      if (session.petPlayerMode && activeAvatar(account).petInvId === pet.inv) {
        session.petPlayerMode = false;
        if (session.pos) {
          for (const other of [session, ...others(session)]) {
            other.sendXt("uc", session.room.id, session.id, "off", "13");
          }
        }
      }
      for (const avatar of account.avatars) {
        if (avatar.petInvId === pet.inv) {
          avatar.petInvId = 0;
        }
      }
      accounts.save(account);
      session.sendXt("pd", -1, 1, pet.inv);
    },

    // PetInventory: [masteryItem, petInvIdx] puts the pet's mastery item on
    // or off, once its mastery is full. the reply (onPetMasteryResponse) is
    // [success, invIdx, lBits, uBits, eBits].
    pm(session, roomId, [masteryItem, invIdx]) {
      const {account} = session;
      const pet = ownPet(account, invIdx);
      const item = Number(masteryItem);
      if (!pet || !Number.isInteger(item) || item < 0 || item > 15 || (pet.mastery || 0) < MASTERY_FULL) {
        session.sendXt("pm", -1, 0);
        return;
      }
      pet.uBits = ((pet.uBits & ~MASTERY_BITS) | (item << 8)) >>> 0;
      accounts.save(account);
      session.sendXt("pm", -1, 1, pet.inv, pet.lBits, pet.uBits, pet.eBits);
      if (pet.inv === activeAvatar(account).petInvId && session.pos) {
        for (const other of others(session)) {
          other.sendXt("ps", session.room.id, 1, session.id, ...petFields(pet));
        }
      }
    },

    // EggPetHatchedPopup: [petInvIdx, nameId1, nameId2] names a pet hatched
    // from an egg. PetManager.onPetEggNameResponse: [success, invIdx, name].
    pn(session, roomId, [invIdx, name1, name2]) {
      const {account} = session;
      const pet = ownPet(account, invIdx);
      const def = pet && defpacks.petDef(pet.lBits & 0xFF);
      if (!pet || ![name1, name2].every(isUint) || pet.name || !def || def.isEgg !== "1"
        || pet.createdAt + SECONDS_TO_HATCH > Math.floor(Date.now() / 1000)) {
        session.sendXt("pn", -1, 0, invIdx, pet ? pet.name : "");
        return;
      }
      pet.name = `${name1}|${name2}`;
      accounts.save(account);
      session.sendXt("pn", -1, 1, pet.inv, pet.name);
    },

    // the pet salon minigame (MicroPetSalon via MinigameManager.sendPetItemRequest):
    // [a, b, c, enviroType], the pet in use's three accessories, which
    // PetManager.packPetBits keeps in bits 12 to 23 of uBits. the reply
    // (PetManager.onPetItemsResponse) is [success, gems, invIdx, lBits, uBits, eBits].
    pi(session, roomId, [a, b, c]) {
      const {account} = session;
      const pet = ownPet(account, activeAvatar(account).petInvId);
      const parts = [a, b, c].map(Number);
      if (!pet || !parts.every(part => Number.isInteger(part) && part >= 0 && part <= 15)) {
        session.sendXt("pi", -1, 0);
        return;
      }
      pet.uBits = ((pet.uBits & 0xFFF) | (parts[0] << 12) | (parts[1] << 16) | (parts[2] << 20)) >>> 0;
      accounts.save(account);
      session.sendXt("pi", -1, 1, account.currency.gems || 0, pet.inv, pet.lBits, pet.uBits, pet.eBits);
      if (session.pos) {
        for (const other of others(session)) {
          other.sendXt("ps", session.room.id, 1, session.id, ...petFields(pet));
        }
      }
    },
  };

  return {handlers, walked, giveCharacter, favouritesList, personalityList, PERSONALITY_LIST};
};
