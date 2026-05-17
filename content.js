// Content script — scans the page for movie/show elements and injects ratings

(function () {
  "use strict";

  // Built-in site configurations
  const BUILTIN_CONFIGS = [
    {
      id: "netflix",
      name: "Netflix",
      match: "netflix.com",
      selectors: [
        ".title-card .title-card-container",
        ".slider-item .title-card-container",
        ".jaw-bone-container .title-card-container",
        ".previewModal--player-titleTreatmentWrapper",
      ],
      titleSelectors: [".fallback-text", ".title-card-title-text", "[data-uia='title-card-series-title']"],
    },
    {
      id: "disneyplus",
      name: "Disney+",
      match: "disneyplus.com",
      selectors: [
        "[class*='ContentCard']",
        "[class*='TileContainer']",
        "[data-testid='card-container']",
        "[class*='StandardCard']",
      ],
      titleSelectors: ["[class*='CardTitle']", "[class*='TileTitle']", "[data-testid='card-title']"],
    },
    {
      id: "hbomax",
      name: "Max (HBO)",
      match: ["hbomax.com", "max.com"],
      selectors: [
        "[data-testid='tile']",
        "[class*='TileContainer']",
        "[class*='StandardTile']",
        ".content-container",
      ],
      titleSelectors: ["[data-testid='tile-title']", "[class*='TileTitle']", "[class*='content-title']"],
    },
    {
      id: "primevideo",
      name: "Prime Video",
      match: "primevideo.com",
      selectors: [
        "[data-testid='card']",
        "._1KyIhFb3X0",
        "[class*='DVWebNode-Card']",
        ".atvwebplayersdk-overlays-container",
      ],
      titleSelectors: ["[data-testid='card-title']", "[class*='title']", "._eP8EI1yx2"],
    },
    {
      id: "appletv",
      name: "Apple TV+",
      match: "tv.apple.com",
      selectors: ["[class*='shelf-grid-item']", "[class*='canvas-lockup']", "[class*='product-lockup']"],
      titleSelectors: ["[class*='product-name']", "[class*='lockup-title']"],
    },
    {
      id: "hulu",
      name: "Hulu",
      match: "hulu.com",
      selectors: ["[class*='entity-card']", "[class*='GridItem']", "[data-automationid='tile']"],
      titleSelectors: ["[class*='entity-title']", "[class*='card-title']"],
    },
  ];

  let settings = { enabled: true, siteConfigs: [], apiKey: "" };
  let activePickerEl = null;
  let pickerMode = false;
  let injected = new WeakSet();
  let observer = null;

  async function init() {
    settings = await browser.runtime.sendMessage({ type: "GET_SETTINGS" });
    if (!settings) settings = { enabled: true, siteConfigs: [], apiKey: "" };
    if (settings.enabled === false) return;

    startObserver();
    scanPage();
  }

  function getActiveConfigs() {
    const host = location.hostname;
    const builtIn = BUILTIN_CONFIGS.filter(c => {
      const matches = Array.isArray(c.match) ? c.match : [c.match];
      return matches.some(m => host.includes(m));
    });
    const custom = (settings.siteConfigs || []).filter(c => {
      const matches = Array.isArray(c.match) ? c.match : [c.match || host];
      return matches.some(m => host.includes(m));
    });
    return [...builtIn, ...custom];
  }

  function startObserver() {
    if (observer) observer.disconnect();
    observer = new MutationObserver(debounce(scanPage, 600));
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function scanPage() {
    const configs = getActiveConfigs();
    if (!configs.length) return;

    for (const config of configs) {
      const allSelectors = [...(config.selectors || []), ...(config.customSelectors || [])];
      for (const selector of allSelectors) {
        try {
          const elements = document.querySelectorAll(selector);
          elements.forEach(el => processElement(el, config));
        } catch (e) {
          // invalid selector, skip
        }
      }
    }
  }

  function processElement(el, config) {
    if (injected.has(el)) return;
    const title = extractTitle(el, config);
    if (!title || title.length < 2) return;

    injected.add(el);
    el.style.position = el.style.position || "relative";

    const badge = createBadge("...", "loading");
    el.appendChild(badge);

    const year = extractYear(el);
    browser.runtime.sendMessage({ type: "FETCH_RATING", title, year }).then(result => {
      if (!result || result.error) {
        badge.remove();
        return;
      }
      updateBadge(badge, result);
    });
  }

  function extractTitle(el, config) {
    const titleSels = [...(config.titleSelectors || []), ...(config.customTitleSelectors || [])];

    for (const sel of titleSels) {
      try {
        const titleEl = el.querySelector(sel);
        if (titleEl) {
          const text = (titleEl.textContent || titleEl.getAttribute("aria-label") || "").trim();
          if (text.length > 1) return text;
        }
      } catch (e) {}
    }

    // Fallbacks: aria-label on element itself, or img alt
    const ariaLabel = el.getAttribute("aria-label");
    if (ariaLabel && ariaLabel.length > 1) return ariaLabel.trim();

    const img = el.querySelector("img[alt]");
    if (img && img.alt.length > 1) return img.alt.trim();

    return null;
  }

  function extractYear(el) {
    const text = el.textContent;
    const match = text.match(/\b(19|20)\d{2}\b/);
    return match ? match[0] : null;
  }

  function createBadge(text, state) {
    const badge = document.createElement("div");
    badge.className = `imdb-rating-badge imdb-state-${state}`;
    badge.innerHTML = `<span class="imdb-star">★</span><span class="imdb-score">${text}</span>`;
    return badge;
  }

  function updateBadge(badge, data) {
    const score = data.imdbRating !== "N/A" ? data.imdbRating : "?";
    const numericScore = parseFloat(score);
    const colorClass = numericScore >= 7.5 ? "imdb-great" : numericScore >= 6 ? "imdb-ok" : "imdb-bad";

    badge.className = `imdb-rating-badge ${colorClass}`;
    badge.innerHTML = `<span class="imdb-star">★</span><span class="imdb-score">${score}</span>`;

    const displayTitle = data.originalTitle && data.originalTitle !== data.title
      ? `${data.title} (${data.originalTitle})`
      : data.title;

    badge.title = [
      displayTitle,
      data.year,
      `TMDb: ${data.imdbRating}/10 (${data.imdbVotes})`,
      data.genre,
    ].filter(Boolean).join("\n");

    // Link to IMDb if we have the ID, else TMDb
    const url = data.imdbID
      ? `https://www.imdb.com/title/${data.imdbID}/`
      : `https://www.themoviedb.org/${data.type === "tv" ? "tv" : "movie"}/${data.tmdbID}`;

    badge.style.cursor = "pointer";
    badge.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      window.open(url, "_blank");
    });
  }

  // ─── Element Picker ──────────────────────────────────────────────
  browser.runtime.onMessage.addListener((msg) => {
    if (msg.type === "START_PICKER") startPicker();
    if (msg.type === "STOP_PICKER") stopPicker();
    if (msg.type === "RELOAD_SETTINGS") {
      browser.runtime.sendMessage({ type: "GET_SETTINGS" }).then(s => {
        settings = s;
        injected = new WeakSet();
        document.querySelectorAll(".imdb-rating-badge").forEach(b => b.remove());
        scanPage();
      });
    }
  });

  function startPicker() {
    pickerMode = true;
    document.body.style.cursor = "crosshair";
    document.addEventListener("mouseover", onPickerHover, true);
    document.addEventListener("click", onPickerClick, true);
    document.addEventListener("keydown", onPickerKey, true);
    showPickerBanner();
  }

  function stopPicker() {
    pickerMode = false;
    document.body.style.cursor = "";
    document.removeEventListener("mouseover", onPickerHover, true);
    document.removeEventListener("click", onPickerClick, true);
    document.removeEventListener("keydown", onPickerKey, true);
    if (activePickerEl) {
      activePickerEl.classList.remove("imdb-picker-hover");
      activePickerEl = null;
    }
    hidePickerBanner();
  }

  function onPickerHover(e) {
    if (!pickerMode) return;
    if (activePickerEl) activePickerEl.classList.remove("imdb-picker-hover");
    activePickerEl = e.target;
    activePickerEl.classList.add("imdb-picker-hover");
    const banner = document.getElementById("imdb-picker-banner");
    if (banner) {
      const sel = generateSelector(activePickerEl);
      banner.querySelector(".imdb-picker-selector").textContent = sel;
    }
  }

  function onPickerClick(e) {
    if (!pickerMode) return;
    e.preventDefault();
    e.stopPropagation();
    const selector = generateSelector(e.target);
    browser.runtime.sendMessage({ type: "ELEMENT_PICKED", selector });
    stopPicker();
  }

  function onPickerKey(e) {
    if (e.key === "Escape") stopPicker();
  }

  function generateSelector(el) {
    if (el.id) return `#${el.id}`;
    const parts = [];
    let current = el;
    while (current && current !== document.body) {
      let part = current.tagName.toLowerCase();
      if (current.className) {
        const classes = [...current.classList]
          .filter(c => !c.startsWith("imdb-"))
          .slice(0, 2)
          .map(c => `.${c}`)
          .join("");
        part += classes;
      }
      parts.unshift(part);
      current = current.parentElement;
      if (parts.length >= 4) break;
    }
    return parts.join(" > ");
  }

  function showPickerBanner() {
    let banner = document.getElementById("imdb-picker-banner");
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "imdb-picker-banner";
      banner.innerHTML = `
        <div class="imdb-picker-inner">
          <span class="imdb-picker-label">🎯 Click any movie card to capture its selector</span>
          <span class="imdb-picker-selector">hover an element…</span>
          <button class="imdb-picker-cancel" id="imdb-picker-cancel-btn">✕ Cancel (Esc)</button>
        </div>`;
      document.body.appendChild(banner);
      document.getElementById("imdb-picker-cancel-btn").addEventListener("click", stopPicker);
    }
    banner.style.display = "flex";
  }

  function hidePickerBanner() {
    const banner = document.getElementById("imdb-picker-banner");
    if (banner) banner.style.display = "none";
  }

  function debounce(fn, ms) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
  }

  init();
})();
