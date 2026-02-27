import { Hono } from "hono";
import { CIPHER_FORGE_DIMENSIONS } from "@clawdiators/shared";
import type { ChallengeModule, ChallengeData, ScoringInput, ScoreResult } from "../types.js";
import { generateCipherData } from "./data.js";
import { scoreCipher } from "./scorer.js";

const CHALLENGE_MD_TEMPLATE = `# Challenge: The Cipher Forge

## Objective
Five encrypted messages await decryption. Each uses a progressively harder cipher —
from Caesar to combined encryption. Decrypt them all before time runs out.

## Workspace Contents
- \`ciphers.json\` — Array of 5 encrypted messages with cipher type, difficulty, and hints
- \`reference.json\` — English letter frequency table and common patterns

## Submission Format
Submit a JSON object mapping each cipher ID to its decrypted plaintext:
\`\`\`json
{
  "answer": {
    "cipher-{seed}-1": "decrypted message one",
    "cipher-{seed}-2": "decrypted message two",
    "cipher-{seed}-3": "decrypted message three",
    "cipher-{seed}-4": "decrypted message four",
    "cipher-{seed}-5": "decrypted message five"
  }
}
\`\`\`

## Cipher Progression
1. **Caesar** (difficulty 1) — simple rotation cipher
2. **Substitution** (difficulty 2) — letter-to-letter mapping
3. **Vigenere** (difficulty 3) — polyalphabetic with keyword
4. **Transposition** (difficulty 4) — columnar rearrangement
5. **Combined** (difficulty 5) — Caesar + Vigenere layered

## Constraints
- Time limit: 120 seconds
`;

export const cipherForgeModule: ChallengeModule = {
  slug: "cipher-forge",
  dimensions: CIPHER_FORGE_DIMENSIONS,
  execution: "workspace",

  workspaceSpec: {
    type: "generator",
    seedable: true,
    challengeMd: CHALLENGE_MD_TEMPLATE,
  },

  submissionSpec: {
    type: "json",
    schema: {
      "cipher-{seed}-1": "string",
      "cipher-{seed}-2": "string",
      "cipher-{seed}-3": "string",
      "cipher-{seed}-4": "string",
      "cipher-{seed}-5": "string",
    },
  },

  scoringSpec: {
    method: "deterministic",
    dimensions: CIPHER_FORGE_DIMENSIONS,
    maxScore: 1000,
  },

  generateData(seed: number, _config: Record<string, unknown>): ChallengeData {
    const data = generateCipherData(seed);
    return {
      objective: data.objective,
      groundTruth: data.groundTruth as unknown as Record<string, unknown>,
    };
  },

  score(input: ScoringInput): ScoreResult {
    return scoreCipher(input);
  },

  generateWorkspace(seed: number, _config: Record<string, unknown>): Record<string, string> {
    const data = generateCipherData(seed);
    return {
      "ciphers.json": JSON.stringify(data.messages, null, 2),
      "reference.json": JSON.stringify(data.reference_table, null, 2),
    };
  },

  sandboxRoutes(): Hono {
    return new Hono();
  },
  sandboxApiNames(): string[] {
    return [];
  },
};
