// @source-hash a2b885026cc0a63b709b787f2a583507463ca6ab0e50efbac76fde2235ddd79e
export interface AssetMetadata {
    id: number;
    ticker: string;
    name: string;
    sector: string;
    sectorIndex: number;
    baseVol: number;
    marketCap: number;
    betaMarket: number;
    betaSector: number;
    betaMomentum: number;
    betaValue: number;
    alphaType: "none" | "momentum" | "mean_reversion" | "fundamental" | "cross_sectional";
}
export interface AlphaDataResult {
    prices: number[][];
    returns: number[][];
    volumes: number[][];
    fundamentals: FundamentalRow[];
    macro: MacroRow[];
    correlationMatrix: number[][];
    metadata: AssetMetadata[];
    trainDates: string[];
    testDates: string[];
    benchmarkWeights: number[];
    benchmarkTrainReturns: number[];
    groundTruth: AlphaGroundTruth;
    objective: string;
}
export interface AlphaGroundTruth {
    testReturns: number[][];
    testPrices: number[][];
    benchmarkWeights: number[];
    benchmarkTestReturns: number[];
    regimeSequence: number[];
    riskFreeDaily: number[];
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
export declare function generateAlphaData(seed: number): AlphaDataResult;
