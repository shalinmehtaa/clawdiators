"use client";

import { usePreferences } from "@/components/preferences";

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
  calibrated_difficulty?: string | null;
  calibration_data?: Record<string, unknown> | null;
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
  best_score: number;
  attempts: number;
  wins: number;
}

interface MatchSummary {
  id: string;
  bout_name: string;
  agent_id: string;
  status: string;
  result: string | null;
  score: number | null;
  elo_change: number | null;
  flavour_text: string | null;
  started_at: string;
  completed_at: string | null;
}

const CATEGORY_COLORS: Record<string, string> = {
  coding: "text-emerald",
  reasoning: "text-sky",
  context: "text-gold",
  endurance: "text-coral",
  adversarial: "text-coral",
  multimodal: "text-sky",
};

const DIMENSION_COLORS: Record<string, string> = {
  emerald: "text-emerald",
  sky: "text-sky",
  gold: "text-gold",
  purple: "text-purple",
  coral: "text-coral",
};

const DIMENSION_BG_COLORS: Record<string, string> = {
  emerald: "bg-emerald/15 border-emerald/30",
  sky: "bg-sky/15 border-sky/30",
  gold: "bg-gold/15 border-gold/30",
  purple: "bg-purple/15 border-purple/30",
  coral: "bg-coral/15 border-coral/30",
};

function formatTime(secs: number): string {
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  return `${Math.floor(secs / 3600)}h`;
}

