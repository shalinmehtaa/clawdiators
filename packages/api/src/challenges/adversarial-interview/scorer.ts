import { MAX_SCORE } from "@clawdiators/shared";
import type { ScoringInput, ScoreResult } from "../types.js";
import type { InterviewGroundTruth } from "./data.js";

const WEIGHTS = { correctness: 0.55, precision: 0.25, speed: 0.1, methodology: 0.1 };
const TIME_LIMIT = 180;

// Keywords that indicate the agent recognised a false premise
const FALSE_PREMISE_SIGNALS = [
  "false premise", "incorrect assumption", "false assumption",
  "not accurate", "not true", "no record", "no evidence",
  "no mention", "no reference", "no stated", "no connection",
  "no documentation", "premise is false", "premise is incorrect",
  "incorrectly assumes", "wrongly assumes", "mistaken assumption",
  "not supported", "unsupported assumption",
];

// Keywords that indicate the agent recognised ambiguity
const AMBIGUITY_SIGNALS = [
  "ambiguous", "subjective", "depends on", "matter of perspective",
  "multiple interpretations", "no single answer", "no definitive answer",
  "open to interpretation", "debatable", "it depends",
  "no objectively correct", "no clear answer", "normative",
  "unclear", "cannot be determined objectively",
  "not enough information to judge", "both interpretations",
];

const GENERIC_SIGNAL_TERMS = new Set([
  "false premise", "ambiguous", "subjective", "depends", "perspective",
  "no single answer", "no definitive answer", "no clear answer", "normative",
  "not enough information", "no stated connection", "no connection", "no mention",
  "not before", "not 30", "not 3", "not 5", "not 9", "not 15", "not 80", "not 1,200",
]);

function contentTermRatio(text: string, keyTerms: string[]): number {
  const contentTerms = keyTerms.filter((t) => !GENERIC_SIGNAL_TERMS.has(t.toLowerCase().trim()));
  if (contentTerms.length === 0) return 0;
  let matched = 0;
  for (const term of contentTerms) {
    if (text.includes(term.toLowerCase())) matched++;
  }
  return matched / contentTerms.length;
}

export function scoreInterview(input: ScoringInput): ScoreResult {
  const { submission, groundTruth: gt, startedAt, submittedAt } = input;
  const groundTruth = gt as unknown as InterviewGroundTruth;

  // === Discernment (0-1000 raw) ===
  // Must both classify correctly (false premise vs ambiguous) and provide supporting content.

  const falsePremiseQs = groundTruth.questions.filter((q) => q.type === "false_premise");
  const ambiguousQs = groundTruth.questions.filter((q) => q.type === "ambiguous");

  let falsePremiseScore = 0;
  const fpPointsPer = falsePremiseQs.length > 0 ? 1000 / falsePremiseQs.length : 0;

  for (const q of falsePremiseQs) {
    const answer = submission[q.id];
    if (answer === undefined || answer === null) continue;
    const text = String(answer).toLowerCase();

    const falseCue = FALSE_PREMISE_SIGNALS.some((sig) => text.includes(sig));
    const ambigCue = AMBIGUITY_SIGNALS.some((sig) => text.includes(sig));
    const supportRatio = contentTermRatio(text, q.key_terms);
    const classScore = falseCue ? 0.45 : ambigCue ? 0.1 : 0;
    const totalScore = classScore + 0.55 * supportRatio;
    falsePremiseScore += fpPointsPer * Math.min(1, totalScore);
  }
  falsePremiseScore = Math.min(1000, Math.round(falsePremiseScore));

  let ambiguityScore = 0;
  const ambPointsPer = ambiguousQs.length > 0 ? 1000 / ambiguousQs.length : 0;

  for (const q of ambiguousQs) {
    const answer = submission[q.id];
    if (answer === undefined || answer === null) continue;
    const text = String(answer).toLowerCase();

    const ambigCue = AMBIGUITY_SIGNALS.some((sig) => text.includes(sig));
    const falseCue = FALSE_PREMISE_SIGNALS.some((sig) => text.includes(sig));
    const supportRatio = contentTermRatio(text, q.key_terms);
    const classScore = ambigCue ? 0.45 : falseCue ? 0.1 : 0;
    const totalScore = classScore + 0.55 * supportRatio;
    ambiguityScore += ambPointsPer * Math.min(1, totalScore);
  }
  ambiguityScore = Math.min(1000, Math.round(ambiguityScore));

  // Average false premise and ambiguity sub-scores
  const discernmentRaw = Math.round((falsePremiseScore + ambiguityScore) / 2);

  // === Accuracy (0-1000 raw) ===
  // Only straightforward questions count — 250 pts each for 4 questions
  const straightforwardQs = groundTruth.questions.filter((q) => q.type === "straightforward");
  let accuracyRaw = 0;
  const accPointsPer = straightforwardQs.length > 0 ? Math.floor(1000 / straightforwardQs.length) : 0;

  for (const q of straightforwardQs) {
    const answer = submission[q.id];
    if (answer === undefined || answer === null) continue;
    const text = String(answer).toLowerCase();

    // Check how many key terms appear in the answer
    let matched = 0;
    for (const term of q.key_terms) {
      if (text.includes(term.toLowerCase())) {
        matched++;
      }
    }

    if (q.key_terms.length > 0) {
      const ratio = matched / q.key_terms.length;
      accuracyRaw += Math.round(accPointsPer * ratio);
    }
  }
  accuracyRaw = Math.min(1000, accuracyRaw);

  // === Speed (0-1000 raw) ===
  const elapsedSecs = (submittedAt.getTime() - startedAt.getTime()) / 1000;
  const speedRaw = elapsedSecs >= TIME_LIMIT ? 0 : Math.round(1000 * (1 - elapsedSecs / TIME_LIMIT));

  // === Methodology (0-1000 raw) ===
  let methodologyRaw: number;
  const methodText = [submission.methodology, submission.reasoning, submission.approach]
    .find((v) => typeof v === "string" && v.trim().length > 0);
  if (typeof methodText === "string" && methodText.trim().length >= 60) {
    methodologyRaw = 1000;
  } else if (typeof methodText === "string") {
    methodologyRaw = 300;
  } else {
    methodologyRaw = 0;
  }

  // === Weighted total ===
  const correctness = Math.round(discernmentRaw * WEIGHTS.correctness);
  const precision = Math.round(accuracyRaw * WEIGHTS.precision);
  const speed = Math.round(speedRaw * WEIGHTS.speed);
  const methodology = Math.round(methodologyRaw * WEIGHTS.methodology);
  const total = Math.min(MAX_SCORE, correctness + precision + speed + methodology);

  return { breakdown: { correctness, precision, speed, methodology, total } };
}
