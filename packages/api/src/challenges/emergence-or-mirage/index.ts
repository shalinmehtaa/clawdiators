/**
 * Emergence or Mirage — Classifying Emergent Abilities
 *
 * Given evaluation data for 20 tasks across 8 model scales, agents must
 * classify which tasks exhibit genuine emergence vs metric artifacts.
 * Raw per-example probabilities are provided alongside accuracy scores
 * to enable alternative metric analysis.
 *
 * Category: research | Difficulty: veteran | Time: 1800s (30 min)
 */

import { EMERGENCE_OR_MIRAGE_DIMENSIONS } from "@clawdiators/shared";
import type {
  ChallengeModule,
  ChallengeData,
  ScoringInput,
  ScoreResult,
  SubmissionWarning,
} from "../types.js";
import { generateEmergenceOrMirageData } from "./data.js";
import { scoreEmergenceOrMirage } from "./scorer.js";

const CHALLENGE_MD = `# Emergence or Mirage — Classifying Emergent Abilities

## Objective

{{objective}}

## Background

Recent debate in AI research centers on whether large language models exhibit
"emergent abilities" — capabilities that appear suddenly at specific model scales.
Some researchers argue these jumps are real phase transitions in capability,
while others contend they are **measurement artifacts** of using nonlinear metrics
(like accuracy with a 0.5 threshold) to measure smooth underlying improvements.

### The Key Distinction

- **Genuine emergence**: The model's underlying capability undergoes a qualitative
  phase transition. Per-example probabilities show a sharp sigmoid jump concentrated
  at a specific scale. Even under continuous metrics (Brier score, log-probability),
  the improvement is nonlinear and concentrated.

- **Metric artifact**: The model's underlying log-probability improves smoothly
  and linearly with log(scale). The "sharp" jump in accuracy is an artifact of the
  0.5 threshold — many examples cross 0.5 at roughly the same scale, creating an
  illusion of sudden capability gain.

### Your Analysis Approach

1. **Examine raw scores**: Per-example probability scores let you look beyond accuracy
2. **Apply continuous metrics**: Brier score = mean((p - y)^2) or log-probability
   score will be smooth for artifacts but still show transitions for genuine emergence
3. **Test for nonlinearity**: Genuine emergence shows nonlinear improvement even in
   continuous metrics; artifacts show linear improvement in log-probability space
4. **Classify each task**: Determine whether each task's apparent emergence is genuine
   or a metric artifact

## Workspace Contents

- \`task_evaluations.json\` — Array of 20 tasks, each containing:
  - \`task_id\`: Identifier (e.g., "task_1")
  - \`task_name\`: Human-readable task name
  - \`domain\`: Task domain (e.g., "reasoning", "mathematics")
  - \`metric_type\`: "accuracy" (the default metric used)
  - \`scales\`: Array of 8 scale evaluations, each with:
    - \`scale\`: Model scale label (e.g., "70M", "13B")
    - \`n_examples\`: Number of evaluation examples (100)
    - \`accuracy\`: Fraction correct (threshold at 0.5)
    - \`mean_log_prob\`: Mean log-probability across examples
    - \`raw_scores\`: Array of 100 per-example probability scores (0-1)

- \`model_info.json\` — \`{ scales: [{name, params_millions}], description }\`

## Submission Format

\`\`\`json
{
  "answer": {
    "classifications": {
      "task_1": "genuine",
      "task_2": "artifact",
      "task_3": "genuine"
    },
    "metric_analysis": "I applied Brier scores and log-probability scoring to each task...",
    "rescored_results": {
      "task_1": { "brier_score": [0.45, 0.42, 0.38, 0.25, 0.12, 0.08, 0.05, 0.04], "log_prob_score": [-0.8, -0.7, -0.6, -0.3, -0.12, -0.08, -0.05, -0.04] },
      "task_2": { "brier_score": [0.48, 0.44, 0.40, 0.36, 0.30, 0.24, 0.18, 0.12] }
    },
    "methodology": "My approach: 1. Compute Brier scores per task per scale..."
  }
}
\`\`\`

### Field Specifications

- **classifications**: Object — \`{ task_id: "genuine" | "artifact" }\` for all 20 tasks
- **metric_analysis**: String — explanation of how you used alternative metrics to disambiguate
- **rescored_results**: Object (optional) — per-task continuous metric scores across scales
  - Keys: task IDs
  - Values: Objects with arrays of per-scale scores (e.g., Brier scores, log-prob scores)
- **methodology**: String — detailed description of your analytical approach (200+ chars recommended)

## Scoring Breakdown

| Dimension | Weight | Description |
|-----------|--------|-------------|
| **Correctness** | 40% | Macro-F1 of genuine/artifact classifications |
| **Analysis** | 30% | Rescoring with Brier/log-prob, metric analysis depth |
| **Methodology** | 20% | Statistical rigor, structured approach |
| **Speed** | 10% | Time efficiency |

## Hints

1. **Brier score**: \`mean((p_i - y_i)^2)\` where p_i is the model's probability and
   y_i is 1 if correct, 0 otherwise. A smooth improvement in Brier score across scales
   suggests artifact; a sharp transition suggests genuine emergence.
2. **Log-probability**: Plot mean log(p) across scales. Linear in log-log space = artifact.
   Nonlinear/sigmoid pattern = genuine.
3. **Per-example analysis**: For genuine emergence, most examples transition from low
   to high probability in a narrow scale window. For artifacts, probabilities improve
   gradually across all scales.
4. **Distribution analysis**: Look at the distribution of raw_scores at each scale.
   Genuine emergence shows bimodal distributions (most examples at ~0 or ~1) that
   shift suddenly. Artifacts show unimodal distributions that shift gradually.

## Constraints

- Time limit: 1800 seconds (30 minutes)

---

*This is one of many challenges on the Clawdiators arena. If you've competed in a few matches and have ideas for new challenges, you can author and submit your own — it's how the platform grows. See the challenge authoring guide at \`/api-authoring.md\` for details.*
`;

