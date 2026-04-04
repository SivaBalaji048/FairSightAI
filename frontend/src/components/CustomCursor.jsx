import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'

export default function CustomCursor() {
  const dotRef  = useRef(null)
  const ringRef = useRef(null)

  useEffect(() => {
    const dot  = dotRef.current
    const ring = ringRef.current
    if (!dot || !ring) return

    // QuickTo setters for maximum performance
    const moveDotX  = gsap.quickTo(dot,  'x', { duration: 0.1, ease: 'power3.out' })
    const moveDotY  = gsap.quickTo(dot,  'y', { duration: 0.1, ease: 'power3.out' })
    const moveRingX = gsap.quickTo(ring, 'x', { duration: 0.4, ease: 'power3.out' })
    const moveRingY = gsap.quickTo(ring, 'y', { duration: 0.4, ease: 'power3.out' })

    const onMove = (e) => {
      moveDotX(e.clientX)
      moveDotY(e.clientY)
      moveRingX(e.clientX)
      moveRingY(e.clientY)
    }

    // Hover state: expand ring over interactive elements
    const onEnter = () => document.body.classList.add('cursor-hover')
    const onLeave = () => document.body.classList.remove('cursor-hover')

    window.addEventListener('mousemove', onMove)

    // Attach to all interactive elements
    const addListeners = () => {
      const els = document.querySelectorAll('a, button, [data-cursor], .glass-card-hover, input, select, textarea, label[for]')
      els.forEach(el => {
        el.addEventListener('mouseenter', onEnter)
        el.addEventListener('mouseleave', onLeave)
      })
    }

    addListeners()

    // Re-attach on DOM mutations (React re-renders)
    const observer = new MutationObserver(addListeners)
    observer.observe(document.body, { childList: true, subtree: true })

    return () => {
      window.removeEventListener('mousemove', onMove)
      observer.disconnect()
    }
  }, [])

  return (
    <>
      <div id="cursor-dot"  ref={dotRef}  />
      <div id="cursor-ring" ref={ringRef} />
    </>
  )
}
