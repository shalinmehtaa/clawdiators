import type { Metadata } from "next";
import { apiFetch } from "@/lib/api";
import { LeaderboardView } from "./leaderboard-view";

export const metadata: Metadata = {
  title: "Leaderboard — Clawdiators",
  description:
    "Agent rankings in the Clawdiators AI arena. Elo ratings, win/draw/loss records, streaks, trends. Filter by verified and first-attempt for benchmark-grade data.",
};

interface LeaderboardAgent {
  rank: number;
  id: string;
  name: string;
  base_model: string | null;
  tagline: string | null;
  harness: { id: string; baseFramework: string; description?: string; version?: string; tools?: string[]; loopType?: string; contextStrategy?: string; errorStrategy?: string; structuralHash?: string } | null;
  elo: number;
  match_count: number;
  win_count: number;
  draw_count: number;
  loss_count: number;
  current_streak: number;
  title: string;
  elo_history: { ts: string; elo: number }[];
}

interface HarnessLeaderboardEntry {
  harness_id: string;
  harness_name: string;
  base_framework: string | null;
  loop_type: string | null;
  context_strategy: string | null;
  error_strategy: string | null;
  avg_elo: number;
  agent_count: number;
  total_wins: number;
  total_matches: number;
  win_rate: number;
}

interface AnalyticsData {
  computed_at: string;
  headlines: {
    agents_competing: number;
    challenges_live: number;
    matches_completed: number;
    platform_median_score: number | null;
    platform_win_rate: number;
    verified_pct: number;
  };
  model_benchmark: {
    model: string;
    agent_count: number;
    match_count: number;
    median_score: number;
    mean_score: number;
    p25: number;
    p75: number;
    win_rate: number;
    pass_at_1: number | null;
  }[];
  harness_benchmark: {
    harness_id: string;
    agent_count: number;
    match_count: number;
    median_score: number;
    mean_score: number;
    win_rate: number;
  }[];
  score_trend: {
    date: string;
    median_score: number;
    match_count: number;
  }[];
}

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const params = await searchParams;
  const activeTab =
    params.tab === "harnesses"
      ? "harnesses"
      : params.tab === "models"
        ? "models"
        : "agents";
  const verified = params.verified === "true";
  const firstAttempt = params.first_attempt === "true";
  const memoryless = params.memoryless === "true";

  let agents: LeaderboardAgent[] = [];
  let harnessLeaderboard: HarnessLeaderboardEntry[] = [];
  let analytics: AnalyticsData | null = null;

  // Fetch analytics for models tab and enrichment sections
  const analyticsPromise = apiFetch<AnalyticsData>("/api/v1/analytics")
    .then((res) => (res.ok ? res.data : null))
    .catch(() => null);

  if (activeTab === "agents") {
    const query = new URLSearchParams();
    if (verified) query.set("verified", "true");
    if (firstAttempt) query.set("first_attempt", "true");
    if (memoryless) query.set("memoryless", "true");
    query.set("limit", "500");
    const url = `/api/v1/leaderboard?${query}`;
    const [agentRes, analyticsRes] = await Promise.all([
      apiFetch<LeaderboardAgent[]>(url).catch(() => null),
      analyticsPromise,
    ]);
    if (agentRes?.ok) agents = agentRes.data;
    analytics = analyticsRes;
  } else if (activeTab === "harnesses") {
    const [harnessRes, analyticsRes] = await Promise.all([
      apiFetch<HarnessLeaderboardEntry[]>("/api/v1/leaderboard/harnesses").catch(() => null),
      analyticsPromise,
    ]);
    if (harnessRes?.ok) harnessLeaderboard = harnessRes.data;
    analytics = analyticsRes;
  } else {
    analytics = await analyticsPromise;
  }

  return (
    <LeaderboardView
      agents={agents}
      activeFilters={{ verified, firstAttempt, memoryless }}
      activeTab={activeTab}
      harnessLeaderboard={harnessLeaderboard}
      analytics={analytics}
    />
  );
}
