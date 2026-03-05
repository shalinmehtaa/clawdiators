import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { EvalRuntime } from "@clawdiators/shared";
import type { ChallengeData, ScoringInput, ScoreResult } from "./types.js";

const execFileAsync = promisify(execFile);

/** Docker image mapping for each runtime. */
export const RUNTIME_IMAGES: Record<EvalRuntime, string> = {
  node: "clawdiators/eval-node:20",
  python: "clawdiators/eval-python:3.12",
  multi: "clawdiators/eval-multi:latest",
};

/** Command to run the evaluator for each runtime. */
const RUNTIME_COMMANDS: Record<EvalRuntime, (script: string) => string[]> = {
  node: (script) => ["node", script],
  python: (script) => ["python3", script],
  multi: (script) =>
    script.endsWith(".py") ? ["python3", script] : ["node", script],
};

/** Default Docker resource flags for API-submitted challenges (always sandboxed). */
export const SANDBOXED_FLAGS: string[] = [
  "--network=none",
  "--memory=512m",
  "--cpus=1",
  "--pids-limit=50",
  "--read-only",
  "--tmpfs", "/tmp:exec,size=64m",
];

/**
 * Return Docker CLI flags for API-submitted challenge evaluation.
 * Always returns sandboxed flags — PR challenges use Docker Compose, not these flags.
 */
export function getDockerFlags(): string[] {
  return [...SANDBOXED_FLAGS];
}

/** Options for Docker/subprocess evaluation. */
export interface DockerEvalOpts {
  envVars?: Record<string, string>;
  image?: string;
}

/** Size limits. */
const MAX_TOTAL_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1MB per file
const MAX_EVALUATOR_SIZE = 100 * 1024; // 100KB

export interface DockerEvalResult {
  scores: Record<string, number>;
  exitCode: number;
  stdout: string;
  stderr: string;
  error?: string;
}

let dockerAvailableCache: boolean | null = null;

/**
 * Check if Docker is available on this host. Result is cached.
 */
export async function isDockerAvailable(): Promise<boolean> {
  if (dockerAvailableCache !== null) return dockerAvailableCache;
  try {
    await execFileAsync("docker", ["info"], { timeout: 5000 });
    dockerAvailableCache = true;
  } catch {
    dockerAvailableCache = false;
  }
  return dockerAvailableCache;
}

/** Reset cache — for testing. */
export function resetDockerCache(): void {
  dockerAvailableCache = null;
}

/** Per-image availability cache. Avoids repeated `docker image inspect` calls. */
const imageAvailableCache = new Map<string, boolean>();

/**
 * Check if a specific Docker image is available locally. Result is cached per image.
 * Used to decide whether to fall back to subprocess when a required image is missing.
 */
export async function isImageAvailable(image: string): Promise<boolean> {
  if (imageAvailableCache.has(image)) return imageAvailableCache.get(image)!;
  try {
    await execFileAsync("docker", ["image", "inspect", image], { timeout: 5000 });
    imageAvailableCache.set(image, true);
    return true;
  } catch {
    imageAvailableCache.set(image, false);
    return false;
  }
}

/** Reset image availability cache — for testing. */
export function resetImageCache(): void {
  imageAvailableCache.clear();
}

/**
 * Write submission files and evaluator script to a temp directory.
 */
async function prepareWorkdir(
  submissionFiles: Record<string, string>,
  evaluatorScript: string,
  evaluatorFilename: string,
): Promise<string> {
  // Validate sizes
  let totalSize = 0;
  for (const [path, content] of Object.entries(submissionFiles)) {
    const size = Buffer.byteLength(content, "utf-8");
    if (size > MAX_FILE_SIZE) {
      throw new Error(
        `File "${path}" exceeds max size (${size} > ${MAX_FILE_SIZE})`,
      );
    }
    totalSize += size;
  }
  if (totalSize > MAX_TOTAL_SIZE) {
    throw new Error(
      `Total submission size exceeds limit (${totalSize} > ${MAX_TOTAL_SIZE})`,
    );
  }
  if (Buffer.byteLength(evaluatorScript, "utf-8") > MAX_EVALUATOR_SIZE) {
    throw new Error("Evaluator script exceeds 100KB limit");
  }

  const dir = await mkdtemp(join(tmpdir(), "clawdiators-eval-"));

  // Write submission files (may include subdirs)
  for (const [relPath, content] of Object.entries(submissionFiles)) {
    const fullPath = join(dir, relPath);
    if (!fullPath.startsWith(dir + "/")) {
      throw new Error(`Invalid submission path: ${relPath}`);
    }
    const parentDir = join(fullPath, "..");
    await mkdir(parentDir, { recursive: true });
    await writeFile(fullPath, content, "utf-8");
  }

  // Write evaluator
  await writeFile(join(dir, evaluatorFilename), evaluatorScript, "utf-8");

  return dir;
}

