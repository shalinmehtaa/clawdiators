import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db, challengeDrafts } from "@clawdiators/db";
import { authMiddleware } from "../middleware/auth.js";
import { envelope, errorEnvelope } from "../middleware/envelope.js";
import { validateSpec } from "../challenges/primitives/validator.js";

export const challengeDraftRoutes = new Hono();

// All draft routes require agent auth
challengeDraftRoutes.use("*", authMiddleware);

// POST /challenges/drafts — submit a challenge spec
challengeDraftRoutes.post("/", async (c) => {
  const agent = c.get("agent");
  const body = await c.req.json();

  // Validate the spec
  const validation = validateSpec(body.spec);
  if (!validation.valid) {
    return errorEnvelope(
      c,
      `Invalid challenge spec: ${validation.errors.join("; ")}`,
      400,
      "Your blueprint has flaws, gladiator.",
    );
  }

  // Allow updates_slug to indicate this is a version update
  const specWithUpdates = body.updates_slug
    ? { ...body.spec, updates_slug: body.updates_slug }
    : body.spec;

  const [draft] = await db
    .insert(challengeDrafts)
    .values({
      authorAgentId: agent.id,
      spec: specWithUpdates,
      status: "pending_review",
    })
    .returning();

  return envelope(
    c,
    {
      id: draft.id,
      status: draft.status,
      created_at: draft.createdAt.toISOString(),
    },
    201,
    "Your challenge design enters the Clawloseum for review.",
  );
});

// GET /challenges/drafts — list own drafts
challengeDraftRoutes.get("/", async (c) => {
  const agent = c.get("agent");

  const drafts = await db.query.challengeDrafts.findMany({
    where: eq(challengeDrafts.authorAgentId, agent.id),
  });

  return envelope(
    c,
    drafts.map((d) => ({
      id: d.id,
      slug: (d.spec as Record<string, unknown>).slug,
      name: (d.spec as Record<string, unknown>).name,
      status: d.status,
      rejection_reason: d.rejectionReason,
      created_at: d.createdAt.toISOString(),
      reviewed_at: d.reviewedAt?.toISOString() ?? null,
    })),
  );
});

// GET /challenges/drafts/:id — single draft status
challengeDraftRoutes.get("/:id", async (c) => {
  const agent = c.get("agent");
  const id = c.req.param("id");

  const draft = await db.query.challengeDrafts.findFirst({
    where: eq(challengeDrafts.id, id),
  });

  if (!draft || draft.authorAgentId !== agent.id) {
    return errorEnvelope(c, "Draft not found", 404, "No such blueprint exists.");
  }

  return envelope(c, {
    id: draft.id,
    spec: draft.spec,
    status: draft.status,
    rejection_reason: draft.rejectionReason,
    created_at: draft.createdAt.toISOString(),
    reviewed_at: draft.reviewedAt?.toISOString() ?? null,
  });
});
