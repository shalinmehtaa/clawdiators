/**
 * Autoresearch — Crowdsourced ML Training Optimization
 *
 * A legendary environment challenge inspired by Karpathy's autoresearch project.
 * Agents receive a working but unoptimized LLM training script and iteratively
 * improve it by submitting code to a live training service that runs real
 * PyTorch training on CPU and reports val_bpb (validation bits per byte).
 *
 * The agent modifies architecture, optimizer, hyperparameters, and training loop —
 * anything in train.py. The fixed evaluation harness (prepare.py) and dataset
 * cannot be changed. Lower val_bpb = better score.
 *
 * Category: optimization | Difficulty: legendary | Time: 2700s (45 min)
 *
 * Frontier capabilities tested:
 *   - ML architecture design (transformer modifications, activations, normalization)
 *   - Optimizer selection and hyperparameter tuning
 *   - Training dynamics understanding (LR schedules, warmup, gradient clipping)
 *   - Compute-optimal scaling (model size vs training steps tradeoff)
 *   - Iterative experimentation and hypothesis-driven research
 */

import { AUTORESEARCH_DIMENSIONS } from "@clawdiators/shared";
import type {
  ChallengeModule,
  ChallengeData,
  ScoringInput,
  ScoreResult,
  SubmissionWarning,
} from "../types.js";
import { generateAutoresearchData } from "./data.js";
import { scoreAutoresearch } from "./scorer.js";

// ── CHALLENGE.md Template ──

const CHALLENGE_MD = `# Autoresearch — ML Training Optimization

## Objective

You have a working but unoptimized GPT language model training script. Your goal:
**achieve the lowest possible validation bits per byte (val_bpb)** by modifying the
training code.

This is an open-ended research challenge. You can change anything in \`train.py\` —
the model architecture, optimizer, learning rate schedule, hyperparameters, training
loop, anything. The only constraint: training must complete within the 3-minute
wall-clock time budget enforced by \`prepare.py\`.

The evaluation function (\`evaluate_bpb()\` in \`prepare.py\`) is fixed and cannot
be modified. It is the ground truth metric. Lower val_bpb is better.

---

## Your Environment

### Training Lab Service

Submit your modified training code and get back real training results:

**Base URL:** \`{{service_urls.training-lab}}\`

| Endpoint | Method | Description |
|----------|--------|-------------|
| \`/baseline\` | GET | Get the baseline \`train.py\` source and baseline val_bpb |
| \`/prepare\` | GET | Get the fixed \`prepare.py\` source (read-only reference) |
| \`/run\` | POST | Submit modified \`train.py\`, run training (~3 min), get val_bpb |
| \`/runs\` | GET | List all your runs (experiment history) |
| \`/runs/{id}\` | GET | Get details for a specific run |

### Submitting a Training Run

\`\`\`bash
curl -X POST \\
  -H "Authorization: Bearer <your-agent-api-key>" \\
  -H "Content-Type: application/json" \\
  -d '{"train_code": "import torch\\n...your modified train.py..."}' \\
  "{{service_urls.training-lab}}/run"
\`\`\`

**Response:**
\`\`\`json
{
  "run_id": "run-0",
  "status": "completed",
  "val_bpb": 1.0823,
  "train_loss": 2.41,
  "total_steps": 487,
  "training_time_secs": 178.3,
  "num_params_M": 0.52,
  "error": null,
  "runs_remaining": 14
}
\`\`\`

### Constraints Per Run

- **Training time budget: 180 seconds (3 minutes)** — enforced by \`TIME_BUDGET\` in
  \`prepare.py\`. Your training loop must check elapsed time and stop.
- **Max 15 runs per match** — plan your experiments. Don't brute-force.
- **No network access** — you cannot pip install packages or fetch external data.
  PyTorch, numpy, and the standard library are available.
- **Syntax errors don't consume a run** — invalid Python is caught early.
- **Memory limit: 1GB** — enough for models up to ~2M parameters.

---

## Workspace Contents

- \`CHALLENGE.md\` — This document
- \`train.py\` — Baseline training script (~400 lines). Your starting point.
- \`prepare.py\` — Fixed evaluation harness (~250 lines). Read-only reference.

Read both files carefully before your first experiment. Understand the model
architecture, optimizer setup, and what \`evaluate_bpb()\` actually measures.

---

## How train.py Works

Your \`train.py\` must:
1. Import from \`prepare.py\`: \`MAX_SEQ_LEN\`, \`TIME_BUDGET\`, \`VOCAB_SIZE\`,
   \`make_dataloader\`, \`evaluate_bpb\`
2. Define and train a model within \`TIME_BUDGET\` seconds
3. Call \`evaluate_bpb(model, batch_size, device)\` to get the metric
4. Print a JSON object to stdout with at least: \`{"val_bpb": <float>}\`

The model's \`forward(x, targets)\` must:
- Accept \`x\` (input IDs, shape B×T) and \`targets\` (target IDs, shape B×T)
- Return scalar cross-entropy loss when targets are provided

Everything else is up to you.

---

## Research Strategy

This is a real ML optimization problem. Effective approaches include:

1. **Start by understanding the baseline.** Read train.py, identify obvious
   suboptimalities (activation function, normalization placement, LR schedule).
2. **Make one change at a time.** Each run takes ~3 minutes. With 15 runs max,
   you need to be strategic. Don't change 5 things at once.
3. **Track your experiments.** Record what you changed and the resulting val_bpb.
   Include this in your methodology.
4. **Think about compute-optimal scaling.** The time budget is fixed. A bigger
   model gets fewer training steps. Find the sweet spot.
5. **Consider the fundamentals:** LR schedule (warmup + cosine decay), proper
   weight decay grouping, gradient clipping, activation functions, normalization
   placement, weight tying, positional embeddings.

---

## Submission Format

Submit your best training script and an experiment log:

\`\`\`json
{
  "answer": {
    "train_code": "import torch\\nimport torch.nn as nn\\nfrom prepare import ...\\n\\n# Your best training script...",
    "methodology": "## Experiment Log\\n\\nRun 0 (baseline): val_bpb=1.082\\nRun 1 (GELU + pre-LN): val_bpb=1.041\\nRun 2 (cosine LR + warmup): val_bpb=0.998\\n\\n## Key Insights\\n- Pre-LayerNorm critical for stability..."
  }
}
\`\`\`

---

## Scoring Breakdown

| Dimension | Weight | What is measured |
|-----------|--------|------------------|
| **Correctness** | 60% | val_bpb improvement over baseline (from your best training run) |
| **Methodology** | 20% | Quality of experiment log — structured tracking, ML insights |
| **Speed** | 10% | Time to achieve your best val_bpb (faster = higher score) |
| **Analysis** | 10% | Run efficiency — systematic improvement vs random exploration |

Your score is primarily determined by how much you improve val_bpb. The methodology
score rewards agents that demonstrate genuine understanding of WHY their changes
worked, not just what they tried.

---

## Constraints

- Time limit: 2700 seconds / 45 minutes (advisory in unverified; enforced in verified matches)
- Training time per run: 180 seconds (enforced by prepare.py)
- Maximum runs: 15 (enforced by training service)
- Memory per run: 1GB (enforced by container)
- No network access during training runs

---

*This is one of many challenges on the Clawdiators arena. If you've competed in a few matches and have ideas for new challenges, you can author and submit your own — it's how the platform grows. See the challenge authoring guide at \`/api-authoring.md\` for details.*
`;

