import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import type { ChallengeModule } from "./types.js";

export interface ChallengeMdContext {
  seed?: number;
  attemptNumber?: number;
  verified?: boolean;
  memoryless?: boolean;
  constraints?: Record<string, unknown> | null;
  verificationPolicy?: { mode?: string; memorylessRecommended?: boolean } | null;
}

/**
 * Inject context placeholders into a CHALLENGE.md template.
 * Handles: {{seed}}, {{attempt_number}}, {{constraints}}, {{verification}}
 */
export function injectChallengeMdContext(template: string, ctx: ChallengeMdContext): string {
  let result = template;

  if (ctx.seed !== undefined) {
    result = result.replace(/\{\{seed\}\}/g, String(ctx.seed));
  }

  if (ctx.attemptNumber !== undefined) {
    result = result.replace(/\{\{attempt_number\}\}/g, String(ctx.attemptNumber));
  }

  if (result.includes("{{constraints}}")) {
    const c = ctx.constraints as Record<string, unknown> | null | undefined;
    const lines: string[] = [];
    if (c) {
      const enforced = ctx.verified ? " (enforced)" : " (advisory)";
      if (typeof c.tokenBudget === "number") lines.push(`- Token budget: ${c.tokenBudget.toLocaleString()}${enforced}`);
      if (typeof c.maxLlmCalls === "number") lines.push(`- Max LLM calls: ${c.maxLlmCalls}${enforced}`);
      if (typeof c.maxToolCalls === "number") lines.push(`- Max tool calls: ${c.maxToolCalls}${enforced}`);
      if (typeof c.maxCostUsd === "number") lines.push(`- Max cost: $${c.maxCostUsd}${ctx.verified ? " (enforced — hard kill)" : " (advisory)"}`);
      if (Array.isArray(c.allowedModels) && c.allowedModels.length) lines.push(`- Allowed models: ${(c.allowedModels as string[]).join(", ")}`);
      if (Array.isArray(c.allowedTools) && c.allowedTools.length) lines.push(`- Allowed tools: ${(c.allowedTools as string[]).join(", ")}`);
      if (c.networkAccess === false) lines.push("- Network access: LLM API only");
    }
    result = result.replace(/\{\{constraints\}\}/g, lines.length ? lines.join("\n") : "(none)");
  }

  if (result.includes("{{verification}}")) {
    const policy = ctx.verificationPolicy;
    let note: string;
    if (policy?.mode === "required") {
      note = "This challenge **requires** verified execution. Run inside the arena-runner container.";
    } else if (policy?.mode === "recommended") {
      note = "This challenge **recommends** verified execution for accurate benchmark data.";
    } else {
      note = "Verified execution is optional. Run inside the arena-runner container for a Verified badge and efficiency scoring.";
    }
    if (policy?.memorylessRecommended) {
      note += " Memoryless mode is recommended for benchmark-grade results.";
    }
    if (ctx.verified) note += "\n\n> This match is running in **verified mode**.";
    if (ctx.memoryless) note += "\n\n> This match is running in **memoryless mode**. Arena memory is not accessible.";
    result = result.replace(/\{\{verification\}\}/g, note);
  }

  return result;
}

/**
 * Generate workspace files for a workspace-based challenge.
 * Returns a map of { relativePath: contents }.
 * Injects CHALLENGE.md from the module's workspaceSpec template.
 */
export function generateWorkspaceFiles(
  mod: ChallengeModule,
  seed: number,
  config: Record<string, unknown>,
): Record<string, string> {
  if (!mod.generateWorkspace) {
    throw new Error(`Module ${mod.slug} does not support workspace generation`);
  }

  const files = mod.generateWorkspace(seed, config);

  // Inject CHALLENGE.md from template if not already present
  if (!files["CHALLENGE.md"] && mod.workspaceSpec?.challengeMd) {
    files["CHALLENGE.md"] = injectChallengeMdContext(mod.workspaceSpec.challengeMd, { seed });
  }

  return files;
}

/**
 * Write workspace files to a temporary directory.
 * Returns the path to the temp directory.
 */
export function writeWorkspaceToDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "clawdiators-workspace-"));

  for (const [relPath, contents] of Object.entries(files)) {
    const fullPath = join(dir, relPath);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, contents, "utf-8");
  }

  return dir;
}

/**
 * Package a workspace directory into a tar.gz archive.
 * Returns the archive as a Buffer.
 */
export function packageWorkspace(dir: string): Buffer {
  const archivePath = `${dir}.tar.gz`;
  execSync(`tar czf "${archivePath}" -C "${dir}" .`, { stdio: "pipe" });
  const archive = readFileSync(archivePath);

  // Clean up archive file (dir is cleaned up separately)
  try { rmSync(archivePath); } catch { /* ignore */ }

  return archive;
}

/**
 * Generate and package a workspace as a tar.gz Buffer.
 * Convenience function combining generation + packaging.
 */
export function buildWorkspaceArchive(
  mod: ChallengeModule,
  seed: number,
  config: Record<string, unknown>,
): Buffer {
  const files = generateWorkspaceFiles(mod, seed, config);
  const dir = writeWorkspaceToDir(files);

  try {
    return packageWorkspace(dir);
  } finally {
    cleanupWorkspace(dir);
  }
}

/**
 * Remove a workspace temp directory.
 */
export function cleanupWorkspace(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup
  }
}
