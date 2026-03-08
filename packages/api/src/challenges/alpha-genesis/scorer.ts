// ── Alpha Genesis: Portfolio Scoring Engine ─────────────────────────────
//
// Simulates the agent's portfolio using submitted weights and ground truth
// test-period returns, then scores on:
//   - Correctness (45%): Risk-adjusted performance (IR + Sharpe)
//   - Analysis (20%): Risk management (drawdown, vol, diversification, turnover)
//   - Methodology (20%): Quality of described approach
//   - Completeness (15%): Structural validity of submission

import { ALPHA_GENESIS_DIMENSIONS } from "@clawdiators/shared";
import type { ScoringInput, ScoreResult } from "../types.js";
import type { ScoreBreakdown } from "@clawdiators/shared";
import type { AlphaGroundTruth } from "./data.js";

const NUM_ASSETS = 40;
const TEST_DAYS = 504;
const TRADING_DAYS_PER_YEAR = 252;
const TRANSACTION_COST_BPS = 5; // 5 basis points per unit turnover
const TC_RATE = TRANSACTION_COST_BPS / 10000;
const MAX_GROSS_LEVERAGE = 2.0;

// ── Scoring Curves (piecewise linear) ──────────────────────────────────

function irScore(ir: number): number {
  if (ir <= 0) return 0;
  if (ir <= 0.3) return 0.20 * (ir / 0.3);
  if (ir <= 0.7) return 0.20 + 0.35 * ((ir - 0.3) / 0.4);
  if (ir <= 1.2) return 0.55 + 0.30 * ((ir - 0.7) / 0.5);
  return Math.min(1.0, 0.85 + 0.15 * ((ir - 1.2) / 0.8));
}

function sharpeScore(sharpe: number): number {
  if (sharpe <= 0) return 0;
  if (sharpe <= 0.5) return 0.30 * (sharpe / 0.5);
  if (sharpe <= 1.0) return 0.30 + 0.35 * ((sharpe - 0.5) / 0.5);
  if (sharpe <= 2.0) return 0.65 + 0.35 * ((sharpe - 1.0) / 1.0);
  return 1.0;
}

function drawdownScore(maxDD: number): number {
  // maxDD is positive (e.g., 0.10 = 10%)
  if (maxDD <= 0.08) return 1.0;
  if (maxDD <= 0.15) return 1.0 - 0.40 * ((maxDD - 0.08) / 0.07);
  if (maxDD <= 0.25) return 0.60 - 0.40 * ((maxDD - 0.15) / 0.10);
  if (maxDD <= 0.30) return 0.20 - 0.20 * ((maxDD - 0.25) / 0.05);
  return 0;
}

function volScore(annVol: number): number {
  if (annVol <= 0.10) return 1.0;
  if (annVol <= 0.18) return 1.0 - 0.50 * ((annVol - 0.10) / 0.08);
  if (annVol <= 0.30) return 0.50 - 0.50 * ((annVol - 0.18) / 0.12);
  return 0;
}

function diversificationScore(effectiveN: number): number {
  if (effectiveN >= 15) return 1.0;
  if (effectiveN >= 5) return (effectiveN - 5) / 10;
  if (effectiveN >= 3) return (effectiveN - 3) / 10;
  return 0;
}

function turnoverEfficiencyScore(efficiency: number): number {
  // efficiency = annualized excess return / annual two-way turnover
  if (!isFinite(efficiency) || isNaN(efficiency)) return 0;
  if (efficiency <= 0) return 0;
  if (efficiency >= 0.01) return 1.0;
  return efficiency / 0.01;
}

// ── Methodology Scoring ────────────────────────────────────────────────

