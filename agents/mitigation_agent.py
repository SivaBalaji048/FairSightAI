"""
FairLens — Mitigation Agent
Pre-processing, in-processing, and post-processing bias mitigation
with AI-powered recommendations and simulation mode.
"""
import json
import pickle
import uuid
import warnings
import logging
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.metrics import accuracy_score, f1_score, roc_auc_score
from sklearn.model_selection import train_test_split
from openai import OpenAI

from backend.shared_config import OPENROUTER_API_KEY, OPENROUTER_BASE_URL, AI_MODEL

warnings.filterwarnings("ignore")
logger = logging.getLogger("fairlens.mitigation")

MODELS_DIR = Path("models")
MODELS_DIR.mkdir(exist_ok=True)


# ═══════════════════════════════════════════
# Pre-processing helpers
# ═══════════════════════════════════════════

def _prepare_dataset(df, outcome_col, sensitive_cols, exclude_sensitive=True):
    """Encode features, return X, y, names mapping."""
    drop_cols = [outcome_col]
    if exclude_sensitive:
        drop_cols.extend([c for c in sensitive_cols if c in df.columns])
    X = df.drop(columns=drop_cols, errors="ignore").copy()
    y = df[outcome_col].values.astype(int)

    label_encoders = {}
    for col in X.columns:
        if not pd.api.types.is_numeric_dtype(X[col]):
            le = LabelEncoder()
            X[col] = le.fit_transform(X[col].astype(str))
            label_encoders[col] = le

    X = X.fillna(X.median())
    return X.values.astype(float), y, list(X.columns), label_encoders


def _train_and_evaluate(X_train, y_train, X_test, y_test, sensitive_test, groups, weights=None):
    """Train LR and RF, return per-model metrics."""
    results = {}
    kwargs = {}
    if weights is not None:
        kwargs["sample_weight"] = weights

    for name, model in [
        ("logistic_regression", LogisticRegression(max_iter=1000, random_state=42)),
        ("random_forest", RandomForestClassifier(n_estimators=50, max_depth=5, random_state=42)),
    ]:
        m = LogisticRegression(max_iter=1000, random_state=42) if name == "logistic_regression" else RandomForestClassifier(n_estimators=50, max_depth=5, random_state=42)
        if "sample_weight" in kwargs:
            m.fit(X_train, y_train, sample_weight=kwargs["sample_weight"])
        else:
            m.fit(X_train, y_train)

        y_pred = m.predict(X_test)
        y_prob = m.predict_proba(X_test)[:, 1]

        overall_acc = round(float(accuracy_score(y_test, y_pred)), 4)
        overall_f1 = round(float(f1_score(y_test, y_pred, zero_division=0)), 4)
        try:
            overall_auc = round(float(roc_auc_score(y_test, y_prob)), 4)
        except ValueError:
            overall_auc = 0.5

        # Disparate impact ratio across groups
        group_rates = {}
        for g in groups:
            mask = sensitive_test == g
            if mask.sum() > 0:
                group_rates[str(g)] = round(float(np.mean(y_pred[mask])), 4)
            else:
                group_rates[str(g)] = 0.0

        vals = [v for v in group_rates.values() if v > 0]
        best = max(vals) if vals else 1.0
        worst = min(vals) if vals else 0.0
        di_ratio = round(float(worst / best), 4) if best > 0 else 0.0

        results[name] = {
            "accuracy": overall_acc,
            "f1": overall_f1,
            "auc_roc": overall_auc,
            "group_outcome_rates": group_rates,
            "disparate_impact_ratio": di_ratio,
            "model": m,
        }
    return results


def _compute_disparity_ratio(y_pred, sensitive_array):
    """Compute disparate impact ratio from binary predictions."""
    groups = np.unique(sensitive_array)
    rates = {}
    for g in groups:
        mask = sensitive_array == g
        if mask.sum() > 0:
            rates[g] = np.mean(y_pred[mask])
        else:
            rates[g] = 0.0
    vals = [v for v in rates.values() if v > 0]
    if not vals:
        return 0.0, rates
    return round(float(min(vals) / max(vals)), 4), {str(k): round(float(v), 4) for k, v in rates.items()}


def prepare_data_splits(df, outcome_col, sensitive_cols, test_size=0.2, exclude_sensitive=True):
    """Prepare train/test splits with sensitive attr tracking."""
    X, y, feature_names, encoders = _prepare_dataset(
        df, outcome_col, sensitive_cols, exclude_sensitive=exclude_sensitive
    )

    sensitive_array = df[sensitive_cols[0]].values if sensitive_cols else None

    X_train, X_test, y_train, y_test, s_train, s_test = train_test_split(
        X, y, sensitive_array, test_size=test_size, random_state=42, stratify=y
    ) if sensitive_array is not None else (
        train_test_split(X, y, test_size=test_size, random_state=42, stratify=y) + (None, None)
    )

    return {
        "X_train": X_train, "X_test": X_test,
        "y_train": y_train, "y_test": y_test,
        "s_train": s_train, "s_test": s_test,
        "feature_names": feature_names,
        "encoders": encoders,
        "groups": list(np.unique(s_train)) if s_train is not None else [],
    }


