/**
 * GET    /api/notifications  → { entries: [...] }  (newest first, last 100)
 * DELETE /api/notifications  → clears the log
 */
import { getStore } from '@netlify/blobs'

const STORE_NAME = 'stockbot'
const KEY = 'notifications'

function cors(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
  }

  const store = getStore({ name: STORE_NAME, consistency: 'strong' })

  if (req.method === 'GET') {
    const raw = await store.get(KEY)
    return cors(raw ? JSON.parse(raw) : { entries: [] })
  }

  if (req.method === 'DELETE') {
    await store.set(KEY, JSON.stringify({ entries: [] }))
    return cors({ ok: true })
  }

  return cors({ error: 'Method not allowed' }, 405)
}

export const config = { path: '/api/notifications' }
