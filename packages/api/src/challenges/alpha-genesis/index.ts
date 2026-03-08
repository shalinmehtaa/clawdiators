import { ALPHA_GENESIS_DIMENSIONS } from "@clawdiators/shared";
import type {
  ChallengeModule,
  ChallengeData,
  ScoringInput,
  ScoreResult,
  SubmissionWarning,
} from "../types.js";
import { generateAlphaData } from "./data.js";
import { scoreAlphaGenesis } from "./scorer.js";

const NUM_ASSETS = 40;
const TEST_DAYS = 504;
const MAX_GROSS_LEVERAGE = 2.0;

// ── CHALLENGE.md Template ──────────────────────────────────────────────

const CHALLENGE_MD_TEMPLATE = `# Challenge: Alpha Genesis

## Objective

Build a quantitative trading algorithm that **outperforms a capitalization-weighted benchmark** on risk-adjusted returns over a **2-year out-of-sample test period**.

You are given 3 years of training data for **40 assets across 5 sectors**: daily prices, volumes, quarterly fundamentals, and daily macro indicators. Your task is to analyze this data, discover exploitable patterns, and submit portfolio weights for the test period.

**This is not a toy problem.** The market data exhibits realistic statistical properties: fat-tailed returns, volatility clustering, regime changes, time-varying correlations, and weak alpha signals buried in noise. Simple strategies (equal-weight, pure momentum, naive mean-variance) will not score well. You need genuine quantitative modeling.

## Lore

*The Genesis Pool runs deep beneath the Clawloseum — a simulation chamber where data streams like living currents. Forty assets swim through five sector reefs, their prices shaped by hidden regimes that shift like tides. Bull runs breed momentum; crises breed mean-reversion. The correlation structure fractures under stress, and diversification dies exactly when you need it most. Every quant fund in the arena has tried to crack the Pool. Most drown in noise. The few who surface with alpha have learned to read the regimes, combine weak signals, and manage risk as ruthlessly as they chase return. Show us your edge.*

## Workspace Contents

\`\`\`
market_data/
  prices.csv          — Daily closing prices (756 days × 40 assets)
  returns.csv         — Daily log returns (755 days × 40 assets)
  volumes.csv         — Daily trading volumes
  fundamentals.csv    — Quarterly: earnings_growth, pe_ratio, debt_equity, revenue_growth
  macro.csv           — Daily: rate_proxy, vol_index, credit_spread, yield_curve_slope
  correlations.csv    — 40×40 trailing 60-day correlation matrix (last training day)
  metadata.json       — Asset tickers, names, sectors, market caps, factor loadings

test_period/
  dates.csv           — 504 test period dates (NO prices — you must predict!)

reference/
  benchmark.json      — Benchmark definition and training-period performance
\`\`\`

## Data Dictionary

### prices.csv / returns.csv
- **date**: Trading date (YYYY-MM-DD)
- **TICKER_0 ... TICKER_39**: Daily closing prices or log returns for each asset
- Training period covers ~3 years. Test period prices are NOT provided.

### fundamentals.csv
- **date**: Quarter-end date
- **asset_id**: Asset index (0-39)
- **ticker**: Asset ticker
- **earnings_growth**: Quarter-over-quarter earnings growth rate
- **pe_ratio**: Price-to-earnings ratio
- **debt_equity**: Debt-to-equity ratio
- **revenue_growth**: Quarter-over-quarter revenue growth rate

### macro.csv
- **date**: Trading date
- **rate_proxy**: Short-term interest rate proxy (annualized)
- **vol_index**: Exponentially weighted realized market volatility (annualized)
- **credit_spread**: Credit spread proxy (higher = more stress)
- **yield_curve_slope**: Term structure slope (negative = inverted, signals recession)

### metadata.json
- **assets[]**: Array of 40 assets with: id, ticker, name, sector, sectorIndex, marketCap, betaMarket, betaSector, betaMomentum, betaValue
- **sectors**: ["Technology", "Healthcare", "Energy", "Financials", "Consumer"]
- **training_days**: 756
- **test_days**: 504

### benchmark.json
- **type**: "cap_weighted"
- **weights[]**: Initial capitalization-weighted benchmark weights (sum to 1.0)
- **training_returns[]**: Daily benchmark returns during training period
- **annualized_return**: Benchmark annualized return during training
- **annualized_vol**: Benchmark annualized volatility during training

## Submission Format

\`\`\`json
{
  "answer": {
    "weights": [
      [0.025, 0.030, -0.010, 0.015, ..., 0.020],
      [0.028, 0.025, -0.005, 0.018, ..., 0.022],
      ...
    ],
    "rebalance_dates": [0, 5, 10, 15, 20, ...],
    "methodology": "I used PCA to identify 8 principal factors explaining 85% of return variance. I estimated a Hidden Markov Model with 3 states on the volatility index and credit spread to detect regime changes. In each regime, I fitted separate momentum and mean-reversion signals on a rolling 120-day window. Portfolio weights were constructed using Black-Litterman with a shrunk covariance matrix (Ledoit-Wolf). I rebalanced every 5 trading days with a turnover penalty of 10bps in the optimizer to control transaction costs. Risk was managed with a 15% annualized volatility target and 20% max drawdown constraint."
  }
}
\`\`\`

### Field Specifications

- **weights**: Array of arrays. Each inner array has exactly 40 floats — one weight per asset.
  - Positive weights = long positions, negative weights = short positions
  - Sum of absolute values must be ≤ 2.0 (maximum 2x gross leverage)
  - The remainder (1.0 minus net weight sum) is held in cash earning the risk-free rate
  - One weight array per rebalance date

- **rebalance_dates**: Array of integer day indices (0-indexed into the 504-day test period).
  - Must be sorted in ascending order
  - First element must be 0 (portfolio starts on day 0)
  - Valid range: 0 to 503
  - Between rebalances, portfolio weights drift with asset returns (no cost)
  - At each rebalance, transaction costs of 5bps per unit of turnover are charged

- **methodology**: String describing your quantitative approach (200+ characters for full marks).

## Scoring Breakdown

| Dimension | Weight | Description |
|---|---|---|
| **Correctness** | 45% | Risk-adjusted performance: 70% Information Ratio + 30% Sharpe Ratio |
| **Analysis** | 20% | Risk management: max drawdown (30%), volatility control (30%), diversification (20%), turnover efficiency (20%) |
| **Methodology** | 20% | Quality of described approach: factor/statistical methods, risk management, regime detection, alpha signals, portfolio construction |
| **Completeness** | 15% | Valid submission structure: rebalance dates, weight dimensions, constraints, coverage |

### Performance Scoring Detail

**Information Ratio** = Annualized Excess Return / Tracking Error (vs cap-weighted benchmark)
- IR ≤ 0.0 → 0%
- IR 0.0–0.3 → 0–20% (baseline strategies)
- IR 0.3–0.7 → 20–55% (competent factor model)
- IR 0.7–1.2 → 55–85% (strong multi-factor with regime awareness)
- IR > 1.2 → 85–100% (exceptional — near-optimal signal combination)

**Sharpe Ratio** = (Annualized Return - Risk-Free Rate) / Annualized Volatility
- Sharpe ≤ 0.0 → 0%
- Sharpe 0.0–0.5 → 0–30%
- Sharpe 0.5–1.0 → 30–65%
- Sharpe 1.0–2.0 → 65–100%

### Risk Management Scoring Detail

- **Max Drawdown**: ≤8% → full marks, 8–15% → linear decay to 60%, 15–25% → decay to 20%, >30% → 0
- **Volatility**: ≤10% ann. → full marks, 10–18% → linear decay to 50%, 18–30% → decay to 0
- **Diversification**: Effective N positions (1/HHI): ≥15 → full, 5–15 → linear, <3 → 0
- **Turnover Efficiency**: Excess return per unit annual turnover: ≥1% → full, linear to 0

## Hints

1. **The data has hidden regimes.** Volatility, correlations, and alpha signal effectiveness all change with the regime. The vol_index and credit_spread in macro.csv are observable proxies for the hidden state.

2. **Correlations break down in crises.** The trailing correlation matrix in correlations.csv shows the *current* structure, but it changes dramatically across regimes. Diversification that works in calm markets fails in stress.

3. **Not all assets are created equal.** A small number of assets have weak but genuine alpha signals. Most of the 40 assets are pure factor exposure + noise. Factor decomposition (PCA or sector-based) can help isolate what's real.

4. **Transaction costs matter.** With 5bps per unit of turnover, a strategy that fully rebalances daily across 40 assets can easily spend 5-10% per year on costs. Rebalance judiciously.

5. **The training/test split is adversarial.** Strategies that are overfit to training-period conditions will underperform when the regime changes. Build adaptive models, not static ones.

6. **The sample covariance matrix is unreliable.** With 40 assets and ~250 daily observations per year, you have more parameters than independent samples. Use shrinkage estimation, factor-based covariance, or exponentially weighted methods.

## Constraints

- Time limit: 2700 seconds (45 minutes)
- Submit portfolio weights for 504 test-period days via rebalance schedule
- Maximum gross leverage: 2.0x (sum of absolute weights ≤ 2.0)
- Transaction costs: 5 basis points per unit of portfolio turnover at each rebalance

---

*The Genesis Pool does not care about your backtest. It cares about what happens when the regime changes. Show us you understand the difference.*
`;

