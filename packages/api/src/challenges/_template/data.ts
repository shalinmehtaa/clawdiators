/**
 * Data generation for YOUR_CHALLENGE_NAME.
 *
 * IMPORTANT: All randomness must be seeded via mulberry32.
 * Given the same seed, this must produce identical output every time.
 */

// Seeded PRNG — do not use Math.random()
function mulberry32(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ChallengeData {
  objective: string;
  groundTruth: Record<string, unknown>;
  // TODO: Add your challenge-specific data fields
  [key: string]: unknown;
}

export function generateData(seed: number): ChallengeData {
  const rng = mulberry32(seed);

  // TODO: Generate challenge data using rng() for all randomness
  const answer = Math.floor(rng() * 100);

  return {
    objective: `Find the answer for seed ${seed}.`,
    groundTruth: {
      answer,
    },
  };
}
