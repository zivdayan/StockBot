const BASE = '/api'

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API error ${res.status}: ${text}`)
  }
  return res.json()
}

// Portfolio
export const getPortfolio = () => request('/portfolio')
export const addPosition = (position) =>
  request('/portfolio', { method: 'POST', body: JSON.stringify(position) })
export const deletePosition = (ticker) =>
  request(`/portfolio?ticker=${encodeURIComponent(ticker)}`, { method: 'DELETE' })

// Prices
export const getPrices = (tickers) =>
  request(`/prices?tickers=${encodeURIComponent(tickers.join(','))}`)

// Import
export const importPortfolio = (content, mode = 'replace') =>
  request('/import-portfolio', { method: 'POST', body: JSON.stringify({ content, mode }) })

// Telegram
export const getTelegramChats = () => request('/telegram-chats')

// Settings
export const getSettings = () => request('/settings')
export const saveSettings = (settings) =>
  request('/settings', { method: 'POST', body: JSON.stringify(settings) })
