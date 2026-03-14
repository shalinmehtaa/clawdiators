import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import type { ChallengeModule } from "./types.js";
import type { ChallengeMemory, HarnessInfo } from "@clawdiators/shared";
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
  // Harness injection
  agentHarness?: HarnessInfo | null;
  // Environment challenge: live service URLs (keyed by service name)
  serviceUrls?: Record<string, string>;
  // Environment challenge: shared auth token for live services
  serviceToken?: string;
  // Environment challenge: rate-limited docs proxy URL
  proxyUrl?: string;
  // Campaign-specific fields (research programs)
  campaignId?: string;
  programSlug?: string;
  sessionNumber?: number;
  sessionExpiresAt?: string;
  bestMetric?: number | null;
  experimentCount?: number;
  findingsCount?: number;
  maxFindingsPerSession?: number;
  maxFindingsPerCampaign?: number;
  // Resume-only: experiment history, agent findings, community findings
  experimentHistory?: {
    number: number;
    hypothesis: string | null;
    metric_value: number | null;
    is_new_best: boolean;
  }[];
  agentFindings?: {
    claim_type: string;
    claim: string;
    status: string;
    score: number | null;
  }[];
  communityFindings?: {
    agent_name: string;
    claim_type: string;
    claim: string;
    score: number | null;
  }[];
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

  // {{service_urls.<name>}} — agent-facing URLs for live service containers
  result = result.replace(/\{\{service_urls\.([^}]+)\}\}/g, (_match, name) => {
    return ctx.serviceUrls?.[name] ?? `(service URL not available: ${name})`;
  });

  // {{service_token}} — shared auth token for live services
  if (result.includes("{{service_token}}")) {
    result = result.replace(/\{\{service_token\}\}/g, ctx.serviceToken ?? "(token not available)");
  }

  // {{proxy_url}} — rate-limited docs proxy URL
  if (result.includes("{{proxy_url}}")) {
    result = result.replace(/\{\{proxy_url\}\}/g, ctx.proxyUrl ?? "(proxy URL not available)");
  }

  // Campaign placeholders
  if (ctx.campaignId !== undefined) {
    result = result.replace(/\{\{campaign_id\}\}/g, ctx.campaignId);
  }
  if (ctx.programSlug !== undefined) {
    result = result.replace(/\{\{findings_url\}\}/g, `/api/v1/programs/${ctx.programSlug}/findings`);
  }
  if (ctx.sessionNumber !== undefined) {
    result = result.replace(/\{\{session_number\}\}/g, String(ctx.sessionNumber));
  }
  if (ctx.sessionExpiresAt !== undefined) {
    result = result.replace(/\{\{session_expires_at\}\}/g, ctx.sessionExpiresAt);
  }
  if (ctx.bestMetric !== undefined) {
    result = result.replace(/\{\{best_metric\}\}/g, ctx.bestMetric != null ? String(ctx.bestMetric) : "none yet");
  }
  if (ctx.experimentCount !== undefined) {
    result = result.replace(/\{\{experiment_count\}\}/g, String(ctx.experimentCount));
  }
  // {{objective}} — cleaned up if still present (should be injected by caller via template context)

  // Campaign session block — appended for research programs
  if (ctx.campaignId) {
    result += "\n\n" + buildCampaignSessionBlock(ctx);
  }

  // Unconditional harness block — appended at the end of every CHALLENGE.md
  result += "\n\n" + buildHarnessBlock(ctx);

  return result;
}

/**
 * Build the campaign session block appended to every campaign_md.
 * First session: minimal. Resume: rich with experiment history + findings.
 */
function buildCampaignSessionBlock(ctx: ChallengeMdContext): string {
  const lines: string[] = [];
  const isResume = (ctx.sessionNumber ?? 1) > 1;

  if (isResume && ctx.experimentHistory?.length) {
    lines.push("## Your Progress");
    lines.push("");
    lines.push(`Session ${ctx.sessionNumber} | Experiments: ${ctx.experimentCount ?? 0} | Best metric: ${ctx.bestMetric != null ? ctx.bestMetric : "n/a"}`);
    lines.push("");

    // Recent experiments table
    lines.push("### Recent Experiments");
    lines.push("");
    lines.push("| # | Hypothesis | Metric | Best? |");
    lines.push("|---|-----------|--------|-------|");
    for (const exp of ctx.experimentHistory.slice(0, 10)) {
      const hyp = exp.hypothesis ?? "(no hypothesis)";
      const metric = exp.metric_value != null ? String(exp.metric_value) : "-";
      const best = exp.is_new_best ? "yes" : "";
      lines.push(`| ${exp.number} | ${hyp.slice(0, 60)} | ${metric} | ${best} |`);
    }
    lines.push("");

    // Agent's own findings
    if (ctx.agentFindings?.length) {
      lines.push("### Your Findings");
      lines.push("");
      for (const f of ctx.agentFindings) {
        const scoreStr = f.score != null ? `, score ${f.score}` : "";
        lines.push(`- ${f.claim_type}: "${f.claim.slice(0, 80)}..." — ${f.status}${scoreStr}`);
      }
      lines.push("");
    }

    // Community findings
    if (ctx.communityFindings?.length) {
      lines.push("## Community Findings");
      lines.push("");
      lines.push(`${ctx.communityFindings.length} finding(s) from other agents:`);
      for (const f of ctx.communityFindings.slice(0, 5)) {
        const scoreStr = f.score != null ? ` — score ${f.score}` : "";
        lines.push(`- [${f.agent_name}] ${f.claim_type}: "${f.claim.slice(0, 80)}..."${scoreStr}`);
      }
      lines.push(`View all: GET /api/v1/programs/${ctx.programSlug}/findings`);
      lines.push("");
    }
  }

  // Session info block (always present)
  lines.push("## Session");
  lines.push("");
  const sessionLabel = `Session ${ctx.sessionNumber ?? 1}`;
  const expiresLabel = ctx.sessionExpiresAt ? ` | Expires: ${ctx.sessionExpiresAt}` : "";
  lines.push(`${sessionLabel}${expiresLabel}`);
  const maxSession = ctx.maxFindingsPerSession ?? 10;
  const maxCampaign = ctx.maxFindingsPerCampaign ?? 50;
  const usedFindings = ctx.findingsCount ?? 0;
  lines.push(`Findings budget: ${maxSession} this session, ${maxCampaign - usedFindings} remaining total`);
  lines.push("");

  // API quick reference
  lines.push("## API Quick Reference");
  lines.push("");
  lines.push(`Log experiment: POST /api/v1/campaigns/${ctx.campaignId}/experiments/log`);
  lines.push(`Submit finding: POST /api/v1/findings/submit`);
  lines.push(`End session:    POST /api/v1/campaigns/${ctx.campaignId}/end-session`);
  lines.push(`Community findings: GET /api/v1/programs/${ctx.programSlug}/findings`);

  return lines.join("\n");
}

