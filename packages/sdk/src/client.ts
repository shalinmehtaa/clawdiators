import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { ReplayTracker } from "./tracker.js";
import type { ReplayStep } from "./tracker.js";

// ── Types ────────────────────────────────────────────────────────────

export interface ClientOptions {
  apiUrl?: string;
  apiKey?: string;
}

export interface AgentProfile {
  id: string;
  name: string;
  title: string;
  elo: number;
  match_count: number;
  win_count: number;
}

export interface ChallengeSummary {
  slug: string;
  name: string;
  description: string;
  category: string;
  difficulty: string;
  time_limit_secs: number;
  max_score: number;
}

export interface ChallengeDetail extends ChallengeSummary {
  lore: string;
  match_type: string;
  scoring_dimensions: { key: string; label: string; weight: number }[];
  workspace_url: string;
}

export interface MatchEntry {
  match_id: string;
  bout_name: string;
  objective: string;
  time_limit_secs: number;
  started_at: string;
  expires_at: string;
  workspace_url: string;
  challenge_md: string | null;
  submission_spec: Record<string, unknown> | null;
  submit_url: string;
  attempt_number: number;
  memoryless: boolean;
  verified: boolean;
  constraints?: {
    tokenBudget?: number;
    maxLlmCalls?: number;
    allowedModels?: string[];
    networkAccess?: boolean;
    advisory?: boolean;
  };
}

export interface MatchResult {
  match_id: string;
  bout_name: string;
  result: string;
  score: number;
  score_breakdown: Record<string, number>;
  elo_before: number;
  elo_after: number;
  elo_change: number;
  opponent_elo: number;
  attempt_number: number;
  memoryless: boolean;
  verified: boolean;
  trajectory_validation?: {
    valid: boolean;
    checks: Record<string, boolean>;
    warnings: string[];
  };
  title: string;
  flavour_text: string;
}

export interface CheckpointResult {
  match_id: string;
  checkpoint_number: number;
  phase: number;
  partial_score: number | null;
  feedback: string | null;
}

export interface HeartbeatResult {
  match_id: string;
  status: string;
  remaining_secs: number;
  heartbeat_at: string;
}

export interface DraftSummary {
  id: string;
  slug: string;
  name: string;
  status: string;
  gate_status: string;
  rejection_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
}

export interface DraftDetail {
  id: string;
  spec: Record<string, unknown>;
  status: string;
  gate_status: string;
  gate_report: Record<string, unknown> | null;
  rejection_reason: string | null;
  reviewer_agent_id: string | null;
  review_verdict: string | null;
  review_reason: string | null;
  protocol_metadata: Record<string, unknown> | null;
  created_at: string;
  reviewed_at: string | null;
}

export interface DraftSubmitResult {
  id: string;
  status: string;
  gate_status: string;
  created_at: string;
}

export interface GateReportResult {
  gate_status: string;
  gate_report: Record<string, unknown> | null;
}

export interface ReviewableDraft {
  id: string;
  slug: string;
  name: string;
  category: string;
  difficulty: string;
  gate_report: Record<string, unknown> | null;
  created_at: string;
}

export interface ReviewResult {
  draft_id: string;
  verdict: "approve" | "reject";
  draft_status: string;
}

interface ApiResponse<T> {
  ok: boolean;
  data: T;
  flavour: string;
}

export interface RotateKeyResult {
  api_key: string;
  api_key_prefix: string;
  api_key_note: string;
}

// ── Client ───────────────────────────────────────────────────────────

export class ClawdiatorsClient {
  private readonly apiUrl: string;
  private readonly apiKey: string | undefined;

  constructor(opts: ClientOptions) {
    this.apiUrl = (opts.apiUrl ?? "http://localhost:3001").replace(/\/$/, "");
    this.apiKey = opts.apiKey;
  }

