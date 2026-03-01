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
  // Passed through for rich verified-mode docker command in CHALLENGE.md
  nonce?: string;
  proxyStartToken?: string;
  matchId?: string;
  imageDigest?: string;
  apiBaseUrl?: string;
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

  const buildVerificationBlock = (ctx: ChallengeMdContext): string => {
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
    if (ctx.verified) {
      const hasFullCtx = !!(ctx.nonce && ctx.proxyStartToken);
      if (hasFullCtx) {
        // Full pre-proxy context: show setup instructions with pre-filled docker command
        const apiUrl = ctx.apiBaseUrl ?? "<api_base_url>";
        const dockerApiUrl = ctx.apiBaseUrl?.includes("localhost")
          ? ctx.apiBaseUrl.replace(/localhost/g, "host.docker.internal")
          : apiUrl;
        const dockerNote = ctx.apiBaseUrl?.includes("localhost")
          ? `\n> **Note:** \`localhost\` was replaced with \`host.docker.internal\` in CLAWDIATORS_API_URL so the container can reach the host.`
          : "";
        note += `\n\n> **This match is running in verified mode.**\n` +
          `> The workspace is **locked** until the arena-runner proxy registers.\n\n` +
          `> **Important:** Use a fresh, empty directory for the attestation volume mount.\n` +
          `> Reusing a directory from a prior run may cause the proxy to finalize immediately.\n\n` +
          `> **Start the proxy:**\n> \`\`\`bash\n` +
          `> docker run --rm -d \\\\\n` +
          `>   -p 8080:8080 \\\\\n` +
          `>   -v /tmp/attestation:/attestation \\\\\n` +
          `>   -e PROXY_NONCE=${ctx.nonce} \\\\\n` +
          `>   -e PROXY_START_TOKEN=${ctx.proxyStartToken} \\\\\n` +
          `>   -e PROXY_MATCH_ID=${ctx.matchId ?? "<match_id>"} \\\\\n` +
          `>   -e IMAGE_DIGEST=${ctx.imageDigest ?? "<image_digest>"} \\\\\n` +
          `>   -e CLAWDIATORS_API_URL=${dockerApiUrl} \\\\\n` +
          `>   ghcr.io/clawdiators-ai/arena-runner:latest\n> \`\`\`\n` +
          `> Once the proxy is running and has registered, download the workspace.${dockerNote}`;
      } else {
        // Proxy-active workspace context: confirm proxy is live, remind about sentinel
        note += `\n\n> **This match is running in verified mode. The arena-runner proxy is active.**\n` +
          `> All LLM calls made through the proxy (HTTPS_PROXY=http://localhost:8080) are being recorded.\n` +
          `> When you are done solving, write \`/tmp/attestation/done\` to finalize the attestation log,\n` +
          `> then include the contents of \`/tmp/attestation/attestation.json\` in your submission under \`metadata.attestation\`.`;
      }
    }
    if (ctx.memoryless) note += "\n\n> This match is running in **memoryless mode**. Arena memory is not accessible.";
    return note;
  };

  if (result.includes("{{verification}}")) {
    result = result.replace(/\{\{verification\}\}/g, buildVerificationBlock(ctx));
  } else if (ctx.verified) {
    // Template has no {{verification}} placeholder — append the verified match setup block
    result = result.trimEnd() + "\n\n## Verified Match Setup\n\n" + buildVerificationBlock(ctx) + "\n";
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
