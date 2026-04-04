import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts'

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899']

export default function FairnessChart({ data = [], title = 'Group Outcome Rates' }) {
  // data: [{ group: 'Male', positive_rate: 0.7, count: 500 }, ...]
  return (
    <div className="card">
      <h4 className="font-semibold mb-2">{title}</h4>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
          <XAxis dataKey="group" tick={{ fontSize: 12 }} />
          <YAxis domain={[0, 1]} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} tick={{ fontSize: 12 }} />
          <Tooltip formatter={(v) => `${(v * 100).toFixed(1)}%`} />
          <Bar dataKey="positive_rate" radius={[4, 4, 0, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {/* Threshold line indicator */}
      <div className="flex items-center gap-2 mt-2 px-2">
        <div className="w-3 h-3 rounded-full bg-red-500" />
        <span className="text-xs text-gray-500">Four-fifths threshold: 0.80 disparate impact ratio = Fair</span>
      </div>
    </div>
  )
}
