import type { ScoringDimension } from "./types";

// Elo system
export const ELO_DEFAULT = 1000;
export const ELO_K_NEW = 32; // K-factor for <30 matches
export const ELO_K_ESTABLISHED = 16; // K-factor for 30+ matches
export const ELO_K_THRESHOLD = 30; // matches before K drops
export const ELO_FLOOR = 100;

// Scoring
export const MAX_SCORE = 1000;
export const QUICKDRAW_TIME_LIMIT_SECS = 60;

// Legacy scoring weights (kept for backward compat)
export const QUICKDRAW_WEIGHTS = {
  accuracy: 0.4,
  speed: 0.25,
  efficiency: 0.2,
  style: 0.15,
} as const;

export const TOOLCHAIN_WEIGHTS = {
  accuracy: 0.35,
  speed: 0.15,
  efficiency: 0.25,
  style: 0.25,
} as const;

export const EFFICIENCY_WEIGHTS = {
  accuracy: 0.3,
  speed: 0.1,
  efficiency: 0.45,
  style: 0.15,
} as const;

export const CASCADING_WEIGHTS = {
  accuracy: 0.3,
  speed: 0.1,
  efficiency: 0.15,
  style: 0.45,
} as const;

export const RELAY_WEIGHTS = {
  accuracy: 0.4,
  speed: 0.1,
  efficiency: 0.15,
  style: 0.35,
} as const;

// ── Scoring Dimensions (flexible per-challenge) ──────────────────────

export const QUICKDRAW_DIMENSIONS: ScoringDimension[] = [
  { key: "accuracy", label: "Accuracy", weight: 0.4, description: "Correctness of submitted answers vs ground truth", color: "emerald" },
  { key: "speed", label: "Speed", weight: 0.25, description: "Time to submission relative to limit", color: "sky" },
  { key: "efficiency", label: "Efficiency", weight: 0.2, description: "Fewest API calls to solve the puzzle", color: "gold" },
  { key: "style", label: "Style", weight: 0.15, description: "Structured, clean submission format", color: "purple" },
];

export const TOOLCHAIN_DIMENSIONS: ScoringDimension[] = [
  { key: "accuracy", label: "Accuracy", weight: 0.35, description: "Correctness of final answer across chained APIs", color: "emerald" },
  { key: "speed", label: "Speed", weight: 0.15, description: "Time to submission relative to limit", color: "sky" },
  { key: "efficiency", label: "Efficiency", weight: 0.25, description: "Optimal API call sequencing", color: "gold" },
  { key: "style", label: "Style", weight: 0.25, description: "Chain orchestration quality", color: "purple" },
];

export const EFFICIENCY_DIMENSIONS: ScoringDimension[] = [
  { key: "accuracy", label: "Accuracy", weight: 0.3, description: "Correctness of submitted answers", color: "emerald" },
  { key: "speed", label: "Speed", weight: 0.1, description: "Time to submission", color: "sky" },
  { key: "efficiency", label: "Efficiency", weight: 0.45, description: "Minimal API calls and resource use", color: "gold" },
  { key: "style", label: "Style", weight: 0.15, description: "Submission structure quality", color: "purple" },
];

export const CASCADING_DIMENSIONS: ScoringDimension[] = [
  { key: "accuracy", label: "Accuracy", weight: 0.3, description: "Correctness despite failures", color: "emerald" },
  { key: "speed", label: "Speed", weight: 0.1, description: "Time to submission", color: "sky" },
  { key: "efficiency", label: "Efficiency", weight: 0.15, description: "API call economy", color: "gold" },
  { key: "resilience", label: "Resilience", weight: 0.45, description: "Graceful failure handling and recovery", color: "coral" },
];

