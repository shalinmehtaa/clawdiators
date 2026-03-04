import { MAX_SCORE } from "@clawdiators/shared";
import type { ScoringInput, ScoreResult } from "../types.js";
import type { MirageGroundTruth } from "./data.js";

const WEIGHTS = { correctness: 0.55, precision: 0.3, speed: 0.1, completeness: 0.05 };
const TIME_LIMIT = 340;

export function scoreMirage(input: ScoringInput): ScoreResult {
  const { submission, groundTruth: gt, startedAt, submittedAt } = input;
  const groundTruth = gt as unknown as MirageGroundTruth;
  const submitted = (submission.fabrications ?? []) as Array<{
    district?: string;
    field?: string;
    source?: string;
    dataset?: string;
    explanation?: string;
  }>;

  // === Detection (0-1000 raw) ===
  // Of the ground-truth fabrications, how many did the agent find?
  const totalFabrications = groundTruth.fabrications.length;
  const pointsPerFabrication = totalFabrications > 0 ? 1000 / totalFabrications : 0;
  let detectedCount = 0;

  const matchedTruthIds = new Set<string>();
  for (const sub of submitted) {
    if (!sub.district) continue;
    const subDistrict = sub.district.toLowerCase().trim();
    const subField = (sub.field ?? "").toLowerCase().trim();
    const subSource = (sub.source ?? sub.dataset ?? "").toLowerCase().trim();

    for (const truth of groundTruth.fabrications) {
      if (matchedTruthIds.has(truth.id)) continue;
      const truthDistrict = truth.district.toLowerCase().trim();
      const truthField = truth.field.toLowerCase().trim();
      const truthSource = truth.source.toLowerCase().trim();

      // Strict match by district + field; source must be correct when provided.
      const districtMatch = subDistrict === truthDistrict;
      const fieldMatch = subField === truthField;
      const sourceMatch = subSource === truthSource;

      if (districtMatch && fieldMatch && (!subSource || sourceMatch)) {
        detectedCount++;
        matchedTruthIds.add(truth.id);
        break;
      }
    }
  }

  const detectionRaw = Math.round(detectedCount * pointsPerFabrication);

  // === Precision (0-1000 raw) ===
  // Of submitted fabrications, how many match ground truth? Avoid false positives.
  const precisionRaw = submitted.length > 0
    ? Math.round((matchedTruthIds.size / submitted.length) * 1000)
    : 0;

  // === Speed (0-1000 raw) ===
  const elapsedSecs = (submittedAt.getTime() - startedAt.getTime()) / 1000;
  const speedRaw = elapsedSecs >= TIME_LIMIT ? 0 : Math.round(1000 * (1 - elapsedSecs / TIME_LIMIT));

  // === Thoroughness (0-1000 raw) ===
  // Count unique sources among correctly matched fabrications only.
  const matchedSources = new Set<string>();
  for (const sub of submitted) {
    if (!sub.district || !sub.field) continue;
    const subDistrict = sub.district.toLowerCase().trim();
    const subField = sub.field.toLowerCase().trim();
    for (const truth of groundTruth.fabrications) {
      if (truth.district.toLowerCase().trim() === subDistrict && truth.field.toLowerCase().trim() === subField) {
        matchedSources.add(truth.source.toLowerCase().trim());
        break;
      }
    }
  }
  let thoroughnessRaw: number;
  if (matchedSources.size >= 3) thoroughnessRaw = 1000;
  else if (matchedSources.size === 2) thoroughnessRaw = 600;
  else if (matchedSources.size === 1) thoroughnessRaw = 250;
  else thoroughnessRaw = 0;

  // Weighted total
  const correctness = Math.round(detectionRaw * WEIGHTS.correctness);
  const precision = Math.round(precisionRaw * WEIGHTS.precision);
  const speed = Math.round(speedRaw * WEIGHTS.speed);
  const completeness = Math.round(thoroughnessRaw * WEIGHTS.completeness);
  const total = Math.min(MAX_SCORE, correctness + precision + speed + completeness);

  return { breakdown: { correctness, precision, speed, completeness, total } };
}
