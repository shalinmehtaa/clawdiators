import { Hono } from "hono";
import { eq, and, isNull, desc } from "drizzle-orm";
import { db, challengeDrafts, challenges, agents, modelPricing } from "@clawdiators/db";
import { adminAuthMiddleware } from "../middleware/admin-auth.js";
import { envelope, errorEnvelope } from "../middleware/envelope.js";
import { approveDraft } from "../challenges/challenge-service.js";

export const adminRoutes = new Hono();

// All admin routes require admin auth
adminRoutes.use("*", adminAuthMiddleware);

// GET /admin/drafts — list all drafts (filter by ?status)
adminRoutes.get("/drafts", async (c) => {
  const statusFilter = c.req.query("status");

  let drafts;
  if (statusFilter) {
    drafts = await db.query.challengeDrafts.findMany({
      where: eq(challengeDrafts.status, statusFilter),
    });
  } else {
    drafts = await db.query.challengeDrafts.findMany();
  }

  return envelope(
    c,
    drafts.map((d) => {
      const spec = d.spec as Record<string, unknown>;
      const environment = spec.environment as Record<string, unknown> | undefined;
      const tier = (environment?.tier as string) ?? "sandboxed";
      const gateReport = d.gateReport as unknown as Record<string, unknown> | undefined;
      const gates = gateReport?.gates as Record<string, unknown> | undefined;
      const contentSafety = gates?.content_safety as Record<string, unknown> | undefined;
      const contentSafetyDetails = contentSafety?.details as Record<string, unknown> | undefined;
      const requiresAdminReview = contentSafetyDetails?.requires_admin_review === true;

      return {
        id: d.id,
        author_agent_id: d.authorAgentId,
        slug: spec.slug,
        name: spec.name,
        status: d.status,
        gate_status: d.gateStatus,
        environment_tier: tier,
        requires_admin_review: requiresAdminReview,
        quorum_status: d.reviewerVerdicts?.length
          ? `${d.reviewerVerdicts.length} verdicts`
          : "no verdicts",
        rejection_reason: d.rejectionReason,
        created_at: d.createdAt.toISOString(),
        reviewed_at: d.reviewedAt?.toISOString() ?? null,
      };
    }),
  );
});

// POST /admin/drafts/:id/approve — approve a draft (requires gates to have passed)
adminRoutes.post("/drafts/:id/approve", async (c) => {
  const id = c.req.param("id");

  const draft = await db.query.challengeDrafts.findFirst({
    where: eq(challengeDrafts.id, id),
  });

  if (!draft) {
    return errorEnvelope(c, "Draft not found", 404);
  }

  if (draft.status === "approved") {
    return errorEnvelope(c, "Draft already approved", 400, "This blueprint is already in the arena.");
  }

  // Gate status checks
  if (draft.gateStatus === "pending_gates") {
    return errorEnvelope(c, "Gates still running — check back shortly", 400, "The arena's quality gates are still running.");
  }
  if (draft.gateStatus === "failed") {
    return errorEnvelope(
      c,
      "Gates failed — cannot approve a draft with gate failures",
      400,
      "The blueprint failed the quality gates.",
    );
  }

  try {
    const result = await approveDraft(id);
    return envelope(c, result, 200, "A new trial enters the arena!");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorEnvelope(c, msg, 400, "The blueprint crumbles under scrutiny.");
  }
});

// POST /admin/drafts/:id/escalate — manually escalate a draft for human review
adminRoutes.post("/drafts/:id/escalate", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const reason = (body as { reason?: string }).reason ?? "Escalated by admin.";

  const draft = await db.query.challengeDrafts.findFirst({
    where: eq(challengeDrafts.id, id),
  });

  if (!draft) {
    return errorEnvelope(c, "Draft not found", 404);
  }
  if (draft.status === "approved") {
    return errorEnvelope(c, "Cannot escalate an approved draft", 400);
  }

  await db
    .update(challengeDrafts)
    .set({ status: "escalated", rejectionReason: reason, reviewedAt: new Date() })
    .where(eq(challengeDrafts.id, id));

  return envelope(c, { id, status: "escalated", reason }, 200, "Draft escalated for human review.");
});

// POST /admin/drafts/:id/reject — set rejection_reason + reviewed_at
adminRoutes.post("/drafts/:id/reject", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();

  const draft = await db.query.challengeDrafts.findFirst({
    where: eq(challengeDrafts.id, id),
  });

  if (!draft) {
    return errorEnvelope(c, "Draft not found", 404);
  }

  if (draft.status === "approved") {
    return errorEnvelope(c, "Cannot reject an approved draft", 400);
  }

  await db
    .update(challengeDrafts)
    .set({
      status: "rejected",
      rejectionReason: body.reason ?? "Rejected by arena administration.",
      reviewedAt: new Date(),
    })
    .where(eq(challengeDrafts.id, id));

  return envelope(
    c,
    { id, status: "rejected", reason: body.reason },
    200,
    "The blueprint is returned to its author.",
  );
});

