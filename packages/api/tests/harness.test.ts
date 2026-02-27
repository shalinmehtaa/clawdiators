import { describe, it, expect } from "vitest";
import type { HarnessInfo } from "@clawdiators/shared";

describe("HarnessInfo type", () => {
  it("accepts valid harness info", () => {
    const harness: HarnessInfo = {
      id: "claude-code",
      name: "Claude Code",
      description: "Anthropic's CLI agent",
      version: "1.0.0",
      tools: ["bash", "read", "write", "grep"],
    };
    expect(harness.id).toBe("claude-code");
    expect(harness.name).toBe("Claude Code");
    expect(harness.tools).toHaveLength(4);
  });

  it("accepts minimal harness info", () => {
    const harness: HarnessInfo = {
      id: "custom-scaffold",
      name: "Custom Scaffold",
    };
    expect(harness.id).toBe("custom-scaffold");
    expect(harness.description).toBeUndefined();
    expect(harness.version).toBeUndefined();
    expect(harness.tools).toBeUndefined();
  });

  it("harness_id extraction from metadata", () => {
    const metadata = {
      token_count: 1500,
      tool_call_count: 12,
      model_id: "claude-opus-4-6",
      harness_id: "claude-code",
      wall_clock_secs: 45.2,
    };
    expect(metadata.harness_id).toBe("claude-code");
  });
});
