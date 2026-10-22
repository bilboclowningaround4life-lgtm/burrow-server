"use strict";

// Burrow's Discord control surface. It is intentionally a thin client over
// lib/modpanel.js: Discord proves who clicked a command, and the panel then
// proves that their linked Burrow account is still active staff and applies
// its usual permission and rank rules. There is no Discord-only staff list.

// discord.js is loaded when the bot starts, not with the server: a server
// without the package installed (npm ci) runs as before, the bot off.
let ActionRowBuilder;
let ButtonBuilder;
let ButtonStyle;
let ChannelType;
let Client;
let GatewayIntentBits;
let PermissionFlagsBits;
let SlashCommandBuilder;
const loadDiscordJs = () => {
  if (Client) return true;
  try {
    ({ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, Client, GatewayIntentBits, PermissionFlagsBits, SlashCommandBuilder} = require("discord.js"));
    return true;
  }
  catch (err) {
    console.log(`[discord-bot] discord.js could not be loaded (run npm ci): ${logText(err.message)}`);
    return false;
  }
};
const crypto = require("crypto");
const accounts = require("./accounts.js");
const config = require("../config.js");
const modpanel = require("./modpanel.js");
const modlog = require("./modlog.js");
const reports = require("./reports.js");
const world = require("./world.js");
const {logText} = require("./logtext.js");

// discord.js's MessageFlags.IsComponentsV2 and MessageFlags.Ephemeral, which
// cards need before the package is loaded
const COMPONENTS_V2 = 1 << 15;
const EPHEMERAL = 1 << 6;
const STATUS_MESSAGE_SETTING = "discordBotStatusMessage";
const STATUS_TITLE_SETTING = "discordBotStatusTitle";
const STATUS_NOTE_SETTING = "discordBotStatusNote";
const STATUS_BANNER_SETTING = "discordBotStatusBanner";
const STATUS_EVERY_MS = 5 * 60000;
const REPORT_BUTTON_PREFIX = "burrow:report:";
const MAX_GITHUB_WEBHOOK_BYTES = 512 * 1024;
const CONFIG_SETTING_PREFIX = "discordBotConfig:";
const SECURITY_SETTING = "discordBotSecurity";
const COMMUNITY_SETTING = "discordBotCommunity";
const CHANNELS = [
  ["reportsChannelId", "Reports"],
  ["statusChannelId", "Public status"],
  ["gameLogsChannelId", "In-game activity"],
  ["moderationLogsChannelId", "Moderation audit"],
  ["botLogsChannelId", "Discord bot audit"],
  ["updatesChannelId", "GitHub updates"],
];
const MANAGED_CONFIG = [...CHANNELS.map(([key]) => key), "githubRepository"];
let loadedDashboardConfig = false;
let securityConfigLoaded = false;
let securityConfig = null;
let communityConfig = null;
let communityConfigLoaded = false;
const recentMessages = new Map();
const recentJoins = [];
let lastRaidAlertAt = 0;

