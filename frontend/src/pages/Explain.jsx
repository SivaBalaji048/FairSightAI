import { useState } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer } from 'recharts'
import { API_BASE } from '../config'
import AIInsightCard from '../components/AIInsightCard'
import CounterfactualTable from '../components/CounterfactualTable'

const PROXY_THRESHOLD = 0.6

export default function Explain() {
  const { id } = useParams()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [mode, setMode] = useState('simple')
  const [caseInput, setCaseInput] = useState('')
  const [caseResult, setCaseResult] = useState(null)

  const handleExplain = async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const res = await axios.post(`${API_BASE}/explain?dataset_id=${id}`, {
        domain: 'general',
      })
      setResult(res.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Explanation failed.')
    } finally {
      setLoading(false)
    }
  }

  const handleCaseCheck = async () => {
    if (!id || !caseInput.trim()) return
    try {
      const row = {}
      const parts = caseInput.split(',').map(s => s.trim())
      parts.forEach(p => {
        const [k, ...rest] = p.split(':').map(s => s.trim())
        if (k) row[k] = rest.join(':') || k
      })
      const res = await axios.post(`${API_BASE}/explain/case`, {
        dataset_id: id,
        row_data: row,
      })
      setCaseResult(res.data)
    } catch (e) {
      setCaseResult({ error: e.response?.data?.detail || 'Case analysis failed.' })
    }
  }

  if (!result) {
    return (
      <div>
        <h2 className="text-2xl font-bold mb-6">Explainability</h2>
        <div className="card max-w-md">
          <p className="text-sm text-gray-500 mb-4">
            Generate SHAP-based feature importance, counterfactuals, and AI explanations.
          </p>
          {error && <div className="mb-4 p-3 bg-red-50 rounded text-red-700 text-sm">{error}</div>}
          <button onClick={handleExplain} disabled={loading} className="btn-primary w-full disabled:opacity-50">
            {loading ? 'Analyzing...' : 'Run Explainability Analysis'}
          </button>
        </div>
      </div>
    )
  }

  const shapData = result.feature_importance?.shap_chart_data || []
  const explanations = result.explanations || {}
  const proxies = result.feature_importance?.proxy_correlations || {}
  const proxyEntries = Object.entries(proxies)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Explainability</h2>
          <p className="text-sm text-gray-500 mt-1">Why the model makes its decisions</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setMode(mode === 'simple' ? 'technical' : 'simple')}
            className="btn-secondary text-xs"
          >
            {mode === 'simple' ? 'Switch to Technical' : 'Switch to Simple'}
          </button>
        </div>
      </div>

      {/* SHAP Feature Importance */}
      <div className="card mb-6">
        <h4 className="font-semibold mb-3">SHAP Feature Importance</h4>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={shapData} layout="vertical" margin={{ left: 140 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis type="number" tick={{ fontSize: 12 }} />
            <YAxis type="category" dataKey="feature" width={140} tick={{ fontSize: 12 }} />
            <Tooltip />
            <Bar dataKey="importance" radius={[0, 4, 4, 0]}>
              {shapData.map((entry, i) => (
                <Cell
                  key={i}
                  fill={
                    entry.is_proxy ? '#EF4444' :
                    proxyEntries.some(([proxy]) => entry.feature === proxy) ? '#EF4444' :
                    '#3B82F6'
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-blue-500 rounded-sm" />
            <span>Feature importance</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-red-500 rounded-sm" />
            <span>Proxy variable (correlated with sensitive attribute)</span>
          </div>
        </div>
      </div>

      {/* Proxy Correlations */}
      {proxyEntries.length > 0 && (
        <div className="card mb-6 border-l-4 border-red-400">
          <h4 className="font-semibold mb-3 text-red-700">⚠ Proxy Variables Detected</h4>
          <table className="w-full text-sm">
            <thead className="text-left text-gray-500 border-b">
              <tr>
                <th className="pb-2">Feature</th>
                <th className="pb-2">Correlated With</th>
                <th className="pb-2">Correlation</th>
              </tr>
            </thead>
            <tbody>
              {proxyEntries.map(([feat, corrs]) =>
                corrs.map((c, i) => (
                  <tr key={`${feat}-${i}`} className="border-b border-gray-100">
                    <td className="py-2 font-mono text-sm">{feat}</td>
                    <td className="py-2">{c.sensitive_attribute}</td>
                    <td className="py-2 font-mono" style={{ color: c.correlation > 0.8 ? '#EF4444' : '#F59E0B' }}>
                      {c.correlation.toFixed(4)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Counterfactual Comparison */}
      <CounterfactualTable groupComparison={result.counterfactuals?.group_comparison || {}} />

      {/* AI Explanation */}
      <div className="mt-6">
        <AIInsightCard
          title="AI Explanation"
          mode={mode}
          severity={result.metrics ? 'medium' : null}
          summary={mode === 'simple'
            ? explanations.plain_english_explanation
            : explanations.technical_explanation
          }
          recommendations={explanations.recommendations}
        />
      </div>

      {/* Individual Case Checker */}
      <div className="card mt-6">
        <h4 className="font-semibold mb-3">Individual Case Checker</h4>
        <p className="text-xs text-gray-500 mb-3">
          Paste a comma-separated row (e.g. <code className="bg-gray-100 px-1 rounded">age:30,gender:Female,race:Black,income:50000</code>)
          to see the model's prediction and top reasons.
        </p>
        <input
          type="text"
          value={caseInput}
          onChange={(e) => setCaseInput(e.target.value)}
          placeholder="col1:val1, col2:val2, col3:val3"
          className="w-full border rounded-lg px-3 py-2 text-sm font-mono mb-3"
        />
        <button onClick={handleCaseCheck} className="btn-primary disabled:opacity-50">
          Check Case
        </button>

        {caseResult && (
          <div className="mt-4 p-4 rounded-lg border">
            {caseResult.error ? (
              <p className="text-red-600 text-sm">{caseResult.error}</p>
            ) : (
              <div>
                <div className="flex gap-4 mb-3">
                  <div>
                    <p className="text-xs text-gray-500">Prediction</p>
                    <p className={`text-2xl font-bold ${caseResult.prediction ? 'text-green-600' : 'text-red-600'}`}>
                      {caseResult.prediction ? 'Positive' : 'Negative'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Confidence</p>
                    <p className="text-2xl font-bold">{(caseResult.confidence * 100).toFixed(1)}%</p>
                  </div>
                  {caseResult.any_group_disparity_flag && (
                    <div className="px-3 py-1 bg-red-50 border border-red-200 rounded">
                      <p className="text-xs text-red-700 font-semibold">⚠ Disparate impact likely</p>
                    </div>
                  )}
                </div>
                <h5 className="text-sm font-semibold mb-2">Top 3 Reasons</h5>
                <table className="w-full text-sm">
                  <thead className="text-left text-gray-500 border-b">
                    <tr>
                      <th className="pb-2">Feature</th>
                      <th className="pb-2">Value</th>
                      <th className="pb-2">Direction</th>
                      <th className="pb-2">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {caseResult.top_3_reasons?.map((r, i) => (
                      <tr key={i} className="border-b border-gray-100">
                        <td className="py-1.5 font-mono text-xs">{r.feature}</td>
                        <td className="py-1.5">{r.value}</td>
                        <td className={`py-1.5 font-semibold ${r.direction === '+' ? 'text-green-600' : 'text-red-600'}`}>
                          {r.direction}
                        </td>
                        <td className="py-1.5 text-gray-600 text-xs">{r.meaning}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
