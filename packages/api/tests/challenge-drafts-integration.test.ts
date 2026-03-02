import { describe, it, expect } from "vitest";
import { validateSpec } from "../src/challenges/primitives/validator.js";
import { createDeclarativeModule } from "../src/challenges/primitives/declarative-module.js";
import { runAllGates } from "../src/challenges/primitives/gates.js";
import type { CommunitySpec } from "../src/challenges/primitives/validator.js";

// ── Fixtures ──────────────────────────────────────────────────────────

/**
 * Test Spec A: Simple Newcomer — should pass all gates.
 * Uses pick_one with a large pool + rand_int to ensure determinism across seeds.
 */
const colorMatchSpec: CommunitySpec = {
  slug: "color-match",
  name: "Color Match",
  description: "Match the randomly selected color from a pool of ten. A newcomer warmup.",
  lore: "In the chromatic depths of the arena, even matching a color proves worth. The simplest trial awaits.",
  category: "reasoning",
  difficulty: "newcomer",
  matchType: "single",
  timeLimitSecs: 60,
  workspace: {
    type: "generator",
    seedable: true,
    challengeMd: "# Color Match\n\nSeed: {{seed}}\n\nCheck `color.json` for the target color to identify.\n\n## Submission\nSubmit JSON: `{\"color\": \"<the color>\", \"reasoning\": \"<your approach>\"}`\n\n## Scoring\n- Accuracy (70%): Exact match on color\n- Speed (30%): Time to submission",
  },
  submission: {
    type: "json",
    schema: { color: "string", reasoning: "string" },
  },
  scoring: {
    method: "deterministic",
    dimensions: [
      { key: "accuracy", label: "Accuracy", weight: 0.7, description: "Correct color identification", color: "emerald" },
      { key: "speed", label: "Speed", weight: 0.3, description: "Time to submission", color: "sky" },
    ],
    maxScore: 1000,
  },
  scorer: {
    fields: [{ key: "color", primitive: "exact_match" }],
    timeDimension: "speed",
  },
  dataTemplate: {
    pools: [{ name: "colors", items: ["crimson", "cerulean", "emerald", "amber", "violet", "obsidian", "ivory", "coral", "teal", "bronze"] }],
    fields: {
      color: { type: "pick_one", pool: "colors" },
    },
  },
};

/**
 * Test Spec B: Multi-field veteran — uses multiple scoring primitives.
 */
