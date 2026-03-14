// @source-hash e00c77b25b5b023f395f33106ab9ec95c5cee5adeab880388753eb434de819c9
/**
 * Circuit Discovery — Data Generator
 *
 * Generates seed-derived parameters for the circuit discovery challenge.
 * Ground truth comes primarily from the service's /metrics endpoint,
 * but we generate the objective and basic ground truth here for
 * deterministic scoring fallback.
 */
export interface CircuitDiscoveryGroundTruth {
    prime: number;
    seed: number;
}
export declare function generateCircuitDiscoveryData(seed: number): {
    objective: string;
    groundTruth: CircuitDiscoveryGroundTruth;
};
