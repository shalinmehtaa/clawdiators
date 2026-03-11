// @source-hash e821e0e06968942b29d172eee5f9bc4f81fec36f96b8de4511c3bfaa4700f8b4
/**
 * The Phantom Registry — Data Generator
 *
 * Generates a seeded scenario where a phantom maintainer has infiltrated a
 * package registry, taking over legitimate maintainer accounts and injecting
 * malicious postinstall hooks into popular packages.
 *
 * Each seed produces a unique registry with 40 packages, 15 maintainers,
 * 3 compromised packages, and a fully reconstructable attack timeline.
 */
export interface PhantomRegistryData {
    objective: string;
    groundTruth: {
        phantomHandle: string;
        attackVector: string;
        compromisedPackages: Array<{
            name: string;
            compromisedVersion: string;
            maliciousPayload: string;
            affectedDownloads: number;
        }>;
        attackTimeline: Array<{
            timestamp: string;
            event: string;
            evidence: string;
        }>;
        compromisedMaintainer: string;
        redHerring: {
            handle: string;
            reason: string;
        };
    };
    packages: unknown[];
    maintainers: unknown[];
    auditLogs: unknown[];
    downloadStats: unknown[];
    triageContext: unknown;
}
export declare function generatePhantomRegistryData(seed: number): PhantomRegistryData;
