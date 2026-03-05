import type { ScoreBreakdown, ScoringDimension, ChallengeSpec, SubmissionSpec, ScoringSpec, WorkspaceSpec } from "@clawdiators/shared";

/** Data generated deterministically from a match seed. */
export interface ChallengeData {
  /** The text objective shown to the agent. */
  objective: string;
  /** Opaque ground truth used for scoring — never sent to the agent. */
  groundTruth: Record<string, unknown>;
  /** Any additional generated data keyed by sandbox API name. */
  [key: string]: unknown;
}

/** Input passed to a challenge's score function. */
export interface ScoringInput {
  submission: Record<string, unknown>;
  groundTruth: Record<string, unknown>;
  startedAt: Date;
  submittedAt: Date;
  apiCallCount: number;
  /** For multi-checkpoint challenges: previously submitted checkpoints. */
  checkpoints?: Record<string, unknown>[];
  /**
   * For "environment" challenges: metrics fetched from each live service's
   * metricsEndpoint just before scoring. Keyed by service name.
   * Allows the scorer to read final system state (e.g. recovery completeness).
   */
  serviceMetrics?: Record<string, Record<string, unknown>>;
}

/** Result returned by a challenge's score function. */
export interface ScoreResult {
  /** Per-dimension weighted scores plus "total". */
  breakdown: ScoreBreakdown;
}

/** Validation issue found in a submission before scoring. */
export interface SubmissionWarning {
  /** "error" = will score 0 on this dimension, "warning" = may lose points. */
  severity: "error" | "warning";
  /** Which field or key is problematic. */
  field: string;
  /** Human-readable explanation of what's wrong and how to fix it. */
  message: string;
}

/**
 * Every challenge implements this interface.
 * The match routes delegate to the right module via the registry.
 *
 * Challenges provide a workspace tarball that agents download and work with locally.
 * Modules share slug, dimensions, generateData, score, and workspace generation.
 */
export interface ChallengeModule {
  /** Challenge slug — must match the DB challenge.slug. */
  slug: string;

  /** Scoring dimensions this challenge uses. */
  dimensions: ScoringDimension[];

  /** Generate all challenge data deterministically from a seed. */
  generateData(seed: number, config: Record<string, unknown>): ChallengeData | Promise<ChallengeData>;

  /** Score a submission deterministically. */
  score(input: ScoringInput): ScoreResult | Promise<ScoreResult>;

  /**
   * Validate a submission's structure before scoring. Returns warnings/errors
   * about missing keys, wrong types, or format mismatches. Agents receive these
   * in the response alongside their score so they can fix issues on next attempt.
   */
  validateSubmission?(submission: Record<string, unknown>, groundTruth: Record<string, unknown>): SubmissionWarning[] | Promise<SubmissionWarning[]>;

  /** Workspace specification — describes the workspace structure. */
  workspaceSpec?: WorkspaceSpec;

  /** Submission specification — what the agent should submit. */
  submissionSpec?: SubmissionSpec;

  /** Scoring specification — how submissions are evaluated. */
  scoringSpec?: ScoringSpec;

  /**
   * Generate workspace files deterministically from a seed.
   * Returns a map of { relativePath: fileContents }.
   * CHALLENGE.md is injected automatically from the workspaceSpec template.
   */
  generateWorkspace?(seed: number, config: Record<string, unknown>): Record<string, string> | Promise<Record<string, string>>;
}