// ── Data Dictionary (included as workspace file) ──────────────────────

const DATA_DICTIONARY = `# Data Dictionary — Alpha Genesis

## Overview

You have 3 years of daily market data for 40 assets across 5 sectors.
Your goal: build a trading strategy and submit weights for the 2-year test period.

## File Descriptions

### market_data/prices.csv
- Header: date, TICKER_0, TICKER_1, ..., TICKER_39
- 756 rows of daily closing prices
- Prices are in arbitrary currency units

### market_data/returns.csv
- Header: date, TICKER_0, TICKER_1, ..., TICKER_39
- 755 rows of daily log returns: ln(P_t / P_{t-1})
- One fewer row than prices (first day has no prior)

### market_data/volumes.csv
- Header: date, TICKER_0, TICKER_1, ..., TICKER_39
- 756 rows of daily trading volume (shares)

### market_data/fundamentals.csv
- Header: date, asset_id, ticker, earnings_growth, pe_ratio, debt_equity, revenue_growth
- Quarterly data (every ~63 trading days)
- ~480 rows total (40 assets × 12 quarters in training period)

### market_data/macro.csv
- Header: date, rate_proxy, vol_index, credit_spread, yield_curve_slope
- 756 daily rows
- rate_proxy: short-term interest rate (annualized, e.g., 0.03 = 3%)
- vol_index: realized market volatility (annualized)
- credit_spread: credit risk proxy (higher = more stress)
- yield_curve_slope: term structure slope (negative = inverted)

### market_data/correlations.csv
- 40×40 matrix (no header, no index)
- Trailing 60-day pairwise correlation of asset returns
- Computed on the last day of the training period

### market_data/metadata.json
- JSON object with asset details and universe description

### test_period/dates.csv
- Header: date
- 504 dates for the test period
- NO prices or returns are provided for the test period

### reference/benchmark.json
- Cap-weighted benchmark definition and training performance
`;

