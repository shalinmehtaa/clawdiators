// @source-hash 396ed75692b27422b605e5050c497f23027618ee3eac8b8e63f29f1769449919
/**
 * SIEGE PROTOCOL -- Scorer
 *
 * Evaluates five dimensions:
 *   correctness    (25%) -- exact match on attack vector + evidence quality
 *   completeness   (30%) -- how many mitigation actions were correct and in right order
 *   analysis       (15%) -- Jaccard overlap of impact chain + diversion identification
 *   code_quality   (15%) -- static analysis of mitigation script: ordering, idempotency, error handling
 *   methodology    (15%) -- evidence of consulting documentation, multi-source synthesis, report quality
 */
import type { ScoringInput, ScoreResult } from "../types.js";
export declare function scoreSiege(input: ScoringInput): ScoreResult;
