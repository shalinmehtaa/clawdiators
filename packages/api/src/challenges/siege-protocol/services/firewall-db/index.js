/**
 * AEGIS Firewall Configuration Database Server
 *
 * REST API providing read-only SQL access to the AEGIS firewall and
 * network configuration database. Populated deterministically from SEED.
 *
 * Endpoints:
 *   GET  /tools             -- List available tools
 *   POST /tools/query       -- Execute read-only SQL
 *   POST /tools/schema      -- Get CREATE TABLE statement
 *   POST /tools/list_tables -- List all tables with descriptions
 */

import Database from "better-sqlite3";
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

const SEED = parseInt(process.env.SEED ?? "42", 10);
const r = rng(SEED);

const SCENARIOS = [
  { id: "volumetric_syn_flood", impactChain: ["edge-ingress", "api-gateway", "order-engine"], diversions: ["market-data", "settlement-bus"] },
  { id: "slowloris_api_exhaustion", impactChain: ["api-gateway", "order-engine", "market-data"], diversions: ["edge-ingress", "settlement-bus"] },
  { id: "order_injection_dos", impactChain: ["order-engine", "market-data", "settlement-bus"], diversions: ["api-gateway", "edge-ingress"] },
  { id: "websocket_amplification", impactChain: ["market-data", "api-gateway", "settlement-bus"], diversions: ["order-engine", "edge-ingress"] },
  { id: "settlement_kafka_flood", impactChain: ["settlement-bus", "order-engine", "market-data"], diversions: ["api-gateway", "edge-ingress"] },
  { id: "dns_reflection_edge", impactChain: ["edge-ingress", "api-gateway"], diversions: ["order-engine", "market-data"] },
  { id: "api_credential_stuffing", impactChain: ["api-gateway", "order-engine", "settlement-bus"], diversions: ["edge-ingress", "market-data"] },
  { id: "memcached_amplification_mixed", impactChain: ["edge-ingress", "api-gateway", "order-engine", "market-data"], diversions: ["settlement-bus", "order-engine"] },
];

const scenarioIdx = Math.floor(r() * SCENARIOS.length);
const SCENARIO = SCENARIOS[scenarioIdx];

const BASE_TIME = new Date("2026-03-04T12:00:00Z").getTime();
const ALL_ZONES = ["edge-ingress", "api-gateway", "order-engine", "market-data", "settlement-bus"];

function randInt(min, max, rf) { return min + Math.floor(rf() * (max - min + 1)); }

// -- Database Setup --

const db = new Database(":memory:");

