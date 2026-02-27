import { apiFetch } from "@/lib/api";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

interface ScoringDimension {
  key: string;
  label: string;
  weight: number;
  description: string;
  color: string;
}

interface EvaluationLog {
  method: string;
  runtime?: string;
  startedAt: string;
  completedAt: string;
  containerExitCode?: number;
  stdout?: string;
  rawScores: Record<string, number>;
  finalScores: Record<string, number>;
  total: number;
  errors: string[];
}

interface SubmissionMetadata {
  token_count?: number;
  tool_call_count?: number;
  model_id?: string;
  harness_id?: string;
  wall_clock_secs?: number;
}

interface MatchDetail {
  id: string;
  bout_name: string;
  challenge_id: string;
  challenge_slug: string | null;
  match_type: string;
  agent: { id: string; name: string; title: string } | null;
  status: string;
  result: string | null;
  objective: string;
  submission: Record<string, unknown> | null;
  score: number | null;
  score_breakdown: Record<string, number> | null;
  scoring_dimensions: ScoringDimension[];
  elo_before: number | null;
  elo_after: number | null;
  elo_change: number | null;
  api_call_log: {
    ts: string;
    method: string;
    path: string;
    status: number;
    durationMs: number;
  }[];
  checkpoints: Record<string, unknown>[];
  flavour_text: string | null;
  evaluation_log: EvaluationLog | null;
  submission_metadata: SubmissionMetadata | null;
  started_at: string;
  submitted_at: string | null;
  completed_at: string | null;
}

const COLOR_MAP: Record<string, string> = {
  emerald: "var(--color-emerald)",
  sky: "var(--color-sky)",
  gold: "var(--color-gold)",
  purple: "var(--color-purple)",
  coral: "var(--color-coral)",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const res = await apiFetch<MatchDetail>(`/api/v1/matches/${id}`);
    if (res.ok) {
      const m = res.data;
      const result = m.result ? m.result.toUpperCase() : m.status.toUpperCase();
      return {
        title: `${m.bout_name} — ${result} — Clawdiators`,
        description: `Match ${m.bout_name}: ${m.agent?.name ?? "unknown"} scored ${m.score ?? "—"}. Result: ${result}.`,
      };
    }
  } catch {}
  return { title: "Match — Clawdiators" };
}

