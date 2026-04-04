import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'
import { gsap } from 'gsap'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine, Legend,
} from 'recharts'
import { API_BASE } from '../config'

// ── Helpers ──────────────────────────────────────────────────────────────────

function pct(v) {
  if (v == null) return 'N/A'
  const n = parseFloat(v)
  return isNaN(n) ? String(v) : (n * 100).toFixed(1) + '%'
}

function num(v, digits = 4) {
  if (v == null) return 'N/A'
  const n = parseFloat(v)
  return isNaN(n) ? String(v) : n.toFixed(digits)
}

function delta(v) {
  if (v == null) return null
  const n = parseFloat(v)
  if (isNaN(n)) return null
  return n
}

// ── Magnetic hover helper ─────────────────────────────────────────
const magneticMove = (e) => {
  const rect = e.currentTarget.getBoundingClientRect()
  const dx = (e.clientX - (rect.left + rect.width/2)) * 0.3
  const dy = (e.clientY - (rect.top  + rect.height/2)) * 0.3
  gsap.to(e.currentTarget, { x: dx, y: dy, duration: 0.3, ease: 'power2.out' })
}
const magneticLeave = (e) => gsap.to(e.currentTarget, { x: 0, y: 0, duration: 0.5, ease: 'elastic.out(1,0.5)' })

// ── Mini Gauge Arc ────────────────────────────────────────────────────────────

function MiniGauge({ score = 0, label, size = 160 }) {
  const arcRef = useRef(null)
  const textRef = useRef(null)
  const clamped = Math.min(100, Math.max(0, score))
  const color = clamped >= 60 ? '#ef4444' : clamped >= 30 ? '#f59e0b' : '#10b981'
  const radius = 62
  const stroke = 12
  const circumference = Math.PI * radius
  const progress = (clamped / 100) * circumference
  const cx = size / 2

  useEffect(() => {
    if (arcRef.current) {
      gsap.fromTo(arcRef.current,
        { strokeDashoffset: circumference },
        { strokeDashoffset: circumference - progress, duration: 1.2, ease: 'power2.out', delay: 0.3 }
      )
    }
    if (textRef.current) {
      const obj = { val: 0 }
      gsap.to(obj, {
        val: clamped, duration: 1, ease: 'power2.out', delay: 0.3,
        snap: { val: 1 },
        onUpdate: () => { if (textRef.current) textRef.current.textContent = Math.round(obj.val) }
      })
    }
  }, [score])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg width={size} height={size / 2 + 28} viewBox={`0 0 ${size} ${size / 2 + 28}`}>
        <path
          d={`M ${cx - radius} ${size / 2 + 16} A ${radius} ${radius} 0 0 1 ${cx + radius} ${size / 2 + 16}`}
          fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} strokeLinecap="round"
        />
        <path
          ref={arcRef}
          d={`M ${cx - radius} ${size / 2 + 16} A ${radius} ${radius} 0 0 1 ${cx + radius} ${size / 2 + 16}`}
          fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={circumference}
          style={{ filter: `drop-shadow(0 0 6px ${color}60)` }}
        />
        <text ref={textRef} x={cx} y={size / 2 + 4} textAnchor="middle" fontSize="28" fontWeight="500" fill={color} fontFamily='"Space Grotesk", sans-serif'>0</text>
        <text x={cx} y={size / 2 + 18} textAnchor="middle" fontSize="10" fill="#7a86a1" fontFamily='"Space Grotesk", sans-serif'>/ 100</text>
      </svg>
      <p style={{ fontSize: '11px', fontWeight: 500, color: '#7a86a1', fontFamily: '"Space Grotesk", sans-serif', marginTop: '4px' }}>{label}</p>
    </div>
  )
}

// ── Delta Badge ───────────────────────────────────────────────────────────────

function DeltaBadge({ value, label, positive = 'good', size = 'md' }) {
  if (value == null) return null
  const n = parseFloat(value)
  const isPos = n >= 0
  const isGood = positive === 'good' ? isPos : !isPos
  const color = isGood ? '#10b981' : '#ef4444'
  const bgColor = isGood ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)'
  const borderColor = isGood ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'
  const arrow = isPos ? '↑' : '↓'
  const textSize = size === 'lg' ? '20px' : '13px'

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 12px', borderRadius: '8px', border: `0.5px solid ${borderColor}`, background: bgColor, color }}>
      <span style={{ fontSize: textSize, fontWeight: 600, fontFamily: '"JetBrains Mono", monospace' }}>{arrow} {Math.abs(n).toFixed(4)}</span>
      {label && <span style={{ fontSize: '11px', opacity: 0.7, marginLeft: '4px' }}>{label}</span>}
    </div>
  )
}

// ── Strategy styling ──────────────────────────────────────────────────────────

