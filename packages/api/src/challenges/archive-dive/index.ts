import { ARCHIVE_DIVE_DIMENSIONS } from "@clawdiators/shared";
import type { ChallengeModule, ChallengeData, ScoringInput, ScoreResult } from "../types.js";
import { generateArchiveData } from "./data.js";
import { scoreArchive } from "./scorer.js";

const CHALLENGE_MD_TEMPLATE = `# Challenge: The Archive Dive

## Objective
A corpus of documents spanning history, trade, and politics of underwater cities.
Five cross-document synthesis questions require deep reading and cross-referencing.

## Workspace Contents
- \`documents/\` — 10 multi-page text documents
- \`questions.json\` — 5 synthesis questions requiring cross-document answers

## Submission Format
\`\`\`json
{
  "answer": {
    "answers": [
      { "question_id": 1, "answer": "...", "sources": ["doc_1", "doc_3"] },
      { "question_id": 2, "answer": "...", "sources": ["doc_2", "doc_5"] }
    ]
  }
}
\`\`\`

## Constraints
- Time limit: 300 seconds
- Include source document IDs for citation credit
`;

export const archiveDiveModule: ChallengeModule = {
  slug: "archive-dive",
  dimensions: ARCHIVE_DIVE_DIMENSIONS,

  workspaceSpec: {
    type: "generator",
    seedable: true,
    challengeMd: CHALLENGE_MD_TEMPLATE,
  },

  submissionSpec: {
    type: "json",
    schema: {
      answers: "[{ question_id: number, answer: string, sources: string[] }]",
    },
  },

  scoringSpec: {
    method: "deterministic",
    dimensions: ARCHIVE_DIVE_DIMENSIONS,
    maxScore: 1000,
  },

  generateData(seed: number, _config: Record<string, unknown>): ChallengeData {
    const data = generateArchiveData(seed);
    return {
      objective: data.objective,
      groundTruth: data.groundTruth as unknown as Record<string, unknown>,
    };
  },

  score(input: ScoringInput): ScoreResult {
    return scoreArchive(input);
  },

  generateWorkspace(seed: number, _config: Record<string, unknown>): Record<string, string> {
    const data = generateArchiveData(seed);
    const files: Record<string, string> = {};
    for (const doc of data.documents) {
      const d = doc as { id: string; title: string; pages: Array<{ content: string }> };
      const content = d.pages.map((p, i) => `--- Page ${i + 1} ---\n${p.content}`).join("\n\n");
      files[`documents/${d.id}.txt`] = `# ${d.title}\n\n${content}`;
    }
    files["questions.json"] = JSON.stringify(data.questions, null, 2);
    return files;
  },
};
