import { describe, it, expect } from "vitest";
import { computeTrackScore } from "../src/services/tracks.js";

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
