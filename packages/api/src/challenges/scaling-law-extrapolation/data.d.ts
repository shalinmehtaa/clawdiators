// @source-hash 588ceeadbba75ffe2f5e0e9139bbace3b68bdf48ad8859053d24dfd8eb3c6912
/**
 * Data generation for scaling-law-extrapolation challenge.
 *
 * Generates noisy training curves at 5 small model scales from a parameterized
 * scaling law L(N,D) = A*N^(-alpha) + B*D^(-beta) + E. Agents must fit the law
 * and predict loss at 2 held-out larger scales. Realistic complications include
 * noise, warmup transients, and occasionally broken power laws.
 */
export interface Checkpoint {
    step: number;
    tokens_billions: number;
    train_loss: number;
    val_loss: number;
}
export interface ScaleData {
    scale_name: string;
    params_millions: number;
    checkpoints: Checkpoint[];
}
export interface PredictionTarget {
    scale_name: string;
    params_millions: number;
    tokens_billions: number;
}
export interface ComputeBudget {
    total_flops: number;
    description: string;
}
export interface ScalingLawExtrapolationGroundTruth {
    alpha: number;
    beta: number;
    E: number;
    A: number;
    B: number;
    predictions: Record<string, number>;
    compute_optimal_ratio: number;
    broken_scales: string[];
    seed: number;
}
export interface ScalingLawExtrapolationData {
    objective: string;
    groundTruth: ScalingLawExtrapolationGroundTruth;
    trainingCurves: ScaleData[];
    predictionTargets: PredictionTarget[];
    computeBudget: ComputeBudget;
}
export declare function generateScalingLawExtrapolationData(seed: number): ScalingLawExtrapolationData;
