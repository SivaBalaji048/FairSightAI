"""
FairLens — Bias Detection Agent
Comprehensive fairness metrics, model bias analysis, intersectional checks,
and AI-powered narratives.
"""
import json
import numpy as np
import pandas as pd
from scipy import stats
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score, roc_auc_score, confusion_matrix
)
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder, StandardScaler
from openai import OpenAI

from backend.shared_config import (
    OPENROUTER_API_KEY, OPENROUTER_BASE_URL, AI_MODEL,
    DISPARATE_IMPACT_THRESHOLD, BIASevere_THRESHOLD,
)

# ═══════════════════════════════════════════
# 1. STATISTICAL BIAS METRICS
# ═══════════════════════════════════════════

def _group_outcome_rates(df, sensitive, outcome):
    """P(outcome=1 | group) for each group in a categorical sensitive column."""
    return df.groupby(sensitive)[outcome].mean()


def demographic_parity_difference(df, sensitive, outcome):
    """|P(Y=1|A) - P(Y=1|B)| for every pair of groups."""
    rates = _group_outcome_rates(df, sensitive, outcome)
    diffs = {}
    groups = list(rates.index)
    for i in range(len(groups)):
        for j in range(i + 1, len(groups)):
            a, b = str(groups[i]), str(groups[j])
            diffs[f"{a} vs {b}"] = round(abs(float(rates[groups[i]] - rates[groups[j]])), 4)
    return diffs, round(float(rates.max() - rates.min()), 4)


def disparate_impact_ratio(df, sensitive, outcome):
    """P(Y=1|minority) / P(Y=1|majority) using highest-rate group as reference."""
    rates = _group_outcome_rates(df, sensitive, outcome)
    best_group = rates.idxmax()
    best_rate = float(rates[best_group])
    ratios = {}
    flags = {}
    for g in rates.index:
        r = float(rates[g])
        ratio = r / best_rate if best_rate > 0 else 0.0
        ratios[str(g)] = round(ratio, 4)
        flags[str(g)] = ratio < DISPARATE_IMPACT_THRESHOLD
    return ratios, flags


def statistical_parity_difference(df, sensitive, outcome):
    """P(Y=1|group) - P(Y=1) — deviation from overall base rate."""
    rates = _group_outcome_rates(df, sensitive, outcome)
    overall = df[outcome].mean()
    return {str(g): round(float(r - overall), 4) for g, r in rates.items()}


def equalized_odds(df, sensitive, outcome, predictions):
    """Compare TPR and FPR across groups. Works on model predictions."""
    results = {}
    for g in df[sensitive].unique():
        mask = df[sensitive] == g
        grp_y = df.loc[mask, outcome].values
        grp_pred = predictions[mask].values
        tn, fp, fn, tp = confusion_matrix(grp_y, grp_pred, labels=[0, 1]).ravel()
        tpr = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        fpr = fp / (fp + tn) if (fp + tn) > 0 else 0.0
        results[str(g)] = {
            "tpr": round(float(tpr), 4),
            "fpr": round(float(fpr), 4),
        }
    # Disparity
    tprs = [v["tpr"] for v in results.values()]
    fprs = [v["fpr"] for v in results.values()]
    results["disparity"] = {
        "tpr_range": round(max(tprs) - min(tprs), 4),
        "fpr_range": round(max(fprs) - min(fprs), 4),
    }
    return results


def individual_fairness_score(df, sensitive, outcome, feature_cols, k=5):
    """Nearest-neighbor individual fairness:
    For each person, find k nearest neighbors. Check if similar individuals
    get similar outcomes. Return the fraction of individuals whose k-NN
    outcomes are consistent (>80% same label).
    """
    # Drop non-numeric columns, handle NaN
    X_num = df[feature_cols].copy()
    X_num = X_num.fillna(X_num.median())
    # If non-numeric columns remain, skip
    non_numeric = X_num.select_dtypes(exclude=[np.number]).columns
    if len(non_numeric) > 0:
        enc = LabelEncoder()
        for col in non_numeric:
            X_num[col] = enc.fit_transform(X_num[col].astype(str))

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X_num)
    y = df[outcome].values

    from sklearn.neighbors import NearestNeighbors
    nn = NearestNeighbors(n_neighbors=k + 1)  # +1 because self is nearest
    nn.fit(X_scaled)
    distances, indices = nn.kneighbors(X_scaled)

    consistent = 0
    total = len(y)
    for i in range(total):
        neighbor_outcomes = y[indices[i][1:]]  # skip self
        # Consistency = fraction of majority class among neighbors
        if len(neighbor_outcomes) > 0:
            frac = max(np.sum(neighbor_outcomes == 0), np.sum(neighbor_outcomes == 1)) / len(neighbor_outcomes)
            consistent += frac  # weighted by how unanimous neighbors are

    score = round(float(consistent / total), 4)
    return score


