"""
FairLens - Bias Detector Agent
Analyzes datasets for statistical bias and disparate impact.
"""
import pandas as pd
import numpy as np
from scipy import stats

from backend.shared_config import BIASevere_THRESHOLD, DISPARATE_IMPACT_THRESHOLD


DATASET_PROTECTED = {
    "hiring": {"protected": "gender", "positive_outcome": "hired"},
    "loan": {"protected": "race", "positive_outcome": "loan_approved"},
    "healthcare": {"protected": "insurance_type", "positive_outcome": "treatment_recommended"},
}


def run_bias_detection(df, dataset_type):
    """Detect bias in a dataset based on protected attributes."""
    config = DATASET_PROTECTED.get(dataset_type.lower(), None)
    if config is None:
        # Fallback: try to detect common columns
        config = _auto_detect_protected(df)

    protected = config["protected"]
    outcome = config["positive_outcome"]

    if protected not in df.columns or outcome not in df.columns:
        missing = [c for c in [protected, outcome] if c not in df.columns]
        raise ValueError(f"Missing columns: {', '.join(missing)}")

    rates = df.groupby(protected)[outcome].mean()
    best_group = rates.idxmax()
    worst_group = rates.idxmin()
    best_rate = rates[best_group]
    worst_rate = rates[worst_group]

    disparity_ratio = worst_rate / best_rate if best_rate > 0 else 0.0
    adverse_impact_pct = ((best_rate - worst_rate) / best_rate) * 100 if best_rate > 0 else 0.0
    overall_rate = df[outcome].mean()

    # Chi-squared test
    contingency = pd.crosstab(df[protected], df[outcome])
    chi2, p_value, dof, expected = stats.chi2_contingency(contingency)

    # Determine fairness
    if disparity_ratio >= DISPARATE_IMPACT_THRESHOLD:
        fairness = "Fair"
    elif disparity_ratio >= DISPARATE_IMPACT_THRESHOLD * 0.8:
        fairness = "Questionable"
    else:
        fairness = "Unfair"

    per_group_metrics = {}
    for group in rates.index:
        group_data = df[df[protected] == group]
        per_group_metrics[str(group)] = {
            "count": len(group_data),
            "positive_rate": round(float(rates[group]), 4),
            "positive_count": int(group_data[outcome].sum()),
        }

    recommendations = _generate_recommendations(
        protected, worst_group, disparity_ratio, overall_fairness
    )

    return {
        "dataset_type": dataset_type,
        "protected_attribute": protected,
        "disadvantaged_group": str(worst_group),
        "advantaged_group": str(best_group),
        "disparity_ratio": round(disparity_ratio, 4),
        "adverse_impact_pct": round(adverse_impact_pct, 2),
        "overall_outcome_rate": round(float(overall_rate), 4),
        "p_value": round(p_value, 4),
        "chi_squared": round(float(chi2), 2),
        "per_group_metrics": per_group_metrics,
        "overall_fairness": fairness,
        "recommendations": recommendations,
    }


def _auto_detect_protected(df):
    cols_lower = {c.lower(): c for c in df.columns}
    for key in DATASET_PROTECTED.values():
        if key["protected"] in cols_lower:
            return {"protected": cols_lower[key["protected"]], "positive_outcome": cols_lower.get("hired", cols_lower.get("loan_approved", cols_lower.get("treatment_recommended", "")))}
    raise ValueError("Could not auto-detect protected attributes. Please specify dataset type.")


def _generate_recommendations(protected, worst_group, ratio, fairness):
    recs = []
    if "Unfair" in fairness:
        recs.append(f"Critical: {protected}='{worst_group}' is severely disadvantaged (ratio={ratio:.2f}). Immediate review required.")
        recs.append("Consider applying reweighing or adversarial debiasing to mitigate bias.")
    else:
        recs.append(f"Monitor {protected}='{worst_group}' group — disparity ratio is {ratio:.2f}.")
    recs.append("Collect additional fairness metrics: calibration, equalized odds, predictive parity.")
    return recs
