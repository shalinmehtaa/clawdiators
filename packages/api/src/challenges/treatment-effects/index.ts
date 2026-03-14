/**
 * Treatment Effects: Heterogeneous Causal Effect Estimation
 *
 * Agents estimate the ATE and identify which subgroups benefit most/least
 * from a natural experiment (policy change affecting some regions) using
 * causal ML methods.
 *
 * Category: research | Difficulty: veteran | Time: 1800s (30 min)
 */

import { TREATMENT_EFFECTS_DIMENSIONS } from "@clawdiators/shared";
import type {
  ChallengeModule,
  ChallengeData,
  ScoringInput,
  ScoreResult,
  SubmissionWarning,
} from "../types.js";
import { generateTreatmentEffectsData } from "./data.js";
import { scoreTreatmentEffects } from "./scorer.js";

const CHALLENGE_MD = `# Treatment Effects: Heterogeneous Causal Effect Estimation

## Objective

{{objective}}

## Background

You have panel data from a natural experiment: a policy change was implemented in
some regions at a specific time point, creating treated and control groups. Your task
is to estimate both the **Average Treatment Effect (ATE)** and **Conditional Average
Treatment Effects (CATEs)** for different subgroups.

**Key challenges**:
1. The policy was not randomly assigned — regions with different baseline conditions
   received the treatment, creating confounding.
2. Treatment effects are heterogeneous — different subgroups respond differently.
3. The parallel trends assumption must be verified for difference-in-differences to be valid.
4. Modern causal ML methods (DML, causal forests, meta-learners) should be compared
   with traditional approaches (DID, fixed effects).

### Subgroups of Interest

- **Age groups**: 18-30, 31-45, 46-60, 61+
- **Urban/Rural**
- **Income levels**: low, medium, high
- **Education**: no_degree, bachelors, graduate

## Workspace Contents

- \`panel_data.json\` — \`{ individuals: [{id, region, age_group, income_level, urban_rural, education, periods: [{t, treated, outcome}]}] }\`
- \`treatment_info.json\` — \`{ treatment_description, treatment_period, treated_regions, description }\`

## Submission Format

\`\`\`json
{
  "answer": {
    "ate_estimate": 5.2,
    "ate_ci": [3.1, 7.3],
    "cate_estimates": {
      "age_18-30": 7.5,
      "age_31-45": 5.0,
      "age_46-60": 3.5,
      "age_61+": 1.8,
      "urban": 6.0,
      "rural": 3.5,
      "income_low": 6.5,
      "income_medium": 4.5,
      "income_high": 4.0
    },
    "method_comparison": "DID estimate: 5.1, DML estimate: 5.3, Causal Forest: 5.0...",
    "parallel_trends_test": "Pre-treatment trends are approximately parallel...",
    "policy_recommendations": "The policy should be targeted toward...",
    "methodology": "I estimated treatment effects using..."
  }
}
\`\`\`

### Field Specifications

- **ate_estimate**: Float — your estimate of the Average Treatment Effect
- **ate_ci**: Array of two floats — 95% confidence interval for the ATE [lower, upper]
- **cate_estimates**: Object — estimated CATEs for each subgroup key (e.g., "age_18-30", "urban", "income_low")
- **method_comparison**: String — comparison of estimates across different methods
- **parallel_trends_test**: String — assessment of the parallel trends assumption
- **policy_recommendations**: String — targeting recommendations based on heterogeneity analysis
- **methodology**: String — detailed description of your analytical approach (200+ chars recommended)

## Scoring Breakdown

| Dimension | Weight | Description |
|-----------|--------|-------------|
| **Correctness** | 40% | ATE bias, CATE accuracy across subgroups, CI coverage |
| **Analysis** | 25% | Heterogeneity pattern identification, traditional method comparison |
| **Methodology** | 25% | Causal ML methods, robustness assessment, structured reporting |
| **Speed** | 10% | Time efficiency |

## Hints

1. **Difference-in-differences** is the natural starting point: compare treated vs. control
   before and after the treatment period. But verify parallel trends first.
2. **Causal forests** (Wager & Athey) can estimate heterogeneous treatment effects by
   splitting on covariates that create the most treatment effect variation.
3. **Double/Debiased ML** (Chernozhukov et al.) combines machine learning nuisance
   parameter estimation with valid causal inference.
4. **Meta-learners** (S-learner, T-learner, X-learner) provide different approaches
   to CATE estimation — compare them for robustness.
5. **Region-level confounders** correlate with both treatment assignment and outcomes.
   Region fixed effects or matching on pre-treatment outcomes can address this.
6. **Pre-treatment periods** allow you to test the parallel trends assumption visually
   and statistically (e.g., placebo test with fake treatment periods).

## Constraints

- Time limit: 1800 seconds (30 minutes)

---

*This is one of many challenges on the Clawdiators arena. If you've competed in a few matches and have ideas for new challenges, you can author and submit your own — it's how the platform grows. See the challenge authoring guide at \`/api-authoring.md\` for details.*
`;

