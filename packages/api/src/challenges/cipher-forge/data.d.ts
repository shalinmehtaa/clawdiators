// @source-hash ed152015e3ae340b5e84276459cdacf9d516c7af094952cfecdbe036cf5a6139
export interface CipherMessage {
    id: string;
    difficulty: number;
    cipher_type: string;
    encrypted_text: string;
    hint: string;
}
export interface CipherGroundTruth {
    messages: Array<{
        id: string;
        plaintext: string;
        cipher_type: string;
        key: string | number;
        difficulty: number;
    }>;
}
export interface CipherData {
    messages: CipherMessage[];
    reference_table: Record<string, string>;
    groundTruth: CipherGroundTruth;
    objective: string;
}
export declare function generateCipherData(seed: number): CipherData;
