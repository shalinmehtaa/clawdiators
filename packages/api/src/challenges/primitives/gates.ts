/**
 * Machine gates for community challenge validation.
 * All gates run before a draft enters human/agent review.
 */
import type { GateResult, GateReport, GateFixSuggestion } from "@clawdiators/shared";
import { validateSpec, verifyDeterminism } from "./validator.js";
import { createDeclarativeModule } from "./declarative-module.js";
import { createCodeModule } from "./code-module.js";
import type { CommunitySpec } from "./validator.js";
import type { ChallengeModule } from "../types.js";

import type { Difficulty } from "@clawdiators/shared";

// Difficulty-aware thresholds — harder challenges are allowed lower reference scores
// so that truly novel/frontier challenges aren't blocked by the gates.
const BASELINE_THRESHOLDS: Record<Difficulty, number> = {
  newcomer: 0.6,
  contender: 0.5,
  veteran: 0.35,
  legendary: 0.2,
};

const PROBE_CEILINGS: Record<Difficulty, number> = {
  newcomer: 0.25,
  contender: 0.25,
  veteran: 0.2,
  legendary: 0.15,
};

export function getBaselineThreshold(difficulty: Difficulty): number {
  return BASELINE_THRESHOLDS[difficulty] ?? 0.5;
}

export function getProbeCeiling(difficulty: Difficulty): number {
  return PROBE_CEILINGS[difficulty] ?? 0.25;
}

// ── Gate 1: Spec Validity ────────────────────────────────────────────

/**
 * Validate the raw spec against the community spec Zod schema.
 */
export function checkSpecValidity(raw: unknown): GateResult {
  const result = validateSpec(raw);
  if (result.valid) {
    return { passed: true, details: {} };
  }
  return {
    passed: false,
    details: { errors: result.errors },
    error: `Spec validation failed: ${result.errors.join("; ")}`,
    fix_suggestion: {
      issue: "Spec does not match the required Zod schema.",
      fix: "Use camelCase for all field names (timeLimitSecs, matchType, not time_limit_secs). Ensure scoring.dimensions weights sum to 1.0. Use GET /api/v1/challenges/scaffold to generate a valid starting spec.",
    },
  };
}

// ── Gate 2: Determinism ──────────────────────────────────────────────

/**
 * Verify that generateData produces identical output for the same seed.
 */
export async function checkDeterminism(mod: ChallengeModule): Promise<GateResult> {
  try {
    const result = await verifyDeterminism(async (seed) => mod.generateData(seed, {}));
    if (result.deterministic) {
      return { passed: true, details: { seeds_tested: [42, 123, 7777] } };
    }
    return {
      passed: false,
      details: { seeds_tested: [42, 123, 7777] },
      error: result.error,
      fix_suggestion: {
        issue: "generateData() produces different output for the same seed, or identical output for different seeds.",
        fix: "Use rng(seed) for ALL random generation. Never use Math.random(), Date.now(), or any other non-deterministic source. Call rng(seed) once and use the returned function for all random values.",
        example_code: "var r = rng(seed);\nvar val = Math.floor(r() * 100);",
      },
    };
  } catch (err) {
    return {
      passed: false,
      details: { seeds_tested: [42, 123, 7777] },
      error: `generateData threw: ${err instanceof Error ? err.message : String(err)}`,
      fix_suggestion: {
        issue: "generateData() threw an error during execution.",
        fix: "Ensure generateData(seed) handles all seeds without throwing. Check for undefined variables, missing return values, and division by zero.",
      },
    };
  }
}

// ── Gate 3: Contract Consistency ─────────────────────────────────────

/**
 * Purely structural checks — no execution required.
 * Verifies scorer fields, seed placeholder, and time dimension references.
 */
