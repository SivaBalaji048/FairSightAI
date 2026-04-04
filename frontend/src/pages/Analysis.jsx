import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer } from 'recharts'
import { API_BASE } from '../config'
import BiasGauge from '../components/BiasGauge'
import AIInsightCard from '../components/AIInsightCard'
import FairnessChart from '../components/FairnessChart'

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899']

export default function Analysis() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const handleAnalyze = async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const res = await axios.post(`${API_BASE}/analyze/dataset/${id}`, { domain: 'general' })
      setResult(res.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Analysis failed. Make sure the dataset is configured first.')
    } finally {
      setLoading(false)
    }
  }

  if (!result) {
    return (
      <div>
        <h2 className="text-2xl font-bold mb-6">Bias Analysis</h2>
        <div className="card max-w-md">
          <p className="text-sm text-gray-500 mb-4">Run a comprehensive bias analysis on the configured dataset.</p>
          {error && <div className="mb-4 p-3 bg-red-50 rounded text-red-700 text-sm">{error}</div>}
          <button onClick={handleAnalyze} disabled={loading} className="btn-primary w-full disabled:opacity-50">
            {loading ? 'Analyzing...' : 'Run Analysis'}
          </button>
        </div>
      </div>
    )
  }

  const riskScore = result.risk_score ?? 0
  const narrative = result.narrative || {}
  const metrics = result.metrics || {}
  const intersectional = result.intersectional || {}
  const modelPerf = result.model_performance || {}

  // Build chart data from per-group stats
  const chartData = []
  Object.entries(metrics).forEach(([attr, data]) => {
    const groups = data.per_group_stats || {}
    Object.entries(groups).forEach(([group, info]) => {
      chartData.push({ group: `${attr}: ${group}`, positive_rate: info.positive_rate, count: info.count })
    })
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Bias Analysis Results</h2>
          <p className="text-sm text-gray-500 mt-1">Dataset audit report</p>
        </div>
        <button onClick={() => navigate(`/explain/${id}`)} className="btn-primary">Explain this →</button>
      </div>

      {/* Risk Gauge */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="card flex-1 flex items-center justify-center">
          <BiasGauge score={riskScore} size={220} />
        </div>
        <div className="card flex-1">
          <h4 className="font-semibold mb-2">Key Findings</h4>
          <div className="space-y-2 text-sm">
            {narrative.key_finding && <p className="font-medium">{narrative.key_finding}</p>}
            {narrative.affected_groups?.length > 0 && (
              <div>
                <p className="text-gray-500 text-xs uppercase">Affected Groups</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {narrative.affected_groups.map((g, i) => <span key={i} className="badge">{g}</span>)}
                </div>
              </div>
            )}
            {narrative.severity && (
              <div>
                <p className="text-gray-500 text-xs uppercase">Severity</p>
                <span className={`badge-${narrative.severity.toLowerCase()}`}>{narrative.severity}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* AI Narrative */}
      {narrative.summary && (
        <AIInsightCard
          title="AI Bias Narrative"
          severity={narrative.severity}
          summary={narrative.summary}
          recommendations={narrative.recommendations}
          className="mb-6"
        />
      )}

      {/* Disparate Impact Chart */}
      <div className="mb-6">
        <FairnessChart data={chartData} title="Group Outcome Rates" />
      </div>

      {/* Intersectional Bias Table */}
      {intersectional.flags?.length > 0 && (
        <div className="card mb-6">
          <h4 className="font-semibold mb-3">Intersectional Bias Flags</h4>
          <table className="w-full text-sm">
            <thead className="text-left text-gray-500 border-b">
              <tr>
                <th className="pb-2">Intersection Group</th>
                <th className="pb-2">Positive Rate</th>
                <th className="pb-2">Deviation</th>
                <th className="pb-2">Direction</th>
                <th className="pb-2">Severity</th>
              </tr>
            </thead>
            <tbody>
              {intersectional.flags.map((f, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-2 font-medium">{f.group}</td>
                  <td className="py-2 font-mono">{f.rate}</td>
                  <td className="py-2 font-mono" style={{ color: f.deviation < 0 ? '#EF4444' : '#22C55E' }}>{f.deviation > 0 ? '+' : ''}{f.deviation}</td>
                  <td className="py-2">{f.direction}</td>
                  <td className="py-2">
                    <span className={`badge-${f.severity === 'high' ? 'unfair' : 'questionable'}`}>{f.severity}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Model Performance by Group */}
      {Object.keys(modelPerf).length > 0 && (
        <div className="card mb-6">
          <h4 className="font-semibold mb-3">Model Fairness by Group</h4>
          {Object.entries(modelPerf).map(([modelName, perf]) => {
            const groups = perf.per_group || {}
            if (!Object.keys(groups).length) return null
            return (
              <div key={modelName} className="mb-4">
                <h5 className="text-sm font-medium capitalize mb-2">{modelName.replace(/_/g, ' ')}</h5>
                <table className="w-full text-sm">
                  <thead className="text-left text-gray-500 border-b">
                    <tr>
                      <th className="pb-2">Group</th>
                      <th className="pb-2">Accuracy</th>
                      <th className="pb-2">Precision</th>
                      <th className="pb-2">Recall</th>
                      <th className="pb-2">F1</th>
                      <th className="pb-2">AUC-ROC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(groups).map(([group, m]) => (
                      <tr key={group} className="border-b border-gray-100">
                        <td className="py-1.5 font-medium">{group}</td>
                        <td className="py-1.5 font-mono">{m.accuracy}</td>
                        <td className="py-1.5 font-mono">{m.precision}</td>
                        <td className="py-1.5 font-mono">{m.recall}</td>
                        <td className="py-1.5 font-mono">{m.f1}</td>
                        <td className="py-1.5 font-mono">{m.auc_roc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })}
        </div>
      )}

      {/* Statistical Metrics Summary */}
      <div className="card">
        <h4 className="font-semibold mb-3">Statistical Metrics Summary</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.entries(metrics).map(([attr, data]) => (
            <div key={attr} className="p-4 bg-gray-50 rounded-lg">
              <h5 className="font-medium text-sm capitalize mb-2">{attr.replace(/_|"/g, ' ')}</h5>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {Object.entries(data).filter(([k]) => k !== 'per_group_stats').map(([k, v]) => (
                  <div key={k}>
                    <p className="text-gray-500">{k.replace(/_/g, ' ')}</p>
                    <p className="font-mono font-medium">{typeof v === 'number' ? (v > 10 ? v.toFixed(0) : v.toFixed(4)) : v}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
