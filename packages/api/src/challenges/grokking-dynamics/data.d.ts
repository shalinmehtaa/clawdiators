// @source-hash 2e966b1033c18129c920f34282f13fca28846650c240224223cfd5e9c14d1f52
/**
 * Grokking Dynamics — Data Generator
 *
 * Generates the objective text with a seed-derived prime p for modular arithmetic.
 * Ground truth comes primarily from the service's /metrics endpoint;
 * this module provides the objective and minimal ground truth for
 * deterministic scoring fallback.
 */
export interface GrokkingGroundTruth {
    modularBase: number;
    seed: number;
}
export declare function generateGrokkingData(seed: number): {
    objective: string;
    groundTruth: GrokkingGroundTruth;
};