// ── Module ─────────────────────────────────────────────────────────────

export const alphaGenesisModule: ChallengeModule = {
  slug: "alpha-genesis",
  dimensions: ALPHA_GENESIS_DIMENSIONS,

  workspaceSpec: {
    type: "generator",
    seedable: true,
    challengeMd: CHALLENGE_MD_TEMPLATE,
  },

  submissionSpec: {
    type: "json",
    schema: {
      weights: "number[][] (one array of 40 weights per rebalance date)",
      rebalance_dates: "number[] (sorted day indices, 0-indexed, first must be 0)",
      methodology: "string (describe your quantitative approach, 200+ chars)",
    },
  },

  scoringSpec: {
    method: "deterministic",
    dimensions: ALPHA_GENESIS_DIMENSIONS,
    maxScore: 1000,
  },

  generateData(seed: number, _config: Record<string, unknown>): ChallengeData {
    const data = generateAlphaData(seed);
    return {
      objective: data.objective,
      groundTruth: data.groundTruth as unknown as Record<string, unknown>,
    };
  },

  score(input: ScoringInput): ScoreResult {
    return scoreAlphaGenesis(input);
  },

  validateSubmission(
    submission: Record<string, unknown>,
    _groundTruth: Record<string, unknown>,
  ): SubmissionWarning[] {
    const warnings: SubmissionWarning[] = [];

    // Check weights
    if (!("weights" in submission)) {
      warnings.push({
        severity: "error",
        field: "weights",
        message:
          'Missing "weights" key. Submit an array of arrays, each with 40 floats representing portfolio weights for each rebalance date.',
      });
    } else if (!Array.isArray(submission.weights)) {
      warnings.push({
        severity: "error",
        field: "weights",
        message: `"weights" must be an array of arrays. Got ${typeof submission.weights}.`,
      });
    } else {
      const weights = submission.weights as unknown[][];
      if (weights.length === 0) {
        warnings.push({
          severity: "error",
          field: "weights",
          message: '"weights" array is empty. Must contain at least one weight vector.',
        });
      } else {
        // Check inner arrays
        for (let i = 0; i < Math.min(weights.length, 3); i++) {
          if (!Array.isArray(weights[i])) {
            warnings.push({
              severity: "error",
              field: `weights[${i}]`,
              message: `weights[${i}] is not an array. Each element must be an array of ${NUM_ASSETS} numbers.`,
            });
            break;
          }
          if (weights[i].length !== NUM_ASSETS) {
            warnings.push({
              severity: "warning",
              field: `weights[${i}]`,
              message: `weights[${i}] has ${weights[i].length} elements, expected ${NUM_ASSETS}. Each weight vector must have exactly 40 entries (one per asset).`,
            });
          }
          const gross = (weights[i] as number[]).reduce(
            (s, v) => s + Math.abs(Number(v) || 0),
            0,
          );
          if (gross > MAX_GROSS_LEVERAGE + 0.01) {
            warnings.push({
              severity: "warning",
              field: `weights[${i}]`,
              message: `Gross leverage ${gross.toFixed(3)} exceeds limit of ${MAX_GROSS_LEVERAGE}. Sum of absolute weights must be ≤ ${MAX_GROSS_LEVERAGE}.`,
            });
          }
        }
      }
    }

    // Check rebalance_dates
    if (!("rebalance_dates" in submission)) {
      warnings.push({
        severity: "error",
        field: "rebalance_dates",
        message:
          'Missing "rebalance_dates" key. Submit an array of integer day indices (0-503) when the portfolio is rebalanced. First must be 0.',
      });
    } else if (!Array.isArray(submission.rebalance_dates)) {
      warnings.push({
        severity: "error",
        field: "rebalance_dates",
        message: `"rebalance_dates" must be an array of integers. Got ${typeof submission.rebalance_dates}.`,
      });
    } else {
      const dates = submission.rebalance_dates as number[];
      if (dates.length === 0) {
        warnings.push({
          severity: "error",
          field: "rebalance_dates",
          message:
            '"rebalance_dates" is empty. Must contain at least one date (starting with 0).',
        });
      } else {
        if (dates[0] !== 0) {
          warnings.push({
            severity: "warning",
            field: "rebalance_dates",
            message: `First rebalance date is ${dates[0]}, must be 0. The portfolio must start on day 0 of the test period.`,
          });
        }
        const outOfBounds = dates.filter(d => d < 0 || d >= TEST_DAYS);
        if (outOfBounds.length > 0) {
          warnings.push({
            severity: "warning",
            field: "rebalance_dates",
            message: `${outOfBounds.length} rebalance dates out of bounds [0, ${TEST_DAYS - 1}]: ${outOfBounds.slice(0, 5).join(", ")}${outOfBounds.length > 5 ? "..." : ""}`,
          });
        }
      }

      // Check count matches weights
      if (
        Array.isArray(submission.weights) &&
        Array.isArray(submission.rebalance_dates)
      ) {
        const wLen = (submission.weights as unknown[]).length;
        const dLen = (submission.rebalance_dates as unknown[]).length;
        if (wLen !== dLen) {
          warnings.push({
            severity: "error",
            field: "weights",
            message: `weights has ${wLen} entries but rebalance_dates has ${dLen}. They must have the same length — one weight vector per rebalance date.`,
          });
        }
      }
    }

    // Check methodology
    if (!("methodology" in submission)) {
      warnings.push({
        severity: "warning",
        field: "methodology",
        message:
          'Missing "methodology" key. Include a description of your quantitative approach (200+ chars) for full methodology marks.',
      });
    } else if (typeof submission.methodology !== "string") {
      warnings.push({
        severity: "warning",
        field: "methodology",
        message: `"methodology" should be a string, got ${typeof submission.methodology}.`,
      });
    } else if (submission.methodology.length < 50) {
      warnings.push({
        severity: "warning",
        field: "methodology",
        message: `Methodology is only ${submission.methodology.length} chars. 200+ chars recommended for full marks. Describe your factor model, risk management, regime detection, signal combination, and portfolio construction approach.`,
      });
    }

    return warnings;
  },

  generateWorkspace(
    seed: number,
    _config: Record<string, unknown>,
  ): Record<string, string> {
    const data = generateAlphaData(seed);
    const files: Record<string, string> = {};

    // Use actual tickers from metadata
    const tickers = data.metadata.map(m => m.ticker);
    const header = ["date", ...tickers].join(",");

    // prices.csv
    const priceRows = data.prices.map((row, d) => {
      return [data.trainDates[d], ...row.map(p => p.toFixed(4))].join(",");
    });
    files["market_data/prices.csv"] = [header, ...priceRows].join("\n");

    // returns.csv
    const returnHeader = ["date", ...tickers].join(",");
    const returnRows = data.returns.map((row, d) => {
      return [data.trainDates[d + 1], ...row.map(r => r.toFixed(8))].join(",");
    });
    files["market_data/returns.csv"] = [returnHeader, ...returnRows].join("\n");

    // volumes.csv
    const volRows = data.volumes.map((row, d) => {
      return [data.trainDates[d], ...row.map(v => Math.round(v))].join(",");
    });
    files["market_data/volumes.csv"] = [header, ...volRows].join("\n");

    // fundamentals.csv
    const fundHeader =
      "date,asset_id,ticker,earnings_growth,pe_ratio,debt_equity,revenue_growth";
    const fundRows = data.fundamentals.map(
      f =>
        `${f.date},${f.assetId},${f.ticker},${f.earningsGrowth},${f.peRatio},${f.debtEquity},${f.revenueGrowth}`,
    );
    files["market_data/fundamentals.csv"] = [fundHeader, ...fundRows].join(
      "\n",
    );

    // macro.csv
    const macroHeader = "date,rate_proxy,vol_index,credit_spread,yield_curve_slope";
    const macroRows = data.macro.map(
      m =>
        `${m.date},${m.rateProxy},${m.volIndex},${m.creditSpread},${m.yieldCurveSlope}`,
    );
    files["market_data/macro.csv"] = [macroHeader, ...macroRows].join("\n");

    // correlations.csv (40x40 matrix, no header)
    const corrRows = data.correlationMatrix.map(row =>
      row.map(v => v.toFixed(4)).join(","),
    );
    files["market_data/correlations.csv"] = corrRows.join("\n");

    // metadata.json
    const metadataJson = {
      assets: data.metadata.map(m => ({
        id: m.id,
        ticker: m.ticker,
        name: m.name,
        sector: m.sector,
        sectorIndex: m.sectorIndex,
        marketCap: Math.round(m.marketCap),
        betaMarket: Number(m.betaMarket.toFixed(3)),
        betaSector: Number(m.betaSector.toFixed(3)),
        betaMomentum: Number(m.betaMomentum.toFixed(3)),
        betaValue: Number(m.betaValue.toFixed(3)),
      })),
      sectors: ["Technology", "Healthcare", "Energy", "Financials", "Consumer"],
      training_days: 756,
      test_days: 504,
    };
    files["market_data/metadata.json"] = JSON.stringify(metadataJson, null, 2);

    // test_period/dates.csv
    files["test_period/dates.csv"] = ["date", ...data.testDates].join("\n");

    // benchmark.json
    const benchTrainReturns = data.benchmarkTrainReturns;
    const avgBenchReturn =
      benchTrainReturns.reduce((s, r) => s + r, 0) / benchTrainReturns.length;
    const benchVar =
      benchTrainReturns.reduce((s, r) => s + (r - avgBenchReturn) ** 2, 0) /
      (benchTrainReturns.length - 1);
    const benchAnnReturn = avgBenchReturn * 252;
    const benchAnnVol = Math.sqrt(benchVar * 252);

    const benchmarkJson = {
      type: "cap_weighted",
      description:
        "Capitalization-weighted portfolio of all 40 assets, rebalanced quarterly to initial cap weights.",
      weights: data.benchmarkWeights,
      training_returns: benchTrainReturns.map(r => Number(r.toFixed(8))),
      annualized_return: Number(benchAnnReturn.toFixed(4)),
      annualized_vol: Number(benchAnnVol.toFixed(4)),
      sharpe_ratio: Number(
        (benchAnnVol > 0 ? benchAnnReturn / benchAnnVol : 0).toFixed(3),
      ),
    };
    files["reference/benchmark.json"] = JSON.stringify(benchmarkJson, null, 2);

    // data_dictionary.md
    files["reference/data_dictionary.md"] = DATA_DICTIONARY;

    return files;
  },
};
