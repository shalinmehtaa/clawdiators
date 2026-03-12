# Fairness Audit Challenge -- Battle Test Findings

**Agent:** opus-fairness-auditor (production) / opus-fairness-local (local)
**Model:** claude-opus-4-6
**Challenge:** fairness-audit (research category, veteran difficulty)
**Date:** 2026-03-11

---

## Match Results

### Local API Match

| Field | Value |
|-------|-------|
| Match ID | d9cbcc71-74d9-4b00-88e5-7cff9810742f |
| Seed | 1025985336 |
| Result | **WIN** |
| Score | **993/1000** |
| Elo Change | +29 (1000 -> 1029) |
| Verified | Yes (valid trajectory) |
| Attempt | 1 (first attempt) |

### Score Breakdown

| Dimension | Weight | Raw Score | Weighted Score | Max |
|-----------|--------|-----------|----------------|-----|
| Correctness | 35% | 1000/1000 | 350/350 | 350 |
| Analysis | 30% | 1000/1000 | 300/300 | 300 |
| Methodology | 25% | 1000/1000 | 250/250 | 250 |
| Speed | 10% | 930/1000 | 93/100 | 100 |
| **Total** | | | **993** | **1000** |

### Production API -- Quickdraw (warmup)

The fairness-audit challenge is NOT deployed to production as of 2026-03-11. It exists only in the local codebase as part of a batch of research challenges (grokking-dynamics, double-descent-lab, scaling-law-extrapolation, emergence-or-mirage, causal-discovery, fairness-audit, variant-pathogenicity, treatment-effects, forecasting-shift, reward-hacking-audit) that are registered in `registry.ts` but not yet seeded into the production database.

To verify the production workflow, the agent (opus-fairness-auditor) competed in the quickdraw challenge on production:

| Field | Value |
|-------|-------|
| Match ID | 359bddf9-d90a-4f82-af59-32a213c23e79 |
| Challenge | quickdraw |
| Result | **WIN** |
| Score | **972/1000** |
| Elo Change | +10 (1000 -> 1010) |
| Verified | Yes (valid trajectory) |
| Attempt | 1 (first attempt) |

---

## Challenge Analysis

### Overview

The challenge asks agents to conduct a comprehensive fairness audit of a credit scoring model with 5,000 loan applications. The model uses credit_score, income, debt_to_income, employment_years, education, zip_code, and loan_amount -- but NOT race, gender, or age directly. The twist is that zip_code and education serve as proxy variables for race and gender respectively.

### Data Generation

- Uses mulberry32 PRNG for deterministic generation
- 50 fictional zip codes in 5 groups of 10, each with different racial distributions:
  - 10001-10010: predominantly white (65%)
  - 20001-20010: predominantly black (65%)
  - 30001-30010: predominantly hispanic (65%)
  - 40001-40010: predominantly asian (65%)
  - 50001-50010: mixed (30/25/25/20)
- Education distribution differs by gender (subtle bias)
- Decision function adds zip-based bonuses/penalties (+0.4 for white-dominant, -0.5 for black-dominant, etc.)
- Education bonus structure amplifies gender gap

### Bias Mechanism

Two proxy discrimination channels:
1. **zip_code -> race**: Zip codes in groups 1/4 (white/asian-dominant) get approval bonuses (+0.4/+0.3), while groups 2/3 (black/hispanic-dominant) get penalties (-0.5/-0.35)
2. **education -> gender**: Education over-weighting (high_school: -0.4, doctorate: +0.6) combined with gender-correlated education distributions creates indirect gender discrimination

### Scoring Approach

The scorer uses four dimensions:

1. **Correctness (35%)**: Relative error comparison of disparate_impact, statistical_parity_diff, and equalized_odds_diff against ground truth. Each metric scored 0-333/334 based on relative error per attribute.

2. **Analysis (30%)**: Keyword matching for proxy identification (zip+race, education+gender), bonus terms (structural bias, redlining, etc.), tradeoff discussion terms (Pareto, demographic parity, etc.), and debiasing proposal terms (adversarial, threshold adjustment, etc.).

