import { useState, useEffect, useRef } from 'react'
import { getSettings, saveSettings } from '../api/client.js'

const DEFAULTS = {
  stockAlertThresholdPct: 2,
  portfolioAlertThresholdPct: 1,
  telegramRecipients: [],
  telegramContacts: [],
  dailySummaryHour: 17,
}

// ── Autocomplete picker ────────────────────────────────────────────────────────
function ContactPicker({ contacts, onAdd }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [newChatId, setNewChatId] = useState('')
  const [addingNew, setAddingNew] = useState(false)
  const wrapperRef = useRef()

  // Close dropdown when clicking outside
  useEffect(() => {
    function handler(e) {
      if (!wrapperRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = contacts.filter(c =>
    c.name.toLowerCase().includes(query.toLowerCase()) ||
    c.chatId.includes(query)
  )

  function selectContact(c) {
    onAdd({ name: c.name, chatId: c.chatId })
    setQuery('')
    setOpen(false)
  }

  function addManual() {
    const name = query.trim() || 'Unnamed'
    const chatId = newChatId.trim()
    if (!chatId) return
    onAdd({ name, chatId })
    setQuery('')
    setNewChatId('')
    setAddingNew(false)
    setOpen(false)
  }

  return (
    <div ref={wrapperRef} style={{ position: 'relative', marginBottom: 12 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          style={inputStyle}
          placeholder="Search contacts by name or chat ID…"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); setAddingNew(false) }}
          onFocus={() => setOpen(true)}
          onKeyDown={e => {
            if (e.key === 'Escape') { setOpen(false); setAddingNew(false) }
            if (e.key === 'Enter') {
              e.preventDefault()
              if (filtered.length === 1) selectContact(filtered[0])
            }
          }}
        />
      </div>

      {open && (query || contacts.length > 0) && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
          background: 'var(--surface2)', border: '1px solid var(--border)',
          borderRadius: 8, marginTop: 4, overflow: 'hidden',
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}>
          {filtered.length > 0 && filtered.map((c, i) => (
            <div key={i}
              onMouseDown={() => selectContact(c)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px', cursor: 'pointer',
                borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{c.name}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{c.chatId}</span>
            </div>
          ))}

          {/* Option to add someone not in contacts */}
          {query && (
            <div
              onMouseDown={(e) => { e.preventDefault(); setAddingNew(true); setOpen(false) }}
              style={{
                padding: '10px 14px', cursor: 'pointer', color: 'var(--blue)',
                fontSize: 13, fontWeight: 600,
                borderTop: filtered.length > 0 ? '1px solid var(--border)' : 'none',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              + Add "{query}" as new contact…
            </div>
          )}

          {!query && contacts.length === 0 && (
            <div style={{ padding: '12px 14px', color: 'var(--text-muted)', fontSize: 13 }}>
              No contacts yet — type a name below to add one.
            </div>
          )}
        </div>
      )}

      {/* Inline form for adding a brand-new contact */}
      {addingNew && (
        <div style={{
          marginTop: 8, background: 'var(--bg)', border: '1px solid var(--blue)',
          borderRadius: 8, padding: '12px 14px',
        }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
            New contact: <strong style={{ color: 'var(--text)' }}>{query}</strong>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              style={{ ...inputStyle, flex: 1 }}
              placeholder="Chat ID (e.g. 123456789)"
              value={newChatId}
              onChange={e => setNewChatId(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addManual())}
              autoFocus
            />
            <button type="button" className="btn" onClick={addManual}
              style={{ padding: '9px 16px', fontSize: 13 }}>Add</button>
            <button type="button" className="btn secondary" onClick={() => setAddingNew(false)}
              style={{ padding: '9px 16px', fontSize: 13 }}>✕</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Contacts manager ──────────────────────────────────────────────────────────
function ContactsManager({ contacts, onChange }) {
  const [newContact, setNewContact] = useState({ name: '', chatId: '' })

  function add() {
    const name = newContact.name.trim()
    const chatId = newContact.chatId.trim()
    if (!name || !chatId) return
    onChange([...contacts, { name, chatId }])
    setNewContact({ name: '', chatId: '' })
  }

  function remove(idx) {
    onChange(contacts.filter((_, i) => i !== idx))
  }

  return (
    <div>
      {contacts.map((c, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'var(--bg)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '8px 12px', marginBottom: 8,
        }}>
          <span style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{c.name}</span>
          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{c.chatId}</span>
          <button type="button" className="delete-btn" onClick={() => remove(i)}>✕</button>
        </div>
      ))}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input style={inputStyle} placeholder="Name (e.g. Ziv)"
          value={newContact.name}
          onChange={e => setNewContact(c => ({ ...c, name: e.target.value }))} />
        <div style={{ display: 'flex', gap: 8 }}>
          <input style={{ ...inputStyle, flex: 1 }} placeholder="Chat ID (e.g. 123456789)"
            value={newContact.chatId}
            onChange={e => setNewContact(c => ({ ...c, chatId: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), add())} />
          <button type="button" className="btn secondary" onClick={add}
            style={{ whiteSpace: 'nowrap', padding: '9px 16px' }}>+ Add</button>
        </div>
      </div>
    </div>
  )
}

// ── Shared input style ────────────────────────────────────────────────────────
const inputStyle = {
  width: '100%',
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  color: 'var(--text)',
  padding: '9px 12px',
  fontSize: 14,
  outline: 'none',
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AlertSettings() {
  const [form, setForm] = useState(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)
  const [section, setSection] = useState('alerts') // 'alerts' | 'contacts'

  useEffect(() => {
    getSettings()
      .then((s) => setForm({ ...DEFAULTS, ...s }))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const setField = (field) => (e) => {
    setForm(f => ({ ...f, [field]: e.target.value }))
    setError(null); setSuccess(false)
  }

  function addRecipient(contact) {
    // Don't add duplicates
    if (form.telegramRecipients.some(r => r.chatId === contact.chatId)) return
    // Also add to contacts if not already there
    const inContacts = form.telegramContacts.some(c => c.chatId === contact.chatId)
    setForm(f => ({
      ...f,
      telegramRecipients: [...f.telegramRecipients, contact],
      telegramContacts: inContacts ? f.telegramContacts : [...f.telegramContacts, contact],
    }))
    setError(null); setSuccess(false)
  }

  function removeRecipient(idx) {
    setForm(f => ({ ...f, telegramRecipients: f.telegramRecipients.filter((_, i) => i !== idx) }))
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
        telegramContacts: form.telegramContacts,
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

        {/* Sub-tabs */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 24, borderBottom: '1px solid var(--border)' }}>
          {[['alerts', 'Alerts & Recipients'], ['contacts', 'Manage Contacts']].map(([id, label]) => (
            <button key={id} type="button" onClick={() => setSection(id)} style={{
              background: 'none', border: 'none', color: section === id ? 'var(--blue)' : 'var(--text-muted)',
              padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              borderBottom: `2px solid ${section === id ? 'var(--blue)' : 'transparent'}`,
              marginBottom: -1,
            }}>{label}</button>
          ))}
        </div>

        {error && <div className="banner error">{error}</div>}
        {success && <div className="banner success">Settings saved.</div>}

        <form onSubmit={handleSubmit}>
          {section === 'alerts' && (
            <>
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

              <p className="section-title" style={{ marginTop: 24 }}>Recipients</p>
              <div className="form-hint" style={{ marginBottom: 12 }}>
                All recipients get every alert. Pick from your contacts or type to add new.
              </div>

              {/* Active recipients */}
              {form.telegramRecipients.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  {form.telegramRecipients.map((r, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)',
                      borderRadius: 8, padding: '8px 12px', marginBottom: 6,
                    }}>
                      <span style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{r.name}</span>
                      <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{r.chatId}</span>
                      <button type="button" className="delete-btn" onClick={() => removeRecipient(i)}>✕</button>
                    </div>
                  ))}
                </div>
              )}

              {form.telegramRecipients.length === 0 && (
                <div className="banner info" style={{ marginBottom: 12 }}>No recipients yet.</div>
              )}

              <ContactPicker
                contacts={form.telegramContacts}
                onAdd={addRecipient}
              />
            </>
          )}

          {section === 'contacts' && (
            <>
              <p className="section-title">Contacts Address Book</p>
              <div className="form-hint" style={{ marginBottom: 16 }}>
                Save people here so you can quickly add them as recipients.
              </div>
              <ContactsManager
                contacts={form.telegramContacts}
                onChange={(contacts) => setForm(f => ({ ...f, telegramContacts: contacts }))}
              />
            </>
          )}

          <div className="btn-row" style={{ marginTop: 24 }}>
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
          Start a chat with your bot, then message <strong>@userinfobot</strong> — it replies with your ID.<br />
          For a group: add the bot, send a message, check<br />
          <code style={{ fontSize: 11 }}>api.telegram.org/bot&lt;TOKEN&gt;/getUpdates</code></p>
          <br />
          <p><strong style={{ color: 'var(--text)' }}>3. Add contacts, then recipients</strong><br />
          Add people to <em>Contacts</em> first, then pick them in <em>Alerts &amp; Recipients</em> via the autocomplete.</p>
        </div>
      </div>
    </div>
  )
}
