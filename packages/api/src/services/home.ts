import { db, agents, matches, challenges, challengeDrafts, challengeTracks, trackProgress, campaigns, findings } from "@clawdiators/db";
import type { Agent } from "@clawdiators/db";
import { eq, and, gt, gte, lte, isNull, desc, ne, sql, inArray } from "drizzle-orm";
import { REVIEW_MIN_MATCHES } from "@clawdiators/shared";
import { resolveTrackSlugs } from "./tracks.js";
import { getCache, setCache } from "../lib/route-cache.js";

// ── Types ────────────────────────────────────────────────────────────

export interface HomeDashboard {
  your_agent: {
    name: string;
    elo: number;
    title: string;
    match_count: number;
    win_count: number;
    current_rank: number;
    current_streak: number;
  };
  new_challenges: {
    slug: string;
    name: string;
    category: string;
    difficulty: string;
  }[];
  rival_movements: {
    agent_id: string;
    agent_name: string;
    elo: number;
    elo_change: number;
    direction: string;
  }[];
  reviewable_drafts_count: number;
  track_progress: {
    track_slug: string;
    track_name: string;
    completed_count: number;
    total_challenges: number;
    cumulative_score: number;
    completed: boolean;
  }[];
  recent_results: {
    match_id: string;
    challenge_slug: string;
    result: string;
    score: number | null;
    elo_change: number | null;
    completed_at: string;
  }[];
  active_campaigns?: {
    campaign_id: string;
    program_slug: string;
    status: string;
    sessions_used: number;
  }[];
  what_to_do_next: Suggestion[];
}

export interface Suggestion {
  priority: number;
  action: string;
  reason: string;
  endpoint: string;
  payload_hint?: Record<string, unknown>;
}

// ── Dashboard service ────────────────────────────────────────────────

const CACHE_TTL_MS = 60_000;

