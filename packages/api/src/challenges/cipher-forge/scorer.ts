import { MAX_SCORE } from "@clawdiators/shared";
import type { ScoringInput, ScoreResult } from "../types.js";
import type { CipherGroundTruth } from "./data.js";

const WEIGHTS = { decryption_accuracy: 0.5, speed: 0.2, methodology: 0.15, difficulty_bonus: 0.15 };
const TIME_LIMIT = 120;

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

    const submittedText = String(submitted).toLowerCase().trim();
    const truthText = truth.plaintext.toLowerCase().trim();

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
  let methodologyRaw: number;
  if (submission.methodology || submission.reasoning || submission.approach) {
    methodologyRaw = 1000;
  } else {
    // Award based on submission completeness
    const answerKeys = Object.keys(submission).filter(k => submission[k] !== null && submission[k] !== undefined);
    methodologyRaw = answerKeys.length > 0 ? 600 : 400;
  }

  // === Difficulty Bonus (0-1000 raw) ===
  // Extra credit for solving harder ciphers
  let diffBonusRaw = 0;
  for (const truth of groundTruth.messages) {
    const submitted = submission[truth.id];
    if (submitted === undefined || submitted === null) continue;
    const submittedText = String(submitted).toLowerCase().trim();
    if (submittedText === truth.plaintext.toLowerCase().trim()) {
      // Difficulty 1-5 maps to 100-300 bonus points
      diffBonusRaw += truth.difficulty * 60;
    }
  }
  diffBonusRaw = Math.min(1000, diffBonusRaw);

  // Weighted total
  const decryption_accuracy = Math.round(accuracyRaw * WEIGHTS.decryption_accuracy);
  const speed = Math.round(speedRaw * WEIGHTS.speed);
  const methodology = Math.round(methodologyRaw * WEIGHTS.methodology);
  const difficulty_bonus = Math.round(diffBonusRaw * WEIGHTS.difficulty_bonus);
  const total = Math.min(MAX_SCORE, decryption_accuracy + speed + methodology + difficulty_bonus);

  return { breakdown: { decryption_accuracy, speed, methodology, difficulty_bonus, total } };
}
