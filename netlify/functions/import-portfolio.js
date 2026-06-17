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

// Build a position. We only need ticker, shares, and avg_cost — every G/L on the
// dashboard is computed live from Yahoo prices. avg_cost MUST be a positive price
// (a cost basis can't be zero/negative); this also guards against a format
// mismatch silently writing the wrong column into avg_cost.
function makePosition(ticker, shares, avg_cost) {
  if (!TICKER_RE.test(ticker) || isNaN(shares) || isNaN(avg_cost) || avg_cost <= 0) return null
  return { ticker, shares, avg_cost }
}

/**
 * Parses a Meitav positions export. Handles BOTH formats the broker produces:
 *
 *   (A) Clean single-line TSV (the .xls download): one row per position with a
 *       full header incl. "Average Cost". Columns are mapped by header name.
 *   (B) Messy multi-line clipboard TSV: records span several physical lines, an
 *       extra margin-flag column follows Symbol, cost header is just "Cost".
 *       Header names don't align with data, so fixed positions are used:
 *         [0]Symbol [1]flag [2]Qty [7]Cost
 *
 * Only ticker / shares / avg_cost are extracted.
 */
function parseTSV(text) {
  const lines = text.split('\n')
  const headerIdx = lines.findIndex(l => {
    const c = l.split('\t').map(x => x.trim().toLowerCase())
    return c.includes('symbol') && c.includes('qty')
  })
  if (headerIdx === -1) throw new Error('Could not find the Symbol/Qty header row in the export')

  const header = lines[headerIdx].split('\t').map(h => h.trim().toLowerCase())
  // "Average Cost" only appears in the clean single-line format; the multi-line
  // format labels it just "Cost".
  const positions = header.some(h => h.includes('average cost'))
    ? parseClean(lines, headerIdx, header)
    : parseMultiline(lines, headerIdx)

  if (!positions.length) {
    throw new Error('No valid positions found — unexpected export format (avg cost must be a positive price)')
  }
  return positions
}

// (A) Clean single-line format — map columns by header name.
function parseClean(lines, headerIdx, header) {
  const col = (...names) => header.findIndex(h => names.some(n => h === n || h.includes(n)))
  const symIdx = col('symbol')
  const qtyIdx = col('qty')
  const avgIdx = col('average cost', 'avg cost')

  const out = []
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const c = lines[i].split('\t').map(x => x.trim())
    const p = makePosition((c[symIdx] || '').toUpperCase(), num(c[qtyIdx]), num(c[avgIdx]))
    if (p) out.push(p)
  }
  return out
}

// (B) Messy multi-line clipboard format — reconstruct records, fixed columns.
function parseMultiline(lines, headerIdx) {
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

  const out = []
  for (const rec of records) {
    const c = rec.split('\t')
    const p = makePosition(c[0].trim().toUpperCase(), num(c[2]), num(c[7]))
    if (p) out.push(p)
  }
  return out
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
