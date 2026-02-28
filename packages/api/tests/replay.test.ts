import { describe, it, expect } from "vitest";
import type { ReplayStep, SubmissionMetadata } from "@clawdiators/shared";

describe("ReplayStep type", () => {
  it("accepts a valid replay step", () => {
    const step: ReplayStep = {
      ts: "2026-02-27T10:00:00.000Z",
      tool: "bash",
      input: 'ls -la workspace/',
      output: "total 24\ndrwxr-xr-x  5 agent  staff  160 Feb 27 10:00 .",
      duration_ms: 45,
      error: false,
    };
    expect(step.tool).toBe("bash");
    expect(step.duration_ms).toBe(45);
  });

  it("accepts minimal replay step", () => {
    const step: ReplayStep = {
      ts: "2026-02-27T10:00:01.000Z",
      tool: "read",
      input: "CHALLENGE.md",
      duration_ms: 12,
    };
    expect(step.output).toBeUndefined();
    expect(step.error).toBeUndefined();
  });

  it("replay log can be embedded in submission metadata", () => {
    const meta: SubmissionMetadata = {
      token_count: 5000,
      tool_call_count: 25,
      model_id: "claude-opus-4-6",
      harness_id: "claude-code",
      wall_clock_secs: 45.2,
      replay_log: [
        { ts: "2026-02-27T10:00:00Z", tool: "bash", input: "cat README.md", duration_ms: 10 },
        { ts: "2026-02-27T10:00:01Z", tool: "read", input: "CHALLENGE.md", output: "# Challenge\n...", duration_ms: 5 },
        { ts: "2026-02-27T10:00:03Z", tool: "write", input: "answer.json", duration_ms: 8 },
        { ts: "2026-02-27T10:00:05Z", tool: "grep", input: "pattern src/", output: "src/main.ts:5:match", duration_ms: 15 },
        { ts: "2026-02-27T10:00:07Z", tool: "llm", input: "Analyze the codebase...", output: "The main function...", duration_ms: 2500 },
      ],
    };
    expect(meta.replay_log).toHaveLength(5);
    expect(meta.replay_log![0].tool).toBe("bash");
    expect(meta.replay_log![4].tool).toBe("llm");
  });

  it("replay step can include error flag", () => {
    const step: ReplayStep = {
      ts: "2026-02-27T10:00:10Z",
      tool: "bash",
      input: "rm -rf /important",
      output: "Permission denied",
      duration_ms: 3,
      error: true,
    };
    expect(step.error).toBe(true);
  });

  it("replay step can include metadata", () => {
    const step: ReplayStep = {
      ts: "2026-02-27T10:00:15Z",
      tool: "llm",
      input: "Summarize findings",
      output: "The analysis shows...",
      duration_ms: 1200,
      metadata: { model: "claude-opus-4-6", tokens_in: 500, tokens_out: 200 },
    };
    expect(step.metadata?.model).toBe("claude-opus-4-6");
  });
});
