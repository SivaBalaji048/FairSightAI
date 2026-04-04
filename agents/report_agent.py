"""
FairLens — Report Agent
Compiles all analysis results into structured audit reports.
Exports: JSON, HTML (printable), PDF.
AI-generated executive summary for C-suite.
"""
import json
import os
import html
from datetime import datetime
from pathlib import Path

from openai import OpenAI
from backend.shared_config import OPENROUTER_API_KEY, OPENROUTER_BASE_URL, AI_MODEL

REPORTS_DIR = Path("output_reports")
REPORTS_DIR.mkdir(exist_ok=True)


# ═══════════════════════════════════════════
# AI Executive Summary
# ═══════════════════════════════════════════

def _build_fallback_executive_summary(full_report_data, domain):
    risk_score = full_report_data.get("risk_score", "N/A")
    # narrative is stored inside _all_data inside full_report_data, BUT generate_ai_executive_summary grabs it directly if it's there.
    # Let's extract it safely as generate_ai_executive_summary does:
    narrative = full_report_data.get("narrative", {})
    if not narrative and "_all_data" in full_report_data:
        narrative = full_report_data["_all_data"].get("narrative", {})

    affected = narrative.get("affected_groups", [])
    severity = narrative.get("severity", "unknown")
    
    mitigation_data = full_report_data.get("mitigation", {})
    # If mitigation is stored in mitigation_summary for payload:
    if not mitigation_data and "mitigation_summary" in full_report_data:
         mitigation_data = full_report_data.get("mitigation_summary", {})
         
    strategies = mitigation_data.get("strategies", []) if isinstance(mitigation_data, dict) else []
    best_strategy = "an appropriate bias mitigation strategy"
    if strategies:
        recommended = [s for s in strategies if s.get("recommendation") == "recommended"]
        if recommended:
            best_strategy = str(recommended[0].get("strategy", best_strategy)).replace("_", " ")

    p1 = f"A fairness audit has been completed for this dataset. The overall bias risk score was measured at {risk_score}/100, which corresponds to a {severity} severity level. "
    if affected:
        p1 += f"Specifically, the analysis flagged the following demographic groups as disproportionately affected: {', '.join(affected)}."
    else:
        p1 += "The analysis did not flag any specific demographic groups operating below the 80% disparity threshold."

    p2 = "The evidence for these findings is based on a combination of statistical disparity metrics (such as the Disparate Impact Ratio) and model performance evaluations across different demographic cohorts. Proceeding without mitigation may result in inequitable outcomes."

    p3 = f"To address these findings, it is highly recommended to apply {best_strategy} to the data pipeline or model deployment process. This intervention is algorithmically projected to provide the best balance of increasing fairness while preserving acceptable predictive accuracy."

    return {
        "paragraph_1": p1,
        "paragraph_2": p2,
        "paragraph_3": p3,
        "risk_level": severity,
        "recommended_timeline_weeks": 4,
        "one_sentence_conclusion": "Immediate review and mitigation using the recommended strategy will help ensure fair and equitable model outcomes.",
        "full_text": f"{p1}\n\n{p2}\n\n{p3}",
        "available": True,
    }


