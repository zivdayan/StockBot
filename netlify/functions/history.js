/**
 * GET /api/history?ticker=NVDA&range=1Y
 *
 * Daily/weekly close history for the per-symbol performance chart.
 * range ∈ { 1M, 6M, 1Y, ALL }.
 */
import { fetchHistory } from '../lib/quotes.js'

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
  }
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405)

  const url = new URL(req.url)
  const ticker = url.searchParams.get('ticker')?.trim().toUpperCase()
  const range = url.searchParams.get('range') || '1Y'
  if (!ticker) return json({ error: 'ticker param required' }, 400)

  try {
    return json({ ticker, range, points: await fetchHistory(ticker, range) })
  } catch (err) {
    return json({ error: err.message }, 502)
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
}

export const config = { path: '/api/history' }
