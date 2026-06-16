import { getStore } from '@netlify/blobs'

const STORE_NAME  = 'stockbot'
const CRUMB_KEY   = 'yahoo-crumb'
const CRUMB_TTL   = 50 * 60 * 1000   // 50 min (crumb valid ~1 h)

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

// ── Session / crumb management ────────────────────────────────────────────────

async function getSession(store) {
  const cached = await store.get(CRUMB_KEY)
  if (cached) {
    const s = JSON.parse(cached)
    if (Date.now() - s.fetchedAt < CRUMB_TTL) return s
  }
  const s = await fetchSession()
  await store.set(CRUMB_KEY, JSON.stringify({ ...s, fetchedAt: Date.now() }))
  return s
}

async function fetchSession() {
  // Step 1 — get an A1 cookie from Yahoo's cookie endpoint
  const cookieRes = await fetch('https://fc.yahoo.com/v1/test/acookie', {
    headers: { 'User-Agent': UA },
    redirect: 'follow',
  })
  const setCookie = cookieRes.headers.get('set-cookie') ?? ''
  // Pull out just "A1=..." (first segment before semicolon)
  const cookie = setCookie.split(';')[0] ?? ''

  // Step 2 — exchange cookie for a crumb
  const crumbRes = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'User-Agent': UA, 'Cookie': cookie },
  })
  const crumb = (await crumbRes.text()).trim()

  if (!crumb || crumb.includes('<')) {
    throw new Error('Failed to obtain Yahoo Finance crumb — the session cookie may be invalid')
  }

  return { crumb, cookie }
}

// ── Quote fetch ───────────────────────────────────────────────────────────────

async function fetchQuotes(symbols, session) {
  const fields = [
    'symbol', 'shortName',
    'regularMarketPrice', 'regularMarketChange', 'regularMarketChangePercent',
    'regularMarketPreviousClose', 'regularMarketOpen',
    'regularMarketDayHigh', 'regularMarketDayLow',
    'bid', 'ask', 'marketState',
  ].join(',')

  const url =
    `https://query1.finance.yahoo.com/v8/finance/quote` +
    `?symbols=${encodeURIComponent(symbols)}` +
    `&fields=${fields}` +
    `&crumb=${encodeURIComponent(session.crumb)}` +
    `&lang=en-US&region=US`

  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Cookie': session.cookie,
      'Accept': 'application/json',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Yahoo Finance ${res.status}: ${body.slice(0, 120)}`)
  }

  const data = await res.json()
  return data?.quoteResponse?.result ?? []
}

// ── Handler ───────────────────────────────────────────────────────────────────

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

  const store = getStore(STORE_NAME)

  let quotes
  try {
    const session = await getSession(store)
    quotes = await fetchQuotes(tickers.join(','), session)
  } catch (err) {
    // Crumb may have expired — force a fresh session and retry once
    try {
      const session = await fetchSession()
      await store.set(CRUMB_KEY, JSON.stringify({ ...session, fetchedAt: Date.now() }))
      quotes = await fetchQuotes(tickers.join(','), session)
    } catch (err2) {
      return json({ error: err2.message }, 502)
    }
  }

  const results = {}
  for (const q of quotes) {
    results[q.symbol] = {
      ticker:        q.symbol,
      name:          q.shortName ?? q.symbol,
      currentPrice:  q.regularMarketPrice ?? null,
      change:        q.regularMarketChange ?? null,
      changePercent: q.regularMarketChangePercent ?? null,
      previousClose: q.regularMarketPreviousClose ?? null,
      bid:           q.bid ?? null,
      ask:           q.ask ?? null,
      open:          q.regularMarketOpen ?? null,
      high:          q.regularMarketDayHigh ?? null,
      low:           q.regularMarketDayLow ?? null,
      marketState:   q.marketState ?? null,
    }
  }

  for (const t of tickers) {
    if (!results[t]) results[t] = { ticker: t, currentPrice: null, error: 'Not found' }
  }

  return json(results)
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
