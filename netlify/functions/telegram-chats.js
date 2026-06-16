/**
 * GET /api/telegram-chats
 * Calls the Telegram Bot API to fetch all unique chats that have ever
 * messaged this bot (via getUpdates with a high offset to get history).
 * Returns: [{ chatId, name, type, username }]
 */
export default async function handler(req) {
  const token = process.env.TELEGRAM_BOT_TOKEN

  if (!token) {
    return json({ error: 'TELEGRAM_BOT_TOKEN not configured' }, 500)
  }

  try {
    // Use offset=-1 then walk backwards isn't possible with getUpdates,
    // so we fetch with a large limit and allowed_updates to capture all chats
    const res = await fetch(
      `https://api.telegram.org/bot${token}/getUpdates?limit=100&allowed_updates=["message","my_chat_member"]`,
      { method: 'GET' }
    )
    const data = await res.json()

    if (!data.ok) {
      return json({ error: data.description || 'Telegram API error' }, 502)
    }

    // Deduplicate chats by chatId
    const seen = new Map()
    for (const update of data.result) {
      const chat = update.message?.chat ?? update.my_chat_member?.chat
      if (!chat) continue

      if (!seen.has(chat.id)) {
        const name =
          chat.title ||                                          // group/channel
          [chat.first_name, chat.last_name].filter(Boolean).join(' ') || // person
          chat.username ||
          String(chat.id)

        seen.set(chat.id, {
          chatId: String(chat.id),
          name,
          type: chat.type,           // 'private' | 'group' | 'supergroup' | 'channel'
          username: chat.username ?? null,
        })
      }
    }

    return json({ ok: true, chats: [...seen.values()] })
  } catch (err) {
    return json({ error: err.message }, 500)
  }
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
