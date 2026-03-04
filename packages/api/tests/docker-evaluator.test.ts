import { describe, it, expect } from "vitest";
import { TIER_FLAGS, SANDBOXED_FLAGS, getDockerFlags } from "../src/challenges/docker-evaluator.js";

// ── SANDBOXED_FLAGS ──────────────────────────────────────────────────

describe("SANDBOXED_FLAGS", () => {
  it("includes --network=none", () => {
    expect(SANDBOXED_FLAGS).toContain("--network=none");
  });

  it("has 512m memory", () => {
    expect(SANDBOXED_FLAGS).toContain("--memory=512m");
  });

  it("has 1 cpu", () => {
    expect(SANDBOXED_FLAGS).toContain("--cpus=1");
  });

  it("has 50 pids limit", () => {
    expect(SANDBOXED_FLAGS).toContain("--pids-limit=50");
  });

  it("includes --read-only", () => {
    expect(SANDBOXED_FLAGS).toContain("--read-only");
  });

  it("includes --tmpfs with 64m", () => {
    const tmpIdx = SANDBOXED_FLAGS.indexOf("--tmpfs");
    expect(tmpIdx).toBeGreaterThan(-1);
    expect(SANDBOXED_FLAGS[tmpIdx + 1]).toContain("64m");
  });
});

// ── getDockerFlags ───────────────────────────────────────────────────

describe("getDockerFlags", () => {
  it("returns a copy of SANDBOXED_FLAGS", () => {
    const flags = getDockerFlags();
    expect(flags).toEqual(SANDBOXED_FLAGS);
    // Verify it's a copy, not the same reference
    expect(flags).not.toBe(SANDBOXED_FLAGS);
  });

  it("includes --network=none", () => {
    expect(getDockerFlags()).toContain("--network=none");
  });

  it("includes --read-only", () => {
    expect(getDockerFlags()).toContain("--read-only");
  });
});

// ── TIER_FLAGS backward compat ───────────────────────────────────────

describe("TIER_FLAGS (backward compat)", () => {
  it("TIER_FLAGS.sandboxed is the same as SANDBOXED_FLAGS", () => {
    expect(TIER_FLAGS.sandboxed).toBe(SANDBOXED_FLAGS);
  });

  it("TIER_FLAGS.sandboxed includes --network=none", () => {
    expect(TIER_FLAGS.sandboxed).toContain("--network=none");
  });

  it("TIER_FLAGS.sandboxed includes --memory=512m", () => {
    expect(TIER_FLAGS.sandboxed).toContain("--memory=512m");
  });

  it("TIER_FLAGS.sandboxed includes --read-only", () => {
    expect(TIER_FLAGS.sandboxed).toContain("--read-only");
  });
});
