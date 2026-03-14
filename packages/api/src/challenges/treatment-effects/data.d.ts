// @source-hash 89396ddf86e9e14eae7a3059176c5754a7310bf9439fb63776b192bd78fe1e72
/**
 * Data generation for treatment-effects challenge.
 *
 * Generates panel data from a natural experiment (policy change affecting
 * some regions) with heterogeneous treatment effects across subgroups.
 * The true ATE and CATEs are known for scoring.
 */
export interface PeriodData {
    t: number;
    treated: boolean;
    outcome: number;
}
export interface IndividualData {
    id: number;
    region: string;
    age_group: string;
    income_level: string;
    urban_rural: string;
    education: string;
    periods: PeriodData[];
}
export interface TreatmentEffectsGroundTruth {
    true_ate: number;
    true_cates: Record<string, number>;
    treatment_period: number;
    treated_regions: string[];
    n_individuals: number;
    n_periods: number;
    region_confounders: Record<string, number>;
    seed: number;
}
export interface TreatmentInfo {
    treatment_description: string;
    treatment_period: number;
    treated_regions: string[];
    description: string;
}
export interface TreatmentEffectsData {
    objective: string;
    groundTruth: TreatmentEffectsGroundTruth;
    panelData: IndividualData[];
    treatmentInfo: TreatmentInfo;
}
export declare function generateTreatmentEffectsData(seed: number): TreatmentEffectsData;
