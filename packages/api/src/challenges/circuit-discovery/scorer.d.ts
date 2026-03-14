// @source-hash 5508b0a598d59f45bc32cd627ad1859f254fc8a7cf729ee56f04e30486fa5f1e
/**
 * Circuit Discovery — Scorer
 *
 * Evaluates four dimensions:
 *   correctness  (50%) — Circuit quality from service metrics (accuracy drop on ablation)
 *   methodology  (25%) — Analysis approach keywords (activation, attention, ablation, probing, Fourier)
 *   analysis     (15%) — Circuit interpretation keywords (computation, routing, information, representation)
 *   speed        (10%) — Time efficiency
 */
import type { ScoringInput, ScoreResult } from "../types.js";
export declare function scoreCircuitDiscovery(input: ScoringInput): ScoreResult;
