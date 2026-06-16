import { useState, useRef } from 'react'

export default function ImportPortfolio({ onImported }) {
  const [mode, setMode] = useState('replace')
  const [preview, setPreview] = useState(null)   // parsed rows before confirming
  const [fileContent, setFileContent] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const fileRef = useRef()

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    setError(null); setSuccess(null); setPreview(null)

    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target.result
      try {
        const rows = parseTSV(text)
        setPreview(rows)
        setFileContent(text)
      } catch (err) {
        setError(err.message)
      }
    }
    reader.readAsText(file)
  }

  async function handleImport() {
    if (!fileContent) return
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/import-portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: fileContent, mode }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Import failed')
      setSuccess(`Imported ${data.imported} position${data.imported !== 1 ? 's' : ''} (${data.total} total in portfolio)`)
      setPreview(null); setFileContent(null)
      if (fileRef.current) fileRef.current.value = ''
      onImported()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function handleDrop(e) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) {
      const dt = new DataTransfer()
      dt.items.add(file)
      fileRef.current.files = dt.files
      handleFile({ target: { files: [file] } })
    }
  }

  return (
    <div style={{ maxWidth: 680 }}>
      <div className="form-card">
        <h2>Import Portfolio from Broker Export</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
          Drop your broker's <code>.xls</code> export here. Expected columns:
          <strong> Symbol, Qty, Average Cost</strong> (tab-separated). The totals row is skipped automatically.
        </p>

        {error && <div className="banner error">{error}</div>}
        {success && <div className="banner success">{success}</div>}

        {/* Drop zone */}
        <div
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          onClick={() => fileRef.current?.click()}
          style={{
            border: '2px dashed var(--border)', borderRadius: 10,
            padding: '32px 24px', textAlign: 'center', cursor: 'pointer',
            color: 'var(--text-muted)', marginBottom: 20, transition: 'border-color 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--blue)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
        >
          <div style={{ fontSize: 32, marginBottom: 8 }}>📂</div>
          <div style={{ fontWeight: 600, color: 'var(--text)' }}>Drop broker export here</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>or click to browse · .xls / .tsv / .txt</div>
          <input ref={fileRef} type="file" accept=".xls,.xlsx,.tsv,.txt,.csv"
            style={{ display: 'none' }} onChange={handleFile} />
        </div>

        {/* Mode selector */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          {[
            { value: 'replace', label: 'Replace all', desc: 'Overwrite your entire portfolio with the file contents' },
            { value: 'merge', label: 'Merge', desc: 'Add/update positions from file, keep others unchanged' },
          ].map(opt => (
            <label key={opt.value} style={{
              flex: 1, display: 'flex', gap: 10, padding: '12px 14px',
              background: mode === opt.value ? 'rgba(59,130,246,0.1)' : 'var(--bg)',
              border: `1px solid ${mode === opt.value ? 'var(--blue)' : 'var(--border)'}`,
              borderRadius: 8, cursor: 'pointer', alignItems: 'flex-start',
            }}>
              <input type="radio" name="mode" value={opt.value}
                checked={mode === opt.value} onChange={() => setMode(opt.value)}
                style={{ marginTop: 2 }} />
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{opt.label}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{opt.desc}</div>
              </div>
            </label>
          ))}
        </div>

        {/* Preview table */}
        {preview && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
              Preview — {preview.length} position{preview.length !== 1 ? 's' : ''} found:
            </div>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Ticker</th>
                    <th className="right">Shares</th>
                    <th className="right">Avg Cost</th>
                    <th className="right">Total Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row) => (
                    <tr key={row.ticker}>
                      <td><span className="ticker">{row.ticker}</span></td>
                      <td className="right">{row.shares}</td>
                      <td className="right">${row.avg_cost.toFixed(2)}</td>
                      <td className="right">${(row.shares * row.avg_cost).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {preview && (
          <div className="btn-row">
            <button className="btn" onClick={handleImport} disabled={loading}>
              {loading
                ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Importing…</>
                : `Import ${preview.length} positions (${mode})`}
            </button>
            <button className="btn secondary" onClick={() => { setPreview(null); setFileContent(null); if (fileRef.current) fileRef.current.value = '' }}>
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Parser (mirrors server-side logic, runs in browser) ───────────────────────
function parseTSV(text) {
  const lines = text.trim().split('\n')
  if (lines.length < 2) throw new Error('File has no data rows')

  const header = lines[0].split('\t').map(h => h.trim())
  const symbolIdx = header.findIndex(h => h.toLowerCase() === 'symbol')
  const qtyIdx = header.findIndex(h => h.toLowerCase() === 'qty')
  const avgCostIdx = header.findIndex(h => h.toLowerCase().includes('average cost'))

  if (symbolIdx === -1 || qtyIdx === -1 || avgCostIdx === -1) {
    throw new Error(`Missing required columns. Found: ${header.join(', ')}`)
  }

  const positions = []
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split('\t').map(c => c.trim())
    const ticker = cells[symbolIdx]
    const qty = parseFloat(cells[qtyIdx])
    const avgCost = parseFloat(cells[avgCostIdx])
    if (!ticker || isNaN(qty) || isNaN(avgCost)) continue
    positions.push({ ticker: ticker.toUpperCase(), shares: qty, avg_cost: avgCost })
  }

  if (!positions.length) throw new Error('No valid positions found in file')
  return positions
}
