// @source-hash e22902bc96c2a73620d347b12ffc7d9b8a8cad9fb4acada801b0c778affeda60
/**
 * Scorer for the autoresearch challenge.
 *
 * Scores are primarily based on val_bpb from the training service metrics.
 * The scorer reads serviceMetrics from the training-lab container to get
 * the best val_bpb achieved and the run history.
 *
 * Secondary dimensions score methodology (experiment log quality) and
 * analysis (improvement efficiency).
 */
import type { ScoringInput, ScoreResult } from "../types.js";
export declare function scoreAutoresearch(input: ScoringInput): ScoreResult;
