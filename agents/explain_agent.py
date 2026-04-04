"""
FairLens — Explainability Agent
SHAP-based feature importance, counterfactuals, visual data,
AI-powered explanations (plain-English + technical), and individual case explainers.
"""
import json
import warnings

import numpy as np
import pandas as pd
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from openai import OpenAI

from backend.shared_config import OPENROUTER_API_KEY, OPENROUTER_BASE_URL, AI_MODEL

warnings.filterwarnings("ignore")


# ═══════════════════════════════════════════
# 1. FEATURE IMPORTANCE ANALYSIS (SHAP)
# ═══════════════════════════════════════════

def _prepare_features(df, outcome_col, sensitive_cols):
    """Encode and scale features, return X, y, feature names, encoders."""
    X = df.drop(columns=[outcome_col], errors="ignore").copy()
    y = df[outcome_col].values.astype(int)

    label_encoders = {}
    for col in X.columns:
        if not pd.api.types.is_numeric_dtype(X[col]):
            le = LabelEncoder()
            X[col] = le.fit_transform(X[col].astype(str))
            label_encoders[col] = le

    X = X.fillna(X.median())
    feature_names = list(X.columns)
    scaler = StandardScaler()
    X_scaled = pd.DataFrame(scaler.fit_transform(X), columns=feature_names)
    return X_scaled, y, feature_names, label_encoders, scaler


def compute_shap_values(X_df, y):
    """Compute SHAP values using tree explainer on RandomForest.

    Returns mean |SHAP| per feature, overall and per sensitive-attribute group.
    """
    import shap

    model = RandomForestClassifier(n_estimators=50, max_depth=5, random_state=42)
    model.fit(X_df, y)

    explainer = shap.TreeExplainer(model)
    shap_values = explainer.shap_values(X_df)

    # SHAP returns for each class; take positive class
    if isinstance(shap_values, list):
        shap_values = shap_values[-1]  # last class = positive

    mean_abs_shap = np.abs(shap_values).mean(axis=0)
    shap_by_feature = dict(zip(X_df.columns, np.round(mean_abs_shap, 6)))
    # Sort by importance
    shap_by_feature = dict(
        sorted(shap_by_feature.items(), key=lambda x: x[1], reverse=True)
    )
    return shap_by_feature, shap_values, model


def detect_proxy_correlations(X_df, sensitive_cols, threshold=0.6):
    """Find features correlated > threshold with any sensitive attribute."""
    proxies = {}
    for s_col in sensitive_cols:
        if s_col not in X_df.columns:
            continue
        s_vals = X_df[s_col].astype(float)
        for col in X_df.columns:
            if col == s_col or col in sensitive_cols:
                continue
            corr = abs(X_df[col].astype(float).corr(s_vals))
            if not np.isnan(corr) and corr > threshold:
                if col not in proxies:
                    proxies[col] = []
                proxies[col].append({
                    "sensitive_attribute": s_col,
                    "correlation": round(float(corr), 4),
                })
    return proxies


def compute_feature_importance_with_shap(df, outcome_col, sensitive_cols):
    """Full feature importance analysis with SHAP + proxy detection."""
    X_df, y, feature_names, encoders, scaler = _prepare_features(
        df, outcome_col, sensitive_cols
    )

    shap_by_feature, shap_values, model = compute_shap_values(X_df, y)
    proxies = detect_proxy_correlations(X_df, sensitive_cols)

    top_feature = list(shap_by_feature.keys())[0] if shap_by_feature else None
    top_shap_value = shap_by_feature.get(top_feature, 0)

    sensitive_in_features = [f for f in sensitive_cols if f in feature_names]
    sensitive_ranked = []
    for s in sensitive_in_features:
        rank = list(shap_by_feature.keys()).index(s) + 1 if s in shap_by_feature else -1
        sensitive_ranked.append({
            "attribute": s,
            "rank": rank,
            "mean_abs_shap": shap_by_feature.get(s, 0),
        })

    is_sensitive_top = (
        any(s in top_feature for s in sensitive_cols)
        if top_feature else False
    )

    # SHAP bar chart data (Recharts format)
    shap_chart_data = [
        {"feature": feat, "importance": round(val, 6)}
        for feat, val in shap_by_feature.items()
    ]

    return {
        "shap_feature_importance": shap_by_feature,
        "shap_chart_data": shap_chart_data,
        "top_feature": top_feature,
        "top_shap_value": top_shap_value,
        "sensitive_attribute_ranking": sensitive_ranked,
        "sensitive_is_top_feature": is_sensitive_top,
        "proxy_correlations": proxies,
        "proxy_chart_data": _build_proxy_chart(proxies, X_df.columns.tolist()),
    }


