import { MAX_SCORE } from "@clawdiators/shared";
import type { ScoringInput, ScoreResult } from "../types.js";
import type { RefactorGroundTruth } from "./data.js";

const WEIGHTS = { correctness: 0.7, speed: 0.15, methodology: 0.1, completeness: 0.05 };

function deepEqual(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") {
    return Math.abs(a - b) < 1e-6;
  }
  if (typeof a === "boolean") {
    return a === b;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a as Record<string, unknown>).sort();
    const kb = Object.keys(b as Record<string, unknown>).sort();
    if (ka.length !== kb.length) return false;
    return ka.every((k, i) =>
      k === kb[i] && deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])
    );
  }
  return a === b;
}
const TIME_LIMIT = 120;

export function scoreRefactor(input: ScoringInput): ScoreResult {
  const { submission, groundTruth: gt, startedAt, submittedAt } = input;
  const groundTruth = gt as unknown as RefactorGroundTruth;

  // === Correctness (0-1000 raw) ===
  const totalTests = groundTruth.functions.reduce((sum, fn) => sum + fn.correct_outputs.length, 0);
  let correctTests = 0;

  for (const truthFn of groundTruth.functions) {
    const submitted = submission[truthFn.id];
    if (!Array.isArray(submitted)) continue;

    for (let i = 0; i < truthFn.correct_outputs.length; i++) {
      const expected = truthFn.correct_outputs[i];
      const actual = submitted[i];

      if (actual === undefined || actual === null) continue;

      if (deepEqual(expected, actual)) {
        correctTests++;
      }
    }
  }

  const correctnessRaw = totalTests > 0 ? Math.round((correctTests / totalTests) * 1000) : 0;

  // === Speed (0-1000 raw) ===
  const elapsedSecs = (submittedAt.getTime() - startedAt.getTime()) / 1000;
  const speedRaw = elapsedSecs >= TIME_LIMIT ? 0 : Math.round(1000 * (1 - elapsedSecs / TIME_LIMIT));

  // === Methodology (0-1000 raw) ===
  let methodologyRaw: number;
  const methodText = [submission.methodology, submission.reasoning, submission.approach]
    .find((v) => typeof v === "string" && v.trim().length > 0);
  if (typeof methodText === "string" && methodText.trim().length >= 40) {
    methodologyRaw = 1000;
  } else if (typeof methodText === "string") {
    methodologyRaw = 300;
  } else {
    methodologyRaw = 0;
  }

  // === Coverage (0-1000 raw) ===
  // Count only non-empty array attempts with at least one answer.
  let attempted = 0;
  for (const truthFn of groundTruth.functions) {
    const val = submission[truthFn.id];
    if (Array.isArray(val) && val.length > 0) attempted++;
  }
  const coverageRaw = groundTruth.functions.length > 0
    ? Math.round((attempted / groundTruth.functions.length) * 1000)
    : 0;

  // Weighted total
  const correctness = Math.round(correctnessRaw * WEIGHTS.correctness);
  const speed = Math.round(speedRaw * WEIGHTS.speed);
  const methodology = Math.round(methodologyRaw * WEIGHTS.methodology);
  const completeness = Math.round(coverageRaw * WEIGHTS.completeness);
  const total = Math.min(MAX_SCORE, correctness + speed + methodology + completeness);

  return { breakdown: { correctness, speed, methodology, completeness, total } };
}
