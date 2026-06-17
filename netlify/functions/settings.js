import { getStore } from '@netlify/blobs'

const STORE_NAME = 'stockbot'
const KEY = 'settings'

const DEFAULTS = {
  stockAlertThresholdPct: 2,
  portfolioAlertThresholdPct: 1,
  telegramRecipients: [],   // [{ name, chatId }]
  telegramContacts: [],     // address book
  dailySummaryHour: 17,
  telegramMuted: false,     // master mute for all Telegram notifications
  notifyTypes: { brief: true, aiBrief: true, alerts: true, dailySummary: true },
}

function cors(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  })
}

function migrate(saved) {
  // Migrate legacy single telegramChatId → recipients list
  if (saved.telegramChatId && !saved.telegramRecipients) {
    saved.telegramRecipients = [{ name: 'Me', chatId: saved.telegramChatId }]
    delete saved.telegramChatId
  }
  return saved
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
  }

  const store = getStore(STORE_NAME)

  if (req.method === 'GET') {
    const raw = await store.get(KEY)
    const saved = migrate(raw ? JSON.parse(raw) : {})
    return cors({ ...DEFAULTS, ...saved })
  }

  if (req.method === 'POST') {
    const body = await req.json()
    const raw = await store.get(KEY)
    const current = { ...DEFAULTS, ...migrate(raw ? JSON.parse(raw) : {}) }

    const cleanList = (arr) =>
      Array.isArray(arr)
        ? arr.filter(r => r.chatId).map(r => ({ name: String(r.name || 'Unnamed'), chatId: String(r.chatId) }))
        : []

    // Merge only the fields present in the body so different settings panels
    // (Alert Settings / Notifications) don't clobber each other.
    const next = { ...current }
    if ('stockAlertThresholdPct' in body) next.stockAlertThresholdPct = Number(body.stockAlertThresholdPct) || DEFAULTS.stockAlertThresholdPct
    if ('portfolioAlertThresholdPct' in body) next.portfolioAlertThresholdPct = Number(body.portfolioAlertThresholdPct) || DEFAULTS.portfolioAlertThresholdPct
    if ('telegramRecipients' in body) next.telegramRecipients = cleanList(body.telegramRecipients)
    if ('telegramContacts' in body) next.telegramContacts = cleanList(body.telegramContacts)
    if ('dailySummaryHour' in body) next.dailySummaryHour = Number(body.dailySummaryHour) ?? DEFAULTS.dailySummaryHour
    if ('telegramMuted' in body) next.telegramMuted = !!body.telegramMuted
    if ('notifyTypes' in body && body.notifyTypes && typeof body.notifyTypes === 'object') {
      next.notifyTypes = { ...DEFAULTS.notifyTypes, ...current.notifyTypes, ...body.notifyTypes }
    }

    await store.set(KEY, JSON.stringify(next))
    return cors({ ok: true, settings: next })
  }

  return cors({ error: 'Method not allowed' }, 405)
}

export const config = { path: '/api/settings' }
