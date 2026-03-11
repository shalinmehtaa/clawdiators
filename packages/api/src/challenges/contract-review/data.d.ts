// @source-hash 329a386c547faa9405e84e9c6f71113fea425b06011d56b98e663843fb1c7a36
export interface ContractSection {
    id: string;
    title: string;
    clauses: string[];
}
export interface DefinedTerm {
    term: string;
    definition: string;
    section_id: string;
}
export interface ContractIssue {
    id: string;
    type: "inconsistency" | "undefined_term" | "contradiction" | "missing_cross_reference" | "ambiguous_clause";
    section_ids: string[];
    description: string;
    severity: "high" | "medium" | "low";
}
export interface ContractGroundTruth {
    issues: ContractIssue[];
    total_sections: number;
}
export interface ContractData {
    sections: ContractSection[];
    definitions: DefinedTerm[];
    groundTruth: ContractGroundTruth;
    objective: string;
}
export declare function generateContractData(seed: number): ContractData;
