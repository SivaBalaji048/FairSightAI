import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { API_BASE } from '../config'
import BiasGauge from '../components/BiasGauge'

export default function Dashboard() {
  const [analyses, setAnalyses] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    axios.get(`${API_BASE}/analyses`)
      .then(res => setAnalyses(res.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const stats = {
    total: analyses.length,
    fair: analyses.filter(a => a.overall_fairness?.toLowerCase() === 'fair' || a.overall_fairness?.toLowerCase() === 'low').length,
    questionable: analyses.filter(a => a.overall_fairness?.toLowerCase() === 'questionable' || a.overall_fairness?.toLowerCase() === 'medium').length,
    unfair: analyses.filter(a => a.overall_fairness?.toLowerCase() === 'unfair' || a.overall_fairness?.toLowerCase() === 'high').length,
  }
  const avgRisk = analyses.length ? Math.round(analyses.reduce((s, a) => s + (a.disparity_ratio || 0) * 100, 0) / analyses.length) : 0

  if (loading) return <div className="flex items-center justify-center py-20 text-gray-500">Loading dashboard...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Dashboard</h2>
          <p className="text-sm text-gray-500 mt-1">AI Bias Detection overview</p>
        </div>
        <Link to="/upload" className="btn-primary">+ Upload Dataset</Link>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
        <div className="metric-card">
          <p className="text-xs uppercase tracking-wider text-gray-500">Datasets Analyzed</p>
          <p className="text-3xl font-bold mt-2">{stats.total}</p>
        </div>
        <div className="metric-card border-l-4 border-green-500">
          <p className="text-xs uppercase tracking-wider text-gray-500">Fair</p>
          <p className="text-3xl font-bold mt-2 text-green-600">{stats.fair}</p>
        </div>
        <div className="metric-card border-l-4 border-amber-500">
          <p className="text-xs uppercase tracking-wider text-gray-500">Questionable</p>
          <p className="text-3xl font-bold mt-2 text-amber-600">{stats.questionable}</p>
        </div>
        <div className="metric-card border-l-4 border-red-500">
          <p className="text-xs uppercase tracking-wider text-gray-500">Biased</p>
          <p className="text-3xl font-bold mt-2 text-red-600">{stats.unfair}</p>
        </div>
        <div className="metric-card flex items-center justify-center">
          <BiasGauge score={avgRisk} size={140} />
        </div>
      </div>

      {/* Recent Activity */}
      <div className="card">
        <h3 className="font-semibold mb-4">Recent Activity</h3>
        {analyses.length ? (
          <div className="space-y-3">
            {analyses.slice(0, 10).map(a => {
              const color = a.overall_fairness?.toLowerCase()?.includes('unfair') || a.overall_fairness?.toLowerCase() === 'high'
                ? 'bg-red-100 text-red-800'
                : a.overall_fairness?.toLowerCase()?.includes('questionable') || a.overall_fairness?.toLowerCase() === 'medium'
                ? 'bg-amber-100 text-amber-800'
                : 'bg-green-100 text-green-800'
              return (
                <div key={a.analysis_id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${
                      a.overall_fairness?.toLowerCase()?.includes('unfair') ? 'bg-red-500'
                      : a.overall_fairness?.toLowerCase()?.includes('question') ? 'bg-amber-500'
                      : 'bg-green-500'
                    }`} />
                    <div>
                      <p className="font-medium text-sm">{a.dataset_name}</p>
                      <p className="text-xs text-gray-500">{a.dataset_type} • {new Date(a.timestamp).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${color}`}>
                    {a.overall_fairness}
                  </span>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-500 mb-3">No analyses yet.</p>
            <Link to="/upload" className="text-fairlens-600 hover:underline font-medium">
              Upload a dataset to get started →
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
