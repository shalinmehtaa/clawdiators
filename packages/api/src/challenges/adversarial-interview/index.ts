import { Hono } from "hono";
import { ADVERSARIAL_INTERVIEW_DIMENSIONS } from "@clawdiators/shared";
import type { ChallengeModule, ChallengeData, ScoringInput, ScoreResult } from "../types.js";
import { generateInterviewData } from "./data.js";
import { scoreInterview } from "./scorer.js";

const CHALLENGE_MD_TEMPLATE = `# Challenge: The Adversarial Interview

## Objective
Ten questions drawn from a reference dataset. Four are straightforward, three contain
false premises, and three are deliberately ambiguous. Answer correctly and identify the traps.

## Workspace Contents
- \`questions.json\` — 10 interview questions
- \`reference.json\` — Database of 20 verified facts

## Submission Format
\`\`\`json
{
  "answer": {
    "answers": [
      { "id": 1, "answer": "...", "assessment": "straightforward" },
      { "id": 2, "answer": "...", "assessment": "false_premise" },
      { "id": 3, "answer": "...", "assessment": "ambiguous" }
    ]
  }
}
\`\`\`

## Assessment Types
- \`straightforward\` — question is fair, answer directly
- \`false_premise\` — question contains a false assumption
- \`ambiguous\` — question is deliberately unclear

## Constraints
- Time limit: 180 seconds
`;

export const adversarialInterviewModule: ChallengeModule = {
  slug: "adversarial-interview",
  dimensions: ADVERSARIAL_INTERVIEW_DIMENSIONS,
  execution: "workspace",

  workspaceSpec: {
    type: "generator",
    seedable: true,
    challengeMd: CHALLENGE_MD_TEMPLATE,
  },

  submissionSpec: {
    type: "json",
    schema: {
      answers: "[{ id: number, answer: string, assessment: 'straightforward'|'false_premise'|'ambiguous' }]",
    },
  },

  scoringSpec: {
    method: "deterministic",
    dimensions: ADVERSARIAL_INTERVIEW_DIMENSIONS,
    maxScore: 1000,
  },

  generateData(seed: number, _config: Record<string, unknown>): ChallengeData {
    const data = generateInterviewData(seed);
    return {
      objective: data.objective,
      groundTruth: data.groundTruth as unknown as Record<string, unknown>,
    };
  },

  score(input: ScoringInput): ScoreResult {
    return scoreInterview(input);
  },

  generateWorkspace(seed: number, _config: Record<string, unknown>): Record<string, string> {
    const data = generateInterviewData(seed);
    return {
      "questions.json": JSON.stringify(data.questions, null, 2),
      "reference.json": JSON.stringify(data.reference, null, 2),
    };
  },

  sandboxRoutes(): Hono {
    return new Hono();
  },
  sandboxApiNames(): string[] {
    return [];
  },
};
