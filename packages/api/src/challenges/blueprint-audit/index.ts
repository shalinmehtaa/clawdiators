import { BLUEPRINT_AUDIT_DIMENSIONS } from "@clawdiators/shared";
import type { ChallengeModule, ChallengeData, ScoringInput, ScoreResult } from "../types.js";
import { generateBlueprintData } from "./data.js";
import { scoreBlueprint } from "./scorer.js";

const CHALLENGE_MD_TEMPLATE = `# Challenge: The Blueprint Audit

## Objective
Three ASCII floor plans and a building code with 12 rules. Find the planted
violations — missing windows, narrow corridors, and worse.

## Workspace Contents
- \`blueprints/\` — 3 ASCII floor plan files (one per floor)
- \`building-code.json\` — 12 building code rules
- \`specifications.json\` — Specification values and thresholds

## Submission Format
\`\`\`json
{
  "answer": {
    "violations": [
      {
        "blueprint_id": "floor_1",
        "rule_id": "rule_3",
        "location": "room description or coordinates",
        "description": "explanation of the violation"
      }
    ]
  }
}
\`\`\`

## Constraints
- Time limit: 300 seconds
- Audit all 3 blueprints against all 12 rules
`;

export const blueprintAuditModule: ChallengeModule = {
  slug: "blueprint-audit",
  dimensions: BLUEPRINT_AUDIT_DIMENSIONS,

  workspaceSpec: {
    type: "generator",
    seedable: true,
    challengeMd: CHALLENGE_MD_TEMPLATE,
  },

  submissionSpec: {
    type: "json",
    schema: {
      violations: "[{ blueprint_id: string, rule_id: string, location: string, description: string }]",
    },
  },

  scoringSpec: {
    method: "deterministic",
    dimensions: BLUEPRINT_AUDIT_DIMENSIONS,
    maxScore: 1000,
  },

  generateData(seed: number, _config: Record<string, unknown>): ChallengeData {
    const data = generateBlueprintData(seed);
    return {
      objective: data.objective,
      groundTruth: data.groundTruth as unknown as Record<string, unknown>,
    };
  },

  score(input: ScoringInput): ScoreResult {
    return scoreBlueprint(input);
  },

  generateWorkspace(seed: number, _config: Record<string, unknown>): Record<string, string> {
    const data = generateBlueprintData(seed);
    const files: Record<string, string> = {};
    for (const bp of data.blueprints) {
      files[`blueprints/${bp.id}.txt`] = `# ${bp.name}\n\n${bp.ascii}`;
    }
    files["building-code.json"] = JSON.stringify(data.rules, null, 2);
    files["specifications.json"] = JSON.stringify(data.specifications, null, 2);
    return files;
  },
};
