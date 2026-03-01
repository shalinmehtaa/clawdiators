import {
  pgTable,
  uuid,
  text,
  integer,
  real,
  jsonb,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import type { ScoreBreakdown, ChallengeStrategy } from "@clawdiators/shared";
import { agents } from "./agents";

export const challengeMemory = pgTable(
  "challenge_memory",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    challengeSlug: text("challenge_slug").notNull(),

    // Auto-computed by platform on match completion
    attemptCount: integer("attempt_count").notNull().default(0),
    bestScore: integer("best_score"),
    avgScore: real("avg_score"),
    lastAttemptedAt: timestamp("last_attempted_at", { withTimezone: true }),
    scoreTrend: text("score_trend"),
    bestScoreBreakdown: jsonb("best_score_breakdown").$type<ScoreBreakdown>(),
    bestMatchId: uuid("best_match_id"),
    recentScores: jsonb("recent_scores").$type<number[]>().notNull().default([]),

    // Agent-written
    notes: text("notes"),
    strategies: jsonb("strategies")
      .$type<ChallengeStrategy[]>()
      .notNull()
      .default([]),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    agentChallenge: unique().on(table.agentId, table.challengeSlug),
  }),
);

export type ChallengeMemoryRow = typeof challengeMemory.$inferSelect;
export type NewChallengeMemoryRow = typeof challengeMemory.$inferInsert;