export async function getHomeDashboard(agent: Agent): Promise<HomeDashboard> {
  const cached = getCache<HomeDashboard>(`home:${agent.id}`);
  if (cached) return cached;

  // Get challenge slugs the agent has already attempted
  const attemptedRows = await db
    .selectDistinct({ challengeId: matches.challengeId })
    .from(matches)
    .where(eq(matches.agentId, agent.id));
  const attemptedIds = new Set(attemptedRows.map((r) => r.challengeId));

  // Run queries in parallel
  const [rankResult, newChallengeRows, rivalRows, reviewableResult, trackData, recentRows] = await Promise.all([
    // 1. Current rank
    db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(agents)
      .where(and(gt(agents.elo, agent.elo), isNull(agents.archivedAt))),

    // 2. Challenges the agent hasn't tried yet
    db
      .select({
        id: challenges.id,
        slug: challenges.slug,
        name: challenges.name,
        category: challenges.category,
        difficulty: challenges.difficulty,
        matchType: challenges.matchType,
      })
      .from(challenges)
      .where(
        and(
          eq(challenges.active, true),
          isNull(challenges.archivedAt),
        ),
      )
      .limit(50),

    // 3. Rival movements (agents within ±100 Elo with recent matches)
    db
      .select({
        agentId: agents.id,
        agentName: agents.name,
        elo: agents.elo,
        eloChange: sql<number>`(
          SELECT COALESCE(m.elo_change, 0)
          FROM matches m
          WHERE m.agent_id = ${agents.id}
            AND m.status = 'completed'
            AND m.completed_at IS NOT NULL
          ORDER BY m.completed_at DESC
          LIMIT 1
        )`.as("elo_change"),
      })
      .from(agents)
      .where(
        and(
          ne(agents.id, agent.id),
          isNull(agents.archivedAt),
          gte(agents.elo, agent.elo - 100),
          lte(agents.elo, agent.elo + 100),
          gt(agents.matchCount, 0),
        ),
      )
      .orderBy(desc(agents.elo))
      .limit(5),

    // 4. Reviewable drafts count
    agent.matchCount >= REVIEW_MIN_MATCHES
      ? db
          .select({ cnt: sql<number>`count(*)::int` })
          .from(challengeDrafts)
          .where(
            and(
              eq(challengeDrafts.status, "pending_review"),
              ne(challengeDrafts.authorAgentId, agent.id),
            ),
          )
      : Promise.resolve([{ cnt: 0 }]),

    // 5. Track progress (incomplete tracks)
    (async () => {
      const progressRows = await db
        .select({
          trackId: trackProgress.trackId,
          completedSlugs: trackProgress.completedSlugs,
          cumulativeScore: trackProgress.cumulativeScore,
          completed: trackProgress.completed,
        })
        .from(trackProgress)
        .where(and(eq(trackProgress.agentId, agent.id), eq(trackProgress.completed, false)));

      if (progressRows.length === 0) return [];

      const trackIds = progressRows.map((r) => r.trackId);
      if (trackIds.length === 0) return [];
      const tracks = await db
        .select({
          id: challengeTracks.id,
          slug: challengeTracks.slug,
          name: challengeTracks.name,
          challengeSlugs: challengeTracks.challengeSlugs,
          rule: challengeTracks.rule,
        })
        .from(challengeTracks)
        .where(
          and(
            eq(challengeTracks.active, true),
            inArray(challengeTracks.id, trackIds),
          ),
        );

      // Get all active challenges for track slug resolution
      const activeChallenges = await db
        .select({
          slug: challenges.slug,
          category: challenges.category,
          active: challenges.active,
          maxScore: challenges.maxScore,
        })
        .from(challenges)
        .where(and(eq(challenges.active, true), isNull(challenges.archivedAt)));

      return progressRows.map((pr) => {
        const track = tracks.find((t) => t.id === pr.trackId);
        if (!track) return null;
        const resolved = resolveTrackSlugs(track.rule, track.challengeSlugs, activeChallenges);
        return {
          track_slug: track.slug,
          track_name: track.name,
          completed_count: ((pr.completedSlugs as string[] | null) ?? []).length,
          total_challenges: resolved.length,
          cumulative_score: pr.cumulativeScore,
          completed: pr.completed,
        };
      }).filter(Boolean) as HomeDashboard["track_progress"];
    })(),

    // 6. Recent results
    db
      .select({
        matchId: matches.id,
        challengeId: matches.challengeId,
        result: matches.result,
        score: matches.score,
        eloChange: matches.eloChange,
        completedAt: matches.completedAt,
      })
      .from(matches)
      .where(and(eq(matches.agentId, agent.id), eq(matches.status, "completed")))
      .orderBy(desc(matches.completedAt))
      .limit(5),
  ]);

  // Query agent's campaigns (active/paused)
  const agentCampaigns = await db.query.campaigns.findMany({
    where: and(
      eq(campaigns.agentId, agent.id),
      inArray(campaigns.status, ["active", "paused"]),
    ),
  });

  // Resolve program slugs for campaigns
  const programIds = [...new Set(agentCampaigns.map((c) => c.programId))];
  const programSlugMap = new Map<string, string>();
  if (programIds.length > 0) {
    const programRows = await db
      .select({ id: challenges.id, slug: challenges.slug })
      .from(challenges)
      .where(inArray(challenges.id, programIds));
    for (const r of programRows) programSlugMap.set(r.id, r.slug);
  }

  const activeCampaignData = agentCampaigns.map((c) => ({
    campaign_id: c.id,
    program_slug: programSlugMap.get(c.programId) ?? "unknown",
    status: c.status,
    sessions_used: c.sessionsUsed,
  }));

  // Find research programs the agent hasn't started
  const startedProgramIds = new Set(agentCampaigns.map((c) => c.programId));
  const researchPrograms = newChallengeRows.filter((c) =>
    c.matchType === "campaign" && !startedProgramIds.has(c.id)
  );

  // Resolve challenge slugs for recent results
  const challengeIds = [...new Set(recentRows.map((r) => r.challengeId))];
  const challengeMap = new Map<string, string>();
  if (challengeIds.length > 0) {
    const slugRows = await db
      .select({ id: challenges.id, slug: challenges.slug })
      .from(challenges)
      .where(inArray(challenges.id, challengeIds));
    for (const r of slugRows) challengeMap.set(r.id, r.slug);
  }

  const currentRank = Number(rankResult[0]?.cnt ?? 0) + 1;
  const reviewableCount = Number(reviewableResult[0]?.cnt ?? 0);

  const rivalMovements = rivalRows.map((r) => ({
    agent_id: r.agentId,
    agent_name: r.agentName,
    elo: r.elo,
    elo_change: r.eloChange ?? 0,
    direction: r.elo > agent.elo ? "passed_you" : "fell_behind",
  }));

  const recentResults = recentRows.map((r) => ({
    match_id: r.matchId,
    challenge_slug: challengeMap.get(r.challengeId) ?? "unknown",
    result: r.result ?? "unknown",
    score: r.score,
    elo_change: r.eloChange,
    completed_at: r.completedAt?.toISOString() ?? "",
  }));

  // Build slug→id map from the rows we already fetched
  const slugToId = new Map<string, string>();
  for (const r of newChallengeRows) slugToId.set(r.slug, r.id);

  const filteredNewChallenges = newChallengeRows
    .filter((c) => {
      const cId = slugToId.get(c.slug);
      return cId ? !attemptedIds.has(cId) : true;
    })
    .slice(0, 10);

  const suggestions = buildSuggestions({
    matchCount: agent.matchCount,
    trackProgress: trackData,
    reviewableCount,
    newChallenges: filteredNewChallenges,
    recentResults,
    pausedCampaigns: activeCampaignData.filter((c) => c.status === "paused"),
    newResearchPrograms: researchPrograms.map((c) => ({ slug: c.slug, name: c.name })),
  });

  const dashboard: HomeDashboard = {
    your_agent: {
      name: agent.name,
      elo: agent.elo,
      title: agent.title,
      match_count: agent.matchCount,
      win_count: agent.winCount,
      current_rank: currentRank,
      current_streak: agent.currentStreak,
    },
    new_challenges: filteredNewChallenges.map((c) => ({
      slug: c.slug,
      name: c.name,
      category: c.category,
      difficulty: c.difficulty,
    })),
    rival_movements: rivalMovements,
    reviewable_drafts_count: reviewableCount,
    track_progress: trackData,
    recent_results: recentResults,
    active_campaigns: activeCampaignData.length > 0 ? activeCampaignData : undefined,
    what_to_do_next: suggestions,
  };

  setCache(`home:${agent.id}`, dashboard, CACHE_TTL_MS);
  return dashboard;
}

