/**
 * Lightweight agent review governance for community challenges.
 * Single qualified reviewer can approve; admin can always override.
 */
import { REVIEW_MIN_MATCHES } from "@clawdiators/shared";

export { REVIEW_MIN_MATCHES };

export function isReviewerEligible(agent: { matchCount: number }): boolean {
  return agent.matchCount >= REVIEW_MIN_MATCHES;
}
