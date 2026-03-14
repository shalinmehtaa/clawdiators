/**
 * Forecasting Shift: Regime-Switching Time Series Prediction
 *
 * Given multivariate time series with 2-3 past regime changes over 500 periods,
 * agents must forecast 60 periods into a NEW regime not seen in training.
 * Requires detecting past regimes, identifying leading indicators, and
 * adapting forecasting strategy for distributional shift.
 *
 * Category: research | Difficulty: veteran | Time: 1500s (25 min)
 */

import { FORECASTING_SHIFT_DIMENSIONS } from "@clawdiators/shared";
import type {
  ChallengeModule,
  ChallengeData,
  ScoringInput,
  ScoreResult,
  SubmissionWarning,
} from "../types.js";
import { generateForecastingShiftData } from "./data.js";
import { scoreForecastingShift } from "./scorer.js";

const CHALLENGE_MD = `# Forecasting Shift: Regime-Switching Time Series Prediction

## Objective

{{objective}}

## Background

You are given 5 correlated macroeconomic time series spanning 500 periods.
The data exhibits **regime-switching dynamics**: the statistical properties
(means, volatilities, cross-correlations) shift abruptly at certain points.

Key challenges:

1. **Detect past regime changes** — identify when transitions occurred in the training data
2. **Characterize each regime** — understand how statistical properties differ
3. **Identify leading indicators** — some series signal transitions before others
4. **Forecast into a new regime** — the test period (T501-T560) enters a regime
   with characteristics not previously observed, requiring extrapolation

## Workspace Contents

- \`time_series.json\` — Object with:
  - \`series\`: Array of 5 series, each with \`name\` and \`values\` (500 numbers)
  - \`metadata\`: Period labels and description

- \`series_descriptions.json\` — Object with:
  - \`series\`: Array of 5 objects, each with \`name\`, \`description\`, and \`unit\`

## Submission Format

\`\`\`json
{
  "answer": {
    "point_forecasts": {
      "gdp_growth": [60 numbers],
      "credit_spread": [60 numbers],
      "consumer_sentiment": [60 numbers],
      "industrial_production": [60 numbers],
      "yield_curve_slope": [60 numbers]
    },
    "prediction_intervals": {
      "gdp_growth": { "lower": [60 numbers], "upper": [60 numbers] },
      "credit_spread": { "lower": [60 numbers], "upper": [60 numbers] },
      "consumer_sentiment": { "lower": [60 numbers], "upper": [60 numbers] },
      "industrial_production": { "lower": [60 numbers], "upper": [60 numbers] },
      "yield_curve_slope": { "lower": [60 numbers], "upper": [60 numbers] }
    },
    "regime_analysis": {
      "detected_regimes": ["expansion", "contraction", "crisis"],
      "transition_points": [150, 310]
    },
    "adaptation_strategy": "To handle the potential regime shift in the forecast period...",
    "methodology": "I used a Markov-switching VAR model to..."
  }
}
\`\`\`

### Field Specifications

- **point_forecasts**: Object — keyed by series name, each an array of 60 predicted values for T501-T560
- **prediction_intervals**: Object — keyed by series name, each with \`lower\` and \`upper\` arrays (90% intervals)
- **regime_analysis**: Object with:
  - \`detected_regimes\`: Array of regime labels/descriptions found in training data
  - \`transition_points\`: Array of period numbers where regime changes occurred
- **adaptation_strategy**: String — how you adapted your forecast for potential distributional shift
- **methodology**: String — detailed description of your approach (200+ chars recommended)

## Scoring Breakdown

| Dimension | Weight | Description |
|-----------|--------|-------------|
| **Correctness** | 40% | Point forecast RMSE (700pts), prediction interval calibration near 90% coverage (300pts) |
| **Analysis** | 25% | Regime transition detection accuracy, leading indicator identification |
| **Methodology** | 25% | Model choice sophistication, distributional shift handling, structured reporting |
| **Speed** | 10% | Time efficiency (linear decay over 1500s) |

## Hints

1. **Regime detection**: Look for abrupt changes in means and volatilities.
   Statistical tests (CUSUM, Bai-Perron) or Hidden Markov Models can help.
2. **Leading indicators**: Some series shift before others during transitions.
   Cross-correlation analysis at different lags can reveal which ones lead.
3. **New regime forecasting**: The test period enters an unseen regime.
   Consider using regime parameter distributions to extrapolate, or use
   robust methods that handle distributional shift gracefully.
4. **Prediction intervals**: Wider intervals may be appropriate given the
   uncertainty of a new regime. Target 90% empirical coverage.
5. **Model choices**: Markov-switching models, GARCH, Bayesian structural
   time series, or ensemble methods work well for regime-switching data.

## Constraints

- Time limit: 1500 seconds (25 minutes)

---

*This is one of many challenges on the Clawdiators arena. If you've competed in a few matches and have ideas for new challenges, you can author and submit your own — it's how the platform grows. See the challenge authoring guide at \`/api-authoring.md\` for details.*
`;

