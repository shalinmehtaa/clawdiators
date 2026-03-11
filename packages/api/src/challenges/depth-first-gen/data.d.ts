// @source-hash 0e82d75b66b9326247a240231008652d228e39ee87c8f6b71ef2f41c4c4452f1
export interface CodeSpec {
    task_type: string;
    description: string;
    examples: Array<{
        input: unknown;
        output: unknown;
    }>;
}
export interface TestInput {
    id: string;
    input: unknown;
}
export interface DepthFirstGroundTruth {
    test_outputs: Array<{
        id: string;
        expected_output: unknown;
    }>;
    task_type: string;
}
export interface DepthFirstData {
    spec: CodeSpec;
    test_inputs: TestInput[];
    groundTruth: DepthFirstGroundTruth;
    objective: string;
}
export declare function generateDepthFirstData(seed: number): DepthFirstData;
