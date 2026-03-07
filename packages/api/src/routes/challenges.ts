import { Hono } from "hono";
import { eq, and, isNull, inArray, sql, desc } from "drizzle-orm";
import type { HarnessInfo } from "@clawdiators/shared";
import { db, challenges, agents, matches, challengeMemory } from "@clawdiators/db";
import { envelope, errorEnvelope } from "../middleware/envelope.js";
import { getCache, setCache } from "../lib/route-cache.js";
import { getChallenge } from "../challenges/registry.js";
import { buildWorkspaceArchive, type ChallengeMdContext } from "../challenges/workspace.js";
import { getChallengeAnalytics } from "../services/analytics.js";
import { getAllowedImages } from "../challenges/primitives/validator.js";
import { SCORING_PRIMITIVES_METADATA } from "../challenges/primitives/scoring.js";
import { DATA_GENERATORS_METADATA } from "../challenges/primitives/data-generator.js";


export const challengeRoutes = new Hono();

// GET /challenges/images — public endpoint returning allowed Docker images for challenge specs
challengeRoutes.get("/images", (c) => {
  return envelope(c, { images: getAllowedImages() });
});

// GET /challenges/primitives — machine-readable reference of scoring primitives and data generators
challengeRoutes.get("/primitives", (c) => {
  return envelope(c, {
    scoring_primitives: SCORING_PRIMITIVES_METADATA,
    data_generators: DATA_GENERATORS_METADATA,
    valid_categories: ["calibration", "toolchain", "efficiency", "relay", "coding", "reasoning", "context", "memory", "endurance", "alignment", "multimodal", "cybersecurity", "optimization", "research"],
    valid_difficulties: ["newcomer", "contender", "veteran", "legendary"],
    valid_match_types: ["single", "multi-checkpoint", "long-running"],
    valid_colors: ["emerald", "sky", "gold", "purple", "coral"],
    gate_thresholds: {
      newcomer: { baseline_minimum: 0.6, anti_gaming_ceiling: 0.25 },
      contender: { baseline_minimum: 0.5, anti_gaming_ceiling: 0.25 },
      veteran: { baseline_minimum: 0.35, anti_gaming_ceiling: 0.2 },
      legendary: { baseline_minimum: 0.2, anti_gaming_ceiling: 0.15 },
    },
  });
});

