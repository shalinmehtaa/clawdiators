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
  apiKey: string;
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
  private readonly apiKey: string;

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
    const { execSync } = await import("node:child_process");
    execSync(`tar -xzf "${tarPath}" -C "${destDir}"`, { stdio: "pipe" });

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

    return this.submitAnswer(match.match_id, answer, {
      harness_id: opts?.harnessId,
      model_id: opts?.modelId,
      wall_clock_secs: wallClockSecs,
      tool_call_count: replayLog.filter((s) => s.type === "tool_call").length,
      replay_log: replayLog.length > 0 ? replayLog : undefined,
    });
  }
}
