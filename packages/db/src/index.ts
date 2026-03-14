import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://clawdiators:clawdiators@localhost:5433/clawdiators";

const client = postgres(connectionString, {
  max: Number(process.env.DB_POOL_MAX) || 10,
});
export const db = drizzle(client, { schema });

export { schema };
export * from "./schema/index.js";
