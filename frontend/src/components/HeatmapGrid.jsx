export default function HeatmapGrid({ data = [], rows = [], cols = [], rowKey, colKey, valueKey, title = 'Heatmap' }) {
  if (!data.length) return null

  // If rows/cols not specified, auto-extract
  if (!rows.length) rows = [...new Set(data.map(d => d[rowKey]))]
  if (!cols.length) cols = [...new Set(data.map(d => d[colKey]))]

  const getVal = (r, c) => {
    const item = data.find(d => d[rowKey] === r && d[colKey] === c)
    return item ? item[valueKey] : 0
  }

  const colorFor = (v) => {
    const abs = Math.abs(v)
    if (abs > 0.6) return v > 0 ? '#EF4444' : '#EF4444'
    if (abs > 0.3) return v > 0 ? '#F59E0B' : '#F59E0B'
    return '#D1D5DB'
  }

  return (
    <div className="card">
      <h4 className="font-semibold mb-3">{title}</h4>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className="p-1 text-left text-gray-500 min-w-[120px]"></th>
              {cols.map(c => <th key={c} className="p-1 text-gray-600 font-medium truncate max-w-[160px]">{String(c)}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r}>
                <td className="p-1 text-gray-700 font-medium truncate max-w-[120px]">{String(r)}</td>
                {cols.map(c => {
                  const val = getVal(r, c)
                  return (
                    <td key={c} className="p-1">
                      <div
                        className="rounded-sm px-2 py-1.5 text-center font-mono text-white"
                        style={{ backgroundColor: colorFor(val) }}
                        title={`${r} × ${c}: ${val}`}
                      >
                        {typeof val === 'number' ? val.toFixed(2) : val}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