// Text Displays accept markdown. Keep player-provided strings readable while
// ensuring a report cannot ping a Discord role or user.
const safe = (value, max = 1000) => String(value === undefined || value === null ? "" : value)
  .replace(/@/g, "@\u200b").replace(/`/g, "'").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);

// Discord fetches the banner itself, so only absolute http(s) URLs work.
// Blank means the card has no banner; null means the URL was rejected.
const bannerUrl = value => {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    const url = new URL(text);
    return /^https?:$/.test(url.protocol) && text.length <= 500 ? url.toString() : null;
  }
  catch {
    return null;
  }
};

const statusSettings = () => ({
  title: safe(accounts.setting(STATUS_TITLE_SETTING) || "Burrow status", 80) || "Burrow status",
  note: safe(accounts.setting(STATUS_NOTE_SETTING) || "", 500),
  banner: bannerUrl(accounts.setting(STATUS_BANNER_SETTING)) || "",
});

const setStatusSettings = ({title, note, banner}) => {
  const next = {
    title: safe(title || "Burrow status", 80) || "Burrow status",
    note: safe(note || "", 500),
    banner: bannerUrl(banner),
  };
  if (next.banner === null) return {error: "Banner must be an http(s) image URL of 500 characters or fewer, or blank for none."};
  accounts.setSetting(STATUS_TITLE_SETTING, next.title);
  accounts.setSetting(STATUS_NOTE_SETTING, next.note);
  accounts.setSetting(STATUS_BANNER_SETTING, next.banner);
  return next;
};

const securitySettings = () => {
  if (securityConfigLoaded) return {...securityConfig};
  const defaults = {enabled: false, blockInvites: true, blockedWords: [], spamLimit: 6, raidJoinLimit: 12};
  try {
    const saved = JSON.parse(accounts.setting(SECURITY_SETTING) || "{}");
    const words = Array.isArray(saved.blockedWords) ? saved.blockedWords.map(word => safe(word, 60).toLowerCase()).filter(Boolean).slice(0, 50) : [];
    securityConfig = {
      enabled: saved.enabled === true,
      blockInvites: saved.blockInvites !== false,
      blockedWords: [...new Set(words)],
      spamLimit: Number.isInteger(saved.spamLimit) && saved.spamLimit >= 2 && saved.spamLimit <= 20 ? saved.spamLimit : defaults.spamLimit,
      raidJoinLimit: Number.isInteger(saved.raidJoinLimit) && saved.raidJoinLimit >= 3 && saved.raidJoinLimit <= 100 ? saved.raidJoinLimit : defaults.raidJoinLimit,
    };
  }
  catch {
    securityConfig = defaults;
  }
  securityConfigLoaded = true;
  return {...securityConfig};
};

const updateSecuritySettings = values => {
  const words = String(values.blockedWords || "").split(/\r?\n|,/)
    .map(word => safe(word, 60).toLowerCase()).filter(Boolean).slice(0, 50);
  const spamLimit = Number(values.spamLimit);
  const raidJoinLimit = Number(values.raidJoinLimit);
  if (!Number.isInteger(spamLimit) || spamLimit < 2 || spamLimit > 20 || !Number.isInteger(raidJoinLimit) || raidJoinLimit < 3 || raidJoinLimit > 100) {
    return {error: "Spam limit must be 2 to 20 and raid join limit must be 3 to 100."};
  }
  securityConfig = {enabled: values.enabled === true, blockInvites: values.blockInvites === true,
    blockedWords: [...new Set(words)], spamLimit, raidJoinLimit};
  securityConfigLoaded = true;
  accounts.setSetting(SECURITY_SETTING, JSON.stringify(securityConfig));
  return {ok: "Discord security settings saved. Reconnect the bot to apply message and join monitoring.", security: securitySettings()};
};

const communitySettings = () => {
  if (communityConfigLoaded) return {...communityConfig};
  try {
    const saved = JSON.parse(accounts.setting(COMMUNITY_SETTING) || "{}");
    communityConfig = {ticketCategoryId: channelId(saved.ticketCategoryId) || "", ticketStaffRoleId: channelId(saved.ticketStaffRoleId) || "",
      welcomeChannelId: channelId(saved.welcomeChannelId) || "", welcomeMessage: safe(saved.welcomeMessage || "Welcome {user} to {server}!", 500),
      goodbyeChannelId: channelId(saved.goodbyeChannelId) || "", goodbyeMessage: safe(saved.goodbyeMessage || "Goodbye {user}.", 500)};
  }
  catch { communityConfig = {ticketCategoryId: "", ticketStaffRoleId: "", welcomeChannelId: "", welcomeMessage: "Welcome {user} to {server}!", goodbyeChannelId: "", goodbyeMessage: "Goodbye {user}."}; }
  communityConfigLoaded = true;
  return {...communityConfig};
};

const updateCommunitySettings = values => {
  const current = communitySettings();
  const next = {...current};
  for (const key of ["ticketCategoryId", "ticketStaffRoleId", "welcomeChannelId", "goodbyeChannelId"]) {
    const id = channelId(values[key]);
    if (id === null) return {error: "Discord channel, category, and role IDs must contain only 5 to 25 digits."};
    next[key] = id;
  }
  next.welcomeMessage = safe(values.welcomeMessage || "", 500);
  next.goodbyeMessage = safe(values.goodbyeMessage || "", 500);
  communityConfig = next;
  communityConfigLoaded = true;
  accounts.setSetting(COMMUNITY_SETTING, JSON.stringify(next));
  return {ok: "Community and ticket settings saved.", community: communitySettings()};
};

// Non-secret routing settings are owner-controlled in the dashboard. The bot
// token and webhook secret deliberately remain environment-only, so a copied
// database or dashboard session cannot disclose them.
const loadDashboardConfig = () => {
  if (loadedDashboardConfig) return;
  for (const key of MANAGED_CONFIG) {
    const saved = accounts.setting(`${CONFIG_SETTING_PREFIX}${key}`);
    if (saved !== null) config.discord[key] = saved;
  }
  loadedDashboardConfig = true;
};

const channelId = value => {
  const id = String(value === undefined || value === null ? "" : value).trim();
  return id === "" || /^\d{5,25}$/.test(id) ? id : null;
};

const updateDashboardConfig = values => {
  loadDashboardConfig();
  const previousStatusChannelId = config.discord.statusChannelId || "";
  const next = {};
  for (const [key] of CHANNELS) {
    const id = channelId(values[key]);
    if (id === null) return {error: "Discord channel IDs must contain only 5 to 25 digits."};
    next[key] = id;
  }
  const repository = String(values.githubRepository === undefined || values.githubRepository === null ? "" : values.githubRepository).trim();
  if (repository && !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}\/[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(repository)) {
    return {error: "GitHub repository must use the form owner/repository."};
  }
  next.githubRepository = repository;
  for (const key of MANAGED_CONFIG) {
    config.discord[key] = next[key];
    accounts.setSetting(`${CONFIG_SETTING_PREFIX}${key}`, next[key]);
  }
  if (next.statusChannelId !== previousStatusChannelId) {
    accounts.setSetting(STATUS_MESSAGE_SETTING, "");
  }
  return {ok: "Discord routing settings saved.", configuration: dashboardStatus()};
};

const duration = seconds => {
  if (seconds === -1) return "permanent";
  if (!seconds) return "none";
  const hours = Math.ceil(Number(seconds) / 3600);
  return `${hours} hour${hours === 1 ? "" : "s"}`;
};

// Components V2 means every visible response—success, refusal, report alert
// and status card—uses a Container and Text Displays. Never add `content` or
// `embeds` to these payloads: Discord ignores them for Components V2.
const card = ({title, sections = [], tone = 0x5865f2, ephemeral = false, components = []}) => ({
  flags: COMPONENTS_V2 | (ephemeral ? EPHEMERAL : 0),
  allowedMentions: {parse: []},
  components: [{
    type: 17, // Container
    accent_color: tone,
    components: [
      {type: 10, content: `## ${safe(title, 160)}`}, // Text Display
      ...sections.filter(Boolean).slice(0, 8).flatMap((section, index) => [
        ...(index ? [{type: 14, divider: true, spacing: 1}] : []), // Separator
        {type: 10, content: safe(section, 1800)},
      ]),
      ...components,
    ],
  }],
});

const success = (title, sections, ephemeral = true) => card({title, sections, tone: 0x57f287, ephemeral});
const warning = (message, ephemeral = true) => card({title: "Burrow", sections: [message], tone: 0xfee75c, ephemeral});
const failure = (message, ephemeral = true) => card({title: "Burrow", sections: [message], tone: 0xed4245, ephemeral});

