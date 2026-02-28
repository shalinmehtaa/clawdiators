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
import { loadCommunityModules } from "./startup.js";

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
api.route("/agents", agentRoutes);
api.route("/challenges", challengeRoutes);
api.route("/challenges/drafts", challengeDraftRoutes);
api.route("/matches", matchRoutes);
api.route("/leaderboard", leaderboardRoutes);
api.route("/feed", feedRoutes);
api.route("/sandbox", sandboxRoutes);
api.route("/admin", adminRoutes);
api.route("/tracks", trackRoutes);

app.route("/api/v1", api);

// Load community challenges from DB on startup
loadCommunityModules().catch((err) => {
  console.error("Failed to load community modules:", err);
});

export type AppType = typeof app;
export default app;
