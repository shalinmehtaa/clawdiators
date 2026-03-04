import type { ScoreBreakdown, EvaluationLog, EvalRuntime, ChallengeConstraints } from "@clawdiators/shared";
import type { ChallengeModule, ScoringInput, ScoreResult } from "./types.js";
import {
  isDockerAvailable,
  isImageAvailable,
  RUNTIME_IMAGES,
  evaluateInDocker,
  evaluateInSubprocess,
} from "./docker-evaluator.js";

/**
 * Evaluate a submission for a workspace-based challenge.
 *
 * Dispatches to the appropriate evaluation method based on the challenge's scoring spec:
 * - "deterministic": uses the module's score() function directly
 * - "test-suite": runs tests in Docker (or subprocess fallback)
 * - "custom-script": runs evaluator script in Docker (or subprocess fallback)
 *
 * If the match is verified and the challenge has constraints with token/call efficiency
 * dimensions, those dimensions are scored from the trajectory data (replay_log).
 */
export async function evaluate(
  mod: ChallengeModule,
  input: ScoringInput,
  opts?: {
    verified?: boolean;
    constraints?: ChallengeConstraints | null;
    trajectory?: { total_input_tokens: number; total_output_tokens: number; total_llm_calls: number } | null;
    envVars?: Record<string, string>;
    image?: string;
    timeoutSecs?: number;
    /** For "environment" challenges: fetch metrics from each service before scoring. */
    serviceMetricsFetcher?: () => Promise<Record<string, Record<string, unknown>>>;
  },
): Promise<{ result: ScoreResult; log: EvaluationLog }> {
  const startedAt = new Date().toISOString();
  const errors: string[] = [];

  // For environment challenges: fetch service metrics before scoring
  if (opts?.serviceMetricsFetcher) {
    try {
      input.serviceMetrics = await opts.serviceMetricsFetcher();
    } catch (err: any) {
      errors.push(`Failed to fetch service metrics: ${err.message}`);
    }
  }

  const scoringSpec = mod.scoringSpec;
  const method = scoringSpec?.method ?? "deterministic";
  const runtime: EvalRuntime | undefined = scoringSpec?.runtime;

  let result: ScoreResult;
  let containerExitCode: number | undefined;
  let stdout: string | undefined;
  let rawScores: Record<string, number> = {};

  switch (method) {
    case "deterministic":
      // Use the module's existing score function
      result = mod.score(input);
      // Extract raw scores from breakdown
      for (const [key, value] of Object.entries(result.breakdown)) {
        if (key !== "total") rawScores[key] = value;
      }
      break;

    case "test-suite":
    case "custom-script": {
      const evaluator = scoringSpec?.evaluator;
      if (!evaluator) {
        // No evaluator script — use the module's own scorer (normal path for code-based modules)
        result = mod.score(input);
        for (const [key, value] of Object.entries(result.breakdown)) {
          if (key !== "total") rawScores[key] = value;
        }
        break;
      }

      const evalRuntime = runtime ?? "node";
      const timeoutSecs = opts?.timeoutSecs ?? 60;

      // Build submission files from input
      const submissionFiles: Record<string, string> =
        typeof input.submission === "object" && input.submission !== null
          ? Object.fromEntries(
              Object.entries(input.submission).map(([k, v]) => [
                k,
                typeof v === "string" ? v : JSON.stringify(v, null, 2),
              ]),
            )
          : { "submission.json": JSON.stringify(input.submission, null, 2) };

      // Add ground-truth.json for evaluator wrappers (Tier 2+ code modules)
      if (input.groundTruth) {
        submissionFiles["ground-truth.json"] = JSON.stringify(input.groundTruth, null, 2);
      }

      // Build env vars with timing metadata
      const envVars: Record<string, string> = { ...opts?.envVars };
      envVars.STARTED_AT = input.startedAt.toISOString();
      envVars.SUBMITTED_AT = input.submittedAt.toISOString();
      envVars.API_CALL_COUNT = String(input.apiCallCount);
      if (input.checkpoints) {
        envVars.CHECKPOINTS = JSON.stringify(input.checkpoints);
      }

      const dockerOk = await isDockerAvailable();
      let useDocker = dockerOk;
      if (dockerOk) {
        const image = opts?.image ?? RUNTIME_IMAGES[evalRuntime];
        const imageOk = await isImageAvailable(image);
        if (!imageOk) {
          useDocker = false;
          errors.push(`Docker image "${image}" not found locally; using subprocess fallback`);
        }
      } else {
        errors.push("Docker unavailable; using subprocess fallback");
      }
      const evalFn = useDocker ? evaluateInDocker : evaluateInSubprocess;

      const tierOpts = {
        envVars,
        image: opts?.image,
      };

      const evalResult = await evalFn(
        submissionFiles,
        evaluator,
        evalRuntime,
        timeoutSecs,
        tierOpts,
      );

      containerExitCode = evalResult.exitCode;
      stdout = evalResult.stdout;

      if (evalResult.error) {
        errors.push(evalResult.error);
      }

      rawScores = evalResult.scores;

      // If Docker/subprocess returned scores, compute weighted total
      if (Object.keys(rawScores).length > 0 && scoringSpec?.dimensions) {
        const breakdown = computeWeightedTotal(rawScores, scoringSpec.dimensions);
        result = { breakdown };
      } else if (Object.keys(rawScores).length > 0) {
        // No dimensions defined — sum raw scores
        const total = Object.values(rawScores).reduce((a, b) => a + b, 0);
        result = { breakdown: { ...rawScores, total: Math.round(total) } };
      } else {
        // Evaluator returned no scores — fall back to module scorer
        errors.push("Evaluator returned no scores; falling back to module scorer");
        result = mod.score(input);
        for (const [key, value] of Object.entries(result.breakdown)) {
          if (key !== "total") rawScores[key] = value;
        }
      }
      break;
    }

    default:
      errors.push(`Unknown scoring method: ${method}; using module scorer`);
      result = mod.score(input);
      for (const [key, value] of Object.entries(result.breakdown)) {
        if (key !== "total") rawScores[key] = value;
      }
  }

  // Verified efficiency scoring: overlay token_efficiency / call_efficiency dimensions
  // if the challenge has constraints and the match is verified with trajectory data.
  const constraints = opts?.constraints;
  const trajectory = opts?.trajectory;
  const isVerified = opts?.verified === true;

  if (constraints && scoringSpec?.dimensions) {
    for (const dim of scoringSpec.dimensions) {
      if (dim.key === "token_efficiency") {
        let score = 0;
        if (isVerified && trajectory && constraints.tokenBudget) {
          const totalTokens = trajectory.total_input_tokens + trajectory.total_output_tokens;
          score = Math.round(
            Math.max(0, 1 - totalTokens / constraints.tokenBudget) * dim.weight * 1000,
          );
        }
        // Unverified → always 0 for efficiency dimensions
        result.breakdown[dim.key] = score;
      } else if (dim.key === "call_efficiency") {
        let score = 0;
        if (isVerified && trajectory && constraints.maxLlmCalls) {
          const totalCalls = trajectory.total_llm_calls;
          score = Math.round(
            Math.max(0, 1 - totalCalls / constraints.maxLlmCalls) * dim.weight * 1000,
          );
        }
        result.breakdown[dim.key] = score;
      }
    }
    // Recompute total after any overwrites
    let newTotal = 0;
    for (const dim of scoringSpec.dimensions) {
      newTotal += result.breakdown[dim.key] ?? 0;
    }
    result.breakdown.total = newTotal;
  }

  const completedAt = new Date().toISOString();
  const durationMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();

  // Build final scores (from breakdown, excluding total)
  const finalScores: Record<string, number> = {};
  for (const [key, value] of Object.entries(result.breakdown)) {
    if (key !== "total") finalScores[key] = value;
  }

  const log: EvaluationLog = {
    method,
    runtime,
    startedAt,
    completedAt,
    durationMs,
    containerExitCode,
    stdout,
    rawScores,
    finalScores,
    total: result.breakdown.total,
    errors,
  };

  return { result, log };
}

/**
 * Compute a weighted total from raw dimension scores and dimension definitions.
 * Utility for challenge modules that want to build ScoreBreakdown manually.
 */
export function computeWeightedTotal(
  rawScores: Record<string, number>,
  dimensions: { key: string; weight: number }[],
): ScoreBreakdown {
  let total = 0;
  const breakdown: ScoreBreakdown = {};

  for (const dim of dimensions) {
    const raw = rawScores[dim.key] ?? 0;
    const weighted = Math.round(raw * dim.weight);
    breakdown[dim.key] = weighted;
    total += weighted;
  }

  breakdown.total = total;
  return breakdown;
}
