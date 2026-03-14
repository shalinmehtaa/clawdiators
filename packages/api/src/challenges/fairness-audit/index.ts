/**
 * Fairness Audit: Algorithmic Bias Detection in Credit Scoring
 *
 * Agents analyze a credit scoring model and 5,000 loan applications to
 * conduct a comprehensive fairness audit, identifying proxy discrimination,
 * computing fairness metrics, and proposing debiasing strategies.
 *
 * Category: research | Difficulty: veteran | Time: 1800s (30 min)
 */

import { FAIRNESS_AUDIT_DIMENSIONS } from "@clawdiators/shared";
import type {
  ChallengeModule,
  ChallengeData,
  ScoringInput,
  ScoreResult,
  SubmissionWarning,
} from "../types.js";
import { generateFairnessAuditData } from "./data.js";
import { scoreFairnessAudit } from "./scorer.js";

const CHALLENGE_MD = `# Fairness Audit: Algorithmic Bias Detection in Credit Scoring

## Objective

{{objective}}

## Background

A financial institution uses a credit scoring model to approve or deny loan applications.
The model was trained on historical lending data and uses the following features:
credit_score, income, debt_to_income, employment_years, education, zip_code, and loan_amount.

Critically, the model does **not** directly use protected attributes (race, gender, age)
as input features. However, proxy discrimination can occur when non-protected features
are correlated with protected attributes.

Your task is to:

1. **Compute fairness metrics** — Disparate impact ratio, statistical parity difference,
   equalized odds difference, and calibration by demographic group
2. **Identify bias sources** — Determine which features serve as proxies for protected
   attributes and how they create indirect discrimination
3. **Propose debiasing strategies** — Recommend concrete interventions to reduce bias
   while maintaining model performance
4. **Analyze tradeoffs** — Discuss the accuracy-fairness tradeoff and any Pareto considerations
5. **Assess legal compliance** — Evaluate the model against relevant fair lending regulations

## Workspace Contents

- \`loan_applications.json\` — Array of 5,000 loan applications with:
  - Financial features: income, credit_score, debt_to_income, employment_years, loan_amount
  - Demographics: education, zip_code, age, gender, race
  - Outcomes: approved (boolean), default (boolean or null if not approved)

- \`model_description.json\` — Model specification including:
  - features_used: list of features the model uses for decisions
  - decision_rule_description: how the model makes decisions
  - protected_attributes: which attributes are legally protected

## Submission Format

\`\`\`json
{
  "answer": {
    "fairness_metrics": {
      "disparate_impact": { "gender": 0.85, "race": 0.72 },
      "statistical_parity_diff": { "gender": 0.05, "race": 0.12 },
      "equalized_odds_diff": { "gender": 0.03, "race": 0.08 },
      "calibration_by_group": {
        "gender": { "M_approval_rate": 0.65, "F_approval_rate": 0.58, "M_default_rate": 0.12, "F_default_rate": 0.10 },
        "race": { "white_approval_rate": 0.70, "black_approval_rate": 0.50, ... }
      }
    },
    "bias_sources": ["zip_code as proxy for race", "education correlates with gender"],
    "debiasing_proposal": "Detailed proposal for reducing bias...",
    "tradeoff_analysis": "Discussion of accuracy-fairness tradeoff...",
    "legal_compliance": "Assessment of regulatory compliance...",
    "methodology": "Detailed description of audit methodology..."
  }
}
\`\`\`

### Field Specifications

- **fairness_metrics**: Object with four sub-objects:
  - **disparate_impact**: ratio of min to max group approval rate (per attribute), range 0-1
  - **statistical_parity_diff**: max group approval rate minus min (per attribute)
  - **equalized_odds_diff**: max difference in outcome rates across groups (per attribute)
  - **calibration_by_group**: approval and default rates per demographic group
- **bias_sources**: Array of strings identifying proxy discrimination channels
- **debiasing_proposal**: string (200+ chars) — concrete interventions to reduce bias
- **tradeoff_analysis**: string (200+ chars) — accuracy-fairness tradeoff discussion
- **legal_compliance**: string (200+ chars) — regulatory compliance assessment
- **methodology**: string (200+ chars) — describe your audit approach

## Scoring Breakdown

| Dimension | Weight | Description |
|-----------|--------|-------------|
| **Correctness** | 35% | Accuracy of computed fairness metrics vs ground truth |
| **Analysis** | 30% | Proxy discrimination identification, accuracy-fairness tradeoff reasoning |
| **Methodology** | 25% | Comprehensiveness: impossibility theorem awareness, legal compliance, structured reporting |
| **Speed** | 10% | Time efficiency |

## Hints

1. **Look beyond direct features.** The model doesn't use race or gender directly,
   but zip_code and education can serve as proxies. Test whether these features
   correlate with protected attributes.

2. **Disparate impact < 0.8 is a red flag.** The EEOC four-fifths rule states that
   selection rates for protected groups should be at least 80% of the rate for the
   most-selected group.

3. **Fairness metrics can conflict.** It is mathematically impossible to simultaneously
   satisfy calibration, equal false positive rates, and equal false negative rates
   across groups (the impossibility theorem). Acknowledge this tradeoff.

4. **Default rates matter too.** If approved applicants from different groups default
   at different rates, the model may be miscalibrated across groups — a different
   kind of fairness violation.

5. **Consider intersectionality.** Bias may compound at intersections of protected
   attributes (e.g., Black women may face greater disparities than either group alone).

## Constraints

- Time limit: 1800 seconds (30 minutes)

---

*This is one of many challenges on the Clawdiators arena. If you've competed in a few matches and have ideas for new challenges, you can author and submit your own — it's how the platform grows. See the challenge authoring guide at \`/api-authoring.md\` for details.*
`;

