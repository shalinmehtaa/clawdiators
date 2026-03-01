import { describe, it, expect } from "vitest";
import { replayStepSchema } from "../src/schemas/replay.js";

describe("replayStepSchema", () => {
  it("accepts a valid replay step with all fields", () => {
    const result = replayStepSchema.safeParse({
      ts: "2026-02-27T10:00:00.000Z",
      tool: "bash",
      input: "ls -la workspace/",
      output: "total 24\ndrwxr-xr-x  5 agent  staff  160",
      duration_ms: 45,
      error: false,
      metadata: { model: "claude-opus-4-6", tokens_in: 500 },
    });
    expect(result.success).toBe(true);
  });

  it("accepts a minimal step (ts, tool, input, duration_ms only)", () => {
    const result = replayStepSchema.safeParse({
      ts: "2026-02-27T10:00:01.000Z",
      tool: "read",
      input: "CHALLENGE.md",
      duration_ms: 12,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.output).toBeUndefined();
      expect(result.data.error).toBeUndefined();
    }
  });

  it("rejects a step missing required field: ts", () => {
    const result = replayStepSchema.safeParse({ tool: "bash", input: "ls", duration_ms: 10 });
    expect(result.success).toBe(false);
  });

  it("rejects a step missing required field: tool", () => {
    const result = replayStepSchema.safeParse({ ts: "2026-01-01T00:00:00Z", input: "ls", duration_ms: 10 });
    expect(result.success).toBe(false);
  });

  it("rejects a step missing required field: input", () => {
    const result = replayStepSchema.safeParse({ ts: "2026-01-01T00:00:00Z", tool: "bash", duration_ms: 10 });
    expect(result.success).toBe(false);
  });

  it("rejects a step missing required field: duration_ms", () => {
    const result = replayStepSchema.safeParse({ ts: "2026-01-01T00:00:00Z", tool: "bash", input: "ls" });
    expect(result.success).toBe(false);
  });

  it("rejects input longer than 5000 characters", () => {
    const result = replayStepSchema.safeParse({
      ts: "2026-01-01T00:00:00Z",
      tool: "bash",
      input: "x".repeat(5001),
      duration_ms: 10,
    });
    expect(result.success).toBe(false);
  });

  it("rejects output longer than 5000 characters", () => {
    const result = replayStepSchema.safeParse({
      ts: "2026-01-01T00:00:00Z",
      tool: "bash",
      input: "ls",
      output: "y".repeat(5001),
      duration_ms: 10,
    });
    expect(result.success).toBe(false);
  });

  it("accepts error=true for failed tool calls", () => {
    const result = replayStepSchema.safeParse({
      ts: "2026-02-27T10:00:10Z",
      tool: "bash",
      input: "rm -rf /important",
      output: "Permission denied",
      duration_ms: 3,
      error: true,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.error).toBe(true);
  });

  it("accepts metadata as an arbitrary key-value record", () => {
    const result = replayStepSchema.safeParse({
      ts: "2026-02-27T10:00:15Z",
      tool: "llm",
      input: "Summarize findings",
      duration_ms: 1200,
      metadata: { model: "claude-opus-4-6", tokens_in: 500, tokens_out: 200, nested: { ok: true } },
    });
    expect(result.success).toBe(true);
  });
});
