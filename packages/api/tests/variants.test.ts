import { describe, it, expect } from "vitest";
import type { ChallengeVariant } from "@clawdiators/shared";

// Replicate variant selection logic from matches.ts
function selectVariant(
  variants: ChallengeVariant[],
  seed: number,
): ChallengeVariant {
  const totalWeight = variants.reduce((sum, v) => sum + (v.weight ?? 1), 0);
  let roll = ((seed % 10000) / 10000) * totalWeight;
  let selected = variants[0];
  for (const v of variants) {
    roll -= v.weight ?? 1;
    if (roll <= 0) {
      selected = v;
      break;
    }
  }
  return selected;
}

function mergeConfig(
  baseConfig: Record<string, unknown>,
  variant: ChallengeVariant,
): Record<string, unknown> {
  return { ...baseConfig, ...variant.config_overrides };
}

describe("Variant selection", () => {
  const variants: ChallengeVariant[] = [
    { id: "A", label: "Original", config_overrides: {} },
    { id: "B", label: "Harder ciphers", config_overrides: { difficulty_multiplier: 2 } },
  ];

  it("selects variant deterministically from seed", () => {
    const v1 = selectVariant(variants, 1234);
    const v2 = selectVariant(variants, 1234);
    expect(v1.id).toBe(v2.id);
  });

  it("distributes roughly evenly with equal weights", () => {
    const counts: Record<string, number> = { A: 0, B: 0 };
    for (let seed = 0; seed < 10000; seed++) {
      const v = selectVariant(variants, seed);
      counts[v.id]++;
    }
    // With equal weights, each should get ~50%
    expect(counts.A).toBeGreaterThan(4000);
    expect(counts.B).toBeGreaterThan(4000);
  });

  it("respects unequal weights", () => {
    const weighted: ChallengeVariant[] = [
      { id: "A", label: "Heavy", config_overrides: {}, weight: 3 },
      { id: "B", label: "Light", config_overrides: {}, weight: 1 },
    ];
    const counts: Record<string, number> = { A: 0, B: 0 };
    for (let seed = 0; seed < 10000; seed++) {
      const v = selectVariant(weighted, seed);
      counts[v.id]++;
    }
    // A should get ~75%, B ~25%
    expect(counts.A).toBeGreaterThan(6000);
    expect(counts.B).toBeGreaterThan(1500);
    expect(counts.B).toBeLessThan(4000);
  });

  it("handles single variant", () => {
    const single: ChallengeVariant[] = [
      { id: "only", label: "Only One", config_overrides: { special: true } },
    ];
    const v = selectVariant(single, 42);
    expect(v.id).toBe("only");
  });
});

describe("Config merging", () => {
  it("merges variant overrides into base config", () => {
    const base = { rounds: 5, mode: "standard" };
    const variant: ChallengeVariant = {
      id: "B",
      label: "Hard mode",
      config_overrides: { rounds: 10, penalty: true },
    };
    const merged = mergeConfig(base, variant);
    expect(merged).toEqual({ rounds: 10, mode: "standard", penalty: true });
  });

  it("returns base config when overrides are empty", () => {
    const base = { rounds: 5 };
    const variant: ChallengeVariant = {
      id: "A",
      label: "Original",
      config_overrides: {},
    };
    expect(mergeConfig(base, variant)).toEqual(base);
  });
});

describe("ChallengeVariant type", () => {
  it("has required fields", () => {
    const v: ChallengeVariant = {
      id: "A",
      label: "Test",
      config_overrides: {},
    };
    expect(v.id).toBe("A");
    expect(v.label).toBe("Test");
    expect(v.config_overrides).toEqual({});
    expect(v.weight).toBeUndefined();
  });

  it("supports optional weight", () => {
    const v: ChallengeVariant = {
      id: "B",
      label: "Weighted",
      config_overrides: {},
      weight: 2,
    };
    expect(v.weight).toBe(2);
  });
});
