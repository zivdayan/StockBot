/**
 * POST /api/ai-brief   { channel?: 'web' | 'telegram' }
 *
 * Generates a Perplexity (Sonar) analysis of the current portfolio.
 *   channel 'web'      (default) → { analysis }
 *   channel 'telegram'           → sends to all recipients, returns { sendResults }
 *
 * Unauthenticated like /api/brief — only ever sends to saved recipients.
 */
import { getStore } from '@netlify/blobs'
import { fetchQuotes } from '../lib/quotes.js'
import { escapeHtml } from '../lib/telegram.js'
import { notify } from '../lib/notify.js'
import { buildContext, analyzePortfolio } from '../lib/ai.js'

const STORE_NAME = 'stockbot'

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
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
  }
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const channel = (await req.json().catch(() => ({})))?.channel || 'web'

  const store = getStore(STORE_NAME)
  const [portfolioRaw, settingsRaw] = await Promise.all([store.get('portfolio'), store.get('settings')])
  const { positions = [] } = portfolioRaw ? JSON.parse(portfolioRaw) : {}
  if (!positions.length) return json({ ok: false, error: 'No positions to analyze.' })

  let analysis
  try {
    const quotes = await fetchQuotes(positions.map(p => p.ticker))
    analysis = await analyzePortfolio(buildContext(positions, quotes))
  } catch (err) {
    return json({ ok: false, error: err.message }, 502)
  }

  if (channel === 'telegram') {
    const settings = settingsRaw ? JSON.parse(settingsRaw) : {}
    const recipients = settings.telegramRecipients || []
    const trigger = new URL(req.url).searchParams.get('source') === 'cron' ? 'cron' : 'manual'
    const stamp = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' })
    const msg = `🧠 <b>StockBot AI Brief</b> — ${stamp}\n━━━━━━━━━━━━━━━━━━━━\n${escapeHtml(analysis)}`
    const send = await notify({ kind: 'aiBrief', trigger, text: msg, recipients, settings })
    return json({ ok: send.ok, skipped: send.skipped || false, reason: send.reason ?? null, error: send.error ?? null, recipients: recipients.length, sendResults: send.results, analysis })
  }

  return json({ ok: true, analysis })
}

export const config = { path: '/api/ai-brief' }
