import { describe, it, expect } from "vitest";
import { validateTrajectory } from "../src/services/trajectory-validation.js";
import type { ReplayStep } from "@clawdiators/shared";

const now = new Date("2026-02-27T12:00:00Z");
const startedAt = new Date("2026-02-27T11:58:00Z");
const submittedAt = new Date("2026-02-27T12:00:00Z");

function makeToolStep(overrides?: Partial<ReplayStep & { type: "tool_call" }>): ReplayStep {
  return {
    type: "tool_call",
    ts: "2026-02-27T11:59:00Z",
    tool: "bash",
    input: "ls -la",
    output: "total 42",
    duration_ms: 50,
    ...overrides,
  };
}

function makeLLMStep(overrides?: Partial<ReplayStep & { type: "llm_call" }>): ReplayStep {
  return {
    type: "llm_call",
    ts: "2026-02-27T11:59:30Z",
    model: "claude-opus-4-6",
    input_tokens: 1000,
    output_tokens: 500,
    duration_ms: 2000,
    ...overrides,
  };
}

describe("validateTrajectory", () => {
  it("validates a well-formed trajectory with tool and LLM calls", () => {
    const result = validateTrajectory(
      [makeToolStep(), makeLLMStep()],
      startedAt,
      submittedAt,
    );
    expect(result.valid).toBe(true);
    expect(result.checks.non_empty).toBe(true);
    expect(result.checks.timestamps_in_bounds).toBe(true);
    expect(result.checks.tool_replay_consistent).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("fails on empty trajectory", () => {
    const result = validateTrajectory([], startedAt, submittedAt);
    expect(result.valid).toBe(false);
    expect(result.checks.non_empty).toBe(false);
    expect(result.warnings).toContain("Trajectory is empty.");
  });

  it("fails when step timestamp is before match start (minus grace)", () => {
    const earlyStep = makeToolStep({ ts: "2026-02-27T11:50:00Z" });
    const result = validateTrajectory([earlyStep], startedAt, submittedAt);
    expect(result.valid).toBe(false);
    expect(result.checks.timestamps_in_bounds).toBe(false);
    expect(result.warnings.some((w) => w.includes("outside the match window"))).toBe(true);
  });

  it("fails when step timestamp is after submission (plus grace)", () => {
    const lateStep = makeToolStep({ ts: "2026-02-27T12:01:00Z" });
    const result = validateTrajectory([lateStep], startedAt, submittedAt);
    expect(result.valid).toBe(false);
    expect(result.checks.timestamps_in_bounds).toBe(false);
  });

  it("allows step within 5s grace before start", () => {
    // 3 seconds before startedAt — within 5s grace
    const earlyStep = makeToolStep({ ts: "2026-02-27T11:57:57Z" });
    const result = validateTrajectory([earlyStep], startedAt, submittedAt);
    expect(result.valid).toBe(true);
    expect(result.checks.timestamps_in_bounds).toBe(true);
  });

  it("warns on invalid timestamp format", () => {
    const badStep = makeToolStep({ ts: "not-a-date" });
    const result = validateTrajectory([badStep], startedAt, submittedAt);
    expect(result.valid).toBe(false);
    expect(result.warnings.some((w) => w.includes("invalid timestamp"))).toBe(true);
  });

  it("validates tool read replay against workspace files", () => {
    const readStep = makeToolStep({
      tool: "read",
      input: "CHALLENGE.md",
      output: "# Challenge\nSolve this.",
    });
    const workspaceFiles = { "CHALLENGE.md": "# Challenge\nSolve this." };
    const result = validateTrajectory([readStep], startedAt, submittedAt, workspaceFiles);
    expect(result.valid).toBe(true);
    expect(result.checks.tool_replay_consistent).toBe(true);
  });

  it("warns on mismatched file read output", () => {
    const readStep = makeToolStep({
      tool: "read",
      input: "CHALLENGE.md",
      output: "fabricated content",
    });
    const workspaceFiles = { "CHALLENGE.md": "# Real Content" };
    const result = validateTrajectory([readStep], startedAt, submittedAt, workspaceFiles);
    expect(result.valid).toBe(true); // mismatches warn but don't fail
    expect(result.checks.tool_replay_consistent).toBe(false);
    expect(result.warnings.some((w) => w.includes("File read mismatch"))).toBe(true);
  });

  it("ignores read steps for files not in workspace", () => {
    const readStep = makeToolStep({
      tool: "read",
      input: "unknown-file.txt",
      output: "some content",
    });
    const workspaceFiles = { "CHALLENGE.md": "# Challenge" };
    const result = validateTrajectory([readStep], startedAt, submittedAt, workspaceFiles);
    expect(result.checks.tool_replay_consistent).toBe(true);
  });

  it("skips tool replay check when no workspace files provided", () => {
    const readStep = makeToolStep({
      tool: "read",
      input: "CHALLENGE.md",
      output: "anything",
    });
    const result = validateTrajectory([readStep], startedAt, submittedAt);
    expect(result.checks.tool_replay_consistent).toBe(true);
  });

  it("handles LLM-only trajectory", () => {
    const result = validateTrajectory(
      [makeLLMStep(), makeLLMStep({ ts: "2026-02-27T11:59:45Z" })],
      startedAt,
      submittedAt,
    );
    expect(result.valid).toBe(true);
    expect(result.checks.non_empty).toBe(true);
  });

  it("handles mixed trajectory with some out-of-bounds steps", () => {
    const steps: ReplayStep[] = [
      makeToolStep(), // in bounds
      makeLLMStep({ ts: "2026-02-27T13:00:00Z" }), // way out of bounds
    ];
    const result = validateTrajectory(steps, startedAt, submittedAt);
    expect(result.valid).toBe(false);
    expect(result.checks.non_empty).toBe(true);
    expect(result.checks.timestamps_in_bounds).toBe(false);
  });
});
