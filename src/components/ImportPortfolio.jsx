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

// ── Parser (mirrors server-side logic in import-portfolio.js, for preview) ─────
const TICKER_RE = /^[A-Z][A-Z.]{0,6}$/
const num = (s) => (s == null ? NaN : parseFloat(String(s).replace(/[$,%\s]/g, '')))
const firstNum = (s) => {
  const m = String(s ?? '').match(/-?[\d,]+\.?\d*/)
  return m ? parseFloat(m[0].replace(/,/g, '')) : NaN
}

function makePosition(ticker, shares, avg_cost, last, todayGL) {
  if (!TICKER_RE.test(ticker) || isNaN(shares) || isNaN(avg_cost) || avg_cost <= 0) return null
  const pos = { ticker, shares, avg_cost }
  if (!isNaN(todayGL) && !isNaN(last) && shares) {
    pos.today_ref = Math.round((last - todayGL / shares) * 10000) / 10000
  }
  return pos
}

function parseTSV(text) {
  const lines = text.split('\n')
  const headerIdx = lines.findIndex(l => {
    const c = l.split('\t').map(x => x.trim().toLowerCase())
    return c.includes('symbol') && c.includes('qty')
  })
  if (headerIdx === -1) throw new Error('Could not find the Symbol/Qty header row in the export')

  const header = lines[headerIdx].split('\t').map(h => h.trim().toLowerCase())
  const positions = header.some(h => h.includes('average cost'))
    ? parseClean(lines, headerIdx, header)
    : parseMultiline(lines, headerIdx)

  if (!positions.length) {
    throw new Error('No valid positions found — unexpected export format (avg cost must be a positive price)')
  }
  return positions
}

// (A) Clean single-line .xls — map columns by header name.
function parseClean(lines, headerIdx, header) {
  const col = (...names) => header.findIndex(h => names.some(n => h === n || h.includes(n)))
  const symIdx = col('symbol'), qtyIdx = col('qty')
  const avgIdx = col('average cost', 'avg cost'), lastIdx = col('last')
  const dayIdx = col("day's value", 'days value', 'today gain', "today's gain")
  const out = []
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const c = lines[i].split('\t').map(x => x.trim())
    const p = makePosition((c[symIdx] || '').toUpperCase(), num(c[qtyIdx]), num(c[avgIdx]), num(c[lastIdx]), num(c[dayIdx]))
    if (p) out.push(p)
  }
  return out
}

// (B) Messy multi-line clipboard TSV — reconstruct records, fixed columns.
function parseMultiline(lines, headerIdx) {
  const records = []
  let cur = null
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const first = lines[i].split('\t')[0].trim()
    if (TICKER_RE.test(first)) {
      if (cur !== null) records.push(cur)
      cur = lines[i]
    } else if (cur !== null) {
      cur += lines[i]
    }
  }
  if (cur !== null) records.push(cur)
  const out = []
  for (const rec of records) {
    const c = rec.split('\t')
    const p = makePosition(c[0].trim().toUpperCase(), num(c[2]), num(c[7]), firstNum(c[3]), num(c[9]))
    if (p) out.push(p)
  }
  return out
}
