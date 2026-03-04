import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, desc, and, sql, inArray } from "drizzle-orm";
import { db, matches, agents, challenges, challengeTracks, trackProgress } from "@clawdiators/db";
import { ELO_DEFAULT, ELO_FLOOR, DIFFICULTY_ELO, HEARTBEAT_GRACE_PERIOD_MS, VERIFIED_ELO_BONUS, BENCHMARK_ELO_BONUS } from "@clawdiators/shared";
import type { TrackScoringMethod, HarnessInfo } from "@clawdiators/shared";
import { authMiddleware } from "../middleware/auth.js";
import { envelope, errorEnvelope } from "../middleware/envelope.js";
import { generateBoutName, generateFlavourText, computeTitle, computeAllTitles } from "../services/whimsy.js";
import { calculateElo, scoreToResult } from "../services/elo.js";
import { getChallenge } from "../challenges/registry.js";
import { evaluate } from "../challenges/evaluator.js";
import { injectChallengeMdContext } from "../challenges/workspace.js";
import { recalibrateChallenge } from "../services/calibration.js";
import { selectVariant, mergeVariantConfig } from "../services/variants.js";
import { computeTrackScore } from "../services/tracks.js";
import { replayStepSchema } from "../schemas/replay.js";
import { upsertChallengeMemory } from "../services/memory.js";
import { validateTrajectory } from "../services/trajectory-validation.js";
import { launchMatchContainers, stopMatchContainers } from "../services/container-orchestrator.js";
import type { MatchContainerData } from "../services/container-orchestrator.js";

export const matchRoutes = new Hono();

// POST /matches/enter — enter a match
const enterSchema = z.object({
  challenge_slug: z.string().optional().default("cipher-forge"),
  memoryless: z.boolean().optional().default(false),
});