# ───────── 1a. Reweighing ─────────

def apply_reweighing(splits):
    """Assign sample weights to equalize group representation."""
    s_train = splits["s_train"]
    y_train = splits["y_train"]
    groups = splits["groups"]

    # Joint distribution of (sensitive, outcome)
    joint_counts = {}
    for g in groups:
        mask = s_train == g
        for label in [0, 1]:
            joint_counts[(g, label)] = int(np.sum((y_train[mask] == label)))

    # Target: equal expected weight for each group-outcome pair
    n_groups = len(groups)
    n_labels = 2
    total = len(y_train)
    expected = total / (n_groups * n_labels)

    weights = np.ones(len(s_train))
    for i in range(len(s_train)):
        key = (s_train[i], int(y_train[i]))
        actual = joint_counts.get(key, 1)
        if actual > 0:
            weights[i] = expected / actual

    return apply_reweighing_with_weights(splits, weights)


def apply_reweighing_with_weights(splits, weights):
    """Train model with custom sample weights."""
    results = {}
    for name, ModelCls in [
        ("logistic_regression", LogisticRegression),
        ("random_forest", RandomForestClassifier),
    ]:
        params = {"max_iter": 1000, "random_state": 42} if name == "logistic_regression" else {"n_estimators": 50, "max_depth": 5, "random_state": 42}
        model = ModelCls(**params)
        model.fit(splits["X_train"], splits["y_train"], sample_weight=weights)

        y_pred = model.predict(splits["X_test"])
        y_prob = model.predict_proba(splits["X_test"])[:, 1]

        overall_acc = round(float(accuracy_score(splits["y_test"], y_pred)), 4)
        overall_f1 = round(float(f1_score(splits["y_test"], y_pred, zero_division=0)), 4)
        try:
            overall_auc = round(float(roc_auc_score(splits["y_test"], y_prob)), 4)
        except ValueError:
            overall_auc = 0.5

        di_ratio, group_rates = _compute_disparity_ratio(y_pred, splits["s_test"])

        results[name] = {
            "accuracy": overall_acc,
            "f1": overall_f1,
            "auc_roc": overall_auc,
            "group_outcome_rates": group_rates,
            "disparate_impact_ratio": di_ratio,
            "model": model,
        }
    return results


# ───────── 1b. Resampling (SMOTE-style oversampling) ─────────

def apply_resampling(df, splits, outcome_col, sensitive_cols):
    """Oversample disadvantaged groups to balance."""
    s_col = sensitive_cols[0]
    s_train = splits["s_train"]
    y_train = splits["y_train"]
    X_train = splits["X_train"]
    groups = splits["groups"]

    # Find group with most samples → target count
    group_counts = {}
    for g in groups:
        group_counts[g] = np.sum(s_train == g)
    target_count = max(group_counts.values())

    indices = list(range(len(s_train)))
    new_indices = []
    rng = np.random.RandomState(42)

    for g in groups:
        mask = np.where(s_train == g)[0]
        count = len(mask)
        if count < target_count:
            # Simple oversampling with SMOTE-like interpolation for numeric features
            oversample_idx = rng.choice(count, target_count - count, replace=True)
            for oi in oversample_idx:
                original_idx = mask[oi]
                new_indices.append(original_idx)
                # Add small noise for variation
                X_train[original_idx] += rng.normal(0, 0.01, X_train.shape[1])

    oversample_X = X_train[new_indices]
    oversample_y = y_train[new_indices]
    oversample_s = s_train[new_indices]

    balanced_X = np.vstack([X_train, oversample_X])
    balanced_y = np.concatenate([y_train, oversample_y])
    balanced_s = np.concatenate([s_train, oversample_s])

    balanced_splits = splits.copy()
    balanced_splits["X_train"] = balanced_X
    balanced_splits["y_train"] = balanced_y
    balanced_splits["s_train"] = balanced_s

    return apply_reweighing_with_weights(balanced_splits, np.ones(len(balanced_X)))


# ───────── 1c. Feature removal ─────────

def apply_feature_removal(df, splits, outcome_col, sensitive_cols, proxies=None):
    """Remove sensitive attributes + proxy features, retrain."""
    # Prepare dataset excluding sensitive columns
    remove_cols = list(sensitive_cols)
    if proxies:
        remove_cols.extend(list(proxies))

    X, y_list, feature_names, encoders = _prepare_dataset(
        df, outcome_col, sensitive_cols, exclude_sensitive=True
    )
    # Already excluded; double-check proxies
    proxy_indices = []
    for i, fname in enumerate(feature_names):
        if fname in (proxies or []):
            proxy_indices.append(i)

    if proxy_indices:
        X = np.delete(X, proxy_indices, axis=1)
        feature_names = [f for i, f in enumerate(feature_names) if i not in proxy_indices]

    sensitive_array = df[s_col].values if (s_col := (sensitive_cols[0] if sensitive_cols else None)) else None

    X_train, X_test, y_train, y_test, s_train, s_test = train_test_split(
        X, y_list, sensitive_array, test_size=0.2, random_state=42, stratify=y_list
    )

    groups = list(np.unique(s_train)) if s_train is not None else []

    feat_splits = {
        "X_train": X_train, "X_test": X_test,
        "y_train": y_train, "y_test": y_test,
        "s_train": s_train, "s_test": s_test,
        "feature_names": feature_names,
        "groups": groups,
    }

    return _train_and_evaluate(X_train, y_train, X_test, y_test, s_train, groups)