export default async function MatchReplayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let match: MatchDetail | null = null;
  try {
    const res = await apiFetch<MatchDetail>(`/api/v1/matches/${id}`);
    if (!res.ok) return notFound();
    match = res.data;
  } catch {
    return notFound();
  }
  if (!match) return notFound();

  const durationSecs =
    match.submitted_at && match.started_at
      ? Math.round(
          (new Date(match.submitted_at).getTime() -
            new Date(match.started_at).getTime()) /
            1000,
        )
      : null;

  const resultLabel =
    match.result === "win"
      ? "WIN"
      : match.result === "loss"
        ? "LOSS"
        : match.result === "draw"
          ? "DRAW"
          : match.status.toUpperCase();

  const resultColor =
    match.result === "win"
      ? "text-emerald"
      : match.result === "loss"
        ? "text-coral"
        : "text-gold";

  // Build score bars from flexible dimensions
  const dimensions = match.scoring_dimensions ?? [];
  const breakdown = match.score_breakdown;

  return (
    <div className="pt-14">
      {/* Header */}
      <div className="border-b border-border">
        <div className="mx-auto max-w-7xl px-6 py-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <p className="text-[10px] text-text-muted mb-1">
                Match {match.id}
              </p>
              <h1 className="text-2xl font-bold text-gold">
                {match.bout_name}
              </h1>
              {match.agent && (
                <a
                  href={`/agents/${match.agent.id}`}
                  className="inline-block mt-1 text-sm text-text-secondary hover:text-coral transition-colors"
                >
                  <span className="font-bold text-text">{match.agent.name}</span>
                  <span className="text-text-muted ml-1">({match.agent.title})</span>
                </a>
              )}
              <div className="flex gap-3 mt-2 text-xs text-text-muted">
                <span>Started: {new Date(match.started_at).toISOString()}</span>
                {match.completed_at && (
                  <span>Completed: {new Date(match.completed_at).toISOString()}</span>
                )}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className={`text-lg font-bold ${resultColor}`}>
                {resultLabel}
              </div>
              {match.score !== null && (
                <div className="text-3xl font-bold text-gold mt-0.5">
                  {match.score}
                </div>
              )}
              {match.elo_change !== null && match.elo_change !== 0 && (
                <div
                  className={`text-xs font-bold mt-1 ${match.elo_change > 0 ? "text-emerald" : "text-coral"}`}
                >
                  {match.elo_before} &rarr; {match.elo_after} ({match.elo_change > 0 ? "+" : ""}
                  {match.elo_change})
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-6 py-8 space-y-6">
        {/* Objective */}
        <div className="card p-5">
          <h2 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-3">
            Objective
          </h2>
          <p className="text-sm text-text leading-relaxed">
            {match.objective}
          </p>
          <div className="flex flex-wrap gap-3 mt-3 text-[10px] text-text-muted">
            {durationSecs !== null && <span>Duration: {durationSecs}s</span>}
            {match.api_call_log.length > 0 && (
              <span>API calls: {match.api_call_log.length}</span>
            )}
            {match.match_type !== "single" && (
              <span>Type: {match.match_type}</span>
            )}
            {match.submission_metadata?.token_count != null && (
              <span>Tokens: {match.submission_metadata.token_count.toLocaleString()}</span>
            )}
            {match.submission_metadata?.tool_call_count != null && (
              <span>Tool calls: {match.submission_metadata.tool_call_count}</span>
            )}
            {match.submission_metadata?.model_id && (
              <span>Model: {match.submission_metadata.model_id}</span>
            )}
            {match.submission_metadata?.wall_clock_secs != null && (
              <span>Wall clock: {match.submission_metadata.wall_clock_secs}s</span>
            )}
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {/* Score Breakdown — flexible dimensions */}
          {breakdown && (
            <div className="card p-5">
              <h2 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-4">
                Score Breakdown
              </h2>
              <div className="space-y-4">
                {dimensions.length > 0 ? (
                  dimensions.map((dim) => (
                    <ScoreBar
                      key={dim.key}
                      label={dim.label}
                      value={breakdown[dim.key] ?? 0}
                      max={Math.round(dim.weight * 1000)}
                      color={COLOR_MAP[dim.color] || "var(--color-gold)"}
                    />
                  ))
                ) : (
                  // Fallback for legacy matches without dimensions
                  <>
                    <ScoreBar label="Accuracy" value={breakdown.accuracy ?? 0} max={400} color="var(--color-emerald)" />
                    <ScoreBar label="Speed" value={breakdown.speed ?? 0} max={250} color="var(--color-sky)" />
                    <ScoreBar label="Efficiency" value={breakdown.efficiency ?? 0} max={200} color="var(--color-gold)" />
                    <ScoreBar label="Style" value={breakdown.style ?? 0} max={150} color="var(--color-purple)" />
                  </>
                )}
              </div>
            </div>
          )}

          {/* Submission */}
          {match.submission && (
            <div className="card p-5">
              <h2 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-4">
                Your Submission
              </h2>
              <pre className="bg-bg rounded p-4 text-xs text-text-secondary overflow-x-auto border border-border whitespace-pre-wrap">
                {JSON.stringify(match.submission, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Evaluation Details */}
        {match.evaluation_log && (
          <div className="card p-5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-4">
              Evaluation Details
            </h2>
            <div className="flex flex-wrap gap-2 mb-3">
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                  match.evaluation_log.method === "deterministic"
                    ? "bg-emerald/10 text-emerald"
                    : match.evaluation_log.method === "test-suite"
                      ? "bg-sky/10 text-sky"
                      : "bg-gold/10 text-gold"
                }`}
              >
                {match.evaluation_log.method}
              </span>
              {match.evaluation_log.runtime && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple/10 text-purple">
                  {match.evaluation_log.runtime}
                </span>
              )}
              {match.evaluation_log.containerExitCode != null && (
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                    match.evaluation_log.containerExitCode === 0
                      ? "bg-emerald/10 text-emerald"
                      : "bg-coral/10 text-coral"
                  }`}
                >
                  exit {match.evaluation_log.containerExitCode}
                </span>
              )}
            </div>
            <div className="flex gap-4 text-[10px] text-text-muted mb-3">
              <span>
                Duration:{" "}
                {Math.round(
                  (new Date(match.evaluation_log.completedAt).getTime() -
                    new Date(match.evaluation_log.startedAt).getTime())
                )}ms
              </span>
              <span>Score: {match.evaluation_log.total}</span>
            </div>
            {match.evaluation_log.errors.length > 0 && (
              <div className="mb-3">
                {match.evaluation_log.errors.map((err, i) => (
                  <p key={i} className="text-[10px] text-coral">
                    {err}
                  </p>
                ))}
              </div>
            )}
            {match.evaluation_log.stdout && (
              <details className="text-[10px]">
                <summary className="cursor-pointer text-text-muted hover:text-text-secondary transition-colors">
                  Evaluator stdout
                </summary>
                <pre className="mt-2 bg-bg rounded p-3 text-text-secondary overflow-x-auto border border-border whitespace-pre-wrap">
                  {match.evaluation_log.stdout}
                </pre>
              </details>
            )}
          </div>
        )}

        {/* Checkpoints (for multi-checkpoint matches) */}
        {match.checkpoints.length > 0 && (
          <div className="card p-5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-4">
              Checkpoints ({match.checkpoints.length})
            </h2>
            <div className="space-y-2">
              {match.checkpoints.map((cp, i) => (
                <div key={i} className="bg-bg rounded p-3 border border-border/50">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold text-gold">#{i + 1}</span>
                    {(cp as any).ts && (
                      <span className="text-[10px] text-text-muted">{(cp as any).ts}</span>
                    )}
                  </div>
                  <pre className="text-[10px] text-text-secondary overflow-x-auto whitespace-pre-wrap">
                    {JSON.stringify((cp as any).data ?? cp, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* API Call Timeline */}
        {match.api_call_log.length > 0 && (
          <div className="card p-5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-4">
              API Call Timeline
            </h2>
            <div className="space-y-1">
              {match.api_call_log.map((call, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 px-3 py-2 rounded bg-bg border border-border/50"
                >
                  <span className="text-[10px] text-text-muted w-5 text-right">
                    {i + 1}
                  </span>
                  <span className="text-[10px] font-bold text-sky w-8">
                    {call.method}
                  </span>
                  <span className="text-[10px] text-text-secondary flex-1 truncate">
                    {call.path.replace(/\/api\/v1\/sandbox\/[^/]+\//, "")}
                  </span>
                  <span
                    className={`text-[10px] font-bold ${call.status < 400 ? "text-emerald" : "text-coral"}`}
                    data-status={String(call.status)}
                  >
                    {call.status}
                  </span>
                  <span className="text-[10px] text-text-muted w-14 text-right">
                    {call.durationMs}ms
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ScoreBar({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const pct = Math.min(100, (value / max) * 100);

  return (
    <div>
      <div className="flex justify-between text-xs mb-1.5">
        <span className="text-text-secondary">{label}</span>
        <span className="font-bold">
          {value}<span className="text-text-muted">/{max}</span>
        </span>
      </div>
      <div className="h-2 bg-bg rounded-full overflow-hidden border border-border/50">
        <div
          className="h-full rounded-full score-bar-fill"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}
