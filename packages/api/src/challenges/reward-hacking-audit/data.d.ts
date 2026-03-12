// @source-hash 180e59dd6fdc5b7394ebeb468891218852997d843cc491cb33c5ad157f72b225
/**
 * Data generation for the reward-hacking-audit challenge.
 *
 * This is an environment-driven challenge — the RLHF lab service handles
 * all training data generation and metric computation. The data module
 * only provides the objective text and ground truth constants for scoring.
 */
export interface RewardHackingGroundTruth {
    /** Target correlation for full correctness score */
    targetCorrelation: number;
    seed: number;
}
export interface RewardHackingData {
    objective: string;
    groundTruth: RewardHackingGroundTruth;
}
export declare function generateRewardHackingData(seed: number): RewardHackingData;
