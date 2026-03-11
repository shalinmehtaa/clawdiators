// @source-hash 79a4d7c5b75c7100d16d4ad873845fba927fbae5ac9e77beb881c15898b901e5
/**
 * LIGHTHOUSE Incident Response — Data Generator
 *
 * Generates a fully seeded incident scenario for the LIGHTHOUSE distributed
 * scientific data pipeline. Each seed produces a unique but deterministic
 * incident with specific root cause, failure chain, and evidence signals.
 *
 * The same seed always produces the same scenario — enabling reproducible
 * scoring even across multiple submission attempts.
 */
export declare const SUBSYSTEMS: readonly [{
    readonly id: "ingestion";
    readonly name: "Data Ingestion Layer";
    readonly description: "Receives raw telescope observation data via authenticated REST API from 47 remote data sources";
    readonly upstream: string[];
    readonly downstream: readonly ["preprocessing"];
    readonly sla: {
        readonly max_latency_ms: 200;
        readonly min_throughput_obs_per_sec: 500;
        readonly max_error_rate: 0.001;
    };
    readonly ports: {
        readonly api: 8080;
        readonly metrics: 9090;
    };
}, {
    readonly id: "preprocessing";
    readonly name: "Preprocessing Service";
    readonly description: "Validates, normalizes, and filters observation data using configurable validation rule sets";
    readonly upstream: readonly ["ingestion"];
    readonly downstream: readonly ["analysis"];
    readonly sla: {
        readonly max_latency_ms: 500;
        readonly min_throughput_obs_per_sec: 480;
        readonly max_error_rate: 0.005;
    };
    readonly ports: {
        readonly api: 8081;
        readonly metrics: 9091;
    };
}, {
    readonly id: "analysis";
    readonly name: "Analysis Engine";
    readonly description: "Runs multi-stage computational analysis and spectral feature extraction across 4 worker processes";
    readonly upstream: readonly ["preprocessing"];
    readonly downstream: readonly ["results-store"];
    readonly sla: {
        readonly max_latency_ms: 2000;
        readonly min_throughput_obs_per_sec: 100;
        readonly max_error_rate: 0.01;
    };
    readonly ports: {
        readonly api: 8082;
        readonly metrics: 9092;
    };
}, {
    readonly id: "results-store";
    readonly name: "Results Database";
    readonly description: "PostgreSQL-backed persistent store for analysis outputs with temporal indexing";
    readonly upstream: readonly ["analysis"];
    readonly downstream: readonly ["archive", "query-gateway"];
    readonly sla: {
        readonly max_latency_ms: 50;
        readonly max_write_queue_depth: 1000;
        readonly max_error_rate: 0.001;
    };
    readonly ports: {
        readonly api: 8083;
        readonly metrics: 9093;
    };
}, {
    readonly id: "archive";
    readonly name: "Archive Service";
    readonly description: "Long-term compressed storage using Zstandard compression with content-addressed layout";
    readonly upstream: readonly ["results-store"];
    readonly downstream: readonly ["query-gateway"];
    readonly sla: {
        readonly max_latency_ms: 5000;
        readonly max_disk_usage_pct: 85;
        readonly max_error_rate: 0.001;
    };
    readonly ports: {
        readonly api: 8084;
        readonly metrics: 9094;
    };
}, {
    readonly id: "query-gateway";
    readonly name: "Query Gateway";
    readonly description: "External-facing GraphQL and REST API for querying pipeline results with 1-hour response cache";
    readonly upstream: readonly ["results-store", "archive"];
    readonly downstream: string[];
    readonly sla: {
        readonly max_latency_ms: 1000;
        readonly min_availability: 0.999;
        readonly max_error_rate: 0.005;
    };
    readonly ports: {
        readonly api: 8085;
        readonly metrics: 9095;
    };
}];
export type SubsystemId = "ingestion" | "preprocessing" | "analysis" | "results-store" | "archive" | "query-gateway";
export declare const ROOT_CAUSE_SCENARIOS: readonly [{
    readonly id: "archive_disk_quota";
    readonly name: "Archive Disk Quota Exhaustion";
    readonly triggeredBy: SubsystemId;
    readonly failureChain: SubsystemId[];
    readonly description: "Archive disk capacity reached 97%. Write operations began failing silently. Results store accumulated a backlog of 50,000+ pending writes. Query Gateway cache invalidation stalled, serving stale data.";
    readonly runbook: "/docs/runbooks/storage-quota-recovery";
    readonly logSignals: readonly ["DISK_QUOTA_EXCEEDED", "WRITE_TIMEOUT", "BACKPRESSURE_SIGNAL", "CACHE_STALE"];
    readonly dbSignals: {
        readonly disk_usage_history: "disk_usage_pct > 95";
        readonly performance_history: "archive write_success_rate < 0.2";
        readonly sla_targets: "archive.max_disk_usage_pct = 85 (breached)";
    };
    readonly recoverySequence: readonly [{
        readonly subsystem: SubsystemId;
        readonly action: "extend_disk_quota";
        readonly params: {
            readonly quota_gb: 500;
        };
        readonly description: "Increase disk quota to relieve pressure";
    }, {
        readonly subsystem: SubsystemId;
        readonly action: "purge_expired_segments";
        readonly params: {
            readonly older_than_days: 90;
        };
        readonly description: "Remove stale segments to free immediate space";
    }, {
        readonly subsystem: SubsystemId;
        readonly action: "flush_pending_writes";
        readonly params: {};
        readonly description: "Drain the accumulated write backlog";
    }, {
        readonly subsystem: SubsystemId;
        readonly action: "clear_cache_and_reconnect";
        readonly params: {};
        readonly description: "Invalidate stale cache and re-establish archive connection";
    }];
    readonly redHerring: {
        readonly subsystem: SubsystemId;
        readonly symptom: "Elevated preprocessing latency (2.1x normal)";
        readonly actualCause: "Normal load from seasonal observation campaign — unrelated to incident";
    };
    readonly rootCauseTimestamp: "T-6h";
}, {
    readonly id: "analysis_memory_leak";
    readonly name: "Analysis Engine Worker Memory Leak";
    readonly triggeredBy: SubsystemId;
    readonly failureChain: SubsystemId[];
    readonly description: "A memory leak in the spectral feature extraction module caused all 4 analysis workers to be OOM-killed. Preprocessing queue depth grew to 73,000 observations. Ingestion layer triggered adaptive throttling, reducing intake to 12% of normal rate.";
    readonly runbook: "/docs/runbooks/worker-oom-recovery";
    readonly logSignals: readonly ["OOM_KILL", "WORKER_RESTART_LOOP", "QUEUE_DEPTH_CRITICAL", "INGESTION_THROTTLE"];
    readonly dbSignals: {
        readonly performance_history: "analysis memory_usage_pct > 98 at T-2h";
        readonly incident_history: "3 OOM events recorded in last 4 hours";
        readonly subsystem_config: "analysis.worker_count = 4, memory_limit = 8192MB";
    };
    readonly recoverySequence: readonly [{
        readonly subsystem: SubsystemId;
        readonly action: "restart_workers";
        readonly params: {
            readonly count: 4;
            readonly memory_limit_mb: 4096;
        };
        readonly description: "Restart workers with conservative memory limit";
    }, {
        readonly subsystem: SubsystemId;
        readonly action: "drain_preprocessing_backlog";
        readonly params: {
            readonly batch_size: 500;
        };
        readonly description: "Gradually drain the 73k-item queue without re-triggering OOM";
    }, {
        readonly subsystem: SubsystemId;
        readonly action: "resume_normal_processing";
        readonly params: {};
        readonly description: "Re-enable full processing rate";
    }, {
        readonly subsystem: SubsystemId;
        readonly action: "restore_rate_limit";
        readonly params: {
            readonly requests_per_sec: 1000;
        };
        readonly description: "Remove adaptive throttling, restore full ingestion rate";
    }];
    readonly redHerring: {
        readonly subsystem: SubsystemId;
        readonly symptom: "Slow query responses (4x SLA on read paths)";
        readonly actualCause: "Background index rebuild scheduled maintenance — pre-existed incident";
    };
    readonly rootCauseTimestamp: "T-4h";
}, {
    readonly id: "preprocessing_config_drift";
    readonly name: "Preprocessing Validation Config Corruption";
    readonly triggeredBy: SubsystemId;
    readonly failureChain: SubsystemId[];
    readonly description: "An automated config sync process overwrote the validation rule set with an incompatible version. Malformed observations passed validation (99.9% pass rate — falsely healthy-looking). Analysis processed corrupted data, storing incorrect results for 4 hours.";
    readonly runbook: "/docs/runbooks/config-corruption-recovery";
    readonly logSignals: readonly ["CONFIG_HASH_MISMATCH", "VALIDATION_RULE_OVERRIDE", "DATA_QUALITY_SCORE_LOW", "ANOMALOUS_PASS_RATE"];
    readonly dbSignals: {
        readonly subsystem_config: "preprocessing.validation_config_hash != expected_hash (3f7a2... vs b91c4...)";
        readonly performance_history: "preprocessing validation_pass_rate = 0.999 (abnormally high — normal is 0.87)";
        readonly performance_history2: "analysis data_quality_score = 0.43 (below 0.80 threshold)";
    };
    readonly recoverySequence: readonly [{
        readonly subsystem: SubsystemId;
        readonly action: "restore_config_from_backup";
        readonly params: {
            readonly backup_id: "validation-rules-20260228";
        };
        readonly description: "Roll back to last known-good config";
    }, {
        readonly subsystem: SubsystemId;
        readonly action: "reprocess_affected_window";
        readonly params: {
            readonly hours_back: 4;
        };
        readonly description: "Reprocess the 4-hour window of corrupt data";
    }, {
        readonly subsystem: SubsystemId;
        readonly action: "invalidate_contaminated_results";
        readonly params: {
            readonly since_hours_ago: 4;
        };
        readonly description: "Mark results from the contamination window as invalid";
    }, {
        readonly subsystem: SubsystemId;
        readonly action: "verify_integrity";
        readonly params: {};
        readonly description: "Run integrity check to confirm no further contamination";
    }];
    readonly redHerring: {
        readonly subsystem: SubsystemId;
        readonly symptom: "Archive write throughput 40% below normal";
        readonly actualCause: "Scheduled Zstandard compression level upgrade — planned maintenance";
    };
    readonly rootCauseTimestamp: "T-4h";
}, {
    readonly id: "results_store_index_corruption";
    readonly name: "Results Database Temporal Index Corruption";
    readonly triggeredBy: SubsystemId;
    readonly failureChain: SubsystemId[];
    readonly description: "A transient power anomaly at T-8h caused a partial write to the temporal B-tree index. The corruption is subtle: point queries succeed, but range queries return 15-30% fewer results than expected. Archive sync is incomplete. Query Gateway returns inconsistent results.";
    readonly runbook: "/docs/runbooks/index-rebuild-recovery";
    readonly logSignals: readonly ["POWER_ANOMALY_DETECTED", "INDEX_CHECKSUM_FAILURE", "RANGE_QUERY_UNDERCOUNT", "ARCHIVE_SYNC_PARTIAL"];
    readonly dbSignals: {
        readonly incident_history: "power anomaly event at T-8h, 340ms interruption";
        readonly performance_history: "results-store range_query_result_count_ratio = 0.78 (should be 1.0)";
        readonly performance_history2: "archive sync_completeness = 0.71";
    };
    readonly recoverySequence: readonly [{
        readonly subsystem: SubsystemId;
        readonly action: "pause_writes";
        readonly params: {};
        readonly description: "Halt incoming writes to prevent further corruption spread";
    }, {
        readonly subsystem: SubsystemId;
        readonly action: "rebuild_temporal_index";
        readonly params: {
            readonly online: false;
        };
        readonly description: "Full offline index rebuild (takes ~15 minutes)";
    }, {
        readonly subsystem: SubsystemId;
        readonly action: "resume_writes";
        readonly params: {};
        readonly description: "Re-enable write path after index validation";
    }, {
        readonly subsystem: SubsystemId;
        readonly action: "resync_from_results";
        readonly params: {};
        readonly description: "Re-sync archive with corrected results store";
    }, {
        readonly subsystem: SubsystemId;
        readonly action: "flush_stale_cache";
        readonly params: {};
        readonly description: "Purge all cached responses that may contain corrupted data";
    }];
    readonly redHerring: {
        readonly subsystem: SubsystemId;
        readonly symptom: "Intermittent authentication timeouts (3-5/hour)";
        readonly actualCause: "Certificate renewal process — normal every 90 days, started yesterday";
    };
    readonly rootCauseTimestamp: "T-8h";
}, {
    readonly id: "ingestion_cert_expiry";
    readonly name: "Ingestion API TLS Certificate Expiry";
    readonly triggeredBy: SubsystemId;
    readonly failureChain: SubsystemId[];
    readonly description: "The TLS certificate for the ingestion API endpoint expired 6 hours ago. All 47 data sources are refusing to connect. Preprocessing is starved. Analysis has consumed its local buffer and halted. Results store write rate dropped to zero 2 hours ago.";
    readonly runbook: "/docs/runbooks/certificate-expiry-recovery";
    readonly logSignals: readonly ["TLS_CERT_EXPIRED", "CONNECTION_REFUSED_MASS", "PREPROCESSING_STARVATION", "ANALYSIS_BUFFER_EXHAUSTED"];
    readonly dbSignals: {
        readonly certificate_registry: "ingestion.api_cert expiry_date = 2026-02-26 (6 days ago)";
        readonly performance_history: "ingestion observation_rate = 0 (last 6 hours)";
        readonly performance_history2: "preprocessing queue_depth = 0, analysis jobs_queued = 0";
    };
    readonly recoverySequence: readonly [{
        readonly subsystem: SubsystemId;
        readonly action: "rotate_tls_certificate";
        readonly params: {
            readonly validity_days: 365;
        };
        readonly description: "Issue and activate a new TLS certificate";
    }, {
        readonly subsystem: SubsystemId;
        readonly action: "notify_data_sources";
        readonly params: {};
        readonly description: "Signal all 47 data sources to reconnect";
    }, {
        readonly subsystem: SubsystemId;
        readonly action: "reset_starvation_state";
        readonly params: {};
        readonly description: "Clear timeout states from starvation period";
    }, {
        readonly subsystem: SubsystemId;
        readonly action: "reload_pipeline";
        readonly params: {};
        readonly description: "Restart analysis pipeline to clear halted state";
    }, {
        readonly subsystem: SubsystemId;
        readonly action: "accept_backfill_mode";
        readonly params: {
            readonly duration_hours: 6;
        };
        readonly description: "Enable high-throughput backfill mode for the 6-hour gap";
    }];
    readonly redHerring: {
        readonly subsystem: SubsystemId;
        readonly symptom: "Response latency elevated 3x, cache hit rate dropped to 0.12";
        readonly actualCause: "Cache naturally expired due to 6-hour data gap — not a query-gateway failure";
    };
    readonly rootCauseTimestamp: "T-6h";
}];
export type RootCauseId = "archive_disk_quota" | "analysis_memory_leak" | "preprocessing_config_drift" | "results_store_index_corruption" | "ingestion_cert_expiry";
interface LogEntry {
    ts: string;
    level: "DEBUG" | "INFO" | "WARN" | "ERROR" | "CRITICAL";
    subsystem: SubsystemId;
    code: string;
    message: string;
    metadata: Record<string, unknown>;
}
interface DbTables {
    subsystem_config: Array<Record<string, unknown>>;
    dependency_graph: Array<Record<string, unknown>>;
    sla_targets: Array<Record<string, unknown>>;
    performance_history: Array<Record<string, unknown>>;
    incident_history: Array<Record<string, unknown>>;
    certificate_registry: Array<Record<string, unknown>>;
    disk_usage_history: Array<Record<string, unknown>>;
}
export interface LighthouseGroundTruth {
    rootCauseId: RootCauseId;
    rootCauseName: string;
    failureChain: SubsystemId[];
    recoverySequence: Array<{
        subsystem: SubsystemId;
        action: string;
        params: Record<string, unknown>;
    }>;
    runbook: string;
    redHerring: {
        subsystem: SubsystemId;
        symptom: string;
        actualCause: string;
    };
    logSignals: readonly string[];
    dbSignals: Record<string, string>;
    seed: number;
}
export interface LighthouseGeneratedData {
    objective: string;
    groundTruth: LighthouseGroundTruth;
    scenario: typeof ROOT_CAUSE_SCENARIOS[number];
    logs: LogEntry[];
    dbTables: DbTables;
    triageContext: Record<string, unknown>;
}
export declare function generateLighthouseData(seed: number): LighthouseGeneratedData;
export {};
