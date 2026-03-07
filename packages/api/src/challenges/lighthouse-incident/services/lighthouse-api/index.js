/**
 * LIGHTHOUSE Incident Response Simulation API
 *
 * A seeded simulation of a six-subsystem distributed scientific pipeline.
 * The SEED env var determines the incident scenario (which subsystem failed,
 * how it propagated, what signals are visible). Recovery commands alter the
 * system state; issuing them out of order is rejected (409 Conflict).
 *
 * Endpoints:
 *   GET  /health                    — Liveness check
 *   GET  /system/status             — All subsystem health states
 *   GET  /system/subsystem/:id      — Detailed metrics for one subsystem
 *   GET  /system/topology           — Dependency graph
 *   GET  /system/events?limit=N     — Recent system events
 *   POST /system/recover            — Issue a recovery command
 *   GET  /metrics                   — Aggregate health metrics (public)
 *   GET  /__internal/metrics        — Full scoring metrics (scorer only)
 */

import express from "express";

const app = express();
app.use(express.json());

// ── Seeded PRNG ───────────────────────────────────────────────────────

function rng(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Scenario Configuration ────────────────────────────────────────────

const SEED = parseInt(process.env.SEED ?? "42", 10);
const r = rng(SEED);

const SCENARIOS = [
  {
    id: "archive_disk_quota",
    failureChain: ["archive", "results-store", "query-gateway"],
    recoverySequence: [
      { subsystem: "archive", action: "extend_disk_quota" },
      { subsystem: "archive", action: "purge_expired_segments" },
      { subsystem: "results-store", action: "flush_pending_writes" },
      { subsystem: "query-gateway", action: "clear_cache_and_reconnect" },
    ],
    redHerrings: ["preprocessing", "analysis"],
  },
  {
    id: "analysis_memory_leak",
    failureChain: ["analysis", "preprocessing", "ingestion"],
    recoverySequence: [
      { subsystem: "analysis", action: "restart_workers" },
      { subsystem: "analysis", action: "drain_preprocessing_backlog" },
      { subsystem: "preprocessing", action: "resume_normal_processing" },
      { subsystem: "ingestion", action: "restore_rate_limit" },
    ],
    redHerrings: ["results-store", "archive"],
  },
  {
    id: "preprocessing_config_drift",
    failureChain: ["preprocessing", "analysis", "results-store"],
    recoverySequence: [
      { subsystem: "preprocessing", action: "restore_config_from_backup" },
      { subsystem: "preprocessing", action: "reprocess_affected_window" },
      { subsystem: "analysis", action: "invalidate_contaminated_results" },
      { subsystem: "results-store", action: "verify_integrity" },
    ],
    redHerrings: ["archive", "ingestion"],
  },
  {
    id: "results_store_index_corruption",
    failureChain: ["results-store", "archive", "query-gateway"],
    recoverySequence: [
      { subsystem: "results-store", action: "pause_writes" },
      { subsystem: "results-store", action: "rebuild_temporal_index" },
      { subsystem: "results-store", action: "resume_writes" },
      { subsystem: "archive", action: "resync_from_results" },
      { subsystem: "query-gateway", action: "flush_stale_cache" },
    ],
    redHerrings: ["ingestion", "preprocessing"],
  },
  {
    id: "ingestion_cert_expiry",
    failureChain: ["ingestion", "preprocessing", "analysis", "results-store"],
    recoverySequence: [
      { subsystem: "ingestion", action: "rotate_tls_certificate" },
      { subsystem: "ingestion", action: "notify_data_sources" },
      { subsystem: "preprocessing", action: "reset_starvation_state" },
      { subsystem: "analysis", action: "reload_pipeline" },
      { subsystem: "results-store", action: "accept_backfill_mode" },
    ],
    redHerrings: ["query-gateway", "archive"],
  },
];

const scenarioIdx = Math.floor(r() * SCENARIOS.length);
const SCENARIO = SCENARIOS[scenarioIdx];

// ── State ─────────────────────────────────────────────────────────────

const ALL_SUBSYSTEMS = ["ingestion", "preprocessing", "analysis", "results-store", "archive", "query-gateway"];

// Graduated health states:
//   chain position 0 (root cause)  → "degraded", clearly bad metrics
//   chain position 1               → "strained", moderately elevated
//   chain position 2+              → "operational", subtly elevated
//   red herring subsystem(s)       → "strained", similarly elevated to position 1
//   healthy                        → "healthy", normal metrics
const subsystemHealth = {};
for (const id of ALL_SUBSYSTEMS) {
  const chainPos = SCENARIO.failureChain.indexOf(id);
  const isRedHerring = SCENARIO.redHerrings.includes(id);

  if (chainPos === 0) {
    // Root cause — clearly degraded
    subsystemHealth[id] = {
      status: "degraded",
      health_score: 0.05 + r() * 0.10,
      error_rate: 0.35 + r() * 0.40,
      latency_p99_ms: 8000 + r() * 15000,
      throughput_pct: r() * 0.15,
      last_updated: new Date().toISOString(),
    };
  } else if (chainPos === 1) {
    // Position 1 — strained
    subsystemHealth[id] = {
      status: "strained",
      health_score: 0.45 + r() * 0.15,
      error_rate: 0.05 + r() * 0.12,
      latency_p99_ms: 2500 + r() * 4000,
      throughput_pct: 0.40 + r() * 0.25,
      last_updated: new Date().toISOString(),
    };
  } else if (chainPos >= 2) {
    // Position 2+ — operational but subtly elevated
    subsystemHealth[id] = {
      status: "operational",
      health_score: 0.70 + r() * 0.12,
      error_rate: 0.02 + r() * 0.04,
      latency_p99_ms: 800 + r() * 1500,
      throughput_pct: 0.65 + r() * 0.20,
      last_updated: new Date().toISOString(),
    };
  } else if (isRedHerring) {
    // Red herring — strained, similar to position 1 to confuse
    subsystemHealth[id] = {
      status: "strained",
      health_score: 0.48 + r() * 0.18,
      error_rate: 0.04 + r() * 0.10,
      latency_p99_ms: 2000 + r() * 3500,
      throughput_pct: 0.45 + r() * 0.25,
      last_updated: new Date().toISOString(),
    };
  } else {
    // Healthy
    subsystemHealth[id] = {
      status: "healthy",
      health_score: 0.92 + r() * 0.07,
      error_rate: r() * 0.002,
      latency_p99_ms: 200 + r() * 300,
      throughput_pct: 0.85 + r() * 0.15,
      last_updated: new Date().toISOString(),
    };
  }
}

// Recovery tracking
const recoveryLog = [];
const completedActions = new Set();
let outOfOrderAttempted = false;

// Event log
const eventLog = [];

function addEvent(level, subsystem, code, message, metadata = {}) {
  eventLog.push({
    ts: new Date().toISOString(),
    level,
    subsystem,
    code,
    message,
    metadata,
  });
}

// Seed initial events
for (const id of SCENARIO.failureChain) {
  addEvent("ERROR", id, "INITIAL_DEGRADATION", `Subsystem reporting issues at incident start`, {});
}

// ── Auth Middleware ───────────────────────────────────────────────────

const SERVICE_TOKEN = process.env.SERVICE_TOKEN ?? `lighthouse-${SEED}`;

app.use((req, res, next) => {
  // /health, /metrics, /__internal/metrics are always open
  if (req.path === "/health" || req.path === "/metrics" || req.path === "/__internal/metrics") return next();
  const auth = req.headers.authorization ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
  if (!token || (token !== SERVICE_TOKEN && !token.startsWith("mtk_"))) {
    // Accept any token that starts with mtk_ (match token pattern)
    // Also accept any non-empty token (lenient for dev)
    if (!token) {
      return res.status(401).json({ error: "Missing Authorization header" });
    }
  }
  next();
});

// ── Routes ────────────────────────────────────────────────────────────

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/system/status", (req, res) => {
  const systems = ALL_SUBSYSTEMS.map((id) => ({
    id,
    name: nameFor(id),
    ...subsystemHealth[id],
  }));

  const degradedCount = systems.filter((s) => s.status === "degraded").length;
  const strainedCount = systems.filter((s) => s.status === "strained").length;
  const overallHealth = degradedCount === 0
    ? (strainedCount === 0 ? "healthy" : "degraded")
    : degradedCount <= 2 ? "degraded" : "critical";

  res.json({
    overall_status: overallHealth,
    total_subsystems: ALL_SUBSYSTEMS.length,
    subsystems: systems,
    incident_active: degradedCount > 0 || strainedCount > 0,
    recovery_actions_taken: recoveryLog.length,
  });
});