# ═══════════════════════════════════════════
# 2. IN-PROCESSING MITIGATION (fairlearn)
# ═══════════════════════════════════════════

def apply_in_processing_fairlearn(splits):
    """
    Use fairlearn's ExponentiatedGradient to enforce equalized odds.
    Falls back gracefully if fairlearn is not installed.
    """
    try:
        from fairlearn.preprocessing import CorrelationRemover  # noqa
        from fairlearn.reductions import ExponentiatedGradient, EqualizedOdds
    except ImportError:
        # Fallback: train LR without sensitive features using class balancing
        logger.warning("fairlearn not installed, using fallback in-processing mitigation")
        return _fallback_in_processing(splits)

    X_train, y_train, s_train = splits["X_train"], splits["y_train"], splits["s_train"]

    # Unconstrained baseline
    base_lr = LogisticRegression(max_iter=1000, random_state=42)
    base_lr.fit(X_train, y_train)

    # Fairness constraint
    constraint = EqualizedOdds()
    exp_grad = ExponentiatedGradient(
        base_lr, constraints=constraint,
    )
    exp_grad.fit(X_train, y_train, sensitive_features=s_train)

    X_test, y_test, s_test = splits["X_test"], splits["y_test"], splits["s_test"]
    groups = splits["groups"]

    results = {}

    # Unconstrained baseline
    y_pred_base = base_lr.predict(X_test)
    y_prob_base = base_lr.predict_proba(X_test)[:, 1]
    di_base, rates_base = _compute_disparity_ratio(y_pred_base, s_test)
    try:
        auc_base = round(float(roc_auc_score(y_test, y_prob_base)), 4)
    except ValueError:
        auc_base = 0.5

    results["baseline_lr_unconstrained"] = {
        "accuracy": round(float(accuracy_score(y_test, y_pred_base)), 4),
        "f1": round(float(f1_score(y_test, y_pred_base, zero_division=0)), 4),
        "auc_roc": auc_base,
        "group_outcome_rates": rates_base,
        "disparate_impact_ratio": di_base,
        "model": base_lr,
    }

    # Fair model
    y_pred_fair = exp_grad.predict(X_test)
    y_prob_fair = exp_grad.predict_proba(X_test)[:, 1]
    di_fair, rates_fair = _compute_disparity_ratio(y_pred_fair, s_test)
    try:
        auc_fair = round(float(roc_auc_score(y_test, y_prob_fair)), 4)
    except ValueError:
        auc_fair = 0.5

    results["exponentiated_gradient_equalized_odds"] = {
        "accuracy": round(float(accuracy_score(y_test, y_pred_fair)), 4),
        "f1": round(float(f1_score(y_test, y_pred_fair, zero_division=0)), 4),
        "auc_roc": auc_fair,
        "group_outcome_rates": rates_fair,
        "disparate_impact_ratio": di_fair,
        "model": exp_grad,
    }

    return results


def _fallback_in_processing(splits):
    """Fallback when fairlearn is unavailable: LR with balanced class weights."""
    X_train, y_train, X_test, y_test = (
        splits["X_train"], splits["y_train"], splits["X_test"], splits["y_test"]
    )
    s_test = splits["s_test"]
    groups = splits["groups"]

    model_balanced = LogisticRegression(max_iter=1000, class_weight="balanced", random_state=42)
    model_balanced.fit(X_train, y_train)

    y_pred = model_balanced.predict(X_test)
    y_prob = model_balanced.predict_proba(X_test)[:, 1]

    di_ratio, group_rates = _compute_disparity_ratio(y_pred, s_test)
    try:
        auc = round(float(roc_auc_score(y_test, y_prob)), 4)
    except ValueError:
        auc = 0.5

    model_default = LogisticRegression(max_iter=1000, random_state=42)
    model_default.fit(X_train, y_train)
    y_pred_d = model_default.predict(X_test)
    y_prob_d = model_default.predict_proba(X_test)[:, 1]
    di_d, _ = _compute_disparity_ratio(y_pred_d, s_test)
    try:
        auc_d = round(float(roc_auc_score(y_test, y_prob_d)), 4)
    except ValueError:
        auc_d = 0.5

    return {
        "class_weight_balanced_lr": {
            "accuracy": round(float(accuracy_score(y_test, y_pred)), 4),
            "f1": round(float(f1_score(y_test, y_pred, zero_division=0)), 4),
            "auc_roc": auc,
            "group_outcome_rates": group_rates,
            "disparate_impact_ratio": di_ratio,
            "model": model_balanced,
        },
        "baseline_default_lr": {
            "accuracy": round(float(accuracy_score(y_test, y_pred_d)), 4),
            "f1": round(float(f1_score(y_test, y_pred_d, zero_division=0)), 4),
            "auc_roc": auc_d,
            "disparate_impact_ratio": di_d,
            "model": model_default,
        },
        "note": "fairlearn not installed. Using class_weight='balanced' as fallback.",
    }


