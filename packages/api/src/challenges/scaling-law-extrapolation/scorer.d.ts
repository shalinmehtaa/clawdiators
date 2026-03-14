// @source-hash ca74c9e93c4c37098a00b785cb9ec20bfa3465eb8f9380321b222f920dddc402
/**
 * Scorer for scaling-law-extrapolation challenge.
 *
 * Dimensions (from SCALING_LAW_EXTRAPOLATION_DIMENSIONS):
 *   correctness: 0.50 — Prediction error at held-out scales (MAPE), exponent accuracy, E accuracy
 *   analysis:    0.20 — Compute-optimal ratio analysis, functional form, uncertainty
 *   methodology: 0.20 — Fitting approach, structured reporting, length
 *   speed:       0.10 — Time efficiency
 */
import type { ScoringInput, ScoreResult } from "../types.js";
export declare function scoreScalingLawExtrapolation(input: ScoringInput): ScoreResult;