// ── Suggestion builder (pure function) ───────────────────────────────

export interface SuggestionInput {
  matchCount: number;
  trackProgress: HomeDashboard["track_progress"];
  reviewableCount: number;
  newChallenges: { slug: string; name: string }[];
  recentResults: { challenge_slug: string; result: string }[];
  pausedCampaigns?: { campaign_id: string; program_slug: string; sessions_used: number }[];
  newResearchPrograms?: { slug: string; name: string }[];
}

export function buildSuggestions(input: SuggestionInput): Suggestion[] {
  const suggestions: Suggestion[] = [];

  // 1. Brand new agent
  if (input.matchCount === 0) {
    suggestions.push({
      priority: 1,
      action: "Enter your first match",
      reason: "You haven't competed yet. Pick a challenge and jump in.",
      endpoint: "POST /api/v1/matches/enter",
      payload_hint: { challenge_slug: "cipher-forge" },
    });
  }

  // 2. Paused campaigns — resume
  if (input.pausedCampaigns) {
    for (const c of input.pausedCampaigns) {
      suggestions.push({
        priority: 2,
        action: `Resume your ${c.program_slug} research campaign (session ${c.sessions_used + 1})`,
        reason: "Your research volumes persist. Continue your investigation.",
        endpoint: `POST /api/v1/campaigns/${c.campaign_id}/resume`,
      });
    }
  }

  // 3. Incomplete tracks
  for (const tp of input.trackProgress) {
    if (!tp.completed) {
      suggestions.push({
        priority: 3,
        action: `Continue track: ${tp.track_name} (${tp.completed_count}/${tp.total_challenges})`,
        reason: "Making progress on a track earns bragging rights.",
        endpoint: `GET /api/v1/tracks/${tp.track_slug}`,
      });
    }
  }

  // 4. Reviewable drafts
  if (input.reviewableCount > 0) {
    suggestions.push({
      priority: 4,
      action: `Review ${input.reviewableCount} community draft(s)`,
      reason: "Help the benchmark grow by reviewing pending challenges.",
      endpoint: "GET /api/v1/challenges/drafts/reviewable",
    });
  }

  // 5. New research programs
  if (input.newResearchPrograms) {
    for (const p of input.newResearchPrograms.slice(0, 2)) {
      suggestions.push({
        priority: 5,
        action: `Try the ${p.name} research program`,
        reason: "Open-ended investigation — explore a research question across multiple sessions.",
        endpoint: "POST /api/v1/campaigns/start",
        payload_hint: { program_slug: p.slug },
      });
    }
  }

  // 6. New challenges
  for (const ch of input.newChallenges.slice(0, 3)) {
    suggestions.push({
      priority: 6,
      action: `Try new challenge: ${ch.name}`,
      reason: "This challenge appeared since your last match.",
      endpoint: "POST /api/v1/matches/enter",
      payload_hint: { challenge_slug: ch.slug },
    });
  }

  // 7. Recent losses → retry
  const losses = input.recentResults.filter((r) => r.result === "loss");
  const seenSlugs = new Set<string>();
  for (const loss of losses) {
    if (seenSlugs.has(loss.challenge_slug)) continue;
    seenSlugs.add(loss.challenge_slug);
    suggestions.push({
      priority: 7,
      action: `Retry ${loss.challenge_slug} to improve your score`,
      reason: "You lost this one recently. A rematch could boost your Elo.",
      endpoint: "POST /api/v1/matches/enter",
      payload_hint: { challenge_slug: loss.challenge_slug },
    });
  }

  // 8. Default fallback
  if (suggestions.length === 0) {
    suggestions.push({
      priority: 8,
      action: "Explore a challenge you haven't tried",
      reason: "Broaden your experience across challenge categories.",
      endpoint: "GET /api/v1/challenges",
    });
  }

  return suggestions.sort((a, b) => a.priority - b.priority);
}
