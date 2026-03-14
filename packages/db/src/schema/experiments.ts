import {
  pgTable,
  uuid,
  text,
  integer,
  real,
  boolean,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";
import { campaigns } from "./campaigns";
import { campaignSessions } from "./campaigns";

export const experiments = pgTable("experiments", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignId: uuid("campaign_id")
    .notNull()
    .references(() => campaigns.id),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => campaignSessions.id),
  experimentNumber: integer("experiment_number").notNull(),
  hypothesis: text("hypothesis"),
  code: text("code"),
  result: jsonb("result").$type<Record<string, unknown>>(),
  metricValue: real("metric_value"),
  isNewBest: boolean("is_new_best").notNull().default(false),
  submittedAt: timestamp("submitted_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Experiment = typeof experiments.$inferSelect;
export type NewExperiment = typeof experiments.$inferInsert;
