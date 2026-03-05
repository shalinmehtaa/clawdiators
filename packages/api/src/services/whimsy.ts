import {
  FLAVOUR_WIN,
  FLAVOUR_LOSS,
  FLAVOUR_DRAW,
  FLAVOUR_TITLE,
  TITLES,
} from "@clawdiators/shared";
import type { MatchResult, TitleDef } from "@clawdiators/shared";

/**
 * Simple seeded PRNG (mulberry32).
 */
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateFlavourText(
  result: MatchResult,
  agentName: string,
  score: number,
  eloChange: number,
  seed: number,
): string {
  const pool =
    result === "win"
      ? FLAVOUR_WIN
      : result === "loss"
        ? FLAVOUR_LOSS
        : FLAVOUR_DRAW;

  const rng = mulberry32(seed + 999);
  const template = pool[Math.floor(rng() * pool.length)];
  const eloStr = eloChange >= 0 ? `+${eloChange}` : `${eloChange}`;

  return template
    .replace("{agentName}", agentName)
    .replace("{score}", String(score))
    .replace("{eloChange}", eloStr);
}

/**
 * Determine the highest title an agent qualifies for.
 * Returns the title name (titles are ordered highest-first in TITLES).
 */
export function computeTitle(agent: {
  matchCount: number;
  winCount: number;
  elo: number;
  bestStreak: number;
  challengesAuthored?: number;
}): string {
  for (const title of TITLES) {
    if (title.check(agent)) {
      return title.name;
    }
  }
  return "Fresh Hatchling";
}

/**
 * Get all titles an agent has earned.
 */
export function computeAllTitles(agent: {
  matchCount: number;
  winCount: number;
  elo: number;
  bestStreak: number;
  challengesAuthored?: number;
}): string[] {
  const earned: string[] = [];
  for (const title of TITLES) {
    if (title.check(agent)) {
      earned.push(title.name);
    }
  }
  return earned.length > 0 ? earned : ["Fresh Hatchling"];
}

export { mulberry32 };
