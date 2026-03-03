/**
 * Startup tasks — load approved community challenges from DB and register them,
 * plus auto-archive idle ghost agents.
 */
import { eq, and, isNull, sql } from "drizzle-orm";
import { db, challenges, agents } from "@clawdiators/db";
import { registerModule, getChallenge } from "./challenges/registry.js";
import { validateSpec } from "./challenges/primitives/validator.js";
import { createDeclarativeModule } from "./challenges/primitives/declarative-module.js";
import { createCodeModule } from "./challenges/primitives/code-module.js";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Cached hash of plans/challenge-design-guide.md, computed once at startup
let DESIGN_GUIDE_HASH = "";
let DESIGN_GUIDE_HASH_COMPUTED_AT = "";

/**
 * Compute and cache SHA-256 of plans/challenge-design-guide.md.
 * Path is resolved relative to the repo root (4 levels up from packages/api/src/).
 */
export async function computeDesignGuideHash(): Promise<void> {
  try {
    const thisFile = fileURLToPath(import.meta.url);
    // packages/api/src/startup.ts → up 4 levels to repo root
    const repoRoot = join(thisFile, "..", "..", "..", "..");
    const guidePath = join(repoRoot, "plans", "challenge-design-guide.md");
    const content = await readFile(guidePath, "utf8");
    DESIGN_GUIDE_HASH = createHash("sha256").update(content).digest("hex");
    DESIGN_GUIDE_HASH_COMPUTED_AT = new Date().toISOString();
  } catch {
    // File may not exist in all environments — use placeholder
    DESIGN_GUIDE_HASH = "unavailable";
    DESIGN_GUIDE_HASH_COMPUTED_AT = new Date().toISOString();
  }
}

export function getDesignGuideHash(): { hash: string; computed_at: string } {
  return { hash: DESIGN_GUIDE_HASH, computed_at: DESIGN_GUIDE_HASH_COMPUTED_AT };
}

/**
 * Load all approved community challenges (those with a communitySpec in config)
 * and register their declarative modules at runtime.
 */
export async function loadCommunityModules(): Promise<void> {
  let rows;
  try {
    rows = await db.query.challenges.findMany();
  } catch {
    // DB may not be available at startup (e.g., during tests)
    return;
  }

  let loaded = 0;
  for (const row of rows) {
    // Skip if already registered (built-in module)
    if (getChallenge(row.slug)) continue;

    // Check if this challenge has a community spec in its config
    const config = row.config as Record<string, unknown>;
    const communitySpec = config?.communitySpec;
    if (!communitySpec) continue;

    const validation = validateSpec(communitySpec);
    if (!validation.valid) {
      console.warn(`Skipping community challenge ${row.slug}: invalid spec`);
      continue;
    }

    // Read cachedAssets from config if present
    const cachedAssets = config?.cachedAssets as Record<string, unknown> | undefined;

    // Use code module for specs with codeFiles, declarative module otherwise
    const mod = validation.spec.codeFiles
      ? createCodeModule(validation.spec, cachedAssets ? { cachedAssets } : undefined)
      : createDeclarativeModule(validation.spec);
    registerModule(mod);
    loaded++;
  }

  if (loaded > 0) {
    console.log(`Loaded ${loaded} community challenge module(s)`);
  }
}

/**
 * Auto-archive idle ghost agents: 0 matches, created > 6 months ago.
 * Runs once on server startup. These agents auto-unarchive on next API key use.
 */
export async function autoArchiveIdleAgents(): Promise<void> {
  try {
    const result = await db
      .update(agents)
      .set({ archivedAt: new Date(), archivedReason: "auto:idle" })
      .where(
        and(
          eq(agents.matchCount, 0),
          isNull(agents.archivedAt),
          sql`${agents.createdAt} < now() - interval '6 months'`,
        ),
      )
      .returning({ id: agents.id });

    if (result.length > 0) {
      console.log(`Auto-archived ${result.length} idle agent(s)`);
    }
  } catch {
    // Best-effort — don't block startup
  }
}
