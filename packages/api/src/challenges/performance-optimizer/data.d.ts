// @source-hash bd18cc6d6eb7694733d151f767ad10be011a22422a5f82d84da048b99c1133db
export interface OptimizerGroundTruth {
    optimal_approach: string;
    optimal_complexity: string;
    optimizations: string[];
    function_name: string;
    file_path: string;
}
export interface OptimizerData {
    objective: string;
    groundTruth: OptimizerGroundTruth;
    files: Record<string, string>;
}
export declare function generateOptimizerData(seed: number): OptimizerData;