// GET /challenges/scaffold — generate a valid starting spec
challengeRoutes.get("/scaffold", (c) => {
  const type = c.req.query("type") ?? "code";
  const category = c.req.query("category") ?? "reasoning";
  const difficulty = c.req.query("difficulty") ?? "contender";
  const dimensionParam = c.req.query("dimensions");

  const validTypes = ["declarative", "code"];
  if (!validTypes.includes(type)) {
    return errorEnvelope(c, `type must be one of: ${validTypes.join(", ")}`, 400);
  }

  // Build dimensions from param or defaults
  const dimKeys = dimensionParam
    ? dimensionParam.split(",").map((d) => d.trim())
    : ["correctness", "speed", "methodology"];

  const dimColors: Record<string, string> = {
    correctness: "emerald", completeness: "gold", precision: "coral",
    methodology: "purple", speed: "sky", code_quality: "coral", analysis: "gold",
  };

  const dimLabels: Record<string, string> = {
    correctness: "Correctness", completeness: "Completeness", precision: "Precision",
    methodology: "Methodology", speed: "Speed", code_quality: "Code Quality", analysis: "Analysis",
  };

  const weight = Math.round((1 / dimKeys.length) * 1000) / 1000;
  // Adjust last weight so they sum to exactly 1.0
  const dimensions = dimKeys.map((key, i) => ({
    key,
    label: dimLabels[key] ?? key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " "),
    weight: i === dimKeys.length - 1 ? Math.round((1 - weight * (dimKeys.length - 1)) * 1000) / 1000 : weight,
    description: `TODO: Describe how ${key} is scored`,
    color: dimColors[key] ?? "sky",
  }));

  const spec: Record<string, unknown> = {
    slug: "my-challenge-slug",
    name: "My Challenge Name",
    description: "TODO: A 10-500 char description of what agents face",
    lore: "TODO: A 10-1000 char narrative context for the challenge. Make it thematic and engaging.",
    category,
    difficulty,
    matchType: "single",
    timeLimitSecs: 300,
    workspace: {
      type: "generator",
      seedable: true,
      challengeMd: "# My Challenge\\n\\nSeed: {{seed}}\\n\\n## Objective\\n\\nTODO: Describe the challenge objective.\\n\\n## Submission Format\\n\\n```json\\n{ \\\"answer\\\": \\\"your answer here\\\" }\\n```\\n\\n## Scoring\\n\\n" +
        dimensions.map((d) => `- **${d.label}** (${Math.round(d.weight * 100)}%): ${d.description}`).join("\\n") +
        "\\n",
    },
    submission: { type: "json" },
    scoring: {
      method: "deterministic",
      maxScore: 1000,
      dimensions,
    },
  };

  if (type === "code") {
    spec.codeFiles = {
      "data.js": [
        "function generateData(seed) {",
        "  var r = rng(seed);",
        "  // TODO: Generate challenge data using the seeded PRNG",
        "  var value = Math.floor(r() * 100) + 1;",
        "  return {",
        '    objective: "TODO: Describe what the agent should do with value " + value,',
        "    groundTruth: { answer: value },",
        "    value: value",
        "  };",
        "}",
        "module.exports = { generateData };",
      ].join("\n"),
      "scorer.js": [
        "function score(input) {",
        "  var sub = input.submission || {};",
        "  var gt = input.groundTruth;",
        "",
        "  // TODO: Score each dimension. Gate bonus dimensions on correctness > 0.",
        "  var correctness = sub.answer === gt.answer ? " + Math.round(dimensions[0].weight * 1000) + " : 0;",
        "",
        "  var speed = 0;",
        "  if (correctness > 0) {",
        "    var elapsed = (new Date(input.submittedAt) - new Date(input.startedAt)) / 1000;",
        "    speed = Math.max(0, Math.round(" + Math.round(dimensions.length > 1 ? dimensions[1].weight * 1000 : 200) + " * (1 - elapsed / 300)));",
        "  }",
        "",
        "  var total = correctness + speed;",
        "  return { breakdown: { " + dimKeys.map((k, i) => i === 0 ? `${k}: correctness` : i === 1 ? `${k}: speed` : `${k}: 0`).join(", ") + ", total: total } };",
        "}",
        "module.exports = { score };",
      ].join("\n"),
    };
  }

  const referenceAnswer = {
    seed: 42,
    answer: { answer: "TODO: Replace with the correct answer for seed 42" },
  };

  return envelope(c, {
    spec,
    referenceAnswer,
    instructions: {
      next_steps: [
        "1. Replace all TODO markers with your challenge content",
        "2. Run generateData(42) mentally or locally to compute the correct referenceAnswer",
        "3. Validate with POST /api/v1/challenges/drafts/dry-run before submitting",
        "4. Submit with POST /api/v1/challenges/drafts",
      ],
      docs: {
        api_authoring: "/api-authoring.md",
        pr_authoring: "/pr-authoring.md",
        design_guide: "/challenge-design-guide.md",
        primitives: "/api/v1/challenges/primitives",
      },
    },
  });
});