def compute_statistical_metrics(df, sensitive, outcome, feature_cols):
    """Full statistical bias computation for one sensitive attribute."""
    rates = _group_outcome_rates(df, sensitive, outcome)

    dp_diffs, dp_max = demographic_parity_difference(df, sensitive, outcome)
    di_ratios, di_flags = disparate_impact_ratio(df, sensitive, outcome)
    spd = statistical_parity_difference(df, sensitive, outcome)

    # Chi-squared test of independence
    contingency = pd.crosstab(df[sensitive], df[outcome])
    chi2, p_value, dof, _ = stats.chi2_contingency(contingency)

    per_group = {}
    for g in rates.index:
        grp = df[df[sensitive] == g]
        per_group[str(g)] = {
            "count": len(grp),
            "positive_rate": round(float(rates[g]), 4),
            "positive_count": int(grp[outcome].sum()),
        }

    return {
        "demographic_parity_difference": dp_diffs,
        "max_demographic_parity_diff": dp_max,
        "disparate_impact_ratio": di_ratios,
        "disparity_flags": di_flags,
        "statistical_parity_diff": spd,
        "chi_squared": round(float(chi2), 4),
        "p_value": round(float(p_value), 4),
        "degrees_of_freedom": int(dof),
        "per_group_stats": per_group,
    }


# ═══════════════════════════════════════════
# 2. MODEL BIAS
# ═══════════════════════════════════════════

def _prepare_ml_data(df, sensitive, outcome, feature_cols):
    """Build feature matrix, excluding the outcome column."""
    cols = [c for c in feature_cols if c != outcome and c != sensitive]
    X = df[cols].copy()
    y = df[outcome].values.astype(int)

    # Encode non-numeric columns
    label_encoders = {}
    for col in X.columns:
        if not pd.api.types.is_numeric_dtype(X[col]):
            le = LabelEncoder()
            X[col] = le.fit_transform(X[col].astype(str))
            label_encoders[col] = le

    X = X.fillna(X.median())
    return X.values.astype(float), y, cols, label_encoders


def compute_model_bias(df, sensitive, outcome, feature_cols):
    """Train LR + RF, measure per-group performance."""
    X, y, used_cols, _ = _prepare_ml_data(df, sensitive, outcome, feature_cols)

    if len(y) < 10 or len(np.unique(y)) < 2:
        return {"error": "Insufficient data for model training"}

    X_train, X_test, y_train, y_test, s_train, s_test = train_test_split(
        X, y, df[sensitive].values, test_size=0.2, random_state=42, stratify=y
    )

    results = {}

    for name, model in [
        ("logistic_regression", LogisticRegression(max_iter=1000, random_state=42)),
        ("random_forest", RandomForestClassifier(n_estimators=50, random_state=42)),
    ]:
        model.fit(X_train, y_train)
        y_pred = model.predict(X_test)
        y_prob = model.predict_proba(X_test)[:, 1]

        per_group = {}
        for g in np.unique(s_test):
            mask = s_test == g
            if mask.sum() < 2:
                continue
            grp_y = y_test[mask]
            grp_pred = y_pred[mask]
            grp_prob = y_prob[mask]

            acc = accuracy_score(grp_y, grp_pred)
            prec = precision_score(grp_y, grp_pred, zero_division=0)
            rec = recall_score(grp_y, grp_pred, zero_division=0)
            f1 = f1_score(grp_y, grp_pred, zero_division=0)
            try:
                auc = roc_auc_score(grp_y, grp_prob)
            except ValueError:
                auc = 0.5

            per_group[str(g)] = {
                "accuracy": round(float(acc), 4),
                "precision": round(float(prec), 4),
                "recall": round(float(rec), 4),
                "f1": round(float(f1), 4),
                "auc_roc": round(float(auc), 4),
                "sample_size": int(mask.sum()),
            }

        # Find most disadvantaged group
        f1_scores = {g: m["f1"] for g, m in per_group.items()}
        worst = min(f1_scores, key=f1_scores.get) if f1_scores else "N/A"

        # Overall metrics
        overall = {
            "accuracy": round(float(accuracy_score(y_test, y_pred)), 4),
            "precision": round(float(precision_score(y_test, y_pred, zero_division=0)), 4),
            "recall": round(float(recall_score(y_test, y_pred, zero_division=0)), 4),
            "f1": round(float(f1_score(y_test, y_pred, zero_division=0)), 4),
            "auc_roc": round(float(roc_auc_score(y_test, y_prob)), 4),
        }

        results[name] = {
            "per_group": per_group,
            "most_disadvantaged_group": str(worst),
            "overall": overall,
        }

    return results


