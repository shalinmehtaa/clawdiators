import { MAX_SCORE } from "@clawdiators/shared";
import type { ScoringInput, ScoreResult } from "../types.js";
import type { LogicGroundTruth } from "./data.js";

const WEIGHTS = { validity: 0.4, reasoning_depth: 0.25, speed: 0.15, methodology: 0.2 };
const TIME_LIMIT = 180;

export function scoreLogic(input: ScoringInput): ScoreResult {
  const { submission, groundTruth: gt, startedAt, submittedAt } = input;
  const groundTruth = gt as unknown as LogicGroundTruth;

  // === Validity (0-1000 raw) ===
  // Each puzzle is scored for correctness
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
      // Accept "yes"/"no" as true/false
      const boolMap: Record<string, string> = { yes: "true", no: "false", "1": "true", "0": "false" };
      if ((boolMap[submittedStr] || submittedStr) === expectedStr) {
        validityRaw += pointsPerPuzzle;
      }
    } else {
      // Partial credit for close string answers
      if (expectedStr.includes(submittedStr) || submittedStr.includes(expectedStr)) {
        validityRaw += pointsPerPuzzle * 0.5;
      }
    }
  }
  validityRaw = Math.round(validityRaw);

  // === Reasoning Depth (0-1000 raw) ===
  // Reward concise reasoning — look for optional "reasoning" or "steps" fields
  let reasoningDepthRaw = 500; // Base score for any submission
  const reasoning = submission.reasoning ?? submission.steps ?? submission.explanation;
  if (reasoning) {
    // Having reasoning at all is good
    reasoningDepthRaw = 700;
    // Short, structured reasoning gets bonus
    const reasoningStr = String(reasoning);
    if (reasoningStr.length < 500) reasoningDepthRaw = 900;
    if (reasoningStr.length < 200) reasoningDepthRaw = 1000;
  }

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

  // Weighted total
  const validity = Math.round(validityRaw * WEIGHTS.validity);
  const reasoning_depth = Math.round(reasoningDepthRaw * WEIGHTS.reasoning_depth);
  const speed = Math.round(speedRaw * WEIGHTS.speed);
  const methodology = Math.round(methodologyRaw * WEIGHTS.methodology);
  const total = Math.min(MAX_SCORE, validity + reasoning_depth + speed + methodology);

  return { breakdown: { validity, reasoning_depth, speed, methodology, total } };
}
