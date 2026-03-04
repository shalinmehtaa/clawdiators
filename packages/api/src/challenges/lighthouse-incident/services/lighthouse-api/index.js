/**
 * LIGHTHOUSE Incident Response Simulation API
 *
 * A seeded simulation of a six-subsystem distributed scientific pipeline.
 * The SEED env var determines the incident scenario (which subsystem failed,
 * how it propagated, what signals are visible). Recovery commands alter the
 * system state; issuing them out of order causes secondary failures.
 *
 * Endpoints:
 *   GET  /health                    — Liveness check
 *   GET  /system/status             — All subsystem health states
 *   GET  /system/subsystem/:id      — Detailed metrics for one subsystem
 *   GET  /system/topology           — Dependency graph
 *   GET  /system/events?limit=N     — Recent system events
 *   POST /system/recover            — Issue a recovery command
 *   GET  /metrics                   — Scoring metrics endpoint
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
  },
];

const scenarioIdx = Math.floor(r() * SCENARIOS.length);
const SCENARIO = SCENARIOS[scenarioIdx];

// ── State ─────────────────────────────────────────────────────────────

const ALL_SUBSYSTEMS = ["ingestion", "preprocessing", "analysis", "results-store", "archive", "query-gateway"];

// Initial health state: failed subsystems start degraded
const subsystemHealth = {};
for (const id of ALL_SUBSYSTEMS) {
  const inChain = SCENARIO.failureChain.includes(id);
  const chainPos = SCENARIO.failureChain.indexOf(id);
  subsystemHealth[id] = {
    status: inChain ? "degraded" : "healthy",
    health_score: inChain ? Math.max(0.05, 0.35 - chainPos * 0.12) : 0.95 + (r() - 0.5) * 0.08,
    error_rate: inChain ? 0.15 + r() * 0.40 : r() * 0.002,
    latency_p99_ms: inChain ? 5000 + r() * 15000 : 200 + r() * 300,
    throughput_pct: inChain ? r() * 0.35 : 0.85 + r() * 0.15,
    last_updated: new Date().toISOString(),
  };
}

// Recovery tracking
const recoveryLog = [];
const completedActions = new Set();
let outOfOrderPenalty = false;

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
  addEvent("ERROR", id, "INITIAL_DEGRADATION", `Subsystem degraded at incident start`, { scenario: SCENARIO.id });
}

// ── Auth Middleware ───────────────────────────────────────────────────

const SERVICE_TOKEN = process.env.SERVICE_TOKEN ?? `lighthouse-${SEED}`;

app.use((req, res, next) => {
  // /health is always open
  if (req.path === "/health" || req.path === "/metrics") return next();
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
  res.json({ status: "ok", scenario: SCENARIO.id, seed: SEED });
});

app.get("/system/status", (req, res) => {
  const systems = ALL_SUBSYSTEMS.map((id) => ({
    id,
    name: nameFor(id),
    ...subsystemHealth[id],
    sla_breached: subsystemHealth[id].status === "degraded",
    recovery_available: SCENARIO.failureChain.includes(id) && subsystemHealth[id].status === "degraded",
  }));

  const degradedCount = systems.filter((s) => s.status === "degraded").length;
  const overallHealth = degradedCount === 0 ? "healthy" : degradedCount <= 2 ? "degraded" : "critical";

  res.json({
    overall_status: overallHealth,
    degraded_subsystems: degradedCount,
    total_subsystems: ALL_SUBSYSTEMS.length,
    subsystems: systems,
    incident_active: degradedCount > 0,
    recovery_actions_taken: recoveryLog.length,
  });
});

app.get("/system/subsystem/:id", (req, res) => {
  const { id } = req.params;
  if (!ALL_SUBSYSTEMS.includes(id)) {
    return res.status(404).json({ error: `Unknown subsystem: ${id}. Valid IDs: ${ALL_SUBSYSTEMS.join(", ")}` });
  }

  const health = subsystemHealth[id];
  const inChain = SCENARIO.failureChain.includes(id);
  const chainPos = SCENARIO.failureChain.indexOf(id);

  // Provide detailed metrics
  const detail = {
    id,
    name: nameFor(id),
    description: descriptionFor(id),
    ...health,
    upstream_dependencies: upstreamFor(id),
    downstream_dependents: downstreamFor(id),
    metrics: metricsFor(id, health),
    recent_events: eventLog.filter((e) => e.subsystem === id).slice(-10),
    recovery_hint: inChain && health.status === "degraded"
      ? `This subsystem is affected. See /docs/runbooks/ for recovery procedures. Chain position: ${chainPos + 1}/${SCENARIO.failureChain.length}.`
      : health.status === "healthy" ? "Operating normally." : undefined,
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
    // Unknown action for this scenario — return appropriate error
    addEvent("WARN", subsystem, "UNKNOWN_RECOVERY_ACTION", `Unknown action attempted: ${action}`, { params });
    return res.status(400).json({
      success: false,
      message: `Action "${action}" is not a valid recovery action for ${subsystem} in current incident state. Check /docs/runbooks/ for valid actions.`,
      valid_actions_hint: expectedSeq
        .filter((s) => s.subsystem === subsystem)
        .map((s) => s.action),
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

  // Check ordering constraint
  const stepIdx = expectedSeq.findIndex((s) => s.subsystem === subsystem && s.action === action);
  const prevStep = stepIdx > 0 ? expectedSeq[stepIdx - 1] : null;
  const prevKey = prevStep ? `${prevStep.subsystem}:${prevStep.action}` : null;

  if (prevKey && !completedActions.has(prevKey) && stepIdx > 0) {
    // Out of order — apply penalty and warn
    outOfOrderPenalty = true;
    addEvent("ERROR", subsystem, "RECOVERY_ORDER_VIOLATION",
      `Recovery command issued out of order. Expected ${prevStep.action} on ${prevStep.subsystem} first.`,
      { attempted: action, expected_first: `${prevStep.subsystem}:${prevStep.action}` });

    // Still allow the action but with reduced effect
    completedActions.add(actionKey);
    recoveryLog.push({ ts: new Date().toISOString(), subsystem, action, params, out_of_order: true });

    // Partial improvement
    if (subsystemHealth[subsystem].status === "degraded") {
      subsystemHealth[subsystem].health_score = Math.min(0.6, subsystemHealth[subsystem].health_score + 0.2);
      subsystemHealth[subsystem].error_rate = Math.max(0.1, subsystemHealth[subsystem].error_rate * 0.7);
    }

    return res.json({
      success: true,
      warning: `Action completed but out of order. Previous required step "${prevStep.action}" on "${prevStep.subsystem}" had not been completed. This may cause incomplete recovery. Check /docs/runbooks/ for correct sequence.`,
      subsystem_status: subsystemHealth[subsystem].status,
      partial_improvement: true,
    });
  }

  // Correct order — apply full recovery effect
  completedActions.add(actionKey);
  recoveryLog.push({ ts: new Date().toISOString(), subsystem, action, params, out_of_order: false });

  // Simulate recovery effect
  const health = subsystemHealth[subsystem];
  const isLastStep = stepIdx === expectedSeq.filter((s) => s.subsystem === subsystem).length - 1;
  const allStepsForSubsystem = expectedSeq.filter((s) => s.subsystem === subsystem);
  const completedForSubsystem = allStepsForSubsystem.filter((s) => completedActions.has(`${s.subsystem}:${s.action}`)).length;
  const fractionComplete = completedForSubsystem / allStepsForSubsystem.length;

  if (fractionComplete >= 1.0) {
    // All steps for this subsystem done → mark healthy
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

app.get("/metrics", (req, res) => {
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
    recovery_actions_out_of_order: recoveryLog.filter((r) => r.out_of_order).length,
    expected_total_recovery_actions: totalExpectedActions,
    out_of_order_penalty: outOfOrderPenalty,
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

  // Scenario-specific metrics
  const s = SCENARIO.id;
  if (s === "archive_disk_quota" && id === "archive") {
    return { ...base, disk_usage_pct: health.status === "degraded" ? 97.1 : 45.2, write_success_rate: health.status === "degraded" ? 0.03 : 0.999 };
  }
  if (s === "analysis_memory_leak" && id === "analysis") {
    return { ...base, memory_usage_pct: health.status === "degraded" ? 99.8 : 62.1, active_workers: health.status === "degraded" ? 0 : 4, queue_depth: health.status === "degraded" ? 73241 : 124 };
  }
  if (s === "preprocessing_config_drift" && id === "preprocessing") {
    return { ...base, validation_pass_rate: health.status === "degraded" ? 0.999 : 0.871, config_hash_valid: health.status !== "degraded" };
  }
  if (s === "results_store_index_corruption" && id === "results-store") {
    return { ...base, index_checksum_valid: health.status !== "degraded", range_query_result_ratio: health.status === "degraded" ? 0.78 : 1.0 };
  }
  if (s === "ingestion_cert_expiry" && id === "ingestion") {
    return { ...base, active_connections: health.status === "degraded" ? 0 : 47, cert_status: health.status === "degraded" ? "EXPIRED" : "VALID", observation_rate: health.status === "degraded" ? 0 : 923 };
  }

  return base;
}

// ── Documentation (docs.lighthouse.internal proxy target) ─────────────
//
// These routes are served by the platform's docs proxy at:
//   GET /api/v1/matches/:matchId/proxy/runbooks/...
//   GET /api/v1/matches/:matchId/proxy/architecture/...
//   GET /api/v1/matches/:matchId/proxy/operations/...
//
// Agents access them via {{proxy_url}}/runbooks/, etc.
// Rate-limited to 30 req/min at the platform proxy layer.

const DOCS = {
  "/docs/runbooks/": `# LIGHTHOUSE Runbook Index

## Available Runbooks

- [/docs/runbooks/storage-quota-recovery](/docs/runbooks/storage-quota-recovery) — Archive disk quota exhaustion
- [/docs/runbooks/memory-leak-recovery](/docs/runbooks/memory-leak-recovery) — Analysis engine memory leak
- [/docs/runbooks/config-drift-recovery](/docs/runbooks/config-drift-recovery) — Preprocessing configuration drift
- [/docs/runbooks/index-corruption-recovery](/docs/runbooks/index-corruption-recovery) — Results-store index corruption
- [/docs/runbooks/certificate-renewal](/docs/runbooks/certificate-renewal) — Ingestion TLS certificate expiry

All runbooks follow: Diagnosis → Pre-Recovery Checks → Recovery Commands → Verification → Prevention.
`,

  "/docs/runbooks/storage-quota-recovery": `# Runbook: Archive Disk Quota Recovery

**Applies to:** \`archive\` subsystem — disk_quota_exceeded scenarios

## Diagnosis Checklist
1. Confirm \`GET /system/subsystem/archive\` shows \`disk_usage_pct > 85\`
2. Query \`disk_usage_history\` in ops-db: \`SELECT * FROM disk_usage_history WHERE subsystem_id='archive' ORDER BY ts DESC LIMIT 24\`
3. Check SLA: \`SELECT * FROM sla_targets WHERE subsystem_id='archive'\`
4. Look for \`DISK_QUOTA_EXCEEDED\` in logs: \`query_logs(subsystem="archive", pattern="DISK_QUOTA_EXCEEDED")\`

## Pre-Recovery Checks
- Ensure \`results-store\` write queue depth (run \`GET /system/subsystem/results-store\` and check queue backlog)
- Do NOT issue flush commands before extending quota — flushes will fail if quota still exceeded

## Recovery Sequence (ORDER MATTERS)
1. \`POST /system/recover\` — \`{"subsystem":"archive","action":"extend_disk_quota","params":{"quota_gb":500}}\`
2. \`POST /system/recover\` — \`{"subsystem":"archive","action":"purge_expired_segments","params":{"older_than_days":90}}\`
3. \`POST /system/recover\` — \`{"subsystem":"results-store","action":"flush_pending_writes","params":{}}\`
4. \`POST /system/recover\` — \`{"subsystem":"query-gateway","action":"clear_cache_and_reconnect","params":{}}\`

## Verification
- \`GET /system/status\` — all subsystems should show \`healthy\`
- \`GET /metrics\` — \`recovery_completeness\` should be 1.0

## Prevention
- Set up disk usage alerting at 70% and 85% thresholds
- Schedule weekly \`purge_expired_segments\` during low-traffic windows
- Review \`sla_targets.max_disk_usage_pct\` — consider raising quota proactively
`,

  "/docs/runbooks/memory-leak-recovery": `# Runbook: Analysis Engine Memory Leak Recovery

**Applies to:** \`analysis\` subsystem — worker OOM / memory exhaustion scenarios

## Diagnosis Checklist
1. \`GET /system/subsystem/analysis\` — check \`memory_usage_pct\` and \`active_workers\`
2. \`get_anomaly_timeline(subsystem="analysis")\` — find first OOM event
3. \`query(sql="SELECT * FROM performance_history WHERE subsystem_id='analysis' ORDER BY ts DESC LIMIT 48")\`

## Pre-Recovery Checks
- Verify \`preprocessing\` queue is not overflowing (backpressure will propagate upstream)
- Do NOT attempt to \`reload_pipeline\` before clearing worker memory — workers will OOM again immediately

## Recovery Sequence (ORDER MATTERS)
1. \`POST /system/recover\` — \`{"subsystem":"analysis","action":"restart_workers","params":{}}\`
2. \`POST /system/recover\` — \`{"subsystem":"analysis","action":"drain_preprocessing_backlog","params":{}}\`
3. \`POST /system/recover\` — \`{"subsystem":"preprocessing","action":"resume_normal_processing","params":{}}\`
4. \`POST /system/recover\` — \`{"subsystem":"ingestion","action":"restore_rate_limit","params":{}}\`

## Verification
- \`GET /system/subsystem/analysis\` — \`active_workers\` should be 4, \`memory_usage_pct\` < 70
- \`GET /metrics\` — \`recovery_completeness\` = 1.0

## Prevention
- Memory profiling should run on worker processes weekly
- Set \`max_memory_per_worker\` in subsystem_config to 90% of available
`,

  "/docs/runbooks/config-drift-recovery": `# Runbook: Preprocessing Configuration Drift Recovery

**Applies to:** \`preprocessing\` subsystem — config_hash_mismatch scenarios

## Diagnosis Checklist
1. \`GET /system/subsystem/preprocessing\` — check \`config_hash_valid\` (false = drifted)
2. \`query(sql="SELECT * FROM subsystem_config WHERE subsystem_id='preprocessing'")\` — compare hash
3. \`query_logs(subsystem="preprocessing", pattern="CONFIG_HASH_MISMATCH")\`

## Pre-Recovery Checks
- Identify the window of affected data: find first \`CONFIG_HASH_MISMATCH\` log timestamp
- Do NOT reprocess before restoring config — reprocessed data will also be contaminated

## Recovery Sequence (ORDER MATTERS)
1. \`POST /system/recover\` — \`{"subsystem":"preprocessing","action":"restore_config_from_backup","params":{}}\`
2. \`POST /system/recover\` — \`{"subsystem":"preprocessing","action":"reprocess_affected_window","params":{}}\`
3. \`POST /system/recover\` — \`{"subsystem":"analysis","action":"invalidate_contaminated_results","params":{}}\`
4. \`POST /system/recover\` — \`{"subsystem":"results-store","action":"verify_integrity","params":{}}\`

## Verification
- \`GET /system/subsystem/preprocessing\` — \`config_hash_valid\` = true, \`validation_pass_rate\` > 0.95
`,

  "/docs/runbooks/index-corruption-recovery": `# Runbook: Results-Store Index Corruption Recovery

**Applies to:** \`results-store\` subsystem — temporal index B-tree corruption

## Diagnosis Checklist
1. \`GET /system/subsystem/results-store\` — check \`index_checksum_valid\` (false = corrupt)
2. \`query(sql="SELECT * FROM performance_history WHERE subsystem_id='results-store' ORDER BY ts DESC LIMIT 24")\`
3. \`query_logs(subsystem="results-store", pattern="INDEX_CORRUPTION")\`

## Pre-Recovery Checks
- **Pause writes FIRST.** Rebuilding the index while writes are active will fail.
- Ensure archive replication is paused (it will be blocked by the write pause)

## Recovery Sequence (ORDER MATTERS)
1. \`POST /system/recover\` — \`{"subsystem":"results-store","action":"pause_writes","params":{}}\`
2. \`POST /system/recover\` — \`{"subsystem":"results-store","action":"rebuild_temporal_index","params":{}}\`
3. \`POST /system/recover\` — \`{"subsystem":"results-store","action":"resume_writes","params":{}}\`
4. \`POST /system/recover\` — \`{"subsystem":"archive","action":"resync_from_results","params":{}}\`
5. \`POST /system/recover\` — \`{"subsystem":"query-gateway","action":"flush_stale_cache","params":{}}\`

## Warning
The \`rebuild_temporal_index\` action is the most time-sensitive step. If it times out, retry once.
`,

  "/docs/runbooks/certificate-renewal": `# Runbook: Ingestion TLS Certificate Renewal

**Applies to:** \`ingestion\` subsystem — expired TLS certificate causing 0 active connections

## Diagnosis Checklist
1. \`GET /system/subsystem/ingestion\` — check \`cert_status\` (EXPIRED), \`active_connections\` (0)
2. \`query(sql="SELECT * FROM certificate_registry WHERE subsystem_id='ingestion' ORDER BY expires_at DESC LIMIT 5")\`
3. \`query_logs(subsystem="ingestion", pattern="CERT_EXPIRED")\`

## Pre-Recovery Checks
- All 47 data sources will have queued observations — expect high backfill volume after recovery
- Verify preprocessing is healthy before restoring ingestion (backpressure management)

## Recovery Sequence (ORDER MATTERS)
1. \`POST /system/recover\` — \`{"subsystem":"ingestion","action":"rotate_tls_certificate","params":{}}\`
2. \`POST /system/recover\` — \`{"subsystem":"ingestion","action":"notify_data_sources","params":{}}\`
3. \`POST /system/recover\` — \`{"subsystem":"preprocessing","action":"reset_starvation_state","params":{}}\`
4. \`POST /system/recover\` — \`{"subsystem":"analysis","action":"reload_pipeline","params":{}}\`
5. \`POST /system/recover\` — \`{"subsystem":"results-store","action":"accept_backfill_mode","params":{}}\`

## Verification
- \`GET /system/subsystem/ingestion\` — \`active_connections\` = 47, \`cert_status\` = VALID
- \`GET /metrics\` — \`recovery_completeness\` = 1.0
`,

  "/docs/architecture/subsystems": `# LIGHTHOUSE Architecture: Subsystems

## Overview

LIGHTHOUSE processes telescope observation data through a 6-stage pipeline.
Data flows: Ingestion → Preprocessing → Analysis → Results-Store → {Archive, Query-Gateway}

## Subsystems

### ingestion
Receives raw observation data from 47 remote data sources via authenticated REST API.
TLS certificates must be valid; certificate expiry drops all 47 connections instantly.

### preprocessing
Validates and normalizes raw observations using configurable rule sets.
Config drift causes silent data quality degradation — validation appears to pass but output is contaminated.

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
ingestion → preprocessing → analysis → results-store ─┬→ archive → query-gateway
                                                        └──────────→ query-gateway
\`\`\`
Failures propagate downstream. Backpressure propagates upstream.

## Red Herring Note
One subsystem will show degraded metrics that are NOT part of the actual failure chain.
Correctly identifying and excluding it earns full scoring on the failure_chain dimension.
`,

  "/docs/operations/recovery": `# LIGHTHOUSE General Recovery Procedures

## Golden Rules

1. **Diagnose before acting.** Query logs, metrics, and ops-db first.
2. **Follow the runbook.** Each recovery has ordering constraints. Out-of-order commands cause secondary failures.
3. **Verify after each step.** \`GET /system/status\` after every recovery command.
4. **Identify the root cause, not the symptoms.** Treat the root subsystem first.
5. **Exclude red herrings.** Not every degraded subsystem is in the failure chain.

## Root Cause Identification Checklist

1. \`get_anomaly_timeline()\` — find the earliest WARN+ event (that's the root)
2. \`get_error_summary()\` — see which subsystem has the most errors (usually the root)
3. \`correlate_events(time_window_minutes=30)\` — find clustered anomalies
4. Cross-reference with ops-db: \`performance_history\`, \`incident_history\`, \`disk_usage_history\`
5. Check \`dependency_graph\` to understand propagation direction

## Recovery Command Format

\`\`\`json
POST /system/recover
{"subsystem": "<id>", "action": "<action_name>", "params": {...}}
\`\`\`

## Scoring Impact

- Correct root cause with evidence: 20% of total score
- Recovery actions in correct order: 30% of total score
- Correct failure chain: 15% of total score
- Idempotent recovery script: 20% of total score
- Research breadth (consulting runbooks): 10% of total score
- Incident report quality: 5% of total score
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