export function checkContractConsistency(spec: CommunitySpec): GateResult {
  const issues: string[] = [];

  // If json submission has schema and scorer has fields, check all scorer keys exist in schema
  if (
    spec.submission.type === "json" &&
    spec.submission.schema &&
    spec.scorer?.fields
  ) {
    const schemaKeys = new Set(Object.keys(spec.submission.schema));
    for (const field of spec.scorer.fields) {
      if (!schemaKeys.has(field.key)) {
        issues.push(
          `Scorer field "${field.key}" not found in submission.schema`,
        );
      }
    }
  }

  // If workspace is seedable, challengeMd must contain {{seed}}
  if (spec.workspace.seedable && !spec.workspace.challengeMd.includes("{{seed}}")) {
    issues.push(
      'workspace.seedable is true but challengeMd does not contain {{seed}}',
    );
  }

  // If scorer references a timeDimension, it must exist in scoring.dimensions
  if (spec.scorer?.timeDimension) {
    const dimKeys = new Set(spec.scoring.dimensions.map((d) => d.key));
    if (!dimKeys.has(spec.scorer.timeDimension)) {
      issues.push(
        `scorer.timeDimension "${spec.scorer.timeDimension}" not found in scoring.dimensions`,
      );
    }
  }

  if (issues.length === 0) {
    return { passed: true, details: {} };
  }
  return {
    passed: false,
    details: { issues },
    error: `Contract consistency issues: ${issues.join("; ")}`,
    fix_suggestion: {
      issue: "Structural mismatch between spec fields.",
      fix: "If seedable is true, challengeMd must contain '{{seed}}'. Scorer field keys must exist in submission.schema. If scorer.timeDimension is set, it must match a key in scoring.dimensions.",
    },
  };
}

// ── Gate 4: Baseline Solveability ────────────────────────────────────

/**
 * Score a reference answer — must reach the difficulty-aware threshold.
 */
export async function checkBaselineSolveability(
  spec: CommunitySpec,
  mod: ChallengeModule,
  referenceAnswer: { seed: number; answer: Record<string, unknown> },
): Promise<GateResult> {
  const pct = getBaselineThreshold(spec.difficulty as Difficulty);
  const threshold = pct * spec.scoring.maxScore;

  let data: Awaited<ReturnType<typeof mod.generateData>>;
  try {
    data = await mod.generateData(referenceAnswer.seed, {});
  } catch (err) {
    return {
      passed: false,
      details: {},
      error: `generateData threw: ${String(err)}`,
    };
  }

  const now = new Date();
  const startedAt = new Date(now.getTime() - 1000); // 1s ago

  let result: Awaited<ReturnType<typeof mod.score>>;
  try {
    result = await mod.score({
      submission: referenceAnswer.answer,
      groundTruth: data.groundTruth,
      startedAt,
      submittedAt: now,
      apiCallCount: 0,
    });
  } catch (err) {
    return {
      passed: false,
      details: {},
      error: `score() threw: ${String(err)}`,
    };
  }

  const total = result.breakdown.total ?? 0;
  const passed = total >= threshold;

  return {
    passed,
    details: {
      score: total,
      threshold,
      maxScore: spec.scoring.maxScore,
    },
    ...(!passed && {
      error: `Reference answer scored ${total} < threshold ${threshold} (${Math.round(pct * 100)}% of ${spec.scoring.maxScore} for ${spec.difficulty} difficulty)`,
      fix_suggestion: {
        issue: `Reference answer scored ${total} but needs at least ${threshold} (${Math.round(pct * 100)}% of ${spec.scoring.maxScore}).`,
        fix: "Ensure referenceAnswer.seed matches the seed used to compute the answer. Verify that referenceAnswer.answer contains the correct keys your scorer expects in input.submission. Run generateData(seed) locally to check groundTruth matches your answer.",
      },
    }),
  };
}

// ── Gate 5: Anti-Gaming ──────────────────────────────────────────────

/**
 * Run adversarial probes — all must score below the difficulty-aware ceiling.
 * Probes: empty submission, all-null fields, random UUID values.
 */
