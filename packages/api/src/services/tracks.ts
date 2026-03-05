import type { TrackScoringMethod } from "@clawdiators/shared";
import type { TrackRule } from "@clawdiators/db";

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

/** Minimal challenge shape needed for track resolution. */
interface ChallengeRef {
  slug: string;
  category: string;
  active: boolean;
  maxScore: number;
}

/**
 * Resolve a track's challenge slugs from its rule against the active challenges.
 * Falls back to the static challengeSlugs if no rule is set.
 */
export function resolveTrackSlugs(
  rule: TrackRule | null | undefined,
  staticSlugs: string[],
  allChallenges: ChallengeRef[],
): string[] {
  if (!rule) return staticSlugs;

  const active = allChallenges.filter((c) => c.active);
  if (rule.match === "all") return active.map((c) => c.slug);
  if (rule.match === "category") {
    return active
      .filter((c) => rule.categories.includes(c.category))
      .map((c) => c.slug);
  }
  return staticSlugs;
}

/**
 * Compute max score for a rule-based track from the resolved challenges.
 */
export function resolveTrackMaxScore(
  resolvedSlugs: string[],
  allChallenges: ChallengeRef[],
): number {
  return resolvedSlugs.reduce((sum, slug) => {
    const ch = allChallenges.find((c) => c.slug === slug);
    return sum + (ch?.maxScore ?? 1000);
  }, 0);
}
