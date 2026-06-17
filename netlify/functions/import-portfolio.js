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

// Build a position. avg_cost MUST be a positive price — a cost basis can't be
// zero/negative, so this also guards against a format mismatch silently writing
// the wrong column into avg_cost. today_ref = last − (today's $ gain / shares).
function makePosition(ticker, shares, avg_cost, last, todayGL) {
  if (!TICKER_RE.test(ticker) || isNaN(shares) || isNaN(avg_cost) || avg_cost <= 0) return null
  const pos = { ticker, shares, avg_cost }
  if (!isNaN(todayGL) && !isNaN(last) && shares) {
    pos.today_ref = Math.round((last - todayGL / shares) * 10000) / 10000
  }
  return pos
}

/**
 * Parses a Meitav positions export. Handles BOTH formats the broker produces:
 *
 *   (A) Clean single-line TSV (the .xls download): one row per position with a
 *       full header — Symbol, Description, Qty, Bid, Ask, Last, Change,
 *       Day's Value, Average Cost, Gain, Profit/Loss, Value. Columns are mapped
 *       by header name.
 *   (B) Messy multi-line clipboard TSV: records span several physical lines, an
 *       extra margin-flag column follows Symbol, cost header is just "Cost".
 *       Header names don't align with data columns, so fixed positions are used:
 *         [0]Symbol [1]flag [2]Qty [3]Last(+chg) [7]Cost [9]TodayG/L
 *
 * Both derive today_ref = last − (today's $ gain / shares) — the broker's
 * intraday basis for its Today G/L column (purchase price for shares bought
 * today, prev close for overnight holds, a blend for positions added intraday).
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
  const lastIdx = col('last')
  const dayIdx = col("day's value", 'days value', 'today gain', "today's gain")  // today's $ gain/loss

  const out = []
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const c = lines[i].split('\t').map(x => x.trim())
    const p = makePosition((c[symIdx] || '').toUpperCase(), num(c[qtyIdx]), num(c[avgIdx]), num(c[lastIdx]), num(c[dayIdx]))
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
    const p = makePosition(c[0].trim().toUpperCase(), num(c[2]), num(c[7]), firstNum(c[3]), num(c[9]))
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
