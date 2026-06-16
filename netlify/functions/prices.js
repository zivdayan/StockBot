/**
 * GET /api/prices?tickers=AMZN,GOOG
 *
 * Fetches quotes directly from Yahoo Finance v8 API.
 * Returns bid, ask, last, change, changePercent, previousClose per ticker.
 */
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

  const symbols = tickers.join(',')
  const fields = [
    'symbol', 'shortName', 'regularMarketPrice', 'regularMarketChange',
    'regularMarketChangePercent', 'regularMarketPreviousClose',
    'bid', 'ask', 'regularMarketOpen', 'regularMarketDayHigh',
    'regularMarketDayLow', 'regularMarketVolume', 'marketState',
  ].join(',')

  const endpoint =
    `https://query1.finance.yahoo.com/v8/finance/quote?symbols=${encodeURIComponent(symbols)}&fields=${fields}&lang=en-US&region=US`

  try {
    const res = await fetch(endpoint, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Origin': 'https://finance.yahoo.com',
        'Referer': 'https://finance.yahoo.com/',
      },
    })

    if (!res.ok) {
      const text = await res.text()
      return json({ error: `Yahoo Finance returned ${res.status}: ${text.slice(0, 200)}` }, 502)
    }

    const data = await res.json()
    const quotes = data?.quoteResponse?.result ?? []

    if (!quotes.length) {
      // Try fallback endpoint
      return fallback(tickers)
    }

    const results = {}
    for (const q of quotes) {
      results[q.symbol] = {
        ticker: q.symbol,
        name: q.shortName ?? q.symbol,
        currentPrice: q.regularMarketPrice ?? null,
        change: q.regularMarketChange ?? null,
        changePercent: q.regularMarketChangePercent ?? null,
        previousClose: q.regularMarketPreviousClose ?? null,
        bid: q.bid ?? null,
        ask: q.ask ?? null,
        open: q.regularMarketOpen ?? null,
        high: q.regularMarketDayHigh ?? null,
        low: q.regularMarketDayLow ?? null,
        marketState: q.marketState ?? null,  // 'REGULAR' | 'PRE' | 'POST' | 'CLOSED'
      }
    }

    // Fill in nulls for tickers not returned
    for (const t of tickers) {
      if (!results[t]) results[t] = { ticker: t, currentPrice: null, error: 'Not found' }
    }

    return json(results)
  } catch (err) {
    return json({ error: err.message }, 500)
  }
}

async function fallback(tickers) {
  // query2 as fallback
  const symbols = tickers.join(',')
  try {
    const res = await fetch(
      `https://query2.finance.yahoo.com/v8/finance/quote?symbols=${encodeURIComponent(symbols)}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Accept': 'application/json',
        },
      }
    )
    const data = await res.json()
    const quotes = data?.quoteResponse?.result ?? []
    const results = {}
    for (const q of quotes) {
      results[q.symbol] = {
        ticker: q.symbol,
        name: q.shortName ?? q.symbol,
        currentPrice: q.regularMarketPrice ?? null,
        change: q.regularMarketChange ?? null,
        changePercent: q.regularMarketChangePercent ?? null,
        previousClose: q.regularMarketPreviousClose ?? null,
        bid: q.bid ?? null,
        ask: q.ask ?? null,
        marketState: q.marketState ?? null,
      }
    }
    for (const t of tickers) {
      if (!results[t]) results[t] = { ticker: t, currentPrice: null, error: 'Not found' }
    }
    return json(results)
  } catch (err) {
    return json({ error: `Fallback failed: ${err.message}` }, 500)
  }
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
