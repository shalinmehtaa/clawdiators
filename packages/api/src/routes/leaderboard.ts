import { Hono } from "hono";
import { desc, eq, sql, gte, isNull, and } from "drizzle-orm";
import { db, agents, matches, campaigns, findings } from "@clawdiators/db";
import { LEADERBOARD_MIN_MATCHES } from "@clawdiators/shared";
import { envelope } from "../middleware/envelope.js";

export const leaderboardRoutes = new Hono();

// GET /leaderboard
leaderboardRoutes.get("/", async (c) => {
  const category = c.req.query("category");
  const harnessFilter = c.req.query("harness");
  const limit = Math.min(Number(c.req.query("limit")) || 50, 500);
  const minMatches = Number(c.req.query("min_matches") ?? LEADERBOARD_MIN_MATCHES);
  const firstAttemptOnly = c.req.query("first_attempt") === "true";
  const memorylessOnly = c.req.query("memoryless") === "true";
  const verifiedOnly = c.req.query("verified") === "true";

  // When match-level filters active, use match-derived ranking
  if (firstAttemptOnly || memorylessOnly || verifiedOnly) {
    const matchConditions = [
      eq(matches.status, "completed"),
      isNull(agents.archivedAt),
    ];
    if (firstAttemptOnly) matchConditions.push(eq(matches.attemptNumber, 1));
    if (memorylessOnly) matchConditions.push(eq(matches.memoryless, true));
    if (verifiedOnly) matchConditions.push(eq(matches.verified, true));
    if (harnessFilter) matchConditions.push(sql`${agents.harness}->>'id' = ${harnessFilter}`);

    const rows = await db
      .select({
        agentId: agents.id,
        agentName: agents.name,
        baseModel: agents.baseModel,
        tagline: agents.tagline,
        harness: agents.harness,
        elo: agents.elo,
        title: agents.title,
        bestScore: sql<number>`max(${matches.score})`.as("best_score"),
        matchCount: sql<number>`count(*)::int`.as("match_count"),
        wins: sql<number>`count(*) filter (where ${matches.result} = 'win')::int`.as("wins"),
      })
      .from(matches)
      .innerJoin(agents, eq(matches.agentId, agents.id))
      .where(and(...matchConditions))
      .groupBy(agents.id, agents.name, agents.baseModel, agents.tagline, agents.harness, agents.elo, agents.title)
      .having(sql`count(*) >= ${minMatches}`)
      .orderBy(desc(sql`max(${matches.score})`))
      .limit(limit);

    const ranked = rows.map((r, i) => ({
      rank: i + 1,
      id: r.agentId,
      name: r.agentName,
      base_model: r.baseModel,
      tagline: r.tagline,
      harness: r.harness ?? null,
      elo: r.elo,
      best_score: r.bestScore,
      match_count: r.matchCount,
      win_count: r.wins,
      title: r.title,
      first_attempt_only: firstAttemptOnly,
      memoryless_only: memorylessOnly,
      verified_only: verifiedOnly,
    }));

    return envelope(c, ranked, 200,
      `${ranked.length} gladiators ranked by best score${firstAttemptOnly ? " (first attempt)" : ""}${memorylessOnly ? " (memoryless)" : ""}${verifiedOnly ? " (verified)" : ""}.`);
  }

  // Default: Elo-based ranking
  const conditions = [
    isNull(agents.archivedAt),
    gte(agents.matchCount, minMatches),
  ];
  if (harnessFilter) {
    conditions.push(sql`${agents.harness}->>'id' = ${harnessFilter}`);
  }

  const allAgents = await db.query.agents.findMany({
    where: and(...conditions),
    orderBy: desc(agents.elo),
    limit,
  });

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
  const minMatches = Number(c.req.query("min_matches") ?? LEADERBOARD_MIN_MATCHES);
  const frameworkFilter = c.req.query("framework");

  const conditions = [
    sql`${agents.harness} is not null`,
    isNull(agents.archivedAt),
    gte(agents.matchCount, minMatches),
  ];
  if (frameworkFilter) {
    conditions.push(sql`${agents.harness}->>'baseFramework' = ${frameworkFilter}`);
  }

  const groupBy = c.req.query("group_by") === "id" ? "id" : "framework";

  const rows = groupBy === "id"
    ? await db
        .select({
          harnessId: sql<string>`${agents.harness}->>'id'`.as("harness_id"),
          harnessName: sql<string>`mode() within group (order by ${agents.harness}->>'baseFramework')`.as("harness_name"),
          baseFramework: sql<string>`mode() within group (order by ${agents.harness}->>'baseFramework')`.as("base_framework"),
          loopType: sql<string>`mode() within group (order by ${agents.harness}->>'loopType')`.as("loop_type"),
          contextStrategy: sql<string>`mode() within group (order by ${agents.harness}->>'contextStrategy')`.as("context_strategy"),
          errorStrategy: sql<string>`mode() within group (order by ${agents.harness}->>'errorStrategy')`.as("error_strategy"),
          avgElo: sql<number>`round(avg(${agents.elo}))::int`.as("avg_elo"),
          agentCount: sql<number>`count(*)::int`.as("agent_count"),
          totalWins: sql<number>`sum(${agents.winCount})::int`.as("total_wins"),
          totalMatches: sql<number>`sum(${agents.matchCount})::int`.as("total_matches"),
        })
        .from(agents)
        .where(and(...conditions))
        .groupBy(sql`${agents.harness}->>'id'`)
        .orderBy(desc(sql`avg(${agents.elo})`))
    : await db
        .select({
          harnessId: sql<string>`${agents.harness}->>'baseFramework'`.as("harness_id"),
          harnessName: sql<string>`${agents.harness}->>'baseFramework'`.as("harness_name"),
          baseFramework: sql<string>`${agents.harness}->>'baseFramework'`.as("base_framework"),
          loopType: sql<string>`mode() within group (order by ${agents.harness}->>'loopType')`.as("loop_type"),
          contextStrategy: sql<string>`mode() within group (order by ${agents.harness}->>'contextStrategy')`.as("context_strategy"),
          errorStrategy: sql<string>`mode() within group (order by ${agents.harness}->>'errorStrategy')`.as("error_strategy"),
          avgElo: sql<number>`round(avg(${agents.elo}))::int`.as("avg_elo"),
          agentCount: sql<number>`count(*)::int`.as("agent_count"),
          totalWins: sql<number>`sum(${agents.winCount})::int`.as("total_wins"),
          totalMatches: sql<number>`sum(${agents.matchCount})::int`.as("total_matches"),
        })
        .from(agents)
        .where(and(...conditions, sql`${agents.harness}->>'baseFramework' is not null`))
        .groupBy(sql`${agents.harness}->>'baseFramework'`)
        .orderBy(desc(sql`avg(${agents.elo})`));

  return envelope(
    c,
    rows.map((r) => ({
      harness_id: r.harnessId,
      harness_name: r.harnessName,
      base_framework: r.baseFramework ?? null,
      loop_type: r.loopType ?? null,
      context_strategy: r.contextStrategy ?? null,
      error_strategy: r.errorStrategy ?? null,
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

// GET /leaderboard/research — agents ranked by research findings
leaderboardRoutes.get("/research", async (c) => {
  const limit = Math.min(Number(c.req.query("limit")) || 50, 200);

  // Agents with at least one completed campaign
  const rows = await db
    .select({
      agentId: agents.id,
      agentName: agents.name,
      agentTitle: agents.title,
      researchElo: sql<number>`(${agents.categoryElo}->>'research')::int`.as("research_elo"),
      campaignsCompleted: sql<number>`count(distinct ${campaigns.id})::int`.as("campaigns_completed"),
      findingsAccepted: sql<number>`count(distinct ${findings.id}) filter (where ${findings.status} = 'accepted')::int`.as("findings_accepted"),
      bestFindingScore: sql<number>`max(${findings.score})`.as("best_finding_score"),
    })
    .from(agents)
    .innerJoin(campaigns, and(eq(campaigns.agentId, agents.id), eq(campaigns.status, "completed")))
    .leftJoin(findings, and(eq(findings.agentId, agents.id), eq(findings.status, "accepted")))
    .where(isNull(agents.archivedAt))
    .groupBy(agents.id, agents.name, agents.title, sql`${agents.categoryElo}->>'research'`)
    .orderBy(desc(sql`(${agents.categoryElo}->>'research')::int`))
    .limit(limit);

  const ranked = rows.map((r, i) => ({
    rank: i + 1,
    agent_id: r.agentId,
    agent_name: r.agentName,
    agent_title: r.agentTitle,
    research_elo: r.researchElo ?? null,
    campaigns_completed: r.campaignsCompleted,
    findings_accepted: r.findingsAccepted,
    best_finding_score: r.bestFindingScore ?? null,
  }));

  return envelope(c, ranked, 200, "Research rankings emerge from the lab.");
});
