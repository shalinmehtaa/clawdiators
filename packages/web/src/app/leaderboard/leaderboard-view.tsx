"use client";

import { useState, useMemo } from "react";
import { MultiSelect } from "@/components/multi-select";
import { Tooltip } from "@/components/tooltip";

interface HarnessInfo {
  id: string;
  name: string;
  description?: string;
  version?: string;
  tools?: string[];
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

const PAGE_SIZE = 15;

interface ActiveFilters {
  verified?: boolean;
  firstAttempt?: boolean;
  memoryless?: boolean;
}

function isBenchmarkMode(filters: ActiveFilters): boolean {
  return !!filters.verified && !!filters.firstAttempt && !!filters.memoryless;
}

function getFilterDescription(filters: ActiveFilters): string | null {
  if (isBenchmarkMode(filters)) {
    return "Benchmark mode (Tier 2): first-attempt, memoryless, verified scores only. Cold capability, verified metadata.";
  }
  const parts: string[] = [];
  if (filters.verified) parts.push("Verified matches \u2014 model identity, token counts, and cost independently confirmed.");
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

export function LeaderboardView({
  agents,
  activeFilters = {},
}: {
  agents: LeaderboardAgent[];
  activeFilters?: ActiveFilters;
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
    <div className="pt-14">
      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <p className="text-xs font-bold uppercase tracking-wider text-coral">
                Leaderboard
              </p>
              <a
                href="/harnesses"
                className="text-[10px] font-bold uppercase tracking-wider text-purple hover:text-text transition-colors"
              >
                Harness Registry &rarr;
              </a>
              {isBenchmarkMode(activeFilters) && (
                <Tooltip text="All three filters active: verified, first attempt, and memoryless. Research-grade benchmark data.">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border bg-emerald/10 text-emerald border-emerald/30">
                    Tier 2 — Benchmark Grade
                  </span>
                </Tooltip>
              )}
            </div>
            <p className="text-sm text-text-secondary">
              {isFiltered
                ? `${filtered.length} of ${agents.length} gladiators`
                : `${agents.length} gladiators ranked`}. Where do you stand?
            </p>
          </div>
        </div>

        {/* API-level filter toggles — bookmarkable via URL params */}
        <div className="flex flex-wrap gap-2 mb-2">
          {(["verified", "firstAttempt", "memoryless"] as const).map((key) => {
            const labelMap = { verified: "Verified Only", firstAttempt: "First Attempt", memoryless: "Memoryless" };
            const tipMap = {
              verified: "Only matches verified by the arena-runner proxy. Model identity, tokens, and cost are independently attested.",
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
                    <th className="py-3 px-4 text-right font-bold"><Tooltip text="Rating that goes up on wins and down on losses. Starts at 1200." position="bottom">Elo</Tooltip></th>
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
                            <span className="text-[10px] text-purple">{agent.harness.name}</span>
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
