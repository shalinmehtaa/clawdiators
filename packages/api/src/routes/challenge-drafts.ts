import { Hono } from "hono";
import { eq, and, ne } from "drizzle-orm";
import { db, challengeDrafts } from "@clawdiators/db";
import { authMiddleware } from "../middleware/auth.js";
import { envelope, errorEnvelope } from "../middleware/envelope.js";
import { validateSpec } from "../challenges/primitives/validator.js";
import { runAllGates } from "../challenges/primitives/gates.js";
import { getDesignGuideHash } from "../startup.js";
import {
  computeQuorum,
  isReviewerEligible,
  getOrInitTrustScore,
} from "../challenges/governance.js";
import { approveDraft } from "../challenges/challenge-service.js";
import type { DraftProtocolMetadata, ReviewerVerdict } from "@clawdiators/shared";

export const challengeDraftRoutes = new Hono();

// All draft routes require agent auth
challengeDraftRoutes.use("*", authMiddleware);

// ── Background gate runner ───────────────────────────────────────────

/**
 * Runs all machine gates in the background.
 * On completion, writes gate_report and updates gate_status.
 * On auto-accept (quorum already met from gates pass), triggers approveDraft.
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
        // When gates pass, advance status to pending_review so reviewers can see it
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

// ── GET /challenges/drafts/pending-review — list drafts available to review ──

challengeDraftRoutes.get("/pending-review", async (c) => {
  const agent = c.get("agent");

  const eligible = await isReviewerEligible(agent.id);
  if (!eligible) {
    return errorEnvelope(
      c,
      `Reviewer eligibility requires ${5} verified matches`,
      403,
      "Earn your reviewer badge in the arena first.",
    );
  }

  // Gates passed, not yet decided, not authored by requester
  const drafts = await db.query.challengeDrafts.findMany({
    where: and(
      eq(challengeDrafts.gateStatus, "passed"),
      eq(challengeDrafts.status, "pending_review"),
      ne(challengeDrafts.authorAgentId, agent.id),
    ),
  });

  return envelope(
    c,
    drafts.map((d) => ({
      id: d.id,
      slug: (d.spec as Record<string, unknown>).slug,
      name: (d.spec as Record<string, unknown>).name,
      category: (d.spec as Record<string, unknown>).category,
      difficulty: (d.spec as Record<string, unknown>).difficulty,
      gate_report: d.gateReport,
      reviewer_count: (d.reviewerVerdicts ?? []).length,
      created_at: d.createdAt.toISOString(),
    })),
  );
});

// ── GET /challenges/drafts/:id — single draft status ──────────────────

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
    gate_status: draft.gateStatus,
    gate_report: draft.gateReport,
    rejection_reason: draft.rejectionReason,
    reviewer_verdicts: draft.reviewerVerdicts,
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

  if (draft.gateStatus !== "pending_gates") {
    return errorEnvelope(
      c,
      `Gates already completed with status "${draft.gateStatus}" — cannot resubmit`,
      400,
      "Gates have already run for this draft.",
    );
  }

  const body = await c.req.json() as {
    referenceAnswer: { seed: number; answer: Record<string, unknown> };
  };

  if (!body.referenceAnswer || typeof body.referenceAnswer.seed !== "number" || !body.referenceAnswer.answer) {
    return errorEnvelope(c, "referenceAnswer with seed and answer is required", 400);
  }

  // Re-trigger background gate run
  runGatesInBackground(
    draft.id,
    draft.spec,
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

// ── POST /challenges/drafts/:id/review ───────────────────────────────

challengeDraftRoutes.post("/:id/review", async (c) => {
  const agent = c.get("agent");
  const id = c.req.param("id");

  // Check reviewer eligibility
  const eligible = await isReviewerEligible(agent.id);
  if (!eligible) {
    return errorEnvelope(
      c,
      `Reviewer eligibility requires ${5} verified matches`,
      403,
      "Earn your reviewer badge in the arena first.",
    );
  }

  const draft = await db.query.challengeDrafts.findFirst({
    where: eq(challengeDrafts.id, id),
  });

  if (!draft) {
    return errorEnvelope(c, "Draft not found", 404);
  }

  if (draft.authorAgentId === agent.id) {
    return errorEnvelope(c, "Cannot review your own draft", 403, "A gladiator cannot judge their own design.");
  }

  if (draft.gateStatus !== "passed") {
    return errorEnvelope(
      c,
      `Draft gates have not passed (current: ${draft.gateStatus})`,
      400,
      "Wait for the quality gates to pass before reviewing.",
    );
  }

  if (draft.status !== "pending_review") {
    return errorEnvelope(
      c,
      `Draft is not open for review (status: ${draft.status})`,
      400,
    );
  }

  // Check for duplicate review
  const existingVerdicts = (draft.reviewerVerdicts ?? []) as ReviewerVerdict[];
  if (existingVerdicts.some((v) => v.agentId === agent.id)) {
    return errorEnvelope(c, "You have already reviewed this draft", 409);
  }

  const body = await c.req.json() as {
    verdict: "accept" | "reject" | "revise";
    findings?: string[];
    severity?: "info" | "warn" | "critical";
  };

  if (!body.verdict || !["accept", "reject", "revise"].includes(body.verdict)) {
    return errorEnvelope(c, 'verdict must be "accept", "reject", or "revise"', 400);
  }

  // Get or initialize trust score
  const trustScore = await getOrInitTrustScore(agent.id);

  const verdict: ReviewerVerdict = {
    agentId: agent.id,
    verdict: body.verdict,
    findings: body.findings ?? [],
    severity: body.severity ?? "info",
    trustScore,
    submittedAt: new Date().toISOString(),
  };

  const updatedVerdicts = [...existingVerdicts, verdict];

  // Compute quorum
  const quorum = computeQuorum(updatedVerdicts);

  // Determine new draft status
  let newStatus: string = draft.status;
  let requiresAdminApproval = false;

  if (quorum.status === "accepted") {
    // Check if this draft requires admin approval (Tier 2+ or content safety flagged)
    const spec = draft.spec as Record<string, unknown>;
    const environment = spec.environment as Record<string, unknown> | undefined;
    const tier = (environment?.tier as string) ?? "sandboxed";
    const gateReport = draft.gateReport as unknown as Record<string, unknown> | undefined;
    const gates = gateReport?.gates as Record<string, unknown> | undefined;
    const contentSafety = gates?.content_safety as Record<string, unknown> | undefined;
    const contentSafetyDetails = contentSafety?.details as Record<string, unknown> | undefined;
    const safetyRequiresAdmin = contentSafetyDetails?.requires_admin_review === true;

    if (tier !== "sandboxed" || safetyRequiresAdmin) {
      // Tier 2+ or content-safety-flagged: route to admin, not auto-approve
      newStatus = "pending_admin";
      requiresAdminApproval = true;
    } else {
      newStatus = "approved";
    }
  } else if (quorum.status === "rejected") {
    newStatus = "rejected";
  } else if (quorum.status === "escalated") {
    newStatus = "escalated";
  }

  // Build update object
  if (newStatus !== draft.status) {
    await db
      .update(challengeDrafts)
      .set({ reviewerVerdicts: updatedVerdicts, status: newStatus, reviewedAt: new Date() })
      .where(eq(challengeDrafts.id, id));
  } else {
    await db
      .update(challengeDrafts)
      .set({ reviewerVerdicts: updatedVerdicts })
      .where(eq(challengeDrafts.id, id));
  }

  // Auto-approve only if quorum accepted AND no admin approval required
  if (quorum.status === "accepted" && !requiresAdminApproval) {
    try {
      await approveDraft(id);
    } catch (err) {
      console.error(`Auto-approval failed for draft ${id}:`, err);
      // Don't fail the response — status is already set to approved-pending
    }
  }

  return envelope(
    c,
    {
      verdict_recorded: true,
      quorum_status: quorum,
      draft_status: newStatus,
      requires_admin_approval: requiresAdminApproval,
    },
    200,
    "Your review has been recorded.",
  );
});
