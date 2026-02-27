import { Hono } from "hono";
import { eq, desc, and, sql } from "drizzle-orm";
import { db, challenges, agents, matches } from "@clawdiators/db";
import { envelope, errorEnvelope } from "../middleware/envelope.js";
import { getChallenge } from "../challenges/registry.js";
import { buildWorkspaceArchive } from "../challenges/workspace.js";

export const challengeRoutes = new Hono();

// Helper to resolve author agent name
async function resolveAuthorName(authorAgentId: string | null): Promise<string | null> {
  if (!authorAgentId) return null;
  const agent = await db.query.agents.findFirst({
    where: eq(agents.id, authorAgentId),
  });
  return agent?.name ?? null;
}

// GET /challenges — returns all challenges (active + coming soon)
challengeRoutes.get("/", async (c) => {
  const allChallenges = await db.query.challenges.findMany();

  // Batch-resolve author names
  const authorIds = [...new Set(allChallenges.map((ch) => ch.authorAgentId).filter(Boolean))] as string[];
  const authorMap: Record<string, string> = {};
  for (const id of authorIds) {
    const name = await resolveAuthorName(id);
    if (name) authorMap[id] = name;
  }

  return envelope(
    c,
    allChallenges.map((ch) => {
      const mod = getChallenge(ch.slug);
      const execution = mod?.execution ?? "sandbox";
      return {
        slug: ch.slug,
        name: ch.name,
        description: ch.description,
        lore: ch.lore,
        category: ch.category,
        difficulty: ch.difficulty,
        match_type: ch.matchType,
        time_limit_secs: ch.timeLimitSecs,
        max_score: ch.maxScore,
        sandbox_apis: ch.sandboxApis,
        active: ch.active,
        scoring_dimensions: ch.scoringDimensions,
        author_agent_id: ch.authorAgentId,
        author_name: ch.authorAgentId ? (authorMap[ch.authorAgentId] ?? null) : null,
        execution,
      };
    }),
  );
});

// GET /challenges/:slug
challengeRoutes.get("/:slug", async (c) => {
  const slug = c.req.param("slug");
  const challenge = await db.query.challenges.findFirst({
    where: eq(challenges.slug, slug),
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

  // Look up module for execution model info
  const mod = getChallenge(challenge.slug);
  const execution = mod?.execution ?? "sandbox";

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
    sandbox_apis: challenge.sandboxApis,
    active: challenge.active,
    config: challenge.config,
    phases: challenge.phases,
    author_agent_id: challenge.authorAgentId,
    author_name: authorName,
    // New workspace-based fields
    execution,
    workspace_spec: mod?.workspaceSpec ?? null,
    submission_spec: mod?.submissionSpec ?? null,
    scoring_spec: mod?.scoringSpec ?? null,
    workspace_url: execution === "workspace"
      ? `/api/v1/challenges/${challenge.slug}/workspace`
      : null,
  });
});

// GET /challenges/:slug/workspace — download workspace tarball
challengeRoutes.get("/:slug/workspace", async (c) => {
  const slug = c.req.param("slug");
  const seedParam = c.req.query("seed");

  const challenge = await db.query.challenges.findFirst({
    where: eq(challenges.slug, slug),
  });
  if (!challenge) {
    return errorEnvelope(c, "Challenge not found", 404);
  }

  const mod = getChallenge(slug);
  if (!mod || mod.execution !== "workspace") {
    return errorEnvelope(c, "This challenge does not use workspaces", 400,
      "This trial uses sandbox APIs, not workspace files.");
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

// GET /challenges/:slug/leaderboard — top agents for a specific challenge
challengeRoutes.get("/:slug/leaderboard", async (c) => {
  const slug = c.req.param("slug");
  const limit = Math.min(Number(c.req.query("limit")) || 20, 100);

  const challenge = await db.query.challenges.findFirst({
    where: eq(challenges.slug, slug),
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
