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
│   ├── check-alerts.yml        ← Hourly cron: POST /api/check-alerts
│   └── brief.yml               ← Pre-market cron (~07:30 ET): POST /api/brief
├── netlify.toml                ← Build config + /api/* redirect to functions
├── vite.config.js
├── package.json                ← No yahoo-finance2 dep (uses direct fetch)
│
├── netlify/lib/                ← Shared modules bundled into functions
│   ├── quotes.js               ← fetchQuotes() direct Yahoo chart fetch (after-hours aware)
│   └── telegram.js             ← sendTelegram() returns per-recipient delivery results
├── netlify/functions/          ← Serverless API (Netlify Functions v2)
│   ├── portfolio.js            ← GET/POST/DELETE /api/portfolio (Blobs key: "portfolio")
│   ├── prices.js               ← GET /api/prices?tickers=... (wraps lib/quotes.js)
│   ├── check-alerts.js         ← POST /api/check-alerts (alert logic; regular-session prices)
│   ├── brief.js                ← POST /api/brief (instant portfolio briefing → Telegram)
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

### G/L formulas

Everything is computed live from Yahoo prices against the imported `shares` and `avg_cost` — the import only stores those two fields per position.

- **Today G/L** = `(currentPrice − previousClose) × qty` (the standard daily change). Between the close and the next open this shows the last completed session's move; it resets when the next session opens.
- **Unrealized G/L** = `(currentPrice − avg_cost) × qty`.

> **History:** an earlier version imported a per-position `today_ref` (the broker's lot-aware intraday basis) to match the broker's "Today Gain/Loss" to the penny. That was dropped — it required a daily re-import and added a column-mapping bug surface — in favour of the standard previous-close definition, which matches the broker exactly except on days with intraday purchases. `prices.js` still returns `dayOpen`/`regularMarketPrice`, currently unused by the dashboard.

---

## Netlify Blobs Schema (store: "stockbot")

```json
// key: "portfolio" — only ticker/shares/avg_cost; all G/L is computed live.
{ "positions": [{ "ticker": "AMZN", "shares": 6, "avg_cost": 246.10 }] }

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

Meitav exports **two formats**, both handled by `import-portfolio.js` (and mirrored in `ImportPortfolio.jsx` for the preview):

- **(A) Clean single-line `.xls`** — one row per position with a full header incl. `Average Cost`. Columns are mapped by header name.
- **(B) Messy multi-line clipboard TSV** — records span several physical lines, an extra margin-flag column follows Symbol, and cost is just `Cost`. Header names don't align with data, so fixed columns are used (`[2]`Qty, `[7]`Cost).

Only **Symbol / Qty / Average Cost** are extracted. The parser detects the format by whether the header contains "Average Cost", and **rejects any row whose `avg_cost` is not a positive price** — so a format mismatch fails loudly instead of corrupting the portfolio (this caused a real incident where "Day's Value" was misread as cost). The totals footer (empty Symbol) is skipped.

---

## Alert Types

| Trigger | Condition |
|---------|-----------|
| Per-stock alert | Any stock moves ±X% since last hourly snapshot |
| Portfolio alert | Total value moves ±X% since last snapshot |
| Daily P&L summary | Sent once at configured UTC hour (checks `dailySummarySentDate` to avoid dupes) |
| Brief | On demand ("Trigger Brief" button) or pre-market cron — totals, positions, top movers |

Alerts (`POST /api/check-alerts`) are sent to all `telegramRecipients`, authenticated by `x-alert-token` matching `ALERT_SECRET`, and use **regular-session prices** (after-hours moves don't trigger alerts). The brief (`POST /api/brief`) is **unauthenticated** (only ever sends to the saved recipients) so the browser button can call it; it uses the **after-hours display price**. Both share `lib/telegram.js`, which returns per-recipient delivery results for verification.

> **Note:** `check-alerts.js` previously imported `yahoo-finance2` (never a dependency), which crashed the function (HTTP 502) and silently broke the hourly cron. It now uses `lib/quotes.js` (direct fetch).

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
- [x] Hourly cron was failing (HTTP 502) because `check-alerts.js` imported the missing `yahoo-finance2`. Fixed — now returns 200 and Telegram delivery is verified. `TELEGRAM_BOT_TOKEN` + `ALERT_SECRET` confirmed set in Netlify env.
- [ ] Mobile responsive layout (table is wide)

---

## How to Continue in a New Claude Session

> "I'm continuing work on my StockBot portfolio tracker. The repo is at /home/ziv/Projects/StockBot — read CLAUDE.md for full context, then help me with [TASK]."

---

*Built for Ziv — June 2026*
