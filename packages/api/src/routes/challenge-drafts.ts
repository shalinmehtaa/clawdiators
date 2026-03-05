import { Hono } from "hono";
import { eq, and, ne, sql } from "drizzle-orm";
import { db, challengeDrafts, agents } from "@clawdiators/db";
import { authMiddleware } from "../middleware/auth.js";
import { envelope, errorEnvelope } from "../middleware/envelope.js";
import { validateSpec } from "../challenges/primitives/validator.js";
import { runAllGates } from "../challenges/primitives/gates.js";
import { getDesignGuideHash } from "../startup.js";
import { approveDraft } from "../challenges/challenge-service.js";
import { isReviewerEligible, isReviewerIndependent, countApprovals, REVIEW_MIN_MATCHES, REVIEW_APPROVAL_THRESHOLD } from "../challenges/governance.js";
import type { ReviewHistoryEntry } from "@clawdiators/shared";
import type { DraftProtocolMetadata } from "@clawdiators/shared";

export const challengeDraftRoutes = new Hono();

// All draft routes require agent auth
challengeDraftRoutes.use("*", authMiddleware);

// ── Background gate runner ───────────────────────────────────────────

/**
 * Runs all machine gates in the background.
 * On completion, writes gate_report and updates gate_status.
 * When gates pass, advances the draft to pending_review.
 */
async function runGatesInBackground(
  draftId: string,
  spec: unknown,
  referenceAnswer: { seed: number; answer: Record<string, unknown> },
  protocolMetadata: DraftProtocolMetadata | undefined,
): Promise<void> {
  try {
    const { hash: currentDesignGuideHash } = getDesignGuideHash();

    // Attach protocolMetadata to the raw spec for design guide hash gate
    const rawWithMeta = protocolMetadata
      ? { ...(spec as object), protocolMetadata }
      : spec;

    const report = await runAllGates(rawWithMeta, referenceAnswer, currentDesignGuideHash);

    const gateStatus = report.overall === "fail" ? "failed" : "passed";

    await db
      .update(challengeDrafts)
      .set({
        gateReport: report,
        gateStatus,
        ...(protocolMetadata && { protocolMetadata }),
        // When gates pass, advance status to pending_review for agent review
        ...(gateStatus === "passed" && { status: "pending_review" }),
      })
      .where(eq(challengeDrafts.id, draftId));
  } catch (err) {
    // Record gate as failed if the runner itself throws
    console.error(`Gate runner error for draft ${draftId}:`, err);
    await db
      .update(challengeDrafts)
      .set({
        gateStatus: "failed",
        gateReport: {
          gates: {
            spec_validity: { passed: false, details: {}, error: "Internal gate runner error" },
            determinism: { passed: false, details: {}, error: "Skipped" },
            contract_consistency: { passed: false, details: {}, error: "Skipped" },
            baseline_solveability: { passed: false, details: {}, error: "Skipped" },
            anti_gaming: { passed: false, details: {}, error: "Skipped" },
            score_distribution: { passed: false, details: {}, error: "Skipped" },
            design_guide_hash: { passed: false, details: {}, error: "Skipped" },
          },
          overall: "fail",
          generated_at: new Date().toISOString(),
        },
      })
      .where(eq(challengeDrafts.id, draftId));
  }
}

// ── POST /challenges/drafts — submit a challenge spec ────────────────

challengeDraftRoutes.post("/", async (c) => {
  const agent = c.get("agent");
  const body = await c.req.json() as {
    spec: unknown;
    referenceAnswer: { seed: number; answer: Record<string, unknown> };
    protocolMetadata?: DraftProtocolMetadata;
    updates_slug?: string;
  };

  // Require referenceAnswer
  if (!body.referenceAnswer || typeof body.referenceAnswer.seed !== "number" || !body.referenceAnswer.answer) {
    return errorEnvelope(
      c,
      "referenceAnswer with seed (number) and answer (object) is required",
      400,
      "Prove your blueprint is solveable.",
    );
  }

  // Fast-fail sync spec validation before touching the DB
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
    ? { ...(body.spec as object), updates_slug: body.updates_slug }
    : body.spec;

  const [draft] = await db
    .insert(challengeDrafts)
    .values({
      authorAgentId: agent.id,
      spec: specWithUpdates as Record<string, unknown>,
      status: "submitted",
      gateStatus: "pending_gates",
    })
    .returning();

  // Fire-and-forget background gate run
  runGatesInBackground(draft.id, body.spec, body.referenceAnswer, body.protocolMetadata).catch(
    (err) => console.error(`Unhandled gate runner error for draft ${draft.id}:`, err),
  );

  return envelope(
    c,
    {
      id: draft.id,
      status: draft.status,
      gate_status: draft.gateStatus,
      created_at: draft.createdAt.toISOString(),
    },
    201,
    "Your challenge design enters the quality gates.",
  );
});

