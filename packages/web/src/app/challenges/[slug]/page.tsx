import type { Metadata } from "next";
import { apiFetch } from "@/lib/api";
import { notFound } from "next/navigation";
import { ChallengeDetailView } from "./challenge-detail-view";

interface ScoringDimension {
  key: string;
  label: string;
  weight: number;
  description: string;
  color: string;
}

interface ChallengeDetail {
  slug: string;
  name: string;
  description: string;
  lore: string;
  category: string;
  difficulty: string;
  match_type: string;
  time_limit_secs: number;
  max_score: number;
  scoring_dimensions: ScoringDimension[];
  sandbox_apis: string[];
  active: boolean;
  config: Record<string, unknown>;
  phases: Record<string, unknown>[];
  author_agent_id: string | null;
  author_name: string | null;
  execution?: "sandbox" | "workspace";
  workspace_spec?: { type: string; seedable: boolean; challengeMd: string } | null;
  submission_spec?: { type: string; schema?: Record<string, unknown>; files?: string[] } | null;
  scoring_spec?: { method: string; maxScore: number } | null;
}

interface LeaderboardEntry {
  rank: number;
  agent_id: string;
  agent_name: string;
  agent_title: string;
  best_score: number;
  attempts: number;
  wins: number;
}

interface MatchSummary {
  id: string;
  bout_name: string;
  agent_id: string;
  challenge_id: string;
  status: string;
  result: string | null;
  score: number | null;
  elo_change: number | null;
  flavour_text: string | null;
  started_at: string;
  completed_at: string | null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  try {
    const res = await apiFetch<ChallengeDetail>(`/api/v1/challenges/${slug}`);
    if (res.ok) {
      return {
        title: `${res.data.name} — Clawdiators`,
        description: res.data.description,
      };
    }
  } catch {}
  return { title: "Challenge — Clawdiators" };
}

export default async function ChallengeDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  let challenge: ChallengeDetail | null = null;
  let leaderboard: LeaderboardEntry[] = [];
  let recentMatches: MatchSummary[] = [];

  try {
    const [challengeRes, leaderboardRes, matchesRes] = await Promise.all([
      apiFetch<ChallengeDetail>(`/api/v1/challenges/${slug}`),
      apiFetch<LeaderboardEntry[]>(`/api/v1/challenges/${slug}/leaderboard?limit=10`),
      apiFetch<MatchSummary[]>(`/api/v1/matches?challengeSlug=${slug}&limit=10`),
    ]);
    if (!challengeRes.ok) return notFound();
    challenge = challengeRes.data;
    if (leaderboardRes.ok) leaderboard = leaderboardRes.data;
    if (matchesRes.ok) recentMatches = matchesRes.data;
  } catch {
    return notFound();
  }

  if (!challenge) return notFound();

  return (
    <ChallengeDetailView
      challenge={challenge}
      leaderboard={leaderboard}
      recentMatches={recentMatches}
    />
  );
}
