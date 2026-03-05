/**
 * Code-based Challenge Adapter — wraps community-submitted JS code files
 * into a ChallengeModule, executing them in Docker containers.
 *
 * Code files: data.js (required), scorer.js (required), workspace.js, validator.js, helpers.js
 * All executed with mulberry32 PRNG in sandboxed Docker containers.
 */
import type { ChallengeModule, ChallengeData, ScoringInput, ScoreResult, SubmissionWarning } from "../types.js";
import type { CommunitySpec, CodeFiles } from "./validator.js";
import { generateLLMJudgeInlineScript } from "./llm-judge.js";
import { generateBenchmarkInlineScript } from "./benchmark.js";
import { generateDataInDocker, scoreInDocker, executeCodeInDocker } from "../docker-evaluator.js";

/** Mulberry32 PRNG source — inlined into every code execution context. */
const MULBERRY32_SOURCE = `
function rng(seed) {
  let s = seed | 0;
  return function() {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
`;

/**
 * Build the full source for a code file, prepending helpers and the rng global.
 */
function buildSource(mainCode: string, helpersCode?: string): string {
  const parts = [MULBERRY32_SOURCE];
  if (helpersCode) {
    parts.push(`// --- helpers.js ---\n${helpersCode}`);
  }
  parts.push(`// --- main ---\n${mainCode}`);
  return parts.join("\n\n");
}

/** Options for createCodeModule. */
export interface CreateCodeModuleOpts {
  cachedAssets?: Record<string, unknown>;
}

/**
 * Build a self-contained evaluator wrapper script for Tier 2+ challenges.
 * This script is executed inside Docker with network access (and optionally LLM judge).
 * It inlines: mulberry32 PRNG, helpers.js, scorer.js, and reads submission/ground-truth from /workspace.
 */
function buildTier2EvaluatorWrapper(spec: CommunitySpec): string {
  const codeFiles = spec.codeFiles!;
  const helpersCode = codeFiles["helpers.js"] ?? "";
  const scorerCode = codeFiles["scorer.js"];

  const parts: string[] = [];

  // Header
  parts.push(`"use strict";`);
  parts.push(`var fs = require("fs");`);
  parts.push(``);

  // Inline mulberry32 PRNG
  parts.push(MULBERRY32_SOURCE);

  // Inline helpers
  if (helpersCode) {
    parts.push(`// --- helpers.js ---`);
    parts.push(helpersCode);
    parts.push(``);
  }

  // Note: GPU/custom tier benchmark utilities removed (tier system removed).
  // PR challenges with GPU needs use Docker Compose directly.

  // Inline LLM judge if judgeModel is set
  if (spec.scoring.judgeModel) {
    parts.push(generateLLMJudgeInlineScript(
      spec.scoring.judgeModel,
      spec.scoring.rubric ?? "Score the response quality on correctness, completeness, and clarity.",
    ));
    parts.push(``);
  }

  // Inline scorer
  parts.push(`// --- scorer.js ---`);
  parts.push(scorerCode);
  parts.push(``);

  // Main: read files and call score()
  parts.push(`// --- evaluator main ---`);
  parts.push(`(async function() {`);
  parts.push(`  try {`);
  parts.push(`    var submission = JSON.parse(fs.readFileSync("/workspace/submission.json", "utf-8"));`);
  parts.push(`    var groundTruth = JSON.parse(fs.readFileSync("/workspace/ground-truth.json", "utf-8"));`);
  parts.push(`    var startedAt = process.env.STARTED_AT || new Date().toISOString();`);
  parts.push(`    var submittedAt = process.env.SUBMITTED_AT || new Date().toISOString();`);
  parts.push(`    var apiCallCount = parseInt(process.env.API_CALL_COUNT || "0", 10);`);
  parts.push(`    var checkpoints = process.env.CHECKPOINTS ? JSON.parse(process.env.CHECKPOINTS) : [];`);
  parts.push(`    var input = {`);
  parts.push(`      submission: submission,`);
  parts.push(`      groundTruth: groundTruth,`);
  parts.push(`      startedAt: startedAt,`);
  parts.push(`      submittedAt: submittedAt,`);
  parts.push(`      apiCallCount: apiCallCount,`);
  parts.push(`      checkpoints: checkpoints,`);
  parts.push(`    };`);
  parts.push(`    var scoreFn = module.exports.score || exports.score;`);
  parts.push(`    var result = await Promise.resolve(scoreFn(input));`);
  parts.push(`    console.log(JSON.stringify({ scores: result.breakdown }));`);
  parts.push(`  } catch (err) {`);
  parts.push(`    console.error("Evaluator error:", err.message || err);`);
  parts.push(`    console.log(JSON.stringify({ scores: {}, error: String(err.message || err) }));`);
  parts.push(`    process.exit(1);`);
  parts.push(`  }`);
  parts.push(`})();`);

  return parts.join("\n");
}

/**
 * Create a ChallengeModule from community-submitted code files.
 * Executes data.js / scorer.js / workspace.js in Docker containers.
 *
 * For Tier 2+ (networked/gpu/custom), also generates a self-contained evaluator
 * wrapper script that runs inside Docker with appropriate isolation.
 */
