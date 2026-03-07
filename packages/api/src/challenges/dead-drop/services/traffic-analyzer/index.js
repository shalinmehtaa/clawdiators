/**
 * Dead Drop — Network Traffic Analyzer
 *
 * Provides traffic flow analysis, anomaly detection, pattern classification,
 * and cross-source correlation data.
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

const SEED = parseInt(process.env.SEED ?? "42", 10);
const r = rng(SEED);

const RELAY_NODES_IDS = ["RN-ALPHA", "RN-BRAVO", "RN-CHARLIE", "RN-DELTA", "RN-ECHO", "RN-FOXTROT"];
const SCENARIOS = [
  { id: "key_theft_exfiltration", method: "key_theft", trafficSignals: ["ENCRYPTED_EXFILTRATION_PATTERN", "COVERT_CHANNEL_DETECTED"] },
  { id: "protocol_downgrade_attack", method: "protocol_downgrade", trafficSignals: ["WEAK_CIPHER_TRAFFIC", "KNOWN_PLAINTEXT_SIGNATURE"] },
  { id: "relay_injection", method: "relay_injection", trafficSignals: ["SHADOW_TRAFFIC_PATTERN", "BANDWIDTH_ASYMMETRY", "UNAUTHORIZED_EGRESS"] },
  { id: "handler_impersonation", method: "handler_impersonation", trafficSignals: ["FORGED_HEADER_PATTERN", "SOURCE_IP_MISMATCH"] },
];
const scenarioIdx = Math.floor(r() * SCENARIOS.length);
const SCENARIO = SCENARIOS[scenarioIdx];

// Consume the same RNG values as other services to stay in sync
const moleIdx = Math.floor(r() * 8);
const rogueNodeId = SCENARIO.method === "relay_injection" ? `RN-ROGUE-${randInt(100, 999, r)}` : null;

const BASE_TIME = new Date("2026-03-01T00:00:00Z").getTime();

// Generate traffic records
const records = [];
let sessionCounter = 0;

// Normal traffic
for (let i = 0; i < 60; i++) {
  const source = pick(RELAY_NODES_IDS, r);
  const destPool = RELAY_NODES_IDS.filter(n => n !== source);
  const dest = pick(destPool, r);
  const offset = randInt(-168, -1, r);
  const ts = new Date(BASE_TIME + offset * 3600 * 1000).toISOString();

  records.push({
    session_id: `TRF-${(++sessionCounter).toString().padStart(5, "0")}`,
    timestamp: ts,
    source_node: source,
    dest_node: dest,
    bytes_sent: randInt(1024, 65536, r),
    bytes_received: randInt(512, 32768, r),
    protocol: "COVERT-v3",
    cipher_strength: "HIGH",
    latency_ms: randInt(50, 300, r),
    anomaly_score: parseFloat((r() * 0.15).toFixed(3)),
    flags: [],
  });
}

// Compromised traffic
const compromisedCount = randInt(8, 15, r);
for (let i = 0; i < compromisedCount; i++) {
  const source = rogueNodeId && r() > 0.5 ? rogueNodeId : pick(RELAY_NODES_IDS, r);
  const destPool = RELAY_NODES_IDS.filter(n => n !== source);
  const dest = pick(destPool, r);
  const offset = randInt(-72, -1, r);
  const ts = new Date(BASE_TIME + offset * 3600 * 1000).toISOString();

  const flags = [];
  if (r() > 0.3) flags.push(pick(SCENARIO.trafficSignals, r));
  if (r() > 0.6) flags.push(pick(SCENARIO.trafficSignals, r));

  records.push({
    session_id: `TRF-${(++sessionCounter).toString().padStart(5, "0")}`,
    timestamp: ts,
    source_node: source,
    dest_node: dest,
    bytes_sent: randInt(65536, 524288, r),
    bytes_received: randInt(32768, 262144, r),
    protocol: SCENARIO.method === "protocol_downgrade" ? "COVERT-v1" : "COVERT-v3",
    cipher_strength: SCENARIO.method === "protocol_downgrade" ? "LOW" : "HIGH",
    latency_ms: SCENARIO.method === "relay_injection" ? randInt(500, 2000, r) : randInt(50, 300, r),
    anomaly_score: parseFloat((0.6 + r() * 0.35).toFixed(3)),
    flags,
  });
}

// Red herring traffic
for (let i = 0; i < 8; i++) {
  const source = pick(RELAY_NODES_IDS, r);
  const destPool = RELAY_NODES_IDS.filter(n => n !== source);
  const dest = pick(destPool, r);
  const offset = randInt(-168, -1, r);
  const ts = new Date(BASE_TIME + offset * 3600 * 1000).toISOString();

  records.push({
    session_id: `TRF-${(++sessionCounter).toString().padStart(5, "0")}`,
    timestamp: ts,
    source_node: source,
    dest_node: dest,
    bytes_sent: randInt(32768, 131072, r),
    bytes_received: randInt(16384, 65536, r),
    protocol: "COVERT-v3",
    cipher_strength: "HIGH",
    latency_ms: randInt(200, 600, r),
    anomaly_score: parseFloat((0.35 + r() * 0.25).toFixed(3)),
    flags: [pick(["ROUTINE_SCAN", "BANDWIDTH_SPIKE_SCHEDULED", "MAINTENANCE_WINDOW"], r)],
  });
}

records.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

// Pattern analysis
const patterns = [];
const flaggedRecords = records.filter(rec => rec.flags.length > 0 && !rec.flags.includes("ROUTINE_SCAN"));
if (flaggedRecords.length > 3) {
  patterns.push({
    pattern_id: "PAT-001",
    classification: SCENARIO.method === "relay_injection" ? "shadow_routing" :
      SCENARIO.method === "protocol_downgrade" ? "cipher_downgrade" :
      SCENARIO.method === "key_theft" ? "data_exfiltration" : "identity_spoofing",
    confidence: parseFloat((0.7 + r() * 0.25).toFixed(2)),
    affected_sessions: flaggedRecords.slice(0, 8).map(rec => rec.session_id),
    time_window: { start: flaggedRecords[0].timestamp, end: flaggedRecords[flaggedRecords.length - 1].timestamp },
    description: `Detected pattern consistent with ${SCENARIO.id.replace(/_/g, " ")}`,
  });
}

// Red herring pattern
patterns.push({
  pattern_id: "PAT-002",
  classification: "maintenance_burst",
  confidence: 0.45,
  affected_sessions: records.filter(rec => rec.flags.includes("ROUTINE_SCAN") || rec.flags.includes("BANDWIDTH_SPIKE_SCHEDULED")).slice(0, 4).map(rec => rec.session_id),
  time_window: { start: new Date(BASE_TIME - 168 * 3600 * 1000).toISOString(), end: new Date(BASE_TIME).toISOString() },
  description: "Scheduled maintenance and bandwidth testing activity",
});

// Cross-source correlation hints
const correlations = [
  {
    correlation_id: "COR-001",
    sources: ["traffic-analyzer", "key-server"],
    description: `Traffic anomalies temporally correlated with key access patterns`,
    confidence: parseFloat((0.6 + r() * 0.3).toFixed(2)),
    time_window: "Last 72 hours",
    recommendation: "Cross-reference flagged traffic sessions with key anomaly timestamps",
  },
  {
    correlation_id: "COR-002",
    sources: ["traffic-analyzer", "agent-db"],
    description: `Network anomalies correlate with agent activity spikes`,
    confidence: parseFloat((0.5 + r() * 0.3).toFixed(2)),
    time_window: "Last 72 hours",
    recommendation: "Compare high-anomaly traffic timestamps with agent activity logs",
  },
  {
    correlation_id: "COR-003",
    sources: ["traffic-analyzer", "relay-api"],
    description: `Message routing patterns show unusual relay node selection`,
    confidence: parseFloat((0.4 + r() * 0.4).toFixed(2)),
    time_window: "Last 7 days",
    recommendation: "Check if flagged messages consistently route through specific nodes",
  },
];

// ── Auth ──────────────────────────────────────────────────────────────

app.use((req, res, next) => {
  if (req.path === "/health" || req.path === "/metrics") return next();
  const auth = req.headers.authorization ?? "";
  if (!auth) return res.status(401).json({ error: "Missing Authorization header" });
  next();
});

// ── Routes ────────────────────────────────────────────────────────────

app.get("/health", (req, res) => res.json({ status: "ok" }));

app.get("/traffic", (req, res) => {
  const limit = Math.min(200, parseInt(req.query.limit ?? "100", 10));
  res.json({ records: records.slice(0, limit), total: records.length });
});

app.get("/traffic/anomalies", (req, res) => {
  const threshold = parseFloat(req.query.threshold ?? "0.5");
  const anomalous = records.filter(rec => rec.anomaly_score >= threshold);
  res.json({
    records: anomalous,
    total: anomalous.length,
    threshold,
    note: "High anomaly scores may indicate compromise but also routine events. Cross-reference with other data sources.",
  });
});

app.get("/traffic/by-node/:node_id", (req, res) => {
  const nodeId = req.params.node_id.toUpperCase();
  const nodeTraffic = records.filter(rec => rec.source_node === nodeId || rec.dest_node === nodeId);
  res.json({
    node: nodeId,
    records: nodeTraffic,
    total: nodeTraffic.length,
    avg_anomaly_score: nodeTraffic.length > 0
      ? parseFloat((nodeTraffic.reduce((s, rec) => s + rec.anomaly_score, 0) / nodeTraffic.length).toFixed(3))
      : 0,
  });
});

app.get("/traffic/:session_id", (req, res) => {
  const rec = records.find(rec => rec.session_id === req.params.session_id.toUpperCase());
  if (!rec) return res.status(404).json({ error: `Session ${req.params.session_id} not found` });
  res.json(rec);
});

app.get("/traffic/patterns", (req, res) => {
  res.json({
    patterns,
    total: patterns.length,
    note: "Detected patterns are ranked by confidence. Investigate high-confidence patterns first.",
  });
});

app.get("/traffic/timeline", (req, res) => {
  // Group by 6-hour windows
  const windows = {};
  for (const rec of records) {
    const ts = new Date(rec.timestamp);
    const windowStart = new Date(ts.getTime() - (ts.getTime() % (6 * 3600 * 1000)));
    const key = windowStart.toISOString();
    if (!windows[key]) windows[key] = { start: key, count: 0, avg_anomaly: 0, flagged: 0, total_bytes: 0 };
    windows[key].count++;
    windows[key].avg_anomaly += rec.anomaly_score;
    if (rec.flags.length > 0) windows[key].flagged++;
    windows[key].total_bytes += rec.bytes_sent + rec.bytes_received;
  }
  const timeline = Object.values(windows).map(w => ({
    ...w,
    avg_anomaly: parseFloat((w.avg_anomaly / w.count).toFixed(3)),
  }));
  timeline.sort((a, b) => a.start.localeCompare(b.start));
  res.json({ timeline, windows: timeline.length });
});

app.get("/correlations", (req, res) => {
  res.json({
    correlations,
    total: correlations.length,
    note: "Cross-source correlations suggest areas for deeper investigation. Not all correlations indicate compromise.",
  });
});

app.get("/metrics", (req, res) => {
  const anomalousCount = records.filter(rec => rec.anomaly_score >= 0.5).length;
  const flaggedCount = records.filter(rec => rec.flags.length > 0).length;
  res.json({
    total_sessions: records.length,
    anomalous_sessions: anomalousCount,
    flagged_sessions: flaggedCount,
    patterns_detected: patterns.length,
    correlations: correlations.length,
    avg_anomaly_score: parseFloat((records.reduce((s, rec) => s + rec.anomaly_score, 0) / records.length).toFixed(3)),
  });
});

const PORT = parseInt(process.env.PORT ?? "3000", 10);
app.listen(PORT, () => {
  console.log(`Traffic Analyzer running on :${PORT} (seed=${SEED}, scenario=${SCENARIO.id})`);
});

const MATCH_TTL_SECS = parseInt(process.env.MATCH_TTL_SECS ?? "0", 10);
if (MATCH_TTL_SECS > 0) {
  setTimeout(() => process.exit(0), MATCH_TTL_SECS * 1000).unref();
}
