/**
 * LIGHTHOUSE Operations Database Server
 *
 * REST API providing read-only SQL access to the LIGHTHOUSE operations
 * database. The database is populated deterministically from SEED, containing
 * system configuration, performance history, incident history, and more.
 *
 * Endpoints:
 *   GET  /tools             — List available tools
 *   POST /tools/query       — Execute read-only SQL
 *   POST /tools/schema      — Get CREATE TABLE statement for a table
 *   POST /tools/list_tables — List all tables with descriptions
 */

import Database from "better-sqlite3";
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

const SEED = parseInt(process.env.SEED ?? "42", 10);
const r = rng(SEED);

const SCENARIOS = [
  {
    id: "archive_disk_quota",
    failureChain: ["archive", "results-store", "query-gateway"],
    redHerrings: ["preprocessing", "analysis"],
  },
  {
    id: "analysis_memory_leak",
    failureChain: ["analysis", "preprocessing", "ingestion"],
    redHerrings: ["results-store", "archive"],
  },
  {
    id: "preprocessing_config_drift",
    failureChain: ["preprocessing", "analysis", "results-store"],
    redHerrings: ["archive", "ingestion"],
  },
  {
    id: "results_store_index_corruption",
    failureChain: ["results-store", "archive", "query-gateway"],
    redHerrings: ["ingestion", "preprocessing"],
  },
  {
    id: "ingestion_cert_expiry",
    failureChain: ["ingestion", "preprocessing", "analysis", "results-store"],
    redHerrings: ["query-gateway", "archive"],
  },
];

const scenarioIdx = Math.floor(r() * SCENARIOS.length);
const SCENARIO = SCENARIOS[scenarioIdx];

const BASE_TIME = new Date("2026-03-04T00:00:00Z").getTime();
const ALL_SUBSYSTEMS = ["ingestion", "preprocessing", "analysis", "results-store", "archive", "query-gateway"];

function randInt(min, max, rf) { return min + Math.floor(rf() * (max - min + 1)); }

// ── Database Setup ────────────────────────────────────────────────────

const db = new Database(":memory:");