export const RELAY_DIMENSIONS: ScoringDimension[] = [
  { key: "accuracy", label: "Accuracy", weight: 0.4, description: "Correctness of final combined answer", color: "emerald" },
  { key: "speed", label: "Speed", weight: 0.1, description: "Time to submission", color: "sky" },
  { key: "efficiency", label: "Efficiency", weight: 0.15, description: "API call economy", color: "gold" },
  { key: "handoff", label: "Handoff", weight: 0.35, description: "Context compression and transfer quality", color: "purple" },
];

export const CIPHER_FORGE_DIMENSIONS: ScoringDimension[] = [
  { key: "decryption_accuracy", label: "Decryption", weight: 0.5, description: "Correctness of decrypted messages", color: "emerald" },
  { key: "speed", label: "Speed", weight: 0.2, description: "Time to submission relative to limit", color: "sky" },
  { key: "efficiency", label: "Efficiency", weight: 0.15, description: "API call economy", color: "gold" },
  { key: "difficulty_bonus", label: "Difficulty", weight: 0.15, description: "Bonus for solving harder ciphers", color: "purple" },
];

export const LOGIC_REEF_DIMENSIONS: ScoringDimension[] = [
  { key: "validity", label: "Validity", weight: 0.45, description: "Correctness of logical conclusions", color: "emerald" },
  { key: "minimality", label: "Minimality", weight: 0.25, description: "Concise, minimal reasoning steps", color: "purple" },
  { key: "speed", label: "Speed", weight: 0.15, description: "Time to submission relative to limit", color: "sky" },
  { key: "efficiency", label: "Efficiency", weight: 0.15, description: "API call economy", color: "gold" },
];

export const REEF_REFACTOR_DIMENSIONS: ScoringDimension[] = [
  { key: "correctness", label: "Correctness", weight: 0.5, description: "Correct outputs for all test cases", color: "emerald" },
  { key: "speed", label: "Speed", weight: 0.2, description: "Time to submission relative to limit", color: "sky" },
  { key: "efficiency", label: "Efficiency", weight: 0.15, description: "API call economy", color: "gold" },
  { key: "coverage", label: "Coverage", weight: 0.15, description: "Percentage of functions attempted", color: "purple" },
];

export const SWITCHBOARD_DIMENSIONS: ScoringDimension[] = [
  { key: "accuracy", label: "Accuracy", weight: 0.4, description: "Correctness of answers vs ground truth", color: "emerald" },
  { key: "source_selection", label: "Source Selection", weight: 0.3, description: "Choosing the most authoritative data source", color: "purple" },
  { key: "speed", label: "Speed", weight: 0.15, description: "Time to submission relative to limit", color: "sky" },
  { key: "efficiency", label: "Efficiency", weight: 0.15, description: "API call economy", color: "gold" },
];

export const RATE_LIMITED_RECON_DIMENSIONS: ScoringDimension[] = [
  { key: "completeness", label: "Completeness", weight: 0.4, description: "Dossier completeness per target citizen", color: "emerald" },
  { key: "speed", label: "Speed", weight: 0.2, description: "Time to submission relative to limit", color: "sky" },
  { key: "efficiency", label: "Efficiency", weight: 0.25, description: "API call economy", color: "gold" },
  { key: "planning", label: "Planning", weight: 0.15, description: "Avoiding rate limit violations", color: "purple" },
];

export const DEPTH_FIRST_GEN_DIMENSIONS: ScoringDimension[] = [
  { key: "correctness", label: "Correctness", weight: 0.5, description: "Correct outputs for hidden test cases", color: "emerald" },
  { key: "speed", label: "Speed", weight: 0.2, description: "Time to submission relative to limit", color: "sky" },
  { key: "efficiency", label: "Efficiency", weight: 0.15, description: "API call economy", color: "gold" },
  { key: "coverage", label: "Coverage", weight: 0.15, description: "Percentage of test cases attempted", color: "purple" },
];

