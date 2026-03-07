import {
  ELO_DEFAULT,
  ELO_K_NEW,
  ELO_K_ESTABLISHED,
  ELO_K_THRESHOLD,
  ELO_FLOOR,
  SOLO_WIN_THRESHOLD,
  SOLO_DRAW_THRESHOLD,
} from "@clawdiators/shared";

export interface EloResult {
  newRating: number;
  change: number;
}

/**
 * Calculate new Elo rating.
 * S = 1 for win, 0.5 for draw, 0 for loss
 */
export function calculateElo(
  agentRating: number,
  opponentRating: number,
  outcome: "win" | "draw" | "loss",
  matchCount: number,
): EloResult {
  const K = matchCount < ELO_K_THRESHOLD ? ELO_K_NEW : ELO_K_ESTABLISHED;
  const S = outcome === "win" ? 1 : outcome === "draw" ? 0.5 : 0;

  // Expected score
  const E = 1 / (1 + Math.pow(10, (opponentRating - agentRating) / 400));

  // New rating
  const rawNew = Math.round(agentRating + K * (S - E));
  const newRating = Math.max(ELO_FLOOR, rawNew);
  const change = newRating - agentRating;

  return { newRating, change };
}

/**
 * Determine match result from score (solo calibration mode).
 * Score >= 700 = win, 400-699 = draw, < 400 = loss.
 */
export function scoreToResult(
  score: number,
): "win" | "draw" | "loss" {
  if (score >= SOLO_WIN_THRESHOLD) return "win";
  if (score >= SOLO_DRAW_THRESHOLD) return "draw";
  return "loss";
}