function buildDatabase() {
  const r2 = rng(SEED + 100);

  // subsystem_config — graduated status: root=degraded, pos1=strained, pos2+=operational, redHerring=strained
  db.exec(`CREATE TABLE subsystem_config (
    subsystem_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    version TEXT,
    last_deployed TEXT,
    config_hash TEXT,
    expected_config_hash TEXT,
    worker_count INTEGER,
    memory_limit_mb INTEGER,
    status TEXT,
    oom_events_24h INTEGER DEFAULT 0,
    last_oom_at TEXT,
    config_drift_detected INTEGER DEFAULT 0,
    validation_config_hash TEXT,
    cert_status TEXT DEFAULT 'VALID'
  )`);

  const subsystemNames = {
    ingestion: "Data Ingestion Layer",
    preprocessing: "Preprocessing Service",
    analysis: "Analysis Engine",
    "results-store": "Results Database",
    archive: "Archive Service",
    "query-gateway": "Query Gateway",
  };
  const subsystemDescs = {
    ingestion: "Receives raw telescope observation data from 47 remote data sources via authenticated REST API",
    preprocessing: "Validates, normalizes, and filters observation data using configurable validation rule sets",
    analysis: "Runs multi-stage computational analysis and spectral feature extraction across 4 worker processes",
    "results-store": "PostgreSQL-backed persistent store with temporal B-tree indexing",
    archive: "Long-term compressed storage using Zstandard compression on a 2TB volume",
    "query-gateway": "External-facing GraphQL/REST API with 1-hour response cache",
  };

  for (const id of ALL_SUBSYSTEMS) {
    const chainPos = SCENARIO.failureChain.indexOf(id);
    const isRedHerring = SCENARIO.redHerrings.includes(id);
    const configHash = Math.floor(r2() * 0xffffffff).toString(16).padStart(8, "0");

    // Graduated status
    let status;
    if (chainPos === 0) status = "degraded";
    else if (chainPos === 1) status = "strained";
    else if (chainPos >= 2) status = "operational";
    else if (isRedHerring) status = "strained";
    else status = "healthy";

    const row = {
      subsystem_id: id,
      name: subsystemNames[id],
      description: subsystemDescs[id],
      version: `${randInt(2, 4, r2)}.${randInt(0, 9, r2)}.${randInt(0, 15, r2)}`,
      last_deployed: new Date(BASE_TIME - randInt(1, 30, r2) * 24 * 3600 * 1000).toISOString().split("T")[0],
      config_hash: configHash,
      expected_config_hash: configHash,
      worker_count: id === "analysis" ? 4 : id === "preprocessing" ? 2 : 1,
      memory_limit_mb: id === "analysis" ? 8192 : 2048,
      status,
      oom_events_24h: 0,
      last_oom_at: null,
      config_drift_detected: 0,
      validation_config_hash: null,
      cert_status: "VALID",
    };

    // Scenario-specific overrides
    if (SCENARIO.id === "preprocessing_config_drift" && id === "preprocessing") {
      row.config_hash = "3f7a2b91c";
      row.expected_config_hash = "b91c43f7a";
      row.config_drift_detected = 1;
      row.validation_config_hash = "3f7a2b91c";
    }
    if (SCENARIO.id === "analysis_memory_leak" && id === "analysis") {
      row.oom_events_24h = 5;
      row.last_oom_at = new Date(BASE_TIME - 90 * 60 * 1000).toISOString();
    }
    if (SCENARIO.id === "ingestion_cert_expiry" && id === "ingestion") {
      row.cert_status = "EXPIRED";
    }

    db.prepare(`INSERT INTO subsystem_config VALUES (
      :subsystem_id,:name,:description,:version,:last_deployed,:config_hash,:expected_config_hash,
      :worker_count,:memory_limit_mb,:status,:oom_events_24h,:last_oom_at,:config_drift_detected,
      :validation_config_hash,:cert_status
    )`).run(row);
  }

  // dependency_graph
  db.exec(`CREATE TABLE dependency_graph (
    id TEXT PRIMARY KEY, dependent TEXT, dependency TEXT,
    dependency_type TEXT, backpressure_enabled INTEGER, timeout_secs INTEGER
  )`);
  const deps = [
    ["ingestion", "preprocessing", "hard_dependency", 1, 30],
    ["preprocessing", "analysis", "hard_dependency", 1, 30],
    ["analysis", "results-store", "hard_dependency", 0, 60],
    ["results-store", "archive", "async_sync", 1, 30],
    ["results-store", "query-gateway", "read_dependency", 0, 10],
    ["archive", "query-gateway", "read_dependency", 0, 10],
  ];
  for (const [dep, dependency, type, bp, timeout] of deps) {
    db.prepare("INSERT INTO dependency_graph VALUES (?,?,?,?,?,?)").run(
      `${dep}->${dependency}`, dep, dependency, type, bp, timeout
    );
  }

  // sla_targets — graduated: root=BREACHED, pos1=WARNING, pos2+=OK, redHerring=WARNING
  db.exec(`CREATE TABLE sla_targets (
    subsystem_id TEXT PRIMARY KEY, max_latency_ms INTEGER, max_error_rate REAL,
    max_disk_usage_pct REAL, max_write_queue_depth INTEGER, min_throughput_pct REAL,
    current_status TEXT, last_measured_at TEXT
  )`);
  const slas = {
    ingestion: [200, 0.001, null, null, 0.95],
    preprocessing: [500, 0.005, null, null, 0.90],
    analysis: [2000, 0.01, null, null, 0.85],
    "results-store": [50, 0.001, null, 1000, 0.95],
    archive: [5000, 0.001, 85.0, null, 0.80],
    "query-gateway": [1000, 0.005, null, null, 0.999],
  };
  for (const [id, [latency, errRate, diskPct, queueDepth, throughput]] of Object.entries(slas)) {
    const chainPos = SCENARIO.failureChain.indexOf(id);
    const isRedHerring = SCENARIO.redHerrings.includes(id);

    let slaStatus;
    if (chainPos === 0) slaStatus = "BREACHED";
    else if (chainPos === 1) slaStatus = "WARNING";
    else if (chainPos >= 2) slaStatus = "OK";
    else if (isRedHerring) slaStatus = "WARNING";
    else slaStatus = "OK";

    db.prepare("INSERT INTO sla_targets VALUES (?,?,?,?,?,?,?,?)").run(
      id, latency, errRate, diskPct, queueDepth, throughput,
      slaStatus,
      new Date(BASE_TIME - 5 * 60 * 1000).toISOString()
    );
  }

  // performance_history (hourly snapshots, last 12h)
  db.exec(`CREATE TABLE performance_history (
    ts TEXT, subsystem_id TEXT, latency_p50_ms REAL, latency_p99_ms REAL,
    error_rate REAL, throughput_pct REAL, memory_usage_pct REAL, active_workers INTEGER,
    queue_depth INTEGER, disk_usage_pct REAL, write_success_rate REAL,
    validation_pass_rate REAL, data_quality_score REAL, range_query_result_ratio REAL,
    index_checksum_valid INTEGER, observation_rate_per_sec REAL, active_connections INTEGER,
    PRIMARY KEY (ts, subsystem_id)
  )`);
  for (let hoursAgo = 12; hoursAgo >= 0; hoursAgo--) {
    const ts = new Date(BASE_TIME - hoursAgo * 3600 * 1000).toISOString();
    const isAffected = hoursAgo <= 6;
    for (const id of ALL_SUBSYSTEMS) {
      const chainPos = SCENARIO.failureChain.indexOf(id);
      const inChain = chainPos >= 0;
      const degraded = isAffected && inChain;
      const isRoot = chainPos === 0;
      const isRedHerring = SCENARIO.redHerrings.includes(id);

      // Red herrings get moderately elevated metrics when affected
      const redHerringElevated = isAffected && isRedHerring;

      const row = {
        ts, subsystem_id: id,
        latency_p50_ms: degraded ? randInt(1000, 5000, r2) : (redHerringElevated ? randInt(400, 1200, r2) : randInt(50, 300, r2)),
        latency_p99_ms: degraded ? randInt(8000, 30000, r2) : (redHerringElevated ? randInt(1500, 4000, r2) : randInt(200, 1000, r2)),
        error_rate: degraded ? (isRoot ? 0.4 + r2() * 0.5 : 0.1 + r2() * 0.3) : (redHerringElevated ? 0.03 + r2() * 0.08 : r2() * 0.002),
        throughput_pct: degraded ? (isRoot ? r2() * 0.2 : 0.2 + r2() * 0.4) : (redHerringElevated ? 0.55 + r2() * 0.25 : 0.85 + r2() * 0.15),
        memory_usage_pct: null, active_workers: null, queue_depth: null,
        disk_usage_pct: null, write_success_rate: null, validation_pass_rate: null,
        data_quality_score: null, range_query_result_ratio: null, index_checksum_valid: null,
        observation_rate_per_sec: null, active_connections: null,
      };
      // Scenario-specific columns
      if (SCENARIO.id === "archive_disk_quota" && id === "archive") {
        row.disk_usage_pct = isAffected ? Math.min(97.8, 72 + (12 - hoursAgo) * 2.2) : 72 + (12 - hoursAgo) * 0.5;
        row.write_success_rate = isAffected ? r2() * 0.2 : 0.98 + r2() * 0.02;
      }
      if (SCENARIO.id === "analysis_memory_leak" && id === "analysis") {
        row.memory_usage_pct = isAffected ? 95 + r2() * 5 : 60 + r2() * 20;
        row.active_workers = isAffected && hoursAgo <= 4 ? 0 : 4;
        row.queue_depth = isAffected ? randInt(20000, 73000, r2) : randInt(0, 500, r2);
      }
      if (SCENARIO.id === "preprocessing_config_drift" && id === "preprocessing") {
        row.validation_pass_rate = isAffected ? 0.999 : 0.87 + r2() * 0.05;
      }
      if (SCENARIO.id === "preprocessing_config_drift" && id === "analysis") {
        row.data_quality_score = isAffected ? 0.35 + r2() * 0.15 : 0.88 + r2() * 0.10;
      }
      if (SCENARIO.id === "results_store_index_corruption" && id === "results-store") {
        row.range_query_result_ratio = isAffected ? 0.70 + r2() * 0.15 : 1.0;
        row.index_checksum_valid = isAffected ? 0 : 1;
      }
      if (SCENARIO.id === "ingestion_cert_expiry" && id === "ingestion") {
        row.observation_rate_per_sec = isAffected ? 0 : 900 + r2() * 100;
        row.active_connections = isAffected ? 0 : 47;
      }
      db.prepare(`INSERT INTO performance_history VALUES (
        :ts,:subsystem_id,:latency_p50_ms,:latency_p99_ms,:error_rate,:throughput_pct,
        :memory_usage_pct,:active_workers,:queue_depth,:disk_usage_pct,:write_success_rate,
        :validation_pass_rate,:data_quality_score,:range_query_result_ratio,:index_checksum_valid,
        :observation_rate_per_sec,:active_connections
      )`).run(row);
    }
  }

  // incident_history — includes red herring past incidents
  db.exec(`CREATE TABLE incident_history (
    incident_id TEXT PRIMARY KEY, started_at TEXT, resolved_at TEXT,
    root_cause TEXT, affected_subsystems TEXT, severity TEXT,
    resolution TEXT, notes TEXT
  )`);
  const pastIncidents = [
    {
      incident_id: `INC-${randInt(1000, 9999, r2)}`,
      started_at: new Date(BASE_TIME - 15 * 24 * 3600 * 1000).toISOString(),
      resolved_at: new Date(BASE_TIME - 15 * 24 * 3600 * 1000 + 2 * 3600 * 1000).toISOString(),
      root_cause: "query_gateway_cache_misconfiguration",
      affected_subsystems: JSON.stringify(["query-gateway"]),
      severity: "P2",
      resolution: "Rolled back cache config to previous version",
      notes: null,
    },
    {
      incident_id: `INC-${randInt(1000, 9999, r2)}`,
      started_at: new Date(BASE_TIME - 45 * 24 * 3600 * 1000).toISOString(),
      resolved_at: new Date(BASE_TIME - 45 * 24 * 3600 * 1000 + 4 * 3600 * 1000).toISOString(),
      root_cause: "preprocessing_worker_crash",
      affected_subsystems: JSON.stringify(["preprocessing", "analysis"]),
      severity: "P1",
      resolution: "Restarted preprocessing workers, drained backlog",
      notes: null,
    },
  ];
  // Add a past version of the current root cause type for pattern matching
  if (SCENARIO.id === "archive_disk_quota") {
    pastIncidents.push({
      incident_id: `INC-${randInt(1000, 9999, r2)}`,
      started_at: new Date(BASE_TIME - 90 * 24 * 3600 * 1000).toISOString(),
      resolved_at: new Date(BASE_TIME - 90 * 24 * 3600 * 1000 + 1 * 3600 * 1000).toISOString(),
      root_cause: "archive_disk_quota",
      affected_subsystems: JSON.stringify(["archive"]),
      severity: "P2",
      resolution: "Quota extended by 200GB. Cascade was contained before hitting results-store.",
      notes: "Quota was extended but not automated. Monthly growth rate not re-evaluated. RISK: will recur.",
    });
  }
  // Red herring past incidents — add plausible history for red herring subsystems
  for (const rhId of SCENARIO.redHerrings) {
    pastIncidents.push({
      incident_id: `INC-${randInt(1000, 9999, r2)}`,
      started_at: new Date(BASE_TIME - randInt(20, 60, r2) * 24 * 3600 * 1000).toISOString(),
      resolved_at: new Date(BASE_TIME - randInt(20, 60, r2) * 24 * 3600 * 1000 + randInt(1, 3, r2) * 3600 * 1000).toISOString(),
      root_cause: `${rhId.replace("-", "_")}_performance_degradation`,
      affected_subsystems: JSON.stringify([rhId]),
      severity: "P3",
      resolution: `Performance issue in ${rhId} resolved after investigation.`,
      notes: null,
    });
  }
  for (const row of pastIncidents) {
    db.prepare("INSERT INTO incident_history VALUES (:incident_id,:started_at,:resolved_at,:root_cause,:affected_subsystems,:severity,:resolution,:notes)").run(row);
  }

  // certificate_registry
  db.exec(`CREATE TABLE certificate_registry (
    service TEXT PRIMARY KEY, domain TEXT, expiry_date TEXT,
    issuer TEXT, last_rotated TEXT, status TEXT, auto_rotation INTEGER,
    rotation_reminder_sent INTEGER
  )`);
  db.prepare("INSERT INTO certificate_registry VALUES (?,?,?,?,?,?,?,?)").run(
    "ingestion.api", "ingest.lighthouse.internal",
    SCENARIO.id === "ingestion_cert_expiry" ? "2026-02-26" : new Date(BASE_TIME + 350 * 24 * 3600 * 1000).toISOString().split("T")[0],
    "LIGHTHOUSE Internal CA",
    SCENARIO.id === "ingestion_cert_expiry" ? "2025-02-26" : new Date(BASE_TIME - 15 * 24 * 3600 * 1000).toISOString().split("T")[0],
    SCENARIO.id === "ingestion_cert_expiry" ? "EXPIRED" : "VALID",
    0,
    SCENARIO.id === "ingestion_cert_expiry" ? 0 : 1
  );
  db.prepare("INSERT INTO certificate_registry VALUES (?,?,?,?,?,?,?,?)").run(
    "archive.internal", "archive.lighthouse.internal",
    new Date(BASE_TIME + 180 * 24 * 3600 * 1000).toISOString().split("T")[0],
    "LIGHTHOUSE Internal CA",
    new Date(BASE_TIME - 180 * 24 * 3600 * 1000).toISOString().split("T")[0],
    "VALID", 0, 1
  );

  // disk_usage_history
  db.exec(`CREATE TABLE disk_usage_history (
    ts TEXT, subsystem_id TEXT, disk_usage_pct REAL, used_gb REAL,
    quota_gb REAL, write_rate_mb_per_sec REAL,
    PRIMARY KEY (ts, subsystem_id)
  )`);
  for (let hoursAgo = 24; hoursAgo >= 0; hoursAgo--) {
    const ts = new Date(BASE_TIME - hoursAgo * 3600 * 1000).toISOString();
    let pct;
    if (SCENARIO.id === "archive_disk_quota") {
      pct = Math.min(97.8, 72 + (24 - hoursAgo) * 1.1);
    } else {
      pct = 58 + r2() * 12;
    }
    db.prepare("INSERT INTO disk_usage_history VALUES (?,?,?,?,?,?)").run(
      ts, "archive",
      parseFloat(pct.toFixed(1)),
      parseFloat((pct * 20).toFixed(1)),
      2000,
      SCENARIO.id === "archive_disk_quota" && hoursAgo <= 6 ? r2() * 2 : 120 + r2() * 40
    );
  }
}

