import yahooFinance from 'yahoo-finance2'

function cors(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  })
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

  if (req.method !== 'GET') return cors({ error: 'Method not allowed' }, 405)

  const url = new URL(req.url)
  const raw = url.searchParams.get('tickers')
  if (!raw) return cors({ error: 'tickers query param required' }, 400)

  const tickers = raw.split(',').map((t) => t.trim().toUpperCase()).filter(Boolean)
  if (!tickers.length) return cors({ error: 'No valid tickers provided' }, 400)

  try {
    const results = {}

    await Promise.all(
      tickers.map(async (ticker) => {
        try {
          const quote = await yahooFinance.quote(ticker, {
            fields: ['regularMarketPrice', 'regularMarketChange', 'regularMarketChangePercent', 'regularMarketPreviousClose', 'shortName'],
          })
          results[ticker] = {
            ticker,
            name: quote.shortName ?? ticker,
            currentPrice: quote.regularMarketPrice ?? null,
            change: quote.regularMarketChange ?? null,
            changePercent: quote.regularMarketChangePercent ?? null,
            previousClose: quote.regularMarketPreviousClose ?? null,
          }
        } catch {
          results[ticker] = { ticker, currentPrice: null, error: 'Not found' }
        }
      })
    )

    return cors(results)
  } catch (err) {
    return cors({ error: err.message }, 500)
  }
}

export const config = { path: '/api/prices' }
