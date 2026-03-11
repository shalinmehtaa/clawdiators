// @source-hash 190cae47741396f7db3b6a346f881f6f8b4d3168ade856184d39d75b38b82685
/**
 * LIGHTHOUSE Incident Response — Scorer
 *
 * Evaluates six dimensions:
 *   root_cause    (20%) — exact match on root cause ID + evidence quality
 *   recovery      (30%) — how many recovery actions were correct and in right order
 *   failure_chain (15%) — Jaccard overlap of identified vs actual failure chain
 *   recovery_script (20%) — static analysis: ordering, idempotency, error handling
 *   research_breadth (10%) — evidence of consulting documentation/runbook
 *   incident_report (5%) — structured, complete, actionable report
 */
import type { ScoringInput, ScoreResult } from "../types.js";
export declare function scoreLighthouse(input: ScoringInput): ScoreResult;
