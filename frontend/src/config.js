export const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/+$/, '')

export const MODEL_CONFIG = {
  provider: 'openrouter',
  baseUrl: 'https://openrouter.ai/api/v1',
  model: 'qwen/qwen3-235b-a22b:free',
}

export const BIAS_THRESHOLDS = {
  disparateImpact: 0.80,
  severe: 0.15,
}

export const DATASET_TYPES = [
  { key: 'hiring', label: 'Hiring', description: 'Employee hiring decisions' },
  { key: 'loan', label: 'Loan', description: 'Loan approval decisions' },
  { key: 'healthcare', label: 'Healthcare', description: 'Treatment recommendation' },
]