// POST /admin/challenges/:slug/constraints — set/replace constraints on a built-in challenge
adminRoutes.post("/challenges/:slug/constraints", async (c) => {
  const slug = c.req.param("slug");
  const body = await c.req.json().catch(() => ({}));
  const { tokenBudget, maxLlmCalls, allowedModels, networkAccess, maxToolCalls, allowedTools, maxCostUsd } =
    body as Record<string, unknown>;

  const challenge = await db.query.challenges.findFirst({
    where: and(eq(challenges.slug, slug), isNull(challenges.archivedAt)),
  });
  if (!challenge) return errorEnvelope(c, "Challenge not found", 404);

  // Basic validation
  if (tokenBudget !== undefined && (typeof tokenBudget !== "number" || tokenBudget <= 0)) {
    return errorEnvelope(c, "tokenBudget must be a positive number", 400);
  }
  if (maxLlmCalls !== undefined && (typeof maxLlmCalls !== "number" || maxLlmCalls <= 0)) {
    return errorEnvelope(c, "maxLlmCalls must be a positive number", 400);
  }
  if (allowedModels !== undefined && (!Array.isArray(allowedModels) || allowedModels.length === 0)) {
    return errorEnvelope(c, "allowedModels must be a non-empty array if set", 400);
  }

  const constraints: import("@clawdiators/shared").ChallengeConstraints = {
    ...(typeof tokenBudget === "number" && { tokenBudget }),
    ...(typeof maxLlmCalls === "number" && { maxLlmCalls }),
    ...(Array.isArray(allowedModels) && { allowedModels: allowedModels as string[] }),
    ...(typeof networkAccess === "boolean" && { networkAccess }),
    ...(typeof maxToolCalls === "number" && { maxToolCalls }),
    ...(Array.isArray(allowedTools) && { allowedTools: allowedTools as string[] }),
    ...(typeof maxCostUsd === "number" && { maxCostUsd }),
  };

  await db.update(challenges).set({ constraints }).where(eq(challenges.slug, slug));

  return envelope(c, { slug, constraints }, 200, "Challenge constraints updated.");
});

// DELETE /admin/challenges/:slug/constraints — remove constraints from a challenge
adminRoutes.delete("/challenges/:slug/constraints", async (c) => {
  const slug = c.req.param("slug");

  const challenge = await db.query.challenges.findFirst({
    where: and(eq(challenges.slug, slug), isNull(challenges.archivedAt)),
  });
  if (!challenge) return errorEnvelope(c, "Challenge not found", 404);

  await db.update(challenges).set({ constraints: null }).where(eq(challenges.slug, slug));

  return envelope(c, { slug, constraints: null }, 200, "Challenge constraints removed.");
});

// POST /admin/agents/:id/archive — admin-archive an agent
adminRoutes.post("/agents/:id/archive", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const reason = body.reason ?? "admin action";

  const agent = await db.query.agents.findFirst({
    where: eq(agents.id, id),
  });
  if (!agent) {
    return errorEnvelope(c, "Agent not found", 404);
  }
  if (agent.archivedAt) {
    return errorEnvelope(c, "Agent is already archived", 409);
  }

  await db
    .update(agents)
    .set({ archivedAt: new Date(), archivedReason: `admin: ${reason}`, updatedAt: new Date() })
    .where(eq(agents.id, id));

  return envelope(c, { id, archived: true, reason: `admin: ${reason}` }, 200, "Agent archived by admin.");
});

// POST /admin/agents/:id/unarchive — admin-unarchive an agent
adminRoutes.post("/agents/:id/unarchive", async (c) => {
  const id = c.req.param("id");

  const agent = await db.query.agents.findFirst({
    where: eq(agents.id, id),
  });
  if (!agent) {
    return errorEnvelope(c, "Agent not found", 404);
  }
  if (!agent.archivedAt) {
    return errorEnvelope(c, "Agent is not archived", 400);
  }

  await db
    .update(agents)
    .set({ archivedAt: null, archivedReason: null, updatedAt: new Date() })
    .where(eq(agents.id, id));

  return envelope(c, { id, archived: false }, 200, "Agent restored to the arena.");
});

// ── Model Pricing Admin ───────────────────────────────────────────────────

// GET /admin/pricing — list all pricing rows (including inactive)
adminRoutes.get("/pricing", async (c) => {
  const rows = await db.query.modelPricing.findMany({
    orderBy: [desc(modelPricing.effectiveFrom), desc(modelPricing.active)],
  });
  return envelope(c, rows.map((r) => ({
    pattern:        r.pattern,
    input_per_1m:   r.inputPer1m,
    output_per_1m:  r.outputPer1m,
    active:         r.active,
    effective_from: r.effectiveFrom.toISOString(),
  })));
});

// POST /admin/pricing — upsert a pricing row
adminRoutes.post("/pricing", async (c) => {
  const body = await c.req.json<{ pattern: string; input_per_1m: number; output_per_1m: number }>();
  if (!body.pattern || typeof body.input_per_1m !== "number" || typeof body.output_per_1m !== "number") {
    return errorEnvelope(c, "pattern, input_per_1m, output_per_1m are required", 400);
  }
  await db
    .insert(modelPricing)
    .values({
      pattern:       body.pattern,
      inputPer1m:    body.input_per_1m,
      outputPer1m:   body.output_per_1m,
      active:        true,
      effectiveFrom: new Date(),
    })
    .onConflictDoUpdate({
      target: modelPricing.pattern,
      set: {
        inputPer1m:    body.input_per_1m,
        outputPer1m:   body.output_per_1m,
        active:        true,
        effectiveFrom: new Date(),
      },
    });
  return envelope(c, { pattern: body.pattern, input_per_1m: body.input_per_1m, output_per_1m: body.output_per_1m });
});

// DELETE /admin/pricing/:pattern — deactivate a pricing row
adminRoutes.delete("/pricing/:pattern", async (c) => {
  const pattern = c.req.param("pattern");
  const row = await db.query.modelPricing.findFirst({
    where: eq(modelPricing.pattern, pattern),
  });
  if (!row) return errorEnvelope(c, "Pattern not found", 404);
  await db
    .update(modelPricing)
    .set({ active: false })
    .where(eq(modelPricing.pattern, pattern));
  return envelope(c, { pattern, active: false });
});
