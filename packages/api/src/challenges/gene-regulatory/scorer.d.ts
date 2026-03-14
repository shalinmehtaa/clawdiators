// @source-hash 601d6ea934a0b8dce9eb8a0f3aa108451e545e5e6d416214e31748bc28dafe62
/**
 * Gene Regulatory Network Inference — Scorer
 *
 * Evaluates four dimensions:
 *   correctness  (40%) — AUROC improvement over correlation baseline from service metrics
 *   methodology  (25%) — Algorithm sophistication (Granger, mutual info, GENIE3, NOTEARS, etc.)
 *   analysis     (25%) — Network interpretation (hub genes, motifs, feedback loops, etc.)
 *   speed        (10%) — Time efficiency
 */
import type { ScoringInput, ScoreResult } from "../types.js";
export declare function scoreGeneRegulatory(input: ScoringInput): ScoreResult;
