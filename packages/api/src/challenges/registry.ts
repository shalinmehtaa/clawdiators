import type { ChallengeModule } from "./types.js";
import { lighthouseIncidentModule } from "./lighthouse-incident/index.js";
import { deepMappingModule } from "./deep-mapping/index.js";
import { cipherForgeModule } from "./cipher-forge/index.js";
import { logicReefModule } from "./logic-reef/index.js";
import { reefRefactorModule } from "./reef-refactor/index.js";
import { depthFirstGenModule } from "./depth-first-gen/index.js";
import { archiveDiveModule } from "./archive-dive/index.js";
import { contractReviewModule } from "./contract-review/index.js";
import { chartForensicsModule } from "./chart-forensics/index.js";
import { cartographersEyeModule } from "./cartographers-eye/index.js";
import { blueprintAuditModule } from "./blueprint-audit/index.js";
import { adversarialInterviewModule } from "./adversarial-interview/index.js";
import { theMirageModule } from "./the-mirage/index.js";
import { codebaseArchaeologyModule } from "./codebase-archaeology/index.js";
import { needleHaystackModule } from "./needle-haystack/index.js";
import { performanceOptimizerModule } from "./performance-optimizer/index.js";

import { phantomRegistryModule } from "./phantom-registry/index.js";
import { quickdrawModule } from "./quickdraw/index.js";
import { siegeProtocolModule } from "./siege-protocol/index.js";
import { alphaGenesisModule } from "./alpha-genesis/index.js";

const registry = new Map<string, ChallengeModule>();

function register(mod: ChallengeModule) {
  registry.set(mod.slug, mod);
}

/** Look up a challenge module by slug. Returns undefined if not registered. */
export function getChallenge(slug: string): ChallengeModule | undefined {
  return registry.get(slug);
}

/** Get all registered challenge module slugs. */
export function registeredSlugs(): string[] {
  return Array.from(registry.keys());
}

/** Get all registered modules (for dynamic well-known endpoint generation). */
export function registeredModules(): ChallengeModule[] {
  return Array.from(registry.values());
}

/** Register a module at runtime (used for community challenges). */
export function registerModule(mod: ChallengeModule): void {
  registry.set(mod.slug, mod);
}

// ── Register workspace-based challenge modules ──────────────────────
register(cipherForgeModule);
register(reefRefactorModule);
register(depthFirstGenModule);
register(logicReefModule);
register(archiveDiveModule);
register(adversarialInterviewModule);
register(contractReviewModule);
register(theMirageModule);
register(chartForensicsModule);
register(deepMappingModule);
register(cartographersEyeModule);
register(blueprintAuditModule);
register(codebaseArchaeologyModule);
register(needleHaystackModule);
register(performanceOptimizerModule);
register(lighthouseIncidentModule);

register(phantomRegistryModule);
register(quickdrawModule);
register(siegeProtocolModule);
register(alphaGenesisModule);
