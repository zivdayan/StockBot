# StockBot — Claude Context

> **Last updated:** June 2026
> **Status:** Deployed at https://stockbot-ziv.netlify.app
> **Repo:** https://github.com/zivdayan/StockBot

---

## What This Is

A personal stock portfolio tracker with real-time Yahoo Finance data, Telegram alerts, and a React dashboard hosted on Netlify. Portfolio data is imported from broker `.xls` exports (tab-separated format) and stored in Netlify Blobs.

---

## Tech Stack

| Layer      | Choice                                         |
|------------|-------------------------------------------------|
| Frontend   | React 18 + Vite 5                               |
| Styling    | Custom CSS (dark theme, `src/index.css`)         |
| Backend    | Netlify Functions (serverless)                   |
| Storage    | Netlify Blobs (store: `stockbot`)                |
| Data       | Yahoo Finance `/v8/finance/chart` endpoint       |
| Alerts     | Telegram Bot API                                 |
| Scheduler  | GitHub Actions cron (`0 * * * *`)                |
| CI/CD      | GitHub Actions → Netlify CLI deploy              |

---

## Project Structure

```
/
├── .github/workflows/
│   ├── deploy.yml              ← CI: build → set env vars → deploy to Netlify
│   └── check-alerts.yml        ← Hourly cron: POST /api/check-alerts
├── netlify.toml                ← Build config + /api/* redirect to functions
├── vite.config.js
├── package.json                ← No yahoo-finance2 dep (uses direct fetch)
│
├── netlify/functions/          ← Serverless API (Netlify Functions v2)
│   ├── portfolio.js            ← GET/POST/DELETE /api/portfolio (Blobs key: "portfolio")
│   ├── prices.js               ← GET /api/prices?tickers=... (Yahoo Finance chart API)
│   ├── check-alerts.js         ← POST /api/check-alerts (alert logic + Telegram sender)
│   ├── settings.js             ← GET/POST /api/settings (thresholds, recipients)
│   ├── import-portfolio.js     ← POST /api/import-portfolio (parse broker TSV export)
│   └── telegram-chats.js       ← GET /api/telegram-chats (live bot chat list from getUpdates)
│
├── src/
│   ├── main.jsx
│   ├── App.jsx                 ← Tabs, 30s auto-refresh
│   ├── index.css               ← Full dark theme
│   ├── api/
│   │   └── client.js           ← Fetch wrappers for all /api/* endpoints
│   └── components/
│       ├── StockTable.jsx      ← Dashboard table (broker-style columns + totals footer)
│       ├── AddPositionForm.jsx ← Manual ticker/shares/cost entry
│       ├── ImportPortfolio.jsx ← Drag-drop broker .xls import with preview
│       └── AlertSettings.jsx  ← Thresholds + live Telegram chat list picker
└── public/
    └── favicon.svg
```

---

## Architecture

```
Browser (React SPA)               Netlify Functions
─────────────────────             ──────────────────────────────────────
src/api/client.js  ──GET/POST───▶  /api/portfolio     → Blobs("portfolio")
                   ──GET────────▶  /api/prices        → Yahoo Finance chart API
                   ──POST───────▶  /api/import-portfolio → parse TSV → Blobs
                   ──GET/POST───▶  /api/settings      → Blobs("settings")
                   ──GET────────▶  /api/telegram-chats → Telegram getUpdates + Blobs("telegram-chats")

GitHub Actions (hourly)
──POST──▶  /api/check-alerts   → read portfolio + prices + settings
                                → compare with snapshot → send Telegram alerts
                                → save new snapshot to Blobs("snapshot")
```

---

## Yahoo Finance Integration

**Endpoint used:** `https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?interval=1m&range=1d`

- No authentication, crumb, or session cookies needed (unlike `/v8/finance/quote`)
- One request per ticker, fetched in parallel (9 tickers in ~0.4s)
- Returns: `regularMarketPrice`, `previousClose`, `regularMarketDayHigh/Low`, `regularMarketVolume`, `currentTradingPeriod` (for market state derivation)
- `change` and `changePercent` are derived: `price − previousClose`
- **Does NOT return:** bid/ask, regularMarketOpen (those come from the `/v8/finance/quote` endpoint which is now blocked without a crumb)

### Today G/L formula (matches broker via imported reference)

The broker's "Today Gain/Loss" uses a **per-lot reference**, not previous close or the day's open: shares bought *today* are measured from their **purchase price**, overnight holds from **previous close**, and positions added to mid-session are a **blend**. It can't be reconstructed from live prices alone.

Instead it's captured at import time. `import-portfolio.js` derives **`today_ref = last − (todayGL / shares)`** per position from the broker export (the broker's own intraday basis — e.g. INTC = 121.31, stable across the session) and stamps `ref_date` with the US/Eastern trading day. The dashboard computes **Today G/L = (livePrice − today_ref) × qty** while `ref_date` is the current ET day, then falls back to `(livePrice − previousClose) × qty` (by then every share is an overnight hold, so prev close is the correct reference). Re-import the `.xls` each session to refresh `today_ref`. Residual vs the broker is just live-price-vs-snapshot timing (~$4 on the full portfolio).

