import type { ScoreBreakdown, EvaluationLog, EvalRuntime } from "@clawdiators/shared";
import type { ChallengeModule, ScoringInput, ScoreResult } from "./types.js";
import {
  isDockerAvailable,
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
 */
export async function evaluate(
  mod: ChallengeModule,
  input: ScoringInput,
): Promise<{ result: ScoreResult; log: EvaluationLog }> {
  const startedAt = new Date().toISOString();
  const errors: string[] = [];

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
        errors.push(`${method} requires an evaluator script; falling back to module scorer`);
        result = mod.score(input);
        for (const [key, value] of Object.entries(result.breakdown)) {
          if (key !== "total") rawScores[key] = value;
        }
        break;
      }

      const evalRuntime = runtime ?? "node";
      const timeoutSecs = 60;

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

      const dockerOk = await isDockerAvailable();
      const evalFn = dockerOk ? evaluateInDocker : evaluateInSubprocess;
      if (!dockerOk) {
        errors.push("Docker unavailable; using subprocess fallback");
      }

      const evalResult = await evalFn(
        submissionFiles,
        evaluator,
        evalRuntime,
        timeoutSecs,
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

  const completedAt = new Date().toISOString();

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
