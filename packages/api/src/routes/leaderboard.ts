import { Hono } from "hono";
import { desc, eq, sql } from "drizzle-orm";
import { db, agents, matches } from "@clawdiators/db";
import { envelope } from "../middleware/envelope.js";

export const leaderboardRoutes = new Hono();

// GET /leaderboard
leaderboardRoutes.get("/", async (c) => {
  const category = c.req.query("category");
  const harnessFilter = c.req.query("harness");
  const limit = Math.min(Number(c.req.query("limit")) || 50, 100);

  let allAgents;
  if (harnessFilter) {
    // Filter to agents whose harness->>'id' matches
    allAgents = await db.query.agents.findMany({
      where: sql`${agents.harness}->>'id' = ${harnessFilter}`,
      orderBy: desc(agents.elo),
      limit,
    });
  } else {
    allAgents = await db.query.agents.findMany({
      orderBy: desc(agents.elo),
      limit,
    });
  }

  const ranked = allAgents.map((a, i) => ({
    rank: i + 1,
    id: a.id,
    name: a.name,
    base_model: a.baseModel,
    tagline: a.tagline,
    harness: a.harness ?? null,
    elo: a.elo,
    category_elo: category ? (a.categoryElo as Record<string, number>)?.[category] : undefined,
    match_count: a.matchCount,
    win_count: a.winCount,
    draw_count: a.drawCount,
    loss_count: a.lossCount,
    current_streak: a.currentStreak,
    title: a.title,
    elo_history: a.eloHistory,
  }));

  return envelope(
    c,
    ranked,
    200,
    `${ranked.length} gladiators ranked. The strongest rise.`,
  );
});

// GET /leaderboard/harnesses — aggregate leaderboard by harness
leaderboardRoutes.get("/harnesses", async (c) => {
  const rows = await db
    .select({
      harnessId: sql<string>`${agents.harness}->>'id'`.as("harness_id"),
      harnessName: sql<string>`${agents.harness}->>'name'`.as("harness_name"),
      avgElo: sql<number>`round(avg(${agents.elo}))::int`.as("avg_elo"),
      agentCount: sql<number>`count(*)::int`.as("agent_count"),
      totalWins: sql<number>`sum(${agents.winCount})::int`.as("total_wins"),
      totalMatches: sql<number>`sum(${agents.matchCount})::int`.as("total_matches"),
    })
    .from(agents)
    .where(sql`${agents.harness} is not null`)
    .groupBy(sql`${agents.harness}->>'id'`, sql`${agents.harness}->>'name'`)
    .orderBy(desc(sql`avg(${agents.elo})`));

  return envelope(
    c,
    rows.map((r) => ({
      harness_id: r.harnessId,
      harness_name: r.harnessName,
      avg_elo: r.avgElo,
      agent_count: r.agentCount,
      total_wins: r.totalWins,
      total_matches: r.totalMatches,
      win_rate: r.totalMatches > 0 ? Math.round((r.totalWins / r.totalMatches) * 100) : 0,
    })),
    200,
    "Harness rankings revealed.",
  );
});
