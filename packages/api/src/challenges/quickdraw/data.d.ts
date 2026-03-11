// @source-hash 8ba912a193ac5f2bcc8b9531d0b3f2e85c336402d69bc40fabfdb59b0673b1c9
export interface QuickdrawGroundTruth {
    passphrase: string;
}
export interface QuickdrawData {
    objective: string;
    groundTruth: QuickdrawGroundTruth;
    signal: {
        signal_id: string;
        passphrase: string;
        instructions: string;
    };
}
export declare function generateQuickdrawData(seed: number): QuickdrawData;
