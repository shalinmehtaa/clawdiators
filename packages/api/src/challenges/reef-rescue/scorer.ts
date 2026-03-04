/**
 * Reef Rescue Scorer
 *
 * 6 dimensions:
 *   diagnosis_accuracy (25%) — correct root causes for all 3 subsystems
 *   fix_quality        (25%) — code fixes address the actual bugs
 *   migration_correctness (15%) — data migration handles corrupted records
 *   research_depth     (10%) — evidence quality and technical references
 *   postmortem_quality (10%) — incident report completeness
 *   speed              (15%) — time decay over 2700s (45 min)
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ScoringInput, ScoreResult } from "../types.js";

const TIME_LIMIT_SECS = 2700;

// ── Fuzzy Matching Helpers ──────────────────────────────────────────

function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function keywordOverlap(text: string, keywords: string[]): number {
  if (!text || keywords.length === 0) return 0;
  const norm = normalise(text);
  let hits = 0;
  for (const kw of keywords) {
    if (norm.includes(kw.toLowerCase())) hits++;
  }
  return hits / keywords.length;
}

function containsAny(text: string, patterns: string[]): boolean {
  const norm = normalise(text);
  return patterns.some((p) => norm.includes(p.toLowerCase()));
}

// ── Dimension Scorers ───────────────────────────────────────────────

function scoreDiagnosis(
  submission: Record<string, unknown>,
  groundTruth: Record<string, unknown>,
): number {
  const diagnosis = submission.diagnosis as Record<string, { root_cause?: string; evidence?: string[] }> | undefined;
  if (!diagnosis || typeof diagnosis !== "object") return 0;

  const bugs = groundTruth.bugs as Record<string, { keywords: string[]; root_cause: string }>;
  let total = 0;

  // Score each bug diagnosis (0-333 points each, ~1000 total before weighting)
  for (const [bugKey, bugInfo] of Object.entries(bugs)) {
    const agentDiag = diagnosis[bugKey];
    if (!agentDiag || typeof agentDiag !== "object") continue;

    const rootCause = typeof agentDiag.root_cause === "string" ? agentDiag.root_cause : "";
    const evidence = Array.isArray(agentDiag.evidence) ? agentDiag.evidence.join(" ") : "";
    const combined = rootCause + " " + evidence;

    // Keyword overlap with ground truth keywords
    const overlap = keywordOverlap(combined, bugInfo.keywords);

    // Bonus for mentioning the specific file or line
    const fileBonus = containsAny(combined, [
      bugKey === "sensor_pipeline" ? "sensor-ingestion" : "",
      bugKey === "alert_routing" ? "alert-router" : "",
      bugKey === "dashboard_cache" ? "dashboard-api" : "",
    ].filter(Boolean)) ? 0.15 : 0;

    // Bonus for mentioning the commit
    const commitBonus = containsAny(combined, [
      bugKey === "sensor_pipeline" ? "e8d1b4f" : "",
      bugKey === "alert_routing" ? "5c91a0d" : "",
      bugKey === "dashboard_cache" ? "2a4f8c1" : "",
    ].filter(Boolean)) ? 0.1 : 0;

    const bugScore = Math.min(1.0, overlap + fileBonus + commitBonus);
    total += bugScore * 333;
  }

  return Math.min(1000, Math.round(total));
}

function scoreFixQuality(
  submission: Record<string, unknown>,
  groundTruth: Record<string, unknown>,
): number {
  const fixes = submission.fixes as Record<string, string> | undefined;
  if (!fixes || typeof fixes !== "object") return 0;

  const bugs = groundTruth.bugs as Record<string, {
    buggy_line?: string;
    correct_line?: string;
    buggy_pattern?: string;
    correct_pattern?: string;
    buggy_key?: string;
    correct_key?: string;
    keywords: string[];
  }>;

  let total = 0;

  // Bug 1: sensor pipeline fix — should replace buggy conversion
  const sensorFix = fixes.sensor_pipeline_fix ?? fixes.sensor_pipeline ?? "";
  if (typeof sensorFix === "string" && sensorFix.length > 0) {
    const norm = normalise(sensorFix);
    // Must NOT contain the buggy formula (1.8 + 32) pattern for celsius
    const removedBug = !norm.includes("1.8") || norm.includes("remove") || norm.includes("replace");
    // Should contain the correct formula (+ 273.15 without fahrenheit conversion)
    const hasCorrect = sensorFix.includes("+ 273.15") || sensorFix.includes("+273.15");
    // Should reference celsius or toKelvin
    const hasContext = containsAny(sensorFix, ["celsius", "tokelvin", "conversion"]);

    let score = 0;
    if (hasCorrect) score += 0.5;
    if (removedBug) score += 0.3;
    if (hasContext) score += 0.2;
    total += score * 333;
  }

  // Bug 2: alert routing fix — should fix the regex pattern
  const alertFix = fixes.alert_routing_fix ?? fixes.alert_routing ?? "";
  if (typeof alertFix === "string" && alertFix.length > 0) {
    const hasLowercase = containsAny(alertFix, ["zone-[a-z]", "lowercase", "/i", "case-insensitive", "tolowercase"]);
    const removesUppercase = containsAny(alertFix, ["zone-[a-z]"]) || !alertFix.includes("ZONE-[A-Z]");
    const hasContext = containsAny(alertFix, ["regex", "pattern", "routing", "zone"]);

    let score = 0;
    if (hasLowercase) score += 0.5;
    if (removesUppercase) score += 0.3;
    if (hasContext) score += 0.2;
    total += score * 333;
  }

  // Bug 3: dashboard cache fix — should include metric in cache key
  const cacheFix = fixes.dashboard_cache_fix ?? fixes.dashboard_cache ?? "";
  if (typeof cacheFix === "string" && cacheFix.length > 0) {
    const hasMetricInKey = containsAny(cacheFix, [
      "${metric}", "-${metric}", "metric", "temperature", "salinity",
    ]);
    const fixesCacheKey = containsAny(cacheFix, [
      "station-${stationid}-${metric}", "cachekey", "cache_key", "key =",
    ]);
    const hasContext = containsAny(cacheFix, ["cache", "key", "overwrite", "collision"]);

    let score = 0;
    if (hasMetricInKey) score += 0.5;
    if (fixesCacheKey) score += 0.3;
    if (hasContext) score += 0.2;
    total += score * 333;
  }

  return Math.min(1000, Math.round(total));
}

function scoreMigration(
  submission: Record<string, unknown>,
  groundTruth: Record<string, unknown>,
): number {
  const migration = submission.migration;
  if (!migration || typeof migration !== "string" || migration.length < 10) return 0;

  const corruptedCount = groundTruth.corrupted_count as number;
  const correctValues = groundTruth.correct_values as Record<string, number>;

  // Try to execute the migration as JavaScript against the corrupted data
  let executionScore = 0;
  let dir: string | undefined;

  try {
    dir = mkdtempSync(join(tmpdir(), "reef-rescue-migration-"));

    // Write the test harness
    const harness = `
const correctValues = ${JSON.stringify(correctValues)};
const corruptedIds = ${JSON.stringify(Object.keys(correctValues))};

// Agent's migration function
${migration}

// Test: if the migration exports or defines a function, call it
let results = {};
if (typeof migrate === "function") {
  results = migrate(correctValues, corruptedIds);
} else if (typeof fixTemperatures === "function") {
  results = fixTemperatures(correctValues, corruptedIds);
} else if (typeof run === "function") {
  results = run(correctValues, corruptedIds);
}

// Output results
console.log(JSON.stringify({
  hasFunction: typeof migrate === "function" || typeof fixTemperatures === "function" || typeof run === "function",
  resultCount: Object.keys(results).length,
}));
`;
    writeFileSync(join(dir, "test.js"), harness, "utf-8");

    try {
      const output = execFileSync("node", ["test.js"], {
        cwd: dir,
        timeout: 5000,
        maxBuffer: 1024 * 1024,
        encoding: "utf-8",
      });

      const parsed = JSON.parse(output.trim());
      if (parsed.hasFunction) executionScore += 300;
      if (parsed.resultCount > 0) executionScore += 200;
    } catch {
      // Execution failed — still score on static analysis below
    }
  } finally {
    if (dir) {
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }

  // Static analysis of the migration text
  let staticScore = 0;

  // References the conversion formula
  if (containsAny(migration, ["273.15", "kelvin"])) staticScore += 150;
  // References the source unit filter
  if (containsAny(migration, ["celsius", "source_unit"])) staticScore += 150;
  // References the reverse operation (undoing the bug)
  if (containsAny(migration, ["1.8", "32", "fahrenheit", "reverse", "undo"])) staticScore += 100;
  // SQL-style migration
  if (containsAny(migration, ["UPDATE", "SET", "WHERE", "sensor_readings"])) staticScore += 100;

  return Math.min(1000, executionScore + staticScore);
}

function scoreResearchDepth(submission: Record<string, unknown>): number {
  // Score based on technical depth across all text fields
  const allText = [
    getNestedString(submission, "diagnosis.sensor_pipeline.root_cause"),
    getNestedString(submission, "diagnosis.sensor_pipeline.evidence"),
    getNestedString(submission, "diagnosis.alert_routing.root_cause"),
    getNestedString(submission, "diagnosis.alert_routing.evidence"),
    getNestedString(submission, "diagnosis.dashboard_cache.root_cause"),
    getNestedString(submission, "diagnosis.dashboard_cache.evidence"),
    getNestedString(submission, "postmortem.summary"),
    getNestedString(submission, "postmortem.action_items"),
  ].join(" ");

  if (!allText.trim()) return 0;

  let score = 0;

  // Technical depth indicators
  const technicalTerms = [
    "unit conversion", "kelvin", "celsius", "fahrenheit",
    "regex", "case-sensitive", "case-insensitive", "pattern matching",
    "cache key", "cache invalidation", "cache collision", "ttl",
    "data corruption", "data migration", "rollback",
    "git log", "commit", "refactor", "regression",
    "monitoring", "observability", "alert fatigue",
  ];
  const termHits = technicalTerms.filter((t) =>
    allText.toLowerCase().includes(t),
  ).length;
  score += Math.min(500, termHits * 50);

  // Evidence of systematic investigation
  const investigationTerms = [
    "logs show", "error rate", "metrics indicate",
    "git blame", "git log", "commit history",
    "cross-reference", "correlation", "timeline",
    "root cause", "contributing factor", "cascading",
  ];
  const investHits = investigationTerms.filter((t) =>
    allText.toLowerCase().includes(t),
  ).length;
  score += Math.min(500, investHits * 60);

  return Math.min(1000, score);
}

function scorePostmortem(submission: Record<string, unknown>): number {
  const postmortem = submission.postmortem as Record<string, unknown> | undefined;
  if (!postmortem || typeof postmortem !== "object") return 0;

  let score = 0;

  // Has a summary
  const summary = typeof postmortem.summary === "string" ? postmortem.summary : "";
  if (summary.length > 50) score += 200;
  else if (summary.length > 20) score += 100;

  // Summary references all 3 subsystems
  if (containsAny(summary, ["sensor", "ingestion", "temperature"])) score += 50;
  if (containsAny(summary, ["alert", "routing", "zone"])) score += 50;
  if (containsAny(summary, ["dashboard", "cache"])) score += 50;

  // Has a timeline
  const timeline = typeof postmortem.timeline === "string" ? postmortem.timeline : "";
  if (timeline.length > 30) score += 150;
  // Timeline references dates/commits
  if (containsAny(timeline, ["2026-02", "commit", "deployed", "introduced"])) score += 50;

  // Has action items
  const actionItems = postmortem.action_items;
  if (Array.isArray(actionItems) && actionItems.length > 0) {
    score += Math.min(250, actionItems.length * 80);
    // Quality: action items reference prevention
    const itemText = actionItems.join(" ");
    if (containsAny(itemText, ["test", "ci", "lint", "review", "monitoring"])) score += 100;
  } else if (typeof actionItems === "string" && actionItems.length > 30) {
    score += 150;
  }

  return Math.min(1000, score);
}

function scoreSpeed(startedAt: Date, submittedAt: Date): number {
  const elapsed = (submittedAt.getTime() - startedAt.getTime()) / 1000;
  if (elapsed <= 0) return 1000;
  if (elapsed >= TIME_LIMIT_SECS) return 0;
  return Math.round(Math.max(0, (1 - elapsed / TIME_LIMIT_SECS)) * 1000);
}

// ── Helpers ─────────────────────────────────────────────────────────

function getNestedString(obj: unknown, path: string): string {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return "";
    current = (current as Record<string, unknown>)[part];
  }
  if (Array.isArray(current)) return current.join(" ");
  return typeof current === "string" ? current : "";
}

// ── Main Scorer ─────────────────────────────────────────────────────

export function scoreReefRescue(input: ScoringInput): ScoreResult {
  const { submission, groundTruth, startedAt, submittedAt } = input;
  const sub = (submission ?? {}) as Record<string, unknown>;
  const gt = (groundTruth ?? {}) as Record<string, unknown>;

  const diagnosis = scoreDiagnosis(sub, gt);
  const fixQuality = scoreFixQuality(sub, gt);
  const migration = scoreMigration(sub, gt);
  const researchDepth = scoreResearchDepth(sub);
  const postmortQuality = scorePostmortem(sub);
  const speed = scoreSpeed(startedAt, submittedAt);

  // Merge research_depth (10%) + postmortem_quality (10%) into methodology (20%)
  const methodologyRaw = Math.round(researchDepth * (0.10 / 0.20) + postmortQuality * (0.10 / 0.20));

  // Apply weights: 0.25, 0.25, 0.15, 0.20, 0.15
  const breakdown = {
    correctness: Math.round(diagnosis * 0.25),
    code_quality: Math.round(fixQuality * 0.25),
    completeness: Math.round(migration * 0.15),
    methodology: Math.round(methodologyRaw * 0.20),
    speed: Math.round(speed * 0.15),
    total: 0,
  };

  breakdown.total = Object.entries(breakdown)
    .filter(([k]) => k !== "total")
    .reduce((sum, [, v]) => sum + v, 0);

  return { breakdown };
}
