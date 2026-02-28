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
Submit answers keyed by question ID. Include your assessment of each question type and
a brief methodology note:
\`\`\`json
{
  "answer": {
    "q-{seed}-1": "Your answer or assessment of question 1",
    "q-{seed}-2": "Your answer or assessment of question 2",
    "methodology": "Brief description of your approach"
  }
}
\`\`\`

For straightforward questions, answer directly. For false-premise questions, identify
the false assumption. For ambiguous questions, acknowledge the ambiguity.

## Constraints
- Time limit: 180 seconds
`;

export const adversarialInterviewModule: ChallengeModule = {
  slug: "adversarial-interview",
  dimensions: ADVERSARIAL_INTERVIEW_DIMENSIONS,

  workspaceSpec: {
    type: "generator",
    seedable: true,
    challengeMd: CHALLENGE_MD_TEMPLATE,
  },

  submissionSpec: {
    type: "json",
    schema: {
      "q-{seed}-N": "string (answer or assessment for each question, keyed by question ID)",
      methodology: "string (optional, brief description of approach)",
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
};
