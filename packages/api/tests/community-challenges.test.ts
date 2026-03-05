import { describe, it, expect } from "vitest";
import { validateSpec, verifyDeterminism } from "../src/challenges/primitives/validator.js";
import { createDeclarativeModule } from "../src/challenges/primitives/declarative-module.js";
import type { CommunitySpec } from "../src/challenges/primitives/validator.js";

// ── Valid spec fixture ─────────────────────────────────────────────

const validSpec: CommunitySpec = {
  slug: "test-challenge",
  name: "Test Challenge",
  description: "A test community challenge for validation purposes.",
  lore: "In the testing depths, challenges are born from pure logic and determination.",
  category: "reasoning",
  difficulty: "newcomer",
  matchType: "single",
  timeLimitSecs: 60,
  workspace: {
    type: "generator",
    seedable: true,
    challengeMd: "# Test Challenge\n\nSolve the test puzzle.\n\n## Submission\nSubmit JSON with your answer.",
  },
  submission: {
    type: "json",
    schema: { answer: "string" },
  },
  scoring: {
    method: "deterministic",
    dimensions: [
      { key: "accuracy", label: "Accuracy", weight: 0.6, description: "Correctness of answers", color: "emerald" },
      { key: "speed", label: "Speed", weight: 0.4, description: "Time to submission", color: "sky" },
    ],
    maxScore: 1000,
  },
  scorer: {
    fields: [
      { key: "answer", primitive: "exact_match" },
    ],
    timeDimension: "speed",
  },
};

// ── Spec Validation ────────────────────────────────────────────────

describe("Community spec validation", () => {
  it("accepts a valid spec", () => {
    const result = validateSpec(validSpec);
    expect(result.valid).toBe(true);
  });

  it("rejects spec with bad slug format", () => {
    const result = validateSpec({ ...validSpec, slug: "Bad-Slug!" });
    expect(result.valid).toBe(false);
  });

  it("rejects spec with weights not summing to 1.0", () => {
    const result = validateSpec({
      ...validSpec,
      scoring: {
        ...validSpec.scoring,
        dimensions: [
          { key: "accuracy", label: "Accuracy", weight: 0.5, description: "Test", color: "emerald" },
          { key: "speed", label: "Speed", weight: 0.3, description: "Test", color: "sky" },
        ],
      },
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("sum to 1.0"))).toBe(true);
    }
  });

  it("rejects spec with unknown scoring primitive", () => {
    const result = validateSpec({
      ...validSpec,
      scorer: {
        fields: [
          { key: "answer", primitive: "nonexistent_function" },
        ],
      },
    });
    expect(result.valid).toBe(false);
  });

  it("rejects spec with time limit out of bounds", () => {
    const result = validateSpec({ ...validSpec, timeLimitSecs: 5 }); // too short
    expect(result.valid).toBe(false);
  });

  it("rejects spec with invalid category", () => {
    const result = validateSpec({ ...validSpec, category: "swimming" as any });
    expect(result.valid).toBe(false);
  });

  it("rejects spec with invalid difficulty", () => {
    const result = validateSpec({ ...validSpec, difficulty: "impossible" as any });
    expect(result.valid).toBe(false);
  });

  it("rejects spec with too few scoring dimensions", () => {
    const result = validateSpec({
      ...validSpec,
      scoring: {
        ...validSpec.scoring,
        dimensions: [
          { key: "accuracy", label: "Accuracy", weight: 1.0, description: "Test", color: "emerald" },
        ],
      },
    });
    expect(result.valid).toBe(false);
  });

  it("rejects non-object input", () => {
    const result = validateSpec("not an object");
    expect(result.valid).toBe(false);
  });

  it("rejects null input", () => {
    const result = validateSpec(null);
    expect(result.valid).toBe(false);
  });
});

// ── Declarative Module ─────────────────────────────────────────────

describe("Declarative module creation", () => {
  it("creates a module with correct slug and dimensions", () => {
    const mod = createDeclarativeModule(validSpec);
    expect(mod.slug).toBe("test-challenge");
    expect(mod.dimensions).toEqual(validSpec.scoring.dimensions);
  });

  it("creates a module with workspace specs", () => {
    const mod = createDeclarativeModule(validSpec);
    expect(mod.workspaceSpec).toBeDefined();
    expect(mod.workspaceSpec!.type).toBe("generator");
    expect(mod.submissionSpec).toBeDefined();
    expect(mod.submissionSpec!.type).toBe("json");
    expect(mod.scoringSpec).toBeDefined();
    expect(mod.scoringSpec!.method).toBe("deterministic");
  });

  it("generates data deterministically", () => {
    const mod = createDeclarativeModule(validSpec);
    const d1 = mod.generateData(42, {});
    const d2 = mod.generateData(42, {});
    expect(d1.groundTruth).toEqual(d2.groundTruth);
    expect(d1.objective).toEqual(d2.objective);
  });

  it("generates different data for different seeds", () => {
    const specWithData: CommunitySpec = {
      ...validSpec,
      dataTemplate: {
        pools: [
          { name: "colors", items: ["red", "blue", "green", "gold", "silver"] },
        ],
        fields: {
          target_color: { type: "pick_one", pool: "colors" },
          value: { type: "rand_int", min: 1, max: 100 },
        },
      },
    };
    const mod = createDeclarativeModule(specWithData);
    const d1 = mod.generateData(42, {});
    const d2 = mod.generateData(999, {});
    // Different seeds should produce different data (with high probability)
    const json1 = JSON.stringify(d1.groundTruth);
    const json2 = JSON.stringify(d2.groundTruth);
    expect(json1).not.toBe(json2);
  });

  it("generates workspace files", () => {
    const specWithData: CommunitySpec = {
      ...validSpec,
      dataTemplate: {
        pools: [
          { name: "colors", items: ["red", "blue", "green", "gold", "silver"] },
        ],
        fields: {
          target_color: { type: "pick_one", pool: "colors" },
          value: { type: "rand_int", min: 1, max: 100 },
        },
      },
    };
    const mod = createDeclarativeModule(specWithData);
    const files = mod.generateWorkspace!(42, {});
    expect(files).toBeDefined();
    expect(typeof files).toBe("object");
    // Should have at least one file
    expect(Object.keys(files).length).toBeGreaterThan(0);
  });

  it("scores a submission", () => {
    const mod = createDeclarativeModule(validSpec);
    const result = mod.score({
      submission: { answer: "test" },
      groundTruth: { answer: "test" },
      startedAt: new Date("2026-02-01T10:00:00Z"),
      submittedAt: new Date("2026-02-01T10:00:30Z"),
      apiCallCount: 0,
    });
    expect(result.breakdown.total).toBeGreaterThan(0);
    expect(result.breakdown.total).toBeLessThanOrEqual(1000);
  });

});

// ── Determinism Verification ───────────────────────────────────────

describe("verifyDeterminism", () => {
  it("passes for deterministic generators", async () => {
    const generate = (seed: number) => ({ value: seed * 2 });
    const result = await verifyDeterminism(generate);
    expect(result.deterministic).toBe(true);
  });

  it("fails for non-deterministic generators", async () => {
    let callCount = 0;
    const generate = (_seed: number) => ({ value: callCount++ });
    const result = await verifyDeterminism(generate);
    expect(result.deterministic).toBe(false);
  });

  it("fails when all seeds produce same output", async () => {
    const generate = (_seed: number) => ({ value: "always_same" });
    const result = await verifyDeterminism(generate);
    expect(result.deterministic).toBe(false);
    expect(result.error).toContain("identical");
  });
});