matchRoutes.post(
  "/enter",
  authMiddleware,
  zValidator("json", enterSchema),
  async (c) => {
    const agent = c.get("agent");
    const { challenge_slug, memoryless } = c.req.valid("json");

    // Reject archived agents
    if (agent.archivedAt) {
      return errorEnvelope(
        c,
        "Archived agents cannot enter matches. Unarchive first.",
        403,
        "The arena does not welcome ghosts. Unarchive yourself to return.",
      );
    }

    // Find challenge
    const challenge = await db.query.challenges.findFirst({
      where: eq(challenges.slug, challenge_slug),
    });
    if (!challenge) {
      return errorEnvelope(c, "Challenge not found", 404);
    }
    if (!challenge.active) {
      return errorEnvelope(c, "Challenge is not active yet", 400, "Patience, gladiator. This trial is not yet open.");
    }

    // Look up the challenge module
    const mod = getChallenge(challenge_slug);
    if (!mod) {
      return errorEnvelope(c, "Challenge module not implemented", 501, "This trial is still being forged in the arena.");
    }

    // Check for existing active match
    const existingActive = await db.query.matches.findFirst({
      where: and(
        eq(matches.agentId, agent.id),
        eq(matches.status, "active"),
      ),
    });
    if (existingActive) {
      // Check if expired
      if (new Date() > existingActive.expiresAt) {
        await db
          .update(matches)
          .set({ status: "expired" })
          .where(eq(matches.id, existingActive.id));
      } else {
        // Check if the existing match is for a different challenge
        if (existingActive.challengeId !== challenge.id) {
          const existingChallenge = await db.query.challenges.findFirst({
            where: eq(challenges.id, existingActive.challengeId),
          });
          return errorEnvelope(
            c,
            `You have an active match for "${existingChallenge?.name ?? "another challenge"}". Complete or wait for it to expire before entering a different challenge.`,
            409,
            "One bout at a time, gladiator. Finish your current match before entering a new arena.",
          );
        }

        // Look up the challenge for the *existing* match, not the requested one
        const existingChallenge = await db.query.challenges.findFirst({
          where: eq(challenges.id, existingActive.challengeId),
        });
        const existingMod = existingChallenge ? getChallenge(existingChallenge.slug) : null;
        const existingChallengeMd = existingMod?.workspaceSpec?.challengeMd
          ? injectChallengeMdContext(existingMod.workspaceSpec.challengeMd, {
              seed: existingActive.seed,
              attemptNumber: existingActive.attemptNumber,
              verified: existingActive.verified,
              memoryless: existingActive.memoryless,
              constraints: existingChallenge?.constraints as Record<string, unknown> | null ?? null,
              matchId: existingActive.id,
              agentHarness: (agent.harness as HarnessInfo | null) ?? null,
            })
          : null;
        const existingWorkspaceUrl = `/api/v1/challenges/${existingChallenge?.slug ?? challenge.slug}/workspace?seed=${existingActive.seed}`;
        return envelope(c, {
          match_id: existingActive.id,
          bout_name: existingActive.boutName,
          status: "active",
          objective: existingActive.objective,
          time_limit_secs: existingChallenge?.timeLimitSecs ?? challenge.timeLimitSecs,
          expires_at: existingActive.expiresAt,
          match_type: existingChallenge?.matchType ?? challenge.matchType,
          workspace_url: existingWorkspaceUrl,
          challenge_md: existingChallengeMd,
          submission_spec: existingMod?.submissionSpec ?? null,
          submit_url: `/api/v1/matches/${existingActive.id}/submit`,
          attempt_number: existingActive.attemptNumber,
          memoryless: existingActive.memoryless,
          verified: existingActive.verified,
          challenge: existingChallenge ? {
            slug: existingChallenge.slug,
            name: existingChallenge.name,
          } : undefined,
          note: `You already have an active match for "${existingChallenge?.name ?? "unknown"}". Complete or wait for it to expire.`,
        }, 200, "Your current bout awaits, gladiator. Do not keep the crowd waiting.");
      }
    }

    // Generate match
    const seed = Math.floor(Math.random() * 2147483647);
    const boutName = generateBoutName(seed);

    // Select variant if challenge has A/B variants
    let variantId: string | null = null;
    let effectiveConfig = challenge.config;
    if (challenge.variants && challenge.variants.length > 0) {
      const selected = selectVariant(challenge.variants, seed);
      variantId = selected.id;
      effectiveConfig = mergeVariantConfig(challenge.config as Record<string, unknown>, selected) as typeof challenge.config;
    }

    const data = mod.generateData(seed, effectiveConfig);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + challenge.timeLimitSecs * 1000);

    // Compute attempt number (count previous completed matches for this agent+challenge)
    const [{ count: previousCompleted }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(matches)
      .where(
        and(
          eq(matches.agentId, agent.id),
          eq(matches.challengeId, challenge.id),
          eq(matches.status, "completed"),
        ),
      );
    const attemptNumber = previousCompleted + 1;

    const [match] = await db
      .insert(matches)
      .values({
        boutName,
        challengeId: challenge.id,
        agentId: agent.id,
        seed,
        status: "active",
        objective: data.objective,
        startedAt: now,
        expiresAt,
        variantId,
        attemptNumber,
        memoryless,
        verified: false,
      })
      .returning();

    const extraUrls: Record<string, string> = {};
    if (challenge.matchType === "multi-checkpoint") {
      extraUrls.checkpoint_url = `/api/v1/matches/${match.id}/checkpoint`;
    }
    if (challenge.matchType === "long-running") {
      extraUrls.heartbeat_url = `/api/v1/matches/${match.id}/heartbeat`;
    }

    // For "environment" type challenges: launch live service containers
    let containerData: MatchContainerData | null = null;
    let serviceUrls: Record<string, string> = {};
    let mcpServerUrls: Record<string, { url: string; token: string }> = {};
    let proxyUrl: string | undefined;

    const wsSpec = mod.workspaceSpec;
    if (wsSpec?.type === "environment" && (wsSpec.services?.length || wsSpec.mcpServers?.length)) {
      try {
        containerData = await launchMatchContainers(match.id, seed, {
          services: wsSpec.services,
          mcpServers: wsSpec.mcpServers,
        });

        // Store container data in DB for the proxy routes and cleanup
        await db
          .update(matches)
          .set({ serviceData: containerData as unknown as Record<string, unknown> })
          .where(eq(matches.id, match.id));

        // Build agent-facing URLs (all routed through the API as proxy)
        const platformBase = process.env.PLATFORM_URL ?? "";
        for (const svc of containerData.services) {
          serviceUrls[svc.name] = `${platformBase}/api/v1/matches/${match.id}/services/${svc.name}`;
        }
        for (const mcp of containerData.mcpServers) {
          mcpServerUrls[mcp.name] = {
            url: `${platformBase}/api/v1/matches/${match.id}/mcp/${mcp.name}`,
            token: mcp.token,
          };
        }
        if (wsSpec.proxy) {
          proxyUrl = `${platformBase}/api/v1/matches/${match.id}/proxy`;
        }
      } catch (err: any) {
        // Container launch failed — expire match and report error
        await db.update(matches).set({ status: "expired" }).where(eq(matches.id, match.id));
        return errorEnvelope(
          c,
          `Failed to launch challenge environment: ${err.message}`,
          503,
          "The arena's simulation infrastructure is temporarily unavailable. Try again shortly.",
        );
      }
    }

    return envelope(
      c,
      {
        match_id: match.id,
        bout_name: boutName,
        challenge: {
          slug: challenge.slug,
          name: challenge.name,
          category: challenge.category,
          match_type: challenge.matchType,
        },
        objective: data.objective,
        time_limit_secs: challenge.timeLimitSecs,
        started_at: match.startedAt,
        expires_at: match.expiresAt,
        workspace_url: `/api/v1/challenges/${challenge.slug}/workspace?seed=${seed}&match_id=${match.id}`,
        challenge_md: mod.workspaceSpec?.challengeMd
          ? injectChallengeMdContext(mod.workspaceSpec.challengeMd, {
              seed,
              attemptNumber,
              verified: false,
              memoryless,
              constraints: challenge.constraints as Record<string, unknown> | null ?? null,
              matchId: match.id,
              agentHarness: (agent.harness as HarnessInfo | null) ?? null,
              serviceUrls: Object.keys(serviceUrls).length ? serviceUrls : undefined,
              serviceToken: containerData?.serviceToken,
              mcpServers: Object.keys(mcpServerUrls).length ? mcpServerUrls : undefined,
              proxyUrl,
            })
          : null,
        submission_spec: mod.submissionSpec ?? null,
        submit_url: `/api/v1/matches/${match.id}/submit`,
        attempt_number: attemptNumber,
        memoryless,
        verified: false,
        constraints: challenge.constraints ? {
          ...challenge.constraints,
          advisory: true,
        } : undefined,
        ...extraUrls,
      },
      201,
      `${boutName} begins! Download your workspace and get to work. You have ${challenge.timeLimitSecs} seconds.`,
    );
  },
);

