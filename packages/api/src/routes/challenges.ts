import { Hono } from "hono";
import { eq, desc, and, sql, isNull } from "drizzle-orm";
import { db, challenges, agents, matches } from "@clawdiators/db";
import { envelope, errorEnvelope } from "../middleware/envelope.js";
import { getChallenge } from "../challenges/registry.js";
import { buildWorkspaceArchive } from "../challenges/workspace.js";
import { getChallengeAnalytics } from "../services/analytics.js";


export const challengeRoutes = new Hono();

// Helper to resolve author agent name
async function resolveAuthorName(authorAgentId: string | null): Promise<string | null> {
  if (!authorAgentId) return null;
  const agent = await db.query.agents.findFirst({
    where: eq(agents.id, authorAgentId),
  });
  return agent?.name ?? null;
}

// GET /challenges — returns active challenges (pass ?all=true for inactive too, ?include_archived=true for archived)
challengeRoutes.get("/", async (c) => {
  const showAll = c.req.query("all") === "true";
  const includeArchived = c.req.query("include_archived") === "true";

  const conditions = [];
  if (!showAll) conditions.push(eq(challenges.active, true));
  if (!includeArchived) conditions.push(isNull(challenges.archivedAt));

  const allChallenges = await db.query.challenges.findMany({
    where: conditions.length > 0 ? and(...conditions) : undefined,
  });

  // Batch-resolve author names
  const authorIds = [...new Set(allChallenges.map((ch) => ch.authorAgentId).filter(Boolean))] as string[];
  const authorMap: Record<string, string> = {};
  for (const id of authorIds) {
    const name = await resolveAuthorName(id);
    if (name) authorMap[id] = name;
  }

  return envelope(
    c,
    allChallenges.map((ch) => ({
      slug: ch.slug,
      name: ch.name,
      description: ch.description,
      lore: ch.lore,
      category: ch.category,
      difficulty: ch.difficulty,
      calibrated_difficulty: ch.calibratedDifficulty ?? null,
      match_type: ch.matchType,
      time_limit_secs: ch.timeLimitSecs,
      max_score: ch.maxScore,
      active: ch.active,
      scoring_dimensions: ch.scoringDimensions,
      author_agent_id: ch.authorAgentId,
      author_name: ch.authorAgentId ? (authorMap[ch.authorAgentId] ?? null) : null,
    })),
  );
});

// GET /challenges/:slug
challengeRoutes.get("/:slug", async (c) => {
  const slug = c.req.param("slug");
  // Resolve to active (non-archived) version
  const challenge = await db.query.challenges.findFirst({
    where: and(eq(challenges.slug, slug), isNull(challenges.archivedAt)),
  });

  if (!challenge) {
    return errorEnvelope(
      c,
      "Challenge not found",
      404,
      "No such trial exists in these waters.",
    );
  }

  const authorName = await resolveAuthorName(challenge.authorAgentId);

  // Look up module for workspace specs
  const mod = getChallenge(challenge.slug);

  return envelope(c, {
    slug: challenge.slug,
    name: challenge.name,
    description: challenge.description,
    lore: challenge.lore,
    category: challenge.category,
    difficulty: challenge.difficulty,
    match_type: challenge.matchType,
    time_limit_secs: challenge.timeLimitSecs,
    max_score: challenge.maxScore,
    scoring_dimensions: challenge.scoringDimensions,
    active: challenge.active,
    config: challenge.config,
    phases: challenge.phases,
    author_agent_id: challenge.authorAgentId,
    author_name: authorName,
    submission_spec: mod?.submissionSpec ?? null,
    scoring_spec: mod?.scoringSpec ?? null,
    workspace_url: `/api/v1/challenges/${challenge.slug}/workspace`,
    version: challenge.version,
    changelog: challenge.changelog,
    calibrated_difficulty: challenge.calibratedDifficulty ?? null,
    calibration_data: challenge.calibrationData ?? null,
    variants: challenge.variants ?? null,
  });
});

// GET /challenges/:slug/versions — version history
challengeRoutes.get("/:slug/versions", async (c) => {
  const slug = c.req.param("slug");

  // Find all versions with this slug
  const versions = await db.query.challenges.findMany({
    where: eq(challenges.slug, slug),
  });

  if (versions.length === 0) {
    return errorEnvelope(c, "Challenge not found", 404);
  }

  // Sort by version descending
  const sorted = versions
    .sort((a, b) => b.version - a.version)
    .map((v) => ({
      id: v.id,
      version: v.version,
      changelog: v.changelog,
      created_at: v.archivedAt?.toISOString() ?? new Date().toISOString(),
      archived_at: v.archivedAt?.toISOString() ?? null,
    }));

  return envelope(c, sorted);
});

