import { Hono } from "hono";
import { eq, and, isNull, desc } from "drizzle-orm";
import { db, challengeDrafts, challenges, agents, verificationImages, modelPricing } from "@clawdiators/db";
import { adminAuthMiddleware } from "../middleware/admin-auth.js";
import { envelope, errorEnvelope } from "../middleware/envelope.js";
import { validateSpec, verifyDeterminism } from "../challenges/primitives/validator.js";
import { createDeclarativeModule } from "../challenges/primitives/declarative-module.js";
import { registerModule } from "../challenges/registry.js";

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
    drafts.map((d) => ({
      id: d.id,
      author_agent_id: d.authorAgentId,
      slug: (d.spec as Record<string, unknown>).slug,
      name: (d.spec as Record<string, unknown>).name,
      status: d.status,
      rejection_reason: d.rejectionReason,
      created_at: d.createdAt.toISOString(),
      reviewed_at: d.reviewedAt?.toISOString() ?? null,
    })),
  );
});

// POST /admin/drafts/:id/approve — validate, insert challenge, register module
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

  // Validate the spec
  const validation = validateSpec(draft.spec);
  if (!validation.valid) {
    return errorEnvelope(
      c,
      `Spec validation failed: ${validation.errors.join("; ")}`,
      400,
      "The blueprint crumbles under scrutiny.",
    );
  }

  const spec = validation.spec;

  // Create declarative module and verify determinism
  const mod = createDeclarativeModule(spec);
  const deterCheck = verifyDeterminism(
    (seed) => mod.generateData(seed, {}),
  );
  if (!deterCheck.deterministic) {
    return errorEnvelope(
      c,
      `Determinism check failed: ${deterCheck.error}`,
      400,
      "The tides must flow the same way twice.",
    );
  }

  // Check if this is a version update
  const updatesSlug = (draft.spec as Record<string, unknown>).updates_slug as string | undefined;
  let newVersion = 1;
  let previousVersionId: string | undefined;

  if (updatesSlug) {
    // Find the current active version to archive
    const currentVersion = await db.query.challenges.findFirst({
      where: and(eq(challenges.slug, updatesSlug), isNull(challenges.archivedAt)),
    });
    if (currentVersion) {
      // Archive the old version
      await db
        .update(challenges)
        .set({ archivedAt: new Date() })
        .where(eq(challenges.id, currentVersion.id));
      newVersion = currentVersion.version + 1;
      previousVersionId = currentVersion.id;
    }
  }

  // Insert into challenges table
  await db
    .insert(challenges)
    .values({
      slug: spec.slug,
      name: spec.name,
      description: spec.description,
      lore: spec.lore,
      category: spec.category,
      difficulty: spec.difficulty,
      matchType: spec.matchType,
      timeLimitSecs: spec.timeLimitSecs,
      maxScore: spec.scoring.maxScore,
      scoringDimensions: spec.scoring.dimensions,
      sandboxApis: [],
      config: { communitySpec: draft.spec },
      phases: spec.phases ?? [],
      active: true,
      authorAgentId: draft.authorAgentId,
      workspaceType: spec.workspace.type,
      submissionType: spec.submission.type,
      scoringMethod: spec.scoring.method,
      challengeMdTemplate: spec.workspace.challengeMd,
      version: newVersion,
      previousVersionId: previousVersionId ?? null,
      changelog: updatesSlug ? `Updated from v${newVersion - 1}` : null,
      constraints: spec.constraints ?? null,
      verificationPolicy: spec.verification ?? null,
      disclosurePolicy: spec.disclosure ?? null,
    })
    .onConflictDoNothing();

  // Register the module at runtime
  registerModule(mod);

  // Update draft status
  await db
    .update(challengeDrafts)
    .set({
      status: "approved",
      reviewedAt: new Date(),
    })
    .where(eq(challengeDrafts.id, id));

  return envelope(
    c,
    { id, slug: spec.slug, status: "approved" },
    200,
    "A new trial enters the arena!",
  );
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

// POST /admin/verification-images — register a new known-good image digest
adminRoutes.post("/verification-images", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { tag, digest, notes } = body as Record<string, string | undefined>;

  if (!tag) return errorEnvelope(c, "tag is required", 400);
  if (!digest) return errorEnvelope(c, "digest is required", 400);
  if (!digest.startsWith("sha256:")) return errorEnvelope(c, "digest must start with sha256:", 400);

  const [inserted] = await db
    .insert(verificationImages)
    .values({ tag, digest, notes: notes ?? null })
    .returning();

  return envelope(
    c,
    {
      id: inserted.id,
      tag: inserted.tag,
      digest: inserted.digest,
      published_at: inserted.publishedAt.toISOString(),
    },
    201,
    "Image digest registered in the arena.",
  );
});

// DELETE /admin/verification-images/:id — deprecate an image (sets deprecated_at)
adminRoutes.delete("/verification-images/:id", async (c) => {
  const id = c.req.param("id");

  const image = await db.query.verificationImages.findFirst({
    where: eq(verificationImages.id, id),
  });
  if (!image) return errorEnvelope(c, "Verification image not found", 404);
  if (image.deprecatedAt) return errorEnvelope(c, "Image is already deprecated", 409);

  await db
    .update(verificationImages)
    .set({ deprecatedAt: new Date() })
    .where(eq(verificationImages.id, id));

  return envelope(c, { id, deprecated: true }, 200, "Image digest deprecated.");
});

// GET /admin/verification-images — list all registered image digests
adminRoutes.get("/verification-images", async (c) => {
  const images = await db.query.verificationImages.findMany();
  return envelope(
    c,
    images.map((img) => ({
      id: img.id,
      tag: img.tag,
      digest: img.digest,
      published_at: img.publishedAt.toISOString(),
      deprecated_at: img.deprecatedAt?.toISOString() ?? null,
      notes: img.notes ?? null,
    })),
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
