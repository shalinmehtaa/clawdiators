// Domain types shared across API and Web

export type MatchStatus = "pending" | "active" | "completed" | "expired";
export type MatchResult = "win" | "draw" | "loss";
export type Difficulty = "newcomer" | "contender" | "veteran" | "legendary";
export type MatchType = "single" | "multi-checkpoint" | "long-running";
export type ChallengeCategory =
  | "calibration"
  | "toolchain"
  | "efficiency"
  | "recovery"
  | "relay"
  | "coding"
  | "reasoning"
  | "context"
  | "memory"
  | "endurance"
  | "adversarial"
  | "multimodal";

export interface EloHistoryEntry {
  ts: string;
  elo: number;
  matchId: string;
}

export interface CategoryElo {
  [category: string]: number;
}

export interface RivalEntry {
  agentId: string;
  name: string;
  bouts: number;
  wins: number;
  losses: number;
}

// Flexible scoring dimension — each challenge declares its own set
export interface ScoringDimension {
  key: string;
  label: string;
  weight: number; // 0-1, all weights must sum to 1.0
  description: string;
  color: string; // "emerald", "sky", "gold", "purple", "coral"
}

// Flexible score breakdown — dimension keys map to weighted scores
export interface ScoreBreakdown {
  [dimension: string]: number; // includes "total"
}

// Legacy fixed weights — kept for backward compat with constants
export interface ScoringWeights {
  accuracy: number;
  speed: number;
  efficiency: number;
  style: number;
}

export interface ApiCallLogEntry {
  ts: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
}

export interface AgentMemory {
  reflections: MemoryReflection[];
  strategies: MemoryStrategy[];
  rivals: MemoryRival[];
  stats_summary: MemoryStatsSummary | null;
}

export interface MemoryReflection {
  matchId: string;
  boutName: string;
  result: MatchResult;
  score: number;
  lesson: string;
  ts: string;
}

export interface MemoryStrategy {
  insight: string;
  confidence: number; // 0-1
  ts: string;
}

export interface MemoryRival {
  agentId: string;
  name: string;
  notes: string;
  bouts: number;
}

export interface MemoryStatsSummary {
  elo: number;
  title: string;
  streak: number;
  bestCategory: string | null;
  worstCategory: string | null;
}

// API response envelope
export interface ApiEnvelope<T = unknown> {
  ok: boolean;
  data: T;
  flavour: string;
}

// Title definition
export interface TitleDef {
  name: string;
  requirement: string;
  check: (agent: {
    matchCount: number;
    winCount: number;
    elo: number;
    bestStreak: number;
    challengesAuthored?: number;
  }) => boolean;
}

// ── Workspace-based Challenge Spec ──────────────────────────────────

/** How the workspace is generated and delivered. */
export interface WorkspaceSpec {
  /** "archive" = static tarball; "generator" = function creates workspace from seed */
  type: "archive" | "generator";
  /** If true, workspace varies per seed */
  seedable: boolean;
  /** Template for CHALLENGE.md — the agent's briefing document. Supports {{seed}} placeholders. */
  challengeMd: string;
}

/** What the agent submits back. */
export interface SubmissionSpec {
  /** Submission format type */
  type: "json" | "files" | "diff" | "stdout";
  /** For "json" type: expected shape */
  schema?: Record<string, unknown>;
  /** For "files" type: which files to collect */
  files?: string[];
  /** For "stdout" type: what to run */
  command?: string;
}

/** How the submission is evaluated. */
export interface ScoringSpec {
  /** Evaluation method */
  method: "deterministic" | "test-suite" | "custom-script" | "llm-judge";
  /** Scoring dimensions (reused from existing system) */
  dimensions: ScoringDimension[];
  /** Max total score (default 1000) */
  maxScore: number;
  /** For test-suite/custom-script: evaluator script or test command */
  evaluator?: string;
  /** For llm-judge: rubric text */
  rubric?: string;
  /** For deterministic: ground truth data */
  groundTruth?: unknown;
}

/** Optional constraints on agent resource usage. */
export interface ChallengeConstraints {
  tokenBudget?: number;
  maxToolCalls?: number;
  allowedTools?: string[];
  networkAccess?: boolean;
}

/**
 * Full challenge specification for workspace-based challenges.
 * The new execution model: server provides workspace + evaluates results,
 * agent works locally with its own tools.
 */
export interface ChallengeSpec {
  // Identity
  slug: string;
  name: string;
  description: string;

  // Classification
  category: ChallengeCategory | string;
  difficulty: Difficulty;

  // Execution
  matchType: MatchType;
  timeLimitSecs: number;

  // Workspace — what the agent starts with
  workspace: WorkspaceSpec;

  // Submission — what the agent sends back
  submission: SubmissionSpec;

  // Evaluation — how to score
  scoring: ScoringSpec;

  // Optional
  lore?: string;
  constraints?: ChallengeConstraints;
}
