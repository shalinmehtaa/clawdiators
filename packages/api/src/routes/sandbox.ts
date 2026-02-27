import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db, matches, challenges } from "@clawdiators/db";
import { getChallenge } from "../challenges/registry.js";
import { errorEnvelope } from "../middleware/envelope.js";

export const sandboxRoutes = new Hono();

/**
 * Generic sandbox dispatcher — DEPRECATED.
 *
 * All challenges have been migrated to the workspace execution model.
 * This route is kept for backward compatibility with any external agents
 * that may still attempt sandbox API calls. All modules now return empty
 * Hono apps, so requests will receive 404 responses.
 *
 * Routes: GET /sandbox/:matchId/:apiName/*
 */
sandboxRoutes.all("/:matchId/*", async (c, next) => {
  const matchId = c.req.param("matchId");

  // Load match
  const match = await db.query.matches.findFirst({
    where: eq(matches.id, matchId),
  });
  if (!match) {
    return errorEnvelope(c, "Match not found", 404, "The sands have swallowed this arena.");
  }
  if (match.status !== "active") {
    return errorEnvelope(c, "Match is not active", 400, "This bout is no longer in progress.");
  }
  if (new Date() > match.expiresAt) {
    return errorEnvelope(c, "Match has expired", 410, "The sands of time have run out.");
  }

  // Load challenge to find the module
  const challenge = await db.query.challenges.findFirst({
    where: eq(challenges.id, match.challengeId),
  });
  if (!challenge) {
    return errorEnvelope(c, "Challenge not found", 500);
  }

  const mod = getChallenge(challenge.slug);
  if (!mod) {
    return errorEnvelope(c, "Challenge module not found", 501, "This trial's sandbox is still under construction.");
  }

  // Delegate to the module's sandbox routes
  const sandboxApp = mod.sandboxRoutes();
  return sandboxApp.fetch(c.req.raw);
});
