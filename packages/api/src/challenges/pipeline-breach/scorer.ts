/**
 * PIPELINE BREACH — Supply Chain Attack Forensics — Scorer
 *
 * Evaluates six dimensions:
 *   attack_vector    (20%) — correct attack type ID + evidence quality
 *   blast_radius     (20%) — accuracy of identified affected services (Jaccard + transitives)
 *   remediation      (25%) — correct remediation actions taken in correct priority order
 *   remediation_script (15%) — automated remediation script quality
 *   forensic_depth   (10%) — evidence of investigating build logs, artifacts, network traffic
 *   security_advisory (10%) — structured advisory with timeline, impact, recommendations
 */

import type { ScoringInput, ScoreResult } from "../types.js";
import type { PipelineBreachGroundTruth, MicroserviceId } from "./data.js";

// ── Scoring helpers ───────────────────────────────────────────────────

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = [...setA].filter((x) => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

// ── Attack Vector Scoring (max 1000 -> weighted to 200) ──────────────

function scoreAttackVector(
  submission: Record<string, unknown>,
  gt: PipelineBreachGroundTruth,
): number {
  const submittedId = String(submission.attack_vector ?? "").trim().toLowerCase().replace(/-/g, "_");
  const correctId = gt.attackVectorId.toLowerCase().replace(/-/g, "_");

  const idCorrect = submittedId === correctId;

  // Evidence quality: does the explanation reference the correct signals?
  const evidence = String(submission.attack_evidence ?? "").toLowerCase();
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

  // Check compromised_package identification
  const submittedPkg = String(submission.compromised_package ?? "").toLowerCase();
  const packageCorrect =
    submittedPkg.includes(gt.compromisedPackage.toLowerCase()) ||
    combined.includes(gt.compromisedPackage.toLowerCase());
  const packageBonus = packageCorrect ? 0.15 : 0;

  // Red herring penalty
  const redHerringMentioned = submittedId.includes(gt.redHerring.service.replace("-", "_"));
  const redHerringPenalty = !idCorrect && redHerringMentioned ? 0.5 : 1.0;

  if (idCorrect) {
    return Math.round((0.6 + 0.25 * evidenceScore + packageBonus) * 1000 * redHerringPenalty);
  } else {
    return Math.round(evidenceScore * 0.2 * 1000 * redHerringPenalty);
  }
}

// ── Blast Radius Scoring (max 1000 -> weighted to 200) ───────────────

function scoreBlastRadius(
  submission: Record<string, unknown>,
  gt: PipelineBreachGroundTruth,
): number {
  const submitted = Array.isArray(submission.blast_radius)
    ? (submission.blast_radius as unknown[]).map((x) => String(x).toLowerCase().replace(/_/g, "-"))
    : [];

  const expected = gt.fullBlastRadius.map((s) => s.toLowerCase());

  if (submitted.length === 0) {
    // Check advisory for mentions
    const advisory = String(submission.security_advisory ?? "").toLowerCase();
    const mentioned = expected.filter((s) => advisory.includes(s.replace(/-/g, " ")) || advisory.includes(s));
    return Math.round((mentioned.length / expected.length) * 0.4 * 1000);
  }

  // Jaccard overlap for set accuracy
  const overlap = jaccard(submitted, expected);

  // Bonus for correctly identifying direct vs transitive
  let transitiveBonus = 1.0;
  const directlyAffected = gt.affectedServices.map((s) => s.toLowerCase());
  const transitives = gt.transitiveVictims.map((s) => s.toLowerCase());
  const submittedDirect = submitted.filter((s) => directlyAffected.includes(s));
  const submittedTransitive = submitted.filter((s) => transitives.includes(s));
  if (submittedDirect.length === directlyAffected.length && submittedTransitive.length > 0) {
    transitiveBonus = 1.15; // Reward for finding the transitive impact
  }

  // Penalty for including the red herring
  const hasRedHerring = submitted.includes(gt.redHerring.service.toLowerCase());
  const redHerringPenalty = hasRedHerring ? 0.8 : 1.0;

  // Penalty for claiming everything is affected (anti-gaming)
  const overclaimPenalty = submitted.length > expected.length * 2 ? 0.5 : 1.0;

  const rawScore = overlap * transitiveBonus * redHerringPenalty * overclaimPenalty;
  return Math.min(1000, Math.round(rawScore * 1000));
}

// ── Remediation Scoring (max 1000 -> weighted to 250) ────────────────

interface RemediationAction {
  service?: string;
  action?: string;
  params?: Record<string, unknown>;
  result?: string;
}

interface PipelineMetrics {
  remediation_completeness?: number;
  secrets_rotated?: number;
  services_rebuilt?: number;
  scoring_summary?: {
    action_completion_rate?: number;
    blast_radius_resolved?: boolean;
    fully_remediated?: boolean;
  };
}

function scoreRemediation(
  submission: Record<string, unknown>,
  gt: PipelineBreachGroundTruth,
  liveMetrics?: PipelineMetrics,
): number {
  const actions = submission.remediation_actions_taken;
  if (!Array.isArray(actions) || actions.length === 0) {
    // Check advisory for remediation mentions
    const advisory = String(submission.security_advisory ?? "").toLowerCase();
    const anyRemediationMentioned = gt.remediationSequence.some((step) =>
      advisory.includes(step.action.toLowerCase().replace(/_/g, " ")) ||
      advisory.includes(step.action.toLowerCase()),
    );
    return anyRemediationMentioned ? 100 : 0;
  }

  const submitted = (actions as RemediationAction[]).map((a) => ({
    service: String(a.service ?? "").toLowerCase().replace(/_/g, "-"),
    action: String(a.action ?? "").toLowerCase(),
  }));

  const expected = gt.remediationSequence.map((s) => ({
    service: s.service.toLowerCase(),
    action: s.action.toLowerCase(),
  }));

  let totalScore = 0;
  const maxPerAction = 1000 / expected.length;

  for (let i = 0; i < expected.length; i++) {
    const exp = expected[i];
    const foundIdx = submitted.findIndex(
      (s) => s.action === exp.action || (s.service === exp.service && s.action.includes(exp.action.split("_")[0])),
    );

    if (foundIdx === -1) continue;

    // Priority ordering: security-critical actions should come first
    const positionBonus = Math.abs(foundIdx - i) <= 1 ? 1.0 : 0.6;
    const sub = submitted[foundIdx] as RemediationAction;
    const resultOk = !sub.result || String(sub.result).toLowerCase().includes("success") || String(sub.result).toLowerCase().includes("ok");
    const resultBonus = resultOk ? 1.0 : 0.7;

    totalScore += maxPerAction * positionBonus * resultBonus;
  }

  // Bonus: secrets rotated for all affected services
  const secretRotations = submitted.filter((s) => s.action.includes("rotate") || s.action.includes("secret") || s.action.includes("revoke"));
  const secretBonus = secretRotations.length >= 2 ? 1.1 : 1.0;

  const selfReportedScore = Math.min(1000, Math.round(totalScore * secretBonus));

  // Blend with live service metrics when available
  if (liveMetrics) {
    const completeness = liveMetrics.remediation_completeness ?? 0;
    const actionRate = liveMetrics.scoring_summary?.action_completion_rate ?? 0;
    const liveScore = Math.round(Math.min(1, completeness * 0.7 + actionRate * 0.3) * 1000);
    return Math.round(liveScore * 0.6 + selfReportedScore * 0.4);
  }

  return selfReportedScore;
}

// ── Remediation Script Scoring (max 1000 -> weighted to 150) ─────────

function scoreRemediationScript(
  submission: Record<string, unknown>,
  gt: PipelineBreachGroundTruth,
): number {
  const code = String(submission.remediation_script ?? submission.script ?? "");
  if (code.length < 100) return 0;

  const lower = code.toLowerCase();
  let score = 0;

  // 1. Contains correct service IDs (20%)
  const serviceHits = gt.fullBlastRadius.filter(
    (sid) => lower.includes(sid.replace("-", "_")) || lower.includes(sid),
  ).length;
  score += (serviceHits / gt.fullBlastRadius.length) * 200;

  // 2. Contains correct action names (20%)
  const actionHits = gt.remediationSequence.filter((step) =>
    lower.includes(step.action.toLowerCase()) || lower.includes(step.action.toLowerCase().replace(/_/g, "-")),
  ).length;
  score += (actionHits / gt.remediationSequence.length) * 200;

  // 3. Secret rotation logic present (20%)
  const hasSecretRotation =
    lower.includes("rotate") || lower.includes("revoke") ||
    lower.includes("secret") || lower.includes("credential") ||
    lower.includes("token") || lower.includes("key_rotation");
  if (hasSecretRotation) score += 200;

  // 4. Error handling present (15%)
  const hasErrorHandling =
    lower.includes("try:") || lower.includes("except") || lower.includes("try {") ||
    lower.includes("catch") || lower.includes("raise") || lower.includes("if err");
  if (hasErrorHandling) score += 150;

  // 5. Verification step (e.g. rebuild and scan) (15%)
  const hasVerification =
    lower.includes("verify") || lower.includes("rebuild") ||
    lower.includes("scan") || lower.includes("audit") ||
    lower.includes("check") || lower.includes("validate");
  if (hasVerification) score += 150;

  // 6. Structure quality (10%)
  const isStructured =
    (lower.includes("def ") || lower.includes("function ") || lower.includes("func ")) &&
    (lower.includes("main") || lower.includes("remediate") || lower.includes("step")) &&
    lower.split("\n").length > 15;
  if (isStructured) score += 100;

  return Math.min(1000, Math.round(score));
}

// ── Forensic Depth Scoring (max 1000 -> weighted to 100) ─────────────

function scoreForensicDepth(
  submission: Record<string, unknown>,
  gt: PipelineBreachGroundTruth,
): number {
  const combined = [
    submission.methodology ?? "",
    submission.security_advisory ?? "",
    submission.attack_evidence ?? "",
  ]
    .map(String)
    .join(" ")
    .toLowerCase();

  let score = 0;

  // 1. Specific indicator references (35%)
  const indicatorHits = Object.values(gt.indicators).filter((ind) => {
    const keywords = ind.toLowerCase().split(/[\s,;]+/).filter((w) => w.length > 5);
    return keywords.some((kw) => combined.includes(kw));
  }).length;
  score += (indicatorHits / Object.keys(gt.indicators).length) * 350;

  // 2. Multi-source investigation (35%)
  const sourceKeywords = [
    "build log", "artifact", "network", "dependency", "lockfile", "checksum",
    "registry", "ci secret", "pipeline", "manifest", "sbom", "audit",
  ];
  const sourceHits = sourceKeywords.filter((kw) => combined.includes(kw)).length;
  score += Math.min(350, (sourceHits / sourceKeywords.length) * 350);

  // 3. Documentation reference (30%)
  const docPatterns = [
    "runbook", "documentation", "procedure", "policy", "framework",
    "nist", "slsa", "sigstore", "supply chain", "cve",
  ];
  const docHits = docPatterns.filter((p) => combined.includes(p)).length;
  score += Math.min(300, docHits * 60);

  return Math.min(1000, Math.round(score));
}

// ── Security Advisory Scoring (max 1000 -> weighted to 100) ──────────

function scoreSecurityAdvisory(
  submission: Record<string, unknown>,
  gt: PipelineBreachGroundTruth,
): number {
  const advisory = String(submission.security_advisory ?? "").toLowerCase();
  if (advisory.length < 200) return 0;

  let score = 0;

  // Required sections (40%)
  const sections = [
    "executive summary", "attack vector", "impact", "timeline",
    "affected", "remediation", "recommendation", "prevention",
    "indicator", "ioc",
  ];
  const sectionHits = sections.filter((s) => advisory.includes(s)).length;
  score += (sectionHits / sections.length) * 400;

  // Correct service mentions (30%)
  const serviceMentions = gt.fullBlastRadius.filter(
    (sid) => advisory.includes(sid.replace("-", " ")) || advisory.includes(sid),
  ).length;
  score += (serviceMentions / gt.fullBlastRadius.length) * 300;

  // Actionable recommendations (30%)
  const actionKeywords = [
    "pin", "hash", "sha", "lockfile", "sbom", "audit", "scan",
    "rotate", "revoke", "monitor", "alert", "review", "verify",
    "immutable", "signature", "provenance",
  ];
  const actionHits = actionKeywords.filter((kw) => advisory.includes(kw)).length;
  score += Math.min(300, actionHits * 25);

  // Red herring callout bonus
  const rhService = gt.redHerring.service.replace("-", " ");
  if (advisory.includes(rhService) && (advisory.includes("unrelated") || advisory.includes("not affected") || advisory.includes("false positive") || advisory.includes("red herring"))) {
    score += 100;
  }

  return Math.min(1000, Math.round(score));
}

// ── Main Scorer ───────────────────────────────────────────────────────

export function scorePipelineBreach(input: ScoringInput): ScoreResult {
  const gt = input.groundTruth as unknown as PipelineBreachGroundTruth;
  const sub = input.submission;

  const liveMetrics = input.serviceMetrics?.["pipeline-api"] as PipelineMetrics | undefined;

  const attackVectorRaw = scoreAttackVector(sub, gt);           // 0-1000
  const blastRadiusRaw = scoreBlastRadius(sub, gt);             // 0-1000
  const remediationRaw = scoreRemediation(sub, gt, liveMetrics); // 0-1000
  const remScriptRaw = scoreRemediationScript(sub, gt);         // 0-1000
  const forensicRaw = scoreForensicDepth(sub, gt);              // 0-1000
  const advisoryRaw = scoreSecurityAdvisory(sub, gt);           // 0-1000

  // Merge blast_radius (20%) + remediation (25%) into completeness (45%)
  const completenessRaw = Math.round(blastRadiusRaw * (0.20 / 0.45) + remediationRaw * (0.25 / 0.45));
  // Merge forensic_depth (10%) + security_advisory (10%) into methodology (20%)
  const methodologyRaw = Math.round(forensicRaw * (0.10 / 0.20) + advisoryRaw * (0.10 / 0.20));

  // Apply dimension weights
  const correctness = Math.round(attackVectorRaw * 0.20);
  const completeness = Math.round(completenessRaw * 0.45);
  const code_quality = Math.round(remScriptRaw * 0.15);
  const methodology = Math.round(methodologyRaw * 0.20);

  const total = correctness + completeness + code_quality + methodology;

  return {
    breakdown: {
      correctness,
      completeness,
      code_quality,
      methodology,
      total: Math.min(1000, total),
    },
  };
}
