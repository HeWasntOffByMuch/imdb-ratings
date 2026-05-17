// Background script — handles OMDB API calls to avoid CORS issues
// Uses the free OMDB API (user must provide their own API key in settings)

const CACHE_KEY_PREFIX = "imdb_cache_";
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "FETCH_RATING") {
    fetchRating(message.title, message.year).then(sendResponse);
    return true; // keep channel open for async
  }
  if (message.type === "GET_SETTINGS") {
    browser.storage.local.get(["apiKey", "siteConfigs", "enabled"]).then(sendResponse);
    return true;
  }
  if (message.type === "SAVE_SETTINGS") {
    browser.storage.local.set(message.data).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message.type === "CLEAR_CACHE") {
    clearCache().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message.type === "PICK_ELEMENT") {
    // Tell content script to enter element-picker mode
    browser.tabs.sendMessage(sender.tab?.id || message.tabId, { type: "START_PICKER" });
    sendResponse({ ok: true });
    return true;
  }
  if (message.type === "ELEMENT_PICKED") {
    // Relay selector from content script to popup
    browser.runtime.sendMessage({ type: "ELEMENT_PICKED", selector: message.selector, tabId: sender.tab.id });
    sendResponse({ ok: true });
    return true;
  }
});

async function fetchRating(title, year) {
  const cacheKey = CACHE_KEY_PREFIX + slugify(title) + (year ? "_" + year : "");

  // Check cache first
  const stored = await browser.storage.local.get(cacheKey);
  if (stored[cacheKey]) {
    const entry = stored[cacheKey];
    if (Date.now() - entry.timestamp < CACHE_TTL) {
      return { ...entry.data, fromCache: true };
    }
  }

  const { apiKey } = await browser.storage.local.get("apiKey");
  if (!apiKey) {
    return { error: "NO_API_KEY" };
  }

  try {
    const params = new URLSearchParams({ t: title, apikey: apiKey, type: "movie" });
    if (year) params.set("y", year);
    const url = `https://www.omdbapi.com/?${params}`;
    const resp = await fetch(url);
    const data = await resp.json();

    if (data.Response === "False") {
      // Try without year
      if (year) {
        const params2 = new URLSearchParams({ t: title, apikey: apiKey, type: "movie" });
        const resp2 = await fetch(`https://www.omdbapi.com/?${params2}`);
        const data2 = await resp2.json();
        if (data2.Response === "True") {
          const result = extractRating(data2);
          await cacheResult(cacheKey, result);
          return result;
        }
      }
      // Try as series
      const params3 = new URLSearchParams({ t: title, apikey: apiKey, type: "series" });
      if (year) params3.set("y", year);
      const resp3 = await fetch(`https://www.omdbapi.com/?${params3}`);
      const data3 = await resp3.json();
      if (data3.Response === "True") {
        const result = extractRating(data3);
        await cacheResult(cacheKey, result);
        return result;
      }
      return { error: "NOT_FOUND", title };
    }

    const result = extractRating(data);
    await cacheResult(cacheKey, result);
    return result;
  } catch (e) {
    return { error: "NETWORK_ERROR", message: e.message };
  }
}

function extractRating(data) {
  return {
    title: data.Title,
    year: data.Year,
    imdbRating: data.imdbRating,
    imdbVotes: data.imdbVotes,
    imdbID: data.imdbID,
    type: data.Type,
    genre: data.Genre,
    rated: data.Rated,
    rottenTomatoes: data.Ratings?.find(r => r.Source === "Rotten Tomatoes")?.Value || null,
    metascore: data.Metascore !== "N/A" ? data.Metascore : null,
  };
}

async function cacheResult(key, data) {
  await browser.storage.local.set({ [key]: { data, timestamp: Date.now() } });
}

async function clearCache() {
  const all = await browser.storage.local.get(null);
  const cacheKeys = Object.keys(all).filter(k => k.startsWith(CACHE_KEY_PREFIX));
  if (cacheKeys.length > 0) await browser.storage.local.remove(cacheKeys);
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]/g, "_").substring(0, 80);
}
