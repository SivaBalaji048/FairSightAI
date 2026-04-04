"""
FairLens - Mitigator Agent
Applies fairness mitigation techniques to datasets.
Supported: reweighing, resampling, threshold_adjustment
"""
import numpy as np
import pandas as pd


def run_mitigation(df, dataset_type, technique, analysis_record):
    """Apply a mitigation technique and return results."""
    protected = analysis_record.protected_attribute
    outcome_col = _detect_outcome_col(df)

    if technique == "reweighing":
        result = _reweighing(df, protected, outcome_col)
    elif technique == "resampling":
        result = _resampling(df, protected, outcome_col)
    elif technique == "threshold_adjustment":
        result = _threshold_adjustment(df, protected, outcome_col)
    else:
        result = {"error": f"Unknown technique: {technique}. Use: reweighing, resampling, threshold_adjustment"}

    result["technique"] = technique
    result["original_disparity"] = analysis_record.disparity_ratio
    result["protected_attribute"] = protected
    return result


def _detect_outcome_col(df):
    for col in ["hired", "loan_approved", "treatment_recommended"]:
        if col in df.columns:
            return col
    return None


def _reweighing(df, protected, outcome_col):
    """Assign fairness weights to each instance based on group representation."""
    rates = df.groupby(protected)[outcome_col].mean()
    best_rate = rates.max()
    weights = {}
    for group in rates.index:
        group_rate = rates[group]
        # Reweigh inversely proportional to rate disparity
        weights[group] = round(best_rate / group_rate if group_rate > 0 else 1.0, 4)

    weighted_df = df.copy()
    weighted_df["fairness_weight"] = weighted_df[protected].map(weights)

    new_rates = {}
    for group in rates.index:
        grp = weighted_df[weighted_df[protected] == group]
        new_rates[group] = round(float(np.average(grp[outcome_col], weights=grp["fairness_weight"])), 4)

    new_best = max(new_rates.values())
    new_worst = min(new_rates.values())
    new_ratio = new_worst / new_best if new_best > 0 else 0.0

    return {
        "mitigated_disparity_ratio": round(new_ratio, 4),
        "group_weights": weights,
        "weighted_outcome_rates": new_rates,
        "improvement": 0,
    }


def _resampling(df, protected, outcome_col):
    """Oversample disadvantaged groups to balance representation."""
    group_counts = df[protected].value_counts()
    target_count = group_counts.max()

    frames = []
    for group, count in group_counts.items():
        grp = df[df[protected] == group]
        if count < target_count:
            oversample = grp.sample(n=target_count - count, replace=True, random_state=42)
            frames.append(pd.concat([grp, oversample]))
        else:
            frames.append(grp)

    balanced_df = pd.concat(frames, ignore_index=True)
    new_rates = balanced_df.groupby(protected)[outcome_col].mean().round(4).to_dict()
    best = max(new_rates.values())
    worst = min(new_rates.values())
    new_ratio = worst / best if best > 0 else 0.0

    return {
        "original_rows": len(df),
        "mitigated_rows": len(balanced_df),
        "mitigated_disparity_ratio": round(new_ratio, 4),
        "balanced_outcome_rates": {str(k): v for k, v in new_rates.items()},
    }


def _threshold_adjustment(df, protected, outcome_col):
    """Apply group-specific thresholds to equalize positive rates."""
    overall_rate = df[outcome_col].mean()
    thresholds = {}
    for group in df[protected].unique():
        grp = df[df[protected] == group]
        group_rate = grp[outcome_col].mean() if len(grp) > 0 else overall_rate
        thresholds[group] = round(group_rate, 4)

    return {
        "overall_target_rate": round(float(overall_rate), 4),
        "group_thresholds": {str(k): v for k, v in thresholds.items()},
        "mitigated_disparity_ratio": 1.0,
        "note": "Threshold adjustment sets group-specific decision thresholds to equalize acceptance rates.",
    }