const METHODOLOGY_CATEGORIES: Record<string, string[]> = {
  factor_statistical: ["factor", "pca", "covariance", "eigenvalue", "loading", "decomposition", "principal component", "correlation matrix", "variance"],
  risk_management: ["sharpe", "drawdown", "volatility", "risk parity", "var", "cvar", "hedge", "risk budget", "tail risk", "downside"],
  regime_detection: ["regime", "hmm", "hidden markov", "state", "transition", "structural break", "changepoint", "switching", "non-stationary"],
  alpha_signal: ["alpha", "signal", "momentum", "mean-reversion", "mean reversion", "fundamental", "anomaly", "excess return", "information ratio", "predictive"],
  portfolio_construction: ["optimization", "black-litterman", "shrinkage", "ledoit-wolf", "robust", "constraint", "rebalance", "turnover", "position size", "weight"],
};

function scoreMethodology(methodology: string | undefined): number {
  if (!methodology || typeof methodology !== "string") return 0;

  const lower = methodology.toLowerCase();
  let score = 0;

  // Category matching (each category worth 15% = total 75%)
  const categories = Object.values(METHODOLOGY_CATEGORIES);
  for (const keywords of categories) {
    const found = keywords.some(kw => lower.includes(kw));
    if (found) score += 0.15;
  }

  // Length bonus (25%)
  const len = methodology.length;
  if (len >= 1000) score += 0.25;
  else if (len >= 500) score += 0.20;
  else if (len >= 200) score += 0.15;
  else if (len >= 100) score += 0.05;

  return Math.min(1.0, score);
}

// ── Portfolio Simulation ───────────────────────────────────────────────

interface SimulationResult {
  dailyReturns: number[];
  dailyExcessReturns: number[];
  annualizedReturn: number;
  annualizedVol: number;
  annualizedExcessReturn: number;
  trackingError: number;
  informationRatio: number;
  sharpeRatio: number;
  maxDrawdown: number;
  avgEffectiveN: number;
  totalTurnover: number;
  annualTurnover: number;
}

