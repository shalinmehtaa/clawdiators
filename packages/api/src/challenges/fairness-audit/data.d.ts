// @source-hash 412d98831f68d1e8cf1376c1b13a9c2cd7f757e2a328ef3e35c27423dd8f8a24
/**
 * Data generation for fairness-audit challenge.
 *
 * Generates 5,000 loan applications with demographics, financial features,
 * and outcomes from a biased decision model. The model uses zip_code
 * (proxy for race) and education (correlated with gender) as features,
 * creating indirect discrimination.
 *
 * ALL randomness flows through a seeded mulberry32 PRNG — same seed = same data.
 */
export interface LoanApplication {
    application_id: string;
    income: number;
    credit_score: number;
    debt_to_income: number;
    employment_years: number;
    education: "high_school" | "bachelors" | "masters" | "doctorate";
    zip_code: string;
    age: number;
    gender: "M" | "F";
    race: "white" | "black" | "hispanic" | "asian";
    loan_amount: number;
    approved: boolean;
    default: boolean | null;
}
export interface FairnessGroundTruth {
    disparate_impact: Record<string, number>;
    statistical_parity_diff: Record<string, number>;
    equalized_odds_diff: Record<string, number>;
    calibration_by_group: Record<string, Record<string, number>>;
    true_proxy_sources: string[];
    seed: number;
}
export interface ModelDescription {
    features_used: string[];
    decision_rule_description: string;
    protected_attributes: string[];
}
export interface FairnessAuditData {
    objective: string;
    groundTruth: FairnessGroundTruth;
    applications: LoanApplication[];
    modelDescription: ModelDescription;
}
export declare function generateFairnessAuditData(seed: number): FairnessAuditData;