// POST /matches/:matchId/submit — submit answer
const submitSchema = z.object({
  answer: z.record(z.unknown()),
  metadata: z.object({
    token_count: z.number().optional(),
    tool_call_count: z.number().optional(),
    model_id: z.string().optional(),
    harness_id: z.string().optional(),
    wall_clock_secs: z.number().optional(),
    replay_log: z.array(replayStepSchema).max(1000).optional(),
  }).optional(),
});

matchRoutes.post(
  "/:matchId/submit",
  authMiddleware,
  zValidator("json", submitSchema),
  async (c) => {
    const agent = c.get("agent");
    const matchId = c.req.param("matchId");
    const { answer, metadata } = c.req.valid("json");

    // Get match
    const match = await db.query.matches.findFirst({
      where: eq(matches.id, matchId),
    });
    if (!match) {
      return errorEnvelope(c, "Match not found", 404);
    }
    if (match.agentId !== agent.id) {
      return errorEnvelope(c, "This is not your match", 403, "Impersonation is not tolerated in the arena.");
    }
    if (match.status === "completed") {
      return errorEnvelope(c, "Match already completed", 409, "The bout has already concluded.");
    }
    if (match.status === "expired" || new Date() > match.expiresAt) {
      if (match.status !== "expired") {
        await db.update(matches).set({ status: "expired" }).where(eq(matches.id, matchId));
      }
      return errorEnvelope(c, "Match has expired", 410, "The sands of time have run out, gladiator.");
    }

    // Find challenge to look up module
    const challenge = await db.query.challenges.findFirst({
      where: eq(challenges.id, match.challengeId),
    });
    if (!challenge) {
      return errorEnvelope(c, "Challenge not found", 500);
    }
    const mod = getChallenge(challenge.slug);
    if (!mod) {
      return errorEnvelope(c, "Challenge module not found", 500);
    }

    const now = new Date();

    // Build effective config (merge variant overrides if applicable)
    let submitConfig = challenge.config;
    if (match.variantId && challenge.variants) {
      const variant = challenge.variants.find((v) => v.id === match.variantId);
      if (variant) {
        submitConfig = { ...challenge.config, ...variant.config_overrides };
      }
    }

    // Generate ground truth from seed via module
    const data = mod.generateData(match.seed, submitConfig);

    // Trajectory validation: check replay_log if submitted
    let isVerified = false;
    let trajectoryValidation: import("@clawdiators/shared").TrajectoryValidationResult | null = null;

    if (metadata?.replay_log && metadata.replay_log.length > 0) {
      trajectoryValidation = validateTrajectory(
        metadata.replay_log,
        match.startedAt,
        now,
      );
      isVerified = trajectoryValidation.valid;
    }

    // Evaluate via dispatcher (deterministic, test-suite, or custom-script)
    const scoringInput = {
      submission: answer,
      groundTruth: data.groundTruth,
      startedAt: match.startedAt,
      submittedAt: now,
      apiCallCount: match.apiCallLog.length,
      checkpoints: match.checkpoints,
    };
    // Validate submission structure and collect warnings for the agent
    const submissionWarnings = mod.validateSubmission
      ? mod.validateSubmission(answer, data.groundTruth)
      : [];

    // Build trajectory summary for efficiency scoring
    let trajectorySummary: { total_input_tokens: number; total_output_tokens: number; total_llm_calls: number } | null = null;
    if (isVerified && metadata?.replay_log) {
      let totalInput = 0;
      let totalOutput = 0;
      let totalCalls = 0;
      for (const step of metadata.replay_log) {
        if (step.type === "llm_call") {
          totalInput += step.input_tokens;
          totalOutput += step.output_tokens;
          totalCalls += 1;
        }
      }
      trajectorySummary = { total_input_tokens: totalInput, total_output_tokens: totalOutput, total_llm_calls: totalCalls };
    }

    // Extract tier from community spec config (if present)
    const challengeConfig = challenge.config as Record<string, unknown> | null;
    const communitySpec = challengeConfig?.communitySpec as Record<string, unknown> | undefined;
    const envSpec = communitySpec?.environment as { tier?: string; timeout?: number; image?: string; capabilities?: string[] } | undefined;
    const tier = (envSpec?.tier ?? "sandboxed") as import("@clawdiators/shared").EnvironmentTier;

    // Build env vars for Tier 2+ (e.g., ANTHROPIC_API_KEY for LLM-as-judge)
    const evalEnvVars: Record<string, string> = {};
    const scoringConfig = communitySpec?.scoring as { judgeModel?: string } | undefined;
    if (tier !== "sandboxed" && scoringConfig?.judgeModel && process.env.ANTHROPIC_API_KEY) {
      evalEnvVars.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    }

    // For environment challenges: build a metrics fetcher to query live services before scoring
    const matchContainerData = (match as any).serviceData as MatchContainerData | null;
    let serviceMetricsFetcher: (() => Promise<Record<string, Record<string, unknown>>>) | undefined;
    if (matchContainerData?.services?.length) {
      const mod_ = mod; // capture
      serviceMetricsFetcher = async () => {
        const metrics: Record<string, Record<string, unknown>> = {};
        for (const svc of matchContainerData.services) {
          const svcSpec = mod_.workspaceSpec?.services?.find((s) => s.name === svc.name);
          if (!svcSpec?.metricsEndpoint) continue;
          try {
            const res = await fetch(`${svc.internalUrl}${svcSpec.metricsEndpoint}`, {
              headers: { authorization: `Bearer ${matchContainerData.serviceToken}` },
              signal: AbortSignal.timeout(5_000),
            });
            if (res.ok) metrics[svc.name] = await res.json() as Record<string, unknown>;
          } catch {
            // Best-effort — missing metrics won't block scoring
          }
        }
        return metrics;
      };
    }

    const { result: evalResult, log: evaluationLog } = await evaluate(mod, scoringInput, {
      verified: isVerified,
      constraints: challenge.constraints as import("@clawdiators/shared").ChallengeConstraints | null,
      trajectory: trajectorySummary,
      tier: tier !== "sandboxed" ? tier : undefined,
      envVars: Object.keys(evalEnvVars).length > 0 ? evalEnvVars : undefined,
      timeoutSecs: envSpec?.timeout,
      image: envSpec?.image,
      serviceMetricsFetcher,
    });

    // Stop environment containers now that scoring is complete (best-effort)
    if (matchContainerData) {
      stopMatchContainers(matchContainerData);
    }
    const { breakdown } = evalResult;

    // Determine result (solo calibration)
    const result = scoreToResult(breakdown.total);

    // IRT-Elo: use challenge difficulty as opponent rating
    const challengeDifficulty = (challenge.calibratedDifficulty ?? challenge.difficulty) as string;
    const opponentElo = DIFFICULTY_ELO[challengeDifficulty] ?? ELO_DEFAULT;
    const eloResult = calculateElo(
      agent.elo,
      opponentElo,
      result,
      agent.matchCount,
    );

    // Apply Elo bonus for verified wins (trajectory submitted and valid)
    // Benchmark grade (verified + memoryless + first attempt): 1.2x
    // Verified only: 1.1x
    let eloChange = eloResult.change;
    if (isVerified && eloResult.change > 0) {
      const isBenchmark = match.memoryless && match.attemptNumber === 1;
      const bonus = isBenchmark ? BENCHMARK_ELO_BONUS : VERIFIED_ELO_BONUS;
      eloChange = Math.round(eloResult.change * bonus);
    }

    // Generate flavour text (use bonus-adjusted eloChange for consistency with stored value)
    const flavourText = generateFlavourText(
      result,
      agent.name,
      match.boutName,
      breakdown.total,
      eloChange,
      match.seed,
    );

    // Apply verified Elo bonus to final rating if applicable
    const finalEloAfter = eloChange !== eloResult.change
      ? Math.max(ELO_FLOOR, agent.elo + eloChange)
      : eloResult.newRating;

    // Update match
    await db
      .update(matches)
      .set({
        status: "completed",
        result,
        submission: answer,
        submittedAt: now,
        score: breakdown.total,
        scoreBreakdown: breakdown,
        eloBefore: agent.elo,
        eloAfter: finalEloAfter,
        eloChange,
        flavourText,
        completedAt: now,
        evaluationLog,
        submissionMetadata: metadata ?? null,
        harnessId: metadata?.harness_id ?? null,
        verified: isVerified,
      })
      .where(eq(matches.id, matchId));

    // Update agent stats
    const newMatchCount = agent.matchCount + 1;
    const newWinCount = agent.winCount + (result === "win" ? 1 : 0);
    const newDrawCount = agent.drawCount + (result === "draw" ? 1 : 0);
    const newLossCount = agent.lossCount + (result === "loss" ? 1 : 0);

    // Streak tracking
    let newStreak = agent.currentStreak;
    if (result === "win") {
      newStreak = newStreak > 0 ? newStreak + 1 : 1;
    } else if (result === "loss") {
      newStreak = newStreak < 0 ? newStreak - 1 : -1;
    } else {
      newStreak = 0;
    }
    const newBestStreak = Math.max(agent.bestStreak, newStreak);

    // Elo history
    const eloHistory = [
      ...agent.eloHistory,
      {
        ts: now.toISOString(),
        elo: finalEloAfter,
        matchId: match.id,
      },
    ];

    // Compute new title
    const agentStats = {
      matchCount: newMatchCount,
      winCount: newWinCount,
      elo: finalEloAfter,
      bestStreak: newBestStreak,
    };
    const newTitle = computeTitle(agentStats);
    const allTitles = computeAllTitles(agentStats);

    // Update category Elo
    const prevCategoryElo = (agent.categoryElo ?? {}) as Record<string, number>;
    const catKey = challenge.category;
    const catEloBefore = prevCategoryElo[catKey] ?? ELO_DEFAULT;
    const catEloResult = calculateElo(catEloBefore, opponentElo, result, agent.matchCount);
    const updatedCategoryElo = { ...prevCategoryElo, [catKey]: catEloResult.newRating };

    await db
      .update(agents)
      .set({
        elo: finalEloAfter,
        categoryElo: updatedCategoryElo,
        matchCount: newMatchCount,
        winCount: newWinCount,
        drawCount: newDrawCount,
        lossCount: newLossCount,
        currentStreak: newStreak,
        bestStreak: newBestStreak,
        eloHistory,
        title: newTitle,
        titles: allTitles,
        updatedAt: now,
      })
      .where(eq(agents.id, agent.id));

    // Increment calibration sample size and recalibrate every 20 submissions
    const newSampleSize = (challenge.calibrationSampleSize ?? 0) + 1;
    await db
      .update(challenges)
      .set({ calibrationSampleSize: newSampleSize })
      .where(eq(challenges.id, challenge.id));

    if (newSampleSize % 20 === 0) {
      recalibrateChallenge(challenge.id).catch(() => {
        // Best-effort calibration
      });
    }

    // Update track progress (best-effort)
    try {
      const allTracks = await db.query.challengeTracks.findMany({
        where: eq(challengeTracks.active, true),
      });
      for (const track of allTracks) {
        if (!track.challengeSlugs.includes(challenge.slug)) continue;

        // Upsert track progress
        const existing = await db.query.trackProgress.findFirst({
          where: and(
            eq(trackProgress.trackId, track.id),
            eq(trackProgress.agentId, agent.id),
          ),
        });

        const bestScores = existing?.bestScores ?? {};
        const prevBest = bestScores[challenge.slug] ?? 0;
        if (breakdown.total > prevBest) {
          bestScores[challenge.slug] = breakdown.total;
        }

        const completedSlugs = [...new Set([
          ...(existing?.completedSlugs ?? []),
          challenge.slug,
        ])];

        // Compute cumulative score based on scoring method
        const cumulativeScore = computeTrackScore(bestScores, track.scoringMethod as TrackScoringMethod);

        const isCompleted = completedSlugs.length >= track.challengeSlugs.length;

        if (existing) {
          await db
            .update(trackProgress)
            .set({
              completedSlugs,
              bestScores,
              cumulativeScore,
              completed: isCompleted,
              completedAt: isCompleted && !existing.completed ? now : existing.completedAt,
            })
            .where(eq(trackProgress.id, existing.id));
        } else {
          await db.insert(trackProgress).values({
            trackId: track.id,
            agentId: agent.id,
            completedSlugs,
            bestScores,
            cumulativeScore,
            completed: isCompleted,
            startedAt: now,
            completedAt: isCompleted ? now : null,
          });
        }
      }
    } catch {
      // Track progress update is best-effort
    }

    // Auto-update challenge memory (Layer 2 — factual, best-effort)
    upsertChallengeMemory(agent.id, challenge.slug, {
      score: breakdown.total,
      breakdown,
      matchId: match.id,
      now,
    }).catch(() => {
      // Best-effort — do not fail the submit if memory update fails
    });

    // Check if agent's stored harness matches submission harness_id
    let harnessWarning: string | undefined;
    const agentHarness = agent.harness as { id: string } | null;
    if (metadata?.harness_id && agentHarness?.id && metadata.harness_id !== agentHarness.id) {
      harnessWarning = `Submission harness_id "${metadata.harness_id}" differs from your registered harness "${agentHarness.id}". Update via PATCH /agents/me/harness.`;
    } else if (metadata?.harness_id && !agentHarness?.id) {
      harnessWarning = `You submitted with harness_id "${metadata.harness_id}" but have no registered harness. Update via PATCH /agents/me/harness.`;
    }

    return envelope(
      c,
      {
        match_id: match.id,
        bout_name: match.boutName,
        result,
        score: breakdown.total,
        score_breakdown: breakdown,
        elo_before: agent.elo,
        elo_after: finalEloAfter,
        elo_change: eloChange,
        opponent_elo: opponentElo,
        attempt_number: match.attemptNumber,
        memoryless: match.memoryless,
        verified: isVerified,
        trajectory_validation: trajectoryValidation ?? undefined,
        title: newTitle,
        flavour_text: flavourText,
        evaluation_log: evaluationLog,
        submission_warnings: submissionWarnings.length > 0 ? submissionWarnings : undefined,
        harness_warning: harnessWarning,
        reflect_url: `/api/v1/matches/${match.id}/reflect`,
      },
      200,
      flavourText,
    );
  },
);

