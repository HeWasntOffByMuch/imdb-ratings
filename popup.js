// popup.js — drives the extension popup UI

const BUILTIN_SITES = [
  { id: "netflix",    name: "Netflix",      match: "netflix.com",    builtin: true },
  { id: "disneyplus", name: "Disney+",      match: "disneyplus.com", builtin: true },
  { id: "hbomax",     name: "Max (HBO)",    match: ["hbomax.com","max.com"], builtin: true },
  { id: "primevideo", name: "Prime Video",  match: "primevideo.com", builtin: true },
  { id: "appletv",    name: "Apple TV+",    match: "tv.apple.com",   builtin: true },
  { id: "hulu",       name: "Hulu",         match: "hulu.com",       builtin: true },
];

let settings = { apiKey: "", siteConfigs: [], enabled: true };
let currentTabId = null;
let pendingPickerSiteId = null;

async function init() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  currentTabId = tabs[0]?.id;

  const stored = await browser.storage.local.get(["apiKey", "siteConfigs", "enabled"]);
  settings.apiKey = stored.apiKey || "";
  settings.siteConfigs = stored.siteConfigs || [];
  settings.enabled = stored.enabled !== false;

  renderAll();
  setupListeners();

  // Listen for element picked from content script
  browser.runtime.onMessage.addListener((msg) => {
    if (msg.type === "ELEMENT_PICKED" && pendingPickerSiteId !== null) {
      addSelectorToSite(pendingPickerSiteId, msg.selector);
      pendingPickerSiteId = null;
    }
  });
}

function renderAll() {
  // Toggle
  const toggle = document.getElementById("enabled-toggle");
  toggle.checked = settings.enabled;
  document.getElementById("toggle-label").textContent = settings.enabled ? "On" : "Off";

  // API key
  document.getElementById("api-key-input").value = settings.apiKey;
  renderApiStatus();

  // Sites
  renderSites();
}

function renderApiStatus() {
  const el = document.getElementById("api-status");
  if (settings.apiKey) {
    el.innerHTML = `<div class="status-pill ok"><span class="status-dot"></span>TMDb API key saved</div>`;
  } else {
    el.innerHTML = `<div class="status-pill error"><span class="status-dot"></span>No API key — ratings won't load</div>`;
  }
}

function renderSites() {
  const list = document.getElementById("sites-list");
  const allSites = [...BUILTIN_SITES, ...settings.siteConfigs];
  list.innerHTML = "";

  for (const site of allSites) {
    const customConfig = settings.siteConfigs.find(s => s.id === site.id);
    const selectors = customConfig?.customSelectors || [];
    const titleSelectors = customConfig?.customTitleSelectors || [];
    const isBuiltin = site.builtin;

    const card = document.createElement("div");
    card.className = "site-card";
    card.dataset.id = site.id;

    const matchStr = Array.isArray(site.match) ? site.match.join(", ") : site.match;

    card.innerHTML = `
      <div class="site-header">
        <span class="site-name">
          ${site.name}
          <span class="site-badge ${isBuiltin ? "" : "custom"}">${isBuiltin ? "built-in" : "custom"}</span>
        </span>
        <span class="site-expand">▼</span>
      </div>
      <div class="site-body">
        <div class="sel-label">Domain: <code style="font-family:monospace;font-size:10px;color:#f5c518">${matchStr}</code></div>

        <div class="sel-label">Card selectors (CSS)</div>
        <div class="sel-list" id="sel-list-${site.id}">
          ${selectors.map((s, i) => selectorChip(s, site.id, "card", i)).join("")}
          ${selectors.length === 0 ? `<span style="font-size:10px;color:var(--muted)">Using built-in selectors</span>` : ""}
        </div>
        <div class="add-sel-row">
          <input type="text" class="sel-input-card" placeholder=".card-class or #id" style="flex:1;font-size:10px">
          <button class="btn btn-ghost" style="font-size:11px;padding:5px 9px" data-action="add-card" data-site="${site.id}">+ Add</button>
        </div>
        <button class="picker-btn" data-action="pick" data-site="${site.id}" data-type="card">
          <span class="icon">🎯</span> Pick Card Element on Page
        </button>

        <div class="sel-label" style="margin-top:10px">Title selectors (CSS)</div>
        <div class="sel-list" id="title-sel-list-${site.id}">
          ${titleSelectors.map((s, i) => selectorChip(s, site.id, "title", i)).join("")}
          ${titleSelectors.length === 0 ? `<span style="font-size:10px;color:var(--muted)">Using built-in title selectors</span>` : ""}
        </div>
        <div class="add-sel-row">
          <input type="text" class="sel-input-title" placeholder=".title-class" style="flex:1;font-size:10px">
          <button class="btn btn-ghost" style="font-size:11px;padding:5px 9px" data-action="add-title" data-site="${site.id}">+ Add</button>
        </div>
        <button class="picker-btn" data-action="pick" data-site="${site.id}" data-type="title">
          <span class="icon">🎯</span> Pick Title Element on Page
        </button>

        ${!isBuiltin ? `<button class="btn btn-red" style="width:100%;margin-top:10px" data-action="remove-site" data-site="${site.id}">Remove Site</button>` : ""}
      </div>`;

    card.querySelector(".site-header").addEventListener("click", () => {
      card.classList.toggle("open");
    });

    // Wire up buttons within card
    card.querySelectorAll("[data-action]").forEach(btn => {
      btn.addEventListener("click", handleSiteAction);
    });

    list.appendChild(card);
  }
}

