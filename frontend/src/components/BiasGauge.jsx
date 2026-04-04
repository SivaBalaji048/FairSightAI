import { useCallback } from 'react'

export default function BiasGauge({ score = 0, size = 200, label = 'Bias Risk Score' }) {
  const clamped = Math.min(100, Math.max(0, score))
  const color = clamped >= 60 ? '#EF4444' : clamped >= 30 ? '#F59E0B' : '#22C55E'
  const severity = clamped >= 60 ? 'High' : clamped >= 30 ? 'Medium' : 'Low'
  const radius = 90
  const stroke = 14
  const circumference = Math.PI * radius
  const progress = (clamped / 100) * circumference
  const cx = size / 2

  const getGradientId = useCallback(() => `gauge-${color.replace('#', '')}`, [color])

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size / 2 + 30} viewBox={`0 0 ${size} ${size / 2 + 30}`}>
        <defs>
          <linearGradient id={getGradientId()} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#22C55E" />
            <stop offset="50%" stopColor="#F59E0B" />
            <stop offset="100%" stopColor="#EF4444" />
          </linearGradient>
        </defs>
        {/* Background arc */}
        <path
          d={`M ${cx} ${size / 2 + 20} A ${radius} ${radius} 0 0 1 ${cx + radius} ${size / 2 + 20}`}
          fill="none"
          stroke="#E5E7EB"
          strokeWidth={stroke}
          strokeLinecap="round"
        />
        {/* Progress arc */}
        <path
          d={`M ${cx} ${size / 2 + 20} A ${radius} ${radius} 0 0 1 ${cx + radius} ${size / 2 + 20}`}
          fill="none"
          stroke={`url(#${getGradientId()})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
        />
        {/* Score text */}
        <text x={cx} y={size / 2 + 8} textAnchor="middle" fontSize="36" fontWeight="bold" fill={color}>
          {Math.round(clamped)}
        </text>
        <text x={cx} y={size / 2 + 24} textAnchor="middle" fontSize="11" fill="#6B7280">/ 100</text>
      </svg>
      <span className="text-xs font-semibold mt-1" style={{ color }}>{severity} Risk</span>
    </div>
  )
}
