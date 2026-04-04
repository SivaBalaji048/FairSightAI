import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'

export default function BiasGauge({ score = 0, size = 160, label = null }) {
  const arcRef = useRef(null)
  const textRef = useRef(null)

  const clamped = Math.min(100, Math.max(0, score))
  const color = clamped <= 30
    ? '#10b981'   // low risk — emerald
    : clamped <= 60
    ? '#f59e0b'   // medium — amber
    : '#ef4444'   // high — red

  const riskLabel = clamped <= 30 ? 'LOW RISK' : clamped <= 60 ? 'MED RISK' : 'HIGH RISK'

  const radius      = (size / 2) - 12
  const strokeW     = 8
  const circumf     = Math.PI * radius
  const targetDash  = (clamped / 100) * circumf

  useEffect(() => {
    if (!arcRef.current) return
    // Animate from 0 to targetDash
    gsap.fromTo(arcRef.current,
      { strokeDashoffset: circumf },
      {
        strokeDashoffset: circumf - targetDash,
        duration: 1.4,
        ease: 'power2.out',
        delay: 0.2,
      }
    )
    // Animate text counter
    if (textRef.current) {
      const obj = { val: 0 }
      gsap.to(obj, {
        val: clamped,
        duration: 1.2,
        ease: 'power2.out',
        delay: 0.2,
        snap: { val: 1 },
        onUpdate: () => { if (textRef.current) textRef.current.textContent = Math.round(obj.val) },
      })
    }
  }, [score])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
      <svg width={size} height={size / 2 + 20} viewBox={`0 0 ${size} ${size / 2 + 20}`}>
        {/* Background track */}
        <path
          d={`M ${12} ${size/2} A ${radius} ${radius} 0 0 1 ${size-12} ${size/2}`}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={strokeW}
          strokeLinecap="round"
        />
        {/* Animated value arc */}
        <path
          ref={arcRef}
          d={`M ${12} ${size/2} A ${radius} ${radius} 0 0 1 ${size-12} ${size/2}`}
          fill="none"
          stroke={color}
          strokeWidth={strokeW}
          strokeLinecap="round"
          strokeDasharray={circumf}
          strokeDashoffset={circumf}
          style={{ filter: `drop-shadow(0 0 6px ${color}60)` }}
        />
        {/* Score number */}
        <text
          ref={textRef}
          x={size / 2}
          y={size / 2 - 4}
          textAnchor="middle"
          fill={color}
          fontSize={size * 0.22}
          fontFamily='"Space Grotesk", sans-serif'
          fontWeight="500"
        >
          0
        </text>
        {/* Risk label */}
        <text
          x={size / 2}
          y={size / 2 + 14}
          textAnchor="middle"
          fill="rgba(122,134,161,0.8)"
          fontSize="9"
          fontFamily='"Space Grotesk", sans-serif'
          fontWeight="500"
          letterSpacing="0.1em"
        >
          {riskLabel}
        </text>
      </svg>
      {label && (
        <span style={{ fontSize: '11px', color: '#7a86a1', fontFamily: 'Inter, sans-serif' }}>{label}</span>
      )}
    </div>
  )
}
