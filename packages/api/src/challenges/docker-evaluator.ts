import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { EvalRuntime } from "@clawdiators/shared";

const execFileAsync = promisify(execFile);

/** Docker image mapping for each runtime. */
const RUNTIME_IMAGES: Record<EvalRuntime, string> = {
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
): Promise<DockerEvalResult> {
  const evaluatorFilename =
    runtime === "python" ? "evaluator.py" : "evaluator.js";
  let dir: string | undefined;

  try {
    dir = await prepareWorkdir(
      submissionFiles,
      evaluatorScript,
      evaluatorFilename,
    );
    const image = RUNTIME_IMAGES[runtime];
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
          "--network=none",
          "--memory=512m",
          "--cpus=1",
          "--pids-limit=50",
          "--read-only",
          "--tmpfs",
          "/tmp:exec,size=64m",
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
): Promise<DockerEvalResult> {
  const evaluatorFilename =
    runtime === "python" ? "evaluator.py" : "evaluator.js";
  let dir: string | undefined;

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
