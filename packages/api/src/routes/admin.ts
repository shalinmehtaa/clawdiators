import { Hono } from "hono";
import { eq, and, isNull } from "drizzle-orm";
import { db, challengeDrafts, challenges } from "@clawdiators/db";
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
