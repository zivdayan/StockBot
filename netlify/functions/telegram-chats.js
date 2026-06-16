import { getStore } from '@netlify/blobs'

const STORE_NAME = 'stockbot'
const CHATS_KEY = 'telegram-chats'

/**
 * GET /api/telegram-chats
 *
 * 1. Calls getUpdates (no offset, no allowed_updates filter) to pick up any
 *    new chats since the last call.
 * 2. Merges new chats into the persistent store in Netlify Blobs so chats
 *    are never lost even after updates are consumed.
 * 3. Returns the full merged list.
 */
export default async function handler(req) {
  const token = process.env.TELEGRAM_BOT_TOKEN

  if (!token) {
    return json({ error: 'TELEGRAM_BOT_TOKEN is not set on this Netlify site.' }, 500)
  }

  const store = getStore(STORE_NAME)

  // Load persisted chats
  const raw = await store.get(CHATS_KEY)
  const stored = raw ? JSON.parse(raw) : {}   // { [chatId]: chatObject }

  // Fetch latest updates from Telegram (no offset = return all pending)
  let updates = []
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/getUpdates?limit=100`,
      { method: 'GET' }
    )
    const data = await res.json()

    if (!data.ok) {
      // Conflict = webhook is set; fall through to stored chats
      if (data.error_code !== 409) {
        return json({ error: `Telegram: ${data.description}` }, 502)
      }
    } else {
      updates = data.result
    }
  } catch (err) {
    return json({ error: `Network error reaching Telegram: ${err.message}` }, 502)
  }

  // Extract chat from every known update type
  let changed = false
  for (const u of updates) {
    const chat =
      u.message?.chat ??
      u.edited_message?.chat ??
      u.channel_post?.chat ??
      u.edited_channel_post?.chat ??
      u.my_chat_member?.chat ??
      u.chat_member?.chat

    if (!chat) continue

    const id = String(chat.id)
    if (!stored[id]) {
      stored[id] = {
        chatId: id,
        name:
          chat.title ||
          [chat.first_name, chat.last_name].filter(Boolean).join(' ') ||
          chat.username ||
          id,
        type: chat.type,
        username: chat.username ?? null,
      }
      changed = true
    }
  }

  // Persist if we found new chats
  if (changed) {
    await store.set(CHATS_KEY, JSON.stringify(stored))
  }

  return json({ ok: true, chats: Object.values(stored) })
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  })
}

export const config = { path: '/api/telegram-chats' }