app.get("/system/subsystem/:id", (req, res) => {
  const { id } = req.params;
  if (!ALL_SUBSYSTEMS.includes(id)) {
    return res.status(404).json({ error: `Unknown subsystem: ${id}. Valid IDs: ${ALL_SUBSYSTEMS.join(", ")}` });
  }

  const health = subsystemHealth[id];

  const detail = {
    id,
    name: nameFor(id),
    description: descriptionFor(id),
    ...health,
    upstream_dependencies: upstreamFor(id),
    downstream_dependents: downstreamFor(id),
    metrics: metricsFor(id, health),
    recent_events: eventLog.filter((e) => e.subsystem === id).slice(-10),
    recovery_hint: health.status !== "healthy"
      ? "This subsystem is experiencing issues. Consult /docs/runbooks/ for recovery procedures."
      : "Operating normally.",
  };

  res.json(detail);
});

app.get("/system/topology", (req, res) => {
  res.json({
    subsystems: ALL_SUBSYSTEMS.map((id) => ({
      id,
      name: nameFor(id),
      upstream: upstreamFor(id),
      downstream: downstreamFor(id),
      status: subsystemHealth[id].status,
    })),
    edges: [
      { from: "ingestion", to: "preprocessing", type: "hard_dependency", backpressure: true },
      { from: "preprocessing", to: "analysis", type: "hard_dependency", backpressure: true },
      { from: "analysis", to: "results-store", type: "hard_dependency", backpressure: false },
      { from: "results-store", to: "archive", type: "async_sync", backpressure: true },
      { from: "results-store", to: "query-gateway", type: "read_dependency", backpressure: false },
      { from: "archive", to: "query-gateway", type: "read_dependency", backpressure: false },
    ],
    note: "Edges represent data flow direction. Failures propagate downstream; backpressure propagates upstream.",
  });
});

