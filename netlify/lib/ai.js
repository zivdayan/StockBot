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

const SYSTEM = `You are a concise financial analyst for a long-term retail investor. Given their stock portfolio, write a brief, practical analysis covering: (1) an overall performance read, (2) notable recent news or moves for specific holdings, (3) two or three things to watch or risks. Be specific and current, reference holdings by ticker. Plain text only — no markdown headers or bullets symbols, short paragraphs. Keep it under 1400 characters. Finish with a line starting "Bottom line:".`

export async function analyzePortfolio(context) {
  const key = process.env.PERPLEXITY_API_KEY
  if (!key) throw new Error('PERPLEXITY_API_KEY not set')

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 700,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `Here is my portfolio:\n\n${context}\n\nGive me the analysis.` },
      ],
    }),
  })
  if (!res.ok) throw new Error(`Perplexity HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)

  const text = (await res.json())?.choices?.[0]?.message?.content?.trim()
  if (!text) throw new Error('Empty analysis from Perplexity')
  // Strip inline citation markers like [1][2] for a cleaner read.
  return text.replace(/\[\d+\]/g, '').replace(/[ \t]+\n/g, '\n').trim()
}
