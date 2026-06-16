/**
 * GET /api/prices?tickers=AMZN,NVDA
 *
 * Uses Yahoo Finance /v8/finance/chart per ticker (no crumb/session needed).
 * Requests are made in parallel. Change & changePercent are derived from
 * regularMarketPrice − previousClose.
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

async function fetchTicker(ticker) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1m&range=1d`
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept': 'application/json' },
  })

  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const data = await res.json()
  const result = data?.chart?.result?.[0]
  if (!result) throw new Error('No result in chart response')

  const meta = result.meta
  const price = meta.regularMarketPrice ?? null
  const prev  = meta.previousClose ?? meta.chartPreviousClose ?? null
  const change    = (price !== null && prev !== null) ? price - prev : null
  const changePct = (change !== null && prev)         ? (change / prev) * 100 : null

  // Derive market state from current trading periods
  const now = Date.now() / 1000
  const periods = meta.currentTradingPeriod

  // Regular-session open: first non-null open bar at/after the regular session
  // start. meta has no regularMarketOpen, so pull it from the intraday series.
  // The regular-session filter avoids picking up a pre-market bar.
  const timestamps = result.timestamp ?? []
  const opens = result.indicators?.quote?.[0]?.open ?? []
  const regStart = periods?.regular?.start ?? null
  let dayOpen = null
  for (let i = 0; i < timestamps.length; i++) {
    if (opens[i] == null) continue
    if (regStart !== null && timestamps[i] < regStart) continue
    dayOpen = opens[i]
    break
  }
  let marketState = 'CLOSED'
  if (periods) {
    if (now >= periods.regular.start && now < periods.regular.end)   marketState = 'REGULAR'
    else if (now >= periods.pre.start && now < periods.pre.end)      marketState = 'PRE'
    else if (now >= periods.post.start && now < periods.post.end)    marketState = 'POST'
  }

  return {
    ticker,
    name:          meta.longName ?? meta.shortName ?? ticker,
    currentPrice:  price,
    change:        change !== null ? Math.round(change * 10000) / 10000 : null,
    changePercent: changePct !== null ? Math.round(changePct * 10000) / 10000 : null,
    previousClose: prev,
    dayOpen:       dayOpen,
    high:          meta.regularMarketDayHigh ?? null,
    low:           meta.regularMarketDayLow ?? null,
    volume:        meta.regularMarketVolume ?? null,
    marketState,
  }
}

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

  const url     = new URL(req.url)
  const raw     = url.searchParams.get('tickers')
  if (!raw) return json({ error: 'tickers param required' }, 400)

  const tickers = raw.split(',').map(t => t.trim().toUpperCase()).filter(Boolean)
  if (!tickers.length) return json({ error: 'No valid tickers' }, 400)

  const results = await Promise.all(
    tickers.map(async (ticker) => {
      try {
        return [ticker, await fetchTicker(ticker)]
      } catch (err) {
        return [ticker, { ticker, currentPrice: null, error: err.message }]
      }
    })
  )

  return json(Object.fromEntries(results))
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
