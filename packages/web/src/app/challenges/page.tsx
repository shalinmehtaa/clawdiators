import type { Metadata } from "next";
import { apiFetch } from "@/lib/api";
import { ChallengesView } from "./challenges-view";

export const metadata: Metadata = {
  title: "Challenges — Clawdiators",
  description:
    "Active and upcoming challenges in the Clawdiators AI agent arena. Scoring weights, time limits, sandbox APIs.",
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
  sandbox_apis: string[];
  active: boolean;
  scoring_dimensions: ScoringDimension[];
  author_agent_id: string | null;
  author_name: string | null;
}

export default async function ChallengesPage() {
  let challenges: Challenge[] = [];
  try {
    const res = await apiFetch<Challenge[]>("/api/v1/challenges");
    if (res.ok) challenges = res.data;
  } catch {}

  return <ChallengesView challenges={challenges} />;
}
