import type { ScoringInput, ScoreResult } from "../types.js";
import type { ArchaeologyGroundTruth } from "./data.js";
import { computeWeightedTotal } from "../evaluator.js";
import { CODEBASE_ARCHAEOLOGY_DIMENSIONS } from "@clawdiators/shared";

export function scoreArchaeology(input: ScoringInput): ScoreResult {
  const { submission, groundTruth: gt, startedAt, submittedAt } = input;
  const truth = gt as unknown as ArchaeologyGroundTruth;

  const raw: Record<string, number> = {};

  // ── Bug Identification (0-1000) ────────────────────────────────
  let identScore = 0;

  // Check if they identified the correct commit
  const submittedCommit = String(submission.buggy_commit ?? submission.commit ?? "").toLowerCase().trim();
  const truthCommit = truth.buggy_commit_message.toLowerCase();

  // Accept commit hash or message match
  if (submittedCommit && (
    truthCommit.includes(submittedCommit) ||
    submittedCommit.includes(truthCommit) ||
    submittedCommit === String(truth.buggy_commit_index)
  )) {
    identScore += 500;
  }

  // Check bug description
  const submittedDesc = String(submission.bug_description ?? submission.root_cause ?? "").toLowerCase();
  const truthDesc = truth.bug_description.toLowerCase();
  if (submittedDesc.length > 10) {
    // Partial credit for describing the bug
    const keywords = truthDesc.split(/\s+/).filter(w => w.length > 3);
    const matches = keywords.filter(w => submittedDesc.includes(w));
    identScore += Math.round((matches.length / Math.max(keywords.length, 1)) * 500);
  }

  raw.identification = Math.min(1000, identScore);

  // ── Fix Quality (0-1000) ───────────────────────────────────────
  let fixScore = 0;
  const submittedFix = String(submission.fixed_code ?? submission.fix ?? "").trim();

  if (submittedFix.length > 0) {
    // Check if the fix contains the correct function
    const correctBody = truth.correct_function_body;
    // Normalize whitespace for comparison
    const normFix = submittedFix.replace(/\s+/g, " ").trim();
    const normCorrect = correctBody.replace(/\s+/g, " ").trim();

    if (normFix === normCorrect) {
      fixScore = 1000;
    } else if (normFix.includes(truth.function_name)) {
      // Partial credit: they at least have the right function
      fixScore += 300;

      // Check for key differences between buggy and correct
      // Each correct pattern gets additional credit
      const correctPatterns = extractKeyPatterns(correctBody);
      const matchCount = correctPatterns.filter(p => normFix.includes(p)).length;
      fixScore += Math.round((matchCount / Math.max(correctPatterns.length, 1)) * 700);
    }
  }

  raw.fix_quality = Math.min(1000, fixScore);

  // ── Speed (0-1000) ─────────────────────────────────────────────
  const elapsed = (submittedAt.getTime() - startedAt.getTime()) / 1000;
  const timeLimit = 600;
  raw.speed = Math.max(0, Math.round(1000 * (1 - elapsed / timeLimit)));

  // ── Methodology (0-1000) ───────────────────────────────────────
  // Points for structured approach indicators in submission
  let methScore = 0;
  const methodology = String(submission.methodology ?? submission.approach ?? "").toLowerCase();
  if (methodology.length > 20) methScore += 200;
  if (methodology.includes("bisect") || methodology.includes("binary search")) methScore += 300;
  if (methodology.includes("test") || methodology.includes("failing")) methScore += 200;
  if (methodology.includes("diff") || methodology.includes("commit")) methScore += 200;
  if (submission.buggy_commit) methScore += 100;

  raw.methodology = Math.min(1000, methScore);

  const breakdown = computeWeightedTotal(raw, CODEBASE_ARCHAEOLOGY_DIMENSIONS);
  return { breakdown };
}

function extractKeyPatterns(code: string): string[] {
  // Extract meaningful tokens from correct code for fuzzy matching
  const normalized = code.replace(/\s+/g, " ");
  const tokens = normalized.match(/[a-zA-Z_]+\s*[+\-*/]=?\s*[a-zA-Z_0-9.]+/g) || [];
  return tokens.map(t => t.replace(/\s+/g, " ").trim());
}
