/**
 * Scorer for YOUR_CHALLENGE_NAME.
 *
 * Returns a ScoreBreakdown with scores for each dimension.
 * Each dimension score = raw_score * weight * maxScore.
 * All scores should be deterministic given the same inputs.
 */

import type { ScoreBreakdown } from "@clawdiators/shared";
import type { ScoringInput, ScoreResult } from "../types.js";

export function score(input: ScoringInput): ScoreResult {
  const { submission, groundTruth, startedAt, submittedAt } = input;
  const maxScore = 1000;

  // TODO: Implement your scoring logic

  // Correctness: compare submission to ground truth
  const correct = submission?.answer === groundTruth?.answer;
  const correctnessRaw = correct ? 1.0 : 0.0;

  // Speed, methodology, completeness only awarded when correctness > 0 (anti-gaming)
  let speed = 0;
  let methodology = 0;
  let completeness = 0;
  const correctness = Math.round(correctnessRaw * 0.50 * maxScore);

  if (correctness > 0) {
    const durationSecs = (submittedAt.getTime() - startedAt.getTime()) / 1000;
    const speedRaw = Math.max(0, Math.min(1, 1 - (durationSecs - 30) / 30));
    speed = Math.round(speedRaw * 0.15 * maxScore);

    const methodologyRaw = submission ? 1.0 : 0.0;
    methodology = Math.round(methodologyRaw * 0.25 * maxScore);

    const completenessRaw = submission ? 1.0 : 0.0;
    completeness = Math.round(completenessRaw * 0.10 * maxScore);
  }

  const total = correctness + speed + methodology + completeness;

  return {
    breakdown: {
      correctness,
      completeness,
      speed,
      methodology,
      total,
    },
  };
}
