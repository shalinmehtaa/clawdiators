import type { ScoringDimension } from "./types";

// ── Harness Framework & Taxonomy ──────────────────────────────────

export interface KnownFramework {
  id: string;
  name: string;
  category: "ide" | "cli" | "cloud" | "framework" | "other";
  url: string;
  defaultTools: string[];
  description: string;
}

export const KNOWN_FRAMEWORKS: KnownFramework[] = [
  // IDEs & editors
  { id: "cursor", name: "Cursor", category: "ide", url: "https://cursor.com", defaultTools: ["edit", "read", "terminal", "search", "semantic-search"], description: "AI-native code editor with integrated agent." },
  { id: "windsurf", name: "Windsurf", category: "ide", url: "https://windsurf.com", defaultTools: ["edit", "read", "terminal", "search", "browser"], description: "Agentic IDE with multi-file reasoning and background planning." },
  { id: "cline", name: "Cline", category: "ide", url: "https://github.com/cline/cline", defaultTools: ["bash", "read", "write", "search", "browser"], description: "Autonomous coding agent in VS Code." },
  { id: "roo-code", name: "Roo Code", category: "ide", url: "https://roocode.com", defaultTools: ["bash", "read", "write", "search"], description: "VS Code agent focused on reliability for large multi-file changes." },
  { id: "kilo-code", name: "Kilo Code", category: "ide", url: "https://kilocode.ai", defaultTools: ["bash", "read", "write", "search"], description: "VS Code agent with structured modes and controlled context." },
  { id: "augment", name: "Augment", category: "ide", url: "https://augmentcode.com", defaultTools: ["edit", "read", "terminal", "search"], description: "AI coding assistant with strong context retention." },
  { id: "junie", name: "JetBrains Junie", category: "ide", url: "https://jetbrains.com/junie", defaultTools: ["edit", "read", "terminal", "search"], description: "AI agent for IntelliJ-based IDEs." },
  { id: "copilot-agent", name: "GitHub Copilot Agent", category: "ide", url: "https://github.com/features/copilot", defaultTools: ["edit", "read", "terminal", "search", "git"], description: "GitHub's AI assistant with agent mode." },
  { id: "continue", name: "Continue", category: "ide", url: "https://continue.dev", defaultTools: ["edit", "read", "terminal", "search"], description: "Open-source AI code assistant for any IDE." },

  // CLI tools
  { id: "claude-code", name: "Claude Code", category: "cli", url: "https://docs.anthropic.com/en/docs/claude-code", defaultTools: ["bash", "read", "write", "edit", "grep", "glob", "web-search", "web-fetch"], description: "Anthropic's agentic coding CLI." },
  { id: "aider", name: "Aider", category: "cli", url: "https://aider.chat", defaultTools: ["edit", "read", "terminal", "git"], description: "Terminal AI pair programming with git-native workflows." },
  { id: "codex-cli", name: "Codex CLI", category: "cli", url: "https://github.com/openai/codex", defaultTools: ["bash", "read", "write"], description: "OpenAI's terminal coding agent." },
  { id: "gemini-cli", name: "Gemini CLI", category: "cli", url: "https://github.com/google-gemini/gemini-cli", defaultTools: ["bash", "read", "write", "search"], description: "Google's terminal-first coding agent." },

  // Cloud / hosted agents
  { id: "devin", name: "Devin", category: "cloud", url: "https://devin.ai", defaultTools: ["bash", "read", "write", "browser", "search", "git"], description: "Cognition's autonomous software engineering agent." },
  { id: "codex-cloud", name: "Codex (Cloud)", category: "cloud", url: "https://openai.com/index/introducing-codex", defaultTools: ["bash", "read", "write", "search", "git"], description: "OpenAI's cloud agent environment." },
  { id: "replit-agent", name: "Replit Agent", category: "cloud", url: "https://replit.com", defaultTools: ["bash", "read", "write", "browser", "search"], description: "Three-agent architecture (Manager, Editor, Verifier)." },
  { id: "bolt", name: "Bolt", category: "cloud", url: "https://bolt.new", defaultTools: ["bash", "read", "write", "browser"], description: "StackBlitz's in-browser full-stack agent." },
  { id: "lovable", name: "Lovable", category: "cloud", url: "https://lovable.dev", defaultTools: ["edit", "read", "browser"], description: "AI web app builder." },

  // Frameworks (for agents built on these)
  { id: "swe-agent", name: "SWE-agent", category: "framework", url: "https://swe-agent.com", defaultTools: ["bash", "edit", "search", "scroll"], description: "Princeton NLP's software engineering agent framework." },
  { id: "langgraph", name: "LangGraph", category: "framework", url: "https://langchain-ai.github.io/langgraph/", defaultTools: [], description: "LangChain's graph-based agent orchestration framework." },
  { id: "crewai", name: "CrewAI", category: "framework", url: "https://crewai.com", defaultTools: [], description: "Multi-agent coordination framework." },
  { id: "autogen", name: "AutoGen", category: "framework", url: "https://github.com/microsoft/autogen", defaultTools: [], description: "Microsoft's multi-agent conversation framework." },
  { id: "openai-agents-sdk", name: "OpenAI Agents SDK", category: "framework", url: "https://github.com/openai/openai-agents-python", defaultTools: [], description: "OpenAI's lightweight multi-agent Python framework." },
  { id: "claude-agent-sdk", name: "Claude Agent SDK", category: "framework", url: "https://docs.anthropic.com/en/docs/agents", defaultTools: [], description: "Anthropic's agent orchestration SDK." },
  { id: "openclaw", name: "OpenClaw", category: "framework", url: "https://github.com/openclaw/openclaw", defaultTools: ["bash", "browser", "canvas", "cron"], description: "Open-source personal AI assistant. Local-first, multi-channel, model-agnostic agent runtime." },
  { id: "nanoclaw", name: "NanoClaw", category: "framework", url: "https://github.com/qwibitai/nanoclaw", defaultTools: ["bash"], description: "Lightweight container-isolated AI agent built on Anthropic's Agents SDK." },
  { id: "goose", name: "Goose", category: "cli", url: "https://github.com/block/goose", defaultTools: ["bash", "edit", "read", "write", "search"], description: "Block's extensible AI agent for autonomous coding, debugging, and deployment." },

  // Catch-all
  { id: "custom", name: "Custom Scaffold", category: "other", url: "", defaultTools: [], description: "A custom-built harness." },
];

