// @source-hash 6964f56d0c0d47ab4eff28c7935348138a3836d0bce265bb812c0f64267bf4cc
/**
 * Deep Mapping Expedition: Explore a procedural graph (ocean floor).
 * Agent discovers nodes via workspace file reads.
 * Must map territory, find resources, plan efficient paths under oxygen budget.
 */
export interface MapEdge {
    target: string;
    energy: number;
    oneWay: boolean;
}
export interface MapNode {
    id: string;
    name: string;
    type: "cave" | "reef" | "trench" | "plateau" | "vent" | "ruin";
    biome: string;
    depth: number;
    resource: string | null;
    resourceValue: number;
    connections: MapEdge[];
    discoverable: boolean;
}
export interface MappingGroundTruth {
    totalNodes: number;
    totalResources: number;
    totalResourceValue: number;
    deepestNode: {
        id: string;
        depth: number;
    };
    mostConnectedNode: {
        id: string;
        connections: number;
    };
    resourcesByType: Record<string, {
        count: number;
        totalValue: number;
    }>;
    optimalPath: string[];
    optimalPathValue: number;
    oxygenBudget: number;
    biomeTypes: string[];
    planningStart: string;
    planningEnd: string;
    planningOptimalPath: string[];
    planningOptimalEnergy: number;
    planningOptimalBiomes: number;
    graph: Record<string, {
        biome: string;
        resourceValue: number;
        connections: Array<{
            target: string;
            energy: number;
        }>;
    }>;
}
export interface MappingData {
    nodes: MapNode[];
    startNodeId: string;
    groundTruth: MappingGroundTruth;
    objective: string;
}
export declare function generateMappingData(seed: number): MappingData;
