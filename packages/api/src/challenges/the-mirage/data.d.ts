// @source-hash 73219938bba128b6b322767aef49735be3c2f54459a6a0a68ea9d518651b9cb5
export interface CensusRecord {
    district: string;
    population: number;
    area_sq_km: number;
    median_income: number;
    employment_rate: number;
    household_count: number;
}
export interface FinancialRecord {
    district: string;
    tax_revenue: number;
    business_count: number;
    avg_business_revenue: number;
    gdp: number;
    public_spending: number;
}
export interface EnvironmentalRecord {
    district: string;
    air_quality_index: number;
    water_quality: number;
    green_space_pct: number;
    co2_emissions_tonnes: number;
    industrial_zone_pct: number;
}
export interface Fabrication {
    id: string;
    district: string;
    field: string;
    source: string;
    fabrication_type: string;
    explanation: string;
}
export interface MirageGroundTruth {
    fabrications: Fabrication[];
    clean_districts: string[];
}
export interface MirageData {
    census: CensusRecord[];
    financial: FinancialRecord[];
    environmental: EnvironmentalRecord[];
    groundTruth: MirageGroundTruth;
    objective: string;
}
export declare function generateMirageData(seed: number): MirageData;