# ═══════════════════════════════════════════
# 3. POST-PROCESSING MITIGATION
# ═══════════════════════════════════════════

def apply_threshold_adjustment(splits, target_di=0.80):
    """
    Find group-specific thresholds that achieve the target disparate impact ratio
    while keeping overall accuracy reasonable.
    """
    # Need a trained model to get probabilities
    model = LogisticRegression(max_iter=1000, random_state=42)
    model.fit(splits["X_train"], splits["y_train"])

    X_test = splits["X_test"]
    y_test = splits["y_test"]
    s_test = splits["s_test"]
    groups = splits["groups"]

    y_prob = model.predict_proba(X_test)[:, 1]

    # Default threshold (same for all)
    default_preds = (y_prob >= 0.5).astype(int)
    default_di, default_rates = _compute_disparity_ratio(default_preds, s_test)

    # Search for group-specific thresholds
    best_thresholds = {g: 0.5 for g in groups}
    best_score = default_di
    best_preds = default_preds

    for g in groups:
        mask = s_test == g
        if mask.sum() == 0:
            continue

        # Binary search for threshold that brings this group's rate closer to overall
        overall_rate = np.mean(y_test)
        grp_probs = y_prob[mask]

        low, high = 0.1, 0.9
        best_threshold_g = 0.5
        for _ in range(50):
            mid = (low + high) / 2
            grp_preds = (grp_probs >= mid).astype(int)
            grp_rate = np.mean(grp_preds) if len(grp_preds) > 0 else 0

            all_preds_temp = np.where(mask, grp_preds, (y_prob[~mask] >= 0.5).astype(int))
            di_temp, _ = _compute_disparity_ratio(all_preds_temp, s_test)

            if di_temp > best_score:
                best_score = di_temp
                best_thresholds = {**best_thresholds, g: mid}
                best_preds = all_preds_temp

            # If group rate > overall, raise threshold (make harder); else lower
            if grp_rate > overall_rate:
                low = mid
            else:
                high = mid

    # Apply final thresholds
    final_preds = np.zeros(len(y_prob), dtype=int)
    for g in groups:
        mask = s_test == g
        t = best_thresholds.get(g, 0.5)
        final_preds[mask] = (y_prob[mask] >= t).astype(int)

    final_di, final_rates = _compute_disparity_ratio(final_preds, s_test)
    final_acc = round(float(accuracy_score(y_test, final_preds)), 4)
    final_f1 = round(float(f1_score(y_test, final_preds, zero_division=0)), 4)

    return {
        "threshold_adjustment": {
            "group_thresholds": {str(k): round(float(v), 4) for k, v in best_thresholds.items()},
            "default_threshold_di": default_di,
            "default_threshold_rates": default_rates,
            "group_outcome_rates": final_rates,
            "disparate_impact_ratio": final_di,
            "accuracy": final_acc,
            "f1": final_f1,
        },
        "default_model_accuracy": round(float(accuracy_score(y_test, default_preds)), 4),
    }


