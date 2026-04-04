import { useRef, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { gsap } from 'gsap'

const NAV_ITEMS = [
  { path: '/dashboard', label: 'Dashboard', icon: '◈' },
  { path: '/upload',    label: 'Upload',    icon: '↑' },
  { path: '/analysis',  label: 'Analysis',  icon: '◎' },
  { path: '/explain',   label: 'Explain',   icon: '◉' },
  { path: '/mitigate',  label: 'Mitigate',  icon: '◐' },
  { path: '/report',    label: 'Report',    icon: '▤' },
]

export default function Navbar() {
  const location  = useLocation()
  const navRef    = useRef(null)
  const logoRef   = useRef(null)
  const linksRef  = useRef([])
  const indicatorRef = useRef(null)
  const [scrolled, setScrolled] = useState(false)

  // ── Entry animation ────────────────────────────────────
  useEffect(() => {
    const ctx = gsap.context(() => {
      // Logo letter-by-letter reveal
      gsap.fromTo(logoRef.current,
        { opacity: 0, x: -20 },
        { opacity: 1, x: 0, duration: 0.8, ease: 'power3.out', delay: 0.1 }
      )

      // Nav links stagger in from top
      gsap.fromTo(linksRef.current.filter(Boolean),
        { opacity: 0, y: -12 },
        {
          opacity: 1, y: 0,
          duration: 0.6,
          ease: 'power3.out',
          stagger: 0.06,
          delay: 0.3,
        }
      )
    }, navRef)

    return () => ctx.revert()
  }, [])

  // ── Scroll: add glass blur when scrolled ───────────────
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // ── Magnetic effect on nav links ───────────────────────
  const handleLinkMouseMove = (e, el) => {
    if (!el) return
    const rect = el.getBoundingClientRect()
    const cx = rect.left + rect.width  / 2
    const cy = rect.top  + rect.height / 2
    const dx = (e.clientX - cx) * 0.25
    const dy = (e.clientY - cy) * 0.25
    gsap.to(el, { x: dx, y: dy, duration: 0.3, ease: 'power2.out' })
  }

  const handleLinkMouseLeave = (el) => {
    if (!el) return
    gsap.to(el, { x: 0, y: 0, duration: 0.4, ease: 'elastic.out(1, 0.5)' })
  }

  // ── Hide navbar on landing page ────────────────────────
  if (location.pathname === '/') return null

  return (
    <nav
      ref={navRef}
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0,
        zIndex: 1000,
        height: '64px',
        display: 'flex',
        alignItems: 'center',
        paddingLeft: '32px',
        paddingRight: '32px',
        background: scrolled
          ? 'rgba(5,8,15,0.85)'
          : 'rgba(5,8,15,0.4)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        borderBottom: scrolled
          ? '0.5px solid rgba(255,255,255,0.08)'
          : '0.5px solid transparent',
        transition: 'background 0.4s ease, border-color 0.4s ease',
      }}
    >
      {/* Logo */}
      <Link
        to="/"
        ref={logoRef}
        style={{
          fontFamily: '"Space Grotesk", sans-serif',
          fontWeight: 600,
          fontSize: '20px',
          letterSpacing: '-0.03em',
          color: '#f0f4ff',
          textDecoration: 'none',
          marginRight: 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <span style={{
          width: '28px', height: '28px',
          background: 'linear-gradient(135deg, #00e5ff, #8b5cf6)',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '14px',
          fontWeight: 600,
          color: '#05080f',
        }}>F</span>
        FairSight AI
      </Link>

      {/* Nav links */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        {NAV_ITEMS.map((item, i) => {
          const isActive = location.pathname === item.path ||
            (item.path !== '/' && location.pathname.startsWith(item.path))
          return (
            <Link
              key={item.path}
              to={item.path}
              ref={el => linksRef.current[i] = el}
              onMouseMove={(e) => handleLinkMouseMove(e, linksRef.current[i])}
              onMouseLeave={() => handleLinkMouseLeave(linksRef.current[i])}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '100px',
                textDecoration: 'none',
                fontFamily: '"Space Grotesk", sans-serif',
                fontSize: '13px',
                fontWeight: 500,
                letterSpacing: '0.01em',
                transition: 'background 0.2s ease, color 0.2s ease',
                background: isActive ? 'rgba(0,229,255,0.1)' : 'transparent',
                color: isActive ? '#00e5ff' : '#7a86a1',
                border: isActive ? '0.5px solid rgba(0,229,255,0.25)' : '0.5px solid transparent',
              }}
            >
              <span style={{ fontSize: '11px' }}>{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
