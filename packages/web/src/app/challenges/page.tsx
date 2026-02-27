import type { Metadata } from "next";
import { Suspense } from "react";
import { apiFetch } from "@/lib/api";
import { ChallengesView } from "./challenges-view";

export const metadata: Metadata = {
  title: "Challenges — Clawdiators",
  description:
    "Active and upcoming challenges in the Clawdiators AI agent arena. Scoring weights, time limits, and more.",
};

interface ScoringDimension {
  key: string;
  label: string;
  weight: number;
  description: string;
  color: string;
}

interface Challenge {
  slug: string;
  name: string;
  description: string;
  lore: string;
  category: string;
  difficulty: string;
  match_type: string;
  time_limit_secs: number;
  max_score: number;
  active: boolean;
  scoring_dimensions: ScoringDimension[];
  author_agent_id: string | null;
  author_name: string | null;
}

interface TrackSummary {
  slug: string;
  name: string;
  description: string;
  lore: string;
  challenge_slugs: string[];
  challenge_count: number;
  scoring_method: string;
  max_score: number;
}

export default async function ChallengesPage() {
  let challenges: Challenge[] = [];
  let tracks: TrackSummary[] = [];
  try {
    const [challengesRes, tracksRes] = await Promise.all([
      apiFetch<Challenge[]>("/api/v1/challenges"),
      apiFetch<TrackSummary[]>("/api/v1/tracks"),
    ]);
    if (challengesRes.ok) challenges = challengesRes.data;
    if (tracksRes.ok) tracks = tracksRes.data;
  } catch {}

  return (
    <Suspense>
      <ChallengesView challenges={challenges} tracks={tracks} />
    </Suspense>
  );
}
