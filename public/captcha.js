"use strict";

// cloudflare turnstile on this server's pages (lib/captcha.js). the server
// writes its site key in below, or "" when it asks for no captcha.
//
// const check = captcha.mount(element, "login") shows the widget in
// `element`, as a page loads; await check.answer() before a request (it
// waits while the player is still solving it; undefined when the server
// asks for none, "" when the captcha could not load or run: say
// captcha.FAILED then), and check.reset() after it: an answer is good once.
window.captcha = (() => {
  const siteKey = "{{siteKey}}";
  const LOAD_TIMEOUT_MS = 15000;
  let loading = null;

  const load = () => {
    loading = loading || new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      const timer = setTimeout(() => {
        loading = null;
        reject(new Error("the captcha took too long to load"));
      }, LOAD_TIMEOUT_MS);
      script.onload = () => {
        clearTimeout(timer);
        if (window.turnstile && typeof window.turnstile.render === "function") {
          resolve(window.turnstile);
        }
        else {
          loading = null;
          reject(new Error("the captcha did not start"));
        }
      };
      script.onerror = () => {
        clearTimeout(timer);
        loading = null;
        reject(new Error("the captcha did not load"));
      };
      document.head.append(script);
    });
    return loading;
  };

  // `options`: {appearance} ("always" by default: hidden till cloudflare
  // wanted a click, it was taken for one that never showed), {onAnswer(token)}.
  const MAX_RETRIES = 2; // a widget that errs is started again this often first
  const mount = (element, action, options = {}) => {
    let widget = null;
    let answer = null; // a token, "" when none could be had, null while waiting
    let waiting = [];
    let retries = 0;
    let starting = false;
    const settle = value => {
      answer = value;
      if (value && options.onAnswer) {
        options.onAnswer(value);
      }
      for (const resolve of waiting) {
        resolve(value);
      }
      waiting = [];
    };
    const start = () => {
      if (!siteKey || starting || widget !== null) {
        return;
      }
      starting = true;
      load().then(turnstile => {
        starting = false;
        try {
          widget = turnstile.render(element, {
            sitekey: siteKey,
            action,
            theme: "dark",
            appearance: options.appearance || "always",
            callback: value => {
              retries = 0;
              settle(value);
            },
            "expired-callback": () => {
              answer = null;
            },
            // its code is cloudflare's (110200: this site's name is not on
            // the widget). many pass with a second go: it is had first.
            "error-callback": code => {
              console.log(`captcha error ${code}`);
              if (retries < MAX_RETRIES) {
                retries++;
                answer = null;
                setTimeout(() => window.turnstile.reset(widget), 1000 * retries);
                return true;
              }
              settle("");
              return true;
            },
          });
        }
        catch (err) {
          console.log(`captcha could not start: ${err.message}`);
          settle("");
        }
      }, () => {
        starting = false;
        settle("");
      });
    };
    start();
    return {
      on: Boolean(siteKey),
      answer: () => {
        if (!siteKey) {
          return Promise.resolve(undefined);
        }
        // one that could not load is tried again when an answer is wanted
        if (answer === "" && widget === null) {
          answer = null;
          start();
        }
        return answer !== null ? Promise.resolve(answer) : new Promise(resolve => waiting.push(resolve));
      },
      reset: () => {
        if (widget !== null) {
          answer = null;
          retries = 0;
          window.turnstile.reset(widget);
        }
      },
    };
  };

  return {on: Boolean(siteKey), mount, FAILED: "Captcha could not load. Check your connection or content blocker, then reload."};
})();
