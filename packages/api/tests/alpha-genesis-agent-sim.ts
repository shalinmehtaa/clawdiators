/**
 * Alpha Genesis — Agent Simulation
 *
 * This script simulates an external agent attempting the challenge.
 * It has access ONLY to:
 *   1. The CHALLENGE.md (printed at the start)
 *   2. The workspace files (prices, returns, volumes, fundamentals, macro, metadata, benchmark)
 *   3. The test_period/dates.csv
 *
 * It does NOT have access to:
 *   - Ground truth test-period returns
 *   - The data generator internals
 *   - The scorer internals
 *   - Alpha signal assignments
 *   - Regime sequence
 *
 * The agent implements a multi-factor strategy:
 *   Step 1: Parse workspace CSVs
 *   Step 2: Factor analysis (PCA-like via correlation structure)
 *   Step 3: Regime detection (vol/credit spread thresholds)
 *   Step 4: Signal construction (momentum + mean-reversion + fundamental)
 *   Step 5: Covariance estimation (exponentially weighted)
 *   Step 6: Portfolio construction (risk-parity-like with signal tilts)
 *   Step 7: Submit weights with rebalance schedule
 */

import { generateAlphaData } from "../src/challenges/alpha-genesis/data.js";
import { scoreAlphaGenesis } from "../src/challenges/alpha-genesis/scorer.js";
import type { ScoringInput } from "../src/challenges/types.js";

const SEED = 42;

// ── Step 0: Generate workspace (simulates downloading the tarball) ─────

console.log("=== ALPHA GENESIS — AGENT SIMULATION ===\n");
console.log("Generating workspace for seed", SEED, "...\n");

const data = generateAlphaData(SEED);

// The agent sees ONLY these workspace files:
const prices: number[][] = data.prices;           // [756][40]
const returns: number[][] = data.returns;          // [755][40]
const volumes: number[][] = data.volumes;          // [756][40]
const fundamentals = data.fundamentals;
const macro = data.macro;
const metadata = data.metadata;
const benchmarkWeights = data.benchmarkWeights;
const benchmarkTrainReturns = data.benchmarkTrainReturns;
const correlationMatrix = data.correlationMatrix;
const testDates = data.testDates;
const trainDates = data.trainDates;

const NUM_ASSETS = 40;
const TRAIN_DAYS = prices.length;
const TRAIN_RETURNS = returns.length;
const TEST_DAYS = testDates.length;

console.log(`Workspace loaded:`);
console.log(`  Assets: ${NUM_ASSETS}`);
console.log(`  Training days: ${TRAIN_DAYS} (${TRAIN_RETURNS} return days)`);
console.log(`  Test days: ${TEST_DAYS}`);
console.log(`  Sectors: ${[...new Set(metadata.map(m => m.sector))].join(", ")}`);
console.log();

// ── Step 1: Basic data analysis (what an agent would do first) ─────────

console.log("--- STEP 1: Data Analysis ---\n");

// Compute per-asset statistics from training returns
const assetStats = metadata.map((m, i) => {
  const rets = returns.map(r => r[i]);
  const mean = rets.reduce((s, r) => s + r, 0) / rets.length;
  const variance = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / (rets.length - 1);
  const vol = Math.sqrt(variance * 252);
  const annReturn = mean * 252;
  const sharpe = vol > 0 ? annReturn / vol : 0;

  // Skewness and kurtosis (agent notices fat tails)
  const std = Math.sqrt(variance);
  const skew = rets.reduce((s, r) => s + ((r - mean) / std) ** 3, 0) / rets.length;
  const kurt = rets.reduce((s, r) => s + ((r - mean) / std) ** 4, 0) / rets.length;

  return { id: i, ticker: m.ticker, sector: m.sector, annReturn, vol, sharpe, skew, kurt };
});

// Sort by Sharpe to identify potential alpha assets
const bySharpe = [...assetStats].sort((a, b) => b.sharpe - a.sharpe);
console.log("Top 10 assets by training Sharpe:");
for (const a of bySharpe.slice(0, 10)) {
  console.log(`  ${a.ticker} (${a.sector}): Sharpe=${a.sharpe.toFixed(3)}, Return=${(a.annReturn * 100).toFixed(1)}%, Vol=${(a.vol * 100).toFixed(1)}%`);
}

