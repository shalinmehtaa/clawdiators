import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { rateLimit, resetRateLimitState } from "../src/middleware/rate-limit.js";

// ── Test app setup ───────────────────────────────────────────────────

function createTestApp(opts: { max: number; windowSecs: number }) {
  const app = new Hono();
  app.use("/*", rateLimit(opts));
  app.get("/test", (c) => c.json({ ok: true }));
  return app;
}

function makeRequest(app: Hono, opts?: { bearer?: string; ip?: string }) {
  const headers: Record<string, string> = {};
  if (opts?.bearer) headers["authorization"] = `Bearer ${opts.bearer}`;
  if (opts?.ip) headers["x-forwarded-for"] = opts.ip;
  return app.request("/test", { headers });
}

// ── Tests ────────────────────────────────────────────────────────────

describe("Rate limit middleware", () => {
  beforeEach(() => {
    resetRateLimitState();
  });

  it("allows requests within the limit", async () => {
    const app = createTestApp({ max: 5, windowSecs: 60 });

    for (let i = 0; i < 5; i++) {
      const res = await makeRequest(app, { ip: "1.2.3.4" });
      expect(res.status).toBe(200);
    }
  });

  it("returns 429 when limit is exceeded", async () => {
    const app = createTestApp({ max: 3, windowSecs: 60 });

    for (let i = 0; i < 3; i++) {
      await makeRequest(app, { ip: "5.6.7.8" });
    }

    const res = await makeRequest(app, { ip: "5.6.7.8" });
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toContain("Rate limit");
  });

  it("includes Retry-After header on 429", async () => {
    const app = createTestApp({ max: 1, windowSecs: 60 });

    await makeRequest(app, { ip: "10.0.0.1" });
    const res = await makeRequest(app, { ip: "10.0.0.1" });

    expect(res.status).toBe(429);
    const retryAfter = res.headers.get("Retry-After");
    expect(retryAfter).toBeDefined();
    expect(Number(retryAfter)).toBeGreaterThan(0);
  });

  it("includes X-RateLimit-Limit and X-RateLimit-Remaining headers", async () => {
    const app = createTestApp({ max: 5, windowSecs: 60 });

    const res = await makeRequest(app, { ip: "10.0.0.2" });
    expect(res.status).toBe(200);
    expect(res.headers.get("X-RateLimit-Limit")).toBe("5");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("4");
  });

  it("remaining count decrements on each request", async () => {
    const app = createTestApp({ max: 3, windowSecs: 60 });

    const r1 = await makeRequest(app, { ip: "10.0.0.3" });
    expect(r1.headers.get("X-RateLimit-Remaining")).toBe("2");

    const r2 = await makeRequest(app, { ip: "10.0.0.3" });
    expect(r2.headers.get("X-RateLimit-Remaining")).toBe("1");

    const r3 = await makeRequest(app, { ip: "10.0.0.3" });
    expect(r3.headers.get("X-RateLimit-Remaining")).toBe("0");
  });

  it("429 response shows remaining=0", async () => {
    const app = createTestApp({ max: 1, windowSecs: 60 });

    await makeRequest(app, { ip: "10.0.0.4" });
    const res = await makeRequest(app, { ip: "10.0.0.4" });

    expect(res.status).toBe(429);
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
  });

  it("uses bearer key prefix as rate limit key when present", async () => {
    const app = createTestApp({ max: 2, windowSecs: 60 });

    // Two requests with same bearer
    await makeRequest(app, { bearer: "clw_abcdef123456_rest" });
    await makeRequest(app, { bearer: "clw_abcdef123456_rest" });
    const res = await makeRequest(app, { bearer: "clw_abcdef123456_rest" });
    expect(res.status).toBe(429);

    // Different bearer still works
    const res2 = await makeRequest(app, { bearer: "clw_xyz789000000_rest" });
    expect(res2.status).toBe(200);
  });

  it("falls back to IP when no bearer token", async () => {
    const app = createTestApp({ max: 2, windowSecs: 60 });

    await makeRequest(app, { ip: "192.168.1.1" });
    await makeRequest(app, { ip: "192.168.1.1" });
    const res = await makeRequest(app, { ip: "192.168.1.1" });
    expect(res.status).toBe(429);

    // Different IP still works
    const res2 = await makeRequest(app, { ip: "192.168.1.2" });
    expect(res2.status).toBe(200);
  });

  it("resetRateLimitState() clears all state", async () => {
    const app = createTestApp({ max: 1, windowSecs: 60 });

    await makeRequest(app, { ip: "10.0.0.5" });
    const blocked = await makeRequest(app, { ip: "10.0.0.5" });
    expect(blocked.status).toBe(429);

    resetRateLimitState();

    const res = await makeRequest(app, { ip: "10.0.0.5" });
    expect(res.status).toBe(200);
  });

  it("different clients have independent limits", async () => {
    const app = createTestApp({ max: 1, windowSecs: 60 });

    const r1 = await makeRequest(app, { ip: "10.0.0.6" });
    expect(r1.status).toBe(200);

    const r2 = await makeRequest(app, { ip: "10.0.0.7" });
    expect(r2.status).toBe(200);

    // First client is now blocked
    const r3 = await makeRequest(app, { ip: "10.0.0.6" });
    expect(r3.status).toBe(429);

    // Second client is also blocked
    const r4 = await makeRequest(app, { ip: "10.0.0.7" });
    expect(r4.status).toBe(429);
  });
});
