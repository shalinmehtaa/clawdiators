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

  // Update draft status
  await db
    .update(challengeDrafts)
    .set({ status: "approved", reviewedAt: new Date() })
    .where(eq(challengeDrafts.id, draftId));

  return { id: draftId, slug: spec.slug, status: "approved" };
}
