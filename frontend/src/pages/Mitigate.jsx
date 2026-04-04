import { useState } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer, ReferenceLine } from 'recharts'
import { API_BASE } from '../config'
import StrategyTable from '../components/StrategyTable'
import AIInsightCard from '../components/AIInsightCard'

export default function Mitigate() {
  const { id } = useParams()
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [result, setResult] = useState(null)
  const [appliedResult, setAppliedResult] = useState(null)
  const [error, setError] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [selectedStrategy, setSelectedStrategy] = useState(null)

  const handleSimulate = async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const res = await axios.post(`${API_BASE}/mitigate/simulate?dataset_id=${id}`, {
        domain: 'general',
      })
      setResult(res.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Simulation failed.')
    } finally {
      setLoading(false)
    }
  }

  const handleApply = async (strategy) => {
    setSelectedStrategy(strategy)
    setShowModal(true)
  }

  const confirmApply = async () => {
    setShowModal(false)
    if (!selectedStrategy || !id) return
    setApplying(true)
    try {
      const res = await axios.post(`${API_BASE}/mitigate/apply?dataset_id=${id}`, {
        dataset_id: id,
        strategy: selectedStrategy,
      })
      setAppliedResult(res.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Application failed.')
    } finally {
      setApplying(false)
    }
  }

  const handleDownload = async (modelId) => {
    try {
      const res = await axios.get(`${API_BASE}/mitigate/download/${modelId}`)
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `fairlens-model-${modelId}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError('Download failed.')
    }
  }

  if (!result) {
    return (
      <div>
        <h2 className="text-2xl font-bold mb-6">Mitigation</h2>
        <div className="card max-w-md">
          <p className="text-sm text-gray-500 mb-4">
            Compare mitigation strategies and find the best fairness-accuracy tradeoff for your use case.
          </p>
          {error && <div className="mb-4 p-3 bg-red-50 rounded text-red-700 text-sm">{error}</div>}
          <button onClick={handleSimulate} disabled={loading} className="btn-primary w-full disabled:opacity-50">
            {loading ? 'Running simulations...' : 'Run Strategy Comparison'}
          </button>
        </div>
      </div>
    )
  }

  const strategies = result.strategies || []
  const recs = result.recommendations || {}

  // Tradeoff scatter data
  const tradeoffData = strategies
    .filter(s => s.fairness_score_after != null && s.accuracy_after != null)
    .map(s => ({
      name: s.strategy.replace(/_/g, ' '),
      fairness: s.fairness_score_after,
      accuracy: s.accuracy_after,
      recommendation: s.recommendation || 'not_recommended',
    }))

  // Add baseline
  if (result.baseline) {
    tradeoffData.unshift({
      name: 'Baseline (No Mitigation)',
      fairness: result.baseline.fairness_score,
      accuracy: result.baseline.accuracy,
      recommendation: 'baseline',
    })
  }

  const recColors = {
    recommended: '#22C55E',
    consider: '#F59E0B',
    not_recommended: '#EF4444',
    baseline: '#6B7280',
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Mitigation Strategies</h2>

      {/* AI Recommendation */}
      {recs.best_strategy && (
        <AIInsightCard
          title="AI Recommendation"
          severity={recs.risk_level || 'medium'}
          summary={recs.reasoning}
          recommendations={recs.action_plan}
        />
      )}

      {/* Strategy Comparison Table */}
      <div className="mt-6">
        <StrategyTable strategies={strategies} />
      </div>

      {/* Fairness vs Accuracy Tradeoff */}
      <div className="card mt-6">
        <h4 className="font-semibold mb-3">Fairness vs Accuracy Tradeoff</h4>
        <p className="text-xs text-gray-500 mb-3">
          Higher fairness score = more fair (1.0 = perfectly equal). Higher accuracy = better predictions.
        </p>
        <ResponsiveContainer width="100%" height={350}>
          <ScatterChart>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis dataKey="fairness" type="number" domain={[0, 1.1]} label={{ value: 'Fairness Score (DI Ratio)', position: 'insideBottom', offset: -5 }} tick={{ fontSize: 12 }} />
            <YAxis dataKey="accuracy" type="number" domain={[0.5, 1.0]} label={{ value: 'Accuracy', angle: -90, position: 'insideLeft' }} tick={{ fontSize: 12 }} />
            <Tooltip
              formatter={(val, name) => [
                name === 'fairness' ? val.toFixed(4) : val.toFixed(4),
                name === 'fairness' ? 'DI Ratio' : 'Accuracy'
              ]}
            />
            <ReferenceLine x={0.80} stroke="#22C55E" strokeDasharray="5 5" label="80% threshold" />
            <Scatter data={tradeoffData}>
              {tradeoffData.map((entry, i) => (
                <Cell key={i} fill={recColors[entry.recommendation] || '#9CA3AF'} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
        <div className="flex gap-4 mt-2 text-xs text-gray-500 justify-center">
          <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-green-500" />Recommended</span>
          <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-amber-500" />Consider</span>
          <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-red-500" />Not Recommended</span>
          <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-gray-500" />Baseline</span>
        </div>
      </div>

      {/* Apply buttons */}
      <div className="card mt-6">
        <h4 className="font-semibold mb-3">Apply Strategy</h4>
        <p className="text-xs text-gray-500 mb-3">Select a strategy to apply and retrain the model.</p>
        <div className="flex flex-wrap gap-2">
          {strategies.filter(s => s.recommendation === 'recommended' || s.recommendation === 'consider').map(s => (
            <button
              key={s.strategy}
              onClick={() => handleApply(s.strategy)}
              className="btn-primary"
            >
              Apply {s.strategy.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Applied result */}
      {appliedResult && (
        <div className="card mt-6 border-l-4 border-green-500">
          <h4 className="font-semibold mb-3 text-green-700">✓ Strategy Applied: {appliedResult.strategy?.replace(/_/g, ' ')}</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div className="metric-card">
              <p className="text-xs text-gray-500">Model ID</p>
              <p className="font-mono text-sm mt-1">{appliedResult.model_id}</p>
            </div>
            {appliedResult.metrics?.disparate_impact_ratio != null && (
              <div className="metric-card">
                <p className="text-xs text-gray-500">DI Ratio</p>
                <p className="text-xl font-bold mt-1">{appliedResult.metrics.disparate_impact_ratio}</p>
              </div>
            )}
            {appliedResult.metrics?.accuracy != null && (
              <div className="metric-card">
                <p className="text-xs text-gray-500">Accuracy</p>
                <p className="text-xl font-bold mt-1">{appliedResult.metrics.accuracy}</p>
              </div>
            )}
            {appliedResult.metrics?.f1 != null && (
              <div className="metric-card">
                <p className="text-xs text-gray-500">F1 Score</p>
                <p className="text-xl font-bold mt-1">{appliedResult.metrics.f1}</p>
              </div>
            )}
          </div>
          <button
            onClick={() => handleDownload(appliedResult.model_id)}
            className="btn-secondary mt-4"
          >
            Download Model (JSON)
          </button>
        </div>
      )}

      {/* Confirmation Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full mx-4 shadow-xl">
            <h4 className="text-lg font-bold mb-2">Apply Mitigation?</h4>
            <p className="text-sm text-gray-600 mb-4">
              This will retrain the model using the <strong>{selectedStrategy?.replace(/_/g, ' ')}</strong> strategy.
              Continue?
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
              <button
                onClick={confirmApply}
                disabled={applying}
                className="btn-primary disabled:opacity-50"
              >
                {applying ? 'Applying...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
