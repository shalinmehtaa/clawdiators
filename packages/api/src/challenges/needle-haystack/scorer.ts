import type { ScoringInput, ScoreResult } from "../types.js";
import type { HaystackGroundTruth } from "./data.js";
import { computeWeightedTotal } from "../evaluator.js";
import { NEEDLE_HAYSTACK_DIMENSIONS } from "@clawdiators/shared";

export function scoreHaystack(input: ScoringInput): ScoreResult {
  const { submission, groundTruth: gt, startedAt, submittedAt } = input;
  const truth = gt as unknown as HaystackGroundTruth;

  const raw: Record<string, number> = {};
  const submittedAnswers = (submission.answers ?? []) as Array<{
    question_id: number;
    answer: string;
    sources?: string[];
  }>;

  // ── Accuracy (0-1000) ──────────────────────────────────────────
  let correctCount = 0;
  let partialCredit = 0;

  for (const truthAnswer of truth.answers) {
    const submitted = submittedAnswers.find(a => a.question_id === truthAnswer.question_id);
    if (!submitted) continue;

    const normSubmitted = String(submitted.answer).toLowerCase().trim();
    const normTruth = truthAnswer.answer.toLowerCase().trim();

    if (normSubmitted === normTruth) {
      correctCount++;
    } else {
      // Partial credit: check if the answer contains key parts
      const truthParts = normTruth.split(/[,;]/).map(p => p.trim()).filter(Boolean);
      const matchedParts = truthParts.filter(part => normSubmitted.includes(part));
      if (matchedParts.length > 0) {
        partialCredit += matchedParts.length / truthParts.length;
      }
    }
  }

  const totalQuestions = truth.answers.length;
  raw.accuracy = Math.round(((correctCount + partialCredit * 0.5) / totalQuestions) * 1000);

  // ── Citation Quality (0-1000) ──────────────────────────────────
  let citationScore = 0;
  let citationsGiven = 0;

  for (const truthAnswer of truth.answers) {
    const submitted = submittedAnswers.find(a => a.question_id === truthAnswer.question_id);
    if (!submitted?.sources || submitted.sources.length === 0) continue;
    citationsGiven++;

    const truthSources = truthAnswer.source_files.map(s => s.toLowerCase());
    const submittedSources = submitted.sources.map(s => s.toLowerCase().replace(/^documents\//, ""));

    // Check overlap
    const correct = submittedSources.filter(s =>
      truthSources.some(ts => ts.includes(s) || s.includes(ts))
    );
    if (correct.length > 0) {
      citationScore += correct.length / Math.max(truthSources.length, submittedSources.length);
    }
  }

  raw.citations = citationsGiven > 0
    ? Math.round((citationScore / totalQuestions) * 1000)
    : 0;

  // ── Speed (0-1000) ─────────────────────────────────────────────
  const elapsed = (submittedAt.getTime() - startedAt.getTime()) / 1000;
  const timeLimit = 900;
  raw.speed = Math.max(0, Math.round(1000 * (1 - elapsed / timeLimit)));

  // ── Completeness (0-1000) ──────────────────────────────────────
  const answeredCount = submittedAnswers.filter(a =>
    a.answer && String(a.answer).trim().length > 0
  ).length;
  raw.completeness = Math.round((answeredCount / totalQuestions) * 1000);

  const breakdown = computeWeightedTotal(raw, NEEDLE_HAYSTACK_DIMENSIONS);
  return { breakdown };
}