function buildDatabase() {
  const r2 = rng(SEED + 100);

  // zone_config
  db.exec(`CREATE TABLE zone_config (
    zone_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    version TEXT,
    last_deployed TEXT,
    instance_count INTEGER,
    status TEXT
  )`);

  const zoneNames = {
    "edge-ingress": "Edge Ingress Layer",
    "api-gateway": "API Gateway Cluster",
    "order-engine": "Order Matching Engine",
    "market-data": "Market Data Distribution",
    "settlement-bus": "Settlement & Clearing Bus",
  };
  const zoneDescs = {
    "edge-ingress": "CDN and WAF layer with 12 regional PoPs, L3/L4 filtering, TLS termination",
    "api-gateway": "Application-layer gateway with auth, routing, rate limiting across 8 instances",
    "order-engine": "FPGA-accelerated order matching engine for 4 asset classes",
    "market-data": "Real-time feed to 3200+ subscribers via WebSocket and FIX protocol",
    "settlement-bus": "Kafka-backed settlement pipeline with exactly-once semantics",
  };
  const instanceCounts = {
    "edge-ingress": 12, "api-gateway": 8, "order-engine": 3,
    "market-data": 4, "settlement-bus": 6,
  };

  for (const id of ALL_ZONES) {
    const chainPos = SCENARIO.impactChain.indexOf(id);
    const isDiversion = SCENARIO.diversions.includes(id);
    let status;
    if (chainPos === 0) status = "under_attack";
    else if (chainPos === 1) status = "degraded";
    else if (chainPos >= 2) status = "strained";
    else if (isDiversion) status = "degraded";
    else status = "nominal";

    db.prepare("INSERT INTO zone_config VALUES (?,?,?,?,?,?,?)").run(
      id, zoneNames[id], zoneDescs[id],
      `${randInt(3, 6, r2)}.${randInt(0, 9, r2)}.${randInt(0, 20, r2)}`,
      new Date(BASE_TIME - randInt(1, 14, r2) * 24 * 3600 * 1000).toISOString().split("T")[0],
      instanceCounts[id], status
    );
  }

  // network_topology
  db.exec(`CREATE TABLE network_topology (
    id TEXT PRIMARY KEY, source TEXT, target TEXT,
    link_type TEXT, bandwidth_gbps REAL, encryption TEXT
  )`);
  const edges = [
    ["edge-ingress", "api-gateway", "data_flow", 100, "TLS_1.3"],
    ["api-gateway", "order-engine", "data_flow", 40, "mTLS"],
    ["api-gateway", "market-data", "data_flow", 40, "mTLS"],
    ["order-engine", "settlement-bus", "event_stream", 10, "mTLS"],
    ["order-engine", "market-data", "data_feed", 40, "internal"],
    ["market-data", "settlement-bus", "trade_feed", 10, "mTLS"],
  ];
  for (const [src, tgt, type, bw, enc] of edges) {
    db.prepare("INSERT INTO network_topology VALUES (?,?,?,?,?,?)").run(
      `${src}->${tgt}`, src, tgt, type, bw, enc
    );
  }

  // sla_targets
  db.exec(`CREATE TABLE sla_targets (
    zone_id TEXT PRIMARY KEY, max_latency_ms REAL, max_error_rate REAL,
    min_throughput_rps REAL, max_connection_queue INTEGER,
    current_status TEXT, last_measured_at TEXT
  )`);
  const slas = {
    "edge-ingress": [50, 0.001, 50000, 10000],
    "api-gateway": [100, 0.005, 30000, 5000],
    "order-engine": [5, 0.0001, 100000, 2000],
    "market-data": [10, 0.01, 200000, null],
    "settlement-bus": [500, 0.001, 5000, 10000],
  };
  for (const [id, [lat, err, thr, queue]] of Object.entries(slas)) {
    const chainPos = SCENARIO.impactChain.indexOf(id);
    const isDiversion = SCENARIO.diversions.includes(id);
    let slaStatus;
    if (chainPos === 0) slaStatus = "BREACHED";
    else if (chainPos === 1) slaStatus = "WARNING";
    else if (chainPos >= 2) slaStatus = "OK";
    else if (isDiversion) slaStatus = "WARNING";
    else slaStatus = "OK";

    db.prepare("INSERT INTO sla_targets VALUES (?,?,?,?,?,?,?)").run(
      id, lat, err, thr, queue, slaStatus,
      new Date(BASE_TIME - 2 * 60 * 1000).toISOString()
    );
  }

  // traffic_history (hourly, last 12h)
  db.exec(`CREATE TABLE traffic_history (
    ts TEXT, zone_id TEXT,
    inbound_rps REAL, outbound_rps REAL,
    error_rate REAL, latency_p99_ms REAL,
    bandwidth_utilization_pct REAL, dropped_connections INTEGER,
    PRIMARY KEY (ts, zone_id)
  )`);
  for (let hoursAgo = 12; hoursAgo >= 0; hoursAgo--) {
    const ts = new Date(BASE_TIME - hoursAgo * 3600 * 1000).toISOString();
    const isAttackActive = hoursAgo <= 4;
    for (const id of ALL_ZONES) {
      const inChain = SCENARIO.impactChain.includes(id);
      const isTarget = SCENARIO.impactChain[0] === id;
      const isDiversion = SCENARIO.diversions.includes(id);
      const affected = isAttackActive && inChain;
      const divActive = isAttackActive && isDiversion;

      db.prepare("INSERT INTO traffic_history VALUES (?,?,?,?,?,?,?,?)").run(
        ts, id,
        affected ? (isTarget ? randInt(100000, 900000, r2) : randInt(10000, 50000, r2)) : (divActive ? randInt(5000, 15000, r2) : randInt(1000, 5000, r2)),
        affected ? randInt(500, 5000, r2) : randInt(1000, 5000, r2),
        affected ? (isTarget ? 0.2 + r2() * 0.6 : 0.05 + r2() * 0.2) : (divActive ? 0.02 + r2() * 0.05 : r2() * 0.002),
        affected ? (isTarget ? randInt(5000, 30000, r2) : randInt(1000, 8000, r2)) : (divActive ? randInt(200, 2000, r2) : randInt(10, 200, r2)),
        affected ? (isTarget ? 85 + r2() * 15 : 40 + r2() * 30) : (divActive ? 30 + r2() * 20 : 10 + r2() * 20),
        affected ? randInt(1000, 50000, r2) : (divActive ? randInt(10, 200, r2) : randInt(0, 5, r2))
      );
    }
  }

  // incident_history
  db.exec(`CREATE TABLE incident_history (
    incident_id TEXT PRIMARY KEY, started_at TEXT, resolved_at TEXT,
    attack_type TEXT, target_zone TEXT, severity TEXT,
    resolution TEXT, peak_traffic_gbps REAL
  )`);
  db.prepare("INSERT INTO incident_history VALUES (?,?,?,?,?,?,?,?)").run(
    `SEC-${randInt(1000, 9999, r2)}`,
    new Date(BASE_TIME - 30 * 24 * 3600 * 1000).toISOString(),
    new Date(BASE_TIME - 30 * 24 * 3600 * 1000 + 3 * 3600 * 1000).toISOString(),
    "http_flood", "api-gateway", "P2",
    "Deployed WAF rules and rate limiting. Attack subsided after 3 hours.", 12
  );
  db.prepare("INSERT INTO incident_history VALUES (?,?,?,?,?,?,?,?)").run(
    `SEC-${randInt(1000, 9999, r2)}`,
    new Date(BASE_TIME - 90 * 24 * 3600 * 1000).toISOString(),
    new Date(BASE_TIME - 90 * 24 * 3600 * 1000 + 5 * 3600 * 1000).toISOString(),
    "syn_flood", "edge-ingress", "P1",
    "Enabled SYN cookies and upstream scrubbing. Added permanent rules.", 28
  );

  // firewall_rules
  db.exec(`CREATE TABLE firewall_rules (
    rule_id TEXT PRIMARY KEY, zone TEXT, action TEXT,
    protocol TEXT, port TEXT, source TEXT,
    limit_rps INTEGER, status TEXT, description TEXT
  )`);
  const rules = [
    ["fw-001", "edge-ingress", "allow", "tcp", "443", "0.0.0.0/0", null, "active", "Allow HTTPS from any source"],
    ["fw-002", "edge-ingress", "rate_limit", "tcp", "443", "0.0.0.0/0", 1000, "active", "Rate limit per-IP HTTPS"],
    ["fw-003", "edge-ingress", "block", "udp", "1-1023", "0.0.0.0/0", null, "inactive", "Block low-port UDP (disabled for DNS)"],
    ["fw-004", "api-gateway", "allow", "tcp", "8080", "edge-ingress-subnet", null, "active", "Allow from edge only"],
    ["fw-005", "api-gateway", "rate_limit", "tcp", "8080", "edge-ingress-subnet", 5000, "active", "Rate limit edge to gateway"],
    ["fw-006", "order-engine", "allow", "tcp", "8081", "api-gateway-subnet", null, "active", "Allow from gateway only"],
    ["fw-007", "market-data", "allow", "tcp", "8082-8083", "api-gateway-subnet", null, "active", "Allow WS and FIX from gateway"],
    ["fw-008", "settlement-bus", "allow", "tcp", "9092", "internal-subnet", null, "active", "Allow Kafka from internal"],
  ];
  for (const [id, zone, action, proto, port, src, limit, status, desc] of rules) {
    db.prepare("INSERT INTO firewall_rules VALUES (?,?,?,?,?,?,?,?,?)").run(id, zone, action, proto, port, src, limit, status, desc);
  }

  // api_keys
  db.exec(`CREATE TABLE api_keys (
    key_prefix TEXT PRIMARY KEY, tier TEXT, rate_limit_rps INTEGER,
    status TEXT, account_type TEXT, total_keys INTEGER
  )`);
  const keys = [
    ["retail_", "standard", 100, "active", "retail", 2400],
    ["inst_", "institutional", 5000, "active", "institutional", 340],
    ["hft_firm_", "hft", 50000, SCENARIO.id === "order_injection_dos" ? "compromised" : "active", "hft", 12],
    ["mm_", "market_maker", 30000, "active", "market_maker", 8],
    ["svc_", "service", 10000, SCENARIO.id === "settlement_kafka_flood" ? "compromised" : "active", "internal_service", 24],
  ];
  for (const [prefix, tier, limit, status, type, count] of keys) {
    db.prepare("INSERT INTO api_keys VALUES (?,?,?,?,?,?)").run(prefix, tier, limit, status, type, count);
  }
}

