// @source-hash bb9229aae7e96e097aaf0bf7cbb4b2071207540cc5d9d20a1640bf007bf4fc46
export interface ArchaeologyGroundTruth {
    buggy_commit_index: number;
    buggy_commit_message: string;
    bug_description: string;
    correct_function_body: string;
    function_name: string;
    file_path: string;
}
export interface ArchaeologyData {
    objective: string;
    groundTruth: ArchaeologyGroundTruth;
    files: Record<string, string>;
}
export declare function generateArchaeologyData(seed: number): ArchaeologyData;
