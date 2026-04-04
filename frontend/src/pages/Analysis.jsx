import { useState, useCallback, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { gsap } from 'gsap'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer } from 'recharts'
import { API_BASE } from '../config'
import BiasGauge from '../components/BiasGauge'
import AIInsightCard from '../components/AIInsightCard'
import FairnessChart from '../components/FairnessChart'

// ── Magnetic hover helper ─────────────────────────────────────────
const magneticMove = (e) => {
  const rect = e.currentTarget.getBoundingClientRect()
  const dx = (e.clientX - (rect.left + rect.width/2)) * 0.3
  const dy = (e.clientY - (rect.top  + rect.height/2)) * 0.3
  gsap.to(e.currentTarget, { x: dx, y: dy, duration: 0.3, ease: 'power2.out' })
}
const magneticLeave = (e) => gsap.to(e.currentTarget, { x: 0, y: 0, duration: 0.5, ease: 'elastic.out(1,0.5)' })

export default function Analysis() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
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
  }, [result, error, loading])

  // No dataset selected
  if (!id) {
    return (
      <div ref={containerRef} style={{ paddingTop: '88px', paddingBottom: '80px', padding: '88px 48px 80px', maxWidth: '1100px', margin: '0 auto', minHeight: '100vh' }}>
        <h2 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: '32px', fontWeight: 500, letterSpacing: '-0.02em', color: '#f0f4ff', marginBottom: '24px' }}>Bias Analysis</h2>
        <div className="glass-card anim-card" style={{ maxWidth: '480px', padding: '48px', textAlign: 'center' }}>
          <h3 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: '18px', fontWeight: 500, color: '#f0f4ff', marginBottom: '8px' }}>No dataset selected</h3>
          <p style={{ fontSize: '14px', color: '#7a86a1', fontFamily: 'Inter, sans-serif', marginBottom: '24px' }}>
            You need to upload and configure a dataset first before running analysis.
          </p>
          <button onClick={() => navigate('/upload')} className="btn-primary" onMouseMove={magneticMove} onMouseLeave={magneticLeave}>
            Go to Upload
          </button>
        </div>
      </div>
    )
  }

  const handleAnalyze = useCallback(async () => {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await axios.post(`${API_BASE}/analyze/dataset/${id}`, { domain: 'general' })
      setResult(res.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Analysis failed.')
    } finally {
      setLoading(false)
    }
  }, [id])

  // Error state
  if (error) {
    return (
      <div ref={containerRef} style={{ paddingTop: '88px', paddingBottom: '80px', padding: '88px 48px 80px', maxWidth: '1100px', margin: '0 auto', minHeight: '100vh' }}>
        <h2 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: '32px', fontWeight: 500, letterSpacing: '-0.02em', color: '#f0f4ff', marginBottom: '24px' }}>Bias Analysis</h2>
        <div className="glass-card anim-card" style={{ maxWidth: '480px', padding: '48px', textAlign: 'center' }}>
          <div style={{ fontSize: '24px', color: '#ef4444', marginBottom: '12px', fontFamily: '"Space Grotesk", sans-serif', fontWeight: 500 }}>Error</div>
          <p style={{ fontSize: '14px', color: '#ef4444', marginBottom: '16px', fontFamily: 'Inter, sans-serif' }}>{error}</p>
          <button onClick={() => { setError(null); handleAnalyze() }} className="btn-primary" onMouseMove={magneticMove} onMouseLeave={magneticLeave}>
            Retry
          </button>
        </div>
      </div>
    )
  }

  // Initial state
  if (!loading && !result) {
    return (
      <div ref={containerRef} style={{ paddingTop: '88px', paddingBottom: '80px', padding: '88px 48px 80px', maxWidth: '1100px', margin: '0 auto', minHeight: '100vh' }}>
        <h2 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: '32px', fontWeight: 500, letterSpacing: '-0.02em', color: '#f0f4ff', marginBottom: '24px' }}>Bias Analysis</h2>
        <div className="glass-card anim-card" style={{ maxWidth: '480px', padding: '32px' }}>
          <p style={{ fontSize: '14px', color: '#7a86a1', fontFamily: 'Inter, sans-serif', marginBottom: '16px' }}>Run a comprehensive bias analysis on the configured dataset.</p>
          <button onClick={handleAnalyze} className="btn-primary" style={{ width: '100%' }} onMouseMove={magneticMove} onMouseLeave={magneticLeave}>
            Run Analysis
          </button>
        </div>
      </div>
    )
  }

  // Loading state
  if (loading) {
    return (
      <div ref={containerRef} style={{ paddingTop: '88px', paddingBottom: '80px', padding: '88px 48px 80px', maxWidth: '1100px', margin: '0 auto', minHeight: '100vh' }}>
        <h2 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: '32px', fontWeight: 500, letterSpacing: '-0.02em', color: '#f0f4ff', marginBottom: '24px' }}>Bias Analysis</h2>
        <div className="glass-card anim-card" style={{ maxWidth: '480px', padding: '48px', textAlign: 'center' }}>
          <div style={{
            width: '48px', height: '48px',
            border: '2px solid rgba(0,229,255,0.2)',
            borderTopColor: '#00e5ff',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
            margin: '0 auto 16px',
          }} />
          <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: '16px', fontWeight: 500, color: '#f0f4ff' }}>Running analysis...</p>
          <p style={{ fontSize: '13px', color: '#7a86a1', fontFamily: 'Inter, sans-serif', marginTop: '4px' }}>This may take a minute.</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    )
  }

  // Results state
  const riskScore = result.risk_score ?? 0
  const narrative = result.narrative || {}
  const metrics = result.metrics || {}
  const intersectional = result.intersectional || {}
  const modelPerf = result.model_performance || {}

  const chartData = []
  Object.entries(metrics).forEach(([attr, data]) => {
    const groups = data.per_group_stats || {}
    Object.entries(groups).forEach(([group, info]) => {
      chartData.push({ group: `${attr}: ${group}`, positive_rate: info.positive_rate, count: info.count })
    })
  })

  return (
    <div ref={containerRef} style={{ paddingTop: '88px', paddingBottom: '80px', padding: '88px 48px 80px', maxWidth: '1100px', margin: '0 auto', minHeight: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px' }}>
        <div>
          <p style={{ fontSize: '12px', fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#00e5ff', fontFamily: '"Space Grotesk", sans-serif', marginBottom: '8px' }}>Results</p>
          <h2 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: '32px', fontWeight: 500, letterSpacing: '-0.02em', color: '#f0f4ff' }}>Bias Analysis Results</h2>
          <p style={{ fontSize: '14px', color: '#7a86a1', fontFamily: 'Inter, sans-serif', marginTop: '4px' }}>Dataset audit report</p>
        </div>
        <button onClick={() => navigate(`/explain/${id}`)} className="btn-primary" onMouseMove={magneticMove} onMouseLeave={magneticLeave}>Explain this</button>
      </div>

      {/* Risk Gauge */}
      <div className="anim-card" style={{ display: 'flex', gap: '20px', marginBottom: '24px' }}>
        <div className="glass-card" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px' }}>
          <BiasGauge score={riskScore} size={220} />
        </div>
        <div className="glass-card" style={{ flex: 1, padding: '28px' }}>
          <h4 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: '16px', fontWeight: 500, color: '#f0f4ff', marginBottom: '16px' }}>Key Findings</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '14px' }}>
            {narrative.key_finding && <p style={{ fontFamily: 'Inter, sans-serif', color: '#f0f4ff', fontWeight: 500 }}>{narrative.key_finding}</p>}
            {narrative.affected_groups && narrative.affected_groups.length > 0 && (
              <div>
                <p style={{ fontSize: '11px', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#7a86a1', marginBottom: '8px' }}>Affected Groups</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {narrative.affected_groups.map((g, i) => <span key={i} className="badge">{g}</span>)}
                </div>
              </div>
            )}
            {narrative.severity && (
              <div>
                <p style={{ fontSize: '11px', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#7a86a1', marginBottom: '8px' }}>Severity</p>
                <span className={`badge-${narrative.severity.toLowerCase()}`}>{narrative.severity}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* AI Narrative */}
      {narrative.summary && (
        <div className="anim-card">
          <AIInsightCard
            title="AI Bias Narrative"
            severity={narrative.severity}
            summary={narrative.summary}
            recommendations={narrative.recommendations}
          />
        </div>
      )}

      {/* Disparate Impact Chart */}
      <div className="anim-card" style={{ marginBottom: '24px' }}>
        <FairnessChart data={chartData} title="Group Outcome Rates" />
      </div>

      {/* Intersectional Bias Table */}
      {intersectional.flags && intersectional.flags.length > 0 && (
        <div className="glass-card anim-card" style={{ padding: '28px', marginBottom: '24px' }}>
          <h4 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: '16px', fontWeight: 500, color: '#f0f4ff', marginBottom: '16px' }}>Intersectional Bias Flags</h4>
          <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '0.5px solid rgba(255,255,255,0.08)' }}>
                {['Intersection Group', 'Positive Rate', 'Deviation', 'Direction', 'Severity'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#7a86a1', fontSize: '11px', fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {intersectional.flags.map((f, i) => (
                <tr key={i} style={{ borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '10px 12px', fontFamily: '"Space Grotesk", sans-serif', fontWeight: 500, color: '#f0f4ff' }}>{f.group}</td>
                  <td style={{ padding: '10px 12px', fontFamily: '"JetBrains Mono", monospace', color: '#f0f4ff' }}>{f.rate}</td>
                  <td style={{ padding: '10px 12px', fontFamily: '"JetBrains Mono", monospace', color: f.deviation < 0 ? '#ef4444' : '#10b981' }}>
                    {f.deviation > 0 ? '+' : ''}{f.deviation}
                  </td>
                  <td style={{ padding: '10px 12px', color: '#7a86a1' }}>{f.direction}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span className={`badge-${f.severity === 'high' ? 'unfair' : 'questionable'}`}>{f.severity}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Model Performance by Group */}
      {modelPerf && Object.keys(modelPerf).length > 0 && (
        <div className="glass-card anim-card" style={{ padding: '28px', marginBottom: '24px' }}>
          <h4 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: '16px', fontWeight: 500, color: '#f0f4ff', marginBottom: '16px' }}>Model Fairness by Group</h4>
          {Object.entries(modelPerf).map(([modelName, perf]) => {
            const groups = perf.per_group || {}
            if (!Object.keys(groups).length) return null
            return (
              <div key={modelName} style={{ marginBottom: '16px' }}>
                <h5 style={{ fontSize: '13px', fontFamily: '"Space Grotesk", sans-serif', fontWeight: 500, color: '#7a86a1', marginBottom: '10px', textTransform: 'capitalize' }}>{modelName.replace(/_/g, ' ')}</h5>
                <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '0.5px solid rgba(255,255,255,0.08)' }}>
                      {['Group', 'Accuracy', 'Precision', 'Recall', 'F1', 'AUC-ROC'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#7a86a1', fontSize: '11px', fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(groups).map(([group, m]) => (
                      <tr key={group} style={{ borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '8px 12px', fontFamily: '"Space Grotesk", sans-serif', fontWeight: 500, color: '#f0f4ff' }}>{group}</td>
                        <td style={{ padding: '8px 12px', fontFamily: '"JetBrains Mono", monospace', color: '#f0f4ff' }}>{m.accuracy}</td>
                        <td style={{ padding: '8px 12px', fontFamily: '"JetBrains Mono", monospace', color: '#f0f4ff' }}>{m.precision}</td>
                        <td style={{ padding: '8px 12px', fontFamily: '"JetBrains Mono", monospace', color: '#f0f4ff' }}>{m.recall}</td>
                        <td style={{ padding: '8px 12px', fontFamily: '"JetBrains Mono", monospace', color: '#f0f4ff' }}>{m.f1}</td>
                        <td style={{ padding: '8px 12px', fontFamily: '"JetBrains Mono", monospace', color: '#f0f4ff' }}>{m.auc_roc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })}
        </div>
      )}

      {/* Statistical Metrics Summary */}
      <div className="glass-card anim-card" style={{ padding: '28px' }}>
        <h4 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: '16px', fontWeight: 500, color: '#f0f4ff', marginBottom: '16px' }}>Statistical Metrics Summary</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
          {Object.entries(metrics).map(([attr, data]) => (
            <div key={attr} style={{ padding: '16px', borderRadius: '12px', background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.05)' }}>
              <h5 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: '13px', fontWeight: 500, color: '#f0f4ff', textTransform: 'capitalize', marginBottom: '12px' }}>{attr.replace(/_|"/g, ' ')}</h5>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', fontSize: '12px' }}>
                {Object.entries(data).filter(([k]) => k !== 'per_group_stats').map(([k, v]) => (
                  <div key={k}>
                    <p style={{ color: '#7a86a1', fontFamily: 'Inter, sans-serif', marginBottom: '2px' }}>{k.replace(/_/g, ' ')}</p>
                    <p style={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 500, color: '#f0f4ff' }}>
                      {typeof v === 'number' ? (v > 10 ? v.toFixed(0) : v.toFixed(4)) : String(v)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
