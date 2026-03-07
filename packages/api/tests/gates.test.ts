import { describe, it, expect } from "vitest";
import {
  checkSpecValidity,
  checkDeterminism,
  checkContractConsistency,
  checkBaselineSolveability,
  checkAntiGaming,
  checkScoreDistribution,
  runAllGates,
} from "../src/challenges/primitives/gates.js";
import { createDeclarativeModule } from "../src/challenges/primitives/declarative-module.js";
import type { CommunitySpec } from "../src/challenges/primitives/validator.js";

// ── Fixtures ──────────────────────────────────────────────────────────

// Uses rand_int to ensure different seeds reliably produce different output.
// A pool of 5 items can collide between seeds; rand_int(1,100000) won't.
const baseSpec: CommunitySpec = {
  slug: "gate-test",
  name: "Gate Test",
  description: "A challenge designed for gate testing purposes.",
  lore: "The gates of quality await all who seek the arena.",
  category: "reasoning",
  difficulty: "newcomer",
  matchType: "single",
  timeLimitSecs: 60,
  workspace: {
    type: "generator",
    seedable: true,
    challengeMd: "# Gate Test\n\nSolve the puzzle with seed {{seed}}.\n\n## Submission\nSubmit JSON with the `value` field.",
  },
  submission: {
    type: "json",
    schema: { value: "number" },
  },
  scoring: {
    method: "deterministic",
    dimensions: [
      { key: "accuracy", label: "Accuracy", weight: 0.7, description: "Correctness", color: "emerald" },
      { key: "speed", label: "Speed", weight: 0.3, description: "Speed", color: "sky" },
    ],
    maxScore: 1000,
  },
  scorer: {
    fields: [
      { key: "value", primitive: "numeric_tolerance", params: { tolerance: 0.001 } },
    ],
    timeDimension: "speed",
  },
  dataTemplate: {
    fields: {
      value: { type: "rand_int", min: 1, max: 100000 },
    },
  },
};

// ── Gate 1: Spec Validity ─────────────────────────────────────────────

