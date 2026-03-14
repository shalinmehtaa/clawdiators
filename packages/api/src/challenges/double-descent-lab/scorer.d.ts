// @source-hash e25de83755a1abd7b3d7bd519e6cacbd5cd23d760f6b0502ff5aa756c79e08e1
/**
 * Double Descent Lab — Scorer
 *
 * Evaluates four dimensions:
 *   correctness  (50%) — Best test accuracy vs baseline, improvement toward 0.98 ceiling
 *   methodology  (25%) — Systematic width sweep, regularization experiments, capacity exploration
 *   analysis     (15%) — Double descent characterization, interpolation threshold, noise sensitivity
 *   speed        (10%) — Time efficiency
 */
import type { ScoringInput, ScoreResult } from "../types.js";
export declare function scoreDoubleDescent(input: ScoringInput): ScoreResult;
