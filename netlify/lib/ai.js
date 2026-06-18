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

const SYSTEM = `You are the user's personal equity research analyst. Each brief, RESEARCH what is actually happening with their specific holdings RIGHT NOW using current news, analyst commentary and market data — not generic portfolio theory.

Cover fresh news & announcements per holding (earnings/guidance, analyst rating or price-target changes, product launches, M&A, regulatory/legal, management/insider moves), sector & macro TRENDS that concretely affect these names, and what they should worry about or act on.

Structure your answer EXACTLY like this, in markdown:

⚡ **Highlights**
- **<must-know headline>** — <≤14-word punch>
(3-5 bullets, MOST CRITICAL FIRST: breaking news, big moves, real risks or decisions)

🔎 **Details**
**<TICKER or topic>** — <2-4 sentences expanding the relevant highlight with specifics, dates and numbers>
(one block per highlight that needs expansion)

👀 **On the radar**
- <next dated catalyst: earnings date, Fed/CPI, product event>

Rules:
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
      max_tokens: 750,
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
