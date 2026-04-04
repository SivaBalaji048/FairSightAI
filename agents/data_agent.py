"""
FairLens — Data Agent
Handles CSV/JSON ingestion, column detection, preprocessing, profiling,
and AI-assisted column interpretation.
"""
import json
import uuid
from pathlib import Path
from datetime import datetime

import numpy as np
import pandas as pd
from pydantic import BaseModel
from openai import OpenAI

from backend.shared_config import OPENROUTER_API_KEY, OPENROUTER_BASE_URL, AI_MODEL

# ── Known column keywords for auto-detection ──
SENSITIVE_KEYWORDS = [
    "gender", "sex", "race", "ethnicity", "age", "age_group",
    "disability", "religion", "nationality", "orientation",
    "marital", "immigration", "veteran",
]

OUTCOME_KEYWORDS = [
    "hired", "hired_", "approved", "loan_approved", "treatment_recommended",
    "admitted", "accepted", "denied", "rejected", "outcome", "target",
    "label", "y", "churn", "default", "survived",
]

# ── Dataset store (populated from DB) ──
UPLOADS_DIR = Path("uploads")
UPLOADS_DIR.mkdir(exist_ok=True)


# ═══════════════════════════════════════════
# 1. UPLOAD & PARSE
# ═══════════════════════════════════════════

def parse_file(file_path: Path) -> pd.DataFrame:
    """Parse a CSV or JSON file into a DataFrame."""
    suffix = file_path.suffix.lower()
    try:
        if suffix == ".csv":
            return pd.read_csv(file_path)
        elif suffix in (".json", ".jsonl"):
            if suffix == ".jsonl":
                return pd.read_json(file_path, lines=True)
            df = pd.read_json(file_path)
            # If JSON produced a single-row DF with nested dicts, flatten
            if df.shape[1] > 0 and isinstance(df.iloc[0, 0], dict):
                return pd.json_normalize(df.to_dict(orient="records"))
            return df
        else:
            raise ValueError(f"Unsupported file format: {suffix}")
    except Exception as e:
        raise ValueError(f"Failed to parse file: {e}")


def detect_column_types(df: pd.DataFrame) -> dict[str, str]:
    """Detect each column as 'numeric', 'categorical', 'binary'.

    Rules:
    - binary    → dtype numeric/int and unique values <= 2
    - numeric   → numeric dtype with > 2 unique values
    - categorical → object/string or boolean with > 2 unique values
    """
    types = {}
    for col in df.columns:
        n_unique = df[col].nunique(dropna=True)
        dtype = str(df[col].dtype)
        if pd.api.types.is_numeric_dtype(df[col]):
            if n_unique <= 2:
                types[col] = "binary"
            else:
                types[col] = "numeric"
        else:
            if n_unique <= 2:
                types[col] = "binary"
            else:
                types[col] = "categorical"
    return types


def auto_detect_outcome(df: pd.DataFrame) -> str | None:
    """Heuristically find the outcome / target column."""
    cols_lower = {c.lower(): c for c in df.columns}

    # Direct keyword match
    for kw in OUTCOME_KEYWORDS:
        for col_lower, col_name in cols_lower.items():
            if kw in col_lower:
                return col_name

    # Fallback: first binary column (common for 0/1 outcomes)
    types = detect_column_types(df)
    for col, t in types.items():
        if t == "binary":
            return col

    return None


def auto_detect_sensitive(df: pd.DataFrame) -> list[str]:
    """Heuristically find sensitive / protected attribute columns."""
    cols_lower = {c.lower(): c for c in df.columns}
    sensitive = []

    for kw in SENSITIVE_KEYWORDS:
        for col_lower, col_name in cols_lower.items():
            if kw in col_lower and col_name not in sensitive:
                sensitive.append(col_name)

    return sensitive


# ═══════════════════════════════════════════
# 2. PREPROCESSING
# ═══════════════════════════════════════════

