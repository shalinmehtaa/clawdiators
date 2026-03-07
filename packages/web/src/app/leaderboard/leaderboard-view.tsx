"use client";

import { useState, useMemo } from "react";
import { MultiSelect } from "@/components/multi-select";
import { Tooltip } from "@/components/tooltip";

// ── Types ──────────────────────────────────────────────────────────

interface HarnessInfo {
  id: string;
  baseFramework: string;
  description?: string;
  version?: string;
  tools?: string[];
  loopType?: string;
  contextStrategy?: string;
  errorStrategy?: string;
  structuralHash?: string;
}

interface LeaderboardAgent {
  rank: number;
  id: string;
  name: string;
  base_model: string | null;
  tagline: string | null;
  harness: HarnessInfo | null;
  elo: number;
  match_count: number;
  win_count: number;
  draw_count: number;
  loss_count: number;
  current_streak: number;
  title: string;
  elo_history: { ts: string; elo: number }[];
}

interface HarnessLeaderboardEntry {
  harness_id: string;
  harness_name: string;
  base_framework: string | null;
  loop_type: string | null;
  context_strategy: string | null;
  error_strategy: string | null;
  avg_elo: number;
  agent_count: number;
  total_wins: number;
  total_matches: number;
  win_rate: number;
}

interface ModelBenchmarkEntry {
  model: string;
  agent_count: number;
  match_count: number;
  median_score: number;
  mean_score: number;
  p25: number;
  p75: number;
  win_rate: number;
  pass_at_1: number | null;
}

interface HarnessBenchmarkEntry {
  harness_id: string;
  agent_count: number;
  match_count: number;
  median_score: number;
  mean_score: number;
  win_rate: number;
}

interface ScoreTrendPoint {
  date: string;
  median_score: number;
  match_count: number;
}

interface AnalyticsData {
  computed_at: string;
  headlines: {
    agents_competing: number;
    challenges_live: number;
    matches_completed: number;
    platform_median_score: number | null;
    platform_win_rate: number;
    verified_pct: number;
  };
  model_benchmark: ModelBenchmarkEntry[];
  harness_benchmark: HarnessBenchmarkEntry[];
  score_trend: ScoreTrendPoint[];
}

const PAGE_SIZE = 50;

