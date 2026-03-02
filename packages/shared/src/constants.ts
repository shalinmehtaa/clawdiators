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

/** Minimum verified match count to be eligible as a community challenge reviewer. */
export const REVIEWER_MIN_VERIFIED_MATCHES = 5;
/** Default trust score assigned to a newly eligible reviewer. */
export const REVIEWER_DEFAULT_TRUST_SCORE = 0.5;
/** Minimum number of reviewer reports before quorum can be reached. */
export const QUORUM_MIN_REPORTS = 2;
/** Minimum combined trust weight before quorum can be reached. */
export const QUORUM_MIN_TRUST_WEIGHT = 1.0;
/** Gate: reference answer must score >= this fraction of maxScore. */
export const GATE_PASS_SCORE_THRESHOLD = 0.6;
/** Gate: adversarial probes must score < this fraction of maxScore. */
export const GATE_PROBE_SCORE_CEILING = 0.3;

// ── Scoring Dimensions ──────────────────────────────────────────────

export const CIPHER_FORGE_DIMENSIONS: ScoringDimension[] = [
  { key: "decryption_accuracy", label: "Decryption", weight: 0.5, description: "Correctness of decrypted messages", color: "emerald" },
  { key: "speed", label: "Speed", weight: 0.2, description: "Time to submission relative to limit", color: "sky" },
  { key: "methodology", label: "Methodology", weight: 0.15, description: "Structured approach to cryptanalysis", color: "purple" },
  { key: "difficulty_bonus", label: "Difficulty", weight: 0.15, description: "Bonus for solving harder ciphers", color: "gold" },
];

export const LOGIC_REEF_DIMENSIONS: ScoringDimension[] = [
  { key: "validity", label: "Validity", weight: 0.5, description: "Correctness of logical conclusions", color: "emerald" },
  { key: "reasoning", label: "Reasoning", weight: 0.2, description: "Include reasoning explaining your logical steps", color: "purple" },
  { key: "speed", label: "Speed", weight: 0.15, description: "Time to submission relative to limit", color: "sky" },
  { key: "coverage", label: "Coverage", weight: 0.15, description: "Fraction of puzzles attempted", color: "gold" },
];

export const REEF_REFACTOR_DIMENSIONS: ScoringDimension[] = [
  { key: "correctness", label: "Correctness", weight: 0.7, description: "Exact correctness across all function test cases", color: "emerald" },
  { key: "speed", label: "Speed", weight: 0.15, description: "Time to submission relative to limit", color: "sky" },
  { key: "coverage", label: "Coverage", weight: 0.05, description: "Fraction of functions attempted with non-empty outputs", color: "purple" },
  { key: "methodology", label: "Methodology", weight: 0.1, description: "Clear, specific debugging approach", color: "gold" },
];

export const DEPTH_FIRST_GEN_DIMENSIONS: ScoringDimension[] = [
  { key: "correctness", label: "Correctness", weight: 0.7, description: "Exact correctness across all hidden test outputs", color: "emerald" },
  { key: "speed", label: "Speed", weight: 0.15, description: "Time to submission relative to limit", color: "sky" },
  { key: "coverage", label: "Coverage", weight: 0.05, description: "Percentage of test cases attempted", color: "purple" },
  { key: "methodology", label: "Methodology", weight: 0.1, description: "Substantive rule-inference explanation", color: "gold" },
];

export const ARCHIVE_DIVE_DIMENSIONS: ScoringDimension[] = [
  { key: "accuracy", label: "Accuracy", weight: 0.45, description: "Correctness of cross-document synthesis answers", color: "emerald" },
  { key: "comprehensiveness", label: "Comprehensiveness", weight: 0.25, description: "Evidence citations and document coverage", color: "purple" },
  { key: "speed", label: "Speed", weight: 0.15, description: "Time to submission relative to limit", color: "sky" },
  { key: "citations", label: "Citations", weight: 0.15, description: "Quality and accuracy of source citations", color: "gold" },
];

export const CONTRACT_REVIEW_DIMENSIONS: ScoringDimension[] = [
  { key: "precision", label: "Precision", weight: 0.35, description: "Reported issues that are actual issues", color: "emerald" },
  { key: "recall", label: "Recall", weight: 0.35, description: "Fraction of planted issues found", color: "coral" },
  { key: "speed", label: "Speed", weight: 0.15, description: "Time to submission relative to limit", color: "sky" },
  { key: "methodology", label: "Methodology", weight: 0.15, description: "Structured approach to contract analysis", color: "gold" },
];

export const CHART_FORENSICS_DIMENSIONS: ScoringDimension[] = [
  { key: "precision", label: "Precision", weight: 0.35, description: "Reported discrepancies that are actual misrepresentations", color: "emerald" },
  { key: "recall", label: "Recall", weight: 0.35, description: "Fraction of planted misrepresentations found", color: "coral" },
  { key: "speed", label: "Speed", weight: 0.15, description: "Time to submission relative to limit", color: "sky" },
  { key: "methodology", label: "Methodology", weight: 0.15, description: "Structured approach to data verification", color: "gold" },
];

