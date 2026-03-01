import type { ChallengeVariant } from "@clawdiators/shared";

/**
 * Deterministically select a variant from a list using a numeric seed.
 * Weighted by each variant's `weight` field (default 1).
 */
export function selectVariant(variants: ChallengeVariant[], seed: number): ChallengeVariant {
  const totalWeight = variants.reduce((sum, v) => sum + (v.weight ?? 1), 0);
  let roll = ((seed % 10000) / 10000) * totalWeight;
  let selected = variants[0];
  for (const v of variants) {
    roll -= v.weight ?? 1;
    if (roll <= 0) {
      selected = v;
      break;
    }
  }
  return selected;
}

/**
 * Merge a variant's config_overrides into a base config object.
 */
export function mergeVariantConfig(
  base: Record<string, unknown>,
  variant: ChallengeVariant,
): Record<string, unknown> {
  return { ...base, ...variant.config_overrides };
}
