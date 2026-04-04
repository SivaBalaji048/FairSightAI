import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { gsap } from 'gsap'
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer, ReferenceLine } from 'recharts'
import { API_BASE } from '../config'
import StrategyTable from '../components/StrategyTable'
import AIInsightCard from '../components/AIInsightCard'

// ── Magnetic hover helper ─────────────────────────────────────────
const magneticMove = (e) => {
  const rect = e.currentTarget.getBoundingClientRect()
  const dx = (e.clientX - (rect.left + rect.width/2)) * 0.3
  const dy = (e.clientY - (rect.top  + rect.height/2)) * 0.3
  gsap.to(e.currentTarget, { x: dx, y: dy, duration: 0.3, ease: 'power2.out' })
}
const magneticLeave = (e) => gsap.to(e.currentTarget, { x: 0, y: 0, duration: 0.5, ease: 'elastic.out(1,0.5)' })

export default function Mitigate() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [result, setResult] = useState(null)
  const [appliedResult, setAppliedResult] = useState(null)
  const [error, setError] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [selectedStrategy, setSelectedStrategy] = useState(null)
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
  }, [result, appliedResult, error])

  const handleSimulate = async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const res = await axios.post(`${API_BASE}/mitigate/simulate?dataset_id=${id}`, {
        domain: 'general',
      })
      setResult(res.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Simulation failed.')
    } finally {
      setLoading(false)
    }
  }

  const handleApply = async (strategy) => {
    setSelectedStrategy(strategy)
    setShowModal(true)
  }

  const confirmApply = async () => {
    setShowModal(false)
    if (!selectedStrategy || !id) return
    setApplying(true)
    try {
      const res = await axios.post(`${API_BASE}/mitigate/apply?dataset_id=${id}`, {
        dataset_id: id,
        strategy: selectedStrategy,
      })
      setAppliedResult(res.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Application failed.')
    } finally {
      setApplying(false)
    }
  }

  const handleDownload = async (modelId) => {
    try {
      const res = await axios.get(`${API_BASE}/mitigate/download/${modelId}`)
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `fairlens-model-${modelId}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError('Download failed.')
    }
  }

  if (!id) {
    return (
      <div ref={containerRef} style={{ paddingTop: '88px', paddingBottom: '80px', padding: '88px 48px 80px', maxWidth: '1100px', margin: '0 auto', minHeight: '100vh' }}>
        <h2 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: '32px', fontWeight: 500, letterSpacing: '-0.02em', color: '#f0f4ff', marginBottom: '24px' }}>Mitigation</h2>
        <div className="glass-card anim-card" style={{ maxWidth: '480px', padding: '48px', textAlign: 'center' }}>
          <div style={{ fontSize: '32px', marginBottom: '16px' }}>⚙️</div>
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
        <h2 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: '32px', fontWeight: 500, letterSpacing: '-0.02em', color: '#f0f4ff', marginBottom: '24px' }}>Mitigation</h2>
        <div className="glass-card anim-card" style={{ maxWidth: '480px', padding: '32px' }}>
          <p style={{ fontSize: '14px', color: '#7a86a1', fontFamily: 'Inter, sans-serif', marginBottom: '16px' }}>
            Compare mitigation strategies and find the best fairness-accuracy tradeoff for your use case.
          </p>
          {error && <div style={{ marginBottom: '16px', padding: '12px 16px', borderRadius: '10px', background: 'rgba(239,68,68,0.08)', border: '0.5px solid rgba(239,68,68,0.2)', color: '#ef4444', fontSize: '13px', fontFamily: 'Inter, sans-serif' }}>{error}</div>}
          <button onClick={handleSimulate} disabled={loading} className="btn-primary" style={{ width: '100%', opacity: loading ? 0.5 : 1 }} onMouseMove={magneticMove} onMouseLeave={magneticLeave}>
            {loading ? 'Running simulations...' : 'Run Strategy Comparison'}
          </button>
        </div>
      </div>
    )
  }

  const strategies = result.strategies || []
  const recs = result.recommendations || {}

  // Tradeoff scatter data
  const tradeoffData = strategies
    .filter(s => s.fairness_score_after != null && s.accuracy_after != null)
    .map(s => ({
      name: s.strategy.replace(/_/g, ' '),
      fairness: s.fairness_score_after,
      accuracy: s.accuracy_after,
      recommendation: s.recommendation || 'not_recommended',
    }))

  // Add baseline
  if (result.baseline) {
    tradeoffData.unshift({
      name: 'Baseline (No Mitigation)',
      fairness: result.baseline.fairness_score,
      accuracy: result.baseline.accuracy,
      recommendation: 'baseline',
    })
  }

  const recColors = {
    recommended: '#10b981',
    consider: '#f59e0b',
    not_recommended: '#ef4444',
    baseline: '#7a86a1',
  }

  return (
    <div ref={containerRef} style={{ paddingTop: '88px', paddingBottom: '80px', padding: '88px 48px 80px', maxWidth: '1100px', margin: '0 auto', minHeight: '100vh' }}>
      <div style={{ marginBottom: '32px' }}>
        <p style={{ fontSize: '12px', fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#00e5ff', fontFamily: '"Space Grotesk", sans-serif', marginBottom: '8px' }}>Fix</p>
        <h2 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: '32px', fontWeight: 500, letterSpacing: '-0.02em', color: '#f0f4ff' }}>Mitigation Strategies</h2>
      </div>

      {/* AI Recommendation */}
      {recs.best_strategy && (
        <div className="anim-card">
          <AIInsightCard
            title="AI Recommendation"
            severity={recs.risk_level || 'medium'}
            summary={recs.reasoning}
            recommendations={recs.action_plan}
          />
        </div>
      )}

      {/* Strategy Comparison Table */}
      <div className="anim-card" style={{ marginTop: '24px' }}>
        <StrategyTable strategies={strategies} />
      </div>

      {/* Fairness vs Accuracy Tradeoff */}
      <div className="glass-card anim-card" style={{ padding: '28px', marginTop: '24px' }}>
        <h4 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: '16px', fontWeight: 500, color: '#f0f4ff', marginBottom: '8px' }}>Fairness vs Accuracy Tradeoff</h4>
        <p style={{ fontSize: '12px', color: '#7a86a1', fontFamily: 'Inter, sans-serif', marginBottom: '16px' }}>
          Higher fairness score = more fair (1.0 = perfectly equal). Higher accuracy = better predictions.
        </p>
        <ResponsiveContainer width="100%" height={350}>
          <ScatterChart>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="fairness" type="number" domain={[0, 1.1]} label={{ value: 'Fairness Score (DI Ratio)', position: 'insideBottom', offset: -5, fill: '#7a86a1' }} tick={{ fontSize: 12, fill: '#7a86a1' }} />
            <YAxis dataKey="accuracy" type="number" domain={[0.5, 1.0]} label={{ value: 'Accuracy', angle: -90, position: 'insideLeft', fill: '#7a86a1' }} tick={{ fontSize: 12, fill: '#7a86a1' }} />
            <Tooltip contentStyle={{ background: '#0f1424', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#f0f4ff' }}
              formatter={(val, name) => [
                name === 'fairness' ? val.toFixed(4) : val.toFixed(4),
                name === 'fairness' ? 'DI Ratio' : 'Accuracy'
              ]}
            />
            <ReferenceLine x={0.80} stroke="#10b981" strokeDasharray="5 5" label={{ value: '80% threshold', fill: '#10b981', fontSize: 11 }} />
            <Scatter data={tradeoffData}>
              {tradeoffData.map((entry, i) => (
                <Cell key={i} fill={recColors[entry.recommendation] || '#7a86a1'} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
        <div style={{ display: 'flex', gap: '16px', marginTop: '12px', fontSize: '12px', color: '#7a86a1', justifyContent: 'center' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }} />Recommended</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f59e0b' }} />Consider</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444' }} />Not Recommended</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#7a86a1' }} />Baseline</span>
        </div>
      </div>

      {/* Apply buttons */}
      <div className="glass-card anim-card" style={{ padding: '28px', marginTop: '24px' }}>
        <h4 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: '16px', fontWeight: 500, color: '#f0f4ff', marginBottom: '8px' }}>Apply Strategy</h4>
        <p style={{ fontSize: '12px', color: '#7a86a1', fontFamily: 'Inter, sans-serif', marginBottom: '16px' }}>Select a strategy to apply and retrain the model.</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          {strategies.filter(s => s.recommendation === 'recommended' || s.recommendation === 'consider').map(s => (
            <button
              key={s.strategy}
              onClick={() => handleApply(s.strategy)}
              className="btn-primary"
              onMouseMove={magneticMove} onMouseLeave={magneticLeave}
            >
              Apply {s.strategy.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Applied result */}
      {appliedResult && (
        <div className="glass-card anim-card" style={{ padding: '28px', marginTop: '24px', borderLeft: '3px solid #10b981' }}>
          <h4 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: '16px', fontWeight: 500, color: '#10b981', marginBottom: '16px' }}>✓ Strategy Applied: {appliedResult.strategy?.replace(/_/g, ' ')}</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
            <div className="metric-card">
              <p className="metric-label">Model ID</p>
              <p style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '13px', color: '#f0f4ff' }}>{appliedResult.model_id}</p>
            </div>
            {appliedResult.metrics?.disparate_impact_ratio != null && (
              <div className="metric-card">
                <p className="metric-label">DI Ratio</p>
                <p className="metric-value" style={{ fontSize: '24px' }}>{appliedResult.metrics.disparate_impact_ratio}</p>
              </div>
            )}
            {appliedResult.metrics?.accuracy != null && (
              <div className="metric-card">
                <p className="metric-label">Accuracy</p>
                <p className="metric-value" style={{ fontSize: '24px' }}>{appliedResult.metrics.accuracy}</p>
              </div>
            )}
            {appliedResult.metrics?.f1 != null && (
              <div className="metric-card">
                <p className="metric-label">F1 Score</p>
                <p className="metric-value" style={{ fontSize: '24px' }}>{appliedResult.metrics.f1}</p>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <button onClick={() => handleDownload(appliedResult.model_id)} className="btn-ghost" onMouseMove={magneticMove} onMouseLeave={magneticLeave}>
              Download Model (JSON)
            </button>
            <button onClick={() => navigate(`/report/${id}`)} className="btn-primary" onMouseMove={magneticMove} onMouseLeave={magneticLeave}>
              📋 View Full Report →
            </button>
          </div>
          <p style={{ fontSize: '12px', color: '#3d4a66', fontFamily: 'Inter, sans-serif', marginTop: '10px' }}>
            The full report includes a before/after fairness comparison, all strategy results, and AI-generated insights.
          </p>
        </div>
      )}

      {/* Report shortcut */}
      {result && !appliedResult && (
        <div className="glass-card anim-card" style={{ padding: '24px', marginTop: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', borderLeft: '3px solid #00e5ff' }}>
          <div>
            <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: '14px', fontWeight: 500, color: '#00e5ff' }}>Ready to generate the full audit report?</p>
            <p style={{ fontSize: '12px', color: '#7a86a1', fontFamily: 'Inter, sans-serif', marginTop: '4px' }}>Compile all analysis findings, strategy comparisons, and before/after insights into a shareable report.</p>
          </div>
          <button
            onClick={() => navigate(`/report/${id}`)}
            className="btn-primary"
            style={{ whiteSpace: 'nowrap', fontSize: '13px' }}
            onMouseMove={magneticMove} onMouseLeave={magneticLeave}
          >
            📋 View Report →
          </button>
        </div>
      )}

      {/* Confirmation Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(5,8,15,0.8)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
          <div className="glass-card" style={{ padding: '32px', maxWidth: '420px', width: '100%', margin: '0 16px' }}>
            <h4 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: '20px', fontWeight: 500, color: '#f0f4ff', marginBottom: '12px' }}>Apply Mitigation?</h4>
            <p style={{ fontSize: '14px', color: '#7a86a1', fontFamily: 'Inter, sans-serif', marginBottom: '24px' }}>
              This will retrain the model using the <strong style={{ color: '#f0f4ff' }}>{selectedStrategy?.replace(/_/g, ' ')}</strong> strategy.
              Continue?
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowModal(false)} className="btn-ghost">Cancel</button>
              <button
                onClick={confirmApply}
                disabled={applying}
                className="btn-primary"
                style={{ opacity: applying ? 0.5 : 1 }}
                onMouseMove={magneticMove} onMouseLeave={magneticLeave}
              >
                {applying ? 'Applying...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}