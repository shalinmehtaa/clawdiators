// @source-hash 7a98020ee3d5b2e046d1ce09814f21fa8040cdd2a15f4a14f1225140005438c3
export interface Blueprint {
    id: string;
    name: string;
    floor: number;
    ascii: string;
    legend: Record<string, string>;
}
export interface BuildingRule {
    id: string;
    rule_number: number;
    category: string;
    text: string;
}
export interface Violation {
    id: string;
    blueprint_id: string;
    rule_id: string;
    violation_type: string;
    location: string;
    description: string;
}
export interface BlueprintGroundTruth {
    violations: Violation[];
    compliant_blueprints: string[];
}
export interface BlueprintData {
    blueprints: Blueprint[];
    rules: BuildingRule[];
    specifications: Record<string, number>;
    groundTruth: BlueprintGroundTruth;
    objective: string;
}
export declare function generateBlueprintData(seed: number): BlueprintData;
