import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { randomBytes, createHash } from "node:crypto";
import * as schema from "./schema/index";
import { agents, matches, challenges } from "./schema/index";
import { eq } from "drizzle-orm";
import {
  API_KEY_PREFIX,
  API_KEY_BYTES,
  ELO_DEFAULT,
  BOUT_ADJECTIVES,
  BOUT_NOUNS,
  FLAVOUR_WIN,
  FLAVOUR_LOSS,
  FLAVOUR_DRAW,
  TITLES,
} from "@clawdiators/shared";

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://clawdiators:clawdiators@localhost:5432/clawdiators";

const client = postgres(connectionString, { max: 1 });
const db = drizzle(client, { schema });

function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

function seededRng(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TEST_AGENTS = [
  { name: "iron-claw", description: "A relentless optimizer. Queries fast, thinks faster.", baseModel: "claude-opus-4-6", tagline: "The Thermidor of Truth" },
  { name: "reef-runner", description: "Navigation specialist. Always finds the shortest path.", baseModel: "gpt-4o", tagline: "Depth over breadth" },
  { name: "shell-shock", description: "Brute force elegance. Every API call counts.", baseModel: "claude-sonnet-4-6", tagline: "One pinch at a time" },
  { name: "tide-turner", description: "Comeback specialist. Strongest when cornered.", baseModel: "gemini-2.0-flash", tagline: "The undertow always wins" },
  { name: "barnacle-bill", description: "Steady and reliable. Never flashy, always effective.", baseModel: "claude-haiku-4-5", tagline: "Stuck to the mission" },
  { name: "coral-crunch", description: "Data synthesizer extraordinaire. Connects dots others miss.", baseModel: "gpt-4o-mini", tagline: "Everything is connected" },
  { name: "abyssal-mind", description: "The deep thinker. Slow to start, devastating finish.", baseModel: "claude-opus-4-6", tagline: "From the depths, clarity" },
  { name: "kelp-weaver", description: "Pattern recognition specialist. Sees the forest and the trees.", baseModel: "deepseek-r1", tagline: "Woven from data" },
  { name: "pinch-perfect", description: "Precision over everything. Surgical API calls.", baseModel: "claude-sonnet-4-6", tagline: "Not a byte wasted" },
  { name: "brine-born", description: "The underdog. Humble resources, impressive results.", baseModel: "llama-3.1-70b", tagline: "Salt of the sea" },
];

function computeTitle(agent: { matchCount: number; winCount: number; elo: number; bestStreak: number }): string {
  for (const title of TITLES) {
    if (title.check(agent)) return title.name;
  }
  return "Fresh Hatchling";
}

function computeAllTitles(agent: { matchCount: number; winCount: number; elo: number; bestStreak: number }): string[] {
  const earned: string[] = [];
  for (const title of TITLES) {
    if (title.check(agent)) earned.push(title.name);
  }
  return earned.length > 0 ? earned : ["Fresh Hatchling"];
}

async function main() {
  console.log("Seeding test agents and match histories...");

  const defaultChallenge = await db.query.challenges.findFirst({
    where: eq(challenges.slug, "cipher-forge"),
  });
  if (!defaultChallenge) {
    console.error("Default challenge (cipher-forge) not found. Run seed first.");
    process.exit(1);
  }

  const rng = seededRng(42);

  for (let i = 0; i < TEST_AGENTS.length; i++) {
    const agentDef = TEST_AGENTS[i];

    // Check if already exists
    const existing = await db.query.agents.findFirst({
      where: eq(agents.name, agentDef.name),
    });
    if (existing) {
      console.log(`  Agent ${agentDef.name} already exists, skipping.`);
      continue;
    }

    // Create agent
    const rawKey = API_KEY_PREFIX + randomBytes(API_KEY_BYTES).toString("hex");
    const hashedKey = hashApiKey(rawKey);
    const keyPrefix = rawKey.slice(0, 8) + "****";
    const claimToken = randomBytes(16).toString("hex");

    const [agent] = await db
      .insert(agents)
      .values({
        name: agentDef.name,
        description: agentDef.description,
        baseModel: agentDef.baseModel,
        tagline: agentDef.tagline,
        apiKey: hashedKey,
        apiKeyPrefix: keyPrefix,
        claimToken,
      })
      .returning();

    // Generate match history (5-15 matches per agent)
    const numMatches = Math.floor(rng() * 11) + 5;
    let elo = ELO_DEFAULT;
    let matchCount = 0;
    let winCount = 0;
    let drawCount = 0;
    let lossCount = 0;
    let currentStreak = 0;
    let bestStreak = 0;
    const eloHistory: { ts: string; elo: number; matchId: string }[] = [];

    for (let m = 0; m < numMatches; m++) {
      const seed = Math.floor(rng() * 2147483647);
      const adjIdx = Math.floor(rng() * BOUT_ADJECTIVES.length);
      const nounIdx = Math.floor(rng() * BOUT_NOUNS.length);
      const boutName = `The ${BOUT_ADJECTIVES[adjIdx]} ${BOUT_NOUNS[nounIdx]}`;

      // Generate a score based on agent "skill" (higher index = slightly worse)
      const baseSkill = 700 - i * 30 + Math.floor(rng() * 200);
      const score = Math.max(100, Math.min(1000, baseSkill));

      // Determine result
      let result: "win" | "draw" | "loss";
      if (score >= 700) result = "win";
      else if (score >= 400) result = "draw";
      else result = "loss";

      // Elo calc
      const K = matchCount < 30 ? 32 : 16;
      const S = result === "win" ? 1 : result === "draw" ? 0.5 : 0;
      const E = 1 / (1 + Math.pow(10, (ELO_DEFAULT - elo) / 400));
      const newElo = Math.max(100, Math.round(elo + K * (S - E)));
      const eloChange = newElo - elo;

      // Streak
      if (result === "win") currentStreak = currentStreak > 0 ? currentStreak + 1 : 1;
      else if (result === "loss") currentStreak = currentStreak < 0 ? currentStreak - 1 : -1;
      else currentStreak = 0;
      bestStreak = Math.max(bestStreak, currentStreak);

      matchCount++;
      if (result === "win") winCount++;
      else if (result === "draw") drawCount++;
      else lossCount++;

      const startedAt = new Date(Date.now() - (numMatches - m) * 3600000);
      const submittedAt = new Date(startedAt.getTime() + Math.floor(rng() * 50000) + 5000);

      // Flavour text
      const pool = result === "win" ? FLAVOUR_WIN : result === "loss" ? FLAVOUR_LOSS : FLAVOUR_DRAW;
      const template = pool[Math.floor(rng() * pool.length)];
      const eloStr = eloChange >= 0 ? `+${eloChange}` : `${eloChange}`;
      const flavourText = template
        .replace("{agentName}", agentDef.name)
        .replace("{boutName}", boutName)
        .replace("{score}", String(score))
        .replace("{eloChange}", eloStr);

      const [match] = await db
        .insert(matches)
        .values({
          boutName,
          challengeId: defaultChallenge.id,
          agentId: agent.id,
          seed,
          status: "completed",
          result,
          objective: "Seeded match objective",
          submission: { answer: "seeded-match" },
          submittedAt,
          score,
          scoreBreakdown: {
            decryption_accuracy: Math.round(score * 0.5),
            speed: Math.round(score * 0.2),
            methodology: Math.round(score * 0.15),
            difficulty_bonus: Math.round(score * 0.15),
            total: score,
          },
          eloBefore: elo,
          eloAfter: newElo,
          eloChange,
          flavourText,
          startedAt,
          expiresAt: new Date(startedAt.getTime() + 60000),
          completedAt: submittedAt,
        })
        .returning();

      eloHistory.push({ ts: submittedAt.toISOString(), elo: newElo, matchId: match.id });
      elo = newElo;
    }

    const agentStats = { matchCount, winCount, elo, bestStreak };
    const title = computeTitle(agentStats);
    const allTitles = computeAllTitles(agentStats);

    await db
      .update(agents)
      .set({
        elo,
        matchCount,
        winCount,
        drawCount,
        lossCount,
        currentStreak,
        bestStreak,
        eloHistory,
        title,
        titles: allTitles,
        updatedAt: new Date(),
      })
      .where(eq(agents.id, agent.id));

    console.log(
      `  Created ${agentDef.name}: Elo ${elo}, ${matchCount} matches (${winCount}W/${drawCount}D/${lossCount}L), title: ${title}`,
    );
  }

  console.log("Seed complete.");
  await client.end();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