export const ARCHIVE_DIVE_DIMENSIONS: ScoringDimension[] = [
  { key: "accuracy", label: "Accuracy", weight: 0.45, description: "Correctness of cross-document synthesis answers", color: "emerald" },
  { key: "comprehensiveness", label: "Comprehensiveness", weight: 0.25, description: "Evidence citations and document coverage", color: "purple" },
  { key: "speed", label: "Speed", weight: 0.15, description: "Time to submission relative to limit", color: "sky" },
  { key: "efficiency", label: "Efficiency", weight: 0.15, description: "API call economy", color: "gold" },
];

export const CONTRACT_REVIEW_DIMENSIONS: ScoringDimension[] = [
  { key: "precision", label: "Precision", weight: 0.35, description: "Reported issues that are actual issues", color: "emerald" },
  { key: "recall", label: "Recall", weight: 0.35, description: "Fraction of planted issues found", color: "coral" },
  { key: "speed", label: "Speed", weight: 0.15, description: "Time to submission relative to limit", color: "sky" },
  { key: "efficiency", label: "Efficiency", weight: 0.15, description: "API call economy", color: "gold" },
];

export const CORAL_CENSUS_DIMENSIONS: ScoringDimension[] = [
  { key: "accuracy", label: "Accuracy", weight: 0.4, description: "Correctness of final population counts", color: "emerald" },
  { key: "state_mgmt", label: "State Mgmt", weight: 0.3, description: "Checkpoint accuracy at each batch interval", color: "purple" },
  { key: "speed", label: "Speed", weight: 0.15, description: "Time to submission relative to limit", color: "sky" },
  { key: "efficiency", label: "Efficiency", weight: 0.15, description: "API call economy", color: "gold" },
];

export const SUPPLY_CHAIN_DIMENSIONS: ScoringDimension[] = [
  { key: "profit", label: "Profit", weight: 0.35, description: "Total profit vs optimal strategy", color: "emerald" },
  { key: "fulfillment", label: "Fulfillment", weight: 0.3, description: "Order fulfillment rate", color: "purple" },
  { key: "speed", label: "Speed", weight: 0.15, description: "Time to submission relative to limit", color: "sky" },
  { key: "efficiency", label: "Efficiency", weight: 0.2, description: "Decision quality per period", color: "gold" },
];

export const CHART_FORENSICS_DIMENSIONS: ScoringDimension[] = [
  { key: "precision", label: "Precision", weight: 0.35, description: "Reported discrepancies that are actual misrepresentations", color: "emerald" },
  { key: "recall", label: "Recall", weight: 0.35, description: "Fraction of planted misrepresentations found", color: "coral" },
  { key: "speed", label: "Speed", weight: 0.15, description: "Time to submission relative to limit", color: "sky" },
  { key: "efficiency", label: "Efficiency", weight: 0.15, description: "API call economy", color: "gold" },
];

export const CARTOGRAPHERS_EYE_DIMENSIONS: ScoringDimension[] = [
  { key: "accuracy", label: "Accuracy", weight: 0.45, description: "Correctness of spatial reasoning answers", color: "emerald" },
  { key: "spatial_reasoning", label: "Spatial Reasoning", weight: 0.25, description: "Quality of distance and direction analysis", color: "purple" },
  { key: "speed", label: "Speed", weight: 0.15, description: "Time to submission relative to limit", color: "sky" },
  { key: "efficiency", label: "Efficiency", weight: 0.15, description: "API call economy", color: "gold" },
];

export const BLUEPRINT_AUDIT_DIMENSIONS: ScoringDimension[] = [
  { key: "precision", label: "Precision", weight: 0.35, description: "Reported violations that are actual violations", color: "emerald" },
  { key: "recall", label: "Recall", weight: 0.35, description: "Fraction of planted violations found", color: "coral" },
  { key: "speed", label: "Speed", weight: 0.15, description: "Time to submission relative to limit", color: "sky" },
  { key: "efficiency", label: "Efficiency", weight: 0.15, description: "API call economy", color: "gold" },
];

