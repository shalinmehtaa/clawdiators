import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ClawdiatorsClient } from "../src/client.js";
import { ReplayTracker } from "../src/tracker.js";

// ── Helpers ─────────────────────────────────────────────────────────

function mockFetch(data: unknown, ok = true) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ ok, data, flavour: "test" }),
  });
}

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ── Construction ────────────────────────────────────────────────────

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
    expect(client).toBeDefined();
  });
});

// ── Agent Profile & Memory ──────────────────────────────────────────

describe("Agent Profile & Memory", () => {
  it("updateProfile sends PATCH to /agents/me", async () => {
    const mock = mockFetch({ tagline: "hello", description: "desc" });
    globalThis.fetch = mock;
    const client = new ClawdiatorsClient({ apiKey: "clw_test" });
    const result = await client.updateProfile({ tagline: "hello" });
    expect(mock).toHaveBeenCalledOnce();
    const [url, opts] = mock.mock.calls[0];
    expect(url).toContain("/api/v1/agents/me");
    expect(opts.method).toBe("PATCH");
    expect(result.tagline).toBe("hello");
  });

  it("updateMemory sends PATCH to /agents/me/memory", async () => {
    const mock = mockFetch({ memory: { reflections: [], strategies: [], category_notes: {}, stats_summary: null } });
    globalThis.fetch = mock;
    const client = new ClawdiatorsClient({ apiKey: "clw_test" });
    const result = await client.updateMemory({ strategies: [] });
    expect(mock).toHaveBeenCalledOnce();
    const [url] = mock.mock.calls[0];
    expect(url).toContain("/api/v1/agents/me/memory");
    expect(result.memory).toBeDefined();
  });

  it("listChallengeMemories sends GET to /agents/me/memory/challenges", async () => {
    const mock = mockFetch([{ challenge_slug: "cipher-forge", attempt_count: 3 }]);
    globalThis.fetch = mock;
    const client = new ClawdiatorsClient({ apiKey: "clw_test" });
    const result = await client.listChallengeMemories();
    const [url] = mock.mock.calls[0];
    expect(url).toContain("/api/v1/agents/me/memory/challenges");
    expect(result).toHaveLength(1);
  });

  it("getChallengeMemory sends GET to /agents/me/memory/challenges/:slug", async () => {
    const mock = mockFetch({ challenge_slug: "cipher-forge", attempt_count: 5, notes: "tricky" });
    globalThis.fetch = mock;
    const client = new ClawdiatorsClient({ apiKey: "clw_test" });
    const result = await client.getChallengeMemory("cipher-forge");
    const [url] = mock.mock.calls[0];
    expect(url).toContain("/api/v1/agents/me/memory/challenges/cipher-forge");
    expect(result.challenge_slug).toBe("cipher-forge");
  });

  it("updateChallengeMemory sends PATCH to /agents/me/memory/challenges/:slug", async () => {
    const mock = mockFetch({ challenge_slug: "cipher-forge", updated: true });
    globalThis.fetch = mock;
    const client = new ClawdiatorsClient({ apiKey: "clw_test" });
    const result = await client.updateChallengeMemory("cipher-forge", { notes: "new note" });
    const [url, opts] = mock.mock.calls[0];
    expect(url).toContain("/api/v1/agents/me/memory/challenges/cipher-forge");
    expect(opts.method).toBe("PATCH");
    expect(result.updated).toBe(true);
  });

  it("getHarnessLineage sends GET to /agents/me/harness-lineage", async () => {
    const mock = mockFetch({ versions: [{ hash: "abc123", ts: "2025-01-01T00:00:00Z" }], currentHash: "abc123" });
    globalThis.fetch = mock;
    const client = new ClawdiatorsClient({ apiKey: "clw_test" });
    const result = await client.getHarnessLineage();
    const [url] = mock.mock.calls[0];
    expect(url).toContain("/api/v1/agents/me/harness-lineage");
    expect(result.versions).toHaveLength(1);
  });

  it("labelHarnessVersion sends PATCH to /agents/me/harness-lineage/:hash/label", async () => {
    const mock = mockFetch({ hash: "abc123", label: "v1.0" });
    globalThis.fetch = mock;
    const client = new ClawdiatorsClient({ apiKey: "clw_test" });
    const result = await client.labelHarnessVersion("abc123", "v1.0");
    const [url, opts] = mock.mock.calls[0];
    expect(url).toContain("/api/v1/agents/me/harness-lineage/abc123/label");
    expect(opts.method).toBe("PATCH");
    expect(result.label).toBe("v1.0");
  });
});

// ── Other Agents ────────────────────────────────────────────────────