`prices.js` also returns `dayOpen` (regular-session open from the intraday series); it's currently unused by the dashboard but available.

---

## Netlify Blobs Schema (store: "stockbot")

```json
// key: "portfolio"
// today_ref/ref_date are set by import-portfolio.js (broker's intraday basis
// for Today G/L, valid only on ref_date's ET trading day). Manually-added
// positions omit them and fall back to previousClose.
{ "positions": [{ "ticker": "AMZN", "shares": 6, "avg_cost": 246.10, "today_ref": 246.10, "ref_date": "2026-06-16" }] }

// key: "snapshot" (written by check-alerts after each run)
{
  "timestamp": "2026-06-16T10:00:00Z",
  "prices": { "AMZN": 246.12, ... },
  "totalValue": 30484.90,
  "dailySummarySentDate": "2026-06-16"   // prevents duplicate daily summaries
}

// key: "settings"
{
  "stockAlertThresholdPct": 2,
  "portfolioAlertThresholdPct": 1,
  "telegramRecipients": [{ "name": "Ziv", "chatId": "123456789" }],
  "dailySummaryHour": 17
}

// key: "telegram-chats" (persisted chat list from getUpdates)
{ "<chatId>": { "chatId": "...", "name": "...", "type": "private", "username": "..." } }
```

---

## Broker Export Format

File: `portfolio.XXXXXX.xls` (actually tab-separated text disguised as .xls)

| Column | Maps to |
|--------|---------|
| Symbol | `ticker` |
| Qty | `shares` |
| Average Cost | `avg_cost` |

Each record spans **several physical lines** (the broker splits the Last/Change cell across lines) and summary rows precede the `Symbol`/`Qty` header. The parser finds the header row, groups continuation lines back into one record per ticker, and reads fixed data columns (`[2]`Qty, `[7]`Cost, `[9]`Today G/L, Last from `[3]`). It also derives `today_ref` from the Today G/L column. The totals footer (Symbol empty) is skipped. `import-portfolio.js` and the client preview in `ImportPortfolio.jsx` share this logic.

---

## Alert Types

| Trigger | Condition |
|---------|-----------|
| Per-stock alert | Any stock moves ±X% since last hourly snapshot |
| Portfolio alert | Total value moves ±X% since last snapshot |
| Daily P&L summary | Sent once at configured UTC hour (checks `dailySummarySentDate` to avoid dupes) |

Alerts are sent to all `telegramRecipients` via `POST /api/check-alerts`, authenticated by `x-alert-token` header matching `ALERT_SECRET`.

---

## Environment Variables

### Netlify (set via GitHub Actions `netlify env:set` on deploy)
| Variable | Source |
|----------|--------|
| `TELEGRAM_BOT_TOKEN` | @BotFather |
| `ALERT_SECRET` | Random hex, shared with GitHub Actions |

### GitHub Actions Secrets
| Secret | Purpose |
|--------|---------|
| `NETLIFY_AUTH_TOKEN` | Netlify CLI auth |
| `NETLIFY_SITE_ID` | `d08c7acb-ed9f-4bb2-b368-e65f9ea54929` |
| `NETLIFY_SITE_URL` | `https://stockbot-ziv.netlify.app` |
| `ALERT_SECRET` | Auth for `/api/check-alerts` |
| `TELEGRAM_BOT_TOKEN` | Pushed to Netlify env on deploy |

### Local deploy credentials
Stored at `~/.stockbot-deploy` (chmod 600, NOT in repo):
```
GITHUB_TOKEN=ghp_...
NETLIFY_TOKEN=nfp_...
NETLIFY_SITE_ID=d08c7acb-ed9f-4bb2-b368-e65f9ea54929
```

---

## Deploying

Claude deploys directly (no manual steps needed):
```bash
set -a && source ~/.stockbot-deploy && set +a
npm run build
git add -A && git commit -m "..." && git push origin main
NETLIFY_AUTH_TOKEN=$NETLIFY_TOKEN NETLIFY_SITE_ID=$NETLIFY_SITE_ID \
  npx netlify-cli deploy --dir=dist --prod
```

Every push to `main` also triggers GitHub Actions deploy (`.github/workflows/deploy.yml`).

---

## Pending Work / Known Issues

- [x] **Today G/L formula**: now matches the broker via `today_ref` captured at import (see "Today G/L formula" above). Re-import the `.xls` each session to refresh.
- [x] **GOOG quantity**: resolved — portfolio now holds 9 shares (matches broker).
- [ ] The hourly GitHub Actions cron (`check-alerts.yml`) needs `TELEGRAM_BOT_TOKEN` set in Netlify env. Trigger a deploy from GitHub Actions to push secrets.
- [ ] Mobile responsive layout (table is wide)

---

## How to Continue in a New Claude Session

> "I'm continuing work on my StockBot portfolio tracker. The repo is at /home/ziv/Projects/StockBot — read CLAUDE.md for full context, then help me with [TASK]."

---

*Built for Ziv — June 2026*