/**
 * Evaluate a submission inside a Docker container.
 *
 * The container is:
 * - read-only root filesystem
 * - no network
 * - 512MB memory, 1 CPU, 50 PIDs
 * - workspace mounted read-only at /workspace
 * - writable /tmp (64MB)
 *
 * The evaluator must print a JSON object to stdout: `{ "scores": { ... } }`
 */
export async function evaluateInDocker(
  submissionFiles: Record<string, string>,
  evaluatorScript: string,
  runtime: EvalRuntime,
  timeoutSecs: number,
  opts?: DockerEvalOpts,
): Promise<DockerEvalResult> {
  const evaluatorFilename =
    runtime === "python" ? "evaluator.py" : "evaluator.js";
  let dir: string | undefined;

  const dockerFlags = getDockerFlags();
  const envFlags: string[] = [];
  if (opts?.envVars) {
    for (const [key, value] of Object.entries(opts.envVars)) {
      envFlags.push("-e", `${key}=${value}`);
    }
  }

  try {
    dir = await prepareWorkdir(
      submissionFiles,
      evaluatorScript,
      evaluatorFilename,
    );
    const image = opts?.image ?? RUNTIME_IMAGES[runtime];
    const command = RUNTIME_COMMANDS[runtime](evaluatorFilename);

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      timeoutSecs * 1000,
    );

    try {
      const { stdout, stderr } = await execFileAsync(
        "docker",
        [
          "run",
          "--rm",
          ...dockerFlags,
          ...envFlags,
          "-v",
          `${dir}:/workspace:ro`,
          "-w",
          "/workspace",
          image,
          ...command,
        ],
        {
          timeout: timeoutSecs * 1000,
          maxBuffer: 1024 * 1024,
          signal: controller.signal,
        },
      );

      clearTimeout(timeout);
      return parseEvalOutput(stdout, stderr, 0);
    } catch (err: any) {
      clearTimeout(timeout);
      if (err.killed || err.code === "ABORT_ERR") {
        return {
          scores: {},
          exitCode: -1,
          stdout: err.stdout ?? "",
          stderr: err.stderr ?? "",
          error: `Evaluation timed out after ${timeoutSecs}s`,
        };
      }
      return {
        scores: {},
        exitCode: err.status ?? 1,
        stdout: err.stdout ?? "",
        stderr: err.stderr ?? "",
        error: `Container error: ${err.message}`,
      };
    }
  } finally {
    if (dir) {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

/**
 * Fallback evaluator: runs the evaluator script as a subprocess directly
 * (no Docker). Used when Docker is unavailable (dev environments).
 */
export async function evaluateInSubprocess(
  submissionFiles: Record<string, string>,
  evaluatorScript: string,
  runtime: EvalRuntime,
  timeoutSecs: number,
  opts?: DockerEvalOpts,
): Promise<DockerEvalResult> {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "evaluateInSubprocess is disabled in production — use Docker evaluation",
    );
  }
  const evaluatorFilename =
    runtime === "python" ? "evaluator.py" : "evaluator.js";
  let dir: string | undefined;

  // Whitelist only essential env vars — prevent leaking secrets (ADMIN_API_KEY,
  // DATABASE_URL, agent keys, etc.) to evaluator scripts.
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? "",
    HOME: process.env.HOME ?? "",
    NODE_PATH: process.env.NODE_PATH ?? "",
    ...(opts?.envVars ?? {}),
  };

  try {
    dir = await prepareWorkdir(
      submissionFiles,
      evaluatorScript,
      evaluatorFilename,
    );
    const command = RUNTIME_COMMANDS[runtime](evaluatorFilename);
    const [cmd, ...args] = command;

    try {
      const { stdout, stderr } = await execFileAsync(cmd, args, {
        timeout: timeoutSecs * 1000,
        maxBuffer: 1024 * 1024,
        cwd: dir,
        env,
      });
      return parseEvalOutput(stdout, stderr, 0);
    } catch (err: any) {
      if (err.killed) {
        return {
          scores: {},
          exitCode: -1,
          stdout: err.stdout ?? "",
          stderr: err.stderr ?? "",
          error: `Evaluation timed out after ${timeoutSecs}s`,
        };
      }
      return {
        scores: {},
        exitCode: err.status ?? 1,
        stdout: err.stdout ?? "",
        stderr: err.stderr ?? "",
        error: `Subprocess error: ${err.message}`,
      };
    }
  } finally {
    if (dir) {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

/**
 * Parse evaluator stdout as `{ scores: Record<string, number> }`.
 * Returns empty scores with error if parsing fails.
 */
function parseEvalOutput(
  stdout: string,
  stderr: string,
  exitCode: number,
): DockerEvalResult {
  // Search stdout lines in reverse for a JSON object with a "scores" key
  const lines = stdout.trim().split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(lines[i]);
      if (
        parsed &&
        typeof parsed.scores === "object" &&
        parsed.scores !== null &&
        !Array.isArray(parsed.scores)
      ) {
        return { scores: parsed.scores, exitCode, stdout, stderr };
      }
    } catch {
      // Not valid JSON — try next line
    }
  }
  return {
    scores: {},
    exitCode,
    stdout,
    stderr,
    error: "Evaluator output did not contain a JSON line with 'scores' key",
  };
}

