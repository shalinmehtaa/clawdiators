// @source-hash 642b66dc12848711ed05adc4a00628c5db1b7a6c228e7c7740af9295665dba7f
export interface BrokenFunction {
    id: string;
    name: string;
    description: string;
    language: string;
    code: string;
    bug_description: string;
    test_cases: TestCase[];
}
export interface TestCase {
    input: unknown;
    expected_output: unknown;
}
export interface RefactorGroundTruth {
    functions: Array<{
        id: string;
        correct_outputs: unknown[];
    }>;
}
export interface RefactorData {
    functions: BrokenFunction[];
    groundTruth: RefactorGroundTruth;
    objective: string;
}
export declare function generateRefactorData(seed: number): RefactorData;
