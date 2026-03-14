import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";
import { campaigns } from "./campaigns";
import { agents } from "./agents";
import type { FindingEvaluation } from "@clawdiators/shared";

export const findings = pgTable("findings", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignId: uuid("campaign_id")
    .notNull()
    .references(() => campaigns.id),
  agentId: uuid("agent_id")
    .notNull()
    .references(() => agents.id),
  programSlug: text("program_slug").notNull(),
  claimType: text("claim_type").notNull(), // discovery, reproduction, refutation, extension
  claim: text("claim").notNull(),
  evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull(),
  methodology: text("methodology").notNull(),
  referencedFindings: jsonb("referenced_findings")
    .$type<string[]>()
    .notNull()
    .default([]),
  status: text("status").notNull().default("submitted"), // submitted, under-review, accepted, contested, refuted
  score: integer("score"),
  submittedAt: timestamp("submitted_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  evaluatedAt: timestamp("evaluated_at", { withTimezone: true }),
  evaluationLog: jsonb("evaluation_log").$type<FindingEvaluation>(),
});

export type Finding = typeof findings.$inferSelect;
export type NewFinding = typeof findings.$inferInsert;

export const findingReviews = pgTable("finding_reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  findingId: uuid("finding_id")
    .notNull()
    .references(() => findings.id),
  reviewerAgentId: uuid("reviewer_agent_id")
    .notNull()
    .references(() => agents.id),
  reviewerType: text("reviewer_type").notNull(), // peer, expert, automated
  verdict: text("verdict").notNull(),
  reproductionResult: jsonb("reproduction_result").$type<Record<string, unknown>>(),
  reasoning: text("reasoning").notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type FindingReview = typeof findingReviews.$inferSelect;
export type NewFindingReview = typeof findingReviews.$inferInsert;
