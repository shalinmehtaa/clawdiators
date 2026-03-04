/**
 * LIGHTHOUSE Incident Response — Scorer
 *
 * Evaluates six dimensions:
 *   root_cause    (20%) — exact match on root cause ID + evidence quality
 *   recovery      (30%) — how many recovery actions were correct and in right order
 *   failure_chain (15%) — Jaccard overlap of identified vs actual failure chain
 *   recovery_script (20%) — static analysis: ordering, idempotency, error handling
 *   research_breadth (10%) — evidence of consulting documentation/runbook
 *   incident_report (5%) — structured, complete, actionable report
 */

import type { ScoringInput, ScoreResult } from "../types.js";
import type { LighthouseGroundTruth, SubsystemId } from "./data.js";

// ── Scoring helpers ───────────────────────────────────────────────────

function timeDecay(startedAt: Date, submittedAt: Date, timeLimitSecs: number): number {
  const elapsedSecs = (submittedAt.getTime() - startedAt.getTime()) / 1000;
  return Math.max(0, 1 - elapsedSecs / timeLimitSecs);
}

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = [...setA].filter((x) => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

// ── Root Cause Scoring (max 1000 → weighted to 200) ──────────────────

function scoreRootCause(
  submission: Record<string, unknown>,
  gt: LighthouseGroundTruth,
): number {
  const submittedId = String(submission.root_cause ?? "").trim().toLowerCase().replace(/-/g, "_");
  const correctId = gt.rootCauseId.toLowerCase().replace(/-/g, "_");

  // Base: exact match on root cause ID (0 or 1)
  const idCorrect = submittedId === correctId;

  // Evidence quality: does the explanation reference the correct log signals or DB signals?
  const evidence = String(submission.root_cause_evidence ?? submission.evidence ?? "").toLowerCase();
  const methodology = String(submission.methodology ?? "").toLowerCase();
  const combined = evidence + " " + methodology;

  let signalHits = 0;
  for (const sig of gt.logSignals) {
    if (combined.includes(sig.toLowerCase())) signalHits++;
  }
  for (const sig of Object.values(gt.dbSignals)) {
    const keywords = sig.toLowerCase().split(/[\s=>()]+/).filter((w) => w.length > 4);
    if (keywords.some((kw) => combined.includes(kw))) signalHits++;
  }
  const maxSignals = gt.logSignals.length + Object.keys(gt.dbSignals).length;
  const evidenceScore = Math.min(1, signalHits / Math.max(1, maxSignals * 0.5));

  // Penalize red herring confusion: if wrong root cause is submitted but red herring subsystem mentioned as root
  const redHerringMentioned = submittedId.includes(gt.redHerring.subsystem.replace("-", "_"));
  const redHerringPenalty = !idCorrect && redHerringMentioned ? 0.5 : 1.0;

  if (idCorrect) {
    // Correct: full base + evidence bonus
    return Math.round((0.7 + 0.3 * evidenceScore) * 1000 * redHerringPenalty);
  } else {
    // Wrong: only evidence quality can earn partial points
    return Math.round(evidenceScore * 0.25 * 1000 * redHerringPenalty);
  }
}

// ── Recovery Scoring (max 1000 → weighted to 300) ────────────────────

interface RecoveryAction {
  subsystem?: string;
  action?: string;
  result?: string;
}

interface LighthouseMetrics {
  recovery_completeness?: number;
  out_of_order_penalty?: number;
  scoring_summary?: {
    action_completion_rate?: number;
    chain_resolved?: boolean;
    fully_resolved?: boolean;
  };
}

/**
 * Score recovery dimension.
 *
 * When live service metrics are available (lighthouse-api /metrics), we blend:
 *   60% — actual recovery state observed by the service (ground truth)
 *   40% — self-reported actions quality (agent's submission)
 *
 * Without metrics (local dev, metrics fetch failed) falls back to 100%
 * self-reported scoring so local testing still works correctly.
 */
function scoreRecovery(
  submission: Record<string, unknown>,
  gt: LighthouseGroundTruth,
  liveMetrics?: LighthouseMetrics,
): number {
  const actions = submission.recovery_actions_taken;
  if (!Array.isArray(actions) || actions.length === 0) {
    // Check if they described recovery in the report at least
    const report = String(submission.incident_report ?? "").toLowerCase();
    const anyRecoveryMentioned = gt.recoverySequence.some((step) =>
      report.includes(step.action.toLowerCase().replace(/_/g, " ")) ||
      report.includes(step.action.toLowerCase()),
    );
    return anyRecoveryMentioned ? 100 : 0;
  }

  const submitted = (actions as RecoveryAction[]).map((a) => ({
    subsystem: String(a.subsystem ?? "").toLowerCase().replace(/_/g, "-"),
    action: String(a.action ?? "").toLowerCase(),
  }));

  const expected = gt.recoverySequence.map((s) => ({
    subsystem: s.subsystem.toLowerCase(),
    action: s.action.toLowerCase(),
  }));

  // Score each expected action: correct action + correct position
  let totalScore = 0;
  const maxPerAction = 1000 / expected.length;

  for (let i = 0; i < expected.length; i++) {
    const exp = expected[i];
    // Find this action anywhere in submitted
    const foundIdx = submitted.findIndex(
      (s) => s.action === exp.action || (s.subsystem === exp.subsystem && s.action.includes(exp.action.split("_")[0])),
    );

    if (foundIdx === -1) continue;

    // Full credit for correct position, partial for any position
    const positionBonus = Math.abs(foundIdx - i) <= 1 ? 1.0 : 0.6;
    // Check if the result was success (if reported)
    const sub = submitted[foundIdx] as RecoveryAction & { result?: string };
    const resultOk = !sub.result || String(sub.result).toLowerCase().includes("success") || String(sub.result).toLowerCase().includes("ok");
    const resultBonus = resultOk ? 1.0 : 0.7;

    totalScore += maxPerAction * positionBonus * resultBonus;
  }

  // Bonus if they recovered subsystems in correct dependency order
  const correctOrderBonus = verifyRecoveryOrder(submitted, expected, gt.failureChain) ? 1.1 : 1.0;

  const selfReportedScore = Math.min(1000, Math.round(totalScore * correctOrderBonus));

  // Blend with live service metrics when available.
  // The service tracks actual completed actions server-side, making it
  // much harder to game by fabricating recovery_actions_taken in the submission.
  if (liveMetrics) {
    const completeness = liveMetrics.recovery_completeness ?? 0;
    const actionRate = liveMetrics.scoring_summary?.action_completion_rate ?? 0;
    const oooP = liveMetrics.out_of_order_penalty ?? 1;
    // Live score: how much of the failure chain was actually resolved, adjusted
    // for out-of-order penalty (issuing actions in wrong order degrades recovery)
    const liveScore = Math.round(Math.min(1, completeness * 0.7 + actionRate * 0.3) * oooP * 1000);
    return Math.round(liveScore * 0.6 + selfReportedScore * 0.4);
  }

  return selfReportedScore;
}

function verifyRecoveryOrder(
  submitted: Array<{ subsystem: string; action: string }>,
  expected: Array<{ subsystem: string; action: string }>,
  failureChain: SubsystemId[],
): boolean {
  if (submitted.length < 2) return false;
  // Check that submitted actions respect the failure chain resolution order (reverse order)
  const expectedOrder = [...failureChain].reverse();
  let lastIdx = -1;
  let correct = 0;
  for (const action of submitted) {
    const chainIdx = expectedOrder.indexOf(action.subsystem as SubsystemId);
    if (chainIdx === -1) continue;
    if (chainIdx >= lastIdx) { correct++; lastIdx = chainIdx; }
  }
  return correct >= Math.ceil(submitted.length * 0.6);
}

// ── Failure Chain Scoring (max 1000 → weighted to 150) ───────────────

function scoreFailureChain(
  submission: Record<string, unknown>,
  gt: LighthouseGroundTruth,
): number {
  const submitted = Array.isArray(submission.failure_chain)
    ? (submission.failure_chain as unknown[]).map((x) => String(x).toLowerCase().replace(/_/g, "-"))
    : [];

  const expected = gt.failureChain.map((s) => s.toLowerCase());

  if (submitted.length === 0) {
    // Check incident_report for chain mentions
    const report = String(submission.incident_report ?? "").toLowerCase();
    const mentioned = expected.filter((s) => report.includes(s.replace(/-/g, " ")) || report.includes(s));
    return Math.round((mentioned.length / expected.length) * 0.4 * 1000);
  }

  // Jaccard overlap for set accuracy
  const overlap = jaccard(submitted, expected);

  // Order bonus: is the submitted chain in the right propagation order?
  let orderBonus = 1.0;
  if (submitted.length >= 2) {
    let orderedCount = 0;
    for (let i = 0; i < Math.min(submitted.length, expected.length); i++) {
      if (submitted[i] === expected[i]) orderedCount++;
    }
    orderBonus = 0.7 + 0.3 * (orderedCount / Math.max(1, Math.min(submitted.length, expected.length)));
  }

  // Check they didn't confuse the red herring subsystem as part of the chain
  const hasRedHerring = submitted.includes(gt.redHerring.subsystem.toLowerCase());
  const redHerringPenalty = hasRedHerring ? 0.75 : 1.0;

  const rawScore = overlap * orderBonus * redHerringPenalty;
  return Math.round(rawScore * 1000);
}

// ── Recovery Script Scoring (max 1000 → weighted to 200) ─────────────

function scoreRecoveryScript(
  submission: Record<string, unknown>,
  gt: LighthouseGroundTruth,
): number {
  const code = String(submission.recovery_script ?? submission.script ?? "");
  if (code.length < 100) return 0;

  const lower = code.toLowerCase();
  let score = 0;

  // 1. Contains correct subsystem IDs (25%)
  const subsystemHits = gt.failureChain.filter((sid) => lower.includes(sid.replace("-", "_")) || lower.includes(sid)).length;
  score += (subsystemHits / gt.failureChain.length) * 250;

  // 2. Contains correct action names (25%)
  const actionHits = gt.recoverySequence.filter((step) =>
    lower.includes(step.action.toLowerCase()) || lower.includes(step.action.toLowerCase().replace(/_/g, "-")),
  ).length;
  score += (actionHits / gt.recoverySequence.length) * 250;

  // 3. Error handling present (20%)
  const hasErrorHandling =
    lower.includes("try:") || lower.includes("except") || lower.includes("try {") ||
    lower.includes("catch") || lower.includes("raise") || lower.includes(".get(") ||
    lower.includes("if response") || lower.includes("if result");
  if (hasErrorHandling) score += 200;

  // 4. Idempotency markers (15%)
  const hasIdempotency =
    lower.includes("retry") || lower.includes("idempotent") ||
    lower.includes("already") || lower.includes("check") ||
    lower.includes("if.*status") || lower.includes("skip") ||
    (lower.includes("get") && lower.includes("post"));
  if (hasIdempotency) score += 150;

  // 5. Structure quality (15%)
  const isStructured =
    (lower.includes("def ") || lower.includes("function ")) &&
    (lower.includes("main") || lower.includes("recover") || lower.includes("step")) &&
    lower.split("\n").length > 20;
  if (isStructured) score += 100;

  // Bonus: correct Python shebang or imports
  if (code.startsWith("#!/usr/bin/env python") || code.includes("import requests") || code.includes("import httpx")) {
    score += 50;
  }

  return Math.min(1000, Math.round(score));
}

// ── Research Breadth Scoring (max 1000 → weighted to 100) ────────────

function scoreResearchBreadth(
  submission: Record<string, unknown>,
  gt: LighthouseGroundTruth,
): number {
  const combined = [
    submission.methodology ?? "",
    submission.incident_report ?? "",
    submission.root_cause_evidence ?? "",
    submission.failure_chain_reasoning ?? "",
  ]
    .map(String)
    .join(" ")
    .toLowerCase();

  let score = 0;

  // 1. Runbook reference (40%) — did they look up the right runbook?
  const runbookKeywords = gt.runbook.split("/").filter((p) => p.length > 3);
  const runbookHit = runbookKeywords.some((kw) => combined.includes(kw));
  if (runbookHit) score += 400;

  // 2. Documentation URLs mentioned (30%)
  const docPatterns = ["/docs/", "runbook", "documentation", "https://docs", "architecture", "manual", "procedures"];
  const docHits = docPatterns.filter((p) => combined.includes(p)).length;
  score += Math.min(300, docHits * 75);

  // 3. Methodology demonstrates multi-source synthesis (30%)
  const sourceKeywords = ["log", "database", "api", "mcp", "query", "metrics", "history", "event", "topology"];
  const sourceHits = sourceKeywords.filter((kw) => combined.includes(kw)).length;
  score += Math.min(300, (sourceHits / sourceKeywords.length) * 300);

  return Math.min(1000, Math.round(score));
}

// ── Incident Report Scoring (max 1000 → weighted to 50) ──────────────

function scoreIncidentReport(
  submission: Record<string, unknown>,
  gt: LighthouseGroundTruth,
): number {
  const report = String(submission.incident_report ?? "").toLowerCase();
  if (report.length < 200) return 0;

  let score = 0;

  // Required sections (50%)
  const sections = [
    "executive summary", "root cause", "impact", "recovery", "timeline",
    "remediation", "prevention", "recommendation",
  ];
  const sectionHits = sections.filter((s) => report.includes(s)).length;
  score += (sectionHits / sections.length) * 500;

  // Correct subsystem mentions (30%)
  const chainMentions = gt.failureChain.filter((sid) => report.includes(sid.replace("-", " ")) || report.includes(sid)).length;
  score += (chainMentions / gt.failureChain.length) * 300;

  // Actionable recommendations (20%)
  const actionKeywords = ["prevent", "automat", "monitor", "alert", "quota", "rotation", "schedule", "review", "threshold"];
  const actionHits = actionKeywords.filter((kw) => report.includes(kw)).length;
  score += Math.min(200, actionHits * 30);

  // Red herring callout: explicitly noting what isn't the cause (bonus)
  const rhSubsystem = gt.redHerring.subsystem.replace("-", " ");
  if (report.includes(rhSubsystem) && (report.includes("unrelated") || report.includes("not the cause") || report.includes("false positive") || report.includes("red herring"))) {
    score += 100; // can push above 1000, capped below
  }

  return Math.min(1000, Math.round(score));
}

// ── Main Scorer ───────────────────────────────────────────────────────

export function scoreLighthouse(input: ScoringInput): ScoreResult {
  const gt = input.groundTruth as unknown as LighthouseGroundTruth;
  const sub = input.submission;

  // Extract live metrics from the lighthouse-api service (if fetched at submit time)
  const liveMetrics = input.serviceMetrics?.["lighthouse-api"] as LighthouseMetrics | undefined;

  const rootCauseRaw = scoreRootCause(sub, gt);                    // 0-1000
  const recoveryRaw = scoreRecovery(sub, gt, liveMetrics);          // 0-1000
  const failureChainRaw = scoreFailureChain(sub, gt);      // 0-1000
  const recoveryScriptRaw = scoreRecoveryScript(sub, gt);  // 0-1000
  const researchRaw = scoreResearchBreadth(sub, gt);       // 0-1000
  const reportRaw = scoreIncidentReport(sub, gt);          // 0-1000

  // Merge research_breadth (10%) + incident_report (5%) into methodology (15%)
  const methodologyRaw = Math.round(researchRaw * (0.10 / 0.15) + reportRaw * (0.05 / 0.15));

  // Apply dimension weights
  const correctness = Math.round(rootCauseRaw * 0.20);
  const completeness = Math.round(recoveryRaw * 0.30);
  const analysis = Math.round(failureChainRaw * 0.15);
  const code_quality = Math.round(recoveryScriptRaw * 0.20);
  const methodology = Math.round(methodologyRaw * 0.15);

  const total = correctness + completeness + analysis + code_quality + methodology;

  return {
    breakdown: {
      correctness,
      completeness,
      analysis,
      code_quality,
      methodology,
      total: Math.min(1000, total),
    },
  };
}
