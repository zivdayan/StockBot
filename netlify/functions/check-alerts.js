import { getStore } from '@netlify/blobs'
import { fetchQuotes } from '../lib/quotes.js'
import { notify } from '../lib/notify.js'

const STORE_NAME = 'stockbot'

const DEFAULTS = {
  stockAlertThresholdPct: 2,
  portfolioAlertThresholdPct: 1,
  telegramChatId: '',
  dailySummaryHour: 17,
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const pct = (v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
const usd = (v) => `$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default async function handler(req) {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  // Verify shared secret
  const secret = process.env.ALERT_SECRET
  const provided = req.headers.get('x-alert-token')
  if (secret && provided !== secret) {
    return json({ error: 'Unauthorized' }, 401)
  }

  const trigger = new URL(req.url).searchParams.get('source') === 'cron' ? 'cron' : 'manual'

  const store = getStore(STORE_NAME)

  const [portfolioRaw, snapshotRaw, settingsRaw] = await Promise.all([
    store.get('portfolio'),
    store.get('snapshot'),
    store.get('settings'),
  ])

  const { positions = [] } = portfolioRaw ? JSON.parse(portfolioRaw) : {}
  const snapshot = snapshotRaw ? JSON.parse(snapshotRaw) : null
  const savedSettings = settingsRaw ? JSON.parse(settingsRaw) : {}

  // Migrate legacy single chatId → recipients list
  if (savedSettings.telegramChatId && !savedSettings.telegramRecipients) {
    savedSettings.telegramRecipients = [{ name: 'Me', chatId: savedSettings.telegramChatId }]
  }

  const settings = { ...DEFAULTS, ...savedSettings }
  const recipients = settings.telegramRecipients || []

  if (!positions.length) {
    return json({ ok: true, message: 'No positions to check.' })
  }

  // Fetch current prices. Alerts use the REGULAR-session price so thin
  // after-hours moves don't trigger notifications (after-hours pricing is
  // display-only on the dashboard).
  const tickers = positions.map((p) => p.ticker)
  const quotes = await fetchQuotes(tickers)
  const currentPrices = {}
  for (const t of tickers) currentPrices[t] = quotes[t]?.regularMarketPrice ?? null

  // Totals
  let totalCurrent = 0
  let totalInvested = 0
  for (const pos of positions) {
    const price = currentPrices[pos.ticker]
    if (price != null) totalCurrent += pos.shares * price
    totalInvested += pos.shares * pos.avg_cost
  }

  const alerts = []
  const now = new Date()
  const nowHourUTC = now.getUTCHours()

  // Per-stock alerts (vs last snapshot)
  if (snapshot?.prices) {
    for (const pos of positions) {
      const prev = snapshot.prices[pos.ticker]
      const curr = currentPrices[pos.ticker]
      if (prev == null || curr == null) continue
      const change = ((curr - prev) / prev) * 100
      if (Math.abs(change) >= settings.stockAlertThresholdPct) {
        const arrow = change >= 0 ? '📈' : '📉'
        alerts.push(
          `${arrow} <b>${pos.ticker}</b> moved ${pct(change)} since last check\n` +
          `   Price: $${curr.toFixed(2)} (was $${prev.toFixed(2)})\n` +
          `   Threshold: ±${settings.stockAlertThresholdPct}%`
        )
      }
    }
  }

  // Portfolio-level alert
  if (snapshot?.totalValue && totalCurrent > 0) {
    const portfolioChange = ((totalCurrent - snapshot.totalValue) / snapshot.totalValue) * 100
    if (Math.abs(portfolioChange) >= settings.portfolioAlertThresholdPct) {
      const arrow = portfolioChange >= 0 ? '⬆️' : '⬇️'
      alerts.push(
        `${arrow} <b>Portfolio</b> moved ${pct(portfolioChange)} since last check\n` +
        `   Value: ${usd(totalCurrent)} (was ${usd(snapshot.totalValue)})\n` +
        `   Threshold: ±${settings.portfolioAlertThresholdPct}%`
      )
    }
  }

  // Daily summary
  const isDailySummaryHour = nowHourUTC === settings.dailySummaryHour
  const alreadySentToday = snapshot?.dailySummarySentDate === now.toISOString().slice(0, 10)
  const sendResults = []

  if (isDailySummaryHour && !alreadySentToday && totalCurrent > 0) {
    const totalPnl = totalCurrent - totalInvested
    const totalPnlPct = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0

    const lines = positions.map((pos) => {
      const price = currentPrices[pos.ticker]
      if (!price) return `  ${pos.ticker.padEnd(6)} — price unavailable`
      const pnl = pos.shares * price - pos.shares * pos.avg_cost
      const pnlP = (pnl / (pos.shares * pos.avg_cost)) * 100
      return `  ${pos.ticker.padEnd(6)} ${pos.shares} sh   ${pnl >= 0 ? '+' : '-'}${usd(pnl)} (${pct(pnlP)})`
    })

    const summaryDate = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' })
    const summaryMsg =
      `📊 <b>Daily Portfolio Summary — ${summaryDate}</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      lines.join('\n') + '\n' +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `Total value: ${usd(totalCurrent)}\n` +
      `Overall P&L: ${totalPnl >= 0 ? '+' : '-'}${usd(totalPnl)} (${pct(totalPnlPct)})`

    sendResults.push({ kind: 'dailySummary', ...(await notify({ kind: 'dailySummary', trigger, text: summaryMsg, recipients, settings })) })
  }

  // Batched stock/portfolio alerts
  if (alerts.length) {
    const msg = `⚠️ <b>StockBot Alert</b>\n\n` + alerts.join('\n\n')
    sendResults.push({ kind: 'alerts', ...(await notify({ kind: 'alerts', trigger, text: msg, recipients, settings })) })
  }

  // Save new snapshot
  const newSnapshot = {
    timestamp: now.toISOString(),
    prices: currentPrices,
    totalValue: totalCurrent,
    dailySummarySentDate: (isDailySummaryHour && !alreadySentToday)
      ? now.toISOString().slice(0, 10)
      : (snapshot?.dailySummarySentDate ?? null),
  }
  await store.set('snapshot', JSON.stringify(newSnapshot))

  return json({
    ok: true,
    checkedAt: now.toISOString(),
    alertsSent: alerts.length,
    dailySummarySent: isDailySummaryHour && !alreadySentToday,
    totalValue: totalCurrent,
    recipients: recipients.length,
    sendResults,
  })
}

export const config = { path: '/api/check-alerts' }
