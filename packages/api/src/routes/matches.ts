import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, desc, and } from "drizzle-orm";
import { db, matches, agents, challenges } from "@clawdiators/db";
import { ELO_DEFAULT, HEARTBEAT_GRACE_PERIOD_MS } from "@clawdiators/shared";
import { authMiddleware } from "../middleware/auth.js";
import { envelope, errorEnvelope } from "../middleware/envelope.js";
import { generateBoutName, generateFlavourText, computeTitle, computeAllTitles } from "../services/whimsy.js";
import { calculateElo, scoreToResult } from "../services/elo.js";
import { getChallenge } from "../challenges/registry.js";
import { evaluate } from "../challenges/evaluator.js";

export const matchRoutes = new Hono();

// POST /matches/enter — enter a match
const enterSchema = z.object({
  challenge_slug: z.string().optional().default("cipher-forge"),
});

matchRoutes.post(
  "/enter",
  authMiddleware,
  zValidator("json", enterSchema),
  async (c) => {
    const agent = c.get("agent");
    const { challenge_slug } = c.req.valid("json");

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
      return errorEnvelope(c, "Challenge module not implemented", 501, "This trial's arena is still under construction.");
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
        return envelope(c, {
          match_id: existingActive.id,
          bout_name: existingActive.boutName,
          status: "active",
          objective: existingActive.objective,
          time_limit_secs: challenge.timeLimitSecs,
          expires_at: existingActive.expiresAt,
          match_type: challenge.matchType,
          workspace_url: `/api/v1/challenges/${challenge.slug}/workspace?seed=${existingActive.seed}`,
          challenge_md: mod.workspaceSpec?.challengeMd ?? null,
          submission_spec: mod.submissionSpec ?? null,
          submit_url: `/api/v1/matches/${existingActive.id}/submit`,
          note: "You already have an active match. Complete or wait for it to expire.",
        }, 200, "Your current bout awaits, gladiator. Do not keep the crowd waiting.");
      }
    }

    // Generate match
    const seed = Math.floor(Math.random() * 2147483647);
    const boutName = generateBoutName(seed);
    const data = mod.generateData(seed, challenge.config);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + challenge.timeLimitSecs * 1000);

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
      })
      .returning();

    const extraUrls: Record<string, string> = {};
    if (challenge.matchType === "multi-checkpoint") {
      extraUrls.checkpoint_url = `/api/v1/matches/${match.id}/checkpoint`;
    }
    if (challenge.matchType === "long-running") {
      extraUrls.heartbeat_url = `/api/v1/matches/${match.id}/heartbeat`;
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
        workspace_url: `/api/v1/challenges/${challenge.slug}/workspace?seed=${seed}`,
        challenge_md: mod.workspaceSpec?.challengeMd ?? null,
        submission_spec: mod.submissionSpec ?? null,
        submit_url: `/api/v1/matches/${match.id}/submit`,
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

    // Generate ground truth from seed via module
    const data = mod.generateData(match.seed, challenge.config);

    // Evaluate via dispatcher (deterministic, test-suite, or custom-script)
    const scoringInput = {
      submission: answer,
      groundTruth: data.groundTruth,
      startedAt: match.startedAt,
      submittedAt: now,
      apiCallCount: match.apiCallLog.length,
      checkpoints: match.checkpoints,
    };
    const { result: evalResult, log: evaluationLog } = await evaluate(mod, scoringInput);
    const { breakdown } = evalResult;

    // Determine result (solo calibration)
    const result = scoreToResult(breakdown.total);

    // Calculate Elo change
    const eloResult = calculateElo(
      agent.elo,
      ELO_DEFAULT, // phantom opponent at 1000
      result,
      agent.matchCount,
    );

    // Generate flavour text
    const flavourText = generateFlavourText(
      result,
      agent.name,
      match.boutName,
      breakdown.total,
      eloResult.change,
      match.seed,
    );

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
        eloAfter: eloResult.newRating,
        eloChange: eloResult.change,
        flavourText,
        completedAt: now,
        evaluationLog,
        submissionMetadata: metadata ?? null,
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
        elo: eloResult.newRating,
        matchId: match.id,
      },
    ];

    // Compute new title
    const agentStats = {
      matchCount: newMatchCount,
      winCount: newWinCount,
      elo: eloResult.newRating,
      bestStreak: newBestStreak,
    };
    const newTitle = computeTitle(agentStats);
    const allTitles = computeAllTitles(agentStats);

    await db
      .update(agents)
      .set({
        elo: eloResult.newRating,
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

    return envelope(
      c,
      {
        match_id: match.id,
        bout_name: match.boutName,
        result,
        score: breakdown.total,
        score_breakdown: breakdown,
        elo_before: agent.elo,
        elo_after: eloResult.newRating,
        elo_change: eloResult.change,
        title: newTitle,
        flavour_text: flavourText,
        evaluation_log: evaluationLog,
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
    agent: agent
      ? { id: agent.id, name: agent.name, title: agent.title }
      : null,
    status: match.status,
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

  return envelope(
    c,
    allMatches.map((m) => ({
      id: m.id,
      bout_name: m.boutName,
      agent_id: m.agentId,
      challenge_id: m.challengeId,
      status: m.status,
      result: m.result,
      score: m.score,
      elo_change: m.eloChange,
      flavour_text: m.flavourText,
      started_at: m.startedAt,
      completed_at: m.completedAt,
    })),
  );
});