export function createCodeModule(spec: CommunitySpec, opts?: CreateCodeModuleOpts): ChallengeModule {
  const codeFiles = spec.codeFiles!;
  const helpersCode = codeFiles["helpers.js"];
  const cachedAssets = opts?.cachedAssets;

  // API-submitted challenges always use sandboxed evaluation
  const evaluatorScript = spec.scoring.evaluator;

  return {
    slug: spec.slug,
    dimensions: spec.scoring.dimensions,

    workspaceSpec: {
      type: spec.workspace.type,
      seedable: spec.workspace.seedable,
      challengeMd: spec.workspace.challengeMd,
    },

    submissionSpec: {
      type: spec.submission.type,
      schema: spec.submission.schema,
      files: spec.submission.files,
      command: spec.submission.command,
    },

    scoringSpec: {
      method: "custom-script",
      dimensions: spec.scoring.dimensions,
      maxScore: spec.scoring.maxScore,
      evaluator: evaluatorScript,
      runtime: spec.scoring.runtime,
      judgeModel: spec.scoring.judgeModel,
      rubric: spec.scoring.rubric,
    },

    async generateData(seed: number, _config: Record<string, unknown>): Promise<ChallengeData> {
      const source = buildSource(codeFiles["data.js"], helpersCode);
      return generateDataInDocker(source, seed, cachedAssets);
    },

    async score(input: ScoringInput): Promise<ScoreResult> {
      const source = buildSource(codeFiles["scorer.js"], helpersCode);
      return scoreInDocker(source, input, spec.scoring.maxScore, cachedAssets);
    },

    async validateSubmission(submission: Record<string, unknown>, groundTruth: Record<string, unknown>): Promise<SubmissionWarning[]> {
      if (!codeFiles["validator.js"]) return [];

      const source = buildSource(codeFiles["validator.js"], helpersCode);

      const script = [
        `"use strict";`,
        source,
        ``,
        `var validateFn = module.exports.validate || exports.validate;`,
        `if (typeof validateFn !== "function") {`,
        `  console.log(JSON.stringify([]));`,
        `} else {`,
        `  try {`,
        `    var result = validateFn(${JSON.stringify(submission)}, ${JSON.stringify(groundTruth)});`,
        `    console.log(JSON.stringify(Array.isArray(result) ? result : []));`,
        `  } catch(e) {`,
        `    console.log(JSON.stringify([]));`,
        `  }`,
        `}`,
      ].join("\n");

      try {
        const { stdout } = await executeCodeInDocker(script, 10);
        const lines = stdout.trim().split("\n");
        for (let i = lines.length - 1; i >= 0; i--) {
          try {
            const parsed = JSON.parse(lines[i]);
            if (Array.isArray(parsed)) {
              return parsed.filter(
                (w: any) => w && typeof w.severity === "string" && typeof w.field === "string" && typeof w.message === "string",
              );
            }
          } catch {
            // Not valid JSON
          }
        }
      } catch {
        // Validator failure is non-fatal
      }
      return [];
    },

    async generateWorkspace(seed: number, _config: Record<string, unknown>): Promise<Record<string, string>> {
      if (codeFiles["workspace.js"]) {
        const dataSource = buildSource(codeFiles["data.js"], helpersCode);
        const wsSource = buildSource(codeFiles["workspace.js"], helpersCode);

        const script = [
          `"use strict";`,
          dataSource,
          ``,
          wsSource,
          ``,
          `var genWorkspace = module.exports.generateWorkspace || exports.generateWorkspace;`,
          `if (typeof genWorkspace !== "function") {`,
          `  console.error("workspace.js must export a generateWorkspace(seed) function");`,
          `  process.exit(1);`,
          `}`,
          cachedAssets ? `var CACHED_ASSETS = ${JSON.stringify(cachedAssets)};` : ``,
          `var files = genWorkspace(${seed});`,
          `console.log(JSON.stringify(files));`,
        ].join("\n");

        const { stdout, exitCode } = await executeCodeInDocker(script, 10);
        if (exitCode !== 0) {
          throw new Error(`generateWorkspace failed with exit code ${exitCode}`);
        }

        const lines = stdout.trim().split("\n");
        for (let i = lines.length - 1; i >= 0; i--) {
          try {
            const parsed = JSON.parse(lines[i]);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
              return parsed;
            }
          } catch {
            // Not valid JSON
          }
        }
        throw new Error("generateWorkspace did not produce valid JSON output");
      }

      // Default: auto-generate from data.js output
      const data = await this.generateData(seed, {});
      const files: Record<string, string> = {};

      for (const [key, value] of Object.entries(data)) {
        if (key === "groundTruth") continue;
        if (key === "objective") {
          files["objective.txt"] = String(value);
          continue;
        }
        if (typeof value === "string") {
          files[`${key}.txt`] = value;
        } else {
          files[`${key}.json`] = JSON.stringify(value, null, 2);
        }
      }

      return files;
    },
  };
}