/**
 * Build the trajectory encouragement block for CHALLENGE.md.
 */
function buildTrajectoryBlock(ctx: ChallengeMdContext): string {
  const lines: string[] = [];

  lines.push("## Trajectory");
  lines.push("");
  lines.push("Include a `replay_log` in your submission metadata to earn the **Verified** badge and an **Elo bonus** (1.1x on wins, 1.2x for benchmark-grade = verified + first attempt).");
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
 * Build the harness context block for CHALLENGE.md.
 * Adapts content based on agent's harness state.
 */
function buildHarnessBlock(ctx: ChallengeMdContext): string {
  const lines: string[] = [];
  const h = ctx.agentHarness;

  lines.push("## Your Harness");
  lines.push("");

  if (h && (h.baseFramework || h.loopType || h.contextStrategy || h.errorStrategy)) {
    // Has structural descriptors — confirm declared configuration
    lines.push(`**${h.baseFramework}** (${h.id})${h.version ? ` v${h.version}` : ""}`);
    lines.push("");
    const details: string[] = [];
    if (h.baseFramework) details.push(`- Framework: ${h.baseFramework}`);
    if (h.loopType) details.push(`- Loop type: ${h.loopType}`);
    if (h.contextStrategy) details.push(`- Context strategy: ${h.contextStrategy}`);
    if (h.errorStrategy) details.push(`- Error strategy: ${h.errorStrategy}`);
    if (h.tools?.length) details.push(`- Tools: ${h.tools.join(", ")}`);
    lines.push(...details);
    lines.push("");
    lines.push("Your harness configuration is recorded. Performance will be attributed to this setup on the harness leaderboard.");
  } else if (h) {
    // Has basic harness but no structural fields
    lines.push(`**${h.baseFramework}** (${h.id})`);
    lines.push("");
    lines.push("Your harness is registered but missing structural descriptors (baseFramework, loopType, contextStrategy, errorStrategy).");
    lines.push("Add them via `PATCH /api/v1/agents/me/harness` to appear on the harness leaderboard with full attribution.");
  } else {
    // No harness at all
    lines.push("No harness registered. Register one to get attribution on the harness leaderboard:");
    lines.push("");
    lines.push("```");
    lines.push("PATCH /api/v1/agents/me/harness");
    lines.push('{');
    lines.push('  "baseFramework": "claude-code",');
    lines.push('  "loopType": "single-agent",');
    lines.push('  "contextStrategy": "progressive-disclosure",');
    lines.push('  "errorStrategy": "model-driven",');
    lines.push('  "tools": ["bash", "read", "write", "edit"]');
    lines.push('}');
    lines.push("```");
    lines.push("");
    lines.push("See `GET /api/v1/harnesses/frameworks` for known frameworks and suggested taxonomy values.");
  }

  return lines.join("\n");
}

/**
 * Generate workspace files for a workspace-based challenge.
 * Returns a map of { relativePath: contents }.
 * Injects CHALLENGE.md from the module's workspaceSpec template.
 */
export async function generateWorkspaceFiles(
  mod: ChallengeModule,
  seed: number,
  config: Record<string, unknown>,
  ctx?: ChallengeMdContext,
): Promise<Record<string, string>> {
  if (!mod.generateWorkspace) {
    throw new Error(`Module ${mod.slug} does not support workspace generation`);
  }

  const files = await mod.generateWorkspace(seed, config);

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
    if (!fullPath.startsWith(dir + "/")) {
      throw new Error(`Invalid workspace path: ${relPath}`);
    }
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
  execFileSync("tar", [
    "czf", archivePath,
    "--exclude=._*", "--exclude=.DS_Store",
    "-C", dir, ".",
  ], {
    stdio: "pipe",
    env: { ...process.env, COPYFILE_DISABLE: "1" },
  });
  const archive = readFileSync(archivePath);

  // Clean up archive file (dir is cleaned up separately)
  try { rmSync(archivePath); } catch { /* ignore */ }

  return archive;
}

/**
 * Generate and package a workspace as a tar.gz Buffer.
 * Convenience function combining generation + packaging.
 */
export async function buildWorkspaceArchive(
  mod: ChallengeModule,
  seed: number,
  config: Record<string, unknown>,
  ctx?: ChallengeMdContext,
): Promise<Buffer> {
  const files = await generateWorkspaceFiles(mod, seed, config, ctx);
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
