import { useState, useEffect, useCallback } from 'react'
import { getSettings, saveSettings, getNotifications, clearNotifications } from '../api/client.js'

const TYPES = [
  { key: 'brief', label: 'Pre-market / manual brief' },
  { key: 'aiBrief', label: 'Daily AI brief' },
  { key: 'alerts', label: 'Price / portfolio alerts' },
  { key: 'dailySummary', label: 'Daily P&L summary' },
]
const KIND_LABEL = { brief: 'Brief', aiBrief: 'AI Brief', alerts: 'Alert', dailySummary: 'Summary' }
const STATUS = {
  sent: { label: 'Sent', color: 'var(--green)' },
  skipped: { label: 'Skipped', color: 'var(--text-muted)' },
  failed: { label: 'Failed', color: 'var(--red)' },
  partial: { label: 'Partial', color: 'var(--yellow)' },
}

function Toggle({ on, onChange, disabled }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled}
      onClick={() => onChange(!on)}
      className={`toggle${on ? ' on' : ''}`} style={{ opacity: disabled ? 0.5 : 1 }}>
      <span className="toggle-knob" />
    </button>
  )
}

export default function Notifications() {
  const [settings, setSettings] = useState(null)
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)

  const loadLog = useCallback(async () => {
    try { setEntries((await getNotifications()).entries || []) } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    Promise.all([getSettings(), getNotifications()])
      .then(([s, n]) => { setSettings(s); setEntries(n.entries || []) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Optimistic save of a settings patch
  async function patch(p) {
    const next = { ...settings, ...p }
    setSettings(next)
    try { await saveSettings(p) } catch { /* revert on failure */ getSettings().then(setSettings) }
  }

  const setType = (key, val) => patch({ notifyTypes: { ...(settings.notifyTypes || {}), [key]: val } })

  async function handleClear() {
    if (!confirm('Clear the notification log?')) return
    await clearNotifications()
    setEntries([])
  }

  if (loading || !settings) {
    return <div className="loading-row"><span className="spinner" /> Loading notifications…</div>
  }

  const muted = !!settings.telegramMuted
  const types = settings.notifyTypes || {}

  return (
    <div style={{ maxWidth: 820 }}>
      {/* Controls */}
      <div className="form-card" style={{ marginBottom: 20 }}>
        <h2>Notification Controls</h2>

        <div className="notif-row" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 14, marginBottom: 6 }}>
          <div>
            <div style={{ fontWeight: 600 }}>🔕 Pause all Telegram notifications</div>
            <div className="form-hint">Master switch — when on, nothing is sent (still logged as skipped).</div>
          </div>
          <Toggle on={muted} onChange={(v) => patch({ telegramMuted: v })} />
        </div>

        {TYPES.map(t => (
          <div className="notif-row" key={t.key}>
            <div style={{ color: muted ? 'var(--text-muted)' : 'var(--text)' }}>{t.label}</div>
            <Toggle on={types[t.key] !== false} disabled={muted} onChange={(v) => setType(t.key, v)} />
          </div>
        ))}
      </div>

      {/* Log */}
      <div className="form-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <h2 style={{ margin: 0 }}>Sent Notifications</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn secondary" onClick={loadLog}>Refresh</button>
            <button className="btn secondary" onClick={handleClear} disabled={!entries.length}>Clear</button>
          </div>
        </div>
        <div className="form-hint" style={{ marginBottom: 14 }}>Last {entries.length} notifications (newest first).</div>

        {!entries.length && <div className="ai-meta">No notifications logged yet.</div>}

        {entries.map(e => {
          const st = STATUS[e.status] || { label: e.status, color: 'var(--text-muted)' }
          const ok = (e.recipients || []).filter(r => r.ok).length
          const isOpen = expanded === e.id
          const body = (e.text || '').replace(/<[^>]+>/g, '')
          return (
            <div key={e.id} className="notif-entry">
              <div className="notif-entry-head" onClick={() => setExpanded(isOpen ? null : e.id)}>
                <span className="badge">{KIND_LABEL[e.kind] || e.kind}</span>
                <span className="badge badge-dim">{e.trigger === 'cron' ? '⏱ cron' : '👆 manual'}</span>
                <span style={{ color: st.color, fontWeight: 600, fontSize: 12 }}>
                  {st.label}{e.status === 'skipped' && e.reason ? ` · ${e.reason}` : ''}
                </span>
                <span style={{ flex: 1 }} />
                {e.status === 'sent' && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{ok} recipient{ok !== 1 ? 's' : ''}</span>}
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{new Date(e.ts).toLocaleString()}</span>
              </div>
              <div className="notif-preview" style={{ maxHeight: isOpen ? 'none' : 40 }}>{body}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