export async function checkAntiGaming(
  spec: CommunitySpec,
  mod: ChallengeModule,
  referenceAnswer: { seed: number; answer: Record<string, unknown> },
): Promise<GateResult> {
  const pct = getProbeCeiling(spec.difficulty as Difficulty);
  const ceiling = pct * spec.scoring.maxScore;
  const probeKeys = Object.keys(referenceAnswer.answer);

  let data: Awaited<ReturnType<typeof mod.generateData>>;
  try {
    data = await mod.generateData(referenceAnswer.seed, {});
  } catch (err) {
    return {
      passed: false,
      details: {},
      error: `generateData threw: ${String(err)}`,
    };
  }

  const now = new Date();
  const startedAt = new Date(now.getTime() - 1000);

  const probes: Array<{ name: string; submission: Record<string, unknown> }> = [
    { name: "empty", submission: {} },
    {
      name: "all_null",
      submission: Object.fromEntries(probeKeys.map((k) => [k, null])),
    },
    {
      name: "random_uuid",
      submission: Object.fromEntries(
        probeKeys.map((k) => [
          k,
          "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
            const r = Math.floor(Math.random() * 16);
            const v = c === "x" ? r : (r & 0x3) | 0x8;
            return v.toString(16);
          }),
        ]),
      ),
    },
  ];

  let worstScore = 0;
  const probeResults: Array<{ name: string; score: number }> = [];

  for (const probe of probes) {
    let result: Awaited<ReturnType<typeof mod.score>>;
    try {
      result = await mod.score({
        submission: probe.submission,
        groundTruth: data.groundTruth,
        startedAt,
        submittedAt: now,
        apiCallCount: 0,
      });
    } catch {
      // Probe that throws is treated as score 0 — that's fine
      probeResults.push({ name: probe.name, score: 0 });
      continue;
    }
    const score = result.breakdown.total ?? 0;
    probeResults.push({ name: probe.name, score });
    if (score > worstScore) worstScore = score;
  }

  const passed = worstScore < ceiling;

  return {
    passed,
    details: {
      probe_results: probeResults,
      worst_probe_score: worstScore,
      ceiling,
      maxScore: spec.scoring.maxScore,
    },
    ...(!passed && {
      error: `Anti-gaming probe scored ${worstScore} >= ceiling ${ceiling} (${Math.round(pct * 100)}% of ${spec.scoring.maxScore} for ${spec.difficulty} difficulty)`,
      fix_suggestion: {
        issue: "Empty/null/random submissions score too high — your scorer awards points without checking correctness.",
        fix: "Gate speed, methodology, and bonus dimensions on correctness > 0. Only award non-correctness points when the primary answer is at least partially correct. This prevents gaming probes (empty {}, all-null, random UUIDs) from earning free points.",
        example_code: "var correctness = sub.answer === gt.answer ? 500 : 0;\nvar speed = 0;\nif (correctness > 0) {\n  speed = Math.round(200 * (1 - elapsed / limit));\n}",
      },
    }),
  };
}

// ── Gate 6: Score Distribution ───────────────────────────────────────

/**
 * Cross-reference gates 4 + 5:
 * - reference score >= difficulty-aware baseline threshold
 * - max probe score < difficulty-aware probe ceiling
 * - reference score > max probe score
 * Derived from earlier results — no new execution.
 */
export function checkScoreDistribution(
  referenceScore: number,
  probeScores: number[],
  maxScore: number,
  difficulty: string = "contender",
): GateResult {
  const baselinePct = getBaselineThreshold(difficulty as Difficulty);
  const probePct = getProbeCeiling(difficulty as Difficulty);
  const passCeiling = baselinePct * maxScore;
  const probeCeiling = probePct * maxScore;
  const maxProbeScore = probeScores.length > 0 ? Math.max(...probeScores) : 0;
  const issues: string[] = [];

  if (referenceScore < passCeiling) {
    issues.push(`Reference score ${referenceScore} < ${passCeiling} (${Math.round(baselinePct * 100)}% of ${maxScore} for ${difficulty})`);
  }
  if (maxProbeScore >= probeCeiling) {
    issues.push(`Max probe score ${maxProbeScore} >= ${probeCeiling} (${Math.round(probePct * 100)}% of ${maxScore} for ${difficulty})`);
  }
  if (referenceScore <= maxProbeScore) {
    issues.push(`Score inversion: reference ${referenceScore} <= max probe ${maxProbeScore}`);
  }

  if (issues.length === 0) {
    return {
      passed: true,
      details: { reference_score: referenceScore, max_probe_score: maxProbeScore, max_score: maxScore },
    };
  }
  return {
    passed: false,
    details: { reference_score: referenceScore, max_probe_score: maxProbeScore, max_score: maxScore, issues },
    error: issues.join("; "),
    fix_suggestion: {
      issue: "Score distribution is unhealthy — reference answer scores too low, gaming probes score too high, or both are inverted.",
      fix: "Increase the reference answer score (fix your answer or relax scoring) and ensure gaming probes score near zero (gate bonus dimensions on correctness > 0).",
    },
  };
}

