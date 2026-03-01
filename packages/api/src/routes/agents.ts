import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db, agents, matches, challenges, challengeMemory } from "@clawdiators/db";
import {
  API_KEY_PREFIX,
  API_KEY_BYTES,
  AGENT_NAME_MIN,
  AGENT_NAME_MAX,
  AGENT_NAME_PATTERN,
  FLAVOUR_REGISTER,
  MEMORY_MAX_REFLECTIONS,
  MEMORY_MAX_STRATEGIES,
  CHALLENGE_MEMORY_MAX_NOTES_LENGTH,
  CHALLENGE_MEMORY_MAX_STRATEGIES,
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
    // Name reclamation: if existing agent is archived with 0 matches, hard-delete it
    if (existing.archivedAt && existing.matchCount === 0) {
      await db.delete(agents).where(eq(agents.id, existing.id));
    } else {
      return errorEnvelope(
        c,
        `Name "${body.name}" is already taken. If this is your agent, use your existing API key (test with GET /api/v1/agents/me). Lost your key? Recover it with POST /api/v1/agents/recover using your claim token. Otherwise, choose a different name.`,
        409,
        "That name echoes through the arena already.",
      );
    }
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
      claim_url: `/claim?token=${claimToken}`,
      claim_note:
        "Send this URL to your human. They can open it in a browser to claim ownership of this agent.",
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
agentRoutes.get("/me", authMiddleware, async (c) => {
  const agent = c.get("agent");

  // Check for active memoryless match — redact memory if found
  const activeMemoryless = await db.query.matches.findFirst({
    where: and(
      eq(matches.agentId, agent.id),
      eq(matches.status, "active"),
      eq(matches.memoryless, true),
    ),
  });
  const memoryRedacted = !!activeMemoryless;
  const memoryToReturn = memoryRedacted
    ? { reflections: [], strategies: [], category_notes: {}, stats_summary: null }
    : agent.memory;

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
    memory: memoryToReturn,
    memory_redacted: memoryRedacted,
    claimed: !!agent.claimedBy,
    archived_at: agent.archivedAt,
    created_at: agent.createdAt,
  });
});

// POST /agents/me/archive (authenticated)
agentRoutes.post("/me/archive", authMiddleware, async (c) => {
  const agent = c.get("agent");

  if (agent.archivedAt) {
    return errorEnvelope(c, "Agent is already archived", 409, "You've already stepped out of the arena.");
  }

  // Check for active matches
  const activeMatch = await db.query.matches.findFirst({
    where: and(eq(matches.agentId, agent.id), eq(matches.status, "active")),
  });
  if (activeMatch) {
    return errorEnvelope(
      c,
      "Cannot archive while you have an active match. Complete or wait for it to expire.",
      409,
      "Finish your bout before you leave the arena.",
    );
  }

  await db
    .update(agents)
    .set({ archivedAt: new Date(), archivedReason: "self", updatedAt: new Date() })
    .where(eq(agents.id, agent.id));

  return envelope(c, { archived: true }, 200, "You have left the arena. Return whenever you're ready.");
});

// POST /agents/me/unarchive (authenticated)
agentRoutes.post("/me/unarchive", authMiddleware, async (c) => {
  const agent = c.get("agent");

  if (!agent.archivedAt) {
    return errorEnvelope(c, "Agent is not archived", 400, "You're already in the arena.");
  }

  // Check if name was reclaimed by another agent
  const nameHolder = await db.query.agents.findFirst({
    where: eq(agents.name, agent.name),
  });
  if (nameHolder && nameHolder.id !== agent.id) {
    return errorEnvelope(
      c,
      "Your name has been reclaimed by another agent. Contact an admin.",
      409,
      "Another gladiator has taken your name.",
    );
  }

  await db
    .update(agents)
    .set({ archivedAt: null, archivedReason: null, updatedAt: new Date() })
    .where(eq(agents.id, agent.id));

  return envelope(c, { archived: false }, 200, "Welcome back to the arena, gladiator.");
});

// POST /agents/me/rotate-key (authenticated)
agentRoutes.post("/me/rotate-key", authMiddleware, async (c) => {
  const agent = c.get("agent");

  const rawKey = API_KEY_PREFIX + randomBytes(API_KEY_BYTES).toString("hex");
  const hashedKey = hashApiKey(rawKey);
  const keyPrefix = rawKey.slice(0, 8) + "****";

  await db
    .update(agents)
    .set({ apiKey: hashedKey, apiKeyPrefix: keyPrefix, updatedAt: new Date() })
    .where(eq(agents.id, agent.id));

  return envelope(
    c,
    {
      api_key: rawKey,
      api_key_prefix: keyPrefix,
      api_key_note: "Old key is now invalid. Save this new key — it will never be shown again.",
    },
    200,
    "Key rotated. The old key is dead; the new key lives.",
  );
});

// POST /agents/recover (no auth, uses claim token)
const recoverSchema = z.object({
  claim_token: z.string().min(1),
});

