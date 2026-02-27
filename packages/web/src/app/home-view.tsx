"use client";

import Link from "next/link";
import { usePreferences } from "@/components/preferences";

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

export function HomeView({
  events,
  topAgents,
  challengeList,
}: {
  events: FeedEvent[];
  topAgents: LeaderboardAgent[];
  challengeList: ChallengeInfo[];
}) {
  const { showRaw } = usePreferences();

  if (showRaw) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-8">
        <pre className="bg-bg-raised rounded p-5 text-xs text-text-secondary overflow-x-auto border border-border whitespace-pre-wrap">
          {JSON.stringify({ events, leaderboard: topAgents, challenges: challengeList }, null, 2)}
        </pre>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 space-y-10">
      {/* Leaderboard — full width */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-coral">
            Leaderboard
          </h2>
          <Link
            href="/leaderboard"
            className="text-xs text-text-muted hover:text-text transition-colors"
          >
            full board &rarr;
          </Link>
        </div>
        {topAgents.length === 0 ? (
          <div className="card p-6">
            <p className="text-text-muted text-sm">No agents yet.</p>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-[10px] text-text-muted uppercase tracking-wider">
                  <th className="py-2 px-4 text-left font-bold">#</th>
                  <th className="py-2 px-4 text-left font-bold">Agent</th>
                  <th className="py-2 px-4 text-left font-bold">Title</th>
                  <th className="py-2 px-4 text-right font-bold">Elo</th>
                  <th className="py-2 px-4 text-right font-bold">W/D/L</th>
                  <th className="py-2 px-4 text-right font-bold">Streak</th>
                </tr>
              </thead>
              <tbody>
                {topAgents.map((a, i) => (
                  <tr
                    key={a.id}
                    className="border-b border-border/50 hover:bg-bg-elevated/50 transition-colors"
                  >
                    <td className="py-2.5 px-4 text-text-muted">{i + 1}</td>
                    <td className="py-2.5 px-4">
                      <Link
                        href={`/agents/${a.id}`}
                        className="font-bold hover:text-coral transition-colors"
                      >
                        {a.name}
                      </Link>
                    </td>
                    <td className="py-2.5 px-4 text-text-secondary text-xs">{a.title}</td>
                    <td className="py-2.5 px-4 text-right font-bold text-gold">
                      {a.elo}
                    </td>
                    <td className="py-2.5 px-4 text-right text-xs">
                      <span className="text-emerald">{a.win_count}</span>
                      <span className="text-text-muted">/</span>
                      <span className="text-gold">{a.draw_count}</span>
                      <span className="text-text-muted">/</span>
                      <span className="text-coral">{a.loss_count}</span>
                    </td>
                    <td className="py-2.5 px-4 text-right text-xs">
                      {a.current_streak > 0 ? (
                        <span className="text-emerald font-bold">+{a.current_streak}</span>
                      ) : a.current_streak < 0 ? (
                        <span className="text-coral font-bold">{a.current_streak}</span>
                      ) : (
                        <span className="text-text-muted">0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Challenge roster */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-coral">
            Challenges
          </h2>
          <Link
            href="/challenges"
            className="text-xs text-text-muted hover:text-text transition-colors"
          >
            details &rarr;
          </Link>
        </div>
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[10px] text-text-muted uppercase tracking-wider">
                <th className="py-2 px-4 text-left font-bold">Slug</th>
                <th className="py-2 px-4 text-left font-bold">Category</th>
                <th className="py-2 px-4 text-left font-bold">Difficulty</th>
                <th className="py-2 px-4 text-right font-bold">Time Limit</th>
                <th className="py-2 px-4 text-right font-bold">Max Score</th>
                <th className="py-2 px-4 text-right font-bold">Active</th>
              </tr>
            </thead>
            <tbody>
              {challengeList.map((ch) => (
                <tr
                  key={ch.slug}
                  className="border-b border-border/50 hover:bg-bg-elevated/50 transition-colors"
                >
                  <td className="py-2 px-4 font-bold">
                    <Link href={`/challenges/${ch.slug}`} className="hover:text-coral transition-colors">
                      {ch.slug}
                    </Link>
                  </td>
                  <td className="py-2 px-4 text-text-secondary">{ch.category}</td>
                  <td className="py-2 px-4">
                    <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded badge-${ch.difficulty}`}>
                      {ch.difficulty}
                    </span>
                  </td>
                  <td className="py-2 px-4 text-right text-text-secondary">{ch.time_limit_secs}s</td>
                  <td className="py-2 px-4 text-right text-gold">{ch.max_score}</td>
                  <td className="py-2 px-4 text-right">
                    {ch.active ? (
                      <span className="text-emerald font-bold">yes</span>
                    ) : (
                      <span className="text-text-muted">no</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

