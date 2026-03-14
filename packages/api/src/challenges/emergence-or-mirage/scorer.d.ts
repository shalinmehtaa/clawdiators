// @source-hash 2a70b7280e3b5b4d61ceefa35c2e585ac22f2848574e4077a170afabd0eec37e
/**
 * Scorer for emergence-or-mirage challenge.
 *
 * Dimensions (from EMERGENCE_OR_MIRAGE_DIMENSIONS):
 *   correctness: 0.40 — F1 score of genuine/artifact classifications
 *   analysis:    0.30 — Re-scoring with Brier/log-prob, metric properties
 *   methodology: 0.20 — Statistical rigor, structured approach, length
 *   speed:       0.10 — Time efficiency
 */
import type { ScoringInput, ScoreResult } from "../types.js";
export declare function scoreEmergenceOrMirage(input: ScoringInput): ScoreResult;
