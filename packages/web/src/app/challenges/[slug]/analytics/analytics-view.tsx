"use client";

import { usePreferences } from "@/components/preferences";

interface ChallengeAnalytics {
  challenge_slug: string;
  total_attempts: number;
  completed_count: number;
  completion_rate: number;
  median_score: number | null;
  mean_score: number | null;
  score_p25: number | null;
  score_p75: number | null;
  win_rate: number;
  avg_duration_secs: number | null;
  score_distribution: { bucket: string; count: number }[];
  score_by_harness: Record<string, { mean: number; median: number; count: number }>;
  score_by_model: Record<string, { mean: number; median: number; count: number }>;
  score_by_variant: Record<string, { mean: number; median: number; count: number; win_rate: number }>;
  score_trend: { date: string; mean_score: number; count: number }[];
  computed_at: string;
}

export function AnalyticsView({ analytics: a }: { analytics: ChallengeAnalytics }) {
  const { showRaw } = usePreferences();

  if (showRaw) {
    return (
      <div className="pt-14">
        <div className="mx-auto max-w-7xl px-6 py-8">
          <pre className="bg-bg-raised rounded p-5 text-xs text-text-secondary overflow-x-auto border border-border whitespace-pre-wrap">
            {JSON.stringify(a, null, 2)}
          </pre>
        </div>
      </div>
    );
  }

  const maxDistCount = Math.max(1, ...a.score_distribution.map((d) => d.count));

  return (
    <div className="pt-14">
      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <a
            href={`/challenges/${a.challenge_slug}`}
            className="text-xs text-text-muted hover:text-coral transition-colors"
          >
            &larr; Back to challenge
          </a>
          <p className="text-xs font-bold uppercase tracking-wider text-coral mt-2 mb-1">
            Analytics
          </p>
          <h1 className="text-xl font-bold">{a.challenge_slug}</h1>
          <p className="text-[10px] text-text-muted mt-1">
            Last computed: {new Date(a.computed_at).toISOString()}
          </p>
        </div>

        <div className="space-y-6">
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <MetricCard label="Total Attempts" value={String(a.total_attempts)} />
            <MetricCard
              label="Completion Rate"
              value={`${Math.round(a.completion_rate * 100)}%`}
              color={a.completion_rate >= 0.5 ? "emerald" : "coral"}
            />
            <MetricCard
              label="Median Score"
              value={a.median_score !== null ? String(a.median_score) : "—"}
              color="gold"
            />
            <MetricCard
              label="Win Rate"
              value={`${Math.round(a.win_rate * 100)}%`}
              color={a.win_rate >= 0.3 ? "emerald" : "coral"}
            />
            <MetricCard
              label="Avg Duration"
              value={a.avg_duration_secs !== null ? `${Math.round(a.avg_duration_secs)}s` : "—"}
            />
          </div>

          {/* Score Distribution Histogram */}
          {a.score_distribution.length > 0 && (
            <div className="card p-5">
              <h2 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-4">
                Score Distribution
              </h2>
              <div className="flex items-end gap-1 h-32">
                {a.score_distribution.map((d) => {
                  const height = (d.count / maxDistCount) * 100;
                  const startScore = parseInt(d.bucket.split("-")[0]);
                  const barColor =
                    startScore >= 700
                      ? "bg-emerald"
                      : startScore >= 400
                        ? "bg-gold"
                        : "bg-coral";
                  return (
                    <div
                      key={d.bucket}
                      className="flex-1 flex flex-col items-center justify-end"
                    >
                      <span className="text-[8px] text-text-muted mb-1">
                        {d.count}
                      </span>
                      <div
                        className={`w-full rounded-t ${barColor}`}
                        style={{ height: `${Math.max(2, height)}%` }}
                      />
                      <span className="text-[8px] text-text-muted mt-1 whitespace-nowrap">
                        {d.bucket.split("-")[0]}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between mt-2 text-[10px] text-text-muted">
                <span>Loss (&lt;400)</span>
                <span>Draw (400-699)</span>
                <span>Win (700+)</span>
              </div>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            {/* Score by Harness */}
            {Object.keys(a.score_by_harness).length > 0 && (
              <div className="card p-5">
                <h2 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-4">
                  Score by Harness
                </h2>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] text-text-muted uppercase border-b border-border">
                      <th className="py-1 text-left">Harness</th>
                      <th className="py-1 text-right">Mean</th>
                      <th className="py-1 text-right">Median</th>
                      <th className="py-1 text-right">Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(a.score_by_harness)
                      .sort((x, y) => y[1].median - x[1].median)
                      .map(([id, stats]) => (
                        <tr key={id} className="border-b border-border/50">
                          <td className="py-1.5 font-bold text-purple">{id}</td>
                          <td className="py-1.5 text-right text-gold">{stats.mean}</td>
                          <td className="py-1.5 text-right">{stats.median}</td>
                          <td className="py-1.5 text-right text-text-muted">{stats.count}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Score by Model */}
            {Object.keys(a.score_by_model).length > 0 && (
              <div className="card p-5">
                <h2 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-4">
                  Score by Model
                </h2>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] text-text-muted uppercase border-b border-border">
                      <th className="py-1 text-left">Model</th>
                      <th className="py-1 text-right">Mean</th>
                      <th className="py-1 text-right">Median</th>
                      <th className="py-1 text-right">Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(a.score_by_model)
                      .sort((x, y) => y[1].median - x[1].median)
                      .map(([id, stats]) => (
                        <tr key={id} className="border-b border-border/50">
                          <td className="py-1.5 font-bold">{id}</td>
                          <td className="py-1.5 text-right text-gold">{stats.mean}</td>
                          <td className="py-1.5 text-right">{stats.median}</td>
                          <td className="py-1.5 text-right text-text-muted">{stats.count}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Variant Comparison */}
          {a.score_by_variant && Object.keys(a.score_by_variant).length > 0 && (
            <div className="card p-5">
              <h2 className="text-xs font-bold uppercase tracking-wider text-purple mb-4">
                Variant Comparison
              </h2>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] text-text-muted uppercase border-b border-border">
                    <th className="py-1 text-left">Variant</th>
                    <th className="py-1 text-right">Mean</th>
                    <th className="py-1 text-right">Median</th>
                    <th className="py-1 text-right">Win Rate</th>
                    <th className="py-1 text-right">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(a.score_by_variant)
                    .sort((x, y) => y[1].median - x[1].median)
                    .map(([id, stats]) => (
                      <tr key={id} className="border-b border-border/50">
                        <td className="py-1.5 font-bold text-purple">{id}</td>
                        <td className="py-1.5 text-right text-gold">{stats.mean}</td>
                        <td className="py-1.5 text-right">{stats.median}</td>
                        <td className="py-1.5 text-right">
                          <span className={stats.win_rate >= 0.3 ? "text-emerald" : "text-coral"}>
                            {Math.round(stats.win_rate * 100)}%
                          </span>
                        </td>
                        <td className="py-1.5 text-right text-text-muted">{stats.count}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Score Trend */}
          {a.score_trend.length > 1 && (
            <div className="card p-5">
              <h2 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-4">
                Score Trend
              </h2>
              <ScoreTrendChart data={a.score_trend} />
            </div>
          )}

          {/* Score Quartiles */}
          {a.median_score !== null && (
            <div className="card p-5">
              <h2 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-4">
                Score Quartiles
              </h2>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div>
                  <div className="text-lg font-bold text-text-muted">{a.score_p25 ?? "—"}</div>
                  <div className="text-[10px] text-text-muted uppercase">P25</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-gold">{a.median_score}</div>
                  <div className="text-[10px] text-text-muted uppercase">Median</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-text-muted">{a.score_p75 ?? "—"}</div>
                  <div className="text-[10px] text-text-muted uppercase">P75</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-sky">{a.mean_score ?? "—"}</div>
                  <div className="text-[10px] text-text-muted uppercase">Mean</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  const cls =
    color === "emerald"
      ? "text-emerald"
      : color === "coral"
        ? "text-coral"
        : color === "gold"
          ? "text-gold"
          : "text-text";
  return (
    <div className="card px-3 py-4 text-center">
      <div className={`text-lg font-bold ${cls}`}>{value}</div>
      <div className="text-[10px] text-text-muted mt-1 uppercase tracking-wider">
        {label}
      </div>
    </div>
  );
}

function ScoreTrendChart({
  data,
}: {
  data: { date: string; mean_score: number; count: number }[];
}) {
  const values = data.map((d) => d.mean_score);
  const min = Math.min(...values) - 50;
  const max = Math.max(...values) + 50;
  const range = max - min || 1;
  const w = 700;
  const h = 100;

  const points = values
    .map((v, i) => {
      const x = (i / Math.max(1, values.length - 1)) * w;
      const y = h - ((v - min) / range) * (h - 8) - 4;
      return `${x},${y}`;
    })
    .join(" ");

  const areaPoints = `0,${h} ${points} ${w},${h}`;
  const trending = values[values.length - 1] >= values[0];

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full"
        preserveAspectRatio="none"
        style={{ height: 100 }}
      >
        <polygon points={areaPoints} fill="url(#trendFade)" />
        <polyline
          points={points}
          fill="none"
          stroke={trending ? "var(--color-emerald)" : "var(--color-coral)"}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <defs>
          <linearGradient id="trendFade" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              stopColor={trending ? "var(--color-emerald)" : "var(--color-coral)"}
              stopOpacity="0.15"
            />
            <stop
              offset="100%"
              stopColor={trending ? "var(--color-emerald)" : "var(--color-coral)"}
              stopOpacity="0"
            />
          </linearGradient>
        </defs>
      </svg>
      <div className="flex justify-between text-[10px] text-text-muted mt-1">
        <span>{data[0]?.date}</span>
        <span>{data[data.length - 1]?.date}</span>
      </div>
    </div>
  );
}
