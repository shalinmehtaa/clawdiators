/**
 * Inline code executor for tests — replaces Docker execution with
 * in-process `new Function()` evaluation. NOT safe for untrusted code;
 * only used in test fixtures where we control the source.
 */
import type { ChallengeData, ScoringInput, ScoreResult } from "../../src/challenges/types.js";

/**
 * Execute JS source code inline using `new Function()`.
 * Returns the module.exports object.
 */
function executeInline(
  code: string,
  globals: Record<string, unknown> = {},
): Record<string, unknown> {
  const moduleExports: Record<string, unknown> = {};
  const moduleObj = { exports: moduleExports };

  // Extract special overrides from globals
  const logFn = globals._captureLog as ((...args: unknown[]) => void) | undefined;
  const processOverride = globals.process;
  const filteredGlobals = { ...globals };
  delete filteredGlobals._captureLog;
  delete filteredGlobals.process;

  const globalKeys = Object.keys(filteredGlobals);
  const globalValues = Object.values(filteredGlobals);

  const builtinNames = [
    "module", "exports", "console", "JSON", "Math", "Date", "Array", "Object",
    "String", "Number", "Boolean", "RegExp", "Map", "Set", "parseInt",
    "parseFloat", "isNaN", "isFinite", "encodeURIComponent", "decodeURIComponent",
    ...(processOverride ? ["process"] : []),
  ];

  const fn = new Function(...builtinNames, ...globalKeys, code);

  const noop = () => {};
  const fakeConsole = {
    log: logFn ?? noop,
    warn: noop,
    error: noop,
  };

  const builtinValues = [
    moduleObj, moduleExports, fakeConsole, JSON, Math, Date, Array, Object,
    String, Number, Boolean, RegExp, Map, Set, parseInt,
    parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent,
    ...(processOverride ? [processOverride] : []),
  ];

  fn(...builtinValues, ...globalValues);

  return Object.keys(moduleObj.exports).length > 0
    ? moduleObj.exports
    : moduleExports;
}

/**
 * Mock implementation for generateDataInDocker.
 * Executes the source inline and calls generateData(seed).
 */
export async function mockGenerateDataInDocker(
  source: string,
  seed: number,
  cachedAssets?: Record<string, unknown>,
): Promise<ChallengeData> {
  const globals: Record<string, unknown> = {};
  if (cachedAssets) globals.CACHED_ASSETS = cachedAssets;

  const exports = executeInline(source, globals);
  const genFn = exports.generateData as
    | ((seed: number) => ChallengeData)
    | undefined;

  if (typeof genFn !== "function") {
    throw new Error("data.js must export a generateData(seed) function");
  }

  const result = genFn(seed);
  if (!result || typeof result !== "object") {
    throw new Error("generateData must return an object");
  }
  if (typeof result.objective !== "string") {
    throw new Error("generateData must return an object with an 'objective' string");
  }
  if (!result.groundTruth || typeof result.groundTruth !== "object") {
    throw new Error("generateData must return an object with a 'groundTruth' object");
  }
  return result;
}

/**
 * Mock implementation for scoreInDocker.
 * Executes the source inline and calls score(input).
 */
export async function mockScoreInDocker(
  source: string,
  input: ScoringInput,
  maxScore: number,
  cachedAssets?: Record<string, unknown>,
): Promise<ScoreResult> {
  const globals: Record<string, unknown> = {};
  if (cachedAssets) globals.CACHED_ASSETS = cachedAssets;

  const exports = executeInline(source, globals);
  const scoreFn = exports.score as
    | ((input: Record<string, unknown>) => { breakdown: Record<string, number> })
    | undefined;

  if (typeof scoreFn !== "function") {
    throw new Error("scorer.js must export a score(input) function");
  }

  const scorerInput = {
    submission: input.submission,
    groundTruth: input.groundTruth,
    startedAt: input.startedAt.toISOString(),
    submittedAt: input.submittedAt.toISOString(),
    apiCallCount: input.apiCallCount,
    checkpoints: input.checkpoints ?? [],
  };

  const result = scoreFn(scorerInput);
  if (!result || typeof result !== "object" || !result.breakdown) {
    throw new Error("score() must return { breakdown: { [dimension]: number, total: number } }");
  }

  for (const [key, value] of Object.entries(result.breakdown)) {
    if (typeof value !== "number" || isNaN(value)) {
      throw new Error(`score() breakdown.${key} must be a number`);
    }
  }

  if (result.breakdown.total === undefined) {
    let total = 0;
    for (const [key, value] of Object.entries(result.breakdown)) {
      if (key !== "total") total += value;
    }
    result.breakdown.total = total;
  }

  result.breakdown.total = Math.min(result.breakdown.total, maxScore);
  return { breakdown: result.breakdown };
}

/**
 * Mock implementation for executeCodeInDocker.
 * Executes the script inline and captures console.log output.
 */
export async function mockExecuteCodeInDocker(
  script: string,
  _timeoutSecs: number = 10,
): Promise<{ stdout: string; exitCode: number }> {
  const logs: string[] = [];
  const fakeProcess = {
    env: {},
    exit: (code: number) => { throw new Error(`process.exit(${code})`); },
  };

  try {
    executeInline(script, {
      process: fakeProcess,
      _captureLog: (...args: unknown[]) => logs.push(args.map(String).join(" ")),
    });
    return { stdout: logs.join("\n"), exitCode: 0 };
  } catch {
    return { stdout: logs.join("\n"), exitCode: 1 };
  }
}