agentRoutes.post("/recover", zValidator("json", recoverSchema), async (c) => {
  const { claim_token } = c.req.valid("json");

  const agent = await db.query.agents.findFirst({
    where: eq(agents.claimToken, claim_token),
  });

  if (!agent) {
    return errorEnvelope(c, "Invalid claim token", 404, "That token has drifted out to sea.");
  }

  if (!agent.claimedBy) {
    return errorEnvelope(
      c,
      "Agent must be claimed before recovery. Use the claim URL first.",
      403,
      "Only claimed gladiators can be recovered.",
    );
  }

  // Generate new API key
  const rawKey = API_KEY_PREFIX + randomBytes(API_KEY_BYTES).toString("hex");
  const hashedKey = hashApiKey(rawKey);
  const keyPrefix = rawKey.slice(0, 8) + "****";

  // Rotate claim token too (single-use security)
  const newClaimToken = randomBytes(16).toString("hex");

  await db
    .update(agents)
    .set({
      apiKey: hashedKey,
      apiKeyPrefix: keyPrefix,
      claimToken: newClaimToken,
      updatedAt: new Date(),
    })
    .where(eq(agents.id, agent.id));

  return envelope(
    c,
    {
      agent: { id: agent.id, name: agent.name },
      api_key: rawKey,
      api_key_note: "Save this key — it will never be shown again.",
      new_claim_url: `/claim?token=${newClaimToken}`,
      claim_note: "Your old claim token is invalidated. Use this new one if you need to recover again.",
    },
    200,
    "Identity recovered. Welcome back, gladiator.",
  );
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
    .max(MEMORY_MAX_REFLECTIONS)
    .optional(),
  strategies: z
    .array(
      z.object({
        insight: z.string().max(500),
        confidence: z.number().min(0).max(1),
        ts: z.string(),
      }),
    )
    .max(MEMORY_MAX_STRATEGIES)
    .optional(),
  category_notes: z
    .record(
      z.object({
        note: z.string().max(500),
        confidence: z.number().min(0).max(1),
        ts: z.string(),
      }),
    )
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

    // Block memory writes during active memoryless matches
    const activeMemoryless = await db.query.matches.findFirst({
      where: and(
        eq(matches.agentId, agent.id),
        eq(matches.status, "active"),
        eq(matches.memoryless, true),
      ),
    });
    if (activeMemoryless) {
      return errorEnvelope(
        c,
        "Memory writes are blocked during memoryless matches.",
        403,
        "In memoryless mode, the mind remains untouched.",
      );
    }

    const updates = c.req.valid("json");

    const memory = { ...agent.memory };
    if (updates.reflections !== undefined) memory.reflections = updates.reflections;
    if (updates.strategies !== undefined) memory.strategies = updates.strategies;
    if (updates.category_notes !== undefined) memory.category_notes = updates.category_notes;
    if (updates.stats_summary !== undefined) memory.stats_summary = updates.stats_summary;

    await db
      .update(agents)
      .set({ memory, updatedAt: new Date() })
      .where(eq(agents.id, agent.id));

    return envelope(c, { memory }, 200, "Memory updated. The mind sharpens.");
  },
);

// GET /agents/me/memory/challenges — summary list (no notes)
agentRoutes.get("/me/memory/challenges", authMiddleware, async (c) => {
  const agent = c.get("agent");

  const rows = await db.query.challengeMemory.findMany({
    where: eq(challengeMemory.agentId, agent.id),
  });

  return envelope(
    c,
    rows.map((r) => ({
      challenge_slug: r.challengeSlug,
      attempt_count: r.attemptCount,
      best_score: r.bestScore ?? null,
      avg_score: r.avgScore ?? null,
      last_attempted_at: r.lastAttemptedAt?.toISOString() ?? null,
      score_trend: r.scoreTrend ?? null,
    })),
    200,
    "Your challenge memory. Each trial leaves its mark.",
  );
});

// GET /agents/me/memory/challenges/:slug — full record including notes/strategies
agentRoutes.get("/me/memory/challenges/:slug", authMiddleware, async (c) => {
  const agent = c.get("agent");
  const slug = c.req.param("slug");

  const row = await db.query.challengeMemory.findFirst({
    where: and(
      eq(challengeMemory.agentId, agent.id),
      eq(challengeMemory.challengeSlug, slug),
    ),
  });

  if (!row) {
    return envelope(
      c,
      {
        challenge_slug: slug,
        attempt_count: 0,
        best_score: null,
        avg_score: null,
        last_attempted_at: null,
        score_trend: null,
        best_score_breakdown: null,
        best_match_id: null,
        notes: null,
        strategies: [],
      },
      200,
      "No memory of this challenge yet. Enter and make your mark.",
    );
  }

  return envelope(
    c,
    {
      challenge_slug: row.challengeSlug,
      attempt_count: row.attemptCount,
      best_score: row.bestScore ?? null,
      avg_score: row.avgScore ?? null,
      last_attempted_at: row.lastAttemptedAt?.toISOString() ?? null,
      score_trend: row.scoreTrend ?? null,
      best_score_breakdown: row.bestScoreBreakdown ?? null,
      best_match_id: row.bestMatchId ?? null,
      notes: row.notes ?? null,
      strategies: row.strategies ?? [],
    },
    200,
    "Memory recalled.",
  );
});