describe("checkSpecValidity", () => {
  it("passes for a valid spec", () => {
    const result = checkSpecValidity(baseSpec);
    expect(result.passed).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("fails for a null input", () => {
    const result = checkSpecValidity(null);
    expect(result.passed).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("fails for missing required fields", () => {
    const result = checkSpecValidity({ slug: "x" });
    expect(result.passed).toBe(false);
    expect(result.details).toHaveProperty("errors");
  });

  it("fails for bad slug format", () => {
    const result = checkSpecValidity({ ...baseSpec, slug: "Bad Slug!" });
    expect(result.passed).toBe(false);
  });

  it("fails for dimension weights not summing to 1.0", () => {
    const result = checkSpecValidity({
      ...baseSpec,
      scoring: {
        ...baseSpec.scoring,
        dimensions: [
          { key: "accuracy", label: "Accuracy", weight: 0.5, description: "x", color: "emerald" },
          { key: "speed", label: "Speed", weight: 0.3, description: "y", color: "sky" },
        ],
      },
    });
    expect(result.passed).toBe(false);
  });

  it("returns error details with validation errors list", () => {
    const result = checkSpecValidity({ slug: "ab" }); // too short
    expect(result.passed).toBe(false);
    expect(Array.isArray(result.details.errors)).toBe(true);
  });
});

// ── Gate 2: Determinism ───────────────────────────────────────────────

describe("checkDeterminism", () => {
  it("passes for a deterministic module", async () => {
    const mod = createDeclarativeModule(baseSpec);
    const result = await checkDeterminism(mod);
    expect(result.passed).toBe(true);
    expect(result.details).toHaveProperty("seeds_tested");
  });

  it("fails for a non-deterministic module", async () => {
    const mod = createDeclarativeModule(baseSpec);
    // Monkey-patch to inject randomness
    const original = mod.generateData.bind(mod);
    mod.generateData = (seed, cfg) => {
      const data = original(seed, cfg);
      return { ...data, nonce: Math.random() };
    };
    const result = await checkDeterminism(mod);
    expect(result.passed).toBe(false);
    expect(result.error).toBeDefined();
  });
});

// ── Gate 3: Contract Consistency ──────────────────────────────────────

describe("checkContractConsistency", () => {
  it("passes for a well-formed spec", () => {
    const result = checkContractConsistency(baseSpec);
    expect(result.passed).toBe(true);
  });

  it("fails when scorer field key missing from submission schema", () => {
    const broken: CommunitySpec = {
      ...baseSpec,
      submission: {
        type: "json",
        schema: { confidence: "number" }, // 'value' missing
      },
      scorer: {
        fields: [{ key: "value", primitive: "exact_match" }],
      },
    };
    const result = checkContractConsistency(broken);
    expect(result.passed).toBe(false);
    expect(result.error).toMatch(/value/);
  });

  it("fails when seedable is true but challengeMd lacks {{seed}}", () => {
    const broken: CommunitySpec = {
      ...baseSpec,
      workspace: {
        ...baseSpec.workspace,
        seedable: true,
        challengeMd: "# No seed placeholder here",
      },
    };
    const result = checkContractConsistency(broken);
    expect(result.passed).toBe(false);
    expect(result.error).toMatch(/seed/);
  });

  it("passes when seedable is false and no {{seed}} placeholder", () => {
    const spec: CommunitySpec = {
      ...baseSpec,
      workspace: {
        ...baseSpec.workspace,
        seedable: false,
        challengeMd: "# Static challenge — no seed needed",
      },
    };
    const result = checkContractConsistency(spec);
    expect(result.passed).toBe(true);
  });

  it("fails when timeDimension references non-existent dimension", () => {
    const broken: CommunitySpec = {
      ...baseSpec,
      scorer: {
        fields: [{ key: "answer", primitive: "exact_match" }],
        timeDimension: "nonexistent_dim",
      },
    };
    const result = checkContractConsistency(broken);
    expect(result.passed).toBe(false);
    expect(result.error).toMatch(/nonexistent_dim/);
  });

  it("passes when timeDimension references valid dimension", () => {
    const result = checkContractConsistency(baseSpec);
    expect(result.passed).toBe(true);
  });
});

// ── Gate 4: Baseline Solveability ─────────────────────────────────────

describe("checkBaselineSolveability", () => {
  it("passes when reference answer meets threshold", async () => {
    const mod = createDeclarativeModule(baseSpec);
    // Generate actual ground truth for seed 42 and submit exact match
    const data = mod.generateData(42, {});
    const correctAnswer = { value: data.groundTruth.value };
    const result = await checkBaselineSolveability(baseSpec, mod, { seed: 42, answer: correctAnswer });
    expect(result.passed).toBe(true);
    expect(result.details).toHaveProperty("score");
    expect(result.details).toHaveProperty("threshold");
  });

  it("fails when reference answer is completely wrong", async () => {
    const mod = createDeclarativeModule(baseSpec);
    // Submit a value that is wildly off from the generated int
    const result = await checkBaselineSolveability(baseSpec, mod, {
      seed: 42,
      answer: { value: -999999999 },
    });
    expect(result.passed).toBe(false);
    expect(result.details).toHaveProperty("score");
    expect(result.details).toHaveProperty("threshold");
    expect(result.details).toHaveProperty("maxScore");
  });

  it("handles generateData throwing gracefully", async () => {
    const mod = createDeclarativeModule(baseSpec);
    mod.generateData = () => { throw new Error("explode"); };
    const result = await checkBaselineSolveability(baseSpec, mod, { seed: 42, answer: {} });
    expect(result.passed).toBe(false);
    expect(result.error).toMatch(/explode/);
  });

  it("handles score() throwing gracefully", async () => {
    const mod = createDeclarativeModule(baseSpec);
    mod.score = () => { throw new Error("score explode"); };
    const result = await checkBaselineSolveability(baseSpec, mod, { seed: 42, answer: {} });
    expect(result.passed).toBe(false);
    expect(result.error).toMatch(/score explode/);
  });
});

// ── Gate 5: Anti-Gaming ───────────────────────────────────────────────

describe("checkAntiGaming", () => {
  it("passes when all probes score below ceiling (numeric_tolerance + wrong answers score 0)", async () => {
    const mod = createDeclarativeModule(baseSpec);
    const data = mod.generateData(42, {});
    const correctAnswer = { value: data.groundTruth.value };
    const result = await checkAntiGaming(baseSpec, mod, { seed: 42, answer: correctAnswer });
    expect(result.passed).toBe(true);
    expect(result.details).toHaveProperty("probe_results");
    expect(result.details).toHaveProperty("worst_probe_score");
  });

  it("fails when empty submission scores too high", async () => {
    // Use a spec where the scorer gives high scores to empty submissions
    const easySpec: CommunitySpec = {
      ...baseSpec,
      // No scorer — uses default methodology-based scoring which scores empty as 400
      // 400 > 300 ceiling (0.3 * 1000) → anti-gaming should fail
      scorer: undefined,
    };
    const mod = createDeclarativeModule(easySpec);
    const result = await checkAntiGaming(easySpec, mod, { seed: 42, answer: { methodology: "approach" } });
    expect(result.passed).toBe(false);
    expect(result.details).toHaveProperty("ceiling");
  });

  it("returns probe results with names and scores", async () => {
    const mod = createDeclarativeModule(baseSpec);
    const data = mod.generateData(42, {});
    const result = await checkAntiGaming(baseSpec, mod, {
      seed: 42,
      answer: { value: data.groundTruth.value },
    });
    const probeResults = result.details.probe_results as Array<{ name: string; score: number }>;
    expect(Array.isArray(probeResults)).toBe(true);
    expect(probeResults.length).toBe(3);
    expect(probeResults.map((p) => p.name)).toContain("empty");
    expect(probeResults.map((p) => p.name)).toContain("all_null");
    expect(probeResults.map((p) => p.name)).toContain("random_uuid");
  });
});

// ── Gate 6: Score Distribution ────────────────────────────────────────

describe("checkScoreDistribution", () => {
  it("passes when reference meets threshold and probes below ceiling (newcomer)", () => {
    const result = checkScoreDistribution(700, [100, 150, 200], 1000, "newcomer");
    expect(result.passed).toBe(true);
  });

  it("fails when reference score is below newcomer threshold (60%)", () => {
    const result = checkScoreDistribution(500, [100, 150], 1000, "newcomer");
    expect(result.passed).toBe(false);
    expect(result.error).toMatch(/Reference score/);
  });

  it("passes with lower reference for legendary difficulty (20%)", () => {
    const result = checkScoreDistribution(250, [50, 100], 1000, "legendary");
    expect(result.passed).toBe(true);
  });

  it("fails when max probe score exceeds ceiling", () => {
    const result = checkScoreDistribution(700, [300, 100], 1000, "newcomer");
    expect(result.passed).toBe(false);
    expect(result.error).toMatch(/probe score/);
  });

  it("fails on score inversion (reference <= max probe)", () => {
    const result = checkScoreDistribution(800, [800, 100], 1000);
    expect(result.passed).toBe(false);
    expect(result.error).toMatch(/inversion/i);
  });

  it("returns details with all three scores", () => {
    const result = checkScoreDistribution(700, [100], 1000);
    expect(result.details).toHaveProperty("reference_score");
    expect(result.details).toHaveProperty("max_probe_score");
    expect(result.details).toHaveProperty("max_score");
  });

  it("handles empty probe array", () => {
    const result = checkScoreDistribution(700, [], 1000);
    expect(result.passed).toBe(true);
  });
});

// ── Orchestrator: runAllGates ─────────────────────────────────────────

describe("runAllGates", () => {
  it("returns overall pass for a valid spec with correct reference answer", async () => {
    const mod = createDeclarativeModule(baseSpec);
    const data = mod.generateData(42, {});
    const correctAnswer = { value: data.groundTruth.value };
    const report = await runAllGates(baseSpec, { seed: 42, answer: correctAnswer });
    expect(report.overall).not.toBe("fail");
    expect(report.gates.spec_validity.passed).toBe(true);
    expect(report.gates.determinism.passed).toBe(true);
    expect(report.gates.contract_consistency.passed).toBe(true);
    expect(report.generated_at).toBeDefined();
  });

  it("fails fast and marks all gates as skipped when spec is invalid", async () => {
    const report = await runAllGates({ invalid: "spec" }, { seed: 42, answer: {} });
    expect(report.overall).toBe("fail");
    expect(report.gates.spec_validity.passed).toBe(false);
    expect(report.gates.determinism.error).toMatch(/Skipped/);
    expect(report.gates.baseline_solveability.error).toMatch(/Skipped/);
  });

  it("returns structured GateReport with all expected keys", async () => {
    const report = await runAllGates({ invalid: "spec" }, { seed: 42, answer: {} });
    const gateKeys = Object.keys(report.gates);
    expect(gateKeys).toContain("spec_validity");
    expect(gateKeys).toContain("determinism");
    expect(gateKeys).toContain("contract_consistency");
    expect(gateKeys).toContain("baseline_solveability");
    expect(gateKeys).toContain("anti_gaming");
    expect(gateKeys).toContain("score_distribution");
  });
});

// ── Fix Suggestions ─────────────────────────────────────────────────

describe("fix_suggestion on gate failures", () => {
  it("spec_validity includes fix_suggestion when spec is invalid", () => {
    const result = checkSpecValidity({ invalid: true });
    expect(result.passed).toBe(false);
    expect(result.fix_suggestion).toBeDefined();
    expect(result.fix_suggestion!.issue).toContain("Zod schema");
    expect(result.fix_suggestion!.fix).toContain("camelCase");
  });

  it("contract_consistency includes fix_suggestion on failure", () => {
    const broken: CommunitySpec = {
      ...baseSpec,
      workspace: { ...baseSpec.workspace, seedable: true, challengeMd: "No seed here" },
    };
    const result = checkContractConsistency(broken);
    expect(result.passed).toBe(false);
    expect(result.fix_suggestion).toBeDefined();
    expect(result.fix_suggestion!.fix).toContain("{{seed}}");
  });

  it("anti_gaming includes fix_suggestion with example_code", async () => {
    const easySpec: CommunitySpec = {
      ...baseSpec,
      scorer: undefined,
    };
    const mod = createDeclarativeModule(easySpec);
    const result = await checkAntiGaming(easySpec, mod, { seed: 42, answer: { methodology: "approach" } });
    expect(result.passed).toBe(false);
    expect(result.fix_suggestion).toBeDefined();
    expect(result.fix_suggestion!.example_code).toBeDefined();
    expect(result.fix_suggestion!.fix).toContain("correctness > 0");
  });

  it("score_distribution includes fix_suggestion on failure", () => {
    const result = checkScoreDistribution(500, [300, 100], 1000, "newcomer");
    expect(result.passed).toBe(false);
    expect(result.fix_suggestion).toBeDefined();
  });

  it("no fix_suggestion on passing gates", () => {
    const result = checkSpecValidity(baseSpec);
    expect(result.passed).toBe(true);
    expect(result.fix_suggestion).toBeUndefined();
  });
});
