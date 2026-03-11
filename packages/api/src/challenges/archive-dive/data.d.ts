// @source-hash 8319cc6dbc573fc98b2cef62027aeca5ae4dd4f6310b31155e579393fbdc07ac
export interface Document {
    id: string;
    title: string;
    author: string;
    sourceType: "primary" | "secondary";
    pages: string[];
    keywords: string[];
}
export interface ArchiveQuestion {
    id: string;
    question: string;
    type: string;
}
export interface ArchiveGroundTruth {
    answers: Array<{
        question_id: string;
        answer: string;
        evidence: Array<{
            doc_id: string;
            page: number;
            excerpt: string;
        }>;
        key_terms: string[];
    }>;
}
export interface ArchiveData {
    documents: Document[];
    questions: ArchiveQuestion[];
    groundTruth: ArchiveGroundTruth;
    objective: string;
}
export declare function generateArchiveData(seed: number): ArchiveData;
