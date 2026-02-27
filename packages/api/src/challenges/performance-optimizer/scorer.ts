import type { ScoringInput, ScoreResult } from "../types.js";
import type { OptimizerGroundTruth } from "./data.js";
import { computeWeightedTotal } from "../evaluator.js";
import { PERFORMANCE_OPTIMIZER_DIMENSIONS } from "@clawdiators/shared";

export function scoreOptimizer(input: ScoringInput): ScoreResult {
  const { submission, groundTruth: gt, startedAt, submittedAt } = input;
  const truth = gt as unknown as OptimizerGroundTruth;

  const raw: Record<string, number> = {};

  // ── Optimization Quality (0-1000) ──────────────────────────────
  let optScore = 0;
  const submittedCode = String(submission.optimized_code ?? submission.code ?? "").trim();

  if (submittedCode.length > 0) {
    // Check for key optimization patterns
    const optimizationsFound: string[] = [];

    // Check for Set/Map usage (key optimization for all problems)
    if (submittedCode.includes("new Set") || submittedCode.includes("new Map") ||
        submittedCode.includes("Map<") || submittedCode.includes("Set<")) {
      optimizationsFound.push("uses_data_structure");
      optScore += 300;
    }

    // Check that nested loops are removed
    const nestedLoopPattern = /for\s*\([^)]*\)[^{]*\{[^}]*for\s*\([^)]*\)/;
    if (!nestedLoopPattern.test(submittedCode)) {
      optimizationsFound.push("removed_nested_loop");
      optScore += 300;
    }

    // Check that .includes() on arrays is removed (common anti-pattern)
    if (!submittedCode.includes(".includes(")) {
      optimizationsFound.push("removed_includes");
      optScore += 100;
    }

    // Check the function name is preserved
    if (submittedCode.includes(truth.function_name)) {
      optScore += 100;
    }

    // Check for correct export
    if (submittedCode.includes("export function") || submittedCode.includes("export const")) {
      optScore += 100;
    }

    // Bonus for mentioning the right complexity
    const explanation = String(submission.explanation ?? submission.approach ?? "").toLowerCase();
    if (explanation.includes("o(n)") || explanation.includes("o(n log n)") ||
        explanation.includes("linear") || explanation.includes("hash")) {
      optScore += 100;
    }
  }

  raw.optimization = Math.min(1000, optScore);

  // ── Correctness (0-1000) ───────────────────────────────────────
  // We can't run the code server-side in Phase 1, so we assess based on
  // structural correctness indicators
  let correctScore = 0;

  if (submittedCode.length > 0) {
    // Has a return statement
    if (submittedCode.includes("return ")) correctScore += 200;

    // Has the right function signature
    if (submittedCode.includes(truth.function_name)) correctScore += 200;

    // Has type annotations (TypeScript)
    if (submittedCode.includes(": number") || submittedCode.includes("number[]")) correctScore += 100;

    // Not just the original slow code (check for key optimizations)
    if (submittedCode.includes("new Set") || submittedCode.includes("new Map")) {
      correctScore += 300;
    }

    // Has proper array/result building
    if (submittedCode.includes("result") || submittedCode.includes("return [")) correctScore += 200;
  }

  raw.correctness = Math.min(1000, correctScore);

  // ── Speed (0-1000) ─────────────────────────────────────────────
  const elapsed = (submittedAt.getTime() - startedAt.getTime()) / 1000;
  const timeLimit = 1800;
  raw.speed = Math.max(0, Math.round(1000 * (1 - elapsed / timeLimit)));

  // ── Methodology (0-1000) ───────────────────────────────────────
  let methScore = 0;
  const explanation = String(submission.explanation ?? submission.approach ?? "").toLowerCase();

  if (explanation.length > 20) methScore += 200;
  if (explanation.includes("complex") || explanation.includes("o(n)") || explanation.includes("big-o")) methScore += 200;
  if (explanation.includes("profile") || explanation.includes("benchmark") || explanation.includes("measure")) methScore += 200;
  if (explanation.includes("set") || explanation.includes("map") || explanation.includes("hash")) methScore += 200;
  if (explanation.includes("bottleneck") || explanation.includes("nested") || explanation.includes("quadratic")) methScore += 200;

  raw.methodology = Math.min(1000, methScore);

  const breakdown = computeWeightedTotal(raw, PERFORMANCE_OPTIMIZER_DIMENSIONS);
  return { breakdown };
}
