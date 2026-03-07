/**
 * AEGIS Trading Engine Simulation API
 *
 * A seeded simulation of a five-zone distributed financial trading platform.
 * The SEED env var determines the attack scenario (which zone is targeted,
 * how it propagates, what signals are visible). Mitigation commands alter the
 * system state; issuing them out of order is rejected (409 Conflict).
 *
 * Endpoints:
 *   GET  /health                    -- Liveness check
 *   GET  /system/status             -- All zone health states
 *   GET  /system/zone/:id           -- Detailed metrics for one zone
 *   GET  /system/topology           -- Network dependency graph
 *   GET  /system/events?limit=N     -- Recent security events
 *   POST /system/mitigate           -- Issue a mitigation command
 *   GET  /metrics                   -- Aggregate metrics (public)
 *   GET  /__internal/metrics        -- Full scoring metrics (scorer only)
 */

import express from "express";

const app = express();
app.use(express.json());

// -- Seeded PRNG --

function rng(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// -- Scenario Configuration --

const SEED = parseInt(process.env.SEED ?? "42", 10);
const r = rng(SEED);

const SCENARIOS = [
  {
    id: "volumetric_syn_flood",
    impactChain: ["edge-ingress", "api-gateway", "order-engine"],
    mitigationSequence: [
      { zone: "edge-ingress", action: "enable_syn_cookies" },
      { zone: "edge-ingress", action: "deploy_geo_ratelimit" },
      { zone: "edge-ingress", action: "block_tls_renegotiation" },
      { zone: "api-gateway", action: "drain_stale_connections" },
      { zone: "order-engine", action: "resume_matching" },
    ],
    diversions: ["market-data", "settlement-bus"],
  },
  {
    id: "slowloris_api_exhaustion",
    impactChain: ["api-gateway", "order-engine", "market-data"],
    mitigationSequence: [
      { zone: "api-gateway", action: "set_header_timeout" },
      { zone: "api-gateway", action: "kill_slow_connections" },
      { zone: "api-gateway", action: "enable_connection_rate_limit" },
      { zone: "order-engine", action: "clear_pending_queue" },
      { zone: "market-data", action: "reconnect_subscribers" },
    ],
    diversions: ["edge-ingress", "settlement-bus"],
  },
  {
    id: "order_injection_dos",
    impactChain: ["order-engine", "market-data", "settlement-bus"],
    mitigationSequence: [
      { zone: "order-engine", action: "suspend_api_key" },
      { zone: "order-engine", action: "purge_phantom_orders" },
      { zone: "order-engine", action: "compact_order_book" },
      { zone: "market-data", action: "flush_stale_snapshots" },
      { zone: "settlement-bus", action: "reconcile_phantom_fills" },
    ],
    diversions: ["api-gateway", "edge-ingress"],
  },
  {
    id: "websocket_amplification",
    impactChain: ["market-data", "api-gateway", "settlement-bus"],
    mitigationSequence: [
      { zone: "market-data", action: "enforce_subscription_cap" },
      { zone: "market-data", action: "throttle_snapshot_rate" },
      { zone: "market-data", action: "disconnect_abusive_sessions" },
      { zone: "api-gateway", action: "enable_egress_shaping" },
      { zone: "settlement-bus", action: "resync_trade_feed" },
    ],
    diversions: ["order-engine", "edge-ingress"],
  },
  {
    id: "settlement_kafka_flood",
    impactChain: ["settlement-bus", "order-engine", "market-data"],
    mitigationSequence: [
      { zone: "settlement-bus", action: "revoke_service_account" },
      { zone: "settlement-bus", action: "purge_malformed_messages" },
      { zone: "settlement-bus", action: "reset_consumer_offsets" },
      { zone: "order-engine", action: "recalculate_positions" },
      { zone: "market-data", action: "publish_settlement_correction" },
    ],
    diversions: ["api-gateway", "edge-ingress"],
  },
  {
    id: "dns_reflection_edge",
    impactChain: ["edge-ingress", "api-gateway"],
    mitigationSequence: [
      { zone: "edge-ingress", action: "enable_udp_scrubbing" },
      { zone: "edge-ingress", action: "activate_upstream_blackhole" },
      { zone: "edge-ingress", action: "failover_pops" },
      { zone: "api-gateway", action: "enable_circuit_breaker" },
    ],
    diversions: ["order-engine", "market-data"],
  },
  {
    id: "api_credential_stuffing",
    impactChain: ["api-gateway", "order-engine", "settlement-bus"],
    mitigationSequence: [
      { zone: "api-gateway", action: "enable_auth_rate_limit" },
      { zone: "api-gateway", action: "block_known_credential_sources" },
      { zone: "api-gateway", action: "force_mfa_compromised_accounts" },
      { zone: "api-gateway", action: "unlock_legitimate_accounts" },
      { zone: "order-engine", action: "void_unauthorized_orders" },
      { zone: "settlement-bus", action: "halt_compromised_settlements" },
    ],
    diversions: ["edge-ingress", "market-data"],
  },
  {
    id: "memcached_amplification_mixed",
    impactChain: ["edge-ingress", "api-gateway", "order-engine", "market-data"],
    mitigationSequence: [
      { zone: "edge-ingress", action: "block_udp_11211" },
      { zone: "edge-ingress", action: "activate_scrubbing_center" },
      { zone: "edge-ingress", action: "deploy_js_challenge" },
      { zone: "api-gateway", action: "enable_request_fingerprinting" },
      { zone: "order-engine", action: "activate_priority_queue" },
      { zone: "market-data", action: "reduce_snapshot_frequency" },
    ],
    diversions: ["settlement-bus", "order-engine"],
  },
];

const scenarioIdx = Math.floor(r() * SCENARIOS.length);
const SCENARIO = SCENARIOS[scenarioIdx];

// -- State --

const ALL_ZONES = ["edge-ingress", "api-gateway", "order-engine", "market-data", "settlement-bus"];

const zoneHealth = {};
for (const id of ALL_ZONES) {
  const chainPos = SCENARIO.impactChain.indexOf(id);
  const isDiversion = SCENARIO.diversions.includes(id);

  if (chainPos === 0) {
    zoneHealth[id] = {
      status: "under_attack",
      health_score: 0.05 + r() * 0.10,
      error_rate: 0.35 + r() * 0.40,
      latency_p99_ms: 8000 + r() * 15000,
      throughput_pct: r() * 0.15,
      last_updated: new Date().toISOString(),
    };
  } else if (chainPos === 1) {
    zoneHealth[id] = {
      status: "degraded",
      health_score: 0.40 + r() * 0.20,
      error_rate: 0.08 + r() * 0.15,
      latency_p99_ms: 2000 + r() * 5000,
      throughput_pct: 0.35 + r() * 0.30,
      last_updated: new Date().toISOString(),
    };
  } else if (chainPos >= 2) {
    zoneHealth[id] = {
      status: "strained",
      health_score: 0.65 + r() * 0.15,
      error_rate: 0.02 + r() * 0.06,
      latency_p99_ms: 500 + r() * 2000,
      throughput_pct: 0.60 + r() * 0.25,
      last_updated: new Date().toISOString(),
    };
  } else if (isDiversion) {
    zoneHealth[id] = {
      status: "degraded",
      health_score: 0.45 + r() * 0.20,
      error_rate: 0.04 + r() * 0.12,
      latency_p99_ms: 1500 + r() * 4000,
      throughput_pct: 0.40 + r() * 0.30,
      last_updated: new Date().toISOString(),
    };
  } else {
    zoneHealth[id] = {
      status: "nominal",
      health_score: 0.90 + r() * 0.08,
      error_rate: r() * 0.003,
      latency_p99_ms: 20 + r() * 100,
      throughput_pct: 0.88 + r() * 0.12,
      last_updated: new Date().toISOString(),
    };
  }
}

const mitigationLog = [];
const completedActions = new Set();
let outOfOrderAttempted = false;

const eventLog = [];

function addEvent(level, zone, code, message, metadata = {}) {
  eventLog.push({
    ts: new Date().toISOString(),
    level,
    zone,
    code,
    message,
    metadata,
  });
}

for (const id of SCENARIO.impactChain) {
  addEvent("ERROR", id, "INITIAL_ALERT", "Zone reporting issues at incident detection", {});
}

// -- Auth Middleware --

const SERVICE_TOKEN = process.env.SERVICE_TOKEN ?? `siege-${SEED}`;

app.use((req, res, next) => {
  if (req.path === "/health" || req.path === "/metrics" || req.path === "/__internal/metrics") return next();
  const auth = req.headers.authorization ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
  if (!token) {
    return res.status(401).json({ error: "Missing Authorization header" });
  }
  next();
});

// -- Routes --

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/system/status", (req, res) => {
  const zones = ALL_ZONES.map((id) => ({
    id,
    name: nameFor(id),
    ...zoneHealth[id],
  }));

  const underAttack = zones.filter((z) => z.status === "under_attack").length;
  const degraded = zones.filter((z) => z.status === "degraded").length;
  const overallStatus = underAttack > 0 ? "critical" : degraded > 0 ? "degraded" : "nominal";

  res.json({
    overall_status: overallStatus,
    total_zones: ALL_ZONES.length,
    zones,
    incident_active: underAttack > 0 || degraded > 0,
    mitigation_actions_taken: mitigationLog.length,
  });
});

