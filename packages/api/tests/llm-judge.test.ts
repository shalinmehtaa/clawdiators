import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { llmJudge, resetJudgeCallCount, generateLLMJudgeInlineScript } from "../src/challenges/primitives/llm-judge.js";

describe("llmJudge", () => {
  beforeEach(() => {
    resetJudgeCallCount();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns error when no API key is set", async () => {
    const originalKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    const result = await llmJudge("test prompt", "test response", "score quality");

    expect(result.score).toBe(0);
    expect(result.error).toContain("ANTHROPIC_API_KEY");

    if (originalKey) process.env.ANTHROPIC_API_KEY = originalKey;
  });

  it("returns median-of-3 scores (mocked API)", async () => {
    let callNum = 0;
    const scores = [70, 80, 90]; // Median should be 80

    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      const score = scores[callNum++ % scores.length];
      return new Response(
        JSON.stringify({
          content: [{ type: "text", text: JSON.stringify({ score, reasoning: "test" }) }],
        }),
        { status: 200 },
      );
    });

    const result = await llmJudge("prompt", "response", "rubric", {
      apiKey: "test-key",
      runs: 3,
    });

    expect(result.score).toBe(80);
    expect(result.scores).toHaveLength(3);
    expect(result.scores).toEqual(expect.arrayContaining([70, 80, 90]));
  });

  it("clamps scores to maxScore", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response(
        JSON.stringify({
          content: [{ type: "text", text: JSON.stringify({ score: 999, reasoning: "overshot" }) }],
        }),
        { status: 200 },
      );
    });

    const result = await llmJudge("prompt", "response", "rubric", {
      apiKey: "test-key",
      maxScore: 100,
      runs: 1,
    });

    expect(result.score).toBe(100);
  });

  it("clamps scores to 0 minimum", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response(
        JSON.stringify({
          content: [{ type: "text", text: JSON.stringify({ score: -50, reasoning: "negative" }) }],
        }),
        { status: 200 },
      );
    });

    const result = await llmJudge("prompt", "response", "rubric", {
      apiKey: "test-key",
      runs: 1,
    });

    expect(result.score).toBe(0);
  });

  it("returns 0 when all API calls fail", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response("Internal Server Error", { status: 500 });
    });

    const result = await llmJudge("prompt", "response", "rubric", {
      apiKey: "test-key",
      runs: 1,
    });

    expect(result.score).toBe(0);
    expect(result.error).toContain("failed");
  });

  it("respects rate limit of MAX_JUDGE_CALLS", async () => {
    let callCount = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      callCount++;
      return new Response(
        JSON.stringify({
          content: [{ type: "text", text: JSON.stringify({ score: 50 }) }],
        }),
        { status: 200 },
      );
    });

    // Make multiple judge calls to exhaust rate limit
    for (let i = 0; i < 5; i++) {
      await llmJudge("prompt", "response", "rubric", {
        apiKey: "test-key",
        runs: 3,
      });
    }

    // After 10+ calls, should hit the rate limit
    expect(callCount).toBeLessThanOrEqual(12); // 10 limit + potential retries before limit
  });
});

// ── generateLLMJudgeInlineScript ──────────────────────────────────────

describe("generateLLMJudgeInlineScript", () => {
  it("returns a string containing llmJudge function", () => {
    const script = generateLLMJudgeInlineScript("claude-haiku-4-5-20251001", "Score quality");
    expect(script).toContain("async function llmJudge");
    expect(script).toContain("async function callJudgeOnce");
  });

  it("embeds the model name", () => {
    const script = generateLLMJudgeInlineScript("claude-haiku-4-5-20251001", "test rubric");
    expect(script).toContain("claude-haiku-4-5-20251001");
  });

  it("embeds the rubric", () => {
    const script = generateLLMJudgeInlineScript("claude-haiku-4-5-20251001", "Score on correctness and clarity");
    expect(script).toContain("Score on correctness and clarity");
  });

  it("escapes backticks in rubric", () => {
    const script = generateLLMJudgeInlineScript("claude-haiku-4-5-20251001", "Use `code` in scoring");
    // Should not have unescaped backticks inside the template literal
    expect(script).toContain("\\`code\\`");
  });

  it("contains rate limiting", () => {
    const script = generateLLMJudgeInlineScript("claude-haiku-4-5-20251001", "rubric");
    expect(script).toContain("LLM_JUDGE_MAX_CALLS");
    expect(script).toContain("llmJudgeCallCount");
  });

  it("reads ANTHROPIC_API_KEY from process.env", () => {
    const script = generateLLMJudgeInlineScript("claude-haiku-4-5-20251001", "rubric");
    expect(script).toContain("process.env.ANTHROPIC_API_KEY");
  });
});