export const ADVERSARIAL_INTERVIEW_DIMENSIONS: ScoringDimension[] = [
  { key: "discernment", label: "Discernment", weight: 0.45, description: "Identifying false premises and acknowledging ambiguity", color: "purple" },
  { key: "accuracy", label: "Accuracy", weight: 0.25, description: "Correctness of straightforward answers", color: "emerald" },
  { key: "speed", label: "Speed", weight: 0.15, description: "Time to submission relative to limit", color: "sky" },
  { key: "efficiency", label: "Efficiency", weight: 0.15, description: "API call economy", color: "gold" },
];

export const THE_MIRAGE_DIMENSIONS: ScoringDimension[] = [
  { key: "detection", label: "Detection", weight: 0.45, description: "Identifying fabricated data points across sources", color: "purple" },
  { key: "precision", label: "Precision", weight: 0.25, description: "Reported fabrications that are actual fabrications", color: "emerald" },
  { key: "speed", label: "Speed", weight: 0.15, description: "Time to submission relative to limit", color: "sky" },
  { key: "efficiency", label: "Efficiency", weight: 0.15, description: "API call economy", color: "gold" },
];

// Category color map for web UI
export const CATEGORY_COLORS: Record<string, string> = {
  calibration: "emerald",
  toolchain: "sky",
  efficiency: "gold",
  recovery: "purple",
  relay: "coral",
  coding: "emerald",
  reasoning: "sky",
  context: "gold",
  memory: "purple",
  endurance: "coral",
  adversarial: "coral",
  multimodal: "sky",
};

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

// Rivalry threshold
export const RIVALRY_BOUT_THRESHOLD = 3;

// Quickdraw sandbox API sizes
export const WEATHER_CITY_COUNT = 20;
export const STOCK_TICKER_COUNT = 10;
export const STOCK_HISTORY_DAYS = 30;
export const NEWS_TOPIC_COUNT = 5;
export const NEWS_ARTICLES_PER_TOPIC = 4;

// Heartbeat and checkpoint config
export const HEARTBEAT_GRACE_PERIOD_MS = 60_000; // 1 min grace after missed heartbeat

// ── Workspace-based Challenge Dimensions ────────────────────────────

export const CODEBASE_ARCHAEOLOGY_DIMENSIONS: ScoringDimension[] = [
  { key: "identification", label: "Bug Identification", weight: 0.35, description: "Correctly identifying the buggy commit and root cause", color: "emerald" },
  { key: "fix_quality", label: "Fix Quality", weight: 0.3, description: "Correctness and quality of the code fix", color: "coral" },
  { key: "speed", label: "Speed", weight: 0.15, description: "Time to submission relative to limit", color: "sky" },
  { key: "methodology", label: "Methodology", weight: 0.2, description: "Structured approach to debugging", color: "purple" },
];

export const NEEDLE_HAYSTACK_DIMENSIONS: ScoringDimension[] = [
  { key: "accuracy", label: "Accuracy", weight: 0.45, description: "Correctness of answers against ground truth", color: "emerald" },
  { key: "citations", label: "Citations", weight: 0.2, description: "Correct identification of source documents", color: "purple" },
  { key: "speed", label: "Speed", weight: 0.15, description: "Time to submission relative to limit", color: "sky" },
  { key: "completeness", label: "Completeness", weight: 0.2, description: "Fraction of questions answered", color: "gold" },
];

export const PERFORMANCE_OPTIMIZER_DIMENSIONS: ScoringDimension[] = [
  { key: "optimization", label: "Optimization", weight: 0.4, description: "Quality of algorithmic improvement", color: "emerald" },
  { key: "correctness", label: "Correctness", weight: 0.25, description: "Whether optimized code preserves behavior", color: "coral" },
  { key: "speed", label: "Speed", weight: 0.15, description: "Time to submission relative to limit", color: "sky" },
  { key: "methodology", label: "Methodology", weight: 0.2, description: "Quality of explanation and approach", color: "purple" },
];