// Staff audit streams use the same compact Components V2 pattern as SRP-Bot:
// a brief summary, structured fields, and a durable log timestamp.
const logCard = ({title, description = "", fields = [], tone = 0x5865f2}) => {
  const shown = fields.filter(field => field && field.name && field.value !== undefined && field.value !== null).slice(0, 12);
  const components = [{type: 10, content: [
    `## ${safe(title, 160)}`,
    description ? safe(description, 900) : "",
  ].filter(Boolean).join("\n")}];

  if (shown.length) {
    components.push({type: 14, divider: true, spacing: 1});
    components.push({type: 10, content: shown
      .map(field => `• **${safe(field.name, 80)}:** ${safe(field.value, 500)}`)
      .join("\n")
      .slice(0, 1800)});
  }

  const now = Math.floor(Date.now() / 1000);
  components.push({type: 14, divider: false, spacing: 1});
  components.push({type: 10, content: `_Logged <t:${now}:F> (<t:${now}:R>)_`});
  return {
    flags: COMPONENTS_V2,
    allowedMentions: {parse: []},
    components: [{type: 17, accent_color: tone, components}],
  };
};

const commandDefinitions = () => [
  new SlashCommandBuilder().setName("burrow").setDescription("View Burrow server and player information")
    .addSubcommand(command => command.setName("status").setDescription("Show the live Burrow server status"))
    .addSubcommand(command => command.setName("player").setDescription("Look up a Burrow player")
      .addStringOption(option => option.setName("username").setDescription("Burrow username").setRequired(true)))
    .addSubcommand(command => command.setName("reports").setDescription("Show open player reports"))
    .addSubcommand(command => command.setName("staff").setDescription("Show Burrow staff"))
    .addSubcommand(command => command.setName("announce").setDescription("Send an announcement to everyone playing")
      .addStringOption(option => option.setName("message").setDescription("Announcement shown in-game").setRequired(true).setMaxLength(300))),
  new SlashCommandBuilder().setName("moderate").setDescription("Moderate Burrow through your linked staff account")
    .addSubcommand(command => command.setName("warn").setDescription("Warn a player")
      .addStringOption(option => option.setName("username").setDescription("Burrow username").setRequired(true))
      .addStringOption(option => option.setName("reason").setDescription("Warning reason, e.g. behavior or custom").setRequired(true))
      .addStringOption(option => option.setName("note").setDescription("Required explanation for a custom warning")))
    .addSubcommand(command => command.setName("silence").setDescription("Stop a player from chatting")
      .addStringOption(option => option.setName("username").setDescription("Burrow username").setRequired(true))
      .addIntegerOption(option => option.setName("hours").setDescription("Whole hours; 0 means until lifted").setRequired(true).setMinValue(0).setMaxValue(87600)))
    .addSubcommand(command => command.setName("unsilence").setDescription("Let a player chat again")
      .addStringOption(option => option.setName("username").setDescription("Burrow username").setRequired(true)))
    .addSubcommand(command => command.setName("kick").setDescription("Disconnect an online player")
      .addStringOption(option => option.setName("username").setDescription("Burrow username").setRequired(true)))
    .addSubcommand(command => command.setName("ban").setDescription("Ban a player")
      .addStringOption(option => option.setName("username").setDescription("Burrow username").setRequired(true))
      .addIntegerOption(option => option.setName("hours").setDescription("Whole hours; 0 means permanent").setRequired(true).setMinValue(0).setMaxValue(87600))
      .addStringOption(option => option.setName("reason").setDescription("Why this player is being banned").setRequired(true)))
    .addSubcommand(command => command.setName("unban").setDescription("Lift a player's Burrow ban")
      .addStringOption(option => option.setName("username").setDescription("Burrow username").setRequired(true))),
  new SlashCommandBuilder().setName("discord").setDescription("Moderate this Discord server through Burrow staff permissions")
    .addSubcommand(command => command.setName("timeout").setDescription("Temporarily silence a Discord member")
      .addUserOption(option => option.setName("member").setDescription("Discord member").setRequired(true))
      .addIntegerOption(option => option.setName("hours").setDescription("Whole hours, up to 28 days").setRequired(true).setMinValue(1).setMaxValue(672))
      .addStringOption(option => option.setName("reason").setDescription("Why this member is being timed out").setMaxLength(300)))
    .addSubcommand(command => command.setName("untimeout").setDescription("Remove a Discord member timeout")
      .addUserOption(option => option.setName("member").setDescription("Discord member").setRequired(true))
      .addStringOption(option => option.setName("reason").setDescription("Why the timeout is being removed").setMaxLength(300)))
    .addSubcommand(command => command.setName("kick").setDescription("Remove a Discord member from this server")
      .addUserOption(option => option.setName("member").setDescription("Discord member").setRequired(true))
      .addStringOption(option => option.setName("reason").setDescription("Why this member is being removed").setMaxLength(300)))
    .addSubcommand(command => command.setName("ban").setDescription("Ban a Discord member from this server")
      .addUserOption(option => option.setName("member").setDescription("Discord member").setRequired(true))
      .addStringOption(option => option.setName("reason").setDescription("Why this member is being banned").setMaxLength(300)))
    .addSubcommand(command => command.setName("unban").setDescription("Lift a Discord server ban")
      .addStringOption(option => option.setName("user_id").setDescription("Discord user ID").setRequired(true).setMinLength(5).setMaxLength(25))
      .addStringOption(option => option.setName("reason").setDescription("Why the ban is being removed").setMaxLength(300)))
    .addSubcommand(command => command.setName("purge").setDescription("Delete recent messages in this channel")
      .addIntegerOption(option => option.setName("amount").setDescription("Messages to delete (1 to 100)").setRequired(true).setMinValue(1).setMaxValue(100))
      .addStringOption(option => option.setName("reason").setDescription("Why messages are being removed").setMaxLength(300))),
  new SlashCommandBuilder().setName("ticket").setDescription("Open or manage a private support ticket")
    .addSubcommand(command => command.setName("open").setDescription("Open a private support ticket")
      .addStringOption(option => option.setName("subject").setDescription("What you need help with").setRequired(true).setMaxLength(80)))
    .addSubcommand(command => command.setName("close").setDescription("Close this support ticket")),
].map(command => command.toJSON());

const actorFor = interaction => modpanel.discordBot.actor(interaction.user.id);

