import { describe, it, expect, vi, beforeEach } from "vitest";
import { evaluate, computeWeightedTotal } from "../src/challenges/evaluator.js";
import { getChallenge } from "../src/challenges/registry.js";
import type { ChallengeModule, ScoringInput } from "../src/challenges/types.js";
import type { ScoringDimension } from "@clawdiators/shared";

// ── Test helpers ─────────────────────────────────────────────────────

const SEED = 42;

function makeScoringInput(
  mod: ChallengeModule,
  submission: Record<string, unknown>,
): ScoringInput {
  const data = mod.generateData(SEED, {});
  return {
    submission,
    groundTruth: data.groundTruth,
    startedAt: new Date("2025-01-01T00:00:00Z"),
    submittedAt: new Date("2025-01-01T00:01:00Z"),
    apiCallCount: 0,
    checkpoints: [],
  };
}

// ── evaluate() dispatcher ─────────────────────────────────────────────

describe("evaluate() dispatcher", () => {
  it("deterministic: matches direct mod.score() call", async () => {
    const mod = getChallenge("cipher-forge")!;
    expect(mod).toBeDefined();

    const data = mod.generateData(SEED, {});
    const input = makeScoringInput(mod, {});

    const directResult = mod.score(input);
    const { result, log } = await evaluate(mod, input);

    expect(result.breakdown.total).toBe(directResult.breakdown.total);
    expect(result.breakdown).toEqual(directResult.breakdown);
    expect(log.method).toBe("deterministic");
    expect(log.errors).toEqual([]);
    expect(log.total).toBe(directResult.breakdown.total);
    expect(log.startedAt).toBeDefined();
    expect(log.completedAt).toBeDefined();
    expect(new Date(log.completedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(log.startedAt).getTime(),
    );
  });

  it("deterministic: populates rawScores and finalScores correctly", async () => {
    const mod = getChallenge("cipher-forge")!;
    const input = makeScoringInput(mod, {});

    const { log } = await evaluate(mod, input);

    // rawScores and finalScores should not have "total"
    expect(log.rawScores).not.toHaveProperty("total");
    expect(log.finalScores).not.toHaveProperty("total");

    // They should have the same keys
    expect(Object.keys(log.rawScores).sort()).toEqual(
      Object.keys(log.finalScores).sort(),
    );
  });

  it("deterministic: runtime is undefined for deterministic challenges", async () => {
    const mod = getChallenge("cipher-forge")!;
    const input = makeScoringInput(mod, {});

    const { log } = await evaluate(mod, input);

    expect(log.runtime).toBeUndefined();
    expect(log.containerExitCode).toBeUndefined();
    expect(log.stdout).toBeUndefined();
  });

  it("unknown method: falls back to mod.score() with error", async () => {
    const mod = getChallenge("cipher-forge")!;
    const input = makeScoringInput(mod, {});

    // Create a fake module with an unknown method
    const fakeMod = {
      ...mod,
      scoringSpec: {
        ...mod.scoringSpec!,
        method: "banana" as any,
      },
    };

    const { result, log } = await evaluate(fakeMod, input);

    expect(log.method).toBe("banana");
    expect(log.errors.length).toBeGreaterThan(0);
    expect(log.errors[0]).toContain("Unknown scoring method");

    // Should still produce a valid result via fallback
    const directResult = mod.score(input);
    expect(result.breakdown.total).toBe(directResult.breakdown.total);
  });

  it("test-suite without evaluator: uses module scorer silently", async () => {
    const mod = getChallenge("cipher-forge")!;
    const input = makeScoringInput(mod, {});

    const fakeMod = {
      ...mod,
      scoringSpec: {
        ...mod.scoringSpec!,
        method: "test-suite" as const,
        // No evaluator set — code-based modules use mod.score() directly
      },
    };

    const { result, log } = await evaluate(fakeMod, input);

    expect(log.method).toBe("test-suite");
    expect(log.errors).toEqual([]);

    // Should use mod.score()
    const directResult = mod.score(input);
    expect(result.breakdown.total).toBe(directResult.breakdown.total);
  });

  it("custom-script without evaluator: uses module scorer silently", async () => {
    const mod = getChallenge("cipher-forge")!;
    const input = makeScoringInput(mod, {});

    const fakeMod = {
      ...mod,
      scoringSpec: {
        ...mod.scoringSpec!,
        method: "custom-script" as const,
      },
    };

    const { result, log } = await evaluate(fakeMod, input);

    expect(log.method).toBe("custom-script");
    expect(log.errors).toEqual([]);

    // Should use mod.score()
    const directResult = mod.score(input);
    expect(result.breakdown.total).toBe(directResult.breakdown.total);
  });
});

// ── evaluate() with all registered modules ───────────────────────────

describe("evaluate() with registered modules", () => {
  const slugs = [
    "cipher-forge",
    "reef-refactor",
    "logic-reef",
    "depth-first-gen",
    "archive-dive",
    "contract-review",
    "chart-forensics",
    "cartographers-eye",
    "blueprint-audit",
    "adversarial-interview",
    "the-mirage",
    "deep-mapping",
    "codebase-archaeology",
    "needle-haystack",
    "performance-optimizer",
  ];

  for (const slug of slugs) {
    it(`${slug}: evaluate() matches direct score()`, async () => {
      const mod = getChallenge(slug)!;
      expect(mod).toBeDefined();

      const input = makeScoringInput(mod, {});

      const directResult = mod.score(input);
      const { result, log } = await evaluate(mod, input);

      expect(result.breakdown.total).toBe(directResult.breakdown.total);
      expect(log.method).toBe(mod.scoringSpec?.method ?? "deterministic");
      expect(log.total).toBe(directResult.breakdown.total);
    });
  }
});

// ── Docker evaluator (mocked) ────────────────────────────────────────

describe("evaluate() with Docker (mocked)", () => {
  // We mock the docker-evaluator module to avoid actually running Docker
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("test-suite with evaluator: calls Docker and uses returned scores", async () => {
    // Mock the docker-evaluator module
    const dockerMod = await import("../src/challenges/docker-evaluator.js");
    vi.spyOn(dockerMod, "isDockerAvailable").mockResolvedValue(false);
    vi.spyOn(dockerMod, "evaluateInSubprocess").mockResolvedValue({
      scores: { accuracy: 800, methodology: 200 },
      exitCode: 0,
      stdout: '{"scores":{"accuracy":800,"methodology":200}}',
      stderr: "",
    });

    const mod = getChallenge("cipher-forge")!;
    const input = makeScoringInput(mod, { "test.js": "test code" });

    const fakeMod: ChallengeModule = {
      ...mod,
      scoringSpec: {
        method: "test-suite",
        dimensions: mod.dimensions,
        maxScore: 1000,
        evaluator: 'console.log(JSON.stringify({scores:{accuracy:800,methodology:200}}))',
        runtime: "node",
      },
    };

    const { result, log } = await evaluate(fakeMod, input);

    expect(log.method).toBe("test-suite");
    expect(log.errors).toContain("Docker unavailable; using subprocess fallback");
    expect(dockerMod.evaluateInSubprocess).toHaveBeenCalledOnce();
  });

  it("test-suite with Docker available: calls evaluateInDocker", async () => {
    const dockerMod = await import("../src/challenges/docker-evaluator.js");
    vi.spyOn(dockerMod, "isDockerAvailable").mockResolvedValue(true);
    vi.spyOn(dockerMod, "evaluateInDocker").mockResolvedValue({
      scores: { accuracy: 500 },
      exitCode: 0,
      stdout: '{"scores":{"accuracy":500}}',
      stderr: "",
    });

    const mod = getChallenge("cipher-forge")!;
    const input = makeScoringInput(mod, {});

    const fakeMod: ChallengeModule = {
      ...mod,
      scoringSpec: {
        method: "test-suite",
        dimensions: mod.dimensions,
        maxScore: 1000,
        evaluator: 'console.log(JSON.stringify({scores:{accuracy:500}}))',
        runtime: "node",
      },
    };

    const { log } = await evaluate(fakeMod, input);

    expect(log.method).toBe("test-suite");
    expect(log.errors).not.toContain("Docker unavailable; using subprocess fallback");
    expect(dockerMod.evaluateInDocker).toHaveBeenCalledOnce();
  });

  it("evaluator returns no scores: falls back to mod.score()", async () => {
    const dockerMod = await import("../src/challenges/docker-evaluator.js");
    vi.spyOn(dockerMod, "isDockerAvailable").mockResolvedValue(false);
    vi.spyOn(dockerMod, "evaluateInSubprocess").mockResolvedValue({
      scores: {},
      exitCode: 1,
      stdout: "error: something failed",
      stderr: "crash",
      error: "Subprocess error: exit code 1",
    });

    const mod = getChallenge("cipher-forge")!;
    const input = makeScoringInput(mod, {});

    const fakeMod: ChallengeModule = {
      ...mod,
      scoringSpec: {
        method: "custom-script",
        dimensions: mod.dimensions,
        maxScore: 1000,
        evaluator: 'throw new Error("boom")',
        runtime: "node",
      },
    };

    const { result, log } = await evaluate(fakeMod, input);

    expect(log.method).toBe("custom-script");
    expect(log.errors).toContain("Subprocess error: exit code 1");
    expect(log.errors).toContain("Evaluator returned no scores; falling back to module scorer");

    // Should get the same result as mod.score()
    const directResult = mod.score(input);
    expect(result.breakdown.total).toBe(directResult.breakdown.total);
  });
});

// ── evaluate() with tier parameters ───────────────────────────────────

describe("evaluate() with tier parameters", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("passes tier to Docker evaluator via opts", async () => {
    const dockerMod = await import("../src/challenges/docker-evaluator.js");
    vi.spyOn(dockerMod, "isDockerAvailable").mockResolvedValue(true);
    const dockerSpy = vi.spyOn(dockerMod, "evaluateInDocker").mockResolvedValue({
      scores: { accuracy: 500, speed: 200 },
      exitCode: 0,
      stdout: '{"scores":{"accuracy":500,"speed":200}}',
      stderr: "",
    });

    const mod = getChallenge("cipher-forge")!;
    const input = makeScoringInput(mod, {});

    const fakeMod: ChallengeModule = {
      ...mod,
      scoringSpec: {
        method: "custom-script",
        dimensions: mod.dimensions,
        maxScore: 1000,
        evaluator: 'console.log(JSON.stringify({scores:{accuracy:500,speed:200}}))',
        runtime: "node",
      },
    };

    await evaluate(fakeMod, input, { tier: "networked" });

    expect(dockerSpy).toHaveBeenCalledOnce();
    const callArgs = dockerSpy.mock.calls[0];
    // 5th arg is TierEvalOpts
    expect(callArgs[4]).toBeDefined();
    expect(callArgs[4]!.tier).toBe("networked");
  });

  it("passes envVars to Docker evaluator", async () => {
    const dockerMod = await import("../src/challenges/docker-evaluator.js");
    vi.spyOn(dockerMod, "isDockerAvailable").mockResolvedValue(true);
    const dockerSpy = vi.spyOn(dockerMod, "evaluateInDocker").mockResolvedValue({
      scores: { accuracy: 300 },
      exitCode: 0,
      stdout: '{"scores":{"accuracy":300}}',
      stderr: "",
    });

    const mod = getChallenge("cipher-forge")!;
    const input = makeScoringInput(mod, {});

    const fakeMod: ChallengeModule = {
      ...mod,
      scoringSpec: {
        method: "custom-script",
        dimensions: mod.dimensions,
        maxScore: 1000,
        evaluator: 'console.log(JSON.stringify({scores:{accuracy:300}}))',
        runtime: "node",
      },
    };

    await evaluate(fakeMod, input, {
      tier: "networked",
      envVars: { ANTHROPIC_API_KEY: "test-key" },
    });

    const callArgs = dockerSpy.mock.calls[0];
    expect(callArgs[4]!.envVars).toBeDefined();
    expect(callArgs[4]!.envVars!.ANTHROPIC_API_KEY).toBe("test-key");
  });

  it("includes ground-truth.json in submission files", async () => {
    const dockerMod = await import("../src/challenges/docker-evaluator.js");
    vi.spyOn(dockerMod, "isDockerAvailable").mockResolvedValue(false);
    const subSpy = vi.spyOn(dockerMod, "evaluateInSubprocess").mockResolvedValue({
      scores: { accuracy: 400 },
      exitCode: 0,
      stdout: '{"scores":{"accuracy":400}}',
      stderr: "",
    });

    const mod = getChallenge("cipher-forge")!;
    const input = makeScoringInput(mod, { answer: 42 });

    const fakeMod: ChallengeModule = {
      ...mod,
      scoringSpec: {
        method: "custom-script",
        dimensions: mod.dimensions,
        maxScore: 1000,
        evaluator: 'console.log(JSON.stringify({scores:{accuracy:400}}))',
        runtime: "node",
      },
    };

    await evaluate(fakeMod, input);

    const callArgs = subSpy.mock.calls[0];
    const submissionFiles = callArgs[0] as Record<string, string>;
    expect(submissionFiles["ground-truth.json"]).toBeDefined();
    const groundTruth = JSON.parse(submissionFiles["ground-truth.json"]);
    expect(groundTruth).toBeDefined();
  });

  it("passes timing metadata as env vars", async () => {
    const dockerMod = await import("../src/challenges/docker-evaluator.js");
    vi.spyOn(dockerMod, "isDockerAvailable").mockResolvedValue(false);
    const subSpy = vi.spyOn(dockerMod, "evaluateInSubprocess").mockResolvedValue({
      scores: { accuracy: 400 },
      exitCode: 0,
      stdout: '{"scores":{"accuracy":400}}',
      stderr: "",
    });

    const mod = getChallenge("cipher-forge")!;
    const input = makeScoringInput(mod, {});

    const fakeMod: ChallengeModule = {
      ...mod,
      scoringSpec: {
        method: "custom-script",
        dimensions: mod.dimensions,
        maxScore: 1000,
        evaluator: 'console.log(JSON.stringify({scores:{accuracy:400}}))',
        runtime: "node",
      },
    };

    await evaluate(fakeMod, input);

    const callArgs = subSpy.mock.calls[0];
    const tierOpts = callArgs[4];
    expect(tierOpts?.envVars?.STARTED_AT).toBeDefined();
    expect(tierOpts?.envVars?.SUBMITTED_AT).toBeDefined();
    expect(tierOpts?.envVars?.API_CALL_COUNT).toBe("0");
  });

  it("uses custom timeoutSecs when provided", async () => {
    const dockerMod = await import("../src/challenges/docker-evaluator.js");
    vi.spyOn(dockerMod, "isDockerAvailable").mockResolvedValue(false);
    const subSpy = vi.spyOn(dockerMod, "evaluateInSubprocess").mockResolvedValue({
      scores: { accuracy: 400 },
      exitCode: 0,
      stdout: '{"scores":{"accuracy":400}}',
      stderr: "",
    });

    const mod = getChallenge("cipher-forge")!;
    const input = makeScoringInput(mod, {});

    const fakeMod: ChallengeModule = {
      ...mod,
      scoringSpec: {
        method: "custom-script",
        dimensions: mod.dimensions,
        maxScore: 1000,
        evaluator: 'console.log(JSON.stringify({scores:{accuracy:400}}))',
        runtime: "node",
      },
    };

    await evaluate(fakeMod, input, { timeoutSecs: 120 });

    const callArgs = subSpy.mock.calls[0];
    expect(callArgs[3]).toBe(120); // timeoutSecs
  });

  it("includes tier in EvaluationLog when provided", async () => {
    const mod = getChallenge("cipher-forge")!;
    const input = makeScoringInput(mod, {});

    const { log } = await evaluate(mod, input, { tier: "networked" });

    expect(log.tier).toBe("networked");
  });

  it("tier is undefined in EvaluationLog when not provided", async () => {
    const mod = getChallenge("cipher-forge")!;
    const input = makeScoringInput(mod, {});

    const { log } = await evaluate(mod, input);

    expect(log.tier).toBeUndefined();
  });
});

