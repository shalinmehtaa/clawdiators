/**
 * Scoring primitives — pure functions referenced by name in declarative challenge specs.
 * All functions return a value in 0-1 range.
 */

/** Exact match: returns 1 if a === b (case-insensitive for strings), else 0. */
export function exact_match(a: unknown, b: unknown): number {
  if (typeof a === "string" && typeof b === "string") {
    return a.toLowerCase() === b.toLowerCase() ? 1 : 0;
  }
  return a === b ? 1 : 0;
}

/** Ratio of exact matches between two arrays (order-sensitive). */
export function exact_match_ratio(submitted: unknown[], expected: unknown[]): number {
  if (expected.length === 0) return submitted.length === 0 ? 1 : 0;
  let hits = 0;
  const len = Math.min(submitted.length, expected.length);
  for (let i = 0; i < len; i++) {
    if (exact_match(submitted[i], expected[i]) === 1) hits++;
  }
  return hits / expected.length;
}

/** Returns 1 if val is within tolerance of expected, linear decay outside. */
export function numeric_tolerance(val: number, expected: number, tolerance: number): number {
  const diff = Math.abs(val - expected);
  if (diff <= tolerance) return 1;
  // Linear decay up to 5x tolerance, then 0
  const maxDiff = tolerance * 5;
  if (diff >= maxDiff) return 0;
  return 1 - (diff - tolerance) / (maxDiff - tolerance);
}

/** Normalized Levenshtein similarity: 1 = identical, 0 = completely different. */
export function fuzzy_string(a: string, b: string): number {
  const s1 = a.toLowerCase();
  const s2 = b.toLowerCase();
  if (s1 === s2) return 1;
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(s1, s2) / maxLen;
}

/** Time-based decay: 1 at t=0, 0 at t>=limit. Linear. */
export function time_decay(elapsedSecs: number, limitSecs: number): number {
  if (elapsedSecs <= 0) return 1;
  if (elapsedSecs >= limitSecs) return 0;
  return 1 - elapsedSecs / limitSecs;
}

/** API call efficiency: 1 at optimal, decaying linearly to 0 at max. */
export function api_call_efficiency(calls: number, optimal: number, max: number): number {
  if (calls <= optimal) return 1;
  if (calls >= max) return 0;
  return 1 - (calls - optimal) / (max - optimal);
}

/** Coverage ratio: found / total, clamped to 0-1. */
export function coverage_ratio(found: number, total: number): number {
  if (total <= 0) return found <= 0 ? 1 : 0;
  return Math.min(1, Math.max(0, found / total));
}

/** Jaccard set overlap: |A intersect B| / |A union B|. */
export function set_overlap(a: unknown[], b: unknown[]): number {
  const setA = new Set(a.map(String));
  const setB = new Set(b.map(String));
  if (setA.size === 0 && setB.size === 0) return 1;
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 1 : intersection / union;
}

// ── Registry of primitives by name ─────────────────────────────────

export const SCORING_PRIMITIVES: Record<string, Function> = {
  exact_match,
  exact_match_ratio,
  numeric_tolerance,
  fuzzy_string,
  time_decay,
  api_call_efficiency,
  coverage_ratio,
  set_overlap,
};

// ── Metadata for discovery API ─────────────────────────────────────

export interface PrimitiveMetadata {
  name: string;
  signature: string;
  description: string;
  returns: string;
  example: string;
}

export const SCORING_PRIMITIVES_METADATA: PrimitiveMetadata[] = [
  {
    name: "exact_match",
    signature: "exact_match(a, b) → number",
    description: "Returns 1 if a === b (case-insensitive for strings), else 0.",
    returns: "0 or 1",
    example: 'exact_match("Hello", "hello") → 1',
  },
  {
    name: "exact_match_ratio",
    signature: "exact_match_ratio(submitted[], expected[]) → number",
    description: "Ratio of exact matches between two arrays (order-sensitive).",
    returns: "0-1",
    example: "exact_match_ratio([1,2,3], [1,2,4]) → 0.667",
  },
  {
    name: "numeric_tolerance",
    signature: "numeric_tolerance(val, expected, tolerance) → number",
    description: "Returns 1 if val is within tolerance of expected, linear decay outside up to 5x tolerance.",
    returns: "0-1",
    example: "numeric_tolerance(10.5, 10, 1) → 1",
  },
  {
    name: "fuzzy_string",
    signature: "fuzzy_string(a, b) → number",
    description: "Normalized Levenshtein similarity: 1 = identical, 0 = completely different.",
    returns: "0-1",
    example: 'fuzzy_string("kitten", "sitting") → 0.571',
  },
  {
    name: "time_decay",
    signature: "time_decay(elapsedSecs, limitSecs) → number",
    description: "Linear time-based decay: 1 at t=0, 0 at t>=limit.",
    returns: "0-1",
    example: "time_decay(150, 300) → 0.5",
  },
  {
    name: "api_call_efficiency",
    signature: "api_call_efficiency(calls, optimal, max) → number",
    description: "1 at optimal call count, linear decay to 0 at max.",
    returns: "0-1",
    example: "api_call_efficiency(5, 3, 10) → 0.714",
  },
  {
    name: "coverage_ratio",
    signature: "coverage_ratio(found, total) → number",
    description: "Simple ratio of found/total, clamped to 0-1.",
    returns: "0-1",
    example: "coverage_ratio(7, 10) → 0.7",
  },
  {
    name: "set_overlap",
    signature: "set_overlap(a[], b[]) → number",
    description: "Jaccard set overlap: |A ∩ B| / |A ∪ B|.",
    returns: "0-1",
    example: 'set_overlap(["a","b","c"], ["b","c","d"]) → 0.5',
  },
];

// ── Internal: Levenshtein distance ─────────────────────────────────

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  // Use single-row optimization
  const row = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) row[j] = j;

  for (let i = 1; i <= m; i++) {
    let prev = i - 1;
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const val = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = row[j];
      row[j] = val;
    }
  }
  return row[n];
}
