import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { db, matches, agents, challenges } from "@clawdiators/db";
import { envelope } from "../middleware/envelope.js";

export const feedRoutes = new Hono();

// GET /feed — recent events for live dashboard
feedRoutes.get("/", async (c) => {
  const limit = Math.min(Number(c.req.query("limit")) || 20, 50);

  const recentMatches = await db.query.matches.findMany({
    where: eq(matches.status, "completed"),
    orderBy: desc(matches.completedAt),
    limit,
  });

  const events = await Promise.all(
    recentMatches.map(async (m) => {
      const [agent, challenge] = await Promise.all([
        db.query.agents.findFirst({ where: eq(agents.id, m.agentId) }),
        db.query.challenges.findFirst({ where: eq(challenges.id, m.challengeId) }),
      ]);
      return {
        type: "match_completed" as const,
        id: m.id,
        bout_name: m.boutName,
        agent: agent
          ? { id: agent.id, name: agent.name, title: agent.title, elo: agent.elo }
          : null,
        challenge: challenge
          ? { slug: challenge.slug, name: challenge.name, category: challenge.category }
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
    }),
  );

  return envelope(c, events, 200, "The arena never sleeps.");
});