// ── Gate 7: Code Syntax ──────────────────────────────────────────────

/** Prohibited patterns for Tier 0-1 (sandboxed) code. */
const PROHIBITED_PATTERNS_SANDBOXED: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\brequire\s*\(/, label: "require()" },
  { pattern: /\bimport\s+/, label: "import statement" },
  { pattern: /\bprocess\b/, label: "process" },
  { pattern: /\b__dirname\b/, label: "__dirname" },
  { pattern: /\b__filename\b/, label: "__filename" },
  { pattern: /\bglobalThis\b/, label: "globalThis" },
  { pattern: /\beval\s*\(/, label: "eval()" },
  { pattern: /\bFunction\s*\(/, label: "Function()" },
  { pattern: /\bfetch\s*\(/, label: "fetch()" },
  { pattern: /\bXMLHttpRequest\b/, label: "XMLHttpRequest" },
  { pattern: /\bWebSocket\b/, label: "WebSocket" },
  { pattern: /\bchild_process\b/, label: "child_process" },
  { pattern: /\bexecSync\b/, label: "execSync" },
  { pattern: /\bspawnSync\b/, label: "spawnSync" },
  { pattern: /\bsetTimeout\b/, label: "setTimeout" },
  { pattern: /\bsetInterval\b/, label: "setInterval" },
];

/** Content patterns that flag for mandatory admin review. */
const CONTENT_SAFETY_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bmalware\b/i, label: "malware" },
  { pattern: /\bransomware\b/i, label: "ransomware" },
  { pattern: /\bphishing\b/i, label: "phishing" },
  { pattern: /\bexploit(?:ation)?\b/i, label: "exploit" },
  { pattern: /\bjailbreak\b/i, label: "jailbreak" },
  { pattern: /\bbypass\s+safety\b/i, label: "bypass safety" },
  { pattern: /\bpersonal\s+data\b/i, label: "personal data" },
  { pattern: /\bsocial\s+security\b/i, label: "social security" },
  { pattern: /\bcredit\s+card\b/i, label: "credit card" },
  { pattern: /\bweapon(?:s|ize)?\b/i, label: "weapon" },
  { pattern: /\bCSAM\b/, label: "CSAM" },
];

/**
 * Verify that each code file is syntactically valid JavaScript.
 */
export function checkCodeSyntax(codeFiles: Record<string, string>): GateResult {
  const issues: string[] = [];

  for (const [filename, code] of Object.entries(codeFiles)) {
    try {
      // Use Function constructor to check syntax without executing
      // eslint-disable-next-line no-new-func
      new Function(code);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      issues.push(`${filename}: ${message}`);
    }
  }

  if (issues.length === 0) {
    return { passed: true, details: { files_checked: Object.keys(codeFiles) } };
  }
  return {
    passed: false,
    details: { issues },
    error: `Syntax errors: ${issues.join("; ")}`,
    fix_suggestion: {
      issue: "One or more code files have JavaScript syntax errors.",
      fix: "Code files must be valid JavaScript (not TypeScript). Use var instead of let/const if targeting maximum compatibility. Use function declarations, not arrow functions with const. Escape backticks inside template literals as \\` or use string concatenation instead.",
    },
  };
}

/**
 * Scan code files for prohibited patterns.
 * Blocks require/import, process access, eval, network, timers, etc.
 * Runs unconditionally on all API-submitted code.
 */
export function checkCodeSecurity(
  codeFiles: Record<string, string>,
): GateResult {
  const violations: Array<{ file: string; pattern: string; line: number }> = [];

  for (const [filename, code] of Object.entries(codeFiles)) {
    const lines = code.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip comment lines
      if (line.trimStart().startsWith("//")) continue;

      for (const { pattern, label } of PROHIBITED_PATTERNS_SANDBOXED) {
        if (pattern.test(line)) {
          violations.push({ file: filename, pattern: label, line: i + 1 });
        }
      }
    }
  }

  if (violations.length === 0) {
    return { passed: true, details: { files_scanned: Object.keys(codeFiles) } };
  }
  return {
    passed: false,
    details: { violations },
    error: `Prohibited patterns in sandboxed code: ${violations.map((v) => `${v.file}:${v.line} — ${v.pattern}`).join("; ")}`,
    fix_suggestion: {
      issue: "Code files contain prohibited patterns (require, import, process, eval, fetch, setTimeout, etc.).",
      fix: "API-path code runs in a sandboxed VM — no imports, network, timers, or filesystem access. If a prohibited word appears inside a string literal (e.g. in data), break it with string concatenation: 'imp' + 'ort'. If your challenge genuinely needs these APIs, use the PR path instead (see /pr-authoring.md).",
      example_code: "// Instead of: var msg = 'do not import this';\n// Use: var msg = 'do not imp' + 'ort this';",
    },
  };
}

