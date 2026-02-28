/**
 * Declarative Challenge Adapter — wraps a validated CommunitySpec into a ChallengeModule.
 * Uses scoring primitives and template engine.
 */
import { MAX_SCORE } from "@clawdiators/shared";
import type { ChallengeModule, ChallengeData, ScoringInput, ScoreResult } from "../types.js";
import { SCORING_PRIMITIVES } from "./scoring.js";
import { time_decay } from "./scoring.js";
import { mulberry32, pickOne, pickN, randInt, randFloat, interpolate } from "./data-generator.js";
import type { CommunitySpec } from "./validator.js";

/**
 * Build a ChallengeModule from a validated CommunitySpec.
 * Wraps a declarative JSON spec into a ChallengeModule.
 */
export function createDeclarativeModule(spec: CommunitySpec): ChallengeModule {
  return {
    slug: spec.slug,
    dimensions: spec.scoring.dimensions,

    workspaceSpec: {
      type: spec.workspace.type,
      seedable: spec.workspace.seedable,
      challengeMd: spec.workspace.challengeMd,
    },

    submissionSpec: {
      type: spec.submission.type,
      schema: spec.submission.schema,
      files: spec.submission.files,
      command: spec.submission.command,
    },

    scoringSpec: {
      method: spec.scoring.method,
      dimensions: spec.scoring.dimensions,
      maxScore: spec.scoring.maxScore,
      evaluator: spec.scoring.evaluator,
      runtime: spec.scoring.runtime,
    },

    generateData(seed: number, _config: Record<string, unknown>): ChallengeData {
      const rng = mulberry32(seed);
      const generated: Record<string, unknown> = {};

      if (spec.dataTemplate) {
        // Build pool lookup
        const pools: Record<string, unknown[]> = {};
        for (const pool of spec.dataTemplate.pools ?? []) {
          pools[pool.name] = pool.items;
        }

        // Generate fields
        for (const [key, fieldDef] of Object.entries(spec.dataTemplate.fields ?? {})) {
          switch (fieldDef.type) {
            case "pick_one":
              if (fieldDef.pool && pools[fieldDef.pool]) {
                generated[key] = pickOne(pools[fieldDef.pool], rng);
              }
              break;
            case "pick_n":
              if (fieldDef.pool && pools[fieldDef.pool]) {
                generated[key] = pickN(pools[fieldDef.pool], fieldDef.count ?? 3, rng);
              }
              break;
            case "rand_int":
              generated[key] = randInt(fieldDef.min ?? 0, fieldDef.max ?? 100, rng);
              break;
            case "rand_float":
              generated[key] = randFloat(fieldDef.min ?? 0, fieldDef.max ?? 1, rng, fieldDef.decimals ?? 2);
              break;
            case "template":
              if (fieldDef.template) {
                generated[key] = interpolate(fieldDef.template, generated as Record<string, string | number>);
              }
              break;
            case "static":
              generated[key] = fieldDef.value;
              break;
          }
        }
      }

      return {
        objective: `Complete the ${spec.name} challenge.`,
        groundTruth: generated,
        ...generated,
      };
    },

    score(input: ScoringInput): ScoreResult {
      const { submission, groundTruth, startedAt, submittedAt } = input;
      const breakdown: Record<string, number> = {};
      let totalRaw = 0;

      // Score each dimension
      for (const dim of spec.scoring.dimensions) {
        let rawScore = 0;

        // Check if this is the time dimension
        if (spec.scorer?.timeDimension === dim.key) {
          const elapsed = (submittedAt.getTime() - startedAt.getTime()) / 1000;
          rawScore = time_decay(elapsed, spec.timeLimitSecs) * 1000;
        }
        // Use scorer field definitions
        else if (spec.scorer) {
          const fields = spec.scorer.fields;

          let fieldTotal = 0;
          let fieldMax = 0;

          for (const field of fields) {
            const primitive = SCORING_PRIMITIVES[field.primitive];
            if (!primitive) continue;

            const submittedVal = submission[field.key];
            const expectedVal = groundTruth[field.key];
            if (submittedVal === undefined) continue;

            const weight = field.weight ?? 1;
            fieldMax += weight;

            // Invoke the primitive
            const params = field.params ?? {};
            let score: number;
            if (field.primitive === "exact_match") {
              score = primitive(submittedVal, expectedVal);
            } else if (field.primitive === "numeric_tolerance") {
              score = primitive(
                typeof submittedVal === "number" ? submittedVal : Number(submittedVal),
                expectedVal,
                params.tolerance ?? 0.01,
              );
            } else if (field.primitive === "fuzzy_string") {
              score = primitive(String(submittedVal), String(expectedVal));
            } else if (field.primitive === "exact_match_ratio" || field.primitive === "set_overlap") {
              score = primitive(
                Array.isArray(submittedVal) ? submittedVal : [],
                Array.isArray(expectedVal) ? expectedVal : [],
              );
            } else if (field.primitive === "coverage_ratio") {
              score = primitive(
                typeof submittedVal === "number" ? submittedVal : 0,
                typeof expectedVal === "number" ? expectedVal : 0,
              );
            } else {
              score = primitive(submittedVal, expectedVal);
            }

            fieldTotal += score * weight;
          }

          rawScore = fieldMax > 0 ? (fieldTotal / fieldMax) * 1000 : 0;
        }
        // Default: methodology based on submission completeness
        else {
          if (submission.methodology || submission.reasoning || submission.approach) {
            rawScore = 1000;
          } else {
            const answerKeys = Object.keys(submission).filter(k => submission[k] !== null && submission[k] !== undefined);
            rawScore = answerKeys.length > 0 ? 600 : 400;
          }
        }

        const weighted = Math.round(rawScore * dim.weight);
        breakdown[dim.key] = weighted;
        totalRaw += weighted;
      }

      breakdown.total = Math.min(MAX_SCORE, totalRaw);
      return { breakdown };
    },

    generateWorkspace(seed: number, _config: Record<string, unknown>): Record<string, string> {
      // For community challenges, generate workspace from data template
      const rng = mulberry32(seed);
      const generated: Record<string, unknown> = {};

      if (spec.dataTemplate) {
        const pools: Record<string, unknown[]> = {};
        for (const pool of spec.dataTemplate.pools ?? []) {
          pools[pool.name] = pool.items;
        }
        for (const [key, fieldDef] of Object.entries(spec.dataTemplate.fields ?? {})) {
          switch (fieldDef.type) {
            case "pick_one":
              if (fieldDef.pool && pools[fieldDef.pool]) {
                generated[key] = pickOne(pools[fieldDef.pool], rng);
              }
              break;
            case "pick_n":
              if (fieldDef.pool && pools[fieldDef.pool]) {
                generated[key] = pickN(pools[fieldDef.pool], fieldDef.count ?? 3, rng);
              }
              break;
            case "rand_int":
              generated[key] = randInt(fieldDef.min ?? 0, fieldDef.max ?? 100, rng);
              break;
            case "rand_float":
              generated[key] = randFloat(fieldDef.min ?? 0, fieldDef.max ?? 1, rng, fieldDef.decimals ?? 2);
              break;
            case "template":
              if (fieldDef.template) {
                generated[key] = interpolate(fieldDef.template, generated as Record<string, string | number>);
              }
              break;
            case "static":
              generated[key] = fieldDef.value;
              break;
          }
        }
      }

      // Package all generated data as JSON files
      const files: Record<string, string> = {};
      for (const [key, value] of Object.entries(generated)) {
        files[`${key}.json`] = JSON.stringify(value, null, 2);
      }
      return files;
    },
  };
}
