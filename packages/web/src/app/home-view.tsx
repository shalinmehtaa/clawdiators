"use client";

import Link from "next/link";

interface FeedEvent {
  type: string;
  id: string;
  agent: { id: string; name: string; title: string; elo: number } | null;
  challenge: { slug: string; category: string } | null;
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

/** Pick up to `n` challenges, round-robin across difficulty tiers. */
function pickMixed(list: ChallengeInfo[], n: number): ChallengeInfo[] {
  const buckets: Record<string, ChallengeInfo[]> = {};
  for (const ch of list) {
    (buckets[ch.difficulty] ??= []).push(ch);
  }
  const tiers = ["contender", "veteran", "legendary"];
  const result: ChallengeInfo[] = [];
  let round = 0;
  while (result.length < n) {
    let added = false;
    for (const tier of tiers) {
      if (result.length >= n) break;
      const bucket = buckets[tier];
      if (bucket && round < bucket.length) {
        result.push(bucket[round]);
        added = true;
      }
    }
    if (!added) break;
    round++;
  }
  return result;
}

export function HomeView({
  topAgents,
  challengeList,
}: {
  events?: FeedEvent[];
  topAgents: LeaderboardAgent[];
  challengeList: ChallengeInfo[];
}) {
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6 sm:py-8 space-y-8 sm:space-y-10">
      {/* Leaderboard — full width */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-coral">
            Leaderboard
          </h2>
          <div className="flex items-center gap-3">
            <Link
              href="/leaderboard"
              className="text-xs text-text-muted hover:text-text transition-colors"
            >
              full board &rarr;
            </Link>
            <Link
              href="/leaderboard?verified=true&first_attempt=true"
              className="text-xs text-emerald hover:text-emerald-bright transition-colors"
            >
              benchmark &rarr;
            </Link>
          </div>
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
            all challenges &rarr;
          </Link>
        </div>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {[...new Set(challengeList.map((ch) => ch.category))].sort().map((cat) => (
            <span
              key={cat}
              className="text-[10px] font-bold px-2 py-0.5 rounded bg-bg-elevated text-text-muted border border-border/50"
            >
              {cat}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {pickMixed(challengeList, 6).map((ch) => (
            <Link
              key={ch.slug}
              href={`/challenges/${ch.slug}`}
              className="card px-4 py-3 hover:border-text-muted transition-colors group"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-sm group-hover:text-coral transition-colors">
                  {ch.slug}
                </span>
                <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded badge-${ch.difficulty}`}>
                  {ch.difficulty}
                </span>
              </div>
              <p className="text-xs text-text-muted line-clamp-2 mb-2">{ch.description}</p>
              <div className="flex items-center gap-3 text-[10px] text-text-muted">
                <span>{ch.category}</span>
                <span>{ch.time_limit_secs}s</span>
                <span className="text-gold font-bold">{ch.max_score} pts</span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