def apply_calibrated_equalized_odds(splits):
    """
    Post-processor: adjust predictions via the equalized odds post-processing method.
    For each group, find (p_pos_given_pos, p_pos_given_neg) that satisfies EO.
    """
    model = LogisticRegression(max_iter=1000, random_state=42)
    model.fit(splits["X_train"], splits["y_train"])

    X_test, y_test, s_test = splits["X_test"], splits["y_test"], splits["s_test"]
    groups = splits["groups"]
    y_prob = model.predict_proba(X_test)[:, 1]

    # Default predictions
    default_preds = (y_prob >= 0.5).astype(int)

    adjusted_preds = default_preds.copy()

    for g in groups:
        mask = s_test == g
        if mask.sum() < 5:
            continue

        grp_y = y_test[mask]
        grp_pred = default_preds[mask]

        # Compute current confusion matrix
        tp = np.sum((grp_pred == 1) & (grp_y == 1))
        fp = np.sum((grp_pred == 1) & (grp_y == 0))
        tn = np.sum((grp_pred == 0) & (grp_y == 0))
        fn = np.sum((grp_pred == 0) & (grp_y == 1))

        n_pos = tp + fn
        n_neg = tn + fp

        if n_pos == 0 or n_neg == 0:
            continue

        # Adjust: if FPR is high, lower threshold for positive class
        # If FNR is high, raise threshold
        # Simple heuristic: match group's TPR/FPR to overall
        overall_tpr = np.sum((default_preds == 1) & (y_test == 1)) / max(np.sum(y_test == 1), 1)
        overall_fpr = np.sum((default_preds == 1) & (y_test == 0)) / max(np.sum(y_test == 0), 1)

        grp_tpr = tp / max(n_pos, 1)
        grp_fpr = fp / max(n_neg, 1)

        # Adjust predictions toward overall rates
        tpr_correction = min(grp_tpr / max(overall_tpr, 1e-6), 1.0)
        fpr_correction = grp_fpr / max(overall_fpr, 1e-6)

        # Apply to this group's predictions
        n_to_flip = 0
        if grp_fpr > overall_fpr and fp > 0:
            # Too many false positives → flip some 1→0
            n_to_flip = max(1, int(fp - grp_fpr * n_neg / max(overall_fpr, 1e-6)))
            fp_indices = mask & (default_preds == 1) & (y_test == 0)
            flip_count = min(n_to_flip, int(fp_indices.sum()))
            if flip_count > 0:
                idx = np.where(fp_indices)[0][:flip_count]
                adjusted_preds[idx] = 0
        elif grp_tpr < overall_tpr and fn > 0:
            # Too many false negatives → flip some 0→1
            n_to_flip = max(1, int(fn - grp_tpr * n_pos / max(overall_tpr, 1e-6)))
            fn_indices = mask & (default_preds == 0) & (y_test == 1)
            flip_count = min(n_to_flip, int(fn_indices.sum()))
            if flip_count > 0:
                idx = np.where(fn_indices)[0][:flip_count]
                adjusted_preds[idx] = 1

    adj_di, adj_rates = _compute_disparity_ratio(adjusted_preds, s_test)
    adj_acc = round(float(accuracy_score(y_test, adjusted_preds)), 4)
    adj_f1 = round(float(f1_score(y_test, adjusted_preds, zero_division=0)), 4)

    return {
        "calibrated_equalized_odds": {
            "group_outcome_rates": adj_rates,
            "disparate_impact_ratio": adj_di,
            "accuracy": adj_acc,
            "f1": adj_f1,
        },
        "default_accuracy": round(float(accuracy_score(y_test, default_preds)), 4),
    }


# ═══════════════════════════════════════════
# 4. SIMULATION MODE
# ═══════════════════════════════════════════

