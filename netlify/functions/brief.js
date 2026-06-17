/**
 * POST /api/brief
 *
 * Composes a portfolio briefing — totals, current positions, and the biggest
 * movers — and sends it to all configured Telegram recipients immediately.
 * Used by the "Trigger Brief" button and the pre-market brief cron.
 *
 * No shared-secret auth: it only ever sends to the recipients saved in
 * settings, so the browser button can call it directly.
 */
import { getStore } from '@netlify/blobs'
import { fetchQuotes } from '../lib/quotes.js'
import { sendTelegram, escapeHtml } from '../lib/telegram.js'
import { buildContext, analyzePortfolio } from '../lib/ai.js'

const STORE_NAME = 'stockbot'

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
}

const usd = (v) => `$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const signed = (v) => `${v >= 0 ? '+' : '-'}${usd(v)}`
const pct = (v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
  }
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const store = getStore(STORE_NAME)
  const [portfolioRaw, settingsRaw] = await Promise.all([
    store.get('portfolio'),
    store.get('settings'),
  ])

  const { positions = [] } = portfolioRaw ? JSON.parse(portfolioRaw) : {}
  const settings = settingsRaw ? JSON.parse(settingsRaw) : {}
  const recipients = settings.telegramRecipients || []

  if (!positions.length) return json({ ok: false, error: 'No positions to brief on.' }, 200)

  const quotes = await fetchQuotes(positions.map(p => p.ticker))

  let totalValue = 0, totalInvested = 0, totalDayGL = 0
  const rows = []
  let marketState = 'CLOSED'

  for (const pos of positions) {
    const q = quotes[pos.ticker] || {}
    const last = q.currentPrice ?? null
    const prevClose = q.previousClose ?? null
    if (q.marketState && q.marketState !== 'CLOSED') marketState = q.marketState
    if (last == null) { rows.push({ ticker: pos.ticker, missing: true }); continue }

    // Today's move is measured from the previous close.
    const value = pos.shares * last
    const dayGL = prevClose != null ? pos.shares * (last - prevClose) : 0
    const dayPct = prevClose ? ((last - prevClose) / prevClose) * 100 : 0
    const unreal = pos.shares * (last - pos.avg_cost)

    totalValue += value
    totalInvested += pos.shares * pos.avg_cost
    totalDayGL += dayGL
    rows.push({ ticker: pos.ticker, shares: pos.shares, last, dayPct, dayGL, unreal })
  }

  const totalPnl = totalValue - totalInvested
  const dayPctTotal = (totalValue - totalDayGL) ? (totalDayGL / (totalValue - totalDayGL)) * 100 : 0

  // Biggest movers by absolute daily %
  const movers = rows.filter(r => !r.missing).sort((a, b) => Math.abs(b.dayPct) - Math.abs(a.dayPct)).slice(0, 3)

  const stateLabel = { REGULAR: '🟢 open', PRE: '🌅 pre-market', POST: '🌙 after-hours', CLOSED: '🔒 closed' }[marketState] || marketState
  const stamp = new Date().toLocaleString('en-US', {
    timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  // Directional emoji helpers
  const dot = (v) => (v > 0 ? '🟢' : v < 0 ? '🔴' : '⚪')
  const dayEmoji = totalDayGL > 0 ? '📈' : totalDayGL < 0 ? '📉' : '➡️'
  const totalPnlPct = totalInvested ? totalPnl / totalInvested * 100 : 0

  const posLines = rows.map(r =>
    r.missing
      ? `  ⚠️ ${r.ticker.padEnd(5)} — price unavailable`
      : `  ${dot(r.dayPct)} <b>${r.ticker.padEnd(5)}</b> ${String(r.shares).padStart(3)}sh  $${r.last.toFixed(2)}  ${pct(r.dayPct)}  P&L ${signed(r.unreal)}`
  )

  const moverLines = movers.map(r => `  ${r.dayPct >= 0 ? '📈' : '📉'} <b>${r.ticker}</b> ${pct(r.dayPct)}`)

  // Bold one-line takeaway
  const dir = totalDayGL >= 0 ? 'up' : 'down'
  const bottomLine =
    `${dayEmoji} <b>Day: ${dir} ${usd(Math.abs(totalDayGL))} (${pct(dayPctTotal)})</b> · ` +
    `overall ${totalPnl >= 0 ? '🟢' : '🔴'} <b>${signed(totalPnl)} (${pct(totalPnlPct)})</b>`

  const msg =
    `🌅 <b>StockBot Brief</b> — ${stamp} ET\n` +
    `Market: ${stateLabel}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `💼 Value: <b>${usd(totalValue)}</b>\n` +
    `   Today: ${dot(totalDayGL)} <b>${signed(totalDayGL)}</b> (${pct(dayPctTotal)})\n` +
    `   Overall P&L: ${dot(totalPnl)} <b>${signed(totalPnl)}</b> (${pct(totalPnlPct)})\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `📋 <b>Positions</b>\n${posLines.join('\n')}\n` +
    (moverLines.length ? `━━━━━━━━━━━━━━━━━━━━\n🔀 <b>Top movers</b>\n${moverLines.join('\n')}\n` : '') +
    `━━━━━━━━━━━━━━━━━━━━\n${bottomLine}`

  // Append the AI view (Perplexity). Skip gracefully if the key is unset or the
  // call fails — the data brief still goes out.
  let aiSection = ''
  if (process.env.PERPLEXITY_API_KEY) {
    try {
      const analysis = await analyzePortfolio(buildContext(positions, quotes))
      aiSection = `\n━━━━━━━━━━━━━━━━━━━━\n🧠 <b>AI view</b>\n${escapeHtml(analysis)}`
    } catch (err) {
      console.error('AI section skipped:', err.message)
    }
  }

  const fullMsg = msg + aiSection
  const send = await sendTelegram(recipients, fullMsg)

  return json({
    ok: send.ok,
    error: send.error ?? null,
    recipients: recipients.length,
    totalValue,
    marketState,
    aiIncluded: !!aiSection,
    sendResults: send.results,
    preview: fullMsg,
  })
}

export const config = { path: '/api/brief' }
