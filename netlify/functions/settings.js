import { getStore } from '@netlify/blobs'

const STORE_NAME = 'stockbot'
const KEY = 'settings'

const DEFAULTS = {
  stockAlertThresholdPct: 2,
  portfolioAlertThresholdPct: 1,
  telegramChatId: '',
  dailySummaryHour: 17,
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
    const data = raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS
    return cors(data)
  }

  if (req.method === 'POST') {
    const body = await req.json()
    const settings = {
      stockAlertThresholdPct: Number(body.stockAlertThresholdPct) || DEFAULTS.stockAlertThresholdPct,
      portfolioAlertThresholdPct: Number(body.portfolioAlertThresholdPct) || DEFAULTS.portfolioAlertThresholdPct,
      telegramChatId: String(body.telegramChatId || ''),
      dailySummaryHour: Number(body.dailySummaryHour) || DEFAULTS.dailySummaryHour,
    }
    await store.set(KEY, JSON.stringify(settings))
    return cors({ ok: true, settings })
  }

  return cors({ error: 'Method not allowed' }, 405)
}

export const config = { path: '/api/settings' }