/** Derive display name from slug: "blueprint-audit" → "Blueprint Audit" */
function slugToName(slug: string): string {
  return slug.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

// Helper to resolve author agent name for single-challenge endpoints
async function resolveAuthorName(authorAgentId: string | null): Promise<string | null> {
  if (!authorAgentId) return null;
  const agent = await db.query.agents.findFirst({
    where: eq(agents.id, authorAgentId),
  });
  return agent?.name ?? null;
}

const CHALLENGES_LIST_TTL = 60_000; // 60 s

// GET /challenges — returns active challenges (pass ?all=true for inactive too, ?include_archived=true for archived)
challengeRoutes.get("/", async (c) => {
  const showAll = c.req.query("all") === "true";
  const includeArchived = c.req.query("include_archived") === "true";

  const cacheKey = `challenges:${showAll}:${includeArchived}`;
  const cached = getCache<object[]>(cacheKey);
  if (cached) return envelope(c, cached);

  const conditions = [];
  if (!showAll) conditions.push(eq(challenges.active, true));
  if (!includeArchived) conditions.push(isNull(challenges.archivedAt));

  const allChallenges = await db.query.challenges.findMany({
    where: conditions.length > 0 ? and(...conditions) : undefined,
  });

  // Single query for all author names instead of N individual queries
  const authorIds = [...new Set(allChallenges.map((ch) => ch.authorAgentId).filter(Boolean))] as string[];
  const authorMap: Record<string, string> = {};
  if (authorIds.length > 0) {
    const authorRows = await db.query.agents.findMany({
      where: inArray(agents.id, authorIds),
      columns: { id: true, name: true },
    });
    for (const row of authorRows) authorMap[row.id] = row.name;
  }

  const result = allChallenges.map((ch) => ({
    slug: ch.slug,
    name: slugToName(ch.slug),
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
    requires_environment: ch.requiresEnvironment,
    author_agent_id: ch.authorAgentId,
    author_name: ch.authorAgentId ? (authorMap[ch.authorAgentId] ?? null) : null,
  }));

  setCache(cacheKey, result, CHALLENGES_LIST_TTL);
  return envelope(c, result);
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
    name: slugToName(challenge.slug),
    description: challenge.description,
    lore: challenge.lore,
    category: challenge.category,
    difficulty: challenge.difficulty,
    match_type: challenge.matchType,
    time_limit_secs: challenge.timeLimitSecs,
    max_score: challenge.maxScore,
    scoring_dimensions: challenge.scoringDimensions,
    requires_environment: challenge.requiresEnvironment,
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

    // Look up agent's harness for injection into CHALLENGE.md
    if (match) {
      const matchAgent = await db.query.agents.findFirst({
        where: eq(agents.id, match.agentId),
        columns: { harness: true },
      });
      workspaceCtx.agentHarness = (matchAgent?.harness as HarnessInfo | null) ?? null;

      // Reconstruct service URLs from stored container data so CHALLENGE.md has working URLs
      const containerData = (match as any).serviceData as { services?: { name: string }[]; serviceToken?: string } | null;
      if (containerData && !("degraded" in containerData)) {
        const platformBase = process.env.PLATFORM_URL ?? "";
        if (containerData.services?.length) {
          workspaceCtx.serviceUrls = {};
          for (const svc of containerData.services) {
            workspaceCtx.serviceUrls[svc.name] = `${platformBase}/api/v1/matches/${matchIdParam}/services/${svc.name}`;
          }
        }
        if (containerData.serviceToken) {
          workspaceCtx.serviceToken = containerData.serviceToken;
        }
        // Check if challenge has a proxy config
        const wsSpec = mod.workspaceSpec;
        if (wsSpec?.type === "environment" && wsSpec.proxy) {
          workspaceCtx.proxyUrl = `${platformBase}/api/v1/matches/${matchIdParam}/proxy`;
        }
      }
    }

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
    const archive = await buildWorkspaceArchive(mod, seed, challenge.config, workspaceCtx);

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
    score_trend: analytics.scoreTrend,
    score_by_attempt_number: analytics.scoreByAttemptNumber ?? {},
    benchmark_metrics: analytics.benchmarkMetrics ?? {},
    median_cost_per_point: (analytics as any).medianCostPerPoint ?? null,
    cost_by_model: (analytics as any).costByModel ?? {},
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
      agentHarness: agents.harness,
      bestScore: sql<number>`max(${matches.score})`.as("best_score"),
      attempts: sql<number>`count(*)::int`.as("attempts"),
      wins: sql<number>`count(*) filter (where ${matches.result} = 'win')::int`.as("wins"),
    })
    .from(matches)
    .innerJoin(agents, eq(matches.agentId, agents.id))
    .where(and(...conditions))
    .groupBy(matches.agentId, agents.name, agents.title, agents.harness)
    .orderBy(desc(sql`max(${matches.score})`))
    .limit(limit);

  return envelope(
    c,
    rows.map((r, i) => ({
      rank: i + 1,
      agent_id: r.agentId,
      agent_name: r.agentName,
      agent_title: r.agentTitle,
      harness: r.agentHarness ?? null,
      best_score: r.bestScore,
      attempts: r.attempts,
      wins: r.wins,
    })),
  );
});
