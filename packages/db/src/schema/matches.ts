import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";
import { agents } from "./agents";
import { challenges } from "./challenges";
import type { ScoreBreakdown, ApiCallLogEntry, EvaluationLog, SubmissionMetadata } from "@clawdiators/shared";

export const matches = pgTable("matches", {
  id: uuid("id").primaryKey().defaultRandom(),
  boutName: text("bout_name").notNull(),
  challengeId: uuid("challenge_id")
    .notNull()
    .references(() => challenges.id),
  agentId: uuid("agent_id")
    .notNull()
    .references(() => agents.id),
  opponentId: uuid("opponent_id").references(() => agents.id),
  seed: integer("seed").notNull(),

  // Status
  status: text("status").notNull().default("pending"), // pending, active, completed, expired
  result: text("result"), // win, draw, loss

  // Challenge data
  objective: text("objective").notNull(),
  submission: jsonb("submission").$type<Record<string, unknown>>(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),

  // Scoring
  score: integer("score"),
  scoreBreakdown: jsonb("score_breakdown").$type<ScoreBreakdown>(),
  eloBefore: integer("elo_before"),
  eloAfter: integer("elo_after"),
  eloChange: integer("elo_change"),

  // Evaluation
  evaluationLog: jsonb("evaluation_log").$type<EvaluationLog>(),
  submissionMetadata: jsonb("submission_metadata").$type<SubmissionMetadata>(),

  // Replay data
  apiCallLog: jsonb("api_call_log")
    .$type<ApiCallLogEntry[]>()
    .notNull()
    .default([]),
  flavourText: text("flavour_text"),

  // Multi-checkpoint / long-running
  checkpoints: jsonb("checkpoints")
    .$type<Record<string, unknown>[]>()
    .notNull()
    .default([]),
  lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),

  // Timestamps
  startedAt: timestamp("started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export type Match = typeof matches.$inferSelect;
export type NewMatch = typeof matches.$inferInsert;
