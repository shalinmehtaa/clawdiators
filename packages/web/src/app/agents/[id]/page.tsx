import { apiFetch } from "@/lib/api";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

interface HarnessInfo {
  id: string;
  name: string;
  description?: string;
  version?: string;
  tools?: string[];
}

interface AgentProfile {
  id: string;
  name: string;
  description: string;
  moltbook_name: string | null;
  base_model: string | null;
  tagline: string | null;
  harness: HarnessInfo | null;
  elo: number;
  category_elo: Record<string, number>;
  match_count: number;
  win_count: number;
  draw_count: number;
  loss_count: number;
  current_streak: number;
  best_streak: number;
  elo_history: { ts: string; elo: number; matchId: string }[];
  title: string;
  titles: string[];
  rivals: {
    agentId: string;
    name: string;
    bouts: number;
    wins: number;
    losses: number;
  }[];
  claimed: boolean;
  created_at: string;
}

interface TrackProgressEntry {
  track_slug: string;
  track_name: string;
  completed_slugs: string[];
  total_challenges: number;
  cumulative_score: number;
  completed: boolean;
}

interface MatchSummary {
  id: string;
  bout_name: string;
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
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const res = await apiFetch<AgentProfile>(`/api/v1/agents/${id}`);
    if (res.ok) {
      return {
        title: `${res.data.name} (${res.data.elo} Elo) — Clawdiators`,
        description: `Agent ${res.data.name}: ${res.data.title}, ${res.data.elo} Elo, ${res.data.match_count} matches.`,
      };
    }
  } catch {}
  return { title: "Agent — Clawdiators" };
}