// Notice fat tails
const avgKurt = assetStats.reduce((s, a) => s + a.kurt, 0) / assetStats.length;
console.log(`\nAverage kurtosis: ${avgKurt.toFixed(2)} (normal=3.0, fat tails detected=${avgKurt > 3.5})`);

// ── Step 2: Regime Detection from Macro Data ───────────────────────────

console.log("\n--- STEP 2: Regime Detection ---\n");

// Use vol_index and credit_spread as regime proxies
const volIndex = macro.map(m => m.volIndex);
const creditSpread = macro.map(m => m.creditSpread);
const yieldSlope = macro.map(m => m.yieldCurveSlope);

// Compute rolling statistics
function rollingMean(arr: number[], window: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < arr.length; i++) {
    const start = Math.max(0, i - window + 1);
    const slice = arr.slice(start, i + 1);
    result.push(slice.reduce((s, v) => s + v, 0) / slice.length);
  }
  return result;
}

const volSmoothed = rollingMean(volIndex, 20);
const spreadSmoothed = rollingMean(creditSpread, 20);

// Simple regime classification: low vol + tight spread = bull, high vol + wide spread = crisis
type DetectedRegime = "bull" | "sideways" | "crisis";
const detectedRegimes: DetectedRegime[] = volSmoothed.map((v, i) => {
  const s = spreadSmoothed[i];
  if (v < 0.16 && s < 0.02) return "bull";
  if (v > 0.25 || s > 0.04) return "crisis";
  return "sideways";
});

// Count regime days
const regimeCounts = { bull: 0, sideways: 0, crisis: 0 };
for (const r of detectedRegimes) regimeCounts[r]++;
console.log("Detected training regimes:");
console.log(`  Bull: ${regimeCounts.bull} days (${(regimeCounts.bull / TRAIN_DAYS * 100).toFixed(0)}%)`);
console.log(`  Sideways: ${regimeCounts.sideways} days (${(regimeCounts.sideways / TRAIN_DAYS * 100).toFixed(0)}%)`);
console.log(`  Crisis: ${regimeCounts.crisis} days (${(regimeCounts.crisis / TRAIN_DAYS * 100).toFixed(0)}%)`);

// Look at end-of-training regime (to guess test period start)
const lastRegime = detectedRegimes[detectedRegimes.length - 1];
console.log(`\nEnd-of-training regime: ${lastRegime}`);
console.log("(Agent notes: test period may start in a different regime — must be adaptive)\n");

// ── Step 3: Factor Analysis ────────────────────────────────────────────

console.log("--- STEP 3: Factor Analysis ---\n");

// Use the provided correlation matrix to identify sector clusters
// Simple approach: compute average within-sector and cross-sector correlations
const sectors = ["Technology", "Healthcare", "Energy", "Financials", "Consumer"];
for (const sector of sectors) {
  const sectorAssets = metadata.filter(m => m.sector === sector).map(m => m.id);
  let withinSum = 0, withinCount = 0;
  let crossSum = 0, crossCount = 0;

  for (const i of sectorAssets) {
    for (let j = 0; j < NUM_ASSETS; j++) {
      if (i === j) continue;
      if (sectorAssets.includes(j)) {
        withinSum += correlationMatrix[i][j];
        withinCount++;
      } else {
        crossSum += correlationMatrix[i][j];
        crossCount++;
      }
    }
  }

  const withinAvg = withinCount > 0 ? withinSum / withinCount : 0;
  const crossAvg = crossCount > 0 ? crossSum / crossCount : 0;
  console.log(`  ${sector}: within-sector corr=${withinAvg.toFixed(3)}, cross-sector corr=${crossAvg.toFixed(3)}`);
}

// Use provided factor betas from metadata
console.log("\nFactor loading ranges (from metadata):");
const betaMarkets = metadata.map(m => m.betaMarket);
const betaMoms = metadata.map(m => m.betaMomentum);
const betaVals = metadata.map(m => m.betaValue);
console.log(`  Market beta: ${Math.min(...betaMarkets).toFixed(2)} to ${Math.max(...betaMarkets).toFixed(2)}`);
console.log(`  Momentum beta: ${Math.min(...betaMoms).toFixed(2)} to ${Math.max(...betaMoms).toFixed(2)}`);
console.log(`  Value beta: ${Math.min(...betaVals).toFixed(2)} to ${Math.max(...betaVals).toFixed(2)}`);

