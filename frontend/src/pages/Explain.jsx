import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { gsap } from 'gsap'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer } from 'recharts'
import { API_BASE } from '../config'
import AIInsightCard from '../components/AIInsightCard'
import CounterfactualTable from '../components/CounterfactualTable'

const PROXY_THRESHOLD = 0.6

// ── Magnetic hover helper ─────────────────────────────────────────
const magneticMove = (e) => {
  const rect = e.currentTarget.getBoundingClientRect()
  const dx = (e.clientX - (rect.left + rect.width/2)) * 0.3
  const dy = (e.clientY - (rect.top  + rect.height/2)) * 0.3
  gsap.to(e.currentTarget, { x: dx, y: dy, duration: 0.3, ease: 'power2.out' })
}
const magneticLeave = (e) => gsap.to(e.currentTarget, { x: 0, y: 0, duration: 0.5, ease: 'elastic.out(1,0.5)' })

export default function Explain() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [mode, setMode] = useState('simple')
  const [caseInput, setCaseInput] = useState('')
  const [caseResult, setCaseResult] = useState(null)
  const containerRef = useRef(null)

  // ── GSAP entry animation ────────────────────────────────────────
  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo('.anim-card',
        { opacity: 0, y: 30 },
        { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out', stagger: 0.1, delay: 0.1 }
      )
    }, containerRef)
    return () => ctx.revert()
  }, [result, error])

  const handleExplain = async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const res = await axios.post(`${API_BASE}/explain?dataset_id=${id}`, {
        domain: 'general',
      })
      setResult(res.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Explanation failed.')
    } finally {
      setLoading(false)
    }
  }

  const handleCaseCheck = async () => {
    if (!id || !caseInput.trim()) return
    try {
      const row = {}
      const parts = caseInput.split(',').map(s => s.trim())
      parts.forEach(p => {
        const [k, ...rest] = p.split(':').map(s => s.trim())
        if (k) row[k] = rest.join(':') || k
      })
      const res = await axios.post(`${API_BASE}/explain/case`, {
        dataset_id: id,
        row_data: row,
      })
      setCaseResult(res.data)
    } catch (e) {
      setCaseResult({ error: e.response?.data?.detail || 'Case analysis failed.' })
    }
  }

  if (!id) {
    return (
      <div ref={containerRef} style={{ paddingTop: '88px', paddingBottom: '80px', padding: '88px 48px 80px', maxWidth: '1100px', margin: '0 auto', minHeight: '100vh' }}>
        <h2 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: '32px', fontWeight: 500, letterSpacing: '-0.02em', color: '#f0f4ff', marginBottom: '24px' }}>Explainability</h2>
        <div className="glass-card anim-card" style={{ maxWidth: '480px', padding: '48px', textAlign: 'center' }}>
          <div style={{ fontSize: '32px', marginBottom: '16px' }}>🔍</div>
          <h3 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: '18px', fontWeight: 500, color: '#f0f4ff', marginBottom: '8px' }}>No dataset selected</h3>
          <p style={{ fontSize: '14px', color: '#7a86a1', fontFamily: 'Inter, sans-serif', marginBottom: '24px' }}>Upload and configure a dataset first.</p>
          <button onClick={() => navigate('/upload')} className="btn-primary" onMouseMove={magneticMove} onMouseLeave={magneticLeave}>Go to Upload →</button>
        </div>
      </div>
    )
  }

  if (!result) {
    return (
      <div ref={containerRef} style={{ paddingTop: '88px', paddingBottom: '80px', padding: '88px 48px 80px', maxWidth: '1100px', margin: '0 auto', minHeight: '100vh' }}>
        <h2 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: '32px', fontWeight: 500, letterSpacing: '-0.02em', color: '#f0f4ff', marginBottom: '24px' }}>Explainability</h2>
        <div className="glass-card anim-card" style={{ maxWidth: '480px', padding: '32px' }}>
          <p style={{ fontSize: '14px', color: '#7a86a1', fontFamily: 'Inter, sans-serif', marginBottom: '16px' }}>
            Generate SHAP-based feature importance, counterfactuals, and AI explanations.
          </p>
          {error && <div style={{ marginBottom: '16px', padding: '12px 16px', borderRadius: '10px', background: 'rgba(239,68,68,0.08)', border: '0.5px solid rgba(239,68,68,0.2)', color: '#ef4444', fontSize: '13px', fontFamily: 'Inter, sans-serif' }}>{error}</div>}
          <button onClick={handleExplain} disabled={loading} className="btn-primary" style={{ width: '100%', opacity: loading ? 0.5 : 1 }} onMouseMove={magneticMove} onMouseLeave={magneticLeave}>
            {loading ? 'Analyzing...' : 'Run Explainability Analysis'}
          </button>
        </div>
      </div>
    )
  }

  const shapData = result.feature_importance?.shap_chart_data || []
  const explanations = result.explanations || {}
  const proxies = result.feature_importance?.proxy_correlations || {}
  const proxyEntries = Object.entries(proxies)

  return (
    <div ref={containerRef} style={{ paddingTop: '88px', paddingBottom: '80px', padding: '88px 48px 80px', maxWidth: '1100px', margin: '0 auto', minHeight: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px' }}>
        <div>
          <p style={{ fontSize: '12px', fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#00e5ff', fontFamily: '"Space Grotesk", sans-serif', marginBottom: '8px' }}>Insights</p>
          <h2 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: '32px', fontWeight: 500, letterSpacing: '-0.02em', color: '#f0f4ff' }}>Explainability</h2>
          <p style={{ fontSize: '14px', color: '#7a86a1', fontFamily: 'Inter, sans-serif', marginTop: '4px' }}>Why the model makes its decisions</p>
        </div>
        <button
          onClick={() => setMode(mode === 'simple' ? 'technical' : 'simple')}
          className="btn-ghost"
          style={{ fontSize: '12px' }}
          onMouseMove={magneticMove} onMouseLeave={magneticLeave}
        >
          {mode === 'simple' ? 'Switch to Technical' : 'Switch to Simple'}
        </button>
      </div>

      {/* SHAP Feature Importance */}
      <div className="glass-card anim-card" style={{ padding: '28px', marginBottom: '24px' }}>
        <h4 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: '16px', fontWeight: 500, color: '#f0f4ff', marginBottom: '16px' }}>SHAP Feature Importance</h4>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={shapData} layout="vertical" margin={{ left: 140 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis type="number" tick={{ fontSize: 12, fill: '#7a86a1' }} />
            <YAxis type="category" dataKey="feature" width={140} tick={{ fontSize: 12, fill: '#7a86a1' }} />
            <Tooltip contentStyle={{ background: '#0f1424', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#f0f4ff' }} />
            <Bar dataKey="importance" radius={[0, 4, 4, 0]}>
              {shapData.map((entry, i) => (
                <Cell
                  key={i}
                  fill={
                    entry.is_proxy ? '#ef4444' :
                    proxyEntries.some(([proxy]) => entry.feature === proxy) ? '#ef4444' :
                    '#00e5ff'
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '12px', fontSize: '12px', color: '#7a86a1' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '12px', height: '12px', background: '#00e5ff', borderRadius: '3px' }} />
            <span>Feature importance</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '12px', height: '12px', background: '#ef4444', borderRadius: '3px' }} />
            <span>Proxy variable (correlated with sensitive attribute)</span>
          </div>
        </div>
      </div>

      {/* Proxy Correlations */}
      {proxyEntries.length > 0 && (
        <div className="glass-card anim-card" style={{ padding: '28px', marginBottom: '24px', borderLeft: '3px solid #ef4444' }}>
          <h4 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: '16px', fontWeight: 500, color: '#ef4444', marginBottom: '16px' }}>⚠ Proxy Variables Detected</h4>
          <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '0.5px solid rgba(255,255,255,0.08)' }}>
                {['Feature', 'Correlated With', 'Correlation'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#7a86a1', fontSize: '11px', fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {proxyEntries.map(([feat, corrs]) =>
                corrs.map((c, i) => (
                  <tr key={`${feat}-${i}`} style={{ borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '10px 12px', fontFamily: '"JetBrains Mono", monospace', fontSize: '13px', color: '#f0f4ff' }}>{feat}</td>
                    <td style={{ padding: '10px 12px', color: '#f0f4ff' }}>{c.sensitive_attribute}</td>
                    <td style={{ padding: '10px 12px', fontFamily: '"JetBrains Mono", monospace', color: c.correlation > 0.8 ? '#ef4444' : '#f59e0b' }}>
                      {c.correlation.toFixed(4)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Counterfactual Comparison */}
      <div className="anim-card">
        <CounterfactualTable groupComparison={result.counterfactuals?.group_comparison || {}} />
      </div>

      {/* AI Explanation */}
      <div className="anim-card" style={{ marginTop: '24px' }}>
        <AIInsightCard
          title="AI Explanation"
          mode={mode}
          severity={result.metrics ? 'medium' : null}
          summary={mode === 'simple'
            ? explanations.plain_english_explanation
            : explanations.technical_explanation
          }
          recommendations={explanations.recommendations}
        />
      </div>

      {/* Proceed to Mitigate */}
      <div className="glass-card anim-card" style={{ marginTop: '24px', padding: '28px', borderLeft: '3px solid #8b5cf6' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h4 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: '16px', fontWeight: 500, color: '#8b5cf6' }}>Ready to fix the bias?</h4>
            <p style={{ fontSize: '13px', color: '#7a86a1', fontFamily: 'Inter, sans-serif', marginTop: '4px' }}>Explore mitigation strategies to improve fairness while preserving accuracy.</p>
          </div>
          <button
            onClick={() => navigate(`/mitigate/${id}`)}
            className="btn-primary"
            style={{ whiteSpace: 'nowrap' }}
            onMouseMove={magneticMove} onMouseLeave={magneticLeave}
          >
            Proceed to Mitigate →
          </button>
        </div>
      </div>

      {/* Individual Case Checker */}
      <div className="glass-card anim-card" style={{ marginTop: '24px', padding: '28px' }}>
        <h4 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: '16px', fontWeight: 500, color: '#f0f4ff', marginBottom: '12px' }}>Individual Case Checker</h4>
        <p style={{ fontSize: '12px', color: '#7a86a1', fontFamily: 'Inter, sans-serif', marginBottom: '12px' }}>
          Paste a comma-separated row (e.g. <code style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: '4px', fontFamily: '"JetBrains Mono", monospace', fontSize: '11px' }}>age:30,gender:Female,race:Black,income:50000</code>)
          to see the model's prediction and top reasons.
        </p>
        <input
          type="text"
          value={caseInput}
          onChange={(e) => setCaseInput(e.target.value)}
          placeholder="col1:val1, col2:val2, col3:val3"
          className="fl-input"
          style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '13px', marginBottom: '12px' }}
        />
        <button onClick={handleCaseCheck} className="btn-primary" style={{ opacity: !caseInput.trim() ? 0.5 : 1 }} onMouseMove={magneticMove} onMouseLeave={magneticLeave}>
          Check Case
        </button>

        {caseResult && (
          <div style={{ marginTop: '16px', padding: '20px', borderRadius: '12px', border: '0.5px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
            {caseResult.error ? (
              <p style={{ color: '#ef4444', fontSize: '13px', fontFamily: 'Inter, sans-serif' }}>{caseResult.error}</p>
            ) : (
              <div>
                <div style={{ display: 'flex', gap: '32px', marginBottom: '16px' }}>
                  <div>
                    <p style={{ fontSize: '11px', color: '#7a86a1', fontFamily: 'Inter, sans-serif', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Prediction</p>
                    <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: '24px', fontWeight: 500, color: caseResult.prediction ? '#10b981' : '#ef4444' }}>
                      {caseResult.prediction ? 'Positive' : 'Negative'}
                    </p>
                  </div>
                  <div>
                    <p style={{ fontSize: '11px', color: '#7a86a1', fontFamily: 'Inter, sans-serif', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Confidence</p>
                    <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: '24px', fontWeight: 500, color: '#f0f4ff' }}>{(caseResult.confidence * 100).toFixed(1)}%</p>
                  </div>
                  {caseResult.any_group_disparity_flag && (
                    <div style={{ padding: '8px 16px', background: 'rgba(239,68,68,0.08)', border: '0.5px solid rgba(239,68,68,0.2)', borderRadius: '10px', display: 'flex', alignItems: 'center' }}>
                      <p style={{ color: '#ef4444', fontSize: '12px', fontWeight: 500 }}>⚠ Disparate impact likely</p>
                    </div>
                  )}
                </div>
                <h5 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: '14px', fontWeight: 500, color: '#f0f4ff', marginBottom: '10px' }}>Top 3 Reasons</h5>
                <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '0.5px solid rgba(255,255,255,0.08)' }}>
                      {['Feature', 'Value', 'Direction', 'Reason'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#7a86a1', fontSize: '11px', fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {caseResult.top_3_reasons?.map((r, i) => (
                      <tr key={i} style={{ borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '8px 12px', fontFamily: '"JetBrains Mono", monospace', fontSize: '12px', color: '#f0f4ff' }}>{r.feature}</td>
                        <td style={{ padding: '8px 12px', color: '#f0f4ff' }}>{r.value}</td>
                        <td style={{ padding: '8px 12px', fontWeight: 500, color: r.direction === '+' ? '#10b981' : '#ef4444' }}>
                          {r.direction}
                        </td>
                        <td style={{ padding: '8px 12px', color: '#7a86a1', fontSize: '12px' }}>{r.meaning}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}