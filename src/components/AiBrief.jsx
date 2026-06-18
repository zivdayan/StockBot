import { useState } from 'react'
import { getAiBrief } from '../api/client.js'

// Inline **bold** → <strong>
function inline(s) {
  return s.split(/\*\*(.+?)\*\*/g).map((p, i) => (i % 2 ? <strong key={i}>{p}</strong> : p))
}

// Render the brief's lightweight markdown into styled, sectioned blocks.
function Markdown({ text }) {
  const SECTION = /^(⚡|🔎|👀|📌|🚨|📊)/
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
  const [error, setError] = useState(null)
  const [at, setAt] = useState(null)

  async function run() {
    setLoading(true); setError(null)
    try {
      const res = await getAiBrief()
      if (!res.ok && !res.analysis) throw new Error(res.error || 'AI brief failed')
      setAnalysis(res.analysis)
      setAt(new Date())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="ai-panel">
      <div className="ai-head">
        <div style={{ fontWeight: 700 }}>🧠 AI Portfolio Brief</div>
        <button className="btn secondary" onClick={run} disabled={loading}>
          {loading
            ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Analyzing…</>
            : analysis ? 'Refresh' : 'Generate'}
        </button>
      </div>

      {error && <div className="banner error" style={{ marginTop: 12 }}>{error}</div>}

      {!analysis && !error && !loading && (
        <div className="ai-meta">Web-grounded analysis of your holdings — performance, recent news, and things to watch.</div>
      )}

      {analysis && (
        <>
          <Markdown text={analysis} />
          {at && <div className="ai-meta">Generated {at.toLocaleString()} · Perplexity Sonar</div>}
        </>
      )}
    </div>
  )
}
