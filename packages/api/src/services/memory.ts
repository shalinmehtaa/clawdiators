/**
 * Layered Memory System — server-side services.
 *
 * Layer 1: Agent Global Memory (agents.memory) — agent-written, refined shape
 * Layer 2: Challenge Memory (challenge_memory) — auto-computed + agent-written
 * Layer 3: Harness Lineage (agents.harness_lineage) — auto-computed from verified matches
 * Layer 4: Ephemeral Match Context — injected into CHALLENGE.md at workspace download time
 */

import { eq, and } from "drizzle-orm";
import { db, challengeMemory } from "@clawdiators/db";
import type { ScoreBreakdown, ChallengeMemory } from "@clawdiators/shared";

// ── Score Trend Algorithm ────────────────────────────────────────────

/**
 * Compute score trend from the rolling window of recent scores.
 * "improving" = each score >= previous across last 3
 * "plateau"   = spread <= 50 pts across last 3
 * "declining" = each score <= previous across last 3
 * null        = fewer than 2 scores
 */
export function computeScoreTrend(
  recentScores: number[],
): "improving" | "plateau" | "declining" | null {
  if (recentScores.length < 2) return null;

  const window = recentScores.slice(-3);
  if (window.length < 2) return null;

  const spread = Math.max(...window) - Math.min(...window);

  // Plateau takes precedence — small variance means stagnation
  if (spread <= 50) return "plateau";

  let allImproving = true;
  let allDeclining = true;
  for (let i = 1; i < window.length; i++) {
    if (window[i] < window[i - 1]) allImproving = false;
    if (window[i] > window[i - 1]) allDeclining = false;
  }

  if (allImproving) return "improving";
  if (allDeclining) return "declining";
  return "plateau"; // default for mixed movement with high spread
}

// ── Challenge Memory (Layer 2) ────────────────────────────────────────

interface UpsertChallengeMemoryInput {
  score: number;
  breakdown: ScoreBreakdown;
  matchId: string;
  now: Date;
}

/**
 * Auto-update challenge memory after a match completes.
 * Idempotent: creates row if not exists, updates factual fields.
 */
export async function upsertChallengeMemory(
  agentId: string,
  challengeSlug: string,
  input: UpsertChallengeMemoryInput,
): Promise<void> {
  const { score, breakdown, matchId, now } = input;

  const existing = await db.query.challengeMemory.findFirst({
    where: and(
      eq(challengeMemory.agentId, agentId),
      eq(challengeMemory.challengeSlug, challengeSlug),
    ),
  });

  if (!existing) {
    await db.insert(challengeMemory).values({
      agentId,
      challengeSlug,
      attemptCount: 1,
      bestScore: score,
      avgScore: score,
      lastAttemptedAt: now,
      scoreTrend: null,
      bestScoreBreakdown: breakdown,
      bestMatchId: matchId,
      recentScores: [score],
      notes: null,
      strategies: [],
    });
    return;
  }

  const newAttemptCount = existing.attemptCount + 1;
  const newBestScore = Math.max(existing.bestScore ?? 0, score);
  const isBest = score >= (existing.bestScore ?? 0);

  // Rolling average
  const newAvgScore =
    ((existing.avgScore ?? score) * existing.attemptCount + score) /
    newAttemptCount;

  // Maintain rolling window of last 3 scores
  const prevRecent = (existing.recentScores as number[]) ?? [];
  const newRecentScores = [...prevRecent, score].slice(-3);
  const newTrend = computeScoreTrend(newRecentScores);

  await db
    .update(challengeMemory)
    .set({
      attemptCount: newAttemptCount,
      bestScore: newBestScore,
      avgScore: newAvgScore,
      lastAttemptedAt: now,
      scoreTrend: newTrend,
      bestScoreBreakdown: isBest ? breakdown : existing.bestScoreBreakdown,
      bestMatchId: isBest ? matchId : existing.bestMatchId,
      recentScores: newRecentScores,
      updatedAt: now,
    })
    .where(
      and(
        eq(challengeMemory.agentId, agentId),
        eq(challengeMemory.challengeSlug, challengeSlug),
      ),
    );
}

// ── Memory Block Formatting (Layer 4) ────────────────────────────────

interface AnalyticsSummary {
  median_score: number | null;
  win_rate: number;
  score_by_attempt: Record<string, { mean: number }>;
}

/**
 * Format the {{memory}} injection block for CHALLENGE.md.
 * Returns empty string if memoryless (caller should suppress).
 */
export function formatMemoryBlock(
  challengeMemoryData: ChallengeMemory | null,
  analytics: AnalyticsSummary | null,
): string {
  const lines: string[] = ["## Memory", ""];

  // Your History section
  lines.push("### Your History on This Challenge");
  if (!challengeMemoryData || challengeMemoryData.attempt_count === 0) {
    lines.push("_No prior attempts on this challenge._");
  } else {
    const { attempt_count, best_score, score_trend, best_score_breakdown, notes } =
      challengeMemoryData;

    const trendArrow =
      score_trend === "improving"
        ? "↑ improving"
        : score_trend === "declining"
          ? "↓ declining"
          : score_trend === "plateau"
            ? "→ plateau"
            : "";

    const scorePart =
      best_score !== null ? `**Best score**: ${best_score}` : "";
    const trendPart = trendArrow ? `**Trend**: ${trendArrow}` : "";

    const statParts = [`**Attempts**: ${attempt_count}`, scorePart, trendPart].filter(Boolean);
    lines.push(`- ${statParts.join(" | ")}`);

    if (best_score_breakdown) {
      const dims = Object.entries(best_score_breakdown)
        .filter(([k]) => k !== "total")
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ");
      if (dims) lines.push(`- **Best breakdown**: ${dims}`);
    }

    if (notes) {
      lines.push(`- **Your notes**: "${notes}"`);
    }
  }

  lines.push("");

  // Arena Intelligence section
  lines.push("### Arena Intelligence");
  if (!analytics || analytics.median_score === null) {
    lines.push("_No arena data yet for this challenge._");
  } else {
    const winPct = Math.round(analytics.win_rate * 100);
    lines.push(
      `- **Median score**: ${analytics.median_score} | **Win rate**: ${winPct}%`,
    );

    const byAttempt = analytics.score_by_attempt;
    const attempt2 = byAttempt["2"];
    const attempt3 = byAttempt["3"];
    if (attempt2 || attempt3) {
      const refAttempt = attempt3 ?? attempt2;
      const refN = attempt3 ? 3 : 2;
      const firstAttempt = byAttempt["1"];
      if (firstAttempt) {
        lines.push(
          `- **Agents on ${refN}+ attempts average ${Math.round(refAttempt.mean)}** vs ${Math.round(firstAttempt.mean)} on first attempt`,
        );
      }
    }
  }

  lines.push("");
  return lines.join("\n");
}
