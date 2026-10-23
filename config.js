"use strict";

const path = require("path");

const env = process.env;
const googleVisionApiKey = env.AJ_GOOGLE_VISION_API_KEY;
const LOOPBACK_NAMES = ["127.0.0.1", "::1", "localhost"];
const bindAddress = env.AJ_BIND || "127.0.0.1";
const httpPort = Number(env.AJ_HTTP_PORT || 8080);
const gamePort = Number(env.AJ_GAME_PORT || 9339);
// with a certificate both ports speak TLS. the launcher follows suit when its
// own config.js uses an https:// address.
const tls = env.AJ_TLS_CERT && env.AJ_TLS_KEY ? {certFile: env.AJ_TLS_CERT, keyFile: env.AJ_TLS_KEY} : null;
// AJ_PUBLIC_URL: the address players reach this server at
// ("https://play.burrow.moe", with a port if it is not the usual one). it
// is the one switch for a server strangers can reach, whether this process
// listens on a public address itself or sits behind a reverse proxy or a
// tunnel: with it set the server knows it is public, tells the game that
// address, marks its cookies Secure when it is an https:// one, and trusts
// no request for coming from this machine (behind a proxy they all do).
const publicUrl = env.AJ_PUBLIC_URL ? new URL(env.AJ_PUBLIC_URL) : null;
const host = env.AJ_HOST || (publicUrl ? publicUrl.hostname : "127.0.0.1");
// AJ_SITE_URL: where the web pages are (the home page, sign-up, the account
// page, the moderator panel, the terms), when that is another name than the
// game server's ("https://burrow.moe" beside AJ_PUBLIC_URL's
// "https://play.burrow.moe"). the server answers to both; a web page asked
// for under the game server's name is sent on to this one.
const siteUrl = env.AJ_SITE_URL ? new URL(env.AJ_SITE_URL) : null;
// reachable from other machines? several defaults get stricter when it is.
const isPublic = Boolean(publicUrl) || !LOOPBACK_NAMES.includes(bindAddress) || !LOOPBACK_NAMES.includes(env.AJ_GAME_BIND || bindAddress);
// AJ_TRUSTED_PROXY=1: a reverse proxy on this machine is the only thing that
// reaches the web port, and the visitor's address is the last one in the
// X-Forwarded-For header it sets. without it every visitor behind a proxy
// has the proxy's address, and the per-address limits see one address.
const trustedProxy = env.AJ_TRUSTED_PROXY === "1";
// the game port can listen wider than the web port: a proxy (cloudflare, say)
// carries web pages but not the game's own protocol
const gameBindAddress = env.AJ_GAME_BIND || bindAddress;
const baseUrl = publicUrl ? `${publicUrl.origin}/` : `${tls ? "https" : "http"}://${host}:${httpPort}/`;
// settings that contradict each other are refused at start (server.js)
// rather than left to be found out.
const problems = [];
if (publicUrl && env.AJ_TRUST_LOCAL === "1") {
  problems.push("AJ_PUBLIC_URL and AJ_TRUST_LOCAL=1 cannot both be set: behind a proxy every request looks local");
}
if (trustedProxy && !LOOPBACK_NAMES.includes(bindAddress)) {
  problems.push("AJ_TRUSTED_PROXY=1 needs AJ_BIND to be 127.0.0.1: anyone who reaches the port directly could name any address as theirs");
}
if ((publicUrl || !LOOPBACK_NAMES.includes(bindAddress)) && env.AJ_REGISTER === "1") {
  problems.push("AJ_REGISTER=1 cannot be used on a public server: an account made that way has agreed to nothing");
}
if (Boolean(env.AJ_TURNSTILE_SITE_KEY) !== Boolean(env.AJ_TURNSTILE_SECRET)) {
  problems.push("AJ_TURNSTILE_SITE_KEY and AJ_TURNSTILE_SECRET go together: set both or neither");
}
if (siteUrl && (!publicUrl || !/^https?:$/.test(siteUrl.protocol))) {
  problems.push("AJ_SITE_URL needs AJ_PUBLIC_URL, and must be an http:// or https:// address");
}
if (publicUrl && !/^https?:$/.test(publicUrl.protocol)) {
  problems.push("AJ_PUBLIC_URL must be an http:// or https:// address");
}

