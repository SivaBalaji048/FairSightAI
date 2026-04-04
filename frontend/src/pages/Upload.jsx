import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { API_BASE } from '../config'

const DOMAINS = [
  { key: 'hiring', label: 'Hiring', desc: 'Employee hiring decisions' },
  { key: 'loan', label: 'Loan Approval', desc: 'Credit/loan approval decisions' },
  { key: 'healthcare', label: 'Healthcare', desc: 'Treatment recommendation' },
  { key: 'custom', label: 'Custom', desc: 'Other domain' },
]

export default function Upload() {
  const [file, setFile] = useState(null)
  const [domain, setDomain] = useState('hiring')
  const [dragging, setDragging] = useState(false)
  const [step, setStep] = useState('upload') // upload | profile | configure | done
  const [result, setResult] = useState(null)
  const [datasetId, setDatasetId] = useState(null)
  const [profile, setProfile] = useState(null)
  const [selectedSensitive, setSelectedSensitive] = useState([])
  const [selectedOutcome, setSelectedOutcome] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const navigate = useNavigate()

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) setFile(f)
  }, [])

  const handleUpload = async () => {
    if (!file) return
    setLoading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await axios.post(`${API_BASE}/upload`, formData)
      setResult(res.data)
      setDatasetId(res.data.dataset_id)
      setProfile(res.data.profile)

      // Auto-select detected sensitive attributes
      const detected = res.data.profile?.auto_detected_sensitive || []
      setSelectedSensitive(detected)
      setSelectedOutcome(res.data.profile?.auto_detected_outcome || '')
      setStep('profile')
    } catch (e) {
      setError(e.response?.data?.detail || 'Upload failed')
    } finally {
      setLoading(false)
    }
  }

  const handleConfigure = async () => {
    if (!datasetId || !selectedOutcome) return
    setLoading(true)
    try {
      await axios.post(`${API_BASE}/dataset/${datasetId}/configure`, {
        sensitive_attributes: selectedSensitive,
        outcome_column: selectedOutcome,
      })
      setStep('done')
    } catch (e) {
      setError(e.response?.data?.detail || 'Configuration failed')
    } finally {
      setLoading(false)
    }
  }

  const toggleSensitive = (col) => {
    setSelectedSensitive(prev =>
      prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]
    )
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Upload Dataset</h2>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{error}</div>
      )}

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <div className="card max-w-2xl">
          <label className="block text-sm font-medium text-gray-700 mb-3">Domain</label>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {DOMAINS.map(d => (
              <button
                key={d.key}
                onClick={() => setDomain(d.key)}
                className={`p-3 rounded-lg border-2 text-left transition-colors ${
                  domain === d.key ? 'border-fairlens-500 bg-fairlens-50' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <p className="font-medium text-sm">{d.label}</p>
                <p className="text-xs text-gray-500">{d.desc}</p>
              </button>
            ))}
          </div>

          <div
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
              dragging ? 'border-fairlens-500 bg-fairlens-50' : 'border-gray-300 hover:border-gray-400'
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => document.getElementById('file-input')?.click()}
          >
            <div className="text-4xl mb-2">📄</div>
            <p className="font-medium">{file ? file.name : 'Drop your CSV file here or click to browse'}</p>
            {file && <p className="text-xs text-gray-500 mt-1">{(file.size / 1024).toFixed(1)} KB</p>}
            <p className="text-xs text-gray-400 mt-2">Supports .csv, .json, .jsonl</p>
            <input
              id="file-input"
              type="file"
              accept=".csv,.json,.jsonl"
              className="hidden"
              onChange={(e) => setFile(e.target.files[0])}
            />
          </div>

          <button
            onClick={handleUpload}
            disabled={!file || loading}
            className="btn-primary mt-4 disabled:opacity-50"
          >
            {loading ? 'Processing...' : 'Upload & Analyze'}
          </button>
        </div>
      )}

      {/* Step 2: Profile */}
      {step === 'profile' && profile && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span className="text-green-600">✓</span>
            <span>Uploaded <strong>{file?.name}</strong> — {profile.row_count} rows, {profile.column_count} columns</span>
          </div>

          <div className="card">
            <h3 className="font-semibold mb-3">Dataset Profile</h3>
            <table className="w-full text-sm">
              <thead className="text-left text-gray-500 border-b">
                <tr>
                  <th className="pb-2">Column</th>
                  <th className="pb-2">Type</th>
                  <th className="pb-2">Missing</th>
                  <th className="pb-2">Unique</th>
                </tr>
              </thead>
              <tbody>
                {profile.columns?.map(c => (
                  <tr key={c.name} className="border-b border-gray-100">
                    <td className="py-1.5 font-mono text-xs">{c.name}</td>
                    <td className="py-1.5">
                      <span className={`badge ${
                        c.missing_pct > 30 ? 'bg-red-100 text-red-700' : ''
                      }`}>{c.type}</span>
                    </td>
                    <td className="py-1.5 text-gray-500">
                      {c.missing_pct > 0 ? `${c.missing_pct}%` : '—'}
                    </td>
                    <td className="py-1.5 text-gray-500">{c.unique_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h3 className="font-semibold mb-3">Configure Sensitive Attributes</h3>
            <p className="text-xs text-gray-500 mb-3">Check columns that represent protected or sensitive characteristics</p>
            <div className="flex flex-wrap gap-2">
              {profile.columns?.map(c => (
                <label
                  key={c.name}
                  className={`px-3 py-1.5 rounded-full border text-sm cursor-pointer transition-colors ${
                    selectedSensitive.includes(c.name) ? 'border-fairlens-500 bg-fairlens-50 text-fairlens-700' : 'border-gray-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedSensitive.includes(c.name)}
                    onChange={() => toggleSensitive(c.name)}
                    className="hidden"
                  />
                  {c.name}
                </label>
              ))}
            </div>
          </div>

          <div className="card">
            <h3 className="font-semibold mb-3">Outcome / Target Column</h3>
            <select
              value={selectedOutcome}
              onChange={(e) => setSelectedOutcome(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm w-full max-w-xs"
            >
              <option value="">— Select outcome column —</option>
              {profile.columns?.map(c => (
                <option key={c.name} value={c.name}>{c.name}</option>
              ))}
            </select>
            {profile.auto_detected_outcome && (
              <p className="text-xs text-gray-500 mt-1">Auto-detected: {profile.auto_detected_outcome}</p>
            )}
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep('upload')} className="btn-secondary">← Back</button>
            <button
              onClick={handleConfigure}
              disabled={!selectedOutcome || loading}
              className="btn-primary disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Confirm & Continue →'}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Done */}
      {step === 'done' && (
        <div className="card max-w-md text-center py-12">
          <div className="text-4xl mb-3">✓</div>
          <h3 className="text-xl font-bold mb-2">Dataset Configured!</h3>
          <p className="text-gray-500 text-sm mb-6">
            {profile?.row_count} rows ready for analysis.
          </p>
          <div className="flex gap-3 justify-center">
            <button onClick={() => navigate(`/analysis/${datasetId}`)} className="btn-primary">Run Analysis →</button>
            <button onClick={() => setStep('upload')} className="btn-secondary">Upload Another</button>
          </div>
        </div>
      )}
    </div>
  )
}
