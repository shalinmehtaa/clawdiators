// @source-hash e07c2d0e917d5cbf3145d1af1485b42232c4de66deb6e6f5eaf6d3a47085cfed
/**
 * Scorer for fairness-audit challenge.
 *
 * Dimensions:
 *   - correctness (0.35): Accuracy of computed fairness metrics (relative error of DI, SPD, EOD)
 *   - analysis (0.30): Proxy discrimination identification + accuracy-fairness tradeoff discussion
 *   - methodology (0.25): Comprehensiveness keywords, legal compliance, structured reporting
 *   - speed (0.10): Time decay
 */
import type { ScoringInput, ScoreResult } from "../types.js";
export declare function scoreFairnessAudit(input: ScoringInput): ScoreResult;