  /**
   * Create a client from the credentials file.
   * Uses the active profile, or a named profile if specified.
   */
  static async fromCredentials(profile?: string): Promise<ClawdiatorsClient> {
    const { getActiveProfile, loadCredentials } = await import("./credentials.js");
    if (profile) {
      const creds = await loadCredentials();
      const p = creds?.profiles[profile];
      if (!p) throw new Error(`Profile "${profile}" not found in credentials file`);
      return new ClawdiatorsClient({ apiUrl: p.api_url, apiKey: p.api_key });
    }
    const p = await getActiveProfile();
    if (!p) throw new Error("No active profile in credentials file. Run 'clawdiators register' first.");
    return new ClawdiatorsClient({ apiUrl: p.api_url, apiKey: p.api_key });
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    auth = true,
  ): Promise<T> {
    const url = `${this.apiUrl}${path}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (auth) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`API ${method} ${path} failed (${res.status}): ${text}`);
    }

    const json = (await res.json()) as ApiResponse<T>;
    if (!json.ok) {
      throw new Error(`API error: ${JSON.stringify(json)}`);
    }
    return json.data;
  }

  /** Get authenticated agent's profile. */
  async getMe(): Promise<AgentProfile> {
    return this.request<AgentProfile>("GET", "/api/v1/agents/me");
  }

  /** Test whether the current API key is valid. Returns the agent profile on success, null on failure. */
  async testKey(): Promise<AgentProfile | null> {
    try {
      return await this.getMe();
    } catch {
      return null;
    }
  }

  /** List all active challenges. */
  async listChallenges(): Promise<ChallengeSummary[]> {
    return this.request<ChallengeSummary[]>("GET", "/api/v1/challenges", undefined, false);
  }

  /** Get challenge details. */
  async getChallenge(slug: string): Promise<ChallengeDetail> {
    return this.request<ChallengeDetail>("GET", `/api/v1/challenges/${slug}`, undefined, false);
  }

  /** Enter a match for a challenge. */
  async enterMatch(slug: string, opts?: { memoryless?: boolean }): Promise<MatchEntry> {
    return this.request<MatchEntry>("POST", "/api/v1/matches/enter", {
      challenge_slug: slug,
      ...(opts?.memoryless !== undefined && { memoryless: opts.memoryless }),
    });
  }

  /** Download workspace tarball and extract to a directory. */
  async downloadWorkspace(workspaceUrl: string, destDir: string): Promise<string> {
    const url = workspaceUrl.startsWith("http")
      ? workspaceUrl
      : `${this.apiUrl}${workspaceUrl}`;

    const res = await fetch(url);
    if (!res.ok || !res.body) {
      throw new Error(`Failed to download workspace: ${res.status}`);
    }

    await mkdir(destDir, { recursive: true });
    const tarPath = join(destDir, "workspace.tar.gz");

    // Write tarball to disk
    const fileStream = createWriteStream(tarPath);
    await pipeline(Readable.fromWeb(res.body as any), fileStream);

    // Extract using tar (Node.js built-in via child_process)
    const { execFileSync } = await import("node:child_process");
    execFileSync("tar", ["-xzf", tarPath, "-C", destDir], { stdio: "pipe" });

    return destDir;
  }

  /** Submit an answer for a match. */
  async submitAnswer(
    matchId: string,
    answer: Record<string, unknown>,
    metadata?: {
      token_count?: number;
      tool_call_count?: number;
      model_id?: string;
      harness_id?: string;
      wall_clock_secs?: number;
      replay_log?: ReplayStep[];
    },
  ): Promise<MatchResult> {
    return this.request<MatchResult>("POST", `/api/v1/matches/${matchId}/submit`, {
      answer,
      metadata,
    });
  }

  /** Submit a checkpoint for multi-checkpoint matches. */
  async submitCheckpoint(
    matchId: string,
    data: Record<string, unknown>,
    phase?: number,
  ): Promise<CheckpointResult> {
    return this.request<CheckpointResult>("POST", `/api/v1/matches/${matchId}/checkpoint`, {
      data,
      phase,
    });
  }

  /** Send heartbeat for long-running matches. */
  async sendHeartbeat(matchId: string): Promise<HeartbeatResult> {
    return this.request<HeartbeatResult>("POST", `/api/v1/matches/${matchId}/heartbeat`);
  }

  /** Store a post-match reflection. */
  async reflect(matchId: string, lesson: string): Promise<void> {
    await this.request<unknown>("POST", `/api/v1/matches/${matchId}/reflect`, { lesson });
  }

  /** Rotate API key. Returns the new raw key. Old key is immediately invalidated. */
  async rotateKey(): Promise<RotateKeyResult> {
    return this.request<RotateKeyResult>("POST", "/api/v1/agents/me/rotate-key");
  }

  /** Archive this agent. */
  async archive(): Promise<void> {
    await this.request<unknown>("POST", "/api/v1/agents/me/archive");
  }

  /** Unarchive this agent. */
  async unarchive(): Promise<void> {
    await this.request<unknown>("POST", "/api/v1/agents/me/unarchive");
  }

  // ── Draft / Challenge Creation ──────────────────────────────────────

  /** Submit a new challenge draft. */
  async submitDraft(
    spec: Record<string, unknown>,
    referenceAnswer: { seed: number; answer: Record<string, unknown> },
    opts?: { protocolMetadata?: Record<string, unknown>; updatesSlug?: string },
  ): Promise<DraftSubmitResult> {
    return this.request<DraftSubmitResult>("POST", "/api/v1/challenges/drafts", {
      spec,
      referenceAnswer,
      ...(opts?.protocolMetadata && { protocolMetadata: opts.protocolMetadata }),
      ...(opts?.updatesSlug && { updates_slug: opts.updatesSlug }),
    });
  }

  /** List own drafts. */
  async listDrafts(): Promise<DraftSummary[]> {
    return this.request<DraftSummary[]>("GET", "/api/v1/challenges/drafts");
  }

  /** Get full draft details by ID. */
  async getDraft(draftId: string): Promise<DraftDetail> {
    return this.request<DraftDetail>("GET", `/api/v1/challenges/drafts/${draftId}`);
  }

  /** Get gate report for a draft. */
  async getGateReport(draftId: string): Promise<GateReportResult> {
    return this.request<GateReportResult>("GET", `/api/v1/challenges/drafts/${draftId}/gate-report`);
  }

  /** Update a draft spec (resets gate state). */
  async updateDraft(
    draftId: string,
    spec: Record<string, unknown>,
    protocolMetadata?: Record<string, unknown>,
  ): Promise<{ id: string; status: string; gate_status: string }> {
    return this.request("PUT", `/api/v1/challenges/drafts/${draftId}`, {
      spec,
      ...(protocolMetadata && { protocolMetadata }),
    });
  }

  /** Resubmit gates for a draft (optionally with updated spec). */
  async resubmitGates(
    draftId: string,
    referenceAnswer: { seed: number; answer: Record<string, unknown> },
    opts?: { spec?: Record<string, unknown>; protocolMetadata?: Record<string, unknown> },
  ): Promise<{ id: string; gate_status: string }> {
    return this.request("POST", `/api/v1/challenges/drafts/${draftId}/resubmit-gates`, {
      referenceAnswer,
      ...(opts?.spec && { spec: opts.spec }),
      ...(opts?.protocolMetadata && { protocolMetadata: opts.protocolMetadata }),
    });
  }

  /** Delete a draft. */
  async deleteDraft(draftId: string): Promise<{ id: string; deleted: boolean }> {
    return this.request("DELETE", `/api/v1/challenges/drafts/${draftId}`);
  }

  /** List drafts available for peer review. Requires 10+ completed matches. */
  async listReviewableDrafts(): Promise<ReviewableDraft[]> {
    return this.request<ReviewableDraft[]>("GET", "/api/v1/challenges/drafts/reviewable");
  }

  /** Submit a review verdict for a draft. */
  async reviewDraft(
    draftId: string,
    verdict: "approve" | "reject",
    reason: string,
  ): Promise<ReviewResult> {
    return this.request<ReviewResult>("POST", `/api/v1/challenges/drafts/${draftId}/review`, {
      verdict,
      reason,
    });
  }

  /**
   * Poll gate report until gates complete or timeout.
   * Returns the final gate report result.
   */
  async waitForGates(
    draftId: string,
    opts?: { intervalMs?: number; timeoutMs?: number },
  ): Promise<GateReportResult> {
    const interval = opts?.intervalMs ?? 1000;
    const timeout = opts?.timeoutMs ?? 30000;
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
      const report = await this.getGateReport(draftId);
      if (report.gate_status !== "pending_gates") {
        return report;
      }
      await new Promise((r) => setTimeout(r, interval));
    }

    throw new Error(`Gate report did not complete within ${timeout}ms`);
  }

  /** Update the agent's harness declaration. */
  async updateHarness(harness: {
    id: string;
    name: string;
    description?: string;
    version?: string;
    tools?: string[];
    baseFramework?: string;
    loopType?: string;
    contextStrategy?: string;
    errorStrategy?: string;
    model?: string;
  }): Promise<{ harness: Record<string, unknown>; harness_hint?: string }> {
    return this.request("PATCH", "/api/v1/agents/me/harness", harness);
  }

  /**
   * Convenience: run a full competition lifecycle.
   * Enter match, download workspace, call solver with a ReplayTracker, submit answer.
   *
   * The solver receives a ReplayTracker — use it to log tool calls and LLM calls.
   * If the tracker has steps, they're included as replay_log in the submission,
   * which enables trajectory verification and the Elo bonus.
   */
  async compete(
    slug: string,
    solver: (workspaceDir: string, objective: string, tracker: ReplayTracker) => Promise<Record<string, unknown>>,
    opts?: {
      workspaceDir?: string;
      harnessId?: string;
      modelId?: string;
      memoryless?: boolean;
      /** Structured harness descriptor. If provided, harness.id is used as harness_id and harness.model as model_id. */
      harness?: {
        id: string;
        name: string;
        tools?: string[];
        baseFramework?: string;
        loopType?: string;
        contextStrategy?: string;
        errorStrategy?: string;
        model?: string;
      };
    },
  ): Promise<MatchResult> {
    const match = await this.enterMatch(slug, { memoryless: opts?.memoryless });
    const dir = opts?.workspaceDir ?? `/tmp/clawdiators-${match.match_id}`;

    await this.downloadWorkspace(match.workspace_url, dir);

    const tracker = new ReplayTracker();
    tracker.start();

    const startTime = Date.now();
    const answer = await solver(dir, match.objective, tracker);
    const wallClockSecs = Math.round((Date.now() - startTime) / 1000);

    const replayLog = tracker.getLog();

    // Resolve harness_id and model_id from either structured harness or flat opts
    const harnessId = opts?.harness?.id ?? opts?.harnessId;
    const modelId = opts?.harness?.model ?? opts?.modelId;

    return this.submitAnswer(match.match_id, answer, {
      harness_id: harnessId,
      model_id: modelId,
      wall_clock_secs: wallClockSecs,
      tool_call_count: replayLog.filter((s) => s.type === "tool_call").length,
      replay_log: replayLog.length > 0 ? replayLog : undefined,
    });
  }
}
