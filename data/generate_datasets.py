"""
FairLens - Sample Dataset Generator
Creates synthetic CSVs with injected bias for testing.
Run: python data/generate_datasets.py
"""
import csv
import random
import os

random.seed(42)

DATA_DIR = os.path.dirname(os.path.abspath(__file__))


def generate_hiring(n=1000):
    """
    Hiring data with gender bias: males hired at ~70%, females at ~40%.
    """
    rows = []
    for _ in range(n):
        gender = random.choice(["Male", "Female"])
        age = random.randint(22, 60)
        race = random.choice(["White", "Black", "Asian", "Hispanic", "Other"])
        education = random.choice(["High School", "Bachelor", "Master", "PhD"])
        experience = random.randint(0, 30)

        base_rate = 0.70 if gender == "Male" else 0.40
        # Education and experience add slight variance
        edu_bonus = {"High School": -0.05, "Bachelor": 0.0, "Master": 0.05, "PhD": 0.10}.get(education, 0)
        exp_bonus = min(experience * 0.01, 0.15)
        prob = max(0.0, min(1.0, base_rate + edu_bonus + exp_bonus))
        hired = 1 if random.random() < prob else 0

        rows.append([age, gender, race, education, experience, hired])

    path = os.path.join(DATA_DIR, "hiring_data.csv")
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["age", "gender", "race", "education", "experience_years", "hired"])
        w.writerows(rows)
    print(f"Generated {path} ({n} rows)")


def generate_loan(n=1000):
    """
    Loan data with racial bias: majority race approved at ~65%, minority at ~35%.
    """
    rows = []
    majority_races = ["White", "Asian"]
    minority_races = ["Black", "Hispanic", "Other"]

    for _ in range(n):
        income = random.randint(20000, 150000)
        credit_score = random.randint(300, 850)
        race = random.choice(majority_races + minority_races)

        is_minority = race in minority_races
        base_rate = 0.35 if is_minority else 0.65

        # Income and credit score add variance
        income_factor = min((income - 20000) / 200000, 0.2)
        credit_factor = min((credit_score - 300) / 1000, 0.2)
        prob = max(0.0, min(1.0, base_rate + income_factor + credit_factor - 0.1))
        approved = 1 if random.random() < prob else 0

        rows.append([income, credit_score, race, approved])

    path = os.path.join(DATA_DIR, "loan_data.csv")
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["income", "credit_score", "race", "loan_approved"])
        w.writerows(rows)
    print(f"Generated {path} ({n} rows)")


def generate_healthcare(n=1000):
    """
    Healthcare data with insurance bias: private insurance gets treatment
    recommended more often than public insurance.
    """
    rows = []
    for _ in range(n):
        age = random.randint(18, 85)
        gender = random.choice(["Male", "Female"])
        insurance = random.choice(["Private", "Public", "Medicare", "Medicaid"])
        severity = random.randint(1, 5)

        is_public = insurance in ("Public", "Medicaid")
        base_rate = 0.35 if is_public else 0.70
        severity_factor = severity * 0.08
        prob = max(0.0, min(1.0, base_rate + severity_factor - 0.1))
        recommended = 1 if random.random() < prob else 0

        rows.append([age, gender, insurance, severity, recommended])

    path = os.path.join(DATA_DIR, "healthcare_data.csv")
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["age", "gender", "insurance_type", "condition_severity", "treatment_recommended"])
        w.writerows(rows)
    print(f"Generated {path} ({n} rows)")


if __name__ == "__main__":
    generate_hiring()
    generate_loan()
    generate_healthcare()
    print("All datasets generated.")
