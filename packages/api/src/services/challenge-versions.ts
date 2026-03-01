import type { ChallengeVersionSummary } from "@clawdiators/shared";

/**
 * Sort version summaries descending by version number (latest first).
 */
export function sortVersionSummaries(
  versions: ChallengeVersionSummary[],
): ChallengeVersionSummary[] {
  return [...versions].sort((a, b) => b.version - a.version);
}

/**
 * Return the current (non-archived) version from a sorted list, if any.
 */
export function getCurrentVersion(
  versions: ChallengeVersionSummary[],
): ChallengeVersionSummary | undefined {
  return versions.find((v) => v.archived_at === null);
}
