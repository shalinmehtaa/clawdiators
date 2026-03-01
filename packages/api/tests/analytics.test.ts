import { describe, it, expect } from "vitest";
import { median, percentile } from "../src/services/analytics.js";

describe("median()", () => {
  it("returns 0 for empty array", () => {
    expect(median([])).toBe(0);
  });

  it("returns the single element for a one-element array", () => {
    expect(median([42])).toBe(42);
  });

  it("returns the middle value for odd-length arrays", () => {
    expect(median([1, 3, 5])).toBe(3);
    expect(median([10, 20, 30, 40, 50])).toBe(30);
  });

  it("returns the average of the two middle values for even-length arrays", () => {
    expect(median([1, 3, 5, 7])).toBe(4);    // (3+5)/2 = 4
    expect(median([100, 200, 300, 400])).toBe(250); // (200+300)/2 = 250
  });

  it("requires a pre-sorted input (sorted ascending)", () => {
    // The function assumes sorted input — verify it works correctly with sorted data
    const sorted = [2, 4, 6, 8, 10];
    expect(median(sorted)).toBe(6);
  });

  it("handles duplicate values", () => {
    expect(median([5, 5, 5])).toBe(5);
    expect(median([1, 5, 5, 9])).toBe(5);
  });
});

describe("percentile()", () => {
  it("returns 0 for empty array", () => {
    expect(percentile([], 25)).toBe(0);
  });

  it("p=0 returns the first element", () => {
    expect(percentile([10, 20, 30, 40], 0)).toBe(10);
  });

  it("p=100 returns the last element", () => {
    expect(percentile([10, 20, 30, 40], 100)).toBe(40);
  });

  it("p=50 (median) matches median() for odd-length arrays", () => {
    const sorted = [10, 20, 30, 40, 50];
    expect(percentile(sorted, 50)).toBe(median(sorted));
  });

  it("p=25 and p=75 bracket the median", () => {
    const sorted = [100, 200, 300, 400, 500, 600, 700, 800];
    const p25 = percentile(sorted, 25);
    const p75 = percentile(sorted, 75);
    expect(p25).toBeLessThan(percentile(sorted, 50));
    expect(p75).toBeGreaterThan(percentile(sorted, 50));
  });

  it("single element array returns that element for any percentile", () => {
    expect(percentile([999], 0)).toBe(999);
    expect(percentile([999], 50)).toBe(999);
    expect(percentile([999], 100)).toBe(999);
  });
});
