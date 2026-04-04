import { useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { gsap } from 'gsap'
import { API_BASE } from '../config'

const DOMAINS = [
  { key: 'hiring',     label: 'Hiring',      desc: 'Employee hiring decisions'        },
  { key: 'loan',       label: 'Loan Approval', desc: 'Credit/loan approval decisions' },
  { key: 'healthcare', label: 'Healthcare',   desc: 'Treatment recommendation'        },
  { key: 'custom',     label: 'Custom',       desc: 'Other domain'                    },
]

export default function Upload() {
  const [file,              setFile]              = useState(null)
  const [domain,            setDomain]            = useState('hiring')
  const [dragging,          setDragging]          = useState(false)
  const [step,              setStep]              = useState('upload')
  const [result,            setResult]            = useState(null)
  const [datasetId,         setDatasetId]         = useState(null)
  const [profile,           setProfile]           = useState(null)
  const [selectedSensitive, setSelectedSensitive] = useState([])
  const [selectedOutcome,   setSelectedOutcome]   = useState('')
  const [loading,           setLoading]           = useState(false)
  const [error,             setError]             = useState(null)
  const containerRef = useRef(null)
  const dropZoneRef  = useRef(null)
  const navigate     = useNavigate()

  // ── Entry animations ──────────────────────────────────────────
  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo('.upload-panel',
        { opacity: 0, y: 40 },
        { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out', stagger: 0.1, delay: 0.1 }
      )
    }, containerRef)
    return () => ctx.revert()
  }, [step])

  // ── Drag & drop handlers ──────────────────────────────────────
  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) setFile(f)
    gsap.fromTo(dropZoneRef.current,
      { scale: 1.04 },
      { scale: 1, duration: 0.4, ease: 'back.out(2)' }
    )
  }, [])

  const handleDragEnter = (e) => {
    e.preventDefault()
    setDragging(true)
    gsap.to(dropZoneRef.current, { scale: 1.02, duration: 0.2 })
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    setDragging(false)
    gsap.to(dropZoneRef.current, { scale: 1, duration: 0.3 })
  }

  // ── Upload handler ────────────────────────────────────────────
  const handleUpload = async () => {
    if (!file) return
    setLoading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await axios.post(`${API_BASE}/upload`, formData)
      setResult(res.data)
      setDatasetId(res.data.dataset_id)
      setProfile(res.data.profile)
      const detected = res.data.profile?.auto_detected_sensitive || []
      setSelectedSensitive(detected)
      setSelectedOutcome(res.data.profile?.auto_detected_outcome || '')
      setStep('profile')
    } catch (e) {
      setError(e.response?.data?.detail || 'Upload failed')
    } finally {
      setLoading(false)
    }
  }

  const handleConfigure = async () => {
    if (!datasetId || !selectedOutcome) return
    setLoading(true)
    setError(null)
    try {
      await axios.post(`${API_BASE}/dataset/${datasetId}/configure`, {
        sensitive_attributes: selectedSensitive,
        outcome_column: selectedOutcome,
        domain,
      })
      setStep('done')
    } catch (e) {
      setError(e.response?.data?.detail || 'Configuration failed')
    } finally {
      setLoading(false)
    }
  }

  const toggleSensitive = (col) => {
    setSelectedSensitive(prev =>
      prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]
    )
  }

  return (
    <div
      ref={containerRef}
      style={{
        paddingTop: '88px',
        paddingBottom: '80px',
        padding: '88px 48px 80px',
        maxWidth: '800px',
        margin: '0 auto',
        minHeight: '100vh',
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: '40px' }}>
        <p style={{ fontSize: '12px', fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#00e5ff', fontFamily: '"Space Grotesk", sans-serif', marginBottom: '8px' }}>
          Step {step === 'upload' ? '1/3' : step === 'profile' ? '2/3' : step === 'done' ? '3/3' : '2/3'}
        </p>
        <h1 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: '36px', fontWeight: 500, letterSpacing: '-0.025em', color: '#f0f4ff' }}>
          {step === 'upload' ? 'Upload Dataset' : step === 'profile' ? 'Configure Analysis' : 'Ready to Analyse'}
        </h1>
      </div>

      {/* ── STEP: UPLOAD ─────────────────────────────────────── */}
      {step === 'upload' && (
        <div className="upload-panel">
          {/* Drop zone */}
          <div
            ref={dropZoneRef}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            style={{
              border: `0.5px dashed ${dragging ? '#00e5ff' : file ? '#10b981' : 'rgba(255,255,255,0.15)'}`,
              borderRadius: '16px',
              padding: '64px 32px',
              textAlign: 'center',
              cursor: 'none',
              background: dragging
                ? 'rgba(0,229,255,0.04)'
                : file
                ? 'rgba(16,185,129,0.04)'
                : 'rgba(255,255,255,0.02)',
              transition: 'border-color 0.2s ease, background 0.2s ease',
              marginBottom: '24px',
              position: 'relative',
              overflow: 'hidden',
            }}
            onClick={() => document.getElementById('file-input').click()}
          >
            {/* Corner accents */}
            {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map((pos) => (
              <div key={pos} style={{
                position: 'absolute',
                width: '20px', height: '20px',
                top: pos.includes('top') ? '12px' : 'auto',
                bottom: pos.includes('bottom') ? '12px' : 'auto',
                left: pos.includes('left') ? '12px' : 'auto',
                right: pos.includes('right') ? '12px' : 'auto',
                borderTop: pos.includes('top') ? `1.5px solid ${file ? '#10b981' : '#00e5ff'}60` : 'none',
                borderBottom: pos.includes('bottom') ? `1.5px solid ${file ? '#10b981' : '#00e5ff'}60` : 'none',
                borderLeft: pos.includes('left') ? `1.5px solid ${file ? '#10b981' : '#00e5ff'}60` : 'none',
                borderRight: pos.includes('right') ? `1.5px solid ${file ? '#10b981' : '#00e5ff'}60` : 'none',
              }} />
            ))}

            <input
              id="file-input"
              type="file"
              accept=".csv"
              style={{ display: 'none' }}
              onChange={(e) => e.target.files[0] && setFile(e.target.files[0])}
            />

            {file ? (
              <>
                <div style={{ fontSize: '40px', marginBottom: '16px' }}>✓</div>
                <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: '18px', fontWeight: 500, color: '#10b981', marginBottom: '8px' }}>
                  {file.name}
                </p>
                <p style={{ fontSize: '13px', color: '#7a86a1', fontFamily: 'Inter, sans-serif' }}>
                  {(file.size / 1024).toFixed(1)} KB · Click to change
                </p>
              </>
            ) : (
              <>
                <div style={{
                  width: '56px', height: '56px',
                  borderRadius: '14px',
                  background: 'rgba(0,229,255,0.08)',
                  border: '0.5px solid rgba(0,229,255,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '24px',
                  margin: '0 auto 20px',
                }}>↑</div>
                <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: '18px', fontWeight: 500, color: '#f0f4ff', marginBottom: '8px' }}>
                  Drop your CSV here
                </p>
                <p style={{ fontSize: '13px', color: '#7a86a1', fontFamily: 'Inter, sans-serif' }}>
                  or click to browse · CSV format only
                </p>
              </>
            )}
          </div>

          {/* Domain selector */}
          <div className="glass-card" style={{ padding: '24px', marginBottom: '24px' }}>
            <div className="section-heading">Select Domain</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
              {DOMAINS.map((d) => (
                <button
                  key={d.key}
                  onClick={() => setDomain(d.key)}
                  style={{
                    padding: '14px 16px',
                    borderRadius: '12px',
                    background: domain === d.key ? 'rgba(0,229,255,0.08)' : 'rgba(255,255,255,0.02)',
                    border: `0.5px solid ${domain === d.key ? 'rgba(0,229,255,0.3)' : 'rgba(255,255,255,0.06)'}`,
                    cursor: 'none',
                    textAlign: 'left',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: '13px', fontWeight: 500, color: domain === d.key ? '#00e5ff' : '#f0f4ff', marginBottom: '3px' }}>
                    {d.label}
                  </p>
                  <p style={{ fontSize: '11px', color: '#7a86a1', fontFamily: 'Inter, sans-serif' }}>{d.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div style={{ padding: '12px 16px', borderRadius: '10px', background: 'rgba(239,68,68,0.08)', border: '0.5px solid rgba(239,68,68,0.2)', color: '#ef4444', fontSize: '13px', marginBottom: '16px', fontFamily: 'Inter, sans-serif' }}>
              ⚠ {error}
            </div>
          )}

          <button
            className="btn-primary"
            style={{ width: '100%', fontSize: '15px', padding: '16px' }}
            onClick={handleUpload}
            disabled={!file || loading}
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              const dx = (e.clientX - (rect.left + rect.width/2)) * 0.3
              const dy = (e.clientY - (rect.top  + rect.height/2)) * 0.3
              gsap.to(e.currentTarget, { x: dx, y: dy, duration: 0.3, ease: 'power2.out' })
            }}
            onMouseLeave={(e) => gsap.to(e.currentTarget, { x: 0, y: 0, duration: 0.5, ease: 'elastic.out(1,0.5)' })}
          >
            {loading ? 'Uploading…' : 'Upload & Profile →'}
          </button>
        </div>
      )}

      {/* ── STEP: PROFILE / CONFIGURE ────────────────────────── */}
      {step === 'profile' && profile && (
        <div className="upload-panel">
          <div className="glass-card" style={{ padding: '28px', marginBottom: '24px' }}>
            <div className="section-heading">Dataset Profile</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
              {[
                { label: 'Rows',    value: profile.row_count?.toLocaleString() || '—' },
                { label: 'Columns', value: profile.column_count || '—' },
                { label: 'Domain',  value: domain },
              ].map((m) => (
                <div key={m.label} style={{ textAlign: 'center', padding: '16px', borderRadius: '10px', background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.05)' }}>
                  <p style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '24px', fontWeight: 400, color: '#00e5ff', letterSpacing: '-0.02em' }}>{m.value}</p>
                  <p style={{ fontSize: '11px', color: '#7a86a1', marginTop: '4px', fontFamily: 'Inter, sans-serif', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{m.label}</p>
                </div>
              ))}
            </div>

            {/* Protected attributes */}
            <div style={{ marginBottom: '20px' }}>
              <p style={{ fontSize: '12px', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#7a86a1', marginBottom: '12px', fontFamily: '"Space Grotesk", sans-serif' }}>
                Protected Attributes <span style={{ color: '#8b5cf6' }}>*</span>
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {(profile.columns || []).map((c) => {
                  const col = typeof c === 'string' ? c : c.name;
                  return (
                  <button
                    key={col}
                    onClick={() => toggleSensitive(col)}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '100px',
                      fontSize: '12px',
                      fontFamily: '"JetBrains Mono", monospace',
                      cursor: 'none',
                      transition: 'all 0.15s ease',
                      background: selectedSensitive.includes(col) ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.04)',
                      border: `0.5px solid ${selectedSensitive.includes(col) ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.08)'}`,
                      color: selectedSensitive.includes(col) ? '#8b5cf6' : '#7a86a1',
                    }}
                  >
                    {selectedSensitive.includes(col) ? '✓ ' : ''}{col}
                  </button>
                  );
                })}
              </div>
            </div>

            {/* Outcome column */}
            <div>
              <p style={{ fontSize: '12px', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#7a86a1', marginBottom: '12px', fontFamily: '"Space Grotesk", sans-serif' }}>
                Outcome Column <span style={{ color: '#00e5ff' }}>*</span>
              </p>
              <select
                className="fl-select"
                value={selectedOutcome}
                onChange={(e) => setSelectedOutcome(e.target.value)}
              >
                <option value="">— Select outcome column —</option>
                {(profile.columns || []).map((c) => {
                  const col = typeof c === 'string' ? c : c.name;
                  return (
                  <option key={col} value={col}>{col}</option>
                  );
                })}
              </select>
            </div>
          </div>

          {error && (
            <div style={{ padding: '12px 16px', borderRadius: '10px', background: 'rgba(239,68,68,0.08)', border: '0.5px solid rgba(239,68,68,0.2)', color: '#ef4444', fontSize: '13px', marginBottom: '16px', fontFamily: 'Inter, sans-serif' }}>
              ⚠ {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="btn-ghost" onClick={() => setStep('upload')} style={{ flex: 1 }}>← Back</button>
            <button
              className="btn-primary"
              onClick={handleConfigure}
              disabled={!selectedOutcome || loading}
              style={{ flex: 2 }}
              onMouseMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect()
                const dx = (e.clientX - (rect.left + rect.width/2)) * 0.3
                const dy = (e.clientY - (rect.top  + rect.height/2)) * 0.3
                gsap.to(e.currentTarget, { x: dx, y: dy, duration: 0.3, ease: 'power2.out' })
              }}
              onMouseLeave={(e) => gsap.to(e.currentTarget, { x: 0, y: 0, duration: 0.5, ease: 'elastic.out(1,0.5)' })}
            >
              {loading ? 'Configuring…' : 'Configure & Continue →'}
            </button>
          </div>
        </div>
      )}

      {/* ── STEP: DONE ──────────────────────────────────────── */}
      {step === 'done' && (
        <div className="upload-panel glass-card" style={{ padding: '48px', textAlign: 'center' }}>
          <div style={{
            width: '72px', height: '72px',
            borderRadius: '20px',
            background: 'rgba(16,185,129,0.12)',
            border: '0.5px solid rgba(16,185,129,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '32px',
            margin: '0 auto 24px',
            color: '#10b981',
          }}>✓</div>
          <h2 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: '24px', fontWeight: 500, color: '#f0f4ff', marginBottom: '12px' }}>
            Dataset Ready
          </h2>
          <p style={{ color: '#7a86a1', fontFamily: 'Inter, sans-serif', fontSize: '14px', marginBottom: '32px' }}>
            Your dataset has been uploaded and configured. Run a bias analysis to get started.
          </p>
          <button className="btn-primary" style={{ fontSize: '15px' }} onClick={() => navigate(`/analysis/${datasetId}`)}
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              const dx = (e.clientX - (rect.left + rect.width/2)) * 0.3
              const dy = (e.clientY - (rect.top  + rect.height/2)) * 0.3
              gsap.to(e.currentTarget, { x: dx, y: dy, duration: 0.3, ease: 'power2.out' })
            }}
            onMouseLeave={(e) => gsap.to(e.currentTarget, { x: 0, y: 0, duration: 0.5, ease: 'elastic.out(1,0.5)' })}
          >
            Run Bias Analysis →
          </button>
        </div>
      )}
    </div>
  )
}
