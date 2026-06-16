/**
 * Shared Telegram sender. Returns per-recipient delivery results so callers
 * (and tests) can confirm messages actually went out.
 */
export async function sendTelegram(recipients, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return { ok: false, error: 'TELEGRAM_BOT_TOKEN not set', results: [] }
  if (!recipients?.length) return { ok: false, error: 'No recipients configured', results: [] }

  const results = await Promise.all(
    recipients.map(async ({ chatId, name }) => {
      try {
        const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
        })
        const body = await res.json().catch(() => ({}))
        const ok = res.ok && body.ok
        if (!ok) console.error(`Telegram error for ${name} (${chatId}):`, body.description || res.status)
        return { name, chatId, ok, error: ok ? null : (body.description || `HTTP ${res.status}`) }
      } catch (err) {
        return { name, chatId, ok: false, error: err.message }
      }
    })
  )
  return { ok: results.every(r => r.ok), results }
}
