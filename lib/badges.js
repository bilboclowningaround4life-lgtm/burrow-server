"use strict";

const path = require("path");
const cdn = require("./cdn.js");

// what a player's card shows about the account beyond the game's own:
// marks the admin gives in the panel, the player's Discord username and
// their bio, both of which they set themselves on the account page. all of
// it is for show: a badge gives no power over anything or anyone.
//
// every badge is drawn on the player's card, after the username in the
// name bar (buddy.BuddyCard in the SWF), as public/badges/<id>.png; the
// card is told its id and label. the Discord username is drawn there too,
// last. ids and labels must stay free of "," "|" and "%", which separate
// them on the way to the client.
//
// A badge with `tag` is a name tag badge as well: one more of the icons a
// player picks for their name tag in the animal editor, beside the game's
// own 62. it is a row added to the badge pack (defPack 1049) that clients get, with
// a picture of ours (swf/badges/<id>.swf, served as media `tag.media`) and
// an unlock flag: the editor only offers a badge whose `pendingFlagsBit` is
// set in the flags the login message carries (gui.AvatarEditor
// .onNamebarBadgeIdsLoaded), so it is offered to the accounts that hold it
// and to nobody else, from their next login. the server refuses a name tag
// that names one the account does not hold (lib/avatars.js). the def ids
// must follow the game's own without a gap: a name tag names its badge by
// its place in the list, and the editor takes that to be the def id less
// one. so a badge added later goes on the end and none is ever taken out.
//
// tools/make-badges.py draws both pictures of a badge from one outline.
//
// early Member is given by the server itself, to an account made while
// there are no more than a hundred (lib/accounts.js); the admin may give
// it and take it away like any other.

// in the order they are listed and drawn. the Verified, Owner, Moderator and
// Developer name tags show their badge to everyone, not only to buddies:
// their def ids are in PUBLIC_BADGE_IDS of swf-src/AvatarWorldView.as.
const BADGES = [
  // first, so its tick comes straight after the name, as on other sites.
  {id: "verified", label: "Verified", tag: {def: 76, media: 20014, bit: 21}},
  {id: "owner", label: "Owner", tag: {def: 63, media: 20001, bit: 8}},
  {id: "moderator", label: "Moderator", tag: {def: 64, media: 20002, bit: 9}},
  {id: "contributor", label: "Contributor", tag: {def: 65, media: 20003, bit: 10}},
  {id: "developer", label: "Developer", tag: {def: 66, media: 20004, bit: 11}},
  {id: "artist", label: "Artist", tag: {def: 67, media: 20005, bit: 12}},
  {id: "helper", label: "Helper", tag: {def: 68, media: 20006, bit: 13}},
  {id: "bughunter", label: "Bug Hunter", tag: {def: 69, media: 20007, bit: 14}},
  {id: "eventwinner", label: "Event Winner", tag: {def: 70, media: 20008, bit: 15}},
  {id: "tester", label: "Tester", tag: {def: 71, media: 20009, bit: 16}},
  {id: "friend", label: "Friend", tag: {def: 72, media: 20010, bit: 17}},
  {id: "supporter", label: "Supporter", tag: {def: 73, media: 20011, bit: 18}},
  {id: "partner", label: "Partner", tag: {def: 74, media: 20012, bit: 19}},
  {id: "early", label: "Early Member", tag: {def: 75, media: 20013, bit: 20}},
  {id: "booster", label: "Discord Server Booster"}, // on the card only
];
const TAG_BADGES = BADGES.filter(badge => badge.tag);

const known = id => BADGES.some(badge => badge.id === id);

const of = account => BADGES.filter(badge => account.badges.includes(badge.id));

const set = (account, ids) => {
  account.badges = BADGES.map(badge => badge.id).filter(id => Array.isArray(ids) && ids.includes(id));
};

// A Discord username as Discord has them now: 2 to 32 of a-z, 0-9, "_" and
// ".", with no two dots in a row. players link theirs (lib/discord.js).
const DISCORD_NAME = /^(?!.*\.\.)[a-z0-9_.]{2,32}$/;

// returns the username as it will be kept ("" for none), or null when it
// cannot be one. A leading "@" and capitals are forgiven.
const discordName = text => {
  const name = String(text === undefined || text === null ? "" : text).trim().replace(/^@/, "").toLowerCase();
  return name === "" || DISCORD_NAME.test(name) ? name : null;
};

// A bio, the player's own words on the Bio tab of their card: up to
// MAX_BIO characters on at most MAX_BIO_LINES lines. returns it as it will
// be kept ("" for none), or null when it is too long. "%" cannot travel in
// the game's messages and is left out.
const MAX_BIO = 200;
const MAX_BIO_LINES = 8;
const bioText = text => {
  const bio = String(text === undefined || text === null ? "" : text)
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f%]/g, "")
    .split("\n").map(line => line.trim()).join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return [...bio].length <= MAX_BIO && bio.split("\n").length <= MAX_BIO_LINES ? bio : null;
};

// for the card: "id|label,id|label".
const cardField = account => of(account).map(badge => `${badge.id}|${badge.label}`).join(",");

// adds the name tag badges' rows to the badge pack, which is keyed by def
// id and has rows of {id, mediaRefId, pendingFlagsBit}, all strings.
const addTagDefs = pack => {
  for (const {tag} of TAG_BADGES) {
    const row = [];
    row.id = String(tag.def);
    row.mediaRefId = String(tag.media);
    row.pendingFlagsBit = String(tag.bit);
    pack[tag.def] = row;
  }
  return pack;
};

// the bits to add to an account's login flags: one for each name tag badge
// it holds.
const loginFlags = account => of(account).reduce((flags, badge) => (badge.tag ? flags | 1 << badge.tag.bit : flags), 0);

// may the account's name tag show the badge with this def id? any of the
// game's own, and those of ours it holds.
const mayWear = (account, defId) => {
  const badge = TAG_BADGES.find(candidate => candidate.tag.def === Number(defId));
  return !badge || account.badges.includes(badge.id);
};

// the file behind a request for one of the name tag badges' pictures
// ("<build>/media/<hashed id>"), or null when `relPath` is not one.
const mediaFiles = new Map(TAG_BADGES.map(badge =>
  [cdn.hashedPath(`media/${badge.tag.media}`), path.join(__dirname, "..", "swf", "badges", `${badge.id}.swf`)]));
const mediaFile = relPath => mediaFiles.get(relPath) || null;

// the Bio tab's artwork (swf/biotab.swf, made by tools/make-bio-tab.py),
// which the card asks for as media BIO_TAB_MEDIA, or null.
const BIO_TAB_MEDIA = 20100;
const bioTabPath = cdn.hashedPath(`media/${BIO_TAB_MEDIA}`);
const cardMedia = relPath => (relPath === bioTabPath ? path.join(__dirname, "..", "swf", "biotab.swf") : null);

module.exports = {BADGES, MAX_BIO, MAX_BIO_LINES, known, of, set, discordName, bioText, cardField, cardMedia, addTagDefs, loginFlags, mayWear, mediaFile};