def _build_proxy_chart(proxies, all_features):
    """Prepare correlation matrix data for frontend heatmap."""
    if not proxies:
        return []
    rows = []
    for feat, corr_list in proxies.items():
        for c in corr_list:
            rows.append({
                "feature": feat,
                "sensitive_attribute": c["sensitive_attribute"],
                "correlation": c["correlation"],
            })
    return rows


# ═══════════════════════════════════════════
# 2. COUNTERFACTUAL EXPLANATIONS
# ═══════════════════════════════════════════

def generate_counterfactuals(df, model, outcome_col, sensitive_cols, feature_names, n_samples=10, max_changes=3):
    """Generate counterfactual explanations for negative-outcome individuals.

    For each rejected person, find the minimum feature changes needed
    to flip prediction to positive. Compare across sensitive groups.
    """
    X_df, y, _, _, scaler = _prepare_features(df, outcome_col, sensitive_cols)

    # Select negative-outcome individuals
    negatives = df[df[outcome_col] == 0].sample(
        n=min(n_samples, len(df[df[outcome_col] == 0])), random_state=42
    )

    counterfactuals = []
    for idx, row in negatives.iterrows():
        x = X_df.loc[idx].values.reshape(1, -1)
        pred = model.predict(x)[0]

        if pred == 1:
            continue  # skip if model already disagrees with label

        cf_features = {}
        changed = []

        # Get SHAP values for this instance
        import shap
        explainer = shap.TreeExplainer(model)
        sv = explainer.shap_values(x)[-1].flatten()

        # Sort features by negative SHAP contribution (pushing toward negative)
        sorted_idx = np.argsort(sv)
        feature_arr = list(X_df.columns)

        for feat_idx in sorted_idx:
            if len(changed) >= max_changes:
                break
            fname = feature_arr[feat_idx]
            feat_type = df[fname].dtype

            # Try moving this feature by one step
            current_val = float(x[0, feat_idx])
            std_val = X_df.iloc[:, feat_idx].std()
            if pd.isna(std_val) or std_val == 0:
                continue

            # Move toward the positive group's mean
            positive_group = df[df[outcome_col] == 1]
            target_val = positive_group[fname].median()
            if pd.api.types.is_numeric_dtype(df[fname]):
                direction = 1 if target_val > current_val else -1
                new_val = current_val + direction * std_val * 0.5
                x_new = x.copy()
                x_new[0, feat_idx] = new_val
                new_pred = model.predict(x_new)[0]
                cf_features[fname] = {
                    "original": round(float(current_val), 2),
                    "proposed": round(float(new_val), 2),
                    "change": round(float(new_val - current_val), 2),
                }
                if new_pred == 1:
                    changed.append(fname)
                    break
                else:
                    x[0, feat_idx] = new_val
                    changed.append(fname)

        cf_row = negatives.loc[idx]
        cf = {
            "individual": {col: str(cf_row[col]) for col in sensitive_cols if col in df.columns},
            "sensitive_values": {col: str(cf_row[col]) for col in sensitive_cols},
            "features_changed": changed,
            "feature_changes": cf_features,
            "num_changes_needed": len(changed),
        }
        counterfactuals.append(cf)

    # Compare across groups
    group_comparison = {}
    for s_col in sensitive_cols:
        groups = {}
        for cf in counterfactuals:
            grp = cf["sensitive_values"].get(s_col, "unknown")
            if grp not in groups:
                groups[grp] = {"total": 0, "changes": [], "num_changes": []}
            groups[grp]["total"] += 1
            groups[grp]["changes"].extend(cf["features_changed"])
            groups[grp]["num_changes"].append(cf["num_changes_needed"])

        for grp in groups:
            groups[grp]["avg_changes"] = round(
                np.mean(groups[grp]["num_changes"]), 2
            ) if groups[grp]["num_changes"] else 0
            groups[grp]["most_changed_features"] = (
                pd.Series(groups[grp]["changes"]).value_counts().head(3).to_dict()
                if groups[grp]["changes"] else {}
            )
        group_comparison[s_col] = groups

    return {
        "counterfactuals": counterfactuals,
        "group_comparison": group_comparison,
    }


# ═══════════════════════════════════════════
# 3. VISUAL DATA
# ═══════════════════════════════════════════

