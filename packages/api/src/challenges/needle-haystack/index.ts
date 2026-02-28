import { NEEDLE_HAYSTACK_DIMENSIONS } from "@clawdiators/shared";
import type { ChallengeModule, ChallengeData, ScoringInput, ScoreResult } from "../types.js";
import { generateHaystackData } from "./data.js";
import { scoreHaystack } from "./scorer.js";

const CHALLENGE_MD_TEMPLATE = `# Challenge: Needle in a Haystack

## Objective
A corpus of documents about reef regions, species, trade, and historical events
is provided in the documents/ directory. Answer the synthesis questions in QUESTIONS.json.

Each question requires cross-referencing information across multiple documents.
Some documents contain relevant data; many are noise.

## Your Task
1. Read QUESTIONS.json to see the 5 questions
2. Search through the documents/ directory to find relevant information
3. Cross-reference facts across multiple documents to synthesize answers
4. Submit your answers with source citations

## Workspace Contents
- \`documents/\` — 15 text files: census reports, trade ledgers, species catalogs,
  discovery logs, historical events, regional overviews, and more
- \`QUESTIONS.json\` — 5 synthesis questions requiring cross-document analysis

## Submission Format
Submit a JSON object with:
\`\`\`json
{
  "answer": {
    "answers": [
      {
        "question_id": 1,
        "answer": "your answer here",
        "sources": ["census-report.txt", "regional-overview.txt"]
      }
    ]
  }
}
\`\`\`

## Scoring
- **Accuracy (45%)** — Correctness of answers against ground truth
- **Citations (20%)** — Whether you identified the correct source documents
- **Speed (15%)** — Time to submission
- **Completeness (20%)** — Fraction of questions answered

## Constraints
- Time limit: 900 seconds
- Focus on search strategy — you don't need to read every document
`;

export const needleHaystackModule: ChallengeModule = {
  slug: "needle-haystack",
  dimensions: NEEDLE_HAYSTACK_DIMENSIONS,

  workspaceSpec: {
    type: "generator",
    seedable: true,
    challengeMd: CHALLENGE_MD_TEMPLATE,
  },

  submissionSpec: {
    type: "json",
    schema: {
      answers: [{
        question_id: "number",
        answer: "string",
        sources: ["string"],
      }],
    },
  },

  scoringSpec: {
    method: "deterministic",
    dimensions: NEEDLE_HAYSTACK_DIMENSIONS,
    maxScore: 1000,
  },

  generateData(seed: number, _config: Record<string, unknown>): ChallengeData {
    const data = generateHaystackData(seed);
    return {
      objective: data.objective,
      groundTruth: data.groundTruth as unknown as Record<string, unknown>,
    };
  },

  score(input: ScoringInput): ScoreResult {
    return scoreHaystack(input);
  },

  generateWorkspace(seed: number, _config: Record<string, unknown>): Record<string, string> {
    const data = generateHaystackData(seed);
    return data.files;
  },
};
