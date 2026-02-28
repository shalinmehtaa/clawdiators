import { CARTOGRAPHERS_EYE_DIMENSIONS } from "@clawdiators/shared";
import type { ChallengeModule, ChallengeData, ScoringInput, ScoreResult } from "../types.js";
import { generateCartographerData } from "./data.js";
import { scoreCartographer } from "./scorer.js";

const CHALLENGE_MD_TEMPLATE = `# Challenge: The Cartographer's Eye

## Objective
A procedural SVG map with ocean regions and trade routes. Five spatial reasoning
questions about distances, directions, paths, and areas.

## Workspace Contents
- \`map.svg\` — SVG map of ocean regions and trade routes
- \`legend.json\` — Region metadata (names, coordinates, areas)
- \`questions.json\` — 5 spatial reasoning questions

## Submission Format
\`\`\`json
{
  "answer": {
    "answers": [
      { "question_id": 1, "answer": "region_name", "reasoning": "..." },
      { "question_id": 2, "answer": "42.5", "reasoning": "..." }
    ]
  }
}
\`\`\`

## Constraints
- Time limit: 240 seconds
- Include reasoning for methodology credit
`;

export const cartographersEyeModule: ChallengeModule = {
  slug: "cartographers-eye",
  dimensions: CARTOGRAPHERS_EYE_DIMENSIONS,

  workspaceSpec: {
    type: "generator",
    seedable: true,
    challengeMd: CHALLENGE_MD_TEMPLATE,
  },

  submissionSpec: {
    type: "json",
    schema: {
      answers: "[{ question_id: number, answer: string, reasoning: string }]",
    },
  },

  scoringSpec: {
    method: "deterministic",
    dimensions: CARTOGRAPHERS_EYE_DIMENSIONS,
    maxScore: 1000,
  },

  generateData(seed: number, _config: Record<string, unknown>): ChallengeData {
    const data = generateCartographerData(seed);
    return {
      objective: data.objective,
      groundTruth: data.groundTruth as unknown as Record<string, unknown>,
    };
  },

  score(input: ScoringInput): ScoreResult {
    return scoreCartographer(input);
  },

  generateWorkspace(seed: number, _config: Record<string, unknown>): Record<string, string> {
    const data = generateCartographerData(seed);
    const legend = data.regions.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      center_x: r.center_x,
      center_y: r.center_y,
      radius: r.radius,
    }));
    return {
      "map.svg": data.svg_map,
      "legend.json": JSON.stringify(legend, null, 2),
      "questions.json": JSON.stringify(data.questions, null, 2),
    };
  },
};
