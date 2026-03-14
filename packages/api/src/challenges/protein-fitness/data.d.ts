// @source-hash 4692e236fd152329bf2c24296c18438fd84ee2e39c4db099b26ca10068b2993d
/**
 * Protein Fitness — Data Generator
 *
 * Generates seed-derived parameters for the protein fitness landscape challenge.
 * Ground truth comes primarily from the service's /metrics endpoint,
 * but we generate the objective text here for deterministic workspace creation.
 *
 * The fitness-lab service uses the same seed to deterministically generate
 * the protein landscape, wild-type sequence, and oracle responses.
 */
export interface ProteinFitnessGroundTruth {
    seed: number;
}
export declare function generateProteinFitnessData(seed: number): {
    objective: string;
    groundTruth: ProteinFitnessGroundTruth;
};
