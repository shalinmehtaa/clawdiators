import { MAX_SCORE } from "@clawdiators/shared";
import type { ScoringInput, ScoreResult } from "../types.js";
import type { DepthFirstGroundTruth } from "./data.js";

const WEIGHTS = { correctness: 0.5, speed: 0.2, methodology: 0.15, coverage: 0.15 };
const TIME_LIMIT = 180;

export function scoreDepthFirst(input: ScoringInput): ScoreResult {
  const { submission, groundTruth: gt, startedAt, submittedAt } = input;
  const groundTruth = gt as unknown as DepthFirstGroundTruth;

  // === Correctness (0-1000 raw) ===
  // 50 pts per test case × 20 = 1000
  const totalTests = groundTruth.test_outputs.length;
  let correctTests = 0;

  for (const expected of groundTruth.test_outputs) {
    const actual = submission[expected.id];
    if (actual === undefined || actual === null) continue;

    // Deep equality via JSON.stringify
    if (JSON.stringify(actual) === JSON.stringify(expected.expected_output)) {
      correctTests++;
    }
  }

  const correctnessRaw = totalTests > 0
    ? Math.round((correctTests / totalTests) * 1000)
    : 0;

  // === Speed (0-1000 raw) ===
  const elapsedSecs = (submittedAt.getTime() - startedAt.getTime()) / 1000;
  const speedRaw = elapsedSecs >= TIME_LIMIT
    ? 0
    : Math.round(1000 * (1 - elapsedSecs / TIME_LIMIT));

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
  // A test case is attempted if submission[test_id] is not undefined
  let attempted = 0;
  for (const expected of groundTruth.test_outputs) {
    if (submission[expected.id] !== undefined) attempted++;
  }
  const coverageRaw = totalTests > 0
    ? Math.round((attempted / totalTests) * 1000)
    : 0;

  // Weighted total, clamped to MAX_SCORE
  const correctness = Math.round(correctnessRaw * WEIGHTS.correctness);
  const speed = Math.round(speedRaw * WEIGHTS.speed);
  const methodology = Math.round(methodologyRaw * WEIGHTS.methodology);
  const coverage = Math.round(coverageRaw * WEIGHTS.coverage);
  const total = Math.min(MAX_SCORE, correctness + speed + methodology + coverage);

  return { breakdown: { correctness, speed, methodology, coverage, total } };
}
