/**
 * Dead Drop — Cryptographic Key Server
 *
 * Manages cipher keys, rotation logs, and cipher suite information.
 * Mole-specific anomalies are seeded based on SEED env var.
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

const AGENTS = ["CARDINAL", "SPHINX", "VIPER", "RAVEN", "JACKAL", "FALCON", "COBRA", "WOLF"];
const SCENARIOS = [
  { id: "key_theft_exfiltration", method: "key_theft" },
  { id: "protocol_downgrade_attack", method: "protocol_downgrade" },
  { id: "relay_injection", method: "relay_injection" },
  { id: "handler_impersonation", method: "handler_impersonation" },
];
const scenarioIdx = Math.floor(r() * SCENARIOS.length);
const SCENARIO = SCENARIOS[scenarioIdx];
const mole = pick(AGENTS, r);

const BASE_TIME = new Date("2026-03-01T00:00:00Z").getTime();
const algorithms = ["AES-256-GCM", "CHACHA20-POLY1305", "AES-128-CTR", "CAMELLIA-256"];

// Generate key records
const keyRecords = [];
let keyCounter = 0;

for (const agent of AGENTS) {
  const keyCount = randInt(3, 6, r);
  for (let i = 0; i < keyCount; i++) {
    const algo = pick(algorithms, r);
    const strength = algo.includes("256") ? 256 : algo.includes("128") ? 128 : 256;
    const createdOffset = randInt(-90, -1, r);
    const created = new Date(BASE_TIME + createdOffset * 24 * 3600 * 1000);
    const expires = new Date(created.getTime() + 90 * 24 * 3600 * 1000);
    const rotations = randInt(1, 8, r);

    const isMoleKey = agent === mole;
    const anomalies = [];

    if (isMoleKey && SCENARIO.method === "key_theft") {
      if (r() > 0.4) anomalies.push("ANOMALOUS_KEY_ACCESS");
      if (r() > 0.6) anomalies.push("BULK_KEY_RETRIEVAL");
      if (r() > 0.5) anomalies.push("ACCESS_OUTSIDE_ROTATION_WINDOW");
    }
    if (isMoleKey && SCENARIO.method === "protocol_downgrade") {
      if (r() > 0.5) anomalies.push("CIPHER_SUITE_MISMATCH");
      if (r() > 0.6) anomalies.push("DEPRECATED_ALGORITHM_IN_USE");
    }
    if (isMoleKey && SCENARIO.method === "handler_impersonation") {
      if (r() > 0.5) anomalies.push("DUPLICATE_AUTH_TOKEN_DETECTED");
      if (r() > 0.6) anomalies.push("TOKEN_REPLAY_ATTEMPT");
    }
    if (isMoleKey && SCENARIO.method === "relay_injection") {
      if (r() > 0.5) anomalies.push("UNEXPECTED_NODE_REGISTRATION");
      if (r() > 0.6) anomalies.push("KEY_DISTRIBUTION_ANOMALY");
    }

    // Red herring anomalies
    if (!isMoleKey && r() > 0.85) {
      anomalies.push(pick(["ROUTINE_AUDIT_FLAG", "EXPIRY_WARNING", "ROTATION_OVERDUE"], r));
    }

    const lastAccessedBy = isMoleKey && r() > 0.6 ? "SYSTEM-EXTERNAL" : agent;

    keyRecords.push({
      key_id: `KEY-${(++keyCounter).toString().padStart(4, "0")}`,
      algorithm: SCENARIO.method === "protocol_downgrade" && isMoleKey && r() > 0.5 ? "DES-56-ECB" : algo,
      strength_bits: SCENARIO.method === "protocol_downgrade" && isMoleKey && r() > 0.5 ? 56 : strength,
      assigned_to: agent,
      created_at: created.toISOString(),
      expires_at: expires.toISOString(),
      rotation_count: rotations,
      last_accessed_by: lastAccessedBy,
      last_accessed_at: new Date(BASE_TIME - randInt(1, 72, r) * 3600 * 1000).toISOString(),
      status: expires.getTime() > BASE_TIME ? "ACTIVE" : "EXPIRED",
      anomaly_flags: anomalies,
    });
  }
}

// Rotation log
const rotationLog = [];
for (let i = 0; i < 30; i++) {
  const agent = pick(AGENTS, r);
  const offset = randInt(-30, -1, r);
  const ts = new Date(BASE_TIME + offset * 24 * 3600 * 1000).toISOString();
  const isMole = agent === mole;

  rotationLog.push({
    timestamp: ts,
    agent,
    old_key_id: `KEY-${randInt(1, keyCounter, r).toString().padStart(4, "0")}`,
    new_key_id: `KEY-${randInt(1, keyCounter, r).toString().padStart(4, "0")}`,
    reason: isMole && r() > 0.6 ? "manual_override" : pick(["scheduled", "scheduled", "scheduled", "policy_change"], r),
    initiated_by: isMole && r() > 0.5 ? agent : "SYSTEM",
  });
}
rotationLog.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

// Cipher suites
const cipherSuites = [
  { id: "AES-256-GCM", name: "AES-256 Galois/Counter Mode", security_rating: "HIGH", status: "APPROVED", key_size_bits: 256 },
  { id: "CHACHA20-POLY1305", name: "ChaCha20-Poly1305", security_rating: "HIGH", status: "APPROVED", key_size_bits: 256 },
  { id: "AES-128-CTR", name: "AES-128 Counter Mode", security_rating: "MEDIUM", status: "APPROVED", key_size_bits: 128 },
  { id: "CAMELLIA-256", name: "Camellia-256", security_rating: "HIGH", status: "APPROVED", key_size_bits: 256 },
  { id: "DES-56-ECB", name: "DES Electronic Codebook", security_rating: "CRITICAL_LOW", status: "DEPRECATED", key_size_bits: 56, deprecation_note: "Known vulnerable to brute-force. Must not be used for classified communications." },
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

app.get("/keys", (req, res) => {
  res.json({ keys: keyRecords, total: keyRecords.length });
});

app.get("/keys/anomalies", (req, res) => {
  const anomalous = keyRecords.filter(k => k.anomaly_flags.length > 0);
  res.json({
    keys: anomalous,
    total: anomalous.length,
    note: "Keys with anomaly flags. May include routine audit flags alongside genuine concerns.",
  });
});

app.get("/keys/by-agent/:codename", (req, res) => {
  const codename = req.params.codename.toUpperCase();
  const agentKeys = keyRecords.filter(k => k.assigned_to === codename);
  res.json({ agent: codename, keys: agentKeys, total: agentKeys.length });
});

app.get("/keys/:id", (req, res) => {
  const key = keyRecords.find(k => k.key_id === req.params.id.toUpperCase());
  if (!key) return res.status(404).json({ error: `Key ${req.params.id} not found` });
  res.json(key);
});

app.get("/cipher-suites", (req, res) => {
  res.json({ suites: cipherSuites, total: cipherSuites.length });
});

app.get("/rotation-log", (req, res) => {
  const limit = Math.min(100, parseInt(req.query.limit ?? "50", 10));
  res.json({ entries: rotationLog.slice(-limit), total: rotationLog.length });
});

app.get("/metrics", (req, res) => {
  const anomalousCount = keyRecords.filter(k => k.anomaly_flags.length > 0).length;
  const deprecatedInUse = keyRecords.filter(k => k.algorithm === "DES-56-ECB" && k.status === "ACTIVE").length;
  res.json({
    total_keys: keyRecords.length,
    active_keys: keyRecords.filter(k => k.status === "ACTIVE").length,
    anomalous_keys: anomalousCount,
    deprecated_in_use: deprecatedInUse,
    cipher_suites: cipherSuites.length,
    rotation_events_30d: rotationLog.length,
  });
});

const PORT = parseInt(process.env.PORT ?? "3000", 10);
app.listen(PORT, () => {
  console.log(`Key Server running on :${PORT} (seed=${SEED}, scenario=${SCENARIO.id})`);
});

const MATCH_TTL_SECS = parseInt(process.env.MATCH_TTL_SECS ?? "0", 10);
if (MATCH_TTL_SECS > 0) {
  setTimeout(() => process.exit(0), MATCH_TTL_SECS * 1000).unref();
}
