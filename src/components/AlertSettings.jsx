import { useState, useEffect } from 'react'
import { getSettings, saveSettings } from '../api/client.js'

const DEFAULTS = {
  stockAlertThresholdPct: 2,
  portfolioAlertThresholdPct: 1,
  telegramRecipients: [],
  dailySummaryHour: 17,
}

export default function AlertSettings() {
  const [form, setForm] = useState(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)
  const [newRecipient, setNewRecipient] = useState({ name: '', chatId: '' })

  useEffect(() => {
    getSettings()
      .then((s) => setForm({ ...DEFAULTS, ...s }))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const setField = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }))
    setError(null); setSuccess(false)
  }

  function addRecipient() {
    const name = newRecipient.name.trim() || 'Unnamed'
    const chatId = newRecipient.chatId.trim()
    if (!chatId) return
    setForm((f) => ({
      ...f,
      telegramRecipients: [...f.telegramRecipients, { name, chatId }],
    }))
    setNewRecipient({ name: '', chatId: '' })
    setError(null); setSuccess(false)
  }

  function removeRecipient(idx) {
    setForm((f) => ({
      ...f,
      telegramRecipients: f.telegramRecipients.filter((_, i) => i !== idx),
    }))
    setError(null); setSuccess(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true); setError(null)
    try {
      await saveSettings({
        stockAlertThresholdPct: parseFloat(form.stockAlertThresholdPct),
        portfolioAlertThresholdPct: parseFloat(form.portfolioAlertThresholdPct),
        telegramRecipients: form.telegramRecipients,
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
    return <div className="loading-row"><span className="spinner" /> Loading settings…</div>
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
            <input type="number" min="0.1" step="0.1"
              value={form.stockAlertThresholdPct} onChange={setField('stockAlertThresholdPct')} />
            <div className="form-hint">Alert when a single stock moves ±X% since last check</div>
          </div>

          <div className="form-group">
            <label>Portfolio Alert Threshold (%)</label>
            <input type="number" min="0.1" step="0.1"
              value={form.portfolioAlertThresholdPct} onChange={setField('portfolioAlertThresholdPct')} />
            <div className="form-hint">Alert when total portfolio value moves ±X%</div>
          </div>

          <div className="form-group">
            <label>Daily Summary Hour (UTC, 0–23)</label>
            <input type="number" min="0" max="23" step="1"
              value={form.dailySummaryHour} onChange={setField('dailySummaryHour')} />
          </div>

          <p className="section-title" style={{ marginTop: 24 }}>Telegram Recipients</p>
          <div className="form-hint" style={{ marginBottom: 12 }}>
            All listed recipients will receive every alert and daily summary.
          </div>

          {/* Recipient list */}
          {form.telegramRecipients.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              {form.telegramRecipients.map((r, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: 'var(--bg)', border: '1px solid var(--border)',
                  borderRadius: 8, padding: '8px 12px', marginBottom: 8,
                }}>
                  <span style={{ flex: 1, fontWeight: 600 }}>{r.name}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{r.chatId}</span>
                  <button type="button" className="delete-btn" onClick={() => removeRecipient(i)}>✕</button>
                </div>
              ))}
            </div>
          )}

          {form.telegramRecipients.length === 0 && (
            <div className="banner info" style={{ marginBottom: 12 }}>No recipients yet — add one below.</div>
          )}

          {/* Add new recipient */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, marginBottom: 20 }}>
            <input
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '9px 12px', fontSize: 14, outline: 'none' }}
              placeholder="Name (e.g. Ziv)"
              value={newRecipient.name}
              onChange={e => setNewRecipient(r => ({ ...r, name: e.target.value }))}
            />
            <input
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '9px 12px', fontSize: 14, outline: 'none' }}
              placeholder="Chat ID (e.g. 123456789)"
              value={newRecipient.chatId}
              onChange={e => setNewRecipient(r => ({ ...r, chatId: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addRecipient())}
            />
            <button type="button" className="btn secondary" onClick={addRecipient} style={{ whiteSpace: 'nowrap' }}>
              + Add
            </button>
          </div>

          <div className="btn-row">
            <button className="btn" type="submit" disabled={saving}>
              {saving ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Saving…</> : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>

      {/* Setup guide */}
      <div className="form-card" style={{ background: 'transparent', border: '1px solid var(--border)' }}>
        <h2>Setup Guide</h2>
        <div style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.8 }}>
          <p><strong style={{ color: 'var(--text)' }}>1. Create a bot</strong><br />
          Message <strong>@BotFather</strong> → /newbot → copy token → add as <code>TELEGRAM_BOT_TOKEN</code> GitHub secret</p>
          <br />
          <p><strong style={{ color: 'var(--text)' }}>2. Get a chat ID</strong><br />
          Start a chat with your bot, then message <strong>@userinfobot</strong> — it replies with your numeric ID.<br />
          For a group: add the bot to the group, send a message, then check<br />
          <code>https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates</code></p>
          <br />
          <p><strong style={{ color: 'var(--text)' }}>3. Add multiple people</strong><br />
          Each person messages your bot first (required), gets their ID from @userinfobot, and you add them here.</p>
        </div>
      </div>
    </div>
  )
}