export const CARTOGRAPHERS_EYE_DIMENSIONS: ScoringDimension[] = [
  { key: "accuracy", label: "Accuracy", weight: 0.35, description: "Correctness of spatial reasoning answers", color: "emerald" },
  { key: "spatial_reasoning", label: "Spatial Reasoning", weight: 0.3, description: "Quality of distance and direction analysis", color: "purple" },
  { key: "speed", label: "Speed", weight: 0.15, description: "Time to submission relative to limit", color: "sky" },
  { key: "methodology", label: "Methodology", weight: 0.2, description: "Structured approach to spatial analysis", color: "gold" },
];

export const BLUEPRINT_AUDIT_DIMENSIONS: ScoringDimension[] = [
  { key: "precision", label: "Precision", weight: 0.35, description: "Reported violations that are actual violations", color: "emerald" },
  { key: "recall", label: "Recall", weight: 0.35, description: "Fraction of planted violations found", color: "coral" },
  { key: "speed", label: "Speed", weight: 0.15, description: "Time to submission relative to limit", color: "sky" },
  { key: "methodology", label: "Methodology", weight: 0.15, description: "Structured approach to code compliance", color: "gold" },
];

export const ADVERSARIAL_INTERVIEW_DIMENSIONS: ScoringDimension[] = [
  { key: "discernment", label: "Discernment", weight: 0.55, description: "Correctly classifying false-premise vs ambiguous questions with supporting evidence", color: "purple" },
  { key: "accuracy", label: "Accuracy", weight: 0.25, description: "Correctness of straightforward answers", color: "emerald" },
  { key: "speed", label: "Speed", weight: 0.1, description: "Time to submission relative to limit", color: "sky" },
  { key: "methodology", label: "Methodology", weight: 0.1, description: "Structured approach to question assessment", color: "gold" },
];

export const THE_MIRAGE_DIMENSIONS: ScoringDimension[] = [
  { key: "detection", label: "Detection", weight: 0.55, description: "Correctly identifying fabricated district+field pairs", color: "purple" },
  { key: "precision", label: "Precision", weight: 0.3, description: "Reported fabrications that are actual fabrications", color: "emerald" },
  { key: "speed", label: "Speed", weight: 0.1, description: "Time to submission relative to limit", color: "sky" },
  { key: "thoroughness", label: "Thoroughness", weight: 0.05, description: "Coverage of matched findings across all three sources", color: "gold" },
];

export const DEEP_MAPPING_DIMENSIONS: ScoringDimension[] = [
  { key: "coverage", label: "Coverage", weight: 0.35, description: "Percentage of map nodes discovered", color: "emerald" },
  { key: "accuracy", label: "Accuracy", weight: 0.3, description: "Correct identification of key features", color: "sky" },
  { key: "exploration", label: "Exploration", weight: 0.2, description: "Resource collection path quality", color: "purple" },
  { key: "strategy", label: "Strategy", weight: 0.15, description: "Efficiency of exploration approach", color: "gold" },
];

// ── Workspace-based Challenge Dimensions ────────────────────────────

export const CODEBASE_ARCHAEOLOGY_DIMENSIONS: ScoringDimension[] = [
  { key: "identification", label: "Bug Identification", weight: 0.35, description: "Correctly identifying the buggy commit and root cause", color: "emerald" },
  { key: "fix_quality", label: "Fix Quality", weight: 0.3, description: "Correctness and quality of the code fix", color: "coral" },
  { key: "speed", label: "Speed", weight: 0.15, description: "Time to submission relative to limit", color: "sky" },
  { key: "methodology", label: "Methodology", weight: 0.2, description: "Structured approach to debugging", color: "purple" },
];

export const NEEDLE_HAYSTACK_DIMENSIONS: ScoringDimension[] = [
  { key: "accuracy", label: "Accuracy", weight: 0.75, description: "Correctness of answers against ground truth", color: "emerald" },
  { key: "citations", label: "Citations", weight: 0.1, description: "Correct source identification for correct answers", color: "purple" },
  { key: "speed", label: "Speed", weight: 0.05, description: "Time to submission relative to limit", color: "sky" },
  { key: "completeness", label: "Completeness", weight: 0.1, description: "Fraction of unique question IDs answered", color: "gold" },
];

export const PERFORMANCE_OPTIMIZER_DIMENSIONS: ScoringDimension[] = [
  { key: "optimization", label: "Optimization", weight: 0.4, description: "Quality of algorithmic improvement", color: "emerald" },
  { key: "correctness", label: "Correctness", weight: 0.25, description: "Whether optimized code preserves behavior", color: "coral" },
  { key: "speed", label: "Speed", weight: 0.15, description: "Time to submission relative to limit", color: "sky" },
  { key: "methodology", label: "Methodology", weight: 0.2, description: "Quality of explanation and approach", color: "purple" },
];
