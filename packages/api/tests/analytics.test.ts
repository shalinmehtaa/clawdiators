import { describe, it, expect } from "vitest";
import type { ChallengeAnalytics } from "@clawdiators/shared";

describe("ChallengeAnalytics type", () => {
  it("accepts valid analytics data", () => {
    const analytics: ChallengeAnalytics = {
      challenge_slug: "cipher-forge",
      total_attempts: 150,
      completed_count: 120,
      completion_rate: 0.8,
      median_score: 650,
      mean_score: 612.5,
      score_p25: 450,
      score_p75: 800,
      win_rate: 0.35,
      avg_duration_secs: 85.3,
      score_distribution: [
        { bucket: "0-99", count: 5 },
        { bucket: "100-199", count: 8 },
        { bucket: "200-299", count: 12 },
        { bucket: "300-399", count: 15 },
        { bucket: "400-499", count: 20 },
        { bucket: "500-599", count: 18 },
        { bucket: "600-699", count: 15 },
        { bucket: "700-799", count: 14 },
        { bucket: "800-899", count: 10 },
        { bucket: "900-999", count: 3 },
      ],
      score_by_harness: {
        "claude-code": { mean: 720.5, median: 750, count: 45 },
        "custom-scaffold": { mean: 580.2, median: 560, count: 30 },
      },
      score_by_model: {
        "claude-opus-4-6": { mean: 780.1, median: 800, count: 25 },
        "gpt-4": { mean: 650.0, median: 640, count: 20 },
      },
      score_trend: [
        { date: "2026-02-20", mean_score: 550.0, count: 10 },
        { date: "2026-02-21", mean_score: 600.0, count: 15 },
        { date: "2026-02-22", mean_score: 620.0, count: 12 },
        { date: "2026-02-23", mean_score: 650.0, count: 18 },
      ],
      computed_at: "2026-02-27T10:00:00.000Z",
    };

    expect(analytics.challenge_slug).toBe("cipher-forge");
    expect(analytics.total_attempts).toBe(150);
    expect(analytics.completion_rate).toBe(0.8);
    expect(analytics.score_distribution).toHaveLength(10);
    expect(analytics.score_by_harness["claude-code"].mean).toBe(720.5);
    expect(analytics.score_trend).toHaveLength(4);
  });

  it("handles empty analytics", () => {
    const analytics: ChallengeAnalytics = {
      challenge_slug: "new-challenge",
      total_attempts: 0,
      completed_count: 0,
      completion_rate: 0,
      median_score: null,
      mean_score: null,
      score_p25: null,
      score_p75: null,
      win_rate: 0,
      avg_duration_secs: null,
      score_distribution: [],
      score_by_harness: {},
      score_by_model: {},
      score_trend: [],
      computed_at: "2026-02-27T10:00:00.000Z",
    };

    expect(analytics.total_attempts).toBe(0);
    expect(analytics.median_score).toBeNull();
    expect(analytics.score_distribution).toHaveLength(0);
  });

  it("score distribution buckets are contiguous", () => {
    const dist = [
      { bucket: "0-99", count: 5 },
      { bucket: "100-199", count: 8 },
      { bucket: "200-299", count: 12 },
    ];

    // Verify buckets cover the expected range
    const starts = dist.map((d) => parseInt(d.bucket.split("-")[0]));
    for (let i = 1; i < starts.length; i++) {
      expect(starts[i] - starts[i - 1]).toBe(100);
    }
  });
});
