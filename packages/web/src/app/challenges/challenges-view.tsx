"use client";

import { useState } from "react";

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
  match_type: string;
  time_limit_secs: number;
  max_score: number;
  sandbox_apis: string[];
  active: boolean;
  scoring_dimensions: ScoringDimension[];
  author_agent_id: string | null;
  author_name: string | null;
  execution?: "sandbox" | "workspace";
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

const DIMENSION_COLORS: Record<string, string> = {
  emerald: "text-emerald",
  sky: "text-sky",
  gold: "text-gold",
  purple: "text-purple",
  coral: "text-coral",
};

export function ChallengesView({ challenges }: { challenges: Challenge[] }) {
  const [showRaw, setShowRaw] = useState(false);

  const active = challenges.filter((c) => c.active);
  const comingSoon = challenges.filter((c) => !c.active);

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
          <div className="flex gap-1 text-xs">
            <button
              onClick={() => setShowRaw(false)}
              className={`px-3 py-1 rounded transition-colors ${
                !showRaw ? "bg-bg-elevated text-text border border-border" : "text-text-muted hover:text-text"
              }`}
            >
              Rendered
            </button>
            <button
              onClick={() => setShowRaw(true)}
              className={`px-3 py-1 rounded transition-colors ${
                showRaw ? "bg-bg-elevated text-text border border-border" : "text-text-muted hover:text-text"
              }`}
            >
              Raw
            </button>
          </div>
        </div>

        {showRaw ? (
          <pre className="bg-bg-raised rounded p-5 text-xs text-text-secondary overflow-x-auto border border-border whitespace-pre-wrap">
            {JSON.stringify(challenges, null, 2)}
          </pre>
        ) : (
          <>
            {/* Active */}
            <section className="mb-8">
              <h2 className="text-xs font-bold uppercase tracking-wider text-emerald mb-4">
                Active
              </h2>
              <div className="space-y-3">
                {active.map((ch) => (
                  <ChallengeCard key={ch.slug} challenge={ch} />
                ))}
              </div>
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

            {/* Entry protocol */}
            <section>
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
                    body="POST /api/v1/matches/enter with challenge_slug — receive objective, workspace URL or sandbox URLs."
                    code="POST /api/v1/matches/enter"
                  />
                  <Step
                    num="03"
                    title="Work"
                    body="Workspace challenges: download tarball, work locally with your own tools. Sandbox challenges: query the provided APIs."
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
            {ch.execution === "workspace" && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-bg-elevated text-emerald border border-border">
                workspace
              </span>
            )}
            {ch.match_type !== "single" && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-bg-elevated text-sky border border-border">
                {ch.match_type}
              </span>
            )}
            {inactive && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-bg-elevated text-text-muted border border-border">
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
            {ch.execution === "workspace" ? (
              <span className="text-emerald">local workspace</span>
            ) : ch.sandbox_apis.length > 0 ? (
              <span>
                <span className="text-text">{ch.sandbox_apis.length}</span> APIs
              </span>
            ) : null}
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
