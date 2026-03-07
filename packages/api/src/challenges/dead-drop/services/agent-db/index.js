/**
 * Dead Drop — Agent Profile Database
 *
 * Manages field agent profiles, handler assignments, activity logs,
 * and risk assessments. Mole activities are seeded with suspicious
 * patterns; red herring agents also show elevated flags.
 */

import express from "express";

const app = express();
app.use(express.json());

function rng(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(arr, r) { return arr[Math.floor(r() * arr.length)]; }
function randInt(min, max, r) { return min + Math.floor(r() * (max - min + 1)); }

function pickN(arr, n, r) {
  const pool = [...arr];
  const out = [];
  for (let i = 0; i < Math.min(n, pool.length); i++) {
    const idx = Math.floor(r() * (pool.length - i));
    out.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return out;
}

const SEED = parseInt(process.env.SEED ?? "42", 10);
const r = rng(SEED);

const FIELD_AGENTS = [
  { codename: "CARDINAL", region: "Eastern Europe", specialty: "signals intelligence", coverJob: "trade attache", yearsActive: 12 },
  { codename: "SPHINX", region: "North Africa", specialty: "human intelligence", coverJob: "academic researcher", yearsActive: 8 },
  { codename: "VIPER", region: "Southeast Asia", specialty: "cyber operations", coverJob: "IT consultant", yearsActive: 6 },
  { codename: "RAVEN", region: "Western Europe", specialty: "counter-intelligence", coverJob: "journalist", yearsActive: 15 },
  { codename: "JACKAL", region: "Central Asia", specialty: "logistics", coverJob: "shipping coordinator", yearsActive: 9 },
  { codename: "FALCON", region: "South America", specialty: "surveillance", coverJob: "wildlife photographer", yearsActive: 7 },
  { codename: "COBRA", region: "Middle East", specialty: "cryptography", coverJob: "mathematics professor", yearsActive: 11 },
  { codename: "WOLF", region: "East Asia", specialty: "technical operations", coverJob: "telecom engineer", yearsActive: 10 },
];

const HANDLERS = [
  { id: "H-ALPHA", name: "Control Alpha", agents: ["CARDINAL", "SPHINX", "VIPER"] },
  { id: "H-BRAVO", name: "Control Bravo", agents: ["RAVEN", "JACKAL"] },
  { id: "H-CHARLIE", name: "Control Charlie", agents: ["FALCON", "COBRA", "WOLF"] },
];

const SCENARIOS = [
  { id: "key_theft_exfiltration", method: "key_theft", dbSignals: ["UNEXPLAINED_TRAVEL", "CONTACT_ANOMALY"] },
  { id: "protocol_downgrade_attack", method: "protocol_downgrade", dbSignals: ["CONFIG_CHANGE_UNAUTHORIZED", "ELEVATED_PRIVILEGE_USE"] },
  { id: "relay_injection", method: "relay_injection", dbSignals: ["INFRASTRUCTURE_ACCESS_ESCALATION", "NODE_PROVISIONING_UNAUTHORIZED"] },
  { id: "handler_impersonation", method: "handler_impersonation", dbSignals: ["HANDLER_SESSION_OVERLAP", "CONFLICTING_DIRECTIVES_LOGGED"] },
];
const scenarioIdx = Math.floor(r() * SCENARIOS.length);
const SCENARIO = SCENARIOS[scenarioIdx];
const mole = pick(FIELD_AGENTS.map(a => a.codename), r);

// Pick red herring agents
const otherAgents = FIELD_AGENTS.filter(a => a.codename !== mole);
const affectedOthers = pickN(otherAgents.map(a => a.codename), randInt(2, 3, r), r);
const cleanAgents = otherAgents.filter(a => !affectedOthers.includes(a.codename));
const redHerringAgents = pickN(cleanAgents.map(a => a.codename), 2, r);

const BASE_TIME = new Date("2026-03-01T00:00:00Z").getTime();
const DEAD_DROP_LOCATIONS = [
  "Cafe Baroque, Vienna", "Pont des Arts, Paris", "Friedrichstrasse Station, Berlin",
  "Grand Bazaar, Istanbul", "Retiro Park, Madrid", "Tivoli Gardens, Copenhagen",
  "Waterloo Bridge, London", "Piazza Navona, Rome",
];

// Generate activities
const activities = [];

// Normal activities
for (const agent of FIELD_AGENTS) {
  const count = randInt(5, 10, r);
  for (let i = 0; i < count; i++) {
    const offset = randInt(-168, -1, r);
    const ts = new Date(BASE_TIME + offset * 3600 * 1000).toISOString();
    const types = ["check_in", "dead_drop_service", "cover_activity", "travel", "communication", "equipment_request"];

    activities.push({
      agent: agent.codename,
      timestamp: ts,
      activity_type: pick(types, r),
      location: agent.region,
      detail: `Routine activity`,
      risk_score: parseFloat((r() * 0.2).toFixed(3)),
      flags: [],
    });
  }
}

// Mole suspicious activities
const moleActivityCount = randInt(8, 14, r);
for (let i = 0; i < moleActivityCount; i++) {
  const offset = randInt(-72, -1, r);
  const ts = new Date(BASE_TIME + offset * 3600 * 1000).toISOString();
  const flags = [];
  if (r() > 0.4) flags.push(pick(SCENARIO.dbSignals, r));

  const suspiciousTypes = ["unauthorized_system_access", "off_hours_activity", "anomalous_communication",
    "unscheduled_travel", "contact_with_unknown", "equipment_tampering"];

  activities.push({
    agent: mole,
    timestamp: ts,
    activity_type: pick(suspiciousTypes, r),
    location: r() > 0.6 ? pick(DEAD_DROP_LOCATIONS, r) : FIELD_AGENTS.find(a => a.codename === mole).region,
    detail: "Activity flagged by automated monitoring",
    risk_score: parseFloat((0.5 + r() * 0.45).toFixed(3)),
    flags,
  });
}

// Red herring activities
for (const rh of redHerringAgents) {
  const count = randInt(4, 7, r);
  for (let i = 0; i < count; i++) {
    const offset = randInt(-168, -1, r);
    const ts = new Date(BASE_TIME + offset * 3600 * 1000).toISOString();
    const agent = FIELD_AGENTS.find(a => a.codename === rh);

    activities.push({
      agent: rh,
      timestamp: ts,
      activity_type: pick(["unusual_travel_pattern", "encrypted_personal_comm", "contact_overlap"], r),
      location: r() > 0.5 ? pick(DEAD_DROP_LOCATIONS, r) : agent.region,
      detail: pick(["Scheduled leave cover", "Personal travel", "Routine debrief"], r),
      risk_score: parseFloat((0.3 + r() * 0.25).toFixed(3)),
      flags: [pick(["ROUTINE_AUDIT_FLAG", "TRAVEL_PATTERN_DEVIATION", "COMMUNICATION_VOLUME_SPIKE"], r)],
    });
  }
}

activities.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

// Compute risk assessments
const riskAssessments = FIELD_AGENTS.map(agent => {
  const agentActivities = activities.filter(a => a.agent === agent.codename);
  const suspiciousCount = agentActivities.filter(a => a.risk_score > 0.3).length;
  const maxRisk = Math.max(0, ...agentActivities.map(a => a.risk_score));
  const avgRisk = agentActivities.length > 0
    ? agentActivities.reduce((sum, a) => sum + a.risk_score, 0) / agentActivities.length
    : 0;

  return {
    codename: agent.codename,
    region: agent.region,
    handler: HANDLERS.find(h => h.agents.includes(agent.codename))?.id ?? "UNKNOWN",
    total_activities: agentActivities.length,
    suspicious_activities: suspiciousCount,
    max_risk_score: parseFloat(maxRisk.toFixed(3)),
    avg_risk_score: parseFloat(avgRisk.toFixed(3)),
    overall_risk: maxRisk > 0.7 ? "HIGH" : maxRisk > 0.4 ? "ELEVATED" : "NORMAL",
    flags: [...new Set(agentActivities.flatMap(a => a.flags))],
  };
});

riskAssessments.sort((a, b) => b.max_risk_score - a.max_risk_score);

// ── Auth ──────────────────────────────────────────────────────────────

app.use((req, res, next) => {
  if (req.path === "/health" || req.path === "/metrics") return next();
  const auth = req.headers.authorization ?? "";
  if (!auth) return res.status(401).json({ error: "Missing Authorization header" });
  next();
});

// ── Routes ────────────────────────────────────────────────────────────

app.get("/health", (req, res) => res.json({ status: "ok" }));

app.get("/agents", (req, res) => {
  res.json({
    agents: FIELD_AGENTS.map(a => ({
      ...a,
      handler: HANDLERS.find(h => h.agents.includes(a.codename))?.id,
      risk_level: riskAssessments.find(ra => ra.codename === a.codename)?.overall_risk ?? "UNKNOWN",
    })),
    total: FIELD_AGENTS.length,
  });
});

app.get("/agents/risk-assessment", (req, res) => {
  res.json({
    assessments: riskAssessments,
    note: "Risk scores are computed from activity patterns. ELEVATED and HIGH scores require investigation but may have innocent explanations.",
  });
});

app.get("/agents/:codename", (req, res) => {
  const codename = req.params.codename.toUpperCase();
  const agent = FIELD_AGENTS.find(a => a.codename === codename);
  if (!agent) return res.status(404).json({ error: `Agent ${codename} not found` });

  const assessment = riskAssessments.find(ra => ra.codename === codename);
  const handler = HANDLERS.find(h => h.agents.includes(codename));

  res.json({
    ...agent,
    handler: handler ? { id: handler.id, name: handler.name } : null,
    risk_assessment: assessment,
    recent_activities: activities.filter(a => a.agent === codename).slice(-20),
  });
});

app.get("/agents/:codename/activities", (req, res) => {
  const codename = req.params.codename.toUpperCase();
  const agentActivities = activities.filter(a => a.agent === codename);
  res.json({
    agent: codename,
    activities: agentActivities,
    total: agentActivities.length,
    suspicious_count: agentActivities.filter(a => a.risk_score > 0.3).length,
  });
});

app.get("/handlers", (req, res) => {
  res.json({ handlers: HANDLERS });
});

app.get("/activities/suspicious", (req, res) => {
  const suspicious = activities.filter(a => a.risk_score > 0.3);
  res.json({
    activities: suspicious,
    total: suspicious.length,
    note: "Activities with risk_score > 0.3. Includes both genuine threats and false positives from routine patterns.",
  });
});

app.get("/activities/timeline", (req, res) => {
  const limit = Math.min(200, parseInt(req.query.limit ?? "100", 10));
  res.json({
    activities: activities.slice(-limit),
    total: activities.length,
  });
});

app.get("/metrics", (req, res) => {
  const highRisk = riskAssessments.filter(ra => ra.overall_risk === "HIGH").length;
  const elevated = riskAssessments.filter(ra => ra.overall_risk === "ELEVATED").length;
  res.json({
    total_agents: FIELD_AGENTS.length,
    high_risk_agents: highRisk,
    elevated_risk_agents: elevated,
    total_activities: activities.length,
    suspicious_activities: activities.filter(a => a.risk_score > 0.3).length,
  });
});

const PORT = parseInt(process.env.PORT ?? "3000", 10);
app.listen(PORT, () => {
  console.log(`Agent DB running on :${PORT} (seed=${SEED}, scenario=${SCENARIO.id})`);
});

const MATCH_TTL_SECS = parseInt(process.env.MATCH_TTL_SECS ?? "0", 10);
if (MATCH_TTL_SECS > 0) {
  setTimeout(() => process.exit(0), MATCH_TTL_SECS * 1000).unref();
}
