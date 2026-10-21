# Burrow
Burrow is a private server for AJ Classic.

## Account-recovery email

Set `AJ_RECOVERY_MAIL_URL` and `AJ_RECOVERY_MAIL_TOKEN` to an HTTPS mail-relay or transactional-email webhook. Burrow posts `{to, subject, text}` with a Bearer token. Until both are configured, email recovery intentionally does not issue a usable reset link. New web sign-ups are asked for a recovery email; password and 2FA recovery require the one-time link sent there.

## Discord staff bot

Set `AJ_DISCORD_BOT_TOKEN` and `AJ_DISCORD_GUILD_ID` to enable Burrow's Discord bot. It registers `/burrow status|player|reports|staff|announce`, `/moderate warn|silence|unsilence|kick|ban|unban`, and Discord-server moderation commands `/discord timeout|untimeout|kick|ban|unban|purge`. A Discord user must first link their account through Burrow's existing Discord sign-in and hold active Burrow staff status with 2FA; every command then follows the same role permissions, staff-rank safeguards, actions, and audit log as the moderator panel. Discord-native actions cannot target active linked Burrow staff accounts and also require the bot's Discord role to have the matching server permission.

`AJ_DISCORD_REPORTS_CHANNEL_ID` optionally posts each new in-game report with a **Mark handled** button. `AJ_DISCORD_STATUS_CHANNEL_ID` optionally maintains a public live-status card. Set `AJ_DISCORD_GAME_LOGS_CHANNEL_ID` for player sign-in/sign-out logs, `AJ_DISCORD_MOD_LOGS_CHANNEL_ID` for the full moderation audit trail (web panel, in-game staff commands, admin actions, and Discord moderation), and `AJ_DISCORD_BOT_LOGS_CHANNEL_ID` for Discord command/button audit events. Game logs deliberately omit IPs, device IDs, auth tokens, and chat text. All bot replies and notifications use Discord Components V2 (containers and text displays), not legacy message content or embeds.

The owner dashboard's **Discord** tab can start, stop, reconnect, and synchronize the bot; edit notification-channel IDs, the GitHub repository, public status card, security rules, support-ticket settings, and welcome/goodbye notices; and publish the public card immediately. Environment values supply the initial channel configuration. The bot token, guild ID, and GitHub webhook secret deliberately stay in the server environment rather than in the dashboard database.

For GitHub update cards, set `AJ_GITHUB_REPOSITORY` to `owner/repository`, `AJ_GITHUB_WEBHOOK_SECRET`, and `AJ_DISCORD_UPDATES_CHANNEL_ID`. Then add a GitHub webhook for `https://your-public-burrow-host/discord/github`, choose `application/json`, use the same secret, and subscribe to **Pushes**. Signed pushes appear as polished Components V2 cards with commit summaries and a GitHub compare button; commits that change the Flash client or client assets are labelled **Game update**, while other pushes are **Server update**.

# Security
An independent security audit by a Strawberry Jam contributor, who is not part of the Burrow team, found no malware in the Burrow client or server (client v1.2.0, server as of 17 October 2026). Every file in every installer was checked against its source and against the official Electron, NSIS and Adobe Flash releases. The report also lists the weaknesses found, with fixes, and every check can be repeated by anyone.

**[Read the audit](https://snipzil.github.io/burrow-server/)**

Every push to this repository is checked automatically (`.github/workflows/security.yml`) for new outside web addresses in the server or game files, code that starts programs, committed keys and leaked credentials.

# Disclaimer
Burrow is an unofficial fan project. It is not affiliated with, endorsed by or connected to WildWorks, Inc. or Animal Jam. Animal Jam and Animal Jam Classic are trademarks of WildWorks, Inc.

**Takedown procedure: WildWorks, Inc. or its authorized representatives may request the removal of content, or of Burrow as a whole, by writing to legal@burrow.moe. Upon verification of authority, the request will be carried out promptly.**

# Credits
Emoji in chat are drawn with [Twemoji](https://github.com/jdecked/twemoji), © Twitter, Inc. and other contributors, under [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/).
