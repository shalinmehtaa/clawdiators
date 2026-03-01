import { describe, it, expect } from "vitest";
import { selectVariant, mergeVariantConfig } from "../src/services/variants.js";
import type { ChallengeVariant } from "@clawdiators/shared";

const equal: ChallengeVariant[] = [
  { id: "A", label: "Original", config_overrides: {} },
  { id: "B", label: "Harder ciphers", config_overrides: { difficulty_multiplier: 2 } },
];

describe("selectVariant()", () => {
  it("is deterministic for the same seed", () => {
    expect(selectVariant(equal, 1234).id).toBe(selectVariant(equal, 1234).id);
  });

  it("different seeds can produce different variants", () => {
    // Seeds 0–99 all fall below the 50% threshold; use a spread across 0–9999
    const ids = new Set(
      [0, 1000, 2000, 3000, 4000, 5001, 6000, 7000, 8000, 9000].map(
        (s) => selectVariant(equal, s).id,
      ),
    );
    expect(ids.size).toBeGreaterThan(1);
  });

  it("distributes roughly 50/50 with equal weights over many seeds", () => {
    const counts: Record<string, number> = { A: 0, B: 0 };
    for (let seed = 0; seed < 10000; seed++) {
      counts[selectVariant(equal, seed).id]++;
    }
    expect(counts.A).toBeGreaterThan(4000);
    expect(counts.B).toBeGreaterThan(4000);
  });

  it("respects unequal weights (3:1 ratio)", () => {
    const weighted: ChallengeVariant[] = [
      { id: "A", label: "Heavy", config_overrides: {}, weight: 3 },
      { id: "B", label: "Light", config_overrides: {}, weight: 1 },
    ];
    const counts: Record<string, number> = { A: 0, B: 0 };
    for (let seed = 0; seed < 10000; seed++) {
      counts[selectVariant(weighted, seed).id]++;
    }
    expect(counts.A).toBeGreaterThan(6000);
    expect(counts.B).toBeGreaterThan(1500);
    expect(counts.B).toBeLessThan(4000);
  });

  it("handles a single variant", () => {
    const single: ChallengeVariant[] = [
      { id: "only", label: "Only One", config_overrides: { special: true } },
    ];
    expect(selectVariant(single, 42).id).toBe("only");
  });

  it("always returns one of the provided variants", () => {
    const ids = new Set(equal.map((v) => v.id));
    for (let seed = 0; seed < 200; seed++) {
      expect(ids.has(selectVariant(equal, seed).id)).toBe(true);
    }
  });
});

describe("mergeVariantConfig()", () => {
  it("overrides base fields with variant config_overrides", () => {
    const base = { rounds: 5, mode: "standard" };
    const variant: ChallengeVariant = {
      id: "B",
      label: "Hard mode",
      config_overrides: { rounds: 10, penalty: true },
    };
    expect(mergeVariantConfig(base, variant)).toEqual({ rounds: 10, mode: "standard", penalty: true });
  });

  it("returns base config unchanged when overrides are empty", () => {
    const base = { rounds: 5 };
    const variant: ChallengeVariant = { id: "A", label: "Original", config_overrides: {} };
    expect(mergeVariantConfig(base, variant)).toEqual({ rounds: 5 });
  });

  it("does not mutate the base config", () => {
    const base = { rounds: 5 };
    const variant: ChallengeVariant = { id: "B", label: "B", config_overrides: { rounds: 10 } };
    mergeVariantConfig(base, variant);
    expect(base.rounds).toBe(5);
  });
});