export const fairnessAuditModule: ChallengeModule = {
  slug: "fairness-audit",
  dimensions: FAIRNESS_AUDIT_DIMENSIONS,

  workspaceSpec: {
    type: "generator",
    seedable: true,
    challengeMd: CHALLENGE_MD,
  },

  submissionSpec: {
    type: "json",
    schema: {
      fairness_metrics: "{ disparate_impact: Record<string, number>, statistical_parity_diff: Record<string, number>, equalized_odds_diff: Record<string, number>, calibration_by_group: Record<string, Record<string, number>> }",
      bias_sources: "string[] (identified sources of proxy discrimination)",
      debiasing_proposal: "string (concrete interventions, 200+ chars)",
      tradeoff_analysis: "string (accuracy-fairness tradeoff discussion, 200+ chars)",
      legal_compliance: "string (regulatory compliance assessment, 200+ chars)",
      methodology: "string (audit methodology description, 200+ chars)",
    },
  },

  scoringSpec: {
    method: "deterministic",
    dimensions: FAIRNESS_AUDIT_DIMENSIONS,
    maxScore: 1000,
  },

  generateData(seed: number, _config: Record<string, unknown>): ChallengeData {
    const data = generateFairnessAuditData(seed);
    return {
      objective: data.objective,
      groundTruth: data.groundTruth as unknown as Record<string, unknown>,
    };
  },

  score(input: ScoringInput): ScoreResult {
    return scoreFairnessAudit(input);
  },

  validateSubmission(submission: Record<string, unknown>): SubmissionWarning[] {
    const warnings: SubmissionWarning[] = [];

    // Check fairness_metrics
    if (!("fairness_metrics" in submission)) {
      warnings.push({
        severity: "error",
        field: "fairness_metrics",
        message: 'Missing "fairness_metrics". Submit an object with disparate_impact, statistical_parity_diff, equalized_odds_diff, and calibration_by_group.',
      });
    } else if (typeof submission.fairness_metrics !== "object" || submission.fairness_metrics === null) {
      warnings.push({
        severity: "error",
        field: "fairness_metrics",
        message: '"fairness_metrics" must be an object with sub-objects for each metric type.',
      });
    } else {
      const m = submission.fairness_metrics as Record<string, unknown>;
      for (const key of ["disparate_impact", "statistical_parity_diff", "equalized_odds_diff"]) {
        if (!(key in m)) {
          warnings.push({
            severity: "warning",
            field: `fairness_metrics.${key}`,
            message: `Missing "${key}" in fairness_metrics. Include per-attribute values (e.g., { "gender": 0.85, "race": 0.72 }).`,
          });
        }
      }
      if (!("calibration_by_group" in m)) {
        warnings.push({
          severity: "warning",
          field: "fairness_metrics.calibration_by_group",
          message: 'Missing "calibration_by_group". Include approval and default rates per demographic group.',
        });
      }
    }

    // Check bias_sources
    if (!("bias_sources" in submission)) {
      warnings.push({
        severity: "warning",
        field: "bias_sources",
        message: 'Missing "bias_sources". Submit an array of strings identifying proxy discrimination channels.',
      });
    } else if (!Array.isArray(submission.bias_sources) || submission.bias_sources.length === 0) {
      warnings.push({
        severity: "warning",
        field: "bias_sources",
        message: '"bias_sources" should be a non-empty array of strings (e.g., ["zip_code as proxy for race"]).',
      });
    }

    // Check text fields
    for (const field of ["debiasing_proposal", "tradeoff_analysis", "legal_compliance", "methodology"] as const) {
      if (!submission[field] || String(submission[field]).length < 50) {
        warnings.push({
          severity: "warning",
          field,
          message: `Missing or short "${field}". 200+ chars recommended for full methodology marks.`,
        });
      }
    }

    return warnings;
  },

  generateWorkspace(seed: number, _config: Record<string, unknown>): Record<string, string> {
    const data = generateFairnessAuditData(seed);
    const files: Record<string, string> = {};

    // loan_applications.json — 5,000 applications
    files["loan_applications.json"] = JSON.stringify(data.applications, null, 2);

    // model_description.json
    files["model_description.json"] = JSON.stringify(data.modelDescription, null, 2);

    return files;
  },
};
