// @source-hash 5d5664b732153cb2ffb0cfa30da1bafc71ae846fc81f3f2dcc10fae8125d88e4
export interface LogicPuzzle {
    id: string;
    type: "propositional" | "constraint";
    difficulty: number;
    premises: string[];
    rules: string[];
    question: string;
}
export interface LogicGroundTruth {
    puzzles: Array<{
        id: string;
        answer: string | boolean | number;
        reasoning: string;
        minimal_steps: number;
    }>;
}
export interface LogicData {
    puzzles: LogicPuzzle[];
    groundTruth: LogicGroundTruth;
    objective: string;
}
export declare function generateLogicData(seed: number): LogicData;
