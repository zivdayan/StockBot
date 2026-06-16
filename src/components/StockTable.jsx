export default function StockTable({ positions, prices, onDelete }) {
  if (!positions.length) {
    return (
      <div className="table-wrapper">
        <div className="empty">
          <div style={{ fontSize: 40 }}>📭</div>
          <p>No positions yet. Add your first stock in the Portfolio tab.</p>
        </div>
      </div>
    )
  }

  let totalInvested = 0
  let totalCurrent = 0

  const rows = positions.map((pos) => {
    const quote = prices[pos.ticker]
    const currentPrice = quote?.currentPrice ?? null
    const invested = pos.shares * pos.avg_cost
    const current = currentPrice !== null ? pos.shares * currentPrice : null
    const pnl = current !== null ? current - invested : null
    const pnlPct = pnl !== null ? (pnl / invested) * 100 : null
    const dayChange = quote?.changePercent ?? null

    if (current !== null) totalCurrent += current
    totalInvested += invested

    return { pos, quote, currentPrice, invested, current, pnl, pnlPct, dayChange }
  })

  const totalPnl = totalCurrent - totalInvested
  const totalPnlPct = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0

  return (
    <div>
      <div className="summary-grid" style={{ marginBottom: 20 }}>
        <SummaryCard label="Total Invested" value={`$${totalInvested.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
        <SummaryCard label="Current Value" value={`$${totalCurrent.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
        <SummaryCard
          label="Total P&L"
          value={`${totalPnl >= 0 ? '+' : ''}$${totalPnl.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          valueClass={totalPnl >= 0 ? 'green' : 'red'}
          sub={`${totalPnlPct >= 0 ? '+' : ''}${totalPnlPct.toFixed(2)}%`}
        />
      </div>

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Ticker</th>
              <th className="right">Price</th>
              <th className="right">Day Change</th>
              <th className="right">Shares</th>
              <th className="right">Avg Cost</th>
              <th className="right">Value</th>
              <th className="right">P&amp;L</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ pos, currentPrice, invested, current, pnl, pnlPct, dayChange }) => {
              const badgeClass = dayChange === null ? 'flat' : dayChange >= 0 ? 'up' : 'down'
              const pnlClass = pnl === null ? '' : pnl >= 0 ? 'green' : 'red'
              return (
                <tr key={pos.ticker}>
                  <td>
                    <div className="ticker">{pos.ticker}</div>
                    <div className="shares-cost">{pos.shares} sh @ ${pos.avg_cost.toFixed(2)}</div>
                  </td>
                  <td className="right">
                    <div className="price-main">
                      {currentPrice !== null ? `$${currentPrice.toFixed(2)}` : '—'}
                    </div>
                  </td>
                  <td className="right">
                    {dayChange !== null ? (
                      <span className={`change-badge ${badgeClass}`}>
                        {dayChange >= 0 ? '+' : ''}{dayChange.toFixed(2)}%
                      </span>
                    ) : <span className="change-badge flat">—</span>}
                  </td>
                  <td className="right">{pos.shares}</td>
                  <td className="right">${pos.avg_cost.toFixed(2)}</td>
                  <td className="right">
                    {current !== null ? `$${current.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                  </td>
                  <td className="right">
                    {pnl !== null ? (
                      <div>
                        <div className={`pnl-value ${pnlClass}`}>
                          {pnl >= 0 ? '+' : ''}${pnl.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div className={`pnl-value ${pnlClass}`} style={{ fontSize: 12 }}>
                          {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%
                        </div>
                      </div>
                    ) : '—'}
                  </td>
                  <td>
                    <button
                      className="delete-btn"
                      title="Remove position"
                      onClick={() => onDelete(pos.ticker)}
                    >✕</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SummaryCard({ label, value, valueClass, sub }) {
  return (
    <div className="card">
      <div className="card-label">{label}</div>
      <div className={`card-value${valueClass ? ` ${valueClass}` : ''}`}>{value}</div>
      {sub && <div className="card-sub">{sub}</div>}
    </div>
  )
}
