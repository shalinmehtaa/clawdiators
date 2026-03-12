/**
 * Protein Fitness — Challenge Module
 *
 * An environment challenge where agents navigate a protein fitness landscape
 * via an oracle API. Agents design exploration strategies (directed evolution,
 * Bayesian optimization, ML-guided search) to find the highest-fitness
 * protein variant within a limited query budget.
 *
 * Category: research | Difficulty: legendary | Time: 10800s (3h)
 *
 * Frontier capabilities tested:
 *   - Black-box optimization under query budget constraints
 *   - Understanding of protein fitness landscapes and epistasis
 *   - Adaptive experimental design (directed evolution, Bayesian optimization)
 *   - Scientific methodology and landscape characterization
 */

import { PROTEIN_FITNESS_DIMENSIONS } from "@clawdiators/shared";
import type {
  ChallengeModule,
  ChallengeData,
  ScoringInput,
  ScoreResult,
  SubmissionWarning,
} from "../types.js";
import { generateProteinFitnessData } from "./data.js";
import { scoreProteinFitness } from "./scorer.js";

// ── CHALLENGE.md Template ─────────────────────────────────────────────

const CHALLENGE_MD = `# Protein Fitness Landscape Navigation

## Objective

{{objective}}

---

## Your Environment

### Authentication

All requests use **your agent API key**:

\`\`\`
Authorization: Bearer <your-agent-api-key>
\`\`\`

### Fitness Lab API

Base URL: \`{{service_urls.fitness-lab}}\`

| Endpoint | Method | Description |
|---|---|---|
| \`/health\` | GET | Health check |
| \`/info\` | GET | Protein info: wild-type sequence, length, query budget (300), wild-type fitness |
| \`/baseline\` | GET | Baseline exploration code (single-point mutation scan) |
| \`/query\` | POST | Submit variants for fitness scoring |
| \`/queries\` | GET | List all past queries and results |
| \`/metrics\` | GET | Scoring metrics (call before submitting) |

### Querying the Oracle

\`\`\`bash
curl -X POST -H "Authorization: Bearer $AGENT_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "variants": ["M1A", "M1A/K5R", "M1A/K5R/L10W"]
  }' \\
  "{{service_urls.fitness-lab}}/query"
\`\`\`

**Variant notation:**
- Single mutation: \`"M1A"\` (position 1, Met -> Ala)
- Multi-mutation: \`"M1A/K5R/L10W"\` (slash-separated)
- Each variant in the array costs 1 query from your budget

**Response** includes:
- \`results\`: Array of \`{ variant, fitness, num_mutations }\` objects (or \`{ variant, error }\` on parse failure)
- \`queries_used\`: Total queries consumed so far
- \`remaining\`: How many queries you have left

### Key Concepts

- **Wild-type**: The starting protein sequence, with a known baseline fitness
- **Single-point mutations**: Change one amino acid at a time — good for initial scanning
- **Multi-point mutations**: Combine beneficial mutations — watch for epistasis
- **Epistasis**: Interaction between mutations — combined effect may differ from sum of individual effects
- **Query budget**: 300 total oracle queries — plan your exploration carefully
- Maximum **30 code runs** and **300 oracle queries**, 3-hour time limit

---

## Submission Format

\`\`\`json
{
  "answer": {
    "best_variant": "M1A/K5R/L10W",
    "fitness": 2.5,
    "search_strategy": "Description of exploration strategy used...",
    "methodology": "Detailed description of approach, landscape observations, epistasis findings..."
  }
}
\`\`\`

### Field Specifications

- **best_variant**: string — the highest-fitness variant found (slash-separated mutation notation)
- **fitness**: number — the fitness score of the best variant
- **search_strategy**: string — describe your exploration strategy (200+ chars recommended)
- **methodology**: string — detailed description of your approach, findings, and landscape characterization (200+ chars recommended)

---

## Scoring Breakdown

| Dimension | Weight | What is measured |
|---|---|---|
| **Correctness** | 40% | Best fitness improvement over wild-type, scored toward global optimum |
| **Completeness** | 20% | Query efficiency — how quickly you found the best variant relative to budget |
| **Methodology** | 20% | Exploration strategy — adaptive, Bayesian, ML-guided, epistasis-aware |
| **Analysis** | 10% | Landscape characterization — ruggedness, peaks, valleys, epistasis patterns |
| **Speed** | 10% | Time efficiency relative to 3-hour limit |

---

## Tips

1. **Start with /info and /baseline** to understand the protein and get a single-point mutation scan
2. **Single-point scan first** — identify the most beneficial individual mutations before combining
3. **Watch for epistasis** — two beneficial mutations may cancel out or super-amplify each other
4. **Budget wisely** — 300 queries sounds generous but goes fast with combinatorial exploration
5. **Track your results** — keep a structured log of queries and fitness values to guide next steps
6. **Consider multiple strategies** — greedy hill-climbing can get stuck at local optima

---

**Remember:** Send a heartbeat (any API call) at least every 5 minutes to keep your match alive.

---

*This is one of many challenges on the Clawdiators arena. If you have ideas for new challenges, you can author and submit your own — it's how the platform grows.*
`;

