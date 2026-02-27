/**
 * Zod schema for community challenge specs.
 * Supports both workspace-based (new) and legacy sandbox-based specs.
 */
import { z } from "zod";
import { SCORING_PRIMITIVES } from "./scoring.js";

const VALID_CATEGORIES = [
  "coding", "reasoning", "context", "endurance",
  "adversarial", "multimodal",
] as const;

const VALID_DIFFICULTIES = ["newcomer", "contender", "veteran", "legendary"] as const;
const VALID_MATCH_TYPES = ["single", "multi-checkpoint", "long-running"] as const;
const VALID_COLORS = ["emerald", "sky", "gold", "purple", "coral"] as const;

const scoringDimensionSchema = z.object({
  key: z.string().min(1).max(30).regex(/^[a-z_]+$/),
  label: z.string().min(1).max(40),
  weight: z.number().min(0).max(1),
  description: z.string().min(1).max(200),
  color: z.enum(VALID_COLORS),
});

// ── Workspace spec schemas ──────────────────────────────────────────

const workspaceSpecSchema = z.object({
  type: z.enum(["archive", "generator"]),
  seedable: z.boolean(),
  challengeMd: z.string().min(10).max(5000),
});

const submissionSpecSchema = z.object({
  type: z.enum(["json", "files", "diff", "stdout"]),
  schema: z.record(z.unknown()).optional(),
  files: z.array(z.string()).optional(),
  command: z.string().optional(),
});

const scoringSpecSchema = z.object({
  method: z.enum(["deterministic", "test-suite", "custom-script", "llm-judge"]),
  dimensions: z.array(scoringDimensionSchema).min(2).max(6),
  maxScore: z.number().int().min(100).max(10000),
  evaluator: z.string().optional(),
  rubric: z.string().optional(),
});

// ── Scorer field schema (for declarative scoring) ───────────────────

const scorerFieldSchema = z.object({
  key: z.string(),
  primitive: z.string().refine(
    (p) => p in SCORING_PRIMITIVES,
    { message: "Unknown scoring primitive" },
  ),
  params: z.record(z.unknown()).optional(),
  weight: z.number().min(0).max(1000).optional(),
});

const scorerSchema = z.object({
  fields: z.array(scorerFieldSchema).min(1),
  timeDimension: z.string().optional(),
}).optional();

// ── Data template schema ────────────────────────────────────────────

const dataPoolSchema = z.object({
  name: z.string(),
  items: z.array(z.unknown()).min(1),
});

const dataTemplateSchema = z.object({
  pools: z.array(dataPoolSchema).optional(),
  fields: z.record(z.object({
    type: z.enum(["pick_one", "pick_n", "rand_int", "rand_float", "template", "static"]),
    pool: z.string().optional(),
    count: z.number().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    decimals: z.number().optional(),
    template: z.string().optional(),
    value: z.unknown().optional(),
  })).optional(),
});

const phaseSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
});

// ── Community spec schema (workspace-first) ─────────────────────────

export const communitySpecSchema = z.object({
  slug: z.string()
    .min(3).max(40)
    .regex(/^[a-z][a-z0-9-]*[a-z0-9]$/, "Slug must be lowercase alphanumeric with hyphens"),
  name: z.string().min(3).max(60),
  description: z.string().min(10).max(500),
  lore: z.string().min(10).max(1000),
  category: z.enum(VALID_CATEGORIES),
  difficulty: z.enum(VALID_DIFFICULTIES),
  matchType: z.enum(VALID_MATCH_TYPES),
  timeLimitSecs: z.number().int().min(10).max(7200),
  // Workspace spec (required for new challenges)
  workspace: workspaceSpecSchema,
  submission: submissionSpecSchema,
  scoring: scoringSpecSchema,
  // Optional scoring primitives for declarative scoring
  scorer: scorerSchema,
  dataTemplate: dataTemplateSchema.optional(),
  phases: z.array(phaseSchema).optional(),
}).refine(
  (spec) => {
    const sum = spec.scoring.dimensions.reduce((s, d) => s + d.weight, 0);
    return Math.abs(sum - 1.0) < 0.001;
  },
  { message: "Scoring dimension weights must sum to 1.0" },
);

export type CommunitySpec = z.infer<typeof communitySpecSchema>;

/**
 * Validate a community challenge spec.
 * Returns { valid: true, spec } or { valid: false, errors }.
 */
export function validateSpec(raw: unknown):
  | { valid: true; spec: CommunitySpec }
  | { valid: false; errors: string[] } {
  const result = communitySpecSchema.safeParse(raw);
  if (result.success) {
    return { valid: true, spec: result.data };
  }
  return {
    valid: false,
    errors: result.error.issues.map(
      (i) => `${i.path.join(".")}: ${i.message}`,
    ),
  };
}

/**
 * Test-run a spec with multiple seeds to verify determinism.
 * Requires a generateData function that takes a seed.
 */
export function verifyDeterminism(
  generateData: (seed: number) => unknown,
  seeds: number[] = [42, 123, 7777],
): { deterministic: boolean; error?: string } {
  for (const seed of seeds) {
    const a = JSON.stringify(generateData(seed));
    const b = JSON.stringify(generateData(seed));
    if (a !== b) {
      return { deterministic: false, error: `Non-deterministic output for seed ${seed}` };
    }
  }
  // Verify different seeds produce different results
  if (seeds.length >= 2) {
    const first = JSON.stringify(generateData(seeds[0]));
    const second = JSON.stringify(generateData(seeds[1]));
    if (first === second) {
      return { deterministic: false, error: "Different seeds produced identical output" };
    }
  }
  return { deterministic: true };
}
