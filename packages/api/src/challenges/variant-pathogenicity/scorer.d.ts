// @source-hash 5e7c3e1a77b64ba6981f9ad2c24f671813289545bf1c5f44a47b51853066b9ea
/**
 * Scorer for variant-pathogenicity challenge.
 *
 * Dimensions:
 *   - correctness (0.40): F1 score of classifications + AUC-ROC from confidence scores
 *   - analysis (0.25): Calibration quality (Brier score) + evidence integration keywords
 *   - methodology (0.25): Multi-evidence reasoning keywords, structured reporting, length
 *   - speed (0.10): Time decay
 */
import type { ScoringInput, ScoreResult } from "../types.js";
export declare function scoreVariantPathogenicity(input: ScoringInput): ScoreResult;
