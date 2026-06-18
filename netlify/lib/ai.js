/**
 * Perplexity Sonar (web-grounded) portfolio analysis.
 * Requires PERPLEXITY_API_KEY.
 */
const API_URL = 'https://api.perplexity.ai/chat/completions'
const MODEL = 'sonar-pro'

const usd = (v) => `$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const signed = (v) => `${v >= 0 ? '+' : '-'}${usd(v)}`
const pct = (v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`

// Compact portfolio summary fed to the model.
export function buildContext(positions, quotes) {
  let totalValue = 0, totalInvested = 0, totalDay = 0
  const lines = []
  for (const p of positions) {
    const q = quotes[p.ticker] || {}
    const last = q.currentPrice
    if (last == null) { lines.push(`${p.ticker}: ${p.shares} sh, price unavailable`); continue }
    const prev = q.previousClose
    const dayPct = prev ? ((last - prev) / prev) * 100 : 0
    const unreal = (last - p.avg_cost) * p.shares
    const unrealPct = ((last - p.avg_cost) / p.avg_cost) * 100
    totalValue += p.shares * last
    totalInvested += p.shares * p.avg_cost
    totalDay += prev ? p.shares * (last - prev) : 0
    lines.push(`${p.ticker}: ${p.shares} sh @ avg ${usd(p.avg_cost)}, now ${usd(last)} (today ${pct(dayPct)}), unrealized ${signed(unreal)} (${pct(unrealPct)})`)
  }
  const totalPnl = totalValue - totalInvested
  const summary =
    `Total value ${usd(totalValue)}; cost basis ${usd(totalInvested)}; ` +
    `unrealized P&L ${signed(totalPnl)} (${pct(totalInvested ? totalPnl / totalInvested * 100 : 0)}); ` +
    `today ${signed(totalDay)}.`
  return `Holdings:\n${lines.join('\n')}\n\n${summary}`
}

// Markdown stats block shown at the START of the AI brief (snapshot, positions,
// top movers) — mirrors the data brief. Renders in both the web panel and (via
// mdToTelegramHtml) Telegram.
export function buildStats(positions, quotes) {
  let totalValue = 0, totalInvested = 0, totalDay = 0, marketState = 'CLOSED'
  const rows = []
  for (const p of positions) {
    const q = quotes[p.ticker] || {}
    const last = q.currentPrice
    if (q.marketState && q.marketState !== 'CLOSED') marketState = q.marketState
    if (last == null) { rows.push({ t: p.ticker, missing: true }); continue }
    const prev = q.previousClose
    const dayPct = prev ? ((last - prev) / prev) * 100 : 0
    totalValue += p.shares * last
    totalInvested += p.shares * p.avg_cost
    totalDay += prev ? p.shares * (last - prev) : 0
    rows.push({ t: p.ticker, shares: p.shares, last, dayPct, unreal: (last - p.avg_cost) * p.shares })
  }
  const totalPnl = totalValue - totalInvested
  const dayPctTotal = (totalValue - totalDay) ? (totalDay / (totalValue - totalDay)) * 100 : 0
  const dot = (v) => (v > 0 ? '🟢' : v < 0 ? '🔴' : '⚪')
  const stateLabel = { REGULAR: '🟢 open', PRE: '🌅 pre-market', POST: '🌙 after-hours', CLOSED: '🔒 closed' }[marketState] || marketState

  const posLines = rows.map(r => r.missing
    ? `⚠️ **${r.t}** — price unavailable`
    : `${dot(r.dayPct)} **${r.t}** ${r.shares}sh $${r.last.toFixed(2)} ${pct(r.dayPct)} · P&L ${signed(r.unreal)}`)
  const movers = rows.filter(r => !r.missing).sort((a, b) => Math.abs(b.dayPct) - Math.abs(a.dayPct)).slice(0, 3)
  const moverLines = movers.map(r => `${r.dayPct >= 0 ? '📈' : '📉'} **${r.t}** ${pct(r.dayPct)}`)

  return (
    `📊 **Snapshot** · ${stateLabel}\n` +
    `💼 Value: **${usd(totalValue)}**\n` +
    `Today: ${dot(totalDay)} **${signed(totalDay)}** (${pct(dayPctTotal)})\n` +
    `Overall: ${dot(totalPnl)} **${signed(totalPnl)}** (${pct(totalInvested ? totalPnl / totalInvested * 100 : 0)})\n\n` +
    `📋 **Positions**\n${posLines.join('\n')}\n\n` +
    (moverLines.length ? `🔀 **Top movers**\n${moverLines.join('\n')}` : '')
  )
}

const SYSTEM = `You are the user's personal equity research analyst. Each brief, RESEARCH what is actually happening with their specific holdings RIGHT NOW using current news, analyst commentary and market data — not generic portfolio theory.

Cover fresh news & announcements per holding (earnings/guidance, analyst rating or price-target changes, product launches, M&A, regulatory/legal, management/insider moves), sector & macro TRENDS that concretely affect these names, and what they should worry about or act on.

Structure your answer EXACTLY like this, in markdown:

⚡ **Highlights**
- **<must-know headline>** — <≤14-word punch>
(3-5 bullets, MOST CRITICAL FIRST: breaking news, big moves, real risks or decisions)

🔎 **Details**
**<TICKER or topic>** — <2-3 sentences expanding the relevant highlight with specifics, dates and numbers>
(expand ONLY the top 3-4 highlights — one short block each, not every holding)

👀 **On the radar**
- **<specific date or countdown>** — <catalyst: earnings, Fed/CPI, product event>

Rules:
- ALWAYS finish with the "👀 On the radar" section — keep Details tight so you reach it.
- Every radar item MUST start with a concrete date when known — e.g. "**Jul 24**" or a countdown like "**in 3 days**" — researching the actual earnings/announcement dates. If a date is genuinely unknown, write "**date TBC**". Do not give an undated catalyst.
- Each highlight's bold lead phrase must capture the point on its own (skimmable).
- Lead with the single most important NEW development.
- Reference holdings by ticker; attribute moves to real, recent causes.
- NO evergreen boilerplate (concentration risk, "valuation is high", "diversify", macro/rate lectures) unless tied to a specific new event. Assume the user knows their portfolio is concentrated in AI/semis.
- Omit holdings with no real recent news — don't pad.
- Wrap every emphasis in **double asterisks**. Keep total under ~1800 characters.`

export async function analyzePortfolio(context) {
  const key = process.env.PERPLEXITY_API_KEY
  if (!key) throw new Error('PERPLEXITY_API_KEY not set')

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1100,
      search_recency_filter: 'week',   // bias toward fresh news
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `Date: ${today}. My portfolio:\n\n${context}\n\nGive me today's research-driven recap and heads-up.` },
      ],
    }),
  })
  if (!res.ok) throw new Error(`Perplexity HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)

  const text = (await res.json())?.choices?.[0]?.message?.content?.trim()
  if (!text) throw new Error('Empty analysis from Perplexity')
  // Strip inline citation markers like [1][2] for a cleaner read.
  return text.replace(/\[\d+\]/g, '').replace(/[ \t]+\n/g, '\n').trim()
}
