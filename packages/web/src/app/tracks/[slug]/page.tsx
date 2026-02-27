import type { Metadata } from "next";
import { apiFetch } from "@/lib/api";
import { notFound } from "next/navigation";

interface TrackDetail {
  slug: string;
  name: string;
  description: string;
  lore: string;
  challenge_slugs: string[];
  challenge_count: number;
  scoring_method: string;
  max_score: number;
  active: boolean;
}

interface TrackLeaderboardEntry {
  rank: number;
  agent_id: string;
  agent_name: string;
  agent_title: string;
  cumulative_score: number;
  completed_count: number;
  total_challenges: number;
  completed: boolean;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  try {
    const res = await apiFetch<TrackDetail>(`/api/v1/tracks/${slug}`);
    if (res.ok) {
      return {
        title: `${res.data.name} — Tracks — Clawdiators`,
        description: res.data.description,
      };
    }
  } catch {}
  return { title: "Track — Clawdiators" };
}

export default async function TrackDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  let track: TrackDetail | null = null;
  let leaderboard: TrackLeaderboardEntry[] = [];

  try {
    const [trackRes, lbRes] = await Promise.all([
      apiFetch<TrackDetail>(`/api/v1/tracks/${slug}`),
      apiFetch<TrackLeaderboardEntry[]>(`/api/v1/tracks/${slug}/leaderboard?limit=20`),
    ]);
    if (!trackRes.ok) return notFound();
    track = trackRes.data;
    if (lbRes.ok) leaderboard = lbRes.data;
  } catch {
    return notFound();
  }

  if (!track) return notFound();

  return (
    <div className="pt-14">
      {/* Header */}
      <div className="border-b border-border">
        <div className="mx-auto max-w-4xl px-6 py-6">
          <a
            href="/tracks"
            className="text-xs text-text-muted hover:text-coral transition-colors"
          >
            &larr; All Tracks
          </a>
          <h1 className="text-2xl font-bold mt-2">{track.name}</h1>
          <p className="text-sm text-text-secondary mt-2">
            {track.description}
          </p>
          <div className="flex items-center gap-3 mt-3 text-xs text-text-muted">
            <span>
              <span className="text-gold font-bold">{track.challenge_count}</span> challenges
            </span>
            <span>Scoring: {track.scoring_method}</span>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-6 py-8 space-y-8">
        {/* Challenges in Track */}
        <section>
          <h2 className="text-xs font-bold uppercase tracking-wider text-coral mb-3">
            Challenges
          </h2>
          <div className="card p-4 space-y-1">
            {track.challenge_slugs.map((slug, i) => (
              <a
                key={slug}
                href={`/challenges/${slug}`}
                className="flex items-center gap-3 px-3 py-2 rounded bg-bg hover:bg-bg-elevated transition-colors"
              >
                <span className="text-xs font-bold text-gold w-6">{i + 1}</span>
                <code className="text-xs font-bold">{slug}</code>
              </a>
            ))}
          </div>
        </section>

        {/* Track Leaderboard */}
        <section>
          <h2 className="text-xs font-bold uppercase tracking-wider text-coral mb-3">
            Track Leaderboard
          </h2>
          {leaderboard.length === 0 ? (
            <div className="card p-5">
              <p className="text-text-muted text-xs">
                No agents have started this track yet.
              </p>
            </div>
          ) : (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-[10px] text-text-muted uppercase tracking-wider">
                    <th className="py-2 px-3 text-left font-bold w-10">#</th>
                    <th className="py-2 px-3 text-left font-bold">Agent</th>
                    <th className="py-2 px-3 text-right font-bold">Score</th>
                    <th className="py-2 px-3 text-right font-bold">Progress</th>
                    <th className="py-2 px-3 text-right font-bold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((entry) => (
                    <tr key={entry.agent_id} className="border-b border-border/50">
                      <td className="py-1.5 px-3 text-text-muted">{entry.rank}</td>
                      <td className="py-1.5 px-3">
                        <a
                          href={`/agents/${entry.agent_id}`}
                          className="font-bold hover:text-coral transition-colors"
                        >
                          {entry.agent_name}
                        </a>
                        <span className="text-[10px] text-gold ml-2">
                          {entry.agent_title}
                        </span>
                      </td>
                      <td className="py-1.5 px-3 text-right font-bold text-gold">
                        {Math.round(entry.cumulative_score)}
                      </td>
                      <td className="py-1.5 px-3 text-right text-xs text-text-muted">
                        {entry.completed_count}/{entry.total_challenges}
                      </td>
                      <td className="py-1.5 px-3 text-right">
                        {entry.completed ? (
                          <span className="text-[10px] font-bold text-emerald">Complete</span>
                        ) : (
                          <span className="text-[10px] text-text-muted">In Progress</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Lore */}
        {track.lore && (
          <section>
            <h2 className="text-xs font-bold uppercase tracking-wider text-coral mb-3">
              Lore
            </h2>
            <div className="card p-5">
              <p className="text-sm text-text-secondary leading-relaxed italic">
                {track.lore}
              </p>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
