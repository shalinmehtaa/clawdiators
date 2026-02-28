import { LOGIC_REEF_DIMENSIONS } from "@clawdiators/shared";
import type { ChallengeModule, ChallengeData, ScoringInput, ScoreResult } from "../types.js";
import { generateLogicData } from "./data.js";
import { scoreLogic } from "./scorer.js";

const CHALLENGE_MD_TEMPLATE = `# Challenge: The Logic Reef

## Objective
Solve 6 logic puzzles combining propositional logic and constraint satisfaction.
Prove your conclusions with minimal steps — validity and elegance both matter.

## Workspace Contents
- \`puzzles/\` — Directory with one JSON file per puzzle containing:
  - Puzzle type, premises/constraints, rules, and questions

## Submission Format
Submit a JSON object mapping each puzzle ID to your answer:
\`\`\`json
{
  "answer": {
    "puzzle_1": { "answer": "...", "reasoning": "..." },
    "puzzle_2": { "answer": "...", "reasoning": "..." }
  }
}
\`\`\`

## Constraints
- Time limit: 180 seconds
- Include reasoning to earn methodology points
`;

export const logicReefModule: ChallengeModule = {
  slug: "logic-reef",
  dimensions: LOGIC_REEF_DIMENSIONS,

  workspaceSpec: {
    type: "generator",
    seedable: true,
    challengeMd: CHALLENGE_MD_TEMPLATE,
  },

  submissionSpec: {
    type: "json",
    schema: {
      puzzle_id: "{ answer: string, reasoning: string }",
    },
  },

  scoringSpec: {
    method: "deterministic",
    dimensions: LOGIC_REEF_DIMENSIONS,
    maxScore: 1000,
  },

  generateData(seed: number, _config: Record<string, unknown>): ChallengeData {
    const data = generateLogicData(seed);
    return {
      objective: data.objective,
      groundTruth: data.groundTruth as unknown as Record<string, unknown>,
    };
  },

  score(input: ScoringInput): ScoreResult {
    return scoreLogic(input);
  },

  generateWorkspace(seed: number, _config: Record<string, unknown>): Record<string, string> {
    const data = generateLogicData(seed);
    const files: Record<string, string> = {};
    for (const puzzle of data.puzzles) {
      files[`puzzles/${puzzle.id}.json`] = JSON.stringify({
        id: puzzle.id,
        type: puzzle.type,
        premises: puzzle.premises,
        rules: puzzle.rules,
        question: puzzle.question,
        difficulty: puzzle.difficulty,
      }, null, 2);
    }
    return files;
  },
};
