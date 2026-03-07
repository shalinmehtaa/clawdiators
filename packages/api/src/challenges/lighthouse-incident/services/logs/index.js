/**
 * LIGHTHOUSE Logs Server
 *
 * REST API providing structured query access to LIGHTHOUSE system logs.
 * Logs are generated deterministically from the SEED env var, matching
 * the same scenario as the lighthouse-api service.
 *
 * Endpoints:
 *   GET  /tools                      — List available tools
 *   POST /tools/query_logs           — Query with filters (subsystem, severity, pattern, time_range)
 *   POST /tools/get_anomaly_timeline — Chronological WARN+ events
 *   POST /tools/correlate_events     — Find co-occurring events across subsystems
 *   POST /tools/get_error_summary    — Per-subsystem error counts
 */

import express from "express";

// ── PRNG ─────────────────────────────────────────────────────────────

function rng(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Scenario selection (must match lighthouse-api) ────────────────────

const SEED = parseInt(process.env.SEED ?? "42", 10);
const r = rng(SEED);

const SCENARIOS = [
  {
    id: "archive_disk_quota",
    failureChain: ["archive", "results-store", "query-gateway"],
    logSignals: ["DISK_QUOTA_EXCEEDED", "WRITE_TIMEOUT", "BACKPRESSURE_SIGNAL", "CACHE_STALE"],
    redHerrings: [
      { subsystem: "preprocessing", signal: "LATENCY_ELEVATED" },
      { subsystem: "analysis", signal: "GC_PAUSE_ELEVATED" },
    ],
  },
  {
    id: "analysis_memory_leak",
    failureChain: ["analysis", "preprocessing", "ingestion"],
    logSignals: ["OOM_KILL", "WORKER_RESTART_LOOP", "QUEUE_DEPTH_CRITICAL", "INGESTION_THROTTLE"],
    redHerrings: [
      { subsystem: "results-store", signal: "REPLICATION_LAG" },
      { subsystem: "archive", signal: "SEGMENT_MERGE_SLOW" },
    ],
  },
  {
    id: "preprocessing_config_drift",
    failureChain: ["preprocessing", "analysis", "results-store"],
    logSignals: ["CONFIG_HASH_MISMATCH", "VALIDATION_RULE_OVERRIDE", "DATA_QUALITY_SCORE_LOW", "ANOMALOUS_PASS_RATE"],
    redHerrings: [
      { subsystem: "archive", signal: "COMPRESSION_RATIO_DROP" },
      { subsystem: "ingestion", signal: "SOURCE_TIMEOUT" },
    ],
  },
  {
    id: "results_store_index_corruption",
    failureChain: ["results-store", "archive", "query-gateway"],
    logSignals: ["POWER_ANOMALY_DETECTED", "INDEX_CHECKSUM_FAILURE", "RANGE_QUERY_UNDERCOUNT", "ARCHIVE_SYNC_PARTIAL"],
    redHerrings: [
      { subsystem: "ingestion", signal: "AUTH_TIMEOUT" },
      { subsystem: "preprocessing", signal: "THROUGHPUT_DEGRADED" },
    ],
  },
  {
    id: "ingestion_cert_expiry",
    failureChain: ["ingestion", "preprocessing", "analysis", "results-store"],
    logSignals: ["TLS_CERT_EXPIRED", "CONNECTION_REFUSED_MASS", "PREPROCESSING_STARVATION", "ANALYSIS_BUFFER_EXHAUSTED"],
    redHerrings: [
      { subsystem: "query-gateway", signal: "CACHE_EVICTION_SPIKE" },
      { subsystem: "archive", signal: "SEGMENT_MERGE_SLOW" },
    ],
  },
];

const scenarioIdx = Math.floor(r() * SCENARIOS.length);
const SCENARIO = SCENARIOS[scenarioIdx];

// ── Log Generation ────────────────────────────────────────────────────

const BASE_TIME = new Date("2026-03-04T00:00:00Z").getTime();
const ALL_SUBSYSTEMS = ["ingestion", "preprocessing", "analysis", "results-store", "archive", "query-gateway"];

function randInt(min, max, rf) { return min + Math.floor(rf() * (max - min + 1)); }

function generateLogs() {
  const logs = [];
  const r2 = rng(SEED + 1); // separate stream for log generation

  function addLog(offsetMin, level, subsystem, code, message, metadata = {}) {
    const jitter = Math.floor(r2() * 60) - 30;
    const ts = new Date(BASE_TIME + (offsetMin * 60 + jitter) * 1000).toISOString();
    logs.push({ ts, level, subsystem, code, message, metadata });
  }

  // Background operational logs
  for (let min = -360; min < 0; min += 5) {
    const sysList = [...ALL_SUBSYSTEMS];
    const sys = sysList[Math.floor(r2() * sysList.length)];
    addLog(min, "INFO", sys, "HEALTH_CHECK_OK", "Health check passed", { latency_ms: randInt(10, 200, r2) });
  }

  // Normal ingestion activity
  for (let min = -360; min < 0; min += 3) {
    addLog(min, "INFO", "ingestion", "BATCH_RECEIVED", "Observation batch received", {
      count: randInt(800, 1200, r2),
      source_id: `DS-${randInt(1, 47, r2).toString().padStart(3, "0")}`,
      latency_ms: randInt(15, 80, r2),
    });
  }

  // ── Noise WARN entries on healthy subsystems ────────────────────────
  // Sporadic warnings that are normal operational noise
  addLog(-320, "WARN", "query-gateway", "CONNECTION_RETRY", "Connection pool retry on upstream read", { retry_count: 1, latency_ms: 340 });
  addLog(-240, "WARN", "analysis", "GC_PAUSE", "GC pause exceeded 200ms threshold", { pause_ms: 247, heap_usage_pct: 72 });
  addLog(-180, "WARN", "ingestion", "CONNECTION_RETRY", "Transient connection retry from DS-031", { retry_count: 1, source_id: "DS-031" });
  addLog(-120, "WARN", "results-store", "GC_PAUSE", "GC pause on query thread", { pause_ms: 312, thread: "query-worker-2" });
  addLog(-90, "WARN", "preprocessing", "BATCH_SLOW", "Batch processing exceeded soft timeout", { batch_id: "B-7821", duration_ms: 890, threshold_ms: 500 });

  const onsetMin = -360;

  if (SCENARIO.id === "archive_disk_quota") {
    addLog(onsetMin + 60, "WARN", "archive", "DISK_USAGE_HIGH", "Disk usage crossed 85% threshold", { disk_usage_pct: 86.2 });
    addLog(onsetMin + 120, "WARN", "archive", "DISK_USAGE_HIGH", "Disk usage climbing", { disk_usage_pct: 91.4 });
    addLog(onsetMin + 180, "ERROR", "archive", "DISK_QUOTA_EXCEEDED", "Disk quota exceeded — writes failing", { disk_usage_pct: 97.1, failed_writes: 1243 });
    addLog(onsetMin + 182, "ERROR", "archive", "WRITE_TIMEOUT", "Write operation timeout after 30s", { operation: "segment_write" });
    addLog(onsetMin + 195, "ERROR", "results-store", "BACKPRESSURE_SIGNAL", "Archive write backpressure detected", { queue_depth: 1204 });
    addLog(onsetMin + 210, "CRITICAL", "archive", "DISK_QUOTA_EXCEEDED", "All write operations rejected — disk full", { disk_usage_pct: 97.8 });
    addLog(onsetMin + 240, "ERROR", "results-store", "BACKPRESSURE_SIGNAL", "Write queue depth critical", { queue_depth: 23400 });
    addLog(onsetMin + 280, "WARN", "query-gateway", "CACHE_STALE", "Archive connection degraded — cache not refreshing", { staleness_secs: 1200 });
    addLog(onsetMin + 310, "ERROR", "query-gateway", "ARCHIVE_UNREACHABLE", "Archive service returning errors on all paths", { error_rate: 0.94 });
    // Red herring 1: preprocessing latency (no dismissive note)
    addLog(onsetMin + 100, "WARN", "preprocessing", "LATENCY_ELEVATED", "Processing latency 2.1x above baseline", { latency_ms: 1047, baseline_ms: 498 });
    addLog(onsetMin + 200, "WARN", "preprocessing", "LATENCY_ELEVATED", "Sustained elevated processing latency", { latency_ms: 1182, baseline_ms: 498 });
    // Red herring 2: analysis GC pressure
    addLog(onsetMin + 130, "WARN", "analysis", "GC_PAUSE_ELEVATED", "Frequent GC pauses on worker-1", { pause_count_5min: 12, avg_pause_ms: 340 });
    addLog(onsetMin + 220, "WARN", "analysis", "GC_PAUSE_ELEVATED", "GC pressure persisting on worker-1", { pause_count_5min: 15, avg_pause_ms: 380, heap_usage_pct: 78 });
    // Cross-scenario shared signal
    addLog(onsetMin + 250, "WARN", "results-store", "LATENCY_ELEVATED", "Read latency climbing under backpressure", { latency_p99_ms: 3200 });
  } else if (SCENARIO.id === "analysis_memory_leak") {
    addLog(onsetMin, "WARN", "analysis", "MEMORY_USAGE_HIGH", "Worker-2 memory usage above 80%", { worker_id: 2, memory_mb: 6554, limit_mb: 8192 });
    addLog(onsetMin + 45, "ERROR", "analysis", "OOM_KILL", "Worker-2 killed by OOM", { worker_id: 2, memory_at_death_mb: 8190, pid: 14823 });
    addLog(onsetMin + 46, "INFO", "analysis", "WORKER_RESTART", "Restarting worker-2", { worker_id: 2, attempt: 1 });
    addLog(onsetMin + 90, "ERROR", "analysis", "OOM_KILL", "Worker-2 killed by OOM again", { worker_id: 2, memory_at_death_mb: 8191 });
    addLog(onsetMin + 120, "ERROR", "analysis", "OOM_KILL", "Worker-0 killed by OOM", { worker_id: 0, memory_at_death_mb: 8189 });
    addLog(onsetMin + 121, "CRITICAL", "analysis", "WORKER_RESTART_LOOP", "Workers entering restart loop — memory leak suspected", { oom_count: 3, active_workers: 2 });
    addLog(onsetMin + 150, "CRITICAL", "analysis", "OOM_KILL", "All workers OOM-killed", { active_workers: 0 });
    addLog(onsetMin + 151, "ERROR", "preprocessing", "QUEUE_DEPTH_CRITICAL", "Analysis consumer stopped — queue backing up", { queue_depth: 15234 });
    addLog(onsetMin + 200, "ERROR", "preprocessing", "QUEUE_DEPTH_CRITICAL", "Queue depth critical: 47000 observations", { queue_depth: 47234 });
    addLog(onsetMin + 250, "ERROR", "ingestion", "INGESTION_THROTTLE", "Adaptive throttle triggered", { throttle_pct: 60, queue_depth: 65000 });
    // Red herring 1: results-store replication lag (no dismissive note)
    addLog(onsetMin + 20, "WARN", "results-store", "REPLICATION_LAG", "Replication lag exceeding threshold", { lag_ms: 2400, threshold_ms: 1000 });
    addLog(onsetMin + 100, "WARN", "results-store", "REPLICATION_LAG", "Replication lag persisting", { lag_ms: 3100, threshold_ms: 1000 });
    // Red herring 2: archive segment merge
    addLog(onsetMin + 50, "WARN", "archive", "SEGMENT_MERGE_SLOW", "Segment merge operation exceeding expected duration", { merge_duration_ms: 45000, expected_ms: 15000 });
    addLog(onsetMin + 160, "WARN", "archive", "SEGMENT_MERGE_SLOW", "Segment merge backlog growing", { pending_merges: 23, merge_duration_ms: 52000 });
    // Cross-scenario shared signal
    addLog(onsetMin + 170, "ERROR", "preprocessing", "BACKPRESSURE_SIGNAL", "Upstream backpressure from queue depth", { queue_depth: 35000 });
    addLog(onsetMin + 210, "WARN", "preprocessing", "QUEUE_DEPTH_WARNING", "Queue approaching capacity", { queue_depth: 55000, capacity: 100000 });
  } else if (SCENARIO.id === "preprocessing_config_drift") {
    addLog(onsetMin, "WARN", "preprocessing", "CONFIG_HASH_MISMATCH", "Validation config hash mismatch detected", { current_hash: "3f7a2b91c", expected_hash: "b91c43f7a", source: "config-sync-daemon" });
    addLog(onsetMin + 1, "ERROR", "preprocessing", "VALIDATION_RULE_OVERRIDE", "Config-sync daemon overwrote validation rules", { old_version: "v2.7.1", new_version: "v3.0.0-beta" });
    addLog(onsetMin + 5, "INFO", "preprocessing", "ANOMALOUS_PASS_RATE", "Validation pass rate unusually high: 99.9%", { pass_rate: 0.999, expected: 0.87 });
    addLog(onsetMin + 60, "ERROR", "analysis", "DATA_QUALITY_SCORE_LOW", "Data quality score below threshold", { quality_score: 0.43, threshold: 0.80 });
    addLog(onsetMin + 120, "ERROR", "analysis", "DATA_QUALITY_SCORE_LOW", "Data quality degradation persisting", { quality_score: 0.38, observations_affected: 124000 });
    addLog(onsetMin + 180, "CRITICAL", "results-store", "DATA_INTEGRITY_RISK", "Storing results with known-low quality scores", { records_at_risk: 287000 });
    // Red herring 1: archive compression ratio drop (no dismissive note)
    addLog(onsetMin + 40, "WARN", "archive", "COMPRESSION_RATIO_DROP", "Zstandard compression ratio declining: 4.2x to 2.8x", { current_ratio: 2.8, previous_ratio: 4.2 });
    addLog(onsetMin + 140, "WARN", "archive", "COMPRESSION_RATIO_DROP", "Compression ratio continues declining", { current_ratio: 2.5, throughput_reduction_pct: 38 });
    // Red herring 2: ingestion source timeouts
    addLog(onsetMin + 70, "WARN", "ingestion", "SOURCE_TIMEOUT", "Data source DS-017 connection timeout", { source_id: "DS-017", timeout_ms: 30000, retry: 2 });
    addLog(onsetMin + 150, "WARN", "ingestion", "SOURCE_TIMEOUT", "Data source DS-017 intermittent timeouts persisting", { source_id: "DS-017", timeout_count_1h: 7 });
    // Cross-scenario shared signals
    addLog(onsetMin + 90, "WARN", "results-store", "THROUGHPUT_DEGRADED", "Write throughput below expected baseline", { throughput_pct: 0.62 });
    addLog(onsetMin + 100, "WARN", "analysis", "QUEUE_DEPTH_WARNING", "Analysis input queue depth elevated", { queue_depth: 8400, normal_depth: 2000 });
  } else if (SCENARIO.id === "results_store_index_corruption") {
    addLog(onsetMin, "WARN", "results-store", "POWER_ANOMALY_DETECTED", "UPS reported 340ms power interruption — write may have been partial", { interruption_ms: 340 });
    addLog(onsetMin + 2, "ERROR", "results-store", "INDEX_CHECKSUM_FAILURE", "Temporal index checksum verification failed", { index: "temporal_btree", expected: "7f3a", actual: "7f3b" });
    addLog(onsetMin + 10, "ERROR", "results-store", "RANGE_QUERY_UNDERCOUNT", "Range query returning fewer results than expected", { expected_min: 12400, actual: 9708, deficiency_pct: 21.7 });
    addLog(onsetMin + 60, "WARN", "archive", "ARCHIVE_SYNC_PARTIAL", "Archive sync incomplete", { sync_completeness: 0.71 });
    addLog(onsetMin + 90, "ERROR", "archive", "ARCHIVE_SYNC_PARTIAL", "Repeated partial syncs — source data inconsistent", { sync_completeness: 0.69 });
    addLog(onsetMin + 120, "ERROR", "query-gateway", "INCONSISTENT_RESULTS", "Query results inconsistent between cached and live paths", { cache_sample: 1248, live_sample: 978 });
    // Red herring 1: ingestion auth timeouts (no dismissive note)
    addLog(onsetMin + 15, "WARN", "ingestion", "AUTH_TIMEOUT", "Authentication handshake timeouts increasing", { timeout_count: 5, avg_handshake_ms: 4200 });
    addLog(onsetMin + 80, "WARN", "ingestion", "AUTH_TIMEOUT", "Authentication timeouts persisting", { timeout_count: 8, affected_sources: 3 });
    // Red herring 2: preprocessing throughput degradation
    addLog(onsetMin + 30, "WARN", "preprocessing", "THROUGHPUT_DEGRADED", "Processing throughput 30% below baseline", { throughput_pct: 0.70, baseline_pct: 1.0 });
    addLog(onsetMin + 110, "WARN", "preprocessing", "THROUGHPUT_DEGRADED", "Throughput degradation persisting", { throughput_pct: 0.65 });
    // Cross-scenario shared signal
    addLog(onsetMin + 70, "WARN", "results-store", "LATENCY_ELEVATED", "Read latency elevated following index issue", { latency_p99_ms: 4500 });
  } else if (SCENARIO.id === "ingestion_cert_expiry") {
    addLog(onsetMin, "CRITICAL", "ingestion", "TLS_CERT_EXPIRED", "TLS certificate expired — all incoming connections rejected", { cert_subject: "ingest.lighthouse.internal", expiry: "2026-02-26", hours_overdue: 6 });
    addLog(onsetMin + 1, "CRITICAL", "ingestion", "CONNECTION_REFUSED_MASS", "All 47 data sources reporting connection refused", { sources_affected: 47 });
    addLog(onsetMin + 5, "ERROR", "ingestion", "OBSERVATION_RATE_ZERO", "Observation ingestion rate dropped to zero", { rate: 0 });
    addLog(onsetMin + 60, "WARN", "preprocessing", "PREPROCESSING_STARVATION", "No new observations — queue draining", { queue_depth: 12400 });
    addLog(onsetMin + 80, "ERROR", "preprocessing", "PREPROCESSING_STARVATION", "Queue exhausted — preprocessing idle", { queue_depth: 0 });
    addLog(onsetMin + 82, "ERROR", "analysis", "ANALYSIS_BUFFER_EXHAUSTED", "Local analysis buffer consumed — halting", { buffer_depth: 0 });
    addLog(onsetMin + 121, "WARN", "results-store", "WRITE_RATE_ZERO", "No new results being written — analysis halted", { write_rate: 0 });
    // Red herring 1: query-gateway cache eviction spike (no dismissive note)
    addLog(onsetMin + 30, "WARN", "query-gateway", "CACHE_EVICTION_SPIKE", "Cache eviction rate spiked 5x above normal", { eviction_rate: 450, normal_rate: 90 });
    addLog(onsetMin + 90, "WARN", "query-gateway", "CACHE_EVICTION_SPIKE", "Cache evictions continuing at elevated rate", { eviction_rate: 380, cache_hit_rate: 0.15 });
    // Red herring 2: archive segment merge
    addLog(onsetMin + 50, "WARN", "archive", "SEGMENT_MERGE_SLOW", "Segment merge operations taking longer than expected", { merge_duration_ms: 38000, expected_ms: 15000 });
    addLog(onsetMin + 130, "WARN", "archive", "SEGMENT_MERGE_SLOW", "Segment merge backlog growing", { pending_merges: 18 });
    // Cross-scenario shared signals
    addLog(onsetMin + 100, "WARN", "preprocessing", "LATENCY_ELEVATED", "Processing latency elevated due to queue state changes", { latency_ms: 1340 });
    addLog(onsetMin + 140, "WARN", "analysis", "THROUGHPUT_DEGRADED", "Analysis throughput at zero due to upstream starvation", { throughput_pct: 0.0 });
  }

  // Recent alert
  addLog(-60, "ERROR", SCENARIO.failureChain[0], "ALERT_TRIGGERED", `P1 alert: cascading failure detected`, { severity: "P1" });
  addLog(-15, "WARN", SCENARIO.failureChain[SCENARIO.failureChain.length - 1], "SLA_BREACH", "SLA threshold breached", { metric: "error_rate", value: 0.34 });

  return logs.sort((a, b) => a.ts.localeCompare(b.ts));
}

const LOGS = generateLogs();
const ANOMALY_LOGS = LOGS.filter((l) => ["WARN", "ERROR", "CRITICAL"].includes(l.level));

// ── REST Server Setup ─────────────────────────────────────────────────

const app = express();
app.use(express.json());

const TOOLS = [
  {
    name: "query_logs",
    description: "Query LIGHTHOUSE system log entries with optional filters",
    inputSchema: {
      type: "object",
      properties: {
        subsystem: { type: "string", description: "Filter by subsystem ID (optional)" },
        severity: { type: "string", enum: ["DEBUG", "INFO", "WARN", "ERROR", "CRITICAL"], description: "Minimum severity (optional)" },
        time_range: { type: "object", properties: { from: { type: "string" }, to: { type: "string" } }, description: "ISO8601 time range (optional)" },
        pattern: { type: "string", description: "Log code pattern to search (optional)" },
        limit: { type: "number", description: "Max results (default 100, max 500)" },
      },
    },
  },
  {
    name: "get_anomaly_timeline",
    description: "Get chronological timeline of WARN/ERROR/CRITICAL log events",
    inputSchema: {
      type: "object",
      properties: {
        subsystem: { type: "string", description: "Filter by subsystem (optional)" },
      },
    },
  },
  {
    name: "correlate_events",
    description: "Find log events that cluster together in time across subsystems",
    inputSchema: {
      type: "object",
      properties: {
        time_window_minutes: { type: "number", description: "Correlation window in minutes (default 15)" },
        min_severity: { type: "string", enum: ["WARN", "ERROR", "CRITICAL"], description: "Minimum severity (default WARN)" },
      },
    },
  },
  {
    name: "get_error_summary",
    description: "Get aggregated error counts per subsystem",
    inputSchema: { type: "object", properties: {} },
  },
];

function handleTool(name, args) {
  if (name === "query_logs") {
    let results = [...LOGS];
    if (args.subsystem) results = results.filter((l) => l.subsystem === args.subsystem);
    if (args.severity) {
      const levels = ["DEBUG", "INFO", "WARN", "ERROR", "CRITICAL"];
      const minIdx = levels.indexOf(args.severity);
      results = results.filter((l) => levels.indexOf(l.level) >= minIdx);
    }
    if (args.time_range?.from) results = results.filter((l) => l.ts >= args.time_range.from);
    if (args.time_range?.to) results = results.filter((l) => l.ts <= args.time_range.to);
    if (args.pattern) results = results.filter((l) => l.code.includes(args.pattern) || l.message.includes(args.pattern));
    const limit = Math.min(500, args.limit ?? 100);
    return { entries: results.slice(-limit), total_matching: results.length, returned: Math.min(results.length, limit) };
  }

  if (name === "get_anomaly_timeline") {
    let results = [...ANOMALY_LOGS];
    if (args.subsystem) results = results.filter((l) => l.subsystem === args.subsystem);
    return {
      timeline: results.map((l) => ({ ts: l.ts, level: l.level, subsystem: l.subsystem, code: l.code, message: l.message })),
      count: results.length,
      earliest: results[0]?.ts,
      latest: results[results.length - 1]?.ts,
    };
  }

  if (name === "correlate_events") {
    const windowMin = args.time_window_minutes ?? 15;
    const windowMs = windowMin * 60 * 1000;
    const levels = ["WARN", "ERROR", "CRITICAL"];
    const minSeverity = args.min_severity ?? "WARN";
    const minIdx = levels.indexOf(minSeverity);
    const eligible = ANOMALY_LOGS.filter((l) => levels.indexOf(l.level) >= minIdx);

    const clusters = [];
    for (let i = 0; i < eligible.length; i++) {
      const anchor = eligible[i];
      const anchorTs = new Date(anchor.ts).getTime();
      const cluster = eligible.filter((l) => {
        const ts = new Date(l.ts).getTime();
        return Math.abs(ts - anchorTs) <= windowMs / 2 && l.subsystem !== anchor.subsystem;
      });
      if (cluster.length >= 2) {
        const subsystems = [...new Set([anchor.subsystem, ...cluster.map((l) => l.subsystem)])];
        if (!clusters.some((c) => c.anchor_ts === anchor.ts)) {
          clusters.push({
            anchor_ts: anchor.ts,
            window_minutes: windowMin,
            subsystems_involved: subsystems,
            event_count: cluster.length + 1,
            events: [anchor, ...cluster].sort((a, b) => a.ts.localeCompare(b.ts)).slice(0, 10),
          });
        }
      }
    }

    return {
      clusters: clusters.slice(0, 20),
      total_clusters: clusters.length,
      note: "Clusters show events that occurred within the time window across different subsystems — useful for identifying cascade patterns.",
    };
  }

  if (name === "get_error_summary") {
    const summary = {};
    for (const sys of ALL_SUBSYSTEMS) {
      const sysLogs = LOGS.filter((l) => l.subsystem === sys);
      summary[sys] = {
        total: sysLogs.length,
        warn: sysLogs.filter((l) => l.level === "WARN").length,
        error: sysLogs.filter((l) => l.level === "ERROR").length,
        critical: sysLogs.filter((l) => l.level === "CRITICAL").length,
        unique_codes: [...new Set(sysLogs.filter((l) => l.level !== "INFO" && l.level !== "DEBUG").map((l) => l.code))],
        first_anomaly: ANOMALY_LOGS.find((l) => l.subsystem === sys)?.ts ?? null,
      };
    }
    return { subsystem_summary: summary, total_log_entries: LOGS.length, total_anomalies: ANOMALY_LOGS.length };
  }

  return { error: `Unknown tool: ${name}` };
}

// REST endpoints
app.get("/tools", (req, res) => res.json({ tools: TOOLS }));

app.post("/tools/query_logs", (req, res) => {
  const result = handleTool("query_logs", req.body);
  res.json(result);
});

app.post("/tools/get_anomaly_timeline", (req, res) => {
  const result = handleTool("get_anomaly_timeline", req.body);
  res.json(result);
});

app.post("/tools/correlate_events", (req, res) => {
  const result = handleTool("correlate_events", req.body);
  res.json(result);
});

app.post("/tools/get_error_summary", (req, res) => {
  const result = handleTool("get_error_summary", req.body);
  res.json(result);
});

app.get("/health", (req, res) => res.json({ status: "ok", tool: "logs" }));

const PORT = parseInt(process.env.PORT ?? "3000", 10);
app.listen(PORT, () => console.log(`Logs server on :${PORT} (seed=${SEED})`));

// Self-terminate when the match TTL expires to avoid orphaned containers
const MATCH_TTL_SECS = parseInt(process.env.MATCH_TTL_SECS ?? "0", 10);
if (MATCH_TTL_SECS > 0) {
  console.log(`[TTL] Will self-terminate in ${MATCH_TTL_SECS}s`);
  setTimeout(() => {
    console.log("[TTL] Match TTL expired — shutting down");
    process.exit(0);
  }, MATCH_TTL_SECS * 1000).unref();
}
