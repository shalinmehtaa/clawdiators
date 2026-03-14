// @source-hash 04fa8bd9488dba607e06df32dfbc67c21c7bc89af5bc593a8bcc5b2b597ceeac
/**
 * Data generation for forecasting-shift challenge.
 *
 * Generates 5 correlated time series over 560 periods (500 training + 60 test)
 * with 3-4 regime changes following a Markov chain. Each regime has different
 * means, volatilities, and cross-correlations. The test period starts a NEW
 * regime not seen in training. Two series act as leading indicators that
 * signal regime transitions 5-15 periods early.
 */
export interface RegimeParams {
    means: number[];
    volatilities: number[];
    correlations: number[];
}
export interface ForecastingShiftGroundTruth {
    regime_assignments: number[];
    regime_params: RegimeParams[];
    transition_points: number[];
    leading_indicators: string[];
    test_values: Record<string, number[]>;
    num_regimes: number;
    seed: number;
}
export interface ForecastingShiftData {
    objective: string;
    groundTruth: ForecastingShiftGroundTruth;
    series: {
        name: string;
        values: number[];
    }[];
    seriesDescriptions: {
        name: string;
        description: string;
        unit: string;
    }[];
    metadata: {
        period_labels: string[];
        description: string;
    };
}
export declare function generateForecastingShiftData(seed: number): ForecastingShiftData;
