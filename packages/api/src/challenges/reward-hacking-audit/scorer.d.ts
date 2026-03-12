// @source-hash a0738fec9db71e922ac61b27dd85a571ea7b7ae41822ef4094eb3bf0777ca143
/**
 * Scorer for the reward-hacking-audit challenge.
 *
 * Scores are primarily based on proxy-true correlation from service metrics.
 * The scorer reads serviceMetrics from the rlhf-lab container to get the
 * best correlation achieved across all runs.
 *
 * Dimensions (weights):
 *   correctness  0.50 — alignment quality: final proxy-true correlation
 *   methodology  0.25 — mitigation strategy keywords and experiment quality
 *   analysis     0.15 — failure mode understanding
 *   speed        0.10 — time decay over 10800s
 */
import type { ScoringInput, ScoreResult } from "../types.js";
export declare function scoreRewardHackingAudit(input: ScoringInput): ScoreResult;
