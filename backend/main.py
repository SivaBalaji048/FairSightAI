"""
FairLens - Backend FastAPI Application
Routes: /upload, /analyze, /explain, /mitigate, /report
"""
import json
import uuid
from pathlib import Path
from datetime import datetime

import pandas as pd
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, Response
from pydantic import BaseModel
from sqlalchemy import Column, Float, Integer, String, create_engine, inspect, func
from sqlalchemy.orm import declarative_base, sessionmaker

from backend.shared_config import DATABASE_URL, ALLOWED_ORIGINS, OPENROUTER_API_KEY, AI_MODEL
from agents.data_agent import (
    parse_file,
    profile_dataset,
    ai_interpret_columns,
    auto_detect_outcome,
    auto_detect_sensitive,
    detect_column_types,
    preprocess_dataset,
    train_test_split,
)
from agents.bias_detector_agent import run_bias_detection
from agents.bias_agent import run_full_bias_analysis
from agents.explainer_agent import run_explanation
from agents.explain_agent import run_full_explanation, explain_individual_case
from agents.mitigator_agent import run_mitigation
from agents.mitigation_agent import run_all_simulations, apply_strategy, generate_mitigation_recommendations, load_fair_model
from agents.reporting_agent import generate_report as gen_report
from agents.report_agent import generate_full_report

app = FastAPI(title="FairLens API", version="0.1.0")

# Ensure DB directory exists (important for Docker /app/data volume)
Path("/app/data").mkdir(parents=True, exist_ok=True)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=".*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# ── Database Models ──
class DatasetRecord(Base):
    __tablename__ = "datasets"
    id = Column(Integer, primary_key=True, index=True)
    dataset_id = Column(String, unique=True, index=True)
    original_filename = Column(String)
    file_path = Column(String)
    file_format = Column(String)
    row_count = Column(Integer)
    column_count = Column(Integer)
    sensitive_attributes_json = Column(String)
    outcome_column = Column(String)
    configured = Column(Float, default=False)
    profile_json = Column(String)
    ai_interpretation_json = Column(String, nullable=True)
    uploaded_at = Column(String)


class AnalysisRecord(Base):
    __tablename__ = "analyses"
    id = Column(Integer, primary_key=True, index=True)
    dataset_name = Column(String, index=True)
    analysis_id = Column(String, unique=True, index=True)
    dataset_type = Column(String)
    protected_attribute = Column(String)
    disadvantaged_group = Column(String)
    disparity_ratio = Column(Float)
    p_value = Column(Float)
    overall_fairness = Column(String)
    timestamp = Column(String)
    metrics_json = Column(String, nullable=True)
    recommendations_json = Column(String, nullable=True)

Base.metadata.create_all(bind=engine)

# ── Pydantic Schemas ──
class AnalyzeRequest(BaseModel):
    analysis_id: str
    dataset_type: str

class ExplainRequest(BaseModel):
    analysis_id: str | None = None
    domain: str = "general"

class ConfigureRequest(BaseModel):
    sensitive_attributes: list[str]
    outcome_column: str

class AnalyzeDatasetRequest(BaseModel):
    domain: str = "general"

class ExplainCaseRequest(BaseModel):
    dataset_id: str
    row_data: dict

class MitigateSimulateRequest(BaseModel):
    domain: str = "general"

class MitigateApplyRequest(BaseModel):
    strategy: str

class ReportRequest(BaseModel):
    analysis_ids: list[str] | None = None

UPLOADS_DIR = Path("uploads")
UPLOADS_DIR.mkdir(exist_ok=True)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── Routes ──

@app.get("/")
async def root():
    return {"service": "FairLens API", "status": "running"}


@app.get("/health")
async def health():
    """Health check for Railway deployment."""
    return {
        "status": "healthy",
        "database": DATABASE_URL,
        "model": AI_MODEL,
    }


