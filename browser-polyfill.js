// browser-polyfill.js — makes Firefox's `browser.*` API work in Chrome
// Wraps Chrome's callback-based `chrome.*` API in Promises, matching Firefox's WebExtensions API.
// Only activates in Chrome (where `window.browser` is undefined).

(function () {
  if (typeof globalThis.browser !== "undefined") return; // already Firefox, nothing to do

  const chrome = globalThis.chrome;
  if (!chrome) return; // not a browser extension context

  const ASYNC_CHROME_METHODS = {
    storage: {
      local: ["get", "set", "remove", "clear"],
      sync:  ["get", "set", "remove", "clear"],
    },
    tabs:    ["query", "sendMessage", "get", "create", "update", "remove"],
    runtime: ["sendMessage", "getBackgroundPage", "openOptionsPage"],
    alarms:  ["create", "get", "getAll", "clear", "clearAll"],
  };

  function promisify(fn, ctx) {
    return function (...args) {
      return new Promise((resolve, reject) => {
        fn.apply(ctx, [
          ...args,
          function (result) {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(result);
            }
          },
        ]);
      });
    };
  }

  function wrapNamespace(chromeNs, methods) {
    if (!chromeNs) return undefined;
    const wrapped = Object.assign(Object.create(null), chromeNs);
    for (const method of methods) {
      if (typeof chromeNs[method] === "function") {
        wrapped[method] = promisify(chromeNs[method], chromeNs);
      }
    }
    return wrapped;
  }

  const browser = Object.create(null);

  // storage.local and storage.sync
  browser.storage = Object.create(null);
  if (chrome.storage) {
    browser.storage.local = wrapNamespace(chrome.storage.local, ASYNC_CHROME_METHODS.storage.local);
    browser.storage.sync  = wrapNamespace(chrome.storage.sync,  ASYNC_CHROME_METHODS.storage.sync);
  }

  // tabs
  browser.tabs = wrapNamespace(chrome.tabs, ASYNC_CHROME_METHODS.tabs);

  // runtime — keep synchronous props, promisify async ones
  browser.runtime = Object.assign(Object.create(null), chrome.runtime);
  for (const m of ASYNC_CHROME_METHODS.runtime) {
    if (chrome.runtime && typeof chrome.runtime[m] === "function") {
      browser.runtime[m] = promisify(chrome.runtime[m], chrome.runtime);
    }
  }
  // onMessage and onInstalled are event objects — pass through as-is
  browser.runtime.onMessage   = chrome.runtime.onMessage;
  browser.runtime.onInstalled = chrome.runtime.onInstalled;
  browser.runtime.id          = chrome.runtime.id;

  // alarms
  browser.alarms = wrapNamespace(chrome.alarms, ASYNC_CHROME_METHODS.alarms);
  if (chrome.alarms) browser.alarms.onAlarm = chrome.alarms.onAlarm;

  globalThis.browser = browser;
})();
