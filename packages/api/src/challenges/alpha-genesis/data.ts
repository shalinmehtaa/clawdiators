// ── Alpha Genesis: Deterministic Market Data Generator ──────────────────
//
// Generates a realistic multi-year synthetic market universe with:
//   - 40 assets across 5 sectors
//   - Hidden regime process (bull / sideways / crisis)
//   - Multi-factor return model (market, sector, momentum, value)
//   - GARCH(1,1) volatility clustering per asset
//   - Fat-tailed returns (mixture of normals)
//   - Weak alpha signals (4 types, regime-dependent)
//   - Regime-dependent correlations (breakdown in crisis)
//   - Fundamental data (quarterly) and macro indicators (daily)
//
// ALL randomness flows through a seeded mulberry32 PRNG — same seed = same data.

// ── PRNG ────────────────────────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalRandom(rng: () => number): number {
  // Box-Muller transform
  const u1 = rng() + 1e-10; // avoid log(0)
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function fatTailRandom(rng: () => number): number {
  // Mixture of normals: 92% N(0,1) + 8% N(0, 2.5)
  // E[z²] = 0.92*1 + 0.08*6.25 = 0.92 + 0.50 = 1.42
  // Creates kurtosis ~4.2 (realistic for daily equity returns)
  // Critically: keeps GARCH stable since alpha*E[z²] + beta < 1
  if (rng() < 0.92) {
    return normalRandom(rng);
  }
  return normalRandom(rng) * 2.5;
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ── Constants ───────────────────────────────────────────────────────────

const NUM_ASSETS = 40;
const ASSETS_PER_SECTOR = 8;
const TOTAL_DAYS = 1260;   // ~5 years
const TRAIN_DAYS = 756;    // ~3 years
const TEST_DAYS = 504;     // ~2 years
const QUARTERS = 20;       // 5 years of quarters
const DAYS_PER_QUARTER = 63;

const SECTORS = ["Technology", "Healthcare", "Energy", "Financials", "Consumer"] as const;

// Regime parameters: [drift_ann, vol_ann]
const REGIME_PARAMS = {
  bull:     { drift: 0.15,  vol: 0.14 },
  sideways: { drift: 0.03,  vol: 0.18 },
  crisis:   { drift: -0.20, vol: 0.32 },
} as const;

type RegimeState = "bull" | "sideways" | "crisis";
const REGIME_STATES: RegimeState[] = ["bull", "sideways", "crisis"];

// Transition matrix: P[from][to]
// High diagonal persistence, realistic regime durations
const TRANSITION_MATRIX = [
  [0.985, 0.010, 0.005],  // bull → ...
  [0.015, 0.975, 0.010],  // sideways → ...
  [0.010, 0.025, 0.965],  // crisis → ...
];

// Sector factor volatilities by regime (annualized)
const SECTOR_VOL_BY_REGIME: Record<RegimeState, number[]> = {
  bull:     [0.12, 0.10, 0.14, 0.11, 0.09],
  sideways: [0.15, 0.13, 0.18, 0.14, 0.12],
  crisis:   [0.25, 0.20, 0.30, 0.28, 0.18],
};

// Style factor parameters by regime [drift_ann, vol_ann]
const MOMENTUM_BY_REGIME: Record<RegimeState, { drift: number; vol: number }> = {
  bull:     { drift: 0.04,  vol: 0.08 },
  sideways: { drift: 0.00,  vol: 0.10 },
  crisis:   { drift: -0.06, vol: 0.15 },
};

const VALUE_BY_REGIME: Record<RegimeState, { drift: number; vol: number }> = {
  bull:     { drift: 0.02,  vol: 0.06 },
  sideways: { drift: 0.02,  vol: 0.08 },
  crisis:   { drift: 0.05,  vol: 0.12 },
};

// Correlation parameters by regime
const WITHIN_SECTOR_CORR: Record<RegimeState, number> = { bull: 0.40, sideways: 0.50, crisis: 0.70 };
const CROSS_SECTOR_CORR:  Record<RegimeState, number> = { bull: 0.15, sideways: 0.25, crisis: 0.55 };

// GARCH(1,1) parameters (shared across assets, realistic equity values)
// With fat-tail mixture E[z²]≈1.42, need alpha*1.42 + beta < 1
// 0.04*1.42 + 0.91 = 0.9668 < 1 ✓ (stationary)
const GARCH_OMEGA = 0.000004;  // long-run variance floor
const GARCH_ALPHA = 0.04;      // shock sensitivity (reduced for fat-tail stability)
const GARCH_BETA = 0.91;       // persistence
const GARCH_VAR_CAP = 0.005;   // cap daily variance at ~sqrt(0.005)*sqrt(252) ≈ 112% ann vol

// Alpha signal magnitudes (daily, very small — these are the weak signals agents must find)
const ALPHA_MOMENTUM_BULL_DAILY = 0.02 / 252;       // +2% ann in bull
const ALPHA_MOMENTUM_CRISIS_DAILY = -0.015 / 252;   // -1.5% ann in crisis
const ALPHA_MEANREV_NORBULL_DAILY = 0.015 / 252;    // +1.5% ann in sideways/crisis
const ALPHA_FUNDAMENTAL_DAILY = 0.01 / 252;          // +1% ann in all regimes
const ALPHA_CROSSSECT_DAILY = 0.012 / 252;           // +1.2% ann pair trade

// Macro indicator parameters
const RATE_BY_REGIME: Record<RegimeState, number> = { bull: 0.03, sideways: 0.02, crisis: 0.005 };
const CREDIT_SPREAD_BY_REGIME: Record<RegimeState, number> = { bull: 0.01, sideways: 0.02, crisis: 0.05 };

// Asset name generation pools
const TICKER_PREFIXES = [
  "AXN", "BRK", "CYB", "DRF", "ELX", "FNX", "GRD", "HVN",
  "INV", "JTR", "KLM", "LNR", "MXD", "NVL", "OPX", "PRG",
  "QST", "RFT", "SYN", "TRX", "ULT", "VCT", "WVE", "XEN",
  "YLD", "ZNT", "ARK", "BLZ", "CRS", "DYN", "ECH", "FLX",
  "GLB", "HRZ", "IMP", "JVN", "KNX", "LGC", "MPH", "NRG",
];

const COMPANY_NAMES = [
  "Axion Systems", "Berkfield Holdings", "CyberDrift Corp", "Driftwave Inc", "Elix Technologies",
  "Fenix Dynamics", "GridForge Ltd", "Haven Biosciences", "Invicta Partners", "Jettir Energy",
  "Kelmar Industries", "Lunar Resources", "Maxfield Data", "Novel Pharma", "Opex Solutions",
  "Progenix Labs", "Questmark Capital", "Riftstone Mining", "Synapse AI", "Truxon Financial",
  "Ultravest Corp", "Victus Health", "WavePoint Energy", "Xenith Materials", "Yielder Finance",
  "Zenith Networks", "Arkwright Tech", "Blaze Renewables", "Crestline Med", "Dynacorp Services",
  "Echelon Group", "Flexpoint Capital", "Globex Trading", "Horizon Retail", "Impact Logistics",
  "Javelin Power", "Kinex Semiconductors", "Logicware Systems", "Morpheus Analytics", "NovaPrime Energy",
];

// ── Types ───────────────────────────────────────────────────────────────

export interface AssetMetadata {
  id: number;
  ticker: string;
  name: string;
  sector: string;
  sectorIndex: number;
  baseVol: number;
  marketCap: number;        // initial market cap (for cap-weighting)
  betaMarket: number;
  betaSector: number;
  betaMomentum: number;
  betaValue: number;
  alphaType: "none" | "momentum" | "mean_reversion" | "fundamental" | "cross_sectional";
}

export interface AlphaDataResult {
  // Training data (provided to agent)
  prices: number[][];         // [TRAIN_DAYS][NUM_ASSETS]
  returns: number[][];        // [TRAIN_DAYS-1][NUM_ASSETS] log returns
  volumes: number[][];        // [TRAIN_DAYS][NUM_ASSETS]
  fundamentals: FundamentalRow[];
  macro: MacroRow[];
  correlationMatrix: number[][];  // 40x40 trailing 60-day correlation (last train day)
  metadata: AssetMetadata[];
  trainDates: string[];       // YYYY-MM-DD dates

  // Test period info (dates only, no prices)
  testDates: string[];

  // Benchmark
  benchmarkWeights: number[]; // cap-weighted
  benchmarkTrainReturns: number[];  // daily benchmark returns during training

  // Ground truth (hidden from agent, used by scorer)
  groundTruth: AlphaGroundTruth;

  // Full description
  objective: string;
}

export interface AlphaGroundTruth {
  testReturns: number[][];    // [TEST_DAYS][NUM_ASSETS] daily returns in test period
  testPrices: number[][];     // [TEST_DAYS][NUM_ASSETS] daily prices in test period
  benchmarkWeights: number[]; // cap-weighted benchmark
  benchmarkTestReturns: number[];  // daily benchmark returns during test
  regimeSequence: number[];   // regime index for each test day (for analysis, not scoring)
  riskFreeDaily: number[];    // daily risk-free rate during test period
  metadata: AssetMetadata[];
}

export interface FundamentalRow {
  date: string;
  assetId: number;
  ticker: string;
  earningsGrowth: number;
  peRatio: number;
  debtEquity: number;
  revenueGrowth: number;
}

export interface MacroRow {
  date: string;
  rateProxy: number;
  volIndex: number;
  creditSpread: number;
  yieldCurveSlope: number;
}

// ── Data Generator ──────────────────────────────────────────────────────

export function generateAlphaData(seed: number): AlphaDataResult {
  const rng = mulberry32(seed);

  // ── Step 1: Generate asset metadata ──────────────────────────────────

  const tickers = shuffle([...TICKER_PREFIXES], rng).slice(0, NUM_ASSETS);
  const names = shuffle([...COMPANY_NAMES], rng).slice(0, NUM_ASSETS);

  const metadata: AssetMetadata[] = [];
  for (let i = 0; i < NUM_ASSETS; i++) {
    const sectorIndex = Math.floor(i / ASSETS_PER_SECTOR);
    const sector = SECTORS[sectorIndex];

    // Factor loadings — drawn from realistic ranges
    const betaMarket = 0.7 + rng() * 0.8;       // 0.7–1.5
    const betaSector = 0.3 + rng() * 0.5;        // 0.3–0.8
    const betaMomentum = -0.3 + rng() * 0.6;     // -0.3–0.3
    const betaValue = -0.2 + rng() * 0.4;        // -0.2–0.2
    const baseVol = 0.10 + rng() * 0.15;         // 10%–25% annualized idiosyncratic vol
    const marketCap = Math.exp(8 + rng() * 4);   // ~$3K–$160K (arbitrary units, for weighting)

    metadata.push({
      id: i,
      ticker: tickers[i],
      name: names[i],
      sector,
      sectorIndex,
      baseVol,
      marketCap,
      betaMarket,
      betaSector,
      betaMomentum,
      betaValue,
      alphaType: "none",
    });
  }

  // ── Step 2: Assign alpha signals to specific assets ──────────────────

  // Pick assets for each alpha type (shuffled to vary by seed)
  const alphaIndices = shuffle([...Array(NUM_ASSETS).keys()], rng);
  let aIdx = 0;

  // Signal A: 3 momentum-alpha assets
  for (let k = 0; k < 3; k++) {
    metadata[alphaIndices[aIdx++]].alphaType = "momentum";
  }
  // Signal B: 2 mean-reversion-alpha assets
  for (let k = 0; k < 2; k++) {
    metadata[alphaIndices[aIdx++]].alphaType = "mean_reversion";
  }
  // Signal C: 2 fundamental-alpha assets
  for (let k = 0; k < 2; k++) {
    metadata[alphaIndices[aIdx++]].alphaType = "fundamental";
  }
  // Signal D: 1 cross-sectional alpha asset
  metadata[alphaIndices[aIdx]].alphaType = "cross_sectional";

  // ── Step 3: Generate regime sequence ─────────────────────────────────

  const regimes: number[] = new Array(TOTAL_DAYS);

  // Start in a regime determined by seed
  let currentRegime = Math.floor(rng() * 3);
  // Ensure training period starts with a good regime for fitting
  // and test period sees a regime change
  if (currentRegime === 2) currentRegime = 0; // avoid starting in crisis

  regimes[0] = currentRegime;
  for (let d = 1; d < TOTAL_DAYS; d++) {
    const u = rng();
    const row = TRANSITION_MATRIX[currentRegime];
    let cum = 0;
    let nextRegime = currentRegime;
    for (let j = 0; j < 3; j++) {
      cum += row[j];
      if (u < cum) {
        nextRegime = j;
        break;
      }
    }
    // Force a regime change near the train/test boundary to create structural break
    if (d === TRAIN_DAYS - 30 && nextRegime === currentRegime) {
      // Push to a different regime with 60% probability
      if (rng() < 0.6) {
        nextRegime = (currentRegime + 1 + Math.floor(rng() * 2)) % 3;
      }
    }
    currentRegime = nextRegime;
    regimes[d] = currentRegime;
  }

  // ── Step 4: Generate factor returns ──────────────────────────────────

  const marketReturns: number[] = new Array(TOTAL_DAYS);
  const sectorReturns: number[][] = Array.from({ length: 5 }, () => new Array(TOTAL_DAYS));
  const momentumReturns: number[] = new Array(TOTAL_DAYS);
  const valueReturns: number[] = new Array(TOTAL_DAYS);

  // GARCH state for market factor (use standardized residuals to avoid explosion)
  let marketVar = Math.pow(REGIME_PARAMS.bull.vol / Math.sqrt(252), 2);

  for (let d = 0; d < TOTAL_DAYS; d++) {
    const regime = REGIME_STATES[regimes[d]];
    const rp = REGIME_PARAMS[regime];

    // Market factor with GARCH volatility
    const regimeVar = Math.pow(rp.vol / Math.sqrt(252), 2);
    // Blend GARCH with regime vol (GARCH provides clustering, regime provides level)
    const effectiveVar = Math.min(0.6 * marketVar + 0.4 * regimeVar, GARCH_VAR_CAP);
    const effectiveVol = Math.sqrt(effectiveVar);
    const z = fatTailRandom(rng);
    const shock = z * effectiveVol;
    const drift = rp.drift / 252;
    // AR(1) with very weak autocorrelation
    marketReturns[d] = drift + shock + 0.03 * (d > 0 ? marketReturns[d - 1] - drift : 0);
    // GARCH update using squared shock (not standardized)
    marketVar = GARCH_OMEGA + GARCH_ALPHA * shock * shock + GARCH_BETA * marketVar;
    marketVar = Math.min(marketVar, GARCH_VAR_CAP);

    // Sector factors — use proper common/specific decomposition for cross-sector correlation
    const sectorVols = SECTOR_VOL_BY_REGIME[regime];
    const crossCorr = CROSS_SECTOR_CORR[regime];
    const commonZ = normalRandom(rng); // shared across all sectors
    for (let s = 0; s < 5; s++) {
      const sVol = sectorVols[s] / Math.sqrt(252);
      const specificZ = normalRandom(rng);
      // Cholesky-like: sector = sqrt(crossCorr)*common + sqrt(1-crossCorr)*specific
      const sectorZ = Math.sqrt(crossCorr) * commonZ + Math.sqrt(1 - crossCorr) * specificZ;
      sectorReturns[s][d] = sectorZ * sVol;
    }

    // Momentum factor
    const momParams = MOMENTUM_BY_REGIME[regime];
    momentumReturns[d] = momParams.drift / 252 + normalRandom(rng) * (momParams.vol / Math.sqrt(252));

    // Value factor
    const valParams = VALUE_BY_REGIME[regime];
    valueReturns[d] = valParams.drift / 252 + normalRandom(rng) * (valParams.vol / Math.sqrt(252));
  }

  // ── Step 5: Generate asset returns ───────────────────────────────────

  const allReturns: number[][] = Array.from({ length: TOTAL_DAYS }, () => new Array(NUM_ASSETS));
  const garchVar: number[] = new Array(NUM_ASSETS);

  // Initialize GARCH states
  for (let i = 0; i < NUM_ASSETS; i++) {
    garchVar[i] = Math.pow(metadata[i].baseVol / Math.sqrt(252), 2);
  }

  // For cross-sectional alpha: track sector average returns
  const sectorAvgReturn: number[] = new Array(5).fill(0);

  // Pre-generate within-sector common shocks (one per sector per day)
  // This creates proper within-sector correlation via shared factor
  for (let d = 0; d < TOTAL_DAYS; d++) {
    const regime = REGIME_STATES[regimes[d]];
    const withinCorr = WITHIN_SECTOR_CORR[regime];

    // Generate one common shock per sector for within-sector correlation
    const sectorCommonZ: number[] = [];
    for (let s = 0; s < 5; s++) {
      sectorCommonZ.push(normalRandom(rng));
    }

    // First pass: compute raw returns (needed for cross-sectional alpha)
    for (let i = 0; i < NUM_ASSETS; i++) {
      const m = metadata[i];

      // Factor component
      const factorReturn = m.betaMarket * marketReturns[d]
                       + m.betaSector * sectorReturns[m.sectorIndex][d]
                       + m.betaMomentum * momentumReturns[d]
                       + m.betaValue * valueReturns[d];

      // Alpha signal
      let alpha = 0;
      switch (m.alphaType) {
        case "momentum":
          alpha = regime === "bull" ? ALPHA_MOMENTUM_BULL_DAILY
                : regime === "crisis" ? ALPHA_MOMENTUM_CRISIS_DAILY
                : 0;
          break;
        case "mean_reversion":
          alpha = regime !== "bull" ? ALPHA_MEANREV_NORBULL_DAILY : 0;
          break;
        case "fundamental":
          // Constant small alpha + noise (the fundamental data will also hint at this)
          alpha = ALPHA_FUNDAMENTAL_DAILY + (rng() - 0.5) * ALPHA_FUNDAMENTAL_DAILY * 0.5;
          break;
        case "cross_sectional":
          // Will be computed after first pass — use 0 for now
          alpha = 0;
          break;
      }

      // Idiosyncratic return with GARCH and within-sector correlation
      // Use Cholesky: idio = sqrt(withinCorr)*sectorCommon + sqrt(1-withinCorr)*specific
      const specificZ = fatTailRandom(rng);
      const idioZ = Math.sqrt(withinCorr) * sectorCommonZ[m.sectorIndex]
                   + Math.sqrt(1 - withinCorr) * specificZ;

      const idioVol = Math.sqrt(garchVar[i]);
      const idioShock = idioZ * idioVol;

      // GARCH update with variance cap
      garchVar[i] = GARCH_OMEGA + GARCH_ALPHA * idioShock * idioShock + GARCH_BETA * garchVar[i];
      garchVar[i] = Math.min(garchVar[i], GARCH_VAR_CAP);

      allReturns[d][i] = factorReturn + alpha + idioShock;
    }

    // Compute sector averages for cross-sectional alpha
    for (let s = 0; s < 5; s++) {
      let sum = 0;
      for (let j = s * ASSETS_PER_SECTOR; j < (s + 1) * ASSETS_PER_SECTOR; j++) {
        sum += allReturns[d][j];
      }
      sectorAvgReturn[s] = sum / ASSETS_PER_SECTOR;
    }

    // Second pass: apply cross-sectional alpha
    for (let i = 0; i < NUM_ASSETS; i++) {
      if (metadata[i].alphaType === "cross_sectional") {
        // Pair trade: alpha proportional to negative of sector avg
        allReturns[d][i] += -sectorAvgReturn[metadata[i].sectorIndex] * ALPHA_CROSSSECT_DAILY * 252;
      }
    }
  }

  // ── Step 6: Convert returns to prices ────────────────────────────────

  const allPrices: number[][] = Array.from({ length: TOTAL_DAYS }, () => new Array(NUM_ASSETS));

  for (let i = 0; i < NUM_ASSETS; i++) {
    // Starting price: $20-$500 range
    allPrices[0][i] = 20 + rng() * 480;
    for (let d = 1; d < TOTAL_DAYS; d++) {
      allPrices[d][i] = allPrices[d - 1][i] * Math.exp(allReturns[d][i]);
      // Floor to prevent negative prices
      if (allPrices[d][i] < 0.01) allPrices[d][i] = 0.01;
    }
  }

  // ── Step 7: Generate volumes ─────────────────────────────────────────

  const allVolumes: number[][] = Array.from({ length: TOTAL_DAYS }, () => new Array(NUM_ASSETS));

  for (let i = 0; i < NUM_ASSETS; i++) {
    const baseVolume = 100000 + rng() * 900000; // 100K–1M shares/day
    for (let d = 0; d < TOTAL_DAYS; d++) {
      const regime = REGIME_STATES[regimes[d]];
      // Volume increases with volatility and during regime changes
      const volMultiplier = regime === "crisis" ? 1.8 : regime === "sideways" ? 1.1 : 1.0;
      // Volume spike on large absolute returns
      const absReturn = Math.abs(allReturns[d][i]);
      const returnMultiplier = 1 + absReturn * 20;
      allVolumes[d][i] = Math.round(baseVolume * volMultiplier * returnMultiplier * (0.7 + rng() * 0.6));
    }
  }

  // ── Step 8: Generate dates ───────────────────────────────────────────

  const startDate = new Date(2020, 0, 2); // Jan 2, 2020
  const allDates: string[] = [];
  let currentDate = new Date(startDate);

  for (let d = 0; d < TOTAL_DAYS; d++) {
    // Skip weekends
    while (currentDate.getDay() === 0 || currentDate.getDay() === 6) {
      currentDate.setDate(currentDate.getDate() + 1);
    }
    allDates.push(formatDate(currentDate));
    currentDate.setDate(currentDate.getDate() + 1);
  }

  const trainDates = allDates.slice(0, TRAIN_DAYS);
  const testDates = allDates.slice(TRAIN_DAYS);

  // ── Step 9: Generate fundamental data ────────────────────────────────

  const fundamentals: FundamentalRow[] = [];

  // Track trailing earnings for P/E calculation
  const trailingEarnings: number[] = metadata.map(m => allPrices[0][m.id] / (10 + rng() * 20)); // initial P/E 10-30

  for (let q = 0; q < QUARTERS; q++) {
    const dayIndex = Math.min(q * DAYS_PER_QUARTER, TOTAL_DAYS - 1);
    const date = allDates[dayIndex];
    const regime = REGIME_STATES[regimes[dayIndex]];

    for (let i = 0; i < NUM_ASSETS; i++) {
      const m = metadata[i];

      // Base earnings growth by regime and sector
      const regimeEffect = regime === "bull" ? 0.03 : regime === "sideways" ? 0.01 : -0.04;
      const sectorEffect = (m.sectorIndex - 2) * 0.005; // tech grows faster, energy lags
      let earningsGrowth = regimeEffect + sectorEffect + normalRandom(rng) * 0.02;

      // Fundamental-alpha assets get earnings surprises
      if (m.alphaType === "fundamental") {
        earningsGrowth += 0.015 + normalRandom(rng) * 0.005; // persistent positive surprise
      }

      // Update trailing earnings
      trailingEarnings[i] *= (1 + earningsGrowth);
      if (trailingEarnings[i] < 0.01) trailingEarnings[i] = 0.01;

      // P/E ratio from price and earnings
      const price = allPrices[dayIndex][i];
      const peRatio = price / trailingEarnings[i];

      // Debt/equity: sector-dependent base + random walk
      const sectorDebt = [0.3, 0.4, 0.6, 0.8, 0.5][m.sectorIndex];
      const debtEquity = Math.max(0.05, sectorDebt + normalRandom(rng) * 0.15);

      // Revenue growth: correlated with earnings but noisier
      const revenueGrowth = earningsGrowth * 0.7 + normalRandom(rng) * 0.03;

      fundamentals.push({
        date,
        assetId: i,
        ticker: m.ticker,
        earningsGrowth: round(earningsGrowth, 4),
        peRatio: round(peRatio, 2),
        debtEquity: round(debtEquity, 3),
        revenueGrowth: round(revenueGrowth, 4),
      });
    }
  }

  // ── Step 10: Generate macro indicators ───────────────────────────────

  const macro: MacroRow[] = [];
  let rate = RATE_BY_REGIME.bull;
  let creditSpread = CREDIT_SPREAD_BY_REGIME.bull;
  let volEwma = 0.15; // exponentially weighted vol

  for (let d = 0; d < TOTAL_DAYS; d++) {
    const regime = REGIME_STATES[regimes[d]];
    const targetRate = RATE_BY_REGIME[regime];
    const targetSpread = CREDIT_SPREAD_BY_REGIME[regime];

    // Rate mean-reverts to regime target
    rate += 0.02 * (targetRate - rate) + normalRandom(rng) * 0.001;
    rate = Math.max(0, Math.min(0.08, rate));

    // Credit spread — leads regime transitions by ~10-20 days
    // (it responds to the transition matrix, not the current state)
    const futureDay = Math.min(d + 15, TOTAL_DAYS - 1);
    const futureRegime = REGIME_STATES[regimes[futureDay]];
    const leadTargetSpread = CREDIT_SPREAD_BY_REGIME[futureRegime];
    creditSpread += 0.05 * (leadTargetSpread - creditSpread) + normalRandom(rng) * 0.002;
    creditSpread = Math.max(0.002, Math.min(0.10, creditSpread));

    // Vol index: EWMA of absolute market returns
    const absRet = Math.abs(marketReturns[d]);
    volEwma = 0.94 * volEwma + 0.06 * absRet * Math.sqrt(252);
    const volIndex = volEwma;

    // Yield curve slope
    const yieldSlope = regime === "bull" ? 0.015 : regime === "sideways" ? 0.005 : -0.008;
    const slope = yieldSlope + normalRandom(rng) * 0.003;

    macro.push({
      date: allDates[d],
      rateProxy: round(rate, 5),
      volIndex: round(volIndex, 4),
      creditSpread: round(creditSpread, 5),
      yieldCurveSlope: round(slope, 5),
    });
  }

  // ── Step 11: Compute correlation matrix (trailing 60-day) ────────────

  const corrWindow = 60;
  const corrStart = TRAIN_DAYS - corrWindow;
  const corrReturns = allReturns.slice(corrStart, TRAIN_DAYS);

  // Compute means
  const means: number[] = new Array(NUM_ASSETS).fill(0);
  for (let d = 0; d < corrWindow; d++) {
    for (let i = 0; i < NUM_ASSETS; i++) {
      means[i] += corrReturns[d][i] / corrWindow;
    }
  }

  // Compute correlation matrix
  const correlationMatrix: number[][] = Array.from({ length: NUM_ASSETS }, () => new Array(NUM_ASSETS).fill(0));
  const stddevs: number[] = new Array(NUM_ASSETS).fill(0);

  for (let d = 0; d < corrWindow; d++) {
    for (let i = 0; i < NUM_ASSETS; i++) {
      stddevs[i] += Math.pow(corrReturns[d][i] - means[i], 2);
    }
  }
  for (let i = 0; i < NUM_ASSETS; i++) {
    stddevs[i] = Math.sqrt(stddevs[i] / (corrWindow - 1));
  }

  for (let i = 0; i < NUM_ASSETS; i++) {
    for (let j = i; j < NUM_ASSETS; j++) {
      if (i === j) {
        correlationMatrix[i][j] = 1.0;
        continue;
      }
      let cov = 0;
      for (let d = 0; d < corrWindow; d++) {
        cov += (corrReturns[d][i] - means[i]) * (corrReturns[d][j] - means[j]);
      }
      cov /= (corrWindow - 1);
      const corr = stddevs[i] > 0 && stddevs[j] > 0 ? cov / (stddevs[i] * stddevs[j]) : 0;
      correlationMatrix[i][j] = round(Math.max(-1, Math.min(1, corr)), 4);
      correlationMatrix[j][i] = correlationMatrix[i][j];
    }
  }

  // ── Step 12: Compute benchmark ───────────────────────────────────────

  // Cap-weighted benchmark using initial market caps
  const totalCap = metadata.reduce((s, m) => s + m.marketCap, 0);
  const benchmarkWeights = metadata.map(m => m.marketCap / totalCap);

  // Benchmark training returns (cap-weighted, rebalanced quarterly)
  const benchmarkTrainReturns: number[] = [];
  let bWeights = [...benchmarkWeights];
  for (let d = 1; d < TRAIN_DAYS; d++) {
    // Portfolio return
    let ret = 0;
    for (let i = 0; i < NUM_ASSETS; i++) {
      ret += bWeights[i] * allReturns[d][i];
    }
    benchmarkTrainReturns.push(ret);

    // Drift weights
    for (let i = 0; i < NUM_ASSETS; i++) {
      bWeights[i] *= Math.exp(allReturns[d][i]);
    }
    const totalW = bWeights.reduce((s, w) => s + w, 0);
    for (let i = 0; i < NUM_ASSETS; i++) bWeights[i] /= totalW;

    // Quarterly rebalance
    if (d % DAYS_PER_QUARTER === 0) {
      bWeights = [...benchmarkWeights];
    }
  }

  // Benchmark test returns
  const benchmarkTestReturns: number[] = [];
  bWeights = [...benchmarkWeights];
  for (let d = 0; d < TEST_DAYS; d++) {
    const actualD = TRAIN_DAYS + d;
    let ret = 0;
    for (let i = 0; i < NUM_ASSETS; i++) {
      ret += bWeights[i] * allReturns[actualD][i];
    }
    benchmarkTestReturns.push(ret);

    // Drift weights
    for (let i = 0; i < NUM_ASSETS; i++) {
      bWeights[i] *= Math.exp(allReturns[actualD][i]);
    }
    const totalW = bWeights.reduce((s, w) => s + w, 0);
    for (let i = 0; i < NUM_ASSETS; i++) bWeights[i] /= totalW;

    // Quarterly rebalance
    if (d > 0 && d % DAYS_PER_QUARTER === 0) {
      bWeights = [...benchmarkWeights];
    }
  }

  // Risk-free rates for test period
  const riskFreeDaily: number[] = [];
  for (let d = 0; d < TEST_DAYS; d++) {
    const macroIdx = TRAIN_DAYS + d;
    riskFreeDaily.push(macro[macroIdx].rateProxy / 252);
  }

  // ── Step 13: Split and return ────────────────────────────────────────

  const trainPrices = allPrices.slice(0, TRAIN_DAYS);
  const trainReturns = allReturns.slice(1, TRAIN_DAYS); // returns are day-over-day
  const trainVolumes = allVolumes.slice(0, TRAIN_DAYS);
  const trainMacro = macro.slice(0, TRAIN_DAYS);
  const trainFundamentals = fundamentals.filter(f => {
    const fDate = f.date;
    return trainDates.includes(fDate);
  });

  const testReturns = allReturns.slice(TRAIN_DAYS);
  const testPrices = allPrices.slice(TRAIN_DAYS);

  // Strip alpha type from metadata exposed to agent (they must discover it)
  const agentMetadata = metadata.map(m => ({
    ...m,
    alphaType: undefined as unknown as AssetMetadata["alphaType"],
  }));
  // Remove alphaType key entirely
  const cleanMetadata = agentMetadata.map(({ alphaType: _, ...rest }) => rest);

  return {
    prices: trainPrices,
    returns: trainReturns,
    volumes: trainVolumes,
    fundamentals: trainFundamentals,
    macro: trainMacro,
    correlationMatrix,
    metadata: cleanMetadata as unknown as AssetMetadata[],
    trainDates,
    testDates,
    benchmarkWeights: benchmarkWeights.map(w => round(w, 6)),
    benchmarkTrainReturns: benchmarkTrainReturns.map(r => round(r, 8)),
    groundTruth: {
      testReturns,
      testPrices,
      benchmarkWeights,
      benchmarkTestReturns,
      regimeSequence: regimes.slice(TRAIN_DAYS),
      riskFreeDaily,
      metadata,
    },
    objective: "Build a quantitative trading algorithm that outperforms the capitalization-weighted benchmark on risk-adjusted returns over a 2-year out-of-sample test period. You have 3 years of training data including prices, volumes, fundamentals, and macro indicators for 40 assets across 5 sectors.",
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────

function round(n: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(n * factor) / factor;
}

function formatDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
