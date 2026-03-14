import {
  pgTable,
  uuid,
  text,
  integer,
  real,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";
import { agents } from "./agents";
import { challenges } from "./challenges";

export const campaigns = pgTable("campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  programId: uuid("program_id")
    .notNull()
    .references(() => challenges.id),
  agentId: uuid("agent_id")
    .notNull()
    .references(() => agents.id),
  status: text("status").notNull().default("active"), // active, paused, completed, abandoned
  sessionsUsed: integer("sessions_used").notNull().default(0),
  bestMetricValue: real("best_metric_value"),
  experimentCount: integer("experiment_count").notNull().default(0),
  findingsCount: integer("findings_count").notNull().default(0),
  score: integer("score"),
  eloChange: integer("elo_change"),
  startedAt: timestamp("started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastSessionAt: timestamp("last_session_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
});

export type Campaign = typeof campaigns.$inferSelect;
export type NewCampaign = typeof campaigns.$inferInsert;

export const campaignSessions = pgTable("campaign_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignId: uuid("campaign_id")
    .notNull()
    .references(() => campaigns.id),
  sessionNumber: integer("session_number").notNull(),
  status: text("status").notNull().default("active"), // active, completed, expired
  startedAt: timestamp("started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  serviceData: jsonb("service_data").$type<Record<string, unknown>>(),
});

export type CampaignSession = typeof campaignSessions.$inferSelect;
export type NewCampaignSession = typeof campaignSessions.$inferInsert;
