"use strict";

// loaded into the test server (NODE_OPTIONS --require, by test/signin.js):
// Discord's OAuth2 API answered here, so a sign-in with Discord can be gone
// through without Discord. the code Discord would send back names who signs
// in ("mira" -> Mira's Discord account); anything else goes out as usual.

const USERS = {
  mira: {id: "100000000000000001", username: "mira_discord"},
  hal: {id: "100000000000000002", username: "hal_discord"},
};

const realFetch = globalThis.fetch;
globalThis.fetch = async (url, options = {}) => {
  const href = String(url);
  if (!href.startsWith("https://discord.com/api/")) {
    return realFetch(url, options);
  }
  const json = (status, body) => new Response(JSON.stringify(body), {status, headers: {"Content-Type": "application/json"}});
  if (href.endsWith("/oauth2/token")) {
    const code = new URLSearchParams(String(options.body || "")).get("code");
    return USERS[code] ? json(200, {access_token: `token-${code}`, token_type: "Bearer"}) : json(400, {error: "invalid_grant"});
  }
  if (href.endsWith("/users/@me")) {
    const user = USERS[String((options.headers || {}).Authorization || "").replace(/^Bearer token-/, "")];
    return user ? json(200, {...user, discriminator: "0"}) : json(401, {});
  }
  return json(404, {});
};
