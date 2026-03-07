/**
 * AEGIS Flow Analyzer Server
 *
 * REST API providing structured query access to AEGIS network flow logs.
 * Flow logs are generated deterministically from SEED, matching the
 * same attack scenario as the trading-engine service.
 *
 * Endpoints:
 *   GET  /tools                      -- List available tools
 *   POST /tools/query_flows          -- Query with filters (zone, severity, pattern, time_range)
 *   POST /tools/get_attack_timeline  -- Chronological WARN+ events
 *   POST /tools/correlate_flows      -- Find co-occurring events across zones
 *   POST /tools/get_threat_summary   -- Per-zone threat counts
 */

import express from "express";

// -- PRNG --

function rng(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// -- Scenario selection (must match trading-engine) --

const SEED = parseInt(process.env.SEED ?? "42", 10);
const r = rng(SEED);

const SCENARIOS = [
  {
    id: "volumetric_syn_flood",
    impactChain: ["edge-ingress", "api-gateway", "order-engine"],
    attackSignals: ["SYN_FLOOD_DETECTED", "CONNECTION_TABLE_SATURATED", "TLS_RENEGOTIATION_ABUSE", "POP_CAPACITY_EXCEEDED"],
    diversions: [
      { zone: "market-data", signal: "WS_DISCONNECT_STORM" },
      { zone: "settlement-bus", signal: "SETTLEMENT_LATENCY_HIGH" },
    ],
  },
  {
    id: "slowloris_api_exhaustion",
    impactChain: ["api-gateway", "order-engine", "market-data"],
    attackSignals: ["WORKER_THREAD_EXHAUSTION", "SLOWLORIS_PATTERN_DETECTED", "KEEPALIVE_ANOMALY", "REQUEST_QUEUE_OVERFLOW"],
    diversions: [
      { zone: "edge-ingress", signal: "LATENCY_ELEVATED" },
      { zone: "settlement-bus", signal: "CONSUMER_LAG" },
    ],
  },
  {
    id: "order_injection_dos",
    impactChain: ["order-engine", "market-data", "settlement-bus"],
    attackSignals: ["ORDER_BOOK_FRAGMENTATION", "CANCEL_REPLACE_STORM", "MEMORY_ALLOCATOR_PRESSURE", "MATCHING_LATENCY_SPIKE"],
    diversions: [
      { zone: "api-gateway", signal: "AUTH_LATENCY_ELEVATED" },
      { zone: "edge-ingress", signal: "TLS_HANDSHAKE_FAILURE" },
    ],
  },
  {
    id: "websocket_amplification",
    impactChain: ["market-data", "api-gateway", "settlement-bus"],
    attackSignals: ["SUBSCRIPTION_AMPLIFICATION", "EGRESS_BANDWIDTH_SATURATED", "SNAPSHOT_RATE_ABUSE", "SUBSCRIBER_STALE_DATA"],
    diversions: [
      { zone: "order-engine", signal: "MATCHING_LATENCY_SPIKE" },
      { zone: "edge-ingress", signal: "GEO_ANOMALY" },
    ],
  },
  {
    id: "settlement_kafka_flood",
    impactChain: ["settlement-bus", "order-engine", "market-data"],
    attackSignals: ["KAFKA_PARTITION_FLOOD", "CONSUMER_LAG_CRITICAL", "SETTLEMENT_WINDOW_BREACH", "POSITION_LIMIT_HIT"],
    diversions: [
      { zone: "api-gateway", signal: "LATENCY_ELEVATED" },
      { zone: "edge-ingress", signal: "CONNECTION_RETRY_RATE" },
    ],
  },
  {
    id: "dns_reflection_edge",
    impactChain: ["edge-ingress", "api-gateway"],
    attackSignals: ["DNS_REFLECTION_DETECTED", "UDP_FLOOD_INGRESS", "UPLINK_SATURATION", "LEGITIMATE_RESOLVER_TRAFFIC"],
    diversions: [
      { zone: "order-engine", signal: "ORDER_REJECTION_RATE" },
      { zone: "market-data", signal: "FEED_GAP" },
    ],
  },
  {
    id: "api_credential_stuffing",
    impactChain: ["api-gateway", "order-engine", "settlement-bus"],
    attackSignals: ["CREDENTIAL_STUFFING_DETECTED", "AUTH_CPU_SATURATION", "SESSION_EXPIRY_STORM", "ACCOUNT_LOCKOUT_SURGE"],
    diversions: [
      { zone: "edge-ingress", signal: "CONNECTION_RATE_ELEVATED" },
      { zone: "market-data", signal: "FIX_SESSION_DISCONNECT" },
    ],
  },
  {
    id: "memcached_amplification_mixed",
    impactChain: ["edge-ingress", "api-gateway", "order-engine", "market-data"],
    attackSignals: ["MEMCACHED_AMPLIFICATION", "HTTP_FLOOD_L7", "MULTI_VECTOR_DETECTED", "DEFENSE_LAYER_BYPASS"],
    diversions: [
      { zone: "settlement-bus", signal: "KAFKA_REPLICATION_LAG" },
      { zone: "order-engine", signal: "ORDER_BOOK_DEPTH_DROP" },
    ],
  },
];

const scenarioIdx = Math.floor(r() * SCENARIOS.length);
const SCENARIO = SCENARIOS[scenarioIdx];

// -- Flow Log Generation --

const BASE_TIME = new Date("2026-03-04T12:00:00Z").getTime();
const ALL_ZONES = ["edge-ingress", "api-gateway", "order-engine", "market-data", "settlement-bus"];

function randInt(min, max, rf) { return min + Math.floor(rf() * (max - min + 1)); }

function generateFlows() {
  const logs = [];
  const r2 = rng(SEED + 1);

  function addLog(offsetMin, level, zone, code, message, metadata = {}) {
    const jitter = Math.floor(r2() * 60) - 30;
    const ts = new Date(BASE_TIME + (offsetMin * 60 + jitter) * 1000).toISOString();
    logs.push({ ts, level, zone, code, message, metadata });
  }

  // Background operational logs
  for (let min = -360; min < 0; min += 5) {
    const zones = [...ALL_ZONES];
    const zone = zones[Math.floor(r2() * zones.length)];
    addLog(min, "INFO", zone, "HEALTH_OK", "Health check passed", { latency_ms: randInt(1, 50, r2) });
  }

  // Normal trading activity
  for (let min = -360; min < 0; min += 2) {
    addLog(min, "INFO", "order-engine", "ORDER_PROCESSED", "Order batch processed", {
      count: randInt(200, 800, r2),
      asset_class: ["equities", "futures", "options", "fx"][Math.floor(r2() * 4)],
      avg_latency_us: randInt(50, 500, r2),
    });
  }

  // Sporadic warnings
  addLog(-280, "WARN", "api-gateway", "SLOW_UPSTREAM", "Upstream response > threshold", { latency_ms: 67 });
  addLog(-200, "WARN", "edge-ingress", "GEO_ANOMALY", "Minor geo shift detected", { pct_shift: 5.2 });
  addLog(-150, "WARN", "settlement-bus", "CONSUMER_LAG", "Consumer lag above soft threshold", { lag_ms: 340 });
  addLog(-100, "WARN", "market-data", "SUBSCRIBER_RECONNECT", "Subscriber reconnect burst", { count: 12 });
  addLog(-60, "WARN", "order-engine", "GC_PAUSE", "GC pause exceeded threshold", { pause_ms: 23 });

  const onsetMin = -240;

  if (SCENARIO.id === "volumetric_syn_flood") {
    addLog(onsetMin + 60, "WARN", "edge-ingress", "SYN_RATE_ELEVATED", "SYN packet rate climbing", { syn_rate_pps: 450000 });
    addLog(onsetMin + 80, "ERROR", "edge-ingress", "SYN_FLOOD_DETECTED", "SYN flood detected", { syn_rate_pps: 2800000, connection_table_pct: 78 });
    addLog(onsetMin + 85, "ERROR", "edge-ingress", "CONNECTION_TABLE_SATURATED", "Connection table at capacity", { table_size: 2000000 });
    addLog(onsetMin + 90, "ERROR", "edge-ingress", "TLS_RENEGOTIATION_ABUSE", "TLS renegotiation 200x normal", { renegotiation_rate: 84000 });
    addLog(onsetMin + 95, "CRITICAL", "edge-ingress", "POP_CAPACITY_EXCEEDED", "PoP capacity exceeded", { pop_id: "eu-west-1", utilization_pct: 104 });
    addLog(onsetMin + 110, "ERROR", "api-gateway", "UPSTREAM_TIMEOUT", "Edge connections timing out", { timeout_rate: 0.34 });
    addLog(onsetMin + 140, "WARN", "order-engine", "ORDER_LATENCY_SPIKE", "Order latency elevated", { p99_ms: 340 });
    addLog(onsetMin + 100, "WARN", "market-data", "WS_DISCONNECT_STORM", "WebSocket disconnects: 800+", { disconnected: 847 });
    addLog(onsetMin + 120, "WARN", "settlement-bus", "SETTLEMENT_LATENCY_HIGH", "Settlement latency spiked", { latency_ms: 12400 });
  } else if (SCENARIO.id === "slowloris_api_exhaustion") {
    addLog(onsetMin, "WARN", "api-gateway", "WORKER_UTILIZATION_HIGH", "Worker threads above 80%", { utilized: 5120 });
    addLog(onsetMin + 30, "ERROR", "api-gateway", "WORKER_THREAD_EXHAUSTION", "Threads exhausted", { utilized: 6380 });
    addLog(onsetMin + 35, "ERROR", "api-gateway", "SLOWLORIS_PATTERN_DETECTED", "Slow connections identified", { slow_connections: 4200 });
    addLog(onsetMin + 40, "ERROR", "api-gateway", "KEEPALIVE_ANOMALY", "Keepalive distribution anomalous", { median_secs: 340 });
    addLog(onsetMin + 50, "CRITICAL", "api-gateway", "REQUEST_QUEUE_OVERFLOW", "Queue overflow", { dropped: 1240 });
    addLog(onsetMin + 60, "ERROR", "order-engine", "UPSTREAM_STARVATION", "Gateway not forwarding orders", { orders_received: 0 });
    addLog(onsetMin + 90, "ERROR", "market-data", "SUBSCRIBER_AUTH_FAILURE", "Auth tokens expiring", { expired: 890 });
    addLog(onsetMin + 20, "WARN", "edge-ingress", "LATENCY_ELEVATED", "Edge latency 3.2x baseline", { latency_ms: 160 });
    addLog(onsetMin + 45, "WARN", "settlement-bus", "CONSUMER_LAG", "Kafka lag growing", { lag_ms: 45000 });
  } else if (SCENARIO.id === "order_injection_dos") {
    addLog(onsetMin, "WARN", "order-engine", "ORDER_RATE_ANOMALY", "Anomalous rate from single key", { orders_per_sec: 28000 });
    addLog(onsetMin + 15, "ERROR", "order-engine", "ORDER_BOOK_FRAGMENTATION", "4.7M price levels", { price_levels: 4700000 });
    addLog(onsetMin + 20, "ERROR", "order-engine", "CANCEL_REPLACE_STORM", "99.7% cancel ratio", { cancel_ratio: 0.997 });
    addLog(onsetMin + 30, "CRITICAL", "order-engine", "MEMORY_ALLOCATOR_PRESSURE", "Memory under pressure", { heap_pct: 96.2 });
    addLog(onsetMin + 40, "ERROR", "order-engine", "MATCHING_LATENCY_SPIKE", "Latency 45ms (SLA: 5ms)", { latency_ms: 45 });
    addLog(onsetMin + 60, "ERROR", "market-data", "SNAPSHOT_SIZE_EXCEEDED", "Snapshot 487MB", { snapshot_mb: 487 });
    addLog(onsetMin + 90, "ERROR", "settlement-bus", "PHANTOM_FILL_DETECTED", "Phantom fills detected", { count: 23 });
    addLog(onsetMin + 25, "WARN", "api-gateway", "AUTH_LATENCY_ELEVATED", "Auth latency 4.1x", { latency_ms: 410 });
    addLog(onsetMin + 35, "WARN", "edge-ingress", "TLS_HANDSHAKE_FAILURE", "TLS failures up", { failure_rate: 0.023 });
  } else if (SCENARIO.id === "websocket_amplification") {
    addLog(onsetMin + 60, "WARN", "market-data", "SUBSCRIPTION_ANOMALY", "Unusual subscription pattern", { max_subs: 847 });
    addLog(onsetMin + 75, "ERROR", "market-data", "SUBSCRIPTION_AMPLIFICATION", "Amplification attack", { abusive_connections: 128 });
    addLog(onsetMin + 80, "ERROR", "market-data", "EGRESS_BANDWIDTH_SATURATED", "Egress near capacity", { current_gbps: 24.7 });
    addLog(onsetMin + 85, "ERROR", "market-data", "SNAPSHOT_RATE_ABUSE", "500 snapshot/sec/conn", { rate: 500 });
    addLog(onsetMin + 90, "CRITICAL", "market-data", "SUBSCRIBER_STALE_DATA", "Stale data to 1840 subs", { stale: 1840 });
    addLog(onsetMin + 110, "ERROR", "api-gateway", "EGRESS_OVERLOAD", "Gateway egress impacted", { queue_depth: 8900 });
    addLog(onsetMin + 70, "WARN", "order-engine", "MATCHING_LATENCY_SPIKE", "Block trade lock 45ms", { latency_ms: 45 });
    addLog(onsetMin + 95, "WARN", "edge-ingress", "GEO_ANOMALY", "70% APAC traffic", { apac_pct: 70 });
  } else if (SCENARIO.id === "settlement_kafka_flood") {
    addLog(onsetMin, "WARN", "settlement-bus", "PRODUCER_RATE_ANOMALY", "Unusual producer rate", { msg_rate: 12000 });
    addLog(onsetMin + 20, "ERROR", "settlement-bus", "KAFKA_PARTITION_FLOOD", "Partition flooding", { flood_messages: 840000 });
    addLog(onsetMin + 30, "ERROR", "settlement-bus", "CONSUMER_LAG_CRITICAL", "Lag exceeded window", { lag_hours: 2.1 });
    addLog(onsetMin + 50, "CRITICAL", "settlement-bus", "SETTLEMENT_WINDOW_BREACH", "T+0 window breached", { pending: 47000 });
    addLog(onsetMin + 60, "ERROR", "order-engine", "POSITION_LIMIT_HIT", "Position limits hit", { rejected: 3400 });
    addLog(onsetMin + 90, "ERROR", "market-data", "SETTLEMENT_STATUS_STALE", "Settlement feed stale", { stale: 340 });
    addLog(onsetMin + 40, "WARN", "api-gateway", "LATENCY_ELEVATED", "API p99 degraded", { p99_ms: 2800 });
    addLog(onsetMin + 55, "WARN", "edge-ingress", "CONNECTION_RETRY_RATE", "Client retries elevated", { rate: 0.15 });
  } else if (SCENARIO.id === "dns_reflection_edge") {
    addLog(onsetMin + 120, "WARN", "edge-ingress", "UDP_TRAFFIC_ANOMALY", "UDP volume anomalous", { udp_gbps: 15.2 });
    addLog(onsetMin + 130, "ERROR", "edge-ingress", "DNS_REFLECTION_DETECTED", "DNS reflection identified", { reflected_gbps: 42.1 });
    addLog(onsetMin + 135, "ERROR", "edge-ingress", "UDP_FLOOD_INGRESS", "UDP flood saturating uplinks", { utilization_pct: 92 });
    addLog(onsetMin + 140, "CRITICAL", "edge-ingress", "UPLINK_SATURATION", "Uplinks saturated", { packet_loss_pct: 8.4 });
    addLog(onsetMin + 142, "ERROR", "edge-ingress", "LEGITIMATE_RESOLVER_TRAFFIC", "Traffic from legit resolvers", { legitimate_pct: 99.2 });
    addLog(onsetMin + 160, "ERROR", "api-gateway", "UPSTREAM_PACKET_LOSS", "Packet loss from edge", { loss_pct: 6.2 });
    addLog(onsetMin + 150, "WARN", "order-engine", "ORDER_REJECTION_RATE", "Rejections up", { rate: 0.047 });
    addLog(onsetMin + 155, "WARN", "market-data", "FEED_GAP", "Feed gap detected", { gap_secs: 47 });
  } else if (SCENARIO.id === "api_credential_stuffing") {
    addLog(onsetMin + 60, "WARN", "api-gateway", "AUTH_ATTEMPT_SURGE", "Auth 140x normal", { attempts_per_min: 28000 });
    addLog(onsetMin + 65, "ERROR", "api-gateway", "CREDENTIAL_STUFFING_DETECTED", "Credential stuffing", { unique_usernames: 12400 });
    addLog(onsetMin + 70, "ERROR", "api-gateway", "AUTH_CPU_SATURATION", "Auth CPU saturated", { cpu_pct: 97 });
    addLog(onsetMin + 80, "CRITICAL", "api-gateway", "SESSION_EXPIRY_STORM", "Sessions expiring", { expired: 1840 });
    addLog(onsetMin + 85, "ERROR", "api-gateway", "ACCOUNT_LOCKOUT_SURGE", "340 accounts locked", { locked: 340 });
    addLog(onsetMin + 90, "WARN", "api-gateway", "COMPROMISED_ACCOUNT_ALERT", "7 accounts compromised", { compromised: 7 });
    addLog(onsetMin + 100, "ERROR", "order-engine", "UNAUTHORIZED_ORDER_DETECTED", "Flagged orders", { count: 23 });
    addLog(onsetMin + 75, "WARN", "edge-ingress", "CONNECTION_RATE_ELEVATED", "Conn rate 2.8x", { rate: 84000 });
    addLog(onsetMin + 95, "WARN", "market-data", "FIX_SESSION_DISCONNECT", "FIX disconnects up", { count: 34 });
  } else if (SCENARIO.id === "memcached_amplification_mixed") {
    addLog(onsetMin, "ERROR", "edge-ingress", "MEMCACHED_AMPLIFICATION", "Memcached amplification", { traffic_gbps: 87 });
    addLog(onsetMin + 5, "CRITICAL", "edge-ingress", "MULTI_VECTOR_DETECTED", "Multi-vector attack", { volumetric_gbps: 180 });
    addLog(onsetMin + 10, "ERROR", "edge-ingress", "HTTP_FLOOD_L7", "L7 HTTP flood", { rps: 890000 });
    addLog(onsetMin + 15, "CRITICAL", "edge-ingress", "DEFENSE_LAYER_BYPASS", "L7 bypassing limits", { bypass_rate: 0.67 });
    addLog(onsetMin + 25, "ERROR", "api-gateway", "REQUEST_FLOOD_OVERFLOW", "Gateway overwhelmed", { rate: 340000 });
    addLog(onsetMin + 40, "ERROR", "order-engine", "CASCADING_TIMEOUT", "Orders timing out", { timeout_rate: 0.87 });
    addLog(onsetMin + 60, "ERROR", "market-data", "BANDWIDTH_CONTENTION", "Bandwidth contention", { available_pct: 12 });
    addLog(onsetMin + 30, "WARN", "settlement-bus", "KAFKA_REPLICATION_LAG", "Replication lag", { lag_ms: 8400 });
    addLog(onsetMin + 35, "WARN", "order-engine", "ORDER_BOOK_DEPTH_DROP", "Depth down 60%", { depth: 4800 });
  }

  addLog(-60, "ERROR", SCENARIO.impactChain[0], "ALERT_TRIGGERED", "P1 alert: attack detected", { severity: "P1" });
  addLog(-15, "WARN", SCENARIO.impactChain[SCENARIO.impactChain.length - 1], "SLA_BREACH", "SLA breached", {});

  return logs.sort((a, b) => a.ts.localeCompare(b.ts));
}

const LOGS = generateFlows();
const ANOMALY_LOGS = LOGS.filter((l) => ["WARN", "ERROR", "CRITICAL"].includes(l.level));

// -- REST Server --

const app = express();
app.use(express.json());

const TOOLS = [
  {
    name: "query_flows",
    description: "Query AEGIS network flow log entries with optional filters",
    inputSchema: {
      type: "object",
      properties: {
        zone: { type: "string", description: "Filter by zone ID (optional)" },
        severity: { type: "string", enum: ["DEBUG", "INFO", "WARN", "ERROR", "CRITICAL"] },
        time_range: { type: "object", properties: { from: { type: "string" }, to: { type: "string" } } },
        pattern: { type: "string", description: "Flow code pattern to search (optional)" },
        limit: { type: "number", description: "Max results (default 100, max 500)" },
      },
    },
  },
  {
    name: "get_attack_timeline",
    description: "Get chronological timeline of WARN/ERROR/CRITICAL flow events",
    inputSchema: {
      type: "object",
      properties: {
        zone: { type: "string", description: "Filter by zone (optional)" },
      },
    },
  },
  {
    name: "correlate_flows",
    description: "Find flow events that cluster together in time across zones",
    inputSchema: {
      type: "object",
      properties: {
        time_window_minutes: { type: "number", description: "Correlation window (default 15)" },
        min_severity: { type: "string", enum: ["WARN", "ERROR", "CRITICAL"] },
      },
    },
  },
  {
    name: "get_threat_summary",
    description: "Get aggregated threat counts per zone",
    inputSchema: { type: "object", properties: {} },
  },
];

function handleTool(name, args) {
  if (name === "query_flows") {
    let results = [...LOGS];
    if (args.zone) results = results.filter((l) => l.zone === args.zone);
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

  if (name === "get_attack_timeline") {
    let results = [...ANOMALY_LOGS];
    if (args.zone) results = results.filter((l) => l.zone === args.zone);
    return {
      timeline: results.map((l) => ({ ts: l.ts, level: l.level, zone: l.zone, code: l.code, message: l.message })),
      count: results.length,
      earliest: results[0]?.ts,
      latest: results[results.length - 1]?.ts,
    };
  }

  if (name === "correlate_flows") {
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
        return Math.abs(ts - anchorTs) <= windowMs / 2 && l.zone !== anchor.zone;
      });
      if (cluster.length >= 2) {
        const zones = [...new Set([anchor.zone, ...cluster.map((l) => l.zone)])];
        if (!clusters.some((c) => c.anchor_ts === anchor.ts)) {
          clusters.push({
            anchor_ts: anchor.ts,
            window_minutes: windowMin,
            zones_involved: zones,
            event_count: cluster.length + 1,
            events: [anchor, ...cluster].sort((a, b) => a.ts.localeCompare(b.ts)).slice(0, 10),
          });
        }
      }
    }

    return {
      clusters: clusters.slice(0, 20),
      total_clusters: clusters.length,
      note: "Clusters show events within the time window across zones -- useful for identifying attack propagation.",
    };
  }

  if (name === "get_threat_summary") {
    const summary = {};
    for (const zone of ALL_ZONES) {
      const zoneLogs = LOGS.filter((l) => l.zone === zone);
      summary[zone] = {
        total: zoneLogs.length,
        warn: zoneLogs.filter((l) => l.level === "WARN").length,
        error: zoneLogs.filter((l) => l.level === "ERROR").length,
        critical: zoneLogs.filter((l) => l.level === "CRITICAL").length,
        unique_codes: [...new Set(zoneLogs.filter((l) => l.level !== "INFO" && l.level !== "DEBUG").map((l) => l.code))],
        first_anomaly: ANOMALY_LOGS.find((l) => l.zone === zone)?.ts ?? null,
      };
    }
    return { zone_summary: summary, total_flow_entries: LOGS.length, total_anomalies: ANOMALY_LOGS.length };
  }

  return { error: `Unknown tool: ${name}` };
}

app.get("/tools", (req, res) => res.json({ tools: TOOLS }));
app.post("/tools/query_flows", (req, res) => res.json(handleTool("query_flows", req.body)));
app.post("/tools/get_attack_timeline", (req, res) => res.json(handleTool("get_attack_timeline", req.body)));
app.post("/tools/correlate_flows", (req, res) => res.json(handleTool("correlate_flows", req.body)));
app.post("/tools/get_threat_summary", (req, res) => res.json(handleTool("get_threat_summary", req.body)));
app.get("/health", (req, res) => res.json({ status: "ok", tool: "flow-analyzer" }));

const PORT = parseInt(process.env.PORT ?? "3000", 10);
app.listen(PORT, () => console.log(`Flow Analyzer on :${PORT} (seed=${SEED})`));

const MATCH_TTL_SECS = parseInt(process.env.MATCH_TTL_SECS ?? "0", 10);
if (MATCH_TTL_SECS > 0) {
  setTimeout(() => process.exit(0), MATCH_TTL_SECS * 1000).unref();
}
