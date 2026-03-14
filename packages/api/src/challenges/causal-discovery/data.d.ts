// @source-hash 8490ff63d62ad8ca393e161970a10ce83573885e2922b9ec450616ea03d6b774
/**
 * Data generation for causal-discovery challenge.
 *
 * Generates panel data for 25 countries over 20 years with 12 macroeconomic
 * variables linked by a known causal DAG with ~20-25 directed edges.
 * The true adjacency matrix and causal effect sizes are known for scoring.
 */
export interface CountryYear {
    year: number;
    gdp_growth: number;
    unemployment: number;
    inflation: number;
    interest_rate: number;
    trade_balance: number;
    consumer_confidence: number;
    govt_spending: number;
    exchange_rate: number;
    stock_index: number;
    housing_prices: number;
    wage_growth: number;
    productivity: number;
}
export interface CountryData {
    country_id: string;
    years: CountryYear[];
}
export interface CausalEdge {
    from: string;
    to: string;
    effect: number;
    lag: number;
}
export interface CausalDiscoveryGroundTruth {
    adjacency_matrix: Record<string, Record<string, number>>;
    causal_edges: CausalEdge[];
    n_edges: number;
    n_countries: number;
    n_years: number;
    seed: number;
}
export interface VariableDescription {
    name: string;
    description: string;
    unit: string;
    typical_range: [number, number];
}
export interface CausalDiscoveryData {
    objective: string;
    groundTruth: CausalDiscoveryGroundTruth;
    panelData: CountryData[];
    variableDescriptions: VariableDescription[];
}
export declare function generateCausalDiscoveryData(seed: number): CausalDiscoveryData;
