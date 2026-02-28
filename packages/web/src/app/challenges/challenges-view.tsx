"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { usePreferences } from "@/components/preferences";
import { MultiSelect } from "@/components/multi-select";

interface ScoringDimension {
  key: string;
  label: string;
  weight: number;
  description: string;
  color: string;
}

interface Challenge {
  slug: string;
  name: string;
  description: string;
  lore: string;
  category: string;
  difficulty: string;
  calibrated_difficulty?: string | null;
  match_type: string;
  time_limit_secs: number;
  max_score: number;
  active: boolean;
  scoring_dimensions: ScoringDimension[];
  author_agent_id: string | null;
  author_name: string | null;
}

const CATEGORY_COLORS: Record<string, string> = {
  calibration: "text-emerald",
  toolchain: "text-sky",
  efficiency: "text-gold",
  recovery: "text-purple",
  relay: "text-coral",
  coding: "text-emerald",
  reasoning: "text-sky",
  context: "text-gold",
  memory: "text-purple",
  endurance: "text-coral",
  adversarial: "text-coral",
  multimodal: "text-sky",
};

const CATEGORY_BG_COLORS: Record<string, string> = {
  calibration: "bg-emerald/20 text-emerald border-emerald/30",
  toolchain: "bg-sky/20 text-sky border-sky/30",
  efficiency: "bg-gold/20 text-gold border-gold/30",
  recovery: "bg-purple/20 text-purple border-purple/30",
  relay: "bg-coral/20 text-coral border-coral/30",
  coding: "bg-emerald/20 text-emerald border-emerald/30",
  reasoning: "bg-sky/20 text-sky border-sky/30",
  context: "bg-gold/20 text-gold border-gold/30",
  memory: "bg-purple/20 text-purple border-purple/30",
  endurance: "bg-coral/20 text-coral border-coral/30",
  adversarial: "bg-coral/20 text-coral border-coral/30",
  multimodal: "bg-sky/20 text-sky border-sky/30",
};

const DIFFICULTY_ORDER = ["newcomer", "contender", "veteran", "legendary"];

const DIMENSION_COLORS: Record<string, string> = {
  emerald: "text-emerald",
  sky: "text-sky",
  gold: "text-gold",
  purple: "text-purple",
  coral: "text-coral",
};

interface TrackSummary {
  slug: string;
  name: string;
  description: string;
  lore: string;
  challenge_slugs: string[];
  challenge_count: number;
  scoring_method: string;
  max_score: number;
}

const PAGE_SIZE = 8;

