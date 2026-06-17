/**
 * Gate → send → log layer for all Telegram notifications.
 *
 * Every outbound notification (manual or cron) goes through notify(), which:
 *   1. checks the master mute + the per-type toggle in settings,
 *   2. sends via sendTelegram when allowed,
 *   3. records the outcome (sent / skipped / failed) to Blobs("notifications").
 *
 * kind ∈ { brief, aiBrief, alerts, dailySummary } — matches the toggle keys.
 */
import { getStore } from '@netlify/blobs'
import { sendTelegram } from './telegram.js'

const STORE = 'stockbot'
const KEY = 'notifications'
const MAX = 100

export const NOTIFY_TYPE_DEFAULTS = { brief: true, aiBrief: true, alerts: true, dailySummary: true }

export function isAllowed(settings, kind) {
  if (settings?.telegramMuted) return { allowed: false, reason: 'muted' }
  const types = { ...NOTIFY_TYPE_DEFAULTS, ...(settings?.notifyTypes || {}) }
  if (types[kind] === false) return { allowed: false, reason: 'type-disabled' }
  return { allowed: true }
}

export async function logNotification(entry) {
  try {
    const store = getStore(STORE)
    const raw = await store.get(KEY)
    const data = raw ? JSON.parse(raw) : { entries: [] }
    data.entries.unshift(entry)
    data.entries = data.entries.slice(0, MAX)
    await store.set(KEY, JSON.stringify(data))
  } catch (err) {
    console.error('Failed to log notification:', err.message)
  }
}

const baseEntry = (kind, trigger, text) => ({
  id: globalThis.crypto?.randomUUID?.() || String(Date.now() + Math.random()),
  ts: new Date().toISOString(),
  kind,
  trigger,                         // 'manual' | 'cron'
  text: String(text || '').slice(0, 4000),
})

// Log a skip without sending (used to gate before expensive work like an AI call).
export async function logSkip({ kind, trigger = 'manual', reason }) {
  await logNotification({ ...baseEntry(kind, trigger, ''), status: 'skipped', reason, recipients: [] })
}

export async function notify({ kind, trigger = 'manual', text, recipients = [], settings = {} }) {
  const base = baseEntry(kind, trigger, text)

  const gate = isAllowed(settings, kind)
  if (!gate.allowed) {
    await logNotification({ ...base, status: 'skipped', reason: gate.reason, recipients: [] })
    return { ok: false, skipped: true, reason: gate.reason, results: [] }
  }

  const res = await sendTelegram(recipients, text)
  const status = res.ok ? 'sent' : (res.results?.length ? 'partial' : 'failed')
  await logNotification({ ...base, status, error: res.error || null, recipients: res.results || [] })
  return res
}
