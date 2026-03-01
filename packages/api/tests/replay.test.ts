import { describe, it, expect } from "vitest";
import { replayStepSchema } from "../src/schemas/replay.js";

describe("replayStepSchema", () => {
  // ── tool_call steps ────────────────────────────────────────────────

  it("accepts a valid tool_call step with all fields", () => {
    const result = replayStepSchema.safeParse({
      type: "tool_call",
      ts: "2026-02-27T10:00:00.000Z",
      tool: "bash",
      input: "ls -la workspace/",
      output: "total 24\ndrwxr-xr-x  5 agent  staff  160",
      duration_ms: 45,
      error: false,
      metadata: { cwd: "/workspace" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts a minimal tool_call step", () => {
    const result = replayStepSchema.safeParse({
      type: "tool_call",
      ts: "2026-02-27T10:00:01.000Z",
      tool: "read",
      input: "CHALLENGE.md",
      duration_ms: 12,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("tool_call");
    }
  });

  it("rejects a tool_call step missing type", () => {
    const result = replayStepSchema.safeParse({
      ts: "2026-02-27T10:00:00Z",
      tool: "bash",
      input: "ls",
      duration_ms: 10,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a tool_call step missing tool", () => {
    const result = replayStepSchema.safeParse({
      type: "tool_call",
      ts: "2026-01-01T00:00:00Z",
      input: "ls",
      duration_ms: 10,
    });
    expect(result.success).toBe(false);
  });

  it("rejects tool_call input longer than 5000 characters", () => {
    const result = replayStepSchema.safeParse({
      type: "tool_call",
      ts: "2026-01-01T00:00:00Z",
      tool: "bash",
      input: "x".repeat(5001),
      duration_ms: 10,
    });
    expect(result.success).toBe(false);
  });

  it("rejects tool_call output longer than 5000 characters", () => {
    const result = replayStepSchema.safeParse({
      type: "tool_call",
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
      type: "tool_call",
      ts: "2026-02-27T10:00:10Z",
      tool: "bash",
      input: "rm -rf /important",
      output: "Permission denied",
      duration_ms: 3,
      error: true,
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.type === "tool_call") {
      expect(result.data.error).toBe(true);
    }
  });

  // ── llm_call steps ─────────────────────────────────────────────────

  it("accepts a valid llm_call step with all fields", () => {
    const result = replayStepSchema.safeParse({
      type: "llm_call",
      ts: "2026-02-27T10:00:05Z",
      model: "claude-opus-4-6",
      input_tokens: 1500,
      output_tokens: 800,
      duration_ms: 3200,
      response_text: "Based on the analysis...",
      metadata: { cost_usd: 0.05 },
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.type === "llm_call") {
      expect(result.data.model).toBe("claude-opus-4-6");
      expect(result.data.input_tokens).toBe(1500);
      expect(result.data.output_tokens).toBe(800);
    }
  });

  it("accepts a minimal llm_call step", () => {
    const result = replayStepSchema.safeParse({
      type: "llm_call",
      ts: "2026-02-27T10:00:05Z",
      model: "gpt-4o",
      input_tokens: 500,
      output_tokens: 200,
      duration_ms: 1200,
    });
    expect(result.success).toBe(true);
  });

  it("rejects llm_call missing model", () => {
    const result = replayStepSchema.safeParse({
      type: "llm_call",
      ts: "2026-02-27T10:00:05Z",
      input_tokens: 500,
      output_tokens: 200,
      duration_ms: 1200,
    });
    expect(result.success).toBe(false);
  });

  it("rejects llm_call missing input_tokens", () => {
    const result = replayStepSchema.safeParse({
      type: "llm_call",
      ts: "2026-02-27T10:00:05Z",
      model: "claude-opus-4-6",
      output_tokens: 200,
      duration_ms: 1200,
    });
    expect(result.success).toBe(false);
  });

  it("rejects llm_call response_text longer than 50000 characters", () => {
    const result = replayStepSchema.safeParse({
      type: "llm_call",
      ts: "2026-02-27T10:00:05Z",
      model: "claude-opus-4-6",
      input_tokens: 500,
      output_tokens: 200,
      duration_ms: 1200,
      response_text: "z".repeat(50001),
    });
    expect(result.success).toBe(false);
  });

  it("accepts llm_call with error=true", () => {
    const result = replayStepSchema.safeParse({
      type: "llm_call",
      ts: "2026-02-27T10:00:05Z",
      model: "claude-opus-4-6",
      input_tokens: 500,
      output_tokens: 0,
      duration_ms: 100,
      error: true,
    });
    expect(result.success).toBe(true);
  });

  // ── discriminated union ────────────────────────────────────────────

  it("rejects unknown step type", () => {
    const result = replayStepSchema.safeParse({
      type: "unknown_type",
      ts: "2026-01-01T00:00:00Z",
      duration_ms: 10,
    });
    expect(result.success).toBe(false);
  });

  it("accepts metadata as an arbitrary key-value record on both types", () => {
    const toolResult = replayStepSchema.safeParse({
      type: "tool_call",
      ts: "2026-02-27T10:00:15Z",
      tool: "bash",
      input: "echo test",
      duration_ms: 5,
      metadata: { nested: { ok: true }, count: 42 },
    });
    expect(toolResult.success).toBe(true);

    const llmResult = replayStepSchema.safeParse({
      type: "llm_call",
      ts: "2026-02-27T10:00:15Z",
      model: "claude-opus-4-6",
      input_tokens: 100,
      output_tokens: 50,
      duration_ms: 1200,
      metadata: { cache_hit: true },
    });
    expect(llmResult.success).toBe(true);
  });
});