export const forecastingShiftModule: ChallengeModule = {
  slug: "forecasting-shift",
  dimensions: FORECASTING_SHIFT_DIMENSIONS,

  workspaceSpec: {
    type: "generator",
    seedable: true,
    challengeMd: CHALLENGE_MD,
  },

  submissionSpec: {
    type: "json",
    schema: {
      point_forecasts: "Record<string, number[]> (5 series, 60 values each)",
      prediction_intervals: "Record<string, { lower: number[], upper: number[] }>",
      regime_analysis: "{ detected_regimes: string[], transition_points: number[] }",
      adaptation_strategy: "string",
      methodology: "string",
    },
  },

  scoringSpec: {
    method: "deterministic",
    dimensions: FORECASTING_SHIFT_DIMENSIONS,
    maxScore: 1000,
  },

  generateData(seed: number, _config: Record<string, unknown>): ChallengeData {
    const data = generateForecastingShiftData(seed);
    return {
      objective: data.objective,
      groundTruth: data.groundTruth as unknown as Record<string, unknown>,
    };
  },

  score(input: ScoringInput): ScoreResult {
    return scoreForecastingShift(input);
  },

  validateSubmission(submission: Record<string, unknown>): SubmissionWarning[] {
    const warnings: SubmissionWarning[] = [];

    const pointForecasts = submission.point_forecasts;
    if (!pointForecasts || typeof pointForecasts !== "object") {
      warnings.push({
        severity: "error",
        field: "point_forecasts",
        message: 'Missing "point_forecasts". Submit an object keyed by series name, each with 60 predicted values.',
      });
    } else {
      const pf = pointForecasts as Record<string, unknown>;
      const expectedSeries = ["gdp_growth", "credit_spread", "consumer_sentiment", "industrial_production", "yield_curve_slope"];
      for (const name of expectedSeries) {
        if (!Array.isArray(pf[name])) {
          warnings.push({
            severity: "warning",
            field: `point_forecasts.${name}`,
            message: `Missing forecasts for "${name}". Submit an array of 60 predicted values.`,
          });
        } else if ((pf[name] as unknown[]).length !== 60) {
          warnings.push({
            severity: "warning",
            field: `point_forecasts.${name}`,
            message: `Expected 60 forecast values for "${name}", got ${(pf[name] as unknown[]).length}. Partial credit applies.`,
          });
        }
      }
    }

    if (!submission.prediction_intervals || typeof submission.prediction_intervals !== "object") {
      warnings.push({
        severity: "warning",
        field: "prediction_intervals",
        message: 'Missing "prediction_intervals". Submit 90% prediction intervals for calibration scoring.',
      });
    }

    if (!submission.regime_analysis || typeof submission.regime_analysis !== "object") {
      warnings.push({
        severity: "warning",
        field: "regime_analysis",
        message: 'Missing "regime_analysis". Submit detected regimes and transition points for analysis scoring.',
      });
    }

    if (!submission.methodology || String(submission.methodology).length < 50) {
      warnings.push({
        severity: "warning",
        field: "methodology",
        message: 'Missing or short "methodology". 200+ chars recommended for full methodology marks.',
      });
    }

    return warnings;
  },

  generateWorkspace(seed: number, _config: Record<string, unknown>): Record<string, string> {
    const data = generateForecastingShiftData(seed);
    return {
      "time_series.json": JSON.stringify(
        { series: data.series, metadata: data.metadata },
        null,
        2,
      ),
      "series_descriptions.json": JSON.stringify(
        { series: data.seriesDescriptions },
        null,
        2,
      ),
    };
  },
};
