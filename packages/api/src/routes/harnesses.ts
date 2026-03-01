import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, harnessRegistry, agents } from "@clawdiators/db";
import { authMiddleware } from "../middleware/auth.js";
import { envelope, errorEnvelope } from "../middleware/envelope.js";

export const harnessRoutes = new Hono();

const registerSchema = z.object({
  system_prompt_hash: z.string().regex(/^[0-9a-f]{64}$/, "Must be a 64-character lowercase hex string"),
  harness_name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});

// POST /harnesses/register — register a hash → harness name mapping
harnessRoutes.post(
  "/register",
  authMiddleware,
  zValidator("json", registerSchema),
  async (c) => {
    const agent = c.get("agent");
    const { system_prompt_hash, harness_name, description } = c.req.valid("json");

    // Check if this hash is already registered by a different agent
    const existing = await db.query.harnessRegistry.findFirst({
      where: eq(harnessRegistry.systemPromptHash, system_prompt_hash),
    });

    if (existing && existing.registeredByAgentId !== agent.id) {
      return errorEnvelope(
        c,
        "This hash is already registered by another agent",
        409,
        "Another gladiator has already claimed this fingerprint.",
      );
    }

    // Upsert (same agent can update their own entry)
    await db
      .insert(harnessRegistry)
      .values({
        systemPromptHash: system_prompt_hash,
        harnessName: harness_name,
        description: description ?? null,
        registeredByAgentId: agent.id,
      })
      .onConflictDoUpdate({
        target: harnessRegistry.systemPromptHash,
        set: {
          harnessName: harness_name,
          description: description ?? null,
        },
      });

    return envelope(
      c,
      {
        system_prompt_hash,
        harness_name,
        description: description ?? null,
        registered_by: agent.name,
      },
      200,
      `${harness_name} has been inscribed in the harness registry.`,
    );
  },
);

// GET /harnesses — list all registry entries
harnessRoutes.get("/", async (c) => {
  const rows = await db.query.harnessRegistry.findMany({
    orderBy: (h, { desc }) => [desc(h.registeredAt)],
  });

  const agentIds = [...new Set(rows.map((r) => r.registeredByAgentId))];
  const agentRows = agentIds.length
    ? await db.query.agents.findMany({
        where: (a, { inArray }) => inArray(a.id, agentIds),
        columns: { id: true, name: true },
      })
    : [];
  const agentMap = Object.fromEntries(agentRows.map((a) => [a.id, a.name]));

  return envelope(
    c,
    rows.map((r) => ({
      system_prompt_hash: r.systemPromptHash,
      harness_name: r.harnessName,
      description: r.description ?? null,
      registered_by_agent_id: r.registeredByAgentId,
      registered_by_name: agentMap[r.registeredByAgentId] ?? null,
      registered_at: r.registeredAt.toISOString(),
    })),
  );
});

// GET /harnesses/:hash — look up a single entry
harnessRoutes.get("/:hash", async (c) => {
  const hash = c.req.param("hash");
  const entry = await db.query.harnessRegistry.findFirst({
    where: eq(harnessRegistry.systemPromptHash, hash),
  });

  if (!entry) return errorEnvelope(c, "Hash not found in registry", 404);

  const registrant = await db.query.agents.findFirst({
    where: eq(agents.id, entry.registeredByAgentId),
    columns: { id: true, name: true },
  });

  return envelope(c, {
    system_prompt_hash: entry.systemPromptHash,
    harness_name: entry.harnessName,
    description: entry.description ?? null,
    registered_by_agent_id: entry.registeredByAgentId,
    registered_by_name: registrant?.name ?? null,
    registered_at: entry.registeredAt.toISOString(),
  });
});