app.get("/system/events", (req, res) => {
  const limit = Math.min(500, parseInt(req.query.limit ?? "50", 10));
  const subsystem = req.query.subsystem;
  const events = subsystem
    ? eventLog.filter((e) => e.subsystem === subsystem)
    : eventLog;
  res.json({
    events: events.slice(-limit).reverse(),
    total: events.length,
  });
});

app.post("/system/recover", (req, res) => {
  const { subsystem, action, params = {} } = req.body ?? {};

  if (!subsystem || !action) {
    return res.status(400).json({ error: "Request body must include 'subsystem' and 'action' fields." });
  }

  if (!ALL_SUBSYSTEMS.includes(subsystem)) {
    return res.status(400).json({ error: `Unknown subsystem: ${subsystem}. Valid IDs: ${ALL_SUBSYSTEMS.join(", ")}` });
  }

  const expectedSeq = SCENARIO.recoverySequence;
  const expectedStep = expectedSeq.find((s) => s.subsystem === subsystem && s.action === action);

  if (!expectedStep) {
    addEvent("WARN", subsystem, "UNKNOWN_RECOVERY_ACTION", `Unknown action attempted: ${action}`, { params });
    return res.status(400).json({
      success: false,
      message: `Action "${action}" is not a valid recovery action for ${subsystem} in the current incident state. Consult /docs/runbooks/ for valid actions.`,
    });
  }

  const actionKey = `${subsystem}:${action}`;

  if (completedActions.has(actionKey)) {
    return res.json({
      success: true,
      idempotent: true,
      message: `Action "${action}" on ${subsystem} was already completed. Idempotent — no change.`,
      subsystem_status: subsystemHealth[subsystem].status,
    });
  }

  // Check ordering constraint — strict: reject out-of-order with 409
  const stepIdx = expectedSeq.findIndex((s) => s.subsystem === subsystem && s.action === action);
  const prevStep = stepIdx > 0 ? expectedSeq[stepIdx - 1] : null;
  const prevKey = prevStep ? `${prevStep.subsystem}:${prevStep.action}` : null;

  if (prevKey && !completedActions.has(prevKey) && stepIdx > 0) {
    outOfOrderAttempted = true;
    addEvent("ERROR", subsystem, "RECOVERY_ORDER_VIOLATION",
      `Recovery command rejected — prerequisite not met.`,
      { attempted: action });

    return res.status(409).json({
      success: false,
      message: "A prerequisite recovery step must be completed first.",
    });
  }

  // Correct order — apply full recovery effect
  completedActions.add(actionKey);
  recoveryLog.push({ ts: new Date().toISOString(), subsystem, action, params, out_of_order: false });

  // Simulate recovery effect
  const health = subsystemHealth[subsystem];
  const allStepsForSubsystem = expectedSeq.filter((s) => s.subsystem === subsystem);
  const completedForSubsystem = allStepsForSubsystem.filter((s) => completedActions.has(`${s.subsystem}:${s.action}`)).length;
  const fractionComplete = completedForSubsystem / allStepsForSubsystem.length;

  if (fractionComplete >= 1.0) {
    // All steps for this subsystem done — mark healthy
    health.status = "healthy";
    health.health_score = 0.92 + Math.random() * 0.06;
    health.error_rate = 0.001 * Math.random();
    health.latency_p99_ms = 300 + Math.random() * 200;
    health.throughput_pct = 0.90 + Math.random() * 0.08;
    health.last_updated = new Date().toISOString();
    addEvent("INFO", subsystem, "RECOVERY_COMPLETE", `Subsystem ${subsystem} recovered successfully`, { action });
  } else {
    // Partial improvement
    health.health_score = Math.min(0.85, health.health_score + 0.25 * fractionComplete);
    health.error_rate = Math.max(0.02, health.error_rate * (1 - 0.4 * fractionComplete));
    health.last_updated = new Date().toISOString();
    addEvent("INFO", subsystem, "RECOVERY_PROGRESS",
      `Recovery step ${completedForSubsystem}/${allStepsForSubsystem.length} complete for ${subsystem}`, { action });
  }

  res.json({
    success: true,
    message: `Recovery action "${action}" on ${subsystem} completed successfully.`,
    subsystem_status: health.status,
    health_score: health.health_score,
    steps_completed_for_subsystem: completedForSubsystem,
    total_steps_for_subsystem: allStepsForSubsystem.length,
    fully_recovered: health.status === "healthy",
  });
});

