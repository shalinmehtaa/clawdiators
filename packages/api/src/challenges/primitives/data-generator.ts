/**
 * Template-based data generation from declarative challenge specs.
 * Uses mulberry32 PRNG for determinism.
 */
import { mulberry32 } from "../../services/whimsy.js";

// ── Pool-based random selection ────────────────────────────────────

/** Pick a random item from a pool. */
export function pickOne<T>(pool: T[], rng: () => number): T {
  return pool[Math.floor(rng() * pool.length)];
}

/** Pick n unique items from a pool (Fisher-Yates shuffle + slice). */
export function pickN<T>(pool: T[], n: number, rng: () => number): T[] {
  const copy = [...pool];
  const count = Math.min(n, copy.length);
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

/** Generate a random integer in [min, max] inclusive. */
export function randInt(min: number, max: number, rng: () => number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/** Generate a random float in [min, max) rounded to `decimals` places. */
export function randFloat(min: number, max: number, rng: () => number, decimals = 2): number {
  const val = min + rng() * (max - min);
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
}

// ── Template string interpolation ──────────────────────────────────

/**
 * Interpolate `{key}` placeholders in a template string.
 * E.g., `interpolate("{adj} {noun}", { adj: "fierce", noun: "tide" })` → "fierce tide"
 */
export function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const val = vars[key];
    return val !== undefined ? String(val) : `{${key}}`;
  });
}

// ── Ground truth computation primitives ────────────────────────────

/** Count occurrences of each word in a text (lowercased, alphabetic only). */
export function word_frequency_count(text: string): Record<string, number> {
  const counts: Record<string, number> = {};
  const words = text.toLowerCase().match(/[a-z]+/g) || [];
  for (const w of words) {
    counts[w] = (counts[w] || 0) + 1;
  }
  return counts;
}

/** Sort an array of records by a given field. */
export function sort_by_field<T extends Record<string, unknown>>(
  records: T[],
  field: string,
  direction: "asc" | "desc" = "asc",
): T[] {
  const sorted = [...records];
  sorted.sort((a, b) => {
    const va = a[field] as number | string;
    const vb = b[field] as number | string;
    if (va < vb) return direction === "asc" ? -1 : 1;
    if (va > vb) return direction === "asc" ? 1 : -1;
    return 0;
  });
  return sorted;
}

/** Filter records that match all given field/value pairs. */
export function find_matching_records<T extends Record<string, unknown>>(
  records: T[],
  criteria: Record<string, unknown>,
): T[] {
  return records.filter((r) =>
    Object.entries(criteria).every(([k, v]) => r[k] === v),
  );
}

/** Evaluate a simple arithmetic expression string (supports +, -, *, /, parentheses). */
export function arithmetic_evaluation(expr: string): number {
  // Tokenize: numbers, operators, parens
  const tokens = expr.match(/(\d+\.?\d*|[+\-*/()])/g);
  if (!tokens) return 0;

  let pos = 0;

  function parseExpr(): number {
    let result = parseTerm();
    while (pos < tokens!.length && (tokens![pos] === "+" || tokens![pos] === "-")) {
      const op = tokens![pos++];
      const term = parseTerm();
      result = op === "+" ? result + term : result - term;
    }
    return result;
  }

  function parseTerm(): number {
    let result = parseFactor();
    while (pos < tokens!.length && (tokens![pos] === "*" || tokens![pos] === "/")) {
      const op = tokens![pos++];
      const factor = parseFactor();
      result = op === "*" ? result * factor : result / factor;
    }
    return result;
  }

  function parseFactor(): number {
    if (tokens![pos] === "(") {
      pos++; // skip (
      const result = parseExpr();
      pos++; // skip )
      return result;
    }
    return parseFloat(tokens![pos++]);
  }

  return Math.round(parseExpr() * 100) / 100;
}

// ── Registry of ground truth primitives ────────────────────────────

export const GROUND_TRUTH_PRIMITIVES: Record<string, Function> = {
  word_frequency_count,
  sort_by_field,
  find_matching_records,
  arithmetic_evaluation,
};

export { mulberry32 };

// ── Metadata for discovery API ─────────────────────────────────────

export interface GeneratorMetadata {
  name: string;
  signature: string;
  description: string;
  category: "selection" | "numeric" | "text" | "data";
}

export const DATA_GENERATORS_METADATA: GeneratorMetadata[] = [
  { name: "pickOne", signature: "pickOne(pool, rng) → item", description: "Pick a random item from a pool.", category: "selection" },
  { name: "pickN", signature: "pickN(pool, n, rng) → item[]", description: "Pick n unique items from a pool (Fisher-Yates shuffle).", category: "selection" },
  { name: "randInt", signature: "randInt(min, max, rng) → number", description: "Random integer in [min, max] inclusive.", category: "numeric" },
  { name: "randFloat", signature: "randFloat(min, max, rng, decimals?) → number", description: "Random float in [min, max) rounded to decimals places.", category: "numeric" },
  { name: "interpolate", signature: 'interpolate(template, vars) → string', description: "Interpolate {key} placeholders in a template string.", category: "text" },
  { name: "word_frequency_count", signature: "word_frequency_count(text) → Record<string, number>", description: "Count word occurrences (lowercased, alphabetic only).", category: "data" },
  { name: "sort_by_field", signature: 'sort_by_field(records, field, direction?) → records[]', description: "Sort records by a field (asc/desc).", category: "data" },
  { name: "find_matching_records", signature: "find_matching_records(records, criteria) → records[]", description: "Filter records matching all field/value pairs.", category: "data" },
  { name: "arithmetic_evaluation", signature: "arithmetic_evaluation(expr) → number", description: "Evaluate simple arithmetic expressions (+, -, *, /, parentheses).", category: "data" },
];