def handle_missing_values(
    df: pd.DataFrame,
    strategy: str = "auto",
    threshold: float = 0.30,
) -> tuple[pd.DataFrame, dict]:
    """Handle missing values in a DataFrame.

    strategy: 'auto', 'drop', 'impute'
    threshold: drop columns with > this fraction missing.

    Returns: (cleaned_df, {dropped_columns, imputed_columns})
    """
    missing_flags = {}
    cleaned = df.copy()

    # Drop columns above threshold
    missing_frac = cleaned.isnull().mean()
    drop_cols = missing_frac[missing_frac > threshold].index.tolist()
    cleaned.drop(columns=drop_cols, inplace=True)
    missing_flags["dropped_columns"] = drop_cols

    if strategy == "drop":
        cleaned.dropna(inplace=True)
        return cleaned, missing_flags

    # Impute remaining
    imputed = []
    for col in cleaned.columns:
        if cleaned[col].isnull().any():
            if pd.api.types.is_numeric_dtype(cleaned[col]):
                cleaned[col].fillna(cleaned[col].median(), inplace=True)
            else:
                cleaned[col].fillna(cleaned[col].mode()[0], inplace=True)
            imputed.append(col)

    missing_flags["imputed_columns"] = imputed
    return cleaned, missing_flags


def encode_categoricals(df: pd.DataFrame, columns: list[str] | None = None) -> tuple[pd.DataFrame, dict]:
    """One-hot encode categorical columns."""
    if columns is None:
        types = detect_column_types(df)
        columns = [c for c, t in types.items() if t == "categorical"]

    if not columns:
        return df, {"encoded_columns": []}

    result = pd.get_dummies(df, columns=columns, drop_first=False)
    return result, {"encoded_columns": columns, "output_columns": list(result.columns[len(df.columns) - len(columns) + len(columns):])}


def normalize_numerics(df: pd.DataFrame, columns: list[str] | None = None) -> tuple[pd.DataFrame, dict]:
    """Min-max normalize numeric columns."""
    if columns is None:
        types = detect_column_types(df)
        columns = [c for c, t in types.items() if t in ("numeric", "binary")]

    result = df.copy()
    for col in columns:
        col_min = result[col].min()
        col_max = result[col].max()
        if col_max > col_min:
            result[col] = (result[col] - col_min) / (col_max - col_min)
        else:
            result[col] = 0.0
    return result, {"normalized_columns": columns}


def preprocess_dataset(
    df: pd.DataFrame,
    missing_strategy: str = "auto",
    do_encode: bool = True,
    do_normalize: bool = True,
) -> tuple[pd.DataFrame, dict]:
    """Full preprocessing pipeline.

    Returns: (processed_df, metadata_dict)
    """
    meta = {}
    df, missing_info = handle_missing_values(df, strategy=missing_strategy)
    meta["missing"] = missing_info

    if do_encode:
        df, enc_info = encode_categoricals(df)
        meta["encoding"] = enc_info

    if do_normalize:
        df, norm_info = normalize_numerics(df)
        meta["normalization"] = norm_info

    return df, meta


def train_test_split(df: pd.DataFrame, test_size: float = 0.2, random_state: int = 42):
    """Simple train/test split."""
    frac = 1.0 - test_size
    shuffled = df.sample(frac=1.0, random_state=random_state)
    split_idx = int(len(shuffled) * frac)
    return shuffled.iloc[:split_idx].reset_index(drop=True), shuffled.iloc[split_idx:].reset_index(drop=True)


# ═══════════════════════════════════════════
# 3. PROFILING
# ═══════════════════════════════════════════

