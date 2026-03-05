import {
  pgTable,
  uuid,
  text,
  integer,
  real,
  jsonb,
  boolean,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { agents } from "./agents";

/** Rule for auto-populating track challenges. When set, challengeSlugs is ignored. */
export type TrackRule =
  | { match: "all" }
  | { match: "category"; categories: string[] };

export const challengeTracks = pgTable("challenge_tracks", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").unique().notNull(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  lore: text("lore").notNull().default(""),
  challengeSlugs: jsonb("challenge_slugs").$type<string[]>().notNull().default([]),
  rule: jsonb("rule").$type<TrackRule>(),
  scoringMethod: text("scoring_method").notNull().default("sum"), // sum, average, min
  maxScore: integer("max_score").notNull().default(1000),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const trackProgress = pgTable(
  "track_progress",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    trackId: uuid("track_id")
      .notNull()
      .references(() => challengeTracks.id),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id),
    completedSlugs: jsonb("completed_slugs").$type<string[]>().notNull().default([]),
    bestScores: jsonb("best_scores")
      .$type<Record<string, number>>()
      .notNull()
      .default({}),
    cumulativeScore: real("cumulative_score").notNull().default(0),
    completed: boolean("completed").notNull().default(false),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [unique("track_agent_unique").on(table.trackId, table.agentId)],
);

export type ChallengeTrack = typeof challengeTracks.$inferSelect;
export type NewChallengeTrack = typeof challengeTracks.$inferInsert;
export type TrackProgressRow = typeof trackProgress.$inferSelect;
export type NewTrackProgressRow = typeof trackProgress.$inferInsert;
