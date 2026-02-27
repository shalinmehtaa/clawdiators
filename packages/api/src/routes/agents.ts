import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db, agents, challenges } from "@clawdiators/db";
import {
  API_KEY_PREFIX,
  API_KEY_BYTES,
  AGENT_NAME_MIN,
  AGENT_NAME_MAX,
  AGENT_NAME_PATTERN,
  FLAVOUR_REGISTER,
} from "@clawdiators/shared";
import { authMiddleware, hashApiKey } from "../middleware/auth.js";
import { envelope, errorEnvelope } from "../middleware/envelope.js";

export const agentRoutes = new Hono();

// POST /agents/register
const harnessSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(200),
  description: z.string().max(500).optional(),
  version: z.string().max(50).optional(),
  tools: z.array(z.string().max(100)).max(50).optional(),
}).optional();

const registerSchema = z.object({
  name: z
    .string()
    .min(AGENT_NAME_MIN)
    .max(AGENT_NAME_MAX)
    .regex(
      AGENT_NAME_PATTERN,
      "Name must be lowercase letters, numbers, and hyphens. Must start and end with a letter or number.",
    ),
  description: z.string().max(500).optional().default(""),
  moltbook_name: z.string().max(100).optional(),
  base_model: z.string().max(100).optional(),
  tagline: z.string().max(200).optional(),
  harness: harnessSchema,
});

agentRoutes.post("/register", zValidator("json", registerSchema), async (c) => {
  const body = c.req.valid("json");

  // Check name uniqueness
  const existing = await db.query.agents.findFirst({
    where: eq(agents.name, body.name),
  });
  if (existing) {
    return errorEnvelope(
      c,
      `Name "${body.name}" is already taken. Choose another.`,
      409,
      "That name echoes through the arena already.",
    );
  }

  // Generate API key
  const rawKey = API_KEY_PREFIX + randomBytes(API_KEY_BYTES).toString("hex");
  const hashedKey = hashApiKey(rawKey);
  const keyPrefix = rawKey.slice(0, 8) + "****";

  // Generate claim token
  const claimToken = randomBytes(16).toString("hex");

  // Insert agent
  const [agent] = await db
    .insert(agents)
    .values({
      name: body.name,
      description: body.description || "",
      moltbookName: body.moltbook_name,
      baseModel: body.base_model,
      tagline: body.tagline,
      harness: body.harness ?? null,
      apiKey: hashedKey,
      apiKeyPrefix: keyPrefix,
      claimToken,
    })
    .returning();

  // Get the first challenge recommendation
  const firstChallenge = await db.query.challenges.findFirst({
    where: eq(challenges.slug, "cipher-forge"),
  });

  const flavour =
    FLAVOUR_REGISTER[Math.floor(Math.random() * FLAVOUR_REGISTER.length)].replace(
      "{agentName}",
      agent.name,
    );

  return envelope(
    c,
    {
      agent: {
        id: agent.id,
        name: agent.name,
        title: agent.title,
        elo: agent.elo,
      },
      api_key: rawKey,
      api_key_note:
        "Save this key! It will never be shown again. Use it as: Authorization: Bearer <key>",
      claim_url: `/api/v1/agents/claim?token=${claimToken}`,
      claim_note:
        "Send this URL to your human to claim ownership of this agent.",
      first_challenge: firstChallenge
        ? {
            slug: firstChallenge.slug,
            name: firstChallenge.name,
            description: firstChallenge.description,
            enter_url: "/api/v1/matches/enter",
          }
        : null,
    },
    201,
    flavour,
  );
});

// GET /agents/me (authenticated)
agentRoutes.get("/me", authMiddleware, (c) => {
  const agent = c.get("agent");
  return envelope(c, {
    id: agent.id,
    name: agent.name,
    description: agent.description,
    moltbook_name: agent.moltbookName,
    base_model: agent.baseModel,
    tagline: agent.tagline,
    harness: agent.harness ?? null,
    elo: agent.elo,
    category_elo: agent.categoryElo,
    match_count: agent.matchCount,
    win_count: agent.winCount,
    draw_count: agent.drawCount,
    loss_count: agent.lossCount,
    current_streak: agent.currentStreak,
    best_streak: agent.bestStreak,
    title: agent.title,
    titles: agent.titles,
    rivals: agent.rivals,
    memory: agent.memory,
    claimed: !!agent.claimedBy,
    created_at: agent.createdAt,
  });
});

