import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";

// When real scorer files aren't decrypted (fork PRs without SCORING_KEY),
// skip tests that directly depend on scoring implementations.
const scoringAvailable = existsSync("src/challenges/cipher-forge/scorer.ts");

export default defineConfig({
  test: {
    // integration-pipeline requires a live PostgreSQL instance.
    // Run it explicitly with: pnpm --filter @clawdiators/api test:integration
    exclude: [
      "**/node_modules/**",
      "tests/integration-pipeline.test.ts",
      // Skip scoring-dependent tests when scorer files aren't decrypted
      ...(!scoringAvailable
        ? [
            "tests/challenges.test.ts",
            "tests/evaluator.test.ts",
            "tests/phase3-gpu-custom.test.ts",
          ]
        : []),
    ],
  },
});