// POST /matches/:matchId/checkpoint — submit intermediate checkpoint (multi-checkpoint matches)
const checkpointSchema = z.object({
  data: z.record(z.unknown()),
  phase: z.number().int().min(0).optional(),
});

matchRoutes.post(
  "/:matchId/checkpoint",
  authMiddleware,
  zValidator("json", checkpointSchema),
  async (c) => {
    const agent = c.get("agent");
    const matchId = c.req.param("matchId");
    const body = c.req.valid("json");

    const match = await db.query.matches.findFirst({
      where: eq(matches.id, matchId),
    });
    if (!match) return errorEnvelope(c, "Match not found", 404);
    if (match.agentId !== agent.id) return errorEnvelope(c, "Not your match", 403);
    if (match.status !== "active") return errorEnvelope(c, "Match not active", 400);
    if (new Date() > match.expiresAt) {
      await db.update(matches).set({ status: "expired" }).where(eq(matches.id, matchId));
      return errorEnvelope(c, "Match has expired", 410);
    }

    // Verify the challenge supports checkpoints
    const challenge = await db.query.challenges.findFirst({
      where: eq(challenges.id, match.challengeId),
    });
    if (!challenge || challenge.matchType !== "multi-checkpoint") {
      return errorEnvelope(c, "This challenge does not support checkpoints", 400);
    }

    const mod = getChallenge(challenge.slug);

    const checkpoint = {
      phase: body.phase ?? match.checkpoints.length,
      data: body.data,
      ts: new Date().toISOString(),
    };

    const newCheckpoints = [...match.checkpoints, checkpoint];
    await db
      .update(matches)
      .set({ checkpoints: newCheckpoints })
      .where(eq(matches.id, matchId));

    // Partial evaluation for deterministic challenges
    let partialScore: number | undefined;
    let feedback: string | undefined;
    if (mod && mod.scoringSpec?.method === "deterministic") {
      try {
        const data = mod.generateData(match.seed, challenge.config);
        const partial = mod.score({
          submission: body.data,
          groundTruth: data.groundTruth,
          startedAt: match.startedAt,
          submittedAt: new Date(),
          apiCallCount: match.apiCallLog.length,
          checkpoints: newCheckpoints,
        });
        partialScore = partial.breakdown.total;
        feedback = `Partial score: ${partialScore}`;
      } catch {
        // Partial eval is best-effort
      }
    }

    return envelope(c, {
      match_id: matchId,
      checkpoint_number: newCheckpoints.length,
      phase: checkpoint.phase,
      partial_score: partialScore ?? null,
      feedback: feedback ?? null,
    }, 200, "Checkpoint recorded. The next phase awaits.");
  },
);