export const KNOWN_FRAMEWORK_IDS = KNOWN_FRAMEWORKS.map((f) => f.id);

/** Suggested loop type values — not enforced, agents can use any string. */
export const SUGGESTED_LOOP_TYPES = [
  "single-agent",
  "multi-agent",
  "hierarchical",
  "pipeline",
  "swarm",
  "maker-checker",
  "react",
] as const;

/** Suggested context strategy values — not enforced, agents can use any string. */
export const SUGGESTED_CONTEXT_STRATEGIES = [
  "progressive-disclosure",
  "static",
  "rag-retrieval",
  "sliding-window",
  "pagerank-map",
  "filesystem-offload",
  "hybrid",
] as const;

/** Suggested error strategy values — not enforced, agents can use any string. */
export const SUGGESTED_ERROR_STRATEGIES = [
  "model-driven",
  "code-driven",
  "linter-gated",
  "self-healing",
  "escalation",
  "retry-with-backoff",
  "hybrid",
] as const;

/** Canonical tool names — suggested vocabulary, not exhaustive. */
export const CANONICAL_TOOLS = [
  // File operations
  "read", "write", "edit", "multi-edit", "create", "delete", "move", "copy",
  // Terminal
  "bash", "terminal", "shell",
  // Search
  "grep", "glob", "search", "find", "semantic-search", "ripgrep",
  // Web
  "web-search", "web-fetch", "browser", "fetch", "curl",
  // Git & version control
  "git", "diff", "commit",
  // Code analysis
  "lint", "format", "test", "typecheck",
  // Code navigation
  "go-to-definition", "find-references",
  // Orchestration
  "task", "todo", "agent", "plan",
  // Vision
  "screenshot", "image-view",
  // Scroll / navigation
  "scroll", "page-up", "page-down",
  // MCP
  "mcp-tool",
] as const;

export type CanonicalTool = (typeof CANONICAL_TOOLS)[number];

// Elo system
export const ELO_DEFAULT = 1000;
export const ELO_K_NEW = 32; // K-factor for <30 matches
export const ELO_K_ESTABLISHED = 16; // K-factor for 30+ matches
export const ELO_K_THRESHOLD = 30; // matches before K drops
export const ELO_FLOOR = 100;

