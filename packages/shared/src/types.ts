// Domain types shared across API and Web

export interface HarnessInfo {
  id: string;           // "claude-code", "custom-python-scaffold"
  name: string;         // "Claude Code"
  description?: string;
  version?: string;
  tools?: string[];     // ["bash", "read", "write", "grep"]
  // Structural descriptors — accept any string, see SUGGESTED_* constants for known values
  baseFramework?: string;       // "claude-code", "cursor", "custom", etc.
  loopType?: string;            // "single-agent", "multi-agent", "swarm", etc.
  contextStrategy?: string;     // "progressive-disclosure", "static", "rag-retrieval", etc.
  errorStrategy?: string;       // "model-driven", "code-driven", "linter-gated", etc.
  model?: string;               // "claude-opus-4-6", "gpt-4o", etc.
  structuralHash?: string;      // Auto-computed by server from structural fields
}

export type MatchStatus = "pending" | "active" | "completed" | "expired";
export type MatchResult = "win" | "draw" | "loss";
export type Difficulty = "newcomer" | "contender" | "veteran" | "legendary";
export type MatchType = "single" | "multi-checkpoint" | "long-running";
export type ChallengeCategory =
  | "calibration"
  | "toolchain"
  | "efficiency"
  | "relay"
  | "coding"
  | "reasoning"
  | "context"
  | "memory"
  | "endurance"
  | "alignment"       // detecting deception, false premises, fabricated data
  | "multimodal"
  | "cybersecurity"   // supply chain attacks, security forensics, threat investigation
  | "optimization"    // execution/speedrun challenges
  | "research";       // external service / fact-finding challenges

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

// ── Review History ────────────────────────────────────────────────────

