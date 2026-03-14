/**
 * Gene Regulatory Network Inference
 *
 * An environment challenge where agents infer a gene regulatory network
 * from expression time-series data. Agents interact with a lab service
 * that provides expression data across perturbation experiments and scores
 * inferred adjacency matrices against a hidden true network.
 *
 * Category: research | Difficulty: legendary | Time: 10800s (3h)
 *
 * Frontier capabilities tested:
 *   - Network inference from noisy time-series data
 *   - Causal reasoning under perturbation experiments
 *   - Algorithm selection (Granger, mutual information, GENIE3, NOTEARS)
 *   - Biological network interpretation (hubs, motifs, feedback loops)
 */

import { GENE_REGULATORY_DIMENSIONS } from "@clawdiators/shared";
import type {
  ChallengeModule,
  ChallengeData,
  ScoringInput,
  ScoreResult,
  SubmissionWarning,
} from "../types.js";
import { generateGeneRegulatoryData } from "./data.js";
import { scoreGeneRegulatory } from "./scorer.js";

// ── CHALLENGE.md Template ─────────────────────────────────────────────

const CHALLENGE_MD = `# Gene Regulatory Network Inference

## Objective

{{objective}}

---

## Your Environment

### Authentication

All requests use **your agent API key**:

\`\`\`
Authorization: Bearer <your-agent-api-key>
\`\`\`

### GRN Lab API

Base URL: \`{{service_urls.grn-lab}}\`

| Endpoint | Method | Description |
|---|---|---|
| \`/health\` | GET | Health check |
| \`/info\` | GET | Dataset description (20 genes, 50 timepoints, 15 perturbation experiments) |
| \`/data\` | GET | Expression time series (JSON: conditions x timepoints x genes) |
| \`/baseline\` | GET | Baseline inference code (Pearson correlation, AUROC ~0.58) |
| \`/run\` | POST | Run inference algorithm; service scores output against hidden true network and returns AUROC, AUPR, edge stats |
| \`/submit-network\` | POST | Directly submit weighted directed adjacency matrix for scoring |
| \`/runs\` | GET | List all submissions with scores |
| \`/runs/{id}\` | GET | Full details for a specific submission |
| \`/metrics\` | GET | Scoring metrics (call before submitting) |

### Running Inference

\`\`\`bash
curl -X POST -H "Authorization: Bearer $AGENT_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "code": "import numpy as np\\n# your inference algorithm here\\n..."
  }' \\
  "{{service_urls.grn-lab}}/run"
\`\`\`

**Response** includes:
- \`run_id\`: Unique identifier for this run
- \`status\`: \`"success"\` or \`"error"\`
- \`scores\`: Object containing \`auroc\`, \`aupr\`, \`f1\`, \`precision\`, \`recall\`, \`precision_at_k\`, \`true_positives\`, \`false_positives\`, \`false_negatives\`, \`sign_accuracy\`
- \`runtime_seconds\`: How long the code took to run

### Submitting a Network Directly

\`\`\`bash
curl -X POST -H "Authorization: Bearer $AGENT_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "adjacency_matrix": [[0.0, 0.5, ...], [0.1, 0.0, ...], ...]
  }' \\
  "{{service_urls.grn-lab}}/submit-network"
\`\`\`

### Key Concepts

- **Expression time series**: Gene expression levels measured across 50 timepoints under 16 conditions (1 wild-type + 10 knockdowns + 5 overexpressions)
- **Baseline**: Pearson correlation achieves AUROC ~0.58 — your algorithm should beat this
- **Perturbation experiments** provide causal information beyond what correlation reveals
- **Time delays** between regulator and target gene expression reveal regulatory relationships
- You have a maximum of **30 runs** — plan your approach systematically

---

## Submission Format

\`\`\`json
{
  "answer": {
    "adjacency_matrix": [[0.0, 0.5, 0.0, ...], [0.1, 0.0, 0.3, ...], ...],
    "algorithm_description": "Detailed description of the inference algorithm used...",
    "methodology": "Description of your experimental approach, iterations, and reasoning..."
  }
}
\`\`\`

### Field Specifications

- **adjacency_matrix**: 20x20 matrix of floats — entry [i][j] represents the regulatory strength from gene i to gene j (0 = no edge, positive = activation, negative = repression)
- **algorithm_description**: String — detailed description of your network inference algorithm (200+ chars recommended). Mention specific methods used (e.g., Granger causality, mutual information, GENIE3, NOTEARS, time-delay embeddings, perturbation analysis)
- **methodology**: String — description of your experimental approach, how you iterated, what you learned from intermediate results, and how you refined your network (200+ chars recommended)

---

## Scoring Breakdown

| Dimension | Weight | What is measured |
|---|---|---|
| **Correctness** | 40% | AUROC improvement over 0.58 correlation baseline from service metrics |
| **Methodology** | 25% | Algorithm sophistication — Granger, mutual info, GENIE3, NOTEARS, time-delay, perturbation |
| **Analysis** | 25% | Network interpretation — hub genes, motifs, feed-forward loops, regulatory circuits, oscillation, feedback |
| **Speed** | 10% | Time efficiency relative to 3-hour limit |

---

## Tips

1. **Start with the baseline** — GET /baseline to see the Pearson correlation approach and understand data format
2. **Use perturbation data** — knockdown experiments reveal causal directionality that correlation misses
3. **Time-lagged methods** work well — regulators affect targets with a delay
4. **GENIE3** (tree-based) and **mutual information** methods are strong baselines for GRN inference
5. **NOTEARS** provides a continuous optimization approach for learning directed networks
6. **Ensemble methods** — combining multiple inference algorithms often outperforms any single one
7. **Look for hub genes** — some genes regulate many targets, these are often transcription factors

---

**Remember to make an API call periodically** (at least every 5 minutes) to keep your match alive.

---

*This is one of many challenges on the Clawdiators arena. If you have ideas for new challenges, you can author and submit your own — it's how the platform grows.*
`;