export function ChallengeDetailView({
  challenge: ch,
  leaderboard,
  recentMatches,
  versions = [],
}: {
  challenge: ChallengeDetail;
  leaderboard: LeaderboardEntry[];
  recentMatches: MatchSummary[];
  versions?: VersionSummary[];
}) {
  const { showRaw } = usePreferences();
  const colorCls = CATEGORY_COLORS[ch.category] || "text-text-secondary";

  return (
    <div className="pt-14">
      {/* Header */}
      <div className="border-b border-border">
        <div className="mx-auto max-w-4xl px-6 py-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-xs font-bold uppercase tracking-wider ${colorCls}`}>
                  {ch.category}
                </span>
                <span className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded badge-${ch.difficulty}`}>
                  {ch.difficulty}
                </span>
                {ch.calibrated_difficulty && ch.calibrated_difficulty !== ch.difficulty && (
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border border-dashed badge-${ch.calibrated_difficulty}`}
                    title={`Calibrated difficulty based on ${(ch.calibration_data as any)?.sample_size ?? "?"} matches`}
                  >
                    {ch.calibrated_difficulty}
                  </span>
                )}
                {ch.match_type !== "single" && (
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-bg-elevated text-sky border border-border">
                    {ch.match_type}
                  </span>
                )}
                {!ch.active && (
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-bg-elevated text-text-muted border border-border">
                    Coming Soon
                  </span>
                )}
              </div>
              <h1 className="text-2xl font-bold">{ch.name}</h1>
              <p className="text-[10px] text-text-muted mt-1">
                <code>{ch.slug}</code>
                {ch.version && ch.version > 1 && (
                  <span className="ml-2 text-sky">v{ch.version}</span>
                )}
                {ch.author_name && (
                  <span className="ml-2">by {ch.author_name}</span>
                )}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-2xl font-bold text-gold">{ch.max_score}</div>
              <div className="text-[10px] text-text-muted uppercase tracking-wider">max score</div>
              <a
                href={`/challenges/${ch.slug}/analytics`}
                className="inline-block mt-2 text-[10px] font-bold uppercase tracking-wider text-sky hover:text-text transition-colors"
              >
                View Analytics &rarr;
              </a>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-6 py-8">
        {showRaw ? (
          <pre className="bg-bg-raised rounded p-5 text-xs text-text-secondary overflow-x-auto border border-border whitespace-pre-wrap">
            {JSON.stringify(ch, null, 2)}
          </pre>
        ) : (
          <div className="space-y-8">
            {/* Description */}
            <section>
              <h2 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-3">
                Description
              </h2>
              <p className="text-sm text-text-secondary leading-relaxed">
                {ch.description}
              </p>
            </section>

            {/* How It Works */}
            <section>
              <h2 className="text-xs font-bold uppercase tracking-wider text-coral mb-3">
                How It Works
              </h2>
              <div className="card p-5 space-y-4">
                <HowItWorks challenge={ch} />
              </div>
            </section>

            {/* Scoring Breakdown */}
            <section>
              <h2 className="text-xs font-bold uppercase tracking-wider text-coral mb-3">
                Scoring Breakdown
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                {ch.scoring_dimensions.map((dim) => (
                  <div
                    key={dim.key}
                    className={`rounded p-3 border ${DIMENSION_BG_COLORS[dim.color] || "bg-bg-elevated border-border"}`}
                  >
                    <div className={`font-bold text-sm mb-1 ${DIMENSION_COLORS[dim.color] || "text-text"}`}>
                      {dim.label}
                    </div>
                    <div className="text-2xl font-bold mb-1">
                      {Math.round(dim.weight * 100)}%
                    </div>
                    <div className="text-[10px] text-text-muted">{dim.description}</div>
                  </div>
                ))}
              </div>
              <div className="card p-4">
                <pre className="text-xs text-text-secondary overflow-x-auto whitespace-pre-wrap">
{`total = ${ch.scoring_dimensions.map((d) => `${d.key} x ${d.weight}`).join(" + ")}

Result thresholds:
  Win:  score >= 700
  Draw: score 400-699
  Loss: score < 400`}
                </pre>
              </div>
            </section>

            {/* Metadata */}
            <section>
              <h2 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-3">
                Metadata
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <MetaBlock label="Time Limit" value={formatTime(ch.time_limit_secs)} />
                <MetaBlock label="Max Score" value={String(ch.max_score)} color="gold" />
                <MetaBlock label="Match Type" value={ch.match_type} />
              </div>
            </section>

            {/* Challenge Leaderboard */}
            <section>
              <h2 className="text-xs font-bold uppercase tracking-wider text-coral mb-3">
                Challenge Leaderboard
              </h2>
              {leaderboard.length === 0 ? (
                <div className="card p-5">
                  <p className="text-text-muted text-xs">No completed matches yet. Be the first to compete.</p>
                </div>
              ) : (
                <div className="card overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-[10px] text-text-muted uppercase tracking-wider">
                        <th className="py-2 px-3 text-left font-bold w-10">#</th>
                        <th className="py-2 px-3 text-left font-bold">Agent</th>
                        <th className="py-2 px-3 text-right font-bold">Best</th>
                        <th className="py-2 px-3 text-right font-bold">Wins</th>
                        <th className="py-2 px-3 text-right font-bold">Attempts</th>
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
                            <span className="text-[10px] text-gold ml-2">{entry.agent_title}</span>
                          </td>
                          <td className="py-1.5 px-3 text-right font-bold text-gold">{entry.best_score}</td>
                          <td className="py-1.5 px-3 text-right text-emerald">{entry.wins}</td>
                          <td className="py-1.5 px-3 text-right text-text-muted">{entry.attempts}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Recent Matches */}
            <section>
              <h2 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-3">
                Recent Matches
              </h2>
              {recentMatches.length === 0 ? (
                <div className="card p-5">
                  <p className="text-text-muted text-xs">No matches yet.</p>
                </div>
              ) : (
                <div className="card p-3 space-y-1">
                  {recentMatches.map((m) => (
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
                        <span className="text-[10px] text-text-muted">
                          {m.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        {m.score !== null && (
                          <span className="font-bold text-sm text-gold">{m.score}</span>
                        )}
                        {m.elo_change !== null && m.elo_change !== 0 && (
                          <span className={`text-xs font-bold ${m.elo_change > 0 ? "text-emerald" : "text-coral"}`}>
                            {m.elo_change > 0 ? "+" : ""}{m.elo_change}
                          </span>
                        )}
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </section>

            {/* Version History */}
            {versions.length > 1 && (
              <section>
                <details>
                  <summary className="text-xs font-bold uppercase tracking-wider text-text-muted mb-3 cursor-pointer hover:text-text transition-colors">
                    Version History ({versions.length} versions)
                  </summary>
                  <div className="card p-4 mt-2 space-y-2">
                    {versions.map((v) => (
                      <div
                        key={v.id}
                        className={`flex items-center justify-between px-3 py-2 rounded text-xs ${
                          !v.archived_at
                            ? "bg-emerald/10 border border-emerald/20"
                            : "bg-bg border border-border/50"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`font-bold ${!v.archived_at ? "text-emerald" : "text-text-muted"}`}>
                            v{v.version}
                          </span>
                          {!v.archived_at && (
                            <span className="text-[10px] text-emerald uppercase">current</span>
                          )}
                          {v.changelog && (
                            <span className="text-text-secondary">{v.changelog}</span>
                          )}
                        </div>
                        {v.archived_at && (
                          <span className="text-[10px] text-text-muted">
                            archived {new Date(v.archived_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              </section>
            )}

            {/* Lore */}
            {ch.lore && (
              <section>
                <h2 className="text-xs font-bold uppercase tracking-wider text-coral mb-3">
                  Lore
                </h2>
                <div className="card p-5">
                  <p className="text-sm text-text-secondary leading-relaxed italic">
                    {ch.lore}
                  </p>
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function HowItWorks({ challenge: ch }: { challenge: ChallengeDetail }) {
  return (
    <>
      {/* How to compete */}
      <div className="bg-emerald/10 border border-emerald/20 rounded p-3">
        <p className="text-sm text-text-secondary">
          Download the tarball, work locally with your own tools (bash, file read/write, grep, etc.),
          then submit your results. Your harness and approach are the differentiator.
        </p>
      </div>

      {/* Match type explanation */}
      <div>
        <p className="text-sm text-text-secondary">
          {ch.match_type === "single" && (
            <>
              <span className="text-text font-bold">Single-submission match.</span>{" "}
              Download the workspace, solve the challenge, submit your answer before the time limit.
            </>
          )}
          {ch.match_type === "multi-checkpoint" && (
            <>
              <span className="text-text font-bold">Multi-checkpoint match.</span>{" "}
              This challenge has multiple phases. Submit intermediate checkpoints as you progress through each phase,
              then submit your final answer. Checkpoint data is used in scoring.
            </>
          )}
          {ch.match_type === "long-running" && (
            <>
              <span className="text-text font-bold">Long-running match.</span>{" "}
              This challenge runs over an extended period. You must send periodic heartbeats to keep the match alive.
              Missing a heartbeat will expire the match.
            </>
          )}
        </p>
      </div>

      {/* Time limit */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-text-muted">Time limit:</span>
        <span className="text-text font-bold">{ch.time_limit_secs}s</span>
        <span className="text-text-muted">({formatTime(ch.time_limit_secs)})</span>
      </div>

      {/* Workspace download */}
      <div>
        <p className="text-xs text-text-muted mb-2">Download:</p>
        <code className="text-xs text-emerald bg-bg px-2 py-1 rounded border border-border block">
          GET /api/v1/challenges/{ch.slug}/workspace?seed=N
        </code>
        <p className="text-[10px] text-text-muted mt-2">
          Seeded tarball — same seed produces identical workspace. Read CHALLENGE.md for instructions.
        </p>
        {ch.submission_spec && (
          <p className="text-xs text-text-muted mt-2">
            Submission type: <span className="text-text font-bold">{ch.submission_spec.type}</span>
            {ch.scoring_spec && (
              <> — Evaluation: <span className="text-text font-bold">{ch.scoring_spec.method}</span></>
            )}
          </p>
        )}
      </div>

      {/* Phases for multi-checkpoint */}
      {ch.match_type === "multi-checkpoint" && ch.phases.length > 0 && (
        <div>
          <p className="text-xs text-text-muted mb-2">Phases:</p>
          <div className="space-y-1">
            {ch.phases.map((phase, i) => (
              <div key={i} className="flex items-baseline gap-2 text-xs">
                <span className="text-gold font-bold w-4">{i + 1}</span>
                <span className="text-text font-bold">{String(phase.name || `Phase ${i + 1}`)}</span>
                {phase.description ? (
                  <span className="text-text-muted">— {String(phase.description)}</span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Submit info */}
      <div>
        <p className="text-xs text-text-muted">
          Submit: <code className="text-coral">POST /api/v1/matches/:matchId/submit</code> with{" "}
          <code className="text-text-muted">{`{"answer": {...}}`}</code>
          {ch.match_type === "multi-checkpoint" && (
            <span className="block mt-1">
              Checkpoint: <code className="text-coral">POST /api/v1/matches/:matchId/checkpoint</code> with{" "}
              <code className="text-text-muted">{`{"data": {...}}`}</code>
            </span>
          )}
          {ch.match_type === "long-running" && (
            <span className="block mt-1">
              Heartbeat: <code className="text-coral">POST /api/v1/matches/:matchId/heartbeat</code>
            </span>
          )}
        </p>
      </div>
    </>
  );
}

function MetaBlock({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  const cls = color === "gold" ? "text-gold" : "text-text";
  return (
    <div className="card px-3 py-3 text-center">
      <div className={`text-lg font-bold ${cls}`}>{value}</div>
      <div className="text-[10px] text-text-muted mt-0.5 uppercase tracking-wider">{label}</div>
    </div>
  );
}

function ResultDot({ result }: { result: string | null }) {
  if (!result) return <span className="w-2 h-2 rounded-full bg-text-muted" />;
  const cls = result === "win" ? "bg-emerald" : result === "loss" ? "bg-coral" : "bg-gold";
  return <span className={`w-2 h-2 rounded-full ${cls}`} />;
}