@app.post("/upload")
async def upload_dataset(file: UploadFile = File(...)):
    """Upload a CSV or JSON dataset. Returns dataset_id + full profile."""
    allowed_exts = {".csv", ".json", ".jsonl"}
    if not file.filename or Path(file.filename).suffix.lower() not in allowed_exts:
        raise HTTPException(status_code=400, detail="Only CSV and JSON files are supported.")

    db = SessionLocal()
    try:
        # Save file
        contents = await file.read()
        save_path = UPLOADS_DIR / file.filename
        save_path.write_bytes(contents)

        # Parse + profile
        df = parse_file(save_path)
        profile = profile_dataset(df)

        dataset_id = str(uuid.uuid4())[:12]

        # Persist metadata
        record = DatasetRecord(
            dataset_id=dataset_id,
            original_filename=file.filename,
            file_path=str(save_path),
            file_format=Path(file.filename).suffix.lower().lstrip("."),
            row_count=profile["row_count"],
            column_count=profile["column_count"],
            sensitive_attributes_json=str(profile["auto_detected_sensitive"]),
            outcome_column=str(profile["auto_detected_outcome"]) or "",
            configured=False,
            profile_json=str(profile),
            uploaded_at=datetime.utcnow().isoformat(),
        )
        db.add(record)
        db.commit()
        db.refresh(record)

        return {
            "dataset_id": dataset_id,
            "filename": file.filename,
            "profile": profile,
            "message": f"Dataset uploaded: {profile['row_count']} rows, {profile['column_count']} columns.",
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@app.post("/analyze")
async def analyze_dataset(req: AnalyzeRequest):
    """Run bias detection on an uploaded dataset."""
    db = SessionLocal()
    try:
        csv_files = list(UPLOADS_DIR.glob("*.csv"))
        if not csv_files:
            raise HTTPException(status_code=404, detail="No datasets uploaded.")

        target_file = None
        for f in csv_files:
            if req.dataset_type in f.stem.lower():
                target_file = f
                break
        if not target_file:
            target_file = csv_files[-1]

        df = pd.read_csv(target_file)
        result = run_bias_detection(df, req.dataset_type)

        record = AnalysisRecord(
            dataset_name=target_file.stem,
            analysis_id=req.analysis_id,
            dataset_type=req.dataset_type,
            protected_attribute=result["protected_attribute"],
            disadvantaged_group=result["disadvantaged_group"],
            disparity_ratio=round(result["disparity_ratio"], 4),
            p_value=round(result["p_value"], 4),
            overall_fairness=result["overall_fairness"],
            timestamp=datetime.utcnow().isoformat(),
            metrics_json=str(result.get("metrics", {})),
            recommendations_json=str(result.get("recommendations", [])),
        )
        db.add(record)
        db.commit()
        db.refresh(record)

        result["analysis_id"] = record.analysis_id
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@app.post("/explain")
async def explain_bias(dataset_id: str, req: ExplainRequest):
    """Run full SHAP-based explainability analysis on a configured dataset."""
    db = SessionLocal()
    try:
        record = db.query(DatasetRecord).filter(
            DatasetRecord.dataset_id == dataset_id
        ).first()
        if not record:
            raise HTTPException(status_code=404, detail="Dataset not found.")

        if not record.configured:
            raise HTTPException(
                status_code=400,
                detail="Dataset not yet configured. Call /dataset/{id}/configure first.",
            )

        file_path = Path(record.file_path)
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="Dataset file not found.")

        df = parse_file(file_path)

        import json as _json
        try:
            sensitive_cols = _json.loads(record.sensitive_attributes_json)
        except (json.JSONDecodeError, TypeError):
            sensitive_cols = [record.outcome_column] if record.outcome_column else []

        if not record.outcome_column:
            raise HTTPException(status_code=400, detail="No outcome column configured.")

        # Get bias metrics from existing analysis if available
        bias_metrics = {}
        if req.analysis_id:
            analysis = db.query(AnalysisRecord).filter(
                AnalysisRecord.analysis_id == req.analysis_id
            ).first()
            if analysis and analysis.metrics_json:
                try:
                    # Try to re-parse the stored metrics
                    bias_metrics = _json.loads(analysis.metrics_json)
                except (json.JSONDecodeError, TypeError):
                    pass

        result = run_full_explanation(
            df,
            sensitive_cols=sensitive_cols,
            outcome_col=record.outcome_column,
            bias_metrics=bias_metrics,
            domain=req.domain,
        )

        # Strip internal references before returning
        result.pop("model", None)
        result.pop("_X_df", None)

        return result
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid dataset configuration.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Explanation failed: {str(e)}")
    finally:
        db.close()