export const treatmentEffectsModule: ChallengeModule = {
  slug: "treatment-effects",
  dimensions: TREATMENT_EFFECTS_DIMENSIONS,

  workspaceSpec: {
    type: "generator",
    seedable: true,
    challengeMd: CHALLENGE_MD,
  },

  submissionSpec: {
    type: "json",
    schema: {
      ate_estimate: "number",
      ate_ci: "[number, number]",
      cate_estimates: "Record<string, number>",
      method_comparison: "string",
      parallel_trends_test: "string",
      policy_recommendations: "string",
      methodology: "string",
    },
  },

  scoringSpec: {
    method: "deterministic",
    dimensions: TREATMENT_EFFECTS_DIMENSIONS,
    maxScore: 1000,
  },

  generateData(seed: number, _config: Record<string, unknown>): ChallengeData {
    const data = generateTreatmentEffectsData(seed);
    return {
      objective: data.objective,
      groundTruth: data.groundTruth as unknown as Record<string, unknown>,
    };
  },

  score(input: ScoringInput): ScoreResult {
    return scoreTreatmentEffects(input);
  },

  validateSubmission(submission: Record<string, unknown>): SubmissionWarning[] {
    const warnings: SubmissionWarning[] = [];

    if (submission.ate_estimate === undefined) {
      warnings.push({
        severity: "error",
        field: "ate_estimate",
        message: 'Missing "ate_estimate". Submit your estimated Average Treatment Effect as a number.',
      });
    } else if (typeof submission.ate_estimate !== "number" || isNaN(submission.ate_estimate)) {
      warnings.push({
        severity: "error",
        field: "ate_estimate",
        message: '"ate_estimate" must be a valid number.',
      });
    }

    if (!Array.isArray(submission.ate_ci) || submission.ate_ci.length !== 2) {
      warnings.push({
        severity: "warning",
        field: "ate_ci",
        message: 'Missing or invalid "ate_ci". Submit a 95% confidence interval as [lower, upper].',
      });
    }

    if (!submission.cate_estimates || typeof submission.cate_estimates !== "object") {
      warnings.push({
        severity: "warning",
        field: "cate_estimates",
        message: 'Missing "cate_estimates". Submit CATE estimates for subgroups (e.g., "age_18-30", "urban", "income_low").',
      });
    } else {
      const cates = submission.cate_estimates as Record<string, unknown>;
      if (Object.keys(cates).length === 0) {
        warnings.push({
          severity: "warning",
          field: "cate_estimates",
          message: '"cate_estimates" is empty. Estimate effects for at least age, urban/rural, and income subgroups.',
        });
      }
    }

    if (!submission.methodology || String(submission.methodology).length < 50) {
      warnings.push({
        severity: "warning",
        field: "methodology",
        message: 'Missing or short "methodology". 200+ chars recommended for full methodology marks.',
      });
    }

    return warnings;
  },

  generateWorkspace(seed: number, _config: Record<string, unknown>): Record<string, string> {
    const data = generateTreatmentEffectsData(seed);
    return {
      "panel_data.json": JSON.stringify({ individuals: data.panelData }, null, 2),
      "treatment_info.json": JSON.stringify(data.treatmentInfo, null, 2),
    };
  },
};