// POST /matches/:matchId/heartbeat — keep long-running match alive
matchRoutes.post(
  "/:matchId/heartbeat",
  authMiddleware,
  async (c) => {
    const agent = c.get("agent");
    const matchId = c.req.param("matchId");

    const match = await db.query.matches.findFirst({
      where: eq(matches.id, matchId),
    });
    if (!match) return errorEnvelope(c, "Match not found", 404);
    if (match.agentId !== agent.id) return errorEnvelope(c, "Not your match", 403);
    if (match.status !== "active") return errorEnvelope(c, "Match not active", 400);

    // Check if truly expired (past hard deadline)
    if (new Date() > match.expiresAt) {
      await db.update(matches).set({ status: "expired" }).where(eq(matches.id, matchId));
      return errorEnvelope(c, "Match has expired", 410);
    }

    // Check if heartbeat is too late (missed + grace period)
    const challenge = await db.query.challenges.findFirst({
      where: eq(challenges.id, match.challengeId),
    });
    if (challenge?.matchType === "long-running" && match.lastHeartbeatAt) {
      const heartbeatInterval = (challenge.config as any).heartbeatIntervalSecs ?? 300; // default 5 min
      const deadline = new Date(match.lastHeartbeatAt.getTime() + heartbeatInterval * 1000 + HEARTBEAT_GRACE_PERIOD_MS);
      if (new Date() > deadline) {
        await db.update(matches).set({ status: "expired" }).where(eq(matches.id, matchId));
        return errorEnvelope(c, "Heartbeat missed — match expired", 410, "Silence from the deep. The arena moves on.");
      }
    }

    const now = new Date();
    await db
      .update(matches)
      .set({ lastHeartbeatAt: now })
      .where(eq(matches.id, matchId));

    const remainingSecs = Math.max(0, Math.round((match.expiresAt.getTime() - now.getTime()) / 1000));

    return envelope(c, {
      match_id: matchId,
      status: "active",
      remaining_secs: remainingSecs,
      heartbeat_at: now.toISOString(),
    }, 200, "Heartbeat received. The arena acknowledges your presence.");
  },
);

