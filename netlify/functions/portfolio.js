import { getStore } from '@netlify/blobs'

const STORE_NAME = 'stockbot'
const KEY = 'portfolio'

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
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
  }

  const store = getStore({ name: STORE_NAME, consistency: 'strong' })

  // GET — return current portfolio
  if (req.method === 'GET') {
    const raw = await store.get(KEY)
    const data = raw ? JSON.parse(raw) : { positions: [] }
    return cors(data)
  }

  // POST — add or update a position
  if (req.method === 'POST') {
    const body = await req.json()
    const { ticker, shares, avg_cost } = body

    if (!ticker || typeof shares !== 'number' || typeof avg_cost !== 'number') {
      return cors({ error: 'ticker, shares, and avg_cost are required' }, 400)
    }

    const raw = await store.get(KEY)
    const data = raw ? JSON.parse(raw) : { positions: [] }

    const idx = data.positions.findIndex((p) => p.ticker === ticker.toUpperCase())
    const position = { ticker: ticker.toUpperCase(), shares, avg_cost }

    if (idx >= 0) {
      data.positions[idx] = position
    } else {
      data.positions.push(position)
    }

    await store.set(KEY, JSON.stringify(data))
    return cors({ ok: true, position })
  }

  // DELETE — remove a position
  if (req.method === 'DELETE') {
    const url = new URL(req.url)
    const ticker = url.searchParams.get('ticker')?.toUpperCase()

    if (!ticker) return cors({ error: 'ticker query param required' }, 400)

    const raw = await store.get(KEY)
    const data = raw ? JSON.parse(raw) : { positions: [] }
    data.positions = data.positions.filter((p) => p.ticker !== ticker)
    await store.set(KEY, JSON.stringify(data))
    return cors({ ok: true })
  }

  return cors({ error: 'Method not allowed' }, 405)
}

export const config = { path: '/api/portfolio' }
