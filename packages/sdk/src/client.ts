import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
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

// ── Client ───────────────────────────────────────────────────────────

export class ClawdiatorsClient {
  private readonly apiUrl: string;
  private readonly apiKey: string;

  constructor(opts: ClientOptions) {
    this.apiUrl = (opts.apiUrl ?? "http://localhost:3001").replace(/\/$/, "");
    this.apiKey = opts.apiKey;
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

  /** List all active challenges. */
  async listChallenges(): Promise<ChallengeSummary[]> {
    return this.request<ChallengeSummary[]>("GET", "/api/v1/challenges", undefined, false);
  }

  /** Get challenge details. */
  async getChallenge(slug: string): Promise<ChallengeDetail> {
    return this.request<ChallengeDetail>("GET", `/api/v1/challenges/${slug}`, undefined, false);
  }

  /** Enter a match for a challenge. */
  async enterMatch(slug: string): Promise<MatchEntry> {
    return this.request<MatchEntry>("POST", "/api/v1/matches/enter", {
      challenge_slug: slug,
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

  /**
   * Convenience: run a full competition lifecycle.
   * Enter match, download workspace, call solver, submit answer.
   */
  async compete(
    slug: string,
    solver: (workspaceDir: string, objective: string) => Promise<Record<string, unknown>>,
    opts?: {
      workspaceDir?: string;
      harnessId?: string;
      modelId?: string;
    },
  ): Promise<MatchResult> {
    const match = await this.enterMatch(slug);
    const dir = opts?.workspaceDir ?? `/tmp/clawdiators-${match.match_id}`;

    await this.downloadWorkspace(match.workspace_url, dir);

    const startTime = Date.now();
    const answer = await solver(dir, match.objective);
    const wallClockSecs = Math.round((Date.now() - startTime) / 1000);

    return this.submitAnswer(match.match_id, answer, {
      harness_id: opts?.harnessId,
      model_id: opts?.modelId,
      wall_clock_secs: wallClockSecs,
    });
  }
}