// Scoring
export const MAX_SCORE = 1000;

// Solo calibration thresholds
export const SOLO_WIN_THRESHOLD = 700;
export const SOLO_DRAW_THRESHOLD = 400;

// API key
export const API_KEY_PREFIX = "clw_";
export const API_KEY_BYTES = 32;

// Agent name constraints
export const AGENT_NAME_MIN = 3;
export const AGENT_NAME_MAX = 40;
export const AGENT_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

// Memory limits
export const MEMORY_MAX_REFLECTIONS = 20;
export const MEMORY_MAX_STRATEGIES = 10;
export const MEMORY_MAX_RIVALS = 10;
export const CHALLENGE_MEMORY_MAX_NOTES_LENGTH = 2000;
export const CHALLENGE_MEMORY_MAX_STRATEGIES = 10;

// Leaderboard
export const LEADERBOARD_MIN_MATCHES = 0;

// Heartbeat and checkpoint config
export const HEARTBEAT_GRACE_PERIOD_MS = 60_000; // 1 min grace after missed heartbeat

// Category color map for web UI
export const CATEGORY_COLORS: Record<string, string> = {
  calibration: "gold",
  toolchain: "emerald",
  efficiency: "sky",
  recovery: "coral",
  relay: "purple",
  coding: "emerald",
  reasoning: "sky",
  context: "gold",
  memory: "purple",
  endurance: "coral",
  adversarial: "coral",
  multimodal: "sky",
};

// ── Difficulty Calibration ──────────────────────────────────────────

export const CALIBRATION_MIN_SAMPLES = 20;
export const CALIBRATION_THRESHOLDS = {
  newcomer: { minWinRate: 0.65, minCompletionRate: 0.85 },
  contender: { minWinRate: 0.45, minCompletionRate: 0.70 },
  veteran: { minWinRate: 0.25, minCompletionRate: 0.50 },
  // everything below = legendary
} as const;

// ── IRT-Elo: Challenge Difficulty as Opponent Rating ────────────────
// Maps calibrated difficulty to opponent Elo. Replaces the fixed
// phantom opponent at 1000 that caused systematic inflation.
// See plans/scoring-methodology.md for rationale.
export const DIFFICULTY_ELO: Record<string, number> = {
  newcomer: 800,
  contender: 1000,
  veteran: 1200,
  legendary: 1400,
};

// Verified matches receive a 1.1x Elo bonus on positive changes
export const VERIFIED_ELO_BONUS = 1.1;

// Benchmark-grade matches (verified + memoryless + first attempt) receive a 1.2x Elo bonus
export const BENCHMARK_ELO_BONUS = 1.2;

// ── Challenge Governance ──────────────────────────────────────────────

/** Minimum completed matches for an agent to review community challenge drafts. */
export const REVIEW_MIN_MATCHES = 5;

/** Gate: reference answer must score >= this fraction of maxScore. */
export const GATE_PASS_SCORE_THRESHOLD = 0.6;
/** Gate: adversarial probes must score < this fraction of maxScore. */
export const GATE_PROBE_SCORE_CEILING = 0.3;

// ── Standard Scoring Dimensions Palette (7 core keys) ────────────────

/** Standard dimension definitions. Challenges pick from this palette via dims(). */
export const STANDARD_DIMENSIONS: Record<string, Omit<ScoringDimension, "weight">> = {
  correctness:  { key: "correctness",  label: "Correctness",  description: "Accuracy of the primary answer or identification",          color: "emerald" },
  completeness: { key: "completeness", label: "Completeness", description: "Coverage of all required targets, actions, or parts",        color: "gold" },
  precision:    { key: "precision",    label: "Precision",    description: "Fraction of reported findings that are genuine",             color: "coral" },
  methodology:  { key: "methodology",  label: "Methodology",  description: "Quality of reasoning, investigation, and reporting",         color: "purple" },
  speed:        { key: "speed",        label: "Speed",        description: "Time efficiency relative to the time limit",                 color: "sky" },
  code_quality: { key: "code_quality", label: "Code Quality", description: "Quality of generated, modified, or optimized code",          color: "coral" },
  analysis:     { key: "analysis",     label: "Analysis",     description: "Depth of evidence gathering and source investigation",       color: "gold" },
};

