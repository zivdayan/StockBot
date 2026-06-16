/**
 * GET /api/prices?tickers=AMZN,NVDA
 *
 * Thin wrapper over the shared Yahoo Finance chart fetcher. currentPrice is
 * extended-hours aware (matches the broker after the close); regularMarketPrice
 * is also returned for callers that need the regular-session price only.
 */
import { fetchQuotes } from '../lib/quotes.js'

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
  const raw = url.searchParams.get('tickers')
  if (!raw) return json({ error: 'tickers param required' }, 400)

  const tickers = raw.split(',').map(t => t.trim().toUpperCase()).filter(Boolean)
  if (!tickers.length) return json({ error: 'No valid tickers' }, 400)

  return json(await fetchQuotes(tickers))
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  })
}

export const config = { path: '/api/prices' }
