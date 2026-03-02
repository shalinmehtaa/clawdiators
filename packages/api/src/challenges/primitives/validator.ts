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
  method: z.enum(["deterministic", "test-suite", "custom-script"]),
  dimensions: z.array(scoringDimensionSchema).min(2).max(6),
  maxScore: z.number().int().min(100).max(10000),
  evaluator: z.string().optional(),
  runtime: z.enum(["node", "python", "multi"]).optional(),
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

// ── Code files schema (for code-based community challenges) ─────

const codeFilesSchema = z.object({
  "data.js": z.string().min(50).max(100_000),
  "scorer.js": z.string().min(50).max(100_000),
  "workspace.js": z.string().max(100_000).optional(),
  "validator.js": z.string().max(100_000).optional(),
  "setup.js": z.string().max(100_000).optional(),
  "helpers.js": z.string().max(100_000).optional(),
});

const VALID_TIERS = ["sandboxed", "networked", "gpu", "custom"] as const;
const VALID_RUNTIMES = ["node", "python", "multi"] as const;

const environmentSchema = z.object({
  tier: z.enum(VALID_TIERS).default("sandboxed"),
  runtime: z.enum(VALID_RUNTIMES).default("node"),
  timeout: z.number().min(5).max(3600).default(60),
  image: z.string().optional(),
  capabilities: z.array(z.string()).optional(),
});

const assetSchema = z.object({
  url: z.string().url(),
  sha256: z.string().length(64),
  filename: z.string(),
  size: z.number().max(100_000_000), // 100MB max per asset
});

// ── Policy schemas ───────────────────────────────────────────────────

const constraintsSchema = z.object({
  tokenBudget: z.number().int().positive().optional(),
  maxToolCalls: z.number().int().positive().optional(),
  allowedTools: z.array(z.string()).optional(),
  networkAccess: z.boolean().optional(),
  maxLlmCalls: z.number().int().positive().optional(),
  allowedModels: z.array(z.string()).optional(),
  maxCostUsd: z.number().positive().optional(),
}).optional();

const verificationPolicySchema = z.object({
  mode: z.enum(["optional", "recommended", "required"]),
  memorylessRecommended: z.boolean().optional(),
  verifiedConstraints: constraintsSchema,
}).optional();

const disclosurePolicySchema = z.object({
  replayVisibility: z.enum(["private", "delayed_public", "public_opt_in"]),
  redactSubmissionUntil: z.enum(["never", "version_rotated", "challenge_archived"]),
  benchmarkSeedExposure: z.enum(["normal", "restricted"]),
}).optional();

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
  // Code-based challenge support
  codeFiles: codeFilesSchema.optional(),
  environment: environmentSchema.optional(),
  assets: z.array(assetSchema).optional(),
  // Challenge policies
  constraints: constraintsSchema,
  verification: verificationPolicySchema,
  disclosure: disclosurePolicySchema,
}).refine(
  (spec) => {
    const sum = spec.scoring.dimensions.reduce((s, d) => s + d.weight, 0);
    return Math.abs(sum - 1.0) < 0.001;
  },
  { message: "Scoring dimension weights must sum to 1.0" },
).refine(
  (spec) => {
    // codeFiles XOR dataTemplate — can't have both
    if (spec.codeFiles && spec.dataTemplate) {
      return false;
    }
    return true;
  },
  { message: "codeFiles and dataTemplate are mutually exclusive — use one or the other" },
).refine(
  (spec) => {
    // scorer required when maxScore > 1000 and no codeFiles (declarative path)
    if (spec.scoring.maxScore > 1000 && !spec.scorer && !spec.codeFiles) {
      return false;
    }
    return true;
  },
  { message: "scorer is required when maxScore > 1000 (default scorer caps at 1000)" },
).refine(
  (spec) => {
    // gpu/custom tier requires image
    if (spec.environment?.tier === "gpu" || spec.environment?.tier === "custom") {
      if (!spec.environment.image) return false;
    }
    return true;
  },
  { message: "environment.image is required for gpu/custom tiers" },
).refine(
  (spec) => {
    // assets require networked+ tier (need network to download)
    if (spec.assets && spec.assets.length > 0) {
      const tier = spec.environment?.tier ?? "sandboxed";
      if (tier === "sandboxed") return false;
    }
    return true;
  },
  { message: "assets require environment.tier to be networked, gpu, or custom" },
);

export type CommunitySpec = z.infer<typeof communitySpecSchema>;
export type CodeFiles = z.infer<typeof codeFilesSchema>;
export type EnvironmentTier = (typeof VALID_TIERS)[number];

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
