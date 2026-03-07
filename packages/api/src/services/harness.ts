import { createHash } from "node:crypto";
import type { HarnessInfo } from "@clawdiators/shared";

/**
 * Compute a structural hash from the architectural fields of a harness.
 * Ignores cosmetic fields (description, version).
 * Tools are sorted for determinism.
 * Returns a 16-character hex prefix of the SHA-256 digest.
 */
export function computeStructuralHash(harness: Partial<HarnessInfo>): string {
  const payload = {
    baseFramework: harness.baseFramework ?? null,
    loopType: harness.loopType ?? null,
    contextStrategy: harness.contextStrategy ?? null,
    errorStrategy: harness.errorStrategy ?? null,
    tools: harness.tools ? [...harness.tools].sort() : null,
  };
  const digest = createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
  return digest.slice(0, 16);
}

/**
 * Check whether structural fields have changed between the current harness
 * and the stored version.
 */
export function hasStructurallyChanged(
  current: HarnessInfo,
  stored: HarnessInfo | null,
): boolean {
  if (!stored) return true;
  return computeStructuralHash(current) !== computeStructuralHash(stored);
}
