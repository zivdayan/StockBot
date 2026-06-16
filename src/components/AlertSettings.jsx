import { useState, useEffect, useRef } from 'react'
import { getSettings, saveSettings, triggerBrief } from '../api/client.js'
import { getTelegramChats } from '../api/client.js'

const DEFAULTS = {
  stockAlertThresholdPct: 2,
  portfolioAlertThresholdPct: 1,
  telegramRecipients: [],
  dailySummaryHour: 17,
}

const TYPE_ICON = { private: '👤', group: '👥', supergroup: '👥', channel: '📢' }

// ── Chat list picker ──────────────────────────────────────────────────────────
function ChatPicker({ recipients, onAdd, onRemove }) {
  const [open, setOpen] = useState(false)
  const [chats, setChats] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const dropRef = useRef()

  // Close on outside click
  useEffect(() => {
    function handler(e) {
      if (!dropRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  async function loadChats() {
    setLoading(true); setError(null); setOpen(true)
    try {
      const data = await getTelegramChats()
      if (data.error) throw new Error(data.error)
      setChats(data.chats)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function toggle(chat) {
    const isActive = recipients.some(r => r.chatId === chat.chatId)
    if (isActive) {
      onRemove(chat.chatId)
    } else {
      onAdd({ name: chat.name, chatId: chat.chatId })
    }
  }

  return (
    <div ref={dropRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className="btn secondary"
        onClick={open ? () => setOpen(false) : loadChats}
        style={{ width: '100%', justifyContent: 'center', gap: 8 }}
      >
        {loading
          ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Loading chats…</>
          : open
          ? '▲ Close chat list'
          : '💬 Select from Telegram chats'}
      </button>

      {error && <div className="banner error" style={{ marginTop: 8 }}>{error}</div>}

      {open && !loading && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 50,
          background: 'var(--surface2)', border: '1px solid var(--border)',
          borderRadius: 10, overflow: 'hidden',
          boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
        }}>
          {chats.length === 0 ? (
            <div style={{ padding: '20px 16px', color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>
              No chats found. Make sure someone has messaged your bot first.
            </div>
          ) : chats.map((chat, i) => {
            const active = recipients.some(r => r.chatId === chat.chatId)
            return (
              <div
                key={chat.chatId}
                onClick={() => toggle(chat)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 16px', cursor: 'pointer',
                  background: active ? 'rgba(59,130,246,0.12)' : 'transparent',
                  borderTop: i > 0 ? '1px solid var(--border)' : 'none',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--surface)' }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
              >
                <span style={{ fontSize: 20 }}>{TYPE_ICON[chat.type] ?? '💬'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{chat.name}</div>
                  {chat.username && (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>@{chat.username}</div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{chat.chatId}</span>
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%',
                    border: `2px solid ${active ? 'var(--blue)' : 'var(--border)'}`,
                    background: active ? 'var(--blue)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, color: '#fff', flexShrink: 0,
                  }}>
                    {active && '✓'}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AlertSettings() {
  const [form, setForm] = useState(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)
  const [briefing, setBriefing] = useState(false)
  const [briefMsg, setBriefMsg] = useState(null)

  async function handleBrief() {
    setBriefing(true); setBriefMsg(null)
    try {
      const res = await triggerBrief()
      setBriefMsg(res.ok
        ? { ok: true, text: `Brief sent to ${res.recipients} recipient${res.recipients !== 1 ? 's' : ''}.` }
        : { ok: false, text: res.error || 'Brief failed — check recipients and bot token.' })
    } catch (err) {
      setBriefMsg({ ok: false, text: err.message })
    } finally {
      setBriefing(false)
    }
  }

  useEffect(() => {
    getSettings()
      .then(s => setForm({ ...DEFAULTS, ...s }))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const setField = (field) => (e) => {
    setForm(f => ({ ...f, [field]: e.target.value }))
    setError(null); setSuccess(false)
  }

  function addRecipient(contact) {
    if (form.telegramRecipients.some(r => r.chatId === contact.chatId)) return
    setForm(f => ({ ...f, telegramRecipients: [...f.telegramRecipients, contact] }))
    setError(null); setSuccess(false)
  }

  function removeRecipient(chatId) {
    setForm(f => ({ ...f, telegramRecipients: f.telegramRecipients.filter(r => r.chatId !== chatId) }))
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
            Everyone listed gets all alerts and the daily summary.
          </div>

          {/* Active recipients */}
          {form.telegramRecipients.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              {form.telegramRecipients.map((r) => (
                <div key={r.chatId} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)',
                  borderRadius: 8, padding: '9px 12px', marginBottom: 6,
                }}>
                  <span style={{ flex: 1, fontWeight: 600 }}>{r.name}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{r.chatId}</span>
                  <button type="button" className="delete-btn" onClick={() => removeRecipient(r.chatId)}>✕</button>
                </div>
              ))}
            </div>
          )}

          {/* Chat picker */}
          <ChatPicker
            recipients={form.telegramRecipients}
            onAdd={addRecipient}
            onRemove={removeRecipient}
          />

          <div className="btn-row" style={{ marginTop: 24 }}>
            <button className="btn" type="submit" disabled={saving}>
              {saving ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Saving…</> : 'Save Settings'}
            </button>
            <button className="btn secondary" type="button" onClick={handleBrief}
              disabled={briefing || form.telegramRecipients.length === 0}
              title={form.telegramRecipients.length === 0 ? 'Add a recipient first' : 'Send a briefing to all recipients now'}>
              {briefing ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Sending…</> : '📨 Trigger Brief'}
            </button>
          </div>
          {briefMsg && (
            <div className={`banner ${briefMsg.ok ? 'success' : 'error'}`} style={{ marginTop: 12 }}>
              {briefMsg.text}
            </div>
          )}
        </form>
      </div>

      {/* Setup guide */}
      <div className="form-card" style={{ background: 'transparent', border: '1px solid var(--border)' }}>
        <h2>Setup Guide</h2>
        <div style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.8 }}>
          <p><strong style={{ color: 'var(--text)' }}>1. Create a bot</strong><br />
          Message <strong>@BotFather</strong> → /newbot → copy token → add as <code>TELEGRAM_BOT_TOKEN</code> GitHub secret</p>
          <br />
          <p><strong style={{ color: 'var(--text)' }}>2. People must message the bot first</strong><br />
          Each person opens a chat with your bot and sends any message. This makes them appear in the "Select from Telegram chats" list.</p>
          <br />
          <p><strong style={{ color: 'var(--text)' }}>3. Pick recipients</strong><br />
          Click <em>"Select from Telegram chats"</em> — your bot's chat list loads live. Toggle each person on/off, then Save.</p>
        </div>
      </div>
    </div>
  )
}
