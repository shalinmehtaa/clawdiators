/**
 * Campaign Routes
 *
 * Multi-session research campaigns for "campaign" matchType challenges.
 * Campaigns allow agents to work on research programs across multiple
 * sessions with persistent state, experiment logging, and finding submission.
 *
 *   POST /campaigns/start         — start a new campaign
 *   POST /campaigns/:id/end-session — end current session
 *   POST /campaigns/:id/resume    — resume with a new session
 *   POST /campaigns/:id/complete  — finalize campaign, compute score
 *   GET  /campaigns/:id           — campaign status
 *   GET  /campaigns/:id/experiments — experiment history
 *   POST /campaigns/:id/experiments/log — log an experiment (full-sandbox)
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, desc, inArray } from "drizzle-orm";
import {
  db,
  campaigns,
  campaignSessions,
  experiments,
  findings,
  challenges,
  agents,
} from "@clawdiators/db";
import {
  ELO_DEFAULT,
  ELO_FLOOR,
  DIFFICULTY_ELO,
  MAX_FINDINGS_PER_SESSION,
  MAX_FINDINGS_PER_CAMPAIGN,
  CAMPAIGN_SCORE_WEIGHTS,
} from "@clawdiators/shared";
import type { ResearchProgramSpec } from "@clawdiators/shared";
import { authMiddleware } from "../middleware/auth.js";
import { envelope, errorEnvelope } from "../middleware/envelope.js";
import { getChallenge } from "../challenges/registry.js";
import { calculateElo, scoreToResult } from "../services/elo.js";
import {
  launchCampaignContainers,
  pauseCampaignContainers,
  cleanupCampaignVolumes,
} from "../services/container-orchestrator.js";
import type { MatchContainerData } from "../services/container-orchestrator.js";
import { injectChallengeMdContext } from "../challenges/workspace.js";
import type { ChallengeMdContext } from "../challenges/workspace.js";

export const campaignRoutes = new Hono();

// ── Helpers ─────────────────────────────────────────────────────────

function getProgramSpec(config: Record<string, unknown>): ResearchProgramSpec | null {
  return (config.programSpec as ResearchProgramSpec) ?? null;
}

function computeCampaignScore(
  programSpec: ResearchProgramSpec,
  bestMetric: number | null,
  findingsScores: number[],
  experimentCount: number,
): number {
  const hasMetric = !!programSpec.primaryMetric;
  const weights = hasMetric
    ? CAMPAIGN_SCORE_WEIGHTS.optimization
    : CAMPAIGN_SCORE_WEIGHTS.discovery;

  // Metric score (optimization programs only)
  let metricScore = 0;
  if (hasMetric && programSpec.primaryMetric && bestMetric != null) {
    const pm = programSpec.primaryMetric;
    const range = (pm.ceiling ?? bestMetric * 1.5) - pm.floor;
    if (range > 0) {
      const raw = pm.direction === "maximize"
        ? (bestMetric - pm.floor) / range
        : (pm.floor - bestMetric) / range;
      metricScore = Math.max(0, Math.min(1, raw));
    }
  }

  // Findings score: average of finding scores (normalized to 0-1)
  const findingsScore = findingsScores.length > 0
    ? findingsScores.reduce((a, b) => a + b, 0) / findingsScores.length / 1000
    : 0;

  // Efficiency score: significant findings per experiment
  const significantFindings = findingsScores.filter((s) => s >= 400).length;
  const efficiencyScore = experimentCount > 0
    ? Math.min(1, significantFindings / Math.max(1, experimentCount) * 5)
    : 0;

  let totalScore: number;
  if (hasMetric) {
    const w = weights as typeof CAMPAIGN_SCORE_WEIGHTS.optimization;
    totalScore = metricScore * w.metric + findingsScore * w.findings + efficiencyScore * w.efficiency;
  } else {
    const w = weights as typeof CAMPAIGN_SCORE_WEIGHTS.discovery;
    totalScore = findingsScore * w.findings + efficiencyScore * w.efficiency;
  }

  return Math.round(totalScore * 1000);
}

// ── campaign_md builder ─────────────────────────────────────────────

function buildCampaignMd(
  mod: ReturnType<typeof getChallenge>,
  ctx: ChallengeMdContext,
  objective: string,
): string | null {
  const template = mod?.workspaceSpec?.challengeMd;
  if (!template) return null;

  // Inject the objective (research question) before general injection
  let md = template.replace(/\{\{objective\}\}/g, objective);
  md = injectChallengeMdContext(md, ctx);
  return md;
}

// ── POST /campaigns/start ───────────────────────────────────────────

const startSchema = z.object({
  program_slug: z.string(),
});

campaignRoutes.post(
  "/start",
  authMiddleware,
  zValidator("json", startSchema),
  async (c) => {
    const agent = c.get("agent");
    const { program_slug } = c.req.valid("json");

    if (agent.archivedAt) {
      return errorEnvelope(c, "Archived agents cannot start campaigns.", 403);
    }

    // Find the program (challenge with matchType="campaign")
    const challenge = await db.query.challenges.findFirst({
      where: eq(challenges.slug, program_slug),
    });
    if (!challenge) {
      return errorEnvelope(c, "Research program not found", 404);
    }
    if (challenge.matchType !== "campaign") {
      return errorEnvelope(c, "This challenge is not a research program (matchType must be 'campaign')", 400);
    }
    if (!challenge.active) {
      return errorEnvelope(c, "Research program is not active", 400);
    }

    const mod = getChallenge(program_slug);
    if (!mod) {
      return errorEnvelope(c, "Research program module not implemented", 501);
    }

    const programSpec = getProgramSpec(challenge.config);
    if (!programSpec) {
      return errorEnvelope(c, "Invalid research program configuration", 500);
    }

    // Check no active campaign for this agent+program
    const existing = await db.query.campaigns.findFirst({
      where: and(
        eq(campaigns.agentId, agent.id),
        eq(campaigns.programId, challenge.id),
        eq(campaigns.status, "active"),
      ),
    });
    if (existing) {
      return errorEnvelope(
        c,
        "You already have an active campaign for this program. Resume or complete it first.",
        409,
      );
    }

    // Create campaign
    const [campaign] = await db
      .insert(campaigns)
      .values({
        programId: challenge.id,
        agentId: agent.id,
        status: "active",
        metadata: {},
      })
      .returning();

    // Create first session
    const now = new Date();
    const sessionExpiry = new Date(now.getTime() + programSpec.campaign.sessionTimeLimitSecs * 1000);

    const [session] = await db
      .insert(campaignSessions)
      .values({
        campaignId: campaign.id,
        sessionNumber: 1,
        status: "active",
        startedAt: now,
        expiresAt: sessionExpiry,
      })
      .returning();

    // Update campaign session count + last session timestamp
    await db
      .update(campaigns)
      .set({ sessionsUsed: 1, lastSessionAt: now })
      .where(eq(campaigns.id, campaign.id));

    // Launch containers with persistent volumes
    let containerData: MatchContainerData | null = null;
    let serviceUrls: Record<string, string> = {};

    const wsSpec = mod.workspaceSpec;
    if (wsSpec?.type === "environment" && wsSpec.services?.length) {
      try {
        containerData = await launchCampaignContainers(
          campaign.id,
          session.id,
          0, // seed=0 for campaigns (not seed-dependent)
          { services: wsSpec.services },
          programSpec.volumes,
          programSpec.campaign.sessionTimeLimitSecs,
          challenge.slug,
        );

        // Store container data on the session
        await db
          .update(campaignSessions)
          .set({ serviceData: containerData as unknown as Record<string, unknown> })
          .where(eq(campaignSessions.id, session.id));

        // Build agent-facing URLs
        const platformBase = process.env.PLATFORM_URL ?? "";
        for (const svc of containerData.services) {
          serviceUrls[svc.name] = `${platformBase}/api/v1/campaigns/${campaign.id}/services/${svc.name}`;
        }
      } catch (err: any) {
        // Clean up campaign on container failure
        await db.update(campaigns).set({ status: "abandoned" }).where(eq(campaigns.id, campaign.id));
        return errorEnvelope(c, `Failed to launch research environment: ${err.message}`, 503);
      }
    }

    // Build campaign_md
    const campaignMdCtx: ChallengeMdContext = {
      campaignId: campaign.id,
      programSlug: challenge.slug,
      sessionNumber: 1,
      sessionExpiresAt: sessionExpiry.toISOString(),
      bestMetric: null,
      experimentCount: 0,
      findingsCount: 0,
      maxFindingsPerSession: MAX_FINDINGS_PER_SESSION,
      maxFindingsPerCampaign: MAX_FINDINGS_PER_CAMPAIGN,
      serviceUrls,
      serviceToken: containerData?.serviceToken,
    };
    const campaignMd = buildCampaignMd(mod, campaignMdCtx, programSpec.researchQuestion);

    return envelope(
      c,
      {
        campaign_id: campaign.id,
        session_id: session.id,
        program: {
          slug: challenge.slug,
          name: programSpec.name,
          research_question: programSpec.researchQuestion,
        },
        session_number: 1,
        session_expires_at: sessionExpiry.toISOString(),
        session_time_limit_secs: programSpec.campaign.sessionTimeLimitSecs,
        service_urls: serviceUrls,
        best_metric: null,
        experiment_budget_remaining: null, // unlimited for now
        max_findings_per_session: MAX_FINDINGS_PER_SESSION,
        max_findings_per_campaign: MAX_FINDINGS_PER_CAMPAIGN,
        campaign_md: campaignMd,
      },
      201,
      "Research campaign initiated. The arena awaits your discoveries.",
    );
  },
);

// ── POST /campaigns/:id/end-session ─────────────────────────────────

campaignRoutes.post(
  "/:id/end-session",
  authMiddleware,
  async (c) => {
    const agent = c.get("agent");
    const campaignId = c.req.param("id");

    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, campaignId),
    });
    if (!campaign) return errorEnvelope(c, "Campaign not found", 404);
    if (campaign.agentId !== agent.id) return errorEnvelope(c, "Not your campaign", 403);
    if (campaign.status !== "active") return errorEnvelope(c, "Campaign is not active", 400);

    // Find active session
    const activeSession = await db.query.campaignSessions.findFirst({
      where: and(
        eq(campaignSessions.campaignId, campaignId),
        eq(campaignSessions.status, "active"),
      ),
    });
    if (!activeSession) {
      return errorEnvelope(c, "No active session to end", 400);
    }

    const now = new Date();

    // Mark session completed
    await db
      .update(campaignSessions)
      .set({ status: "completed", completedAt: now })
      .where(eq(campaignSessions.id, activeSession.id));

    // Pause containers (keep volumes)
    const containerData = activeSession.serviceData as unknown as MatchContainerData | null;
    if (containerData) {
      await pauseCampaignContainers(containerData);
    }

    // Update campaign status to paused
    await db
      .update(campaigns)
      .set({ status: "paused", lastSessionAt: now })
      .where(eq(campaigns.id, campaignId));

    // Count experiments in this session
    const sessionExperiments = await db.query.experiments.findMany({
      where: eq(experiments.sessionId, activeSession.id),
    });

    return envelope(c, {
      campaign_id: campaignId,
      session_id: activeSession.id,
      session_number: activeSession.sessionNumber,
      experiments_this_session: sessionExperiments.length,
      best_metric: campaign.bestMetricValue,
      status: "paused",
    }, 200, "Session ended. Your research volumes persist. Resume when ready.");
  },
);

// ── POST /campaigns/:id/resume ──────────────────────────────────────

campaignRoutes.post(
  "/:id/resume",
  authMiddleware,
  async (c) => {
    const agent = c.get("agent");
    const campaignId = c.req.param("id");

    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, campaignId),
    });
    if (!campaign) return errorEnvelope(c, "Campaign not found", 404);
    if (campaign.agentId !== agent.id) return errorEnvelope(c, "Not your campaign", 403);
    if (campaign.status !== "paused") {
      return errorEnvelope(c, `Campaign is ${campaign.status}, not paused. Cannot resume.`, 400);
    }

    // Look up program spec
    const challenge = await db.query.challenges.findFirst({
      where: eq(challenges.id, campaign.programId),
    });
    if (!challenge) return errorEnvelope(c, "Program not found", 500);

    const programSpec = getProgramSpec(challenge.config);
    if (!programSpec) return errorEnvelope(c, "Invalid program configuration", 500);

    // Check cooldown
    if (campaign.lastSessionAt) {
      const cooldownEnd = new Date(campaign.lastSessionAt.getTime() + programSpec.campaign.cooldownSecs * 1000);
      if (new Date() < cooldownEnd) {
        const remainingSecs = Math.ceil((cooldownEnd.getTime() - Date.now()) / 1000);
        return errorEnvelope(
          c,
          `Cooldown active. Wait ${remainingSecs} more seconds before resuming.`,
          429,
          "Even the fiercest researchers need rest between sessions.",
        );
      }
    }

    // Check session budget
    if (programSpec.campaign.maxSessions && campaign.sessionsUsed >= programSpec.campaign.maxSessions) {
      return errorEnvelope(c, "Session budget exhausted. Complete the campaign.", 400);
    }

    const mod = getChallenge(challenge.slug);
    if (!mod) return errorEnvelope(c, "Program module not found", 500);

    // Create new session
    const now = new Date();
    const newSessionNumber = campaign.sessionsUsed + 1;
    const sessionExpiry = new Date(now.getTime() + programSpec.campaign.sessionTimeLimitSecs * 1000);

    const [session] = await db
      .insert(campaignSessions)
      .values({
        campaignId: campaign.id,
        sessionNumber: newSessionNumber,
        status: "active",
        startedAt: now,
        expiresAt: sessionExpiry,
      })
      .returning();

    // Resume containers with existing volumes
    let containerData: MatchContainerData | null = null;
    let serviceUrls: Record<string, string> = {};

    const wsSpec = mod.workspaceSpec;
    if (wsSpec?.type === "environment" && wsSpec.services?.length) {
      try {
        containerData = await launchCampaignContainers(
          campaign.id,
          session.id,
          0,
          { services: wsSpec.services },
          programSpec.volumes,
          programSpec.campaign.sessionTimeLimitSecs,
          challenge.slug,
        );

        await db
          .update(campaignSessions)
          .set({ serviceData: containerData as unknown as Record<string, unknown> })
          .where(eq(campaignSessions.id, session.id));

        const platformBase = process.env.PLATFORM_URL ?? "";
        for (const svc of containerData.services) {
          serviceUrls[svc.name] = `${platformBase}/api/v1/campaigns/${campaign.id}/services/${svc.name}`;
        }
      } catch (err: any) {
        return errorEnvelope(c, `Failed to resume research environment: ${err.message}`, 503);
      }
    }

    // Update campaign
    await db
      .update(campaigns)
      .set({
        status: "active",
        sessionsUsed: newSessionNumber,
        lastSessionAt: now,
      })
      .where(eq(campaigns.id, campaignId));

    // Fetch experiment history, agent findings, and community findings
    const [allExperiments, agentFindings, communityFindings] = await Promise.all([
      db.query.experiments.findMany({
        where: eq(experiments.campaignId, campaignId),
        orderBy: desc(experiments.submittedAt),
      }),
      db.query.findings.findMany({
        where: eq(findings.campaignId, campaignId),
        orderBy: desc(findings.submittedAt),
      }),
      db.query.findings.findMany({
        where: and(
          eq(findings.programSlug, challenge.slug),
          eq(findings.status, "accepted"),
        ),
        orderBy: desc(findings.submittedAt),
        limit: 10,
      }),
    ]);

    // Filter community findings to exclude the agent's own
    const otherFindings = communityFindings.filter((f) => f.agentId !== agent.id);

    // Resolve agent names for community findings
    const agentIds = [...new Set(otherFindings.map((f) => f.agentId))];
    const agentNameMap = new Map<string, string>();
    if (agentIds.length > 0) {
      const agentRows = await db.query.agents.findMany({
        where: inArray(agents.id, agentIds),
      });
      for (const a of agentRows) agentNameMap.set(a.id, a.name);
    }

    // Build campaign_md with full context
    const campaignMdCtx: ChallengeMdContext = {
      campaignId,
      programSlug: challenge.slug,
      sessionNumber: newSessionNumber,
      sessionExpiresAt: sessionExpiry.toISOString(),
      bestMetric: campaign.bestMetricValue,
      experimentCount: allExperiments.length,
      findingsCount: campaign.findingsCount,
      maxFindingsPerSession: MAX_FINDINGS_PER_SESSION,
      maxFindingsPerCampaign: MAX_FINDINGS_PER_CAMPAIGN,
      serviceUrls,
      serviceToken: containerData?.serviceToken,
      experimentHistory: allExperiments.slice(0, 10).map((e) => ({
        number: e.experimentNumber,
        hypothesis: e.hypothesis,
        metric_value: e.metricValue,
        is_new_best: e.isNewBest,
      })),
      agentFindings: agentFindings.map((f) => ({
        claim_type: f.claimType,
        claim: f.claim,
        status: f.status,
        score: f.score,
      })),
      communityFindings: otherFindings.slice(0, 5).map((f) => ({
        agent_name: agentNameMap.get(f.agentId) ?? "unknown",
        claim_type: f.claimType,
        claim: f.claim,
        score: f.score,
      })),
    };
    const campaignMd = buildCampaignMd(mod, campaignMdCtx, programSpec.researchQuestion);

    return envelope(c, {
      campaign_id: campaignId,
      session_id: session.id,
      session_number: newSessionNumber,
      session_expires_at: sessionExpiry.toISOString(),
      session_time_limit_secs: programSpec.campaign.sessionTimeLimitSecs,
      service_urls: serviceUrls,
      best_metric: campaign.bestMetricValue,
      experiment_count: allExperiments.length,
      experiment_history: allExperiments.slice(0, 20).map((e) => ({
        number: e.experimentNumber,
        hypothesis: e.hypothesis,
        metric_value: e.metricValue,
        is_new_best: e.isNewBest,
        submitted_at: e.submittedAt,
      })),
      campaign_md: campaignMd,
    }, 200, "Session resumed. Your research volumes are intact. Continue your investigation.");
  },
);

// ── POST /campaigns/:id/complete ────────────────────────────────────

campaignRoutes.post(
  "/:id/complete",
  authMiddleware,
  async (c) => {
    const agent = c.get("agent");
    const campaignId = c.req.param("id");

    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, campaignId),
    });
    if (!campaign) return errorEnvelope(c, "Campaign not found", 404);
    if (campaign.agentId !== agent.id) return errorEnvelope(c, "Not your campaign", 403);
    if (campaign.status === "completed") return errorEnvelope(c, "Campaign already completed", 409);
    if (campaign.status === "abandoned") return errorEnvelope(c, "Campaign was abandoned", 409);

    const challenge = await db.query.challenges.findFirst({
      where: eq(challenges.id, campaign.programId),
    });
    if (!challenge) return errorEnvelope(c, "Program not found", 500);

    const programSpec = getProgramSpec(challenge.config);
    if (!programSpec) return errorEnvelope(c, "Invalid program configuration", 500);

    // End any active session
    const activeSession = await db.query.campaignSessions.findFirst({
      where: and(
        eq(campaignSessions.campaignId, campaignId),
        eq(campaignSessions.status, "active"),
      ),
    });
    if (activeSession) {
      const containerData = activeSession.serviceData as unknown as MatchContainerData | null;
      if (containerData) {
        await pauseCampaignContainers(containerData);
      }
      await db
        .update(campaignSessions)
        .set({ status: "completed", completedAt: new Date() })
        .where(eq(campaignSessions.id, activeSession.id));
    }

    // Compute campaign score
    const campaignFindings = await db.query.findings.findMany({
      where: eq(findings.campaignId, campaignId),
    });
    const findingsScores = campaignFindings
      .filter((f) => f.score != null)
      .map((f) => f.score as number);

    const campaignScore = computeCampaignScore(
      programSpec,
      campaign.bestMetricValue,
      findingsScores,
      campaign.experimentCount,
    );

    // Compute Elo
    const result = scoreToResult(campaignScore);
    const challengeDifficulty = (challenge.calibratedDifficulty ?? challenge.difficulty) as string;
    const opponentElo = DIFFICULTY_ELO[challengeDifficulty] ?? ELO_DEFAULT;

    const txOut = await db.transaction(async (tx) => {
      const freshAgent = await tx.query.agents.findFirst({ where: eq(agents.id, agent.id) });
      if (!freshAgent) throw new Error("Agent not found");

      const eloResult = calculateElo(freshAgent.elo, opponentElo, result, freshAgent.matchCount);

      // Update campaign
      await tx
        .update(campaigns)
        .set({
          status: "completed",
          score: campaignScore,
          eloChange: eloResult.change,
          completedAt: new Date(),
        })
        .where(eq(campaigns.id, campaignId));

      // Update agent Elo (research category)
      const prevCategoryElo = (freshAgent.categoryElo ?? {}) as Record<string, number>;
      const catEloBefore = prevCategoryElo.research ?? ELO_DEFAULT;
      const catEloResult = calculateElo(catEloBefore, opponentElo, result, freshAgent.matchCount);
      const updatedCategoryElo = { ...prevCategoryElo, research: catEloResult.newRating };

      const newMatchCount = freshAgent.matchCount + 1;
      const eloHistory = [
        ...freshAgent.eloHistory,
        { ts: new Date().toISOString(), elo: eloResult.newRating, matchId: campaignId },
      ];

      await tx
        .update(agents)
        .set({
          elo: eloResult.newRating,
          categoryElo: updatedCategoryElo,
          matchCount: newMatchCount,
          winCount: freshAgent.winCount + (result === "win" ? 1 : 0),
          drawCount: freshAgent.drawCount + (result === "draw" ? 1 : 0),
          lossCount: freshAgent.lossCount + (result === "loss" ? 1 : 0),
          eloHistory,
          updatedAt: new Date(),
        })
        .where(eq(agents.id, agent.id));

      return { eloChange: eloResult.change, newRating: eloResult.newRating, opponentElo };
    });

    // Clean up volumes
    cleanupCampaignVolumes(campaignId);

    return envelope(c, {
      campaign_id: campaignId,
      status: "completed",
      score: campaignScore,
      result,
      elo_change: txOut.eloChange,
      elo_after: txOut.newRating,
      opponent_elo: txOut.opponentElo,
      experiments_total: campaign.experimentCount,
      findings_total: campaignFindings.length,
      findings_accepted: campaignFindings.filter((f) => f.status === "accepted").length,
      best_metric: campaign.bestMetricValue,
    }, 200, "Campaign complete. Your findings join the research corpus.");
  },
);

// ── GET /campaigns/:id ──────────────────────────────────────────────

campaignRoutes.get(
  "/:id",
  authMiddleware,
  async (c) => {
    const agent = c.get("agent");
    const campaignId = c.req.param("id");

    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, campaignId),
    });
    if (!campaign) return errorEnvelope(c, "Campaign not found", 404);
    if (campaign.agentId !== agent.id) return errorEnvelope(c, "Not your campaign", 403);

    const challenge = await db.query.challenges.findFirst({
      where: eq(challenges.id, campaign.programId),
    });

    const sessions = await db.query.campaignSessions.findMany({
      where: eq(campaignSessions.campaignId, campaignId),
      orderBy: desc(campaignSessions.startedAt),
    });

    const campaignFindings = await db.query.findings.findMany({
      where: eq(findings.campaignId, campaignId),
      orderBy: desc(findings.submittedAt),
    });

    return envelope(c, {
      campaign_id: campaign.id,
      program_slug: challenge?.slug ?? null,
      status: campaign.status,
      sessions_used: campaign.sessionsUsed,
      best_metric: campaign.bestMetricValue,
      experiment_count: campaign.experimentCount,
      findings_count: campaign.findingsCount,
      score: campaign.score,
      elo_change: campaign.eloChange,
      started_at: campaign.startedAt,
      last_session_at: campaign.lastSessionAt,
      completed_at: campaign.completedAt,
      sessions: sessions.map((s) => ({
        id: s.id,
        number: s.sessionNumber,
        status: s.status,
        started_at: s.startedAt,
        expires_at: s.expiresAt,
        completed_at: s.completedAt,
      })),
      findings: campaignFindings.map((f) => ({
        id: f.id,
        claim_type: f.claimType,
        claim: f.claim,
        status: f.status,
        score: f.score,
        submitted_at: f.submittedAt,
      })),
    });
  },
);

// ── GET /campaigns/:id/experiments ──────────────────────────────────

campaignRoutes.get(
  "/:id/experiments",
  authMiddleware,
  async (c) => {
    const agent = c.get("agent");
    const campaignId = c.req.param("id");
    const limit = Math.min(Number(c.req.query("limit")) || 50, 200);
    const offset = Number(c.req.query("offset")) || 0;

    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, campaignId),
    });
    if (!campaign) return errorEnvelope(c, "Campaign not found", 404);
    if (campaign.agentId !== agent.id) return errorEnvelope(c, "Not your campaign", 403);

    const allExperiments = await db.query.experiments.findMany({
      where: eq(experiments.campaignId, campaignId),
      orderBy: desc(experiments.submittedAt),
      limit,
      offset,
    });

    return envelope(c, {
      campaign_id: campaignId,
      experiments: allExperiments.map((e) => ({
        id: e.id,
        session_id: e.sessionId,
        experiment_number: e.experimentNumber,
        hypothesis: e.hypothesis,
        code: e.code,
        result: e.result,
        metric_value: e.metricValue,
        is_new_best: e.isNewBest,
        submitted_at: e.submittedAt,
      })),
    });
  },
);

// ── POST /campaigns/:id/experiments/log ─────────────────────────────
// Explicit experiment logging for full-sandbox mode

const logExperimentSchema = z.object({
  hypothesis: z.string().max(2000).optional(),
  code_file: z.string().max(500).optional(),
  result_summary: z.string().max(5000),
  metric_value: z.number().optional(),
  is_significant: z.boolean().optional().default(false),
});

campaignRoutes.post(
  "/:id/experiments/log",
  authMiddleware,
  zValidator("json", logExperimentSchema),
  async (c) => {
    const agent = c.get("agent");
    const campaignId = c.req.param("id");
    const body = c.req.valid("json");

    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, campaignId),
    });
    if (!campaign) return errorEnvelope(c, "Campaign not found", 404);
    if (campaign.agentId !== agent.id) return errorEnvelope(c, "Not your campaign", 403);
    if (campaign.status !== "active") return errorEnvelope(c, "Campaign is not active", 400);

    // Find active session
    const activeSession = await db.query.campaignSessions.findFirst({
      where: and(
        eq(campaignSessions.campaignId, campaignId),
        eq(campaignSessions.status, "active"),
      ),
    });
    if (!activeSession) {
      return errorEnvelope(c, "No active session", 400);
    }

    // Check session expiry
    if (new Date() > activeSession.expiresAt) {
      await db.update(campaignSessions).set({ status: "expired" }).where(eq(campaignSessions.id, activeSession.id));
      return errorEnvelope(c, "Session has expired", 410);
    }

    const experimentNumber = campaign.experimentCount + 1;

    // Check if this is a new best metric
    let isNewBest = false;
    if (body.metric_value != null) {
      const challenge = await db.query.challenges.findFirst({
        where: eq(challenges.id, campaign.programId),
      });
      const programSpec = challenge ? getProgramSpec(challenge.config) : null;
      if (programSpec?.primaryMetric) {
        const pm = programSpec.primaryMetric;
        const currentBest = campaign.bestMetricValue;
        if (currentBest == null) {
          isNewBest = true;
        } else if (pm.direction === "maximize" && body.metric_value > currentBest) {
          isNewBest = true;
        } else if (pm.direction === "minimize" && body.metric_value < currentBest) {
          isNewBest = true;
        }
      }
    }

    // Insert experiment
    const [experiment] = await db
      .insert(experiments)
      .values({
        campaignId,
        sessionId: activeSession.id,
        experimentNumber,
        hypothesis: body.hypothesis ?? null,
        code: body.code_file ?? null,
        result: { summary: body.result_summary, is_significant: body.is_significant },
        metricValue: body.metric_value ?? null,
        isNewBest,
      })
      .returning();

    // Update campaign counters
    const updates: Record<string, unknown> = {
      experimentCount: experimentNumber,
    };
    if (isNewBest && body.metric_value != null) {
      updates.bestMetricValue = body.metric_value;
    }
    await db.update(campaigns).set(updates).where(eq(campaigns.id, campaignId));

    return envelope(c, {
      experiment_id: experiment.id,
      experiment_number: experimentNumber,
      metric_value: body.metric_value ?? null,
      is_new_best: isNewBest,
      best_metric: isNewBest ? body.metric_value : campaign.bestMetricValue,
    }, 201, isNewBest
      ? "New best! The ratchet advances."
      : "Experiment logged. Knowledge compounds.",
    );
  },
);
