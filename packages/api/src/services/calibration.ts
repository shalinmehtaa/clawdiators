import { eq, and, desc } from "drizzle-orm";
import { db, matches, challenges } from "@clawdiators/db";
import type { Difficulty, CalibrationData } from "@clawdiators/shared";
import { CALIBRATION_MIN_SAMPLES, CALIBRATION_THRESHOLDS } from "@clawdiators/shared";

/**
 * Determine calibrated difficulty from aggregated match data.
 * Returns null if not enough data.
 */
export function calibrateDifficulty(data: CalibrationData): Difficulty | null {
  if (data.sample_size < CALIBRATION_MIN_SAMPLES) return null;

  // Check from easiest to hardest
  if (
    data.win_rate >= CALIBRATION_THRESHOLDS.newcomer.minWinRate &&
    data.completion_rate >= CALIBRATION_THRESHOLDS.newcomer.minCompletionRate
  ) {
    return "newcomer";
  }

  if (
    data.win_rate >= CALIBRATION_THRESHOLDS.contender.minWinRate &&
    data.completion_rate >= CALIBRATION_THRESHOLDS.contender.minCompletionRate
  ) {
    return "contender";
  }

  if (
    data.win_rate >= CALIBRATION_THRESHOLDS.veteran.minWinRate &&
    data.completion_rate >= CALIBRATION_THRESHOLDS.veteran.minCompletionRate
  ) {
    return "veteran";
  }

  return "legendary";
}

/**
 * Recalibrate a challenge's difficulty based on match history.
 */
export async function recalibrateChallenge(challengeId: string): Promise<void> {
  // Get completed matches
  const completedMatches = await db.query.matches.findMany({
    where: and(
      eq(matches.challengeId, challengeId),
      eq(matches.status, "completed"),
    ),
  });

  // Get all matches (including expired) for completion rate
  const allMatches = await db.query.matches.findMany({
    where: eq(matches.challengeId, challengeId),
  });

  const challenge = await db.query.challenges.findFirst({
    where: eq(challenges.id, challengeId),
  });
  if (!challenge) return;

  const total = allMatches.length;
  const completed = completedMatches.length;
  const completionRate = total > 0 ? completed / total : 0;

  const scores = completedMatches
    .map((m) => m.score)
    .filter((s): s is number => s !== null)
    .sort((a, b) => a - b);

  const medianScore = scores.length > 0
    ? scores[Math.floor(scores.length / 2)]
    : 0;

  const wins = completedMatches.filter((m) => m.result === "win").length;
  const winRate = completed > 0 ? wins / completed : 0;

  // Calculate time utilization
  const durations = completedMatches
    .map((m) => {
      if (m.submittedAt && m.startedAt) {
        return (m.submittedAt.getTime() - m.startedAt.getTime()) / 1000;
      }
      return null;
    })
    .filter((d): d is number => d !== null);

  const avgDuration = durations.length > 0
    ? durations.reduce((a, b) => a + b, 0) / durations.length
    : 0;
  const timeUtilization = challenge.timeLimitSecs > 0
    ? avgDuration / challenge.timeLimitSecs
    : 0;

  const calibrationData: CalibrationData = {
    completion_rate: Math.round(completionRate * 1000) / 1000,
    median_score: medianScore,
    win_rate: Math.round(winRate * 1000) / 1000,
    time_utilization: Math.round(timeUtilization * 1000) / 1000,
    sample_size: completed,
    calibrated_at: new Date().toISOString(),
  };

  const calibrated = calibrateDifficulty(calibrationData);

  await db
    .update(challenges)
    .set({
      calibratedDifficulty: calibrated,
      calibrationData: calibrationData as unknown as Record<string, unknown>,
      calibrationSampleSize: completed,
    })
    .where(eq(challenges.id, challengeId));
}
