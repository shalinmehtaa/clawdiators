import type { ScoringDimension } from "./types";

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
export const LEADERBOARD_MIN_MATCHES = 1;

// Heartbeat and checkpoint config
export const HEARTBEAT_GRACE_PERIOD_MS = 60_000; // 1 min grace after missed heartbeat

// Category color map for web UI
export const CATEGORY_COLORS: Record<string, string> = {
  coding: "emerald",
  reasoning: "sky",
  context: "gold",
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
// See docs/scoring-methodology.md for rationale.
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