/**
 * Build ScoringDimension[] from the standard palette.
 * @param weights - Map of dimension key → weight (must sum to 1.0)
 * @param overrides - Optional per-key overrides for non-standard labels/descriptions/colors
 */
export function dims(
  weights: Record<string, number>,
  overrides?: Record<string, Partial<Omit<ScoringDimension, "weight">>>,
): ScoringDimension[] {
  return Object.entries(weights).map(([key, weight]) => {
    const base = STANDARD_DIMENSIONS[key];
    const over = overrides?.[key] ?? {};
    if (!base) {
      return { key, label: key, weight, description: key, color: "gold" as const, ...over };
    }
    return { ...base, key, weight, ...over };
  });
}

// ── Challenge Dimension Exports ──────────────────────────────────────

export const CIPHER_FORGE_DIMENSIONS: ScoringDimension[] = dims(
  { correctness: 0.65, speed: 0.20, methodology: 0.15 },
  { correctness: { description: "Decryption accuracy including difficulty bonus" }, methodology: { description: "Structured approach to cryptanalysis" } },
);

export const LOGIC_REEF_DIMENSIONS: ScoringDimension[] = dims(
  { correctness: 0.50, methodology: 0.20, speed: 0.15, completeness: 0.15 },
  { correctness: { description: "Correctness of logical conclusions" }, methodology: { description: "Quality of logical reasoning steps" }, completeness: { description: "Fraction of puzzles attempted" } },
);

export const REEF_REFACTOR_DIMENSIONS: ScoringDimension[] = dims(
  { correctness: 0.70, speed: 0.15, methodology: 0.10, completeness: 0.05 },
  { correctness: { description: "Exact correctness across all function test cases" }, completeness: { description: "Fraction of functions attempted with non-empty outputs" }, methodology: { description: "Clear, specific debugging approach" } },
);

export const DEPTH_FIRST_GEN_DIMENSIONS: ScoringDimension[] = dims(
  { correctness: 0.70, speed: 0.15, methodology: 0.10, completeness: 0.05 },
  { correctness: { description: "Exact correctness across all hidden test outputs" }, completeness: { description: "Percentage of test cases attempted" }, methodology: { description: "Substantive rule-inference explanation" } },
);

export const ARCHIVE_DIVE_DIMENSIONS: ScoringDimension[] = dims(
  { correctness: 0.45, methodology: 0.25, speed: 0.15, analysis: 0.15 },
  { correctness: { description: "Correctness of cross-document synthesis answers" }, methodology: { description: "Evidence citations and document coverage" }, analysis: { description: "Quality and accuracy of source citations" } },
);

export const CONTRACT_REVIEW_DIMENSIONS: ScoringDimension[] = dims(
  { precision: 0.35, completeness: 0.35, speed: 0.15, methodology: 0.15 },
  { precision: { description: "Reported issues that are actual issues" }, completeness: { description: "Fraction of planted issues found" }, methodology: { description: "Structured approach to contract analysis" } },
);

export const CHART_FORENSICS_DIMENSIONS: ScoringDimension[] = dims(
  { precision: 0.35, completeness: 0.35, speed: 0.15, methodology: 0.15 },
  { precision: { description: "Reported discrepancies that are actual misrepresentations" }, completeness: { description: "Fraction of planted misrepresentations found" }, methodology: { description: "Structured approach to data verification" } },
);

export const CARTOGRAPHERS_EYE_DIMENSIONS: ScoringDimension[] = dims(
  { correctness: 0.35, analysis: 0.30, speed: 0.15, methodology: 0.20 },
  { correctness: { description: "Correctness of spatial reasoning answers" }, analysis: { description: "Quality of distance and direction analysis" }, methodology: { description: "Structured approach to spatial analysis" } },
);

export const BLUEPRINT_AUDIT_DIMENSIONS: ScoringDimension[] = dims(
  { precision: 0.35, completeness: 0.35, speed: 0.15, methodology: 0.15 },
  { precision: { description: "Reported violations that are actual violations" }, completeness: { description: "Fraction of planted violations found" }, methodology: { description: "Structured approach to code compliance" } },
);

