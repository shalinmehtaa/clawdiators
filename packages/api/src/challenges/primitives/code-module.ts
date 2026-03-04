/**
 * Code-based Challenge Adapter — wraps community-submitted JS code files
 * into a ChallengeModule, executing them in a sandboxed Node.js VM context.
 *
 * Code files: data.js (required), scorer.js (required), workspace.js, validator.js, helpers.js
 * All executed with mulberry32 PRNG and restricted globals.
 */
import { createContext, runInContext, Script } from "node:vm";
import type { ChallengeModule, ChallengeData, ScoringInput, ScoreResult, SubmissionWarning } from "../types.js";
import type { CommunitySpec, CodeFiles } from "./validator.js";
import { generateLLMJudgeInlineScript } from "./llm-judge.js";
import { generateBenchmarkInlineScript } from "./benchmark.js";

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

/** Default VM execution timeout in milliseconds. */
const VM_TIMEOUT_MS = 5000;

/**
 * Execute a JS code string in a sandboxed VM context.
 * Returns the module's exports via a synthetic `module.exports` object.
 */
function executeInVM(
  code: string,
  globals: Record<string, unknown> = {},
  timeout = VM_TIMEOUT_MS,
): Record<string, unknown> {
  const moduleExports: Record<string, unknown> = {};
  const moduleObj = { exports: moduleExports };

  const sandbox: Record<string, unknown> = {
    module: moduleObj,
    exports: moduleExports,
    console: {
      log: (...args: unknown[]) => { /* captured but silenced in production */ },
      warn: (...args: unknown[]) => {},
      error: (...args: unknown[]) => {},
    },
    JSON,
    Math,
    Date,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Map,
    Set,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    encodeURIComponent,
    decodeURIComponent,
    ...globals,
  };

  const context = createContext(sandbox);

  // Compile and run with timeout
  const script = new Script(code, { filename: "community-code.js" });
  script.runInContext(context, { timeout });

  // If module.exports has entries, use those (explicit exports)
  const explicitExports = moduleObj.exports;
  if (Object.keys(explicitExports).length > 0) {
    return explicitExports;
  }

  // Fall back to top-level function declarations in the context.
  // This allows authors to write plain `function generateData(seed) { ... }`
  // without needing `module.exports = { generateData }`.
  const KNOWN_EXPORTS = ["generateData", "score", "generateWorkspace", "validate", "setup"];
  const contextExports: Record<string, unknown> = {};
  for (const key of KNOWN_EXPORTS) {
    if (typeof context[key] === "function") {
      contextExports[key] = context[key];
    }
  }
  return Object.keys(contextExports).length > 0 ? contextExports : explicitExports;
}

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
 * Executes data.js / scorer.js / workspace.js / validator.js in Node.js VM contexts.
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

    generateData(seed: number, _config: Record<string, unknown>): ChallengeData {
      const source = buildSource(codeFiles["data.js"], helpersCode);
      const vmGlobals: Record<string, unknown> = {};
      if (cachedAssets) vmGlobals.CACHED_ASSETS = cachedAssets;
      const exports = executeInVM(source, vmGlobals);

      const generateData = exports.generateData as
        | ((seed: number) => { objective: string; groundTruth: Record<string, unknown>; [key: string]: unknown })
        | undefined;

      if (typeof generateData !== "function") {
        throw new Error("data.js must export a generateData(seed) function");
      }

      const result = generateData(seed);

      if (!result || typeof result !== "object") {
        throw new Error("generateData must return an object");
      }
      if (typeof result.objective !== "string") {
        throw new Error("generateData must return an object with an 'objective' string");
      }
      if (!result.groundTruth || typeof result.groundTruth !== "object") {
        throw new Error("generateData must return an object with a 'groundTruth' object");
      }

      return result as ChallengeData;
    },

    score(input: ScoringInput): ScoreResult {
      const source = buildSource(codeFiles["scorer.js"], helpersCode);
      const vmGlobals: Record<string, unknown> = {};
      if (cachedAssets) vmGlobals.CACHED_ASSETS = cachedAssets;
      const exports = executeInVM(source, vmGlobals);

      const scoreFn = exports.score as
        | ((input: Record<string, unknown>) => { breakdown: Record<string, number> })
        | undefined;

      if (typeof scoreFn !== "function") {
        throw new Error("scorer.js must export a score(input) function");
      }

      // Serialize dates to ISO strings for the scorer
      const scorerInput = {
        submission: input.submission,
        groundTruth: input.groundTruth,
        startedAt: input.startedAt.toISOString(),
        submittedAt: input.submittedAt.toISOString(),
        apiCallCount: input.apiCallCount,
        checkpoints: input.checkpoints ?? [],
      };

      const result = scoreFn(scorerInput);

      if (!result || typeof result !== "object" || !result.breakdown) {
        throw new Error("score() must return { breakdown: { [dimension]: number, total: number } }");
      }

      // Validate all dimension scores are numbers
      for (const [key, value] of Object.entries(result.breakdown)) {
        if (typeof value !== "number" || isNaN(value)) {
          throw new Error(`score() breakdown.${key} must be a number, got ${typeof value}`);
        }
      }

      // Ensure total exists
      if (result.breakdown.total === undefined) {
        let total = 0;
        for (const [key, value] of Object.entries(result.breakdown)) {
          if (key !== "total") total += value;
        }
        result.breakdown.total = total;
      }

      // Clamp total to maxScore
      result.breakdown.total = Math.min(result.breakdown.total, spec.scoring.maxScore);

      return { breakdown: result.breakdown };
    },

    validateSubmission(submission: Record<string, unknown>, groundTruth: Record<string, unknown>): SubmissionWarning[] {
      if (!codeFiles["validator.js"]) return [];

      const source = buildSource(codeFiles["validator.js"], helpersCode);
      const vmGlobals: Record<string, unknown> = {};
      if (cachedAssets) vmGlobals.CACHED_ASSETS = cachedAssets;
      const exports = executeInVM(source, vmGlobals);

      const validateFn = exports.validate as
        | ((submission: Record<string, unknown>, groundTruth: Record<string, unknown>) => SubmissionWarning[])
        | undefined;

      if (typeof validateFn !== "function") return [];

      try {
        const warnings = validateFn(submission, groundTruth);
        if (!Array.isArray(warnings)) return [];
        return warnings.filter(
          (w) => w && typeof w.severity === "string" && typeof w.field === "string" && typeof w.message === "string",
        );
      } catch {
        return [];
      }
    },

    generateWorkspace(seed: number, _config: Record<string, unknown>): Record<string, string> {
      if (codeFiles["workspace.js"]) {
        const source = buildSource(codeFiles["workspace.js"], helpersCode);

        // Also make generateData available in workspace context
        const dataSource = buildSource(codeFiles["data.js"], helpersCode);
        const fullSource = `${dataSource}\n\n${source}`;
        const vmGlobals: Record<string, unknown> = {};
        if (cachedAssets) vmGlobals.CACHED_ASSETS = cachedAssets;
        const exports = executeInVM(fullSource, vmGlobals);

        const genWorkspace = exports.generateWorkspace as
          | ((seed: number) => Record<string, string>)
          | undefined;

        if (typeof genWorkspace !== "function") {
          throw new Error("workspace.js must export a generateWorkspace(seed) function");
        }

        const files = genWorkspace(seed);
        if (!files || typeof files !== "object") {
          throw new Error("generateWorkspace must return a Record<string, string>");
        }

        return files;
      }

      // Default: auto-generate from data.js output
      const data = this.generateData(seed, {});
      const files: Record<string, string> = {};

      // Include all non-groundTruth fields as workspace files
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
