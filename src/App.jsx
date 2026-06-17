import { useState, useEffect, useCallback, useRef } from 'react'
import { getPortfolio, getPrices, deletePosition as removePosition } from './api/client.js'
import StockTable from './components/StockTable.jsx'
import AddPositionForm from './components/AddPositionForm.jsx'
import AlertSettings from './components/AlertSettings.jsx'
import ImportPortfolio from './components/ImportPortfolio.jsx'
import AiBrief from './components/AiBrief.jsx'

const REFRESH_INTERVAL = 30_000 // 30 seconds

const TABS = [
  { id: 'dashboard', label: '📊 Dashboard' },
  { id: 'portfolio', label: '➕ Manage Portfolio' },
  { id: 'import', label: '📥 Import' },
  { id: 'settings', label: '⚙️ Alert Settings' },
]

export default function App() {
  const [tab, setTab] = useState('dashboard')
  const [positions, setPositions] = useState([])
  const [prices, setPrices] = useState({})
  const [loadingPositions, setLoadingPositions] = useState(true)
  const [loadingPrices, setLoadingPrices] = useState(false)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const intervalRef = useRef(null)

  const fetchPortfolio = useCallback(async () => {
    try {
      const data = await getPortfolio()
      setPositions(data.positions || [])
      return data.positions || []
    } catch (err) {
      setError('Failed to load portfolio: ' + err.message)
      return []
    } finally {
      setLoadingPositions(false)
    }
  }, [])

  const fetchPrices = useCallback(async (pos) => {
    if (!pos.length) { setPrices({}); return }
    setLoadingPrices(true)
    try {
      const tickers = pos.map((p) => p.ticker)
      const data = await getPrices(tickers)
      setPrices(data)
      setLastUpdated(new Date())
      setError(null)
    } catch (err) {
      setError('Failed to fetch prices: ' + err.message)
    } finally {
      setLoadingPrices(false)
    }
  }, [])

  const refresh = useCallback(async () => {
    const pos = await fetchPortfolio()
    await fetchPrices(pos)
  }, [fetchPortfolio, fetchPrices])

  useEffect(() => {
    refresh()
    intervalRef.current = setInterval(refresh, REFRESH_INTERVAL)
    return () => clearInterval(intervalRef.current)
  }, [refresh])

  async function handleDelete(ticker) {
    if (!confirm(`Remove ${ticker} from your portfolio?`)) return
    try {
      await removePosition(ticker)
      refresh()
    } catch (err) {
      setError('Failed to delete: ' + err.message)
    }
  }

  async function handlePositionAdded() {
    await refresh()
    setTab('dashboard')
  }

  return (
    <>
      <header className="header">
        <h1>Stock<span>Bot</span></h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {loadingPrices && <span className="spinner" />}
          {lastUpdated && (
            <span className="last-updated">
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
        </div>
      </header>

      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`tab${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {error && <div className="banner error" style={{ marginBottom: 20 }}>{error}</div>}

      {tab === 'dashboard' && (
        loadingPositions ? (
          <div className="loading-row"><span className="spinner" /> Loading portfolio…</div>
        ) : (
          <>
            {positions.length > 0 && <AiBrief />}
            <StockTable positions={positions} prices={prices} onDelete={handleDelete} />
          </>
        )
      )}

      {tab === 'portfolio' && (
        <AddPositionForm onAdded={handlePositionAdded} />
      )}

      {tab === 'import' && (
        <ImportPortfolio onImported={() => { refresh(); setTab('dashboard') }} />
      )}

      {tab === 'settings' && <AlertSettings />}
    </>
  )
}
