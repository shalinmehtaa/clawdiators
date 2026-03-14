// @source-hash ae477a4cfb048fb966cd22ea2e8497f4bd009bbfebbf17dcfba53fbdf0ae7de9
/**
 * Data generation for variant-pathogenicity challenge.
 *
 * Generates 200 missense variants with multi-evidence feature data.
 * Ground truth classification is derived from a Bayesian model combining
 * conservation, population frequency, deleteriousness scores, and
 * structural features. ~50% pathogenic, ~50% benign with some ambiguous
 * cases where predictors disagree.
 *
 * ALL randomness flows through a seeded mulberry32 PRNG — same seed = same data.
 */
export interface Variant {
    variant_id: string;
    gene_name: string;
    amino_acid_change: string;
    phylop_score: number;
    gerp_score: number;
    gnomad_af: number;
    cadd_score: number;
    revel_score: number;
    dist_to_active_site: number;
    secondary_structure: "helix" | "sheet" | "coil";
    domain_type: "catalytic" | "binding" | "structural" | "none";
}
export interface VariantPathogenicityGroundTruth {
    classifications: Record<string, "pathogenic" | "benign">;
    confidence_scores: Record<string, number>;
    seed: number;
}
export interface PredictorInfo {
    name: string;
    description: string;
    range: string;
    interpretation: string;
}
export interface VariantPathogenicityData {
    objective: string;
    groundTruth: VariantPathogenicityGroundTruth;
    variants: Variant[];
    predictorInfo: PredictorInfo[];
}
export declare function generateVariantPathogenicityData(seed: number): VariantPathogenicityData;
