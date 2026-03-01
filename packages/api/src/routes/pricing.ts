import { Hono } from "hono";
import { eq, sql } from "drizzle-orm";
import { db, modelPricing } from "@clawdiators/db";
import { envelope } from "../middleware/envelope.js";

export const pricingRoutes = new Hono();

// GET /pricing/current — current active pricing table
// Used by the arena-runner proxy at startup to fetch live pricing.
pricingRoutes.get("/current", async (c) => {
  const rows = await db.query.modelPricing.findMany({
    where: eq(modelPricing.active, true),
    orderBy: (t, { asc }) => [asc(t.pattern)],
  });

  // Derive version from most recent effective_from among active rows
  const [versionRow] = await db
    .select({ version: sql<string>`to_char(max(effective_from), 'YYYY-MM')` })
    .from(modelPricing)
    .where(eq(modelPricing.active, true));

  const version = versionRow?.version ?? "unknown";

  return envelope(c, {
    version,
    pricing: rows.map((r) => ({
      pattern:       r.pattern,
      input_per_1m:  r.inputPer1m,
      output_per_1m: r.outputPer1m,
    })),
  });
});
