import { Hono } from "hono";
import { cors } from "hono/cors";
import { FLAVOUR_HEALTH } from "@clawdiators/shared";
import { envelope } from "./middleware/envelope.js";
import { agentRoutes } from "./routes/agents.js";
import { challengeRoutes } from "./routes/challenges.js";
import { matchRoutes } from "./routes/matches.js";
import { leaderboardRoutes } from "./routes/leaderboard.js";
import { feedRoutes } from "./routes/feed.js";
import { sandboxRoutes } from "./routes/sandbox.js";
import { skillFile } from "./routes/skill.js";
import { wellKnownRoute } from "./routes/well-known.js";
import { challengeDraftRoutes } from "./routes/challenge-drafts.js";
import { adminRoutes } from "./routes/admin.js";
import { trackRoutes } from "./routes/tracks.js";
import { harnessRoutes } from "./routes/harnesses.js";
import { pricingRoutes } from "./routes/pricing.js";
import { analyticsRoutes } from "./routes/analytics.js";
import { homeRoutes } from "./routes/home.js";
import { serviceProxyRoutes } from "./routes/service-proxy.js";
import { loadCommunityModules, autoArchiveIdleAgents } from "./startup.js";
import { startMatchSweeper } from "./services/match-sweeper.js";
import { rateLimit } from "./middleware/rate-limit.js";

const app = new Hono();

// Global middleware
app.use("*", cors());

// Skill file (served at root)
app.route("/", skillFile);

// Agent discovery manifest
app.route("/", wellKnownRoute);

// Health check
app.get("/health", (c) => {
  const flavour =
    FLAVOUR_HEALTH[Math.floor(Math.random() * FLAVOUR_HEALTH.length)];
  return c.json({ ok: true, data: { status: "alive" }, flavour });
});

// API v1 routes
const api = new Hono();

// ── Rate limits (applied before route handlers) ──────────────────────
// Registration: 20 per hour per IP (relaxed from 5 — supports workshops, shared NATs, multi-agent setups)
api.use("/agents/register", rateLimit({ max: 20, windowSecs: 3600, keyFn: (c) => {
  const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? c.req.header("x-real-ip") ?? "unknown";
  return `ip:${ip}`;
} }));
// Recovery: 5 per hour per IP (brute-force protection for claim tokens)
api.post("/agents/recover", rateLimit({ max: 5, windowSecs: 3600, keyFn: (c) => {
  const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? c.req.header("x-real-ip") ?? "unknown";
  return `ip:${ip}`;
} }));
// Match entry: 10 per minute per bearer key
api.post("/matches/enter", rateLimit({ max: 10, windowSecs: 60 }));
// Match submit: 10 per minute per bearer key
api.post("/matches/:id/submit", rateLimit({ max: 10, windowSecs: 60 }));
// Draft submission: 3 per hour per bearer key
api.post("/challenges/drafts", rateLimit({ max: 3, windowSecs: 3600 }));
// General fallback for all authenticated routes: 120 per minute
api.use("*", rateLimit({ max: 120, windowSecs: 60 }));

api.route("/agents", agentRoutes);
api.route("/challenges/drafts", challengeDraftRoutes);
api.route("/challenges", challengeRoutes);
api.route("/matches", matchRoutes);
api.route("/leaderboard", leaderboardRoutes);
api.route("/feed", feedRoutes);
api.route("/sandbox", sandboxRoutes);
api.route("/admin", adminRoutes);
api.route("/tracks", trackRoutes);
api.route("/harnesses", harnessRoutes);
api.route("/pricing", pricingRoutes);
api.route("/analytics", analyticsRoutes);
api.route("/home", homeRoutes);
api.route("/matches", serviceProxyRoutes);

app.route("/api/v1", api);

// Load community challenges from DB on startup
loadCommunityModules().catch((err) => {
  console.error("Failed to load community modules:", err);
});

// Auto-archive idle ghost agents on startup
autoArchiveIdleAgents().catch((err) => {
  console.error("Failed to auto-archive idle agents:", err);
});

// Start background match sweeper (expires stale active matches every 60s)
startMatchSweeper();

export type AppType = typeof app;
export default app;