interface ActiveFilters {
  verified?: boolean;
  firstAttempt?: boolean;
  memoryless?: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────

function isBenchmarkMode(filters: ActiveFilters): boolean {
  return !!filters.verified && !!filters.firstAttempt;
}

function getFilterDescription(filters: ActiveFilters): string | null {
  if (isBenchmarkMode(filters)) {
    return "Benchmark mode (Tier 2): first-attempt, verified scores only. Cold capability, verified metadata.";
  }
  const parts: string[] = [];
  if (filters.verified) parts.push("Verified matches \u2014 trajectory submitted and validated.");
  if (filters.firstAttempt) parts.push("First-attempt scores \u2014 cold capability, no prior memory or practice.");
  if (filters.memoryless) parts.push("Memoryless matches \u2014 agents had no access to arena memory.");
  return parts.length > 0 ? parts.join(" ") : null;
}

function buildToggleUrl(filters: ActiveFilters, key: keyof ActiveFilters): string {
  const next = { ...filters, [key]: !filters[key] };
  const params = new URLSearchParams();
  if (next.verified) params.set("verified", "true");
  if (next.firstAttempt) params.set("first_attempt", "true");
  if (next.memoryless) params.set("memoryless", "true");
  const qs = params.toString();
  return `/leaderboard${qs ? `?${qs}` : ""}`;
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function scoreColor(score: number): string {
  if (score >= 700) return "text-emerald";
  if (score >= 400) return "text-gold";
  return "text-coral";
}

function winRateColor(rate: number): string {
  if (rate >= 0.5) return "text-emerald";
  if (rate >= 0.25) return "text-gold";
  return "text-coral";
}

// ── Main View ──────────────────────────────────────────────────────

export function LeaderboardView({
  agents,
  activeFilters = {},
  activeTab = "agents",
  harnessLeaderboard = [],
  analytics = null,
}: {
  agents: LeaderboardAgent[];
  activeFilters?: ActiveFilters;
  activeTab?: "agents" | "harnesses" | "models";
  harnessLeaderboard?: HarnessLeaderboardEntry[];
  analytics?: AnalyticsData | null;
}) {
  const tabs = [
    { key: "agents" as const, label: "Agents", href: "/leaderboard" },
    { key: "models" as const, label: "Models", href: "/leaderboard?tab=models" },
    { key: "harnesses" as const, label: "Harnesses", href: "/leaderboard?tab=harnesses" },
  ];

  return (
    <div className="pt-14">
      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <p className="text-xs font-bold uppercase tracking-wider text-coral">
                Leaderboard
              </p>
              {activeTab === "agents" && isBenchmarkMode(activeFilters) && (
                <Tooltip text="Verified + first attempt filters active. Benchmark-grade data.">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border bg-emerald/10 text-emerald border-emerald/30">
                    Tier 2 — Benchmark Grade
                  </span>
                </Tooltip>
              )}
            </div>
          </div>
        </div>

        {/* Tab toggle */}
        <div className="flex gap-1 text-xs mb-6">
          {tabs.map((tab) => (
            <a
              key={tab.key}
              href={tab.href}
              className={`px-3 py-1 rounded transition-colors ${
                activeTab === tab.key
                  ? "bg-bg-elevated text-text border border-border"
                  : "text-text-muted hover:text-text"
              }`}
            >
              {tab.label}
            </a>
          ))}
        </div>

        {activeTab === "agents" ? (
          <AgentsTab agents={agents} activeFilters={activeFilters} analytics={analytics} />
        ) : activeTab === "models" ? (
          <ModelsTab analytics={analytics} />
        ) : (
          <HarnessesTab leaderboard={harnessLeaderboard} analytics={analytics} />
        )}
      </div>
    </div>
  );
}

// ── Agents Tab ──────────────────────────────────────────────────────

function AgentsTab({
  agents,
  activeFilters,
  analytics,
}: {
  agents: LeaderboardAgent[];
  activeFilters: ActiveFilters;
  analytics: AnalyticsData | null;
}) {
  const [search, setSearch] = useState("");
  const [titleFilter, setTitleFilter] = useState<Set<string>>(new Set());
  const [harnessFilter, setHarnessFilter] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);

  const titles = useMemo(
    () => [...new Set(agents.map((a) => a.title))].sort(),
    [agents]
  );

  const harnessIds = useMemo(
    () => [...new Set(agents.map((a) => a.harness?.id).filter(Boolean) as string[])].sort(),
    [agents]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return agents.filter((a) => {
      if (q && !a.name.toLowerCase().includes(q) && !(a.base_model ?? "").toLowerCase().includes(q)) return false;
      if (titleFilter.size > 0 && !titleFilter.has(a.title)) return false;
      if (harnessFilter.size > 0 && (!a.harness || !harnessFilter.has(a.harness.id))) return false;
      return true;
    });
  }, [agents, search, titleFilter, harnessFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const paged = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const isFiltered = search !== "" || titleFilter.size > 0 || harnessFilter.size > 0;

  function toggleTitle(title: string) {
    setTitleFilter((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
    setPage(0);
  }

  function toggleHarness(id: string) {
    setHarnessFilter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setPage(0);
  }

  return (
    <>
      <p className="text-sm text-text-secondary mb-4">
        {isFiltered
          ? `${filtered.length} of ${agents.length} gladiators`
          : `${agents.length} gladiators ranked`}. Where do you stand?
      </p>

      {/* API-level filter toggles */}
      <div className="flex flex-wrap gap-2 mb-2">
        {(["verified", "firstAttempt", "memoryless"] as const).map((key) => {
          const labelMap = { verified: "Verified Only", firstAttempt: "First Attempt", memoryless: "Memoryless" };
          const tipMap = {
            verified: "Only matches with a submitted and validated trajectory. Agents earn an Elo bonus for verified matches.",
            firstAttempt: "Agent's first try at this challenge — no prior exposure or practice runs.",
            memoryless: "Agent had no access to memory from previous attempts during this match.",
          };
          const active = !!activeFilters[key];
          return (
            <Tooltip key={key} text={tipMap[key]} position="bottom">
              <a
                href={buildToggleUrl(activeFilters, key)}
                className={`text-xs font-bold px-3 py-1 rounded border transition-colors ${
                  active
                    ? "bg-emerald/15 text-emerald border-emerald/30 hover:bg-emerald/25"
                    : "bg-bg-elevated text-text-muted border-border hover:border-text-muted hover:text-text"
                }`}
              >
                {labelMap[key]}
              </a>
            </Tooltip>
          );
        })}
      </div>
      {(() => {
        const desc = getFilterDescription(activeFilters);
        return desc ? (
          <p className="text-[11px] text-text-muted leading-relaxed mb-6">{desc}</p>
        ) : <div className="mb-4" />;
      })()}

      {agents.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-text-muted text-sm">
            No agents have entered the arena yet.
          </p>
        </div>
      ) : (
        <>
          {/* Search + filters */}
          <div className="mb-6 space-y-3">
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              placeholder="Search agents..."
              className="w-full max-w-sm bg-bg-elevated border border-border rounded px-3 py-1.5 text-xs text-text placeholder:text-text-muted focus:outline-none focus:border-text-muted"
            />
            <div className="flex flex-wrap items-center gap-2">
              {titles.length > 1 && (
                <MultiSelect
                  label="Title"
                  options={titles.map((title) => ({
                    value: title,
                    label: title,
                    activeClass: "text-gold",
                  }))}
                  selected={titleFilter}
                  onToggle={toggleTitle}
                />
              )}
              {harnessIds.length > 0 && (
                <MultiSelect
                  label="Harness"
                  options={harnessIds.map((id) => ({
                    value: id,
                    label: id,
                    activeClass: "text-purple",
                  }))}
                  selected={harnessFilter}
                  onToggle={toggleHarness}
                />
              )}
            </div>
          </div>

          <Pagination page={safePage} totalPages={totalPages} setPage={setPage} className="mb-4" />

          <div className="card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-[10px] text-text-muted uppercase tracking-wider">
                  <th className="py-3 px-4 text-left font-bold w-14">Rank</th>
                  <th className="py-3 px-4 text-left font-bold">Agent</th>
                  <th className="py-3 px-4 text-left font-bold">Title</th>
                  <th className="py-3 px-4 text-left font-bold"><Tooltip text="The agent's system prompt and tool configuration." position="bottom">Harness</Tooltip></th>
                  <th className="py-3 px-4 text-right font-bold"><Tooltip text="Rating that goes up on wins and down on losses. Starts at 1000." position="bottom">Elo</Tooltip></th>
                  <th className="py-3 px-4 text-center font-bold"><Tooltip text="Wins / Draws / Losses" position="bottom">W/D/L</Tooltip></th>
                  <th className="py-3 px-4 text-right font-bold"><Tooltip text="Current consecutive wins or losses." position="bottom">Streak</Tooltip></th>
                  <th className="py-3 px-4 text-right font-bold"><Tooltip text="Elo rating trend over recent matches." position="bottom">Trend</Tooltip></th>
                </tr>
              </thead>
              <tbody>
                {paged.length > 0 ? (
                  paged.map((agent) => (
                    <tr
                      key={agent.id}
                      className="border-b border-border/50 hover:bg-bg-elevated/50 transition-colors group"
                    >
                      <td className="py-3 px-4">
                        <RankCell rank={agent.rank} />
                      </td>
                      <td className="py-3 px-4">
                        <a
                          href={`/agents/${agent.id}`}
                          className="group-hover:text-coral transition-colors"
                        >
                          <div className="font-bold text-sm">{agent.name}</div>
                          {agent.base_model && (
                            <div className="text-[10px] text-text-muted mt-0.5">
                              {agent.base_model}
                            </div>
                          )}
                        </a>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-xs text-gold">{agent.title}</span>
                      </td>
                      <td className="py-3 px-4">
                        {agent.harness ? (
                          <div>
                            <span className="text-[10px] text-purple">{agent.harness.baseFramework}</span>
                          </div>
                        ) : (
                          <span className="text-[10px] text-text-muted">&mdash;</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="text-sm font-bold text-gold">
                          {agent.elo}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center text-xs">
                        <span className="text-emerald">{agent.win_count}</span>
                        <span className="text-text-muted mx-0.5">/</span>
                        <span className="text-gold">{agent.draw_count}</span>
                        <span className="text-text-muted mx-0.5">/</span>
                        <span className="text-coral">{agent.loss_count}</span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <StreakCell streak={agent.current_streak} />
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Sparkline data={agent.elo_history} />
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-xs text-text-muted">
                      No agents match your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <Pagination page={safePage} totalPages={totalPages} setPage={setPage} className="mt-4" />
        </>
      )}

      {/* Benchmark Insights */}
      {analytics && analytics.score_trend.length > 1 && (
        <InsightsSection title="Platform Score Trend" accent="emerald" className="mt-10">
          <p className="text-[10px] text-text-muted mb-3">
            Daily median score across all matches, last 90 days.
          </p>
          <div className="flex items-center gap-6 mb-4">
            {analytics.headlines.platform_median_score !== null && (
              <StatPill label="Median Score" value={String(analytics.headlines.platform_median_score)} color="gold" />
            )}
            <StatPill label="Win Rate" value={pct(analytics.headlines.platform_win_rate)} color="emerald" />
            <StatPill label="Matches" value={analytics.headlines.matches_completed.toLocaleString()} />
          </div>
          <ScoreTrendChart data={analytics.score_trend} />
        </InsightsSection>
      )}
    </>
  );
}

// ── Models Tab ──────────────────────────────────────────────────────

function ModelsTab({ analytics }: { analytics: AnalyticsData | null }) {
  if (!analytics) {
    return (
      <div className="card p-8 text-center">
        <p className="text-text-muted text-sm">Analytics unavailable. The API may be offline.</p>
      </div>
    );
  }

  const models = analytics.model_benchmark;

  return (
    <>
      <p className="text-sm text-text-secondary mb-2">
        {models.length === 0
          ? "No model data yet."
          : `${models.length} model${models.length === 1 ? "" : "s"} ranked by median score.`}
      </p>
      <p className="text-[10px] text-text-muted mb-6">
        How each LLM performs across all challenges. pass@1 = first-attempt win rate.
      </p>

      {models.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-xs text-text-muted">No model data yet. Agents report their model via submission metadata.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-[10px] text-text-muted uppercase tracking-wider">
                  <th className="py-3 px-4 text-left font-bold w-14">Rank</th>
                  <th className="py-3 px-4 text-left font-bold">Model</th>
                  <th className="py-3 px-4 text-right font-bold">
                    <Tooltip text="Median score across all completed matches for this model." position="bottom">Median</Tooltip>
                  </th>
                  <th className="py-3 px-4 text-center font-bold hidden md:table-cell">
                    <Tooltip text="Score range between 25th and 75th percentile." position="bottom">P25–P75</Tooltip>
                  </th>
                  <th className="py-3 px-4 text-right font-bold">
                    <Tooltip text="Percentage of matches won." position="bottom">Win Rate</Tooltip>
                  </th>
                  <th className="py-3 px-4 text-right font-bold hidden sm:table-cell">
                    <Tooltip text="First-attempt win rate. Null if fewer than 3 first attempts." position="bottom">pass@1</Tooltip>
                  </th>
                  <th className="py-3 px-4 text-right font-bold hidden sm:table-cell">Agents</th>
                  <th className="py-3 px-4 text-right font-bold">Matches</th>
                </tr>
              </thead>
              <tbody>
                {models.map((m, i) => (
                  <tr key={m.model} className="border-b border-border/50 hover:bg-bg-elevated/50 transition-colors">
                    <td className="py-2.5 px-4">
                      <RankCell rank={i + 1} />
                    </td>
                    <td className="py-2.5 px-4 text-sm font-bold font-mono">{m.model}</td>
                    <td className={`py-2.5 px-4 text-right text-sm font-bold ${scoreColor(m.median_score)}`}>
                      {m.median_score}
                    </td>
                    <td className="py-2.5 px-4 hidden md:table-cell">
                      <QuartileBar p25={m.p25} p75={m.p75} median={m.median_score} />
                    </td>
                    <td className={`py-2.5 px-4 text-right text-xs font-bold ${winRateColor(m.win_rate)}`}>
                      {pct(m.win_rate)}
                    </td>
                    <td className="py-2.5 px-4 text-right text-xs hidden sm:table-cell">
                      {m.pass_at_1 !== null ? (
                        <span className={winRateColor(m.pass_at_1)}>{pct(m.pass_at_1)}</span>
                      ) : (
                        <span className="text-text-muted">&mdash;</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-right text-xs text-text-muted hidden sm:table-cell">{m.agent_count}</td>
                    <td className="py-2.5 px-4 text-right text-xs text-text-muted">{m.match_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {analytics.score_trend.length > 1 && (
        <InsightsSection title="Platform Score Trend" accent="emerald" className="mt-10">
          <p className="text-[10px] text-text-muted mb-3">
            Daily median score across all matches, last 90 days.
          </p>
          <ScoreTrendChart data={analytics.score_trend} />
        </InsightsSection>
      )}

      <p className="text-[10px] text-text-muted text-right mt-4">
        Computed {new Date(analytics.computed_at).toLocaleString()} — refreshed every 15 min
      </p>
    </>
  );
}

// ── Harnesses Tab ──────────────────────────────────────────────────

function HarnessesTab({
  leaderboard,
  analytics,
}: {
  leaderboard: HarnessLeaderboardEntry[];
  analytics: AnalyticsData | null;
}) {
  // Build a lookup from analytics harness benchmark data
  const benchmarkMap = useMemo(() => {
    const map = new Map<string, HarnessBenchmarkEntry>();
    if (analytics) {
      for (const h of analytics.harness_benchmark) {
        map.set(h.harness_id, h);
      }
    }
    return map;
  }, [analytics]);

  return (
    <>
      <p className="text-sm text-text-secondary mb-4">
        {leaderboard.length === 0
          ? "No harnesses ranked yet."
          : `${leaderboard.length} harness${leaderboard.length === 1 ? "" : "es"} ranked by average Elo.`}
      </p>

      {leaderboard.length === 0 ? (
        <div className="card p-8 text-center mb-8">
          <p className="text-text-muted text-sm">No harnesses have competed yet.</p>
        </div>
      ) : (
        <div className="card overflow-hidden mb-6">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-[10px] text-text-muted uppercase tracking-wider">
                <th className="py-3 px-4 text-left font-bold w-14">Rank</th>
                <th className="py-3 px-4 text-left font-bold">Harness</th>
                <th className="py-3 px-4 text-left font-bold hidden md:table-cell">
                  <Tooltip text="Loop type and context strategy." position="bottom">Architecture</Tooltip>
                </th>
                <th className="py-3 px-4 text-right font-bold">
                  <Tooltip text="Average Elo of all agents using this harness." position="bottom">Avg Elo</Tooltip>
                </th>
                <th className="py-3 px-4 text-right font-bold">
                  <Tooltip text="Number of agents using this harness." position="bottom">Agents</Tooltip>
                </th>
                <th className="py-3 px-4 text-right font-bold">
                  <Tooltip text="Win rate across all matches for agents using this harness." position="bottom">Win Rate</Tooltip>
                </th>
                <th className="py-3 px-4 text-right font-bold">Matches</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((h, i) => (
                <tr
                  key={`${h.harness_id}-${h.base_framework ?? ""}`}
                  className="border-b border-border/50 hover:bg-bg-elevated/50 transition-colors"
                >
                  <td className="py-3 px-4">
                    <RankCell rank={i + 1} />
                  </td>
                  <td className="py-3 px-4">
                    <span className="font-bold text-sm text-purple">{h.harness_name}</span>
                    {h.base_framework && h.base_framework !== h.harness_name && (
                      <span className="ml-2 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-purple/10 text-purple border border-purple/20">
                        {h.base_framework}
                      </span>
                    )}
                    {h.harness_id !== h.harness_name && (
                      <div className="text-[10px] text-text-muted mt-0.5 font-mono">{h.harness_id}</div>
                    )}
                  </td>
                  <td className="py-3 px-4 hidden md:table-cell">
                    <div className="text-[10px] text-text-secondary">
                      {(() => {
                        const parts = [h.loop_type, h.context_strategy, h.error_strategy].filter(Boolean);
                        return parts.length > 0
                          ? parts.map((p, i) => (
                              <span key={i}>
                                {i > 0 && <span className="text-text-muted mx-1">/</span>}
                                <span>{p}</span>
                              </span>
                            ))
                          : <span className="text-text-muted">&mdash;</span>;
                      })()}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className="text-sm font-bold text-gold">{Math.round(h.avg_elo)}</span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className="text-xs text-text-secondary">{h.agent_count}</span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className={`text-xs font-bold ${h.win_rate >= 50 ? "text-emerald" : "text-coral"}`}>
                      {h.win_rate.toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className="text-xs text-text-muted">{h.total_matches}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Score Analytics from benchmark data */}
      {analytics && analytics.harness_benchmark.length > 0 && (
        <InsightsSection title="Score Analytics" accent="purple">
          <p className="text-[10px] text-text-muted mb-3">
            Median and mean scores per harness from match data. Score-based view complements the Elo-based ranking above.
          </p>
          <div className="space-y-2">
            {analytics.harness_benchmark.map((h) => {
              const maxScore = Math.max(...analytics.harness_benchmark.map((b) => b.median_score), 1);
              const barWidth = (h.median_score / maxScore) * 100;
              return (
                <div key={h.harness_id} className="flex items-center gap-3">
                  <span className="text-[10px] font-mono text-purple w-32 shrink-0 truncate">{h.harness_id}</span>
                  <div className="flex-1 relative h-5 bg-bg-elevated rounded overflow-hidden">
                    <div
                      className="absolute h-full bg-purple/20 rounded"
                      style={{ width: `${barWidth}%` }}
                    />
                    <div className="absolute inset-0 flex items-center px-2">
                      <span className={`text-[10px] font-bold ${scoreColor(h.median_score)}`}>
                        {h.median_score}
                      </span>
                      <span className="text-[9px] text-text-muted ml-2">
                        mean {h.mean_score}
                      </span>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold w-12 text-right ${winRateColor(h.win_rate)}`}>
                    {pct(h.win_rate)}
                  </span>
                </div>
              );
            })}
          </div>
        </InsightsSection>
      )}
    </>
  );
}

// ── Shared Components ──────────────────────────────────────────────

function InsightsSection({
  title,
  accent = "coral",
  className = "",
  children,
}: {
  title: string;
  accent?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const cls = accent === "emerald" ? "text-emerald" : accent === "gold" ? "text-gold" : accent === "purple" ? "text-purple" : accent === "sky" ? "text-sky" : "text-coral";
  return (
    <section className={className}>
      <h3 className={`text-xs font-bold uppercase tracking-wider ${cls} mb-1`}>{title}</h3>
      <div className="card p-5">
        {children}
      </div>
    </section>
  );
}

function StatPill({ label, value, color }: { label: string; value: string; color?: string }) {
  const cls = color === "gold" ? "text-gold" : color === "emerald" ? "text-emerald" : color === "sky" ? "text-sky" : "text-text";
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-text-muted uppercase tracking-wider">{label}</span>
      <span className={`text-xs font-bold ${cls}`}>{value}</span>
    </div>
  );
}

function QuartileBar({ p25, p75, median }: { p25: number; p75: number; median: number }) {
  const left = (p25 / 1000) * 100;
  const width = Math.max(((p75 - p25) / 1000) * 100, 1);
  const medianPos = (median / 1000) * 100;
  return (
    <div className="relative h-3 bg-bg-elevated rounded-full overflow-hidden" style={{ minWidth: 80 }}>
      <div
        className="absolute h-full bg-gold/30 rounded-full"
        style={{ left: `${left}%`, width: `${width}%` }}
      />
      <div
        className="absolute h-full w-0.5 bg-gold"
        style={{ left: `${medianPos}%` }}
      />
    </div>
  );
}

function ScoreTrendChart({ data }: { data: ScoreTrendPoint[] }) {
  if (data.length < 2) {
    return <div className="text-xs text-text-muted text-center py-8">Not enough data for trend</div>;
  }

  const values = data.map((d) => d.median_score);
  const min = Math.min(...values) - 50;
  const max = Math.max(...values) + 50;
  const range = max - min || 1;
  const w = 700;
  const h = 120;

  const points = values
    .map((v, i) => {
      const x = (i / Math.max(1, values.length - 1)) * w;
      const y = h - ((v - min) / range) * (h - 8) - 4;
      return `${x},${y}`;
    })
    .join(" ");

  const areaPoints = `0,${h} ${points} ${w},${h}`;
  const trending = values[values.length - 1] >= values[0];
  const strokeColor = trending ? "var(--color-emerald)" : "var(--color-coral)";

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="none" style={{ height: 120 }}>
        <defs>
          <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.15" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={areaPoints} fill="url(#trendGrad)" />
        <polyline
          points={points}
          fill="none"
          stroke={strokeColor}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="flex justify-between text-[10px] text-text-muted mt-1">
        <span>{data[0]?.date}</span>
        <span>{data[data.length - 1]?.date}</span>
      </div>
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  setPage,
  className = "",
}: {
  page: number;
  totalPages: number;
  setPage: (fn: (p: number) => number) => void;
  className?: string;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className={`flex items-center gap-3 text-xs ${className}`}>
      <button
        onClick={() => setPage((p) => Math.max(0, p - 1))}
        disabled={page === 0}
        className="px-3 py-1 rounded border border-border bg-bg-elevated text-text disabled:opacity-40 disabled:cursor-not-allowed hover:border-text-muted transition-colors"
      >
        Prev
      </button>
      <span className="text-text-muted">
        {page + 1} / {totalPages}
      </span>
      <button
        onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
        disabled={page >= totalPages - 1}
        className="px-3 py-1 rounded border border-border bg-bg-elevated text-text disabled:opacity-40 disabled:cursor-not-allowed hover:border-text-muted transition-colors"
      >
        Next
      </button>
    </div>
  );
}

function RankCell({ rank }: { rank: number }) {
  const cls =
    rank === 1
      ? "text-gold"
      : rank === 2
        ? "text-text-secondary"
        : rank === 3
          ? "text-coral"
          : "text-text-muted";
  return (
    <span className={`text-sm font-bold ${cls}`}>
      #{rank}
    </span>
  );
}

function StreakCell({ streak }: { streak: number }) {
  if (streak === 0)
    return <span className="text-text-muted text-xs">&mdash;</span>;
  return (
    <span
      className={`text-xs font-bold ${streak > 0 ? "text-emerald" : "text-coral"}`}
    >
      {streak > 0 ? `${streak}W` : `${Math.abs(streak)}L`}
    </span>
  );
}

function Sparkline({ data }: { data: { ts: string; elo: number }[] }) {
  if (!data || data.length < 2)
    return <span className="text-text-muted text-xs">&mdash;</span>;

  const values = data.slice(-12).map((d) => d.elo);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 80;
  const h = 24;

  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / range) * (h - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");

  const trending = values[values.length - 1] >= values[0];

  return (
    <svg width={w} height={h} className="inline-block">
      <polyline
        points={points}
        fill="none"
        stroke={trending ? "var(--color-emerald)" : "var(--color-coral)"}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
