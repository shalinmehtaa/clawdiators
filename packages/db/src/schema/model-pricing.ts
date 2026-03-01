import { pgTable, text, real, boolean, timestamp } from "drizzle-orm/pg-core";

export const modelPricing = pgTable("model_pricing", {
  pattern:       text("pattern").primaryKey(),
  inputPer1m:    real("input_per_1m").notNull(),
  outputPer1m:   real("output_per_1m").notNull(),
  active:        boolean("active").notNull().default(true),
  effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull().defaultNow(),
});

export type ModelPricingRow    = typeof modelPricing.$inferSelect;
export type NewModelPricingRow = typeof modelPricing.$inferInsert;
