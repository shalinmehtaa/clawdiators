// Domain types shared across API and Web

export interface HarnessInfo {
  id: string;           // "claude-code", "custom-python-scaffold"
  name: string;         // "Claude Code"
  description?: string;
  version?: string;
  tools?: string[];     // ["bash", "read", "write", "grep"]
}

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
  category_notes: Record<string, CategoryNote>;
  stats_summary: MemoryStatsSummary | null;
}

export interface CategoryNote {
  note: string;       // max 500 chars
  confidence: number; // 0-1
  ts: string;
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

// ChallengeStrategy is used both in AgentMemory (global) and ChallengeMemory (per-challenge)
export interface ChallengeStrategy {
  insight: string;    // max 500 chars
  confidence: number; // 0-1
  ts: string;
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

// ── Verification Types ──────────────────────────────────────────────

export interface LLMCallRecord {
  seq: number;
  ts: string;
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  duration_ms: number;
  status_code: number;
  request_hash: string;
  response_hash: string;
  token_extraction: "exact" | "fallback" | "unknown";
}

export interface ConstraintViolation {
  type: "token_budget" | "call_limit" | "model_violation" | "network_blocked";
  detail: string;
  seq: number;
  ts: string;
}

export interface ActivitySummary {
  files_read: number;
  files_written: number;
  commands_run: number;
  unique_tools: string[];
}

export interface CostEstimate {
  total_usd: number;
  by_model: Record<string, number>;
  pricing_version: string;
}

/** Proxy-observable harness fingerprint included in every attestation. */
export interface AttestationHarnessSnapshot {
  system_prompt_hash: string | null;
  tool_definitions_hash: string | null;
  tools_observed: string[];
  models_used: string[];
}

export interface VerifiedAttestation {
  image_digest: string;
  nonce: string;
  chain_head_hash: string;
  chain_length: number;
  llm_calls: LLMCallRecord[];
  total_input_tokens: number;
  total_output_tokens: number;
  total_llm_calls: number;
  total_tool_calls: number;
  wall_clock_secs: number;
  harness_snapshot?: AttestationHarnessSnapshot;
  estimated_cost?: CostEstimate;
  activity_summary?: ActivitySummary;
  constraint_violations?: ConstraintViolation[];
}

export interface MatchHarnessSnapshot {
  claimed_id: string;
  claimed_version: string | null;
  system_prompt_hash: string | null;
  tool_definitions_hash: string | null;
  tools_observed: string[];
  models_used: string[];
}

export interface VerificationResult {
  status: "verified" | "failed";
  checks: {
    nonce_match: boolean;
    chain_integrity: boolean;
    image_digest_known: boolean;
    timing_consistent: boolean;
    token_count_consistent: boolean;
  };
  errors: string[];
  verified_at: string;
}

export interface ChallengeVerificationPolicy {
  mode: "optional" | "recommended" | "required";
  memorylessRecommended?: boolean;
  verifiedConstraints?: ChallengeConstraints;
}

export interface ChallengeDisclosurePolicy {
  replayVisibility: "private" | "delayed_public" | "public_opt_in";
  redactSubmissionUntil: "never" | "version_rotated" | "challenge_archived";
  benchmarkSeedExposure: "normal" | "restricted";
}

// ── Benchmark Metrics ───────────────────────────────────────────────

export interface BenchmarkMetrics {
  pass_at_1?: number;       // P(first attempt wins) — cold capability
  best_of_3?: number;       // mean(max score from first 3 attempts per agent) — capability
  best_of_5?: number;       // mean(max score from first 5 attempts per agent) — capability
  pass_k_3?: number;        // P(all first 3 attempts win) — reliability
  pass_k_5?: number;        // P(all first 5 attempts win) — reliability
  learning_curve?: {        // mean score improvement from attempt 1→2→3
    attempt_1_mean?: number;
    attempt_2_mean?: number;
    attempt_3_mean?: number;
  };
  agents_sampled?: number;  // number of agents with enough data for metrics
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

// ── Evaluation Types ──────────────────────────────────────────────────

/** Runtime environment for evaluator containers. */
export type EvalRuntime = "node" | "python" | "multi";

/** A single step in an agent's replay log. */
export interface ReplayStep {
  ts: string;
  tool: string;           // "bash", "read", "write", "grep", "browser", "llm"
  input: string;          // truncated input (max 5000 chars)
  output?: string;        // truncated output (max 5000 chars)
  duration_ms: number;
  error?: boolean;
  metadata?: Record<string, unknown>;
}

/** Metadata about the agent's resource usage during a match. */
export interface SubmissionMetadata {
  token_count?: number;
  tool_call_count?: number;
  model_id?: string;
  harness_id?: string;
  wall_clock_secs?: number;
  replay_log?: ReplayStep[];
}

/** Audit trail for how a submission was evaluated. */
export interface EvaluationLog {
  method: string;
  runtime?: EvalRuntime;
  startedAt: string;
  completedAt: string;
  containerExitCode?: number;
  stdout?: string;
  rawScores: Record<string, number>;
  finalScores: Record<string, number>;
  total: number;
  errors: string[];
}

/** How the submission is evaluated. */
export interface ScoringSpec {
  /** Evaluation method */
  method: "deterministic" | "test-suite" | "custom-script";
  /** Scoring dimensions (reused from existing system) */
  dimensions: ScoringDimension[];
  /** Max total score (default 1000) */
  maxScore: number;
  /** For test-suite/custom-script: evaluator script or test command */
  evaluator?: string;
  /** For deterministic: ground truth data */
  groundTruth?: unknown;
  /** Runtime for test-suite/custom-script evaluation */
  runtime?: EvalRuntime;
}

// ── Challenge Governance Types ───────────────────────────────────────

export interface DraftProtocolMetadata {
  designGuideHash: string;   // SHA-256 of challenge-design-guide.md at authoring time
  complianceChecklist: {
    solvedAsExternalAgent: boolean;
    wrongFormatWarningsTested: boolean;
    antiGamingProbeTested: boolean;
    scoreDistributionSanityChecked: boolean;
  };
}

export interface GateResult {
  passed: boolean;
  details: Record<string, unknown>;
  error?: string;
}

export interface GateReport {
  gates: {
    spec_validity: GateResult;
    determinism: GateResult;
    contract_consistency: GateResult;
    baseline_solveability: GateResult;
    anti_gaming: GateResult;
    score_distribution: GateResult;
    design_guide_hash: GateResult;
  };
  overall: "pass" | "fail" | "warn";
  generated_at: string;
}

export interface ReviewerVerdict {
  agentId: string;
  verdict: "accept" | "reject" | "revise";
  findings: string[];
  severity: "info" | "warn" | "critical";
  trustScore: number;   // snapshotted at review time
  submittedAt: string;
}

export interface QuorumResult {
  status: "pending" | "accepted" | "rejected" | "escalated";
  reportCount: number;
  trustWeightSum: number;
  hasCriticalFinding: boolean;
}

/** Optional constraints on agent resource usage. */
export interface ChallengeConstraints {
  tokenBudget?: number;
  maxToolCalls?: number;
  allowedTools?: string[];
  networkAccess?: boolean;
  // New (container-only enforcement)
  maxLlmCalls?: number;
  allowedModels?: string[];
  maxCostUsd?: number;
}

/** Calibration data for difficulty auto-adjustment. */
export interface CalibrationData {
  completion_rate: number;
  median_score: number;
  win_rate: number;
  time_utilization: number;
  sample_size: number;
  calibrated_at: string;
}

/** Analytics data for a challenge. */
export interface ChallengeAnalytics {
  challenge_slug: string;
  total_attempts: number;
  completed_count: number;
  completion_rate: number;
  median_score: number | null;
  mean_score: number | null;
  score_p25: number | null;
  score_p75: number | null;
  win_rate: number;
  avg_duration_secs: number | null;
  score_distribution: { bucket: string; count: number }[];
  score_by_harness: Record<string, { mean: number; median: number; count: number }>;
  score_by_model: Record<string, { mean: number; median: number; count: number }>;
  score_by_variant: Record<string, { mean: number; median: number; count: number; win_rate: number }>;
  score_trend: { date: string; mean_score: number; count: number }[];
  computed_at: string;
}

/** Summary of a challenge version for version history display. */
export interface ChallengeVersionSummary {
  id: string;
  version: number;
  changelog: string | null;
  created_at: string;
  archived_at: string | null;
}

// ── Challenge Tracks & Collections ──────────────────────────────────

export type TrackScoringMethod = "sum" | "average" | "min";

export interface TrackDef {
  slug: string;
  name: string;
  description: string;
  lore: string;
  challenge_slugs: string[];
  scoring_method: TrackScoringMethod;
  max_score: number;
  active: boolean;
}

export interface TrackProgress {
  track_slug: string;
  completed_slugs: string[];
  best_scores: Record<string, number>;
  cumulative_score: number;
  completed: boolean;
}

// ── A/B Testing Variants ─────────────────────────────────────────────

export interface ChallengeVariant {
  id: string;           // "A", "B"
  label: string;        // "Original", "Harder ciphers"
  config_overrides: Record<string, unknown>;
  weight?: number;      // assignment weight, default equal
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

// ── Layered Memory System ────────────────────────────────────────────

/** Per-agent, per-challenge memory. Factual layer auto-populated; interpretive layer agent-written. */
export interface ChallengeMemory {
  challenge_slug: string;
  attempt_count: number;
  best_score: number | null;
  avg_score: number | null;
  last_attempted_at: string | null;
  score_trend: "improving" | "plateau" | "declining" | null;
  best_score_breakdown: ScoreBreakdown | null;
  best_match_id: string | null;
  notes: string | null;               // null for public views
  strategies: ChallengeStrategy[];    // empty for public views
}

/** A single historical version of an agent's system prompt. */
export interface HarnessVersion {
  hash: string;
  firstSeenAt: string;
  lastSeenAt: string;
  verifiedMatchCount: number;
  bestScore: number | null;
  avgScore: number | null;
  label?: string;  // agent-written: "v2.1 — added web search"
}

/** Tracks evolution of an agent's harness across verified matches. */
export interface HarnessLineage {
  versions: HarnessVersion[];
  currentHash: string | null;
}
