import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import SplitType from 'split-type'

gsap.registerPlugin(ScrollTrigger)

// ── Feature data ──────────────────────────────────────────────────
const FEATURES = [
  {
    icon: '◎',
    title: 'Detect Bias',
    desc: 'Upload any CSV dataset. FairLens automatically identifies protected attributes and measures disparity ratios across demographic groups.',
    accent: '#00e5ff',
  },
  {
    icon: '◉',
    title: 'Explain Why',
    desc: 'Go beyond numbers. Understand which features drive bias decisions using SHAP values, counterfactual analysis, and proxy detection.',
    accent: '#8b5cf6',
  },
  {
    icon: '◐',
    title: 'Fix It',
    desc: 'Apply reweighing, resampling, or calibrated equalised odds automatically. See before/after fairness scores in real time.',
    accent: '#10b981',
  },
  {
    icon: '▤',
    title: 'Report',
    desc: 'Generate audit-ready PDF/HTML reports with full metric breakdowns, AI insights, and mitigation recommendations.',
    accent: '#f59e0b',
  },
]

const STATS = [
  { value: 99,  suffix: '%', label: 'Detection accuracy'   },
  { value: 3,   suffix: 'x', label: 'Faster than manual'   },
  { value: 12,  suffix: '+', label: 'Fairness metrics'      },
  { value: 100, suffix: '%', label: 'Open source'           },
]

const WORKFLOW = [
  { step: '01', label: 'Upload dataset',   desc: 'CSV upload with auto-profiling', path: '/upload' },
  { step: '02', label: 'Run analysis',     desc: 'Detect bias across all groups',  path: '/analysis' },
  { step: '03', label: 'Get explanations', desc: 'Understand the root causes',     path: '/explain' },
  { step: '04', label: 'Apply mitigation', desc: 'Fix bias with one click',        path: '/mitigate' },
  { step: '05', label: 'Export report',    desc: 'Audit-ready documentation',      path: '/report' },
]

