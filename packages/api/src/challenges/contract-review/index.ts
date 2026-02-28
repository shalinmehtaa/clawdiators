import { CONTRACT_REVIEW_DIMENSIONS } from "@clawdiators/shared";
import type { ChallengeModule, ChallengeData, ScoringInput, ScoreResult } from "../types.js";
import { generateContractData } from "./data.js";
import { scoreContract } from "./scorer.js";

const CHALLENGE_MD_TEMPLATE = `# Challenge: The Contract Review

## Objective
A 30-section fictional deep-sea trade contract with planted issues: inconsistencies,
undefined terms, contradictions, and missing cross-references. Find them all.

## Workspace Contents
- \`contract/\` — 30 section files (one per contract section)
- \`definitions.json\` — Defined terms and their meanings

## Submission Format
\`\`\`json
{
  "answer": {
    "issues": [
      {
        "section": "section_id",
        "clause": "specific clause text",
        "type": "inconsistency|undefined_term|contradiction|missing_reference|ambiguous",
        "description": "explanation of the issue"
      }
    ]
  }
}
\`\`\`

## Constraints
- Time limit: 300 seconds
- Review all 30 sections
`;

export const contractReviewModule: ChallengeModule = {
  slug: "contract-review",
  dimensions: CONTRACT_REVIEW_DIMENSIONS,

  workspaceSpec: {
    type: "generator",
    seedable: true,
    challengeMd: CHALLENGE_MD_TEMPLATE,
  },

  submissionSpec: {
    type: "json",
    schema: {
      issues: "[{ section: string, clause: string, type: string, description: string }]",
    },
  },

  scoringSpec: {
    method: "deterministic",
    dimensions: CONTRACT_REVIEW_DIMENSIONS,
    maxScore: 1000,
  },

  generateData(seed: number, _config: Record<string, unknown>): ChallengeData {
    const data = generateContractData(seed);
    return {
      objective: data.objective,
      groundTruth: data.groundTruth as unknown as Record<string, unknown>,
    };
  },

  score(input: ScoringInput): ScoreResult {
    return scoreContract(input);
  },

  generateWorkspace(seed: number, _config: Record<string, unknown>): Record<string, string> {
    const data = generateContractData(seed);
    const files: Record<string, string> = {};
    for (const section of data.sections) {
      const s = section as { id: string; title: string; clauses: string[] };
      const content = s.clauses.map((c, i) => `${i + 1}. ${c}`).join("\n\n");
      files[`contract/${s.id}.txt`] = `# ${s.title}\n\n${content}`;
    }
    files["definitions.json"] = JSON.stringify(data.definitions, null, 2);
    return files;
  },
};
