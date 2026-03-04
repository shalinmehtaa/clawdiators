import { MAX_SCORE } from "@clawdiators/shared";
import type { ScoringInput, ScoreResult } from "../types.js";
import type { CipherGroundTruth } from "./data.js";

const WEIGHTS = { correctness: 0.65, speed: 0.20, methodology: 0.15 };
const TIME_LIMIT = 120;

/** Strip trailing padding 'x' characters added by columnar transposition. */
function stripTrailingPadding(text: string): string {
  return text.replace(/x+$/, "");
}

export function scoreCipher(input: ScoringInput): ScoreResult {
  const { submission, groundTruth: gt, startedAt, submittedAt } = input;
  const groundTruth = gt as unknown as CipherGroundTruth;

  // === Decryption Accuracy (0-1000 raw) ===
  // Each message is worth points based on difficulty
  const difficultyPoints = [0, 100, 150, 200, 250, 300]; // index = difficulty
  let accuracyRaw = 0;
  let maxAccuracy = 0;

  for (const truth of groundTruth.messages) {
    const points = difficultyPoints[truth.difficulty] || 200;
    maxAccuracy += points;

    const submitted = submission[truth.id];
    if (submitted === undefined || submitted === null) continue;

    let submittedText = String(submitted).toLowerCase().trim();
    let truthText = truth.plaintext.toLowerCase().trim();

    // Transposition ciphers: strip trailing padding 'x' from both sides
    if (truth.cipher_type === "transposition") {
      submittedText = stripTrailingPadding(submittedText);
      truthText = stripTrailingPadding(truthText);
    }

    if (submittedText === truthText) {
      accuracyRaw += points;
    } else {
      // Partial credit: check word overlap
      const subWords = submittedText.split(/\s+/);
      const truthWords = truthText.split(/\s+/);
      let matchCount = 0;
      for (const w of subWords) {
        if (truthWords.includes(w)) matchCount++;
      }
      if (truthWords.length > 0) {
        accuracyRaw += Math.round(points * 0.5 * (matchCount / truthWords.length));
      }
    }
  }

  accuracyRaw = maxAccuracy > 0 ? Math.round((accuracyRaw / maxAccuracy) * 1000) : 0;

  // === Speed (0-1000 raw) ===
  const elapsedSecs = (submittedAt.getTime() - startedAt.getTime()) / 1000;
  const speedRaw = elapsedSecs >= TIME_LIMIT ? 0 : Math.round(1000 * (1 - elapsedSecs / TIME_LIMIT));

  // === Methodology (0-1000 raw) ===
  const methodText = [submission.methodology, submission.reasoning, submission.approach]
    .find((v) => typeof v === "string" && v.trim().length > 0);
  let methodologyRaw: number;
  if (typeof methodText === "string" && methodText.trim().length >= 40) {
    methodologyRaw = 1000;
  } else if (typeof methodText === "string") {
    methodologyRaw = 300;
  } else {
    // Award based on submission completeness
    const answerKeys = Object.keys(submission).filter(k => submission[k] !== null && submission[k] !== undefined);
    methodologyRaw = answerKeys.length > 0 ? 600 : 400;
  }

  // === Difficulty Bonus (0-1000 raw) ===
  // Extra credit for solving harder ciphers, normalized so perfect = 1000
  let diffBonusEarned = 0;
  const diffBonusMax = groundTruth.messages.reduce((s, m) => s + m.difficulty, 0);
  for (const truth of groundTruth.messages) {
    const submitted = submission[truth.id];
    if (submitted === undefined || submitted === null) continue;
    let submittedText = String(submitted).toLowerCase().trim();
    let truthText = truth.plaintext.toLowerCase().trim();
    if (truth.cipher_type === "transposition") {
      submittedText = stripTrailingPadding(submittedText);
      truthText = stripTrailingPadding(truthText);
    }
    if (submittedText === truthText) {
      diffBonusEarned += truth.difficulty;
    }
  }
  const diffBonusRaw = diffBonusMax > 0 ? Math.round((diffBonusEarned / diffBonusMax) * 1000) : 0;

  // Merge decryption accuracy and difficulty bonus into single correctness raw score
  const correctnessRaw = Math.round(accuracyRaw * (0.50 / 0.65) + diffBonusRaw * (0.15 / 0.65));

  // Weighted total
  const correctness = Math.round(correctnessRaw * WEIGHTS.correctness);
  const speed = Math.round(speedRaw * WEIGHTS.speed);
  const methodology = Math.round(methodologyRaw * WEIGHTS.methodology);
  const total = Math.min(MAX_SCORE, correctness + speed + methodology);

  return { breakdown: { correctness, speed, methodology, total } };
}