export default function Landing() {
  const heroRef       = useRef(null)
  const headlineRef   = useRef(null)
  const sublineRef    = useRef(null)
  const ctaRef        = useRef(null)
  const orb1Ref       = useRef(null)
  const orb2Ref       = useRef(null)
  const orb3Ref       = useRef(null)
  const featuresRef   = useRef(null)
  const statsRef      = useRef(null)
  const workflowRef   = useRef(null)
  const navigate      = useNavigate()

  useEffect(() => {
    const ctx = gsap.context(() => {

      // ── 1. Background orbs — infinite looping float ────────────
      gsap.to(orb1Ref.current, {
        x: 80, y: -60,
        duration: 9, ease: 'sine.inOut',
        yoyo: true, repeat: -1,
      })
      gsap.to(orb2Ref.current, {
        x: -60, y: 80,
        duration: 11, ease: 'sine.inOut',
        yoyo: true, repeat: -1,
        delay: 2,
      })
      gsap.to(orb3Ref.current, {
        x: 40, y: 60,
        duration: 7, ease: 'sine.inOut',
        yoyo: true, repeat: -1,
        delay: 4,
      })

      // ── 2. Hero headline — SplitType character reveal ──────────
      const splitHeadline = new SplitType(headlineRef.current, { types: 'chars,words' })
      const splitSubline  = new SplitType(sublineRef.current,  { types: 'words' })

      // Each split char needs to inherit gradient text styling
      if (splitHeadline.chars) {
        splitHeadline.chars.forEach(ch => {
          ch.style.background = 'linear-gradient(135deg, #f0f4ff 0%, #00e5ff 50%, #8b5cf6 100%)'
          ch.style.webkitBackgroundClip = 'text'
          ch.style.webkitTextFillColor = 'transparent'
          ch.style.backgroundClip = 'text'
        })
      }

      // Delay 0.8s so PageTransition reveal completes first
      const tl = gsap.timeline({ delay: 0.8 })

      // Chars animate in with blur, staggered
      tl.fromTo(splitHeadline.chars || [],
        { opacity: 0, y: 60, filter: 'blur(8px)' },
        {
          opacity: 1, y: 0, filter: 'blur(0px)',
          duration: 0.8,
          ease: 'power3.out',
          stagger: { amount: 0.6 },
        }
      )
      // Subline words slide in
      .fromTo(splitSubline.words || [],
        { opacity: 0, y: 20 },
        {
          opacity: 1, y: 0,
          duration: 0.6,
          ease: 'power3.out',
          stagger: 0.05,
        },
        '-=0.4'
      )
      // CTA buttons fade + scale in
      .fromTo(ctaRef.current.children,
        { opacity: 0, y: 20, scale: 0.95 },
        {
          opacity: 1, y: 0, scale: 1,
          duration: 0.5,
          ease: 'back.out(1.5)',
          stagger: 0.1,
        },
        '-=0.2'
      )

      // ── 3. Scroll-triggered feature cards ─────────────────────
      ScrollTrigger.batch(
        featuresRef.current.querySelectorAll('.feature-card'),
        {
          onEnter: (batch) => gsap.fromTo(batch,
            { opacity: 0, y: 50, scale: 0.97 },
            {
              opacity: 1, y: 0, scale: 1,
              duration: 0.7,
              ease: 'power3.out',
              stagger: 0.12,
            }
          ),
          start: 'top 85%',
          once: true,
        }
      )

      // ── 4. Scroll-triggered stats counter ─────────────────────
      const statEls = statsRef.current.querySelectorAll('.stat-value')
      statEls.forEach((el) => {
        const target = parseInt(el.dataset.target, 10)
        const obj = { val: 0 }
        ScrollTrigger.create({
          trigger: el,
          start: 'top 85%',
          once: true,
          onEnter: () => gsap.to(obj, {
            val: target,
            duration: 2,
            ease: 'power2.out',
            snap: { val: 1 },
            onUpdate: () => { el.textContent = Math.round(obj.val) },
          }),
        })
      })

      // ── 5. Workflow steps stagger reveal ──────────────────────
      ScrollTrigger.batch(
        workflowRef.current.querySelectorAll('.workflow-step'),
        {
          onEnter: (batch) => gsap.fromTo(batch,
            { opacity: 0, x: -30 },
            {
              opacity: 1, x: 0,
              duration: 0.6,
              ease: 'power3.out',
              stagger: 0.1,
            }
          ),
          start: 'top 85%',
          once: true,
        }
      )

      // ── 6. Section headings — word-by-word reveal on scroll ───
      document.querySelectorAll('.landing-section-title').forEach((el) => {
        const split = new SplitType(el, { types: 'words' })
        gsap.fromTo(split.words,
          { opacity: 0, y: 30 },
          {
            opacity: 1, y: 0,
            duration: 0.7,
            ease: 'power3.out',
            stagger: 0.08,
            scrollTrigger: {
              trigger: el,
              start: 'top 85%',
              once: true,
            },
          }
        )
      })

    }, heroRef)

    return () => ctx.revert()
  }, [])

  // ── Magnetic CTA handler ────────────────────────────────────────
  const handleMagneticMove = (e, el) => {
    const rect = el.getBoundingClientRect()
    const cx = rect.left + rect.width  / 2
    const cy = rect.top  + rect.height / 2
    const dx = (e.clientX - cx) * 0.3
    const dy = (e.clientY - cy) * 0.3
    gsap.to(el, { x: dx, y: dy, duration: 0.3, ease: 'power2.out' })
  }

  const handleMagneticLeave = (el) => {
    gsap.to(el, { x: 0, y: 0, duration: 0.5, ease: 'elastic.out(1, 0.5)' })
  }

  return (
    <div ref={heroRef} style={{ background: '#05080f', color: '#f0f4ff', overflowX: 'hidden' }}>

      {/* ── HERO SECTION ──────────────────────────────────────── */}
      <section style={{
        position: 'relative',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '0 24px',
        overflow: 'hidden',
      }}>
        {/* Cyber grid background */}
        <div style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'linear-gradient(rgba(0,229,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(0,229,255,0.025) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
          maskImage: 'radial-gradient(ellipse 80% 60% at 50% 50%, black 40%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(ellipse 80% 60% at 50% 50%, black 40%, transparent 100%)',
        }} />

        {/* Animated orbs */}
        <div ref={orb1Ref} className="orb orb-cyan" style={{
          width: '600px', height: '600px',
          top: '-10%', right: '-10%',
          opacity: 0.7,
        }} />
        <div ref={orb2Ref} className="orb orb-violet" style={{
          width: '500px', height: '500px',
          bottom: '-5%', left: '-5%',
          opacity: 0.6,
        }} />
        <div ref={orb3Ref} className="orb orb-emerald" style={{
          width: '300px', height: '300px',
          top: '40%', left: '20%',
          opacity: 0.4,
        }} />

        {/* Badge */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 20px',
          borderRadius: '100px',
          background: 'rgba(0,229,255,0.08)',
          border: '0.5px solid rgba(0,229,255,0.25)',
          fontSize: '12px',
          fontWeight: 500,
          color: '#00e5ff',
          marginBottom: '32px',
          fontFamily: '"Space Grotesk", sans-serif',
          letterSpacing: '0.05em',
          position: 'relative',
          zIndex: 1,
        }}>
          <span style={{
            width: '6px', height: '6px',
            borderRadius: '50%',
            background: '#00e5ff',
            animation: 'pulseGlow 2s ease-in-out infinite',
          }} />
          AI-POWERED BIAS DETECTION PLATFORM
        </div>

        {/* Headline */}
        <h1
          ref={headlineRef}
          style={{
            fontFamily: '"Space Grotesk", sans-serif',
            fontSize: 'clamp(48px, 8vw, 96px)',
            fontWeight: 500,
            letterSpacing: '-0.03em',
            lineHeight: 1.05,
            maxWidth: '900px',
            marginBottom: '24px',
            position: 'relative',
            zIndex: 1,
            /* Gradient text */
            background: 'linear-gradient(135deg, #f0f4ff 0%, #00e5ff 50%, #8b5cf6 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          FairSight AI.
        </h1>

        {/* Subline */}
        <p
          ref={sublineRef}
          style={{
            fontFamily: 'Inter, sans-serif',
            fontSize: 'clamp(16px, 2vw, 20px)',
            color: '#7a86a1',
            maxWidth: '560px',
            lineHeight: 1.7,
            marginBottom: '48px',
            position: 'relative',
            zIndex: 1,
          }}
        >
          Upload your dataset. Detect hidden disparities. Understand why they exist. Fix them automatically.
        </p>

        {/* CTAs */}
        <div
          ref={ctaRef}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            flexWrap: 'wrap',
            justifyContent: 'center',
            position: 'relative',
            zIndex: 1,
          }}
        >
          <button
            className="btn-primary"
            style={{ fontSize: '16px', padding: '16px 36px' }}
            onClick={() => navigate('/upload')}
            onMouseMove={(e) => handleMagneticMove(e, e.currentTarget)}
            onMouseLeave={(e) => handleMagneticLeave(e.currentTarget)}
          >
            Start Analysing →
          </button>
          <button
            className="btn-ghost"
            style={{ fontSize: '16px', padding: '16px 36px' }}
            onClick={() => navigate('/dashboard')}
            onMouseMove={(e) => handleMagneticMove(e, e.currentTarget)}
            onMouseLeave={(e) => handleMagneticLeave(e.currentTarget)}
          >
            View Dashboard
          </button>
        </div>

        {/* Scroll cue */}
        <div style={{
          position: 'absolute',
          bottom: '40px',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px',
          opacity: 0.4,
          zIndex: 1,
        }}>
          <span style={{ fontSize: '11px', fontFamily: '"Space Grotesk", sans-serif', letterSpacing: '0.15em' }}>SCROLL</span>
          <div style={{
            width: '20px', height: '32px',
            border: '0.5px solid rgba(255,255,255,0.3)',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            padding: '6px',
          }}>
            <div style={{
              width: '3px', height: '8px',
              background: '#00e5ff',
              borderRadius: '2px',
              animation: 'float 1.5s ease-in-out infinite',
            }} />
          </div>
        </div>
      </section>

      {/* ── STATS SECTION ─────────────────────────────────────── */}
      <section
        ref={statsRef}
        style={{ padding: '80px 24px', maxWidth: '1100px', margin: '0 auto' }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '24px' }}>
          {STATS.map((s) => (
            <div key={s.label} className="glass-card" style={{ padding: '32px 24px', textAlign: 'center' }}>
              <div style={{
                fontFamily: '"Space Grotesk", sans-serif',
                fontSize: '56px',
                fontWeight: 600,
                letterSpacing: '-0.04em',
                color: '#00e5ff',
                lineHeight: 1,
                marginBottom: '8px',
              }}>
                <span className="stat-value" data-target={s.value}>0</span>
                <span>{s.suffix}</span>
              </div>
              <div style={{ fontSize: '13px', color: '#7a86a1', fontFamily: 'Inter, sans-serif' }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURES SECTION ──────────────────────────────────── */}
      <section
        ref={featuresRef}
        style={{ padding: '80px 24px', maxWidth: '1100px', margin: '0 auto' }}
      >
        <div style={{ textAlign: 'center', marginBottom: '64px' }}>
          <h2
            className="landing-section-title"
            style={{
              fontFamily: '"Space Grotesk", sans-serif',
              fontSize: 'clamp(32px, 5vw, 52px)',
              fontWeight: 500,
              letterSpacing: '-0.025em',
              color: '#f0f4ff',
            }}
          >
            Everything you need for AI fairness
          </h2>
          <p style={{ color: '#7a86a1', marginTop: '16px', fontSize: '16px', fontFamily: 'Inter, sans-serif' }}>
            From raw data to bias-free models in minutes.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '24px' }}>
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="glass-card glass-card-hover feature-card"
              style={{ padding: '36px', cursor: 'none' }}
            >
              <div style={{
                width: '52px', height: '52px',
                borderRadius: '14px',
                background: `rgba(${f.accent === '#00e5ff' ? '0,229,255' : f.accent === '#8b5cf6' ? '139,92,246' : f.accent === '#10b981' ? '16,185,129' : '245,158,11'},0.12)`,
                border: `0.5px solid ${f.accent}40`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '22px',
                color: f.accent,
                marginBottom: '24px',
              }}>
                {f.icon}
              </div>
              <h3 style={{
                fontFamily: '"Space Grotesk", sans-serif',
                fontSize: '20px',
                fontWeight: 500,
                color: '#f0f4ff',
                marginBottom: '12px',
              }}>{f.title}</h3>
              <p style={{
                fontSize: '14px',
                color: '#7a86a1',
                lineHeight: 1.7,
                fontFamily: 'Inter, sans-serif',
              }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── WORKFLOW SECTION ──────────────────────────────────── */}
      <section
        ref={workflowRef}
        style={{ padding: '80px 24px', maxWidth: '800px', margin: '0 auto' }}
      >
        <div style={{ textAlign: 'center', marginBottom: '64px' }}>
          <h2
            className="landing-section-title"
            style={{
              fontFamily: '"Space Grotesk", sans-serif',
              fontSize: 'clamp(28px, 4vw, 44px)',
              fontWeight: 500,
              letterSpacing: '-0.025em',
              color: '#f0f4ff',
            }}
          >
            Five steps to fairer AI
          </h2>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {WORKFLOW.map((w, i) => (
            <div
              key={w.step}
              className="workflow-step glass-card glass-card-hover"
              onClick={() => navigate(w.path)}
              onMouseMove={(e) => handleMagneticMove(e, e.currentTarget)}
              onMouseLeave={(e) => handleMagneticLeave(e.currentTarget)}
              style={{
                padding: '24px 28px',
                display: 'flex',
                alignItems: 'center',
                gap: '24px',
                cursor: 'none',
              }}
            >
              <div style={{
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: '13px',
                color: '#00e5ff',
                opacity: 0.6,
                minWidth: '28px',
              }}>{w.step}</div>
              <div style={{
                width: '1px',
                height: '40px',
                background: 'rgba(0,229,255,0.2)',
              }} />
              <div>
                <div style={{
                  fontFamily: '"Space Grotesk", sans-serif',
                  fontSize: '16px',
                  fontWeight: 500,
                  color: '#f0f4ff',
                  marginBottom: '4px',
                }}>{w.label}</div>
                <div style={{
                  fontSize: '13px',
                  color: '#7a86a1',
                  fontFamily: 'Inter, sans-serif',
                }}>{w.desc}</div>
              </div>
              <div style={{ marginLeft: 'auto', color: '#00e5ff', opacity: 0.4, fontSize: '18px' }}>→</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FINAL CTA SECTION ─────────────────────────────────── */}
      <section style={{
        padding: '120px 24px',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute',
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '600px', height: '400px',
          background: 'radial-gradient(ellipse, rgba(0,229,255,0.06) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        <h2
          className="landing-section-title"
          style={{
            fontFamily: '"Space Grotesk", sans-serif',
            fontSize: 'clamp(32px, 5vw, 56px)',
            fontWeight: 500,
            letterSpacing: '-0.03em',
            color: '#f0f4ff',
            marginBottom: '24px',
            position: 'relative',
          }}
        >
          Ready to make AI fair?
        </h2>
        <p style={{
          color: '#7a86a1',
          fontSize: '18px',
          marginBottom: '48px',
          fontFamily: 'Inter, sans-serif',
          position: 'relative',
        }}>
          No configuration required. Upload a CSV and get results in seconds.
        </p>
        <button
          className="btn-primary"
          style={{ fontSize: '18px', padding: '18px 48px', position: 'relative' }}
          onClick={() => navigate('/upload')}
          onMouseMove={(e) => handleMagneticMove(e, e.currentTarget)}
          onMouseLeave={(e) => handleMagneticLeave(e.currentTarget)}
        >
          Upload Your First Dataset →
        </button>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────── */}
      <footer style={{
        borderTop: '0.5px solid rgba(255,255,255,0.06)',
        padding: '32px 48px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        color: '#3d4a66',
        fontSize: '12px',
        fontFamily: 'Inter, sans-serif',
      }}>
        <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 500, color: '#7a86a1' }}>
          FairLens
        </span>
        <span>AI Bias Detection Platform</span>
      </footer>
    </div>
  )
}
