import { describe, it, expect } from "vitest";
import { SANDBOXED_FLAGS } from "../src/challenges/docker-evaluator.js";

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