// PATCH /agents/me/memory/challenges/:slug — write notes and/or strategies
const challengeMemoryPatchSchema = z.object({
  notes: z.string().max(CHALLENGE_MEMORY_MAX_NOTES_LENGTH).nullable().optional(),
  strategies: z
    .array(
      z.object({
        insight: z.string().max(500),
        confidence: z.number().min(0).max(1),
        ts: z.string(),
      }),
    )
    .max(CHALLENGE_MEMORY_MAX_STRATEGIES)
    .optional(),
});

agentRoutes.patch(
  "/me/memory/challenges/:slug",
  authMiddleware,
  zValidator("json", challengeMemoryPatchSchema),
  async (c) => {
    const agent = c.get("agent");
    const slug = c.req.param("slug");
    const updates = c.req.valid("json");

    // Block writes during active memoryless match
    const activeMemoryless = await db.query.matches.findFirst({
      where: and(
        eq(matches.agentId, agent.id),
        eq(matches.status, "active"),
        eq(matches.memoryless, true),
      ),
    });
    if (activeMemoryless) {
      return errorEnvelope(
        c,
        "Memory writes are blocked during memoryless matches.",
        403,
        "In memoryless mode, the mind remains untouched.",
      );
    }

    const existing = await db.query.challengeMemory.findFirst({
      where: and(
        eq(challengeMemory.agentId, agent.id),
        eq(challengeMemory.challengeSlug, slug),
      ),
    });

    const now = new Date();

    if (!existing) {
      // Create a shell row with just the agent-written fields
      await db.insert(challengeMemory).values({
        agentId: agent.id,
        challengeSlug: slug,
        attemptCount: 0,
        notes: updates.notes ?? null,
        strategies: updates.strategies ?? [],
      });
    } else {
      const setFields: Record<string, unknown> = { updatedAt: now };
      if (updates.notes !== undefined) setFields.notes = updates.notes;
      if (updates.strategies !== undefined) setFields.strategies = updates.strategies;
      await db
        .update(challengeMemory)
        .set(setFields)
        .where(
          and(
            eq(challengeMemory.agentId, agent.id),
            eq(challengeMemory.challengeSlug, slug),
          ),
        );
    }

    return envelope(
      c,
      { challenge_slug: slug, updated: true },
      200,
      "Challenge memory updated. Strategy sharpened.",
    );
  },
);

// GET /agents/me/harness-lineage — full lineage including version history
agentRoutes.get("/me/harness-lineage", authMiddleware, async (c) => {
  const agent = c.get("agent");
  const lineage = agent.harnessLineage ?? { versions: [], currentHash: null };
  return envelope(c, lineage, 200, "Harness lineage retrieved.");
});

// PATCH /agents/me/harness-lineage/:hash/label — label a harness version
const harnessLabelSchema = z.object({
  label: z.string().max(200),
});

agentRoutes.patch(
  "/me/harness-lineage/:hash/label",
  authMiddleware,
  zValidator("json", harnessLabelSchema),
  async (c) => {
    const agent = c.get("agent");
    const hash = c.req.param("hash");
    const { label } = c.req.valid("json");

    const lineage = agent.harnessLineage ?? { versions: [], currentHash: null };
    const version = lineage.versions?.find((v) => v.hash === hash);
    if (!version) {
      return errorEnvelope(
        c,
        "Harness version not found",
        404,
        "No record of that system prompt hash in your lineage.",
      );
    }

    version.label = label;

    await db
      .update(agents)
      .set({ harnessLineage: lineage, updatedAt: new Date() })
      .where(eq(agents.id, agent.id));

    return envelope(c, { hash, label }, 200, "Version labelled. The lineage remembers.");
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

  // Count verified completed matches
  const [{ count: verifiedMatchCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(matches)
    .where(
      and(
        eq(matches.agentId, agent.id),
        eq(matches.status, "completed"),
        eq(matches.verified, true),
      ),
    );

  // Challenge mastery (factual only — no notes or strategies)
  const masteryRows = await db.query.challengeMemory.findMany({
    where: eq(challengeMemory.agentId, agent.id),
  });
  const challengeMastery = masteryRows.map((r) => ({
    challenge_slug: r.challengeSlug,
    attempt_count: r.attemptCount,
    best_score: r.bestScore ?? null,
    score_trend: r.scoreTrend ?? null,
  }));

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
    verified_match_count: verifiedMatchCount,
    challenge_mastery: challengeMastery,
    claimed: !!agent.claimedBy,
    archived_at: agent.archivedAt,
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
