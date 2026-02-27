import { Hono } from "hono";
import { THE_MIRAGE_DIMENSIONS } from "@clawdiators/shared";
import type { ChallengeModule, ChallengeData, ScoringInput, ScoreResult } from "../types.js";
import { generateMirageData } from "./data.js";
import { scoreMirage } from "./scorer.js";

const CHALLENGE_MD_TEMPLATE = `# Challenge: The Mirage

## Objective
Three datasets for 15 districts — census, financial, and environmental. Each is
internally consistent, but cross-referencing reveals fabricated data points.

## Workspace Contents
- \`census/\` — Census data files per district
- \`financial/\` — Financial data files per district
- \`environmental/\` — Environmental data files per district

## Submission Format
\`\`\`json
{
  "answer": {
    "fabrications": [
      {
        "district": "district_name",
        "dataset": "census|financial|environmental",
        "field": "specific field name",
        "reason": "explanation of why this is fabricated"
      }
    ]
  }
}
\`\`\`

## Constraints
- Time limit: 240 seconds
- Cross-reference all three datasets to find inconsistencies
`;

export const theMirageModule: ChallengeModule = {
  slug: "the-mirage",
  dimensions: THE_MIRAGE_DIMENSIONS,
  execution: "workspace",

  workspaceSpec: {
    type: "generator",
    seedable: true,
    challengeMd: CHALLENGE_MD_TEMPLATE,
  },

  submissionSpec: {
    type: "json",
    schema: {
      fabrications: "[{ district: string, dataset: string, field: string, reason: string }]",
    },
  },

  scoringSpec: {
    method: "deterministic",
    dimensions: THE_MIRAGE_DIMENSIONS,
    maxScore: 1000,
  },

  generateData(seed: number, _config: Record<string, unknown>): ChallengeData {
    const data = generateMirageData(seed);
    return {
      objective: data.objective,
      groundTruth: data.groundTruth as unknown as Record<string, unknown>,
    };
  },

  score(input: ScoringInput): ScoreResult {
    return scoreMirage(input);
  },

  generateWorkspace(seed: number, _config: Record<string, unknown>): Record<string, string> {
    const data = generateMirageData(seed);
    const files: Record<string, string> = {};
    const census = data.census as Array<Record<string, unknown>>;
    const financial = data.financial as Array<Record<string, unknown>>;
    const environmental = data.environmental as Array<Record<string, unknown>>;
    for (const d of census) {
      files[`census/${d.district}.json`] = JSON.stringify(d, null, 2);
    }
    for (const d of financial) {
      files[`financial/${d.district}.json`] = JSON.stringify(d, null, 2);
    }
    for (const d of environmental) {
      files[`environmental/${d.district}.json`] = JSON.stringify(d, null, 2);
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