// Public metrics — aggregate health only, no answer leaks
app.get("/metrics", (req, res) => {
  const totalSubsystems = ALL_SUBSYSTEMS.length;
  const healthySubsystems = ALL_SUBSYSTEMS.filter((id) => subsystemHealth[id].status === "healthy").length;
  const degradedSubsystems = ALL_SUBSYSTEMS.filter((id) => subsystemHealth[id].status === "degraded").length;
  const strainedSubsystems = ALL_SUBSYSTEMS.filter((id) => subsystemHealth[id].status === "strained").length;

  res.json({
    total_subsystems: totalSubsystems,
    healthy_subsystems: healthySubsystems,
    degraded_subsystems: degradedSubsystems,
    strained_subsystems: strainedSubsystems,
    pipeline_health_pct: (healthySubsystems / totalSubsystems * 100).toFixed(1),
    recovery_actions_taken: recoveryLog.length,
    incident_active: healthySubsystems < totalSubsystems,
  });
});

// Internal metrics — full scoring data for the scorer
app.get("/__internal/metrics", (req, res) => {
  const totalSubsystems = ALL_SUBSYSTEMS.length;
  const healthySubsystems = ALL_SUBSYSTEMS.filter((id) => subsystemHealth[id].status === "healthy").length;
  const degradedSubsystems = totalSubsystems - healthySubsystems;

  const chainLength = SCENARIO.failureChain.length;
  const chainRecovered = SCENARIO.failureChain.filter((id) => subsystemHealth[id].status === "healthy").length;

  const correctActions = recoveryLog.filter((r) => !r.out_of_order).length;
  const totalExpectedActions = SCENARIO.recoverySequence.length;

  res.json({
    scenario_id: SCENARIO.id,
    seed: SEED,
    total_subsystems: totalSubsystems,
    healthy_subsystems: healthySubsystems,
    degraded_subsystems: degradedSubsystems,
    pipeline_health_pct: (healthySubsystems / totalSubsystems * 100).toFixed(1),
    failure_chain_length: chainLength,
    failure_chain_recovered: chainRecovered,
    recovery_completeness: chainLength > 0 ? chainRecovered / chainLength : 1,
    recovery_actions_taken: recoveryLog.length,
    recovery_actions_correct: correctActions,
    recovery_actions_out_of_order: 0, // strict ordering rejects out-of-order
    expected_total_recovery_actions: totalExpectedActions,
    out_of_order_penalty: outOfOrderAttempted,
    scoring_summary: {
      fully_resolved: degradedSubsystems === 0,
      chain_resolved: chainRecovered === chainLength,
      action_completion_rate: Math.min(1, correctActions / totalExpectedActions),
    },
  });
});

