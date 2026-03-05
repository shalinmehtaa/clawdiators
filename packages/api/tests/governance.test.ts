/**
 * Governance tests — lightweight agent review system.
 * Pure function tests only — no DB required.
 */
import { describe, it, expect } from "vitest";
import {
  isReviewerEligible,
  REVIEW_MIN_MATCHES,
  REVIEW_APPROVAL_THRESHOLD,
  countApprovals,
  isReviewerIndependent,
} from "../src/challenges/governance.js";
import type { ReviewHistoryEntry } from "@clawdiators/shared";

describe("Agent Review Governance", () => {
  describe("isReviewerEligible", () => {
    it("returns false for agents below threshold", () => {
      expect(isReviewerEligible({ matchCount: 0 })).toBe(false);
      expect(isReviewerEligible({ matchCount: 2 })).toBe(false);
      expect(isReviewerEligible({ matchCount: 4 })).toBe(false);
    });

    it("returns true at the threshold", () => {
      expect(isReviewerEligible({ matchCount: REVIEW_MIN_MATCHES })).toBe(true);
    });

    it("returns true above the threshold", () => {
      expect(isReviewerEligible({ matchCount: 15 })).toBe(true);
      expect(isReviewerEligible({ matchCount: 100 })).toBe(true);
    });
  });

  describe("REVIEW_MIN_MATCHES constant", () => {
    it("is 5", () => {
      expect(REVIEW_MIN_MATCHES).toBe(5);
    });
  });

  describe("REVIEW_APPROVAL_THRESHOLD constant", () => {
    it("is 1", () => {
      expect(REVIEW_APPROVAL_THRESHOLD).toBe(1);
    });
  });

  describe("countApprovals", () => {
    it("returns 0 for empty history", () => {
      expect(countApprovals([])).toBe(0);
    });

    it("returns 0 when all entries are rejections", () => {
      const history: ReviewHistoryEntry[] = [
        { reviewerAgentId: "a1", verdict: "reject", reason: "not great", reviewedAt: "2026-01-01T00:00:00Z" },
        { reviewerAgentId: "a2", verdict: "reject", reason: "not great", reviewedAt: "2026-01-02T00:00:00Z" },
      ];
      expect(countApprovals(history)).toBe(0);
    });

    it("counts distinct approvers", () => {
      const history: ReviewHistoryEntry[] = [
        { reviewerAgentId: "a1", verdict: "approve", reason: "looks good", reviewedAt: "2026-01-01T00:00:00Z" },
        { reviewerAgentId: "a2", verdict: "reject", reason: "not great", reviewedAt: "2026-01-02T00:00:00Z" },
        { reviewerAgentId: "a3", verdict: "approve", reason: "nice work", reviewedAt: "2026-01-03T00:00:00Z" },
      ];
      expect(countApprovals(history)).toBe(2);
    });

    it("deduplicates same agent approving twice", () => {
      const history: ReviewHistoryEntry[] = [
        { reviewerAgentId: "a1", verdict: "approve", reason: "looks good", reviewedAt: "2026-01-01T00:00:00Z" },
        { reviewerAgentId: "a1", verdict: "approve", reason: "still good", reviewedAt: "2026-01-02T00:00:00Z" },
      ];
      expect(countApprovals(history)).toBe(1);
    });
  });

  describe("isReviewerIndependent", () => {
    it("rejects self-review", () => {
      const result = isReviewerIndependent("author-1", "author-1", []);
      expect(result.ok).toBe(false);
      expect(result.reason).toContain("Self-review");
    });

    it("rejects duplicate reviewers", () => {
      const result = isReviewerIndependent("reviewer-1", "author-1", ["reviewer-1"]);
      expect(result.ok).toBe(false);
      expect(result.reason).toContain("already reviewed");
    });

    it("allows independent reviewer", () => {
      const result = isReviewerIndependent("reviewer-2", "author-1", ["reviewer-1"]);
      expect(result.ok).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it("allows first reviewer", () => {
      const result = isReviewerIndependent("reviewer-1", "author-1", []);
      expect(result.ok).toBe(true);
    });
  });
});