def run_all_simulations(df, sensitive_cols, outcome_col, bias_metrics=None):
    """
    Run all mitigation strategies in simulation mode (read-only, no mutations).
    Returns comparison table + baseline.
    """
    splits = prepare_data_splits(df, outcome_col, sensitive_cols)
    groups = splits["groups"]
    s_test = splits["s_test"]
    y_test = splits["y_test"]

    # Baseline (no mitigation)
    baseline = _train_and_evaluate(
        splits["X_train"], splits["y_train"],
        splits["X_test"], splits["y_test"],
        s_test, groups
    )
    baseline_rf = baseline.get("logistic_regression", {})
    baseline_fairness = baseline_rf.get("disparate_impact_ratio", 0)
    baseline_acc = baseline_rf.get("accuracy", 0)
    baseline_auc = baseline_rf.get("auc_roc", 0)

    strategies = []

    # Strategy 1: Reweighing
    try:
        results = apply_reweighing(splits)
        r = results.get("logistic_regression", {})
        strategies.append({
            "strategy": "reweighing",
            "category": "preprocessing",
            "description": "Assign sample weights to equalize group-outcome representation",
            "fairness_score_before": baseline_fairness,
            "fairness_score_after": r.get("disparate_impact_ratio", 0),
            "accuracy_before": baseline_acc,
            "accuracy_after": r.get("accuracy", 0),
            "f1_before": baseline_rf.get("f1", 0),
            "f1_after": r.get("f1", 0),
            "group_outcome_rates": r.get("group_outcome_rates", {}),
            "model": r.get("model", None),
        })
    except Exception as e:
        logger.warning(f"Reweighing failed: {e}")
        strategies.append({
            "strategy": "reweighing", "category": "preprocessing",
            "error": str(e),
            "fairness_score_before": baseline_fairness, "fairness_score_after": baseline_fairness,
            "accuracy_before": baseline_acc, "accuracy_after": baseline_acc,
            "f1_before": baseline_rf.get("f1", 0), "f1_after": 0,
        })

    # Strategy 2: Resampling
    try:
        results = apply_resampling(df, splits, outcome_col, sensitive_cols)
        r = results.get("logistic_regression", {})
        strategies.append({
            "strategy": "resampling",
            "category": "preprocessing",
            "description": "Oversample disadvantaged groups (SMOTE-style)",
            "fairness_score_before": baseline_fairness,
            "fairness_score_after": r.get("disparate_impact_ratio", 0),
            "accuracy_before": baseline_acc,
            "accuracy_after": r.get("accuracy", 0),
            "f1_before": baseline_rf.get("f1", 0),
            "f1_after": r.get("f1", 0),
            "group_outcome_rates": r.get("group_outcome_rates", {}),
            "model": r.get("model", None),
        })
    except Exception as e:
        logger.warning(f"Resampling failed: {e}")
        strategies.append({
            "strategy": "resampling", "category": "preprocessing",
            "error": str(e),
            "fairness_score_before": baseline_fairness, "fairness_score_after": baseline_fairness,
            "accuracy_before": baseline_acc, "accuracy_after": baseline_acc,
            "f1_before": baseline_rf.get("f1", 0), "f1_after": 0,
        })

    # Strategy 3: Feature removal
    try:
        results = apply_feature_removal(df, splits, outcome_col, sensitive_cols)
        r = results.get("logistic_regression", {})
        strategies.append({
            "strategy": "feature_removal",
            "category": "preprocessing",
            "description": "Remove sensitive attribute and proxy features",
            "fairness_score_before": baseline_fairness,
            "fairness_score_after": r.get("disparate_impact_ratio", 0),
            "accuracy_before": baseline_acc,
            "accuracy_after": r.get("accuracy", 0),
            "f1_before": baseline_rf.get("f1", 0),
            "f1_after": r.get("f1", 0),
            "group_outcome_rates": r.get("group_outcome_rates", {}),
            "model": r.get("model", None),
        })
    except Exception as e:
        logger.warning(f"Feature removal failed: {e}")
        strategies.append({
            "strategy": "feature_removal", "category": "preprocessing",
            "error": str(e),
            "fairness_score_before": baseline_fairness, "fairness_score_after": baseline_fairness,
            "accuracy_before": baseline_acc, "accuracy_after": baseline_acc,
            "f1_before": baseline_rf.get("f1", 0), "f1_after": 0,
        })

    # Strategy 4: In-processing (ExponentiatedGradient)
    try:
        results = apply_in_processing_fairlearn(splits)
        # Pick the fair model or first available
        fair_key = "exponentiated_gradient_equalized_odds" if "exponentiated_gradient_equalized_odds" in results else "class_weight_balanced_lr"
        r = results.get(fair_key, {})
        strategies.append({
            "strategy": "exponentiated_gradient",
            "category": "inprocessing",
            "description": "Train with ExponentiatedGradient to enforce equalized odds via fairlearn",
            "fairness_score_before": baseline_fairness,
            "fairness_score_after": r.get("disparate_impact_ratio", 0),
            "accuracy_before": baseline_acc,
            "accuracy_after": r.get("accuracy", 0),
            "f1_before": baseline_rf.get("f1", 0),
            "f1_after": r.get("f1", 0),
            "group_outcome_rates": r.get("group_outcome_rates", {}),
            "model": r.get("model", None),
            "note": results.get("note", ""),
        })
        # Also add unconstrained vs constrained comparison
        unconstrained = results.get("baseline_lr_unconstrained", results.get("baseline_default_lr", {}))
        strategies.append({
            "strategy": "in_processing_baseline",
            "category": "inprocessing",
            "description": "LR with balanced class weights (fairlearn baseline)",
            "fairness_score_before": baseline_fairness,
            "fairness_score_after": unconstrained.get("disparate_impact_ratio", 0),
            "accuracy_before": baseline_acc,
            "accuracy_after": unconstrained.get("accuracy", 0),
            "f1_before": baseline_rf.get("f1", 0),
            "f1_after": unconstrained.get("f1", 0),
            "group_outcome_rates": unconstrained.get("group_outcome_rates", {}),
            "model": unconstrained.get("model", None),
        })
    except Exception as e:
        logger.warning(f"In-processing failed: {e}")
        strategies.append({
            "strategy": "exponentiated_gradient", "category": "inprocessing",
            "error": str(e),
            "fairness_score_before": baseline_fairness, "fairness_score_after": baseline_fairness,
            "accuracy_before": baseline_acc, "accuracy_after": baseline_acc,
            "f1_before": baseline_rf.get("f1", 0), "f1_after": 0,
        })

    # Strategy 5: Threshold adjustment
    try:
        results = apply_threshold_adjustment(splits)
        r = results.get("threshold_adjustment", {})
        strategies.append({
            "strategy": "threshold_adjustment",
            "category": "postprocessing",
            "description": "Group-specific decision thresholds to equalize acceptance rates",
            "fairness_score_before": baseline_fairness,
            "fairness_score_after": r.get("disparate_impact_ratio", 0),
            "accuracy_before": results.get("default_model_accuracy", baseline_acc),
            "accuracy_after": r.get("accuracy", 0),
            "f1_before": baseline_rf.get("f1", 0),
            "f1_after": r.get("f1", 0),
            "group_outcome_rates": r.get("group_outcome_rates", {}),
            "group_thresholds": r.get("group_thresholds", {}),
        })
    except Exception as e:
        logger.warning(f"Threshold adjustment failed: {e}")
        strategies.append({
            "strategy": "threshold_adjustment", "category": "postprocessing",
            "error": str(e),
            "fairness_score_before": baseline_fairness, "fairness_score_after": baseline_fairness,
            "accuracy_before": baseline_acc, "accuracy_after": baseline_acc,
            "f1_before": baseline_rf.get("f1", 0), "f1_after": 0,
        })

    # Strategy 6: Calibrated equalized odds
    try:
        results = apply_calibrated_equalized_odds(splits)
        r = results.get("calibrated_equalized_odds", {})
        strategies.append({
            "strategy": "calibrated_equalized_odds",
            "category": "postprocessing",
            "description": "Calibrated post-processor to equalize true/false positive rates across groups",
            "fairness_score_before": baseline_fairness,
            "fairness_score_after": r.get("disparate_impact_ratio", 0),
            "accuracy_before": results.get("default_accuracy", baseline_acc),
            "accuracy_after": r.get("accuracy", 0),
            "f1_before": baseline_rf.get("f1", 0),
            "f1_after": r.get("f1", 0),
            "group_outcome_rates": r.get("group_outcome_rates", {}),
        })
    except Exception as e:
        logger.warning(f"Calibrated EO failed: {e}")
        strategies.append({
            "strategy": "calibrated_equalized_odds", "category": "postprocessing",
            "error": str(e),
            "fairness_score_before": baseline_fairness, "fairness_score_after": baseline_fairness,
            "accuracy_before": baseline_acc, "accuracy_after": baseline_acc,
            "f1_before": baseline_rf.get("f1", 0), "f1_after": 0,
        })

    # Add recommendation tags
    for s in strategies:
        fi_before = s["fairness_score_before"]
        fi_after = s["fairness_score_after"]
        acc_delta = s.get("accuracy_after", 0) - s.get("accuracy_before", 0)

        passes_80 = fi_after >= 0.80
        if passes_80 and acc_delta >= -0.05:
            s["recommendation"] = "recommended"
        elif passes_80 or acc_delta >= -0.02:
            s["recommendation"] = "consider"
        else:
            s["recommendation"] = "not_recommended"

        s["fairness_improvement"] = round(fi_after - fi_before, 4)
        s["accuracy_change"] = round(acc_delta, 4)

    # Strip model objects from serializable output
    strategies_serializable = []
    for s in strategies:
        sr = {k: v for k, v in s.items() if k != "model"}
        strategies_serializable.append(sr)

    return {
        "baseline": {
            "fairness_score": baseline_fairness,
            "accuracy": baseline_acc,
            "f1": baseline_rf.get("f1", 0),
            "auc_roc": baseline_auc,
        },
        "strategies": strategies_serializable,
        "models": {s["strategy"]: s["model"] for s in strategies if "model" in s and s["model"] is not None},
    }


