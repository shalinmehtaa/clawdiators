/**
 * PIPELINE BREACH — Artifact Database Server
 *
 * REST server providing SQL query access to build artifact and dependency data.
 * Generates seeded tables matching the data.ts generator.
 *
 * Endpoints:
 *   POST /tools/list_tables  — List available tables
 *   POST /tools/schema       — Show table schema
 *   POST /tools/query        — Execute read-only SQL queries
 *   GET  /tools              — List available tools
 */

import express from "express";

const app = express();
app.use(express.json());

const SEED = parseInt(process.env.SEED || "42", 10);
const PORT = parseInt(process.env.PORT || "3000", 10);

// ── Seeded PRNG ────────────────────────────────────────────────────────
function rng(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(arr, r) { return arr[Math.floor(r() * arr.length)]; }
function randInt(min, max, r) { return min + Math.floor(r() * (max - min + 1)); }
function randHex(len, r) { let o = ""; for (let i = 0; i < len; i++) o += Math.floor(r() * 16).toString(16); return o; }

// ── Build seeded data tables ──────────────────────────────────────────
const SCENARIOS = [
  { id: "npm_typosquat", affected: ["api-gateway", "notification-service"], transitive: ["auth-service"], pkg: "lodash-utils", ver: "4.17.22", lang: "typescript", attackDest: "c2.lodash-utils.io" },
  { id: "pypi_backdoor", affected: ["user-service", "payment-service"], transitive: ["api-gateway"], pkg: "cryptography", ver: "41.0.8", lang: "python", attackDest: "unknown-ca.attacker.io" },
  { id: "github_action_inject", affected: ["deploy-controller", "search-service"], transitive: ["api-gateway", "user-service"], pkg: "actions/checkout", ver: "v4.2.0-rc1", lang: "yaml", attackDest: "exfil.actions-cache.dev" },
  { id: "maven_repo_poison", affected: ["search-service"], transitive: ["api-gateway", "analytics-service"], pkg: "jackson-databind", ver: "2.16.1-patch1", lang: "java", attackDest: "exploit.jackson-mirror.net" },
];

const r = rng(SEED);
const scenarioIdx = Math.floor(r() * SCENARIOS.length);
const scenario = SCENARIOS[scenarioIdx];
const BASE_TIME = new Date("2026-03-04T00:00:00Z").getTime();

const SERVICES = [
  { id: "api-gateway", lang: "typescript", deps: ["express@4.18.2", "helmet@7.1.0", "cors@2.8.5", "jsonwebtoken@9.0.2", "winston@3.11.0"] },
  { id: "auth-service", lang: "typescript", deps: ["bcryptjs@2.4.3", "jsonwebtoken@9.0.2", "redis@4.6.10", "zod@3.22.4"] },
  { id: "user-service", lang: "python", deps: ["fastapi==0.104.1", "sqlalchemy==2.0.23", "pydantic==2.5.2", "cryptography==41.0.7"] },
  { id: "payment-service", lang: "python", deps: ["stripe==7.8.0", "fastapi==0.104.1", "cryptography==41.0.7", "celery==5.3.6"] },
  { id: "notification-service", lang: "typescript", deps: ["nodemailer@6.9.7", "twilio@4.19.0", "firebase-admin@11.11.1", "bull@4.12.0"] },
  { id: "analytics-service", lang: "python", deps: ["fastapi==0.104.1", "clickhouse-connect==0.6.23", "pandas==2.1.4", "pydantic==2.5.2"] },
  { id: "search-service", lang: "java", deps: ["spring-boot:3.2.0", "elasticsearch-rest-high-level-client:7.17.15", "jackson-databind:2.16.0", "slf4j-api:2.0.9"] },
  { id: "deploy-controller", lang: "go", deps: ["k8s.io/client-go@v0.28.4", "github.com/spf13/cobra@v1.8.0", "go.uber.org/zap@v1.26.0"] },
];

// ── Build in-memory tables ────────────────────────────────────────────
const tables = {};

// build_history
tables.build_history = [];
for (const svc of SERVICES) {
  for (let i = 0; i < 5; i++) {
    const localR = rng(SEED + svc.id.charCodeAt(0) + i * 31);
    const hoursAgo = randInt(1, 96, localR);
    const isCompromised = scenario.affected.includes(svc.id) && hoursAgo <= 72;
    tables.build_history.push({
      build_id: `build-${svc.id}-${randHex(6, localR)}`,
      service_id: svc.id,
      commit_sha: randHex(40, localR),
      branch: "main",
      triggered_by: pick(["push", "schedule", "manual"], localR),
      started_at: new Date(BASE_TIME - hoursAgo * 3600 * 1000).toISOString(),
      duration_secs: isCompromised ? randInt(200, 500, localR) : randInt(60, 150, localR),
      status: "success",
      deps_changed: isCompromised,
      security_scan_result: isCompromised ? "warnings" : "clean",
    });
  }
}

// dependency_manifest
tables.dependency_manifest = [];
for (const svc of SERVICES) {
  for (const dep of svc.deps) {
    const parts = dep.includes("==") ? dep.split("==") : dep.includes("@") ? dep.split("@") : dep.split(":");
    tables.dependency_manifest.push({
      service_id: svc.id,
      package_name: parts[0],
      version: parts[1] || "latest",
      language: svc.lang,
      lockfile_pinned: r() > 0.3,
    });
  }
  if (scenario.affected.includes(svc.id)) {
    tables.dependency_manifest.push({
      service_id: svc.id,
      package_name: scenario.pkg,
      version: scenario.ver,
      language: scenario.lang,
      lockfile_pinned: false,
      note: "recently_added",
    });
  }
}

// dependency_audit
tables.dependency_audit = [];
const seen = new Set();
for (const svc of SERVICES) {
  for (const dep of svc.deps) {
    const name = dep.includes("==") ? dep.split("==")[0] : dep.includes("@") ? dep.split("@")[0] : dep.split(":")[0];
    if (!seen.has(name)) {
      seen.add(name);
      tables.dependency_audit.push({ package_name: name, approved: true, risk_level: pick(["low", "medium"], r) });
    }
  }
}
if (scenario.id === "npm_typosquat") {
  tables.dependency_audit.push({ package_name: "lodash-utils", approved: false, risk_level: "unknown", note: "not_in_approved_list" });
}

// network_log
tables.network_log = [];
for (let i = 0; i < 20; i++) {
  tables.network_log.push({
    ts: new Date(BASE_TIME - randInt(1, 96, r) * 3600 * 1000).toISOString(),
    source_service: pick(SERVICES, r).id,
    destination: pick(["registry.npmjs.org", "pypi.org", "repo1.maven.org", "proxy.golang.org", "ghcr.io"], r),
    port: 443,
    protocol: "HTTPS",
    direction: "outbound",
    build_phase: true,
    flagged: false,
  });
}
for (const svc of scenario.affected) {
  tables.network_log.push({
    ts: new Date(BASE_TIME - randInt(2, 72, r) * 3600 * 1000).toISOString(),
    source_service: svc,
    destination: scenario.attackDest,
    port: scenario.id === "maven_repo_poison" ? 1389 : 443,
    protocol: scenario.id === "maven_repo_poison" ? "LDAP" : "HTTPS",
    direction: "outbound",
    build_phase: true,
    flagged: true,
  });
}

// ci_secrets_inventory
tables.ci_secrets_inventory = SERVICES.map((svc) => ({
  service_id: svc.id,
  secrets: svc.lang === "typescript" ? ["NPM_TOKEN", "GITHUB_TOKEN", "AWS_ACCESS_KEY_ID"] : svc.lang === "python" ? ["PYPI_TOKEN", "GITHUB_TOKEN", "DATABASE_URL"] : svc.lang === "java" ? ["MAVEN_TOKEN", "GITHUB_TOKEN", "SIGNING_KEY"] : ["GITHUB_TOKEN", "DEPLOY_KEY"],
  exposure_status: scenario.affected.includes(svc.id) ? "potentially_compromised" : "secure",
}));

// artifact_registry
tables.artifact_registry = [];
for (const svc of SERVICES) {
  const localR = rng(SEED + svc.id.charCodeAt(0) * 13);
  tables.artifact_registry.push({
    image_tag: `ghcr.io/org/${svc.id}:${randHex(8, localR)}`,
    service_id: svc.id,
    pushed_at: new Date(BASE_TIME - randInt(1, 48, localR) * 3600 * 1000).toISOString(),
    sha256: randHex(64, localR),
    vulnerability_scan: scenario.affected.includes(svc.id) ? "critical" : "clean",
  });
}

// pipeline_config
tables.pipeline_config = SERVICES.map((svc) => ({
  service_id: svc.id,
  ci_platform: "github-actions",
  action_pins: scenario.id === "github_action_inject" && (svc.id === "deploy-controller" || svc.id === "search-service") ? "mutable_tag" : "sha_pinned",
  security_scan_enabled: true,
  network_policy: pick(["allow_registry_only", "allow_all"], r),
}));

// ── Table schemas ─────────────────────────────────────────────────────
const SCHEMAS = {
  build_history: "build_id TEXT, service_id TEXT, commit_sha TEXT, branch TEXT, triggered_by TEXT, started_at TIMESTAMP, duration_secs INT, status TEXT, deps_changed BOOLEAN, security_scan_result TEXT",
  dependency_manifest: "service_id TEXT, package_name TEXT, version TEXT, language TEXT, lockfile_pinned BOOLEAN, note TEXT",
  dependency_audit: "package_name TEXT, approved BOOLEAN, risk_level TEXT, note TEXT",
  artifact_registry: "image_tag TEXT, service_id TEXT, pushed_at TIMESTAMP, sha256 TEXT, vulnerability_scan TEXT",
  network_log: "ts TIMESTAMP, source_service TEXT, destination TEXT, port INT, protocol TEXT, direction TEXT, build_phase BOOLEAN, flagged BOOLEAN",
  ci_secrets_inventory: "service_id TEXT, secrets TEXT[], exposure_status TEXT",
  pipeline_config: "service_id TEXT, ci_platform TEXT, action_pins TEXT, security_scan_enabled BOOLEAN, network_policy TEXT",
};

// ── Simple SQL engine ─────────────────────────────────────────────────
function simpleQuery(sql) {
  const lower = sql.toLowerCase().trim();

  // Reject write operations
  if (lower.startsWith("insert") || lower.startsWith("update") || lower.startsWith("delete") || lower.startsWith("drop") || lower.startsWith("create") || lower.startsWith("alter")) {
    return { error: "Read-only access. Only SELECT queries are allowed." };
  }

  // Parse SELECT ... FROM table [WHERE ...]
  const selectMatch = lower.match(/select\s+(.*?)\s+from\s+(\w+)(?:\s+where\s+(.*))?(?:\s+order\s+by\s+(.*))?(?:\s+limit\s+(\d+))?/);
  if (!selectMatch) return { error: "Could not parse SQL. Use: SELECT columns FROM table [WHERE conditions] [LIMIT n]" };

  const tableName = selectMatch[2];
  const whereClause = selectMatch[3];
  const limitStr = selectMatch[5];

  const table = tables[tableName];
  if (!table) return { error: `Unknown table: ${tableName}. Available: ${Object.keys(tables).join(", ")}` };

  let rows = [...table];

  // Simple WHERE filtering (supports =, LIKE, and IS NULL/NOT NULL)
  if (whereClause) {
    const conditions = whereClause.split(/\s+and\s+/);
    for (const cond of conditions) {
      const eqMatch = cond.match(/(\w+)\s*=\s*'?([^']*)'?/);
      const likeMatch = cond.match(/(\w+)\s+like\s+'%?([^%']+)%?'/);
      const notNullMatch = cond.match(/(\w+)\s+is\s+not\s+null/);
      const nullMatch = cond.match(/(\w+)\s+is\s+null/);
      const boolMatch = cond.match(/(\w+)\s*=\s*(true|false)/);

      if (boolMatch) {
        const [, col, val] = boolMatch;
        rows = rows.filter((row) => String(row[col]) === val);
      } else if (eqMatch) {
        const [, col, val] = eqMatch;
        rows = rows.filter((row) => String(row[col]).toLowerCase() === val.toLowerCase());
      } else if (likeMatch) {
        const [, col, pattern] = likeMatch;
        rows = rows.filter((row) => String(row[col] ?? "").toLowerCase().includes(pattern.toLowerCase()));
      } else if (notNullMatch) {
        const [, col] = notNullMatch;
        rows = rows.filter((row) => row[col] != null);
      } else if (nullMatch) {
        const [, col] = nullMatch;
        rows = rows.filter((row) => row[col] == null);
      }
    }
  }

  // Limit
  const limit = limitStr ? parseInt(limitStr, 10) : 50;
  rows = rows.slice(0, limit);

  return { rows, count: rows.length };
}

