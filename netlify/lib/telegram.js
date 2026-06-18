/**
 * Shared Telegram helpers. sendTelegram returns per-recipient delivery results
 * so callers (and tests) can confirm messages actually went out.
 */

// Escape text destined for a parse_mode:HTML message.
export const escapeHtml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Convert the model's lightweight markdown to Telegram HTML: **bold** → <b>,
// leading "- "/"* " bullets → "• ". (Escape first so content is HTML-safe.)
export const mdToTelegramHtml = (md) =>
  escapeHtml(md)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/^[ \t]*[-*]\s+/gm, '• ')

const TG_LIMIT = 4096

// Split a long message into <=4096-char chunks, preferring newline boundaries.
function chunk(text) {
  if (text.length <= TG_LIMIT) return [text]
  const out = []
  let rest = text
  while (rest.length > TG_LIMIT) {
    let cut = rest.lastIndexOf('\n', TG_LIMIT)
    if (cut < TG_LIMIT * 0.5) cut = TG_LIMIT   // no good newline → hard cut
    out.push(rest.slice(0, cut))
    rest = rest.slice(cut).replace(/^\n/, '')
  }
  if (rest) out.push(rest)
  return out
}

async function sendOne(token, chatId, text) {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  })
  const body = await res.json().catch(() => ({}))
  return { ok: res.ok && body.ok, error: (res.ok && body.ok) ? null : (body.description || `HTTP ${res.status}`) }
}

export async function sendTelegram(recipients, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return { ok: false, error: 'TELEGRAM_BOT_TOKEN not set', results: [] }
  if (!recipients?.length) return { ok: false, error: 'No recipients configured', results: [] }

  const parts = chunk(text)
  const results = await Promise.all(
    recipients.map(async ({ chatId, name }) => {
      try {
        let error = null
        for (const part of parts) {
          const r = await sendOne(token, chatId, part)
          if (!r.ok) { error = r.error; break }
        }
        if (error) console.error(`Telegram error for ${name} (${chatId}):`, error)
        return { name, chatId, ok: !error, error }
      } catch (err) {
        return { name, chatId, ok: false, error: err.message }
      }
    })
  )
  return { ok: results.every(r => r.ok), results }
}
