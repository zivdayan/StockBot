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

const TICKER_RE = /^[A-Z][A-Z.]{0,6}$/
const num = (s) => (s == null ? NaN : parseFloat(String(s).replace(/[$,%\s]/g, '')))
const firstNum = (s) => {
  const m = String(s ?? '').match(/-?[\d,]+\.?\d*/)
  return m ? parseFloat(m[0].replace(/,/g, '')) : NaN
}

/**
 * Parses the broker positions export (HTML-clipboard TSV disguised as .xls).
 *
 * Each position record begins on a line whose first tab-cell is a ticker
 * symbol. The broker splits multi-line cells (the Last/Change cell) across
 * physical lines, so continuation lines are concatenated back onto the record.
 * Header/summary rows above the table and the totals footer are ignored.
 *
 * Fixed data-column layout (note the margin-flag column after Symbol):
 *   [0]Symbol [1]flag [2]Qty [3]Last(+chg) [4]Chg% [5]Bid [6]Ask
 *   [7]Cost [8]Day'sValue [9]TodayG/L [10]UnrealizedG/L [11]TipRanks
 *
 * Returns positions including `today_ref` — the broker's intraday cost basis
 * for the Today G/L column, derived as last − (todayGL / shares). This is the
 * per-position reference the broker measures "today's" gain from (purchase
 * price for shares bought today, prev close for overnight holds, a blend for
 * positions that were added to during the session).
 */
function parseTSV(text) {
  const lines = text.split('\n')
  const headerIdx = lines.findIndex(l => {
    const c = l.split('\t').map(x => x.trim().toLowerCase())
    return c.includes('symbol') && c.includes('qty')
  })
  if (headerIdx === -1) throw new Error('Could not find the Symbol/Qty header row in the export')

  // Group physical lines back into one string per position record.
  const records = []
  let cur = null
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const first = lines[i].split('\t')[0].trim()
    if (TICKER_RE.test(first)) {
      if (cur !== null) records.push(cur)
      cur = lines[i]
    } else if (cur !== null) {
      cur += lines[i]          // continuation of a multi-line cell
    }
  }
  if (cur !== null) records.push(cur)

  const positions = []
  for (const rec of records) {
    const c = rec.split('\t')
    const ticker = c[0].trim().toUpperCase()
    const shares = num(c[2])
    const avg_cost = num(c[7])
    const todayGL = num(c[9])
    const last = firstNum(c[3])

    // Skip totals footer and any row without a valid ticker/qty/cost
    if (!ticker || isNaN(shares) || isNaN(avg_cost)) continue

    const pos = { ticker, shares, avg_cost }
    if (!isNaN(todayGL) && !isNaN(last) && shares) {
      pos.today_ref = Math.round((last - todayGL / shares) * 10000) / 10000
    }
    positions.push(pos)
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

  // Stamp the trading day (US/Eastern) this snapshot was taken. today_ref is
  // only valid for that session; after it, the dashboard falls back to
  // previous close (by then every share is an overnight hold).
  const refDate = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  for (const p of imported) if (p.today_ref != null) p.ref_date = refDate

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