const REC_STYLE = {
  recommended: { bg: 'rgba(16,185,129,0.1)', color: '#10b981', border: 'rgba(16,185,129,0.25)' },
  consider: { bg: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: 'rgba(245,158,11,0.25)' },
  not_recommended: { bg: 'rgba(239,68,68,0.1)', color: '#ef4444', border: 'rgba(239,68,68,0.25)' },
}
const REC_ICON = { recommended: '✓', consider: '~', not_recommended: '✗' }

// ── Section Tabs ──────────────────────────────────────────────────────────────

const TABS = [
  { key: 'overview', label: '◈ Overview' },
  { key: 'before_after', label: '⚖ Before vs After' },
  { key: 'strategies', label: '◐ Strategies' },
  { key: 'bias', label: '◎ Bias Findings' },
  { key: 'recommendations', label: '◉ Recommendations' },
  { key: 'appendix', label: '▤ Appendix' },
]

// ── Main Component ────────────────────────────────────────────────────────────

export default function Report() {
  const { id } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('overview')
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
  }, [data, activeTab, loading])

  const fetchReport = async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const res = await axios.get(`${API_BASE}/report/${id}/json`)
      setData(res.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Report generation failed. Ensure analysis has been run first.')
    } finally {
      setLoading(false)
    }
  }

  const downloadHTML = () => window.open(`${API_BASE}/report/${id}/html`, '_blank')

  const downloadJSON = () => {
    if (!data) return
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `fairlens-report-${id}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const shareLink = () => {
    navigator.clipboard?.writeText(`${window.location.origin}/report/${id}/html`)
    alert('Report link copied!')
  }

  // ── Empty state ──
  if (!loading && !data) {
    return (
      <div ref={containerRef} style={{ paddingTop: '88px', paddingBottom: '80px', padding: '88px 48px 80px', maxWidth: '800px', margin: '0 auto', minHeight: '100vh', textAlign: 'center' }}>
        <div className="anim-card" style={{ paddingTop: '64px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
          <h2 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: '32px', fontWeight: 500, letterSpacing: '-0.02em', color: '#f0f4ff', marginBottom: '8px' }}>Fairness Audit Report</h2>
          <p style={{ color: '#7a86a1', fontFamily: 'Inter, sans-serif', fontSize: '14px', marginBottom: '12px' }}>
            Generate a comprehensive audit report including bias findings, mitigation analysis, and before/after comparison.
          </p>
          {!id && (
            <p style={{ color: '#f59e0b', fontSize: '13px', fontWeight: 500, marginBottom: '16px' }}>
              ⚠ No dataset selected — navigate here from the Mitigate page.
            </p>
          )}
          {error && (
            <div style={{ marginBottom: '16px', padding: '12px 16px', borderRadius: '10px', background: 'rgba(239,68,68,0.08)', border: '0.5px solid rgba(239,68,68,0.2)', color: '#ef4444', fontSize: '13px', fontFamily: 'Inter, sans-serif', textAlign: 'left' }}>
              {error}
            </div>
          )}
          <button
            onClick={fetchReport}
            disabled={loading || !id}
            className="btn-primary"
            style={{ fontSize: '16px', padding: '16px 36px', opacity: (!id || loading) ? 0.4 : 1 }}
            onMouseMove={magneticMove} onMouseLeave={magneticLeave}
          >
            {loading ? 'Generating Report…' : '📊 Generate Full Report'}
          </button>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div ref={containerRef} style={{ paddingTop: '88px', paddingBottom: '80px', padding: '88px 48px 80px', maxWidth: '1100px', margin: '0 auto', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
        <div style={{
          width: '48px', height: '48px',
          border: '2px solid rgba(0,229,255,0.2)',
          borderTopColor: '#00e5ff',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: '16px', fontWeight: 500, color: '#f0f4ff' }}>Running mitigation simulations & compiling report…</p>
        <p style={{ fontSize: '13px', color: '#7a86a1', fontFamily: 'Inter, sans-serif' }}>This may take 30–60 seconds</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  // ── Data extraction ──
  const riskScore = data.risk_score ?? 0
  const dataset = data.dataset || {}
  const execSummary = data.executive_summary || {}
  const recommendations = data.recommendations || []
  const biasData = data.bias_analysis || {}
  const ba = data.before_after || {}
  const strategies = ba.all_strategies || []
  const baseline = { fairness: ba.baseline_fairness, accuracy: ba.baseline_accuracy }
  const best = {
    strategy: ba.best_strategy,
    fairness: ba.best_after_fairness,
    accuracy: ba.best_after_accuracy,
    fairnessImp: ba.fairness_improvement,
    accuracyChg: ba.accuracy_change,
  }

  let afterRiskScore = null;
  if (best.fairness != null && baseline.fairness != null) {
    const originalGap = Math.max(0.01, Math.abs(1 - baseline.fairness));
    const newGap = Math.abs(1 - best.fairness);
    const reductionRatio = newGap / originalGap;
    afterRiskScore = Math.max(0, Math.min(100, Math.round(riskScore * reductionRatio)));
  } else if (best.fairness != null) {
    afterRiskScore = Math.max(0, Math.min(100, Math.round(Math.abs(1 - best.fairness) * 150)));
  }

  const barData = strategies.map(s => ({
    name: (s.strategy || '').replace(/_/g, ' '),
    fairnessBefore: s.fairness_score_before != null ? parseFloat(s.fairness_score_before) : 0,
    fairnessAfter: s.fairness_score_after != null ? parseFloat(s.fairness_score_after) : 0,
    rec: s.recommendation || 'not_recommended',
  }))

  const recColors = { recommended: '#10b981', consider: '#f59e0b', not_recommended: '#ef4444', baseline: '#7a86a1' }

  return (
    <div ref={containerRef} style={{ paddingTop: '88px', paddingBottom: '80px', padding: '88px 48px 80px', maxWidth: '1100px', margin: '0 auto', minHeight: '100vh' }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontSize: '12px', fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#00e5ff', fontFamily: '"Space Grotesk", sans-serif', marginBottom: '8px' }}>Audit</p>
          <h2 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: '32px', fontWeight: 500, letterSpacing: '-0.02em', color: '#f0f4ff' }}>Fairness Audit Report</h2>
          <p style={{ fontSize: '13px', color: '#7a86a1', fontFamily: 'Inter, sans-serif', marginTop: '4px' }}>
            {dataset.filename} · {dataset.row_count?.toLocaleString()} rows · Generated {data.generated_at ? new Date(data.generated_at).toLocaleString() : 'now'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={downloadJSON} className="btn-ghost" style={{ fontSize: '12px' }} onMouseMove={magneticMove} onMouseLeave={magneticLeave}>⬇ JSON</button>
          <button onClick={downloadHTML} className="btn-ghost" style={{ fontSize: '12px' }} onMouseMove={magneticMove} onMouseLeave={magneticLeave}>🖨 HTML Report</button>
          <button onClick={shareLink} className="btn-ghost" style={{ fontSize: '12px' }} onMouseMove={magneticMove} onMouseLeave={magneticLeave}>🔗 Share</button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '28px', overflowX: 'auto', paddingBottom: '4px' }}>
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '8px 16px',
              borderRadius: '100px',
              fontSize: '12px',
              whiteSpace: 'nowrap',
              fontWeight: 500,
              fontFamily: '"Space Grotesk", sans-serif',
              transition: 'all 0.2s ease',
              cursor: 'none',
              background: activeTab === tab.key ? 'rgba(0,229,255,0.1)' : 'rgba(255,255,255,0.03)',
              color: activeTab === tab.key ? '#00e5ff' : '#7a86a1',
              border: activeTab === tab.key ? '0.5px solid rgba(0,229,255,0.25)' : '0.5px solid rgba(255,255,255,0.06)',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ══ TAB: OVERVIEW ══ */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Risk banner */}
          <div className="glass-card anim-card" style={{ padding: '32px', borderLeft: `3px solid ${riskScore >= 60 ? '#ef4444' : riskScore >= 30 ? '#f59e0b' : '#10b981'}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '32px', flexWrap: 'wrap' }}>
              <MiniGauge score={riskScore} label="Bias Risk Score (Before)" size={160} />
              {afterRiskScore != null && (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                    <div style={{ fontSize: '24px', color: '#3d4a66' }}>→</div>
                    <span style={{ fontSize: '11px', color: '#7a86a1' }}>Best mitigation</span>
                  </div>
                  <MiniGauge score={afterRiskScore} label="Projected Risk (After)" size={160} />
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: '18px', fontWeight: 500, color: '#f0f4ff', marginBottom: '8px' }}>Risk Reduction Achieved</h3>
                    <p style={{ fontSize: '13px', color: '#7a86a1', fontFamily: 'Inter, sans-serif', marginBottom: '12px' }}>
                      Applying <strong style={{ color: '#f0f4ff' }}>{best.strategy?.replace(/_/g, ' ')}</strong> yields the best fairness improvement.
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
                      <div>
                        <p style={{ fontSize: '11px', color: '#7a86a1', marginBottom: '4px' }}>Fairness Δ</p>
                        <DeltaBadge value={best.fairnessImp} positive="good" size="lg" />
                      </div>
                      <div>
                        <p style={{ fontSize: '11px', color: '#7a86a1', marginBottom: '4px' }}>Accuracy Δ</p>
                        <DeltaBadge value={best.accuracyChg} positive="good" size="lg" />
                      </div>
                    </div>
                  </div>
                </>
              )}
              {afterRiskScore == null && (
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: '14px', color: '#7a86a1', fontFamily: 'Inter, sans-serif' }}>
                    Run the Mitigation step first to see before/after comparison.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Executive Summary */}
          <div className="glass-card anim-card" style={{ padding: '28px' }}>
            <h3 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: '18px', fontWeight: 500, color: '#f0f4ff', marginBottom: '16px' }}>📝 Executive Summary</h3>
            {execSummary.available ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '14px', color: '#7a86a1', lineHeight: 1.7, fontFamily: 'Inter, sans-serif' }}>
                <p>{execSummary.paragraph_1}</p>
                <p>{execSummary.paragraph_2}</p>
                <p>{execSummary.paragraph_3}</p>
                {execSummary.one_sentence_conclusion && (
                  <p style={{ fontWeight: 500, fontStyle: 'italic', color: '#f0f4ff', borderLeft: '3px solid #00e5ff', paddingLeft: '16px', marginTop: '8px' }}>
                    "{execSummary.one_sentence_conclusion}"
                  </p>
                )}
                {execSummary.recommended_timeline_weeks && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px', marginTop: '12px', paddingTop: '12px', borderTop: '0.5px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '11px', color: '#7a86a1', textTransform: 'uppercase', fontWeight: 500, letterSpacing: '0.08em' }}>Risk Level</span>
                      <span className={`badge-${execSummary.risk_level === 'high' ? 'unfair' : execSummary.risk_level === 'medium' ? 'questionable' : 'fair'}`}>{execSummary.risk_level?.toUpperCase()}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '11px', color: '#7a86a1', textTransform: 'uppercase', fontWeight: 500, letterSpacing: '0.08em' }}>Recommended Timeline</span>
                      <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 500, fontSize: '14px', color: '#f0f4ff' }}>{execSummary.recommended_timeline_weeks} weeks</span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p style={{ color: '#3d4a66', fontSize: '14px', fontStyle: 'italic', fontFamily: 'Inter, sans-serif' }}>
                {execSummary.summary || 'AI executive summary unavailable (no API key configured).'}
              </p>
            )}
          </div>

          {/* Dataset info cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
            {[
              { label: 'Dataset', value: dataset.filename || 'N/A' },
              { label: 'Rows', value: dataset.row_count?.toLocaleString() || 'N/A' },
              { label: 'Columns', value: dataset.column_count || 'N/A' },
              { label: 'Outcome Column', value: dataset.outcome_column || 'N/A' },
            ].map(({ label, value }) => (
              <div key={label} className="metric-card anim-card" style={{ textAlign: 'left' }}>
                <p className="metric-label">{label}</p>
                <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 500, fontSize: '14px', color: '#f0f4ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={value}>{value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══ TAB: BEFORE vs AFTER ══ */}
      {activeTab === 'before_after' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {baseline.fairness != null ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                {/* BEFORE */}
                <div className="glass-card anim-card" style={{ padding: '24px', borderLeft: '3px solid #ef4444' }}>
                  <p style={{ fontSize: '11px', fontWeight: 600, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '16px' }}>Before Mitigation</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div>
                      <p style={{ fontSize: '11px', color: '#7a86a1' }}>Fairness Score (DI Ratio)</p>
                      <p style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '28px', fontWeight: 500, color: '#ef4444' }}>{num(baseline.fairness, 4)}</p>
                      <p style={{ fontSize: '11px', color: '#7a86a1', marginTop: '2px' }}>
                        {baseline.fairness < 0.8 ? '⚠ Below 80% threshold (biased)' : '✓ Above threshold'}
                      </p>
                    </div>
                    <div>
                      <p style={{ fontSize: '11px', color: '#7a86a1' }}>Model Accuracy</p>
                      <p style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '24px', fontWeight: 500, color: '#f0f4ff' }}>{pct(baseline.accuracy)}</p>
                    </div>
                    <div>
                      <p style={{ fontSize: '11px', color: '#7a86a1' }}>Bias Risk Score</p>
                      <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: '24px', fontWeight: 500, color: '#f0f4ff' }}>{riskScore}<span style={{ fontSize: '13px', color: '#7a86a1' }}>/100</span></p>
                    </div>
                  </div>
                </div>

                {/* ARROW + DELTA */}
                <div className="glass-card anim-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', borderLeft: '3px solid #00e5ff' }}>
                  <div style={{ fontSize: '32px' }}>⚖️</div>
                  <p style={{ fontSize: '11px', fontWeight: 600, color: '#00e5ff', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'center' }}>Best Strategy</p>
                  <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: '16px', fontWeight: 500, color: '#f0f4ff', textAlign: 'center', textTransform: 'capitalize' }}>{best.strategy?.replace(/_/g, ' ') || 'N/A'}</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                    {best.fairnessImp != null && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px' }}>
                        <span style={{ color: '#7a86a1' }}>Fairness</span>
                        <DeltaBadge value={best.fairnessImp} positive="good" />
                      </div>
                    )}
                    {best.accuracyChg != null && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px' }}>
                        <span style={{ color: '#7a86a1' }}>Accuracy</span>
                        <DeltaBadge value={best.accuracyChg} positive="good" />
                      </div>
                    )}
                  </div>
                </div>

                {/* AFTER */}
                <div className="glass-card anim-card" style={{ padding: '24px', borderLeft: '3px solid #10b981' }}>
                  <p style={{ fontSize: '11px', fontWeight: 600, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '16px' }}>After Mitigation</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div>
                      <p style={{ fontSize: '11px', color: '#7a86a1' }}>Fairness Score (DI Ratio)</p>
                      <p style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '28px', fontWeight: 500, color: '#10b981' }}>{num(best.fairness, 4)}</p>
                      <p style={{ fontSize: '11px', color: '#7a86a1', marginTop: '2px' }}>
                        {best.fairness >= 0.8 ? '✅ Meets 80% fairness threshold' : '⚠ Still below threshold'}
                      </p>
                    </div>
                    <div>
                      <p style={{ fontSize: '11px', color: '#7a86a1' }}>Model Accuracy</p>
                      <p style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '24px', fontWeight: 500, color: '#f0f4ff' }}>{pct(best.accuracy)}</p>
                    </div>
                    <div>
                      <p style={{ fontSize: '11px', color: '#7a86a1' }}>Projected Risk Score</p>
                      <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: '24px', fontWeight: 500, color: '#f0f4ff' }}>{afterRiskScore ?? 'N/A'}<span style={{ fontSize: '13px', color: '#7a86a1' }}>/100</span></p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Side-by-side bar */}
              {barData.length > 0 && (
                <div className="glass-card anim-card" style={{ padding: '28px' }}>
                  <h4 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: '16px', fontWeight: 500, color: '#f0f4ff', marginBottom: '4px' }}>Fairness Score — All Strategies (Before → After)</h4>
                  <p style={{ fontSize: '12px', color: '#7a86a1', fontFamily: 'Inter, sans-serif', marginBottom: '20px' }}>
                    Green line = 80% fairness threshold (Disparate Impact Rule). Bars show change per strategy.
                  </p>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={barData} margin={{ top: 5, right: 20, left: 0, bottom: 80 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#7a86a1' }} angle={-30} textAnchor="end" interval={0} />
                      <YAxis domain={[0, 1.2]} tick={{ fontSize: 11, fill: '#7a86a1' }} />
                      <Tooltip contentStyle={{ background: '#0f1424', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#f0f4ff' }} formatter={(v) => v.toFixed(4)} />
                      <Legend verticalAlign="top" wrapperStyle={{ color: '#7a86a1' }} />
                      <ReferenceLine y={0.8} stroke="#10b981" strokeDasharray="5 5" label={{ value: '80% threshold', fill: '#10b981', fontSize: 11 }} />
                      <Bar dataKey="fairnessBefore" name="Before" fill="rgba(239,68,68,0.5)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="fairnessAfter" name="After" radius={[4, 4, 0, 0]}>
                        {barData.map((entry, i) => (
                          <Cell key={i} fill={recColors[entry.rec] || '#7a86a1'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Insight narrative  */}
              <div className="glass-card anim-card" style={{ padding: '28px', borderLeft: '3px solid #00e5ff' }}>
                <h4 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: '16px', fontWeight: 500, color: '#f0f4ff', marginBottom: '12px' }}>🧠 Before vs After Insight</h4>
                <div style={{ fontSize: '14px', color: '#7a86a1', lineHeight: 1.7, fontFamily: 'Inter, sans-serif', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <p>
                    <strong style={{ color: '#f0f4ff' }}>Before mitigation</strong>, the model had a Disparate Impact ratio of{' '}
                    <strong style={{ color: '#ef4444' }}>{num(baseline.fairness, 4)}</strong> and accuracy of{' '}
                    <strong style={{ color: '#f0f4ff' }}>{pct(baseline.accuracy)}</strong>.{' '}
                    {baseline.fairness < 0.8
                      ? 'This is below the legally recognized 80% (4/5ths) fairness threshold, indicating the model is treating protected groups unequally.'
                      : 'This meets the 80% fairness threshold.'}
                  </p>
                  <p>
                    <strong style={{ color: '#f0f4ff' }}>After applying {best.strategy?.replace(/_/g, ' ') || 'the recommended strategy'}</strong>, fairness improved to{' '}
                    <strong style={{ color: '#10b981' }}>{num(best.fairness, 4)}</strong>{' '}
                    {best.fairnessImp != null && best.fairnessImp > 0
                      ? `(+${best.fairnessImp.toFixed(4)} improvement)`
                      : ''}{' '}
                    while accuracy {best.accuracyChg != null && best.accuracyChg >= 0
                      ? `improved to ${pct(best.accuracy)}`
                      : `slightly shifted to ${pct(best.accuracy)}`}.
                  </p>
                  <p>
                    {best.fairness >= 0.8
                      ? '✅ The mitigated model now meets compliance standards. It is recommended to deploy the mitigated version and continue monitoring for drift.'
                      : '⚠ Even the best strategy did not fully resolve the fairness gap. Consider combining strategies or reviewing data collection practices.'}
                  </p>
                </div>
              </div>
            </>
          ) : (
            <div className="glass-card anim-card" style={{ padding: '48px', textAlign: 'center' }}>
              <p style={{ fontSize: '40px', marginBottom: '16px' }}>🔧</p>
              <h3 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: '18px', fontWeight: 500, color: '#f0f4ff', marginBottom: '8px' }}>No Mitigation Data Available</h3>
              <p style={{ fontSize: '14px', color: '#7a86a1', fontFamily: 'Inter, sans-serif' }}>
                Run the mitigation simulation first from the <strong style={{ color: '#f0f4ff' }}>Mitigate</strong> page, then re-generate this report.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ══ TAB: STRATEGIES ══ */}
      {activeTab === 'strategies' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="glass-card anim-card" style={{ padding: '28px' }}>
            <h3 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: '16px', fontWeight: 500, color: '#f0f4ff', marginBottom: '4px' }}>All Mitigation Strategies</h3>
            <p style={{ fontSize: '12px', color: '#7a86a1', fontFamily: 'Inter, sans-serif', marginBottom: '20px' }}>
              Comparison of all tested strategies. Fairness = Disparate Impact Ratio (higher = more fair, 1.0 = perfect equality).
            </p>
            {strategies.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '0.5px solid rgba(255,255,255,0.08)' }}>
                      {['Strategy', 'Category', 'Fairness Before', 'Fairness After', 'Δ Fairness', 'Accuracy Before', 'Accuracy After', 'Δ Accuracy', 'Verdict'].map(h => (
                        <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: '#7a86a1', fontSize: '11px', fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {strategies.map((s, i) => {
                      const rec = s.recommendation || 'not_recommended'
                      const dFair = delta(s.fairness_improvement)
                      const dAcc = delta(s.accuracy_change)
                      const isBest = s.strategy === best.strategy
                      const rs = REC_STYLE[rec] || {}
                      return (
                        <tr key={i} style={{ borderBottom: '0.5px solid rgba(255,255,255,0.04)', background: isBest ? 'rgba(16,185,129,0.04)' : 'transparent' }}>
                          <td style={{ padding: '10px 12px', fontFamily: '"Space Grotesk", sans-serif', fontWeight: 500, color: '#f0f4ff', textTransform: 'capitalize' }}>
                            {s.strategy?.replace(/_/g, ' ')}
                            {isBest && <span style={{ marginLeft: '8px', fontSize: '10px', background: 'rgba(16,185,129,0.15)', color: '#10b981', padding: '2px 8px', borderRadius: '100px' }}>★ Best</span>}
                          </td>
                          <td style={{ padding: '10px 12px', color: '#7a86a1', fontSize: '12px' }}>{s.category || '—'}</td>
                          <td style={{ padding: '10px 12px', fontFamily: '"JetBrains Mono", monospace', color: '#ef4444' }}>{num(s.fairness_score_before)}</td>
                          <td style={{ padding: '10px 12px', fontFamily: '"JetBrains Mono", monospace', color: '#10b981', fontWeight: 600 }}>{num(s.fairness_score_after)}</td>
                          <td style={{ padding: '10px 12px' }}>
                            {dFair != null && (
                              <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '12px', fontWeight: 600, color: dFair > 0 ? '#10b981' : '#ef4444' }}>
                                {dFair > 0 ? '+' : ''}{dFair.toFixed(4)}
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '10px 12px', fontFamily: '"JetBrains Mono", monospace', fontSize: '12px', color: '#f0f4ff' }}>{pct(s.accuracy_before)}</td>
                          <td style={{ padding: '10px 12px', fontFamily: '"JetBrains Mono", monospace', fontSize: '12px', color: '#f0f4ff' }}>{pct(s.accuracy_after)}</td>
                          <td style={{ padding: '10px 12px' }}>
                            {dAcc != null && (
                              <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '12px', fontWeight: 600, color: dAcc >= 0 ? '#10b981' : '#ef4444' }}>
                                {dAcc >= 0 ? '+' : ''}{dAcc.toFixed(4)}
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <span style={{ padding: '3px 10px', borderRadius: '100px', fontSize: '11px', fontWeight: 500, background: rs.bg, color: rs.color, border: `0.5px solid ${rs.border}` }}>
                              {REC_ICON[rec]} {rec.replace(/_/g, ' ')}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p style={{ color: '#3d4a66', fontSize: '14px', fontFamily: 'Inter, sans-serif' }}>No strategy data available. Run the Mitigate step first.</p>
            )}
          </div>

          {strategies.length > 0 && (
            <div className="glass-card anim-card" style={{ padding: '24px', borderLeft: '3px solid #f59e0b' }}>
              <h4 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: '14px', fontWeight: 500, color: '#f59e0b', marginBottom: '12px' }}>💡 How to Read This Table</h4>
              <ul style={{ fontSize: '13px', color: '#7a86a1', fontFamily: 'Inter, sans-serif', lineHeight: 1.7, paddingLeft: '20px', listStyleType: 'disc', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <li><strong style={{ color: '#f0f4ff' }}>Fairness Score</strong> = Disparate Impact Ratio. Values ≥ 0.80 meet the industry-standard "80% rule" for fairness.</li>
                <li><strong style={{ color: '#f0f4ff' }}>Δ Fairness</strong> = How much the fairness improved (positive = better). Larger positive values are preferable.</li>
                <li><strong style={{ color: '#f0f4ff' }}>Δ Accuracy</strong> = Trade-off cost. Some fairness strategies slightly reduce model accuracy — acceptable if the delta is small.</li>
                <li><strong style={{ color: '#f0f4ff' }}>Recommended</strong> strategies offer the best balance of fairness gain with minimal accuracy loss.</li>
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ══ TAB: BIAS FINDINGS ══ */}
      {activeTab === 'bias' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="glass-card anim-card" style={{ padding: '28px' }}>
            <h3 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: '16px', fontWeight: 500, color: '#f0f4ff', marginBottom: '16px' }}>🔍 Bias Narrative</h3>
            {biasData.narrative?.summary ? (
              <p style={{ fontSize: '14px', lineHeight: 1.7, color: '#7a86a1', fontFamily: 'Inter, sans-serif' }}>{biasData.narrative.summary}</p>
            ) : (
              <p style={{ color: '#3d4a66', fontSize: '14px', fontFamily: 'Inter, sans-serif' }}>No narrative — run Analysis first.</p>
            )}
            {biasData.narrative?.affected_groups?.length > 0 && (
              <div style={{ marginTop: '16px' }}>
                <p style={{ fontSize: '11px', color: '#7a86a1', textTransform: 'uppercase', fontWeight: 500, letterSpacing: '0.08em', marginBottom: '8px' }}>Affected Groups</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {biasData.narrative.affected_groups.map((g, i) => (
                    <span key={i} className="badge">{g}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {biasData.metrics && Object.keys(biasData.metrics).length > 0 && (
            <div className="glass-card anim-card" style={{ padding: '28px' }}>
              <h4 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: '16px', fontWeight: 500, color: '#f0f4ff', marginBottom: '16px' }}>Statistical Metrics</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {Object.entries(biasData.metrics).map(([attr, mdata]) => {
                  if (!mdata || typeof mdata !== 'object') return null
                  return (
                    <div key={attr} style={{ padding: '16px', borderRadius: '12px', background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.05)' }}>
                      <h5 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: '13px', fontWeight: 500, color: '#f0f4ff', textTransform: 'capitalize', marginBottom: '12px' }}>{attr.replace(/_/g, ' ')}</h5>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', fontSize: '12px' }}>
                        {Object.entries(mdata)
                          .filter(([k]) => k !== 'per_group_stats')
                          .map(([k, v]) => (
                            <div key={k} style={{ padding: '8px', borderRadius: '8px', background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.04)' }}>
                              <p style={{ color: '#7a86a1', marginBottom: '2px' }}>{k.replace(/_/g, ' ')}</p>
                              <p style={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 500, color: '#f0f4ff' }}>
                                {typeof v === 'number' ? (v > 10 ? v.toFixed(0) : v.toFixed(4)) : String(v)}
                              </p>
                            </div>
                          ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {biasData.intersectional?.flags?.length > 0 && (
            <div className="glass-card anim-card" style={{ padding: '28px' }}>
              <h4 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: '16px', fontWeight: 500, color: '#f0f4ff', marginBottom: '16px' }}>Intersectional Bias Flags</h4>
              <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '0.5px solid rgba(255,255,255,0.08)' }}>
                    {['Group', 'Rate', 'Deviation', 'Direction', 'Severity'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#7a86a1', fontSize: '11px', fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {biasData.intersectional.flags.map((f, i) => (
                    <tr key={i} style={{ borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '8px 12px', fontFamily: '"Space Grotesk", sans-serif', fontWeight: 500, color: '#f0f4ff' }}>{f.group}</td>
                      <td style={{ padding: '8px 12px', fontFamily: '"JetBrains Mono", monospace', color: '#f0f4ff' }}>{f.rate}</td>
                      <td style={{ padding: '8px 12px', fontFamily: '"JetBrains Mono", monospace', color: f.deviation < 0 ? '#ef4444' : '#10b981' }}>
                        {f.deviation > 0 ? '+' : ''}{f.deviation}
                      </td>
                      <td style={{ padding: '8px 12px', color: '#7a86a1' }}>{f.direction}</td>
                      <td style={{ padding: '8px 12px' }}>
                        <span className={`badge-${f.severity === 'high' ? 'unfair' : 'questionable'}`}>{f.severity}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══ TAB: RECOMMENDATIONS ══ */}
      {activeTab === 'recommendations' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="glass-card anim-card" style={{ padding: '28px' }}>
            <h3 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: '16px', fontWeight: 500, color: '#f0f4ff', marginBottom: '20px' }}>💡 Action Recommendations ({recommendations.length})</h3>
            {recommendations.length > 0 ? (
              <ol style={{ display: 'flex', flexDirection: 'column', gap: '12px', listStyle: 'none', padding: 0 }}>
                {recommendations.map((r, i) => (
                  <li key={i} style={{ display: 'flex', gap: '12px', fontSize: '14px' }}>
                    <span style={{ flexShrink: 0, width: '24px', height: '24px', borderRadius: '50%', background: 'rgba(0,229,255,0.1)', color: '#00e5ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 600 }}>
                      {i + 1}
                    </span>
                    <p style={{ lineHeight: 1.7, color: '#7a86a1', fontFamily: 'Inter, sans-serif', paddingTop: '2px' }}>{r}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <p style={{ color: '#3d4a66', fontSize: '14px', fontFamily: 'Inter, sans-serif' }}>No recommendations available.</p>
            )}
          </div>

          {/* Priority matrix */}
          <div className="glass-card anim-card" style={{ padding: '28px', borderLeft: '3px solid #8b5cf6' }}>
            <h4 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: '14px', fontWeight: 500, color: '#8b5cf6', marginBottom: '16px' }}>📌 Priority Action Plan</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
              {[
                { label: '🔴 Immediate (0–2 weeks)', color: '#ef4444', items: ['Apply recommended mitigation strategy', 'Document bias findings for compliance', 'Notify relevant stakeholders'] },
                { label: '🟡 Short-term (2–8 weeks)', color: '#f59e0b', items: ['Retrain model with mitigated data', 'Audit upstream data collection', 'Set up fairness monitoring pipeline'] },
                { label: '🟢 Long-term (2–6 months)', color: '#10b981', items: ['Implement continuous fairness evaluation', 'Review model decisions with affected groups', 'Establish fairness KPIs and reporting cadence'] },
              ].map((p) => (
                <div key={p.label} style={{ padding: '16px', borderRadius: '12px', background: 'rgba(255,255,255,0.02)', border: `0.5px solid ${p.color}30` }}>
                  <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 500, color: p.color, fontSize: '13px', marginBottom: '10px' }}>{p.label}</p>
                  <ul style={{ fontSize: '12px', color: '#7a86a1', fontFamily: 'Inter, sans-serif', lineHeight: 1.6, paddingLeft: '16px', listStyleType: 'disc', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {p.items.map((item, i) => <li key={i}>{item}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══ TAB: APPENDIX ══ */}
      {activeTab === 'appendix' && (
        <div className="glass-card anim-card" style={{ padding: '28px' }}>
          <h3 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: '16px', fontWeight: 500, color: '#f0f4ff', marginBottom: '8px' }}>📎 Full Report Data (JSON)</h3>
          <p style={{ fontSize: '12px', color: '#7a86a1', fontFamily: 'Inter, sans-serif', marginBottom: '16px' }}>Raw output from all analysis and mitigation agents. Use for debugging or integration.</p>
          <pre style={{
            fontSize: '12px',
            background: 'rgba(255,255,255,0.02)',
            border: '0.5px solid rgba(255,255,255,0.06)',
            padding: '20px',
            borderRadius: '12px',
            overflowX: 'auto',
            maxHeight: '600px',
            lineHeight: 1.6,
            color: '#7a86a1',
            fontFamily: '"JetBrains Mono", monospace',
          }}>
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}
