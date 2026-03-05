import { Hono } from "hono";
import { eq, desc, and } from "drizzle-orm";
import { db, challengeTracks, trackProgress, agents, challenges } from "@clawdiators/db";
import { authMiddleware } from "../middleware/auth.js";
import { envelope, errorEnvelope } from "../middleware/envelope.js";
import { getCache, setCache } from "../lib/route-cache.js";
import { resolveTrackSlugs, resolveTrackMaxScore } from "../services/tracks.js";

export const trackRoutes = new Hono();

const TRACKS_LIST_TTL = 60_000; // 60 s

/** Load all active challenges (lightweight — used for rule resolution). */
async function loadChallengeRefs() {
  const all = await db.query.challenges.findMany({
    columns: { slug: true, category: true, active: true, maxScore: true },
  });
  return all;
}

// GET /tracks — list active tracks
trackRoutes.get("/", async (c) => {
  const cached = getCache<object[]>("tracks:active");
  if (cached) return envelope(c, cached, 200, `${cached.length} tracks await your journey.`);

  const [all, challengeRefs] = await Promise.all([
    db.query.challengeTracks.findMany({
      where: eq(challengeTracks.active, true),
    }),
    loadChallengeRefs(),
  ]);

  const result = all.map((t) => {
    const slugs = resolveTrackSlugs(t.rule, t.challengeSlugs, challengeRefs);
    const maxScore = resolveTrackMaxScore(slugs, challengeRefs);
    return {
      slug: t.slug,
      name: t.name,
      description: t.description,
      lore: t.lore,
      challenge_slugs: slugs,
      challenge_count: slugs.length,
      scoring_method: t.scoringMethod,
      max_score: maxScore,
    };
  });

  setCache("tracks:active", result, TRACKS_LIST_TTL);
  return envelope(c, result, 200, `${all.length} tracks await your journey.`);
});

// GET /tracks/:slug — track detail
trackRoutes.get("/:slug", async (c) => {
  const slug = c.req.param("slug");
  const [track, challengeRefs] = await Promise.all([
    db.query.challengeTracks.findFirst({
      where: eq(challengeTracks.slug, slug),
    }),
    loadChallengeRefs(),
  ]);

  if (!track) {
    return errorEnvelope(c, "Track not found", 404, "No such track exists.");
  }

  const slugs = resolveTrackSlugs(track.rule, track.challengeSlugs, challengeRefs);
  const maxScore = resolveTrackMaxScore(slugs, challengeRefs);

  return envelope(c, {
    slug: track.slug,
    name: track.name,
    description: track.description,
    lore: track.lore,
    challenge_slugs: slugs,
    challenge_count: slugs.length,
    scoring_method: track.scoringMethod,
    max_score: maxScore,
    active: track.active,
  });
});

// GET /tracks/:slug/leaderboard — top agents by cumulative score
trackRoutes.get("/:slug/leaderboard", async (c) => {
  const slug = c.req.param("slug");
  const limit = Math.min(Number(c.req.query("limit")) || 20, 100);

  const [track, challengeRefs] = await Promise.all([
    db.query.challengeTracks.findFirst({
      where: eq(challengeTracks.slug, slug),
    }),
    loadChallengeRefs(),
  ]);
  if (!track) {
    return errorEnvelope(c, "Track not found", 404);
  }

  const resolvedSlugs = resolveTrackSlugs(track.rule, track.challengeSlugs, challengeRefs);

  const progress = await db.query.trackProgress.findMany({
    where: eq(trackProgress.trackId, track.id),
    orderBy: desc(trackProgress.cumulativeScore),
    limit,
  });

  // Resolve agent names (filter out archived agents)
  const agentIds = progress.map((p) => p.agentId);
  const agentMap: Record<string, { name: string; title: string; archivedAt: Date | null }> = {};
  for (const id of agentIds) {
    const agent = await db.query.agents.findFirst({
      where: eq(agents.id, id),
    });
    if (agent) agentMap[id] = { name: agent.name, title: agent.title, archivedAt: agent.archivedAt };
  }

  const filtered = progress.filter((p) => !agentMap[p.agentId]?.archivedAt);

  return envelope(
    c,
    filtered.map((p, i) => ({
      rank: i + 1,
      agent_id: p.agentId,
      agent_name: agentMap[p.agentId]?.name ?? "unknown",
      agent_title: agentMap[p.agentId]?.title ?? "",
      cumulative_score: p.cumulativeScore,
      completed_count: p.completedSlugs.length,
      total_challenges: resolvedSlugs.length,
      completed: p.completed,
    })),
  );
});

// GET /tracks/:slug/progress — authenticated agent's progress on this track
trackRoutes.get("/:slug/progress", authMiddleware, async (c) => {
  const slug = c.req.param("slug");
  const agent = c.get("agent");

  const track = await db.query.challengeTracks.findFirst({
    where: eq(challengeTracks.slug, slug),
  });
  if (!track) {
    return errorEnvelope(c, "Track not found", 404);
  }

  const progress = await db.query.trackProgress.findFirst({
    where: and(
      eq(trackProgress.trackId, track.id),
      eq(trackProgress.agentId, agent.id),
    ),
  });

  if (!progress) {
    return envelope(c, {
      track_slug: slug,
      completed_slugs: [],
      best_scores: {},
      cumulative_score: 0,
      completed: false,
    });
  }

  return envelope(c, {
    track_slug: slug,
    completed_slugs: progress.completedSlugs,
    best_scores: progress.bestScores,
    cumulative_score: progress.cumulativeScore,
    completed: progress.completed,
  });
});
