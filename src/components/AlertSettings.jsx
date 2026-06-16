import { useState, useEffect } from 'react'
import { getSettings, saveSettings } from '../api/client.js'

const DEFAULTS = {
  stockAlertThresholdPct: 2,
  portfolioAlertThresholdPct: 1,
  telegramChatId: '',
  dailySummaryHour: 17,
}

export default function AlertSettings() {
  const [form, setForm] = useState(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    getSettings()
      .then((s) => setForm({ ...DEFAULTS, ...s }))
      .catch(() => {}) // use defaults if not set yet
      .finally(() => setLoading(false))
  }, [])

  const set = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }))
    setError(null)
    setSuccess(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await saveSettings({
        stockAlertThresholdPct: parseFloat(form.stockAlertThresholdPct),
        portfolioAlertThresholdPct: parseFloat(form.portfolioAlertThresholdPct),
        telegramChatId: form.telegramChatId.trim(),
        dailySummaryHour: parseInt(form.dailySummaryHour, 10),
      })
      setSuccess(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="loading-row">
        <span className="spinner" /> Loading settings…
      </div>
    )
  }

  return (
    <div className="settings-grid">
      <div className="form-card">
        <h2>Alert Settings</h2>

        {error && <div className="banner error">{error}</div>}
        {success && <div className="banner success">Settings saved.</div>}

        <form onSubmit={handleSubmit}>
          <p className="section-title">Thresholds</p>

          <div className="form-group">
            <label>Per-Stock Alert Threshold (%)</label>
            <input
              type="number"
              min="0.1"
              step="0.1"
              value={form.stockAlertThresholdPct}
              onChange={set('stockAlertThresholdPct')}
            />
            <div className="form-hint">Alert when a single stock moves ±X% since last check</div>
          </div>

          <div className="form-group">
            <label>Portfolio Alert Threshold (%)</label>
            <input
              type="number"
              min="0.1"
              step="0.1"
              value={form.portfolioAlertThresholdPct}
              onChange={set('portfolioAlertThresholdPct')}
            />
            <div className="form-hint">Alert when total portfolio value moves ±X% since last check</div>
          </div>

          <div className="form-group">
            <label>Daily Summary Hour (0–23, your local time)</label>
            <input
              type="number"
              min="0"
              max="23"
              step="1"
              value={form.dailySummaryHour}
              onChange={set('dailySummaryHour')}
            />
            <div className="form-hint">Send a full P&L summary at this hour each day (uses server UTC — adjust accordingly)</div>
          </div>

          <p className="section-title" style={{ marginTop: 24 }}>Telegram</p>

          <div className="form-group">
            <label>Telegram Chat ID</label>
            <input
              type="text"
              placeholder="e.g. 123456789"
              value={form.telegramChatId}
              onChange={set('telegramChatId')}
            />
            <div className="form-hint">
              Get your chat ID by messaging <strong>@userinfobot</strong> on Telegram, or start a chat with your bot and use <code>/getUpdates</code>
            </div>
          </div>

          <div className="btn-row">
            <button className="btn" type="submit" disabled={saving}>
              {saving ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Saving…</> : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>

      <div className="form-card" style={{ background: 'transparent', border: '1px solid var(--border)' }}>
        <h2>Setup Guide</h2>
        <div style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.7 }}>
          <p><strong style={{ color: 'var(--text)' }}>1. Create a Telegram bot</strong><br />
          Message <strong>@BotFather</strong> → /newbot → copy the token</p>
          <br />
          <p><strong style={{ color: 'var(--text)' }}>2. Set env vars in Netlify</strong><br />
          Site Settings → Environment Variables:<br />
          <code>TELEGRAM_BOT_TOKEN</code> = your bot token<br />
          <code>ALERT_SECRET</code> = any random string</p>
          <br />
          <p><strong style={{ color: 'var(--text)' }}>3. Set up GitLab schedule</strong><br />
          CI/CD → Schedules → New schedule<br />
          Cron: <code>0 * * * *</code> (every hour)<br />
          Variables: <code>NETLIFY_SITE_URL</code>, <code>ALERT_SECRET</code></p>
          <br />
          <p><strong style={{ color: 'var(--text)' }}>4. Get your chat ID</strong><br />
          Start a chat with your bot, then message <strong>@userinfobot</strong></p>
        </div>
      </div>
    </div>
  )
}