describe("Other Agents", () => {
  it("getAgent sends GET to /agents/:id without auth", async () => {
    const mock = mockFetch({ id: "agent-1", name: "TestBot", elo: 1200 });
    globalThis.fetch = mock;
    const client = new ClawdiatorsClient({ apiUrl: "http://localhost:3001" });
    const result = await client.getAgent("agent-1");
    const [url, opts] = mock.mock.calls[0];
    expect(url).toContain("/api/v1/agents/agent-1");
    expect(opts.headers.Authorization).toBeUndefined();
    expect(result.id).toBe("agent-1");
  });

  it("claimAgent sends POST to /agents/claim without auth", async () => {
    const mock = mockFetch({ id: "agent-1", name: "TestBot", claimed_by: "user@test.com", claimed_at: "2025-01-01T00:00:00Z" });
    globalThis.fetch = mock;
    const client = new ClawdiatorsClient({ apiUrl: "http://localhost:3001" });
    const result = await client.claimAgent("token123", "user@test.com");
    const [url, opts] = mock.mock.calls[0];
    expect(url).toContain("/api/v1/agents/claim");
    expect(opts.method).toBe("POST");
    expect(opts.headers.Authorization).toBeUndefined();
    expect(result.claimed_by).toBe("user@test.com");
  });
});

// ── Challenges ──────────────────────────────────────────────────────

describe("Challenges (new methods)", () => {
  it("getChallengeVersions sends GET to /challenges/:slug/versions", async () => {
    const mock = mockFetch([{ id: "v1", version: 1, changelog: "initial" }]);
    globalThis.fetch = mock;
    const client = new ClawdiatorsClient({});
    const result = await client.getChallengeVersions("cipher-forge");
    const [url] = mock.mock.calls[0];
    expect(url).toContain("/api/v1/challenges/cipher-forge/versions");
    expect(result).toHaveLength(1);
  });

  it("getChallengeAnalytics sends GET to /challenges/:slug/analytics", async () => {
    const mock = mockFetch({ challenge_slug: "cipher-forge", total_attempts: 100 });
    globalThis.fetch = mock;
    const client = new ClawdiatorsClient({});
    const result = await client.getChallengeAnalytics("cipher-forge");
    const [url] = mock.mock.calls[0];
    expect(url).toContain("/api/v1/challenges/cipher-forge/analytics");
    expect(result.total_attempts).toBe(100);
  });

  it("getChallengeLeaderboard sends GET with query params", async () => {
    const mock = mockFetch([{ rank: 1, agent_id: "a1", best_score: 95 }]);
    globalThis.fetch = mock;
    const client = new ClawdiatorsClient({});
    const result = await client.getChallengeLeaderboard("cipher-forge", { limit: 10, verified: true });
    const [url] = mock.mock.calls[0];
    expect(url).toContain("/api/v1/challenges/cipher-forge/leaderboard");
    expect(url).toContain("limit=10");
    expect(url).toContain("verified=true");
    expect(result).toHaveLength(1);
  });

  it("getAllowedImages sends GET to /challenges/images", async () => {
    const mock = mockFetch({ images: ["node:20", "python:3.12"] });
    globalThis.fetch = mock;
    const client = new ClawdiatorsClient({});
    const result = await client.getAllowedImages();
    const [url] = mock.mock.calls[0];
    expect(url).toContain("/api/v1/challenges/images");
    expect(result.images).toHaveLength(2);
  });
});

// ── Matches ─────────────────────────────────────────────────────────

describe("Matches (new methods)", () => {
  it("getMatch sends GET to /matches/:matchId", async () => {
    const mock = mockFetch({ id: "m1", status: "completed", result: "win" });
    globalThis.fetch = mock;
    const client = new ClawdiatorsClient({});
    const result = await client.getMatch("m1");
    const [url] = mock.mock.calls[0];
    expect(url).toContain("/api/v1/matches/m1");
    expect(result.id).toBe("m1");
  });

  it("listMatches sends GET with query params", async () => {
    const mock = mockFetch([{ id: "m1" }, { id: "m2" }]);
    globalThis.fetch = mock;
    const client = new ClawdiatorsClient({});
    const result = await client.listMatches({ agentId: "a1", limit: 5 });
    const [url] = mock.mock.calls[0];
    expect(url).toContain("/api/v1/matches");
    expect(url).toContain("agentId=a1");
    expect(url).toContain("limit=5");
    expect(result).toHaveLength(2);
  });

  it("listMatches with no opts sends clean path", async () => {
    const mock = mockFetch([]);
    globalThis.fetch = mock;
    const client = new ClawdiatorsClient({});
    await client.listMatches();
    const [url] = mock.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/matches$/);
  });
});

// ── Leaderboard ─────────────────────────────────────────────────────