def generate_ai_executive_summary(full_report_data, domain="general"):
    """Generate a C-suite executive summary via qwen model."""
    if not OPENROUTER_API_KEY:
        return _build_fallback_executive_summary(full_report_data, domain)

    client = OpenAI(base_url=OPENROUTER_BASE_URL, api_key=OPENROUTER_API_KEY)

    risk_score = full_report_data.get("risk_score", "N/A")
    narrative = full_report_data.get("narrative", {})
    metrics = full_report_data.get("metrics", {})

    payload = {
        "risk_score": risk_score,
        "narrative_summary": narrative.get("summary", ""),
        "narrative_severity": narrative.get("severity", "unknown"),
        "affected_groups": narrative.get("affected_groups", []),
        "key_findings": narrative.get("key_finding", ""),
        "recommendations": narrative.get("recommendations", []),
        "metrics_snapshot": {
            k: v.get("disparate_impact_ratio", "N/A")
            if isinstance(v, dict) else "N/A"
            for k, v in metrics.items()
            if isinstance(v, dict) and "disparate_impact_ratio" in v
        },
        "mitigation": full_report_data.get("mitigation_summary", {}),
    }

    domain_context = {
        "hiring": "employment/hiring audit — reference EEOC guidance to C-suite, Title VII compliance obligations.",
        "loan": "lending/credit audit — reference fair lending compliance, ECOA obligations, reputational risk.",
        "healthcare": "healthcare audit — reference patient equity implications, ACA Section 1557, clinical impact.",
    }
    ctx = domain_context.get(domain, "general AI fairness audit.")

    prompt = f"""You are a senior AI ethics consultant writing an executive summary for a C-suite audience (CEO, Chief Compliance Officer, Board).

This is a {ctx}

Key findings:
{json.dumps(payload, indent=2, default=str)}

Write exactly 3 paragraphs:
1. What was found — direct statement of bias severity and which groups are affected.
2. The evidence — key metrics and what they mean in business terms.
3. What action is needed — specific steps the organization must take, including timeline urgency.

Also include:
- risk_level: "high" / "medium" / "low"
- recommended_timeline: specific number of weeks
- one_sentence_conclusion: a single compelling closing sentence

Respond ONLY as valid JSON (no markdown, no code fences):
{{
  "paragraph_1": "...",
  "paragraph_2": "...",
  "paragraph_3": "...",
  "risk_level": "...",
  "recommended_timeline_weeks": 6,
  "one_sentence_conclusion": "..."
}}"""

    try:
        response = client.chat.completions.create(
            model=AI_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=800,
        )
        text = response.choices[0].message.content.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1]
        if text.endswith("```"):
            text = text.rsplit("\n", 1)[0]
        result = json.loads(text.strip())
        result["full_text"] = (
            f"{result.get('paragraph_1', '')}\n\n"
            f"{result.get('paragraph_2', '')}\n\n"
            f"{result.get('paragraph_3', '')}"
        )
        result["available"] = True
        return result
    except (json.JSONDecodeError, Exception):
        return _build_fallback_executive_summary(full_report_data, domain)


# ═══════════════════════════════════════════
# 1. Report Compilation
# ═══════════════════════════════════════════

def compile_report(
    dataset_info,
    analysis_results=None,
    explanation_results=None,
    mitigation_results=None,
    domain="general",
):
    """
    Compile all results into a single structured audit report dict.
    """
    report = {
        "report_id": f"RPT-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}",
        "generated_at": datetime.utcnow().isoformat(),
        "dataset": dataset_info,
        "bias_analysis": analysis_results or {},
        "explainability": explanation_results or {},
        "mitigation": mitigation_results or {},
        "executive_summary": None,
        "recommendations": [],
    }

    # Collect recommendations from all sources
    if analysis_results:
        narrative = analysis_results.get("narrative", {})
        report["recommendations"].extend(narrative.get("recommendations", []))

    if explanation_results:
        explanations = explanation_results.get("explanations", {})
        recs = explanations.get("recommendations", [])
        if isinstance(recs, list):
            report["recommendations"].extend(recs)

    if mitigation_results:
        recs = mitigation_results.get("recommendations", {})
        plan = recs.get("action_plan", [])
        if isinstance(plan, list):
            report["recommendations"].extend(plan)

    # Remove duplicates while preserving order
    seen = set()
    deduped = []
    for r in report["recommendations"]:
        if r not in seen:
            seen.add(r)
            deduped.append(r)
    report["recommendations"] = deduped

    # Risk score
    report["risk_score"] = analysis_results.get("risk_score", 0) if analysis_results else 0

    # Generate AI executive summary
    report["executive_summary"] = generate_ai_executive_summary(report, domain)

    report["_all_data"] = {
        "metrics": analysis_results.get("metrics", {}) if analysis_results else {},
        "narrative": analysis_results.get("narrative", {}) if analysis_results else {},
        "mitigation_summary": mitigation_results if mitigation_results else {},
    }

    return report


# ═══════════════════════════════════════════
# 2. JSON Export
# ═══════════════════════════════════════════

def export_json(report):
    """Export full report as JSON."""
    # Strip internal-only fields
    clean = {k: v for k, v in report.items() if k != "_all_data"}
    # Clean up non-serializable nested dicts that might have numpy types
    import numpy as np

    def _sanitize(obj):
        if isinstance(obj, dict):
            return {str(k): _sanitize(v) for k, v in obj.items()}
        elif isinstance(obj, (list, tuple)):
            return [_sanitize(i) for i in obj]
        elif isinstance(obj, (np.integer,)):
            return int(obj)
        elif isinstance(obj, (np.floating,)):
            return float(obj)
        elif isinstance(obj, np.ndarray):
            return obj.tolist()
        return obj

    return _sanitize(clean)