# ═══════════════════════════════════════════
# 3. INTERSECTIONAL BIAS
# ═══════════════════════════════════════════

def compute_intersectional_bias(df, sensitive_columns, outcome, threshold=0.20):
    """Check bias at intersections of sensitive attributes."""
    if len(sensitive_columns) < 2:
        return {
            "note": "Need at least 2 sensitive attributes for intersectional analysis",
            "flags": [],
        }

    df_inter = df.copy()
    df_inter["_intersection"] = df_inter[sensitive_columns].astype(str).agg(" + ".join, axis=1)
    intersection_rates = df_inter.groupby("_intersection")[outcome].mean()
    overall_rate = df_inter[outcome].mean()

    flags = []
    per_intersect = {}
    for group, rate in intersection_rates.items():
        deviation = float(rate - overall_rate)
        per_intersect[str(group)] = {
            "positive_rate": round(float(rate), 4),
            "deviation_from_mean": round(deviation, 4),
            "count": int(len(df_inter[df_inter["_intersection"] == group])),
        }
        if abs(deviation) > threshold:
            flags.append({
                "group": str(group),
                "rate": round(float(rate), 4),
                "deviation": round(deviation, 4),
                "direction": "disadvantaged" if deviation < 0 else "advantaged",
                "severity": "high" if abs(deviation) > 0.30 else "medium",
            })

    best = intersection_rates.max()
    worst = intersection_rates.min()
    di_ratio = float(worst / best) if best > 0 else 0.0

    return {
        "intersection_rates": per_intersect,
        "flags": flags,
        "num_flagged": len(flags),
        "intersectional_disparate_impact_ratio": round(di_ratio, 4),
        "threshold_used": threshold,
    }


# ═══════════════════════════════════════════
# 4. AI-POWERED BIAS NARRATIVE
# ═══════════════════════════════════════════

def _compute_risk_score(metrics, model_perf, intersectional):
    """Heuristic risk score 0-100."""
    score = 0

    # Statistical metrics contribution (max 40 points)
    max_dp = metrics.get("max_demographic_parity_diff", 0)
    score += min(max_dp * 100, 40)

    # Disparate impact ratio contribution (max 30 points)
    min_di = 1.0
    di_ratios = metrics.get("disparate_impact_ratio", {})
    di_flags = metrics.get("disparity_flags", {})
    for g, ratio in di_ratios.items():
        if g not in ("_intersection",) and ratio < min_di:
            min_di = ratio
    score += (1.0 - min_di) * 30

    # Intersectional flags (max 20 points)
    num_flagged = intersectional.get("num_flagged", 0)
    score += min(num_flagged * 4, 20)

    # Model bias disparity (max 10 points)
    worst_f1_disparity = 0
    for model_name, perf in model_perf.items():
        if "error" in perf:
            continue
        f1_vals = [v["f1"] for v in perf.get("per_group", {}).values()]
        if f1_vals:
            worst_f1_disparity = max(worst_f1_disparity, max(f1_vals) - min(f1_vals))
    score += worst_f1_disparity * 10

    return min(round(score, 1), 100.0)