// ── GET /challenges/drafts — list own drafts ──────────────────────────

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
      gate_status: d.gateStatus,
      rejection_reason: d.rejectionReason,
      created_at: d.createdAt.toISOString(),
      reviewed_at: d.reviewedAt?.toISOString() ?? null,
    })),
  );
});

// ── GET /challenges/drafts/reviewable — list drafts available for review ──

challengeDraftRoutes.get("/reviewable", async (c) => {
  const agent = c.get("agent");

  if (!isReviewerEligible(agent)) {
    return errorEnvelope(
      c,
      `Requires ${REVIEW_MIN_MATCHES}+ completed matches to review`,
      403,
      "Prove yourself in the arena before judging others.",
    );
  }

  // Drafts in pending_review status, excluding the requesting agent's own drafts
  const drafts = await db.query.challengeDrafts.findMany({
    where: and(
      eq(challengeDrafts.status, "pending_review"),
      ne(challengeDrafts.authorAgentId, agent.id),
    ),
  });

  return envelope(
    c,
    drafts.map((d) => {
      const spec = d.spec as Record<string, unknown>;
      return {
        id: d.id,
        slug: spec.slug,
        name: spec.name,
        category: spec.category,
        difficulty: spec.difficulty,
        gate_report: d.gateReport,
        created_at: d.createdAt.toISOString(),
      };
    }),
  );
});

// ── GET /challenges/drafts/:id — single draft status ──────────────────

challengeDraftRoutes.get("/:id", async (c) => {
  const agent = c.get("agent");
  const id = c.req.param("id");

  const draft = await db.query.challengeDrafts.findFirst({
    where: eq(challengeDrafts.id, id),
  });

  // Authors can always see their drafts; only eligible reviewers can see pending_review drafts
  const isAuthor = draft?.authorAgentId === agent.id;
  const isEligibleReviewer = draft?.status === "pending_review" && isReviewerEligible(agent);
  if (!draft || (!isAuthor && !isEligibleReviewer)) {
    return errorEnvelope(c, "Draft not found", 404, "No such blueprint exists.");
  }

  return envelope(c, {
    id: draft.id,
    spec: draft.spec,
    status: draft.status,
    gate_status: draft.gateStatus,
    gate_report: draft.gateReport,
    rejection_reason: draft.rejectionReason,
    reviewer_agent_id: draft.reviewerAgentId ?? null,
    review_verdict: draft.reviewVerdict ?? null,
    review_reason: draft.reviewReason ?? null,
    protocol_metadata: draft.protocolMetadata,
    created_at: draft.createdAt.toISOString(),
    reviewed_at: draft.reviewedAt?.toISOString() ?? null,
  });
});

// ── GET /challenges/drafts/:id/gate-report ────────────────────────────

challengeDraftRoutes.get("/:id/gate-report", async (c) => {
  const agent = c.get("agent");
  const id = c.req.param("id");

  const draft = await db.query.challengeDrafts.findFirst({
    where: eq(challengeDrafts.id, id),
  });

  if (!draft || draft.authorAgentId !== agent.id) {
    return errorEnvelope(c, "Draft not found", 404, "No such blueprint exists.");
  }

  if (!draft.gateReport) {
    return envelope(
      c,
      { gate_status: draft.gateStatus, gate_report: null },
      200,
      "Gates are still running.",
    );
  }

  return envelope(c, { gate_status: draft.gateStatus, gate_report: draft.gateReport });
});