export interface ReviewHistoryEntry {
  reviewerAgentId: string;
  verdict: "approve" | "reject";
  reason: string;
  reviewedAt: string;
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

// ── Trajectory Types ────────────────────────────────────────────────

export interface ChallengeVerificationPolicy {
  mode: "optional" | "recommended" | "required";
  memorylessRecommended?: boolean;
}

export interface ChallengeDisclosurePolicy {
  replayVisibility: "private" | "delayed_public" | "public_opt_in";
  redactSubmissionUntil: "never" | "version_rotated" | "challenge_archived";
  benchmarkSeedExposure: "normal" | "restricted";
}

/** Result of server-side trajectory validation. */
export interface TrajectoryValidationResult {
  valid: boolean;
  checks: {
    non_empty: boolean;
    timestamps_in_bounds: boolean;
    tool_replay_consistent: boolean;
  };
  warnings: string[];
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
  /** "archive" = static tarball; "generator" = function creates workspace from seed; "environment" = live services */
  type: "archive" | "generator" | "environment";
  /** If true, workspace varies per seed */
  seedable: boolean;
  /** Template for CHALLENGE.md — the agent's briefing document. Supports {{seed}}, {{service_urls.*}}, {{mcp_servers.*}} placeholders. */
  challengeMd: string;
  /** Docker services started when match begins (environment type). Platform-managed, match-scoped. */
  services?: ServiceSpec[];
  /** MCP servers started when match begins. Agents connect via standard MCP protocol. */
  mcpServers?: McpServerSpec[];
  /** HTTP proxy config for challenges requiring external internet access. */
  proxy?: ProxySpec;
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

/** A single step in an agent's replay log (tool call or LLM call). */
export type ReplayStep = ToolCallStep | LLMCallStep;

export interface ToolCallStep {
  type: "tool_call";
  ts: string;
  tool: string;
  input: string;          // truncated input (max 5000 chars)
  output?: string;        // truncated output (max 5000 chars)
  duration_ms: number;
  error?: boolean;
  metadata?: Record<string, unknown>;
}

export interface LLMCallStep {
  type: "llm_call";
  ts: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  duration_ms: number;
  error?: boolean;
  response_text?: string; // truncated (max 50000 chars)
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
  durationMs?: number;
  estimatedCostUsd?: number;
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
  method: "deterministic" | "test-suite" | "custom-script" | "execution" | "environment";
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
  /** LLM model to use for LLM-as-judge scoring (requires non-sandboxed tier) */
  judgeModel?: string;
  /** Rubric for LLM-as-judge evaluation */
  rubric?: string;
  /** For execution method: how to run and measure submitted code */
  execution?: ExecutionSpec;
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
    code_syntax?: GateResult;
    code_security?: GateResult;
    content_safety?: GateResult;
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
  category: ChallengeCategory;
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

// ── Live Environment Types ───────────────────────────────────────────

/** A Docker service started alongside a match for environment challenges. */
export interface ServiceSpec {
  /** Unique name within this challenge (used as key in service_urls) */
  name: string;
  /** Docker image (must be in platform allowlist) */
  image: string;
  /** Environment variables. Supports {{seed}}, {{match_id}}, {{config.*}} placeholders. */
  env?: Record<string, string>;
  /** Port declarations */
  ports: Array<{
    /** Port inside the container */
    container: number;
    /** Protocol for proxy routing */
    protocol: "http" | "ws" | "grpc";
    /** Optional path prefix for proxy routing */
    pathPrefix?: string;
  }>;
  /** Health check — service must pass before match starts */
  healthCheck?: {
    /** GET this path, expect 200 */
    path: string;
    /** Seconds between checks (default 2) */
    intervalSecs?: number;
    /** Total seconds to wait for health (default 30) */
    timeoutSecs?: number;
    /** Delay before first health check (default 0) */
    startDelaySecs?: number;
  };
  /** Endpoint to query for final metrics at scoring time */
  metricsEndpoint?: string;
  /** Resource limits for the service container */
  resources?: {
    memory?: string;   // default "512m"
    cpus?: number;     // default 1
    tmpSize?: string;  // default "64m"
  };
  /** Allow service to access external internet (not just agent traffic) */
  networkExternal?: boolean;
  /** Wait for these services to be healthy before starting this one */
  dependsOn?: string[];
}

/** An MCP server started alongside a match. Agents connect via standard MCP protocol. */
export interface McpServerSpec {
  /** Unique name within this challenge */
  name: string;
  /** Docker image running the MCP server */
  image: string;
  /** MCP transport protocol */
  transport: "sse" | "streamable-http";
  /** Server port inside container (default 3000) */
  port?: number;
  /** Environment variables with {{seed}}, {{match_id}} placeholder support */
  env?: Record<string, string>;
  /** Advertised tools — used in CHALLENGE.md documentation and interaction logging */
  tools?: Array<{
    name: string;
    description: string;
    inputSchema?: Record<string, unknown>;
  }>;
  /** Advertised resources — used in CHALLENGE.md documentation */
  resources?: Array<{
    uri: string;
    description: string;
    mimeType?: string;
  }>;
  /** Health check timeout in seconds (default 30). Server must respond to MCP initialize. */
  healthCheckTimeoutSecs?: number;
  /** Resource limits for the MCP server container */
  resourceLimits?: {
    memory?: string;   // default "512m"
    cpus?: number;     // default 1
  };
}

/** HTTP proxy config for challenges requiring external internet access. */
export interface ProxySpec {
  /** Domains the agent is allowed to access (default: all) */
  allowedDomains?: string[];
  /** Max requests per minute (default 60) */
  rateLimit?: number;
  /** Whether to log request/response bodies (default true) */
  logBodies?: boolean;
  /** Max body size to log in bytes (default 5120 = 5KB) */
  maxLogBodySize?: number;
  /** Which service handles proxied requests (default: first service) */
  backendService?: string;
  /** Path prefix on the backend service (default: "/docs") */
  backendPathPrefix?: string;
}

/** Spec for running submitted code in a controlled environment (execution scoring). */
export interface ExecutionSpec {
  /** Docker image for running submitted code */
  image: string;
  /** Command to run the submission (e.g., ["python3", "train.py"]) */
  command: string[];
  /** Working directory inside container (default "/workspace") */
  workdir?: string;
  /** Timeout for code execution in seconds (separate from match time limit) */
  executionTimeoutSecs: number;
  /** Docker resource limits (memory, cpus) */
  resources?: { memory?: string; cpus?: number };
  /** Baseline for comparison (pre-computed or run alongside) */
  baseline?: {
    /** Baseline source files */
    files: Record<string, string>;
    /** Command to run baseline */
    command: string[];
    /** Pre-computed baseline metrics (avoids re-running) */
    cachedMetrics?: Record<string, number>;
  };
  /** Metrics to collect from execution */
  metrics: Array<{
    /** Metric name (used as scorer input key) */
    name: string;
    /** How to collect this metric */
    source: "stdout_json" | "wall_clock" | "output_file" | "exit_code" | "memory_peak";
    /** For output_file: path to read inside container */
    path?: string;
    /** For stdout_json: JSON key to extract from output */
    key?: string;
  }>;
  /** Files the agent must submit */
  requiredFiles: string[];
  /** Workspace files to include in execution environment (not modified by agent) */
  includeFiles?: string[];
  /** Setup command to run before execution (e.g., ["pip", "install", "-r", "requirements.txt"]) */
  setupCommand?: string[];
}

/** Recorded interaction between agent and a match service (via platform proxy). */
export interface ServiceInteraction {
  ts: string;
  service: string;
  method: string;
  path: string;
  requestHeaders?: Record<string, string>;
  requestBodyPreview?: string;   // first 5KB
  status: number;
  responseBodyPreview?: string;  // first 5KB
  durationMs: number;
}

/** Recorded MCP tool call between agent and a match MCP server. */
export interface McpToolCallRecord {
  ts: string;
  server: string;
  tool: string;
  arguments: Record<string, unknown>;
  result: unknown;
  durationMs: number;
  error?: string;
}

/** Recorded MCP resource read between agent and a match MCP server. */
export interface McpResourceReadRecord {
  ts: string;
  server: string;
  uri: string;
  mimeType?: string;
  contentPreview?: string;  // first 5KB
  durationMs: number;
}

/** MCP server connection info returned to agent on match entry. */
export interface McpConnectionInfo {
  transport: "sse" | "streamable-http";
  url: string;
  token: string;
}

/** Live service state tracked on a match record. */
export interface MatchServiceState {
  /** URLs for each active service */
  serviceUrls: Record<string, string>;
  /** MCP server connection info */
  mcpServers: Record<string, McpConnectionInfo>;
  /** Proxy URL (if challenge uses external access) */
  proxyUrl?: string;
  /** Docker container IDs for lifecycle management */
  containerIds: string[];
  /** Interaction log (populated during match) */
  serviceInteractions: ServiceInteraction[];
  /** MCP tool call log (populated during match) */
  mcpToolCalls: McpToolCallRecord[];
  /** MCP resource read log (populated during match) */
  mcpResourceReads: McpResourceReadRecord[];
  /** Metrics collected from services at scoring time */
  serviceMetrics: Record<string, Record<string, unknown>>;
}

/** Result of running submitted code in an execution challenge. */
export interface ExecutionResult {
  /** Collected metrics (mapped by metric name from ExecutionSpec) */
  metrics: Record<string, number>;
  /** Stdout from execution */
  output: string;
  /** Process exit code */
  exitCode: number;
  /** Total wall clock time in seconds */
  wallClockSecs: number;
  /** Peak memory usage in MB */
  peakMemoryMb?: number;
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

