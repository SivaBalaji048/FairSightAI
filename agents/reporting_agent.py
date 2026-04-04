"""
FairLens - Reporting Agent
Generates fairness reports from analysis records.
"""
from datetime import datetime


def generate_report(records):
    """Generate a comprehensive fairness report from analysis records."""
    report = {
        "title": "FairLens Fairness Report",
        "generated_at": datetime.utcnow().isoformat(),
        "total_analyses": len(records),
        "summary": {
            "fair": 0,
            "questionable": 0,
            "unfair": 0,
        },
        "analyses": [],
        "overall_assessment": "",
    }

    worst_ratio = 1.0
    worst_dataset = None

    for r in records:
        fairness = r.overall_fairness
        if fairness == "Fair":
            report["summary"]["fair"] += 1
        elif fairness == "Questionable":
            report["summary"]["questionable"] += 1
        else:
            report["summary"]["unfair"] += 1

        if r.disparity_ratio < worst_ratio:
            worst_ratio = r.disparity_ratio
            worst_dataset = r.dataset_name

        report["analyses"].append({
            "analysis_id": r.analysis_id,
            "dataset": r.dataset_name,
            "type": r.dataset_type,
            "protected_attribute": r.protected_attribute,
            "disadvantaged_group": r.disadvantaged_group,
            "disparity_ratio": r.disparity_ratio,
            "p_value": r.p_value,
            "overall_fairness": fairness,
            "timestamp": r.timestamp,
        })

    if report["summary"]["unfair"] > 0:
        report["overall_assessment"] = (
            f"CRITICAL: {report['summary']['unfair']} analysis(es) show unfair bias. "
            f"Worst disparity: {worst_ratio:.4f} in '{worst_dataset}'. "
            "Immediate mitigation recommended."
        )
    elif report["summary"]["questionable"] > 0:
        report["overall_assessment"] = f"WARNING: {report['summary']['questionable']} analysis(es) are questionable. Monitor and consider mitigation."
    else:
        report["overall_assessment"] = "All analyses are within acceptable fairness thresholds."

    return report
