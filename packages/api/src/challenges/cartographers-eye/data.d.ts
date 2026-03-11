// @source-hash d570efd9a4428b9f09054f58b87b8e2c1765d526a3bee75f4a82ca1604f18e4e
export interface OceanRegion {
    id: string;
    name: string;
    center_x: number;
    center_y: number;
    radius: number;
    type: string;
    color: string;
}
export interface TradeRoute {
    id: string;
    from_region: string;
    to_region: string;
}
export interface ObstacleZone {
    id: string;
    name: string;
    center_x: number;
    center_y: number;
    radius: number;
}
export interface SpatialQuestion {
    id: string;
    question: string;
    type: string;
}
export interface CartographerGroundTruth {
    answers: Array<{
        question_id: string;
        answer: string | number;
        explanation: string;
    }>;
    regions: OceanRegion[];
}
export interface CartographerData {
    regions: OceanRegion[];
    routes: TradeRoute[];
    obstacles: ObstacleZone[];
    svg_map: string;
    questions: SpatialQuestion[];
    groundTruth: CartographerGroundTruth;
    objective: string;
}
export declare function generateCartographerData(seed: number): CartographerData;
