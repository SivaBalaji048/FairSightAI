# FairLens — AI Bias Detection Platform

A full-stack web application for detecting, explaining, and mitigating bias in AI-driven decision-making datasets.

## Architecture

- **Frontend**: React + Vite + TailwindCSS
- **Backend**: FastAPI (Python)
- **AI Model**: OpenRouter API (`qwen/qwen3-235b-a22b:free`)
- **Database**: SQLite (SQLAlchemy)

## Quick Start

### Backend

```bash
cd fairlens
pip install -r requirements.txt
export OPENROUTER_API_KEY="your-key-here"
uvicorn backend.main:app --reload
```

### Frontend

```bash
cd fairlens/frontend
npm install
npm run dev
```

### Generate Sample Datasets

```bash
python data/generate_datasets.py
```

## Project Structure

```
fairlens/
  backend/
    main.py              # FastAPI routes: /upload, /analyze, /explain, /mitigate, /report
    shared_config.py     # AI model + database config
  frontend/
    src/
      App.jsx            # Router + sidebar layout
      pages/             # Dashboard, Upload, Analysis, Explain, Mitigate, Report
      config.js          # Frontend API + threshold config
  agents/
    bias_detector_agent.py   # Statistical bias detection
    explainer_agent.py       # AI-powered explanations
    mitigator_agent.py       # Reweighing, resampling, threshold adjustment
    reporting_agent.py       # Fairness report generation
  data/
    hiring_data.csv        # 1000 rows, gender bias (70% male / 40% female hire rate)
    loan_data.csv          # 1000 rows, racial bias (35% minority / 65% majority approval)
    healthcare_data.csv    # 1000 rows, insurance bias (public insurance undertreated)
  requirements.txt
  README.md
```

## API Endpoints

| Method | Endpoint     | Description                          |
|--------|--------------|--------------------------------------|
| POST   | `/upload`    | Upload a CSV dataset                 |
| POST   | `/analyze`   | Run bias detection on uploaded data  |
| POST   | `/explain`   | Get AI explanation for analysis      |
| POST   | `/mitigate`  | Apply fairness mitigation technique  |
| POST   | `/report`    | Generate fairness report             |
| GET    | `/analyses`  | List all past analyses               |

## Bias Detection Methods

- **Disparate Impact Ratio** (EEOC 4/5ths rule)
- **Chi-squared Test** for statistical significance
- **Per-group outcome rates** for transparency
- **AI-powered natural language explanations**

## Mitigation Techniques

- **Reweighing** — Assign fairness weights to instances
- **Resampling** — Oversample disadvantaged groups
- **Threshold Adjustment** — Group-specific decision thresholds

## Environment Variables

| Variable            | Default                          | Description                  |
|---------------------|----------------------------------|------------------------------|
| `OPENROUTER_API_KEY`| (empty)                          | API key for OpenRouter       |
| `DATABASE_URL`      | `sqlite:///./fairlens.db`        | Database connection string   |
| `ALLOWED_ORIGINS`   | `http://localhost:5173`          | CORS allowed origins         |