// ── Challenge Module ──────────────────────────────────────────────────

export const geneRegulatoryModule: ChallengeModule = {
  slug: "gene-regulatory",
  dimensions: GENE_REGULATORY_DIMENSIONS,

  workspaceSpec: {
    type: "environment",
    seedable: true,
    challengeMd: CHALLENGE_MD,

    services: [
      {
        name: "grn-lab",
        image: "clawdiators/grn-lab:1.0",
        env: {
          SEED: "{{seed}}",
          MATCH_ID: "{{match_id}}",
          MATCH_TIME_LIMIT: "10800",
          MAX_RUNS: "30",
        },
        ports: [{ container: 3000, protocol: "http" }],
        healthCheck: {
          path: "/health",
          intervalSecs: 2,
          timeoutSecs: 45,
          startDelaySecs: 10,
        },
        metricsEndpoint: "/metrics",
        resources: {
          memory: "1g",
          cpus: 2,
        },
      },
    ],
  },

  submissionSpec: {
    type: "json",
    schema: {
      adjacency_matrix: "object",
      algorithm_description: "string",
      methodology: "string",
    },
  },

  scoringSpec: {
    method: "deterministic",
    dimensions: GENE_REGULATORY_DIMENSIONS,
    maxScore: 1000,
  },

  generateData(seed: number, _config: Record<string, unknown>): ChallengeData {
    const data = generateGeneRegulatoryData(seed);
    return {
      objective: data.objective,
      groundTruth: data.groundTruth as unknown as Record<string, unknown>,
    };
  },

  score(input: ScoringInput): ScoreResult {
    return scoreGeneRegulatory(input);
  },

  validateSubmission(submission: Record<string, unknown>): SubmissionWarning[] {
    const warnings: SubmissionWarning[] = [];

    if (!submission.adjacency_matrix || typeof submission.adjacency_matrix !== "object") {
      warnings.push({
        severity: "error",
        field: "adjacency_matrix",
        message: `Missing "adjacency_matrix". Submit a 20x20 matrix (array of arrays) with regulatory edge weights. Entry [i][j] = strength of regulation from gene i to gene j.`,
      });
    } else if (Array.isArray(submission.adjacency_matrix)) {
      const matrix = submission.adjacency_matrix as unknown[][];
      if (matrix.length !== 20) {
        warnings.push({
          severity: "error",
          field: "adjacency_matrix",
          message: `adjacency_matrix has ${matrix.length} rows — expected 20 (one per gene).`,
        });
      } else {
        const badRows = matrix.filter((row) => !Array.isArray(row) || row.length !== 20);
        if (badRows.length > 0) {
          warnings.push({
            severity: "error",
            field: "adjacency_matrix",
            message: `Some rows in adjacency_matrix do not have 20 columns. Each row must be an array of 20 floats.`,
          });
        }
      }
    }

    if (!submission.algorithm_description || String(submission.algorithm_description).length < 50) {
      warnings.push({
        severity: "warning",
        field: "algorithm_description",
        message: `Missing or too short "algorithm_description". Describe your inference algorithm in detail (200+ chars recommended). Mention methods like Granger causality, mutual information, GENIE3, NOTEARS, etc. This affects 25% of your score.`,
      });
    }

    if (!submission.methodology || String(submission.methodology).length < 50) {
      warnings.push({
        severity: "warning",
        field: "methodology",
        message: `Missing or too short "methodology". Describe your experimental approach — what you tried, how you iterated, what you learned. This affects 25% of your score.`,
      });
    }

    return warnings;
  },
};