const reportButton = report => new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId(`${REPORT_BUTTON_PREFIX}${report.id}:handled`).setLabel("Mark handled").setStyle(ButtonStyle.Success),
).toJSON();

const reportCard = (report, {handled = false, ephemeral = false} = {}) => card({
  title: handled ? `Report #${report.id} handled` : `Report #${report.id}`,
  tone: handled ? 0x57f287 : 0xfee75c,
  ephemeral,
  sections: [
    `**${safe(report.reporter, 40)}** reported **${safe(report.target, 40)}**\n${safe(report.reason, 200)}`,
    report.detail ? `**Details**\n${safe(report.detail, 500)}` : "*No additional details.*",
    report.room ? `Room: \`${safe(report.room, 100)}\`` : "",
  ],
  components: handled ? [] : [{type: 14, divider: true, spacing: 1}, reportButton(report)],
});

const playerCard = player => success(`Player: ${player.username}`, [
  `**Status**\n${player.online ? `Online${player.room ? ` in ${safe(player.room, 100)}` : ""}` : "Offline"}\nRole: ${player.role || "Player"}`,
  `**Moderation**\nBan: ${duration(player.banned)}\nSilence: ${duration(player.silenced)}\nWarnings: ${player.warnings}\nOpen reports: ${player.openReports}`,
  player.discord ? `**Discord**\n${safe(player.discord, 80)}` : "",
]);

const statusCard = status => {
  const settings = statusSettings();
  const now = Math.floor(Date.now() / 1000);
  const startedAt = now - status.uptimeSeconds;
  const rooms = `${status.rooms} room${status.rooms === 1 ? "" : "s"}`;
  const playUrl = new URL("gameClient/game/index.html", config.siteUrl).toString();

  // This is intentionally public-only: moderation reports and queue depth are
  // staff data and do not belong in a community-facing server-status post.
  return {
    flags: COMPONENTS_V2,
    allowedMentions: {parse: []},
    components: [{
      type: 17,
      accent_color: 0x7c5ce7,
      components: [
        {type: 10, content: `## ${safe(settings.title, 80)}`},
        {type: 14, divider: true, spacing: 1},
        {type: 10, content: ["### STATUS", "🟢 **Online**", settings.note ? `\n${safe(settings.note, 500)}` : ""].filter(Boolean).join("\n")},
        {type: 14, divider: true, spacing: 1},
        {type: 10, content: `### PLAYERS\n\`${status.players} online\` • \`${rooms}\``},
        {type: 14, divider: true, spacing: 1},
        {type: 10, content: `### UPTIME\nStarted <t:${startedAt}:R> • ${status.memoryMb} MB memory`},
        ...settings.banner ? [{type: 12, items: [{media: {url: settings.banner}}]}] : [],
        {type: 1, components: [{type: 2, style: 5, label: "Play Burrow", url: playUrl}]},
        {type: 10, content: `_Last updated <t:${now}:R>_`},
      ],
    }],
  };
};

const staffCard = staff => success("Burrow staff", staff.length
  ? [staff.map(member => `**${safe(member.username, 40)}** — ${safe(member.role, 30)}${member.twoStep ? " · 2FA" : ""}`).join("\n")]
  : ["No active Burrow staff accounts."]);

const inConfiguredGuild = interaction => interaction.guildId === config.discord.guildId;

const replyResult = async (interaction, result, title = "Burrow") => {
  if (result.error) {
    await interaction.editReply(failure(result.error));
    return;
  }
  await interaction.editReply(success(title, [result.ok, result.detail].filter(Boolean)));
};

const handleBurrow = async interaction => {
  const actor = actorFor(interaction);
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "status") {
    const result = modpanel.discordBot.status(actor);
    await interaction.editReply(result.error ? failure(result.error) : {...statusCard(result), flags: COMPONENTS_V2 | EPHEMERAL});
    return;
  }
  if (subcommand === "player") {
    const result = modpanel.discordBot.player(actor, interaction.options.getString("username", true));
    await interaction.editReply(result.error ? failure(result.error) : {...playerCard(result.player), flags: COMPONENTS_V2 | EPHEMERAL});
    return;
  }
  if (subcommand === "staff") {
    const result = modpanel.discordBot.staff(actor);
    await interaction.editReply(result.error ? failure(result.error) : staffCard(result.staff));
    return;
  }
  if (subcommand === "announce") {
    await replyResult(interaction, modpanel.discordBot.announce(actor, interaction.options.getString("message", true)), "In-game announcement");
    return;
  }
  const result = modpanel.discordBot.reports(actor);
  if (result.error) {
    await interaction.editReply(failure(result.error));
    return;
  }
  const shown = result.reports.slice(0, 5);
  await interaction.editReply(success("Open reports", [
    `${result.open} open report${result.open === 1 ? "" : "s"}.`,
    shown.length ? shown.map(report => `#${report.id} — **${safe(report.target, 40)}** — ${safe(report.reason, 100)}`).join("\n") : "No reports are waiting.",
  ]));
};

const handleModerate = async interaction => {
  const actor = actorFor(interaction);
  const subcommand = interaction.options.getSubcommand();
  const username = interaction.options.getString("username", true);
  const fields = {action: subcommand};
  if (subcommand === "warn") {
    fields.reason = interaction.options.getString("reason", true);
    fields.note = interaction.options.getString("note") || "";
  }
  if (subcommand === "silence" || subcommand === "ban") {
    fields.hours = interaction.options.getInteger("hours", true);
  }
  if (subcommand === "ban") {
    fields.reason = interaction.options.getString("reason", true);
  }
  await replyResult(interaction, modpanel.discordBot.act(actor, username, fields), `Moderation: ${subcommand}`);
};

const nativeDiscordPermission = action => ({
  timeout: "chat.silence",
  untimeout: "chat.silence",
  kick: "player.kick",
  ban: "player.ban",
  unban: "player.ban",
  purge: "player.kick",
})[action] || "";

