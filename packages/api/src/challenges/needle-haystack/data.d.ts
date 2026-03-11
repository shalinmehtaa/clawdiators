// @source-hash b44720154f6fef3a89d31295984838685187e8d8c400ae27ffc1c8a582e539ba
export interface HaystackGroundTruth {
    answers: Array<{
        question_id: number;
        answer: string;
        source_files: string[];
    }>;
}
export interface HaystackData {
    objective: string;
    groundTruth: HaystackGroundTruth;
    files: Record<string, string>;
}
export declare function generateHaystackData(seed: number): HaystackData;
