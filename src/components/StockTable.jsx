export default function StockTable({ positions, prices, onDelete }) {
  if (!positions.length) {
    return (
      <div className="table-wrapper">
        <div className="empty">
          <div style={{ fontSize: 40 }}>📭</div>
          <p>No positions yet. Add your first stock in the Manage Portfolio tab or import from a broker export.</p>
        </div>
      </div>
    )
  }

  let totalDayValue = 0
  let totalTodayGL = 0
  let totalUnrealizedGL = 0

  const rows = positions.map((pos) => {
    const q = prices[pos.ticker]
    const last        = q?.currentPrice ?? null
    const change      = q?.change ?? null           // $ change vs prev close
    const changePct   = q?.changePercent ?? null    // % change vs prev close
    const marketState = q?.marketState ?? null

    const cost        = pos.avg_cost                // avg cost per share
    const qty         = pos.shares

    // Day's value = current total value of this position
    const dayValue    = last !== null ? qty * last : null

    // Today G/L = today's price change × qty  (change = last − previous close)
    const todayGL     = change !== null ? qty * change : null

    // Unrealized G/L = (last − avg_cost) × qty
    const unrealizedGL = last !== null ? qty * (last - cost) : null
    const unrealizedPct = unrealizedGL !== null ? (unrealizedGL / (qty * cost)) * 100 : null

    if (dayValue !== null)     totalDayValue     += dayValue
    if (todayGL !== null)      totalTodayGL      += todayGL
    if (unrealizedGL !== null) totalUnrealizedGL += unrealizedGL

    return { pos, last, change, changePct, cost, qty, dayValue, todayGL, unrealizedGL, unrealizedPct, marketState }
  })

  const totalInvested = positions.reduce((s, p) => s + p.shares * p.avg_cost, 0)

  return (
    <div>
      {/* Summary cards */}
      <div className="summary-grid" style={{ marginBottom: 20 }}>
        <SummaryCard label="Total Value"      value={fmt$(totalDayValue)} />
        <SummaryCard label="Today G/L"        value={fmtGL$(totalTodayGL)}      pct={totalDayValue ? fmtPct(totalTodayGL / (totalDayValue - totalTodayGL) * 100) : null} signed />
        <SummaryCard label="Unrealized G/L"   value={fmtGL$(totalUnrealizedGL)} pct={totalInvested ? fmtPct(totalUnrealizedGL / totalInvested * 100) : null} signed />
      </div>

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Symbol</th>
              <th className="right">Qty</th>
              <th className="right">Last</th>
              <th className="right">Change</th>
              <th className="right">Avg Cost</th>
              <th className="right">Day's Value</th>
              <th className="right">Today G/L</th>
              <th className="right">Unrealized G/L</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ pos, last, change, changePct, cost, qty, dayValue, todayGL, unrealizedGL, unrealizedPct, marketState }) => (
              <tr key={pos.ticker}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="ticker">{pos.ticker}</span>
                    {marketState && marketState !== 'REGULAR' && (
                      <span style={{
                        fontSize: 10, padding: '2px 5px', borderRadius: 4,
                        background: 'rgba(245,158,11,0.15)', color: 'var(--yellow)',
                        fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px',
                      }}>{marketState === 'PRE' ? 'pre' : marketState === 'POST' ? 'after' : 'closed'}</span>
                    )}
                  </div>
                </td>
                <td className="right" style={{ color: 'var(--text-muted)' }}>{qty}</td>
                <td className="right" style={{ fontWeight: 600 }}>
                  {last !== null ? `$${last.toFixed(2)}` : <Dash />}
                </td>
                <td className="right">
                  {change !== null
                    ? <ChangeCell change={change} changePct={changePct} />
                    : <Dash />}
                </td>
                <td className="right" style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                  ${cost.toFixed(2)}
                </td>
                <td className="right" style={{ fontWeight: 500 }}>
                  {dayValue !== null ? fmt$(dayValue) : <Dash />}
                </td>
                <td className="right">
                  {todayGL !== null ? <GLCell value={todayGL} /> : <Dash />}
                </td>
                <td className="right">
                  {unrealizedGL !== null
                    ? <GLCell value={unrealizedGL} pct={unrealizedPct} />
                    : <Dash />}
                </td>
                <td>
                  <button className="delete-btn" title="Remove" onClick={() => onDelete(pos.ticker)}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--surface2)' }}>
              <td colSpan={5} style={{ padding: '12px 16px', fontWeight: 700, fontSize: 13, color: 'var(--text-muted)' }}>
                TOTAL
              </td>
              <td className="right" style={{ fontWeight: 700, padding: '12px 16px' }}>
                {fmt$(totalDayValue)}
              </td>
              <td className="right" style={{ padding: '12px 16px' }}>
                <GLCell value={totalTodayGL} />
              </td>
              <td className="right" style={{ padding: '12px 16px' }}>
                <GLCell value={totalUnrealizedGL} pct={totalInvested ? totalUnrealizedGL / totalInvested * 100 : null} />
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Dash() {
  return <span style={{ color: 'var(--border)' }}>—</span>
}

function ChangeCell({ change, changePct }) {
  const up = change >= 0
  const color = change === 0 ? 'var(--text-muted)' : up ? 'var(--green)' : 'var(--red)'
  return (
    <div style={{ color }}>
      <div style={{ fontWeight: 600 }}>{up ? '+' : ''}{change.toFixed(2)}</div>
      <div style={{ fontSize: 11 }}>{up ? '+' : ''}{changePct.toFixed(2)}%</div>
    </div>
  )
}

function GLCell({ value, pct }) {
  if (value === null || value === undefined) return <Dash />
  const up = value >= 0
  const color = value === 0 ? 'var(--text-muted)' : up ? 'var(--green)' : 'var(--red)'
  return (
    <div style={{ color }}>
      <div style={{ fontWeight: 600 }}>{fmtGL$(value)}</div>
      {pct !== null && pct !== undefined && (
        <div style={{ fontSize: 11 }}>{up ? '+' : ''}{pct.toFixed(2)}%</div>
      )}
    </div>
  )
}

function SummaryCard({ label, value, pct, signed }) {
  const isNeg = signed && typeof value === 'string' && value.startsWith('-')
  const isPos = signed && typeof value === 'string' && value.startsWith('+')
  const color = isPos ? 'var(--green)' : isNeg ? 'var(--red)' : undefined
  return (
    <div className="card">
      <div className="card-label">{label}</div>
      <div className="card-value" style={color ? { color } : {}}>{value}</div>
      {pct && <div className="card-sub" style={color ? { color } : {}}>{pct}</div>}
    </div>
  )
}

// ── Formatters ────────────────────────────────────────────────────────────────
function fmt$(n) {
  if (n === null || n === undefined || isNaN(n)) return '—'
  return '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtGL$(n) {
  if (n === null || n === undefined || isNaN(n)) return '—'
  const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return (n >= 0 ? '+$' : '-$') + abs
}

function fmtPct(n) {
  if (n === null || n === undefined || isNaN(n)) return null
  return (n >= 0 ? '+' : '') + n.toFixed(2) + '%'
}