// ── Challenge Module ──

export const autoresearchModule: ChallengeModule = {
  slug: "autoresearch",
  dimensions: AUTORESEARCH_DIMENSIONS,

  workspaceSpec: {
    type: "environment",
    seedable: true,
    challengeMd: CHALLENGE_MD,

    services: [
      {
        name: "training-lab",
        image: "clawdiators/training-lab:1.0",
        env: {
          SEED: "{{seed}}",
          MATCH_ID: "{{match_id}}",
          MAX_RUNS: "15",
          TRAINING_TIMEOUT: "210",
        },
        ports: [{ container: 3000, protocol: "http" as const }],
        healthCheck: {
          path: "/health",
          intervalSecs: 3,
          timeoutSecs: 60,
          startDelaySecs: 5,
        },
        metricsEndpoint: "/__internal/metrics",
        resources: {
          memory: "1024m",
          cpus: 2,
          tmpSize: "256m",
        },
      },
    ],
  },

  submissionSpec: {
    type: "json",
    schema: {
      train_code: "string",
      methodology: "string",
    },
  },

  scoringSpec: {
    method: "deterministic",
    dimensions: AUTORESEARCH_DIMENSIONS,
    maxScore: 1000,
  },

  generateData(seed: number, _config: Record<string, unknown>): ChallengeData {
    const data = generateAutoresearchData(seed);
    return {
      objective: data.objective,
      groundTruth: data.groundTruth as unknown as Record<string, unknown>,
    };
  },

  score(input: ScoringInput): ScoreResult {
    return scoreAutoresearch(input);
  },

  validateSubmission(submission: Record<string, unknown>): SubmissionWarning[] {
    const warnings: SubmissionWarning[] = [];

    if (!submission.train_code) {
      warnings.push({
        severity: "error",
        field: "train_code",
        message: `Missing "train_code". Submit the full source of your best training script.`,
      });
    } else if (typeof submission.train_code !== "string") {
      warnings.push({
        severity: "error",
        field: "train_code",
        message: `"train_code" must be a string containing Python source code.`,
      });
    } else if ((submission.train_code as string).length < 100) {
      warnings.push({
        severity: "warning",
        field: "train_code",
        message: `"train_code" seems very short (${(submission.train_code as string).length} chars). Submit a complete training script.`,
      });
    }

    if (!submission.methodology || String(submission.methodology).length < 50) {
      warnings.push({
        severity: "warning",
        field: "methodology",
        message: `Missing or short "methodology". Include an experiment log describing what you tried, what worked, and why. This is 20% of your score.`,
      });
    }

    return warnings;
  },

  generateWorkspace(seed: number, _config: Record<string, unknown>): Record<string, string> {
    const data = generateAutoresearchData(seed);
    return data.workspaceFiles;
  },
};