/**
 * Scan challenge content for potentially harmful patterns.
 * Flags (does not block) — triggers mandatory admin review.
 */
export function checkContentSafety(spec: CommunitySpec): GateResult {
  const flags: Array<{ source: string; pattern: string }> = [];

  // Text fields to scan
  const textSources: Array<{ name: string; text: string }> = [
    { name: "description", text: spec.description },
    { name: "lore", text: spec.lore },
    { name: "challengeMd", text: spec.workspace.challengeMd },
  ];

  // Also scan code file contents if present
  if (spec.codeFiles) {
    for (const [filename, code] of Object.entries(spec.codeFiles)) {
      if (code) textSources.push({ name: `codeFiles.${filename}`, text: code });
    }
  }

  for (const { name, text } of textSources) {
    for (const { pattern, label } of CONTENT_SAFETY_PATTERNS) {
      if (pattern.test(text)) {
        flags.push({ source: name, pattern: label });
      }
    }
  }

  if (flags.length === 0) {
    return { passed: true, details: { sources_scanned: textSources.length } };
  }

  // Content safety flags as warnings, not failures — triggers admin review
  return {
    passed: true,
    details: {
      flags,
      note: "Content safety flags detected — mandatory admin review required",
      requires_admin_review: true,
    },
  };
}

// ── Orchestrator ──────────────────────────────────────────────────────

/**
 * Build the appropriate ChallengeModule for a validated spec.
 * Code-based specs use createCodeModule, declarative specs use createDeclarativeModule.
 */
export function buildModuleForSpec(spec: CommunitySpec): ChallengeModule {
  if (spec.codeFiles) {
    return createCodeModule(spec);
  }
  return createDeclarativeModule(spec);
}

/**
 * Run all gates sequentially.
 * Fails fast on gate 1 (spec validity) — subsequent gates need a valid parsed spec.
 * Code-based specs get additional code_syntax, code_security, and content_safety gates.
 */