app.get("/system/zone/:id", (req, res) => {
  const { id } = req.params;
  if (!ALL_ZONES.includes(id)) {
    return res.status(404).json({ error: `Unknown zone: ${id}. Valid IDs: ${ALL_ZONES.join(", ")}` });
  }

  const health = zoneHealth[id];

  const detail = {
    id,
    name: nameFor(id),
    description: descriptionFor(id),
    ...health,
    upstream_dependencies: upstreamFor(id),
    downstream_dependents: downstreamFor(id),
    metrics: metricsFor(id, health),
    recent_events: eventLog.filter((e) => e.zone === id).slice(-10),
    mitigation_hint: health.status !== "nominal"
      ? "This zone is experiencing issues. Consult /docs/playbooks/ for mitigation procedures."
      : "Operating normally.",
  };

  res.json(detail);
});

app.get("/system/topology", (req, res) => {
  res.json({
    zones: ALL_ZONES.map((id) => ({
      id,
      name: nameFor(id),
      upstream: upstreamFor(id),
      downstream: downstreamFor(id),
      status: zoneHealth[id].status,
    })),
    edges: [
      { from: "edge-ingress", to: "api-gateway", type: "data_flow", encryption: "TLS_1.3" },
      { from: "api-gateway", to: "order-engine", type: "data_flow", encryption: "mTLS" },
      { from: "api-gateway", to: "market-data", type: "data_flow", encryption: "mTLS" },
      { from: "order-engine", to: "settlement-bus", type: "event_stream", protocol: "kafka" },
      { from: "order-engine", to: "market-data", type: "data_feed", protocol: "internal" },
      { from: "market-data", to: "settlement-bus", type: "trade_feed", protocol: "kafka" },
    ],
    note: "Edges represent data flow direction. Attack impact propagates downstream; backpressure propagates upstream.",
  });
});

