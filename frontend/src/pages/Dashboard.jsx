import { useEffect, useState, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { API_BASE } from '../config'
import BiasGauge from '../components/BiasGauge'

export default function Dashboard() {
  const [analyses, setAnalyses] = useState([])
  const [loading, setLoading]   = useState(true)
  const containerRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    axios.get(`${API_BASE}/analyses`)
      .then(res => setAnalyses(res.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (loading) return
    const ctx = gsap.context(() => {
      // Stat cards animate in with stagger
      gsap.fromTo('.dash-stat-card',
        { opacity: 0, y: 30, scale: 0.97 },
        { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: 'power3.out', stagger: 0.08, delay: 0.1 }
      )
      // Counter animation for stat values
      document.querySelectorAll('.dash-counter').forEach((el) => {
        const target = parseInt(el.dataset.target, 10)
        const obj = { val: 0 }
        gsap.to(obj, {
          val: target,
          duration: 1.5,
          ease: 'power2.out',
          snap: { val: 1 },
          delay: 0.3,
          onUpdate: () => { el.textContent = Math.round(obj.val) },
        })
      })
      // Activity rows stagger
      ScrollTrigger.batch('.activity-row', {
        onEnter: (batch) => gsap.fromTo(batch,
          { opacity: 0, x: -20 },
          { opacity: 1, x: 0, duration: 0.5, ease: 'power3.out', stagger: 0.05 }
        ),
        start: 'top 90%',
        once: true,
      })
    }, containerRef)
    return () => ctx.revert()
  }, [loading])

  const stats = {
    total:        analyses.length,
    fair:         analyses.filter(a => ['fair','low'].includes(a.overall_fairness?.toLowerCase())).length,
    questionable: analyses.filter(a => ['questionable','medium'].includes(a.overall_fairness?.toLowerCase())).length,
    unfair:       analyses.filter(a => ['unfair','high'].includes(a.overall_fairness?.toLowerCase())).length,
  }
  const avgRisk = analyses.length
    ? Math.round(analyses.reduce((s, a) => s + (a.disparity_ratio || 0) * 100, 0) / analyses.length)
    : 0

  if (loading) {
    return (
      <div style={{ paddingTop: '64px', minHeight: '100vh', background: '#05080f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '48px', height: '48px',
            border: '2px solid rgba(0,229,255,0.2)',
            borderTopColor: '#00e5ff',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
            margin: '0 auto 16px',
          }} />
          <p style={{ color: '#7a86a1', fontFamily: 'Inter, sans-serif', fontSize: '14px' }}>Loading dashboard…</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  const STAT_CARDS = [
    { label: 'Datasets Analysed', value: stats.total, accent: '#00e5ff',    key: 'total' },
    { label: 'Fair',              value: stats.fair,  accent: '#10b981',    key: 'fair'  },
    { label: 'Questionable',      value: stats.questionable, accent: '#f59e0b', key: 'q' },
    { label: 'Biased',            value: stats.unfair, accent: '#ef4444',   key: 'unfair'},
  ]

  return (
    <div ref={containerRef} style={{ paddingTop: '88px', paddingBottom: '80px', padding: '88px 48px 80px', maxWidth: '1200px', margin: '0 auto', minHeight: '100vh' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '48px' }}>
        <div>
          <p style={{ fontSize: '12px', fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#00e5ff', fontFamily: '"Space Grotesk", sans-serif', marginBottom: '8px' }}>
            Overview
          </p>
          <h1 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: '36px', fontWeight: 500, letterSpacing: '-0.025em', color: '#f0f4ff', lineHeight: 1.1 }}>
            Dashboard
          </h1>
        </div>
        <button className="btn-primary" onClick={() => navigate('/upload')}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            const dx = (e.clientX - (rect.left + rect.width/2)) * 0.3
            const dy = (e.clientY - (rect.top  + rect.height/2)) * 0.3
            gsap.to(e.currentTarget, { x: dx, y: dy, duration: 0.3, ease: 'power2.out' })
          }}
          onMouseLeave={(e) => gsap.to(e.currentTarget, { x: 0, y: 0, duration: 0.5, ease: 'elastic.out(1,0.5)' })}
        >
          + Upload Dataset
        </button>
      </div>

      {/* Stat cards row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr) 180px', gap: '20px', marginBottom: '40px' }}>
        {STAT_CARDS.map((s) => (
          <div key={s.key} className="glass-card dash-stat-card" style={{ padding: '28px 24px' }}>
            <p style={{ fontSize: '11px', fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#7a86a1', fontFamily: '"Space Grotesk", sans-serif', marginBottom: '12px' }}>
              {s.label}
            </p>
            <p
              className="dash-counter"
              data-target={s.value}
              style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: '48px', fontWeight: 600, letterSpacing: '-0.04em', color: s.accent, lineHeight: 1 }}
            >
              0
            </p>
          </div>
        ))}
        {/* Gauge card */}
        <div className="glass-card dash-stat-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          <p style={{ fontSize: '11px', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#7a86a1', fontFamily: '"Space Grotesk", sans-serif' }}>
            Avg Risk
          </p>
          <BiasGauge score={avgRisk} size={120} />
        </div>
      </div>

      {/* Recent activity */}
      <div className="glass-card" style={{ padding: '32px' }}>
        <div className="section-heading">Recent Activity</div>

        {analyses.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {analyses.slice(0, 12).map((a) => {
              const fairness = a.overall_fairness?.toLowerCase() || ''
              const isFair = fairness.includes('fair') && !fairness.includes('unfair')
              const isUnfair = fairness.includes('unfair') || fairness === 'high'
              const isQ = fairness.includes('question') || fairness === 'medium'

              return (
                <div
                  key={a.analysis_id}
                  className="activity-row"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '16px 20px',
                    borderRadius: '12px',
                    background: 'rgba(255,255,255,0.02)',
                    border: '0.5px solid rgba(255,255,255,0.04)',
                    cursor: 'none',
                    transition: 'background 0.2s ease, border-color 0.2s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(0,229,255,0.04)'
                    e.currentTarget.style.borderColor = 'rgba(0,229,255,0.12)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.02)'
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.04)'
                  }}
                  onClick={() => navigate(`/analysis/${a.analysis_id}`)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{
                      width: '8px', height: '8px',
                      borderRadius: '50%',
                      background: isUnfair ? '#ef4444' : isQ ? '#f59e0b' : '#10b981',
                      boxShadow: `0 0 8px ${isUnfair ? '#ef4444' : isQ ? '#f59e0b' : '#10b981'}60`,
                    }} />
                    <div>
                      <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: '14px', fontWeight: 500, color: '#f0f4ff' }}>
                        {a.dataset_name}
                      </p>
                      <p style={{ fontSize: '12px', color: '#7a86a1', fontFamily: 'Inter, sans-serif', marginTop: '2px' }}>
                        {a.dataset_type} · {new Date(a.timestamp).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <span className={isUnfair ? 'badge-unfair' : isQ ? 'badge-questionable' : 'badge-fair'}>
                    {a.overall_fairness}
                  </span>
                </div>
              )
            })}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '64px 0' }}>
            <p style={{ color: '#3d4a66', fontFamily: 'Inter, sans-serif', marginBottom: '16px' }}>No analyses yet.</p>
            <Link to="/upload" className="btn-ghost" style={{ textDecoration: 'none' }}>
              Upload a dataset to get started →
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
