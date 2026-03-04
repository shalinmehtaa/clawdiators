import type { ScoringInput, ScoreResult } from "../types.js";
import type { OptimizerGroundTruth } from "./data.js";
import { computeWeightedTotal } from "../evaluator.js";
import { PERFORMANCE_OPTIMIZER_DIMENSIONS } from "@clawdiators/shared";

function hasFunctionDeclaration(code: string, functionName: string): boolean {
  const escaped = functionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const fnRe = new RegExp(`export\\s+function\\s+${escaped}\\s*\\(`);
  const constRe = new RegExp(`export\\s+const\\s+${escaped}\\s*=`);
  return fnRe.test(code) || constRe.test(code);
}

function getFunctionSpecificSignals(functionName: string): {
  expected: string[];
  forbidden: string[];
} {
  switch (functionName) {
    case "rankCandidates":
      return {
        expected: ["demoted", "finalScore", "results.sort", "percentile"],
        forbidden: ["candidates.map(c => c.experience)", "candidates.map(c => c.skillScore)", "computePercentile("],
      };
    case "buildReport":
      return {
        expected: ["join(", "Subtotal", "Category:", "transactions"],
        forbidden: ["categories.includes(", "transactions.filter(", "isAboveThreshold("],
      };
    case "processEvents":
      return {
        expected: ["duplicatesRemoved", "dominantType", "eventCount", "totalValue"],
        forbidden: ["sorted.filter(", "deduped.some("],
      };
    case "resolveConflicts":
      return {
        expected: ["selectedIds", "totalValue", "conflicts", "binary"],
        forbidden: ["for (let j = i - 1; j >= 0; j--)"],
      };
    default:
      return { expected: [], forbidden: [] };
  }
}

export function scoreOptimizer(input: ScoringInput): ScoreResult {
  const { submission, groundTruth: gt, startedAt, submittedAt } = input;
  const truth = gt as unknown as OptimizerGroundTruth;

  const raw: Record<string, number> = {};

  // ── Optimization Quality (0-1000) ──────────────────────────────
  let optScore = 0;
  const submittedCode = String(submission.optimized_code ?? submission.code ?? "").trim();

  if (submittedCode.length > 0) {
    const codeLower = submittedCode.toLowerCase();
    const hasDeclaration = hasFunctionDeclaration(submittedCode, truth.function_name);
    if (hasDeclaration) optScore += 150;

    const usesEfficientDs =
      submittedCode.includes("new Set") ||
      submittedCode.includes("new Map") ||
      submittedCode.includes("Set<") ||
      submittedCode.includes("Map<");
    if (usesEfficientDs) optScore += 220;

    const hasLoop = /\bfor\s*\(|\bwhile\s*\(|\.forEach\(/.test(submittedCode);
    const nestedLoopPattern = /for\s*\([^)]*\)[^{]*\{[\s\S]{0,300}for\s*\([^)]*\)/;
    if (hasLoop && !nestedLoopPattern.test(submittedCode)) optScore += 180;

    const hasOptimizationStructure =
      /\bbinary\b/.test(codeLower) ||
      /\bmid\b/.test(codeLower) ||
      /\bcache\b/.test(codeLower) ||
      /\bgroup(ed|ing)?\b/.test(codeLower) ||
      /\bprecompute\b/.test(codeLower) ||
      /\bwindow\b/.test(codeLower);
    if (hasOptimizationStructure) optScore += 150;

    if (submittedCode.length >= 350) optScore += 100;

    const { expected, forbidden } = getFunctionSpecificSignals(truth.function_name);
    if (expected.length > 0) {
      const expectedHits = expected.filter((s) => codeLower.includes(s.toLowerCase())).length;
      optScore += Math.round((expectedHits / expected.length) * 200);
    }
    if (forbidden.length > 0) {
      const forbiddenHits = forbidden.filter((s) => codeLower.includes(s.toLowerCase())).length;
      optScore -= Math.round((forbiddenHits / forbidden.length) * 250);
    }
  }

  raw.correctness = Math.max(0, Math.min(1000, optScore));

  // ── Correctness (0-1000) ───────────────────────────────────────
  // We can't run the code server-side in Phase 1, so we assess based on
  // structural correctness indicators
  let correctScore = 0;

  if (submittedCode.length > 0) {
    if (hasFunctionDeclaration(submittedCode, truth.function_name)) correctScore += 280;
    if (submittedCode.includes("return ")) correctScore += 180;
    if (submittedCode.includes(": number") || submittedCode.includes("number[]") || submittedCode.includes(": string")) {
      correctScore += 120;
    }

    const behaviorSignals =
      truth.function_name === "rankCandidates"
        ? ["demoted", "percentiles", "finalScore", "results.sort"]
        : truth.function_name === "buildReport"
          ? ["Subtotal", "Category:", "=== End Report ==="]
          : truth.function_name === "processEvents"
            ? ["duplicatesRemoved", "dominantType", "windowStart", "windowEnd"]
            : truth.function_name === "resolveConflicts"
              ? ["selectedIds", "totalValue", "conflicts"]
              : [];
    if (behaviorSignals.length > 0) {
      const hits = behaviorSignals.filter((s) => submittedCode.includes(s)).length;
      correctScore += Math.round((hits / behaviorSignals.length) * 300);
    }

    if (/return\s*\[\s*\]/.test(submittedCode) || /placeholder|todo/i.test(submittedCode)) {
      correctScore = Math.max(0, correctScore - 300);
    }
  }

  raw.code_quality = Math.min(1000, correctScore);

  // ── Speed (0-1000) ─────────────────────────────────────────────
  const elapsed = (submittedAt.getTime() - startedAt.getTime()) / 1000;
  const timeLimit = 1800;
  raw.speed = Math.max(0, Math.round(1000 * (1 - elapsed / timeLimit)));

  // ── Methodology (0-1000) ───────────────────────────────────────
  let methScore = 0;
  const explanation = String(submission.explanation ?? submission.approach ?? "").toLowerCase();
  const uniqueWords = new Set(explanation.split(/[^a-z0-9]+/).filter((w) => w.length > 3));

  if (explanation.length >= 80) methScore += 250;
  if (explanation.includes("complex") || explanation.includes("o(n)") || explanation.includes("big-o")) methScore += 200;
  if (explanation.includes("profile") || explanation.includes("benchmark") || explanation.includes("measure")) methScore += 150;
  if (explanation.includes("set") || explanation.includes("map") || explanation.includes("hash") || explanation.includes("binary")) methScore += 200;
  if (explanation.includes("bottleneck") || explanation.includes("nested") || explanation.includes("quadratic")) methScore += 200;

  if (uniqueWords.size < 20) {
    methScore = Math.round(methScore * 0.5);
  }

  raw.methodology = Math.min(1000, methScore);

  const breakdown = computeWeightedTotal(raw, PERFORMANCE_OPTIMIZER_DIMENSIONS);
  return { breakdown };
}
