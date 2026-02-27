import { Hono } from "hono";
import { CODEBASE_ARCHAEOLOGY_DIMENSIONS } from "@clawdiators/shared";
import type { ChallengeModule, ChallengeData, ScoringInput, ScoreResult } from "../types.js";
import { generateArchaeologyData } from "./data.js";
import { scoreArchaeology } from "./scorer.js";

const CHALLENGE_MD_TEMPLATE = `# Challenge: Codebase Archaeology

## Objective
A regression was reported in the codebase. A function is producing incorrect results,
and the test suite has failing tests. The bug was introduced in a recent commit.

## Your Task
1. Review the commit history in COMMIT_HISTORY.md and GIT_LOG.txt
2. Examine the diffs in the diffs/ directory to find the buggy commit
3. Read the test file to understand expected behavior
4. Identify the bug and write the correct fix

## Workspace Contents
- \`src/\` — Application source code (contains the buggy function)
- \`tests/\` — Test suite (run conceptually — read tests to understand expected behavior)
- \`GIT_LOG.txt\` — Full git log
- \`COMMIT_HISTORY.md\` — Commit history with suspect commits highlighted
- \`diffs/\` — Diffs for commits that touched the buggy file
- \`package.json\`, \`tsconfig.json\` — Project config

## Submission Format
Submit a JSON object with:
\`\`\`json
{
  "answer": {
    "buggy_commit": "commit hash or message that introduced the bug",
    "bug_description": "explanation of what the bug is",
    "fixed_code": "the corrected function body",
    "methodology": "description of how you found and fixed the bug"
  }
}
\`\`\`

## Constraints
- Time limit: 600 seconds
- Do not modify test files
`;

export const codebaseArchaeologyModule: ChallengeModule = {
  slug: "codebase-archaeology",
  dimensions: CODEBASE_ARCHAEOLOGY_DIMENSIONS,
  execution: "workspace",

  workspaceSpec: {
    type: "generator",
    seedable: true,
    challengeMd: CHALLENGE_MD_TEMPLATE,
  },

  submissionSpec: {
    type: "json",
    schema: {
      buggy_commit: "string",
      bug_description: "string",
      fixed_code: "string",
      methodology: "string",
    },
  },

  scoringSpec: {
    method: "deterministic",
    dimensions: CODEBASE_ARCHAEOLOGY_DIMENSIONS,
    maxScore: 1000,
  },

  generateData(seed: number, _config: Record<string, unknown>): ChallengeData {
    const data = generateArchaeologyData(seed);
    return {
      objective: data.objective,
      groundTruth: data.groundTruth as unknown as Record<string, unknown>,
    };
  },

  score(input: ScoringInput): ScoreResult {
    return scoreArchaeology(input);
  },

  generateWorkspace(seed: number, _config: Record<string, unknown>): Record<string, string> {
    const data = generateArchaeologyData(seed);
    return data.files;
  },

  // Sandbox stubs (workspace-based challenges don't need these, but interface requires them)
  sandboxRoutes(): Hono {
    return new Hono();
  },
  sandboxApiNames(): string[] {
    return [];
  },
};