@app.post("/explain/case")
async def explain_case(req: ExplainCaseRequest):
    """Individual case explanation — single data row."""
    db = SessionLocal()
    try:
        record = db.query(DatasetRecord).filter(
            DatasetRecord.dataset_id == req.dataset_id
        ).first()
        if not record:
            raise HTTPException(status_code=404, detail="Dataset not found.")

        file_path = Path(record.file_path)
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="Dataset file not found.")

        df = parse_file(file_path)

        import json as _json
        try:
            sensitive_cols = _json.loads(record.sensitive_attributes_json)
        except (json.JSONDecodeError, TypeError):
            sensitive_cols = []

        if not record.outcome_column:
            raise HTTPException(status_code=400, detail="No outcome column configured.")

        # Build feature set and train model for the explainer
        from agents.explain_agent import _prepare_features
        X_df, y, feature_names, _, scaler = _prepare_features(
            df, record.outcome_column, sensitive_cols
        )
        from sklearn.ensemble import RandomForestClassifier
        model = RandomForestClassifier(n_estimators=50, max_depth=5, random_state=42)
        model.fit(X_df, y)

        # Build row as Series matching X_df columns
        row = pd.Series(req.row_data)

        explanation = explain_individual_case(
            row=row,
            model=model,
            X_train=X_df,
            feature_names=feature_names,
            sensitive_cols=sensitive_cols,
            df=df,
            outcome_col=record.outcome_column,
        )

        return explanation
    finally:
        db.close()


# ── Mitigation Routes ──

@app.post("/mitigate/simulate")
async def simulate_mitigation(dataset_id: str, req: MitigateSimulateRequest):
    """Run all mitigation strategies in simulation mode, return comparison."""
    db = SessionLocal()
    try:
        record = db.query(DatasetRecord).filter(
            DatasetRecord.dataset_id == dataset_id
        ).first()
        if not record:
            raise HTTPException(status_code=404, detail="Dataset not found.")

        if not record.configured:
            raise HTTPException(
                status_code=400,
                detail="Dataset not yet configured. Call /dataset/{id}/configure first.",
            )

        file_path = Path(record.file_path)
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="Dataset file not found.")

        df = parse_file(file_path)

        import json as _json
        try:
            sensitive_cols = _json.loads(record.sensitive_attributes_json)
        except (json.JSONDecodeError, TypeError):
            sensitive_cols = [record.outcome_column] if record.outcome_column else []

        if not record.outcome_column:
            raise HTTPException(status_code=400, detail="No outcome column configured.")

        # Run all simulations
        sim_result = run_all_simulations(
            df, sensitive_cols, record.outcome_column
        )

        # Strip models (not JSON serializable)
        models = sim_result.pop("models", {})

        # Add AI recommendations
        recommendation = generate_mitigation_recommendations(sim_result, domain=req.domain)

        return {
            **sim_result,
            "recommendations": recommendation,
        }
    finally:
        db.close()


@app.post("/mitigate/apply")
async def apply_mitigation(dataset_id: str, req: MitigateApplyRequest):
    """Apply a chosen mitigation strategy, return retrained model + metrics."""
    db = SessionLocal()
    try:
        record = db.query(DatasetRecord).filter(
            DatasetRecord.dataset_id == dataset_id
        ).first()
        if not record:
            raise HTTPException(status_code=404, detail="Dataset not found.")

        if not record.configured:
            raise HTTPException(
                status_code=400,
                detail="Dataset not yet configured. Call /dataset/{id}/configure first.",
            )

        file_path = Path(record.file_path)
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="Dataset file not found.")

        df = parse_file(file_path)

        import json as _json
        try:
            sensitive_cols = _json.loads(record.sensitive_attributes_json)
        except (json.JSONDecodeError, TypeError):
            sensitive_cols = [record.outcome_column] if record.outcome_column else []

        if not record.outcome_column:
            raise HTTPException(status_code=400, detail="No outcome column configured.")

        # Apply the strategy
        result = apply_strategy(
            df, sensitive_cols, record.outcome_column, req.strategy
        )

        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])

        return result
    finally:
        db.close()


