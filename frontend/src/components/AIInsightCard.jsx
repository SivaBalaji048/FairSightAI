import { useState } from 'react'

const SEVERITY_STYLES = {
  high: { bg: 'bg-red-50', border: 'border-red-400', badge: 'bg-red-600', text: 'text-red-900' },
  medium: { bg: 'bg-amber-50', border: 'border-amber-400', badge: 'bg-amber-500', text: 'text-amber-900' },
  low: { bg: 'bg-green-50', border: 'border-green-400', badge: 'bg-green-600', text: 'text-green-900' },
}

export default function AIInsightCard({ title = 'AI Analysis', severity, summary, mode = 'simple', recommendations = [] }) {
  const [expanded, setExpanded] = useState(true)
  const s = severity ? SEVERITY_STYLES[severity.toLowerCase()] || SEVERITY_STYLES.medium : SEVERITY_STYLES.medium

  return (
    <div className={`card ${s.bg} border-l-4 ${s.border}`}>
      <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-3">
          <h4 className="font-semibold">AI Insight</h4>
          {severity && (
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold text-white ${s.badge}`}>
              {severity.toUpperCase()}
            </span>
          )}
          {mode && <span className="badge">{mode}</span>}
        </div>
        <span className="text-gray-400 text-lg">{expanded ? '▾' : '▸'}</span>
      </div>

      {expanded && (
        <div className={`mt-4 text-sm ${s.text} space-y-3`}>
          {summary && <p className="leading-relaxed">{summary}</p>}
          {recommendations && recommendations.length > 0 && (
            <div>
              <h5 className="font-semibold mt-3 mb-2">Recommendations</h5>
              <ul className="list-disc list-inside space-y-1">
                {recommendations.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