function simulatePortfolio(
  weights: number[][],
  rebalanceDates: number[],
  gt: AlphaGroundTruth,
): SimulationResult {
  const { testReturns, benchmarkTestReturns, riskFreeDaily } = gt;
  const numDays = Math.min(testReturns.length, TEST_DAYS);

  // Current portfolio weights (drift with returns between rebalances)
  let currentWeights = new Array(NUM_ASSETS).fill(0);
  let rebalanceIdx = 0;
  let cumulativeReturn = 1.0;
  let peak = 1.0;
  let maxDrawdown = 0;
  let totalTurnover = 0;
  let effectiveNSum = 0;
  let effectiveNCount = 0;

  const dailyReturns: number[] = [];
  const dailyExcessReturns: number[] = [];

  for (let d = 0; d < numDays; d++) {
    let tcCost = 0;

    // Check if we rebalance today
    if (rebalanceIdx < rebalanceDates.length && rebalanceDates[rebalanceIdx] === d) {
      const newWeights = weights[rebalanceIdx];

      // Compute turnover (sum of absolute weight changes vs drifted weights)
      let turnover = 0;
      for (let i = 0; i < NUM_ASSETS; i++) {
        const nw = newWeights[i] ?? 0;
        turnover += Math.abs(nw - currentWeights[i]);
      }
      totalTurnover += turnover;
      tcCost = turnover * TC_RATE;

      // Apply new weights
      currentWeights = new Array(NUM_ASSETS);
      for (let i = 0; i < NUM_ASSETS; i++) {
        currentWeights[i] = newWeights[i] ?? 0;
      }

      rebalanceIdx++;
    }

    // Track diversification (effective N = 1/HHI) BEFORE returns
    const absWeights = currentWeights.map(w => Math.abs(w));
    const totalAbsW = absWeights.reduce((s, w) => s + w, 0);
    if (totalAbsW > 0.01) {
      const normWeights = absWeights.map(w => w / totalAbsW);
      const hhi = normWeights.reduce((s, w) => s + w * w, 0);
      if (hhi > 0) {
        effectiveNSum += 1 / hhi;
        effectiveNCount++;
      }
    }

    // Compute portfolio return for today
    let portReturn = 0;
    let netWeight = 0;
    for (let i = 0; i < NUM_ASSETS; i++) {
      portReturn += currentWeights[i] * testReturns[d][i];
      netWeight += currentWeights[i];
    }
    // Cash earns risk-free rate
    const cashWeight = 1.0 - netWeight;
    portReturn += cashWeight * riskFreeDaily[d];

    // Deduct transaction costs
    portReturn -= tcCost;

    const benchReturn = benchmarkTestReturns[d] ?? 0;
    dailyReturns.push(portReturn);
    dailyExcessReturns.push(portReturn - benchReturn);

    // Track drawdown
    cumulativeReturn *= (1 + portReturn);
    if (cumulativeReturn > peak) peak = cumulativeReturn;
    if (peak > 0) {
      const dd = (peak - cumulativeReturn) / peak;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }

    // Drift weights with returns (weights change as assets move)
    for (let i = 0; i < NUM_ASSETS; i++) {
      currentWeights[i] *= (1 + testReturns[d][i]);
    }
    // Cap gross leverage drift
    const driftedGross = currentWeights.reduce((s, w) => s + Math.abs(w), 0);
    if (driftedGross > MAX_GROSS_LEVERAGE * 1.5) {
      const scale = MAX_GROSS_LEVERAGE / driftedGross;
      for (let i = 0; i < NUM_ASSETS; i++) currentWeights[i] *= scale;
    }
  }

  // Compute aggregate metrics
  const n = dailyReturns.length;
  if (n === 0) {
    return {
      dailyReturns: [], dailyExcessReturns: [],
      annualizedReturn: 0, annualizedVol: 0,
      annualizedExcessReturn: 0, trackingError: 0,
      informationRatio: 0, sharpeRatio: 0,
      maxDrawdown: 0, avgEffectiveN: 0,
      totalTurnover: 0, annualTurnover: 0,
    };
  }

  const years = n / TRADING_DAYS_PER_YEAR;

  const avgReturn = dailyReturns.reduce((s, r) => s + r, 0) / n;
  const annualizedReturn = avgReturn * TRADING_DAYS_PER_YEAR;

  const variance = dailyReturns.reduce((s, r) => s + (r - avgReturn) ** 2, 0) / Math.max(n - 1, 1);
  const annualizedVol = Math.sqrt(variance * TRADING_DAYS_PER_YEAR);

  const avgExcess = dailyExcessReturns.reduce((s, r) => s + r, 0) / n;
  const annualizedExcessReturn = avgExcess * TRADING_DAYS_PER_YEAR;

  const excessVariance = dailyExcessReturns.reduce((s, r) => s + (r - avgExcess) ** 2, 0) / Math.max(n - 1, 1);
  const trackingError = Math.sqrt(excessVariance * TRADING_DAYS_PER_YEAR);

  const avgRf = riskFreeDaily.reduce((s, r) => s + r, 0) / riskFreeDaily.length;
  const avgRfAnn = avgRf * TRADING_DAYS_PER_YEAR;

  const informationRatio = trackingError > 0.001 ? annualizedExcessReturn / trackingError : 0;
  const sharpeRatio = annualizedVol > 0.001 ? (annualizedReturn - avgRfAnn) / annualizedVol : 0;
  const annualTurnover = years > 0 ? totalTurnover / years : totalTurnover;

  return {
    dailyReturns,
    dailyExcessReturns,
    annualizedReturn,
    annualizedVol,
    annualizedExcessReturn,
    trackingError,
    informationRatio,
    sharpeRatio,
    maxDrawdown: isFinite(maxDrawdown) ? maxDrawdown : 1.0,
    avgEffectiveN: effectiveNCount > 0 ? effectiveNSum / effectiveNCount : 0,
    totalTurnover,
    annualTurnover,
  };
}

// ── Main Scorer ────────────────────────────────────────────────────────