// POST /matches/:matchId/reflect — write post-match reflection to memory
const reflectSchema = z.object({
  lesson: z.string().max(500),
});

matchRoutes.post(
  "/:matchId/reflect",
  authMiddleware,
  zValidator("json", reflectSchema),
  async (c) => {
    const agent = c.get("agent");
    const matchId = c.req.param("matchId");
    const { lesson } = c.req.valid("json");

    const match = await db.query.matches.findFirst({
      where: eq(matches.id, matchId),
    });
    if (!match) return errorEnvelope(c, "Match not found", 404);
    if (match.agentId !== agent.id) return errorEnvelope(c, "Not your match", 403);
    if (match.status !== "completed") return errorEnvelope(c, "Match not completed", 400);
    if (match.memoryless) {
      return errorEnvelope(c, "Reflections are not allowed on memoryless matches.", 403,
        "In memoryless mode, lessons are not retained.");
    }

    // Add reflection to memory
    const memory = { ...agent.memory };
    memory.reflections = [
      {
        matchId: match.id,
        boutName: match.boutName,
        result: match.result as "win" | "draw" | "loss",
        score: match.score ?? 0,
        lesson,
        ts: new Date().toISOString(),
      },
      ...memory.reflections,
    ].slice(0, 20); // Keep last 20

    // Update stats summary
    memory.stats_summary = {
      elo: agent.elo,
      title: agent.title,
      streak: agent.currentStreak,
      bestCategory: null,
      worstCategory: null,
    };

    await db
      .update(agents)
      .set({ memory, updatedAt: new Date() })
      .where(eq(agents.id, agent.id));

    return envelope(c, { reflections_count: memory.reflections.length }, 200, "Wisdom gained in the arena is never lost.");
  },
);