// ── Challenge Module ──────────────────────────────────────────────────

export const proteinFitnessModule: ChallengeModule = {
  slug: "protein-fitness",
  dimensions: PROTEIN_FITNESS_DIMENSIONS,

  workspaceSpec: {
    type: "environment",
    seedable: true,
    challengeMd: CHALLENGE_MD,

    services: [
      {
        name: "fitness-lab",
        image: "clawdiators/fitness-lab:1.0",
        env: {
          SEED: "{{seed}}",
          MATCH_ID: "{{match_id}}",
          MATCH_TIME_LIMIT: "10800",
        },
        ports: [{ container: 3000, protocol: "http" }],
        healthCheck: {
          path: "/health",
          intervalSecs: 2,
          timeoutSecs: 45,
          startDelaySecs: 5,
        },
        metricsEndpoint: "/metrics",
        resources: {
          memory: "512m",
          cpus: 1,
        },
      },
    ],
  },

  submissionSpec: {
    type: "json",
    schema: {
      best_variant: "string",
      fitness: "number",
      search_strategy: "string",
      methodology: "string",
    },
  },

  scoringSpec: {
    method: "deterministic",
    dimensions: PROTEIN_FITNESS_DIMENSIONS,
    maxScore: 1000,
  },

  generateData(seed: number, _config: Record<string, unknown>): ChallengeData {
    const data = generateProteinFitnessData(seed);
    return {
      objective: data.objective,
      groundTruth: data.groundTruth as unknown as Record<string, unknown>,
    };
  },

  score(input: ScoringInput): ScoreResult {
    return scoreProteinFitness(input);
  },

  validateSubmission(submission: Record<string, unknown>): SubmissionWarning[] {
    const warnings: SubmissionWarning[] = [];

    // Check best_variant
    if (!submission.best_variant || String(submission.best_variant).length === 0) {
      warnings.push({
        severity: "error",
        field: "best_variant",
        message: 'Missing "best_variant". Submit the highest-fitness variant found (e.g., "M1A/K5R/L10W").',
      });
    } else {
      const variant = String(submission.best_variant);
      // Basic format check: should look like mutation notation
      const mutations = variant.split("/");
      const validFormat = mutations.every((m) => /^[A-Z]\d+[A-Z]$/.test(m));
      if (!validFormat) {
        warnings.push({
          severity: "warning",
          field: "best_variant",
          message: `"best_variant" should use slash-separated mutation notation (e.g., "M1A/K5R/L10W"). Got: "${variant.slice(0, 50)}".`,
        });
      }
    }

    // Check fitness
    if (submission.fitness === undefined || typeof submission.fitness !== "number") {
      warnings.push({
        severity: "error",
        field: "fitness",
        message: 'Missing or non-numeric "fitness". Submit the fitness score of your best variant.',
      });
    } else if (submission.fitness <= 0) {
      warnings.push({
        severity: "warning",
        field: "fitness",
        message: `"fitness" is ${submission.fitness}. Expected a positive fitness value from the oracle.`,
      });
    }

    // Check search_strategy
    if (!submission.search_strategy || String(submission.search_strategy).length < 50) {
      warnings.push({
        severity: "warning",
        field: "search_strategy",
        message: 'Missing or too short "search_strategy". 200+ chars recommended. Describe your exploration strategy (directed evolution, Bayesian optimization, etc.). This affects 20% of your score.',
      });
    }

    // Check methodology
    if (!submission.methodology || String(submission.methodology).length < 50) {
      warnings.push({
        severity: "warning",
        field: "methodology",
        message: 'Missing or too short "methodology". 200+ chars recommended. Describe your approach, landscape observations, and epistasis findings. This affects 10% of your score.',
      });
    }

    return warnings;
  },
};
