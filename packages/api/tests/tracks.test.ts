import { describe, it, expect } from "vitest";
import type { TrackScoringMethod } from "@clawdiators/shared";

// Track scoring logic (mirrors track progress update in matches.ts)
function computeCumulativeScore(
  bestScores: Record<string, number>,
  challengeSlugs: string[],
  method: TrackScoringMethod,
): number {
  const scores = challengeSlugs
    .map((slug) => bestScores[slug])
    .filter((s): s is number => s !== undefined);

  if (scores.length === 0) return 0;

  switch (method) {
    case "sum":
      return scores.reduce((a, b) => a + b, 0);
    case "average":
      return scores.reduce((a, b) => a + b, 0) / scores.length;
    case "min":
      return Math.min(...scores);
    default:
      return scores.reduce((a, b) => a + b, 0);
  }
}

function isTrackCompleted(
  completedSlugs: string[],
  challengeSlugs: string[],
): boolean {
  return challengeSlugs.every((slug) => completedSlugs.includes(slug));
}

describe("Track scoring", () => {
  const challengeSlugs = ["cipher-forge", "reef-refactor", "depth-first-gen"];

  it("sum scoring adds all best scores", () => {
    const bestScores = { "cipher-forge": 800, "reef-refactor": 600, "depth-first-gen": 700 };
    expect(computeCumulativeScore(bestScores, challengeSlugs, "sum")).toBe(2100);
  });

  it("average scoring computes mean of completed challenges", () => {
    const bestScores = { "cipher-forge": 900, "reef-refactor": 600 };
    expect(computeCumulativeScore(bestScores, challengeSlugs, "average")).toBe(750);
  });

  it("min scoring returns lowest best score", () => {
    const bestScores = { "cipher-forge": 800, "reef-refactor": 400, "depth-first-gen": 700 };
    expect(computeCumulativeScore(bestScores, challengeSlugs, "min")).toBe(400);
  });

  it("returns 0 when no scores exist", () => {
    expect(computeCumulativeScore({}, challengeSlugs, "sum")).toBe(0);
  });

  it("partial scores only count completed challenges", () => {
    const bestScores = { "cipher-forge": 500 };
    expect(computeCumulativeScore(bestScores, challengeSlugs, "sum")).toBe(500);
  });
});

describe("Track completion", () => {
  const challengeSlugs = ["cipher-forge", "reef-refactor", "depth-first-gen"];

  it("marks track as completed when all challenges done", () => {
    expect(isTrackCompleted(["cipher-forge", "reef-refactor", "depth-first-gen"], challengeSlugs)).toBe(true);
  });

  it("not completed with partial progress", () => {
    expect(isTrackCompleted(["cipher-forge", "reef-refactor"], challengeSlugs)).toBe(false);
  });

  it("not completed with empty progress", () => {
    expect(isTrackCompleted([], challengeSlugs)).toBe(false);
  });

  it("completed even with extra slugs", () => {
    expect(isTrackCompleted(["cipher-forge", "reef-refactor", "depth-first-gen", "archive-dive"], challengeSlugs)).toBe(true);
  });
});

describe("Track definitions", () => {
  it("TrackScoringMethod type allows sum, average, min", () => {
    const methods: TrackScoringMethod[] = ["sum", "average", "min"];
    expect(methods).toHaveLength(3);
    expect(methods).toContain("sum");
    expect(methods).toContain("average");
    expect(methods).toContain("min");
  });
});