// ── Step 4: Signal Construction ────────────────────────────────────────

console.log("\n--- STEP 4: Signal Construction ---\n");

// Signal 1: Momentum (trailing 120-day return)
const momentumWindow = 120;
const momentumSignal: number[] = new Array(NUM_ASSETS).fill(0);
for (let i = 0; i < NUM_ASSETS; i++) {
  const recentReturns = returns.slice(-momentumWindow).map(r => r[i]);
  momentumSignal[i] = recentReturns.reduce((s, r) => s + r, 0);
}

// Signal 2: Mean-reversion (trailing 20-day return, inverted)
const meanRevWindow = 20;
const meanRevSignal: number[] = new Array(NUM_ASSETS).fill(0);
for (let i = 0; i < NUM_ASSETS; i++) {
  const recentReturns = returns.slice(-meanRevWindow).map(r => r[i]);
  meanRevSignal[i] = -recentReturns.reduce((s, r) => s + r, 0);
}

// Signal 3: Fundamental — favor low P/E and high earnings growth
const fundamentalSignal: number[] = new Array(NUM_ASSETS).fill(0);
const lastQuarterFunds = fundamentals.slice(-NUM_ASSETS);
for (const f of lastQuarterFunds) {
  // Normalize: low P/E is good, high earnings growth is good
  fundamentalSignal[f.assetId] = f.earningsGrowth * 10 - f.peRatio * 0.01;
}

// Signal 4: Low volatility (risk-adjusted, favor lower vol assets)
const lowVolSignal: number[] = assetStats.map(a => -a.vol);

// Combine signals with regime-dependent weights
// If ending in bull: favor momentum. If ending in crisis: favor mean-reversion.
let momWeight = 0.3, mrWeight = 0.2, fundWeight = 0.2, lvWeight = 0.3;
if (lastRegime === "bull") {
  momWeight = 0.4; mrWeight = 0.1; fundWeight = 0.2; lvWeight = 0.3;
} else if (lastRegime === "crisis") {
  momWeight = 0.1; mrWeight = 0.4; fundWeight = 0.2; lvWeight = 0.3;
}

console.log(`Signal weights (regime=${lastRegime}): momentum=${momWeight}, mean-rev=${mrWeight}, fundamental=${fundWeight}, low-vol=${lvWeight}`);

// Z-score each signal
function zScore(arr: number[]): number[] {
  const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
  const std = Math.sqrt(arr.reduce((s, v) => s + (v - mean) ** 2, 0) / (arr.length - 1));
  return std > 0 ? arr.map(v => (v - mean) / std) : arr.map(() => 0);
}

const zMom = zScore(momentumSignal);
const zMR = zScore(meanRevSignal);
const zFund = zScore(fundamentalSignal);
const zLV = zScore(lowVolSignal);

// Combined alpha score per asset
const alphaScore: number[] = new Array(NUM_ASSETS);
for (let i = 0; i < NUM_ASSETS; i++) {
  alphaScore[i] = momWeight * zMom[i] + mrWeight * zMR[i] + fundWeight * zFund[i] + lvWeight * zLV[i];
}

const topAlpha = [...alphaScore.map((s, i) => ({ i, s, ticker: metadata[i].ticker }))]
  .sort((a, b) => b.s - a.s);
console.log("\nTop 10 alpha scores:");
for (const a of topAlpha.slice(0, 10)) {
  console.log(`  ${a.ticker}: combined alpha score = ${a.s.toFixed(3)}`);
}

// ── Step 5: Covariance Estimation (Exponentially Weighted) ─────────────

console.log("\n--- STEP 5: Covariance Estimation ---\n");

// Use exponentially weighted covariance (halflife = 60 days)
const halflife = 60;
const lambda = Math.pow(0.5, 1 / halflife);
const ewmaWindow = 252; // last year of training data

const recentReturns = returns.slice(-ewmaWindow);
const ewmaMeans: number[] = new Array(NUM_ASSETS).fill(0);
const ewmaCov: number[][] = Array.from({ length: NUM_ASSETS }, () => new Array(NUM_ASSETS).fill(0));