const handleDiscordModeration = async interaction => {
  const actor = actorFor(interaction);
  const action = interaction.options.getSubcommand();
  const refused = modpanel.discordBot.authorize(actor, nativeDiscordPermission(action));
  if (refused) {
    await interaction.editReply(failure(refused.error));
    return;
  }
  const reason = safe(interaction.options.getString("reason") || `Burrow staff action by ${actor.username}`, 300);
  const user = action === "unban" ? null : interaction.options.getUser("member", true);
  if (user && modpanel.discordBot.actor(user.id)) {
    await interaction.editReply(failure("Discord-native moderation cannot target an active linked Burrow staff account."));
    return;
  }
  try {
    let detail = "";
    let target = user ? user.username : interaction.options.getString("user_id", true);
    if (action === "timeout" || action === "untimeout" || action === "kick") {
      const member = await interaction.guild.members.fetch(user.id);
      if (action === "timeout") {
        const hours = interaction.options.getInteger("hours", true);
        await member.timeout(hours * 3600000, reason);
        detail = `${hours} hour${hours === 1 ? "" : "s"}`;
      }
      else if (action === "untimeout") {
        await member.timeout(null, reason);
      }
      else {
        await member.kick(reason);
      }
    }
    else if (action === "ban") {
      await interaction.guild.members.ban(user.id, {reason, deleteMessageSeconds: 0});
    }
    else if (action === "unban") {
      if (!/^\d{5,25}$/.test(target)) throw new Error("bad_user_id");
      await interaction.guild.members.unban(target, reason);
    }
    else if (action === "purge") {
      const amount = interaction.options.getInteger("amount", true);
      if (!interaction.channel || !interaction.channel.isTextBased() || typeof interaction.channel.bulkDelete !== "function") throw new Error("not_text_channel");
      const deleted = await interaction.channel.bulkDelete(amount, true);
      detail = `${deleted.size} message${deleted.size === 1 ? "" : "s"}`;
      target = "this channel";
    }
    else throw new Error("unknown_action");
    modlog.record(actor.username, `Discord ${action}`, target, detail || reason);
    await interaction.editReply(success(`Discord ${action}`, [`${safe(target, 80)} — ${detail || "completed"}.`].concat(reason ? [`Reason: ${reason}`] : [])));
  }
  catch (err) {
    if (err.message === "bad_user_id") {
      await interaction.editReply(failure("Enter a valid Discord user ID."));
      return;
    }
    console.log(`[discord-bot] Discord ${action} failed: ${logText(err.message)}`);
    await interaction.editReply(failure("Discord could not complete that action. Check the bot permission and role position."));
  }
};

const ticketOwner = channel => (channel && /^burrow-ticket:(\d{5,25})$/.exec(channel.topic || "") || [])[1] || "";

const handleTicket = async interaction => {
  const action = interaction.options.getSubcommand();
  const settings = communitySettings();
  if (action === "open") {
    if (!settings.ticketCategoryId || !settings.ticketStaffRoleId) {
      await interaction.editReply(failure("Tickets are not configured. Ask an owner to set the ticket category and staff role in the Discord dashboard."));
      return;
    }
    const subject = safe(interaction.options.getString("subject", true), 80);
    const channel = await interaction.guild.channels.create({
      name: `ticket-${interaction.user.id}`,
      type: ChannelType.GuildText,
      parent: settings.ticketCategoryId,
      topic: `burrow-ticket:${interaction.user.id}`,
      permissionOverwrites: [
        {id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel]},
        {id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]},
        {id: settings.ticketStaffRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]},
        {id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ReadMessageHistory]},
      ],
    }).catch(() => null);
    if (!channel) {
      await interaction.editReply(failure("Discord could not open the ticket. Check the category, staff role, and bot channel permissions."));
      return;
    }
    await channel.send(card({title: "Support ticket", tone: 0x5865f2, sections: [`Opened by **${safe(interaction.user.username, 80)}**\nSubject: ${subject}`, "A staff member will reply here. Use `/ticket close` when this is resolved."]}));
    await interaction.editReply(success("Ticket opened", [`Your private ticket: ${channel}`]));
    return;
  }
  const owner = ticketOwner(interaction.channel);
  const staff = actorFor(interaction);
  if (!owner || (owner !== interaction.user.id && !staff)) {
    await interaction.editReply(failure("Only the ticket opener or linked Burrow staff can close this ticket."));
    return;
  }
  await interaction.channel.setName(`closed-${interaction.channel.name}`.slice(0, 100)).catch(() => {});
  if (owner) await interaction.channel.permissionOverwrites.edit(owner, {ViewChannel: false}).catch(() => {});
  modlog.record(staff ? staff.username : interaction.user.username, "Discord ticket closed", interaction.channel.name);
  await interaction.editReply(success("Ticket closed", ["The opener can no longer view this channel. Staff retain it for the support record."]));
};

const handleButton = async interaction => {
  const match = new RegExp(`^${REPORT_BUTTON_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\d+):handled$`).exec(interaction.customId);
  if (!match) {
    return false;
  }
  if (!inConfiguredGuild(interaction)) {
    await interaction.reply(failure("This control belongs to another Discord server.")).catch(() => {});
    return true;
  }
  const result = modpanel.discordBot.handleReport(actorFor(interaction), Number(match[1]));
  if (result.error) {
    await interaction.reply(failure(result.error)).catch(() => {});
    return true;
  }
  await interaction.update(success(`Report #${Number(match[1])} handled`, [result.ok], false)).catch(() => {});
  return true;
};

let client = null;
let statusTimer = null;
let unsubscribeReports = null;
let unsubscribeGameActivity = null;
let unsubscribeModeration = null;
let securityGatewayOn = false;

const channelFor = async id => {
  if (!id || !client || !client.isReady()) return null;
  const channel = await client.channels.fetch(id).catch(() => null);
  return channel && channel.isTextBased() ? channel : null;
};

const postCard = async (channelId, payload, label) => {
  const channel = await channelFor(channelId);
  if (channel) {
    await channel.send(payload).catch(err => console.log(`[discord-bot] ${label} failed: ${logText(err.message)}`));
  }
};