# ═══════════════════════════════════════════
# 3. HTML Report (styled, printable)
# ═══════════════════════════════════════════

SEVERITY_COLORS = {"high": "red", "medium": "orange", "low": "green", "unknown": "gray"}

def severity_badge_html(text):
    color = SEVERITY_COLORS.get(str(text).lower(), "gray")
    return f'<span class="badge" style="background:{color};color:#fff">{html.escape(str(text))}</span>'


def export_html(report):
    """Generate a styled, printable HTML report."""
    r_id = report.get("report_id", "N/A")
    gen_at = report.get("generated_at", "N/A")
    dataset = report.get("dataset", {})
    risk = report.get("risk_score", 0)
    recommendations = report.get("recommendations", [])
    narrative = (report.get("bias_analysis") or {}).get("narrative", {})
    exec_summary = report.get("executive_summary", {})
    mitigation = report.get("mitigation", {})
    explanations = report.get("explainability", {})

    risk_color = (
        "#EF4444" if risk >= 60
        else "#F59E0B" if risk >= 30
        else "#22C55E"
    )

    # Build recommendations list items
    rec_items = ""
    for i, rec in enumerate(recommendations, 1):
        rec_items += f"<li>{html.escape(str(rec))}</li>"

    # Build metric tables
    metrics = report.get("_all_data", {}).get("metrics", {})
    metrics_html = _build_metrics_html(metrics)

    # Intersectional
    intersectional = (report.get("bias_analysis") or {}).get("intersectional", {})
    intersectional_html = _build_intersectional_html(intersectional)

    # Model performance
    model_perf = (report.get("bias_analysis") or {}).get("model_performance", {})
    model_perf_html = _build_model_performance_html(model_perf)

    # Feature importance
    feat_imp = explanations.get("feature_importance", {})
    shap_data = feat_imp.get("shap_chart_data", [])
    shap_html = _build_shap_html(shap_data)

    # Counterfactuals
    cf_data = explanations.get("counterfactuals", {}).get("group_comparison", {})
    cf_html = _build_counterfactual_html(cf_data)

    # Mitigation comparison
    sim_strategies = mitigation.get("strategies", []) if isinstance(mitigation, dict) else []
    mitigation_html = _build_mitigation_html(sim_strategies)

    template = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>FairLens Report {r_id}</title>