const multiFieldSpec: CommunitySpec = {
  slug: "multi-field-test",
  name: "Multi-field Test",
  description: "A challenge testing multiple scorer field types for integration validation.",
  lore: "The arena demands mastery across many dimensions — numbers, names, and lists alike.",
  category: "reasoning",
  difficulty: "contender",
  matchType: "single",
  timeLimitSecs: 120,
  workspace: {
    type: "generator",
    seedable: true,
    challengeMd: "# Multi-field Test\n\nSeed: {{seed}}\n\nAnalyse the workspace files.\n\n## Submission\nSubmit JSON: `{\"value\": <number>, \"label\": \"<string>\", \"tags\": [<strings>]}`",
  },
  submission: {
    type: "json",
    schema: { value: "number", label: "string", tags: "array" },
  },
  scoring: {
    method: "deterministic",
    dimensions: [
      { key: "precision", label: "Precision", weight: 0.4, description: "Numeric accuracy", color: "emerald" },
      { key: "naming", label: "Naming", weight: 0.3, description: "Label correctness", color: "sky" },
      { key: "speed", label: "Speed", weight: 0.3, description: "Time to submission", color: "gold" },
    ],
    maxScore: 1000,
  },
  scorer: {
    fields: [
      { key: "value", primitive: "numeric_tolerance", params: { tolerance: 0.5 } },
      { key: "label", primitive: "exact_match" },
      { key: "tags", primitive: "set_overlap" },
    ],
    timeDimension: "speed",
  },
  dataTemplate: {
    pools: [
      { name: "labels", items: ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel"] },
      { name: "tagPool", items: ["fast", "slow", "accurate", "robust", "elegant", "simple", "complex", "novel"] },
    ],
    fields: {
      value: { type: "rand_int", min: 100, max: 99999 },
      label: { type: "pick_one", pool: "labels" },
      tags: { type: "pick_n", pool: "tagPool", count: 3 },
    },
  },
};

// ── Test Spec A: Color Match (Happy Path) ─────────────────────────────

describe("Color Match spec (happy path)", () => {
  it("passes spec validation", () => {
    const result = validateSpec(colorMatchSpec);
    expect(result.valid).toBe(true);
  });

  it("generates deterministic data", () => {
    const mod = createDeclarativeModule(colorMatchSpec);
    const d1 = mod.generateData(42, {});
    const d2 = mod.generateData(42, {});
    expect(d1).toEqual(d2);
  });

  it("generates different data for different seeds", () => {
    const mod = createDeclarativeModule(colorMatchSpec);
    const d42 = mod.generateData(42, {});
    const d99 = mod.generateData(99, {});
    // With 10 colors and different seeds, outputs should differ
    expect(JSON.stringify(d42)).not.toBe(JSON.stringify(d99));
  });

  it("scores a perfect answer above 60% threshold", () => {
    const mod = createDeclarativeModule(colorMatchSpec);
    const data = mod.generateData(42, {});
    const answer = { color: data.groundTruth.color, reasoning: "Read the workspace file" };
    const result = mod.score({
      submission: answer,
      groundTruth: data.groundTruth,
      startedAt: new Date(Date.now() - 5000),
      submittedAt: new Date(),
      apiCallCount: 0,
    });
    expect(result.breakdown.total).toBeGreaterThanOrEqual(600);
  });

  it("scores an empty answer near zero", () => {
    const mod = createDeclarativeModule(colorMatchSpec);
    const data = mod.generateData(42, {});
    const result = mod.score({
      submission: {},
      groundTruth: data.groundTruth,
      startedAt: new Date(Date.now() - 1000),
      submittedAt: new Date(),
      apiCallCount: 0,
    });
    expect(result.breakdown.total).toBeLessThan(300);
  });

  it("passes all gates with correct reference answer", async () => {
    const mod = createDeclarativeModule(colorMatchSpec);
    const data = mod.generateData(42, {});
    const correctAnswer = { color: data.groundTruth.color, reasoning: "I read the workspace" };
    const report = await runAllGates(
      colorMatchSpec,
      { seed: 42, answer: correctAnswer },
      "test-hash",
    );
    expect(report.overall).not.toBe("fail");
    expect(report.gates.spec_validity.passed).toBe(true);
    expect(report.gates.determinism.passed).toBe(true);
    expect(report.gates.contract_consistency.passed).toBe(true);
    expect(report.gates.baseline_solveability.passed).toBe(true);
    expect(report.gates.anti_gaming.passed).toBe(true);
    expect(report.gates.score_distribution.passed).toBe(true);
  });

  it("generates workspace files", () => {
    const mod = createDeclarativeModule(colorMatchSpec);
    const files = mod.generateWorkspace(42, {});
    expect(files).toHaveProperty("color.json");
    const parsed = JSON.parse(files["color.json"]);
    expect(typeof parsed).toBe("string");
  });
});

// ── Test Spec B: Multi-Field (Veteran) ──────────────────────────────

describe("Multi-field spec (multi-primitive scoring)", () => {
  it("passes spec validation", () => {
    const result = validateSpec(multiFieldSpec);
    expect(result.valid).toBe(true);
  });

  it("generates data with all expected fields", () => {
    const mod = createDeclarativeModule(multiFieldSpec);
    const data = mod.generateData(42, {});
    expect(data.groundTruth).toHaveProperty("value");
    expect(data.groundTruth).toHaveProperty("label");
    expect(data.groundTruth).toHaveProperty("tags");
    expect(typeof data.groundTruth.value).toBe("number");
    expect(typeof data.groundTruth.label).toBe("string");
    expect(Array.isArray(data.groundTruth.tags)).toBe(true);
  });

  it("scores perfect answer above threshold", () => {
    const mod = createDeclarativeModule(multiFieldSpec);
    const data = mod.generateData(42, {});
    const result = mod.score({
      submission: {
        value: data.groundTruth.value,
        label: data.groundTruth.label,
        tags: data.groundTruth.tags,
      },
      groundTruth: data.groundTruth,
      startedAt: new Date(Date.now() - 5000),
      submittedAt: new Date(),
      apiCallCount: 0,
    });
    expect(result.breakdown.total).toBeGreaterThanOrEqual(600);
  });

  it("passes all gates with correct reference answer", async () => {
    const mod = createDeclarativeModule(multiFieldSpec);
    const data = mod.generateData(42, {});
    const report = await runAllGates(
      multiFieldSpec,
      {
        seed: 42,
        answer: {
          value: data.groundTruth.value,
          label: data.groundTruth.label,
          tags: data.groundTruth.tags,
        },
      },
      "test-hash",
    );
    expect(report.overall).not.toBe("fail");
    expect(report.gates.baseline_solveability.passed).toBe(true);
    expect(report.gates.anti_gaming.passed).toBe(true);
  });
});

// ── Test Spec C: Invalid Specs (Negative Tests) ──────────────────────

describe("Invalid spec rejection", () => {
  it("rejects slug too short", () => {
    const result = validateSpec({ ...colorMatchSpec, slug: "ab" });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("slug"))).toBe(true);
    }
  });

  it("rejects bad category", () => {
    const result = validateSpec({ ...colorMatchSpec, category: "underwater-basket-weaving" });
    expect(result.valid).toBe(false);
  });

  it("rejects single dimension (min 2)", () => {
    const result = validateSpec({
      ...colorMatchSpec,
      scoring: {
        ...colorMatchSpec.scoring,
        dimensions: [
          { key: "only", label: "Only", weight: 1.0, description: "Sole dimension", color: "emerald" },
        ],
      },
    });
    expect(result.valid).toBe(false);
  });

  it("rejects weights not summing to 1.0", () => {
    const result = validateSpec({
      ...colorMatchSpec,
      scoring: {
        ...colorMatchSpec.scoring,
        dimensions: [
          { key: "a", label: "A", weight: 0.3, description: "x", color: "emerald" },
          { key: "b", label: "B", weight: 0.3, description: "y", color: "sky" },
        ],
      },
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("weights must sum"))).toBe(true);
    }
  });

  it("rejects unknown scoring primitive", () => {
    const result = validateSpec({
      ...colorMatchSpec,
      scorer: {
        fields: [{ key: "color", primitive: "magic_oracle" }],
      },
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("Unknown scoring primitive"))).toBe(true);
    }
  });

  it("rejects description too short", () => {
    const result = validateSpec({ ...colorMatchSpec, description: "Short" });
    expect(result.valid).toBe(false);
  });

  it("rejects timeLimitSecs below minimum", () => {
    const result = validateSpec({ ...colorMatchSpec, timeLimitSecs: 5 });
    expect(result.valid).toBe(false);
  });
});

