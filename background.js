// Background script — uses TMDb API for multilingual title lookup + ratings
// TMDb supports searching in any language natively (Polish, German, Japanese, etc.)
// Flow: local title → TMDb search (multilingual) → get TMDb score + IMDb ID → cache

const CACHE_KEY_PREFIX = "imdb_cache_";
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
const TMDB_BASE = "https://api.themoviedb.org/3";

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "FETCH_RATING") {
    fetchRating(message.title, message.year).then(sendResponse);
    return true;
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
  if (message.type === "ELEMENT_PICKED") {
    browser.runtime.sendMessage({ type: "ELEMENT_PICKED", selector: message.selector, tabId: sender.tab.id });
    sendResponse({ ok: true });
    return true;
  }
});

// ─── Main fetch ───────────────────────────────────────────────────────────────

async function fetchRating(title, year) {
  const cacheKey = CACHE_KEY_PREFIX + slugify(title) + (year ? "_" + year : "");

  // Cache hit
  try {
    const stored = await browser.storage.local.get(cacheKey);
    if (stored[cacheKey]) {
      const entry = stored[cacheKey];
      if (Date.now() - entry.timestamp < CACHE_TTL) {
        return { ...entry.data, fromCache: true };
      }
    }
  } catch (_) {}

  const { apiKey } = await browser.storage.local.get("apiKey");
  if (!apiKey) return { error: "NO_API_KEY" };

  // Try movie, then TV; retry without year if no results
  let result = await searchTMDb(apiKey, title, year, "movie");
  if (!result) result = await searchTMDb(apiKey, title, year, "tv");
  if (!result && year) {
    result = await searchTMDb(apiKey, title, null, "movie");
    if (!result) result = await searchTMDb(apiKey, title, null, "tv");
  }

  if (!result) return { error: "NOT_FOUND", title };

  await cacheResult(cacheKey, result);
  return result;
}

// ─── TMDb search ──────────────────────────────────────────────────────────────

async function searchTMDb(apiKey, title, year, mediaType) {
  try {
    const endpoint = mediaType === "tv" ? "search/tv" : "search/movie";
    const params = new URLSearchParams({
      api_key: apiKey,
      query: title,
      include_adult: false,
    });
    if (year) {
      params.set(
        mediaType === "tv" ? "first_air_date_year" : "primary_release_year",
        year
      );
    }

    const resp = await fetch(`${TMDB_BASE}/${endpoint}?${params}`);
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data.results || data.results.length === 0) return null;

    const best = data.results[0];
    return await fetchTMDbDetails(apiKey, best.id, mediaType);
  } catch (e) {
    return null;
  }
}

async function fetchTMDbDetails(apiKey, tmdbId, mediaType) {
  try {
    const endpoint = mediaType === "tv" ? `tv/${tmdbId}` : `movie/${tmdbId}`;
    const params = new URLSearchParams({
      api_key: apiKey,
      append_to_response: "external_ids",
    });

    const resp = await fetch(`${TMDB_BASE}/${endpoint}?${params}`);
    if (!resp.ok) return null;
    const d = await resp.json();

    const imdbId = d.external_ids?.imdb_id || null;
    const score = d.vote_average ? d.vote_average.toFixed(1) : "N/A";
    const votes = d.vote_count ? d.vote_count.toLocaleString() : "N/A";
    const title = d.title || d.name || "Unknown";
    const year = (d.release_date || d.first_air_date || "").slice(0, 4);

    return {
      title,
      originalTitle: d.original_title || d.original_name || title,
      year,
      imdbRating: score,        // TMDb 0–10 score, same scale as IMDb
      imdbVotes: votes,
      imdbID: imdbId,           // real IMDb ID for deep-link
      tmdbID: d.id,
      type: mediaType,
      genre: (d.genres || []).map(g => g.name).join(", "),
      source: "tmdb",
    };
  } catch (e) {
    return null;
  }
}

// ─── Cache helpers ────────────────────────────────────────────────────────────

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