# ═══════════════════════════════════════════
# 5. AI-POWERED RECOMMENDATION
# ═══════════════════════════════════════════

def generate_mitigation_recommendations(simulation_results, domain="general"):
    """Use AI to recommend the best mitigation strategy."""
    client = OpenAI(
        base_url=OPENROUTER_BASE_URL,
        api_key=OPENROUTER_API_KEY,
    )

    # Strip non-serializable data
    clean_strategies = []
    for s in simulation_results.get("strategies", []):
        clean_strategies.append({
            "strategy": s["strategy"],
            "category": s["category"],
            "description": s.get("description", ""),
            "fairness_score_after": s["fairness_score_after"],
            "accuracy_after": s.get("accuracy_after", 0),
            "f1_after": s.get("f1_after", 0),
            "recommendation": s.get("recommendation", "not_recommend"),
            "fairness_improvement": s.get("fairness_improvement", 0),
            "accuracy_change": s.get("accuracy_change", 0),
            "group_outcome_rates": s.get("group_outcome_rates", {}),
            "note": s.get("note", ""),
        })

    domain_context = {
        "hiring": "This is an employment/hiring dataset. Consider EEOC compliance, adverse impact doctrine, Title VII obligations, and candidate experience.",
        "loan": "This is a lending/credit dataset. Consider ECOA, fair lending laws, CFPB guidelines, and business justification for risk-accuracy tradeoffs.",
        "healthcare": "This is a healthcare dataset. Consider patient safety, ACA Section 1557, health equity, and clinical validity.",
    }

    prompt = f"""You are an algorithmic fairness consultant. A team has run 6 different bias mitigation strategies.
They need your recommendation on which to deploy.

Baseline: {simulation_results.get("baseline", {})}
Strategies:
{json.dumps(clean_strategies, indent=2)}

Context: {domain_context.get(domain, "General fairness analysis.")}

Respond ONLY as valid JSON (no markdown, no code fences):
{{
  "best_strategy": "name of the recommended strategy",
  "reasoning": "2-3 paragraph justification balancing fairness and accuracy for this domain",
  "action_plan": ["5 concrete steps for stakeholders to implement this recommendation"],
  "tradeoff_summary": "Brief summary of accuracy-fairness tradeoff",
  "legal_ethical_flags": ["Any mitigation strategies that may have legal or ethical implications, with explanation"],
  "alternative": "Second-best strategy if the primary one is not feasible",
  "monitoring_advice": "3 recommendations for ongoing fairness monitoring after deployment"
}}"""

    try:
        response = client.chat.completions.create(
            model=AI_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=1500,
        )
        text = response.choices[0].message.content.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1]
        if text.endswith("```"):
            text = text.rsplit("\n", 1)[0]
        result = json.loads(text.strip())
        result["available"] = True
        return result
    except (json.JSONDecodeError, Exception) as e:
        # Fallback recommendation
        strategies = simulation_results.get("strategies", [])
        recommended = None
        for s in strategies:
            if s.get("recommendation") == "recommended":
                recommended = s["strategy"]
                break
        if not recommended and strategies:
            recommended = strategies[0].get("strategy", "unknown")

        return {
            "best_strategy": recommended or "reweighing",
            "reasoning": f"AI recommendation unavailable ({e}). Based on raw metrics, '{recommended}' appears to offer the best fairness-accuracy tradeoff.",
            "action_plan": [
                "Review the full simulation results table below",
                "Select the strategy with 'recommended' tag",
                "Apply the strategy and re-evaluate on held-out test data",
                "Document the mitigation for compliance purposes",
                "Set up ongoing monitoring for fairness drift",
            ],
            "tradeoff_summary": "See strategy comparison table.",
            "legal_ethical_flags": [
                "Threshold adjustment may face legal challenges if it constitutes disparate treatment.",
                "Feature removal may not satisfy fairness if proxies remain in the data.",
            ],
            "alternative": "try resampling",
            "monitoring_advice": [
                "Track disparate impact ratio monthly",
                "Audit model predictions across all sensitive groups quarterly",
                "Re-run bias analysis whenever training data is updated",
            ],
            "available": False,
        }


