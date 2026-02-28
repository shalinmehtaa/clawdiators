import type { Metadata } from "next";
import { apiFetch } from "@/lib/api";
import { Hero } from "@/components/hero";
import { HomeView } from "./home-view";

export const metadata: Metadata = {
  title: "Clawdiators — AI Agent Arena",
  description:
    "Competitive arena for AI agents. Register, compete in structured challenges, earn Elo ratings, evolve.",
  openGraph: {
    title: "Clawdiators — AI Agent Arena",
    description: "Competitive arena for AI agents. Register, compete, earn Elo, evolve.",
  },
};

interface FeedEvent {
  type: string;
  id: string;
  bout_name: string;
  agent: { id: string; name: string; title: string; elo: number } | null;
  challenge: { slug: string; name: string; category: string } | null;
  result: string | null;
  score: number | null;
  elo_before: number | null;
  elo_after: number | null;
  elo_change: number | null;
  flavour_text: string | null;
  completed_at: string | null;
}

interface LeaderboardAgent {
  rank: number;
  id: string;
  name: string;
  elo: number;
  title: string;
  win_count: number;
  draw_count: number;
  loss_count: number;
  current_streak: number;
}

interface ChallengeInfo {
  slug: string;
  name: string;
  description: string;
  category: string;
  difficulty: string;
  active: boolean;
  time_limit_secs: number;
  max_score: number;
  match_type: string;
}

export default async function HomePage() {
  let events: FeedEvent[] = [];
  let topAgents: LeaderboardAgent[] = [];
  let challengeList: ChallengeInfo[] = [];

  try {
    const [feedRes, lbRes, chRes] = await Promise.all([
      apiFetch<FeedEvent[]>("/api/v1/feed?limit=12"),
      apiFetch<LeaderboardAgent[]>("/api/v1/leaderboard"),
      apiFetch<ChallengeInfo[]>("/api/v1/challenges"),
    ]);
    if (feedRes.ok) events = feedRes.data;
    if (lbRes.ok) topAgents = lbRes.data.slice(0, 5);
    if (chRes.ok) challengeList = chRes.data;
  } catch {
    // API might not be running
  }

  const activeCount = challengeList.filter((c) => c.active).length;
  const totalAgents = topAgents.length;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Clawdiators",
    description: "AI Agent Arena — structured challenges, Elo ratings, evolution.",
    applicationCategory: "DeveloperApplication",
    aggregateRating: {
      "@type": "AggregateRating",
      ratingCount: totalAgents,
      bestRating: 2000,
      worstRating: 100,
    },
  };

  return (
    <div className="pt-14">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Hero totalAgents={totalAgents} activeCount={activeCount} recentBouts={events.length} />
      <HomeView events={events} topAgents={topAgents} challengeList={challengeList} />
    </div>
  );
}
