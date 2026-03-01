import { describe, it, expect } from "vitest";
import { computeScoreTrend, formatMemoryBlock } from "../src/services/memory.js";
import type { ChallengeMemory } from "@clawdiators/shared";
import { CHALLENGE_MEMORY_MAX_NOTES_LENGTH, CHALLENGE_MEMORY_MAX_STRATEGIES } from "@clawdiators/shared";

// ── computeScoreTrend() ──────────────────────────────────────────────

describe("computeScoreTrend()", () => {
  it("returns null for empty array", () => {
    expect(computeScoreTrend([])).toBeNull();
  });

  it("returns null for single score", () => {
    expect(computeScoreTrend([700])).toBeNull();
  });

  it("returns improving for two strictly ascending scores", () => {
    expect(computeScoreTrend([600, 750])).toBe("improving");
  });

  it("returns declining for two strictly descending scores", () => {
    expect(computeScoreTrend([800, 500])).toBe("declining");
  });

  it("returns plateau for spread ≤ 50 across two scores", () => {
    expect(computeScoreTrend([700, 730])).toBe("plateau");
  });

  it("returns improving for three ascending scores", () => {
    expect(computeScoreTrend([500, 650, 800])).toBe("improving");
  });

  it("returns declining for three descending scores", () => {
    expect(computeScoreTrend([800, 650, 500])).toBe("declining");
  });

  it("returns plateau when last 3 scores have spread ≤ 50 (plateau wins over improving)", () => {
    // Rolling window is last 3: [710, 720, 730] — spread 20 → plateau
    expect(computeScoreTrend([400, 710, 720, 730])).toBe("plateau");
  });

  it("uses only last 3 scores (rolling window) — returns improving when spread > 50", () => {
    // Last 3: [600, 750, 900] — spread 300, all ascending → improving
    expect(computeScoreTrend([200, 300, 600, 750, 900])).toBe("improving");
  });

  it("returns plateau when scores are equal (spread = 0)", () => {
    expect(computeScoreTrend([600, 600, 600])).toBe("plateau");
  });

  it("returns plateau when spread > 50 but mixed direction", () => {
    // [600, 900, 750] — not all ascending, not all descending, spread 300
    expect(computeScoreTrend([600, 900, 750])).toBe("plateau");
  });
});

// ── formatMemoryBlock() ──────────────────────────────────────────────

function makeMemory(overrides: Partial<ChallengeMemory> = {}): ChallengeMemory {
  return {
    challenge_slug: "cipher-forge",
    attempt_count: 0,
    best_score: null,
    avg_score: null,
    last_attempted_at: null,
    score_trend: null,
    best_score_breakdown: null,
    best_match_id: null,
    notes: null,
    strategies: [],
    ...overrides,
  };
}

describe("formatMemoryBlock()", () => {
  it("shows no prior attempts when attempt_count is 0", () => {
    const block = formatMemoryBlock(makeMemory({ attempt_count: 0 }), null);
    expect(block).toContain("No prior attempts on this challenge");
  });

  it("shows no prior attempts when challengeMemory is null", () => {
    const block = formatMemoryBlock(null, null);
    expect(block).toContain("No prior attempts on this challenge");
  });

  it("shows attempt count and best score", () => {
    const block = formatMemoryBlock(
      makeMemory({ attempt_count: 3, best_score: 720 }),
      null,
    );
    expect(block).toContain("Attempts**: 3");
    expect(block).toContain("Best score**: 720");
  });

  it("shows trend arrow for improving", () => {
    const block = formatMemoryBlock(
      makeMemory({ attempt_count: 2, best_score: 800, score_trend: "improving" }),
      null,
    );
    expect(block).toContain("↑ improving");
  });

  it("shows trend arrow for declining", () => {
    const block = formatMemoryBlock(
      makeMemory({ attempt_count: 2, best_score: 600, score_trend: "declining" }),
      null,
    );
    expect(block).toContain("↓ declining");
  });

  it("shows trend arrow for plateau", () => {
    const block = formatMemoryBlock(
      makeMemory({ attempt_count: 3, best_score: 700, score_trend: "plateau" }),
      null,
    );
    expect(block).toContain("→ plateau");
  });

  it("shows breakdown when present", () => {
    const block = formatMemoryBlock(
      makeMemory({
        attempt_count: 2,
        best_score: 800,
        best_score_breakdown: { total: 800, decryption_accuracy: 850, speed: 700 },
      }),
      null,
    );
    expect(block).toContain("Best breakdown");
    expect(block).toContain("decryption_accuracy: 850");
    expect(block).not.toContain("total:"); // 'total' key excluded
  });

  it("shows agent notes when present", () => {
    const block = formatMemoryBlock(
      makeMemory({
        attempt_count: 2,
        notes: "Use frequency analysis first.",
      }),
      null,
    );
    expect(block).toContain("Your notes");
    expect(block).toContain("Use frequency analysis first.");
  });

  it("does not show notes section when notes is null", () => {
    const block = formatMemoryBlock(
      makeMemory({ attempt_count: 2, notes: null }),
      null,
    );
    expect(block).not.toContain("Your notes");
  });

  it("shows arena intelligence when analytics provided", () => {
    const block = formatMemoryBlock(makeMemory(), {
      median_score: 540,
      win_rate: 0.34,
      score_by_attempt: {},
    });
    expect(block).toContain("Arena Intelligence");
    expect(block).toContain("Median score**: 540");
    expect(block).toContain("Win rate**: 34%");
  });

  it("shows no arena data when analytics is null", () => {
    const block = formatMemoryBlock(makeMemory(), null);
    expect(block).toContain("No arena data yet for this challenge");
  });

  it("shows learning curve comparison when attempt data is present", () => {
    const block = formatMemoryBlock(makeMemory(), {
      median_score: 540,
      win_rate: 0.34,
      score_by_attempt: {
        "1": { mean: 520 },
        "3": { mean: 680 },
      },
    });
    expect(block).toContain("3+ attempts average 680");
    expect(block).toContain("520 on first attempt");
  });

  it("always starts with ## Memory heading", () => {
    const block = formatMemoryBlock(null, null);
    expect(block.startsWith("## Memory")).toBe(true);
  });
});

// ── Constants ────────────────────────────────────────────────────────

describe("CHALLENGE_MEMORY constants", () => {
  it("CHALLENGE_MEMORY_MAX_NOTES_LENGTH is 2000", () => {
    expect(CHALLENGE_MEMORY_MAX_NOTES_LENGTH).toBe(2000);
  });

  it("CHALLENGE_MEMORY_MAX_STRATEGIES is 10", () => {
    expect(CHALLENGE_MEMORY_MAX_STRATEGIES).toBe(10);
  });
});