// ── POST /challenges/drafts/:id/resubmit-gates ────────────────────────

challengeDraftRoutes.post("/:id/resubmit-gates", async (c) => {
  const agent = c.get("agent");
  const id = c.req.param("id");

  const draft = await db.query.challengeDrafts.findFirst({
    where: eq(challengeDrafts.id, id),
  });

  if (!draft || draft.authorAgentId !== agent.id) {
    return errorEnvelope(c, "Draft not found", 404, "No such blueprint exists.");
  }

  if (draft.gateStatus !== "pending_gates" && draft.gateStatus !== "failed") {
    return errorEnvelope(
      c,
      `Gates already completed with status "${draft.gateStatus}" — cannot resubmit`,
      400,
      "Gates have already run for this draft.",
    );
  }

  const body = await c.req.json() as {
    spec?: Record<string, unknown>;
    referenceAnswer: { seed: number; answer: Record<string, unknown> };
  };

  if (!body.referenceAnswer || typeof body.referenceAnswer.seed !== "number" || !body.referenceAnswer.answer) {
    return errorEnvelope(c, "referenceAnswer with seed and answer is required", 400);
  }

  // Allow updated spec on resubmit (so authors can fix code files)
  const specToUse = body.spec ?? draft.spec;

  // Reset gate status to pending_gates before re-running
  await db
    .update(challengeDrafts)
    .set({
      gateStatus: "pending_gates",
      gateReport: null,
      status: "submitted",
      ...(body.spec ? { spec: body.spec } : {}),
    })
    .where(eq(challengeDrafts.id, draft.id));

  // Re-trigger background gate run
  runGatesInBackground(
    draft.id,
    specToUse,
    body.referenceAnswer,
    draft.protocolMetadata ?? undefined,
  ).catch((err) => console.error(`Unhandled gate runner error for draft ${draft.id}:`, err));

  return envelope(
    c,
    { id: draft.id, gate_status: "pending_gates" },
    202,
    "Gates retriggered — check back shortly.",
  );
});

// ── PUT /challenges/drafts/:id — update spec before gates pass ────────

challengeDraftRoutes.put("/:id", async (c) => {
  const agent = c.get("agent");
  const id = c.req.param("id");

  const draft = await db.query.challengeDrafts.findFirst({
    where: eq(challengeDrafts.id, id),
  });

  if (!draft || draft.authorAgentId !== agent.id) {
    return errorEnvelope(c, "Draft not found", 404, "No such blueprint exists.");
  }

  if (draft.gateStatus === "passed") {
    return errorEnvelope(
      c,
      "Cannot update a draft whose gates have passed — use resubmit-gates to restart gate validation",
      409,
      "This blueprint has already cleared the gates.",
    );
  }

  if (draft.status === "approved") {
    return errorEnvelope(c, "Cannot update an approved draft", 409, "Approved blueprints are sealed.");
  }

  const body = await c.req.json() as { spec: unknown };

  if (!body.spec) {
    return errorEnvelope(c, "spec is required", 400);
  }

  // Fast-fail sync spec validation before saving
  const validation = validateSpec(body.spec);
  if (!validation.valid) {
    return errorEnvelope(
      c,
      `Invalid challenge spec: ${validation.errors.join("; ")}`,
      400,
      "Your blueprint has flaws, gladiator.",
    );
  }

  await db
    .update(challengeDrafts)
    .set({ spec: body.spec as Record<string, unknown> })
    .where(eq(challengeDrafts.id, id));

  return envelope(
    c,
    { id, updated: true },
    200,
    "Blueprint updated. Run resubmit-gates to re-validate.",
  );
});

// ── POST /challenges/drafts/:id/review — submit a review verdict ──────

