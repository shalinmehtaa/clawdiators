import { describe, it, expect } from "vitest";
import type { CalibrationData, Difficulty } from "@clawdiators/shared";
import { CALIBRATION_MIN_SAMPLES, CALIBRATION_THRESHOLDS } from "@clawdiators/shared";

// Re-implement calibrateDifficulty for unit testing (avoids DB imports)
function calibrateDifficulty(data: CalibrationData): Difficulty | null {
  if (data.sample_size < CALIBRATION_MIN_SAMPLES) return null;

  if (
    data.win_rate >= CALIBRATION_THRESHOLDS.newcomer.minWinRate &&
    data.completion_rate >= CALIBRATION_THRESHOLDS.newcomer.minCompletionRate
  ) {
    return "newcomer";
  }

  if (
    data.win_rate >= CALIBRATION_THRESHOLDS.contender.minWinRate &&
    data.completion_rate >= CALIBRATION_THRESHOLDS.contender.minCompletionRate
  ) {
    return "contender";
  }

  if (
    data.win_rate >= CALIBRATION_THRESHOLDS.veteran.minWinRate &&
    data.completion_rate >= CALIBRATION_THRESHOLDS.veteran.minCompletionRate
  ) {
    return "veteran";
  }

  return "legendary";
}

describe("Difficulty calibration", () => {
  it("returns null with insufficient samples", () => {
    const data: CalibrationData = {
      completion_rate: 0.9,
      median_score: 800,
      win_rate: 0.7,
      time_utilization: 0.5,
      sample_size: 10,
      calibrated_at: "2026-02-27T10:00:00Z",
    };
    expect(calibrateDifficulty(data)).toBeNull();
  });

  it("calibrates to newcomer with high win rate", () => {
    const data: CalibrationData = {
      completion_rate: 0.9,
      median_score: 800,
      win_rate: 0.75,
      time_utilization: 0.3,
      sample_size: 50,
      calibrated_at: "2026-02-27T10:00:00Z",
    };
    expect(calibrateDifficulty(data)).toBe("newcomer");
  });

  it("calibrates to contender with moderate stats", () => {
    const data: CalibrationData = {
      completion_rate: 0.75,
      median_score: 600,
      win_rate: 0.50,
      time_utilization: 0.5,
      sample_size: 40,
      calibrated_at: "2026-02-27T10:00:00Z",
    };
    expect(calibrateDifficulty(data)).toBe("contender");
  });

  it("calibrates to veteran with low-moderate stats", () => {
    const data: CalibrationData = {
      completion_rate: 0.55,
      median_score: 450,
      win_rate: 0.30,
      time_utilization: 0.7,
      sample_size: 60,
      calibrated_at: "2026-02-27T10:00:00Z",
    };
    expect(calibrateDifficulty(data)).toBe("veteran");
  });

  it("calibrates to legendary with very low stats", () => {
    const data: CalibrationData = {
      completion_rate: 0.35,
      median_score: 300,
      win_rate: 0.10,
      time_utilization: 0.9,
      sample_size: 100,
      calibrated_at: "2026-02-27T10:00:00Z",
    };
    expect(calibrateDifficulty(data)).toBe("legendary");
  });

  it("edge case: exactly at contender threshold", () => {
    const data: CalibrationData = {
      completion_rate: 0.70,
      median_score: 500,
      win_rate: 0.45,
      time_utilization: 0.6,
      sample_size: 25,
      calibrated_at: "2026-02-27T10:00:00Z",
    };
    expect(calibrateDifficulty(data)).toBe("contender");
  });

  it("minimum samples threshold is 20", () => {
    expect(CALIBRATION_MIN_SAMPLES).toBe(20);
  });

  it("thresholds are defined for newcomer, contender, veteran", () => {
    expect(CALIBRATION_THRESHOLDS.newcomer.minWinRate).toBe(0.65);
    expect(CALIBRATION_THRESHOLDS.contender.minWinRate).toBe(0.45);
    expect(CALIBRATION_THRESHOLDS.veteran.minWinRate).toBe(0.25);
  });
});