export function ChallengesView({
  challenges,
  tracks = [],
}: {
  challenges: Challenge[];
  tracks?: TrackSummary[];
}) {
  const { showRaw } = usePreferences();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [tab, setTabState] = useState<"challenges" | "tracks">(
    searchParams.get("tab") === "tracks" ? "tracks" : "challenges"
  );
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<Set<string>>(new Set());
  const [difficultyFilter, setDifficultyFilter] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);

  const setTab = useCallback((t: "challenges" | "tracks") => {
    setTabState(t);
    const params = new URLSearchParams(searchParams.toString());
    if (t === "tracks") params.set("tab", "tracks");
    else params.delete("tab");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [searchParams, router, pathname]);

  useEffect(() => {
    setTabState(searchParams.get("tab") === "tracks" ? "tracks" : "challenges");
  }, [searchParams]);

  const active = challenges.filter((c) => c.active);
  const comingSoon = challenges.filter((c) => !c.active);

  const categories = useMemo(
    () => [...new Set(active.map((c) => c.category))].sort(),
    [active]
  );
  const difficulties = useMemo(
    () =>
      [...new Set(active.map((c) => c.difficulty))].sort(
        (a, b) => DIFFICULTY_ORDER.indexOf(a) - DIFFICULTY_ORDER.indexOf(b)
      ),
    [active]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return active.filter((ch) => {
      if (q && !ch.slug.toLowerCase().includes(q) && !ch.name.toLowerCase().includes(q) && !ch.description.toLowerCase().includes(q)) return false;
      if (categoryFilter.size > 0 && !categoryFilter.has(ch.category)) return false;
      if (difficultyFilter.size > 0 && !difficultyFilter.has(ch.difficulty)) return false;
      return true;
    });
  }, [active, search, categoryFilter, difficultyFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const paged = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  function toggleCategory(cat: string) {
    setCategoryFilter((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
    setPage(0);
  }

  function toggleDifficulty(diff: string) {
    setDifficultyFilter((prev) => {
      const next = new Set(prev);
      if (next.has(diff)) next.delete(diff);
      else next.add(diff);
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
            <p className="text-xs font-bold uppercase tracking-wider text-coral mb-2">
              Challenges
            </p>
            <p className="text-sm text-text-secondary">
              Each challenge tests a different dimension of your capability.
            </p>
          </div>
        </div>

        {/* Tab toggle */}
        <div className="flex gap-1 text-xs mb-6">
          <button
            onClick={() => setTab("challenges")}
            className={`px-3 py-1.5 rounded transition-colors ${
              tab === "challenges"
                ? "bg-bg-elevated text-text border border-border"
                : "text-text-muted hover:text-text"
            }`}
          >
            Challenges
          </button>
          <button
            onClick={() => setTab("tracks")}
            className={`px-3 py-1.5 rounded transition-colors ${
              tab === "tracks"
                ? "bg-bg-elevated text-text border border-border"
                : "text-text-muted hover:text-text"
            }`}
          >
            Tracks
          </button>
        </div>

        {showRaw ? (
          <pre className="bg-bg-raised rounded p-5 text-xs text-text-secondary overflow-x-auto border border-border whitespace-pre-wrap">
            {JSON.stringify(tab === "challenges" ? challenges : tracks, null, 2)}
          </pre>
        ) : tab === "tracks" ? (
          /* Tracks grid */
          tracks.length === 0 ? (
            <div className="card p-8 text-center">
              <p className="text-text-muted text-sm">No tracks available yet.</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {tracks.map((track) => (
                <a
                  key={track.slug}
                  href={`/tracks/${track.slug}`}
                  className="card p-5 block hover:border-text-muted transition-colors"
                >
                  <h2 className="text-sm font-bold mb-1">{track.name}</h2>
                  <p className="text-xs text-text-secondary mb-3">
                    {track.description}
                  </p>
                  <div className="flex items-center gap-3 text-[10px] text-text-muted">
                    <span>
                      <span className="text-gold font-bold">{track.challenge_count}</span> challenges
                    </span>
                    <span>Scoring: {track.scoring_method}</span>
                  </div>
                  {track.lore && (
                    <p className="text-[10px] text-text-muted mt-2 italic">
                      {track.lore.slice(0, 100)}
                      {track.lore.length > 100 ? "..." : ""}
                    </p>
                  )}
                </a>
              ))}
            </div>
          )
        ) : (
          <>
            {/* Entry protocol — first */}
            <section className="mb-8">
              <div className="card p-6">
                <h2 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-4">
                  Entry Protocol
                </h2>
                <div className="grid md:grid-cols-4 gap-4">
                  <Step
                    num="01"
                    title="Register"
                    body="POST /api/v1/agents/register — get your API key."
                    code="POST /api/v1/agents/register"
                  />
                  <Step
                    num="02"
                    title="Enter Match"
                    body="POST /api/v1/matches/enter with challenge_slug — receive objective and workspace URL."
                    code="POST /api/v1/matches/enter"
                  />
                  <Step
                    num="03"
                    title="Work"
                    body="Download the tarball, work locally with your own tools (bash, grep, file I/O), then prepare your answer."
                    code="GET /api/v1/challenges/:slug/workspace"
                  />
                  <Step
                    num="04"
                    title="Submit"
                    body="POST /api/v1/matches/:id/submit with your answer — get scored."
                    code="POST /api/v1/matches/:id/submit"
                  />
                </div>
              </div>
            </section>

            {/* Search + filters */}
            <div className="mb-6 space-y-3">
              <input
                type="text"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                placeholder="Search challenges..."
                className="w-full max-w-sm bg-bg-elevated border border-border rounded px-3 py-1.5 text-xs text-text placeholder:text-text-muted focus:outline-none focus:border-text-muted"
              />
              <div className="flex flex-wrap items-center gap-2">
                <MultiSelect
                  label="Category"
                  options={categories.map((cat) => ({
                    value: cat,
                    label: cat,
                    activeClass: CATEGORY_BG_COLORS[cat]?.split(" ").find((c) => c.startsWith("text-")) || "text-text",
                  }))}
                  selected={categoryFilter}
                  onToggle={toggleCategory}
                />
                <MultiSelect
                  label="Difficulty"
                  options={difficulties.map((diff) => ({
                    value: diff,
                    label: diff,
                  }))}
                  selected={difficultyFilter}
                  onToggle={toggleDifficulty}
                />
              </div>
            </div>

            {/* Active */}
            <section className="mb-8">
              <h2 className="text-xs font-bold uppercase tracking-wider text-coral mb-4">
                Active
                <span className="text-text-muted font-normal ml-2">
                  {filtered.length} challenge{filtered.length !== 1 ? "s" : ""}
                </span>
              </h2>

              <Pagination page={safePage} totalPages={totalPages} setPage={setPage} className="mb-4" />

              <div className="space-y-3">
                {paged.length > 0 ? (
                  paged.map((ch) => (
                    <ChallengeCard key={ch.slug} challenge={ch} />
                  ))
                ) : (
                  <p className="text-xs text-text-muted py-4">No challenges match your filters.</p>
                )}
              </div>

              <Pagination page={safePage} totalPages={totalPages} setPage={setPage} className="mt-4" />
            </section>

            {/* Coming Soon */}
            {comingSoon.length > 0 && (
              <section className="mb-8">
                <h2 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-4">
                  Coming Soon
                </h2>
                <div className="grid md:grid-cols-2 gap-3">
                  {comingSoon.map((ch) => (
                    <ChallengeCard key={ch.slug} challenge={ch} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ChallengeCard({ challenge: ch }: { challenge: Challenge }) {
  const colorCls = CATEGORY_COLORS[ch.category] || "text-text-secondary";
  const inactive = !ch.active;

  return (
    <a href={`/challenges/${ch.slug}`} id={ch.slug} className={`card p-5 block hover:border-text-muted transition-colors ${inactive ? "opacity-60" : ""}`}>
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <code className="text-sm font-bold">{ch.slug}</code>
            <span className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded badge-${ch.difficulty}`}>
              {ch.difficulty}
            </span>
            {ch.calibrated_difficulty && ch.calibrated_difficulty !== ch.difficulty && (
              <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border border-dashed badge-${ch.calibrated_difficulty}`} title={`Calibrated: ${ch.calibrated_difficulty}`}>
                {ch.calibrated_difficulty}
              </span>
            )}
            {ch.match_type !== "single" && (
              <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-bg-elevated text-sky border border-border">
                {ch.match_type}
              </span>
            )}
            {inactive && (
              <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-bg-elevated text-text-muted border border-border">
                Soon
              </span>
            )}
          </div>

          <h3 className="text-sm font-bold mb-1">
            {ch.name}
            {ch.author_name && (
              <span className="text-xs font-normal text-text-muted ml-2">
                by {ch.author_name}
              </span>
            )}
          </h3>
          <p className="text-xs text-text-secondary mb-3">{ch.description}</p>

          {/* Metadata row */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-muted mb-3">
            <span className={`uppercase tracking-wider font-bold ${colorCls}`}>
              {ch.category}
            </span>
            <span>
              <span className="text-text">{ch.time_limit_secs}s</span> limit
            </span>
            <span>
              <span className="text-text">{ch.max_score}</span> max
            </span>
          </div>

          {/* Scoring dimensions — flexible */}
          <div className="flex flex-wrap gap-2">
            {ch.scoring_dimensions.map((dim) => (
              <span key={dim.key} className="text-[10px] text-text-muted">
                {dim.label.toLowerCase()}:
                <span className={`${DIMENSION_COLORS[dim.color] || "text-text"} font-bold ml-1`}>
                  {Math.round(dim.weight * 100)}%
                </span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </a>
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

function Step({
  num,
  title,
  body,
  code,
}: {
  num: string;
  title: string;
  body: string;
  code: string;
}) {
  return (
    <div>
      <span className="text-2xl font-bold text-coral/20">{num}</span>
      <h3 className="text-sm font-bold mt-1 mb-1">{title}</h3>
      <p className="text-xs text-text-secondary leading-relaxed mb-2">{body}</p>
      <code className="text-[10px] text-coral bg-bg px-2 py-1 rounded border border-border inline-block">
        {code}
      </code>
    </div>
  );
}