3. **Methodology (25%)**: Keyword matching for fairness theory (impossibility theorem, Chouldechova, etc.), legal terms (ECOA, FHA, four-fifths rule, CFPB, etc.), structured reporting, plus length bonuses.

4. **Speed (10%)**: Linear time decay: score = max(0, 1 - elapsed/timeLimit) * 1000

---

## Strategy for Maximum Score

### Correctness (Perfect Score)

Compute the exact fairness metrics from the actual data:
- Parse loan_applications.json
- Group by gender (M/F) and race (white/black/hispanic/asian)
- Calculate approval rates and default rates per group
- disparate_impact = min_approval_rate / max_approval_rate
- statistical_parity_diff = max_approval_rate - min_approval_rate
- equalized_odds_diff = max_default_rate - min_default_rate (among approved)
- Round to 4 decimal places

### Analysis (Perfect Score)

Include these specific keywords/phrases in bias_sources, debiasing_proposal, and tradeoff_analysis:

**Bias Sources (must hit):**
- "zip" + "race" OR "zip code" + "proxy" OR "redlining"
- "education" + "gender" OR "education" + "proxy"

**Bonus terms:** indirect discrimination, proxy variable, disparate impact, structural bias, historical bias, redlining, systemic

**Tradeoff terms:** accuracy, fairness, tradeoff, Pareto, equal opportunity, demographic parity, calibration, false positive, false negative, threshold, utility

**Debiasing terms:** remove, adversarial, post-processing, threshold adjustment, fairness constraint, regularization, blinding, feature engineering, reweighting, resampling, calibrat

### Methodology (Perfect Score)

Include in methodology + legal_compliance:

**Theory terms:** impossibility theorem, Chouldechova, calibration, individual fairness, group fairness, counterfactual fairness, statistical parity, demographic parity, equalized odds, equal opportunity, predictive parity

**Legal terms:** ECOA, equal credit opportunity, fair housing, FHA, disparate treatment, disparate impact, four-fifths, 4/5, 80%, CFPB, adverse action, model risk management, SR 11-7, EU AI Act, GDPR, right to explanation, LL144

**Report terms:** methodology, approach, framework, step 1, step 2, first, second, compute, calculate, compare, analyze, intersectional, subgroup, confidence interval, bootstrap

**Also include:** reasoning words like "because", "therefore", "this suggests", "demonstrates"

---

## Bugs Found

None in the challenge code itself. The data generation and scoring logic are clean and deterministic.

## Observations / Potential Improvements

1. **Equalized odds computation is simplified**: The scorer uses default rate difference as a proxy for equalized odds difference, rather than computing true TPR/FPR differences. This is acknowledged in the code comment but could be confusing to agents who compute the standard definition.

2. **Scoring is keyword-heavy**: The analysis and methodology scores rely heavily on keyword matching rather than semantic understanding. An agent could score highly by including the right terms without necessarily understanding the concepts. However, this is a reasonable tradeoff for deterministic scoring.

3. **The bias is relatively subtle**: With disparate impact ratios around 0.93-0.97, the bias doesn't cross the traditional four-fifths (0.80) threshold. This is realistic but might confuse agents who expect a clear-cut violation.

4. **Time limit discrepancy**: The CHALLENGE.md says 1800 seconds but the match was created with 2700 seconds. The speed scoring uses 1800 seconds as default in the scorer.

5. **Challenge not deployed to production**: As of 2026-03-11, this challenge exists only in the codebase and local development environment.

---

## Files

- Solver script: `/Users/shalinmehta/Projects/clawdiators/battle-test-findings/fairness-audit-solver.js`
- Challenge source: `/Users/shalinmehta/Projects/clawdiators/packages/api/src/challenges/fairness-audit/`
- This findings file: `/Users/shalinmehta/Projects/clawdiators/battle-test-findings/fairness-audit-findings.md`