const publishStatus = async () => {
  const channel = await channelFor(config.discord.statusChannelId);
  if (!channel) return {error: "The public status channel is not configured or the Discord bot is not connected."};
  const payload = statusCard({players: 0, rooms: 0, reports: reports.openCount(), uptimeSeconds: Math.floor(process.uptime()), memoryMb: Math.round(process.memoryUsage().rss / 1048576)});
  // The public status card needs no staff actor; it exposes only aggregate
  // counts. Store its message id in the server database so restarts edit it.
  const saved = accounts.setting(STATUS_MESSAGE_SETTING);
  const existing = saved && await channel.messages.fetch(saved).catch(() => null);
  if (existing) {
    const updated = await existing.edit(payload).then(() => true).catch(err => {
      console.log(`[discord-bot] status update failed: ${logText(err.message)}`);
      return false;
    });
    return updated ? {ok: "The public status card was updated."} : {error: "Discord could not update the public status card."};
  }
  const message = await channel.send(payload).catch(err => {
    console.log(`[discord-bot] status post failed: ${logText(err.message)}`);
    return null;
  });
  if (!message) return {error: "Discord could not post the public status card."};
  accounts.setSetting(STATUS_MESSAGE_SETTING, message.id);
  return {ok: "The public status card was posted."};
};

const notifyReport = async report => {
  await postCard(config.discord.reportsChannelId, reportCard(report), "report notification");
};

const notifyGameActivity = async entry => {
  const minutes = Math.max(1, Math.ceil((entry.playedSeconds || 0) / 60));
  const signedIn = entry.type === "login";
  await postCard(config.discord.gameLogsChannelId, logCard({
    title: "In-game activity",
    description: signedIn ? "A player signed in." : "A player signed out.",
    tone: signedIn ? 0x57f287 : 0x5865f2,
    fields: [
      {name: "Player", value: entry.username},
      {name: "Event", value: signedIn ? "Signed in" : "Signed out"},
      ...(!signedIn ? [{name: "Session", value: `${minutes} minute${minutes === 1 ? "" : "s"}`}] : []),
    ],
  }), "game activity log");
};

const notifyModeration = async entry => {
  await postCard(config.discord.moderationLogsChannelId, logCard({
    title: "Moderation audit",
    description: "A Burrow staff action was recorded.",
    tone: 0xfee75c,
    fields: [
      {name: "Staff", value: entry.by},
      {name: "Action", value: entry.action},
      ...(entry.target ? [{name: "Player", value: entry.target}] : []),
      ...(entry.detail ? [{name: "Details", value: entry.detail}] : []),
    ],
  }), "moderation log");
};

const notifyBot = async (interaction, action) => {
  const actor = modpanel.discordBot.actor(interaction.user.id);
  await postCard(config.discord.botLogsChannelId, logCard({
    title: "Discord bot audit",
    description: "A Discord command or control was used.",
    tone: actor ? 0x5865f2 : 0xed4245,
    fields: [
      {name: "Discord user", value: `${interaction.user.username} (${interaction.user.id})`},
      {name: "Action", value: action},
      {name: "Linked staff account", value: actor ? actor.username : "No active linked Burrow staff account."},
    ],
  }), "Discord bot audit log");
};

const securityIncident = async (title, sections, detail = "") => {
  await postCard(config.discord.moderationLogsChannelId, logCard({
    title,
    description: "Discord security activity detected.",
    tone: 0xed4245,
    fields: [{name: "Details", value: sections.filter(Boolean).join("\n")}],
  }), "Discord security log");
  modlog.record("discord security", title.toLowerCase(), "", detail);
};

const isConfiguredGuild = guild => Boolean(guild && guild.id === config.discord.guildId);

const inspectDiscordMessage = async message => {
  const settings = securitySettings();
  if (!settings.enabled || message.author?.bot || !isConfiguredGuild(message.guild)) return;
  const at = Date.now();
  const key = message.author.id;
  const times = (recentMessages.get(key) || []).filter(time => time > at - 10000);
  times.push(at);
  recentMessages.set(key, times);
  const text = String(message.content || "").toLowerCase();
  const hasInvite = settings.blockInvites && /(?:discord\.gg|discord(?:app)?\.com\/invite)\//i.test(text);
  const word = settings.blockedWords.find(entry => text.includes(entry));
  const reason = times.length > settings.spamLimit ? "message spam" : hasInvite ? "Discord invite" : word ? "blocked word" : "";
  if (!reason) return;
  if (message.deletable) await message.delete().catch(() => {});
  await securityIncident("Discord AutoMod", [
    `Member: **${safe(message.author.username, 80)}**`,
    `Action: deleted message for ${reason}.`,
  ], `${safe(message.author.username, 80)}: ${reason}`);
};

const inspectDiscordJoin = async member => {
  const settings = securitySettings();
  if (!settings.enabled || !isConfiguredGuild(member.guild)) return;
  const at = Date.now();
  recentJoins.push(at);
  while (recentJoins.length && recentJoins[0] <= at - 60000) recentJoins.shift();
  if (recentJoins.length < settings.raidJoinLimit || lastRaidAlertAt > at - 60000) return;
  lastRaidAlertAt = at;
  await securityIncident("Discord anti-raid alert", [
    `${recentJoins.length} members joined in the last minute.`,
    "Review recent joins and use the dashboard or Discord moderation controls if action is needed.",
  ], `${recentJoins.length} joins in one minute`);
};

const communityNotice = async (member, kind) => {
  const settings = communitySettings();
  const channelId = kind === "welcome" ? settings.welcomeChannelId : settings.goodbyeChannelId;
  const template = kind === "welcome" ? settings.welcomeMessage : settings.goodbyeMessage;
  if (!channelId || !isConfiguredGuild(member.guild)) return;
  const message = safe(template.replace(/\{user\}/gi, member.user.username).replace(/\{server\}/gi, member.guild.name), 500);
  if (message) await postCard(channelId, card({title: kind === "welcome" ? "Welcome" : "Goodbye", tone: kind === "welcome" ? 0x57f287 : 0x5865f2, sections: [message]}), `${kind} notice`);
};