// GET /matches/:matchId — match detail/replay
matchRoutes.get("/:matchId", async (c) => {
  const matchId = c.req.param("matchId");
  const match = await db.query.matches.findFirst({
    where: eq(matches.id, matchId),
  });
  if (!match) {
    return errorEnvelope(c, "Match not found", 404);
  }

  // Lazy expiry: if match is active but past expires_at, mark it expired
  let status = match.status;
  if (status === "active" && new Date() > match.expiresAt) {
    await db.update(matches).set({ status: "expired" }).where(eq(matches.id, matchId));
    status = "expired";
  }

  const agent = await db.query.agents.findFirst({
    where: eq(agents.id, match.agentId),
  });

  const challenge = await db.query.challenges.findFirst({
    where: eq(challenges.id, match.challengeId),
  });

  return envelope(c, {
    id: match.id,
    bout_name: match.boutName,
    challenge_id: match.challengeId,
    challenge_slug: challenge?.slug ?? null,
    match_type: challenge?.matchType ?? "single",
    variant_id: match.variantId ?? null,
    attempt_number: match.attemptNumber,
    memoryless: match.memoryless,
    verified: match.verified,
    agent: agent
      ? { id: agent.id, name: agent.name, title: agent.title, harness: agent.harness ?? null }
      : null,
    status,
    result: match.result,
    objective: match.objective,
    submission: match.submission,
    score: match.score,
    score_breakdown: match.scoreBreakdown,
    scoring_dimensions: challenge?.scoringDimensions ?? [],
    elo_before: match.eloBefore,
    elo_after: match.eloAfter,
    elo_change: match.eloChange,
    api_call_log: match.apiCallLog,
    checkpoints: match.checkpoints,
    flavour_text: match.flavourText,
    evaluation_log: match.evaluationLog ?? null,
    submission_metadata: match.submissionMetadata ?? null,
    expires_at: match.expiresAt,
    time_limit_secs: challenge?.timeLimitSecs ?? null,
    started_at: match.startedAt,
    submitted_at: match.submittedAt,
    completed_at: match.completedAt,
  });
});

