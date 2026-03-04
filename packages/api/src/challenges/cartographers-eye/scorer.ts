import { MAX_SCORE } from "@clawdiators/shared";
import type { ScoringInput, ScoreResult } from "../types.js";
import type { CartographerGroundTruth } from "./data.js";

const WEIGHTS = { correctness: 0.35, analysis: 0.3, speed: 0.15, methodology: 0.2 };
const TIME_LIMIT = 240;
const NUM_QUESTIONS = 10;
const POINTS_PER_QUESTION = 1000 / NUM_QUESTIONS; // 100 each

const COMPASS_ORDER = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

function isAdjacentDirection(a: string, b: string): boolean {
  const ia = COMPASS_ORDER.indexOf(a.toUpperCase());
  const ib = COMPASS_ORDER.indexOf(b.toUpperCase());
  if (ia === -1 || ib === -1) return false;
  const diff = Math.abs(ia - ib);
  return diff === 1 || diff === 7;
}

function normalizeList(s: string): string[] {
  return s
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter((x) => x.length > 0)
    .sort();
}

export function scoreCartographer(input: ScoringInput): ScoreResult {
  const { submission, groundTruth: gt, startedAt, submittedAt } = input;
  const groundTruth = gt as unknown as CartographerGroundTruth;

  let accuracyRaw = 0;

  for (const truth of groundTruth.answers) {
    const submitted = submission[truth.question_id];
    if (submitted === undefined || submitted === null) continue;

    const submittedStr = String(submitted).trim();
    const truthStr = String(truth.answer).trim();
    const qNum = truth.question_id.split("-").pop()!;

    switch (qNum) {
      case "1": // closest_region — exact name match
      case "4": // largest_area — exact name match
      case "9": // coastal_centroid — exact name match
        if (submittedStr.toLowerCase() === truthStr.toLowerCase()) {
          accuracyRaw += POINTS_PER_QUESTION;
        }
        break;

      case "2": // distance — within 10% tolerance
      case "6": // bounding_circle_area — within 10% tolerance
      case "8": // tsp_volcanic — within 15% tolerance (heuristic)
      {
        const submittedNum = parseFloat(submittedStr);
        const truthNum = Number(truth.answer);
        if (!isNaN(submittedNum) && truthNum > 0) {
          const tolerancePct = qNum === "8" ? 0.15 : 0.1;
          const tolerance = truthNum * tolerancePct;
          if (Math.abs(submittedNum - truthNum) <= tolerance) {
            accuracyRaw += POINTS_PER_QUESTION;
          } else if (Math.abs(submittedNum - truthNum) <= tolerance * 2) {
            accuracyRaw += POINTS_PER_QUESTION * 0.5;
          }
        }
        break;
      }

      case "3": // route_traversal — exact integer
      case "10": // obstacle_count — exact integer
      {
        const submittedInt = parseInt(submittedStr, 10);
        const truthInt = Number(truth.answer);
        if (submittedInt === truthInt) {
          accuracyRaw += POINTS_PER_QUESTION;
        }
        break;
      }

      case "5": // compass_direction — exact or adjacent
        if (submittedStr.toUpperCase() === truthStr.toUpperCase()) {
          accuracyRaw += POINTS_PER_QUESTION;
        } else if (isAdjacentDirection(submittedStr, truthStr)) {
          accuracyRaw += POINTS_PER_QUESTION * 0.5;
        }
        break;

      case "7": // unreachable_regions — list comparison
      {
        const submittedList = normalizeList(submittedStr);
        const truthList = normalizeList(truthStr);
        if (
          submittedList.length === truthList.length &&
          submittedList.every((v, i) => v === truthList[i])
        ) {
          accuracyRaw += POINTS_PER_QUESTION;
        } else {
          const intersection = submittedList.filter((v) =>
            truthList.includes(v),
          );
          if (truthList.length > 0 && intersection.length > 0) {
            const precision = intersection.length / submittedList.length;
            const recall = intersection.length / truthList.length;
            const f1 = (2 * precision * recall) / (precision + recall);
            accuracyRaw += POINTS_PER_QUESTION * f1 * 0.8;
          }
        }
        break;
      }
    }
  }

  accuracyRaw = Math.min(1000, Math.round(accuracyRaw));

  // === Spatial Reasoning (0-1000 raw) ===
  let reasoningCount = 0;
  const reasoningField = submission.reasoning as
    | Record<string, unknown>
    | undefined;
  const calculationsField = submission.calculations as
    | Record<string, unknown>
    | undefined;

  if (reasoningField && typeof reasoningField === "object") {
    reasoningCount += Object.keys(reasoningField).length;
  }
  if (calculationsField && typeof calculationsField === "object") {
    reasoningCount += Object.keys(calculationsField).length;
  }
  for (const key of Object.keys(submission)) {
    if (
      key.includes("reasoning") ||
      key.includes("calculation") ||
      key.includes("explanation")
    ) {
      if (
        typeof submission[key] === "string" &&
        (submission[key] as string).length > 10
      ) {
        reasoningCount++;
      }
    }
  }
  // Single free-form strings are easy to game; cap at 1 evidence unit.
  if (typeof submission.reasoning === "string") {
    reasoningCount = Math.min(reasoningCount, 1);
  }
  reasoningCount = Math.min(reasoningCount, NUM_QUESTIONS);

  let spatialReasoningRaw: number;
  if (reasoningCount >= 7) spatialReasoningRaw = 1000;
  else if (reasoningCount >= 5) spatialReasoningRaw = 750;
  else if (reasoningCount >= 3) spatialReasoningRaw = 500;
  else if (reasoningCount >= 1) spatialReasoningRaw = 250;
  else spatialReasoningRaw = 0;

  // === Speed (0-1000 raw) ===
  const elapsedSecs =
    (submittedAt.getTime() - startedAt.getTime()) / 1000;
  const speedRaw =
    elapsedSecs >= TIME_LIMIT
      ? 0
      : Math.round(1000 * (1 - elapsedSecs / TIME_LIMIT));

  // === Methodology (0-1000 raw) ===
  const methodText = [submission.methodology, submission.reasoning, submission.approach]
    .find((v) => typeof v === "string" && v.trim().length > 0);
  const structuredEvidenceCount =
    (reasoningField && typeof reasoningField === "object" ? Object.keys(reasoningField).length : 0) +
    (calculationsField && typeof calculationsField === "object" ? Object.keys(calculationsField).length : 0);
  let methodologyRaw: number;
  if (structuredEvidenceCount >= 5) {
    methodologyRaw = 1000;
  } else if (typeof methodText === "string" && methodText.trim().length >= 120) {
    methodologyRaw = 300;
  } else {
    methodologyRaw = 0;
  }

  const correctness = Math.round(accuracyRaw * WEIGHTS.correctness);
  const analysis = Math.round(
    spatialReasoningRaw * WEIGHTS.analysis,
  );
  const speed = Math.round(speedRaw * WEIGHTS.speed);
  const methodology = Math.round(methodologyRaw * WEIGHTS.methodology);
  const total = Math.min(
    MAX_SCORE,
    correctness + analysis + speed + methodology,
  );

  return {
    breakdown: { correctness, analysis, speed, methodology, total },
  };
}
