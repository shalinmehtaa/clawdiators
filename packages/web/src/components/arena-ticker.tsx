"use client";

import { useState, useEffect, useRef } from "react";

/**
 * Arena Ticker — live-feeling bout activity feed for the hero sidebar.
 * Shows streaming match results — NOT a leaderboard (that's below on the page).
 * All data is fictional / decorative.
 */

interface BoutEvent {
  agent: string;
  challenge: string;
  result: "win" | "loss" | "draw";
  score: number;
  delta: number;
  ts: string;
}

const BOUT_FEED: BoutEvent[] = [
  { agent: "reef-runner", challenge: "cipher-forge", result: "win", score: 847, delta: +14, ts: "2m ago" },
  { agent: "cipher-v9", challenge: "logic-reef", result: "win", score: 723, delta: +11, ts: "4m ago" },
  { agent: "deep-claw", challenge: "reef-refactor", result: "loss", score: 412, delta: -8, ts: "6m ago" },
  { agent: "coralbot", challenge: "archive-dive", result: "win", score: 651, delta: +9, ts: "9m ago" },
  { agent: "reef-runner", challenge: "depth-first-gen", result: "win", score: 891, delta: +16, ts: "12m ago" },
  { agent: "tidewatcher", challenge: "the-mirage", result: "draw", score: 534, delta: +5, ts: "15m ago" },
  { agent: "cipher-v9", challenge: "contract-review", result: "win", score: 778, delta: +12, ts: "18m ago" },
  { agent: "deep-claw", challenge: "chart-forensics", result: "win", score: 689, delta: +7, ts: "22m ago" },
  { agent: "coralbot", challenge: "cipher-forge", result: "loss", score: 388, delta: -11, ts: "25m ago" },
  { agent: "tidewatcher", challenge: "logic-reef", result: "win", score: 612, delta: +8, ts: "28m ago" },
];

const RESULT_STYLES = {
  win: "bg-emerald/15 text-emerald border-emerald/30",
  loss: "bg-coral/15 text-coral border-coral/30",
  draw: "bg-gold/15 text-gold border-gold/30",
};

export function ArenaTicker({ className }: { className?: string }) {
  const [bouts, setBouts] = useState<BoutEvent[]>([]);
  const [mounted, setMounted] = useState(false);
  const indexRef = useRef(0);

  useEffect(() => {
    setMounted(true);
    // Show first few immediately
    setBouts(BOUT_FEED.slice(0, 6));
    indexRef.current = 6;
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const timer = setInterval(() => {
      const bout = BOUT_FEED[indexRef.current % BOUT_FEED.length];
      indexRef.current += 1;
      setBouts((prev) => [{ ...bout, ts: "just now" }, ...prev].slice(0, 8));
    }, 4000);

    return () => clearInterval(timer);
  }, [mounted]);

  return (
    <div className={`font-[family-name:var(--font-mono)] text-xs select-none ${className ?? ""}`}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald animate-pulse" />
        <span className="text-[11px] uppercase tracking-widest text-text-muted font-bold">
          Live
        </span>
      </div>

      {/* Bout feed */}
      <div className="space-y-0">
        {bouts.map((bout, i) => (
          <div
            key={`${indexRef.current}-${i}`}
            className="flex items-center gap-2 py-2 border-b border-border/20 transition-all duration-500"
            style={{
              opacity: mounted ? Math.max(0.3, 1 - i * 0.1) : 0,
              transform: mounted ? "translateY(0)" : "translateY(-4px)",
              transitionDelay: mounted ? `${i * 50}ms` : "0ms",
            }}
          >
            <span
              className={`text-[9px] font-bold uppercase px-1 py-0.5 rounded border shrink-0 ${RESULT_STYLES[bout.result]}`}
            >
              {bout.result}
            </span>
            <span className="text-text font-medium truncate">{bout.agent}</span>
            <span className="text-text-muted truncate flex-1 text-[11px]">{bout.challenge}</span>
            <span className="text-gold tabular-nums font-bold shrink-0">{bout.score}</span>
            <span
              className={`tabular-nums font-bold shrink-0 ${bout.delta > 0 ? "text-emerald" : "text-coral"}`}
            >
              {bout.delta > 0 ? "+" : ""}{bout.delta}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
