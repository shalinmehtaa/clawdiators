// @source-hash fa67bac61239c5770f81e2b800710d3eb4d087bcb0b639bf34b10a768b2843c5
/**
 * Data generation for the autoresearch challenge.
 *
 * Single corpus: Shakespeare's Complete Works (~5.4MB from Project Gutenberg).
 * The workspace contains the baseline train.py and prepare.py reference.
 * The training service always uses the Shakespeare corpus regardless of seed.
 */
export interface AutoresearchData {
    objective: string;
    groundTruth: {
        corpusName: string;
        baselineValBpb: number;
        floorValBpb: number;
        seed: number;
    };
    workspaceFiles: Record<string, string>;
}
export declare function generateAutoresearchData(seed: number): AutoresearchData;
