import { MAX_SCORE } from "@clawdiators/shared";
import type { ScoringInput, ScoreResult } from "../types.js";
import type { RefactorGroundTruth } from "./data.js";

const WEIGHTS = { correctness: 0.5, speed: 0.2, methodology: 0.15, coverage: 0.15 };
const TIME_LIMIT = 120;

export function scoreRefactor(input: ScoringInput): ScoreResult {
  const { submission, groundTruth: gt, startedAt, submittedAt } = input;
  const groundTruth = gt as unknown as RefactorGroundTruth;

  // === Correctness (0-1000 raw) ===
  let totalTests = 0;
  let correctTests = 0;

  for (const truthFn of groundTruth.functions) {
    const submitted = submission[truthFn.id];
    if (!Array.isArray(submitted)) continue;

    for (let i = 0; i < truthFn.correct_outputs.length; i++) {
      totalTests++;
      const expected = truthFn.correct_outputs[i];
      const actual = submitted[i];

      if (actual === undefined || actual === null) continue;

      // Compare values (handle type coercion for numbers/booleans)
      if (typeof expected === "number") {
        const num = typeof actual === "number" ? actual : Number(actual);
        if (!Number.isNaN(num) && Math.abs(num - expected) < 0.001) {
          correctTests++;
        }
      } else if (typeof expected === "boolean") {
        const boolVal = actual === expected || String(actual).toLowerCase() === String(expected);
        if (boolVal) correctTests++;
      } else {
        if (String(actual).trim() === String(expected).trim()) {
          correctTests++;
        }
      }
    }
  }

  const correctnessRaw = totalTests > 0 ? Math.round((correctTests / totalTests) * 1000) : 0;

  // === Speed (0-1000 raw) ===
  const elapsedSecs = (submittedAt.getTime() - startedAt.getTime()) / 1000;
  const speedRaw = elapsedSecs >= TIME_LIMIT ? 0 : Math.round(1000 * (1 - elapsedSecs / TIME_LIMIT));

  // === Methodology (0-1000 raw) ===
  let methodologyRaw: number;
  if (submission.methodology || submission.reasoning || submission.approach) {
    methodologyRaw = 1000;
  } else {
    // Award based on submission completeness
    const answerKeys = Object.keys(submission).filter(k => submission[k] !== null && submission[k] !== undefined);
    methodologyRaw = answerKeys.length > 0 ? 600 : 400;
  }

  // === Coverage (0-1000 raw) ===
  // How many functions did the agent attempt?
  let attempted = 0;
  for (const truthFn of groundTruth.functions) {
    if (submission[truthFn.id] !== undefined) attempted++;
  }
  const coverageRaw = groundTruth.functions.length > 0
    ? Math.round((attempted / groundTruth.functions.length) * 1000)
    : 0;

  // Weighted total
  const correctness = Math.round(correctnessRaw * WEIGHTS.correctness);
  const speed = Math.round(speedRaw * WEIGHTS.speed);
  const methodology = Math.round(methodologyRaw * WEIGHTS.methodology);
  const coverage = Math.round(coverageRaw * WEIGHTS.coverage);
  const total = Math.min(MAX_SCORE, correctness + speed + methodology + coverage);

  return { breakdown: { correctness, speed, methodology, coverage, total } };
}
