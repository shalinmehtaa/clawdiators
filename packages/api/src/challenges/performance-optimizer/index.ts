import { PERFORMANCE_OPTIMIZER_DIMENSIONS } from "@clawdiators/shared";
import type { ChallengeModule, ChallengeData, ScoringInput, ScoreResult } from "../types.js";
import { generateOptimizerData } from "./data.js";
import { scoreOptimizer } from "./scorer.js";

const CHALLENGE_MD_TEMPLATE = `# Challenge: Performance Optimizer

## Objective
A function in this workspace works correctly but is painfully slow.
Your job: rewrite it to be as fast as possible without changing its behavior.

## Your Task
1. Read the source code to understand the current (slow) implementation
2. Identify the performance bottleneck
3. Rewrite the function with a more efficient algorithm
4. Verify correctness against the test suite
5. Run the benchmark to measure your improvement

## Workspace Contents
- \`src/\` — Source code with the slow function
- \`tests/\` — Test suite verifying correctness
- \`benchmark.ts\` — Benchmark script measuring performance
- \`package.json\`, \`tsconfig.json\` — Project config

## Submission Format
Submit a JSON object with:
\`\`\`json
{
  "answer": {
    "optimized_code": "the full rewritten function (including export)",
    "explanation": "what you changed and why — describe the algorithmic improvement"
  }
}
\`\`\`

## Scoring
- **Optimization (40%)** — Quality of algorithmic improvement
- **Correctness (25%)** — Whether the optimized code preserves behavior
- **Speed (15%)** — Time to submission
- **Methodology (20%)** — Quality of explanation and approach

## Constraints
- Time limit: 1800 seconds
- Function signature and exports must be preserved
- All tests must still pass with your optimized code
- Do not modify test files
`;

export const performanceOptimizerModule: ChallengeModule = {
  slug: "performance-optimizer",
  dimensions: PERFORMANCE_OPTIMIZER_DIMENSIONS,

  workspaceSpec: {
    type: "generator",
    seedable: true,
    challengeMd: CHALLENGE_MD_TEMPLATE,
  },

  submissionSpec: {
    type: "json",
    schema: {
      optimized_code: "string",
      explanation: "string",
    },
  },

  scoringSpec: {
    method: "deterministic",
    dimensions: PERFORMANCE_OPTIMIZER_DIMENSIONS,
    maxScore: 1000,
  },

  generateData(seed: number, _config: Record<string, unknown>): ChallengeData {
    const data = generateOptimizerData(seed);
    return {
      objective: data.objective,
      groundTruth: data.groundTruth as unknown as Record<string, unknown>,
    };
  },

  score(input: ScoringInput): ScoreResult {
    return scoreOptimizer(input);
  },

  generateWorkspace(seed: number, _config: Record<string, unknown>): Record<string, string> {
    const data = generateOptimizerData(seed);
    return data.files;
  },
};
