import { useState } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'
import { API_BASE } from '../config'
import BiasGauge from '../components/BiasGauge'

export default function Report() {
  const { id } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('overview')

  const fetchReport = async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const res = await axios.get(`${API_BASE}/report/${id}/json`)
      setData(res.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Report generation failed.')
    } finally {
      setLoading(false)
    }
  }

  const downloadHTML = async () => {
    try {
      const url = `${API_BASE}/report/${id}/html`
      window.open(url, '_blank')
    } catch {
      setError('HTML export failed.')
    }
  }

  const downloadPDF = async () => {
    try {
      const url = `${API_BASE}/report/${id}/pdf`
      const a = document.createElement('a')
      a.href = url
      a.download = `fairlens-report-${id}.pdf`
      a.click()
    } catch {
      setError('PDF export failed. Ensure weasyprint is installed.')
    }
  }

  const downloadJSON = () => {
    if (!data) return
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `fairlens-report-${id}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const shareLink = () => {
    const url = `${window.location.origin}/report/${id}/html`
    navigator.clipboard?.writeText(url)
    alert('Report link copied to clipboard!')
  }

  const TABS = [
    { key: 'overview', label: 'Overview' },
    { key: 'bias', label: 'Bias Findings' },
    { key: 'mitigation', label: 'Mitigation' },
    { key: 'recommendations', label: 'Recommendations' },
    { key: 'appendix', label: 'Appendix' },
  ]

  if (!loading && !data) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold">Fairness Report</h2>
            <p className="text-sm text-gray-500 mt-1">Full audit report</p>
          </div>
        </div>
        <div className="card max-w-md">
          <p className="text-sm text-gray-500 mb-4">
            Generate a comprehensive audit report with AI-powered executive summary.
          </p>
          {error && <div className="mb-4 p-3 bg-red-50 rounded text-red-700 text-sm">{error}</div>}
          <button onClick={fetchReport} disabled={loading} className="btn-primary w-full disabled:opacity-50">
            {loading ? 'Generating report...' : 'Generate Report'}
          </button>
        </div>
      </div>
    )
  }

  if (loading) return <div className="flex items-center justify-center py-20 text-gray-500">Generating report...</div>

  const riskScore = data.risk_score || 0
  const dataset = data.dataset || {}
  const execSummary = data.executive_summary || {}
  const recommendations = data.recommendations || []
  const biasData = data.bias_analysis || {}
  const mitigationData = data.mitigation || {}

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Fairness Report: {data.report_id}</h2>
        <div className="flex gap-2">
          <button onClick={downloadJSON} className="btn-secondary text-xs">Export JSON</button>
          <button onClick={downloadHTML} className="btn-secondary text-xs">View HTML</button>
          <button onClick={downloadPDF} className="btn-secondary text-xs">Export PDF</button>
          <button onClick={shareLink} className="btn-secondary text-xs">Share Link</button>
        </div>
      </div>

      {/* Dataset Info */}
      <div className="flex items-center gap-4 mb-6 text-sm text-gray-500">
        <span>Dataset: <strong>{dataset.filename || 'N/A'}</strong></span>
        <span>Rows: <strong>{dataset.row_count || 'N/A'}</strong></span>
        <span>Columns: <strong>{dataset.column_count || 'N/A'}</strong></span>
        <span>Generated: <strong>{data.generated_at ? new Date(data.generated_at).toLocaleString() : 'N/A'}</strong></span>
      </div>

      {/* Risk Gauge */}
      <div className="card mb-6 flex items-center justify-center">
        <BiasGauge score={riskScore} size={240} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${
              activeTab === tab.key
                ? 'bg-fairlens-600 text-white font-medium'
                : 'bg-white text-gray-700 hover:bg-gray-100 border'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="card">
          <h3 className="font-semibold mb-3">Executive Summary</h3>
          {execSummary.available ? (
            <div className="space-y-3 text-sm text-gray-700 leading-relaxed">
              <p>{execSummary.paragraph_1}</p>
              <p>{execSummary.paragraph_2}</p>
              <p>{execSummary.paragraph_3}</p>
              <p className="font-semibold italic mt-4">"{execSummary.one_sentence_conclusion}"</p>
              {execSummary.recommended_timeline_weeks && (
                <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-sm">
                    <strong>Recommended Timeline:</strong> Within <strong>{execSummary.recommended_timeline_weeks} weeks</strong>
                  </p>
                  <p className="text-sm mt-1">
                    <strong>Risk Level:</strong> <span className={`font-bold ${
                      execSummary.risk_level === 'high' ? 'text-red-600'
                      : execSummary.risk_level === 'medium' ? 'text-amber-600'
                      : 'text-green-600'
                    }`}>{execSummary.risk_level?.toUpperCase()}</span>
                  </p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">AI executive summary unavailable: {execSummary.summary || execSummary}</p>
          )}
        </div>
      )}

      {activeTab === 'bias' && (
        <div className="space-y-4">
          <div className="card">
            <h3 className="font-semibold mb-3">Bias Findings</h3>
            {biasData.narrative?.summary ? (
              <p className="text-sm leading-relaxed">{biasData.narrative.summary}</p>
            ) : (
              <p className="text-gray-500 text-sm">No narrative available.</p>
            )}
            {biasData.narrative?.affected_groups?.length > 0 && (
              <div className="mt-3">
                <p className="text-sm font-medium">Affected Groups:</p>
                <div className="flex flex-wrap gap-2 mt-1">
                  {biasData.narrative.affected_groups.map((g, i) => (
                    <span key={i} className="badge">{g}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {biasData.metrics && (
            <div className="card">
              <h4 className="font-semibold mb-3">Raw Metrics</h4>
              <pre className="text-xs bg-gray-50 p-4 rounded overflow-x-auto max-h-96">
                {JSON.stringify(biasData.metrics, null, 2)}
              </pre>
            </div>
          )}

          {biasData.intersectional && (
            <div className="card">
              <h4 className="font-semibold mb-3">Intersectional Analysis</h4>
              {biasData.intersectional.flags?.length > 0 ? (
                <table className="w-full text-sm">
                  <thead className="text-left text-gray-500 border-b">
                    <tr>
                      <th className="pb-2">Group</th>
                      <th className="pb-2">Rate</th>
                      <th className="pb-2">Deviation</th>
                      <th className="pb-2">Severity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {biasData.intersectional.flags.map((f, i) => (
                      <tr key={i} className="border-b border-gray-100">
                        <td className="py-1.5">{f.group}</td>
                        <td className="py-1.5 font-mono">{f.rate}</td>
                        <td className="py-1.5 font-mono">{f.deviation}</td>
                        <td className="py-1.5">
                          <span className={`badge-${f.severity === 'high' ? 'unfair' : 'questionable'}`}>{f.severity}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <p className="text-gray-500 text-sm">No intersectional flags detected.</p>}
            </div>
          )}
        </div>
      )}

      {activeTab === 'mitigation' && (
        <div className="card">
          <h3 className="font-semibold mb-3">Mitigation Results</h3>
          {mitigationData?.strategies?.length > 0 ? (
            <table className="w-full text-sm">
              <thead className="text-left text-gray-500 border-b">
                <tr>
                  <th className="pb-2">Strategy</th>
                  <th className="pb-2">Fairness Before</th>
                  <th className="pb-2">Fairness After</th>
                  <th className="pb-2">Accuracy Before</th>
                  <th className="pb-2">Accuracy After</th>
                  <th className="pb-2">Recommendation</th>
                </tr>
              </thead>
              <tbody>
                {mitigationData.strategies.map((s, i) => {
                  const rec = s.recommendation || 'not_recommended'
                  const recColor = rec === 'recommended' ? 'text-green-700' : rec === 'consider' ? 'text-amber-700' : 'text-red-700'
                  return (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="py-1.5 font-medium capitalize">{s.strategy?.replace(/_/g, ' ')}</td>
                      <td className="py-1.5 font-mono">{s.fairness_score_before}</td>
                      <td className="py-1.5 font-mono">{s.fairness_score_after}</td>
                      <td className="py-1.5 font-mono">{s.accuracy_before ?? 'N/A'}</td>
                      <td className="py-1.5 font-mono">{s.accuracy_after ?? 'N/A'}</td>
                      <td className={`py-1.5 font-semibold ${recColor}`}>{rec}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : <p className="text-gray-500 text-sm">No mitigation data available.</p>}
        </div>
      )}

      {activeTab === 'recommendations' && (
        <div className="card">
          <h3 className="font-semibold mb-3">Recommendations ({recommendations.length})</h3>
          {recommendations.length > 0 ? (
            <ul className="list-decimal list-inside space-y-2 text-sm">
              {recommendations.map((r, i) => (
                <li key={i} className="leading-relaxed">{r}</li>
              ))}
            </ul>
          ) : <p className="text-gray-500 text-sm">No recommendations available.</p>}
        </div>
      )}

      {activeTab === 'appendix' && (
        <div className="card">
          <h3 className="font-semibold mb-3">Appendix — Full Report Data</h3>
          <pre className="text-xs bg-gray-50 p-4 rounded overflow-x-auto max-h-[600px]">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}