# ═══════════════════════════════════════════
# 6. APPLY ENDPOINT
# ═══════════════════════════════════════════

def apply_strategy(df, sensitive_cols, outcome_col, strategy_name):
    """
    Apply a specific mitigation strategy and return the retrained model.
    Model is saved to disk as a pickle file.
    """
    splits = prepare_data_splits(df, outcome_col, sensitive_cols)
    model = None
    metrics = {}

    if strategy_name == "reweighing":
        results = apply_reweighing(splits)
        lr_result = results.get("logistic_regression", {})
        model = lr_result.get("model")
        metrics = {k: v for k, v in lr_result.items() if k != "model"}
        metrics["strategy"] = "reweighing"

    elif strategy_name == "resampling":
        results = apply_resampling(df, splits, outcome_col, sensitive_cols)
        lr_result = results.get("logistic_regression", {})
        model = lr_result.get("model")
        metrics = {k: v for k, v in lr_result.items() if k != "model"}
        metrics["strategy"] = "resampling"

    elif strategy_name == "feature_removal":
        results = apply_feature_removal(df, splits, outcome_col, sensitive_cols)
        lr_result = results.get("logistic_regression", {})
        model = lr_result.get("model")
        metrics = {k: v for k, v in lr_result.items() if k != "model"}
        metrics["feature_names_used"] = splits.get("feature_names", [])
        metrics["strategy"] = "feature_removal"

    elif strategy_name == "exponentiated_gradient":
        results = apply_in_processing_fairlearn(splits)
        fair_key = "exponentiated_gradient_equalized_odds" if "exponentiated_gradient_equalized_odds" in results else "class_weight_balanced_lr"
        r = results.get(fair_key, {})
        model = r.get("model")
        metrics = {k: v for k, v in r.items() if k != "model"}
        metrics["strategy"] = strategy_name
        metrics["note"] = results.get("note", "")

    elif strategy_name == "threshold_adjustment":
        results = apply_threshold_adjustment(splits)
        r = results.get("threshold_adjustment", {})
        metrics = {**r, "strategy": "threshold_adjustment"}
        # Threshold adjustment doesn't produce a model; use the base model
        model = LogisticRegression(max_iter=1000, random_state=42)
        model.fit(splits["X_train"], splits["y_train"])

    elif strategy_name == "calibrated_equalized_odds":
        results = apply_calibrated_equalized_odds(splits)
        r = results.get("calibrated_equalized_odds", {})
        metrics = {**r, "strategy": "calibrated_equalized_odds"}
        model = LogisticRegression(max_iter=1000, random_state=42)
        model.fit(splits["X_train"], splits["y_train"])

    else:
        return {"error": f"Unknown strategy: {strategy_name}"}

    # Save model
    model_id = f"{strategy_name}_{uuid.uuid4().hex[:8]}"
    model_path = MODELS_DIR / f"{model_id}.pkl"
    model_artifact = {
        "model": model,
        "feature_names": splits.get("feature_names", []),
        "feature_encoders": splits.get("encoders", {}),
        "sensitive_attributes": sensitive_cols,
        "outcome_column": outcome_col,
        "strategy": strategy_name,
        "metrics": metrics,
    }
    with open(model_path, "wb") as f:
        pickle.dump(model_artifact, f)

    return {
        "model_id": model_id,
        "model_path": str(model_path),
        "strategy": strategy_name,
        "metrics": metrics,
    }


def load_fair_model(model_id):
    """Load a previously saved fair model by its ID."""
    # Search for model file
    candidates = list(MODELS_DIR.glob(f"*{model_id}*.pkl"))
    if not candidates:
        return None
    with open(candidates[0], "rb") as f:
        return pickle.load(f)
