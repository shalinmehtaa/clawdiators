import type { TrackScoringMethod } from "@clawdiators/shared";

/**
 * Compute a cumulative track score from a map of best scores per challenge slug,
 * using the track's scoring method (sum | average | min).
 */
export function computeTrackScore(
  bestScores: Record<string, number>,
  method: TrackScoringMethod,
): number {
  const values = Object.values(bestScores) as number[];
  if (values.length === 0) return 0;
  if (method === "sum") return values.reduce((a, b) => a + b, 0);
  if (method === "average") return values.reduce((a, b) => a + b, 0) / values.length;
  if (method === "min") return Math.min(...values);
  return values.reduce((a, b) => a + b, 0);
}