// ── Helper Functions ──────────────────────────────────────────────────

function nameFor(id) {
  const names = {
    ingestion: "Data Ingestion Layer",
    preprocessing: "Preprocessing Service",
    analysis: "Analysis Engine",
    "results-store": "Results Database",
    archive: "Archive Service",
    "query-gateway": "Query Gateway",
  };
  return names[id] ?? id;
}

function descriptionFor(id) {
  const descs = {
    ingestion: "Receives raw telescope observation data via authenticated REST API from 47 remote data sources",
    preprocessing: "Validates, normalizes, and filters observation data using configurable validation rule sets",
    analysis: "Runs multi-stage computational analysis and spectral feature extraction across 4 worker processes",
    "results-store": "PostgreSQL-backed persistent store for analysis outputs with temporal B-tree indexing",
    archive: "Long-term compressed storage using Zstandard with content-addressed layout on 2TB volume",
    "query-gateway": "External-facing GraphQL and REST API for querying pipeline results with 1-hour cache",
  };
  return descs[id] ?? id;
}

function upstreamFor(id) {
  const upstream = {
    ingestion: [],
    preprocessing: ["ingestion"],
    analysis: ["preprocessing"],
    "results-store": ["analysis"],
    archive: ["results-store"],
    "query-gateway": ["results-store", "archive"],
  };
  return upstream[id] ?? [];
}

function downstreamFor(id) {
  const downstream = {
    ingestion: ["preprocessing"],
    preprocessing: ["analysis"],
    analysis: ["results-store"],
    "results-store": ["archive", "query-gateway"],
    archive: ["query-gateway"],
    "query-gateway": [],
  };
  return downstream[id] ?? [];
}

function metricsFor(id, health) {
  const base = {
    health_score: health.health_score,
    error_rate: health.error_rate,
    latency_p99_ms: health.latency_p99_ms,
    throughput_pct: health.throughput_pct,
  };

  // Scenario-specific metrics for root cause subsystem
  const s = SCENARIO.id;
  if (s === "archive_disk_quota" && id === "archive") {
    return { ...base, disk_usage_pct: health.status === "healthy" ? 45.2 : 97.1, write_success_rate: health.status === "healthy" ? 0.999 : 0.03 };
  }
  if (s === "analysis_memory_leak" && id === "analysis") {
    return { ...base, memory_usage_pct: health.status === "healthy" ? 62.1 : 99.8, active_workers: health.status === "healthy" ? 4 : 0, queue_depth: health.status === "healthy" ? 124 : 73241 };
  }
  if (s === "preprocessing_config_drift" && id === "preprocessing") {
    return { ...base, validation_pass_rate: health.status === "healthy" ? 0.871 : 0.999, config_hash_valid: health.status === "healthy" };
  }
  if (s === "results_store_index_corruption" && id === "results-store") {
    return { ...base, index_checksum_valid: health.status === "healthy", range_query_result_ratio: health.status === "healthy" ? 1.0 : 0.78 };
  }
  if (s === "ingestion_cert_expiry" && id === "ingestion") {
    return { ...base, active_connections: health.status === "healthy" ? 47 : 0, cert_status: health.status === "healthy" ? "VALID" : "EXPIRED", observation_rate: health.status === "healthy" ? 923 : 0 };
  }

  // Red herring elevated metrics — look concerning but are not the root cause
  const isRedHerring = SCENARIO.redHerrings.includes(id);
  if (isRedHerring && health.status === "strained") {
    if (id === "preprocessing") {
      return { ...base, processing_latency_trend: "increasing", batch_reject_rate: 0.08 + Math.random() * 0.04 };
    }
    if (id === "analysis") {
      return { ...base, worker_cpu_avg_pct: 87 + Math.random() * 8, gc_pause_frequency: "elevated" };
    }
    if (id === "results-store") {
      return { ...base, query_plan_cache_misses: 342, replication_lag_ms: 1800 + Math.random() * 1200 };
    }
    if (id === "archive") {
      return { ...base, compression_ratio_trend: "declining", segment_merge_backlog: 47 + Math.floor(Math.random() * 30) };
    }
    if (id === "ingestion") {
      return { ...base, connection_retry_rate: 0.06, auth_latency_ms: 450 + Math.random() * 300 };
    }
    if (id === "query-gateway") {
      return { ...base, cache_hit_rate: 0.23, response_timeout_rate: 0.07 + Math.random() * 0.05 };
    }
  }

  return base;
}

