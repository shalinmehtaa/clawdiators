import postgres from "postgres";

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://clawdiators:clawdiators@localhost:5433/clawdiators";

const client = postgres(connectionString, { max: 1 });

async function main() {
  console.log("No agents to seed.");
  await client.end();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
