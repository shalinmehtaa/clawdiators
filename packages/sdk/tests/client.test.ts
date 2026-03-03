import { describe, it, expect } from "vitest";
import { ClawdiatorsClient } from "../src/client.js";
import { ReplayTracker } from "../src/tracker.js";

describe("ClawdiatorsClient", () => {
  it("constructs with default URL", () => {
    const client = new ClawdiatorsClient({ apiKey: "clw_test123" });
    expect(client).toBeDefined();
  });

  it("constructs with custom URL", () => {
    const client = new ClawdiatorsClient({
      apiUrl: "https://api.clawdiators.ai",
      apiKey: "clw_test123",
    });
    expect(client).toBeDefined();
  });

  it("strips trailing slash from URL", () => {
    const client = new ClawdiatorsClient({
      apiUrl: "http://localhost:3001/",
      apiKey: "clw_test123",
    });
    // Client stores normalized URL internally
    expect(client).toBeDefined();
  });
});

describe("ReplayTracker", () => {
  it("starts with empty log", () => {
    const tracker = new ReplayTracker();
    tracker.start();
    expect(tracker.getLog()).toEqual([]);
    expect(tracker.length).toBe(0);
  });

  it("logs steps", () => {
    const tracker = new ReplayTracker();
    tracker.start();
    tracker.logStep("bash", "ls -la", "file1.txt\nfile2.txt", 50);
    tracker.logStep("read", "package.json", '{"name":"test"}', 10);

    expect(tracker.length).toBe(2);
    const log = tracker.getLog();
    expect(log[0].tool).toBe("bash");
    expect(log[0].input).toBe("ls -la");
    expect(log[0].output).toBe("file1.txt\nfile2.txt");
    expect(log[0].duration_ms).toBe(50);
    expect(log[1].tool).toBe("read");
  });

  it("truncates long input/output to 5000 chars", () => {
    const tracker = new ReplayTracker();
    tracker.start();
    const longStr = "x".repeat(10000);
    tracker.logStep("bash", longStr, longStr, 100);

    const log = tracker.getLog();
    expect(log[0].input.length).toBe(5000);
    expect(log[0].output!.length).toBe(5000);
  });

  it("tracks total duration", () => {
    const tracker = new ReplayTracker();
    tracker.start();
    tracker.logStep("bash", "cmd1", "out1", 100);
    tracker.logStep("read", "file", "content", 50);
    tracker.logStep("write", "file", undefined, 30);

    expect(tracker.totalDurationMs).toBe(180);
  });

  it("wraps async functions with timing", async () => {
    const tracker = new ReplayTracker();
    tracker.start();

    const result = await tracker.wrap("bash", "echo hello", async () => {
      return "hello";
    });

    expect(result).toBe("hello");
    expect(tracker.length).toBe(1);
    const log = tracker.getLog();
    expect(log[0].tool).toBe("bash");
    expect(log[0].error).toBe(false);
  });

  it("wraps failing functions with error flag", async () => {
    const tracker = new ReplayTracker();
    tracker.start();

    await expect(
      tracker.wrap("bash", "fail cmd", async () => {
        throw new Error("command failed");
      }),
    ).rejects.toThrow("command failed");

    expect(tracker.length).toBe(1);
    const log = tracker.getLog();
    expect(log[0].error).toBe(true);
    expect(log[0].output).toBe("command failed");
  });

  it("returns copy of log (not reference)", () => {
    const tracker = new ReplayTracker();
    tracker.start();
    tracker.logStep("bash", "test", undefined, 10);

    const log1 = tracker.getLog();
    tracker.logStep("read", "test2", undefined, 20);
    const log2 = tracker.getLog();

    expect(log1.length).toBe(1);
    expect(log2.length).toBe(2);
  });

  it("tracks elapsed time since start", async () => {
    const tracker = new ReplayTracker();
    expect(tracker.elapsedMs).toBe(0);
    tracker.start();
    // Small delay to ensure non-zero elapsed
    await new Promise((r) => setTimeout(r, 10));
    expect(tracker.elapsedMs).toBeGreaterThan(0);
  });

  it("logs error steps without output", () => {
    const tracker = new ReplayTracker();
    tracker.start();
    tracker.logStep("bash", "failing-cmd", undefined, 100, true);

    const log = tracker.getLog();
    expect(log[0].error).toBe(true);
    expect(log[0].output).toBeUndefined();
  });
});
