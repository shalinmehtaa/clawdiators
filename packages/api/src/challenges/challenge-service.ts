/**
 * Shared challenge service functions — reused by admin routes and the quorum engine.
 */
import { eq, and, isNull } from "drizzle-orm";
import { db, challengeDrafts, challenges } from "@clawdiators/db";
import type { ChallengeDraft } from "@clawdiators/db";
import { validateSpec, verifyDeterminism } from "./primitives/validator.js";
import { createDeclarativeModule } from "./primitives/declarative-module.js";
import { createCodeModule } from "./primitives/code-module.js";
import { registerModule } from "./registry.js";
import { isDockerAvailable, evaluateInDocker, evaluateInSubprocess } from "./docker-evaluator.js";

/**
 * Approve a community challenge draft:
 * 1. Validate spec
 * 2. Verify determinism
 * 3. Insert into challenges table (handles version updates)
 * 4. Register module at runtime
 * 5. Update draft status to "approved"
 *
 * Throws on any validation failure.
 */
export async function approveDraft(draftId: string): Promise<{ id: string; slug: string; status: "approved" }> {
  const draft = await db.query.challengeDrafts.findFirst({
    where: eq(challengeDrafts.id, draftId),
  });

  if (!draft) {
    throw new Error("Draft not found");
  }

  if (draft.status === "approved") {
    throw new Error("Draft already approved");
  }

  // Validate the spec
  const validation = validateSpec(draft.spec);
  if (!validation.valid) {
    throw new Error(`Spec validation failed: ${validation.errors.join("; ")}`);
  }

  const spec = validation.spec;

  // Create the appropriate module type and verify determinism
  const isCodeBased = !!spec.codeFiles;
  const mod = isCodeBased
    ? createCodeModule(spec)
    : createDeclarativeModule(spec);
  const deterCheck = verifyDeterminism((seed) => mod.generateData(seed, {}));
  if (!deterCheck.deterministic) {
    throw new Error(`Determinism check failed: ${deterCheck.error}`);
  }

  // Handle version updates
  const updatesSlug = (draft.spec as Record<string, unknown>).updates_slug as string | undefined;
  let newVersion = 1;
  let previousVersionId: string | undefined;

  if (updatesSlug) {
    const currentVersion = await db.query.challenges.findFirst({
      where: and(eq(challenges.slug, updatesSlug), isNull(challenges.archivedAt)),
    });
    if (currentVersion) {
      await db
        .update(challenges)
        .set({ archivedAt: new Date() })
        .where(eq(challenges.id, currentVersion.id));
      newVersion = currentVersion.version + 1;
      previousVersionId = currentVersion.id;
    }
  }

  // Insert into challenges table
  const inserted = await db
    .insert(challenges)
    .values({
      slug: spec.slug,
      name: spec.name,
      description: spec.description,
      lore: spec.lore,
      category: spec.category,
      difficulty: spec.difficulty,
      matchType: spec.matchType,
      timeLimitSecs: spec.timeLimitSecs,
      maxScore: spec.scoring.maxScore,
      scoringDimensions: spec.scoring.dimensions,
      sandboxApis: [],
      config: { communitySpec: draft.spec },
      phases: spec.phases ?? [],
      active: true,
      authorAgentId: draft.authorAgentId,
      workspaceType: spec.workspace.type,
      submissionType: spec.submission.type,
      scoringMethod: isCodeBased ? "custom-script" : spec.scoring.method,
      challengeMdTemplate: spec.workspace.challengeMd,
      version: newVersion,
      previousVersionId: previousVersionId ?? null,
      changelog: updatesSlug ? `Updated from v${newVersion - 1}` : null,
      constraints: spec.constraints ?? null,
      verificationPolicy: spec.verification ?? null,
      disclosurePolicy: spec.disclosure ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: challenges.id });

  if (inserted.length === 0) {
    throw new Error(`Challenge slug "${spec.slug}" already exists`);
  }

  // Register the module at runtime
  registerModule(mod);

  // Execute setup.js for Tier 2+ if present (downloads assets, etc.)
  const tier = spec.environment?.tier ?? "sandboxed";
  if (isCodeBased && spec.codeFiles?.["setup.js"] && tier !== "sandboxed") {
    try {
      const cachedAssets = await executeSetupScript(spec);
      if (cachedAssets && Object.keys(cachedAssets).length > 0) {
        // Store cachedAssets in challenge config and re-register module
        const updatedConfig = { communitySpec: draft.spec, cachedAssets };
        await db
          .update(challenges)
          .set({ config: updatedConfig })
          .where(eq(challenges.id, inserted[0].id));

        // Re-create and re-register module with cached assets
        const updatedMod = createCodeModule(spec, { cachedAssets });
        registerModule(updatedMod);
      }
    } catch (err: any) {
      console.warn(`setup.js execution failed for ${spec.slug}: ${err.message}`);
      // Non-fatal — don't block approval
    }
  }

  // Update draft status
  await db
    .update(challengeDrafts)
    .set({ status: "approved", reviewedAt: new Date() })
    .where(eq(challengeDrafts.id, draftId));

  return { id: draftId, slug: spec.slug, status: "approved" };
}

/**
 * Execute a setup.js script inside Docker (or subprocess fallback).
 * Returns parsed assets from stdout.
 */
async function executeSetupScript(
  spec: import("./primitives/validator.js").CommunitySpec,
): Promise<Record<string, unknown> | null> {
  const setupCode = spec.codeFiles?.["setup.js"];
  if (!setupCode) return null;

  // Build a self-contained setup runner script
  const runner = [
    `"use strict";`,
    `var fs = require("fs");`,
    ``,
    `// --- setup.js ---`,
    setupCode,
    ``,
    `// --- runner ---`,
    `(async function() {`,
    `  try {`,
    `    var setupFn = module.exports.setup || exports.setup;`,
    `    if (typeof setupFn !== "function") {`,
    `      console.log(JSON.stringify({ scores: {}, assets: {} }));`,
    `      return;`,
    `    }`,
    `    var result = await Promise.resolve(setupFn());`,
    `    var assets = (result && result.assets) || {};`,
    `    console.log(JSON.stringify({ scores: {}, assets: assets }));`,
    `  } catch (err) {`,
    `    console.error("setup.js error:", err.message || err);`,
    `    console.log(JSON.stringify({ scores: {}, error: String(err.message || err) }));`,
    `    process.exit(1);`,
    `  }`,
    `})();`,
  ].join("\n");

  const dockerOk = await isDockerAvailable();
  const evalFn = dockerOk ? evaluateInDocker : evaluateInSubprocess;

  const result = await evalFn(
    {},
    runner,
    "node",
    120, // 2 minute timeout for setup
    { tier: "networked" }, // Always needs network for asset downloads
  );

  if (result.error) {
    throw new Error(result.error);
  }

  // Parse assets from stdout
  const lines = result.stdout.trim().split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(lines[i]);
      if (parsed && typeof parsed.assets === "object") {
        return parsed.assets;
      }
    } catch {
      // Not valid JSON — try next line
    }
  }

  return null;
}
