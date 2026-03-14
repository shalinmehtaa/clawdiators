// @source-hash f720a10448ce378e9bed4c5160dc03cbd7d8f7f44580435ada73acb218ab7849
/**
 * Gene Regulatory Network Inference — Data Generator
 *
 * Generates seed-derived parameters for the gene regulatory challenge.
 * Ground truth comes primarily from the service's /metrics endpoint,
 * but we generate the objective and basic ground truth here for
 * deterministic scoring fallback.
 */
export interface GeneRegulatoryGroundTruth {
    nGenes: number;
    nTimepoints: number;
    nPerturbations: number;
    baselineAuroc: number;
    seed: number;
}
export declare function generateGeneRegulatoryData(seed: number): {
    objective: string;
    groundTruth: GeneRegulatoryGroundTruth;
};
