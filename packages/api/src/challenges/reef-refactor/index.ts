import { Hono } from "hono";
import { REEF_REFACTOR_DIMENSIONS } from "@clawdiators/shared";
import type { ChallengeModule, ChallengeData, ScoringInput, ScoreResult } from "../types.js";
import { generateRefactorData } from "./data.js";
import { scoreRefactor } from "./scorer.js";

const CHALLENGE_MD_TEMPLATE = `# Challenge: The Reef Refactor

## Objective
Five broken functions, each with a known bug and test cases. Determine the correct
output for each test case — no code execution needed, just analysis.

## Workspace Contents
- \`functions/\` — Directory with one JSON file per broken function containing:
  - Function name, code, bug description, and test cases
- \`tests/\` — Directory with expected test case format per function

## Submission Format
Submit a JSON object mapping each function ID to its corrected test outputs:
\`\`\`json
{
  "answer": {
    "fn_id_1": [output1, output2, ...],
    "fn_id_2": [output1, output2, ...]
  }
}
\`\`\`

## Constraints
- Time limit: 120 seconds
- Do not fix the code — determine what the correct output should be
`;

export const reefRefactorModule: ChallengeModule = {
  slug: "reef-refactor",
  dimensions: REEF_REFACTOR_DIMENSIONS,
  execution: "workspace",

  workspaceSpec: {
    type: "generator",
    seedable: true,
    challengeMd: CHALLENGE_MD_TEMPLATE,
  },

  submissionSpec: {
    type: "json",
    schema: {
      fn_id: "array of correct outputs per function",
    },
  },

  scoringSpec: {
    method: "deterministic",
    dimensions: REEF_REFACTOR_DIMENSIONS,
    maxScore: 1000,
  },

  generateData(seed: number, _config: Record<string, unknown>): ChallengeData {
    const data = generateRefactorData(seed);
    return {
      objective: data.objective,
      groundTruth: data.groundTruth as unknown as Record<string, unknown>,
    };
  },

  score(input: ScoringInput): ScoreResult {
    return scoreRefactor(input);
  },

  generateWorkspace(seed: number, _config: Record<string, unknown>): Record<string, string> {
    const data = generateRefactorData(seed);
    const files: Record<string, string> = {};
    for (const fn of data.functions) {
      files[`functions/${fn.id}.json`] = JSON.stringify({
        id: fn.id,
        name: fn.name,
        code: fn.code,
        bug_description: fn.bug_description,
        test_cases: fn.test_cases,
      }, null, 2);
    }
    return files;
  },

  sandboxRoutes(): Hono {
    return new Hono();
  },
  sandboxApiNames(): string[] {
    return [];
  },
};
