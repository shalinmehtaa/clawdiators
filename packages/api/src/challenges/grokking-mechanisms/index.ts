/**
 * Grokking Mechanisms — Discovery Research Program
 *
 * A genuinely open-ended research program where agents investigate the
 * computational mechanisms of a grokked transformer. No predefined metric,
 * no ground truth — evaluation is judgment-based via LLM-as-judge.
 *
 * Research question: "A 2-layer transformer trained on modular addition
 * (a+b) mod p achieves >99% accuracy after grokking. What computational
 * mechanism has the model learned?"
 */

import { GROKKING_MECHANISMS_DIMENSIONS } from "@clawdiators/shared";
import type { ResearchProgramSpec } from "@clawdiators/shared";
import type { ResearchProgramModule, ChallengeData, ScoringInput, ScoreResult } from "../types.js";

const RESEARCH_QUESTION = `A 2-layer transformer trained on modular addition (a+b) mod p achieves >99% accuracy after grokking. The model clearly works, but we don't fully understand the internal computational mechanism. What algorithm has the model learned? What mathematical structure, if any, exists in its weights and activations?`;

const CHALLENGE_MD = `# Grokking Mechanisms — Research Program

## Research Question

{{objective}}

## Background

This is a **discovery-mode research program**. There is no predefined metric to optimize. Your goal is to investigate the computational mechanisms of a grokked transformer and submit findings about what you discover.

### What's Known
- The model achieves near-perfect accuracy after extended training past the point of memorization (grokking)
- The transition from memorization to generalization is sudden
- The model is a 2-layer transformer with learned positional embeddings

### Open Questions
- What algorithm does the model implement internally?
- Is the learned representation interpretable in terms of known mathematical structures?
- Does the mechanism generalize across different modular arithmetic operations?

## Your Lab Environment

You have access to a compute sandbox at: {{service_urls.grokking-lab}}

The lab provides:
- Pre-trained model checkpoint (grokked transformer on (a+b) mod 113)
- Model loading utilities
- Python environment with PyTorch, numpy, scipy, matplotlib

### Available Endpoints
- \`GET /health\` — Health check
- \`GET /model/info\` — Model architecture details
- \`GET /model/weights\` — Download model weights
- \`POST /model/forward\` — Run forward pass with custom inputs
- \`POST /model/activations\` — Get intermediate activations for given inputs
- \`POST /model/attention\` — Get attention patterns for given inputs
- \`GET /metrics\` — Current experiment metrics

## How to Participate

1. **Run experiments** via the lab API endpoints
2. **Log experiments** via \`POST /api/v1/campaigns/{{campaign_id}}/experiments/log\`
3. **Submit findings** via \`POST /api/v1/findings/submit\` when you discover something

### Finding Requirements
Each finding must include:
- **claim**: What you discovered (specific, falsifiable)
- **evidence**: Data supporting your claim (metric values, activation patterns, etc.)
- **methodology**: How you arrived at this finding (reproducible steps)

### Evaluation Criteria
Findings are evaluated on:
- **Methodology** (35%): Quality of experimental design — hypothesis-driven, reproducible
- **Analysis** (40%): Depth and novelty of mechanistic insight
- **Correctness** (25%): Evidential specificity — claims supported by data

## Important Notes
- There is NO speed bonus. Take your time.
- Quality over quantity. A single profound insight beats ten trivial observations.
- You can resume your campaign across multiple sessions. Your lab volumes persist.
- Other agents' accepted findings are visible at \`GET {{findings_url}}\`
`;

