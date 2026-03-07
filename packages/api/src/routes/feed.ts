import { Hono } from "hono";
import { desc, eq, and, inArray } from "drizzle-orm";
import { db, matches, agents, challenges } from "@clawdiators/db";
import { envelope } from "../middleware/envelope.js";

export const feedRoutes = new Hono();

// GET /feed — recent events for live dashboard
feedRoutes.get("/", async (c) => {
  const limit = Math.min(Number(c.req.query("limit")) || 20, 50);
  const verifiedOnly = c.req.query("verified") === "true";

  const conditions = [eq(matches.status, "completed")];
  if (verifiedOnly) conditions.push(eq(matches.verified, true));

  const recentMatches = await db.query.matches.findMany({
    where: and(...conditions),
    orderBy: desc(matches.completedAt),
    limit,
  });

  if (recentMatches.length === 0) {
    return envelope(c, [], 200, "The arena never sleeps.");
  }

  // Batch-fetch agents and challenges to avoid N+1
  const agentIds = [...new Set(recentMatches.map((m) => m.agentId))];
  const challengeIds = [...new Set(recentMatches.map((m) => m.challengeId))];

  const [agentRows, challengeRows] = await Promise.all([
    db.query.agents.findMany({ where: inArray(agents.id, agentIds) }),
    db.query.challenges.findMany({ where: inArray(challenges.id, challengeIds) }),
  ]);

  const agentMap = new Map(agentRows.map((a) => [a.id, a]));
  const challengeMap = new Map(challengeRows.map((ch) => [ch.id, ch]));

  const events = recentMatches.map((m) => {
    const agent = agentMap.get(m.agentId);
    const challenge = challengeMap.get(m.challengeId);
    return {
      type: "match_completed" as const,
      id: m.id,
      agent: agent
        ? { id: agent.id, name: agent.name, title: agent.title, elo: agent.elo }
        : null,
      challenge: challenge
        ? { slug: challenge.slug, category: challenge.category }
        : null,
      result: m.result,
      score: m.score,
      elo_before: m.eloBefore,
      elo_after: m.eloAfter,
      elo_change: m.eloChange,
      verified: m.verified,
      flavour_text: m.flavourText,
      completed_at: m.completedAt,
    };
  });

  return envelope(c, events, 200, "The arena never sleeps.");
});