module.exports = {
  // address the client is told to use. the patched ajclient.swf always opens
  // its game socket to 127.0.0.1, so only change this together with the SWF.
  host,
  bindAddress,
  gameBindAddress,
  isPublic,
  publicUrl,
  trustedProxy,
  problems,
  tls,
  // behind a trusted proxy the proxy encrypts the web port; the certificate is the game port's
  webTls: trustedProxy ? null : tls,
  // requests from this machine may use the item finder for any account and
  // list accounts. never with AJ_PUBLIC_URL set; AJ_TRUST_LOCAL=0 turns it
  // off otherwise. (A request that came through a proxy is never taken for
  // local, whatever is set: lib/limits.js.)
  trustLocalRequests: !publicUrl && env.AJ_TRUST_LOCAL !== "0",
  httpPort,
  gamePort,
  baseUrl,
  // the web pages' address: baseUrl unless AJ_SITE_URL names another
  siteUrl: siteUrl ? `${siteUrl.origin}/` : baseUrl,
  // cookies are only sent back over an encrypted connection when players
  // have one, whoever does the encrypting.
  secureCookies: baseUrl.startsWith("https:"),
  // Google Cloud Vision SafeSearch, used for player-uploaded custom item art
  // and masterpieces. Off when no key is configured (useful for local work).
  // When on, a Google outage rejects uploads rather than letting unscanned
  // images through.
  googleVision: googleVisionApiKey ? {
    endpoint: `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(googleVisionApiKey)}`,
  } : null,
  // the admin panel answers this machine alone on a public server (reach it
  // through an SSH tunnel), plus the addresses listed in AJ_ADMIN_ALLOW,
  // separated by commas. on a local server it answers whoever can reach it.
  adminAllow: (env.AJ_ADMIN_ALLOW || "").split(",").map(address => address.trim()).filter(Boolean),

  // cloudflare turnstile (lib/captcha.js): a captcha wherever a password is
  // tried or an account is made, with both set. off without them.
  turnstile: env.AJ_TURNSTILE_SITE_KEY && env.AJ_TURNSTILE_SECRET
    ? {siteKey: env.AJ_TURNSTILE_SITE_KEY, secret: env.AJ_TURNSTILE_SECRET} : null,
  // A stalled CAPTCHA provider must not consume all of the VPS's outbound
  // sockets.  This only limits simultaneous verification requests; normal
  // players use one, and a rejected request can safely be retried.
  maxConcurrentCaptchaChecks: Math.max(1, Math.min(100, Number(env.AJ_CAPTCHA_MAX_CONCURRENT) || 24)),

  // Account-recovery mail is delivered to this HTTPS webhook.  It receives
  // {to, subject, text}; point it at the transactional-mail provider or
  // small mail relay you use.  Recovery is deliberately unavailable until
  // both values are set, rather than ever exposing a reset link in a page.
  recoveryMail: env.AJ_RECOVERY_MAIL_URL && env.AJ_RECOVERY_MAIL_TOKEN
    ? {url: env.AJ_RECOVERY_MAIL_URL, token: env.AJ_RECOVERY_MAIL_TOKEN} : null,

  // asset mirror: anything not served locally is fetched once from here and
  // cached in cacheDir. set AJ_OFFLINE=1 to serve from the cache only.
  upstreamContent: env.AJ_UPSTREAM || "https://ajcontent.akamaized.net/",
  // emoji pictures for chat (lib/emoji.js): Twemoji's, at one version
  emojiUpstream: env.AJ_EMOJI_UPSTREAM || "https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/72x72/",
  offline: env.AJ_OFFLINE === "1",
  // the client's device ids (lib/devices.js): a game whose launcher sent none
  // (a client from before 1.3.0, the official launcher, or one that left
  // them out) is turned away at its login, its popup saying to update.
  // AJ_REQUIRE_DEVICE=0 lets them in (an account seen on banned hardware
  // before is still kept out).
  requireDevice: env.AJ_REQUIRE_DEVICE !== "0",
  // Discord (lib/discord.js): an application's id and secret for linking a
  // player's Discord account on the account page and for allowed accounts to
  // sign in to /dashboard/admin (OAuth2 redirects:
  // <siteUrl>account/discord/callback,
  // <siteUrl>dashboard/admin/discord/callback, and
  // <siteUrl>dashboard/staff/discord/callback), and a bot in Burrow's Discord
  // server for the booster badge. linking is off without the first two, the
  // booster badge left alone without the last two.
  discord: {
    clientId: env.AJ_DISCORD_CLIENT_ID || "",
    clientSecret: env.AJ_DISCORD_CLIENT_SECRET || "",
    botToken: env.AJ_DISCORD_BOT_TOKEN || "",
    guildId: env.AJ_DISCORD_GUILD_ID || "",
    // Optional Components V2 notification channels. Leave any empty to
    // disable that stream: reports, public status, game joins/leaves, the
    // moderation audit trail, and Discord bot command/audit events.
    reportsChannelId: env.AJ_DISCORD_REPORTS_CHANNEL_ID || "",
    statusChannelId: env.AJ_DISCORD_STATUS_CHANNEL_ID || "",
    gameLogsChannelId: env.AJ_DISCORD_GAME_LOGS_CHANNEL_ID || "",
    moderationLogsChannelId: env.AJ_DISCORD_MOD_LOGS_CHANNEL_ID || "",
    botLogsChannelId: env.AJ_DISCORD_BOT_LOGS_CHANNEL_ID || "",
    // A signed GitHub push webhook at /discord/github can turn commits into
    // a Components V2 update card. All three values are needed to enable it.
    githubRepository: env.AJ_GITHUB_REPOSITORY || "", // owner/repository
    githubWebhookSecret: env.AJ_GITHUB_WEBHOOK_SECRET || "",
    updatesChannelId: env.AJ_DISCORD_UPDATES_CHANNEL_ID || "",
  },
  deployVersion: env.AJ_DEPLOY_VERSION || "1830",
  // older builds the CDN still serves, asked in turn for a room file the
  // current build has dropped. 1828 is the last with the Summer Carnival.
  olderBuilds: ["1828"],
  // the client adds this to every asset address, so raising it makes every
  // client fetch everything afresh. raise it whenever the server starts
  // serving an asset differently (4: item defs with all eyes for all animals;
  // 5: re-dated item packs, the room pack, HUD artwork with the 2014 name tag;
  // 6: the party pack; 14 and 15: more rows in the Theme list; 16: clothing
  // for every animal, and last-seen times on player cards; 17 and 18: the
  // banned label on player cards).
  // 19 to 25: the comforts of 2026-10-11, see HANDOFF.md.
  // 39: chat drawn as text and never as markup, the chat filter, and the
  // game no longer open to SWFs from other addresses.
  // 40: the chat filter's window laid out again.
  // 41: the game's text says "Burrow" where it said Animal Jam.
  // 48: the item giver (the item finder renamed) with previews and hex colours;
  // 49 and 50: its link to a colour picker.
  // 61: the Owner, Moderator, Developer and Verified name tag badges seen by everyone.
  // 62: "Custom pictures" in the settings menu, to hide players' item pictures.
  // 83: den items tinted (the tint in their version, DenItemHelper.applyTint).
  // 84: fixes from the owner's list of bugs (bugs.txt, 2026-10-23).
  buildVersion: env.AJ_BUILD_VERSION || "84",
  // what the official CDN is asked for; not ours to change.
  upstreamBuildVersion: "3",

  // the patched game client and the font file its assets import, both in
  // swf/ (ajclient.before-finder.swf there is the base the client is rebuilt
  // from, see the README).
  clientSwf: env.AJ_CLIENT_SWF || path.join(__dirname, "swf", "ajclient.swf"),
  sharedFontsSwf: path.join(__dirname, "swf", "sharedFonts.swf"),
  // the HUD artwork (assets/HUDAssets.swf on the CDN), served from here
  // because it is changed: see "Rebuild" in the README.
  hudAssetsSwf: path.join(__dirname, "swf", "HUDAssets.swf"),
  dataDir: env.AJ_DATA_DIR || path.join(__dirname, "data"),
  cacheDir: path.join(__dirname, "cache"),
  // updates for installed clients, served at /client/ (the client's
  // tools/make-update.js writes them here; they are in the repository)
  clientUpdatesDir: env.AJ_CLIENT_UPDATES_DIR || path.join(__dirname, "client-updates"),
  // the client's installers, listed at /download. not in the repository:
  // copied here by hand after a build (the client's BUILDING.md).
  downloadsDir: env.AJ_DOWNLOADS_DIR || path.join(env.AJ_DATA_DIR || path.join(__dirname, "data"), "downloads"),
  publicDir: path.join(__dirname, "public"),

  // accounts are made through the client's Create Account screens or the
  // /register page. set AJ_REGISTER=1 to also create one whenever an unknown
  // username logs in (handy for throwaway test accounts).
  registerOnLogin: env.AJ_REGISTER === "1",

  // the terms of service and the privacy policy (public/terms.html,
  // public/privacy.html). A sign-up records the version agreed to: change
  // it when either text changes in a way that matters. the values under it
  // are written into both pages. the emails and the host's country are
  // placeholders until set; the operator is, at the owner's word, said to
  // be in the EU without a name or a country.
  termsVersion: "2026-10-21",
  legalEmail: env.AJ_LEGAL_EMAIL || "legal@burrow.moe",
  adminEmail: env.AJ_ADMIN_EMAIL || "admin@burrow.moe",
  operator: env.AJ_OPERATOR || "an individual based in the European Union",
  hostedIn: env.AJ_HOSTED_IN || "[country of the hosting provider]",

  // links on the home page; an empty download reads "Soon"
  downloadUrl: env.AJ_DOWNLOAD_URL || "",
  githubUrl: env.AJ_GITHUB_URL || "",
  discordUrl: env.AJ_DISCORD_URL || "",

  // 2+ is a member. 4 and 5 unlock the client's developer debug overlays.
  // no account type gives powers over other players; running the server is
  // done from the admin panel at /admin (lib/panel.js).
  defaultAccountType: 2,
  // looks of the lands players can pick with the Theme list. the official CDN
  // keeps past builds (35 of them, November 2022 to today), each with that
  // month's version of every land, so a theme is first of all the build to
  // take room files from. `rooms` then names rooms shown as another room
  // file: the room list still carries seasonal copies of some lands that the
  // official game stopped using years ago, and those are older than any
  // build. `label` is for people; the list the game shows is in
  // swf-src/MySettings.as, in the same order.
  //
  // the first eight are the latest year's seasons. the rest is every other
  // season and year there is (DISCOVERIES.md, "Older designs of the lands",
  // says what was looked through and how each was dated): one row for each
  // season of each year the builds cover, then one for each year's worth
  // of leftover seasonal room files. most differ from today's version of
  // their season by a handful of decorations; the ones that show more:
  //   - 1636 and 1637: the Township's painting before it was redone in 2023
  //     and Club Geoz was built.
  //   - 1691 and earlier: the Flag Shop in Sarepia, before it became the
  //     Hall of Animals.
  //   - friendship2018: the Township on its winter 2017 painting with the
  //     old arcade front, and Mt. shiveer before the bridge to Balloosh.
  //   - freedom2021: Freedom Day's fireworks, which today's July build no
  //     longer has.
  themes: {
    halloween: {label: "Halloween", build: 1830},
    fall: {label: "Fall", build: 1829},
    jamaalidays: {label: "Jamaalidays", build: 1810},
    winter: {label: "Winter", build: 1811},
    friendship: {label: "Friendship", build: 1815},
    lucky: {label: "Lucky Day", build: 1817},
    spring: {label: "Spring", build: 1820},
    summer: {label: "Summer", build: 1828},
    halloween2025: {label: "Halloween 2025", build: 1803},
    fall2025: {label: "Fall 2025", build: 1807},
    summer2025: {label: "Summer 2025", build: 1731},
    lucky2025: {label: "Lucky Day 2025", build: 1711},
    summer2024: {label: "Summer 2024", build: 1691},
    spring2024: {label: "Spring 2024", build: 1678},
    lucky2024: {label: "Lucky Day 2024", build: 1676},
    jamaalidays2022: {label: "Jamaalidays 2022", build: 1637},
    fall2022: {label: "Fall 2022", build: 1636},
    freedom2021: {label: "Freedom Day 2021", build: 1824, rooms: {"sarepia.room_main": "sarepia.room_main_freedom"}},
    jamaalidays2020: {label: "Jamaalidays 2020", build: 1810, rooms: {"sarepia.room_main": "sarepia.room_main_jamaalidays"}},
    spring2020: {label: "Spring 2020", build: 1820, rooms: {"canyon_path.room_main": "canyon_path.room_main_main"}},
    jamaalidays2018: {
      label: "Jamaalidays 2018",
      build: 1810,
      rooms: {
        "lost_temple_of_zios.room_main": "lost_temple_of_zios.room_main_jamaalidays",
        "balloosh.room_main": "balloosh.room_main_jamaalidays",
      },
    },
    summer2018: {label: "Summer 2018", build: 1828, rooms: {"sarepia.room_main": "sarepia.room_main_summer"}},
    lucky2018: {label: "Lucky Day 2018", build: 1817, rooms: {"mountains_of_shivveer.room_main": "mountains_of_shivveer.room_main_lucky"}},
    friendship2018: {
      label: "Friendship 2018",
      build: 1815,
      rooms: {
        "jamaa_township.room_main": "jamaa_township.room_main_friendship",
        "mountains_of_shivveer.room_main": "mountains_of_shivveer.room_main_friendship",
        "crystal_sands.room_main": "crystal_sands.room_main_friendship",
        "lost_temple_of_zios.room_main": "lost_temple_of_zios.room_main_friendship",
      },
    },
    // the Phantom Vortex rooms as saved in 2011 and 2013: no shop, no fog.
    halloween2013: {
      label: "Halloween 2013",
      build: 1830,
      rooms: Object.fromEntries([1, 2, 3, 4, 5].map(n => [`holidays_and_celebrations.room_jamaa_halloween${n}`, `rholidays_and_celebrations.room_jamaa_halloween${n}`])),
    },
  },
  // rooms shown as another version of themselves in some months (1-12).
  // both are versions the official game put up for a while and no door
  // leads to today; when it did so is not recorded, so the months are ours:
  // the Canyons Pathway with the plushie scavenger hunt's stand in spring,
  // and the Conservation Museum with its "Antlers and Tusks" exhibit in
  // place of the savannah one every other month.
  roomSwaps: [
    {room: "canyon_path.room_main", shown: "canyon_path.room_main_main", months: [3, 4]},
    {room: "appondale.room_museum", shown: "appondale.room_museum_ant", months: [2, 4, 6, 8, 10, 12]},
  ],
  startupRoom: "jamaa_township.room_main",
  // where a player who does not start in their den arrives: one of these at
  // random, of those that are not full (lib/world.js). AJ_SPAWN_ROOMS: a
  // list of its own, comma-separated (the tests' is the township alone).
  spawnRooms: env.AJ_SPAWN_ROOMS ? env.AJ_SPAWN_ROOMS.split(",").map(room => room.trim()).filter(Boolean)
    : ["jamaa_township.room_main", "sarepia.room_main", "crystal_sands.room_main", "coral_canyons.room_main",
      "mountains_of_shivveer.room_main", "appondale.room_main", "lost_temple_of_zios.room_main", "aussie.room_main", "balloosh.room_main"],
  // the worlds, each its own copy of every land (rooms are "path#world";
  // dens and parties are everyone's). a player arrives in one at random and
  // can switch in the settings menu (gui.ServerSelector). the game names
  // world N after the Nth name of its own list (551 Aldan, 552 Congo...,
  // generic list 16), so the names here are only for the panels and logs.
  // AJ_WORLDS: how many (the tests' is one).
  // the admin panel can change how many while the server runs (lib/world.js
  // setWorldCount), which then outlasts a restart.
  worldNames: ["Aldan", "Congo", "Draa", "Grande", "Kama", "Nile", "Pecos", "Ramu", "Tigris", "Zambezi"],
  shards: ["Aldan", "Congo", "Draa", "Grande", "Kama", "Nile", "Pecos", "Ramu", "Tigris", "Zambezi"]
    .slice(0, Math.min(10, Math.max(1, Number(env.AJ_WORLDS) || 2))).map((name, i) => ({id: i + 1, name})),
  maxUsersPerRoom: 40,
  // everything in every shop for nothing (AJ_FREE_SHOPS=1). off unless
  // asked for: what the game's shops make of a price of 0 has not been seen.
  freeShops: env.AJ_FREE_SHOPS === "1",
  // smooth movement in the client (AJClient.smoothOn in the SWF) for players
  // who never chose: on, or with AJ_SMOOTH=0 off for everyone who has not
  // chosen "Graphics: Smooth" themselves. the way back if it misbehaves.
  smooth: env.AJ_SMOOTH !== "0",
  partyMinutes: 120,
  // row of the den-room defPack every player's den uses (1 = the small free den).
  denDefId: 1,
  // every currency of every account is raised to at least this at each login,
  // so nobody runs dry while testing.
  minimumCurrency: 10000000,

  // limits on what strangers can do. requests from the server's own machine
  // are exempt from the per-address ones (see trustLocalRequests).
  registrationsPerHour: 5, // per address
  failedLoginsPerTenMinutes: 10, // per address, and 3x this per account
  errorReportsPerMinute: 30, // per address
  maxConnectionsPerAddress: 10, // game sockets
  // the asset mirror (lib/cdn.js): files asked for that are not in the
  // cache yet, per address; how long the official CDN is waited for; and
  // how big the cache may grow (files are still fetched and served past
  // that, only not kept).
  cacheMissesPerTenMinutes: 1500, // a first visit with an empty cache fetches several hundred files
  upstreamTimeoutMs: 20000,
  maxCacheBytes: Number(env.AJ_MAX_CACHE_MB || 8192) * 1024 * 1024,
  // how often at most the packs with custom items in are made again after
  // one changes (lib/defpacks.js clientPack); the tests use 0, made at once.
  packRemakeMs: env.AJ_PACK_REMAKE_MS === undefined ? 15000 : Number(env.AJ_PACK_REMAKE_MS),
  // masterpieces (lib/masterpieces.js): seconds an account must have had
  // before it paints one (AJ_MASTERPIECE_MIN_AGE; the tests use 0), and new
  // pictures an account may post in any 24 hours.
  masterpieceMinAccountAge: env.AJ_MASTERPIECE_MIN_AGE === undefined ? 86400 : Number(env.AJ_MASTERPIECE_MIN_AGE),
  masterpiecesPerDay: 10,
  maxConnections: 2000,
  maxHttpConnections: 2000, // open at once, in all
  maxHttpConnectionsPerAddress: 40, // the game opens a good many at once while it loads
  httpSocketTimeoutMs: 60000, // a connection nothing moves on is closed
  tlsHandshakeTimeoutMs: 10000,
  maxMessagesPerTenSeconds: 400, // per game socket; walking sends a few a second
  loginTimeoutMs: 30000, // a game socket must log in within this
  // a client sends nothing while its player is away, and signs itself out
  // after 75 minutes of that (com.sbi.client.KeepAlive): the socket waits longer.
  idleTimeoutMs: 80 * 60000,
  tokenLifetimeDays: 30, // login tokens kept by the launcher's "remember me"
  // a line as sent: the client's chat box takes 200 (gui.ChatHistory), and
  // each emoji goes as a tag of 8 or more ("\{1f600}"). lib/chatspam.js
  // cuts down what is long for no good reason.
  maxChatLength: 600,
  // how old an account must be before it may give its items pictures
  // (lib/playeritems.js), so a picture turned away is not simply sent again
  // from a new account. not for this machine's own requests (AJ_ITEM_ART_MIN_HOURS).
  itemArtMinAccountHours: Number(env.AJ_ITEM_ART_MIN_HOURS || 24),
  // warnings (lib/moderation.js warn): the Nth one within `days` also
  // silences the player for that many minutes, [[N, minutes], ...]. a
  // longer silence already on them stays. steps [] turns it off.
  warningSilence: {days: 30, steps: [[3, 60], [5, 24 * 60]]},
  // days typed chat and whispers are kept for the moderator panel's chat
  // history (lib/chatlog.js); 0 keeps none.
  chatLogDays: env.AJ_CHAT_LOG_DAYS === undefined ? 30 : Math.max(0, Number(env.AJ_CHAT_LOG_DAYS) || 0),
  chatLinesPerWindow: 5, // typed chat lines one player may send ...
  chatWindowMs: 3000, // ... in this long
  roomActionsPerWindow: 6, // emotes, actions and the like one player may send a room ...
  roomActionWindowMs: 3000, // ... in this long (the rest reach nobody)
  // eco den items (lib/eco.js): credits an hour for each point of eco power
  // placed in a den, and what an account is given the first time it looks
  // (an Eco Solar Panel's price)
  ecoCreditsPerPointHour: 1,
  ecoStartCredits: 1500,
  maxBytesPerTenSeconds: 512 * 1024, // per game socket; saving a full den is about 40 KB
  // custom colours (lib/colours.js). every one ever made is sent to every
  // player at every login and is never taken out again, so there is an end
  // to how many one account may add in a day and to the table as a whole.
  customColoursPerDay: 30,
  maxCustomColours: 20000,

  // may a client pick, when it logs in, how the game should treat the
  // account for that session: member or not, guide, moderator, membership
  // days left (the custom client's "advanced" settings)? it changes what that
  // player's own game shows and the badge others see, never what the server
  // lets them do. on by default only for a local server;
  // AJ_LOGIN_CHOICES=1 / 0 forces it.
  loginChoices: env.AJ_LOGIN_CHOICES === undefined ? !isPublic : env.AJ_LOGIN_CHOICES === "1",

  // log every game packet in both directions (login tokens are masked), plus
  // the client's media-load traces. on by default only for a local server;
  // AJ_QUIET=1 / AJ_QUIET=0 forces it off / on.
  logPackets: env.AJ_QUIET === undefined ? !isPublic : env.AJ_QUIET !== "1",
};