// GET /matches — match history
matchRoutes.get("/", async (c) => {
  const agentId = c.req.query("agentId");
  const challengeSlug = c.req.query("challengeSlug");
  const limit = Math.min(Number(c.req.query("limit")) || 20, 100);

  // If filtering by challengeSlug, resolve to challengeId first
  let challengeIdFilter: string | undefined;
  if (challengeSlug) {
    const challenge = await db.query.challenges.findFirst({
      where: eq(challenges.slug, challengeSlug),
    });
    if (challenge) {
      challengeIdFilter = challenge.id;
    } else {
      return envelope(c, []);
    }
  }

  const conditions = [];
  if (agentId) conditions.push(eq(matches.agentId, agentId));
  if (challengeIdFilter) conditions.push(eq(matches.challengeId, challengeIdFilter));

  const allMatches = await db.query.matches.findMany({
    where: conditions.length > 0 ? and(...conditions) : undefined,
    orderBy: desc(matches.startedAt),
    limit,
  });

  // Batch-load agent names and challenge slugs
  const uniqueAgentIds = [...new Set(allMatches.map((m) => m.agentId))];
  const uniqueChallengeIds = [...new Set(allMatches.map((m) => m.challengeId))];
  const [agentRows, challengeRows] = await Promise.all([
    uniqueAgentIds.length > 0
      ? db.select({ id: agents.id, name: agents.name }).from(agents).where(inArray(agents.id, uniqueAgentIds))
      : [],
    uniqueChallengeIds.length > 0
      ? db.select({ id: challenges.id, slug: challenges.slug }).from(challenges).where(inArray(challenges.id, uniqueChallengeIds))
      : [],
  ]);
  const agentNameMap = new Map(agentRows.map((a) => [a.id, a.name]));
  const challengeSlugMap = new Map(challengeRows.map((c) => [c.id, c.slug]));

  return envelope(
    c,
    allMatches.map((m) => ({
      id: m.id,
      bout_name: m.boutName,
      agent_id: m.agentId,
      agent_name: agentNameMap.get(m.agentId) ?? null,
      challenge_id: m.challengeId,
      challenge_slug: challengeSlugMap.get(m.challengeId) ?? null,
      status: m.status,
      result: m.result,
      score: m.score,
      elo_change: m.eloChange,
      attempt_number: m.attemptNumber,
      memoryless: m.memoryless,
      verified: m.verified,
      flavour_text: m.flavourText,
      expires_at: m.expiresAt,
      started_at: m.startedAt,
      completed_at: m.completedAt,
    })),
  );
});
