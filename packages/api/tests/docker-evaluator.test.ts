import { describe, it, expect } from "vitest";
import { TIER_FLAGS } from "../src/challenges/docker-evaluator.js";
import type { EnvironmentTier } from "@clawdiators/shared";

// ── TIER_FLAGS ────────────────────────────────────────────────────────

describe("TIER_FLAGS", () => {
  it("sandboxed includes --network=none", () => {
    expect(TIER_FLAGS.sandboxed).toContain("--network=none");
  });

  it("sandboxed has 512m memory", () => {
    expect(TIER_FLAGS.sandboxed).toContain("--memory=512m");
  });

  it("sandboxed has 1 cpu", () => {
    expect(TIER_FLAGS.sandboxed).toContain("--cpus=1");
  });

  it("sandboxed has 50 pids limit", () => {
    expect(TIER_FLAGS.sandboxed).toContain("--pids-limit=50");
  });

  it("networked does NOT include --network=none", () => {
    expect(TIER_FLAGS.networked).not.toContain("--network=none");
  });

  it("networked has 1g memory", () => {
    expect(TIER_FLAGS.networked).toContain("--memory=1g");
  });

  it("networked has 2 cpus", () => {
    expect(TIER_FLAGS.networked).toContain("--cpus=2");
  });

  it("networked has 100 pids limit", () => {
    expect(TIER_FLAGS.networked).toContain("--pids-limit=100");
  });

  it("networked has 128m tmpfs", () => {
    const tmpIdx = TIER_FLAGS.networked.indexOf("--tmpfs");
    expect(tmpIdx).toBeGreaterThan(-1);
    expect(TIER_FLAGS.networked[tmpIdx + 1]).toContain("128m");
  });

  it("gpu includes --gpus all", () => {
    expect(TIER_FLAGS.gpu).toContain("--gpus");
    const gpuIdx = TIER_FLAGS.gpu.indexOf("--gpus");
    expect(TIER_FLAGS.gpu[gpuIdx + 1]).toBe("all");
  });

  it("gpu has 4g memory", () => {
    expect(TIER_FLAGS.gpu).toContain("--memory=4g");
  });

  it("gpu has 4 cpus", () => {
    expect(TIER_FLAGS.gpu).toContain("--cpus=4");
  });

  it("gpu has 200 pids limit", () => {
    expect(TIER_FLAGS.gpu).toContain("--pids-limit=200");
  });

  it("custom has empty flags array", () => {
    expect(TIER_FLAGS.custom).toEqual([]);
  });

  it("all tiers are defined", () => {
    const tiers: EnvironmentTier[] = ["sandboxed", "networked", "gpu", "custom"];
    for (const tier of tiers) {
      expect(TIER_FLAGS[tier]).toBeDefined();
      expect(Array.isArray(TIER_FLAGS[tier])).toBe(true);
    }
  });

  it("sandboxed and networked both include --read-only", () => {
    expect(TIER_FLAGS.sandboxed).toContain("--read-only");
    expect(TIER_FLAGS.networked).toContain("--read-only");
  });
});
