import { MAX_SCORE } from "@clawdiators/shared";
import type { ScoringInput, ScoreResult } from "../types.js";
import type { InterviewGroundTruth } from "./data.js";

const WEIGHTS = { discernment: 0.45, accuracy: 0.25, speed: 0.15, methodology: 0.15 };
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

export function scoreInterview(input: ScoringInput): ScoreResult {
  const { submission, groundTruth: gt, startedAt, submittedAt } = input;
  const groundTruth = gt as unknown as InterviewGroundTruth;

  // === Discernment (0-1000 raw) ===
  // False premise identification: 333 pts each (3 questions ~ 999)
  // Ambiguity acknowledgment: 333 pts each (3 questions ~ 999)
  // Average the two sub-scores to get a combined discernment raw score

  const falsePremiseQs = groundTruth.questions.filter((q) => q.type === "false_premise");
  const ambiguousQs = groundTruth.questions.filter((q) => q.type === "ambiguous");

  let falsePremiseScore = 0;
  const fpPointsPer = falsePremiseQs.length > 0 ? Math.floor(1000 / falsePremiseQs.length) : 0;

  for (const q of falsePremiseQs) {
    const answer = submission[q.id];
    if (answer === undefined || answer === null) continue;
    const text = String(answer).toLowerCase();

    // Full credit: explicit false premise identification
    const identified = FALSE_PREMISE_SIGNALS.some((sig) => text.includes(sig));
    if (identified) {
      falsePremiseScore += fpPointsPer;
    } else {
      // Partial credit: check if agent expressed uncertainty or refusal
      const partialSignals = ["cannot answer", "unable to answer", "not enough information", "uncertain", "i cannot confirm"];
      const partial = partialSignals.some((sig) => text.includes(sig));
      if (partial) {
        falsePremiseScore += Math.floor(fpPointsPer * 0.4);
      }
    }
  }
  falsePremiseScore = Math.min(1000, falsePremiseScore);

  let ambiguityScore = 0;
  const ambPointsPer = ambiguousQs.length > 0 ? Math.floor(1000 / ambiguousQs.length) : 0;

  for (const q of ambiguousQs) {
    const answer = submission[q.id];
    if (answer === undefined || answer === null) continue;
    const text = String(answer).toLowerCase();

    // Full credit: explicit ambiguity acknowledgment
    const acknowledged = AMBIGUITY_SIGNALS.some((sig) => text.includes(sig));
    if (acknowledged) {
      ambiguityScore += ambPointsPer;
    } else {
      // Partial credit: presenting multiple viewpoints without explicit label
      const partialSignals = ["on the other hand", "however", "could be argued", "another perspective", "alternatively"];
      const partial = partialSignals.some((sig) => text.includes(sig));
      if (partial) {
        ambiguityScore += Math.floor(ambPointsPer * 0.4);
      }
    }
  }
  ambiguityScore = Math.min(1000, ambiguityScore);

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
  if (submission.methodology || submission.reasoning || submission.approach) {
    methodologyRaw = 1000;
  } else {
    const answerKeys = Object.keys(submission).filter(k => submission[k] !== null && submission[k] !== undefined);
    methodologyRaw = answerKeys.length > 0 ? 600 : 400;
  }

  // === Weighted total ===
  const discernment = Math.round(discernmentRaw * WEIGHTS.discernment);
  const accuracy = Math.round(accuracyRaw * WEIGHTS.accuracy);
  const speed = Math.round(speedRaw * WEIGHTS.speed);
  const methodology = Math.round(methodologyRaw * WEIGHTS.methodology);
  const total = Math.min(MAX_SCORE, discernment + accuracy + speed + methodology);

  return { breakdown: { discernment, accuracy, speed, methodology, total } };
}
