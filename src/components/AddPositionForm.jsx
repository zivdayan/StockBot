import { useState } from 'react'
import { addPosition } from '../api/client.js'

export default function AddPositionForm({ onAdded }) {
  const [form, setForm] = useState({ ticker: '', shares: '', avg_cost: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  const set = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }))
    setError(null)
    setSuccess(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const ticker = form.ticker.trim().toUpperCase()
    const shares = parseFloat(form.shares)
    const avg_cost = parseFloat(form.avg_cost)

    if (!ticker) return setError('Ticker symbol is required.')
    if (!shares || shares <= 0) return setError('Shares must be a positive number.')
    if (!avg_cost || avg_cost <= 0) return setError('Average cost must be a positive number.')

    setLoading(true)
    setError(null)
    try {
      await addPosition({ ticker, shares, avg_cost })
      setForm({ ticker: '', shares: '', avg_cost: '' })
      setSuccess(true)
      onAdded()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="form-card">
      <h2>Add / Update Position</h2>

      {error && <div className="banner error">{error}</div>}
      {success && <div className="banner success">Position saved successfully.</div>}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Ticker Symbol</label>
          <input
            type="text"
            placeholder="e.g. AAPL"
            value={form.ticker}
            onChange={set('ticker')}
            autoCapitalize="characters"
          />
          <div className="form-hint">Yahoo Finance ticker (e.g. AAPL, GOOG, BTC-USD)</div>
        </div>

        <div className="form-group">
          <label>Number of Shares</label>
          <input
            type="number"
            placeholder="e.g. 10"
            min="0.0001"
            step="any"
            value={form.shares}
            onChange={set('shares')}
          />
        </div>

        <div className="form-group">
          <label>Average Cost Per Share ($)</label>
          <input
            type="number"
            placeholder="e.g. 150.00"
            min="0.0001"
            step="any"
            value={form.avg_cost}
            onChange={set('avg_cost')}
          />
          <div className="form-hint">Your average purchase price per share</div>
        </div>

        <div className="btn-row">
          <button className="btn" type="submit" disabled={loading}>
            {loading ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Saving…</> : 'Save Position'}
          </button>
        </div>
      </form>
    </div>
  )
}
