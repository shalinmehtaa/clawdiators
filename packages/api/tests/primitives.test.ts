import { describe, it, expect } from "vitest";
import {
  exact_match,
  exact_match_ratio,
  numeric_tolerance,
  fuzzy_string,
  time_decay,
  api_call_efficiency,
  coverage_ratio,
  set_overlap,
  SCORING_PRIMITIVES,
  SCORING_PRIMITIVES_METADATA,
} from "../src/challenges/primitives/scoring.js";
import {
  pickOne,
  pickN,
  randInt,
  randFloat,
  interpolate,
  word_frequency_count,
  sort_by_field,
  find_matching_records,
  arithmetic_evaluation,
  mulberry32,
  DATA_GENERATORS_METADATA,
} from "../src/challenges/primitives/data-generator.js";

// ── Scoring Primitives ─────────────────────────────────────────────

describe("exact_match", () => {
  it("returns 1 for identical strings (case-insensitive)", () => {
    expect(exact_match("Hello", "hello")).toBe(1);
  });

  it("returns 0 for different strings", () => {
    expect(exact_match("hello", "world")).toBe(0);
  });

  it("returns 1 for identical numbers", () => {
    expect(exact_match(42, 42)).toBe(1);
  });

  it("returns 0 for different numbers", () => {
    expect(exact_match(42, 43)).toBe(0);
  });
});

describe("exact_match_ratio", () => {
  it("returns 1 for identical arrays", () => {
    expect(exact_match_ratio(["a", "b", "c"], ["a", "b", "c"])).toBe(1);
  });

  it("returns 0.5 for half matching", () => {
    expect(exact_match_ratio(["a", "x"], ["a", "b"])).toBe(0.5);
  });

  it("returns 0 for no matches", () => {
    expect(exact_match_ratio(["x", "y"], ["a", "b"])).toBe(0);
  });

  it("handles empty arrays", () => {
    expect(exact_match_ratio([], [])).toBe(1);
    expect(exact_match_ratio(["a"], [])).toBe(0);
  });
});

describe("numeric_tolerance", () => {
  it("returns 1 when within tolerance", () => {
    expect(numeric_tolerance(10.005, 10, 0.01)).toBe(1);
  });

  it("returns value between 0-1 for values near tolerance", () => {
    const result = numeric_tolerance(10.02, 10, 0.01);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(1);
  });

  it("returns 0 for values far from expected", () => {
    expect(numeric_tolerance(100, 10, 0.01)).toBe(0);
  });
});

describe("fuzzy_string", () => {
  it("returns 1 for identical strings", () => {
    expect(fuzzy_string("hello", "hello")).toBe(1);
  });

  it("returns 1 for case-different strings", () => {
    expect(fuzzy_string("Hello", "HELLO")).toBe(1);
  });

  it("returns high similarity for similar strings", () => {
    expect(fuzzy_string("hello", "helo")).toBeGreaterThan(0.7);
  });

  it("returns low similarity for very different strings", () => {
    expect(fuzzy_string("abc", "xyz")).toBeLessThan(0.5);
  });
});

describe("time_decay", () => {
  it("returns 1 at start", () => {
    expect(time_decay(0, 60)).toBe(1);
  });

  it("returns 0.5 at half time", () => {
    expect(time_decay(30, 60)).toBe(0.5);
  });

  it("returns 0 at time limit", () => {
    expect(time_decay(60, 60)).toBe(0);
  });

  it("returns 0 past time limit", () => {
    expect(time_decay(120, 60)).toBe(0);
  });
});

describe("api_call_efficiency", () => {
  it("returns 1 at or below optimal", () => {
    expect(api_call_efficiency(3, 3, 15)).toBe(1);
    expect(api_call_efficiency(1, 3, 15)).toBe(1);
  });

  it("returns 0 at or above max", () => {
    expect(api_call_efficiency(15, 3, 15)).toBe(0);
    expect(api_call_efficiency(20, 3, 15)).toBe(0);
  });

  it("returns value between 0-1 in between", () => {
    const result = api_call_efficiency(9, 3, 15);
    expect(result).toBe(0.5);
  });
});

describe("coverage_ratio", () => {
  it("returns 1 for full coverage", () => {
    expect(coverage_ratio(10, 10)).toBe(1);
  });

  it("returns 0.5 for half coverage", () => {
    expect(coverage_ratio(5, 10)).toBe(0.5);
  });

  it("returns 0 for no coverage", () => {
    expect(coverage_ratio(0, 10)).toBe(0);
  });

  it("clamps to 1 for over-coverage", () => {
    expect(coverage_ratio(15, 10)).toBe(1);
  });
});

describe("set_overlap", () => {
  it("returns 1 for identical sets", () => {
    expect(set_overlap(["a", "b", "c"], ["a", "b", "c"])).toBe(1);
  });

  it("returns 0 for disjoint sets", () => {
    expect(set_overlap(["a", "b"], ["c", "d"])).toBe(0);
  });

  it("returns correct Jaccard index", () => {
    // Intersection: {a, b}, Union: {a, b, c, d} → 2/4 = 0.5
    expect(set_overlap(["a", "b", "c"], ["a", "b", "d"])).toBeCloseTo(0.5, 1);
  });

  it("handles empty sets", () => {
    expect(set_overlap([], [])).toBe(1);
  });
});

