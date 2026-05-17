# ★ IMDb Ratings Overlay — Firefox Extension

Automatically shows movie and TV ratings on Netflix, Disney+, Max (HBO), Prime Video, Apple TV+, Hulu — and any streaming site you add. Uses the TMDb API, so titles in Polish, German, Japanese, and other languages are resolved correctly without any translation step.

---

## Installation

1. Open Firefox and go to `about:debugging`
2. Click **"This Firefox"** in the left sidebar
3. Click **"Load Temporary Add-on…"**
4. Navigate to this folder and select `manifest.json`

> For permanent installation, the extension would need to be submitted to addons.mozilla.org (AMO) and signed. For personal use, temporary loading works fine — it resets on browser restart.

---

## Setup

### 1. Get a free TMDb API key
Go to [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api), create a free account, and copy the **API Key (v3 auth)** string. No daily request limit.

### 2. Enter your API key
Click the extension icon → **Settings** tab → paste your key → **Save**.

---

## Features

### Rating Badges
- Gold star overlaid on every movie/show card
- Color-coded: 🟢 ≥7.5 · 🟡 6–7.4 · 🔴 <6
- Hover for title, year, score, and genre
- Click any badge to open the IMDb page (falls back to TMDb if no IMDb ID)
- Ratings cached for 7 days (Settings → Clear Cache to reset)

### Multilingual Title Support
TMDb's search engine understands localized titles natively — searching "Skazani na Shawshank", "Ojciec chrzestny", or "기생충" all resolve to the correct film. When the original title differs from the local one, both are shown in the badge tooltip.

### Built-in Sites
| Site | Domain |
|------|--------|
| Netflix | netflix.com |
| Disney+ | disneyplus.com |
| Max / HBO | max.com, hbomax.com |
| Prime Video | primevideo.com |
| Apple TV+ | tv.apple.com |
| Hulu | hulu.com |

### Element Picker
Navigate to the **Sites** tab, expand a site, and click **🎯 Pick Card Element on Page**. The popup closes and you click any movie card on the streaming site — the CSS selector is automatically captured and saved.

### Custom Sites
Go to **Sites** → enter a site name and domain → **Add Site**. Then use the element picker or type CSS selectors manually for both the card container and the title element.

---

## File Structure

```
imdb-ratings-extension/
├── manifest.json       # Extension manifest (MV2)
├── background.js       # TMDb API fetcher + cache
├── content.js          # Page scanner + badge injector + element picker
├── overlay.css         # Badge + picker styles (injected into pages)
├── popup.html          # Extension popup UI
├── popup.js            # Popup logic
└── icons/
    ├── icon48.png
    └── icon96.png
```

---

## Permissions

| Permission | Why |
|-----------|-----|
| `activeTab` | Communicate with the current tab for element picker |
| `storage` | Save API key, site configs, and ratings cache |
| `<all_urls>` | Inject rating badges on any streaming site |
| `https://api.themoviedb.org/*` | Fetch ratings from TMDb |

No data is ever sent anywhere except to TMDb's API for title lookups.