buildDatabase();

// -- Table metadata --

const TABLE_DESCRIPTIONS = {
  zone_config: "Current configuration for all 5 AEGIS network zones including status and instance counts",
  network_topology: "Network connectivity and data flow relationships between zones",
  sla_targets: "SLA thresholds for each zone and current breach status",
  traffic_history: "Hourly traffic snapshots for the last 12 hours (inbound/outbound rates, errors, latency)",
  incident_history: "Historical security incident records for pattern matching",
  firewall_rules: "Active and inactive firewall rules per zone",
  api_keys: "API key tier configuration, rate limits, and compromise status",
};

// -- Tools --

const TOOLS = [
  {
    name: "query",
    description: "Execute a read-only SQL SELECT query against the AEGIS firewall database",
    inputSchema: {
      type: "object",
      required: ["sql"],
      properties: {
        sql: { type: "string", description: "SQL SELECT query (read-only)" },
      },
    },
  },
  {
    name: "schema",
    description: "Get the CREATE TABLE statement for a specific table",
    inputSchema: {
      type: "object",
      required: ["table_name"],
      properties: {
        table_name: { type: "string" },
      },
    },
  },
  {
    name: "list_tables",
    description: "List all tables with descriptions",
    inputSchema: { type: "object", properties: {} },
  },
];