export async function runAllGates(
  raw: unknown,
  referenceAnswer: { seed: number; answer: Record<string, unknown> },
): Promise<GateReport> {
  const generated_at = new Date().toISOString();
  const skipped: GateResult = { passed: false, details: {}, error: "Skipped — spec invalid" };

  // Gate 1 — spec validity (fail fast)
  const specValidityResult = checkSpecValidity(raw);
  if (!specValidityResult.passed) {
    return {
      gates: {
        spec_validity: specValidityResult,
        determinism: skipped,
        contract_consistency: skipped,
        baseline_solveability: skipped,
        anti_gaming: skipped,
        score_distribution: skipped,
      },
      overall: "fail",
      generated_at,
    };
  }

  const validationResult = validateSpec(raw);
  if (!validationResult.valid) {
    throw new Error("Unexpected: spec invalid after gate 1 passed");
  }
  const spec = validationResult.spec;
  const isCodeBased = !!spec.codeFiles;

  // ── Code-specific gates (only for code-based specs) ────────────────

  let codeSyntaxResult: GateResult | undefined;
  let codeSecurityResult: GateResult | undefined;
  let contentSafetyResult: GateResult | undefined;

  if (isCodeBased) {
    // Gate: code_syntax — parse each file as valid JS
    codeSyntaxResult = checkCodeSyntax(spec.codeFiles!);
    if (!codeSyntaxResult.passed) {
      return {
        gates: {
          spec_validity: specValidityResult,
          code_syntax: codeSyntaxResult,
          code_security: { passed: false, details: {}, error: "Skipped — syntax errors" },
          content_safety: { passed: false, details: {}, error: "Skipped — syntax errors" },
          determinism: skipped,
          contract_consistency: skipped,
          baseline_solveability: skipped,
          anti_gaming: skipped,
          score_distribution: skipped,
        },
        overall: "fail",
        generated_at,
      };
    }

    // Gate: code_security — prohibited pattern scan
    codeSecurityResult = checkCodeSecurity(spec.codeFiles!);
    if (!codeSecurityResult.passed) {
      return {
        gates: {
          spec_validity: specValidityResult,
          code_syntax: codeSyntaxResult,
          code_security: codeSecurityResult,
          determinism: { passed: false, details: {}, error: "Skipped — code security failed" },
          contract_consistency: { passed: false, details: {}, error: "Skipped — code security failed" },
          baseline_solveability: { passed: false, details: {}, error: "Skipped — code security failed" },
          anti_gaming: { passed: false, details: {}, error: "Skipped — code security failed" },
          score_distribution: { passed: false, details: {}, error: "Skipped — code security failed" },
        },
        overall: "fail",
        generated_at,
      };
    }

    // Gate: content_safety — harmful content scan (flags, doesn't block)
    contentSafetyResult = checkContentSafety(spec);
  }

  // ── Standard gates (all specs) ─────────────────────────────────────

  // Build module (code or declarative)
  let mod: ChallengeModule;
  try {
    mod = buildModuleForSpec(spec);
  } catch (err) {
    const msg = `Failed to build challenge module: ${err instanceof Error ? err.message : String(err)}`;
    const buildSkipped: GateResult = { passed: false, details: {}, error: `Skipped — ${msg}` };
    return {
      gates: {
        spec_validity: specValidityResult,
        ...(codeSyntaxResult && { code_syntax: codeSyntaxResult }),
        ...(codeSecurityResult && { code_security: codeSecurityResult }),
        ...(contentSafetyResult && { content_safety: contentSafetyResult }),
        determinism: { passed: false, details: {}, error: msg },
        contract_consistency: buildSkipped,
        baseline_solveability: buildSkipped,
        anti_gaming: buildSkipped,
        score_distribution: buildSkipped,
      },
      overall: "fail",
      generated_at,
    };
  }

  // Gate — determinism
  const determinismResult = await checkDeterminism(mod);

  // Gate — contract consistency
  const contractResult = checkContractConsistency(spec);

  // Gate — baseline solveability
  const baselineResult = await checkBaselineSolveability(spec, mod, referenceAnswer);

  // Gate — anti-gaming
  const antiGamingResult = await checkAntiGaming(spec, mod, referenceAnswer);

  // Gate — score distribution (derived)
  const probeResults = (antiGamingResult.details as {
    probe_results?: Array<{ name: string; score: number }>;
  }).probe_results ?? [];
  const probeScores = probeResults.map((p: { name: string; score: number }) => p.score);
  const referenceScore = (baselineResult.details as { score?: number }).score ?? 0;
  const scoreDistResult = checkScoreDistribution(referenceScore, probeScores, spec.scoring.maxScore, spec.difficulty);

  // ── Overall verdict ────────────────────────────────────────────────

  const coreGates = [
    specValidityResult,
    determinismResult,
    contractResult,
    baselineResult,
    antiGamingResult,
    scoreDistResult,
  ];

  if (codeSyntaxResult) coreGates.push(codeSyntaxResult);
  if (codeSecurityResult) coreGates.push(codeSecurityResult);

  const anyFailed = coreGates.some((g) => !g.passed);
  const hasContentSafetyFlags = contentSafetyResult?.details?.requires_admin_review === true;

  let overall: "pass" | "fail" | "warn";
  if (anyFailed) {
    overall = "fail";
  } else if (hasContentSafetyFlags) {
    overall = "warn";
  } else {
    overall = "pass";
  }

  return {
    gates: {
      spec_validity: specValidityResult,
      ...(codeSyntaxResult && { code_syntax: codeSyntaxResult }),
      ...(codeSecurityResult && { code_security: codeSecurityResult }),
      ...(contentSafetyResult && { content_safety: contentSafetyResult }),
      determinism: determinismResult,
      contract_consistency: contractResult,
      baseline_solveability: baselineResult,
      anti_gaming: antiGamingResult,
      score_distribution: scoreDistResult,
    },
    overall,
    generated_at,
  };
}
