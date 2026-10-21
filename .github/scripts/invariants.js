#!/usr/bin/env node
"use strict";

// what the security audit of 2026-10-16 found true of this server, checked on
// every push so that it stays true (or is changed on purpose):
//
//   - it has only the one pinned Discord gateway dependency needed by the
//     optional staff bot; additions are refused to keep the supply chain small
//   - the server code starts no other programs and runs no generated code
//   - the server code names no web address outside .github/allowed-hosts.json
//   - no private key, certificate key or .env file is committed
//   - every JavaScript file parses
//
// a check that fails says what to do. run it from the repository's root:
//
//   node .github/scripts/invariants.js

const fs = require("fs");
const path = require("path");
const {execFileSync} = require("child_process");

const tracked = execFileSync("git", ["ls-files", "-z"], {encoding: "utf8"}).split("\0").filter(Boolean);
const problems = [];
const fail = (file, message) => problems.push({file, message});

// The server stayed dependency-free until the optional Discord staff bot. Its
// maintained gateway/components implementation is pinned exactly and captured
// in package-lock.json; no other package is permitted without deliberately
// extending this allowlist and its review surface.
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const ALLOWED_DEPENDENCIES = {dependencies: {"discord.js": "14.26.4"}};
for (const field of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies", "bundledDependencies"]) {
  const actual = pkg[field] || {};
  const allowedDependencies = ALLOWED_DEPENDENCIES[field] || {};
  if (JSON.stringify(Object.keys(actual).sort().map(name => [name, actual[name]])) !== JSON.stringify(Object.keys(allowedDependencies).sort().map(name => [name, allowedDependencies[name]]))) {
    fail("package.json", `${field} differs from its approved dependency allowlist. Keep dependencies empty except for the pinned Discord staff-bot gateway, or deliberately update this check and explain why.`);
  }
}
for (const lock of ["yarn.lock", "pnpm-lock.yaml"]) {
  if (tracked.includes(lock)) fail(lock, "use the reviewed package-lock.json; alternate package-manager lockfiles are not allowed.");
}
if (fs.existsSync("package-lock.json")) {
  try {
    const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
    if (lock.lockfileVersion !== 3 || lock.packages?.[""]?.dependencies?.["discord.js"] !== "14.26.4") {
      fail("package-lock.json", "must be the npm v3 lockfile for the pinned discord.js@14.26.4 dependency.");
    }
  }
  catch {
    fail("package-lock.json", "is not a readable npm lockfile.");
  }
}
else {
  fail("package-lock.json", "is required to review the pinned Discord bot dependency.");
}

// the server's own code: what the game server runs
const serverCode = tracked.filter(file => /^(server|config)\.js$/.test(file) || /^lib\/.*\.js$/.test(file));
const FORBIDDEN = [
  [/require\(\s*["'](?:node:)?child_process["']\s*\)/, "starts other programs (child_process)"],
  [/require\(\s*["'](?:node:)?vm["']\s*\)/, "runs generated code (vm)"],
  [/(?<![\w.$])eval\s*\(/, "runs generated code (eval)"],
  [/\bnew\s+Function\s*\(/, "runs generated code (new Function)"],
  [/\bprocess\.binding\s*\(/, "reaches into Node's internals (process.binding)"],
];
const allowed = JSON.parse(fs.readFileSync(".github/allowed-hosts.json", "utf8"));
const HOST = /https?:\/\/([A-Za-z0-9.-]+)/g;
for (const file of serverCode) {
  const text = fs.readFileSync(file, "utf8");
  for (const [pattern, what] of FORBIDDEN) {
    if (pattern.test(text)) {
      fail(file, `${what}. The server code never did; if this is meant, change this check in the same pull request and say why.`);
    }
  }
}
// web addresses in the server code and the pages it serves
for (const file of tracked.filter(name => /^(server\.js|config\.js|lib\/.*\.(js|json)|public\/.*\.(html|js))$/.test(name))) {
  for (const [, host] of fs.readFileSync(file, "utf8").matchAll(HOST)) {
    const name = host.toLowerCase();
    if (!allowed.server.includes(name)) {
      fail(file, `names ${name}, which is not in .github/allowed-hosts.json ("server"). Add it there if it is meant.`);
    }
  }
}

// keys and secrets
for (const file of tracked) {
  const base = path.basename(file);
  if (/\.(pem|key|p12|pfx)$/i.test(base) || /^\.env(\..*)?$/.test(base) || /^id_(rsa|ed25519|ecdsa)$/.test(base)) {
    fail(file, "looks like a key or a secrets file. Remove it from the repository (and from its history), and replace the key.");
  }
}

// every JavaScript file parses
for (const file of tracked.filter(name => /\.(c|m)?js$/.test(name) && !name.startsWith("tools/decompiled/"))) {
  try {
    execFileSync(process.execPath, ["--check", file], {stdio: "pipe"});
  }
  catch (err) {
    fail(file, `does not parse: ${String(err.stderr).trim().split("\n").slice(0, 4).join(" ")}`);
  }
}

if (problems.length) {
  for (const {file, message} of problems) {
    console.log(`::error file=${file}::${file} ${message}`);
  }
  process.exit(1);
}
console.log(`${serverCode.length} server files and ${tracked.length} tracked files checked: only the pinned Discord bot dependency, no program starts or generated code, no unlisted hosts, no keys, everything parses`);
