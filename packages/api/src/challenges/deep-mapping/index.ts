import { DEEP_MAPPING_DIMENSIONS } from "@clawdiators/shared";
import type { ChallengeModule, ChallengeData, ScoringInput, ScoreResult } from "../types.js";
import { generateMappingData } from "./data.js";
import { scoreMapping } from "./scorer.js";

const CHALLENGE_MD_TEMPLATE = `# Challenge: The Deep Mapping Expedition

## Objective
Explore a procedural ocean floor graph. Discover nodes, find resources, and map
optimal paths through the territory.

## Workspace Contents
- \`map/\` — Node files as JSON, each revealing connections to neighbors
- \`start.json\` — Starting node with initial connections

## How to Explore
Read node files to discover their connections and resources. Each node file contains:
- Node ID, depth, resources, and connections to neighboring nodes
- Neighboring node filenames that you can read to continue exploration

## Submission Format
\`\`\`json
{
  "answer": {
    "explored_nodes": ["node_1", "node_2", ...],
    "resources": { "type": count, ... },
    "best_path": ["node_a", "node_b", ...],
    "total_value": 1234
  }
}
\`\`\`

## Constraints
- Time limit: 3600 seconds (1 hour)
- Explore by reading node files — each file reveals neighboring connections
`;

export const deepMappingModule: ChallengeModule = {
  slug: "deep-mapping",
  dimensions: DEEP_MAPPING_DIMENSIONS,

  workspaceSpec: {
    type: "generator",
    seedable: true,
    challengeMd: CHALLENGE_MD_TEMPLATE,
  },

  submissionSpec: {
    type: "json",
    schema: {
      explored_nodes: "string[]",
      resources: "Record<string, number>",
      best_path: "string[]",
      total_value: "number",
    },
  },

  scoringSpec: {
    method: "deterministic",
    dimensions: DEEP_MAPPING_DIMENSIONS,
    maxScore: 1000,
  },

  generateData(seed: number, _config: Record<string, unknown>): ChallengeData {
    const data = generateMappingData(seed);
    return {
      objective: data.objective,
      groundTruth: data.groundTruth as unknown as Record<string, unknown>,
    };
  },

  score(input: ScoringInput): ScoreResult {
    return scoreMapping(input);
  },

  generateWorkspace(seed: number, _config: Record<string, unknown>): Record<string, string> {
    const data = generateMappingData(seed);
    const files: Record<string, string> = {};
    // Start file shows the first node
    const startNode = data.nodes[0];
    files["start.json"] = JSON.stringify({
      start_node: startNode.id,
      message: "Begin your expedition from this node. Read map files to explore.",
    }, null, 2);
    // Each node as a separate file
    for (const node of data.nodes) {
      files[`map/${node.id}.json`] = JSON.stringify({
        id: node.id,
        depth: node.depth,
        resource: node.resource,
        resource_value: node.resourceValue,
        connections: node.connections,
      }, null, 2);
    }
    return files;
  },
};
