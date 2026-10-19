"use strict";

// what the end-to-end tests share: a game client that speaks the SWF's
// socket protocol, and a real server process on ports and a database of its
// own that is thrown away afterwards.

const assert = require("assert");
const {spawn} = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const net = require("net");
const os = require("os");
const path = require("path");

class GameClient {
  // `localAddress`: another loopback address to come from (127.0.0.2), for
  // what the server tells apart by address.
  constructor(gamePort, localAddress = undefined) {
    this.gamePort = gamePort;
    this.localAddress = localAddress;
    this.queue = [];
    this.varUpdates = [];
    this.askedForGames = 0;
    this.unaskedGames = [];
    this.waiters = [];
    this.buffer = Buffer.alloc(0);
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.socket = net.connect({port: this.gamePort, host: "127.0.0.1", localAddress: this.localAddress}, resolve);
      this.socket.once("error", reject);
      this.socket.on("data", chunk => {
        this.buffer = Buffer.concat([this.buffer, chunk]);
        let end;
        while ((end = this.buffer.indexOf(0)) !== -1) {
          this.queue.push(this.buffer.toString("utf8", 0, end));
          if (process.env.AJ_TEST_TRACE) {
            console.log(`<- ${this.queue[this.queue.length - 1].slice(0, 300)}`);
          }
          this.buffer = this.buffer.subarray(end + 1);
        }
        this.flush();
      });
    });
  }

  flush() {
    while (this.queue.length && this.waiters.length) {
      this.waiters.shift()(this.queue.shift());
    }
  }

  send(message) {
    if (process.env.AJ_TEST_TRACE) {
      console.log(`-> ${message.slice(0, 300)}`);
    }
    this.socket.write(message + "\0");
  }

  xt(cmd, roomId, ...params) {
    if (cmd === "mi") {
      this.askedForGames++;
    }
    this.send(`%xt%o%${[cmd, roomId, ...params].join("%")}%`);
  }

  // the server describes the buddy games to a player who has just arrived
  // without being asked ("mi"). is this message that, rather than the
  // answer to a request of ours?
  unasked(fields) {
    if (fields[0] !== "mi") {
      return false;
    }
    if (this.askedForGames === 0) {
      this.unaskedGames.push(fields);
      return true;
    }
    this.askedForGames--;
    return false;
  }

  next() {
    // made here, not in the timer, so that its stack says which line waited.
    const timedOut = new Error("timed out waiting for a server message");
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(timedOut), 5000);
      this.waiters.push(message => {
        clearTimeout(timer);
        resolve(message);
      });
      this.flush();
    });
  }

  // next raw extension message as [cmd, roomId, ...params]. user var
  // updates ("zs") turn up between other messages whenever a counter the
  // server keeps moves; they are set aside in `this.varUpdates` unless asked
  // for, and the unasked list of buddy games in `this.unaskedGames`.
  async nextXt(cmd) {
    for (;;) {
      const fields = (await this.next()).split("%").slice(2, -1);
      if (fields[0] === "zs" && cmd !== "zs") {
        this.varUpdates.push(fields);
        continue;
      }
      // the chat filter settings ("xfl", after every login), the one-time
      // question which filter to use ("xfa", on the first room) and the
      // buddy list with when each was last seen ("bl", "xls": at login) come unasked.
      if ((fields[0] === "xfl" || fields[0] === "xfa" || fields[0] === "bl" || fields[0] === "xls") && cmd !== fields[0]) {
        continue;
      }
      if (this.unasked(fields)) {
        continue;
      }
      assert.strictEqual(fields[0], cmd);
      return fields;
    }
  }

  // skips other messages until the next raw extension message for `cmd`.
  async untilXt(cmd) {
    for (;;) {
      const fields = (await this.next()).split("%").slice(2, -1);
      if (this.unasked(fields)) {
        continue;
      }
      if (fields[0] === cmd) {
        return fields;
      }
    }
  }

  async logIn(username, token) {
    this.send("<msg t='sys'><body action='verChk' r='0'><ver v='165' /></body></msg>");
    assert.match(await this.next(), /action='apiOK'/);
    this.send("<msg t='sys'><body action='rndK' r='-1'></body></msg>");
    assert.match(await this.next(), /<k>[0-9a-f]+<\/k>/);
    const nick = `${username}%%0%1830%electron%1.5.7%win%df`;
    this.send(`<msg t='sys' h='x'><body action='login' r='0'><login z='sbiLogin'><nick><![CDATA[${nick}]]></nick><pword><![CDATA[${token}]]></pword></login></body></msg>`);
    return JSON.parse(await this.next()).b.o;
  }
}

// what the client 1.3.0 sends about its computer (lib/devices.js), made up:
// one computer for each username, unless a test gives its own.
const deviceFor = name => {
  const hash = kind => crypto.createHash("sha256").update(`test-device:${kind}:${String(name).toLowerCase()}`).digest("hex");
  return {v: 1, ids: {os: hash("os"), install: hash("install"), disk: [hash("disk")], mac: [hash("mac")]}, notes: []};
};

const postJson = (url, body) => fetch(url, {
  method: "POST",
  headers: {"Content-Type": "application/json", "Origin": "null"},
  body: JSON.stringify(/\/authenticate$/.test(url) && body && body.device === undefined ? {...body, device: deviceFor(body.username || "")} : body),
});

// starts a server on the given ports with an empty database, runs `run`
// against it, and prints `name` passed or the server's output on failure.
// with `dataDir` it uses that database instead, and leaves it there (for a
// test of what is still there after a restart).
const withServer = async (name, httpPort, gamePort, run, {dataDir: keptDir = null} = {}) => {
  const dataDir = keptDir || fs.mkdtempSync(path.join(os.tmpdir(), "aj-test-"));
  const server = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {
    env: {...process.env, AJ_HTTP_PORT: httpPort, AJ_GAME_PORT: gamePort, AJ_DATA_DIR: dataDir, AJ_QUIET: "1",
      // everyone arrives in the township, as the tests expect
      AJ_SPAWN_ROOMS: process.env.AJ_SPAWN_ROOMS || "jamaa_township.room_main",
      // and in the one world
      AJ_WORLDS: process.env.AJ_WORLDS || "1",
      // the packs made again at once after a custom item changes
      AJ_PACK_REMAKE_MS: process.env.AJ_PACK_REMAKE_MS || "0"},
    stdio: ["ignore", "pipe", "inherit"],
  });
  let output = "";
  try {
    await new Promise((resolve, reject) => {
      server.stdout.on("data", chunk => {
        output += chunk;
        if (output.includes("[server] ready")) {
          resolve();
        }
      });
      server.once("exit", code => reject(new Error(`server exited early (${code})\n${output}`)));
    });
    await run();
    console.log(`${name} passed`);
  }
  catch (err) {
    console.error(output);
    throw err;
  }
  finally {
    // on Windows the database stays locked until the process has gone, so
    // wait for it before throwing its files away.
    const exited = server.exitCode !== null ? Promise.resolve() : new Promise(resolve => server.once("exit", resolve));
    server.kill();
    await exited;
    if (!keptDir) {
      fs.rmSync(dataDir, {recursive: true, force: true, maxRetries: 10, retryDelay: 200});
    }
  }
};

module.exports = {deviceFor, GameClient, postJson, withServer};