def profile_dataset(df: pd.DataFrame) -> dict:
    """Return a full dataset profile."""
    types = detect_column_types(df)

    column_profiles = []
    for col in df.columns:
        col_profile = {
            "name": col,
            "type": types[col],
            "missing_count": int(df[col].isnull().sum()),
            "missing_pct": round(float(df[col].isnull().mean() * 100), 2),
            "unique_count": int(df[col].nunique(dropna=True)),
        }

        if pd.api.types.is_numeric_dtype(df[col]):
            desc = df[col].describe()
            col_profile["mean"] = round(float(desc.get("mean", 0)), 2)
            col_profile["std"] = round(float(desc.get("std", 0)), 2)
            col_profile["min"] = round(float(desc.get("min", 0)), 2)
            col_profile["max"] = round(float(desc.get("max", 0)), 2)
        else:
            top_vals = df[col].value_counts().head(5)
            col_profile["top_values"] = {
                str(k): int(v) for k, v in top_vals.items()
            }

        column_profiles.append(col_profile)

    # Class balance for binary columns
    binary_balance = {}
    for col, t in types.items():
        if t == "binary":
            counts = df[col].value_counts().to_dict()
            binary_balance[col] = {str(k): int(v) for k, v in counts.items()}

    # Flags
    flags = []
    imbalance_threshold = 0.80  # > 80 % in one class
    for col, balance in binary_balance.items():
        total = sum(balance.values())
        if total > 0:
            max_class_pct = max(balance.values()) / total
            if max_class_pct > imbalance_threshold:
                flags.append({
                    "type": "class_imbalance",
                    "column": col,
                    "detail": f"Largest class has {max_class_pct*100:.1f}% of values",
                })

    for cp in column_profiles:
        if cp["missing_pct"] > 30:
            flags.append({
                "type": "high_missing",
                "column": cp["name"],
                "detail": f"Missing {cp['missing_pct']}% of values",
            })

    return {
        "row_count": len(df),
        "column_count": len(df.columns),
        "columns": column_profiles,
        "binary_class_balance": binary_balance,
        "flags": flags,
        "auto_detected_outcome": auto_detect_outcome(df),
        "auto_detected_sensitive": auto_detect_sensitive(df),
    }


# ═══════════════════════════════════════════
# 4. AI-ASSISTED COLUMN INTERPRETATION
# ═══════════════════════════════════════════

def ai_interpret_columns(df: pd.DataFrame) -> dict:
    """Use an LLM to intelligently classify columns."""
    client = OpenAI(
        base_url=OPENROUTER_BASE_URL,
        api_key=OPENROUTER_API_KEY,
    )

    col_names = list(df.columns)
    sample = df.head(3).to_string(index=False)

    prompt = f"""You are a data scientist specializing in fairness and bias analysis.
Given column names and 3 sample rows, classify each column into one of these roles:
  - sensitive_attribute  (protected characteristics: race, gender, age, disability, etc.)
  - outcome              (the decision / target variable, e.g. hired, approved, treated)
  - feature              (any other predictive feature)

Respond ONLY with a valid JSON object (no markdown, no code fences):
{{
  "sensitive_attributes": ["col1", "col2"],
  "outcome": "col3",
  "features": ["col4", "col5"],
  "confidence": "high|medium|low",
  "notes": "any observations"
}}

Columns: {col_names}

Sample rows:
{sample}"""

    try:
        response = client.chat.completions.create(
            model=AI_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=512,
        )
        text = response.choices[0].message.content.strip()
        # Strip code fences if model adds them
        if text.startswith("```"):
            text = text.split("\n", 1)[1]
        if text.endswith("```"):
            text = text.rsplit("\n", 1)[0]
        return json.loads(text.strip())
    except json.JSONDecodeError:
        return {
            "sensitive_attributes": auto_detect_sensitive(df),
            "outcome": auto_detect_outcome(df),
            "features": [c for c in df.columns
                         if c not in auto_detect_sensitive(df)
                         and c != auto_detect_outcome(df)],
            "confidence": "low",
            "notes": "Failed to parse LLM response; fell back to heuristic detection.",
        }
    except Exception as e:
        return {
            "sensitive_attributes": auto_detect_sensitive(df),
            "outcome": auto_detect_outcome(df),
            "features": [],
            "confidence": "low",
            "notes": f"Model call failed: {e}",
        }
