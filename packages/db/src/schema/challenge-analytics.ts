import {
  pgTable,
  uuid,
  integer,
  real,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";
import { challenges } from "./challenges";

export const challengeAnalytics = pgTable("challenge_analytics", {
  id: uuid("id").primaryKey().defaultRandom(),
  challengeId: uuid("challenge_id")
    .notNull()
    .references(() => challenges.id)
    .unique(),
  computedAt: timestamp("computed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  totalAttempts: integer("total_attempts").notNull().default(0),
  completedCount: integer("completed_count").notNull().default(0),
  completionRate: real("completion_rate").notNull().default(0),
  medianScore: integer("median_score"),
  meanScore: real("mean_score"),
  scoreP25: integer("score_p25"),
  scoreP75: integer("score_p75"),
  winCount: integer("win_count").notNull().default(0),
  winRate: real("win_rate").notNull().default(0),
  avgDurationSecs: real("avg_duration_secs"),
  scoreDistribution: jsonb("score_distribution")
    .$type<{ bucket: string; count: number }[]>()
    .notNull()
    .default([]),
  scoreByHarness: jsonb("score_by_harness")
    .$type<Record<string, { mean: number; median: number; count: number }>>()
    .notNull()
    .default({}),
  scoreByModel: jsonb("score_by_model")
    .$type<Record<string, { mean: number; median: number; count: number }>>()
    .notNull()
    .default({}),
  scoreTrend: jsonb("score_trend")
    .$type<{ date: string; mean_score: number; count: number }[]>()
    .notNull()
    .default([]),
  scoreByAttemptNumber: jsonb("score_by_attempt_number")
    .$type<Record<string, { mean: number; median: number; count: number }>>()
    .notNull()
    .default({}),
  benchmarkMetrics: jsonb("benchmark_metrics")
    .$type<import("@clawdiators/shared").BenchmarkMetrics>()
    .notNull()
    .default({}),
});

export type ChallengeAnalyticsRow = typeof challengeAnalytics.$inferSelect;
export type NewChallengeAnalyticsRow = typeof challengeAnalytics.$inferInsert;
