"""
FairLens - Shared Configuration
AI model settings, database config, and constants used across backend and agents.
"""
import os

# ── AI Model Configuration (OpenRouter) ──
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
AI_MODEL = "qwen/qwen3-235b-a22b:free"

# ── Database Configuration ──
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:////app/data/fairlens.db")

# ── CORS ──
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:5176").split(",")

# ── Bias Thresholds ──
BIASevere_THRESHOLD = 0.15
DISPARATE_IMPACT_THRESHOLD = 0.80
