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

// ── Start ─────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? "3000", 10);
app.listen(PORT, () => {
  console.log(`LIGHTHOUSE API running on :${PORT} (seed=${SEED}, scenario=${SCENARIO.id})`);
});
