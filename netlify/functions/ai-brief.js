/**
 * GET  /api/ai-brief  → cached last brief { analysis, generatedAt }
 * POST /api/ai-brief  → generate ONCE, cache it, send to Telegram, return it
 *
 * One generation serves the web panel + Telegram. The cron passes ?source=cron
 * (Telegram-only intent) and skips generation entirely when muted/disabled, so
 * no Perplexity call is wasted. Unauthenticated like /api/brief.
 */
import { getStore } from '@netlify/blobs'
import { fetchQuotes } from '../lib/quotes.js'
import { mdToTelegramHtml } from '../lib/telegram.js'
import { notify, isAllowed, logSkip } from '../lib/notify.js'
import { buildContext, analyzePortfolio } from '../lib/ai.js'

const STORE_NAME = 'stockbot'
const CACHE_KEY = 'ai-brief'

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
  }

  const store = getStore({ name: STORE_NAME, consistency: 'strong' })

  // Return the cached last brief (so the page can show it without regenerating).
  if (req.method === 'GET') {
    const raw = await store.get(CACHE_KEY)
    return json(raw ? JSON.parse(raw) : { analysis: null, generatedAt: null })
  }

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const [portfolioRaw, settingsRaw] = await Promise.all([store.get('portfolio'), store.get('settings')])
  const { positions = [] } = portfolioRaw ? JSON.parse(portfolioRaw) : {}
  if (!positions.length) return json({ ok: false, error: 'No positions to analyze.' })

  const settings = settingsRaw ? JSON.parse(settingsRaw) : {}
  const trigger = new URL(req.url).searchParams.get('source') === 'cron' ? 'cron' : 'manual'

  // Cron is Telegram-only: if muted/disabled, skip before the paid Perplexity call.
  if (trigger === 'cron' && !isAllowed(settings, 'aiBrief').allowed) {
    await logSkip({ kind: 'aiBrief', trigger, reason: isAllowed(settings, 'aiBrief').reason })
    return json({ ok: false, skipped: true })
  }

  // Generate once.
  let analysis
  try {
    const quotes = await fetchQuotes(positions.map(p => p.ticker))
    analysis = await analyzePortfolio(buildContext(positions, quotes))
  } catch (err) {
    return json({ ok: false, error: err.message }, 502)
  }
  const generatedAt = new Date().toISOString()

  // Cache for the web panel.
  await store.set(CACHE_KEY, JSON.stringify({ analysis, generatedAt }))

  // Send to Telegram (gated by mute / aiBrief toggle; web still gets the analysis).
  const recipients = settings.telegramRecipients || []
  const stamp = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' })
  const msg = `🧠 <b>StockBot AI Brief</b> — ${stamp}\n━━━━━━━━━━━━━━━━━━━━\n${mdToTelegramHtml(analysis)}`
  const send = await notify({ kind: 'aiBrief', trigger, text: msg, recipients, settings })

  return json({
    ok: true,
    analysis,
    generatedAt,
    sent: send.ok,
    skipped: send.skipped || false,
    reason: send.reason ?? null,
    recipients: recipients.length,
    sendResults: send.results,
  })
}

export const config = { path: '/api/ai-brief' }
