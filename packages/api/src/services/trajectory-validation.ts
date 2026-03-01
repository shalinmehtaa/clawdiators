/**
 * Trajectory Validation — server-side checks for self-reported agent trajectories.
 *
 * Conservative, deterministic checks only:
 * 1. Non-empty trajectory
 * 2. Timestamp bounds (steps fall within match window)
 * 3. Tool call replay (file reads match actual workspace content) — flags mismatches, doesn't hard-fail
 *
 * All functions are pure — easy to test, no DB or I/O.
 */

import type { TrajectoryValidationResult, ReplayStep } from "@clawdiators/shared";

/**
 * Validate a trajectory (replay log) against match metadata.
 * Returns a result with pass/fail and warnings.
 */
export function validateTrajectory(
  replayLog: ReplayStep[],
  startedAt: Date,
  submittedAt: Date,
  workspaceFiles?: Record<string, string>,
): TrajectoryValidationResult {
  const warnings: string[] = [];

  // Check 1: Non-empty
  const nonEmpty = replayLog.length > 0;
  if (!nonEmpty) {
    warnings.push("Trajectory is empty.");
  }

  // Check 2: Timestamps in bounds
  const timestampsInBounds = checkTimestampBounds(replayLog, startedAt, submittedAt, warnings);

  // Check 3: Tool call replay consistency (file reads)
  const toolReplayConsistent = checkToolReplayConsistency(replayLog, workspaceFiles, warnings);

  const valid = nonEmpty && timestampsInBounds;

  return {
    valid,
    checks: {
      non_empty: nonEmpty,
      timestamps_in_bounds: timestampsInBounds,
      tool_replay_consistent: toolReplayConsistent,
    },
    warnings,
  };
}

/**
 * Check that all step timestamps fall within the match window.
 * Allows 5s grace period before startedAt (clock skew tolerance).
 */
function checkTimestampBounds(
  steps: ReplayStep[],
  startedAt: Date,
  submittedAt: Date,
  warnings: string[],
): boolean {
  if (steps.length === 0) return true;

  const gracePeriodMs = 5000;
  const windowStart = startedAt.getTime() - gracePeriodMs;
  const windowEnd = submittedAt.getTime() + gracePeriodMs;

  let allInBounds = true;
  for (const step of steps) {
    const stepTime = new Date(step.ts).getTime();
    if (isNaN(stepTime)) {
      warnings.push(`Step has invalid timestamp: ${step.ts}`);
      allInBounds = false;
      continue;
    }
    if (stepTime < windowStart || stepTime > windowEnd) {
      warnings.push(`Step timestamp ${step.ts} is outside the match window.`);
      allInBounds = false;
    }
  }

  return allInBounds;
}

/**
 * For tool_call steps with tool="read", verify the output matches workspace file content.
 * Flags mismatches as warnings — doesn't hard-fail validation.
 */
function checkToolReplayConsistency(
  steps: ReplayStep[],
  workspaceFiles: Record<string, string> | undefined,
  warnings: string[],
): boolean {
  if (!workspaceFiles || Object.keys(workspaceFiles).length === 0) return true;

  let consistent = true;
  for (const step of steps) {
    if (step.type !== "tool_call") continue;
    if (step.tool !== "read" || !step.output) continue;

    // step.input is typically the file path
    const filePath = step.input.trim();
    const expectedContent = workspaceFiles[filePath];

    if (expectedContent !== undefined) {
      // Compare truncated content (output may be truncated at 5000 chars)
      const expected = expectedContent.slice(0, 5000);
      if (step.output !== expected) {
        warnings.push(`File read mismatch for "${filePath}": reported output differs from workspace content.`);
        consistent = false;
      }
    }
  }

  return consistent;
}