app.get("/system/events", (req, res) => {
  const limit = Math.min(500, parseInt(req.query.limit ?? "50", 10));
  const zone = req.query.zone;
  const events = zone
    ? eventLog.filter((e) => e.zone === zone)
    : eventLog;
  res.json({
    events: events.slice(-limit).reverse(),
    total: events.length,
  });
});

app.post("/system/mitigate", (req, res) => {
  const { zone, action, params = {} } = req.body ?? {};

  if (!zone || !action) {
    return res.status(400).json({ error: "Request body must include 'zone' and 'action' fields." });
  }

  if (!ALL_ZONES.includes(zone)) {
    return res.status(400).json({ error: `Unknown zone: ${zone}. Valid IDs: ${ALL_ZONES.join(", ")}` });
  }

  const expectedSeq = SCENARIO.mitigationSequence;
  const expectedStep = expectedSeq.find((s) => s.zone === zone && s.action === action);

  if (!expectedStep) {
    addEvent("WARN", zone, "UNKNOWN_MITIGATION", `Unknown action attempted: ${action}`, { params });
    return res.status(400).json({
      success: false,
      message: `Action "${action}" is not a valid mitigation action for ${zone} in the current attack state. Consult /docs/playbooks/ for valid actions.`,
    });
  }

  const actionKey = `${zone}:${action}`;

  if (completedActions.has(actionKey)) {
    return res.json({
      success: true,
      idempotent: true,
      message: `Action "${action}" on ${zone} was already applied. Idempotent -- no change.`,
      zone_status: zoneHealth[zone].status,
    });
  }

  // Check ordering constraint
  const stepIdx = expectedSeq.findIndex((s) => s.zone === zone && s.action === action);
  const prevStep = stepIdx > 0 ? expectedSeq[stepIdx - 1] : null;
  const prevKey = prevStep ? `${prevStep.zone}:${prevStep.action}` : null;

  if (prevKey && !completedActions.has(prevKey) && stepIdx > 0) {
    outOfOrderAttempted = true;
    addEvent("ERROR", zone, "MITIGATION_ORDER_VIOLATION",
      "Mitigation command rejected -- prerequisite not met.",
      { attempted: action });

    return res.status(409).json({
      success: false,
      message: "A prerequisite mitigation step must be completed first.",
    });
  }

  completedActions.add(actionKey);
  mitigationLog.push({ ts: new Date().toISOString(), zone, action, params, out_of_order: false });

  // Simulate mitigation effect
  const health = zoneHealth[zone];
  const allStepsForZone = expectedSeq.filter((s) => s.zone === zone);
  const completedForZone = allStepsForZone.filter((s) => completedActions.has(`${s.zone}:${s.action}`)).length;
  const fractionComplete = completedForZone / allStepsForZone.length;

  if (fractionComplete >= 1.0) {
    health.status = "nominal";
    health.health_score = 0.92 + Math.random() * 0.06;
    health.error_rate = 0.001 * Math.random();
    health.latency_p99_ms = 30 + Math.random() * 70;
    health.throughput_pct = 0.90 + Math.random() * 0.08;
    health.last_updated = new Date().toISOString();
    addEvent("INFO", zone, "MITIGATION_COMPLETE", `Zone ${zone} fully mitigated`, { action });
  } else {
    health.health_score = Math.min(0.85, health.health_score + 0.25 * fractionComplete);
    health.error_rate = Math.max(0.02, health.error_rate * (1 - 0.4 * fractionComplete));
    health.last_updated = new Date().toISOString();
    addEvent("INFO", zone, "MITIGATION_PROGRESS",
      `Mitigation step ${completedForZone}/${allStepsForZone.length} complete for ${zone}`, { action });
  }

  res.json({
    success: true,
    message: `Mitigation action "${action}" on ${zone} applied successfully.`,
    zone_status: health.status,
    health_score: health.health_score,
    steps_completed_for_zone: completedForZone,
    total_steps_for_zone: allStepsForZone.length,
    fully_mitigated: health.status === "nominal",
  });
});