// ── computeWeightedTotal ──────────────────────────────────────────────

describe("computeWeightedTotal", () => {
  it("computes weighted breakdown and total", () => {
    const dimensions: { key: string; weight: number }[] = [
      { key: "accuracy", weight: 0.4 },
      { key: "speed", weight: 0.3 },
      { key: "style", weight: 0.3 },
    ];

    const rawScores = { accuracy: 1000, speed: 800, style: 600 };
    const breakdown = computeWeightedTotal(rawScores, dimensions);

    expect(breakdown.accuracy).toBe(400);
    expect(breakdown.speed).toBe(240);
    expect(breakdown.style).toBe(180);
    expect(breakdown.total).toBe(820);
  });

  it("handles missing dimensions gracefully", () => {
    const dimensions: { key: string; weight: number }[] = [
      { key: "accuracy", weight: 0.5 },
      { key: "missing", weight: 0.5 },
    ];

    const rawScores = { accuracy: 1000 };
    const breakdown = computeWeightedTotal(rawScores, dimensions);

    expect(breakdown.accuracy).toBe(500);
    expect(breakdown.missing).toBe(0);
    expect(breakdown.total).toBe(500);
  });

  it("rounds weighted scores", () => {
    const dimensions: { key: string; weight: number }[] = [
      { key: "a", weight: 0.33 },
    ];

    const rawScores = { a: 100 };
    const breakdown = computeWeightedTotal(rawScores, dimensions);

    expect(breakdown.a).toBe(33);
    expect(breakdown.total).toBe(33);
  });
});
