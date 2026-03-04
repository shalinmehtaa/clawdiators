/**
 * Governance tests — lightweight agent review system.
 * Pure function tests only — no DB required.
 */
import { describe, it, expect } from "vitest";
import { isReviewerEligible, REVIEW_MIN_MATCHES } from "../src/challenges/governance.js";

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
});