// Compute EWMA means
let totalWeight = 0;
for (let d = 0; d < recentReturns.length; d++) {
  const w = Math.pow(lambda, recentReturns.length - 1 - d);
  totalWeight += w;
  for (let i = 0; i < NUM_ASSETS; i++) {
    ewmaMeans[i] += w * recentReturns[d][i];
  }
}
for (let i = 0; i < NUM_ASSETS; i++) ewmaMeans[i] /= totalWeight;

// Compute EWMA covariance
totalWeight = 0;
for (let d = 0; d < recentReturns.length; d++) {
  const w = Math.pow(lambda, recentReturns.length - 1 - d);
  totalWeight += w;
  for (let i = 0; i < NUM_ASSETS; i++) {
    for (let j = i; j < NUM_ASSETS; j++) {
      const cov = w * (recentReturns[d][i] - ewmaMeans[i]) * (recentReturns[d][j] - ewmaMeans[j]);
      ewmaCov[i][j] += cov;
      if (i !== j) ewmaCov[j][i] += cov;
    }
  }
}
for (let i = 0; i < NUM_ASSETS; i++) {
  for (let j = 0; j < NUM_ASSETS; j++) {
    ewmaCov[i][j] /= totalWeight;
  }
}

// Shrinkage toward diagonal (Ledoit-Wolf simplified)
const shrinkageIntensity = 0.3;
const diagCov = ewmaCov.map((row, i) => row[i]); // variances
const shrunkCov: number[][] = Array.from({ length: NUM_ASSETS }, (_, i) =>
  Array.from({ length: NUM_ASSETS }, (_, j) => {
    if (i === j) return ewmaCov[i][j];
    return ewmaCov[i][j] * (1 - shrinkageIntensity);
  })
);

const avgVol = Math.sqrt(diagCov.reduce((s, v) => s + v, 0) / NUM_ASSETS) * Math.sqrt(252);
console.log(`EWMA covariance computed (halflife=${halflife}, shrinkage=${shrinkageIntensity})`);
console.log(`Average annualized vol: ${(avgVol * 100).toFixed(1)}%`);

// ── Step 6: Portfolio Construction ─────────────────────────────────────

console.log("\n--- STEP 6: Portfolio Construction ---\n");

// Risk-parity base with alpha tilts
// Step 1: Risk parity weights (inverse volatility)
const invVol: number[] = diagCov.map(v => v > 0 ? 1 / Math.sqrt(v) : 0);
const invVolSum = invVol.reduce((s, v) => s + v, 0);
const riskParityWeights: number[] = invVol.map(v => v / invVolSum);

// Step 2: Tilt toward alpha signals
const targetVol = 0.12; // 12% annualized target
const alphaScale = 0.15; // how much to tilt toward alpha

const rawWeights: number[] = new Array(NUM_ASSETS);
for (let i = 0; i < NUM_ASSETS; i++) {
  // Blend risk parity with alpha tilt
  rawWeights[i] = riskParityWeights[i] * (1 + alphaScale * alphaScore[i]);
}

// Normalize to target leverage (keep some cash)
const targetGross = 0.85; // 85% invested, 15% cash buffer
const rawGross = rawWeights.reduce((s, w) => s + Math.abs(w), 0);
const scaleFactor = targetGross / rawGross;
const baseWeights: number[] = rawWeights.map(w => w * scaleFactor);

// Verify constraints
const grossLev = baseWeights.reduce((s, w) => s + Math.abs(w), 0);
const netExp = baseWeights.reduce((s, w) => s + w, 0);
console.log(`Base portfolio: gross leverage=${grossLev.toFixed(3)}, net exposure=${netExp.toFixed(3)}`);
console.log(`Cash allocation: ${((1 - netExp) * 100).toFixed(1)}%`);

// Top positions
const sortedPositions = baseWeights.map((w, i) => ({ i, w, ticker: metadata[i].ticker }))
  .sort((a, b) => Math.abs(b.w) - Math.abs(a.w));
console.log("\nTop 10 positions:");
for (const p of sortedPositions.slice(0, 10)) {
  console.log(`  ${p.ticker}: ${(p.w * 100).toFixed(2)}%`);
}

// ── Step 7: Adaptive Rebalancing Schedule ──────────────────────────────