buildDatabase();

// ── Table metadata ────────────────────────────────────────────────────

const TABLE_DESCRIPTIONS = {
  subsystem_config: "Current configuration for all 6 LIGHTHOUSE subsystems including version, status, and config hashes",
  dependency_graph: "Service dependency relationships and backpressure configuration between subsystems",
  sla_targets: "SLA thresholds for each subsystem and current breach status",
  performance_history: "Hourly performance snapshots for the last 12 hours (latency, error rates, throughput)",
  incident_history: "Historical incident records for pattern matching",
  certificate_registry: "TLS certificate status for all internal services",
  disk_usage_history: "Hourly disk usage snapshots for archive subsystem (last 24 hours)",
};

// ── Tools ─────────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "query",
    description: "Execute a read-only SQL SELECT query against the LIGHTHOUSE operations database",
    inputSchema: {
      type: "object",
      required: ["sql"],
      properties: {
        sql: { type: "string", description: "SQL SELECT query (read-only; no INSERT/UPDATE/DELETE/DROP)" },
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
        table_name: { type: "string", description: "Table name (use list_tables to see available tables)" },
      },
    },
  },
  {
    name: "list_tables",
    description: "List all tables in the operations database with descriptions",
    inputSchema: { type: "object", properties: {} },
  },
];

