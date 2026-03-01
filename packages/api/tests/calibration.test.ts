import { describe, it, expect } from "vitest";
import { calibrateDifficulty } from "../src/services/calibration.js";
import { CALIBRATION_MIN_SAMPLES, CALIBRATION_THRESHOLDS } from "@clawdiators/shared";
import type { CalibrationData } from "@clawdiators/shared";

function makeData(overrides: Partial<CalibrationData> = {}): CalibrationData {
  return {
    completion_rate: 0.7,
    median_score: 600,
    win_rate: 0.45,
    time_utilization: 0.5,
    sample_size: 50,
    calibrated_at: "2026-02-27T10:00:00Z",
    ...overrides,
  };
}

describe("calibrateDifficulty()", () => {
  it("returns null with insufficient samples", () => {
    expect(calibrateDifficulty(makeData({ sample_size: CALIBRATION_MIN_SAMPLES - 1 }))).toBeNull();
  });

  it("returns non-null at the minimum sample threshold", () => {
    expect(calibrateDifficulty(makeData({ sample_size: CALIBRATION_MIN_SAMPLES }))).not.toBeNull();
  });

  it("calibrates to newcomer with high win rate and completion rate", () => {
    expect(
      calibrateDifficulty(makeData({ win_rate: 0.75, completion_rate: 0.9 })),
    ).toBe("newcomer");
  });

  it("calibrates to contender with moderate stats", () => {
    expect(
      calibrateDifficulty(makeData({ win_rate: 0.50, completion_rate: 0.75 })),
    ).toBe("contender");
  });

  it("calibrates to veteran with low-moderate stats", () => {
    expect(
      calibrateDifficulty(makeData({ win_rate: 0.30, completion_rate: 0.55 })),
    ).toBe("veteran");
  });

  it("calibrates to legendary when below all thresholds", () => {
    expect(
      calibrateDifficulty(makeData({ win_rate: 0.10, completion_rate: 0.35 })),
    ).toBe("legendary");
  });

  it("uses win_rate threshold — just below newcomer picks contender (if completion qualifies)", () => {
    // Just below newcomer win rate threshold
    const result = calibrateDifficulty(makeData({
      win_rate: CALIBRATION_THRESHOLDS.newcomer.minWinRate - 0.01,
      completion_rate: CALIBRATION_THRESHOLDS.newcomer.minCompletionRate,
    }));
    expect(result).not.toBe("newcomer");
  });

  it("uses completion_rate threshold — below newcomer completion picks lower tier", () => {
    const result = calibrateDifficulty(makeData({
      win_rate: CALIBRATION_THRESHOLDS.newcomer.minWinRate,
      completion_rate: CALIBRATION_THRESHOLDS.newcomer.minCompletionRate - 0.01,
    }));
    expect(result).not.toBe("newcomer");
  });

  it("CALIBRATION_MIN_SAMPLES constant is 20", () => {
    expect(CALIBRATION_MIN_SAMPLES).toBe(20);
  });

  it("thresholds are in descending order: newcomer > contender > veteran", () => {
    expect(CALIBRATION_THRESHOLDS.newcomer.minWinRate).toBeGreaterThan(
      CALIBRATION_THRESHOLDS.contender.minWinRate,
    );
    expect(CALIBRATION_THRESHOLDS.contender.minWinRate).toBeGreaterThan(
      CALIBRATION_THRESHOLDS.veteran.minWinRate,
    );
  });
});