<style>
:root {{ --danger: #EF4444; --orange: #F59E0B; --green: #22C55E; --gray: #6B7280; }}
* {{ box-sizing: border-box; margin: 0; padding: 0; }}
body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #111; line-height: 1.6; max-width: 900px; margin: 0 auto; padding: 2rem; }}
h1 {{ font-size: 1.8rem; border-bottom: 3px solid var(--gray); padding-bottom: 0.5rem; margin-bottom: 1.5rem; }}
h2 {{ font-size: 1.3rem; margin: 2rem 0 0.75rem; color: #1f2937; border-left: 4px solid var(--orange); padding-left: 0.75rem; }}
h3 {{ font-size: 1.1rem; margin: 1rem 0 0.5rem; }}
.meta {{ color: #6B7280; font-size: 0.85rem; margin-bottom: 1.5rem; }}
.summary-box {{ background: #f9fafb; border: 1px solid #e5e7eb; border-left: 4px solid {risk_color}; border-radius: 8px; padding: 1.25rem; margin: 1rem 0; }}
.summary-box p {{ margin-bottom: 0.75rem; }}
.risk-gauge {{ display: flex; align-items: center; gap: 1rem; margin: 1rem 0; }}
.risk-number {{ font-size: 2.5rem; font-weight: bold; color: {risk_color}; }}
.badge {{ display: inline-block; padding: 2px 10px; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; }}
table {{ width: 100%; border-collapse: collapse; margin: 1rem 0; font-size: 0.85rem; }}
th {{ text-align: left; padding: 0.5rem; border-bottom: 2px solid #e5e7eb; color: #374151; }}
td {{ padding: 0.5rem; border-bottom: 1px solid #f3f4f6; }}
tr:hover {{ background: #f9fafb; }}
.bar {{ height: 20px; border-radius: 4px; background: #e5e7eb; position: relative; min-width: 100px; }}
.bar-fill {{ height: 100%; border-radius: 4px; position: absolute; left: 0; }}
ul {{ margin-left: 1.5rem; }}
.recommendations li {{ margin: 0.5rem 0; }}
@media print {{
  body {{ padding: 0; max-width: none; }}
  .no-print {{ display: none; }}
}}
</style>
</head>
<body>

<h1>FairLens — AI Fairness Audit Report</h1>
<p class="meta">Report ID: {r_id} &nbsp;|&nbsp; Generated: {gen_at}</p>

<p class="meta">Dataset: {html.escape(str(dataset.get("filename", 'N/A')))} &nbsp;|&nbsp; Rows: {dataset.get("row_count", "N/A")} &nbsp;|&nbsp; Columns: {dataset.get("column_count", "N/A")}</p>

<div class="risk-gauge">
  <div>
    <div style="font-size: 0.75rem; color: var(--gray); text-transform: uppercase; letter-spacing: 0.05em;">Bias Risk Score</div>
    <div class="risk-number">{risk}</div>
  </div>
  <div>
    <div style="font-size: 1rem;">Severity: {severity_badge_html(narrative.get("severity", "unknown"))}</div>
  </div>
</div>

<h2>Executive Summary</h2>
<div class="summary-box">
{f"<p>{html.escape(exec_summary.get('paragraph_1', ''))}</p>" if exec_summary.get("available") else ""}
{f"<p>{html.escape(exec_summary.get('paragraph_2', ''))}</p>" if exec_summary.get("available") else ""}
{f"<p>{html.escape(exec_summary.get('paragraph_3', ''))}</p>" if exec_summary.get("available") else ""}
{f"<p style='margin-top:1rem; font-weight:600; font-style:italic;'>{html.escape(exec_summary.get('one_sentence_conclusion', ''))}</p>" if exec_summary.get("available", False) else ""}
</div>

<h2>Bias Analysis</h2>
<h3>Findings</h3>
<div class="summary-box">
<p>{html.escape(narrative.get("summary", "No narrative available."))}</p>
{f"<p><strong>Key finding:</strong> {html.escape(narrative.get('key_finding', ''))}</p>" if narrative.get('key_finding') else ''}
</div>

<h3>Affected Groups</h3>
<ul>
{chr(10).join(f'<li>{html.escape(str(g))}</li>' for g in narrative.get("affected_groups", [])) or '<li>No specific groups identified.</li>'}
</ul>

{metrics_html}

{intersectional_html}

{model_perf_html}

<h2>Explainability</h2>

<h3>Feature Importance (SHAP Values)</h3>
{shap_html}

<h3>Proxy Correlations</h3>
{explanations.get("feature_importance", {}).get("sensitive_is_top_feature", False) and '<p style="color:red; font-weight: bold;">⚠ The sensitive attribute IS the top-ranked feature. The model directly depends on protected characteristics.</p>' or '<p>No proxy correlation warning.</p>'}

<h3>Counterfactual Comparison</h3>
{cf_html}

<h2>Mitigation</h2>
{mitigation_html}

<h2>Recommendations</h2>
<ul class="recommendations">
{rec_items or "<li>No specific recommendations generated.</li>"}
</ul>

<div class="no-print" style="text-align: center; margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #e5e7eb;">
<p style="color: var(--gray); font-size: 0.8rem;">Generated by FairLens — AI Bias Detection Platform</p>
</div>

<script>
function printReport() {{ window.print(); }}
</script>
</body>
</html>"""

    return template


def _build_metrics_html(metrics):
    if not metrics:
        return ""
    html_out = "<h3>Statistical Metrics</h3>"
    for attr, data in metrics.items():
        if not isinstance(data, dict):
            continue
        html_out += f"<h4>{html.escape(str(attr))}</h4>"
        html_out += "<table><tr><th>Metric</th><th>Value</th></tr>"
        for key, val in data.items():
            if key in ("per_group_stats",):
                continue
            html_out += f"<tr><td>{html.escape(str(key).replace('_', ' ').title())}</td>"
            html_out += f"<td>{html.escape(str(val))}</td></tr>"
        html_out += "</table>"
    return html_out


def _build_intersectional_html(data):
    flags = data.get("flags", [])
    if not flags:
        return ""
    html_out = "<h3>Intersectional Bias Flags</h3><table><tr><th>Intersection</th><th>Rate</th><th>Deviation</th><th>Direction</th><th>Severity</th></tr>"
    for f in flags:
        html_out += (
            f"<tr><td>{html.escape(str(f.get('group', '')))}</td>"
            f"<td>{f.get('rate', 'N/A')}</td>"
            f"<td>{f.get('deviation', 'N/A')}</td>"
            f"<td>{html.escape(str(f.get('direction', '')))}</td>"
            f"<td>{html.escape(str(f.get('severity', '')))}</td></tr>"
        )
    html_out += "</table>"
    return html_out


def _build_model_performance_html(data):
    if not data:
        return ""
    html_out = "<h3>Model Fairness by Group</h3>"
    for name, perf in data.items():
        groups = perf.get("per_group", {})
        if not groups:
            continue
        html_out += f"<h4>{html.escape(str(name).replace('_', ' ').title())}</h4>"
        html_out += "<table><tr><th>Group</th><th>Accuracy</th><th>Precision</th><th>Recall</th><th>F1</th><th>AUC</th></tr>"
        for g, m in groups.items():
            html_out += (
                f"<tr><td>{html.escape(str(g))}</td>"
                f"<td>{m.get('accuracy', 'N/A')}</td>"
                f"<td>{m.get('precision', 'N/A')}</td>"
                f"<td>{m.get('recall', 'N/A')}</td>"
                f"<td>{m.get('f1', 'N/A')}</td>"
                f"<td>{m.get('auc_roc', 'N/A')}</td></tr>"
            )
        html_out += "</table>"
    return html_out


def _build_shap_html(shap_data):
    if not shap_data:
        return "<p>No SHAP data available.</p>"
    bars = ""
    for item in shap_data[:10]:
        feat = html.escape(str(item.get("feature", "")))
        val = item.get("importance", 0)
        pct = min(val * 200, 100)
        bars += (
            f'<div style="display:flex;align-items:center;gap:8px;margin:4px 0;">'
            f'<span style="min-width:200px;font-size:0.85rem;">{feat}</span>'
            f'<div class="bar"><div class="bar-fill" style="width:{pct}%;background:'
            f'{"#F59E0B" if pct > 15 else "#EF4444" if pct > 30 else "#22C55E"};"></div></div>'
            f'<span style="font-size:0.75rem;color:#6B7280;">{val:.6f}</span></div>'
        )
    return bars


def _build_counterfactual_html(cf_data):
    if not cf_data:
        return "<p>No counterfactual data available.</p>"
    html_out = ""
    for attr, groups in cf_data.items():
        html_out += f"<h4>Changes needed by {html.escape(str(attr)).replace('_',' ').title()} group</h4>"
        html_out += "<table><tr><th>Group</th><th>Avg changes needed</th><th>Most common features</th></tr>"
        for g, data in groups.items():
            avg = data.get("avg_changes", "N/A")
            most = data.get("most_changed_features", {})
            features = ", ".join(f"{k} ({v}x)" for k, v in most.items())
            html_out += f"<tr><td>{html.escape(str(g))}</td><td>{avg}</td><td>{html.escape(features)}</td></tr>"
        html_out += "</table>"
    return html_out


def _build_mitigation_html(strategies):
    if not strategies:
        return "<p>No mitigation data available.</p>"

    # Identify best recommended strategy
    recommended = [s for s in strategies if s.get("recommendation") == "recommended"]
    consider = [s for s in strategies if s.get("recommendation") == "consider"]
    best_pool = recommended or consider
    best = max(best_pool, key=lambda s: s.get("fairness_score_after") or 0) if best_pool else None

    html_out = "<h3>Mitigation Strategy Comparison &mdash; Before vs After</h3>"

    # Before/After summary callout
    if best:
        b_fair = best.get("fairness_score_before", "N/A")
        a_fair = best.get("fairness_score_after", "N/A")
        b_acc = best.get("accuracy_before", "N/A")
        a_acc = best.get("accuracy_after", "N/A")
        d_fair = best.get("fairness_improvement", "N/A")
        strat = html.escape(str(best.get("strategy", "")).replace("_", " ").title())

        meets_threshold = isinstance(a_fair, (int, float)) and a_fair >= 0.80
        threshold_note = (
            "&#10003; Meets the 80% fairness threshold after mitigation."
            if meets_threshold
            else "&#9888; Still below 80% threshold — consider combining strategies."
        )

        html_out += f"""
<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-left:4px solid #22C55E;border-radius:8px;padding:1rem;margin:1rem 0;">
  <strong style="font-size:1rem;">&#10024; Best Strategy: {strat}</strong>
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1rem;margin-top:0.75rem;">
    <div style="text-align:center;">
      <div style="font-size:0.7rem;color:#6B7280;text-transform:uppercase;margin-bottom:4px;">Fairness Before</div>
      <div style="font-size:1.4rem;font-weight:bold;color:#EF4444;font-family:monospace;">{b_fair}</div>
    </div>
    <div style="text-align:center;">
      <div style="font-size:0.7rem;color:#6B7280;text-transform:uppercase;margin-bottom:4px;">&Delta; Improvement</div>
      <div style="font-size:1.4rem;font-weight:bold;color:#22C55E;font-family:monospace;">+{d_fair}</div>
    </div>
    <div style="text-align:center;">
      <div style="font-size:0.7rem;color:#6B7280;text-transform:uppercase;margin-bottom:4px;">Fairness After</div>
      <div style="font-size:1.4rem;font-weight:bold;color:#22C55E;font-family:monospace;">{a_fair}</div>
    </div>
  </div>
  <p style="margin-top:0.5rem;font-size:0.8rem;color:#374151;">{threshold_note}</p>
  <p style="font-size:0.8rem;color:#374151;">Model accuracy: <strong>{b_acc}</strong> &rarr; <strong>{a_acc}</strong></p>
</div>"""

    html_out += """<table>
<tr>
  <th>Strategy</th>
  <th>Category</th>
  <th>Fairness Before</th>
  <th>Fairness After</th>
  <th>&Delta; Fairness</th>
  <th>Accuracy Before</th>
  <th>Accuracy After</th>
  <th>&Delta; Accuracy</th>
  <th>Verdict</th>
</tr>"""

    for s in strategies:
        rec = s.get("recommendation", "not_recommended")
        rec_color = {"recommended": "#15803d", "consider": "#d97706"}.get(rec, "#dc2626")
        rec_bg = {"recommended": "#f0fdf4", "consider": "#fffbeb"}.get(rec, "#fef2f2")
        is_best = best and s.get("strategy") == best.get("strategy")
        row_style = f"background:{rec_bg};" + ("font-weight:600;" if is_best else "")

        d_fair = s.get("fairness_improvement", "")
        d_acc = s.get("accuracy_change", "")
        d_fair_str = f"+{d_fair}" if isinstance(d_fair, (int, float)) and d_fair > 0 else str(d_fair) if d_fair != "" else "N/A"
        d_fair_color = "#22C55E" if isinstance(d_fair, (int, float)) and d_fair > 0 else "#EF4444"
        d_acc_str = f"+{d_acc}" if isinstance(d_acc, (int, float)) and d_acc >= 0 else str(d_acc) if d_acc != "" else "N/A"
        d_acc_color = "#22C55E" if isinstance(d_acc, (int, float)) and d_acc >= 0 else "#EF4444"

        best_marker = " &#9733;" if is_best else ""

        html_out += (
            f"<tr style='{row_style}'>"
            f"<td>{html.escape(str(s.get('strategy', '')).replace('_', ' ').title())}{best_marker}</td>"
            f"<td style='color:#6B7280;font-size:0.8rem;'>{html.escape(str(s.get('category', '')))}</td>"
            f"<td style='font-family:monospace;color:#EF4444;'>{s.get('fairness_score_before', 'N/A')}</td>"
            f"<td style='font-family:monospace;color:#22C55E;font-weight:bold;'>{s.get('fairness_score_after', 'N/A')}</td>"
            f"<td style='font-family:monospace;color:{d_fair_color};font-weight:600;'>{d_fair_str}</td>"
            f"<td style='font-family:monospace;'>{s.get('accuracy_before', 'N/A')}</td>"
            f"<td style='font-family:monospace;'>{s.get('accuracy_after', 'N/A')}</td>"
            f"<td style='font-family:monospace;color:{d_acc_color};'>{d_acc_str}</td>"
            f"<td style='color:{rec_color}; font-weight:600;'>{html.escape(str(rec).replace('_', ' ').title())}</td>"
            "</tr>"
        )

    html_out += "</table>"
    html_out += """
<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:0.75rem;margin-top:0.75rem;font-size:0.8rem;">
  <strong>How to read this table:</strong> Fairness Score = Disparate Impact Ratio (DI). Values &ge; 0.80 meet the industry 80% Rule.
  A positive &Delta; Fairness means the strategy improved fairness. Recommended strategies offer the best balance of fairness gain with minimal accuracy loss.
</div>"""
    return html_out


# ═══════════════════════════════════════════
# 4. PDF Export
# ═══════════════════════════════════════════

def export_pdf(html_content):
    """
    Convert HTML to PDF.
    Tries weasyprint first (Linux/Mac), falls back to reportlab, then skips gracefully.
    On Windows, weasyprint requires GTK libraries (libgobject) that are typically not
    available — this is handled gracefully and PDF export is simply disabled.
    """
    # Try WeasyPrint (best quality) — catches ALL exceptions including OSError on Windows
    try:
        from weasyprint import HTML
        pdf_data = HTML(string=html_content).write_pdf()
        return pdf_data
    except Exception:
        # WeasyPrint unavailable (missing GTK libs on Windows, or not installed)
        pass

    # Fallback: ReportLab (pure Python, no native deps)
    try:
        from reportlab.lib.pagesizes import letter
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.lib.units import inch
        from io import BytesIO
        import re

        buf = BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=letter, topMargin=0.75*inch, bottomMargin=0.75*inch)
        styles = getSampleStyleSheet()
        story = []

        def extract_text(html_str):
            """Strip HTML tags and normalize whitespace."""
            text = re.sub(r'<[^>]+>', '\n', html_str)
            text = html.unescape(text)
            text = re.sub(r'\n{2,}', '\n\n', text)
            return text.strip()

        plain_text = extract_text(html_content)
        sections = plain_text.split('\n\n')

        for section in sections:
            section = section.strip()
            if not section:
                continue
            if len(section) < 100:
                style = styles.get('Heading2', styles['Normal'])
                story.append(Paragraph(section, style))
            else:
                story.append(Paragraph(section, styles['Normal']))
            story.append(Spacer(1, 6))

        doc.build(story)
        buf.seek(0)
        return buf.read()
    except Exception:
        # ReportLab also unavailable — PDF export simply disabled
        return None


# ═══════════════════════════════════════════
# Public API
# ═══════════════════════════════════════════

def generate_full_report(dataset_info, domain="general", analysis=None, explanation=None, mitigation=None):
    """
    Build complete report in all formats.

    Args:
        dataset_info: dict with filename, row_count, column_count, etc.
        domain: "hiring" | "loan" | "healthcare" | "general"
        analysis: results from bias_agent
        explanation: results from explain_agent
        mitigation: results from mitigation_agent

    Returns:
        { report: dict, json_str: str, html_str: str, pdf_bytes: bytes|None }
    """
    report = compile_report(
        dataset_info=dataset_info,
        analysis_results=analysis,
        explanation_results=explanation,
        mitigation_results=mitigation,
        domain=domain,
    )

    json_str = json.dumps(export_json(report), indent=2, default=str)
    html_str = export_html(report)
    # PDF generation is optional — gracefully skip if no PDF library is available
    # (WeasyPrint requires GTK/GLib which is not available on Windows)
    try:
        pdf_bytes = export_pdf(html_str)
    except Exception:
        pdf_bytes = None

    # Save to disk
    r_id = report["report_id"]
    output_dir = REPORTS_DIR
    (output_dir / f"{r_id}.json").write_text(json_str)
    (output_dir / f"{r_id}.html").write_text(html_str)
    if pdf_bytes:
        (output_dir / f"{r_id}.pdf").write_bytes(pdf_bytes)

    return {
        "report": report,
        "json_str": json_str,
        "html_str": html_str,
        "pdf_bytes": pdf_bytes,
        "report_id": r_id,
    }
