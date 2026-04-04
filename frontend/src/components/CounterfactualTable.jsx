export default function CounterfactualTable({ groupComparison = {} }) {
  if (!Object.keys(groupComparison).length) {
    return (
      <div className="card">
        <p className="text-gray-500 text-sm">No counterfactual data available.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {Object.entries(groupComparison).map(([attr, groups]) => (
        <div key={attr} className="card">
          <h4 className="font-semibold mb-3 capitalize">{attr.replace(/_/g, ' ')} — Counterfactual Changes Needed</h4>
          <table className="w-full text-sm">
            <thead className="text-left text-gray-500 border-b">
              <tr>
                <th className="pb-2">Group</th>
                <th className="pb-2">Avg Changes Needed</th>
                <th className="pb-2">Most Common Features Changed</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(groups).map(([group, data]) => (
                <tr key={group} className="border-b border-gray-100">
                  <td className="py-2 font-medium">{group}</td>
                  <td className="py-2">{data.avg_changes ?? 'N/A'}</td>
                  <td className="py-2">
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(data.most_changed_features || {}).map(([feat, count]) => (
                        <span key={feat} className="badge">{feat}: {count}x</span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}