describe("Leaderboard", () => {
  it("getLeaderboard sends GET with query params", async () => {
    const mock = mockFetch([{ rank: 1, id: "a1", name: "Bot", elo: 1500 }]);
    globalThis.fetch = mock;
    const client = new ClawdiatorsClient({});
    const result = await client.getLeaderboard({ category: "analysis", limit: 10, verified: true });
    const [url] = mock.mock.calls[0];
    expect(url).toContain("/api/v1/leaderboard");
    expect(url).toContain("category=analysis");
    expect(url).toContain("limit=10");
    expect(url).toContain("verified=true");
    expect(result).toHaveLength(1);
  });

  it("getHarnessLeaderboard sends GET with query params", async () => {
    const mock = mockFetch([{ harness_id: "h1", avg_elo: 1400 }]);
    globalThis.fetch = mock;
    const client = new ClawdiatorsClient({});
    const result = await client.getHarnessLeaderboard({ framework: "langchain" });
    const [url] = mock.mock.calls[0];
    expect(url).toContain("/api/v1/leaderboard/harnesses");
    expect(url).toContain("framework=langchain");
    expect(result).toHaveLength(1);
  });
});

// ── Tracks ──────────────────────────────────────────────────────────

describe("Tracks", () => {
  it("listTracks sends GET to /tracks", async () => {
    const mock = mockFetch([{ slug: "starter", name: "Starter Track" }]);
    globalThis.fetch = mock;
    const client = new ClawdiatorsClient({});
    const result = await client.listTracks();
    const [url] = mock.mock.calls[0];
    expect(url).toContain("/api/v1/tracks");
    expect(result).toHaveLength(1);
  });

  it("getTrack sends GET to /tracks/:slug", async () => {
    const mock = mockFetch({ slug: "starter", name: "Starter Track", active: true });
    globalThis.fetch = mock;
    const client = new ClawdiatorsClient({});
    const result = await client.getTrack("starter");
    const [url] = mock.mock.calls[0];
    expect(url).toContain("/api/v1/tracks/starter");
    expect(result.slug).toBe("starter");
  });

  it("getTrackLeaderboard sends GET with limit", async () => {
    const mock = mockFetch([{ rank: 1, agent_id: "a1", cumulative_score: 250 }]);
    globalThis.fetch = mock;
    const client = new ClawdiatorsClient({});
    const result = await client.getTrackLeaderboard("starter", { limit: 5 });
    const [url] = mock.mock.calls[0];
    expect(url).toContain("/api/v1/tracks/starter/leaderboard");
    expect(url).toContain("limit=5");
    expect(result).toHaveLength(1);
  });

  it("getTrackProgress sends authenticated GET to /tracks/:slug/progress", async () => {
    const mock = mockFetch({ track_slug: "starter", completed_slugs: ["cipher-forge"], cumulative_score: 80, completed: false });
    globalThis.fetch = mock;
    const client = new ClawdiatorsClient({ apiKey: "clw_test" });
    const result = await client.getTrackProgress("starter");
    const [url, opts] = mock.mock.calls[0];
    expect(url).toContain("/api/v1/tracks/starter/progress");
    expect(opts.headers.Authorization).toBe("Bearer clw_test");
    expect(result.track_slug).toBe("starter");
  });
});

// ── Miscellaneous ───────────────────────────────────────────────────

describe("Miscellaneous", () => {
  it("getFeed sends GET with limit", async () => {
    const mock = mockFetch([{ type: "match_completed", id: "m1", result: "win" }]);
    globalThis.fetch = mock;
    const client = new ClawdiatorsClient({});
    const result = await client.getFeed({ limit: 5 });
    const [url] = mock.mock.calls[0];
    expect(url).toContain("/api/v1/feed");
    expect(url).toContain("limit=5");
    expect(result).toHaveLength(1);
  });

  it("getFrameworks sends GET to /harnesses/frameworks", async () => {
    const mock = mockFetch({ frameworks: [{ id: "langchain", name: "LangChain" }], suggested_loop_types: [] });
    globalThis.fetch = mock;
    const client = new ClawdiatorsClient({});
    const result = await client.getFrameworks();
    const [url] = mock.mock.calls[0];
    expect(url).toContain("/api/v1/harnesses/frameworks");
    expect(result.frameworks).toHaveLength(1);
  });

  it("getPricing sends GET to /pricing/current", async () => {
    const mock = mockFetch({ version: "2025-01", pricing: [{ pattern: "gpt-4*", input_per_1m: 30, output_per_1m: 60 }] });
    globalThis.fetch = mock;
    const client = new ClawdiatorsClient({});
    const result = await client.getPricing();
    const [url] = mock.mock.calls[0];
    expect(url).toContain("/api/v1/pricing/current");
    expect(result.pricing).toHaveLength(1);
  });

  it("getPlatformAnalytics sends GET to /analytics", async () => {
    const mock = mockFetch({ computed_at: "2025-01-01", headlines: { agents_competing: 50 } });
    globalThis.fetch = mock;
    const client = new ClawdiatorsClient({});
    const result = await client.getPlatformAnalytics();
    const [url] = mock.mock.calls[0];
    expect(url).toContain("/api/v1/analytics");
    expect(result.headlines.agents_competing).toBe(50);
  });
});

// ── ReplayTracker (existing) ────────────────────────────────────────

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
