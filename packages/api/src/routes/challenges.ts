import { Hono } from "hono";
import { eq, and, isNull, sql, desc } from "drizzle-orm";
import { db, challenges, agents, matches, challengeMemory } from "@clawdiators/db";
import { envelope, errorEnvelope } from "../middleware/envelope.js";
import { getChallenge } from "../challenges/registry.js";
import { buildWorkspaceArchive, type ChallengeMdContext } from "../challenges/workspace.js";
import { getChallengeAnalytics } from "../services/analytics.js";
import { getDesignGuideHash } from "../startup.js";


export const challengeRoutes = new Hono();

// GET /challenges/design-guide-hash — current SHA-256 of challenge-design-guide.md
// Public endpoint — authors include this hash in their draft submissions.
challengeRoutes.get("/design-guide-hash", (c) => {
  const { hash, computed_at } = getDesignGuideHash();
  return envelope(c, { hash, computed_at });
});

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
    constraints: challenge.constraints ?? null,
    verification_policy: challenge.verificationPolicy ?? null,
    disclosure_policy: challenge.disclosurePolicy ?? null,
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
      "This trial is still being forged in the arena.");
  }

  if (!mod.generateWorkspace) {
    return errorEnvelope(c, "Workspace generation not implemented", 501);
  }

  const seed = seedParam ? parseInt(seedParam, 10) : Math.floor(Math.random() * 2147483647);
  if (isNaN(seed)) {
    return errorEnvelope(c, "Invalid seed parameter", 400);
  }

  let workspaceCtx: ChallengeMdContext = { seed };
  const matchIdParam = c.req.query("match_id");
  if (matchIdParam) {
    const match = await db.query.matches.findFirst({ where: eq(matches.id, matchIdParam) });

    // Inject memory context (Layer 4) — only for non-memoryless matches with a known agent
    if (match && !match.memoryless) {
      const [agentMemoryRow, analyticsData] = await Promise.all([
        db.query.challengeMemory.findFirst({
          where: and(
            eq(challengeMemory.agentId, match.agentId),
            eq(challengeMemory.challengeSlug, slug),
          ),
        }),
        getChallengeAnalytics(challenge.id).catch(() => null),
      ]);

      workspaceCtx = {
        ...workspaceCtx,
        memoryless: false,
        agentChallengeMemory: agentMemoryRow
          ? {
              challenge_slug: agentMemoryRow.challengeSlug,
              attempt_count: agentMemoryRow.attemptCount,
              best_score: agentMemoryRow.bestScore ?? null,
              avg_score: agentMemoryRow.avgScore ?? null,
              last_attempted_at: agentMemoryRow.lastAttemptedAt?.toISOString() ?? null,
              score_trend: agentMemoryRow.scoreTrend as "improving" | "plateau" | "declining" | null,
              best_score_breakdown: agentMemoryRow.bestScoreBreakdown ?? null,
              best_match_id: agentMemoryRow.bestMatchId ?? null,
              notes: agentMemoryRow.notes ?? null,
              strategies: (agentMemoryRow.strategies as import("@clawdiators/shared").ChallengeStrategy[]) ?? [],
            }
          : null,
        challengeAnalyticsSummary: analyticsData
          ? {
              median_score: analyticsData.medianScore,
              win_rate: analyticsData.winRate,
              score_by_attempt: analyticsData.scoreByAttemptNumber as Record<string, { mean: number }>,
            }
          : null,
      };
    } else if (match?.memoryless) {
      workspaceCtx = { ...workspaceCtx, memoryless: true };
    }
  }

  try {
    const archive = buildWorkspaceArchive(mod, seed, challenge.config, workspaceCtx);

    return new Response(new Uint8Array(archive), {
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
    score_by_attempt_number: analytics.scoreByAttemptNumber ?? {},
    benchmark_metrics: analytics.benchmarkMetrics ?? {},
    computed_at: analytics.computedAt instanceof Date
      ? analytics.computedAt.toISOString()
      : analytics.computedAt,
  });
});

// GET /challenges/:slug/leaderboard — top agents for a specific challenge
challengeRoutes.get("/:slug/leaderboard", async (c) => {
  const slug = c.req.param("slug");
  const limit = Math.min(Number(c.req.query("limit")) || 20, 100);
  const firstAttemptOnly = c.req.query("first_attempt") === "true";
  const memorylessOnly = c.req.query("memoryless") === "true";
  const verifiedOnly = c.req.query("verified") === "true";

  const challenge = await db.query.challenges.findFirst({
    where: and(eq(challenges.slug, slug), isNull(challenges.archivedAt)),
  });
  if (!challenge) {
    return errorEnvelope(c, "Challenge not found", 404, "No such trial exists in these waters.");
  }

  // Build conditions with optional filters
  const conditions = [
    eq(matches.challengeId, challenge.id),
    eq(matches.status, "completed"),
    isNull(agents.archivedAt),
  ];
  if (firstAttemptOnly) conditions.push(eq(matches.attemptNumber, 1));
  if (memorylessOnly) conditions.push(eq(matches.memoryless, true));
  if (verifiedOnly) conditions.push(eq(matches.verified, true));

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
    .where(and(...conditions))
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
