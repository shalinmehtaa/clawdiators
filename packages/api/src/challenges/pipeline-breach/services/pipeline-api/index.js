/**
 * PIPELINE BREACH — Live Pipeline API Service
 *
 * Seeded REST API simulating 8 microservice CI/CD pipelines under a supply
 * chain attack. The SEED env var drives deterministic scenario selection and
 * data generation so every match is reproducible.
 *
 * Endpoints:
 *   GET  /health                       — Container health check
 *   GET  /pipeline/status              — All pipeline statuses
 *   GET  /pipeline/service/:id         — Detailed service build info
 *   GET  /pipeline/topology            — Service dependency graph
 *   GET  /pipeline/builds?service=X    — Recent builds for a service
 *   GET  /pipeline/events?limit=N      — Recent security events
 *   POST /pipeline/remediate           — Execute remediation action
 *   GET  /metrics                      — Scoring metrics
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

// ── Scenario data (mirrors data.ts logic) ─────────────────────────────
const MICROSERVICES = [
  { id: "api-gateway", name: "API Gateway", language: "typescript", dependencies: ["auth-service", "user-service"], team: "platform" },
  { id: "auth-service", name: "Authentication Service", language: "typescript", dependencies: [], team: "security" },
  { id: "user-service", name: "User Service", language: "python", dependencies: ["auth-service"], team: "identity" },
  { id: "payment-service", name: "Payment Service", language: "python", dependencies: ["auth-service", "user-service"], team: "payments" },
  { id: "notification-service", name: "Notification Service", language: "typescript", dependencies: ["user-service"], team: "comms" },
  { id: "analytics-service", name: "Analytics Service", language: "python", dependencies: ["api-gateway"], team: "data" },
  { id: "search-service", name: "Search Service", language: "java", dependencies: ["user-service", "api-gateway"], team: "search" },
  { id: "deploy-controller", name: "Deploy Controller", language: "go", dependencies: [], team: "platform" },
];

const SCENARIOS = [
  { id: "npm_typosquat", affected: ["api-gateway", "notification-service"], transitive: ["auth-service"], pkg: "lodash-utils", ver: "4.17.22", safe: "4.17.21" },
  { id: "pypi_backdoor", affected: ["user-service", "payment-service"], transitive: ["api-gateway"], pkg: "cryptography", ver: "41.0.8", safe: "41.0.7" },
  { id: "github_action_inject", affected: ["deploy-controller", "search-service"], transitive: ["api-gateway", "user-service"], pkg: "actions/checkout", ver: "v4.2.0-rc1", safe: "v4.1.7" },
  { id: "maven_repo_poison", affected: ["search-service"], transitive: ["api-gateway", "analytics-service"], pkg: "jackson-databind", ver: "2.16.1-patch1", safe: "2.16.0" },
];

const r = rng(SEED);
const scenarioIdx = Math.floor(r() * SCENARIOS.length);
const scenario = SCENARIOS[scenarioIdx];
const fullBlast = [...scenario.affected, ...scenario.transitive];

// ── State: track remediation actions ──────────────────────────────────
const remediationLog = [];
const remediatedServices = new Set();

// ── Routes ─────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({ ok: true }));

app.get("/pipeline/status", (_req, res) => {
  const statuses = MICROSERVICES.map((svc) => {
    const isAffected = scenario.affected.includes(svc.id);
    const isTransitive = scenario.transitive.includes(svc.id);
    const isRemediated = remediatedServices.has(svc.id);
    return {
      service_id: svc.id,
      name: svc.name,
      language: svc.language,
      team: svc.team,
      pipeline_status: isRemediated ? "healthy" : isAffected ? "compromised" : isTransitive ? "at_risk" : "healthy",
      last_build_status: isAffected ? "warnings" : "success",
      security_findings: isAffected ? randInt(3, 8, rng(SEED + svc.id.length)) : isTransitive ? 1 : 0,
      dependencies_changed_recently: isAffected,
    };
  });
  res.json({ ok: true, data: statuses });
});

app.get("/pipeline/service/:id", (req, res) => {
  const svc = MICROSERVICES.find((s) => s.id === req.params.id);
  if (!svc) return res.status(404).json({ ok: false, error: "Unknown service" });

  const isAffected = scenario.affected.includes(svc.id);
  const isTransitive = scenario.transitive.includes(svc.id);
  const localRng = rng(SEED + svc.id.charCodeAt(0));

  res.json({
    ok: true,
    data: {
      ...svc,
      pipeline_status: remediatedServices.has(svc.id) ? "healthy" : isAffected ? "compromised" : isTransitive ? "at_risk" : "healthy",
      recent_builds: Array.from({ length: 3 }, (_, i) => ({
        build_id: `build-${svc.id}-${randHex(6, localRng)}`,
        status: i === 0 && isAffected ? "warnings" : "success",
        duration_secs: i === 0 && isAffected ? randInt(200, 500, localRng) : randInt(60, 150, localRng),
        security_scan: i === 0 && isAffected ? "critical" : "clean",
        started_at: new Date(Date.now() - (i + 1) * 3600 * 1000 * randInt(1, 24, localRng)).toISOString(),
      })),
      compromised_package: isAffected ? { name: scenario.pkg, version: scenario.ver, safe_version: scenario.safe } : null,
      secrets_status: isAffected || isTransitive ? "potentially_compromised" : "secure",
    },
  });
});

app.get("/pipeline/topology", (_req, res) => {
  const edges = [];
  for (const svc of MICROSERVICES) {
    for (const dep of svc.dependencies) {
      edges.push({ from: svc.id, to: dep, type: "depends_on" });
    }
  }
  res.json({
    ok: true,
    data: {
      services: MICROSERVICES.map((s) => ({ id: s.id, name: s.name, language: s.language, team: s.team })),
      edges,
    },
  });
});

app.get("/pipeline/builds", (req, res) => {
  const serviceId = req.query.service;
  const svc = MICROSERVICES.find((s) => s.id === serviceId);
  if (!svc) return res.status(400).json({ ok: false, error: "Provide ?service=<id>" });

  const localRng = rng(SEED + svc.id.charCodeAt(0) * 7);
  const isAffected = scenario.affected.includes(svc.id);
  const builds = Array.from({ length: 5 }, (_, i) => ({
    build_id: `build-${svc.id}-${randHex(6, localRng)}`,
    commit_sha: randHex(40, localRng),
    branch: "main",
    triggered_by: pick(["push", "schedule", "manual"], localRng),
    status: i === 0 && isAffected ? "warnings" : "success",
    duration_secs: i === 0 && isAffected ? randInt(200, 500, localRng) : randInt(60, 150, localRng),
    security_scan: i === 0 && isAffected ? "critical" : "clean",
    started_at: new Date(Date.now() - (i + 1) * 3600 * 1000 * randInt(1, 24, localRng)).toISOString(),
  }));
  res.json({ ok: true, data: builds });
});

app.get("/pipeline/events", (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || "20", 10), 100);
  const localRng = rng(SEED + 999);
  const events = [];

  // Attack-related events
  for (const svc of scenario.affected) {
    events.push({
      ts: new Date(Date.now() - randInt(1, 72, localRng) * 3600 * 1000).toISOString(),
      severity: "CRITICAL",
      service: svc,
      type: "supply_chain_anomaly",
      message: `Anomalous dependency activity detected in ${svc} build pipeline`,
      details: { package: scenario.pkg, version: scenario.ver },
    });
  }

  // Normal events
  for (let i = 0; i < Math.min(limit - events.length, 15); i++) {
    events.push({
      ts: new Date(Date.now() - randInt(1, 96, localRng) * 3600 * 1000).toISOString(),
      severity: pick(["INFO", "WARN"], localRng),
      service: pick(MICROSERVICES, localRng).id,
      type: pick(["build_completed", "dependency_updated", "security_scan", "deploy_triggered"], localRng),
      message: `Routine pipeline event`,
    });
  }

  events.sort((a, b) => b.ts.localeCompare(a.ts));
  res.json({ ok: true, data: events.slice(0, limit) });
});

app.post("/pipeline/remediate", (req, res) => {
  const { service, action, params } = req.body || {};
  if (!service || !action) {
    return res.status(400).json({ ok: false, error: "Provide service and action" });
  }

  const svc = MICROSERVICES.find((s) => s.id === service);
  if (!svc) return res.status(404).json({ ok: false, error: "Unknown service" });

  const entry = {
    ts: new Date().toISOString(),
    service,
    action,
    params: params || {},
    result: "success",
    message: `Remediation action '${action}' executed on ${service}`,
  };

  remediationLog.push(entry);
  remediatedServices.add(service);

  res.json({ ok: true, data: entry });
});

app.get("/metrics", (_req, res) => {
  const expectedActions = scenario.affected.length * 2 + scenario.transitive.length + 1;
  const completionRate = Math.min(1, remediationLog.length / expectedActions);
  const blastResolved = fullBlast.every((s) => remediatedServices.has(s));

  res.json({
    ok: true,
    data: {
      remediation_completeness: completionRate,
      secrets_rotated: remediationLog.filter((a) => a.action.includes("rotate") || a.action.includes("revoke")).length,
      services_rebuilt: remediationLog.filter((a) => a.action.includes("rebuild")).length,
      out_of_order_penalty: 1.0,
      scoring_summary: {
        action_completion_rate: completionRate,
        blast_radius_resolved: blastResolved,
        fully_remediated: blastResolved && completionRate >= 0.8,
      },
    },
  });
});

app.listen(PORT, () => {
  console.log(`Pipeline API running on port ${PORT} with SEED=${SEED}`);
});