export function scoreAlphaGenesis(input: ScoringInput): ScoreResult {
  const { submission, groundTruth, startedAt, submittedAt } = input;
  const gt = groundTruth as unknown as AlphaGroundTruth;

  const maxScore = 1000;
  const details: Record<string, { score: number; max: number; note?: string }> = {};
  const breakdown: ScoreBreakdown = { total: 0 };

  // Extract submission fields
  const weights = submission.weights as number[][] | undefined;
  const rebalanceDates = submission.rebalance_dates as number[] | undefined;
  const methodology = submission.methodology as string | undefined;

  // ── Completeness (15%) ───────────────────────────────────────────────

  let completenessRaw = 0;
  let validStructure = false;

  // Check rebalance_dates
  let datesValid = false;
  if (Array.isArray(rebalanceDates) && rebalanceDates.length > 0) {
    const sorted = rebalanceDates.every((d, i) => i === 0 || d > rebalanceDates[i - 1]);
    const startsAtZero = rebalanceDates[0] === 0;
    const inBounds = rebalanceDates.every(d => typeof d === "number" && d >= 0 && d < TEST_DAYS);
    datesValid = sorted && startsAtZero && inBounds;
    if (datesValid) completenessRaw += 0.30;
    details["rebalance_dates"] = {
      score: datesValid ? 100 : 0,
      max: 100,
      note: datesValid ? `${rebalanceDates.length} valid rebalance dates` : `Invalid dates: sorted=${sorted}, starts0=${startsAtZero}, inBounds=${inBounds}`,
    };
  } else {
    details["rebalance_dates"] = { score: 0, max: 100, note: "Missing or empty rebalance_dates array" };
  }

  // Check weights
  let weightsValid = false;
  if (Array.isArray(weights) && Array.isArray(rebalanceDates)) {
    const correctCount = weights.length === rebalanceDates.length;
    const correctLength = weights.every(w => Array.isArray(w) && w.length === NUM_ASSETS);
    const finiteValues = weights.every(w => w.every(v => typeof v === "number" && isFinite(v)));
    const leverageOk = weights.every(w => {
      const gross = w.reduce((s, v) => s + Math.abs(v), 0);
      return gross <= MAX_GROSS_LEVERAGE + 0.01; // small tolerance
    });

    weightsValid = correctCount && correctLength && finiteValues && leverageOk;
    if (correctLength) completenessRaw += 0.30;
    if (finiteValues && leverageOk) completenessRaw += 0.20;

    details["weights"] = {
      score: weightsValid ? 100 : correctLength ? 50 : 0,
      max: 100,
      note: weightsValid ? `${weights.length} weight vectors, all valid`
        : `count_match=${correctCount}, len40=${correctLength}, finite=${finiteValues}, leverage_ok=${leverageOk}`,
    };

    validStructure = datesValid && weightsValid;
  } else {
    details["weights"] = { score: 0, max: 100, note: "Missing or invalid weights array" };
  }

  // Coverage: portfolio is active from first rebalance date through the end
  // (weights persist between rebalances, so a single rebalance at day 0 covers the full period)
  if (validStructure && rebalanceDates!.length > 0) {
    const firstRebalance = rebalanceDates![0];
    // Active from first rebalance to end of test period
    const activeDays = TEST_DAYS - firstRebalance;
    const coverage = activeDays / TEST_DAYS;
    // Also check that weights are non-trivial (not all zeros)
    const hasNonZero = weights!.some(w => w.some(v => Math.abs(v) > 1e-10));
    const effectiveCoverage = hasNonZero ? coverage : 0;
    completenessRaw += 0.20 * Math.min(1.0, effectiveCoverage);
    details["coverage"] = { score: Math.round(effectiveCoverage * 100), max: 100, note: `Portfolio active for ${Math.round(effectiveCoverage * 100)}% of test period` };
  }

  const completenessWeight = ALPHA_GENESIS_DIMENSIONS.find(d => d.key === "completeness")!.weight;
  breakdown.completeness = Math.round(completenessRaw * completenessWeight * maxScore);

  // ── Methodology (20%) ────────────────────────────────────────────────

  const methodRaw = scoreMethodology(methodology);
  const methodWeight = ALPHA_GENESIS_DIMENSIONS.find(d => d.key === "methodology")!.weight;
  breakdown.methodology = Math.round(methodRaw * methodWeight * maxScore);
  details["methodology"] = {
    score: Math.round(methodRaw * 100),
    max: 100,
    note: methodology ? `${methodology.length} chars, score=${Math.round(methodRaw * 100)}%` : "No methodology provided",
  };

  // ── Performance scoring (requires valid structure) ───────────────────

  if (!validStructure || !weights || !rebalanceDates) {
    // Can't simulate without valid weights
    breakdown.correctness = 0;
    breakdown.analysis = 0;
    details["performance"] = { score: 0, max: 100, note: "Cannot simulate: invalid submission structure" };
    breakdown.total = Object.values(breakdown).reduce((s: number, v: unknown) => s + (typeof v === "number" ? v : 0), 0);
    return { breakdown, details };
  }

  // Simulate portfolio
  const sim = simulatePortfolio(weights, rebalanceDates, gt);

  // ── Correctness (45%) ──────────────────────────────────────────────

  const irRaw = irScore(sim.informationRatio);
  const sharpeRaw = sharpeScore(sim.sharpeRatio);
  const correctnessRaw = 0.7 * irRaw + 0.3 * sharpeRaw;

  const correctnessWeight = ALPHA_GENESIS_DIMENSIONS.find(d => d.key === "correctness")!.weight;
  breakdown.correctness = Math.round(correctnessRaw * correctnessWeight * maxScore);

  details["information_ratio"] = {
    score: Math.round(irRaw * 100),
    max: 100,
    note: `IR=${sim.informationRatio.toFixed(3)} (excess=${(sim.annualizedExcessReturn * 100).toFixed(2)}%, TE=${(sim.trackingError * 100).toFixed(2)}%)`,
  };
  details["sharpe_ratio"] = {
    score: Math.round(sharpeRaw * 100),
    max: 100,
    note: `Sharpe=${sim.sharpeRatio.toFixed(3)} (return=${(sim.annualizedReturn * 100).toFixed(2)}%, vol=${(sim.annualizedVol * 100).toFixed(2)}%)`,
  };

  // ── Analysis (20%) ────────────────────────────────────────────────

  const ddRaw = drawdownScore(sim.maxDrawdown);
  const vRaw = volScore(sim.annualizedVol);
  const divRaw = diversificationScore(sim.avgEffectiveN);
  const turnEfficiency = sim.annualTurnover > 0.001 ? sim.annualizedExcessReturn / sim.annualTurnover : 0;
  const teRaw = turnoverEfficiencyScore(turnEfficiency);

  const analysisRaw = 0.30 * ddRaw + 0.30 * vRaw + 0.20 * divRaw + 0.20 * teRaw;
  const analysisWeight = ALPHA_GENESIS_DIMENSIONS.find(d => d.key === "analysis")!.weight;
  breakdown.analysis = Math.round(analysisRaw * analysisWeight * maxScore);

  details["max_drawdown"] = {
    score: Math.round(ddRaw * 100),
    max: 100,
    note: `Max DD=${(sim.maxDrawdown * 100).toFixed(2)}%`,
  };
  details["volatility"] = {
    score: Math.round(vRaw * 100),
    max: 100,
    note: `Ann. vol=${(sim.annualizedVol * 100).toFixed(2)}%`,
  };
  details["diversification"] = {
    score: Math.round(divRaw * 100),
    max: 100,
    note: `Effective N=${sim.avgEffectiveN.toFixed(1)} positions`,
  };
  details["turnover_efficiency"] = {
    score: Math.round(teRaw * 100),
    max: 100,
    note: `Ann. turnover=${sim.annualTurnover.toFixed(2)}, efficiency=${turnEfficiency.toFixed(4)}`,
  };

  // ── Total ────────────────────────────────────────────────────────────

  breakdown.total = Object.entries(breakdown)
    .filter(([k]) => k !== "total")
    .reduce((s, [, v]) => s + (typeof v === "number" ? v : 0), 0);

  return { breakdown, details };
}
