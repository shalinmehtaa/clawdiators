import { CHART_FORENSICS_DIMENSIONS } from "@clawdiators/shared";
import type { ChallengeModule, ChallengeData, ScoringInput, ScoreResult } from "../types.js";
import { generateForensicsData } from "./data.js";
import { scoreForensics } from "./scorer.js";

const CHALLENGE_MD_TEMPLATE = `# Challenge: Chart Forensics

## Objective
Five data tables and five SVG charts. Some charts misrepresent their data — wrong heights,
swapped labels, misleading scales. Find the lies.

## Workspace Contents
- \`data/\` — 5 JSON files with source data tables
- \`charts/\` — 5 SVG chart files with metadata
- \`descriptions/\` — Text descriptions of each chart

## Submission Format
\`\`\`json
{
  "answer": {
    "findings": [
      {
        "chart_id": "chart_1",
        "discrepancy": "description of the misrepresentation",
        "correct_value": "what the chart should show"
      }
    ]
  }
}
\`\`\`

## Constraints
- Time limit: 180 seconds
- Compare each chart against its source data
`;

export const chartForensicsModule: ChallengeModule = {
  slug: "chart-forensics",
  dimensions: CHART_FORENSICS_DIMENSIONS,

  workspaceSpec: {
    type: "generator",
    seedable: true,
    challengeMd: CHALLENGE_MD_TEMPLATE,
  },

  submissionSpec: {
    type: "json",
    schema: {
      findings: "[{ chart_id: string, discrepancy: string, correct_value: string }]",
    },
  },

  scoringSpec: {
    method: "deterministic",
    dimensions: CHART_FORENSICS_DIMENSIONS,
    maxScore: 1000,
  },

  generateData(seed: number, _config: Record<string, unknown>): ChallengeData {
    const data = generateForensicsData(seed);
    return {
      objective: data.objective,
      groundTruth: data.groundTruth as unknown as Record<string, unknown>,
    };
  },

  score(input: ScoringInput): ScoreResult {
    return scoreForensics(input);
  },

  generateWorkspace(seed: number, _config: Record<string, unknown>): Record<string, string> {
    const data = generateForensicsData(seed);
    const files: Record<string, string> = {};
    for (const t of data.tables) {
      files[`data/${t.id}.json`] = JSON.stringify(t, null, 2);
    }
    for (const ch of data.charts) {
      files[`charts/${ch.id}.svg`] = ch.svg;
      files[`charts/${ch.id}.meta.json`] = JSON.stringify(
        { id: ch.id, table_id: ch.table_id, chart_type: ch.chart_type },
        null, 2,
      );
    }
    for (const ch of data.charts) {
      files[`descriptions/${ch.id}.txt`] = ch.description;
    }
    return files;
  },
};
