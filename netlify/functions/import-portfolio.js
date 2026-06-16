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

/**
 * Parses the broker TSV export (disguised as .xls):
 * Columns: Symbol, Description, Qty, Bid, Ask, Last, Change, Day's Value, Average Cost, Gain, Profit/Loss, Value
 * Skips the totals footer row (Symbol = NaN / empty).
 */
function parseTSV(text) {
  const lines = text.trim().split('\n')
  if (lines.length < 2) throw new Error('File has no data rows')

  const header = lines[0].split('\t').map(h => h.trim())
  const symbolIdx = header.findIndex(h => h.toLowerCase() === 'symbol')
  const qtyIdx = header.findIndex(h => h.toLowerCase() === 'qty')
  const avgCostIdx = header.findIndex(h => h.toLowerCase().includes('average cost'))

  if (symbolIdx === -1 || qtyIdx === -1 || avgCostIdx === -1) {
    throw new Error(`Missing required columns. Found: ${header.join(', ')}`)
  }

  const positions = []
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split('\t').map(c => c.trim())
    const ticker = cells[symbolIdx]
    const qty = parseFloat(cells[qtyIdx])
    const avgCost = parseFloat(cells[avgCostIdx])

    // Skip totals row and any row without a valid ticker/qty
    if (!ticker || ticker === '' || isNaN(qty) || isNaN(avgCost)) continue

    positions.push({ ticker: ticker.toUpperCase(), shares: qty, avg_cost: avgCost })
  }

  if (!positions.length) throw new Error('No valid positions found in file')
  return positions
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

  if (req.method !== 'POST') return cors({ error: 'Method not allowed' }, 405)

  let body
  try {
    body = await req.json()
  } catch {
    return cors({ error: 'Invalid JSON body' }, 400)
  }

  const { content, mode = 'replace' } = body
  // content: raw file text (TSV)
  // mode: 'replace' (overwrite all) | 'merge' (add/update, keep existing not in file)

  if (!content) return cors({ error: 'content field required' }, 400)

  let imported
  try {
    imported = parseTSV(content)
  } catch (err) {
    return cors({ error: err.message }, 422)
  }

  const store = getStore(STORE_NAME)
  let positions

  if (mode === 'merge') {
    const raw = await store.get(KEY)
    const existing = raw ? JSON.parse(raw).positions || [] : []
    const map = Object.fromEntries(existing.map(p => [p.ticker, p]))
    for (const p of imported) map[p.ticker] = p
    positions = Object.values(map)
  } else {
    positions = imported
  }

  await store.set(KEY, JSON.stringify({ positions }))

  return cors({ ok: true, imported: imported.length, total: positions.length, positions })
}

export const config = { path: '/api/import-portfolio' }