// ── Scorer Required Validation ──────────────────────────────────────

describe("Scorer required when maxScore > 1000", () => {
  it("accepts maxScore 1000 without scorer", () => {
    const spec = {
      ...colorMatchSpec,
      scoring: { ...colorMatchSpec.scoring, maxScore: 1000 },
      scorer: undefined,
    };
    const result = validateSpec(spec);
    expect(result.valid).toBe(true);
  });

  it("rejects maxScore > 1000 without scorer", () => {
    const spec = {
      ...colorMatchSpec,
      scoring: { ...colorMatchSpec.scoring, maxScore: 2000 },
      scorer: undefined,
    };
    const result = validateSpec(spec);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("scorer is required"))).toBe(true);
    }
  });

  it("accepts maxScore > 1000 with scorer", () => {
    const spec = {
      ...colorMatchSpec,
      scoring: { ...colorMatchSpec.scoring, maxScore: 2000 },
    };
    const result = validateSpec(spec);
    expect(result.valid).toBe(true);
  });
});

// ── Gate Pipeline: Failure Modes ─────────────────────────────────────

describe("Gate pipeline failure modes", () => {
  it("fails baseline_solveability with wrong reference answer", async () => {
    const report = await runAllGates(
      colorMatchSpec,
      { seed: 42, answer: { color: "definitely-not-a-color", reasoning: "random guess" } },
      "test-hash",
    );
    expect(report.overall).toBe("fail");
    expect(report.gates.baseline_solveability.passed).toBe(false);
  });

  it("fails contract_consistency when scorer field not in schema", async () => {
    const badSpec: CommunitySpec = {
      ...colorMatchSpec,
      submission: {
        type: "json",
        schema: { answer: "string" }, // 'color' missing
      },
      scorer: {
        fields: [{ key: "color", primitive: "exact_match" }],
        timeDimension: "speed",
      },
    };
    const report = await runAllGates(
      badSpec,
      { seed: 42, answer: { answer: "whatever" } },
      "test-hash",
    );
    expect(report.gates.contract_consistency.passed).toBe(false);
  });

  it("fails spec_validity for completely invalid input", async () => {
    const report = await runAllGates(
      { not: "a spec" },
      { seed: 42, answer: {} },
      "test-hash",
    );
    expect(report.overall).toBe("fail");
    expect(report.gates.spec_validity.passed).toBe(false);
    // All other gates should be skipped
    expect(report.gates.determinism.error).toMatch(/Skipped/);
  });
});

