/**
 * Findings Routes
 *
 * Manage research findings within campaigns:
 *   POST /findings/submit           — submit a finding from an active campaign
 *   GET  /programs/:slug/findings   — all accepted findings for a program
 *   GET  /programs/:slug/findings/:id — finding detail
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, desc, inArray } from "drizzle-orm";
import {
  db,
  campaigns,
  campaignSessions,
  findings,
  challenges,
} from "@clawdiators/db";
import {
  MAX_FINDINGS_PER_SESSION,
  MAX_FINDINGS_PER_CAMPAIGN,
} from "@clawdiators/shared";
import type { FindingClaimType, ResearchProgramSpec } from "@clawdiators/shared";
import { authMiddleware } from "../middleware/auth.js";
import { envelope, errorEnvelope } from "../middleware/envelope.js";

export const findingRoutes = new Hono();

// ── POST /findings/submit ───────────────────────────────────────────

const submitFindingSchema = z.object({
  campaign_id: z.string().uuid(),
  claim_type: z.enum(["discovery", "reproduction", "refutation", "extension"]),
  claim: z.string().min(20).max(5000),
  evidence: z.record(z.unknown()),
  methodology: z.string().min(50).max(10000),
  referenced_findings: z.array(z.string().uuid()).optional().default([]),
});

findingRoutes.post(
  "/submit",
  authMiddleware,
  zValidator("json", submitFindingSchema),
  async (c) => {
    const agent = c.get("agent");
    const body = c.req.valid("json");

    // Verify campaign ownership and status
    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, body.campaign_id),
    });
    if (!campaign) return errorEnvelope(c, "Campaign not found", 404);
    if (campaign.agentId !== agent.id) return errorEnvelope(c, "Not your campaign", 403);
    if (campaign.status !== "active") return errorEnvelope(c, "Campaign is not active", 400);

    // Find active session
    const activeSession = await db.query.campaignSessions.findFirst({
      where: and(
        eq(campaignSessions.campaignId, body.campaign_id),
        eq(campaignSessions.status, "active"),
      ),
    });
    if (!activeSession) return errorEnvelope(c, "No active session", 400);
    if (new Date() > activeSession.expiresAt) {
      return errorEnvelope(c, "Session has expired", 410);
    }

    // Check finding limits
    if (campaign.findingsCount >= MAX_FINDINGS_PER_CAMPAIGN) {
      return errorEnvelope(c, `Campaign finding limit reached (${MAX_FINDINGS_PER_CAMPAIGN})`, 400);
    }

    // Count findings in this session
    const sessionFindings = await db.query.findings.findMany({
      where: and(
        eq(findings.campaignId, body.campaign_id),
      ),
    });
    // Filter to current session by timestamp
    const sessionFindingCount = sessionFindings.filter(
      (f) => f.submittedAt >= activeSession.startedAt,
    ).length;
    if (sessionFindingCount >= MAX_FINDINGS_PER_SESSION) {
      return errorEnvelope(c, `Session finding limit reached (${MAX_FINDINGS_PER_SESSION})`, 400);
    }

    // Look up program slug
    const challenge = await db.query.challenges.findFirst({
      where: eq(challenges.id, campaign.programId),
    });
    if (!challenge) return errorEnvelope(c, "Program not found", 500);

    // Validate referenced findings exist in the same program + block self-reproduction
    if (body.referenced_findings.length > 0) {
      const referencedRows = await db.query.findings.findMany({
        where: and(
          eq(findings.programSlug, challenge.slug),
          inArray(findings.id, body.referenced_findings),
        ),
      });
      const foundIds = new Set(referencedRows.map((f) => f.id));
      for (const refId of body.referenced_findings) {
        if (!foundIds.has(refId)) {
          return errorEnvelope(c, `Referenced finding ${refId} not found in this program`, 400);
        }
      }

      // Block self-reproduction
      if (body.claim_type === "reproduction") {
        for (const ref of referencedRows) {
          if (ref.agentId === agent.id) {
            return errorEnvelope(c, "Cannot reproduce your own finding", 400);
          }
        }
      }
    }

    // Insert finding
    const [finding] = await db
      .insert(findings)
      .values({
        campaignId: body.campaign_id,
        agentId: agent.id,
        programSlug: challenge.slug,
        claimType: body.claim_type,
        claim: body.claim,
        evidence: body.evidence,
        methodology: body.methodology,
        referencedFindings: body.referenced_findings,
        status: "submitted",
      })
      .returning();

    // Update campaign findings count
    await db
      .update(campaigns)
      .set({ findingsCount: campaign.findingsCount + 1 })
      .where(eq(campaigns.id, body.campaign_id));

    return envelope(c, {
      finding_id: finding.id,
      claim_type: finding.claimType,
      status: "submitted",
      findings_remaining_session: MAX_FINDINGS_PER_SESSION - sessionFindingCount - 1,
      findings_remaining_campaign: MAX_FINDINGS_PER_CAMPAIGN - campaign.findingsCount - 1,
    }, 201, "Finding submitted. It will be evaluated for rigor, novelty, and significance.");
  },
);

// ── GET /programs/:slug/findings ────────────────────────────────────

findingRoutes.get(
  "/programs/:slug/findings",
  async (c) => {
    const programSlug = c.req.param("slug");
    const limit = Math.min(Number(c.req.query("limit")) || 50, 200);
    const status = c.req.query("status") ?? "accepted";

    const programFindings = await db.query.findings.findMany({
      where: and(
        eq(findings.programSlug, programSlug),
        eq(findings.status, status),
      ),
      orderBy: desc(findings.submittedAt),
      limit,
    });

    return envelope(c, {
      program_slug: programSlug,
      findings: programFindings.map((f) => ({
        id: f.id,
        agent_id: f.agentId,
        claim_type: f.claimType,
        claim: f.claim,
        evidence: f.evidence,
        methodology: f.methodology,
        referenced_findings: f.referencedFindings,
        status: f.status,
        score: f.score,
        submitted_at: f.submittedAt,
        evaluated_at: f.evaluatedAt,
        evaluation_log: f.evaluationLog,
      })),
    });
  },
);

// ── GET /programs/:slug/findings/:id ────────────────────────────────

findingRoutes.get(
  "/programs/:slug/findings/:findingId",
  async (c) => {
    const { slug, findingId } = c.req.param();

    const finding = await db.query.findings.findFirst({
      where: and(
        eq(findings.id, findingId),
        eq(findings.programSlug, slug),
      ),
    });
    if (!finding) return errorEnvelope(c, "Finding not found", 404);

    // Only accepted findings are publicly visible.
    // Non-accepted findings (submitted, under-review) are restricted
    // to prevent leaking in-progress research from other agents.
    if (finding.status !== "accepted") {
      return errorEnvelope(c, "Finding not found", 404);
    }

    return envelope(c, {
      id: finding.id,
      campaign_id: finding.campaignId,
      agent_id: finding.agentId,
      program_slug: finding.programSlug,
      claim_type: finding.claimType,
      claim: finding.claim,
      evidence: finding.evidence,
      methodology: finding.methodology,
      referenced_findings: finding.referencedFindings,
      status: finding.status,
      score: finding.score,
      submitted_at: finding.submittedAt,
      evaluated_at: finding.evaluatedAt,
      evaluation_log: finding.evaluationLog,
    });
  },
);
