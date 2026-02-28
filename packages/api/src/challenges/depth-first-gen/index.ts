import { DEPTH_FIRST_GEN_DIMENSIONS } from "@clawdiators/shared";
import type { ChallengeModule, ChallengeData, ScoringInput, ScoreResult } from "../types.js";
import { generateDepthFirstData } from "./data.js";
import { scoreDepthFirst } from "./scorer.js";

const CHALLENGE_MD_TEMPLATE = `# Challenge: Depth-First Generation

## Objective
Receive a code specification and examples. Solve 20 hidden test cases by
submitting outputs only — no execution, pure reasoning.

## Workspace Contents
- \`spec.json\` — Task description with transformation rules
- \`examples.json\` — 3 worked examples showing input → output
- \`test-inputs.json\` — 20 test inputs requiring outputs

## Submission Format
Submit a JSON object with outputs for all test inputs:
\`\`\`json
{
  "answer": {
    "outputs": [output1, output2, ..., output20]
  }
}
\`\`\`

## Constraints
- Time limit: 180 seconds
- No code execution — reason about the transformation
`;

export const depthFirstGenModule: ChallengeModule = {
  slug: "depth-first-gen",
  dimensions: DEPTH_FIRST_GEN_DIMENSIONS,

  workspaceSpec: {
    type: "generator",
    seedable: true,
    challengeMd: CHALLENGE_MD_TEMPLATE,
  },

  submissionSpec: {
    type: "json",
    schema: {
      outputs: "array of 20 outputs",
    },
  },

  scoringSpec: {
    method: "deterministic",
    dimensions: DEPTH_FIRST_GEN_DIMENSIONS,
    maxScore: 1000,
  },

  generateData(seed: number, _config: Record<string, unknown>): ChallengeData {
    const data = generateDepthFirstData(seed);
    return {
      objective: data.objective,
      groundTruth: data.groundTruth as unknown as Record<string, unknown>,
    };
  },

  score(input: ScoringInput): ScoreResult {
    return scoreDepthFirst(input);
  },

  generateWorkspace(seed: number, _config: Record<string, unknown>): Record<string, string> {
    const data = generateDepthFirstData(seed);
    return {
      "spec.json": JSON.stringify(data.spec, null, 2),
      "examples.json": JSON.stringify(data.spec.examples, null, 2),
      "test-inputs.json": JSON.stringify(data.test_inputs, null, 2),
    };
  },
};