function handleTool(name, args) {
  if (name === "list_tables") {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
    return {
      tables: tables.map((t) => ({
        name: t.name,
        description: TABLE_DESCRIPTIONS[t.name] ?? "Operations data table",
        columns: db.prepare(`PRAGMA table_info(${t.name})`).all().map((c) => c.name),
      })),
    };
  }

  if (name === "schema") {
    const { table_name } = args;
    const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(table_name);
    if (!row) return { error: `Table "${table_name}" not found. Use list_tables to see available tables.` };
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
      return { error: "Only SELECT queries are allowed. This is a read-only database." };
    }
    try {
      const rows = db.prepare(sql).all();
      return {
        rows,
        count: rows.length,
        note: rows.length === 0 ? "Query returned no rows." : undefined,
      };
    } catch (err) {
      return { error: `SQL error: ${err.message}` };
    }
  }

  return { error: `Unknown tool: ${name}` };
}

// ── REST Server Setup ─────────────────────────────────────────────────

const app = express();
app.use(express.json());

// REST endpoints
app.get("/tools", (req, res) => res.json({ tools: TOOLS }));

app.post("/tools/query", (req, res) => {
  const result = handleTool("query", req.body);
  res.json(result);
});

app.post("/tools/schema", (req, res) => {
  const result = handleTool("schema", req.body);
  res.json(result);
});

app.post("/tools/list_tables", (req, res) => {
  const result = handleTool("list_tables", req.body);
  res.json(result);
});

app.get("/health", (req, res) => res.json({ status: "ok", tool: "ops-db" }));

const PORT = parseInt(process.env.PORT ?? "3000", 10);
app.listen(PORT, () => console.log(`Ops DB server on :${PORT} (seed=${SEED})`));

// Self-terminate when the match TTL expires to avoid orphaned containers
const MATCH_TTL_SECS = parseInt(process.env.MATCH_TTL_SECS ?? "0", 10);
if (MATCH_TTL_SECS > 0) {
  console.log(`[TTL] Will self-terminate in ${MATCH_TTL_SECS}s`);
  setTimeout(() => {
    console.log("[TTL] Match TTL expired — shutting down");
    process.exit(0);
  }, MATCH_TTL_SECS * 1000).unref();
}
