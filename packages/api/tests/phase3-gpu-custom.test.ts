import { describe, it, expect } from "vitest";
import {
  TIER_FLAGS,
  SANDBOXED_FLAGS,
  getDockerFlags,
} from "../src/challenges/docker-evaluator.js";
import {
  isImageAllowed,
  getAllowedImages,
  addAllowedImage,
  removeAllowedImage,
} from "../src/challenges/primitives/validator.js";
import { generateBenchmarkInlineScript } from "../src/challenges/primitives/benchmark.js";
import { evaluate } from "../src/challenges/evaluator.js";
import { getChallenge } from "../src/challenges/registry.js";

// ── Image Allowlist ──────────────────────────────────────────────────

describe("Image allowlist", () => {
  it("isImageAllowed accepts default images", () => {
    expect(isImageAllowed("clawdiators/eval-node:20")).toBe(true);
    expect(isImageAllowed("clawdiators/eval-python:3.12")).toBe(true);
    expect(isImageAllowed("clawdiators/eval-multi:latest")).toBe(true);
    expect(isImageAllowed("clawdiators/eval-cuda:12")).toBe(true);
    expect(isImageAllowed("clawdiators/eval-cuda:latest")).toBe(true);
  });

  it("isImageAllowed rejects unknown images", () => {
    expect(isImageAllowed("some-random/image:latest")).toBe(false);
    expect(isImageAllowed("evil-corp/bitcoin-miner:1.0")).toBe(false);
    expect(isImageAllowed("")).toBe(false);
  });

  it("getAllowedImages returns sorted list", () => {
    const images = getAllowedImages();
    expect(images.length).toBeGreaterThanOrEqual(5);
    // Verify sorted
    for (let i = 1; i < images.length; i++) {
      expect(images[i] >= images[i - 1]).toBe(true);
    }
  });

  it("addAllowedImage adds a new image", () => {
    const testImage = "test/phase3-image:1.0";
    expect(isImageAllowed(testImage)).toBe(false);
    addAllowedImage(testImage);
    expect(isImageAllowed(testImage)).toBe(true);
    // Clean up
    removeAllowedImage(testImage);
  });

  it("removeAllowedImage removes non-default images", () => {
    const testImage = "test/phase3-removable:2.0";
    addAllowedImage(testImage);
    expect(isImageAllowed(testImage)).toBe(true);
    const removed = removeAllowedImage(testImage);
    expect(removed).toBe(true);
    expect(isImageAllowed(testImage)).toBe(false);
  });

  it("removeAllowedImage prevents removing default images", () => {
    const removed = removeAllowedImage("clawdiators/eval-node:20");
    expect(removed).toBe(false);
    // Still in the list
    expect(isImageAllowed("clawdiators/eval-node:20")).toBe(true);
  });

  it("removeAllowedImage returns false for unknown images", () => {
    const removed = removeAllowedImage("does-not-exist:nope");
    expect(removed).toBe(false);
  });
});

// ── getDockerFlags ───────────────────────────────────────────────────

describe("getDockerFlags", () => {
  it("includes --network=none", () => {
    expect(getDockerFlags()).toContain("--network=none");
  });

  it("has 512m memory", () => {
    expect(getDockerFlags()).toContain("--memory=512m");
  });

  it("has 1 cpu", () => {
    expect(getDockerFlags()).toContain("--cpus=1");
  });

  it("has 50 pids limit", () => {
    expect(getDockerFlags()).toContain("--pids-limit=50");
  });

  it("includes --read-only", () => {
    expect(getDockerFlags()).toContain("--read-only");
  });

  it("returns a defensive copy (not the same reference)", () => {
    const a = getDockerFlags();
    const b = getDockerFlags();
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    expect(a).not.toBe(SANDBOXED_FLAGS);
  });

  it("backward-compat TIER_FLAGS.sandboxed is the SANDBOXED_FLAGS array", () => {
    expect(TIER_FLAGS.sandboxed).toBe(SANDBOXED_FLAGS);
    expect(TIER_FLAGS.sandboxed).toContain("--network=none");
  });
});

