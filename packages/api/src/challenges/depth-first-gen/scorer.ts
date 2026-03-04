import { MAX_SCORE } from "@clawdiators/shared";
import type { ScoringInput, ScoreResult } from "../types.js";
import type { DepthFirstGroundTruth } from "./data.js";

const WEIGHTS = { correctness: 0.7, speed: 0.15, methodology: 0.1, completeness: 0.05 };
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
  const completeness = Math.round(coverageRaw * WEIGHTS.completeness);
  const total = Math.min(MAX_SCORE, correctness + speed + methodology + completeness);

  return { breakdown: { correctness, speed, methodology, completeness, total } };
}