function selectorChip(sel, siteId, type, index) {
  return `<div class="sel-row">
    <span class="sel-chip" title="${sel}">${sel}</span>
    <button class="sel-del" data-action="del-sel" data-site="${siteId}" data-type="${type}" data-index="${index}" title="Remove">×</button>
  </div>`;
}

function handleSiteAction(e) {
  const action = e.currentTarget.dataset.action;
  const siteId = e.currentTarget.dataset.site;

  if (action === "add-card") {
    const input = e.currentTarget.closest(".site-body").querySelector(".sel-input-card");
    const val = input.value.trim();
    if (val) { addSelectorToSite(siteId, val, "card"); input.value = ""; }
  }
  if (action === "add-title") {
    const input = e.currentTarget.closest(".site-body").querySelector(".sel-input-title");
    const val = input.value.trim();
    if (val) { addSelectorToSite(siteId, val, "title"); input.value = ""; }
  }
  if (action === "pick") {
    const type = e.currentTarget.dataset.type;
    pendingPickerSiteId = siteId + "|" + type;
    browser.tabs.sendMessage(currentTabId, { type: "START_PICKER" });
    window.close();
  }
  if (action === "del-sel") {
    const type = e.currentTarget.dataset.type;
    const index = parseInt(e.currentTarget.dataset.index);
    delSelector(siteId, type, index);
  }
  if (action === "remove-site") {
    removeSite(siteId);
  }
}

function getOrCreateCustomConfig(siteId) {
  // Check if it's a builtin site
  const builtin = BUILTIN_SITES.find(s => s.id === siteId);
  let config = settings.siteConfigs.find(s => s.id === siteId);
  if (!config) {
    config = {
      id: siteId,
      name: builtin?.name || siteId,
      match: builtin?.match || siteId,
      customSelectors: [],
      customTitleSelectors: [],
    };
    settings.siteConfigs.push(config);
  }
  return config;
}

function addSelectorToSite(siteIdAndType, selector, typeHint) {
  let siteId = siteIdAndType;
  let type = typeHint || "card";

  // May come as "siteId|type" from picker
  if (siteIdAndType.includes("|")) {
    [siteId, type] = siteIdAndType.split("|");
  }

  const config = getOrCreateCustomConfig(siteId);
  if (type === "title") {
    if (!config.customTitleSelectors) config.customTitleSelectors = [];
    if (!config.customTitleSelectors.includes(selector)) {
      config.customTitleSelectors.push(selector);
    }
  } else {
    if (!config.customSelectors) config.customSelectors = [];
    if (!config.customSelectors.includes(selector)) {
      config.customSelectors.push(selector);
    }
  }

  saveAndRefresh();
  showToast("Selector added ✓", "success");
}