// ── Documentation (docs.lighthouse.internal proxy target) ─────────────

const DOCS = {
  "/docs/runbooks/": `# LIGHTHOUSE Runbook Index

## Available Runbooks

- [/docs/runbooks/storage-quota-recovery](/docs/runbooks/storage-quota-recovery) — Archive disk quota exhaustion
- [/docs/runbooks/memory-leak-recovery](/docs/runbooks/memory-leak-recovery) — Analysis engine memory leak
- [/docs/runbooks/config-drift-recovery](/docs/runbooks/config-drift-recovery) — Preprocessing configuration drift
- [/docs/runbooks/index-corruption-recovery](/docs/runbooks/index-corruption-recovery) — Results-store index corruption
- [/docs/runbooks/certificate-renewal](/docs/runbooks/certificate-renewal) — Ingestion TLS certificate expiry

All runbooks follow: Diagnosis \u2192 Pre-Recovery Checks \u2192 Recovery Steps \u2192 Verification \u2192 Prevention.
`,

  "/docs/runbooks/storage-quota-recovery": `# Runbook: Archive Disk Quota Recovery

**Applies to:** \`archive\` subsystem — disk quota exhaustion scenarios

## Diagnosis Checklist
1. Check \`GET /system/subsystem/archive\` for disk-related metrics
2. Query \`disk_usage_history\` in the operations database for usage trends over the past 24h
3. Review SLA targets for the archive subsystem to confirm breach thresholds
4. Search logs for disk-related error codes (e.g. quota, write failures)
5. Cross-reference with downstream subsystems to understand cascade scope

## Pre-Recovery Checks
- Check downstream write queue depths before acting
- Do NOT flush writes before addressing the underlying quota issue — flushes will fail on a full volume

## Recovery Steps (ORDER MATTERS)

All recovery commands use \`POST /system/recover\` with body \`{"subsystem": "<id>", "action": "<name>", "params": {...}}\`.

1. \`extend_disk_quota\` on \`archive\` — Increase the volume allocation to accommodate current data volume plus adequate growth headroom
2. \`purge_expired_segments\` on \`archive\` — Remove archive segments beyond the retention window to free immediate disk space
3. \`flush_pending_writes\` on \`results-store\` — Drain any accumulated write backlog in the dependent store
4. \`clear_cache_and_reconnect\` on \`query-gateway\` — Invalidate stale cached data and re-establish connections to recovered upstream services

## Verification
- \`GET /system/status\` — affected subsystems should show improved health
- Monitor health scores to confirm recovery is progressing

## Prevention
- Set up disk usage alerting at appropriate thresholds (e.g. 70% and 85%)
- Schedule periodic expired segment purges during low-traffic windows
- Review disk quota settings periodically against growth projections
`,

  "/docs/runbooks/memory-leak-recovery": `# Runbook: Analysis Engine Memory Leak Recovery

**Applies to:** \`analysis\` subsystem — worker OOM / memory exhaustion scenarios

## Diagnosis Checklist
1. \`GET /system/subsystem/analysis\` — check memory and worker-related metrics
2. Query the anomaly timeline for OOM-related events on the analysis subsystem
3. Check performance history in the operations database for memory trends
4. Examine upstream (preprocessing) queue state for backpressure effects

## Pre-Recovery Checks
- Verify upstream queue states before restarting workers — backpressure may have propagated
- Do NOT attempt to reload the pipeline before clearing worker memory — workers will OOM again immediately

## Recovery Steps (ORDER MATTERS)

All recovery commands use \`POST /system/recover\` with body \`{"subsystem": "<id>", "action": "<name>", "params": {...}}\`.

1. \`restart_workers\` on \`analysis\` — Restart worker processes with conservative memory limits to prevent immediate re-OOM
2. \`drain_preprocessing_backlog\` on \`analysis\` — Gradually drain the accumulated observation queue without re-triggering memory issues
3. \`resume_normal_processing\` on \`preprocessing\` — Re-enable full processing rate once the backlog is manageable
4. \`restore_rate_limit\` on \`ingestion\` — Remove adaptive throttling and restore full ingestion throughput

## Verification
- \`GET /system/subsystem/analysis\` — workers should be active with healthy memory usage
- Check that upstream queue depths are draining

## Prevention
- Memory profiling should run on worker processes regularly
- Configure per-worker memory limits with appropriate headroom
`,

  "/docs/runbooks/config-drift-recovery": `# Runbook: Preprocessing Configuration Drift Recovery

**Applies to:** \`preprocessing\` subsystem — config hash mismatch / validation rule corruption

## Diagnosis Checklist
1. \`GET /system/subsystem/preprocessing\` — look for config-related anomalies
2. Query subsystem_config in the operations database — compare config hashes against expected values
3. Search logs for config-related codes (hash mismatch, rule override)
4. Check analysis subsystem for downstream data quality impact

## Pre-Recovery Checks
- Identify the window of affected data before restoring config
- Do NOT reprocess data before restoring correct configuration — reprocessing with bad config produces more contamination

## Recovery Steps (ORDER MATTERS)

All recovery commands use \`POST /system/recover\` with body \`{"subsystem": "<id>", "action": "<name>", "params": {...}}\`.

1. \`restore_config_from_backup\` on \`preprocessing\` — Roll back to the last known-good validation configuration
2. \`reprocess_affected_window\` on \`preprocessing\` — Reprocess data from the contamination window using the restored configuration
3. \`invalidate_contaminated_results\` on \`analysis\` — Mark results produced during the contamination window as invalid
4. \`verify_integrity\` on \`results-store\` — Run integrity verification to confirm no further contamination exists

## Verification
- \`GET /system/subsystem/preprocessing\` — config should be valid, pass rate should return to normal range
`,

  "/docs/runbooks/index-corruption-recovery": `# Runbook: Results-Store Index Corruption Recovery

**Applies to:** \`results-store\` subsystem — temporal index B-tree corruption

## Diagnosis Checklist
1. \`GET /system/subsystem/results-store\` — look for index integrity metrics
2. Query performance history for range query accuracy and index checksum status
3. Search logs for index-related and power anomaly events
4. Check archive subsystem for sync completeness issues

## Pre-Recovery Checks
- **Halt writes FIRST.** Rebuilding the index while writes are active risks further corruption
- Ensure dependent services are prepared for a brief write pause

## Recovery Steps (ORDER MATTERS)

All recovery commands use \`POST /system/recover\` with body \`{"subsystem": "<id>", "action": "<name>", "params": {...}}\`.

1. \`pause_writes\` on \`results-store\` — Halt incoming writes to prevent further corruption during rebuild
2. \`rebuild_temporal_index\` on \`results-store\` — Perform a full offline index rebuild
3. \`resume_writes\` on \`results-store\` — Re-enable the write path after index validation
4. \`resync_from_results\` on \`archive\` — Re-synchronize archive with the corrected results store
5. \`flush_stale_cache\` on \`query-gateway\` — Purge all cached responses that may contain data from the corruption period

## Warning
The index rebuild step is time-sensitive. If it times out, retry once before escalating.
`,

  "/docs/runbooks/certificate-renewal": `# Runbook: Ingestion TLS Certificate Renewal

**Applies to:** \`ingestion\` subsystem — expired TLS certificate causing connection failures

## Diagnosis Checklist
1. \`GET /system/subsystem/ingestion\` — check certificate and connection metrics
2. Query the certificate registry in the operations database for expiry dates and status
3. Search logs for certificate-related and connection-related events
4. Check downstream subsystems for starvation effects

## Pre-Recovery Checks
- Expect high backfill volume after certificate renewal — data sources have been queuing observations
- Verify downstream subsystems are healthy enough to handle the backfill surge

## Recovery Steps (ORDER MATTERS)

All recovery commands use \`POST /system/recover\` with body \`{"subsystem": "<id>", "action": "<name>", "params": {...}}\`.

1. \`rotate_tls_certificate\` on \`ingestion\` — Issue and activate a new TLS certificate
2. \`notify_data_sources\` on \`ingestion\` — Signal all data sources to reconnect with the new certificate
3. \`reset_starvation_state\` on \`preprocessing\` — Clear timeout states accumulated during the starvation period
4. \`reload_pipeline\` on \`analysis\` — Restart the analysis pipeline to clear halted state
5. \`accept_backfill_mode\` on \`results-store\` — Enable high-throughput backfill mode for the data gap period

## Verification
- \`GET /system/subsystem/ingestion\` — connections should be re-established, certificate should be valid
- Monitor downstream subsystems for recovery propagation
`,

  "/docs/architecture/subsystems": `# LIGHTHOUSE Architecture: Subsystems

## Overview

LIGHTHOUSE processes telescope observation data through a 6-stage pipeline.
Data flows: Ingestion \u2192 Preprocessing \u2192 Analysis \u2192 Results-Store \u2192 {Archive, Query-Gateway}

## Subsystems

### ingestion
Receives raw observation data from 47 remote data sources via authenticated REST API.
TLS certificates must be valid; certificate expiry drops all 47 connections instantly.

### preprocessing
Validates and normalizes raw observations using configurable rule sets.
Config drift causes silent data quality degradation \u2014 validation appears to pass but output is contaminated.

### analysis
Runs 4 parallel worker processes for spectral feature extraction.
Memory leak in worker JVM causes OOM if workers run continuously >72h without restart.

### results-store
PostgreSQL-backed store with temporal B-tree index for time-range queries.
Index can corrupt under high write load + power interruption. Writes must be paused before rebuild.

### archive
Long-term storage on a 2TB Zstandard-compressed volume.
When disk reaches quota, all writes fail silently. Results-store backlog accumulates.

### query-gateway
External-facing API with 1-hour cache. Depends on both results-store (live data) and archive (historical).
Cache must be invalidated after upstream recovery to avoid serving stale data.

## Dependency Graph
\`\`\`
ingestion \u2192 preprocessing \u2192 analysis \u2192 results-store \u2500\u252c\u2192 archive \u2192 query-gateway
                                                        \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2192 query-gateway
\`\`\`
Failures propagate downstream. Backpressure propagates upstream.
`,

  "/docs/operations/recovery": `# LIGHTHOUSE General Recovery Procedures

## Golden Rules

1. **Diagnose before acting.** Query logs, metrics, and ops-db first.
2. **Follow the runbook.** Each recovery has ordering constraints. Out-of-order commands are rejected.
3. **Verify after each step.** \`GET /system/status\` after every recovery command.
4. **Identify the root cause, not the symptoms.** Treat the root subsystem first.
5. **Not all anomalies are failures.** Some subsystems may show elevated metrics for reasons unrelated to the current incident.

## Root Cause Identification Checklist

1. \`get_anomaly_timeline()\` \u2014 find the earliest WARN+ event
2. \`get_error_summary()\` \u2014 see which subsystem has the most errors
3. \`correlate_events(time_window_minutes=30)\` \u2014 find clustered anomalies
4. Cross-reference with ops-db: \`performance_history\`, \`incident_history\`, \`disk_usage_history\`
5. Check \`dependency_graph\` to understand propagation direction

## Recovery Command Format

\`\`\`json
POST /system/recover
{"subsystem": "<id>", "action": "<action_name>", "params": {...}}
\`\`\`
`,
};

app.get("/docs/*", (req, res) => {
  let path = req.path;
  // Normalize trailing slash for index routes
  if (path !== "/" && !path.endsWith("/") && !DOCS[path]) {
    path = path + "/";
  }
  const content = DOCS[path] ?? DOCS[req.path];
  if (!content) {
    return res.status(404).json({
      error: `Documentation not found: ${req.path}`,
      available: Object.keys(DOCS),
    });
  }
  res.set("content-type", "text/markdown; charset=utf-8");
  res.send(content);
});

// ── Start ─────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? "3000", 10);
app.listen(PORT, () => {
  console.log(`LIGHTHOUSE API running on :${PORT} (seed=${SEED}, scenario=${SCENARIO.id})`);
});

// Self-terminate when the match TTL expires to avoid orphaned containers
const MATCH_TTL_SECS = parseInt(process.env.MATCH_TTL_SECS ?? "0", 10);
if (MATCH_TTL_SECS > 0) {
  console.log(`[TTL] Will self-terminate in ${MATCH_TTL_SECS}s`);
  setTimeout(() => {
    console.log("[TTL] Match TTL expired — shutting down");
    process.exit(0);
  }, MATCH_TTL_SECS * 1000).unref();
}
