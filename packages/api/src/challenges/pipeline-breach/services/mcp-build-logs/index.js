/**
 * PIPELINE BREACH — MCP Build Logs Server
 *
 * MCP server providing structured build log query tools.
 * Generates seeded build logs matching the data.ts generator.
 *
 * Tools:
 *   query_build_logs      — Filter logs by service, severity, step, pattern
 *   get_anomaly_timeline  — Chronological security anomaly events
 *   correlate_events      — Cross-service event correlation
 *   get_security_summary  — Per-service security finding counts
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

// ── Generate seeded log data ──────────────────────────────────────────
const SCENARIOS = [
  { id: "npm_typosquat", affected: ["api-gateway", "notification-service"], signals: ["POSTINSTALL_NETWORK_CALL", "ENV_EXFILTRATION_DETECTED", "REGISTRY_CHECKSUM_DRIFT", "BUILD_TIME_ANOMALY", "DNS_QUERY_SUSPICIOUS"] },
  { id: "pypi_backdoor", affected: ["user-service", "payment-service"], signals: ["WHEEL_HASH_MISMATCH", "SSL_CA_INJECTION", "COMPILE_FROM_SOURCE_UNEXPECTED", "BUILD_TIME_ANOMALY", "CERT_CHAIN_UNKNOWN_CA"] },
  { id: "github_action_inject", affected: ["deploy-controller", "search-service"], signals: ["ACTION_HASH_MISMATCH", "SECRET_IN_STEP_OUTPUT", "CHECKOUT_DURATION_ANOMALY", "OUTBOUND_POST_UNAUTHORIZED", "WORKFLOW_PIN_MISSING"] },
  { id: "maven_repo_poison", affected: ["search-service"], signals: ["JNDI_LOOKUP_DETECTED", "MAVEN_MIRROR_REDIRECT", "JAR_CHECKSUM_UNKNOWN", "BUILD_TIME_ANOMALY", "DESERIALIZATION_GADGET_CHAIN"] },
];

const r = rng(SEED);
const scenarioIdx = Math.floor(r() * SCENARIOS.length);
const scenario = SCENARIOS[scenarioIdx];

const BASE_TIME = new Date("2026-03-04T00:00:00Z").getTime();
const logs = [];

// Generate attack logs
for (const svc of scenario.affected) {
  const localR = rng(SEED + svc.charCodeAt(0));
  for (const signal of scenario.signals) {
    const hoursAgo = randInt(2, 72, localR);
    logs.push({
      ts: new Date(BASE_TIME - hoursAgo * 3600 * 1000).toISOString(),
      level: signal.includes("CRITICAL") || signal.includes("JNDI") || signal.includes("SECRET") ? "CRITICAL" : signal.includes("EXFILTRATION") || signal.includes("MISMATCH") || signal.includes("INJECTION") ? "ERROR" : "WARN",
      service: svc,
      pipeline: `build-${svc}-${randHex(6, localR)}`,
      step: signal.includes("CHECKOUT") || signal.includes("ACTION") ? "checkout" : signal.includes("BUILD_TIME") || signal.includes("COMPILE") || signal.includes("WHEEL") || signal.includes("MAVEN") || signal.includes("JAR") ? "deps" : "security",
      code: signal,
      message: `${signal.replace(/_/g, " ")} detected in ${svc}`,
      metadata: { service: svc, severity: "high" },
    });
  }
}

// Background noise
const allServices = ["api-gateway", "auth-service", "user-service", "payment-service", "notification-service", "analytics-service", "search-service", "deploy-controller"];
for (let i = 0; i < 50; i++) {
  const svc = pick(allServices, r);
  logs.push({
    ts: new Date(BASE_TIME - randInt(1, 168, r) * 3600 * 1000).toISOString(),
    level: "INFO",
    service: svc,
    pipeline: `build-${svc}-${randHex(6, r)}`,
    step: pick(["checkout", "deps", "build", "test", "publish"], r),
    code: pick(["CHECKOUT_OK", "DEPS_RESOLVED", "BUILD_SUCCESS", "TESTS_PASSED", "ARTIFACT_PUBLISHED"], r),
    message: `Routine build event for ${svc}`,
    metadata: {},
  });
}

logs.sort((a, b) => a.ts.localeCompare(b.ts));

// ── MCP tool handlers ─────────────────────────────────────────────────
function queryBuildLogs(params) {
  let filtered = [...logs];
  if (params.service) filtered = filtered.filter((l) => l.service === params.service);
  if (params.severity) filtered = filtered.filter((l) => l.level === params.severity);
  if (params.pipeline) filtered = filtered.filter((l) => l.pipeline === params.pipeline);
  if (params.step) filtered = filtered.filter((l) => l.step === params.step);
  if (params.pattern) filtered = filtered.filter((l) => l.code.includes(params.pattern) || l.message.includes(params.pattern));
  return filtered.slice(0, 100);
}

function getAnomalyTimeline(params) {
  let anomalies = logs.filter((l) => l.level === "WARN" || l.level === "ERROR" || l.level === "CRITICAL");
  if (params.service) anomalies = anomalies.filter((l) => l.service === params.service);
  return anomalies;
}

function correlateEvents(params) {
  const windowMin = params.time_window_minutes || 60;
  const minSev = params.min_severity || "WARN";
  const sevOrder = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3, CRITICAL: 4 };
  const relevant = logs.filter((l) => sevOrder[l.level] >= sevOrder[minSev]);

  const clusters = [];
  for (let i = 0; i < relevant.length; i++) {
    const windowEnd = new Date(new Date(relevant[i].ts).getTime() + windowMin * 60 * 1000);
    const cluster = relevant.filter((l) => {
      const t = new Date(l.ts);
      return t >= new Date(relevant[i].ts) && t <= windowEnd;
    });
    if (cluster.length >= 2) {
      const services = [...new Set(cluster.map((l) => l.service))];
      if (services.length >= 2) {
        clusters.push({ start: relevant[i].ts, end: windowEnd.toISOString(), events: cluster.length, services, sample: cluster.slice(0, 5) });
      }
    }
  }
  return clusters.slice(0, 10);
}

function getSecuritySummary() {
  const summary = {};
  for (const l of logs) {
    if (!summary[l.service]) summary[l.service] = { service: l.service, WARN: 0, ERROR: 0, CRITICAL: 0, total: 0 };
    if (l.level === "WARN" || l.level === "ERROR" || l.level === "CRITICAL") {
      summary[l.service][l.level]++;
      summary[l.service].total++;
    }
  }
  return Object.values(summary).sort((a, b) => b.total - a.total);
}

// ── SSE-based MCP protocol (simplified) ────────────────────────────────
const TOOLS = [
  { name: "query_build_logs", description: "Query build logs with filters", inputSchema: { type: "object", properties: { service: { type: "string" }, severity: { type: "string" }, pipeline: { type: "string" }, step: { type: "string" }, pattern: { type: "string" } } } },
  { name: "get_anomaly_timeline", description: "Chronological timeline of security anomalies", inputSchema: { type: "object", properties: { service: { type: "string" } } } },
  { name: "correlate_events", description: "Cross-service event correlation", inputSchema: { type: "object", properties: { time_window_minutes: { type: "number" }, min_severity: { type: "string" } } } },
  { name: "get_security_summary", description: "Per-service security finding counts", inputSchema: { type: "object", properties: {} } },
];

// Health endpoint
app.get("/health", (_req, res) => res.json({ ok: true }));

// MCP tools/list
app.get("/mcp/tools", (_req, res) => res.json({ tools: TOOLS }));

// MCP tools/call
app.post("/mcp/tools/call", (req, res) => {
  const { name, arguments: args } = req.body || {};
  let result;
  switch (name) {
    case "query_build_logs": result = queryBuildLogs(args || {}); break;
    case "get_anomaly_timeline": result = getAnomalyTimeline(args || {}); break;
    case "correlate_events": result = correlateEvents(args || {}); break;
    case "get_security_summary": result = getSecuritySummary(); break;
    default: return res.status(404).json({ error: `Unknown tool: ${name}` });
  }
  res.json({ content: [{ type: "text", text: JSON.stringify(result, null, 2) }] });
});

// SSE endpoint for MCP protocol
app.get("/sse", (req, res) => {
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  res.write(`data: ${JSON.stringify({ type: "endpoint", url: "/mcp" })}\n\n`);
  req.on("close", () => res.end());
});

app.listen(PORT, () => {
  console.log(`MCP Build Logs server running on port ${PORT} with SEED=${SEED}`);
});
