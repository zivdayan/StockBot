import { useState, useEffect } from 'react'
import { getCachedAiBrief, generateAiBrief } from '../api/client.js'

// Inline **bold** → <strong>
function inline(s) {
  return s.split(/\*\*(.+?)\*\*/g).map((p, i) => (i % 2 ? <strong key={i}>{p}</strong> : p))
}

// Render the brief's lightweight markdown into styled, sectioned blocks.
function Markdown({ text }) {
  const SECTION = /^(⚡|🔎|👀|📌|🚨|📊|📋|🔀)/
  const out = []
  text.split('\n').forEach((raw, i) => {
    const line = raw.trim()
    if (!line) { out.push(<div key={i} style={{ height: 6 }} />); return }
    if (SECTION.test(line)) {
      out.push(<div key={i} className="ai-section">{inline(line)}</div>)
    } else if (/^[-*•]\s+/.test(line)) {
      out.push(<div key={i} className="ai-bullet">{inline(line.replace(/^[-*•]\s+/, ''))}</div>)
    } else {
      out.push(<p key={i} className="ai-para">{inline(line)}</p>)
    }
  })
  return <div className="ai-content">{out}</div>
}

export default function AiBrief() {
  const [loading, setLoading] = useState(false)
  const [analysis, setAnalysis] = useState(null)
  const [at, setAt] = useState(null)            // generatedAt (ISO string)
  const [error, setError] = useState(null)
  const [sent, setSent] = useState(null)        // Telegram delivery note
  const [open, setOpen] = useState(false)       // click-to-show

  // Load the cached last brief on mount (no generation/cost).
  useEffect(() => {
    getCachedAiBrief()
      .then(res => { if (res.analysis) { setAnalysis(res.analysis); setAt(res.generatedAt) } })
      .catch(() => {})
  }, [])

  async function run() {
    setLoading(true); setError(null); setSent(null)
    try {
      const res = await generateAiBrief()
      if (!res.analysis) throw new Error(res.error || 'AI brief failed')
      setAnalysis(res.analysis)
      setAt(res.generatedAt)
      setOpen(true)
      setSent(res.sent ? `Sent to ${res.recipients} on Telegram`
        : res.skipped ? 'Telegram delivery off (muted/disabled)'
        : 'Not sent to Telegram')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const when = at ? new Date(at).toLocaleString() : null

  return (
    <div className="ai-panel">
      <div className="ai-head">
        <div style={{ fontWeight: 700 }}>🧠 AI Portfolio Brief</div>
        <button className="btn secondary" onClick={run} disabled={loading}>
          {loading
            ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Analyzing…</>
            : analysis ? 'Generate new' : 'Generate'}
        </button>
      </div>

      {error && <div className="banner error" style={{ marginTop: 12 }}>{error}</div>}

      {!analysis && !error && !loading && (
        <div className="ai-meta">Web-grounded analysis of your holdings — highlights, news, and what's on the radar. Generates and also sends to Telegram.</div>
      )}

      {analysis && (
        <>
          <div className="ai-lastline" onClick={() => setOpen(v => !v)}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{open ? '▾' : '▸'}</span>
            <span>Last brief · {when}</span>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 11, color: 'var(--blue)' }}>{open ? 'hide' : 'click to show'}</span>
          </div>
          {open && <Markdown text={analysis} />}
          {sent && <div className="ai-meta">{sent} · Perplexity Sonar</div>}
        </>
      )}
    </div>
  )
}