// ── Code execution helpers for community modules ─────────────────────

/**
 * Execute a JS script in Docker and return stdout.
 * Used for community challenge data generation and scoring.
 */
export async function executeCodeInDocker(
  script: string,
  timeoutSecs: number = 10,
): Promise<{ stdout: string; exitCode: number }> {
  const dockerOk = await isDockerAvailable();
  if (!dockerOk) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Docker required for community code execution in production");
    }
    // Dev fallback: run as subprocess
    const result = await evaluateInSubprocess(
      {},
      script,
      "node",
      timeoutSecs,
    );
    return { stdout: result.stdout, exitCode: result.exitCode };
  }

  const image = RUNTIME_IMAGES.node;
  const imageOk = await isImageAvailable(image);
  if (!imageOk) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(`Docker image "${image}" not available for community code execution`);
    }
    const result = await evaluateInSubprocess(
      {},
      script,
      "node",
      timeoutSecs,
    );
    return { stdout: result.stdout, exitCode: result.exitCode };
  }

  const result = await evaluateInDocker(
    {},
    script,
    "node",
    timeoutSecs,
  );
  return { stdout: result.stdout, exitCode: result.exitCode };
}

/**
 * Generate challenge data by executing community data.js in Docker.
 */
export async function generateDataInDocker(
  source: string,
  seed: number,
  cachedAssets?: Record<string, unknown>,
): Promise<ChallengeData> {
  const script = [
    `"use strict";`,
    source,
    ``,
    `// --- runner ---`,
    `var genFn = module.exports.generateData || exports.generateData;`,
    `if (typeof genFn !== "function") {`,
    `  var err = "data.js must export a generateData(seed) function";`,
    `  console.error(err);`,
    `  process.exit(1);`,
    `}`,
    cachedAssets
      ? `var CACHED_ASSETS = ${JSON.stringify(cachedAssets)};`
      : ``,
    `var result = genFn(${seed});`,
    `console.log(JSON.stringify(result));`,
  ].join("\n");

  const { stdout, exitCode } = await executeCodeInDocker(script, 10);

  if (exitCode !== 0) {
    throw new Error(`generateData failed with exit code ${exitCode}: ${stdout}`);
  }

  const lines = stdout.trim().split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(lines[i]);
      if (parsed && typeof parsed === "object" && typeof parsed.objective === "string") {
        return parsed as ChallengeData;
      }
    } catch {
      // Not valid JSON — try next line
    }
  }

  throw new Error("generateData did not produce valid JSON output with 'objective' field");
}

/**
 * Score a submission by executing community scorer.js in Docker.
 */
export async function scoreInDocker(
  source: string,
  input: ScoringInput,
  maxScore: number,
  cachedAssets?: Record<string, unknown>,
): Promise<ScoreResult> {
  const scorerInput = {
    submission: input.submission,
    groundTruth: input.groundTruth,
    startedAt: input.startedAt.toISOString(),
    submittedAt: input.submittedAt.toISOString(),
    apiCallCount: input.apiCallCount,
    checkpoints: input.checkpoints ?? [],
  };

  const script = [
    `"use strict";`,
    source,
    ``,
    `// --- runner ---`,
    `var scoreFn = module.exports.score || exports.score;`,
    `if (typeof scoreFn !== "function") {`,
    `  console.error("scorer.js must export a score(input) function");`,
    `  process.exit(1);`,
    `}`,
    cachedAssets
      ? `var CACHED_ASSETS = ${JSON.stringify(cachedAssets)};`
      : ``,
    `var input = ${JSON.stringify(scorerInput)};`,
    `var result = scoreFn(input);`,
    `console.log(JSON.stringify(result));`,
  ].join("\n");

  const { stdout, exitCode } = await executeCodeInDocker(script, 10);

  if (exitCode !== 0) {
    throw new Error(`score() failed with exit code ${exitCode}: ${stdout}`);
  }

  const lines = stdout.trim().split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(lines[i]);
      if (parsed && typeof parsed === "object" && parsed.breakdown) {
        // Validate dimension scores
        for (const [key, value] of Object.entries(parsed.breakdown)) {
          if (typeof value !== "number" || isNaN(value as number)) {
            throw new Error(`score() breakdown.${key} must be a number`);
          }
        }
        // Ensure total exists
        if (parsed.breakdown.total === undefined) {
          let total = 0;
          for (const [key, value] of Object.entries(parsed.breakdown)) {
            if (key !== "total") total += value as number;
          }
          parsed.breakdown.total = total;
        }
        // Clamp total to maxScore
        parsed.breakdown.total = Math.min(parsed.breakdown.total, maxScore);
        return { breakdown: parsed.breakdown };
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes("breakdown")) throw e;
      // Not valid JSON — try next line
    }
  }

  throw new Error("score() did not produce valid JSON output with 'breakdown' field");
}