function delSelector(siteId, type, index) {
  const config = settings.siteConfigs.find(s => s.id === siteId);
  if (!config) return;
  if (type === "title") {
    config.customTitleSelectors?.splice(index, 1);
  } else {
    config.customSelectors?.splice(index, 1);
  }
  saveAndRefresh();
}

function removeSite(siteId) {
  settings.siteConfigs = settings.siteConfigs.filter(s => s.id !== siteId);
  saveAndRefresh();
}

function setupListeners() {
  // Tab switching
  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById("panel-" + tab.dataset.tab).classList.add("active");
    });
  });

  // Global toggle
  document.getElementById("enabled-toggle").addEventListener("change", async (e) => {
    settings.enabled = e.target.checked;
    document.getElementById("toggle-label").textContent = settings.enabled ? "On" : "Off";
    await browser.storage.local.set({ enabled: settings.enabled });
    browser.tabs.sendMessage(currentTabId, { type: "RELOAD_SETTINGS" }).catch(() => {});
  });

  // Save API key
  document.getElementById("save-key-btn").addEventListener("click", async () => {
    const key = document.getElementById("api-key-input").value.trim();
    settings.apiKey = key;
    await browser.storage.local.set({ apiKey: key });
    renderApiStatus();
    showToast(key ? "API key saved!" : "API key cleared", key ? "success" : "");
  });

  // Clear cache
  document.getElementById("clear-cache-btn").addEventListener("click", async () => {
    await browser.runtime.sendMessage({ type: "CLEAR_CACHE" });
    showToast("Cache cleared ✓", "success");
  });

  // Add custom site
  document.getElementById("add-site-btn").addEventListener("click", () => {
    const name = document.getElementById("new-site-name").value.trim();
    const host = document.getElementById("new-site-host").value.trim();
    if (!name || !host) { showToast("Enter both name and domain", "error"); return; }

    const id = "custom_" + host.replace(/\./g, "_");
    if (settings.siteConfigs.find(s => s.id === id)) {
      showToast("Site already exists", "error"); return;
    }

    settings.siteConfigs.push({
      id, name, match: host,
      customSelectors: [],
      customTitleSelectors: [],
    });

    document.getElementById("new-site-name").value = "";
    document.getElementById("new-site-host").value = "";

    saveAndRefresh();
    showToast(`${name} added!`, "success");

    // Switch to sites tab and open it
    document.querySelector('[data-tab="sites"]').click();
  });

  // Sync remote selectors
  document.getElementById("sync-selectors-btn").addEventListener("click", async () => {
    const btn = document.getElementById("sync-selectors-btn");
    const status = document.getElementById("sync-status");
    btn.disabled = true;
    btn.textContent = "Syncing…";
    await browser.runtime.sendMessage({ type: "SYNC_SELECTORS" });
    const stored = await browser.storage.local.get(["remoteSelectors", "remoteSelectorsFetchedAt"]);
    const count = stored.remoteSelectors?.length || 0;
    const when = stored.remoteSelectorsFetchedAt
      ? new Date(stored.remoteSelectorsFetchedAt).toLocaleTimeString() : "—";
    status.innerHTML = `<div class="status-pill ok" style="margin-top:6px"><span class="status-dot"></span>${count} sites synced at ${when}</div>`;
    btn.disabled = false;
    btn.textContent = "↓ Sync selectors from GitHub";
    browser.tabs.sendMessage(currentTabId, { type: "RELOAD_SETTINGS" }).catch(() => {});
  });

  // Refresh ratings
  document.getElementById("refresh-btn").addEventListener("click", () => {
    browser.tabs.sendMessage(currentTabId, { type: "RELOAD_SETTINGS" }).catch(() => {});
    showToast("Refreshing…", "");
    setTimeout(() => window.close(), 400);
  });
}

async function saveAndRefresh() {
  await browser.storage.local.set({ siteConfigs: settings.siteConfigs });
  browser.tabs.sendMessage(currentTabId, { type: "RELOAD_SETTINGS" }).catch(() => {});
  renderSites();
}

function showToast(msg, type = "") {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.className = `toast ${type} show`;
  setTimeout(() => toast.classList.remove("show"), 2400);
}

init();
