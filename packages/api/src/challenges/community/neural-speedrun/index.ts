/**
 * Neural Speedrun — Community challenge module
 *
 * Agent receives a naive 2-layer MLP trainer in JavaScript and must optimize it
 * to maximize training iterations per second while maintaining loss quality.
 * Scoring runs both versions as Node.js subprocesses and compares step counts.
 *
 * NOTE: score() uses execFileSync (blocking). This is intentional for this
 * TypeScript module — the call blocks ~20s max (two 10s trainer runs).
 * For production high-concurrency use, this challenge would need async score()
 * support (interface change) or a custom-script Docker evaluator.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ChallengeModule, ChallengeData, ScoringInput, ScoreResult, SubmissionWarning } from "../../types.js";

// ── Seeded PRNG (mulberry32, matches arena standard) ──────────────────

function rng(seed: number): () => number {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateDataset(seed: number): [number, number][] {
  const r = rng(seed);
  const PI = Math.PI;
  const data: [number, number][] = [];
  for (let i = 0; i < 800; i++) {
    const x = r();
    const y =
      Math.sin(2 * PI * x) * Math.cos(4 * PI * x) +
      0.1 * Math.sin(8 * PI * x);
    data.push([
      Math.round(x * 100000) / 100000,
      Math.round(y * 100000) / 100000,
    ]);
  }
  return data;
}

// ── Naive trainer template ─────────────────────────────────────────────
// DATA_PLACEHOLDER is replaced with JSON.stringify(data) before use.

const NAIVE_TRAINER_TEMPLATE = [
  "// NaiveNet: a 2-layer MLP trained with stochastic gradient descent",
  "// Architecture: input(1) -> hidden(HIDDEN_SIZE) -> output(1)",
  "// Task: approximate a function on the interval [0, 1]",
  "// DO NOT MODIFY: training data, architecture depth, or output format",
  "// You MAY optimize: data structures, batching, computation, memory, loop structure",
  "",
  "var DATA = DATA_PLACEHOLDER;",
  "var HIDDEN = 16;",
  "var LR = 0.01;",
  "var STEPS = 0;",
  "",
  "// Weight initialization (naive: plain arrays)",
  "var W1 = [], B1 = [], W2 = [], B2 = 0;",
  "for (var i = 0; i < HIDDEN; i++) {",
  "  W1.push((Math.random() - 0.5) * 0.5);",
  "  B1.push(0);",
  "  W2.push((Math.random() - 0.5) * 0.5);",
  "}",
  "",
  "function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }",
  "function sigmoidDeriv(s) { return s * (1 - s); }",
  "",
  "function forward(x) {",
  "  var hidden = [];",
  "  for (var i = 0; i < HIDDEN; i++) {",
  "    hidden.push(sigmoid(W1[i] * x + B1[i]));",
  "  }",
  "  var out = B2;",
  "  for (var i = 0; i < HIDDEN; i++) out += W2[i] * hidden[i];",
  "  return { hidden: hidden, out: out };",
  "}",
  "",
  "function trainStep(x, y) {",
  "  var fwd = forward(x);",
  "  var err = fwd.out - y;",
  "  var dOut = err;",
  "  var dB2 = dOut;",
  "  var dW2 = [], dHidden = [];",
  "  for (var i = 0; i < HIDDEN; i++) {",
  "    dW2.push(dOut * fwd.hidden[i]);",
  "    dHidden.push(dOut * W2[i] * sigmoidDeriv(fwd.hidden[i]));",
  "  }",
  "  B2 -= LR * dB2;",
  "  for (var i = 0; i < HIDDEN; i++) {",
  "    W2[i] -= LR * dW2[i];",
  "    W1[i] -= LR * dHidden[i] * x;",
  "    B1[i] -= LR * dHidden[i];",
  "  }",
  "  return err * err;",
  "}",
  "",
  "var start = Date.now();",
  "var mse = 0;",
  "while (Date.now() - start < 10000) {",
  "  var idx = Math.floor(Math.random() * DATA.length);",
  "  mse = 0.99 * mse + 0.01 * trainStep(DATA[idx][0], DATA[idx][1]);",
  "  STEPS++;",
  "}",
  "",
  "// Report results -- DO NOT REMOVE THIS OUTPUT FORMAT",
  "console.log(JSON.stringify({ steps: STEPS, mse: mse }));",
].join("\n");

// ── Scoring dimensions ────────────────────────────────────────────────

const DIMENSIONS = [
  {
    key: "code_quality",
    label: "Code Quality",
    weight: 0.8,
    description: "Steps ratio vs naive baseline (20x = max 800pts)",
    color: "coral",
  },
  {
    key: "precision",
    label: "Precision",
    weight: 0.2,
    description: "MSE \u2264 1.05\u00d7 baseline = full 200pts",
    color: "coral",
  },
];

// ── CHALLENGE.md template ─────────────────────────────────────────────

const CHALLENGE_MD_TEMPLATE = [
  "# Neural Speedrun",
  "",
  "Seed: {{seed}}",
  "",
  "## The Challenge",
  "",
  "You've been handed a working but embarrassingly slow JavaScript neural network trainer.",
  "It trains a 2-layer MLP to approximate a nonlinear function on [0, 1].",
  "The naive implementation is riddled with inefficiencies.",
  "",
  "Your job: make it as fast as possible without breaking correctness.",
  "",
  "## Workspace",
  "",
  "- `trainer.js` \u2014 The naive trainer. Runs for 10 seconds, outputs `{steps, mse}`. Study it.",
  "- `README.md` \u2014 Rules, optimization hints, scoring details.",
  "",
  "## Constraints",
  "",
  "- Do NOT change the dataset, architecture (2 layers, 16 hidden), or 10-second time limit",
  "- Do NOT use external npm packages",
  "- Keep the output format: `console.log(JSON.stringify({ steps: N, mse: M }))`",
  "- No GPU (CPU only). Pure JavaScript optimization.",
  "",
  "## Submission",
  "",
  "```json",
  "{",
  '  "optimized_trainer": "// Your full optimized trainer.js code here\\n...",',
  '  "optimizations_applied": ["Float32Array weights", "Mini-batch SGD", "..."]',
  "}",
  "```",
  "",
  "## Scoring (max 1000)",
  "",
  "| Dimension | Points | Formula |",
  "|---|---|---|",
  "| **Speedup** | 0\u2013800 | Steps ratio vs baseline. 20x speedup = 800pts |",
  "| **Loss Quality** | 0\u2013200 | Full marks if your MSE \u2264 1.05\u00d7 baseline MSE |",
  "",
  "The baseline naive implementation typically achieves 80,000\u2013150,000 steps in 10 seconds.",
  "A well-optimized version should hit 1,000,000+ steps.",
  "",
  "Hint: the biggest wins come from reducing allocations and exploiting batch parallelism.",
].join("\n");

// ── Helper ────────────────────────────────────────────────────────────

function runTrainer(
  filename: string,
  dir: string,
): { steps: number; mse: number } | null {
  try {
    const output = execFileSync("node", [filename], {
      cwd: dir,
      timeout: 14000,
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    });
    const lines = output.trim().split("\n");
    const last = lines[lines.length - 1];
    const parsed = JSON.parse(last);
    if (typeof parsed.steps === "number" && typeof parsed.mse === "number") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

// ── Module ────────────────────────────────────────────────────────────

export const neuralSpeedrunModule: ChallengeModule = {
  slug: "neural-speedrun",
  dimensions: DIMENSIONS,

  workspaceSpec: {
    type: "generator",
    seedable: true,
    challengeMd: CHALLENGE_MD_TEMPLATE,
  },

  submissionSpec: {
    type: "json",
    schema: {
      optimized_trainer: "string",
      optimizations_applied: "array",
    },
  },

  scoringSpec: {
    method: "deterministic",
    dimensions: DIMENSIONS,
    maxScore: 1000,
  },

  generateData(seed: number, _config: Record<string, unknown>): ChallengeData {
    const data = generateDataset(seed);
    return {
      objective:
        "Optimize the neural network trainer in trainer.js to maximize training speed " +
        "(iterations/sec) while achieving lower or equal MSE. Submit your optimized JavaScript code.",
      groundTruth: {
        data,
        hiddenSize: 16,
        timeLimit: 10000,
      },
    };
  },

  generateWorkspace(
    seed: number,
    _config: Record<string, unknown>,
  ): Record<string, string> {
    const data = generateDataset(seed);
    const dataStr = JSON.stringify(data);
    const trainerCode = NAIVE_TRAINER_TEMPLATE.replace(
      "DATA_PLACEHOLDER",
      dataStr,
    );

    const readme = [
      "# Neural Speedrun",
      "",
      "## Your Task",
      "",
      "The file trainer.js contains a naive 2-layer MLP trained with SGD.",
      "Architecture: input(1) -> hidden(16, sigmoid) -> output(1)",
      "Task: approximate f(x) = sin(2*PI*x) * cos(4*PI*x) + 0.1*sin(8*PI*x) on [0,1]",
      "",
      "The trainer runs for 10 seconds, counts steps completed, and reports MSE.",
      "",
      "## Optimization Opportunities",
      "",
      "There are several obvious inefficiencies in the naive implementation.",
      "Find them. Fix them. Go faster.",
      "",
      "## Rules",
      "",
      "1. Do NOT change the training data (DATA array), architecture depth (2 layers), or hidden size (16)",
      "2. Do NOT change the time limit (10 seconds)",
      "3. Keep the output format: console.log(JSON.stringify({ steps: N, mse: M }))",
      "4. You may use ANY JavaScript optimization: typed arrays, batching, BLAS patterns, SIMD tricks",
      "5. No external npm packages (they are not available)",
      "",
      "## Scoring",
      "",
      "Your submission is run against the original trainer.js.",
      "- Steps speedup (80%): how many more iterations per second vs baseline",
      "- Loss improvement (20%): whether your MSE is equal or better",
      "",
      "## Test Locally",
      "",
      "    node trainer.js",
      "",
      'Should output something like: {"steps": 120000, "mse": 0.031}',
      "A well-optimized version should achieve 5-20x more steps in the same time.",
    ].join("\n");

    return {
      "trainer.js": trainerCode,
      "README.md": readme,
    };
  },

  score(input: ScoringInput): ScoreResult {
    const sub = input.submission as {
      optimized_trainer?: unknown;
      optimizations_applied?: unknown;
    };
    const gt = input.groundTruth as {
      data: [number, number][];
      hiddenSize: number;
      timeLimit: number;
    };

    const optimizedCode = sub.optimized_trainer;
    if (typeof optimizedCode !== "string" || optimizedCode.length < 100) {
      return { breakdown: { code_quality: 0, precision: 0, total: 0 } };
    }

    const dataStr = JSON.stringify(gt.data);
    const originalCode = NAIVE_TRAINER_TEMPLATE.replace(
      "DATA_PLACEHOLDER",
      dataStr,
    );
    // Replace DATA_PLACEHOLDER in optimized code if agent left it in
    const finalOptimizedCode = optimizedCode.includes("DATA_PLACEHOLDER")
      ? optimizedCode.replace("DATA_PLACEHOLDER", dataStr)
      : optimizedCode;

    let dir: string | undefined;
    try {
      dir = mkdtempSync(join(tmpdir(), "clawdiators-speedrun-"));
      writeFileSync(join(dir, "original.js"), originalCode, "utf8");
      writeFileSync(join(dir, "optimized.js"), finalOptimizedCode, "utf8");

      const originalResult = runTrainer("original.js", dir);
      const optimizedResult = runTrainer("optimized.js", dir);

      if (!originalResult || !optimizedResult) {
        return { breakdown: { code_quality: 0, precision: 0, total: 0 } };
      }

      const stepsRatio =
        optimizedResult.steps / Math.max(1, originalResult.steps);
      const speedupScore = Math.min(
        800,
        Math.max(0, Math.round(((stepsRatio - 1) / 19) * 800)),
      );

      let lossScore = 0;
      if (optimizedResult.mse <= originalResult.mse * 1.05) {
        lossScore = 200;
      } else if (optimizedResult.mse <= originalResult.mse * 1.2) {
        lossScore = 100;
      }

      const total = Math.min(1000, speedupScore + lossScore);
      return { breakdown: { code_quality: speedupScore, precision: lossScore, total } };
    } finally {
      if (dir) {
        try {
          rmSync(dir, { recursive: true, force: true });
        } catch {
          /* ignore cleanup errors */
        }
      }
    }
  },

  validateSubmission(submission: Record<string, unknown>): SubmissionWarning[] {
    const warnings: SubmissionWarning[] = [];
    if (
      typeof submission.optimized_trainer !== "string" ||
      submission.optimized_trainer.length < 100
    ) {
      warnings.push({
        severity: "error",
        field: "optimized_trainer",
        message:
          'Missing or too short "optimized_trainer". Submit your full optimized trainer.js code as a string.',
      });
    }
    return warnings;
  },
};
