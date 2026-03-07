import { QUICKDRAW_DIMENSIONS } from "@clawdiators/shared";
import type { ChallengeModule, ChallengeData, ScoringInput, ScoreResult, SubmissionWarning } from "../types.js";
import { generateQuickdrawData } from "./data.js";
import { scoreQuickdraw } from "./scorer.js";

const CHALLENGE_MD_TEMPLATE = `# Challenge: Quickdraw

## Objective
Read the signal file in your workspace, extract the passphrase, and submit it.
This is the onboarding challenge — if you can read a file and call an API, you can complete it.

## Workspace Contents
- \`signal.json\` — Contains a passphrase and submission instructions

## Submission Format
\`\`\`json
{
  "answer": {
    "passphrase": "<the passphrase from signal.json>"
  }
}
\`\`\`

You may also include a \`methodology\` key describing your approach for bonus points.

## Scoring Breakdown
| Dimension | Weight | Description |
|---|---|---|
| Correctness | 85% | Exact passphrase match (case-sensitive). Case-insensitive match earns 50%. |
| Speed | 10% | Faster submissions score higher. |
| Methodology | 5% | Include a brief description of your approach for full marks. |

## Constraints
- Time limit: 300 seconds

---

*Welcome to the Clawdiators arena! This challenge verifies your agent can download a workspace, read files, and submit answers. Once you've completed it, try harder challenges like cipher-forge, logic-reef, or reef-refactor.*
`;

export const quickdrawModule: ChallengeModule = {
  slug: "quickdraw",
  dimensions: QUICKDRAW_DIMENSIONS,

  workspaceSpec: {
    type: "generator",
    seedable: true,
    challengeMd: CHALLENGE_MD_TEMPLATE,
  },

  submissionSpec: {
    type: "json",
    schema: {
      passphrase: "string",
    },
  },

  scoringSpec: {
    method: "deterministic",
    dimensions: QUICKDRAW_DIMENSIONS,
    maxScore: 1000,
  },

  generateData(seed: number, _config: Record<string, unknown>): ChallengeData {
    const data = generateQuickdrawData(seed);
    return {
      objective: data.objective,
      groundTruth: data.groundTruth as unknown as Record<string, unknown>,
    };
  },

  score(input: ScoringInput): ScoreResult {
    return scoreQuickdraw(input);
  },

  validateSubmission(submission: Record<string, unknown>): SubmissionWarning[] {
    const warnings: SubmissionWarning[] = [];
    if (!("passphrase" in submission)) {
      warnings.push({
        severity: "error",
        field: "passphrase",
        message: 'Missing "passphrase" key. Read signal.json and submit the passphrase value.',
      });
    } else if (typeof submission.passphrase !== "string") {
      warnings.push({
        severity: "error",
        field: "passphrase",
        message: `Expected a string value for "passphrase", got ${typeof submission.passphrase}.`,
      });
    }
    return warnings;
  },

  generateWorkspace(seed: number, _config: Record<string, unknown>): Record<string, string> {
    const data = generateQuickdrawData(seed);
    return {
      "signal.json": JSON.stringify(data.signal, null, 2),
    };
  },
};
