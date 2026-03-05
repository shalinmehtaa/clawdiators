import { describe, it, expect } from "vitest";
import { computeTrackScore, resolveTrackSlugs, resolveTrackMaxScore } from "../src/services/tracks.js";

describe("computeTrackScore()", () => {
  it("sum: adds all scores", () => {
    expect(computeTrackScore({ a: 800, b: 600, c: 700 }, "sum")).toBe(2100);
  });

  it("average: mean of all scores", () => {
    expect(computeTrackScore({ a: 900, b: 600 }, "average")).toBe(750);
  });

  it("min: lowest score wins", () => {
    expect(computeTrackScore({ a: 800, b: 400, c: 700 }, "min")).toBe(400);
  });

  it("returns 0 when bestScores is empty", () => {
    expect(computeTrackScore({}, "sum")).toBe(0);
    expect(computeTrackScore({}, "average")).toBe(0);
    expect(computeTrackScore({}, "min")).toBe(0);
  });

  it("single score: all methods return that score", () => {
    expect(computeTrackScore({ only: 500 }, "sum")).toBe(500);
    expect(computeTrackScore({ only: 500 }, "average")).toBe(500);
    expect(computeTrackScore({ only: 500 }, "min")).toBe(500);
  });

  it("average rounds correctly for non-integer results", () => {
    // 100 + 200 + 300 = 600 / 3 = 200
    expect(computeTrackScore({ a: 100, b: 200, c: 300 }, "average")).toBeCloseTo(200, 5);
  });

  it("min returns 0 when any score is 0", () => {
    expect(computeTrackScore({ a: 500, b: 0 }, "min")).toBe(0);
  });
});

const CHALLENGES = [
  { slug: "reef-refactor", category: "coding", active: true, maxScore: 1000 },
  { slug: "codebase-archaeology", category: "coding", active: true, maxScore: 1000 },
  { slug: "cipher-forge", category: "reasoning", active: true, maxScore: 1000 },
  { slug: "archive-dive", category: "context", active: true, maxScore: 1000 },
  { slug: "retired-one", category: "coding", active: false, maxScore: 1000 },
];

describe("resolveTrackSlugs()", () => {
  it("returns static slugs when rule is null", () => {
    expect(resolveTrackSlugs(null, ["cipher-forge"], CHALLENGES)).toEqual(["cipher-forge"]);
  });

  it("returns all active challenges for match: all", () => {
    const slugs = resolveTrackSlugs({ match: "all" }, [], CHALLENGES);
    expect(slugs).toHaveLength(4);
    expect(slugs).not.toContain("retired-one");
  });

  it("filters by category", () => {
    const slugs = resolveTrackSlugs({ match: "category", categories: ["coding"] }, [], CHALLENGES);
    expect(slugs).toEqual(["reef-refactor", "codebase-archaeology"]);
  });

  it("supports multiple categories", () => {
    const slugs = resolveTrackSlugs({ match: "category", categories: ["coding", "reasoning"] }, [], CHALLENGES);
    expect(slugs).toHaveLength(3);
    expect(slugs).toContain("cipher-forge");
  });

  it("excludes inactive challenges from category matches", () => {
    const slugs = resolveTrackSlugs({ match: "category", categories: ["coding"] }, [], CHALLENGES);
    expect(slugs).not.toContain("retired-one");
  });
});

describe("resolveTrackMaxScore()", () => {
  it("sums max scores for resolved slugs", () => {
    expect(resolveTrackMaxScore(["reef-refactor", "cipher-forge"], CHALLENGES)).toBe(2000);
  });

  it("returns 0 for empty slugs", () => {
    expect(resolveTrackMaxScore([], CHALLENGES)).toBe(0);
  });
});
