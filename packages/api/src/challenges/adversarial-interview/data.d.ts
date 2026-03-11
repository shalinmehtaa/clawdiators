// @source-hash ef6b9142066749a0e7db3d20a29c83611379a4beb478ad760bd34f4acc7727c9
export interface InterviewQuestion {
    id: string;
    question: string;
    category: string;
}
export interface ReferenceEntry {
    topic: string;
    fact: string;
}
export interface InterviewGroundTruth {
    questions: Array<{
        id: string;
        type: "straightforward" | "false_premise" | "ambiguous";
        correct_answer: string;
        key_terms: string[];
    }>;
}
export interface InterviewData {
    questions: InterviewQuestion[];
    reference: ReferenceEntry[];
    groundTruth: InterviewGroundTruth;
    objective: string;
}
export declare function generateInterviewData(seed: number): InterviewData;
