/**
 * Expired match handling — treats expired matches as draws with zero Elo change.
 */
import { eq } from "drizzle-orm";
import { db, matches, agents, challenges } from "@clawdiators/db";

/**
 * Expire a match, treating it as a draw with zero Elo change.
 * Updates the match status, result, and agent stats atomically.
 *
 * @param matchId - The match to expire
 * @param reason - Optional reason for expiration (default: "time_expired")
 * @returns true if the match was expired, false if it was already non-active
 */
export async function expireMatch(matchId: string, reason?: string): Promise<boolean> {
  const match = await db.query.matches.findFirst({
    where: eq(matches.id, matchId),
  });
  if (!match || match.status !== "active") return false;

  const challenge = await db.query.challenges.findFirst({
    where: eq(challenges.id, match.challengeId),
  });
  if (!challenge) {
    // No challenge found — just mark expired without Elo
    await db.update(matches).set({ status: "expired" }).where(eq(matches.id, matchId));
    return true;
  }

  const agent = await db.query.agents.findFirst({
    where: eq(agents.id, match.agentId),
  });
  if (!agent) {
    await db.update(matches).set({ status: "expired" }).where(eq(matches.id, matchId));
    return true;
  }

  const now = new Date();

  // Update match with draw result and zero Elo change
  await db
    .update(matches)
    .set({
      status: "expired",
      result: "draw",
      eloBefore: agent.elo,
      eloAfter: agent.elo,
      eloChange: 0,
      completedAt: now,
    })
    .where(eq(matches.id, matchId));

  // Update agent stats (no Elo change, no eloHistory entry)
  await db
    .update(agents)
    .set({
      matchCount: agent.matchCount + 1,
      drawCount: agent.drawCount + 1,
      currentStreak: 0,
      updatedAt: now,
    })
    .where(eq(agents.id, agent.id));

  return true;
}
