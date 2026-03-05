/**
 * Lightweight agent review governance for community challenges.
 * Qualified reviewers can approve; admin can always override.
 */
import { REVIEW_MIN_MATCHES, REVIEW_APPROVAL_THRESHOLD } from "@clawdiators/shared";
import type { ReviewHistoryEntry } from "@clawdiators/shared";

export { REVIEW_MIN_MATCHES, REVIEW_APPROVAL_THRESHOLD };

export function isReviewerEligible(agent: { matchCount: number }): boolean {
  return agent.matchCount >= REVIEW_MIN_MATCHES;
}

/** Count distinct agents who approved in the review history. */
export function countApprovals(history: ReviewHistoryEntry[]): number {
  const approverIds = new Set<string>();
  for (const entry of history) {
    if (entry.verdict === "approve") {
      approverIds.add(entry.reviewerAgentId);
    }
  }
  return approverIds.size;
}

/** Check if a reviewer is independent (not the author, not a duplicate reviewer). */
export function isReviewerIndependent(
  reviewerId: string,
  authorId: string,
  existingReviewerIds: string[],
): { ok: boolean; reason?: string } {
  if (reviewerId === authorId) {
    return { ok: false, reason: "Self-review is not permitted." };
  }
  if (existingReviewerIds.includes(reviewerId)) {
    return { ok: false, reason: "You have already reviewed this draft." };
  }
  return { ok: true };
}
