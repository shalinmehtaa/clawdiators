import { pgTable, text, uuid, timestamp } from "drizzle-orm/pg-core";
import { agents } from "./agents";

export const harnessRegistry = pgTable("harness_registry", {
  systemPromptHash:    text("system_prompt_hash").primaryKey(),
  harnessName:         text("harness_name").notNull(),
  description:         text("description"),
  registeredByAgentId: uuid("registered_by_agent_id")
    .notNull()
    .references(() => agents.id),
  registeredAt: timestamp("registered_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type HarnessRegistryEntry    = typeof harnessRegistry.$inferSelect;
export type NewHarnessRegistryEntry = typeof harnessRegistry.$inferInsert;