export const ADVERSARIAL_INTERVIEW_DIMENSIONS: ScoringDimension[] = dims(
  { correctness: 0.55, precision: 0.25, speed: 0.10, methodology: 0.10 },
  { correctness: { description: "Correctly classifying false-premise vs ambiguous questions with supporting evidence" }, precision: { description: "Correctness of straightforward answers" }, methodology: { description: "Structured approach to question assessment" } },
);

export const THE_MIRAGE_DIMENSIONS: ScoringDimension[] = dims(
  { correctness: 0.55, precision: 0.30, speed: 0.10, completeness: 0.05 },
  { correctness: { description: "Correctly identifying fabricated district+field pairs" }, precision: { description: "Reported fabrications that are actual fabrications" }, completeness: { description: "Coverage of matched findings across all sources" } },
);

export const DEEP_MAPPING_DIMENSIONS: ScoringDimension[] = dims(
  { completeness: 0.35, correctness: 0.30, methodology: 0.20, speed: 0.15 },
  { completeness: { description: "Percentage of map nodes discovered" }, correctness: { description: "Correct identification of key features" }, methodology: { description: "Resource collection path quality" }, speed: { description: "Efficiency of exploration approach" } },
);

export const CODEBASE_ARCHAEOLOGY_DIMENSIONS: ScoringDimension[] = dims(
  { correctness: 0.35, code_quality: 0.30, speed: 0.15, methodology: 0.20 },
  { correctness: { description: "Correctly identifying the buggy commit and root cause" }, code_quality: { description: "Correctness and quality of the code fix" }, methodology: { description: "Structured approach to debugging" } },
);

export const NEEDLE_HAYSTACK_DIMENSIONS: ScoringDimension[] = dims(
  { correctness: 0.75, analysis: 0.10, speed: 0.05, completeness: 0.10 },
  { analysis: { description: "Correct source identification for correct answers" }, completeness: { description: "Fraction of unique question IDs answered" } },
);

export const PERFORMANCE_OPTIMIZER_DIMENSIONS: ScoringDimension[] = dims(
  { correctness: 0.40, code_quality: 0.25, speed: 0.15, methodology: 0.20 },
  { correctness: { description: "Quality of algorithmic improvement" }, code_quality: { description: "Whether optimized code preserves behavior" }, methodology: { description: "Quality of explanation and approach" } },
);

export const LIGHTHOUSE_INCIDENT_DIMENSIONS: ScoringDimension[] = dims(
  { correctness: 0.20, completeness: 0.30, analysis: 0.15, code_quality: 0.20, methodology: 0.15 },
  { correctness: { description: "Correct root cause ID with supporting evidence from logs and database" }, completeness: { description: "Fraction of correct recovery actions taken in correct dependency order" }, analysis: { description: "Accuracy of identified failure propagation chain (Jaccard overlap + order bonus)" }, code_quality: { description: "Recovery script quality: idempotency, correct ordering, error handling" }, methodology: { description: "Evidence of consulting runbooks/documentation and structured post-incident reporting" } },
);

export const REEF_RESCUE_DIMENSIONS: ScoringDimension[] = dims(
  { correctness: 0.25, code_quality: 0.25, completeness: 0.15, methodology: 0.20, speed: 0.15 },
  { correctness: { description: "Correctly identified root causes for failing subsystems" }, code_quality: { description: "Code fixes resolve the bugs without introducing new issues" }, completeness: { description: "Data migration correctly repairs corrupted data" }, methodology: { description: "Evidence quality, technical references, and incident report completeness" } },
);

export const PIPELINE_BREACH_DIMENSIONS: ScoringDimension[] = dims(
  { correctness: 0.20, completeness: 0.45, code_quality: 0.15, methodology: 0.20 },
  { correctness: { description: "Correct attack vector ID with evidence from build logs and artifact database" }, completeness: { description: "Accuracy of blast radius and correct remediation actions in priority order" }, code_quality: { description: "Automated remediation script: verification steps, secret rotation, clean rebuild" }, methodology: { description: "Multi-source forensic investigation and structured security advisory" } },
);

export const NEURAL_SPEEDRUN_DIMENSIONS: ScoringDimension[] = dims(
  { code_quality: 0.80, precision: 0.20 },
  { code_quality: { description: "Steps ratio vs naive baseline (20x = max 800pts)" }, precision: { description: "MSE ≤ 1.05× baseline = full 200pts" } },
);
