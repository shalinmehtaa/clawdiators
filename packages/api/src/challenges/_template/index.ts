/**
 * Challenge: YOUR_CHALLENGE_NAME
 *
 * Copy this directory, rename it to your challenge slug, implement, then:
 *   1. Register in packages/api/src/challenges/registry.ts
 *   2. Add seed data in packages/db/src/seed.ts
 *   3. Run: pnpm --filter @clawdiators/api test
 *
 * See CONTRIBUTING.md for the full guide.
 */

import { dims } from "@clawdiators/shared";
import type { ChallengeModule } from "../types.js";
import { generateData } from "./data.js";
import { score } from "./scorer.js";

// TODO: Replace with your challenge's scoring dimensions.
// 7 core keys: correctness, completeness, precision, methodology, speed, code_quality, analysis
// Weights must sum to 1.0. See STANDARD_DIMENSIONS in packages/shared/src/constants.ts.
const DIMENSIONS = dims({
  correctness: 0.50,
  methodology: 0.25,
  speed: 0.15,
  completeness: 0.10,
});

const CHALLENGE_MD = `# Challenge: YOUR_CHALLENGE_NAME

## Objective

{{objective}}

## Workspace

TODO: Describe files in the workspace and what the agent should do.

## Submission Format

\`\`\`json
{
  "answer": "your answer here"
}
\`\`\`

## Scoring

| Dimension | Weight | Description |
|-----------|--------|-------------|
| Correctness  | 50%  | Accuracy of the answer |
| Methodology  | 25%  | Quality of approach |
| Speed        | 15%  | Time to submission |
| Completeness | 10%  | Coverage of all parts |

---
*Seed: {{seed}}*
`;

const mod: ChallengeModule = {
  slug: "your-challenge-slug", // TODO: Replace with your slug
  dimensions: DIMENSIONS,

  workspaceSpec: {
    type: "generator",
    seedable: true,
    challengeMd: CHALLENGE_MD,
    // For environment challenges with live services, change type to "environment" and uncomment:
    // services: {
    //   "my-api": {
    //     image: null,  // uses docker-compose.yml build
    //     healthEndpoint: "/health",
    //     port: 3000,
    //   },
    // },
    // mcpServers: {
    //   "my-mcp": {
    //     transport: "sse",
    //     tools: ["query_data", "get_status"],
    //     resources: ["data://current"],
    //   },
    // },
    // proxy: {
    //   allowedDomains: ["docs.myservice.internal"],
    //   rateLimit: 30,
    // },
  },

  submissionSpec: {
    type: "json",
    schema: { answer: "string" },
  },

  scoringSpec: {
    method: "deterministic",
    dimensions: DIMENSIONS,
    maxScore: 1000,
  },

  generateData(seed: number, _config: Record<string, unknown>) {
    return generateData(seed);
  },

  score(input) {
    return score(input);
  },

  generateWorkspace(seed: number, _config: Record<string, unknown>) {
    // TODO: Add workspace files the agent will work with.
    // Return a flat map of { "relative/path": "file contents" }.
    // CHALLENGE.md is injected automatically from workspaceSpec.challengeMd.
    return {
      "data.txt": `Seed: ${seed}\n`,
    };
  },
};

export default mod;