// ── Workspace Generation ─────────────────────────────────────────────

describe("Workspace generation", () => {
  it("color-match generates color.json workspace file", () => {
    const mod = createDeclarativeModule(colorMatchSpec);
    const files = mod.generateWorkspace(42, {});
    expect(Object.keys(files)).toContain("color.json");
  });

  it("multi-field generates workspace files for all data fields", () => {
    const mod = createDeclarativeModule(multiFieldSpec);
    const files = mod.generateWorkspace(42, {});
    expect(Object.keys(files)).toContain("value.json");
    expect(Object.keys(files)).toContain("label.json");
    expect(Object.keys(files)).toContain("tags.json");
  });

  it("workspace is deterministic (same seed → same files)", () => {
    const mod = createDeclarativeModule(colorMatchSpec);
    const f1 = mod.generateWorkspace(42, {});
    const f2 = mod.generateWorkspace(42, {});
    expect(f1).toEqual(f2);
  });

  it("workspace changes with different seeds", () => {
    const mod = createDeclarativeModule(colorMatchSpec);
    const f42 = mod.generateWorkspace(42, {});
    const f99 = mod.generateWorkspace(99, {});
    expect(JSON.stringify(f42)).not.toBe(JSON.stringify(f99));
  });
});

// ── Scoring Edge Cases ───────────────────────────────────────────────

describe("Scoring edge cases", () => {
  it("partial match on multi-field spec", () => {
    const mod = createDeclarativeModule(multiFieldSpec);
    const data = mod.generateData(42, {});
    // Submit only correct value, wrong label and tags
    const result = mod.score({
      submission: {
        value: data.groundTruth.value,
        label: "wrong-label",
        tags: ["wrong-tag-1", "wrong-tag-2"],
      },
      groundTruth: data.groundTruth,
      startedAt: new Date(Date.now() - 5000),
      submittedAt: new Date(),
      apiCallCount: 0,
    });
    // Should get partial score (value correct, label wrong, tags wrong)
    expect(result.breakdown.total).toBeGreaterThan(0);
    expect(result.breakdown.total).toBeLessThan(900);
  });

  it("near-timeout submission gets low speed score", () => {
    const mod = createDeclarativeModule(colorMatchSpec);
    const data = mod.generateData(42, {});
    const now = new Date();
    const result = mod.score({
      submission: { color: data.groundTruth.color, reasoning: "took forever" },
      groundTruth: data.groundTruth,
      startedAt: new Date(now.getTime() - 59000), // 59 seconds — near 60s limit
      submittedAt: now,
      apiCallCount: 0,
    });
    // Speed dimension should be low
    expect(result.breakdown.speed).toBeLessThan(100);
  });

  it("instant submission gets high speed score", () => {
    const mod = createDeclarativeModule(colorMatchSpec);
    const data = mod.generateData(42, {});
    const now = new Date();
    const result = mod.score({
      submission: { color: data.groundTruth.color, reasoning: "instant solve" },
      groundTruth: data.groundTruth,
      startedAt: new Date(now.getTime() - 100), // 0.1 seconds
      submittedAt: now,
      apiCallCount: 0,
    });
    // Speed dimension should be high
    expect(result.breakdown.speed).toBeGreaterThan(200);
  });
});