def prepare_visual_data(df, shap_by_feature, bias_metrics, sensitive_cols, outcome_col):
    """Prepare all chart-ready data for the frontend."""
    # SHAP bar chart data already formatted
    shap_data = [
        {"feature": feat, "importance": round(val, 6)}
        for feat, val in list(shap_by_feature.items())[:15]
    ]

    # Disparity heatmap: group x feature outcome rates
    heatmap_data = []
    for s_col in sensitive_cols:
        if s_col not in df.columns:
            continue
        for group in df[s_col].unique():
            grp = df[df[s_col] == group]
            rate = round(grp[outcome_col].mean(), 4) if outcome_col in grp.columns else 0
            heatmap_data.append({
                "group": f"{s_col}: {group}",
                "positive_rate": rate,
                "count": len(grp),
            })

    # Proxy correlation matrix
    X_df = df.copy()
    for col in X_df.columns:
        if not pd.api.types.is_numeric_dtype(X_df[col]):
            le = LabelEncoder()
            X_df[col] = le.fit_transform(X_df[col].astype(str))
    X_df = X_df.fillna(0)

    corr_matrix = X_df.corr()
    corr_data = []
    for col_a in X_df.columns:
        for col_b in X_df.columns:
            corr_data.append({
                "column_a": col_a,
                "column_b": col_b,
                "correlation": round(float(corr_matrix.loc[col_a, col_b]), 4),
            })

    return {
        "shap_bar_chart": shap_data,
        "disparity_heatmap": heatmap_data,
        "correlation_matrix": corr_data,
    }


# ═══════════════════════════════════════════
# 4. AI-POWERED EXPLANATION
# ═══════════════════════════════════════════