def generate_bias_narrative(metrics, model_perf, intersectional, domain, risk_score):
    """Use the AI model to write a plain-English bias summary."""
    client = OpenAI(
        base_url=OPENROUTER_BASE_URL,
        api_key=OPENROUTER_API_KEY,
    )

    payload = {
        "statistical_metrics": metrics,
        "model_bias": {
            k: v for k, v in model_perf.items()
            if "error" not in v
        },
        "intersectional_flags": intersectional.get("flags", []),
        "risk_score": risk_score,
    }

    domain_context = {
        "hiring": "This is an employment/hiring dataset. Reference EEOC Uniform Guidelines and the four-fifths (80%) rule. Discuss adverse impact in hiring decisions and potential Title VII implications.",
        "loan": "This is a lending/credit dataset. Reference the Equal Credit Opportunity Act (ECOA), fair lending laws, and CFPB guidelines. Discuss disparate impact in loan approvals and potential redlining concerns.",
        "healthcare": "This is a healthcare dataset. Reference the Affordable Care Act Section 1557, health equity frameworks, and CMS guidelines. Discuss disparities in treatment recommendations and potential healthcare access barriers.",
    }.get(domain, "Provide a general fairness analysis without domain-specific legal references.")

    prompt = f"""You are an expert algorithmic fairness auditor. Analyze these metrics and write a clear, professional report.

Metrics JSON:
{json.dumps(payload, indent=2, default=str)}

Context: {domain_context}

Respond ONLY as a valid JSON object (no markdown, no code fences):
{{
  "severity": "high|medium|low",
  "summary": "2-3 paragraph plain-English summary of findings. What biases were found? Which groups are affected? How severe?",
  "affected_groups": ["list of worst-off groups"],
  "key_finding": "One sentence capturing the most important finding",
  "legal_context": "Relevant legal/regulatory context for this domain",
  "recommendations": ["3-5 concrete next steps"]
}}"""

    try:
        response = client.chat.completions.create(
            model=AI_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=1024,
        )
        text = response.choices[0].message.content.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1]
        if text.endswith("```"):
            text = text.rsplit("\n", 1)[0]
        return json.loads(text.strip())
    except json.JSONDecodeError:
        return {
            "severity": "high" if risk_score > 60 else ("medium" if risk_score > 30 else "low"),
            "summary": "Bias detection completed but AI narrative was unavailable.",
            "affected_groups": [],
            "key_finding": "Metrics were computed successfully.",
            "legal_context": domain_context,
            "recommendations": ["Review metrics manually", "Consider mitigation techniques"],
        }
    except Exception as e:
        return {
            "severity": "high" if risk_score > 60 else ("medium" if risk_score > 30 else "low"),
            "summary": f"AI narrative unavailable due to model error: {e}",
            "affected_groups": [],
            "key_finding": "Metrics computed without AI narrative.",
            "legal_context": domain_context,
            "recommendations": ["Review metrics manually"],
        }


# ═══════════════════════════════════════════
# MAIN ENTRY POINT
# ═══════════════════════════════════════════

def run_full_bias_analysis(df, sensitive_columns, outcome_column, domain="general"):
    """
    Run all bias detection stages and return a consolidated report.

    Args:
        df: Preprocessed DataFrame
        sensitive_columns: list of column names treated as sensitive attributes
        outcome_column: name of the target/outcome column
        domain: "hiring", "loan", "healthcare", or "general"

    Returns:
        dict with metrics, model_performance, intersectional, narrative, risk_score
    """
    feature_cols = [c for c in df.columns if c != outcome_column]

    # 1. Statistical metrics per sensitive attribute
    all_metrics = {}
    for attr in sensitive_columns:
        if attr not in df.columns or outcome_column not in df.columns:
            all_metrics[attr] = {"error": f"Missing column: {attr} or {outcome_column}"}
            continue
        all_metrics[attr] = compute_statistical_metrics(df, attr, outcome_column, feature_cols)

    # 2. Model bias (only for binary/multiclass outcome)
    model_perf = compute_model_bias(df, sensitive_columns[-1], outcome_column, feature_cols)

    # 3. Intersectional bias
    valid_sensitive = [c for c in sensitive_columns if c in df.columns]
    intersectional = compute_intersectional_bias(df, valid_sensitive, outcome_column)

    # 4. Risk score
    primary_metrics = all_metrics.get(sensitive_columns[-1], {})
    risk_score = _compute_risk_score(primary_metrics, model_perf, intersectional)

    # 5. AI narrative
    narrative = generate_bias_narrative(primary_metrics, model_perf, intersectional, domain, risk_score)

    return {
        "metrics": all_metrics,
        "model_performance": model_perf,
        "intersectional": intersectional,
        "narrative": narrative,
        "risk_score": risk_score,
    }