// ── EvaluationLog: durationMs and estimatedCostUsd ──────────────────

describe("EvaluationLog: durationMs and estimatedCostUsd", () => {
  it("durationMs is populated and non-negative", async () => {
    const mod = getChallenge("cipher-forge")!;
    expect(mod).toBeDefined();
    const data = mod.generateData(42, {});
    const input = {
      submission: {},
      groundTruth: data.groundTruth,
      startedAt: new Date("2025-01-01T00:00:00Z"),
      submittedAt: new Date("2025-01-01T00:01:00Z"),
      apiCallCount: 0,
      checkpoints: [],
    };
    const { log } = await evaluate(mod, input);
    expect(log.durationMs).toBeDefined();
    expect(log.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("estimatedCostUsd is undefined for non-GPU tiers", async () => {
    const mod = getChallenge("cipher-forge")!;
    const data = mod.generateData(42, {});
    const input = {
      submission: {},
      groundTruth: data.groundTruth,
      startedAt: new Date("2025-01-01T00:00:00Z"),
      submittedAt: new Date("2025-01-01T00:01:00Z"),
      apiCallCount: 0,
      checkpoints: [],
    };
    const { log } = await evaluate(mod, input);
    expect(log.estimatedCostUsd).toBeUndefined();
  });

  it("estimatedCostUsd is always undefined (tier system removed)", async () => {
    const mod = getChallenge("cipher-forge")!;
    const data = mod.generateData(42, {});
    const input = {
      submission: {},
      groundTruth: data.groundTruth,
      startedAt: new Date("2025-01-01T00:00:00Z"),
      submittedAt: new Date("2025-01-01T00:01:00Z"),
      apiCallCount: 0,
      checkpoints: [],
    };
    const { log } = await evaluate(mod, input);
    expect(log.estimatedCostUsd).toBeUndefined();
  });
});

// ── generateBenchmarkInlineScript ────────────────────────────────────

describe("generateBenchmarkInlineScript", () => {
  it("returns a non-empty string", () => {
    const script = generateBenchmarkInlineScript();
    expect(typeof script).toBe("string");
    expect(script.length).toBeGreaterThan(100);
  });

  it("contains benchmark function", () => {
    const script = generateBenchmarkInlineScript();
    expect(script).toContain("function benchmark(");
  });

  it("contains measureMemory function", () => {
    const script = generateBenchmarkInlineScript();
    expect(script).toContain("function measureMemory(");
  });

  it("contains measureGpu function", () => {
    const script = generateBenchmarkInlineScript();
    expect(script).toContain("function measureGpu(");
  });

  it("benchmark function uses process.hrtime.bigint", () => {
    const script = generateBenchmarkInlineScript();
    expect(script).toContain("process.hrtime.bigint()");
  });

  it("measureGpu calls nvidia-smi", () => {
    const script = generateBenchmarkInlineScript();
    expect(script).toContain("nvidia-smi");
  });
});

// ── Backward compatibility ──────────────────────────────────────────

describe("Backward compatibility: Tier 1-2 unaffected", () => {
  it("existing challenges still load and score correctly", () => {
    const mod = getChallenge("cipher-forge")!;
    expect(mod).toBeDefined();
    const data = mod.generateData(42, {});
    expect(data.objective).toBeDefined();
    expect(data.groundTruth).toBeDefined();
  });

  it("evaluate() still works for deterministic challenges", async () => {
    const mod = getChallenge("cipher-forge")!;
    const data = mod.generateData(42, {});
    const input = {
      submission: {},
      groundTruth: data.groundTruth,
      startedAt: new Date("2025-01-01T00:00:00Z"),
      submittedAt: new Date("2025-01-01T00:01:00Z"),
      apiCallCount: 0,
      checkpoints: [],
    };
    const { result, log } = await evaluate(mod, input);
    expect(result.breakdown.total).toBeDefined();
    expect(log.method).toBe("deterministic");
    expect(log.durationMs).toBeGreaterThanOrEqual(0);
    expect(log.estimatedCostUsd).toBeUndefined();
  });
});
