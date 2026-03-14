// @source-hash ad907839c5d3d6b18cf10e809dfc98706f0bcd4fe5b5d53932084892d3996745
/**
 * Scorer for forecasting-shift challenge.
 *
 * Dimensions (weights applied externally by the module):
 *   correctness  0.40 — RMSE of point forecasts, calibration of prediction intervals
 *   analysis     0.25 — regime detection accuracy, leading indicator identification
 *   methodology  0.25 — model choice keywords, shift handling, structured reporting
 *   speed        0.10 — time decay over 1500s
 */
import type { ScoringInput, ScoreResult } from "../types.js";
export declare function scoreForecastingShift(input: ScoringInput): ScoreResult;