@app.get("/mitigate/download/{model_id}")
async def download_model(model_id: str):
    """Download a previously saved fair model as JSON metrics (model binary via pickle)."""
    artifact = load_fair_model(model_id)
    if artifact is None:
        raise HTTPException(status_code=404, detail=f"Model '{model_id}' not found.")

    return {
        "model_id": model_id,
        "strategy": artifact.get("strategy"),
        "sensitive_attributes": artifact.get("sensitive_attributes"),
        "outcome_column": artifact.get("outcome_column"),
        "feature_names": artifact.get("feature_names"),
        "metrics": artifact.get("metrics"),
    }


@app.post("/report")
async def get_report(req: ReportRequest | None = None):
    """Generate a fairness report."""
    db = SessionLocal()
    try:
        query = db.query(AnalysisRecord)
        if req and req.analysis_ids:
            query = query.filter(AnalysisRecord.analysis_id.in_(req.analysis_ids))
        records = query.all()

        if not records:
            raise HTTPException(status_code=404, detail="No analysis records found.")

        report = gen_report(records)
        return report
    finally:
        db.close()


@app.get("/report/{dataset_id}/json")
async def get_report_json(dataset_id: str):
    """
    Compile and return a full fairness audit report as JSON for the given dataset.
    Includes before/after mitigation comparison, bias findings, recommendations.
    """
    import json as _json
    db = SessionLocal()
    try:
        # Fetch dataset
        record = db.query(DatasetRecord).filter(
            DatasetRecord.dataset_id == dataset_id
        ).first()
        if not record:
            raise HTTPException(status_code=404, detail="Dataset not found.")

        # Fetch most recent analysis for this dataset
        analysis_record = (
            db.query(AnalysisRecord)
            .filter(AnalysisRecord.dataset_name == record.original_filename)
            .order_by(AnalysisRecord.timestamp.desc())
            .first()
        )

        dataset_info = {
            "filename": record.original_filename,
            "row_count": record.row_count,
            "column_count": record.column_count,
            "outcome_column": record.outcome_column,
        }

        # Parse stored analysis data
        analysis_data = {}
        if analysis_record and analysis_record.metrics_json:
            try:
                parsed = _json.loads(analysis_record.metrics_json)
                if isinstance(parsed, dict):
                    analysis_data = parsed
            except (ValueError, TypeError):
                # metrics_json may be a Python repr string
                import ast
                try:
                    parsed = ast.literal_eval(analysis_record.metrics_json)
                    if isinstance(parsed, dict):
                        analysis_data = parsed
                except Exception:
                    pass

        # Run mitigation simulation to get before/after data
        mitigation_data = {}
        file_path = Path(record.file_path)
        if record.configured and file_path.exists():
            try:
                from agents.agent_utils import parse_file as _parse
            except ImportError:
                from agents.data_agent import parse_file as _parse

            try:
                sensitive_cols_raw = record.sensitive_attributes_json
                try:
                    sensitive_cols = _json.loads(sensitive_cols_raw)
                except (ValueError, TypeError):
                    sensitive_cols = []

                df = _parse(file_path)
                sim = run_all_simulations(df, sensitive_cols, record.outcome_column)
                sim.pop("models", None)
                mitigation_data = sim
            except Exception:
                mitigation_data = {}

        # Build full report via report agent
        full = generate_full_report(
            dataset_info=dataset_info,
            domain="general",
            analysis=analysis_data if analysis_data else None,
            explanation=None,
            mitigation=mitigation_data if mitigation_data else None,
        )

        report_obj = full["report"]

        # Expose risk score before/after
        before_risk = report_obj.get("risk_score", 0)
        best_strategy = None
        best_after_fairness = None
        best_after_accuracy = None
        strategies = mitigation_data.get("strategies", [])
        baseline = mitigation_data.get("baseline", {})

        recommended = [s for s in strategies if s.get("recommendation") == "recommended"]
        consider = [s for s in strategies if s.get("recommendation") == "consider"]
        best_pool = recommended or consider

        if best_pool:
            best_strategy = max(best_pool, key=lambda s: s.get("fairness_score_after", 0))
            best_after_fairness = best_strategy.get("fairness_score_after")
            best_after_accuracy = best_strategy.get("accuracy_after")

        from agents.report_agent import export_json as _export_json
        clean = _export_json(report_obj)

        clean["report_id"] = report_obj.get("report_id", f"RPT-{dataset_id}")
        clean["generated_at"] = report_obj.get("generated_at", datetime.utcnow().isoformat())
        clean["dataset"] = dataset_info
        clean["risk_score"] = before_risk
        clean["before_after"] = {
            "baseline_fairness": baseline.get("fairness_score"),
            "baseline_accuracy": baseline.get("accuracy"),
            "best_strategy": best_strategy.get("strategy") if best_strategy else None,
            "best_after_fairness": best_after_fairness,
            "best_after_accuracy": best_after_accuracy,
            "fairness_improvement": (
                round(best_after_fairness - baseline.get("fairness_score", 0), 4)
                if best_after_fairness is not None and baseline.get("fairness_score") is not None
                else None
            ),
            "accuracy_change": (
                round(best_after_accuracy - baseline.get("accuracy", 0), 4)
                if best_after_accuracy is not None and baseline.get("accuracy") is not None
                else None
            ),
            "all_strategies": strategies,
        }

        # Save JSON report
        try:
            r_id = clean["report_id"]
            (Path("output_reports") / f"{r_id}.json").write_text(
                _json.dumps(clean, indent=2, default=str)
            )
        except Exception:
            pass

        return clean
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Report generation failed: {str(e)}")
    finally:
        db.close()