// ── Tool metadata ─────────────────────────────────────────────────────
const TOOLS = [
  { name: "list_tables", description: "List all available tables", parameters: {} },
  { name: "schema", description: "Show schema for a table", parameters: { table_name: "string (required)" } },
  { name: "query", description: "Execute read-only SQL query", parameters: { sql: "string (required)" } },
];

// Health endpoint
app.get("/health", (_req, res) => res.json({ ok: true }));

// List available tools
app.get("/tools", (_req, res) => res.json({ tools: TOOLS }));

// Individual tool endpoints
app.post("/tools/list_tables", (_req, res) => {
  const result = Object.entries(tables).map(([name, rows]) => ({ name, row_count: rows.length, description: SCHEMAS[name] }));
  res.json({ ok: true, data: result });
});

app.post("/tools/schema", (req, res) => {
  const { table_name } = req.body || {};
  const result = SCHEMAS[table_name] || `Unknown table: ${table_name}`;
  res.json({ ok: true, data: result });
});

app.post("/tools/query", (req, res) => {
  const { sql } = req.body || {};
  const result = simpleQuery(sql || "");
  res.json({ ok: true, data: result });
});

app.listen(PORT, () => {
  console.log(`Artifact DB server running on port ${PORT} with SEED=${SEED}`);
});