const githubUpdatesOn = () => {
  loadDashboardConfig();
  return Boolean(config.discord.githubRepository && config.discord.githubWebhookSecret && config.discord.updatesChannelId);
};

// Safe to expose to the owner dashboard: it deliberately contains state and
// channel ids only, never the bot token or GitHub webhook secret.
const dashboardStatus = () => {
  loadDashboardConfig();
  return {
  botTokenConfigured: Boolean(config.discord.botToken),
  guildId: config.discord.guildId || "",
  connected: Boolean(client && client.isReady()),
  commands: ["/burrow status", "/burrow player", "/burrow reports", "/burrow staff", "/burrow announce", "/moderate warn", "/moderate silence", "/moderate unsilence", "/moderate kick", "/moderate ban", "/moderate unban", "/discord timeout", "/discord untimeout", "/discord kick", "/discord ban", "/discord unban", "/discord purge"],
  channels: CHANNELS.map(([key, name]) => ({key, name, id: config.discord[key] || "", configured: Boolean(config.discord[key])})),
  github: {
    repository: config.discord.githubRepository || "",
    webhookSecretConfigured: Boolean(config.discord.githubWebhookSecret),
    updatesEnabled: githubUpdatesOn(),
    endpoint: "/discord/github",
  },
  statusCard: statusSettings(),
  security: {...securitySettings(), monitoring: securityGatewayOn},
  community: communitySettings(),
  modules: [
    {name: "Burrow staff tools", detail: "Player lookup, reports, staff list, in-game announcements, and game moderation", enabled: Boolean(config.discord.botToken && config.discord.guildId)},
    {name: "Discord moderation", detail: "Timeout, kick, ban, unban, and purge; gated by linked Burrow staff permissions", enabled: Boolean(config.discord.botToken && config.discord.guildId)},
    {name: "Activity and audit logs", detail: "In-game activity, reports, moderation, and bot command audit streams", enabled: CHANNELS.some(([key]) => key !== "updatesChannelId" && Boolean(config.discord[key]))},
    {name: "GitHub updates", detail: "Signed commit cards, with client changes marked as game updates", enabled: githubUpdatesOn()},
    {name: "AutoMod and anti-raid", detail: "Blocked words, invite blocking, anti-spam, and join-rate alerts", enabled: securitySettings().enabled},
    {name: "Tickets and member notices", detail: "Private support tickets plus configurable welcome and goodbye cards", enabled: Boolean(communitySettings().ticketCategoryId && communitySettings().ticketStaffRoleId)},
  ],
  };
};

const githubBody = req => new Promise((resolve, reject) => {
  const chunks = [];
  let size = 0;
  req.on("data", chunk => {
    size += chunk.length;
    if (size > MAX_GITHUB_WEBHOOK_BYTES) {
      req.destroy();
      reject(new Error("too_large"));
      return;
    }
    chunks.push(chunk);
  });
  req.on("end", () => resolve(Buffer.concat(chunks)));
  req.on("error", reject);
});

const githubSignatureMatches = (body, signature) => {
  if (!/^sha256=[0-9a-f]{64}$/i.test(String(signature || ""))) return false;
  const expected = `sha256=${crypto.createHmac("sha256", config.discord.githubWebhookSecret).update(body).digest("hex")}`;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(signature)));
};

const changedFiles = commit => [commit.added, commit.modified, commit.removed].flat().filter(file => typeof file === "string");
const gameChange = payload => (payload.commits || []).some(commit => changedFiles(commit)
  .some(file => /^(swf\/|swf-src\/|client-updates\/|public\/(?:badges|music|fonts)\/)/.test(file)));

