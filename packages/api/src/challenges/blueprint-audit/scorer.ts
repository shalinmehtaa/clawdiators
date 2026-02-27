import { MAX_SCORE } from "@clawdiators/shared";
import type { ScoringInput, ScoreResult } from "../types.js";
import type { BlueprintGroundTruth } from "./data.js";

const WEIGHTS = { precision: 0.35, recall: 0.35, speed: 0.15, methodology: 0.15 };
const TIME_LIMIT = 300;

export function scoreBlueprint(input: ScoringInput): ScoreResult {
  const { submission, groundTruth: gt, startedAt, submittedAt } = input;
  const groundTruth = gt as unknown as BlueprintGroundTruth;

  // === Precision (0-1000 raw) ===
  // Of violations reported by the agent, how many match ground truth?
  const submittedViolations = Array.isArray(submission.violations)
    ? (submission.violations as Array<{
        blueprint_id?: string;
        rule_id?: string;
        violation_type?: string;
        location?: string;
        description?: string;
      }>)
    : [];

  let truePositives = 0;
  const matchedGtIndices = new Set<number>();

  for (const reported of submittedViolations) {
    if (!reported.blueprint_id) continue;

    for (let i = 0; i < groundTruth.violations.length; i++) {
      if (matchedGtIndices.has(i)) continue;
      const gtViolation = groundTruth.violations[i];

      // Match by blueprint_id + violation_type OR blueprint_id + rule_id
      const bpMatch = reported.blueprint_id === gtViolation.blueprint_id;
      const typeMatch = reported.violation_type === gtViolation.violation_type;
      const ruleMatch = reported.rule_id === gtViolation.rule_id;

      if (bpMatch && (typeMatch || ruleMatch)) {
        truePositives++;
        matchedGtIndices.add(i);
        break;
      }
    }
  }

  const precisionRaw = submittedViolations.length > 0
    ? Math.round((truePositives / submittedViolations.length) * 1000)
    : 0;

  // === Recall (0-1000 raw) ===
  // Of ground truth violations, how many did the agent find?
  // Points per violation: 1000 / numViolations
  let recallHits = 0;
  for (const gtViolation of groundTruth.violations) {
    const found = submittedViolations.some((r) => {
      if (r.blueprint_id !== gtViolation.blueprint_id) return false;
      return r.violation_type === gtViolation.violation_type || r.rule_id === gtViolation.rule_id;
    });
    if (found) recallHits++;
  }

  const recallRaw = groundTruth.violations.length > 0
    ? Math.round((recallHits / groundTruth.violations.length) * 1000)
    : 0;

  // === Speed (0-1000 raw) ===
  const elapsedSecs = (submittedAt.getTime() - startedAt.getTime()) / 1000;
  const speedRaw = elapsedSecs >= TIME_LIMIT ? 0 : Math.round(1000 * (1 - elapsedSecs / TIME_LIMIT));

  // === Methodology (0-1000 raw) ===
  let methodologyRaw: number;
  if (submission.methodology || submission.reasoning || submission.approach) {
    methodologyRaw = 1000;
  } else {
    const answerKeys = Object.keys(submission).filter(k => submission[k] !== null && submission[k] !== undefined);
    methodologyRaw = answerKeys.length > 0 ? 600 : 400;
  }

  // Weighted total
  const precision = Math.round(precisionRaw * WEIGHTS.precision);
  const recall = Math.round(recallRaw * WEIGHTS.recall);
  const speed = Math.round(speedRaw * WEIGHTS.speed);
  const methodology = Math.round(methodologyRaw * WEIGHTS.methodology);
  const total = Math.min(MAX_SCORE, precision + recall + speed + methodology);

  return { breakdown: { precision, recall, speed, methodology, total } };
}
