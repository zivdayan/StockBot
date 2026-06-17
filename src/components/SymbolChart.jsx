import { useState, useEffect } from 'react'
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine, CartesianGrid,
} from 'recharts'
import { getHistory } from '../api/client.js'

const RANGES = ['1M', '6M', '1Y', 'ALL']

export default function SymbolChart({ position, price, onClose }) {
  const [range, setRange] = useState('1Y')
  const [points, setPoints] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const cost = position.avg_cost
  const last = price?.currentPrice ?? null
  const up = last != null && last >= cost
  const color = up ? 'var(--green)' : 'var(--red)'
  const unreal = last != null ? (last - cost) * position.shares : null
  const unrealPct = last != null ? ((last - cost) / cost) * 100 : null

  useEffect(() => {
    let active = true
    setLoading(true); setError(null)
    getHistory(position.ticker, range)
      .then(d => { if (active) setPoints(d.points || []) })
      .catch(e => { if (active) setError(e.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [position.ticker, range])

  // Close on Escape
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const fmtDate = (t) => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: range === 'ALL' || range === '1Y' ? '2-digit' : undefined })

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span className="ticker" style={{ fontSize: 20 }}>{position.ticker}</span>
              {last != null && <span style={{ fontWeight: 700, fontSize: 18 }}>${last.toFixed(2)}</span>}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
              {position.shares} sh · avg cost ${cost.toFixed(2)}
              {unreal != null && (
                <span style={{ color, fontWeight: 600, marginLeft: 8 }}>
                  {unreal >= 0 ? '+' : '−'}${Math.abs(unreal).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({unrealPct >= 0 ? '+' : ''}{unrealPct.toFixed(2)}%)
                </span>
              )}
            </div>
          </div>
          <button className="modal-close" onClick={onClose} title="Close">✕</button>
        </div>

        <div className="range-row">
          {RANGES.map(r => (
            <button key={r} className={`range-btn${range === r ? ' active' : ''}`} onClick={() => setRange(r)}>{r}</button>
          ))}
        </div>

        <div className="chart-area">
          {loading ? (
            <div className="loading-row"><span className="spinner" /> Loading {position.ticker}…</div>
          ) : error ? (
            <div className="banner error">{error}</div>
          ) : (
            <ResponsiveContainer width="100%" height={340}>
              <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="t" tickFormatter={fmtDate} minTickGap={48}
                  tick={{ fill: 'var(--text-muted)', fontSize: 11 }} stroke="var(--border)" />
                <YAxis domain={['auto', 'auto']} width={56} tickFormatter={(v) => `$${v}`}
                  tick={{ fill: 'var(--text-muted)', fontSize: 11 }} stroke="var(--border)" />
                <Tooltip
                  contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                  labelFormatter={(t) => new Date(t).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                  formatter={(v) => [`$${Number(v).toFixed(2)}`, 'Close']} />
                <ReferenceLine y={cost} stroke="var(--text-muted)" strokeDasharray="5 4"
                  label={{ value: `cost $${cost.toFixed(2)}`, fill: 'var(--text-muted)', fontSize: 11, position: 'insideTopLeft' }} />
                <Area type="monotone" dataKey="close" stroke={color} strokeWidth={2} fill="url(#fill)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  )
}
