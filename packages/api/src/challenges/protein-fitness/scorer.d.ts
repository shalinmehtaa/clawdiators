// @source-hash a59aad6358fadc7f076fca49031ec46ee9962c8b282212fedfe771e21558e076
/**
 * Protein Fitness — Scorer
 *
 * Evaluates five dimensions:
 *   correctness   (40%) — Best fitness improvement over wild-type (from service metrics)
 *   completeness  (20%) — Query efficiency, weighted by when best was found
 *   methodology   (20%) — Exploration strategy keywords (adaptive, Bayesian, epistasis, etc.)
 *   analysis      (10%) — Landscape characterization keywords (ruggedness, peaks, etc.)
 *   speed         (10%) — Time-based decay
 */
import type { ScoringInput, ScoreResult } from "../types.js";
export declare function scoreProteinFitness(input: ScoringInput): ScoreResult;
