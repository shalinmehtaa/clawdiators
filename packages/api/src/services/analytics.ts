import { eq, and, sql, desc } from "drizzle-orm";
import { db, matches, challengeAnalytics, modelPricing } from "@clawdiators/db";
import type { BenchmarkMetrics } from "@clawdiators/shared";

export function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

export async function computeChallengeAnalytics(challengeId: string) {
  // Get all completed matches for this challenge
  const allMatches = await db.query.matches.findMany({
    where: and(
      eq(matches.challengeId, challengeId),
      eq(matches.status, "completed"),
    ),
    orderBy: desc(matches.completedAt),
  });

  const totalAttempts = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(matches)
    .where(eq(matches.challengeId, challengeId));

  const total = totalAttempts[0]?.count ?? 0;
  const completed = allMatches.length;
  const completionRate = total > 0 ? completed / total : 0;

  // Score stats
  const scores = allMatches
    .map((m) => m.score)
    .filter((s): s is number => s !== null)
    .sort((a, b) => a - b);

  const medianScore = scores.length > 0 ? median(scores) : null;
  const meanScore = scores.length > 0
    ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
    : null;
  const scoreP25 = scores.length > 0 ? percentile(scores, 25) : null;
  const scoreP75 = scores.length > 0 ? percentile(scores, 75) : null;

  // Win stats
  const wins = allMatches.filter((m) => m.result === "win").length;
  const winRate = completed > 0 ? wins / completed : 0;

  // Duration stats
  const durations = allMatches
    .map((m) => {
      if (m.submittedAt && m.startedAt) {
        return (m.submittedAt.getTime() - m.startedAt.getTime()) / 1000;
      }
      return null;
    })
    .filter((d): d is number => d !== null);
  const avgDurationSecs = durations.length > 0
    ? Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) * 10) / 10
    : null;

  // Score distribution (buckets of 100)
  const buckets: Record<string, number> = {};
  for (const s of scores) {
    const bucket = `${Math.floor(s / 100) * 100}-${Math.floor(s / 100) * 100 + 99}`;
    buckets[bucket] = (buckets[bucket] || 0) + 1;
  }
  const scoreDistribution = Object.entries(buckets)
    .map(([bucket, count]) => ({ bucket, count }))
    .sort((a, b) => a.bucket.localeCompare(b.bucket));

  // Score by harness
  const scoreByHarness: Record<string, { mean: number; median: number; count: number }> = {};
  const byHarness: Record<string, number[]> = {};
  for (const m of allMatches) {
    const hId = m.harnessId ?? (m.submissionMetadata as any)?.harness_id;
    if (hId && m.score !== null) {
      if (!byHarness[hId]) byHarness[hId] = [];
      byHarness[hId].push(m.score);
    }
  }
  for (const [hId, hScores] of Object.entries(byHarness)) {
    const sorted = [...hScores].sort((a, b) => a - b);
    scoreByHarness[hId] = {
      mean: Math.round((sorted.reduce((a, b) => a + b, 0) / sorted.length) * 10) / 10,
      median: median(sorted),
      count: sorted.length,
    };
  }

  // Score by model
  const scoreByModel: Record<string, { mean: number; median: number; count: number }> = {};
  const byModel: Record<string, number[]> = {};
  for (const m of allMatches) {
    const modelId = (m.submissionMetadata as any)?.model_id;
    if (modelId && m.score !== null) {
      if (!byModel[modelId]) byModel[modelId] = [];
      byModel[modelId].push(m.score);
    }
  }
  for (const [modelId, mScores] of Object.entries(byModel)) {
    const sorted = [...mScores].sort((a, b) => a - b);
    scoreByModel[modelId] = {
      mean: Math.round((sorted.reduce((a, b) => a + b, 0) / sorted.length) * 10) / 10,
      median: median(sorted),
      count: sorted.length,
    };
  }

  // Score trend (by day)
  const byDay: Record<string, number[]> = {};
  for (const m of allMatches) {
    if (m.completedAt && m.score !== null) {
      const day = m.completedAt.toISOString().slice(0, 10);
      if (!byDay[day]) byDay[day] = [];
      byDay[day].push(m.score);
    }
  }
  const scoreTrend = Object.entries(byDay)
    .map(([date, dayScores]) => ({
      date,
      mean_score: Math.round((dayScores.reduce((a, b) => a + b, 0) / dayScores.length) * 10) / 10,
      count: dayScores.length,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // ── Benchmark Metrics Suite ──────────────────────────────────────
  // See plans/challenge-design-guide.md for definitions

  // Group scores by agent + attempt number
  const agentAttempts: Record<string, { attempt: number; score: number; result: string }[]> = {};
  for (const m of allMatches) {
    const attempt = m.attemptNumber ?? 1;
    if (m.score !== null) {
      if (!agentAttempts[m.agentId]) agentAttempts[m.agentId] = [];
      agentAttempts[m.agentId].push({ attempt, score: m.score, result: m.result ?? "loss" });
    }
  }

  // Score by attempt number (learning curve)
  const byAttempt: Record<number, number[]> = {};
  for (const entries of Object.values(agentAttempts)) {
    for (const e of entries) {
      if (!byAttempt[e.attempt]) byAttempt[e.attempt] = [];
      byAttempt[e.attempt].push(e.score);
    }
  }
  const scoreByAttemptNumber: Record<string, { mean: number; median: number; count: number }> = {};
  for (const [attempt, attemptScores] of Object.entries(byAttempt)) {
    const sorted = [...attemptScores].sort((a, b) => a - b);
    scoreByAttemptNumber[attempt] = {
      mean: Math.round((sorted.reduce((a, b) => a + b, 0) / sorted.length) * 10) / 10,
      median: median(sorted),
      count: sorted.length,
    };
  }

  // pass@1: P(first attempt wins)
  const firstAttempts = Object.values(agentAttempts)
    .map(entries => entries.find(e => e.attempt === 1))
    .filter(Boolean) as { attempt: number; score: number; result: string }[];
  const passAt1 = firstAttempts.length > 0
    ? firstAttempts.filter(e => e.result === "win").length / firstAttempts.length
    : null;

  // best-of-k: mean of max(first k attempts) per agent
  function bestOfK(k: number): number | null {
    const eligible = Object.values(agentAttempts).filter(
      entries => entries.filter(e => e.attempt <= k).length >= 1,
    );
    if (eligible.length < 3) return null; // need min 3 agents
    const bests = eligible.map(entries =>
      Math.max(...entries.filter(e => e.attempt <= k).map(e => e.score)),
    );
    return Math.round((bests.reduce((a, b) => a + b, 0) / bests.length) * 10) / 10;
  }

  // pass^k: P(all first k attempts win)
  function passExpK(k: number): number | null {
    const eligible = Object.values(agentAttempts).filter(
      entries => entries.filter(e => e.attempt <= k).length >= k,
    );
    if (eligible.length < 3) return null;
    const allWin = eligible.filter(entries =>
      entries.filter(e => e.attempt <= k).every(e => e.result === "win"),
    );
    return Math.round((allWin.length / eligible.length) * 1000) / 1000;
  }

  const benchmarkMetrics: BenchmarkMetrics = {
    pass_at_1: passAt1 !== null ? Math.round(passAt1 * 1000) / 1000 : undefined,
    best_of_3: bestOfK(3) ?? undefined,
    best_of_5: bestOfK(5) ?? undefined,
    pass_k_3: passExpK(3) ?? undefined,
    pass_k_5: passExpK(5) ?? undefined,
    learning_curve: {
      attempt_1_mean: scoreByAttemptNumber["1"]?.mean,
      attempt_2_mean: scoreByAttemptNumber["2"]?.mean,
      attempt_3_mean: scoreByAttemptNumber["3"]?.mean,
    },
    agents_sampled: Object.keys(agentAttempts).length,
  };

  // ── Cost-Efficiency Analytics ─────────────────────────────────────
  // Join token_count from submission metadata with model_pricing to compute cost-per-point

  const pricingRows = await db.query.modelPricing.findMany({
    where: eq(modelPricing.active, true),
  });

  function lookupCost(modelId: string, tokenCount: number): number | null {
    // Find best matching pricing row (exact match or prefix match)
    const row = pricingRows.find(p => modelId === p.pattern)
      ?? pricingRows.find(p => modelId.startsWith(p.pattern));
    if (!row) return null;
    // Assume 60/40 input/output split when we only have total token count
    const inputTokens = Math.round(tokenCount * 0.6);
    const outputTokens = tokenCount - inputTokens;
    return (inputTokens * row.inputPer1m + outputTokens * row.outputPer1m) / 1_000_000;
  }

  let medianCostPerPoint: number | null = null;
  const costByModel: Record<string, { mean_cost_per_point: number; count: number }> = {};

  if (pricingRows.length > 0) {
    const costPerPointValues: number[] = [];
    const costByModelAccum: Record<string, { total: number; count: number }> = {};

    for (const m of allMatches) {
      const meta = m.submissionMetadata as { token_count?: number; model_id?: string } | null;
      if (!meta?.token_count || !meta?.model_id || m.score === null || m.score <= 0) continue;

      const cost = lookupCost(meta.model_id, meta.token_count);
      if (cost === null) continue;

      const cpp = cost / (m.score / 1000); // cost per 1000 score points
      costPerPointValues.push(cpp);

      if (!costByModelAccum[meta.model_id]) costByModelAccum[meta.model_id] = { total: 0, count: 0 };
      costByModelAccum[meta.model_id].total += cpp;
      costByModelAccum[meta.model_id].count += 1;
    }

    if (costPerPointValues.length > 0) {
      costPerPointValues.sort((a, b) => a - b);
      medianCostPerPoint = Math.round(median(costPerPointValues) * 10000) / 10000;
    }

    for (const [modelId, acc] of Object.entries(costByModelAccum)) {
      costByModel[modelId] = {
        mean_cost_per_point: Math.round((acc.total / acc.count) * 10000) / 10000,
        count: acc.count,
      };
    }
  }

  const analyticsData = {
    challengeId,
    computedAt: new Date(),
    totalAttempts: total,
    completedCount: completed,
    completionRate: Math.round(completionRate * 1000) / 1000,
    medianScore,
    meanScore,
    scoreP25,
    scoreP75,
    winCount: wins,
    winRate: Math.round(winRate * 1000) / 1000,
    avgDurationSecs,
    scoreDistribution,
    scoreByHarness,
    scoreByModel,
    scoreTrend,
    scoreByAttemptNumber,
    benchmarkMetrics,
    medianCostPerPoint,
    costByModel,
  };

  // Upsert
  await db
    .insert(challengeAnalytics)
    .values(analyticsData)
    .onConflictDoUpdate({
      target: challengeAnalytics.challengeId,
      set: analyticsData,
    });

  return analyticsData;
}

const DEFAULT_MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes

export async function getChallengeAnalytics(
  challengeId: string,
  maxAgeMs = DEFAULT_MAX_AGE_MS,
) {
  const cached = await db.query.challengeAnalytics.findFirst({
    where: eq(challengeAnalytics.challengeId, challengeId),
  });

  if (cached) {
    const age = Date.now() - cached.computedAt.getTime();
    if (age < maxAgeMs) return cached;
  }

  return computeChallengeAnalytics(challengeId);
}