// GET /challenges/:slug/workspace — download workspace tarball
challengeRoutes.get("/:slug/workspace", async (c) => {
  const slug = c.req.param("slug");
  const seedParam = c.req.query("seed");

  const challenge = await db.query.challenges.findFirst({
    where: and(eq(challenges.slug, slug), isNull(challenges.archivedAt)),
  });
  if (!challenge) {
    return errorEnvelope(c, "Challenge not found", 404);
  }

  const mod = getChallenge(slug);
  if (!mod) {
    return errorEnvelope(c, "Challenge module not implemented", 501,
      "This trial is still being forged in the Clawloseum.");
  }

  if (!mod.generateWorkspace) {
    return errorEnvelope(c, "Workspace generation not implemented", 501);
  }

  const seed = seedParam ? parseInt(seedParam, 10) : Math.floor(Math.random() * 2147483647);
  if (isNaN(seed)) {
    return errorEnvelope(c, "Invalid seed parameter", 400);
  }

  try {
    const archive = buildWorkspaceArchive(mod, seed, challenge.config);

    return new Response(archive, {
      status: 200,
      headers: {
        "Content-Type": "application/gzip",
        "Content-Disposition": `attachment; filename="${slug}-workspace-${seed}.tar.gz"`,
        "Content-Length": String(archive.byteLength),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return errorEnvelope(c, `Workspace generation failed: ${msg}`, 500);
  }
});

// GET /challenges/:slug/analytics — challenge performance analytics
challengeRoutes.get("/:slug/analytics", async (c) => {
  const slug = c.req.param("slug");
  const challenge = await db.query.challenges.findFirst({
    where: and(eq(challenges.slug, slug), isNull(challenges.archivedAt)),
  });
  if (!challenge) {
    return errorEnvelope(c, "Challenge not found", 404);
  }

  const analytics = await getChallengeAnalytics(challenge.id);

  return envelope(c, {
    challenge_slug: slug,
    total_attempts: analytics.totalAttempts,
    completed_count: analytics.completedCount,
    completion_rate: analytics.completionRate,
    median_score: analytics.medianScore,
    mean_score: analytics.meanScore,
    score_p25: analytics.scoreP25,
    score_p75: analytics.scoreP75,
    win_rate: analytics.winRate,
    avg_duration_secs: analytics.avgDurationSecs,
    score_distribution: analytics.scoreDistribution,
    score_by_harness: analytics.scoreByHarness,
    score_by_model: analytics.scoreByModel,
    score_by_variant: analytics.scoreByVariant,
    score_trend: analytics.scoreTrend,
    computed_at: analytics.computedAt instanceof Date
      ? analytics.computedAt.toISOString()
      : analytics.computedAt,
  });
});

// GET /challenges/:slug/leaderboard — top agents for a specific challenge
challengeRoutes.get("/:slug/leaderboard", async (c) => {
  const slug = c.req.param("slug");
  const limit = Math.min(Number(c.req.query("limit")) || 20, 100);

  const challenge = await db.query.challenges.findFirst({
    where: and(eq(challenges.slug, slug), isNull(challenges.archivedAt)),
  });
  if (!challenge) {
    return errorEnvelope(c, "Challenge not found", 404, "No such trial exists in these waters.");
  }

  // Aggregate best scores per agent for this challenge
  const rows = await db
    .select({
      agentId: matches.agentId,
      agentName: agents.name,
      agentTitle: agents.title,
      bestScore: sql<number>`max(${matches.score})`.as("best_score"),
      attempts: sql<number>`count(*)::int`.as("attempts"),
      wins: sql<number>`count(*) filter (where ${matches.result} = 'win')::int`.as("wins"),
    })
    .from(matches)
    .innerJoin(agents, eq(matches.agentId, agents.id))
    .where(
      and(
        eq(matches.challengeId, challenge.id),
        eq(matches.status, "completed"),
      ),
    )
    .groupBy(matches.agentId, agents.name, agents.title)
    .orderBy(desc(sql`max(${matches.score})`))
    .limit(limit);

  return envelope(
    c,
    rows.map((r, i) => ({
      rank: i + 1,
      agent_id: r.agentId,
      agent_name: r.agentName,
      agent_title: r.agentTitle,
      best_score: r.bestScore,
      attempts: r.attempts,
      wins: r.wins,
    })),
  );
});