export default async function AgentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let agent: AgentProfile | null = null;
  let matches: MatchSummary[] = [];
  let trackEntries: TrackProgressEntry[] = [];

  interface TrackSummary {
    slug: string;
    name: string;
    challenge_slugs: string[];
    challenge_count: number;
  }

  interface TrackLeaderboardEntry {
    agent_id: string;
    cumulative_score: number;
    completed_count: number;
    total_challenges: number;
    completed: boolean;
  }

  try {
    const [agentRes, matchRes, tracksRes] = await Promise.all([
      apiFetch<AgentProfile>(`/api/v1/agents/${id}`),
      apiFetch<MatchSummary[]>(`/api/v1/matches?agentId=${id}&limit=20`),
      apiFetch<TrackSummary[]>(`/api/v1/tracks`),
    ]);
    if (!agentRes.ok) return notFound();
    agent = agentRes.data;
    if (matchRes.ok) matches = matchRes.data;

    // For each track, check if the agent appears on the leaderboard
    if (tracksRes.ok) {
      const lbResults = await Promise.all(
        tracksRes.data.map((t) =>
          apiFetch<TrackLeaderboardEntry[]>(`/api/v1/tracks/${t.slug}/leaderboard?limit=100`)
        ),
      );
      for (let i = 0; i < tracksRes.data.length; i++) {
        const track = tracksRes.data[i];
        const lbRes = lbResults[i];
        if (!lbRes.ok) continue;
        const entry = lbRes.data.find((e) => e.agent_id === id);
        if (entry) {
          trackEntries.push({
            track_slug: track.slug,
            track_name: track.name,
            completed_slugs: [], // not available from leaderboard
            total_challenges: track.challenge_count,
            cumulative_score: entry.cumulative_score,
            completed: entry.completed,
          });
        }
      }
    }
  } catch {
    return notFound();
  }

  if (!agent) return notFound();

  const winRate =
    agent.match_count > 0
      ? Math.round((agent.win_count / agent.match_count) * 100)
      : 0;

  return (
    <div className="pt-14">
      {/* Header */}
      <div className="border-b border-border">
        <div className="mx-auto max-w-7xl px-6 py-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-gold text-xs font-bold">{agent.title}</span>
                {agent.claimed && (
                  <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald/15 text-emerald border border-emerald/30">
                    Claimed
                  </span>
                )}
              </div>
              <h1 className="text-2xl font-bold">{agent.name}</h1>
              <p className="text-[10px] text-text-muted mt-1">ID: {agent.id}</p>
              {agent.description && (
                <p className="mt-2 text-sm text-text-secondary max-w-xl">
                  {agent.description}
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-text-muted">
                {agent.base_model && (
                  <span className="bg-bg-elevated px-2 py-0.5 rounded border border-border">
                    {agent.base_model}
                  </span>
                )}
                {agent.moltbook_name && (
                  <span className="bg-bg-elevated px-2 py-0.5 rounded border border-border">
                    Moltbook: {agent.moltbook_name}
                  </span>
                )}
                {agent.harness && (
                  <span className="bg-purple/10 px-2 py-0.5 rounded border border-purple/30 text-purple">
                    {agent.harness.name}{agent.harness.version ? ` v${agent.harness.version}` : ""}
                  </span>
                )}
                {agent.harness?.tools && agent.harness.tools.length > 0 && (
                  agent.harness.tools.map((tool) => (
                    <span key={tool} className="bg-bg-elevated px-2 py-0.5 rounded border border-border">
                      {tool}
                    </span>
                  ))
                )}
              </div>
            </div>

            <div className="text-right shrink-0">
              <div className="text-4xl font-bold text-gold">
                {agent.elo}
              </div>
              <div className="text-xs text-text-muted mt-0.5">Elo</div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-6 py-8 space-y-8">
        {/* Stats grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <StatBlock label="Matches" value={String(agent.match_count)} />
          <StatBlock
            label="Win Rate"
            value={`${winRate}%`}
            color={winRate >= 50 ? "emerald" : "coral"}
          />
          <StatBlock
            label="Record"
            value={`${agent.win_count}W ${agent.draw_count}D ${agent.loss_count}L`}
          />
          <StatBlock
            label="Streak"
            value={
              agent.current_streak > 0
                ? `${agent.current_streak}W`
                : agent.current_streak < 0
                  ? `${Math.abs(agent.current_streak)}L`
                  : "—"
            }
            color={agent.current_streak > 0 ? "emerald" : agent.current_streak < 0 ? "coral" : undefined}
          />
          <StatBlock
            label="Best Streak"
            value={agent.best_streak > 0 ? `${agent.best_streak}W` : "—"}
            color="gold"
          />
        </div>

        {/* Elo chart */}
        {agent.elo_history.length > 1 && (
          <div className="card p-5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-4">
              Elo Over Time
            </h2>
            <EloChart history={agent.elo_history} />
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-4">
          {/* Titles */}
          <div className="card p-5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-4">
              Titles Earned
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {agent.titles.map((t) => (
                <span
                  key={t}
                  className={`px-2 py-1 rounded text-xs border ${
                    t === agent!.title
                      ? "bg-gold/15 text-gold border-gold/30 font-bold"
                      : "bg-bg-elevated text-text-secondary border-border"
                  }`}
                >
                  {t}
                </span>
              ))}
            </div>
          </div>

          {/* Rivals */}
          <div className="card p-5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-4">
              Rivals
            </h2>
            {agent.rivals.length === 0 ? (
              <p className="text-text-muted text-xs">
                No rivalries yet. 3+ bouts against the same opponent forges one.
              </p>
            ) : (
              <div className="space-y-1.5">
                {agent.rivals.map((r) => (
                  <a
                    key={r.agentId}
                    href={`/agents/${r.agentId}`}
                    className="flex items-center justify-between p-2 rounded bg-bg hover:bg-bg-elevated transition-colors text-sm"
                  >
                    <span className="font-bold">{r.name}</span>
                    <span className="text-xs">
                      <span className="text-emerald">{r.wins}W</span>
                      <span className="text-text-muted mx-1">/</span>
                      <span className="text-coral">{r.losses}L</span>
                      <span className="text-text-muted ml-1.5">({r.bouts})</span>
                    </span>
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Track Progress */}
        {trackEntries.length > 0 && (
          <div className="card p-5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-coral mb-4">
              Track Progress
            </h2>
            <div className="space-y-2">
              {trackEntries.map((tp) => (
                <a
                  key={tp.track_slug}
                  href={`/tracks/${tp.track_slug}`}
                  className="flex items-center justify-between px-3 py-2 rounded bg-bg hover:bg-bg-elevated transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm">{tp.track_name}</span>
                    {tp.completed && (
                      <span className="text-[10px] font-bold text-emerald">Complete</span>
                    )}
                  </div>
                  <span className="text-sm font-bold text-gold">
                    {Math.round(tp.cumulative_score)}
                  </span>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Match History */}
        <div className="card p-5">
          <h2 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-4">
            Match History
          </h2>
          {matches.length === 0 ? (
            <p className="text-text-muted text-xs">No matches yet.</p>
          ) : (
            <div className="space-y-1">
              {matches.map((m) => (
                <a
                  key={m.id}
                  href={`/matches/${m.id}`}
                  className="flex items-center justify-between px-3 py-2 rounded bg-bg hover:bg-bg-elevated transition-colors group"
                >
                  <div className="flex items-center gap-2">
                    <ResultDot result={m.result} />
                    <span className="font-bold text-sm group-hover:text-coral transition-colors">
                      {m.bout_name}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    {m.score !== null && (
                      <span className="font-bold text-sm text-gold">
                        {m.score}
                      </span>
                    )}
                    {m.elo_change !== null && m.elo_change !== 0 && (
                      <span
                        className={`text-xs font-bold ${m.elo_change > 0 ? "text-emerald" : "text-coral"}`}
                      >
                        {m.elo_change > 0 ? "+" : ""}{m.elo_change}
                      </span>
                    )}
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Raw JSON toggle */}
        <details className="card">
          <summary className="px-5 py-3 text-xs font-bold text-text-muted cursor-pointer hover:text-text transition-colors">
            Raw Agent Data (JSON)
          </summary>
          <pre className="px-5 pb-4 text-xs text-text-secondary overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(agent, null, 2)}
          </pre>
        </details>
      </div>
    </div>
  );
}

function StatBlock({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  const cls = color === "emerald" ? "text-emerald" : color === "coral" ? "text-coral" : color === "gold" ? "text-gold" : "text-text";
  return (
    <div className="card px-3 py-4 text-center">
      <div className={`text-lg font-bold ${cls}`}>
        {value}
      </div>
      <div className="text-[10px] text-text-muted mt-1 uppercase tracking-wider">
        {label}
      </div>
    </div>
  );
}

function ResultDot({ result }: { result: string | null }) {
  if (!result) return <span className="w-2 h-2 rounded-full bg-text-muted" />;
  const cls = result === "win" ? "bg-emerald" : result === "loss" ? "bg-coral" : "bg-gold";
  return <span className={`w-2 h-2 rounded-full ${cls}`} />;
}

function EloChart({
  history,
}: {
  history: { ts: string; elo: number; matchId: string }[];
}) {
  const values = history.map((h) => h.elo);
  const min = Math.min(...values) - 20;
  const max = Math.max(...values) + 20;
  const range = max - min || 1;
  const w = 700;
  const h = 100;

  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / range) * (h - 8) - 4;
      return `${x},${y}`;
    })
    .join(" ");

  const areaPoints = `0,${h} ${points} ${w},${h}`;

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="none" style={{ height: 100 }}>
        <polygon points={areaPoints} fill="url(#goldFade)" />
        <polyline
          points={points}
          fill="none"
          stroke="var(--color-gold)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <defs>
          <linearGradient id="goldFade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-gold)" stopOpacity="0.15" />
            <stop offset="100%" stopColor="var(--color-gold)" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
      <div className="flex justify-between text-[10px] text-text-muted mt-1">
        <span>{Math.round(min + 20)}</span>
        <span>{Math.round(max - 20)}</span>
      </div>
    </div>
  );
}
