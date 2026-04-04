"""
FairLens - Explainer Agent
Uses an AI model to explain detected bias in natural language.
"""
from openai import OpenAI

from backend.shared_config import OPENROUTER_API_KEY, OPENROUTER_BASE_URL, AI_MODEL


def run_explanation(dataset_type, protected_attribute, disadvantaged_group,
                    disparity_ratio, p_value, specific_attribute=None):
    """Get an AI-powered natural language explanation of bias findings."""
    client = OpenAI(
        base_url=OPENROUTER_BASE_URL,
        api_key=OPENROUTER_API_KEY,
    )

    extra = ""
    if specific_attribute:
        extra = f"\nFocus specifically on the attribute/column: {specific_attribute}."

    prompt = f"""You are a fairness analyst expert. Explain the following bias detection results in clear, professional language.

Context:
- Dataset type: {dataset_type}
- Protected attribute examined: {protected_attribute}
- Disadvantaged group: {disadvantaged_group}
- Disparate impact ratio: {disparity_ratio:.4f} (below 0.80 indicates disparate impact per EEOC guidelines)
- Statistical p-value: {p_value:.4f}
{extra}

Provide your explanation with these sections:
1. **Summary** — One sentence on what the data shows.
2. **Evidence** — What the numbers mean in plain terms.
3. **Impact** — Who is affected and how severely.
4. **Likely Causes** — Plausible sources of this bias given the dataset type.
5. **Recommended Next Steps** — Concrete actions to investigate or mitigate.

Keep the tone professional and objective. Avoid speculation without evidence."""

    try:
        response = client.chat.completions.create(
            model=AI_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            max_tokens=1024,
        )
        return response.choices[0].message.content
    except Exception as e:
        return f"[AI explanation unavailable] Error calling model: {e}\n\n" \
               f"The {protected_attribute}='{disadvantaged_group}' group has a disparate impact ratio of " \
               f"{disparity_ratio:.4f} (p={p_value:.4f}), indicating {'statistically significant' if p_value < 0.05 else 'no statistically significant'} bias."