// ── Data Generator Primitives ──────────────────────────────────────

describe("pickOne / pickN", () => {
  it("pickOne is deterministic", () => {
    const rng1 = mulberry32(42);
    const rng2 = mulberry32(42);
    const pool = ["a", "b", "c", "d", "e"];
    expect(pickOne(pool, rng1)).toBe(pickOne(pool, rng2));
  });

  it("pickN returns correct count of unique items", () => {
    const rng = mulberry32(42);
    const result = pickN([1, 2, 3, 4, 5], 3, rng);
    expect(result).toHaveLength(3);
    expect(new Set(result).size).toBe(3);
  });
});

describe("randInt / randFloat", () => {
  it("randInt returns values in range", () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      const val = randInt(5, 10, rng);
      expect(val).toBeGreaterThanOrEqual(5);
      expect(val).toBeLessThanOrEqual(10);
    }
  });

  it("randFloat returns values in range with correct decimals", () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      const val = randFloat(1.0, 5.0, rng, 2);
      expect(val).toBeGreaterThanOrEqual(1.0);
      expect(val).toBeLessThanOrEqual(5.0);
      // Check at most 2 decimal places (use closeTo for floating point)
      expect(Math.round(val * 100)).toBeCloseTo(val * 100, 5);
    }
  });
});

describe("interpolate", () => {
  it("replaces placeholders", () => {
    expect(interpolate("{adj} {noun}", { adj: "fierce", noun: "tide" })).toBe("fierce tide");
  });

  it("leaves unknown placeholders", () => {
    expect(interpolate("{known} {unknown}", { known: "yes" })).toBe("yes {unknown}");
  });
});

describe("word_frequency_count", () => {
  it("counts word frequencies correctly", () => {
    const result = word_frequency_count("the cat sat on the mat");
    expect(result.the).toBe(2);
    expect(result.cat).toBe(1);
    expect(result.sat).toBe(1);
  });
});

describe("sort_by_field", () => {
  it("sorts ascending by default", () => {
    const records = [{ name: "b", val: 2 }, { name: "a", val: 1 }, { name: "c", val: 3 }];
    const sorted = sort_by_field(records, "val");
    expect(sorted.map((r) => r.val)).toEqual([1, 2, 3]);
  });

  it("sorts descending", () => {
    const records = [{ name: "b", val: 2 }, { name: "a", val: 1 }, { name: "c", val: 3 }];
    const sorted = sort_by_field(records, "val", "desc");
    expect(sorted.map((r) => r.val)).toEqual([3, 2, 1]);
  });
});

describe("find_matching_records", () => {
  it("filters by criteria", () => {
    const records = [
      { color: "red", size: 1 },
      { color: "blue", size: 2 },
      { color: "red", size: 3 },
    ];
    const result = find_matching_records(records, { color: "red" });
    expect(result).toHaveLength(2);
  });
});

describe("arithmetic_evaluation", () => {
  it("evaluates simple expressions", () => {
    expect(arithmetic_evaluation("2 + 3")).toBe(5);
    expect(arithmetic_evaluation("10 * 5")).toBe(50);
    expect(arithmetic_evaluation("10 / 4")).toBe(2.5);
  });

  it("handles operator precedence", () => {
    expect(arithmetic_evaluation("2 + 3 * 4")).toBe(14);
  });

  it("handles parentheses", () => {
    expect(arithmetic_evaluation("(2 + 3) * 4")).toBe(20);
  });
});

// ── Discovery metadata ──────────────────────────────────────────────

describe("SCORING_PRIMITIVES_METADATA", () => {
  it("has metadata for every registered scoring primitive", () => {
    const metaNames = SCORING_PRIMITIVES_METADATA.map((m) => m.name);
    const registeredNames = Object.keys(SCORING_PRIMITIVES);
    for (const name of registeredNames) {
      expect(metaNames).toContain(name);
    }
  });

  it("each entry has required fields", () => {
    for (const meta of SCORING_PRIMITIVES_METADATA) {
      expect(meta.name).toBeTruthy();
      expect(meta.signature).toBeTruthy();
      expect(meta.description).toBeTruthy();
      expect(meta.returns).toBeTruthy();
      expect(meta.example).toBeTruthy();
    }
  });
});

describe("DATA_GENERATORS_METADATA", () => {
  it("has at least 5 entries", () => {
    expect(DATA_GENERATORS_METADATA.length).toBeGreaterThanOrEqual(5);
  });

  it("each entry has required fields", () => {
    for (const meta of DATA_GENERATORS_METADATA) {
      expect(meta.name).toBeTruthy();
      expect(meta.signature).toBeTruthy();
      expect(meta.description).toBeTruthy();
      expect(["selection", "numeric", "text", "data"]).toContain(meta.category);
    }
  });
});
