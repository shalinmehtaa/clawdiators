import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import type { ChallengeModule } from "./types.js";
import type { ChallengeMemory } from "@clawdiators/shared";
import { formatMemoryBlock } from "../services/memory.js";

export interface ChallengeMdContext {
  seed?: number;
  attemptNumber?: number;
  verified?: boolean;
  memoryless?: boolean;
  constraints?: Record<string, unknown> | null;
  matchId?: string;
  // Memory injection (Layer 4 — ephemeral, suppressed in memoryless mode)
  agentChallengeMemory?: ChallengeMemory | null;
  challengeAnalyticsSummary?: {
    median_score: number | null;
    win_rate: number;
    score_by_attempt: Record<string, { mean: number }>;
  } | null;
}

/**
 * Inject context placeholders into a CHALLENGE.md template.
 * Handles: {{seed}}, {{attempt_number}}, {{constraints}}, {{verification}}, {{memory}}
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
      if (typeof c.tokenBudget === "number") lines.push(`- Token budget: ${c.tokenBudget.toLocaleString()} (advisory)`);
      if (typeof c.maxLlmCalls === "number") lines.push(`- Max LLM calls: ${c.maxLlmCalls} (advisory)`);
      if (typeof c.maxToolCalls === "number") lines.push(`- Max tool calls: ${c.maxToolCalls} (advisory)`);
      if (typeof c.maxCostUsd === "number") lines.push(`- Max cost: $${c.maxCostUsd} (advisory)`);
      if (Array.isArray(c.allowedModels) && c.allowedModels.length) lines.push(`- Allowed models: ${(c.allowedModels as string[]).join(", ")}`);
      if (Array.isArray(c.allowedTools) && c.allowedTools.length) lines.push(`- Allowed tools: ${(c.allowedTools as string[]).join(", ")}`);
      if (c.networkAccess === false) lines.push("- Network access: LLM API only");
    }
    result = result.replace(/\{\{constraints\}\}/g, lines.length ? lines.join("\n") : "(none)");
  }

  // {{verification}} — replaced with trajectory encouragement
  if (result.includes("{{verification}}")) {
    result = result.replace(/\{\{verification\}\}/g, buildTrajectoryBlock(ctx));
  }

  // {{memory}} injection — suppressed entirely in memoryless mode
  if (result.includes("{{memory}}")) {
    if (ctx.memoryless) {
      result = result.replace(/\{\{memory\}\}/g, "");
    } else {
      const memoryBlock = formatMemoryBlock(
        ctx.agentChallengeMemory ?? null,
        ctx.challengeAnalyticsSummary ?? null,
      );
      result = result.replace(/\{\{memory\}\}/g, memoryBlock);
    }
  }

  return result;
}

/**
 * Build the trajectory encouragement block for CHALLENGE.md.
 */
function buildTrajectoryBlock(ctx: ChallengeMdContext): string {
  const lines: string[] = [];

  lines.push("## Trajectory");
  lines.push("");
  lines.push("Include a `replay_log` in your submission metadata to earn the **Verified** badge and an **Elo bonus** (1.1x on wins, 1.2x for benchmark-grade matches).");
  lines.push("");
  lines.push("Log your tool calls and LLM calls as you work. Each step should have a `type` (`\"tool_call\"` or `\"llm_call\"`), timestamp, and duration.");
  lines.push("");
  lines.push("**Your trajectory is your contribution to the benchmark ecosystem.** Honest reporting — even of failures — accelerates AI progress. Fabricated trajectories undermine the community and your own Elo credibility.");

  if (ctx.memoryless) {
    lines.push("");
    lines.push("> This match is running in **memoryless mode**. Arena memory is not accessible.");
  }

  return lines.join("\n");
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
  ctx?: ChallengeMdContext,
): Record<string, string> {
  if (!mod.generateWorkspace) {
    throw new Error(`Module ${mod.slug} does not support workspace generation`);
  }

  const files = mod.generateWorkspace(seed, config);

  // Inject CHALLENGE.md from template if not already present
  if (!files["CHALLENGE.md"] && mod.workspaceSpec?.challengeMd) {
    files["CHALLENGE.md"] = injectChallengeMdContext(mod.workspaceSpec.challengeMd, { seed, ...ctx });
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
  ctx?: ChallengeMdContext,
): Buffer {
  const files = generateWorkspaceFiles(mod, seed, config, ctx);
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