const githubUpdateCard = payload => {
  const commits = Array.isArray(payload.commits) ? payload.commits.slice(-5) : [];
  const isGameUpdate = gameChange(payload);
  const compare = config.githubUrl ? `${config.githubUrl.replace(/\/$/, "")}/compare/${safe(payload.before, 40)}...${safe(payload.after, 40)}` : "";
  const branch = String(payload.ref || "").replace(/^refs\/heads\//, "") || "default branch";
  return card({
    title: isGameUpdate ? "Game update" : "Server update",
    tone: isGameUpdate ? 0x57f287 : 0x5865f2,
    sections: [
      `**${safe(config.discord.githubRepository, 100)}** · ${safe(branch, 100)}\n${commits.length} new commit${commits.length === 1 ? "" : "s"}`,
      commits.length ? commits.map(commit => `\`${safe(String(commit.id || "").slice(0, 7), 7)}\` ${safe(String(commit.message || "").split("\n")[0], 180)} — ${safe(commit.author && commit.author.name, 80)}`).join("\n") : "No commit details were supplied.",
    ],
    components: compare ? [{type: 1, components: [{type: 2, style: 5, label: "View on GitHub", url: compare}]}] : [],
  });
};

// GitHub calls this public endpoint. It is intentionally signature-first:
// an untrusted request never reaches Discord or becomes a log entry.
const handleGithubWebhook = async (req, res) => {
  const answer = status => { res.writeHead(status, {"Content-Length": 0}); res.end(); };
  if (!githubUpdatesOn()) {
    answer(404);
    return;
  }
  if (req.method !== "POST") {
    answer(405);
    return;
  }
  let body;
  try {
    body = await githubBody(req);
  }
  catch {
    answer(413);
    return;
  }
  if (!githubSignatureMatches(body, req.headers["x-hub-signature-256"])) {
    answer(401);
    return;
  }
  if (req.headers["x-github-event"] === "ping") {
    answer(204);
    return;
  }
  if (req.headers["x-github-event"] !== "push") {
    answer(204);
    return;
  }
  let payload;
  try {
    payload = JSON.parse(body.toString("utf8"));
  }
  catch {
    answer(400);
    return;
  }
  if (payload.repository?.full_name !== config.discord.githubRepository || payload.deleted === true) {
    answer(204);
    return;
  }
  const channel = await channelFor(config.discord.updatesChannelId);
  if (!channel) {
    answer(503); // GitHub retries after the bot finishes reconnecting.
    return;
  }
  const posted = await channel.send(githubUpdateCard(payload)).then(() => true).catch(err => {
    console.log(`[discord-bot] GitHub update post failed: ${logText(err.message)}`);
    return false;
  });
  answer(posted ? 204 : 503);
};

const syncCommands = async () => {
  if (!client || !client.isReady()) return {error: "The Discord bot is not connected."};
  const guild = await client.guilds.fetch(config.discord.guildId).catch(() => null);
  if (!guild) return {error: "The configured Discord server could not be found."};
  const synced = await guild.commands.set(commandDefinitions()).then(() => true).catch(err => {
    console.log(`[discord-bot] command registration failed: ${logText(err.message)}`);
    return false;
  });
  return synced ? {ok: "Discord slash commands are synchronized."} : {error: "Discord could not synchronize slash commands."};
};

const startup = () => {
  loadDashboardConfig();
  const security = securitySettings();
  const community = communitySettings();
  if (!config.discord.botToken || !config.discord.guildId) {
    return false;
  }
  if (client) return true;
  if (!loadDiscordJs()) return false;
  securityGatewayOn = security.enabled;
  const memberEvents = securityGatewayOn || Boolean(community.welcomeChannelId || community.goodbyeChannelId);
  client = new Client({intents: securityGatewayOn
    ? [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers]
    : memberEvents ? [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] : [GatewayIntentBits.Guilds]});
  client.once("ready", async () => {
    console.log(`[discord-bot] signed in as ${logText(client.user.tag)}`);
    const synced = await syncCommands();
    console.log(`[discord-bot] ${synced.ok || synced.error}`);
    await publishStatus();
  });
  client.on("interactionCreate", async interaction => {
    if (interaction.user.bot) return;
    if (interaction.isButton()) {
      await notifyBot(interaction, `button ${interaction.customId}`).catch(() => {});
      await handleButton(interaction);
      return;
    }
    if (!interaction.isChatInputCommand() || !inConfiguredGuild(interaction)) return;
    await notifyBot(interaction, `/${interaction.commandName} ${interaction.options.getSubcommand(false) || ""}`.trim()).catch(() => {});
    await interaction.deferReply({flags: EPHEMERAL}).catch(() => {});
    if (!interaction.deferred) return;
    try {
      if (interaction.commandName === "burrow") await handleBurrow(interaction);
      else if (interaction.commandName === "moderate") await handleModerate(interaction);
      else if (interaction.commandName === "discord") await handleDiscordModeration(interaction);
      else if (interaction.commandName === "ticket") await handleTicket(interaction);
    }
    catch (err) {
      console.error(`[discord-bot] interaction failed: ${err.stack || err.message}`);
      await interaction.editReply(failure("The command could not be completed.")).catch(() => {});
    }
  });
  client.on("error", err => console.error(`[discord-bot] client error: ${err.message}`));
  if (securityGatewayOn) {
    client.on("messageCreate", message => { inspectDiscordMessage(message).catch(err => console.error(`[discord-bot] AutoMod failed: ${err.message}`)); });
    client.on("guildMemberAdd", member => { inspectDiscordJoin(member).catch(err => console.error(`[discord-bot] anti-raid check failed: ${err.message}`)); });
  }
  if (memberEvents) {
    client.on("guildMemberAdd", member => { communityNotice(member, "welcome").catch(err => console.error(`[discord-bot] welcome notice failed: ${err.message}`)); });
    client.on("guildMemberRemove", member => { communityNotice(member, "goodbye").catch(err => console.error(`[discord-bot] goodbye notice failed: ${err.message}`)); });
  }
  unsubscribeReports = reports.onFile(notifyReport);
  unsubscribeGameActivity = world.onGameActivity(notifyGameActivity);
  unsubscribeModeration = modlog.onRecord(notifyModeration);
  statusTimer = setInterval(() => { publishStatus().catch(err => console.error(`[discord-bot] status failed: ${err.message}`)); }, STATUS_EVERY_MS);
  statusTimer.unref();
  client.login(config.discord.botToken).catch(err => console.error(`[discord-bot] login failed: ${err.message}`));
  return true;
};

const shutdown = () => {
  if (statusTimer) clearInterval(statusTimer);
  statusTimer = null;
  if (unsubscribeReports) unsubscribeReports();
  unsubscribeReports = null;
  if (unsubscribeGameActivity) unsubscribeGameActivity();
  unsubscribeGameActivity = null;
  if (unsubscribeModeration) unsubscribeModeration();
  unsubscribeModeration = null;
  if (client) client.destroy();
  client = null;
  securityGatewayOn = false;
  recentMessages.clear();
  recentJoins.length = 0;
};

const control = async action => {
  if (action === "stop") {
    if (!client) return {error: "The Discord bot is already stopped."};
    shutdown();
    return {ok: "Discord bot stopped. Game and panel services remain online."};
  }
  if (action === "start") {
    return startup() ? {ok: "Discord bot is starting."} : {error: "Set AJ_DISCORD_BOT_TOKEN and AJ_DISCORD_GUILD_ID, and install discord.js (npm ci), before starting the bot."};
  }
  if (action === "reconnect") {
    shutdown();
    return startup() ? {ok: "Discord bot is reconnecting."} : {error: "Set AJ_DISCORD_BOT_TOKEN and AJ_DISCORD_GUILD_ID, and install discord.js (npm ci), before reconnecting the bot."};
  }
  if (action === "sync") return syncCommands();
  return {error: "Unknown Discord bot control."};
};

module.exports = {startup, shutdown, control, card, COMPONENTS_V2, dashboardStatus, updateDashboardConfig, updateSecuritySettings, updateCommunitySettings, setStatusSettings, publishStatus, handleGithubWebhook};
