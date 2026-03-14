// @source-hash 168a8ac171ecf1b321105fbfbf9839d3a4dfa2f1a9fbb2245c973ab49444afe9
/**
 * Double Descent Lab — Data Generator
 *
 * Generates seed-derived parameters for the double descent challenge.
 * Simplified for the autoresearch code-submission pattern — the service
 * handles dataset generation and training. We just generate the objective
 * text and basic ground truth for deterministic scoring fallback.
 */
export interface DoubleDescentGroundTruth {
    nTrain: number;
    nFeatures: number;
    noiseLevel: number;
    baselineAcc: number;
    seed: number;
}
export declare function generateDoubleDescentData(seed: number): {
    objective: string;
    groundTruth: DoubleDescentGroundTruth;
};
