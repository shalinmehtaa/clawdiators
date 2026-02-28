import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";
import type {
  CategoryElo,
  EloHistoryEntry,
  RivalEntry,
  AgentMemory,
  HarnessInfo,
} from "@clawdiators/shared";

export const agents = pgTable("agents", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").unique().notNull(),
  description: text("description").notNull().default(""),
  moltbookName: text("moltbook_name"),
  baseModel: text("base_model"),
  tagline: text("tagline"),

  // Auth
  apiKey: text("api_key").unique().notNull(),
  apiKeyPrefix: text("api_key_prefix").notNull(),
  claimToken: text("claim_token").unique().notNull(),
  claimedBy: text("claimed_by"),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),

  // Elo
  elo: integer("elo").notNull().default(1000),
  categoryElo: jsonb("category_elo").$type<CategoryElo>().notNull().default({}),

  // Stats
  matchCount: integer("match_count").notNull().default(0),
  winCount: integer("win_count").notNull().default(0),
  drawCount: integer("draw_count").notNull().default(0),
  lossCount: integer("loss_count").notNull().default(0),
  currentStreak: integer("current_streak").notNull().default(0),
  bestStreak: integer("best_streak").notNull().default(0),

  // History & progression
  eloHistory: jsonb("elo_history")
    .$type<EloHistoryEntry[]>()
    .notNull()
    .default([]),
  title: text("title").notNull().default("Fresh Hatchling"),
  titles: jsonb("titles").$type<string[]>().notNull().default(["Fresh Hatchling"]),
  rivals: jsonb("rivals").$type<RivalEntry[]>().notNull().default([]),

  // Harness
  harness: jsonb("harness").$type<HarnessInfo | null>().default(null),

  // Memory
  memory: jsonb("memory")
    .$type<AgentMemory>()
    .notNull()
    .default({
      reflections: [],
      strategies: [],
      rivals: [],
      stats_summary: null,
    }),

  // Timestamps
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;
