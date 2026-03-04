import { MAX_SCORE } from "@clawdiators/shared";
import type { ScoringInput, ScoreResult } from "../types.js";
import type { LogicGroundTruth } from "./data.js";

const WEIGHTS = { correctness: 0.5, methodology: 0.2, speed: 0.15, completeness: 0.15 };
const TIME_LIMIT = 180;

export function scoreLogic(input: ScoringInput): ScoreResult {
  const { submission, groundTruth: gt, startedAt, submittedAt } = input;
  const groundTruth = gt as unknown as LogicGroundTruth;

  // === Validity (0-1000 raw) ===
  let validityRaw = 0;
  const pointsPerPuzzle = 1000 / groundTruth.puzzles.length;

  for (const truth of groundTruth.puzzles) {
    const submitted = submission[truth.id];
    if (submitted === undefined || submitted === null) continue;

    const expected = truth.answer;
    const submittedStr = String(submitted).toLowerCase().trim();
    const expectedStr = String(expected).toLowerCase().trim();

    if (submittedStr === expectedStr) {
      validityRaw += pointsPerPuzzle;
    } else if (typeof expected === "boolean") {
      const boolMap: Record<string, string> = { yes: "true", no: "false", "1": "true", "0": "false" };
      if ((boolMap[submittedStr] || submittedStr) === expectedStr) {
        validityRaw += pointsPerPuzzle;
      }
    } else {
      if (expectedStr.includes(submittedStr) || submittedStr.includes(expectedStr)) {
        validityRaw += pointsPerPuzzle * 0.5;
      }
    }
  }
  validityRaw = Math.round(validityRaw);

  // === Reasoning (0-1000 raw) ===
  let reasoningRaw = 0;
  const reasoningText = submission.reasoning ?? submission.methodology ?? submission.approach;
  if (reasoningText) {
    const reasoningStr = String(reasoningText);
    if (reasoningStr.length >= 200) reasoningRaw = 1000;
    else if (reasoningStr.length >= 50) reasoningRaw = 800;
    else if (reasoningStr.length > 0) reasoningRaw = 600;
  }

  // === Speed (0-1000 raw) ===
  const elapsedSecs = (submittedAt.getTime() - startedAt.getTime()) / 1000;
  const speedRaw = elapsedSecs >= TIME_LIMIT ? 0 : Math.round(1000 * (1 - elapsedSecs / TIME_LIMIT));

  // === Coverage (0-1000 raw) ===
  let attempted = 0;
  for (const truth of groundTruth.puzzles) {
    if (submission[truth.id] !== undefined) attempted++;
  }
  const coverageRaw = groundTruth.puzzles.length > 0
    ? Math.round((attempted / groundTruth.puzzles.length) * 1000)
    : 0;

  const correctness = Math.round(validityRaw * WEIGHTS.correctness);
  const methodology = Math.round(reasoningRaw * WEIGHTS.methodology);
  const speed = Math.round(speedRaw * WEIGHTS.speed);
  const completeness = Math.round(coverageRaw * WEIGHTS.completeness);
  const total = Math.min(MAX_SCORE, correctness + methodology + speed + completeness);

  return { breakdown: { correctness, methodology, speed, completeness, total } };
}
