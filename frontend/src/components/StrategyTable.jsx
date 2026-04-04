import { useState, useMemo } from 'react'

const REC_COLORS = { recommended: 'text-green-700', consider: 'text-amber-700', not_recommended: 'text-red-700' }
const REC_ICONS = { recommended: '✓', consider: '~', not_recommended: '✗' }

function sortableHeader(label, sortKey, currentSort, setSort) {
  const arrow = currentSort.key === sortKey ? (currentSort.dir === 'asc' ? ' ↑' : ' ↓') : ''
  return (
    <th
      className="pb-2 cursor-pointer hover:text-fairlens-600 select-none"
      onClick={() => setSort({ key: sortKey, dir: currentSort.key === sortKey && currentSort.dir === 'asc' ? 'desc' : 'asc' })}
    >
      {label}{arrow}
    </th>
  )
}

export default function StrategyTable({ strategies = [] }) {
  const [sort, setSort] = useState({ key: 'fairness_score_after', dir: 'desc' })

  const sorted = useMemo(() => {
    return [...strategies].sort((a, b) => {
      const aVal = a[sort.key] ?? 0
      const bVal = b[sort.key] ?? 0
      return sort.dir === 'asc' ? aVal - bVal : bVal - aVal
    })
  }, [strategies, sort])

  if (!strategies.length) {
    return <div className="card"><p className="text-gray-500 text-sm">No mitigation strategies available.</p></div>
  }

  return (
    <div className="card">
      <h4 className="font-semibold mb-3">Mitigation Strategy Comparison</h4>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-gray-500 border-b">
            <tr>
              {sortableHeader('Strategy', 'strategy', sort, setSort)}
              {sortableHeader('Type', 'category', sort, setSort)}
              {sortableHeader('Fairness Before', 'fairness_score_before', sort, setSort)}
              {sortableHeader('Fairness After', 'fairness_score_after', sort, setSort)}
              {sortableHeader('Accuracy Before', 'accuracy_before', sort, setSort)}
              {sortableHeader('Accuracy After', 'accuracy_after', sort, setSort)}
              {sortableHeader('Δ Fairness', 'fairness_improvement', sort, setSort)}
              {sortableHeader('Δ Accuracy', 'accuracy_change', sort, setSort)}
              <th className="pb-2">Recommendation</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s, i) => {
              const rec = s.recommendation || 'not_recommended'
              const deltaFair = s.fairness_improvement
              const deltaAcc = s.accuracy_change
              return (
                <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-2 font-medium capitalize">{s.strategy?.replace(/_/g, ' ')}</td>
                  <td className="py-2 text-gray-500">{s.category}</td>
                  <td className="py-2 font-mono">{s.fairness_score_before?.toFixed?.(2) ?? s.fairness_score_before}</td>
                  <td className="py-2 font-mono font-bold">{s.fairness_score_after?.toFixed?.(2) ?? s.fairness_score_after}</td>
                  <td className="py-2 font-mono">{s.accuracy_before ?? 'N/A'}</td>
                  <td className="py-2 font-mono">{s.accuracy_after ?? 'N/A'}</td>
                  <td className={`py-2 font-mono ${deltaFair > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {deltaFair > 0 ? '+' : ''}{deltaFair?.toFixed?.(2) ?? deltaFair}
                  </td>
                  <td className={`py-2 font-mono ${deltaAcc < 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {deltaAcc >= 0 ? '+' : ''}{deltaAcc?.toFixed?.(2) ?? deltaAcc}
                  </td>
                  <td className={`py-2 font-semibold ${REC_COLORS[rec]}`}>
                    {REC_ICONS[rec]} {rec.replace(/_/g, ' ')}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
        <span>✓ Recommended</span>
        <span>~ Consider</span>
        <span>✗ Not Recommended</span>
      </div>
    </div>
  )
}
