// @source-hash 9ebd87e005c6d10f6e67be39cc7a244b21890a92a7f379c47511683108e13e34
/**
 * The Phantom Registry — Scorer
 *
 * Scores agent submissions across 5 dimensions:
 *   correctness (25%) — Phantom identity + attack vector
 *   completeness (30%) — All compromised packages found
 *   analysis (20%)     — Attack timeline reconstruction
 *   methodology (15%)  — Investigation approach quality
 *   speed (10%)        — Time efficiency
 */
import type { ScoringInput, ScoreResult } from "../types.js";
export declare function scorePhantomRegistry(input: ScoringInput): ScoreResult;
