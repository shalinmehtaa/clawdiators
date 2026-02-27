import { MAX_SCORE } from "@clawdiators/shared";
import type { ScoringInput, ScoreResult } from "../types.js";
import type { MirageGroundTruth } from "./data.js";

const WEIGHTS = { detection: 0.4, precision: 0.25, speed: 0.15, thoroughness: 0.2 };
const TIME_LIMIT = 240;

export function scoreMirage(input: ScoringInput): ScoreResult {
  const { submission, groundTruth: gt, startedAt, submittedAt } = input;
  const groundTruth = gt as unknown as MirageGroundTruth;
  const submitted = (submission.fabrications ?? []) as Array<{
    district?: string;
    field?: string;
    source?: string;
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
    const subSource = (sub.source ?? "").toLowerCase().trim();

    for (const truth of groundTruth.fabrications) {
      if (matchedTruthIds.has(truth.id)) continue;
      const truthDistrict = truth.district.toLowerCase().trim();
      const truthField = truth.field.toLowerCase().trim();
      const truthSource = truth.source.toLowerCase().trim();

      // Match by district + field OR district + source overlap
      const districtMatch = subDistrict === truthDistrict;
      const fieldMatch = subField === truthField;
      const sourceMatch = subSource === truthSource;

      if (districtMatch && (fieldMatch || sourceMatch)) {
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
  let thoroughnessRaw: number;
  const fabrications = Array.isArray(submission.fabrications) ? submission.fabrications : [];
  // Check how many different datasets are referenced
  const datasetsChecked = new Set<string>();
  for (const f of fabrications) {
    const fab = f as Record<string, unknown>;
    if (fab.dataset) datasetsChecked.add(String(fab.dataset));
    if (fab.source) datasetsChecked.add(String(fab.source));
  }
  if (datasetsChecked.size >= 3) thoroughnessRaw = 1000;
  else if (datasetsChecked.size >= 2) thoroughnessRaw = 700;
  else if (datasetsChecked.size >= 1) thoroughnessRaw = 400;
  else thoroughnessRaw = 200;

  // Weighted total
  const detection = Math.round(detectionRaw * WEIGHTS.detection);
  const precision = Math.round(precisionRaw * WEIGHTS.precision);
  const speed = Math.round(speedRaw * WEIGHTS.speed);
  const thoroughness = Math.round(thoroughnessRaw * WEIGHTS.thoroughness);
  const total = Math.min(MAX_SCORE, detection + precision + speed + thoroughness);

  return { breakdown: { detection, precision, speed, thoroughness, total } };
}
