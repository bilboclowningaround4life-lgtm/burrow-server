"use strict";

const {logText} = require("./logtext.js");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const config = require("../config.js");
const limits = require("./limits.js");

// cloudflare turnstile, with AJ_TURNSTILE_SITE_KEY and AJ_TURNSTILE_SECRET
// set: a captcha before every password tried (the client's login, the
// account page, the moderator panel) and every account made (the sign-up
// page, the client). a saved sign-in is not asked. the page shows the
// widget (public/captcha.js) and sends its answer as `captcha`; the answer
// is checked here with cloudflare, and is good for one request.
//
// a sign-in that passed the captcha and then wants a 2FA code, and a
// sign-up the client signs in with straight after, get a pass: good for
// that account from that address for a few minutes, so the second request
// is not asked again.

const ORIGIN = "https://challenges.cloudflare.com";
const VERIFY_URL = `${ORIGIN}/turnstile/v0/siteverify`;
const VERIFY_TIMEOUT_MS = 10000;
const MAX_ANSWER_LENGTH = 2048;
const PASS_MS = 600000;
const PASS_USES = 5;
const MAX_PASSES = 10000;
const MAX_VERIFYING = config.maxConcurrentCaptchaChecks;

const on = Boolean(config.turnstile);
const passes = new Map(); // SHA-256 of a pass -> {id: account id, key: address key, expiry, uses}
const sha256 = text => crypto.createHash("sha256").update(String(text)).digest("hex");
let verifying = 0;

// for the pages: what each answer means
const MESSAGES = {
  captcha_required: "Complete the captcha.",
  captcha_failed: "Captcha failed. Try again.",
  captcha_unavailable: "Captcha unavailable. Try again later.",
};

const issuePass = (account, from) => {
  if (!on || !account) {
    return undefined;
  }
  for (const [hash, entry] of passes) {
    if (entry.expiry < Date.now() || passes.size >= MAX_PASSES) {
      passes.delete(hash);
    }
  }
  const pass = crypto.randomBytes(24).toString("hex");
  passes.set(sha256(pass), {id: account.id, key: from.key, expiry: Date.now() + PASS_MS, uses: 0});
  return pass;
};

const passHolds = (pass, account, from) => {
  if (typeof pass !== "string" || !account) {
    return false;
  }
  const hash = sha256(pass);
  const entry = passes.get(hash);
  if (!entry || entry.expiry < Date.now() || entry.id !== account.id || entry.key !== from.key || ++entry.uses > PASS_USES) {
    passes.delete(hash);
    return false;
  }
  return true;
};

// asks cloudflare about one answer of the widget. null when it was a person.
const verify = async (answer, from, action) => {
  if (typeof answer !== "string" || !answer || answer.length > MAX_ANSWER_LENGTH) {
    return "captcha_required";
  }
  // A burst of valid-looking tokens should not turn an upstream Turnstile
  // slowdown into thousands of open fetches on this VPS.  Refuse quickly;
  // the browser can reset its widget and retry after the short outage.
  if (verifying >= MAX_VERIFYING) {
    return "captcha_unavailable";
  }
  verifying++;
  const form = new URLSearchParams({secret: config.turnstile.secret, response: answer});
  if (!limits.isLoopback(from.address)) {
    form.set("remoteip", from.address);
  }
  let result;
  try {
    const response = await fetch(VERIFY_URL, {method: "POST", body: form, signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS)});
    result = await response.json();
  }
  catch (err) {
    console.log(`[captcha] cloudflare did not answer: ${logText(err.message)}`);
    return "captcha_unavailable";
  }
  finally {
    verifying--;
  }
  // an answer made for another form is no answer for this one. cloudflare's
  // test keys give none.
  if (!result || result.success !== true || (result.action && result.action !== action)) {
    return "captcha_failed";
  }
  return null;
};

// null when the request may go on, or why not (a key of MESSAGES).
// `account`, when known, is who a pass would have to be for. requests from
// the server's own machine are not asked, as with the other limits.
const check = async (body, from, action, account) => {
  if (!on || from.local) {
    return null;
  }
  if (passHolds(body.captcha_pass, account, from)) {
    return null;
  }
  return verify(body.captcha, from, action);
};

// a page's security policy: public/captcha.js always (the page calls it even
// when off), and the widget too when it is on.
const policy = csp => (on
  ? `${csp.replace("script-src ", `script-src 'self' ${ORIGIN} `).replace("connect-src ", `connect-src 'self' ${ORIGIN} `)}; frame-src ${ORIGIN}`
  : csp.replace("script-src ", "script-src 'self' "));

// a page with public/captcha.js asked for under a name that changes with the
// script and the key: cloudflare keeps .js files for hours, whatever the
// server says, and a browser would go on with an old one.
const withScriptVersion = html => {
  const version = sha256(fs.readFileSync(path.join(config.publicDir, "captcha.js")) + (on ? config.turnstile.siteKey : "")).slice(0, 12);
  return Buffer.from(String(html).replace("src=\"/captcha.js\"", `src="/captcha.js?v=${version}"`));
};

// public/captcha.js with the site key in it ("" when off).
const script = text => text.replace("\"{{siteKey}}\"", JSON.stringify(on ? config.turnstile.siteKey : ""));

module.exports = {on, check, issuePass, policy, script, withScriptVersion, MESSAGES};