def generate_explanations(
    shap_results, proxy_results, bias_metrics, visual_data, domain="general"
):
    """Use AI to generate plain-English + technical explanations + recommendations."""
    client = OpenAI(
        base_url=OPENROUTER_BASE_URL,
        api_key=OPENROUTER_API_KEY,
    )

    context_blocks = {
        "hiring": "This is an employment/hiring dataset. Consider EEOC guidelines, adverse impact doctrine, and the four-fifths rule.",
        "loan": "This is a lending/credit dataset. Consider the Equal Credit Opportunity Act (ECOA), fair lending laws, and potential redlining through proxy variables.",
        "healthcare": "This is a healthcare dataset. Consider the Affordable Care Act Section 1557, health equity, and CMS fair treatment guidelines.",
    }
    domain_note = context_blocks.get(domain, "Provide a general fairness explanation.")

    payload = {
        "top_features": list(shap_results.get("shap_feature_importance", {}).items())[:10],
        "sensitive_is_top_feature": shap_results.get("sensitive_is_top_feature", False),
        "sensitive_ranking": shap_results.get("sensitive_attribute_ranking", []),
        "proxy_correlations": proxy_results,
        "bias_metrics": bias_metrics,
    }

    prompt = f"""You are an algorithmic fairness expert. The audience has two groups:
1. Non-technical stakeholders (HR, compliance officers)
2. Data scientists and ML engineers

Here is the analysis data:
{json.dumps(payload, indent=2, default=str)}

{domain_note}

Respond ONLY as valid JSON (no markdown, no code fences):
{{
  "plain_english_explanation": "3-5 paragraph explanation for a non-technical audience. Use specific examples like: 'The model appears to use [feature] as a stand-in for [sensitive attribute], causing [group] to receive unfavorable outcomes more often.'",
  "technical_explanation": "2-4 paragraph explanation for data scientists. Discuss SHAP values, feature interactions, proxy variables, and the mechanism by which bias enters the decision process.",
  "key_finding": "One sentence capturing the most important finding.",
  "proxy_warning": "Boolean: is there evidence of proxy discrimination (>0.6 correlation)?",
  "top_driving_features": ["top 5 features driving disparities, ranked by SHAP importance"],
  "recommendations": ["3 concrete, specific recommendations for the data team, tailored to this exact dataset and findings"]
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
        result["explanation_available"] = True
        return result
    except (json.JSONDecodeError, Exception) as e:
        return {
            "plain_english_explanation": (
                f"Bias analysis completed with the following findings: "
                f"Top features: {list(shap_results.get('shap_feature_importance', {}).keys())[:5]}. "
                f"Sensitive attribute flagged as top feature: {shap_results.get('sensitive_is_top_feature', False)}. "
                f"AI narrative unavailable due to: {e}"
            ),
            "technical_explanation": (
                "SHAP-based feature importance was computed. "
                "See shap_feature_importance for ranked features. "
                "Proxy correlations are available in the proxy_correlations field."
            ),
            "key_finding": "Analysis completed; AI narrative unavailable.",
            "proxy_warning": bool(proxy_results),
            "top_driving_features": list(shap_results.get("shap_feature_importance", {}).keys())[:5],
            "recommendations": [
                "Review proxy variables and consider removing or decorrelating them.",
                "Apply fairness-aware training (reweighing, adversarial debiasing).",
                "Validate model performance across all sensitive groups.",
            ],
            "explanation_available": False,
        }


# ═══════════════════════════════════════════
# 5. INDIVIDUAL CASE EXPLAINER
# ═══════════════════════════════════════════

def explain_individual_case(row, model, X_train, feature_names, sensitive_cols, df, outcome_col):
    """Explain a single prediction.

    Returns: prediction, confidence, top 3 reasons, group disparity flag.
    """
    import shap

    x = row.values.reshape(1, -1)
    pred = model.predict(x)[0]
    proba = model.predict_proba(x)[0]
    confidence = round(float(max(proba)), 4)

    # SHAP explanation for this instance
    explainer = shap.TreeExplainer(model)
    sv = explainer.shap_values(x)[0]  # for positive class
    if not isinstance(sv, np.ndarray) or sv.ndim == 1:
        pass
    else:
        sv = sv.flatten()

    feature_importance = list(zip(feature_names, np.abs(sv).flatten()))
    feature_importance.sort(key=lambda x: x[1], reverse=True)

    top_3 = feature_importance[:3]
    reasons = []
    for fname, importance in top_3:
        feat_val = row.get(fname, row.get("index", "N/A")) # row should have the value
        actual_val = row[fname] if fname in row.index else "N/A"
        direction = "+" if sv.flatten()[feature_names.index(fname)] > 0 else "-"
        reasons.append({
            "feature": fname,
            "value": str(actual_val),
            "importance": round(float(importance), 4),
            "direction": direction,
            "meaning": f"{'Increases' if direction == '+' else 'Decreases'} likelihood of positive outcome",
        })

    # Group disparity check
    group_disparity = {}
    for s_col in sensitive_cols:
        if s_col not in row.index or s_col not in df.columns:
            continue
        user_val = row[s_col]
        grp_rates = df.groupby(s_col)[outcome_col].mean()
        user_rate = grp_rates.get(user_val, 0)
        best_rate = grp_rates.max()
        ratio = round(float(user_rate / best_rate), 4) if best_rate > 0 else 0.0
        likely_treated_differently = ratio < 0.80
        group_disparity[s_col] = {
            "user_group": str(user_val),
            "group_positive_rate": round(float(user_rate), 4),
            "best_group_rate": round(float(best_rate), 4),
            "disparity_ratio": ratio,
            "likely_disparate_impact": likely_treated_differently,
        }

    return {
        "prediction": int(pred),
        "confidence": confidence,
        "class_probabilities": {str(i): round(float(p), 4) for i, p in enumerate(proba)},
        "top_3_reasons": reasons,
        "group_disparity": group_disparity,
        "any_group_disparity_flag": any(
            d["likely_disparate_impact"] for d in group_disparity.values()
        ) if group_disparity else False,
    }


# ═══════════════════════════════════════════
# ROUTE HANDLERS
# ═══════════════════════════════════════════

def run_full_explanation(df, sensitive_cols, outcome_col, bias_metrics, domain="general"):
    """
    Run all explainability analysis on a dataset.

    Args:
        df: Preprocessed DataFrame
        sensitive_cols: list of sensitive attribute columns
        outcome_col: name of the outcome column
        bias_metrics: dict from bias_agent.py analysis
        domain: "hiring", "loan", "healthcare"

    Returns:
        Complete explanation JSON
    """
    # 1. SHAP feature importance
    shap_results = compute_feature_importance_with_shap(df, outcome_col, sensitive_cols)

    # 2. Retrain model for counterfactuals
    X_df, y, feature_names, encoders, scaler = _prepare_features(
        df, outcome_col, sensitive_cols
    )
    model = RandomForestClassifier(n_estimators=50, max_depth=5, random_state=42)
    model.fit(X_df, y)

    # 3. Counterfactual explanations
    counterfactuals = generate_counterfactuals(
        df, model, outcome_col, sensitive_cols, feature_names
    )

    # 4. Visual data
    visual_data = prepare_visual_data(
        df, shap_results["shap_feature_importance"], bias_metrics, sensitive_cols, outcome_col
    )

    # 5. AI explanations
    explanations = generate_explanations(
        shap_results, shap_results["proxy_correlations"], bias_metrics, visual_data, domain
    )

    return {
        "feature_importance": shap_results,
        "counterfactuals": counterfactuals,
        "visual_data": visual_data,
        "explanations": explanations,
        "model": model,
        "_X_df": X_df,
        "_feature_names": feature_names,
    }
