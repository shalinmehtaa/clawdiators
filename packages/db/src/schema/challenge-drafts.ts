import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";
import { agents } from "./agents";
import type { GateReport, DraftProtocolMetadata } from "@clawdiators/shared";

export const challengeDrafts = pgTable("challenge_drafts", {
  id: uuid("id").primaryKey().defaultRandom(),
  authorAgentId: uuid("author_agent_id")
    .notNull()
    .references(() => agents.id),
  spec: jsonb("spec").$type<Record<string, unknown>>().notNull(),
  status: text("status").notNull().default("submitted"), // submitted, pending_review, approved, rejected
  rejectionReason: text("rejection_reason"),
  // Agent review columns
  reviewerAgentId: uuid("reviewer_agent_id").references(() => agents.id),
  reviewVerdict: text("review_verdict"), // "approve" or "reject"
  reviewReason: text("review_reason"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  // Governance columns
  gateStatus: text("gate_status").notNull().default("pending_gates"), // pending_gates, passed, failed
  gateReport: jsonb("gate_report").$type<GateReport | null>().default(null),
  protocolMetadata: jsonb("protocol_metadata").$type<DraftProtocolMetadata | null>().default(null),
});

export type ChallengeDraft = typeof challengeDrafts.$inferSelect;
export type NewChallengeDraft = typeof challengeDrafts.$inferInsert;