// Public metrics
app.get("/metrics", (req, res) => {
  const totalZones = ALL_ZONES.length;
  const nominalZones = ALL_ZONES.filter((id) => zoneHealth[id].status === "nominal").length;
  const underAttackZones = ALL_ZONES.filter((id) => zoneHealth[id].status === "under_attack").length;
  const degradedZones = ALL_ZONES.filter((id) => zoneHealth[id].status === "degraded").length;

  res.json({
    total_zones: totalZones,
    nominal_zones: nominalZones,
    under_attack_zones: underAttackZones,
    degraded_zones: degradedZones,
    platform_health_pct: (nominalZones / totalZones * 100).toFixed(1),
    mitigation_actions_taken: mitigationLog.length,
    incident_active: nominalZones < totalZones,
  });
});

// Internal metrics for scorer
app.get("/__internal/metrics", (req, res) => {
  const totalZones = ALL_ZONES.length;
  const nominalZones = ALL_ZONES.filter((id) => zoneHealth[id].status === "nominal").length;

  const chainLength = SCENARIO.impactChain.length;
  const chainMitigated = SCENARIO.impactChain.filter((id) => zoneHealth[id].status === "nominal").length;

  const correctActions = mitigationLog.filter((m) => !m.out_of_order).length;
  const totalExpectedActions = SCENARIO.mitigationSequence.length;

  res.json({
    scenario_id: SCENARIO.id,
    seed: SEED,
    total_zones: totalZones,
    nominal_zones: nominalZones,
    impact_chain_length: chainLength,
    impact_chain_mitigated: chainMitigated,
    mitigation_completeness: chainLength > 0 ? chainMitigated / chainLength : 1,
    mitigation_actions_taken: mitigationLog.length,
    mitigation_actions_correct: correctActions,
    expected_total_mitigation_actions: totalExpectedActions,
    out_of_order_penalty: outOfOrderAttempted,
    scoring_summary: {
      fully_mitigated: nominalZones === totalZones,
      chain_resolved: chainMitigated === chainLength,
      action_completion_rate: Math.min(1, correctActions / totalExpectedActions),
    },
  });
});

// -- Helper Functions --

function nameFor(id) {
  const names = {
    "edge-ingress": "Edge Ingress Layer",
    "api-gateway": "API Gateway Cluster",
    "order-engine": "Order Matching Engine",
    "market-data": "Market Data Distribution",
    "settlement-bus": "Settlement & Clearing Bus",
  };
  return names[id] ?? id;
}

