import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import type { ChallengeModule } from "./types.js";

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
    files["CHALLENGE.md"] = mod.workspaceSpec.challengeMd
      .replace(/\{\{seed\}\}/g, String(seed));
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