function handleTool(name, args) {
  if (name === "list_tables") {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
    return {
      tables: tables.map((t) => ({
        name: t.name,
        description: TABLE_DESCRIPTIONS[t.name] ?? "Configuration table",
        columns: db.prepare(`PRAGMA table_info(${t.name})`).all().map((c) => c.name),
      })),
    };
  }

  if (name === "schema") {
    const { table_name } = args;
    const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(table_name);
    if (!row) return { error: `Table "${table_name}" not found.` };
    const cols = db.prepare(`PRAGMA table_info(${table_name})`).all();
    return {
      table: table_name,
      create_statement: row.sql,
      columns: cols,
      row_count: db.prepare(`SELECT COUNT(*) as n FROM ${table_name}`).get()?.n ?? 0,
      description: TABLE_DESCRIPTIONS[table_name],
    };
  }

  if (name === "query") {
    const { sql } = args;
    const sqlUp = sql.toUpperCase().trim();
    if (sqlUp.match(/^\s*(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|REPLACE)/)) {
      return { error: "Only SELECT queries are allowed." };
    }
    try {
      const rows = db.prepare(sql).all();
      return { rows, count: rows.length };
    } catch (err) {
      return { error: `SQL error: ${err.message}` };
    }
  }

  return { error: `Unknown tool: ${name}` };
}

// -- REST Server --

const app = express();
app.use(express.json());

app.get("/tools", (req, res) => res.json({ tools: TOOLS }));
app.post("/tools/query", (req, res) => res.json(handleTool("query", req.body)));
app.post("/tools/schema", (req, res) => res.json(handleTool("schema", req.body)));
app.post("/tools/list_tables", (req, res) => res.json(handleTool("list_tables", req.body)));
app.get("/health", (req, res) => res.json({ status: "ok", tool: "firewall-db" }));

const PORT = parseInt(process.env.PORT ?? "3000", 10);
app.listen(PORT, () => console.log(`Firewall DB on :${PORT} (seed=${SEED})`));

const MATCH_TTL_SECS = parseInt(process.env.MATCH_TTL_SECS ?? "0", 10);
if (MATCH_TTL_SECS > 0) {
  setTimeout(() => process.exit(0), MATCH_TTL_SECS * 1000).unref();
}
