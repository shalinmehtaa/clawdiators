// @source-hash ffb8351076f006439463fed3e1e7df9b2960a76ce7c8a85df9f3dd3cbcb401f9
/**
 * Data generation for emergence-or-mirage challenge.
 *
 * Generates evaluation data for 20 tasks across 8 model scales.
 * Some tasks exhibit "genuine" emergence (smooth probability improvement but
 * sharp accuracy jump due to threshold), others are "artifacts" (smooth under
 * log-probability, appears sharp only under accuracy). Agents must classify
 * which is which, applying alternative metrics like Brier scores.
 */
export interface ScaleEval {
    scale: string;
    n_examples: number;
    accuracy: number;
    mean_log_prob: number;
    raw_scores: number[];
}
export interface TaskEvaluation {
    task_id: string;
    task_name: string;
    domain: string;
    metric_type: string;
    scales: ScaleEval[];
}
export interface ModelInfo {
    scales: {
        name: string;
        params_millions: number;
    }[];
    description: string;
}
export interface EmergenceGroundTruth {
    classifications: Record<string, "genuine" | "artifact">;
    genuine_tasks: string[];
    artifact_tasks: string[];
    transition_scales: Record<string, string>;
    seed: number;
}
export interface EmergenceOrMirageData {
    objective: string;
    groundTruth: EmergenceGroundTruth;
    taskEvaluations: TaskEvaluation[];
    modelInfo: ModelInfo;
}
export declare function generateEmergenceOrMirageData(seed: number): EmergenceOrMirageData;