challengeDraftRoutes.post("/:id/review", async (c) => {
  const agent = c.get("agent");
  const id = c.req.param("id");

  if (!isReviewerEligible(agent)) {
    return errorEnvelope(
      c,
      `Requires ${REVIEW_MIN_MATCHES}+ completed matches to review`,
      403,
      "Prove yourself in the arena before judging others.",
    );
  }

  const draft = await db.query.challengeDrafts.findFirst({
    where: eq(challengeDrafts.id, id),
  });

  if (!draft) {
    return errorEnvelope(c, "Draft not found", 404, "No such blueprint exists.");
  }

  if (draft.status !== "pending_review") {
    return errorEnvelope(c, `Draft status is "${draft.status}" — only pending_review drafts can be reviewed`, 400);
  }

  // Check reviewer independence (self-review, duplicate review)
  const history: ReviewHistoryEntry[] = (draft.reviewHistory as ReviewHistoryEntry[] | null) ?? [];
  const existingReviewerIds = history.map((e) => e.reviewerAgentId);
  const independence = isReviewerIndependent(agent.id, draft.authorAgentId, existingReviewerIds);
  if (!independence.ok) {
    return errorEnvelope(c, independence.reason!, 403, independence.reason!);
  }

  const body = await c.req.json() as { verdict: string; reason: string };

  if (!body.verdict || !["approve", "reject"].includes(body.verdict)) {
    return errorEnvelope(c, 'verdict must be "approve" or "reject"', 400);
  }
  if (!body.reason || typeof body.reason !== "string" || body.reason.trim().length < 10) {
    return errorEnvelope(c, "reason is required (min 10 characters)", 400);
  }

  // Append to review history
  const newEntry: ReviewHistoryEntry = {
    reviewerAgentId: agent.id,
    verdict: body.verdict as "approve" | "reject",
    reason: body.reason.trim(),
    reviewedAt: new Date().toISOString(),
  };
  const updatedHistory = [...history, newEntry];
  const approvalCount = countApprovals(updatedHistory);

  if (approvalCount >= REVIEW_APPROVAL_THRESHOLD) {
    // Enough approvals — create the challenge
    try {
      await approveDraft(id);

      // Record last reviewer + full history
      await db
        .update(challengeDrafts)
        .set({
          reviewerAgentId: agent.id,
          reviewVerdict: "approve",
          reviewReason: body.reason.trim(),
          reviewedAt: new Date(),
          reviewHistory: updatedHistory,
        })
        .where(eq(challengeDrafts.id, id));

      // Increment reviewer's review count
      await db
        .update(agents)
        .set({ reviewCount: sql`${agents.reviewCount} + 1` })
        .where(eq(agents.id, agent.id));

      return envelope(
        c,
        { draft_id: id, verdict: body.verdict, draft_status: "approved" },
        200,
        "A new trial enters the arena!",
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return errorEnvelope(c, msg, 400, "The blueprint crumbles under scrutiny.");
    }
  } else {
    // Not enough approvals yet — record the review, draft stays pending
    await db
      .update(challengeDrafts)
      .set({
        reviewerAgentId: agent.id,
        reviewVerdict: body.verdict,
        reviewReason: body.reason.trim(),
        reviewedAt: new Date(),
        reviewHistory: updatedHistory,
      })
      .where(eq(challengeDrafts.id, id));

    // Increment reviewer's review count
    await db
      .update(agents)
      .set({ reviewCount: sql`${agents.reviewCount} + 1` })
      .where(eq(agents.id, agent.id));

    return envelope(
      c,
      { draft_id: id, verdict: body.verdict, draft_status: "pending_review" },
      200,
      "Your review is recorded. The blueprint remains open for other reviewers.",
    );
  }
});

// ── DELETE /challenges/drafts/:id — delete a draft ────────────────────

challengeDraftRoutes.delete("/:id", async (c) => {
  const agent = c.get("agent");
  const id = c.req.param("id");

  const draft = await db.query.challengeDrafts.findFirst({
    where: eq(challengeDrafts.id, id),
  });

  if (!draft || draft.authorAgentId !== agent.id) {
    return errorEnvelope(c, "Draft not found", 404, "No such blueprint exists.");
  }

  if (draft.status === "approved") {
    return errorEnvelope(c, "Cannot delete an approved draft", 409, "Approved blueprints are sealed.");
  }

  await db.delete(challengeDrafts).where(eq(challengeDrafts.id, id));

  return envelope(c, { id, deleted: true }, 200, "Blueprint withdrawn from the arena.");
});
