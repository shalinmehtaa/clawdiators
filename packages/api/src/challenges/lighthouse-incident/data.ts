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

// ── Seeded PRNG (mulberry32, matches arena standard) ──────────────────

function rng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(arr: readonly T[], r: () => number): T {
  return arr[Math.floor(r() * arr.length)];
}

function pickN<T>(arr: readonly T[], n: number, r: () => number): T[] {
  const pool = [...arr];
  const out: T[] = [];
  for (let i = 0; i < Math.min(n, pool.length); i++) {
    const idx = Math.floor(r() * (pool.length - i));
    out.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return out;
}

function randInt(min: number, max: number, r: () => number): number {
  return min + Math.floor(r() * (max - min + 1));
}

// ── Subsystem Definitions ─────────────────────────────────────────────

export const SUBSYSTEMS = [
  {
    id: "ingestion",
    name: "Data Ingestion Layer",
    description: "Receives raw telescope observation data via authenticated REST API from 47 remote data sources",
    upstream: [] as string[],
    downstream: ["preprocessing"],
    sla: { max_latency_ms: 200, min_throughput_obs_per_sec: 500, max_error_rate: 0.001 },
    ports: { api: 8080, metrics: 9090 },
  },
  {
    id: "preprocessing",
    name: "Preprocessing Service",
    description: "Validates, normalizes, and filters observation data using configurable validation rule sets",
    upstream: ["ingestion"],
    downstream: ["analysis"],
    sla: { max_latency_ms: 500, min_throughput_obs_per_sec: 480, max_error_rate: 0.005 },
    ports: { api: 8081, metrics: 9091 },
  },
  {
    id: "analysis",
    name: "Analysis Engine",
    description: "Runs multi-stage computational analysis and spectral feature extraction across 4 worker processes",
    upstream: ["preprocessing"],
    downstream: ["results-store"],
    sla: { max_latency_ms: 2000, min_throughput_obs_per_sec: 100, max_error_rate: 0.01 },
    ports: { api: 8082, metrics: 9092 },
  },
  {
    id: "results-store",
    name: "Results Database",
    description: "PostgreSQL-backed persistent store for analysis outputs with temporal indexing",
    upstream: ["analysis"],
    downstream: ["archive", "query-gateway"],
    sla: { max_latency_ms: 50, max_write_queue_depth: 1000, max_error_rate: 0.001 },
    ports: { api: 8083, metrics: 9093 },
  },
  {
    id: "archive",
    name: "Archive Service",
    description: "Long-term compressed storage using Zstandard compression with content-addressed layout",
    upstream: ["results-store"],
    downstream: ["query-gateway"],
    sla: { max_latency_ms: 5000, max_disk_usage_pct: 85, max_error_rate: 0.001 },
    ports: { api: 8084, metrics: 9094 },
  },
  {
    id: "query-gateway",
    name: "Query Gateway",
    description: "External-facing GraphQL and REST API for querying pipeline results with 1-hour response cache",
    upstream: ["results-store", "archive"],
    downstream: [] as string[],
    sla: { max_latency_ms: 1000, min_availability: 0.999, max_error_rate: 0.005 },
    ports: { api: 8085, metrics: 9095 },
  },
] as const;

export type SubsystemId = "ingestion" | "preprocessing" | "analysis" | "results-store" | "archive" | "query-gateway";

// ── Root Cause Scenarios ─────────────────────────────────────────────

export const ROOT_CAUSE_SCENARIOS = [
  {
    id: "archive_disk_quota",
    name: "Archive Disk Quota Exhaustion",
    triggeredBy: "archive" as SubsystemId,
    failureChain: ["archive", "results-store", "query-gateway"] as SubsystemId[],
    description: "Archive disk capacity reached 97%. Write operations began failing silently. Results store accumulated a backlog of 50,000+ pending writes. Query Gateway cache invalidation stalled, serving stale data.",
    runbook: "/docs/runbooks/storage-quota-recovery",
    logSignals: ["DISK_QUOTA_EXCEEDED", "WRITE_TIMEOUT", "BACKPRESSURE_SIGNAL", "CACHE_STALE"],
    dbSignals: {
      disk_usage_history: "disk_usage_pct > 95",
      performance_history: "archive write_success_rate < 0.2",
      sla_targets: "archive.max_disk_usage_pct = 85 (breached)",
    },
    recoverySequence: [
      { subsystem: "archive" as SubsystemId, action: "extend_disk_quota", params: { quota_gb: 500 }, description: "Increase disk quota to relieve pressure" },
      { subsystem: "archive" as SubsystemId, action: "purge_expired_segments", params: { older_than_days: 90 }, description: "Remove stale segments to free immediate space" },
      { subsystem: "results-store" as SubsystemId, action: "flush_pending_writes", params: {}, description: "Drain the accumulated write backlog" },
      { subsystem: "query-gateway" as SubsystemId, action: "clear_cache_and_reconnect", params: {}, description: "Invalidate stale cache and re-establish archive connection" },
    ],
    redHerring: {
      subsystem: "preprocessing" as SubsystemId,
      symptom: "Elevated preprocessing latency (2.1x normal)",
      actualCause: "Normal load from seasonal observation campaign — unrelated to incident",
    },
    rootCauseTimestamp: "T-6h",
  },
  {
    id: "analysis_memory_leak",
    name: "Analysis Engine Worker Memory Leak",
    triggeredBy: "analysis" as SubsystemId,
    failureChain: ["analysis", "preprocessing", "ingestion"] as SubsystemId[],
    description: "A memory leak in the spectral feature extraction module caused all 4 analysis workers to be OOM-killed. Preprocessing queue depth grew to 73,000 observations. Ingestion layer triggered adaptive throttling, reducing intake to 12% of normal rate.",
    runbook: "/docs/runbooks/worker-oom-recovery",
    logSignals: ["OOM_KILL", "WORKER_RESTART_LOOP", "QUEUE_DEPTH_CRITICAL", "INGESTION_THROTTLE"],
    dbSignals: {
      performance_history: "analysis memory_usage_pct > 98 at T-2h",
      incident_history: "3 OOM events recorded in last 4 hours",
      subsystem_config: "analysis.worker_count = 4, memory_limit = 8192MB",
    },
    recoverySequence: [
      { subsystem: "analysis" as SubsystemId, action: "restart_workers", params: { count: 4, memory_limit_mb: 4096 }, description: "Restart workers with conservative memory limit" },
      { subsystem: "analysis" as SubsystemId, action: "drain_preprocessing_backlog", params: { batch_size: 500 }, description: "Gradually drain the 73k-item queue without re-triggering OOM" },
      { subsystem: "preprocessing" as SubsystemId, action: "resume_normal_processing", params: {}, description: "Re-enable full processing rate" },
      { subsystem: "ingestion" as SubsystemId, action: "restore_rate_limit", params: { requests_per_sec: 1000 }, description: "Remove adaptive throttling, restore full ingestion rate" },
    ],
    redHerring: {
      subsystem: "results-store" as SubsystemId,
      symptom: "Slow query responses (4x SLA on read paths)",
      actualCause: "Background index rebuild scheduled maintenance — pre-existed incident",
    },
    rootCauseTimestamp: "T-4h",
  },
  {
    id: "preprocessing_config_drift",
    name: "Preprocessing Validation Config Corruption",
    triggeredBy: "preprocessing" as SubsystemId,
    failureChain: ["preprocessing", "analysis", "results-store"] as SubsystemId[],
    description: "An automated config sync process overwrote the validation rule set with an incompatible version. Malformed observations passed validation (99.9% pass rate — falsely healthy-looking). Analysis processed corrupted data, storing incorrect results for 4 hours.",
    runbook: "/docs/runbooks/config-corruption-recovery",
    logSignals: ["CONFIG_HASH_MISMATCH", "VALIDATION_RULE_OVERRIDE", "DATA_QUALITY_SCORE_LOW", "ANOMALOUS_PASS_RATE"],
    dbSignals: {
      subsystem_config: "preprocessing.validation_config_hash != expected_hash (3f7a2... vs b91c4...)",
      performance_history: "preprocessing validation_pass_rate = 0.999 (abnormally high — normal is 0.87)",
      performance_history2: "analysis data_quality_score = 0.43 (below 0.80 threshold)",
    },
    recoverySequence: [
      { subsystem: "preprocessing" as SubsystemId, action: "restore_config_from_backup", params: { backup_id: "validation-rules-20260228" }, description: "Roll back to last known-good config" },
      { subsystem: "preprocessing" as SubsystemId, action: "reprocess_affected_window", params: { hours_back: 4 }, description: "Reprocess the 4-hour window of corrupt data" },
      { subsystem: "analysis" as SubsystemId, action: "invalidate_contaminated_results", params: { since_hours_ago: 4 }, description: "Mark results from the contamination window as invalid" },
      { subsystem: "results-store" as SubsystemId, action: "verify_integrity", params: {}, description: "Run integrity check to confirm no further contamination" },
    ],
    redHerring: {
      subsystem: "archive" as SubsystemId,
      symptom: "Archive write throughput 40% below normal",
      actualCause: "Scheduled Zstandard compression level upgrade — planned maintenance",
    },
    rootCauseTimestamp: "T-4h",
  },
  {
    id: "results_store_index_corruption",
    name: "Results Database Temporal Index Corruption",
    triggeredBy: "results-store" as SubsystemId,
    failureChain: ["results-store", "archive", "query-gateway"] as SubsystemId[],
    description: "A transient power anomaly at T-8h caused a partial write to the temporal B-tree index. The corruption is subtle: point queries succeed, but range queries return 15-30% fewer results than expected. Archive sync is incomplete. Query Gateway returns inconsistent results.",
    runbook: "/docs/runbooks/index-rebuild-recovery",
    logSignals: ["POWER_ANOMALY_DETECTED", "INDEX_CHECKSUM_FAILURE", "RANGE_QUERY_UNDERCOUNT", "ARCHIVE_SYNC_PARTIAL"],
    dbSignals: {
      incident_history: "power anomaly event at T-8h, 340ms interruption",
      performance_history: "results-store range_query_result_count_ratio = 0.78 (should be 1.0)",
      performance_history2: "archive sync_completeness = 0.71",
    },
    recoverySequence: [
      { subsystem: "results-store" as SubsystemId, action: "pause_writes", params: {}, description: "Halt incoming writes to prevent further corruption spread" },
      { subsystem: "results-store" as SubsystemId, action: "rebuild_temporal_index", params: { online: false }, description: "Full offline index rebuild (takes ~15 minutes)" },
      { subsystem: "results-store" as SubsystemId, action: "resume_writes", params: {}, description: "Re-enable write path after index validation" },
      { subsystem: "archive" as SubsystemId, action: "resync_from_results", params: {}, description: "Re-sync archive with corrected results store" },
      { subsystem: "query-gateway" as SubsystemId, action: "flush_stale_cache", params: {}, description: "Purge all cached responses that may contain corrupted data" },
    ],
    redHerring: {
      subsystem: "ingestion" as SubsystemId,
      symptom: "Intermittent authentication timeouts (3-5/hour)",
      actualCause: "Certificate renewal process — normal every 90 days, started yesterday",
    },
    rootCauseTimestamp: "T-8h",
  },
  {
    id: "ingestion_cert_expiry",
    name: "Ingestion API TLS Certificate Expiry",
    triggeredBy: "ingestion" as SubsystemId,
    failureChain: ["ingestion", "preprocessing", "analysis", "results-store"] as SubsystemId[],
    description: "The TLS certificate for the ingestion API endpoint expired 6 hours ago. All 47 data sources are refusing to connect. Preprocessing is starved. Analysis has consumed its local buffer and halted. Results store write rate dropped to zero 2 hours ago.",
    runbook: "/docs/runbooks/certificate-expiry-recovery",
    logSignals: ["TLS_CERT_EXPIRED", "CONNECTION_REFUSED_MASS", "PREPROCESSING_STARVATION", "ANALYSIS_BUFFER_EXHAUSTED"],
    dbSignals: {
      certificate_registry: "ingestion.api_cert expiry_date = 2026-02-26 (6 days ago)",
      performance_history: "ingestion observation_rate = 0 (last 6 hours)",
      performance_history2: "preprocessing queue_depth = 0, analysis jobs_queued = 0",
    },
    recoverySequence: [
      { subsystem: "ingestion" as SubsystemId, action: "rotate_tls_certificate", params: { validity_days: 365 }, description: "Issue and activate a new TLS certificate" },
      { subsystem: "ingestion" as SubsystemId, action: "notify_data_sources", params: {}, description: "Signal all 47 data sources to reconnect" },
      { subsystem: "preprocessing" as SubsystemId, action: "reset_starvation_state", params: {}, description: "Clear timeout states from starvation period" },
      { subsystem: "analysis" as SubsystemId, action: "reload_pipeline", params: {}, description: "Restart analysis pipeline to clear halted state" },
      { subsystem: "results-store" as SubsystemId, action: "accept_backfill_mode", params: { duration_hours: 6 }, description: "Enable high-throughput backfill mode for the 6-hour gap" },
    ],
    redHerring: {
      subsystem: "query-gateway" as SubsystemId,
      symptom: "Response latency elevated 3x, cache hit rate dropped to 0.12",
      actualCause: "Cache naturally expired due to 6-hour data gap — not a query-gateway failure",
    },
    rootCauseTimestamp: "T-6h",
  },
] as const;

export type RootCauseId = "archive_disk_quota" | "analysis_memory_leak" | "preprocessing_config_drift" | "results_store_index_corruption" | "ingestion_cert_expiry";

// ── Log Entry Generator ───────────────────────────────────────────────

interface LogEntry {
  ts: string;
  level: "DEBUG" | "INFO" | "WARN" | "ERROR" | "CRITICAL";
  subsystem: SubsystemId;
  code: string;
  message: string;
  metadata: Record<string, unknown>;
}

const BASE_TIME = new Date("2026-03-04T00:00:00Z").getTime();

function generateLogs(scenario: (typeof ROOT_CAUSE_SCENARIOS)[number], r: () => number): LogEntry[] {
  const logs: LogEntry[] = [];

  // Helper: add a log entry at offset minutes from base
  function addLog(
    offsetMin: number,
    level: LogEntry["level"],
    subsystem: SubsystemId,
    code: string,
    message: string,
    metadata: Record<string, unknown> = {},
  ) {
    const jitter = Math.floor(r() * 60) - 30; // ±30s
    const ts = new Date(BASE_TIME + (offsetMin * 60 + jitter) * 1000).toISOString();
    logs.push({ ts, level, subsystem, code, message, metadata });
  }

  // ── Normal operational logs (background noise) ────────────────────
  for (let min = -360; min < 0; min += 5) {
    // Periodic health checks
    const sys = pick(SUBSYSTEMS as unknown as typeof SUBSYSTEMS[number][], r) as typeof SUBSYSTEMS[number];
    addLog(min, "INFO", sys.id, "HEALTH_CHECK_OK", `Health check passed`, { latency_ms: randInt(10, 200, r) });
  }

  // Ingestion activity logs (normal)
  for (let min = -360; min < 0; min += 3) {
    addLog(min, "INFO", "ingestion", "BATCH_RECEIVED", `Observation batch received`, {
      count: randInt(800, 1200, r),
      source_id: `DS-${randInt(1, 47, r).toString().padStart(3, "0")}`,
      latency_ms: randInt(15, 80, r),
    });
  }

  // ── Root cause onset signals ─────────────────────────────────────
  const onsetMin = -360; // 6 hours ago

  if (scenario.id === "archive_disk_quota") {
    // Disk filling up over time
    addLog(onsetMin + 60, "WARN", "archive", "DISK_USAGE_HIGH", "Disk usage crossed 85% threshold", { disk_usage_pct: 86.2, quota_gb: 2000 });
    addLog(onsetMin + 120, "WARN", "archive", "DISK_USAGE_HIGH", "Disk usage climbing", { disk_usage_pct: 91.4, quota_gb: 2000 });
    addLog(onsetMin + 180, "ERROR", "archive", "DISK_QUOTA_EXCEEDED", "Disk quota exceeded — writes failing", { disk_usage_pct: 97.1, failed_writes: 1243 });
    addLog(onsetMin + 182, "ERROR", "archive", "WRITE_TIMEOUT", "Write operation timeout after 30s", { operation: "segment_write", segment_id: "seg-20260304-0312" });
    addLog(onsetMin + 195, "ERROR", "results-store", "BACKPRESSURE_SIGNAL", "Archive write backpressure detected — queuing writes locally", { queue_depth: 1204 });
    addLog(onsetMin + 210, "CRITICAL", "archive", "DISK_QUOTA_EXCEEDED", "All write operations rejected — disk full", { disk_usage_pct: 97.8 });
    addLog(onsetMin + 240, "ERROR", "results-store", "BACKPRESSURE_SIGNAL", "Write queue depth critical", { queue_depth: 23400, queue_age_secs: 1847 });
    addLog(onsetMin + 280, "WARN", "query-gateway", "CACHE_STALE", "Archive connection degraded — cache not refreshing", { staleness_secs: 1200 });
    addLog(onsetMin + 310, "ERROR", "query-gateway", "ARCHIVE_UNREACHABLE", "Archive service returning errors on all paths", { error_rate: 0.94 });
    // Red herring: preprocessing latency
    addLog(onsetMin + 150, "WARN", "preprocessing", "LATENCY_ELEVATED", "Processing latency 2.1x above normal", { latency_ms: 1047, normal_ms: 498, note: "high_observation_volume" });

  } else if (scenario.id === "analysis_memory_leak") {
    addLog(onsetMin + 0, "WARN", "analysis", "MEMORY_USAGE_HIGH", "Worker-2 memory usage above 80%", { worker_id: 2, memory_mb: 6554, limit_mb: 8192 });
    addLog(onsetMin + 45, "ERROR", "analysis", "OOM_KILL", "Worker-2 killed by OOM", { worker_id: 2, memory_at_death_mb: 8190, pid: 14823 });
    addLog(onsetMin + 46, "INFO", "analysis", "WORKER_RESTART", "Restarting worker-2", { worker_id: 2, attempt: 1 });
    addLog(onsetMin + 90, "ERROR", "analysis", "OOM_KILL", "Worker-2 killed by OOM again", { worker_id: 2, memory_at_death_mb: 8191, pid: 14901 });
    addLog(onsetMin + 120, "ERROR", "analysis", "OOM_KILL", "Worker-0 killed by OOM", { worker_id: 0, memory_at_death_mb: 8189, pid: 13201 });
    addLog(onsetMin + 121, "CRITICAL", "analysis", "WORKER_RESTART_LOOP", "Workers entering restart loop — memory leak suspected", { oom_count: 3, active_workers: 2 });
    addLog(onsetMin + 150, "CRITICAL", "analysis", "OOM_KILL", "All workers OOM-killed", { active_workers: 0 });
    addLog(onsetMin + 151, "ERROR", "preprocessing", "QUEUE_DEPTH_CRITICAL", "Analysis consumer stopped — queue backing up", { queue_depth: 15234 });
    addLog(onsetMin + 200, "ERROR", "preprocessing", "QUEUE_DEPTH_CRITICAL", "Queue depth critical: 47000 observations pending", { queue_depth: 47234 });
    addLog(onsetMin + 250, "ERROR", "ingestion", "INGESTION_THROTTLE", "Adaptive throttle triggered — downstream queue critical", { throttle_pct: 60, queue_depth: 65000 });
    // Red herring: results-store slow queries
    addLog(onsetMin + 30, "WARN", "results-store", "INDEX_REBUILD_STARTED", "Scheduled index rebuild in progress — read performance degraded", { estimated_duration_min: 45 });

  } else if (scenario.id === "preprocessing_config_drift") {
    addLog(onsetMin + 0, "WARN", "preprocessing", "CONFIG_HASH_MISMATCH", "Validation config hash mismatch detected", { current_hash: "3f7a2b91c", expected_hash: "b91c43f7a", source: "config-sync-daemon" });
    addLog(onsetMin + 1, "ERROR", "preprocessing", "VALIDATION_RULE_OVERRIDE", "Config-sync daemon overwrote validation rules with incompatible version", { old_version: "v2.7.1", new_version: "v3.0.0-beta" });
    addLog(onsetMin + 5, "INFO", "preprocessing", "ANOMALOUS_PASS_RATE", "Validation pass rate unusually high: 99.9% (expected 87%)", { pass_rate: 0.999, expected: 0.87, note: "may indicate permissive rules" });
    addLog(onsetMin + 60, "ERROR", "analysis", "DATA_QUALITY_SCORE_LOW", "Data quality score below threshold — possible upstream contamination", { quality_score: 0.43, threshold: 0.80 });
    addLog(onsetMin + 120, "ERROR", "analysis", "DATA_QUALITY_SCORE_LOW", "Data quality degradation persisting", { quality_score: 0.38, observations_affected: 124000 });
    addLog(onsetMin + 180, "CRITICAL", "results-store", "DATA_INTEGRITY_RISK", "Storing results with known-low quality scores", { quality_score_min: 0.35, records_at_risk: 287000 });
    // Red herring: archive
    addLog(onsetMin + 90, "INFO", "archive", "COMPRESSION_UPGRADE", "Zstandard compression level upgrading: zstd-3 → zstd-7 (scheduled maintenance)", { throughput_reduction_pct: 40 });

  } else if (scenario.id === "results_store_index_corruption") {
    addLog(onsetMin + 0, "WARN", "results-store", "POWER_ANOMALY_DETECTED", "UPS reported 340ms power interruption — write may have been partial", { interruption_ms: 340, affected_component: "temporal_index" });
    addLog(onsetMin + 2, "ERROR", "results-store", "INDEX_CHECKSUM_FAILURE", "Temporal index checksum verification failed post-anomaly", { index: "temporal_btree", expected_checksum: "7f3a", actual_checksum: "7f3b" });
    addLog(onsetMin + 10, "ERROR", "results-store", "RANGE_QUERY_UNDERCOUNT", "Range query returning fewer results than expected", { expected_min: 12400, actual: 9708, deficiency_pct: 21.7 });
    addLog(onsetMin + 60, "WARN", "archive", "ARCHIVE_SYNC_PARTIAL", "Archive sync incomplete — some results missing from source", { sync_completeness: 0.71 });
    addLog(onsetMin + 90, "ERROR", "archive", "ARCHIVE_SYNC_PARTIAL", "Repeated partial syncs — source data inconsistent", { sync_completeness: 0.69 });
    addLog(onsetMin + 120, "ERROR", "query-gateway", "INCONSISTENT_RESULTS", "Query results inconsistent between cached and live paths", { cache_hit_sample: 1248, live_sample: 978 });
    // Red herring: ingestion auth timeouts
    addLog(onsetMin + 30, "WARN", "ingestion", "AUTH_TIMEOUT", "Certificate renewal causing auth timeouts", { timeout_count: 3, note: "cert renewal in progress — normal" });

  } else if (scenario.id === "ingestion_cert_expiry") {
    addLog(onsetMin + 0, "CRITICAL", "ingestion", "TLS_CERT_EXPIRED", "TLS certificate expired — all incoming connections rejected", { cert_subject: "ingest.lighthouse.internal", expiry: "2026-02-26", hours_overdue: 6 });
    addLog(onsetMin + 1, "CRITICAL", "ingestion", "CONNECTION_REFUSED_MASS", "All 47 data sources reporting connection refused", { sources_affected: 47, first_connection_attempt: "DS-001" });
    addLog(onsetMin + 5, "ERROR", "ingestion", "OBSERVATION_RATE_ZERO", "Observation ingestion rate dropped to zero", { rate: 0, previous_rate: 923 });
    addLog(onsetMin + 60, "WARN", "preprocessing", "PREPROCESSING_STARVATION", "No new observations from ingestion — queue draining", { queue_depth: 12400, drain_rate_per_min: 620 });
    addLog(onsetMin + 80, "ERROR", "preprocessing", "PREPROCESSING_STARVATION", "Queue exhausted — preprocessing idle", { queue_depth: 0 });
    addLog(onsetMin + 82, "ERROR", "analysis", "ANALYSIS_BUFFER_EXHAUSTED", "Local analysis buffer consumed — halting", { buffer_depth: 0, halt_reason: "starvation" });
    addLog(onsetMin + 120, "CRITICAL", "analysis", "PIPELINE_HALT", "Analysis pipeline halted due to upstream starvation", { hours_idle: 2 });
    addLog(onsetMin + 121, "WARN", "results-store", "WRITE_RATE_ZERO", "No new results being written — analysis halted", { write_rate: 0 });
    // Red herring: query-gateway
    addLog(onsetMin + 60, "WARN", "query-gateway", "CACHE_HIT_RATE_LOW", "Cache hit rate dropped to 12% as cached entries expired naturally", { cache_hit_rate: 0.12, note: "no new data to cache" });
  }

  // ── Recent detection/alert logs (last 60 min) ─────────────────────
  addLog(-60, "ERROR", scenario.triggeredBy, "ALERT_TRIGGERED", `P1 alert: ${scenario.name}`, { severity: "P1", auto_escalated: true });
  addLog(-45, "INFO", "ingestion", "HEALTH_CHECK_DEGRADED", "Health check returning degraded status", { status: "degraded" });
  addLog(-15, "WARN", scenario.failureChain[scenario.failureChain.length - 1], "SLA_BREACH", "SLA threshold breached", { metric: "error_rate", value: 0.34, threshold: 0.005 });

  // Sort chronologically
  logs.sort((a, b) => a.ts.localeCompare(b.ts));
  return logs;
}

// ── Database Table Generator ──────────────────────────────────────────

interface DbTables {
  subsystem_config: Array<Record<string, unknown>>;
  dependency_graph: Array<Record<string, unknown>>;
  sla_targets: Array<Record<string, unknown>>;
  performance_history: Array<Record<string, unknown>>;
  incident_history: Array<Record<string, unknown>>;
  certificate_registry: Array<Record<string, unknown>>;
  disk_usage_history: Array<Record<string, unknown>>;
}

function generateDbTables(scenario: (typeof ROOT_CAUSE_SCENARIOS)[number], r: () => number): DbTables {
  // subsystem_config
  const subsystem_config = SUBSYSTEMS.map((sys) => ({
    subsystem_id: sys.id,
    name: sys.name,
    description: sys.description,
    version: `${randInt(2, 4, r)}.${randInt(0, 9, r)}.${randInt(0, 15, r)}`,
    last_deployed: new Date(BASE_TIME - randInt(1, 30, r) * 24 * 3600 * 1000).toISOString().split("T")[0],
    config_hash: `${Math.floor(r() * 0xffffffff).toString(16).padStart(8, "0")}`,
    worker_count: sys.id === "analysis" ? 4 : sys.id === "preprocessing" ? 2 : 1,
    memory_limit_mb: sys.id === "analysis" ? 8192 : 2048,
    status: scenario.failureChain.includes(sys.id as SubsystemId) ? "degraded" : "healthy",
    // Add scenario-specific signals
    ...(scenario.id === "preprocessing_config_drift" && sys.id === "preprocessing"
      ? { validation_config_hash: "3f7a2b91c", expected_config_hash: "b91c43f7a", config_drift_detected: true }
      : {}),
    ...(scenario.id === "analysis_memory_leak" && sys.id === "analysis"
      ? { oom_events_24h: 5, last_oom_at: new Date(BASE_TIME - 90 * 60 * 1000).toISOString() }
      : {}),
  }));

  // dependency_graph
  const dependency_graph: Array<Record<string, unknown>> = [];
  for (const sys of SUBSYSTEMS) {
    for (const dep of sys.upstream) {
      dependency_graph.push({
        id: `${sys.id}-depends-on-${dep}`,
        dependent: sys.id,
        dependency: dep,
        dependency_type: "hard",
        backpressure_enabled: true,
        timeout_secs: 30,
      });
    }
  }

  // sla_targets
  const sla_targets = SUBSYSTEMS.map((sys) => ({
    subsystem_id: sys.id,
    ...sys.sla,
    measurement_window_secs: 300,
    breach_action: "page_on_call",
    last_measured_at: new Date(BASE_TIME - 5 * 60 * 1000).toISOString(),
    current_status: scenario.failureChain.includes(sys.id as SubsystemId) ? "BREACHED" : "OK",
  }));

  // performance_history (hourly snapshots for last 12 hours)
  const performance_history: Array<Record<string, unknown>> = [];
  for (let hoursAgo = 12; hoursAgo >= 0; hoursAgo--) {
    const ts = new Date(BASE_TIME - hoursAgo * 3600 * 1000).toISOString();
    const isAffected = hoursAgo <= 6; // Incident started 6h ago
    for (const sys of SUBSYSTEMS) {
      const degraded = isAffected && scenario.failureChain.includes(sys.id as SubsystemId);
      const isRoot = sys.id === scenario.triggeredBy;
      const row: Record<string, unknown> = {
        ts,
        subsystem_id: sys.id,
        latency_p50_ms: degraded ? randInt(2000, 8000, r) : randInt(50, 300, r),
        latency_p99_ms: degraded ? randInt(10000, 30000, r) : randInt(200, 1000, r),
        error_rate: degraded ? (isRoot ? 0.45 + r() * 0.5 : 0.1 + r() * 0.3) : r() * 0.002,
        throughput_pct: degraded ? (isRoot ? r() * 0.2 : 0.2 + r() * 0.5) : 0.85 + r() * 0.15,
      };
      // Scenario-specific DB signals
      if (scenario.id === "archive_disk_quota" && sys.id === "archive") {
        row["disk_usage_pct"] = isAffected ? 95 + r() * 3 : 80 + hoursAgo * 2;
        row["write_success_rate"] = isAffected ? r() * 0.2 : 0.98 + r() * 0.02;
      }
      if (scenario.id === "analysis_memory_leak" && sys.id === "analysis") {
        row["memory_usage_pct"] = isAffected ? 95 + r() * 5 : 60 + r() * 20;
        row["active_workers"] = isAffected && hoursAgo <= 4 ? 0 : 4;
        row["queue_depth"] = isAffected ? randInt(20000, 75000, r) : randInt(0, 500, r);
      }
      if (scenario.id === "preprocessing_config_drift" && sys.id === "preprocessing") {
        row["validation_pass_rate"] = isAffected ? 0.999 : 0.87 + r() * 0.05;
      }
      if (scenario.id === "preprocessing_config_drift" && sys.id === "analysis") {
        row["data_quality_score"] = isAffected ? 0.35 + r() * 0.15 : 0.88 + r() * 0.10;
      }
      if (scenario.id === "results_store_index_corruption" && sys.id === "results-store") {
        row["range_query_result_count_ratio"] = isAffected ? 0.7 + r() * 0.15 : 1.0;
        row["index_checksum_valid"] = !isAffected;
      }
      if (scenario.id === "ingestion_cert_expiry" && sys.id === "ingestion") {
        row["observation_rate_per_sec"] = isAffected ? 0 : 900 + r() * 100;
        row["active_source_connections"] = isAffected ? 0 : 47;
      }
      performance_history.push(row);
    }
  }

  // incident_history (past incidents for context)
  const incident_history = [
    {
      incident_id: `INC-${Math.floor(r() * 9000) + 1000}`,
      started_at: new Date(BASE_TIME - 15 * 24 * 3600 * 1000).toISOString(),
      resolved_at: new Date(BASE_TIME - 15 * 24 * 3600 * 1000 + 2 * 3600 * 1000).toISOString(),
      root_cause: "query-gateway_cache_misconfiguration",
      affected_subsystems: ["query-gateway"],
      severity: "P2",
      resolution: "Rolled back cache config to previous version",
    },
    {
      incident_id: `INC-${Math.floor(r() * 9000) + 1000}`,
      started_at: new Date(BASE_TIME - 45 * 24 * 3600 * 1000).toISOString(),
      resolved_at: new Date(BASE_TIME - 45 * 24 * 3600 * 1000 + 4 * 3600 * 1000).toISOString(),
      root_cause: "preprocessing_worker_crash",
      affected_subsystems: ["preprocessing", "analysis"],
      severity: "P1",
      resolution: "Restarted preprocessing workers, drained backlog",
    },
    // Add a past version of the current root cause type for pattern recognition
    ...(scenario.id === "archive_disk_quota" ? [{
      incident_id: `INC-${Math.floor(r() * 9000) + 1000}`,
      started_at: new Date(BASE_TIME - 90 * 24 * 3600 * 1000).toISOString(),
      resolved_at: new Date(BASE_TIME - 90 * 24 * 3600 * 1000 + 1 * 3600 * 1000).toISOString(),
      root_cause: "archive_disk_quota",
      affected_subsystems: ["archive"],
      severity: "P2",
      resolution: "Extended quota. Resolved before downstream impact.",
      note: "Previous incident — quota was extended but not automated. Current: much more severe.",
    }] : []),
  ];

  // certificate_registry
  const certificate_registry = [
    {
      service: "ingestion.api",
      domain: "ingest.lighthouse.internal",
      expiry_date: scenario.id === "ingestion_cert_expiry"
        ? "2026-02-26"  // Expired 6 days ago
        : new Date(BASE_TIME + 350 * 24 * 3600 * 1000).toISOString().split("T")[0],
      issuer: "LIGHTHOUSE Internal CA",
      last_rotated: scenario.id === "ingestion_cert_expiry"
        ? "2025-02-26"  // 365 days ago
        : new Date(BASE_TIME - 15 * 24 * 3600 * 1000).toISOString().split("T")[0],
      status: scenario.id === "ingestion_cert_expiry" ? "EXPIRED" : "VALID",
      auto_rotation: false,
      rotation_reminder_sent: scenario.id === "ingestion_cert_expiry" ? false : true,
    },
    {
      service: "archive.internal",
      domain: "archive.lighthouse.internal",
      expiry_date: new Date(BASE_TIME + 180 * 24 * 3600 * 1000).toISOString().split("T")[0],
      issuer: "LIGHTHOUSE Internal CA",
      last_rotated: new Date(BASE_TIME - 180 * 24 * 3600 * 1000).toISOString().split("T")[0],
      status: "VALID",
      auto_rotation: false,
    },
  ];

  // disk_usage_history (hourly for last 24h, archive subsystem)
  const disk_usage_history: Array<Record<string, unknown>> = [];
  for (let hoursAgo = 24; hoursAgo >= 0; hoursAgo--) {
    const ts = new Date(BASE_TIME - hoursAgo * 3600 * 1000).toISOString();
    let pct: number;
    if (scenario.id === "archive_disk_quota") {
      // Linear growth culminating in quota exceeded
      pct = Math.min(97.8, 72 + (24 - hoursAgo) * 1.1);
    } else {
      // Normal variation
      pct = 60 + r() * 10;
    }
    disk_usage_history.push({
      ts,
      subsystem_id: "archive",
      disk_usage_pct: parseFloat(pct.toFixed(1)),
      used_gb: parseFloat((pct * 20).toFixed(1)),
      quota_gb: 2000,
      write_rate_mb_per_sec: scenario.id === "archive_disk_quota" && hoursAgo <= 6 ? r() * 2 : 120 + r() * 40,
    });
  }

  return {
    subsystem_config,
    dependency_graph,
    sla_targets,
    performance_history,
    incident_history,
    certificate_registry,
    disk_usage_history,
  };
}

// ── Initial Triage Context (workspace file) ───────────────────────────

function generateTriageContext(scenario: (typeof ROOT_CAUSE_SCENARIOS)[number], seed: number): Record<string, unknown> {
  return {
    incident_id: `INC-${seed.toString().slice(0, 6)}`,
    detected_at: new Date(BASE_TIME - 45 * 60 * 1000).toISOString(),
    severity: "P1",
    auto_escalated_at: new Date(BASE_TIME - 30 * 60 * 1000).toISOString(),
    initial_alerts: scenario.failureChain.slice(0, 2).map((sid, i) => ({
      subsystem: sid,
      alert: i === 0 ? "SLA_BREACH_CRITICAL" : "SLA_BREACH",
      message: i === 0
        ? `${sid} subsystem is breaching SLA thresholds on multiple metrics`
        : `${sid} subsystem showing degraded performance — possible downstream effect`,
      detected_at: new Date(BASE_TIME - (60 - i * 15) * 60 * 1000).toISOString(),
    })),
    monitoring_note: "Initial alerts are from monitoring systems and reflect symptoms observed. Root cause may be upstream. Do not assume the alerted subsystems are the root cause.",
    on_call_assignment: "AUTOMATED — you have been assigned as incident commander",
    time_since_incident_start: "approximately 6 hours (estimated from earliest symptom)",
    known_maintenance_windows: scenario.redHerring.subsystem !== "ingestion" ? [] : [
      { subsystem: "ingestion", type: "certificate_renewal", scheduled: true, note: "Routine 90-day renewal — began yesterday" },
    ],
  };
}

// ── Main Export ───────────────────────────────────────────────────────

export interface LighthouseGroundTruth {
  rootCauseId: RootCauseId;
  rootCauseName: string;
  failureChain: SubsystemId[];
  recoverySequence: Array<{ subsystem: SubsystemId; action: string; params: Record<string, unknown> }>;
  runbook: string;
  redHerring: { subsystem: SubsystemId; symptom: string; actualCause: string };
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

export function generateLighthouseData(seed: number): LighthouseGeneratedData {
  const r = rng(seed);

  // Pick scenario deterministically from seed
  const scenarioIdx = Math.floor(r() * ROOT_CAUSE_SCENARIOS.length);
  const scenario = ROOT_CAUSE_SCENARIOS[scenarioIdx];

  const logs = generateLogs(scenario, r);
  const dbTables = generateDbTables(scenario, r);
  const triageContext = generateTriageContext(scenario, seed);

  const objective =
    `P1 INCIDENT — LIGHTHOUSE distributed pipeline is experiencing cascading failures. ` +
    `Initial alerts indicate degradation in ${scenario.failureChain.slice(0, 2).join(" and ")} subsystems. ` +
    `You have access to: live system API, MCP log server, MCP operations database, and external documentation proxy. ` +
    `Diagnose the root cause, execute recovery procedures, and submit a structured incident report. ` +
    `Valid root_cause values: archive_disk_quota, analysis_memory_leak, preprocessing_config_drift, results_store_index_corruption, ingestion_cert_expiry. ` +
    `Submit: { root_cause, root_cause_evidence, failure_chain, recovery_actions_taken, recovery_script, incident_report, methodology }`;

  const groundTruth: LighthouseGroundTruth = {
    rootCauseId: scenario.id as RootCauseId,
    rootCauseName: scenario.name,
    failureChain: [...scenario.failureChain],
    recoverySequence: scenario.recoverySequence.map((r) => ({ ...r, params: { ...r.params } })),
    runbook: scenario.runbook,
    redHerring: { ...scenario.redHerring },
    logSignals: scenario.logSignals,
    dbSignals: scenario.dbSignals,
    seed,
  };

  return { objective, groundTruth, scenario, logs, dbTables, triageContext };
}
