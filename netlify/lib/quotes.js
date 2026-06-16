/**
 * Shared Yahoo Finance quote fetching (direct chart API, no crumb/session).
 * Used by prices.js (dashboard), check-alerts.js, and brief.js.
 *
 * Returns BOTH:
 *   - currentPrice: display price — extended-hours (pre/post-market) last bar
 *     when the market is PRE/POST and available, so the dashboard matches the
 *     broker after the close. Falls back to the regular price otherwise.
 *   - regularMarketPrice: the regular-session price only. Alerts use THIS so
 *     thin after-hours moves don't trigger notifications.
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const round = (n) => (n == null ? null : Math.round(n * 10000) / 10000)

export async function fetchQuote(ticker) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1m&range=1d&includePrePost=true`
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const data = await res.json()
  const result = data?.chart?.result?.[0]
  if (!result) throw new Error('No result in chart response')

  const meta = result.meta
  const regular = meta.regularMarketPrice ?? null
  const prev = meta.previousClose ?? meta.chartPreviousClose ?? null

  // Market state from current trading periods
  const now = Date.now() / 1000
  const periods = meta.currentTradingPeriod
  let marketState = 'CLOSED'
  if (periods) {
    if (now >= periods.regular.start && now < periods.regular.end) marketState = 'REGULAR'
    else if (now >= periods.pre.start && now < periods.pre.end) marketState = 'PRE'
    else if (now >= periods.post.start && now < periods.post.end) marketState = 'POST'
  }

  // Walk the intraday series for the regular-session open and the latest
  // extended-hours bar (post-market = after regular end; pre-market = before
  // regular start).
  const ts = result.timestamp ?? []
  const q = result.indicators?.quote?.[0] ?? {}
  const opens = q.open ?? []
  const closes = q.close ?? []
  const regStart = periods?.regular?.start ?? null
  const regEnd = periods?.regular?.end ?? null

  let dayOpen = null, postPrice = null, prePrice = null
  for (let i = 0; i < ts.length; i++) {
    if (dayOpen === null && opens[i] != null && (regStart === null || ts[i] >= regStart)) dayOpen = opens[i]
    if (closes[i] == null) continue
    if (regEnd !== null && ts[i] >= regEnd) postPrice = closes[i]        // keep last post-market bar
    else if (regStart !== null && ts[i] < regStart) prePrice = closes[i] // keep last pre-market bar
  }

  let currentPrice = regular
  if (marketState === 'POST' && postPrice != null) currentPrice = postPrice
  else if (marketState === 'PRE' && prePrice != null) currentPrice = prePrice

  const change = currentPrice != null && prev != null ? currentPrice - prev : null
  const changePct = change != null && prev ? (change / prev) * 100 : null

  return {
    ticker,
    name: meta.longName ?? meta.shortName ?? ticker,
    currentPrice: round(currentPrice),
    regularMarketPrice: round(regular),
    previousClose: prev,
    dayOpen,
    change: round(change),
    changePercent: round(changePct),
    high: meta.regularMarketDayHigh ?? null,
    low: meta.regularMarketDayLow ?? null,
    volume: meta.regularMarketVolume ?? null,
    marketState,
  }
}

export async function fetchQuotes(tickers) {
  const entries = await Promise.all(
    tickers.map(async (t) => {
      try {
        return [t, await fetchQuote(t)]
      } catch (err) {
        return [t, { ticker: t, currentPrice: null, regularMarketPrice: null, error: err.message }]
      }
    })
  )
  return Object.fromEntries(entries)
}