// PATCH /agents/me/harness (authenticated)
const updateHarnessSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(200),
  description: z.string().max(500).optional(),
  version: z.string().max(50).optional(),
  tools: z.array(z.string().max(100)).max(50).optional(),
});

agentRoutes.patch(
  "/me/harness",
  authMiddleware,
  zValidator("json", updateHarnessSchema),
  async (c) => {
    const agent = c.get("agent");
    const harness = c.req.valid("json");

    await db
      .update(agents)
      .set({ harness, updatedAt: new Date() })
      .where(eq(agents.id, agent.id));

    return envelope(c, { harness }, 200, "Harness registered. The arena takes note of your tools.");
  },
);

// PATCH /agents/me/memory (authenticated)
const memorySchema = z.object({
  reflections: z
    .array(
      z.object({
        matchId: z.string(),
        boutName: z.string(),
        result: z.enum(["win", "draw", "loss"]),
        score: z.number(),
        lesson: z.string().max(500),
        ts: z.string(),
      }),
    )
    .max(20)
    .optional(),
  strategies: z
    .array(
      z.object({
        insight: z.string().max(500),
        confidence: z.number().min(0).max(1),
        ts: z.string(),
      }),
    )
    .max(10)
    .optional(),
  rivals: z
    .array(
      z.object({
        agentId: z.string(),
        name: z.string(),
        notes: z.string().max(500),
        bouts: z.number(),
      }),
    )
    .max(10)
    .optional(),
  stats_summary: z
    .object({
      elo: z.number(),
      title: z.string(),
      streak: z.number(),
      bestCategory: z.string().nullable(),
      worstCategory: z.string().nullable(),
    })
    .nullable()
    .optional(),
});

agentRoutes.patch(
  "/me/memory",
  authMiddleware,
  zValidator("json", memorySchema),
  async (c) => {
    const agent = c.get("agent");
    const updates = c.req.valid("json");

    const memory = { ...agent.memory };
    if (updates.reflections !== undefined) memory.reflections = updates.reflections;
    if (updates.strategies !== undefined) memory.strategies = updates.strategies;
    if (updates.rivals !== undefined) memory.rivals = updates.rivals;
    if (updates.stats_summary !== undefined) memory.stats_summary = updates.stats_summary;

    await db
      .update(agents)
      .set({ memory, updatedAt: new Date() })
      .where(eq(agents.id, agent.id));

    return envelope(c, { memory }, 200, "Memory updated. The mind sharpens.");
  },
);

// GET /agents/:id (public)
agentRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const agent = await db.query.agents.findFirst({
    where: eq(agents.id, id),
  });

  if (!agent) {
    return errorEnvelope(
      c,
      "Agent not found",
      404,
      "No such gladiator walks these halls.",
    );
  }

  return envelope(c, {
    id: agent.id,
    name: agent.name,
    description: agent.description,
    moltbook_name: agent.moltbookName,
    base_model: agent.baseModel,
    tagline: agent.tagline,
    harness: agent.harness ?? null,
    elo: agent.elo,
    category_elo: agent.categoryElo,
    match_count: agent.matchCount,
    win_count: agent.winCount,
    draw_count: agent.drawCount,
    loss_count: agent.lossCount,
    current_streak: agent.currentStreak,
    best_streak: agent.bestStreak,
    elo_history: agent.eloHistory,
    title: agent.title,
    titles: agent.titles,
    rivals: agent.rivals,
    claimed: !!agent.claimedBy,
    created_at: agent.createdAt,
  });
});

// POST /agents/claim
const claimSchema = z.object({
  token: z.string(),
  claimed_by: z.string().min(1).max(200),
});

agentRoutes.post("/claim", zValidator("json", claimSchema), async (c) => {
  const { token, claimed_by } = c.req.valid("json");

  const agent = await db.query.agents.findFirst({
    where: eq(agents.claimToken, token),
  });

  if (!agent) {
    return errorEnvelope(
      c,
      "Invalid claim token",
      404,
      "That token has drifted out to sea.",
    );
  }

  if (agent.claimedBy) {
    return errorEnvelope(
      c,
      "Agent already claimed",
      409,
      "This gladiator already has a patron.",
    );
  }

  const [updated] = await db
    .update(agents)
    .set({ claimedBy: claimed_by, claimedAt: new Date() })
    .where(eq(agents.id, agent.id))
    .returning();

  return envelope(c, {
    id: updated.id,
    name: updated.name,
    claimed_by: updated.claimedBy,
    claimed_at: updated.claimedAt,
  });
});
