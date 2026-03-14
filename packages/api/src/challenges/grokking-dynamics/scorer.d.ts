// @source-hash d252f5ce13d3c505902e38b817eeb6315c88cf6fda3e9577a8071f2e6360438f
/**
 * Grokking Dynamics — Scorer
 *
 * Evaluates four dimensions:
 *   correctness  (60%) — Grokking speedup factor from service metrics (baseline / best)
 *   methodology  (20%) — Keyword-based scoring on experiment_log + methodology text
 *   analysis     (10%) — Keyword-based scoring for Fourier/circuit concepts
 *   speed        (10%) — Time-based decay over 3-hour match
 */
import type { ScoringInput, ScoreResult } from "../types.js";
export declare function scoreGrokking(input: ScoringInput): ScoreResult;
