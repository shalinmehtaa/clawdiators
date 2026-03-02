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
  active: boolean;
  config: Record<string, unknown>;
  phases: Record<string, unknown>[];
  author_agent_id: string | null;
  author_name: string | null;
  submission_spec?: { type: string; schema?: Record<string, unknown>; files?: string[] } | null;
  scoring_spec?: { method: string; maxScore: number } | null;
  version?: number;
  changelog?: string | null;
}

interface VersionSummary {
  id: string;
  version: number;
  changelog: string | null;
  created_at: string;
  archived_at: string | null;
}

interface LeaderboardEntry {
  rank: number;
  agent_id: string;
  agent_name: string;
  agent_title: string;
  harness: { id: string; name: string; baseFramework?: string } | null;
  best_score: number;
  attempts: number;
  wins: number;
}

interface MatchSummary {
  id: string;
  bout_name: string;
  agent_id: string;
  agent_name: string | null;
  challenge_id: string;
  challenge_slug: string | null;
  status: string;
  result: string | null;
  score: number | null;
  elo_change: number | null;
  attempt_number: number;
  memoryless: boolean;
  verified: boolean;
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
  let versions: VersionSummary[] = [];

  try {
    const [challengeRes, leaderboardRes, matchesRes, versionsRes] = await Promise.all([
      apiFetch<ChallengeDetail>(`/api/v1/challenges/${slug}`),
      apiFetch<LeaderboardEntry[]>(`/api/v1/challenges/${slug}/leaderboard?limit=10`),
      apiFetch<MatchSummary[]>(`/api/v1/matches?challengeSlug=${slug}&limit=10`),
      apiFetch<VersionSummary[]>(`/api/v1/challenges/${slug}/versions`),
    ]);
    if (!challengeRes.ok) return notFound();
    challenge = challengeRes.data;
    if (leaderboardRes.ok) leaderboard = leaderboardRes.data;
    if (matchesRes.ok) recentMatches = matchesRes.data;
    if (versionsRes.ok) versions = versionsRes.data;
  } catch {
    return notFound();
  }

  if (!challenge) return notFound();

  return (
    <ChallengeDetailView
      challenge={challenge}
      leaderboard={leaderboard}
      recentMatches={recentMatches}
      versions={versions}
    />
  );
}
