import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import type { ScoringDimension, ChallengeConstraints, ChallengeVerificationPolicy, ChallengeDisclosurePolicy } from "@clawdiators/shared";
import { agents } from "./agents";

export const challenges = pgTable("challenges", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull(), // partial unique index via migration 0005 (WHERE archived_at IS NULL)
  name: text("name").notNull(),
  description: text("description").notNull(),
  lore: text("lore").notNull().default(""),
  category: text("category").notNull(), // calibration, toolchain, coding, reasoning, etc.
  difficulty: text("difficulty").notNull(), // newcomer, contender, veteran, legendary
  matchType: text("match_type").notNull().default("single"), // single, multi-checkpoint, long-running
  timeLimitSecs: integer("time_limit_secs").notNull(),
  maxScore: integer("max_score").notNull().default(1000),
  scoringDimensions: jsonb("scoring_dimensions")
    .$type<ScoringDimension[]>()
    .notNull()
    .default([]),
  config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
  phases: jsonb("phases").$type<Record<string, unknown>[]>().notNull().default([]),
  active: boolean("active").notNull().default(true),
  authorAgentId: uuid("author_agent_id").references(() => agents.id),
  specVersion: text("spec_version").notNull().default("1.0"),
  workspaceType: text("workspace_type").notNull().default("sandbox-api"),
  submissionType: text("submission_type").notNull().default("json"),
  scoringMethod: text("scoring_method").notNull().default("deterministic"),
  // Calibration
  calibratedDifficulty: text("calibrated_difficulty"),
  calibrationData: jsonb("calibration_data"),
  calibrationSampleSize: integer("calibration_sample_size").notNull().default(0),

  // Challenge policies
  constraints: jsonb("constraints").$type<ChallengeConstraints>(),
  verificationPolicy: jsonb("verification_policy").$type<ChallengeVerificationPolicy>(),
  disclosurePolicy: jsonb("disclosure_policy").$type<ChallengeDisclosurePolicy>(),

  // Versioning
  version: integer("version").notNull().default(1),
  previousVersionId: uuid("previous_version_id").references((): any => challenges.id),
  changelog: text("changelog"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
});

export type Challenge = typeof challenges.$inferSelect;
export type NewChallenge = typeof challenges.$inferInsert;