@app.get("/report/{dataset_id}/html", response_class=HTMLResponse)
async def get_report_html(dataset_id: str):
    """
    Return a styled, printable HTML version of the fairness audit report.
    """
    import json as _json
    db = SessionLocal()
    try:
        record = db.query(DatasetRecord).filter(
            DatasetRecord.dataset_id == dataset_id
        ).first()
        if not record:
            raise HTTPException(status_code=404, detail="Dataset not found.")

        analysis_record = (
            db.query(AnalysisRecord)
            .filter(AnalysisRecord.dataset_name == record.original_filename)
            .order_by(AnalysisRecord.timestamp.desc())
            .first()
        )

        dataset_info = {
            "filename": record.original_filename,
            "row_count": record.row_count,
            "column_count": record.column_count,
            "outcome_column": record.outcome_column,
        }

        analysis_data = {}
        if analysis_record and analysis_record.metrics_json:
            try:
                parsed = _json.loads(analysis_record.metrics_json)
                if isinstance(parsed, dict):
                    analysis_data = parsed
            except (ValueError, TypeError):
                pass

        mitigation_data = {}
        file_path = Path(record.file_path)
        if record.configured and file_path.exists():
            try:
                from agents.data_agent import parse_file as _parse
                sensitive_cols_raw = record.sensitive_attributes_json
                try:
                    sensitive_cols = _json.loads(sensitive_cols_raw)
                except (ValueError, TypeError):
                    sensitive_cols = []
                df = _parse(file_path)
                sim = run_all_simulations(df, sensitive_cols, record.outcome_column)
                sim.pop("models", None)
                mitigation_data = sim
            except Exception:
                mitigation_data = {}

        full = generate_full_report(
            dataset_info=dataset_info,
            domain="general",
            analysis=analysis_data if analysis_data else None,
            explanation=None,
            mitigation=mitigation_data if mitigation_data else None,
        )

        return HTMLResponse(content=full["html_str"])
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"HTML report generation failed: {str(e)}")
    finally:
        db.close()


@app.get("/analyses")
async def list_analyses():
    """List all past analyses."""
    db = SessionLocal()
    try:
        records = db.query(AnalysisRecord).order_by(AnalysisRecord.timestamp.desc()).all()
        return [
            {
                "analysis_id": r.analysis_id,
                "dataset_name": r.dataset_name,
                "dataset_type": r.dataset_type,
                "overall_fairness": r.overall_fairness,
                "timestamp": r.timestamp,
            }
            for r in records
        ]
    finally:
        db.close()


# ── Dataset Routes ──