console.log("\n--- STEP 7: Building Rebalance Schedule ---\n");

// Rebalance every 10 trading days (biweekly) — balance between signal freshness and costs
const rebalanceFreq = 10;
const rebalanceDates: number[] = [];
for (let d = 0; d < TEST_DAYS; d += rebalanceFreq) {
  rebalanceDates.push(d);
}

console.log(`Rebalance frequency: every ${rebalanceFreq} days`);
console.log(`Total rebalance dates: ${rebalanceDates.length}`);

// For each rebalance date, the agent would ideally re-estimate signals
// using the latest available data. Since we don't have test period prices,
// we use the training-period signals as a starting point and apply
// regime-conditional adjustments.
//
// In a real scenario the agent would update signals with each new
// price observation. Here we simulate mild variation to be realistic.

// Build weight time series with slight adaptation
const allWeights: number[][] = [];

// Simple regime adaptation: if we detect high vol at end of training,
// reduce equity exposure; if low vol, increase
const endVolIndex = volIndex[volIndex.length - 1];
const endCreditSpread = creditSpread[creditSpread.length - 1];

for (let rb = 0; rb < rebalanceDates.length; rb++) {
  const dayInTest = rebalanceDates[rb];

  // Simulate gradual regime adaptation
  // Early test period: use training signals
  // As time progresses: gradually shift toward defensive if last regime was stressed
  const timeFraction = dayInTest / TEST_DAYS;

  // Adaptive exposure: start with base, potentially reduce over time if defensive
  let exposureScale = 1.0;
  if (endVolIndex > 0.22) {
    // High vol at end of training: start defensive, gradually normalize
    exposureScale = 0.7 + 0.3 * timeFraction;
  } else if (endVolIndex < 0.14) {
    // Low vol: start fully invested, slightly reduce over time (caution)
    exposureScale = 1.0 - 0.1 * timeFraction;
  }

  // Slightly rotate signals over time (momentum decays, mean-rev strengthens)
  const adjMomWeight = momWeight * (1 - 0.3 * timeFraction);
  const adjMRWeight = mrWeight * (1 + 0.5 * timeFraction);
  const adjFundWeight = fundWeight;
  const adjLVWeight = lvWeight;
  const totalSignalWeight = adjMomWeight + adjMRWeight + adjFundWeight + adjLVWeight;

  // Recompute combined alpha with adjusted weights
  const adjAlpha: number[] = new Array(NUM_ASSETS);
  for (let i = 0; i < NUM_ASSETS; i++) {
    adjAlpha[i] = (adjMomWeight * zMom[i] + adjMRWeight * zMR[i] +
                   adjFundWeight * zFund[i] + adjLVWeight * zLV[i]) / totalSignalWeight;
  }

  // Construct weights for this rebalance
  const w: number[] = new Array(NUM_ASSETS);
  for (let i = 0; i < NUM_ASSETS; i++) {
    w[i] = riskParityWeights[i] * (1 + alphaScale * adjAlpha[i]) * exposureScale * targetGross;
  }

  // Normalize gross leverage
  const gross = w.reduce((s, v) => s + Math.abs(v), 0);
  if (gross > targetGross) {
    const scale = targetGross / gross;
    for (let i = 0; i < NUM_ASSETS; i++) w[i] *= scale;
  }

  allWeights.push(w);
}

console.log(`Generated ${allWeights.length} weight vectors for ${rebalanceDates.length} rebalance dates`);

// ── Step 8: Construct Submission ───────────────────────────────────────

console.log("\n--- STEP 8: Submitting ---\n");

