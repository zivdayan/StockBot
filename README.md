# StockBot — Personal Portfolio Tracker

A personal stock portfolio tracker with real-time Yahoo Finance data, Telegram alerts, and a React dashboard hosted on Netlify.

## Stack

- **Frontend**: React + Vite → Netlify
- **Backend**: Netlify Functions (serverless)
- **Database**: Netlify Blobs
- **Data**: Yahoo Finance via `yahoo-finance2`
- **Alerts**: Telegram Bot API
- **Scheduler**: GitLab CI/CD scheduled pipelines

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create a Telegram bot

1. Open Telegram and message **@BotFather**
2. Send `/newbot`, follow the prompts
3. Copy the bot token (looks like `123456789:ABCdef...`)
4. Start a chat with your new bot
5. Get your chat ID by messaging **@userinfobot** — it will reply with your numeric ID

### 3. Deploy to Netlify

1. Push this repo to GitLab (or GitHub)
2. Connect it to [Netlify](https://app.netlify.com) (New site → Import from Git)
3. Build settings (auto-detected from `netlify.toml`):
   - **Build command**: `npm run build`
   - **Publish directory**: `dist`

4. In Netlify → **Site Settings → Environment Variables**, add:

| Variable | Value |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Your bot token from @BotFather |
| `ALERT_SECRET` | Any random secret string (e.g. `openssl rand -hex 32`) |

### 4. Set up GitLab CI/CD schedule

1. Go to your GitLab repo → **CI/CD → Schedules → New schedule**
2. Set description: `StockBot hourly alert check`
3. Set cron: `0 * * * *` (every hour on the hour)
4. Add **CI/CD Variables**:

| Variable | Value |
|---|---|
| `NETLIFY_SITE_URL` | Your Netlify site URL (e.g. `https://my-stockbot.netlify.app`) |
| `ALERT_SECRET` | Same secret you set in Netlify |

### 5. Configure your portfolio

1. Open your Netlify site
2. Go to the **Alert Settings** tab → enter your Telegram Chat ID and alert thresholds → Save
3. Go to the **Manage Portfolio** tab → add your positions (ticker, shares, avg cost)

---

## Alert Types

| Trigger | Description |
|---|---|
| **Per-stock** | When a stock moves ±X% since the last hourly check |
| **Portfolio** | When total portfolio value moves ±X% since last check |
| **Daily summary** | Full P&L breakdown sent daily at your configured hour |

---

## Local Development

```bash
# Install Netlify CLI globally if needed
npm install -g netlify-cli

# Log in to Netlify
netlify login

# Link to your Netlify site
netlify link

# Start local dev server (runs Vite + Functions)
npm run dev
```

Netlify dev runs at `http://localhost:8888`. Functions are available at `/api/*`.

### Test alerts locally

```bash
curl -X POST http://localhost:8888/api/check-alerts \
  -H "x-alert-token: your-secret" \
  -H "Content-Type: application/json"
```

---

## Environment Variables Reference

### Netlify (required)

| Variable | Description |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Telegram bot token from @BotFather |
| `ALERT_SECRET` | Shared secret for GitLab → Netlify auth |

### GitLab CI/CD (required for scheduler)

| Variable | Description |
|---|---|
| `NETLIFY_SITE_URL` | Your full Netlify site URL |
| `ALERT_SECRET` | Must match the Netlify value |