@app.get("/dataset/{dataset_id}/profile")
async def get_dataset_profile(dataset_id: str):
    """Return column profile and metadata for a previously uploaded dataset."""
    db = SessionLocal()
    try:
        record = db.query(DatasetRecord).filter(
            DatasetRecord.dataset_id == dataset_id
        ).first()
        if not record:
            raise HTTPException(status_code=404, detail="Dataset not found.")

        return {
            "dataset_id": record.dataset_id,
            "filename": record.original_filename,
            "file_format": record.file_format,
            "row_count": record.row_count,
            "column_count": record.column_count,
            "outcome_column": record.outcome_column,
            "sensitive_attributes": record.sensitive_attributes_json,
            "configured": bool(record.configured),
            "uploaded_at": record.uploaded_at,
        }
    finally:
        db.close()


@app.post("/dataset/{dataset_id}/configure")
async def configure_dataset(dataset_id: str, req: ConfigureRequest):
    """User confirms sensitive columns and outcome column. Triggers AI-assisted classification."""
    db = SessionLocal()
    try:
        record = db.query(DatasetRecord).filter(
            DatasetRecord.dataset_id == dataset_id
        ).first()
        if not record:
            raise HTTPException(status_code=404, detail="Dataset not found.")

        file_path = Path(record.file_path)
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="Dataset file not found.")

        df = parse_file(file_path)

        # Run AI interpretation alongside user config
        import json as _json
        ai_result = None
        if OPENROUTER_API_KEY:
            ai_result = ai_interpret_columns(df)

        # Update record
        record.sensitive_attributes_json = _json.dumps(req.sensitive_attributes)
        record.outcome_column = req.outcome_column
        record.configured = True
        record.ai_interpretation_json = _json.dumps(ai_result) if ai_result else None
        db.commit()
        db.refresh(record)

        return {
            "dataset_id": dataset_id,
            "configured": True,
            "user_specified_sensitive": req.sensitive_attributes,
            "user_specified_outcome": req.outcome_column,
            "ai_interpretation": ai_result,
            "message": "Dataset configured successfully.",
        }
    finally:
        db.close()


# ── Analysis Route ──

@app.post("/analyze/dataset/{dataset_id}")
async def analyze_dataset_full(dataset_id: str, req: AnalyzeDatasetRequest):
    """Run comprehensive bias analysis on a configured dataset."""
    db = SessionLocal()
    try:
        record = db.query(DatasetRecord).filter(
            DatasetRecord.dataset_id == dataset_id
        ).first()
        if not record:
            raise HTTPException(status_code=404, detail="Dataset not found.")

        if not record.configured:
            raise HTTPException(
                status_code=400,
                detail="Dataset not yet configured. Call /dataset/{id}/configure first.",
            )

        file_path = Path(record.file_path)
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="Dataset file not found.")

        # Parse file
        df = parse_file(file_path)

        # Build config for analysis
        import json as _json
        try:
            sensitive_cols = _json.loads(record.sensitive_attributes_json)
        except (json.JSONDecodeError, TypeError):
            sensitive_cols = [record.outcome_column] if record.outcome_column else []

        if not record.outcome_column:
            raise HTTPException(
                status_code=400,
                detail="No outcome column configured.",
            )

        # Run full bias analysis
        result = run_full_bias_analysis(
            df,
            sensitive_columns=sensitive_cols,
            outcome_column=record.outcome_column,
            domain=req.domain,
        )

        # Persist analysis result
        analysis_id = str(uuid.uuid4())[:12]
        analysis_record = AnalysisRecord(
            dataset_name=record.original_filename,
            analysis_id=analysis_id,
            dataset_type=req.domain,
            protected_attribute=str(sensitive_cols),
            disadvantaged_group=result["narrative"].get("affected_groups", [])[0] if result["narrative"].get("affected_groups") else "N/A",
            disparity_ratio=result["risk_score"] / 100.0,
            p_value=result["metrics"].get(sensitive_cols[-1], {}).get("p_value", 0),
            overall_fairness=result["narrative"].get("severity", "unknown").title(),
            timestamp=datetime.utcnow().isoformat(),
            metrics_json=str(result),
            recommendations_json=str(result["narrative"].get("recommendations", [])),
        )
        db.add(analysis_record)
        db.commit()
        db.refresh(analysis_record)

        result["analysis_id"] = analysis_record.analysis_id
        return result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")
    finally:
        db.close()