function descriptionFor(id) {
  const descs = {
    "edge-ingress": "CDN and WAF layer handling incoming connections from 12 regional PoPs with L3/L4 filtering and TLS termination",
    "api-gateway": "Application-layer gateway with authentication, rate limiting, and request routing across 8 instances",
    "order-engine": "FPGA-accelerated order matching engine processing 100K+ orders/sec across 4 asset classes",
    "market-data": "Real-time market data feed serving 3,200+ subscribers via WebSocket and FIX protocol",
    "settlement-bus": "Kafka-backed settlement pipeline with exactly-once semantics and T+0 settlement window",
  };
  return descs[id] ?? id;
}

function upstreamFor(id) {
  const upstream = {
    "edge-ingress": [],
    "api-gateway": ["edge-ingress"],
    "order-engine": ["api-gateway"],
    "market-data": ["api-gateway", "order-engine"],
    "settlement-bus": ["order-engine", "market-data"],
  };
  return upstream[id] ?? [];
}

function downstreamFor(id) {
  const downstream = {
    "edge-ingress": ["api-gateway"],
    "api-gateway": ["order-engine", "market-data"],
    "order-engine": ["settlement-bus", "market-data"],
    "market-data": ["settlement-bus"],
    "settlement-bus": [],
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

  const s = SCENARIO.id;
  if (s === "volumetric_syn_flood" && id === "edge-ingress") {
    return { ...base, syn_rate_pps: health.status === "nominal" ? 12000 : 2800000, connection_table_pct: health.status === "nominal" ? 42 : 97, tls_renegotiation_rate: health.status === "nominal" ? 420 : 84000 };
  }
  if (s === "slowloris_api_exhaustion" && id === "api-gateway") {
    return { ...base, worker_threads_utilized: health.status === "nominal" ? 2400 : 6380, slow_connections: health.status === "nominal" ? 12 : 4200, avg_connection_duration_secs: health.status === "nominal" ? 2.1 : 340 };
  }
  if (s === "order_injection_dos" && id === "order-engine") {
    return { ...base, order_book_levels: health.status === "nominal" ? 12000 : 4700000, cancel_ratio: health.status === "nominal" ? 0.65 : 0.997, memory_fragmentation_pct: health.status === "nominal" ? 12 : 87 };
  }
  if (s === "websocket_amplification" && id === "market-data") {
    return { ...base, egress_bandwidth_gbps: health.status === "nominal" ? 4.2 : 28.4, max_subs_per_conn: health.status === "nominal" ? 23 : 847, snapshot_rate_per_conn: health.status === "nominal" ? 2 : 500 };
  }
  if (s === "settlement_kafka_flood" && id === "settlement-bus") {
    return { ...base, consumer_lag_hours: health.status === "nominal" ? 0.02 : 4.2, msg_size_avg_kb: health.status === "nominal" ? 1.2 : 64, flood_messages: health.status === "nominal" ? 0 : 2800000 };
  }
  if (s === "dns_reflection_edge" && id === "edge-ingress") {
    return { ...base, udp_dns_gbps: health.status === "nominal" ? 0.1 : 62, resolver_source_count: health.status === "nominal" ? 0 : 4800, uplink_utilization_pct: health.status === "nominal" ? 35 : 98 };
  }
  if (s === "api_credential_stuffing" && id === "api-gateway") {
    return { ...base, auth_attempts_per_min: health.status === "nominal" ? 200 : 28000, compromised_accounts: health.status === "nominal" ? 0 : 7, locked_accounts: health.status === "nominal" ? 0 : 340, cpu_pct: health.status === "nominal" ? 45 : 97 };
  }
  if (s === "memcached_amplification_mixed" && id === "edge-ingress") {
    return { ...base, memcached_traffic_gbps: health.status === "nominal" ? 0 : 180, http_flood_rps: health.status === "nominal" ? 0 : 890000, scrubbing_active: health.status === "nominal" };
  }

  // Diversion metrics
  const isDiversion = SCENARIO.diversions.includes(id);
  if (isDiversion && health.status === "degraded") {
    if (id === "market-data") {
      return { ...base, ws_disconnect_rate: 0.12 + Math.random() * 0.05, stale_subscribers: 340 + Math.floor(Math.random() * 200) };
    }
    if (id === "settlement-bus") {
      return { ...base, consumer_lag_ms: 8400 + Math.floor(Math.random() * 4000), pending_settlements: 1200 + Math.floor(Math.random() * 800) };
    }
    if (id === "edge-ingress") {
      return { ...base, connection_retry_rate: 0.08 + Math.random() * 0.04, geo_shift_pct: 15 + Math.random() * 10 };
    }
    if (id === "order-engine") {
      return { ...base, rejection_rate: 0.03 + Math.random() * 0.02, order_book_depth_pct: 0.35 + Math.random() * 0.15 };
    }
    if (id === "api-gateway") {
      return { ...base, auth_queue_depth: 1200 + Math.floor(Math.random() * 800), retry_storm_rate: 0.1 + Math.random() * 0.05 };
    }
  }

  return base;
}

// -- Documentation (docs.aegis.internal proxy target) --

const DOCS = {
  "/docs/playbooks/": `# AEGIS DDoS Mitigation Playbook Index

## Available Playbooks

- [/docs/playbooks/volumetric-mitigation](/docs/playbooks/volumetric-mitigation) -- SYN flood and volumetric attack response
- [/docs/playbooks/slowloris-mitigation](/docs/playbooks/slowloris-mitigation) -- Slowloris and connection exhaustion attacks
- [/docs/playbooks/application-layer-mitigation](/docs/playbooks/application-layer-mitigation) -- Application-layer and order injection attacks
- [/docs/playbooks/amplification-mitigation](/docs/playbooks/amplification-mitigation) -- DNS/memcached reflection and WebSocket amplification
- [/docs/playbooks/credential-stuffing-response](/docs/playbooks/credential-stuffing-response) -- Credential stuffing and account compromise
- [/docs/playbooks/settlement-flood-response](/docs/playbooks/settlement-flood-response) -- Kafka flooding and settlement bus attacks
- [/docs/playbooks/multi-vector-response](/docs/playbooks/multi-vector-response) -- Coordinated multi-vector attack response

All playbooks follow: Classification -> Pre-Mitigation Checks -> Mitigation Steps -> Verification -> Prevention.
`,

  "/docs/playbooks/volumetric-mitigation": `# Playbook: Volumetric Attack Mitigation

**Applies to:** \`edge-ingress\` zone -- SYN floods, UDP floods, and volumetric attacks

## Classification Checklist
1. Check \`GET /system/zone/edge-ingress\` for connection table and SYN rate metrics
2. Query flow logs for SYN_FLOOD_DETECTED and CONNECTION_TABLE_SATURATED codes
3. Review traffic_history in the firewall database for inbound volume trends
4. Check geographic distribution of traffic for anomalous concentration
5. Verify whether TLS renegotiation is being abused (amplification vector)

## Pre-Mitigation Checks
- Assess downstream impact before applying edge mitigations
- Do NOT block IPs individually during volumetric attacks -- use geographic rate limits instead

## Mitigation Steps (ORDER MATTERS)

All mitigation commands use \`POST /system/mitigate\` with body \`{"zone": "<id>", "action": "<name>", "params": {...}}\`.

1. \`enable_syn_cookies\` on \`edge-ingress\` -- Handle half-open connections without consuming table entries
2. \`deploy_geo_ratelimit\` on \`edge-ingress\` -- Rate limit traffic from concentrated source countries
3. \`block_tls_renegotiation\` on \`edge-ingress\` -- Disable TLS renegotiation to close amplification vector
4. \`drain_stale_connections\` on \`api-gateway\` -- Clear connections accumulated during the flood
5. \`resume_matching\` on \`order-engine\` -- Resume order processing after upstream pressure relieved

## Verification
- \`GET /system/status\` -- affected zones should show improving health
`,

  "/docs/playbooks/slowloris-mitigation": `# Playbook: Slowloris Attack Mitigation

**Applies to:** \`api-gateway\` zone -- slow-rate connection exhaustion

## Classification Checklist
1. Check \`GET /system/zone/api-gateway\` for worker thread utilization and connection duration metrics
2. Query flow logs for WORKER_THREAD_EXHAUSTION and SLOWLORIS_PATTERN_DETECTED
3. Look for extremely long connection durations with near-zero bytes per second
4. Check header completion rate -- Slowloris sends headers very slowly

## Mitigation Steps (ORDER MATTERS)

1. \`set_header_timeout\` on \`api-gateway\` -- Reduce header completion timeout from 120s to 5s
2. \`kill_slow_connections\` on \`api-gateway\` -- Terminate connections sending fewer than 100 bytes/sec
3. \`enable_connection_rate_limit\` on \`api-gateway\` -- Limit concurrent connections per source IP
4. \`clear_pending_queue\` on \`order-engine\` -- Clear the order queue accumulated during starvation
5. \`reconnect_subscribers\` on \`market-data\` -- Trigger subscriber reconnection after gateway recovery
`,

  "/docs/playbooks/application-layer-mitigation": `# Playbook: Application-Layer Attack Mitigation

**Applies to:** \`order-engine\` zone -- malicious order injection, order book fragmentation

## Classification Checklist
1. Check \`GET /system/zone/order-engine\` for order book size and cancel ratio metrics
2. Query flow logs for ORDER_BOOK_FRAGMENTATION and CANCEL_REPLACE_STORM
3. Identify the source API key generating anomalous traffic
4. Check api_keys table in firewall DB for compromised key status

## Mitigation Steps (ORDER MATTERS)

1. \`suspend_api_key\` on \`order-engine\` -- Suspend the compromised API key
2. \`purge_phantom_orders\` on \`order-engine\` -- Purge orders from sources with >95% cancel rate
3. \`compact_order_book\` on \`order-engine\` -- Run order book compaction to reclaim memory
4. \`flush_stale_snapshots\` on \`market-data\` -- Flush corrupted order book snapshots
5. \`reconcile_phantom_fills\` on \`settlement-bus\` -- Void fills against phantom orders
`,

  "/docs/playbooks/amplification-mitigation": `# Playbook: Amplification Attack Mitigation

**Applies to:** \`edge-ingress\` (DNS reflection) or \`market-data\` (WebSocket amplification)

## DNS Reflection
1. \`enable_udp_scrubbing\` on \`edge-ingress\` -- DNS-specific UDP scrubbing
2. \`activate_upstream_blackhole\` on \`edge-ingress\` -- BGP flowspec for UDP/53
3. \`failover_pops\` on \`edge-ingress\` -- Failover saturated PoPs
4. \`enable_circuit_breaker\` on \`api-gateway\` -- Circuit breakers on affected PoP connections

## WebSocket Amplification
1. \`enforce_subscription_cap\` on \`market-data\` -- Cap subscriptions per connection
2. \`throttle_snapshot_rate\` on \`market-data\` -- Rate-limit snapshot requests
3. \`disconnect_abusive_sessions\` on \`market-data\` -- Disconnect over-subscribed sessions
4. \`enable_egress_shaping\` on \`api-gateway\` -- Per-client egress bandwidth shaping
5. \`resync_trade_feed\` on \`settlement-bus\` -- Resync after data stabilizes
`,

  "/docs/playbooks/credential-stuffing-response": `# Playbook: Credential Stuffing Response

**Applies to:** \`api-gateway\` zone -- credential stuffing and account compromise

## Classification Checklist
1. Check auth attempt rate and unique username count in gateway metrics
2. Query flow logs for CREDENTIAL_STUFFING_DETECTED and AUTH_CPU_SATURATION
3. Identify compromised accounts and unauthorized orders

## Mitigation Steps (ORDER MATTERS)

1. \`enable_auth_rate_limit\` on \`api-gateway\` -- Rate-limit auth attempts per IP
2. \`block_known_credential_sources\` on \`api-gateway\` -- Block high-volume source ASNs
3. \`force_mfa_compromised_accounts\` on \`api-gateway\` -- Force MFA on compromised accounts
4. \`unlock_legitimate_accounts\` on \`api-gateway\` -- Unlock collaterally locked accounts
5. \`void_unauthorized_orders\` on \`order-engine\` -- Void orders from compromised accounts
6. \`halt_compromised_settlements\` on \`settlement-bus\` -- Halt settlements for flagged trades
`,

  "/docs/playbooks/settlement-flood-response": `# Playbook: Settlement Bus Flood Response

**Applies to:** \`settlement-bus\` zone -- Kafka partition flooding

## Classification Checklist
1. Check consumer lag and message size distribution in settlement-bus metrics
2. Query flow logs for KAFKA_PARTITION_FLOOD and SETTLEMENT_WINDOW_BREACH
3. Identify the compromised service account flooding the topic

## Mitigation Steps (ORDER MATTERS)

1. \`revoke_service_account\` on \`settlement-bus\` -- Revoke compromised credentials
2. \`purge_malformed_messages\` on \`settlement-bus\` -- Purge oversized messages
3. \`reset_consumer_offsets\` on \`settlement-bus\` -- Skip flood, resume valid messages
4. \`recalculate_positions\` on \`order-engine\` -- Recalculate after purging invalid settlements
5. \`publish_settlement_correction\` on \`market-data\` -- Publish corrected settlement status
`,

  "/docs/playbooks/multi-vector-response": `# Playbook: Multi-Vector Attack Response

**Applies to:** Coordinated attacks combining volumetric + application-layer vectors

## Key Principle
Multi-vector attacks require layered defense. Mitigating only the volumetric component is insufficient -- the L7 flood continues. Address both layers.

## Mitigation Steps (ORDER MATTERS)

1. \`block_udp_11211\` on \`edge-ingress\` -- Block memcached reflection traffic
2. \`activate_scrubbing_center\` on \`edge-ingress\` -- Route through upstream scrubbing
3. \`deploy_js_challenge\` on \`edge-ingress\` -- JavaScript challenge for HTTP flood
4. \`enable_request_fingerprinting\` on \`api-gateway\` -- ML-based bot detection
5. \`activate_priority_queue\` on \`order-engine\` -- VIP-only processing during attack
6. \`reduce_snapshot_frequency\` on \`market-data\` -- Conserve bandwidth
`,

  "/docs/architecture/zones": `# AEGIS Architecture: Network Zones

## Overview

AEGIS processes financial trades through a 5-zone distributed platform.
Data flows: Edge Ingress -> API Gateway -> {Order Engine, Market Data} -> Settlement Bus

## Zones

### edge-ingress
CDN and WAF layer with 12 regional PoPs. First defense: L3/L4 filtering, TLS termination, geo rate limiting.
Vulnerable to: SYN floods, DNS reflection, memcached amplification.

### api-gateway
8-instance gateway cluster with authentication, routing, rate limiting.
Vulnerable to: Slowloris connection exhaustion, credential stuffing, request floods.

### order-engine
FPGA-accelerated matching engine for 4 asset classes. Sub-5ms latency SLA.
Vulnerable to: Malicious order injection, order book fragmentation, cancel-replace storms.

### market-data
Real-time feed to 3,200+ subscribers via WebSocket/FIX. 32 Gbps egress capacity.
Vulnerable to: Subscription amplification, snapshot rate abuse, egress saturation.

### settlement-bus
Kafka-backed settlement with exactly-once semantics. T+0 settlement window.
Vulnerable to: Partition flooding, service account compromise, malformed message injection.

## Dependency Graph
\`\`\`
edge-ingress -> api-gateway --+--> order-engine --+--> settlement-bus
                              |                   |
                              +--> market-data ----+
\`\`\`
Attack impact propagates downstream. Backpressure propagates upstream.
`,

  "/docs/operations/ddos-response": `# AEGIS General DDoS Response Procedures

## Golden Rules

1. **Classify before acting.** Query flows, traffic data, and firewall configs first.
2. **Follow the playbook.** Each mitigation has ordering constraints. Out-of-order commands are rejected.
3. **Verify after each step.** \`GET /system/status\` after every mitigation command.
4. **Target the attack vector, not the symptoms.** Mitigate the primary zone first.
5. **Not all anomalies are attacks.** Some zones show elevated metrics for unrelated reasons.

## Attack Classification Checklist

1. \`get_attack_timeline()\` -- find the earliest WARN+ event
2. \`get_threat_summary()\` -- see which zone has the most alerts
3. \`correlate_flows(time_window_minutes=30)\` -- find clustered attack events
4. Cross-reference with firewall DB: \`traffic_history\`, \`incident_history\`, \`api_keys\`
5. Check \`network_topology\` to understand propagation direction

## Mitigation Command Format

\`\`\`json
POST /system/mitigate
{"zone": "<id>", "action": "<action_name>", "params": {...}}
\`\`\`
`,
};

app.get("/docs/*", (req, res) => {
  let path = req.path;
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

// -- Start --

const PORT = parseInt(process.env.PORT ?? "3000", 10);
app.listen(PORT, () => {
  console.log(`AEGIS Trading Engine on :${PORT} (seed=${SEED}, scenario=${SCENARIO.id})`);
});

const MATCH_TTL_SECS = parseInt(process.env.MATCH_TTL_SECS ?? "0", 10);
if (MATCH_TTL_SECS > 0) {
  console.log(`[TTL] Will self-terminate in ${MATCH_TTL_SECS}s`);
  setTimeout(() => {
    console.log("[TTL] Match TTL expired -- shutting down");
    process.exit(0);
  }, MATCH_TTL_SECS * 1000).unref();
}