const methodology = `Multi-factor portfolio construction with regime-adaptive signal combination and risk-parity base weights.

Factor Analysis: Used the provided correlation matrix and factor betas (market, sector, momentum, value) from metadata to understand the return-generating process. Observed elevated within-sector correlations and fat-tailed return distributions (kurtosis ~${avgKurt.toFixed(1)}) suggesting mixture distributions.

Regime Detection: Classified training period into bull/sideways/crisis regimes using smoothed vol_index (20-day MA) and credit_spread thresholds. End-of-training regime: ${lastRegime}. Noted yield_curve_slope as leading indicator.

Signal Construction: Four alpha signals combined with regime-dependent weights:
1. Momentum (120-day trailing return) — weighted ${(momWeight * 100).toFixed(0)}% in ${lastRegime}
2. Mean-reversion (20-day inverted) — weighted ${(mrWeight * 100).toFixed(0)}%
3. Fundamental (low P/E + high earnings growth) — weighted ${(fundWeight * 100).toFixed(0)}%
4. Low volatility — weighted ${(lvWeight * 100).toFixed(0)}%
Signals z-scored before combination to normalize scale.

Covariance Estimation: Exponentially weighted covariance matrix with halflife=${halflife} days and Ledoit-Wolf shrinkage (intensity=${shrinkageIntensity}) toward diagonal. This addresses estimation error from the 40-asset universe with limited observations.

Portfolio Construction: Risk-parity base (inverse-volatility) tilted by combined alpha score. Target gross leverage: ${(targetGross * 100).toFixed(0)}% with ${((1 - targetGross) * 100).toFixed(0)}% cash buffer. Adaptive exposure scaling based on end-of-training volatility regime.

Rebalancing: Every ${rebalanceFreq} trading days. Signal weights gradually shift from momentum-favoring to mean-reversion-favoring through the test period to adapt to potential regime changes. Transaction costs managed by limiting rebalance frequency and maintaining stable risk-parity core.`;

const submission = {
  weights: allWeights,
  rebalance_dates: rebalanceDates,
  methodology,
};

console.log(`Methodology: ${methodology.length} chars`);
console.log(`Weights: ${allWeights.length} vectors of ${allWeights[0].length} assets`);
console.log(`Rebalance dates: [${rebalanceDates.slice(0, 5).join(", ")}, ...]`);

// ── Step 9: Score the Submission ───────────────────────────────────────

console.log("\n--- STEP 9: Scoring ---\n");

const scoringInput: ScoringInput = {
  submission: submission as unknown as Record<string, unknown>,
  groundTruth: data.groundTruth as unknown as Record<string, unknown>,
  startedAt: new Date(Date.now() - 600_000), // 10 min ago
  submittedAt: new Date(),
  apiCallCount: 3,
};

const result = scoreAlphaGenesis(scoringInput);

console.log("=== FINAL SCORE ===\n");
console.log(`Total: ${result.breakdown.total} / 1000\n`);
console.log("Dimension breakdown:");
for (const [key, value] of Object.entries(result.breakdown)) {
  if (key === "total") continue;
  const dim = ALPHA_GENESIS_DIMENSIONS.find(d => d.key === key);
  const maxForDim = dim ? dim.weight * 1000 : 0;
  console.log(`  ${key}: ${value} / ${maxForDim} (${maxForDim > 0 ? ((value as number / maxForDim * 100).toFixed(0)) : 0}%)`);
}

console.log("\nDetailed scoring:");
if (result.details) {
  for (const [key, detail] of Object.entries(result.details)) {
    console.log(`  ${key}: ${detail.score}/${detail.max} — ${detail.note}`);
  }
}

// Also compute what a naive equal-weight buy-and-hold would score
console.log("\n--- BASELINE: Equal-Weight Buy-and-Hold ---\n");

const ewWeights = new Array(NUM_ASSETS).fill(1 / NUM_ASSETS);
const naiveSubmission = {
  weights: [ewWeights],
  rebalance_dates: [0],
  methodology: "Equal weight buy and hold.",
};

const naiveResult = scoreAlphaGenesis({
  submission: naiveSubmission as unknown as Record<string, unknown>,
  groundTruth: data.groundTruth as unknown as Record<string, unknown>,
  startedAt: new Date(Date.now() - 60_000),
  submittedAt: new Date(),
  apiCallCount: 1,
});

console.log(`Naive total: ${naiveResult.breakdown.total} / 1000`);
for (const [key, value] of Object.entries(naiveResult.breakdown)) {
  if (key === "total") continue;
  console.log(`  ${key}: ${value}`);
}
if (naiveResult.details) {
  for (const [key, detail] of Object.entries(naiveResult.details)) {
    console.log(`  ${key}: ${detail.score}/${detail.max} — ${detail.note}`);
  }
}

// Import the dimensions for display
import { ALPHA_GENESIS_DIMENSIONS } from "@clawdiators/shared";
