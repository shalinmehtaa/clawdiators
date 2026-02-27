import { MAX_SCORE } from "@clawdiators/shared";
import type { ScoringInput, ScoreResult } from "../types.js";
import type { ArchiveGroundTruth } from "./data.js";

const WEIGHTS = { accuracy: 0.45, comprehensiveness: 0.25, speed: 0.15, citations: 0.15 };
const TIME_LIMIT = 300;
const POINTS_PER_QUESTION = 200;

// ── Helpers ──────────────────────────────────────────────────────────

/** Normalize a string for fuzzy comparison. */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

/** Compute word-level overlap ratio between two strings. */
function wordOverlap(submitted: string, truth: string): number {
  const subWords = new Set(normalize(submitted).split(" ").filter(Boolean));
  const truthWords = normalize(truth).split(" ").filter(Boolean);
  if (truthWords.length === 0) return 0;
  let matches = 0;
  for (const w of truthWords) {
    if (subWords.has(w)) matches++;
  }
  return matches / truthWords.length;
}

/** Check how many key terms appear in the submitted answer. */
function keyTermOverlap(submitted: string, keyTerms: string[]): number {
  if (keyTerms.length === 0) return 0;
  const normSubmitted = normalize(submitted);
  let found = 0;
  for (const term of keyTerms) {
    if (normSubmitted.includes(normalize(term))) found++;
  }
  return found / keyTerms.length;
}

// ── Scorer ───────────────────────────────────────────────────────────

export function scoreArchive(input: ScoringInput): ScoreResult {
  const { submission, groundTruth: gt, startedAt, submittedAt } = input;
  const groundTruth = gt as unknown as ArchiveGroundTruth;

  // === Accuracy (0-1000 raw) ===
  // For each question: up to POINTS_PER_QUESTION based on answer quality
  let accuracyRaw = 0;

  for (const truth of groundTruth.answers) {
    const submitted = submission[truth.question_id];
    if (submitted === undefined || submitted === null) continue;

    const submittedText = String(submitted);
    const truthText = truth.answer;

    // Word overlap score (0-1)
    const overlap = wordOverlap(submittedText, truthText);

    // Key term coverage (0-1)
    const termCoverage = keyTermOverlap(submittedText, truth.key_terms);

    // Combined: 60% word overlap + 40% key term coverage
    const questionScore = overlap * 0.6 + termCoverage * 0.4;
    accuracyRaw += Math.round(questionScore * POINTS_PER_QUESTION);
  }

  // Normalize to 0-1000 scale
  const maxAccuracy = groundTruth.answers.length * POINTS_PER_QUESTION;
  accuracyRaw = maxAccuracy > 0 ? Math.round((accuracyRaw / maxAccuracy) * 1000) : 0;

  // === Comprehensiveness (0-1000 raw) ===
  // Check if agent cited evidence (doc_id + page references)
  let comprehensivenessRaw = 0;

  for (const truth of groundTruth.answers) {
    const submittedAnswer = submission[truth.question_id];
    const submittedEvidence = submission[`${truth.question_id}_evidence`];

    if (submittedAnswer === undefined || submittedAnswer === null) continue;

    let evidenceScore = 0;

    if (Array.isArray(submittedEvidence)) {
      // Agent provided structured evidence citations
      const truthDocPages = new Set(
        truth.evidence.map((e) => `${e.doc_id}:${e.page}`)
      );
      let citationMatches = 0;

      for (const cite of submittedEvidence) {
        if (cite && typeof cite === "object") {
          const citeObj = cite as Record<string, unknown>;
          const docId = String(citeObj.doc_id || "");
          const page = Number(citeObj.page ?? -1);
          const key = `${docId}:${page}`;
          if (truthDocPages.has(key)) {
            citationMatches++;
          }
        }
      }

      if (truth.evidence.length > 0) {
        evidenceScore = Math.min(1, citationMatches / truth.evidence.length);
      }
    } else {
      // Check if answer text mentions doc IDs and page numbers
      const answerText = normalize(String(submittedAnswer));
      let mentionedDocs = 0;
      const truthDocs = new Set(truth.evidence.map((e) => e.doc_id));
      for (const docId of truthDocs) {
        if (answerText.includes(normalize(docId))) {
          mentionedDocs++;
        }
      }
      if (truthDocs.size > 0) {
        evidenceScore = (mentionedDocs / truthDocs.size) * 0.7; // Cap at 70% without structured citations
      }
    }

    comprehensivenessRaw += Math.round(evidenceScore * POINTS_PER_QUESTION);
  }

  const maxComprehensiveness = groundTruth.answers.length * POINTS_PER_QUESTION;
  comprehensivenessRaw = maxComprehensiveness > 0
    ? Math.round((comprehensivenessRaw / maxComprehensiveness) * 1000)
    : 0;

  // === Speed (0-1000 raw) ===
  const elapsedSecs = (submittedAt.getTime() - startedAt.getTime()) / 1000;
  const speedRaw = elapsedSecs >= TIME_LIMIT ? 0 : Math.round(1000 * (1 - elapsedSecs / TIME_LIMIT));

  // === Citations (0-1000 raw) ===
  let citationsRaw = 0;
  const answers = Array.isArray(submission.answers) ? submission.answers : [];
  for (const ans of answers) {
    const a = ans as Record<string, unknown>;
    if (a.sources && Array.isArray(a.sources) && (a.sources as unknown[]).length > 0) {
      citationsRaw += 200;
    } else if (typeof a.answer === "string" && /doc[_-]?\d|document/i.test(a.answer as string)) {
      citationsRaw += 100;
    }
  }
  citationsRaw = Math.min(1000, citationsRaw);

  // === Weighted total ===
  const accuracy = Math.round(accuracyRaw * WEIGHTS.accuracy);
  const comprehensiveness = Math.round(comprehensivenessRaw * WEIGHTS.comprehensiveness);
  const speed = Math.round(speedRaw * WEIGHTS.speed);
  const citations = Math.round(citationsRaw * WEIGHTS.citations);
  const total = Math.min(MAX_SCORE, accuracy + comprehensiveness + speed + citations);

  return { breakdown: { accuracy, comprehensiveness, speed, citations, total } };
}
