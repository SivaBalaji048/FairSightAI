import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { gsap } from 'gsap'

export default function PageTransition({ children }) {
  const location = useLocation()
  const overlayRef = useRef(null)
  const contentRef = useRef(null)

  useEffect(() => {
    const overlay  = overlayRef.current
    const content  = contentRef.current
    if (!overlay || !content) return

    // Kill any running tweens on these elements
    gsap.killTweensOf([overlay, content])

    // Timeline: overlay sweeps across, then content fades in
    const tl = gsap.timeline()

    // Overlay sweeps in from left
    tl.fromTo(overlay,
      { clipPath: 'polygon(0 0, 0 0, 0 100%, 0% 100%)' },
      { clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0% 100%)', duration: 0.35, ease: 'power4.inOut' }
    )
    // Overlay sweeps out to right
    .to(overlay,
      { clipPath: 'polygon(100% 0, 100% 0, 100% 100%, 100% 100%)', duration: 0.35, ease: 'power4.inOut' },
      '+=0.05'
    )
    // Content fades in
    .fromTo(content,
      { opacity: 0, y: 16 },
      { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out' },
      '-=0.2'
    )

    return () => tl.kill()
  }, [location.pathname])

  return (
    <>
      {/* Transition overlay — cyan sweep */}
      <div
        ref={overlayRef}
        style={{
          position: 'fixed',
          top: 0, left: 0,
          width: '100%', height: '100%',
          background: 'linear-gradient(135deg, #00e5ff, #8b5cf6)',
          zIndex: 9000,
          pointerEvents: 'none',
          clipPath: 'polygon(100% 0, 100% 0, 100% 100%, 100% 100%)',
        }}
      />
      <div ref={contentRef} style={{ opacity: 0 }}>
        {children}
      </div>
    </>
  )
}