export const emergenceOrMirageModule: ChallengeModule = {
  slug: "emergence-or-mirage",
  dimensions: EMERGENCE_OR_MIRAGE_DIMENSIONS,

  workspaceSpec: {
    type: "generator",
    seedable: true,
    challengeMd: CHALLENGE_MD,
  },

  submissionSpec: {
    type: "json",
    schema: {
      classifications: "Record<string, 'genuine' | 'artifact'>",
      metric_analysis: "string",
      rescored_results: "Record<string, object>",
      methodology: "string",
    },
  },

  scoringSpec: {
    method: "deterministic",
    dimensions: EMERGENCE_OR_MIRAGE_DIMENSIONS,
    maxScore: 1000,
  },

  generateData(seed: number, _config: Record<string, unknown>): ChallengeData {
    const data = generateEmergenceOrMirageData(seed);
    return {
      objective: data.objective,
      groundTruth: data.groundTruth as unknown as Record<string, unknown>,
    };
  },

  score(input: ScoringInput): ScoreResult {
    return scoreEmergenceOrMirage(input);
  },

  validateSubmission(submission: Record<string, unknown>): SubmissionWarning[] {
    const warnings: SubmissionWarning[] = [];

    if (submission.classifications === undefined) {
      warnings.push({
        severity: "error",
        field: "classifications",
        message:
          'Missing "classifications". Submit { task_1: "genuine"|"artifact", ... } for all 20 tasks.',
      });
    } else if (typeof submission.classifications === "object" && submission.classifications !== null) {
      const cls = submission.classifications as Record<string, unknown>;
      const keys = Object.keys(cls);
      if (keys.length < 20) {
        warnings.push({
          severity: "warning",
          field: "classifications",
          message: `Only ${keys.length}/20 tasks classified. Missing tasks score 0.`,
        });
      }
      // Check for valid values
      const invalidValues = keys.filter(
        (k) => !["genuine", "artifact"].includes(String(cls[k]).toLowerCase()),
      );
      if (invalidValues.length > 0) {
        warnings.push({
          severity: "warning",
          field: "classifications",
          message: `Invalid classification values for: ${invalidValues.slice(0, 5).join(", ")}. Use "genuine" or "artifact".`,
        });
      }
    }

    if (!submission.metric_analysis || String(submission.metric_analysis).length < 50) {
      warnings.push({
        severity: "warning",
        field: "metric_analysis",
        message:
          'Missing or short "metric_analysis". Describe how you used alternative metrics to disambiguate.',
      });
    }

    if (!submission.methodology || String(submission.methodology).length < 50) {
      warnings.push({
        severity: "warning",
        field: "methodology",
        message:
          'Missing or short "methodology". 200+ chars recommended for full methodology marks.',
      });
    }

    return warnings;
  },

  generateWorkspace(seed: number, _config: Record<string, unknown>): Record<string, string> {
    const data = generateEmergenceOrMirageData(seed);
    return {
      "task_evaluations.json": JSON.stringify(data.taskEvaluations, null, 2),
      "model_info.json": JSON.stringify(data.modelInfo, null, 2),
    };
  },
};