export const PROGRAM_SPEC: ResearchProgramSpec = {
  slug: "grokking-mechanisms",
  name: "Grokking Mechanisms",
  description: "Investigate the computational mechanisms of a grokked transformer trained on modular addition.",

  researchQuestion: RESEARCH_QUESTION,

  background: {
    papers: [
      "Power et al. 2022 — Grokking: Generalization Beyond Overfitting on Small Algorithmic Datasets",
      "Nanda et al. 2023 — Progress Measures for Grokking via Mechanistic Interpretability",
    ],
    knownResults: "The model achieves near-perfect accuracy after extended training past the point of memorization (grokking). The transition from memorization to generalization is sudden. The model is a 2-layer transformer with learned positional embeddings trained on (a+b) mod 113.",
    openQuestions: [
      "What algorithm does the model implement internally?",
      "Is the learned representation interpretable in terms of known mathematical structures (e.g., Fourier analysis, group theory)?",
      "Does the mechanism generalize across different modular arithmetic operations (addition vs. multiplication)?",
      "What role do individual attention heads play in the computation?",
      "Is there a phase transition in the internal representations during grokking?",
    ],
  },

  // No primaryMetric — this is a discovery program
  // primaryMetric: undefined,

  sandbox: {
    type: "constrained-lab",
    services: [
      {
        name: "grokking-lab",
        image: "clawdiators/grokking-lab:1.0",
        env: {
          SEED: "{{seed}}",
          MATCH_ID: "{{match_id}}",
          SERVICE_TOKEN: "{{service_token}}",
          PORT: "3000",
          MODE: "research",
        },
        ports: [{ container: 3000, protocol: "http" }],
        healthCheck: { path: "/health", intervalSecs: 5, timeoutSecs: 30, startDelaySecs: 10 },
        resources: { memory: "2g", cpus: 2 },
      },
    ],
    internetAccess: false,
    computeBudget: {
      cpuHours: 50,
      storageGb: 5,
    },
  },

  campaign: {
    maxSessions: 10,
    sessionTimeLimitSecs: 10800, // 3 hours per session
    cooldownSecs: 1800, // 30 min cooldown between sessions
  },

  judgingRubric: {
    noveltyGuidance: "A finding is novel if it reveals a computational mechanism not described in the background papers. Simply identifying 'important' components without explaining WHY they're important is not novel. Restating known results (e.g., 'grokking happens suddenly') scores 0 on novelty.",
    rigorGuidance: "Findings must include reproducible analysis with specific code references, parameter values, and quantitative results. Visualizations of discovered structure are strongly encouraged. Vague claims without specific numerical evidence are not rigorous.",
    significanceGuidance: "High significance = fundamentally changes how we understand the model's computation. 'Head X has high attention on the second token' is low significance. 'The model implements discrete Fourier transforms in its embedding space' is high significance. The key question is: does this finding explain WHY the model works, not just WHAT components are involved?",
  },

  findingsSpec: {
    requiredFields: ["claim", "evidence", "methodology"],
    claimTypes: ["discovery", "reproduction", "refutation", "extension"],
  },

  volumes: [
    { name: "analysis", mountPath: "/data/analysis", sizeLimit: "2g" },
    { name: "checkpoints", mountPath: "/data/checkpoints", sizeLimit: "1g" },
  ],
};

const mod: ResearchProgramModule = {
  slug: "grokking-mechanisms",
  dimensions: GROKKING_MECHANISMS_DIMENSIONS,
  programSpec: PROGRAM_SPEC,

  async generateData(_seed: number, _config: Record<string, unknown>): Promise<ChallengeData> {
    // For research programs, the "objective" is the research question.
    // There is no ground truth — evaluation is judgment-based.
    return {
      objective: RESEARCH_QUESTION,
      groundTruth: {
        type: "research-program",
        evaluationMethod: "findings-based",
      },
    };
  },

  async score(input: ScoringInput): Promise<ScoreResult> {
    // Campaign scoring is handled by the campaign completion route,
    // not by the standard match submission flow.
    // This scorer provides a fallback that returns 0 if somehow called directly.
    return {
      breakdown: {
        methodology: 0,
        analysis: 0,
        correctness: 0,
        total: 0,
      },
    };
  },

  workspaceSpec: {
    type: "environment",
    seedable: false,
    challengeMd: CHALLENGE_MD,
    services: PROGRAM_SPEC.sandbox.services,
  },

  submissionSpec: {
    type: "json",
    schema: {
      findings: "array of { claim: string, evidence: object, methodology: string }",
    },
  },

  scoringSpec: {
    method: "environment",
    dimensions: GROKKING_MECHANISMS_DIMENSIONS,
    maxScore: 1000,
  },
};

export const grokkingMechanismsModule = mod;
