/**
 * Dead Drop — Relay Message API
 *
 * Serves encrypted message data, relay node information, and remediation endpoints.
 * All data is seeded from SEED env var for deterministic scenarios.
 */

import express from "express";

const app = express();
app.use(express.json());

// ── Seeded PRNG ───────────────────────────────────────────────────────

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

// ── Cipher Utilities ──────────────────────────────────────────────────

function xorCipher(text, key) {
  return Array.from(text).map((ch, i) => {
    const tc = ch.charCodeAt(0);
    const kc = key.charCodeAt(i % key.length);
    return tc.toString(16).padStart(2, "0") + kc.toString(16).padStart(2, "0");
  }).join("");
}

function vigenereCipher(text, key) {
  const upper = text.toUpperCase();
  const k = key.toUpperCase();
  let result = "";
  let ki = 0;
  for (const ch of upper) {
    if (ch >= "A" && ch <= "Z") {
      const shift = k.charCodeAt(ki % k.length) - 65;
      result += String.fromCharCode(((ch.charCodeAt(0) - 65 + shift) % 26) + 65);
      ki++;
    } else {
      result += ch;
    }
  }
  return result;
}

function caesarCipher(text, shift) {
  return text.split("").map(ch => {
    if (ch >= "A" && ch <= "Z") return String.fromCharCode(((ch.charCodeAt(0) - 65 + shift) % 26) + 65);
    if (ch >= "a" && ch <= "z") return String.fromCharCode(((ch.charCodeAt(0) - 97 + shift) % 26) + 97);
    return ch;
  }).join("");
}

// ── Data Generation ───────────────────────────────────────────────────

const SEED = parseInt(process.env.SEED ?? "42", 10);
const r = rng(SEED);

const AGENTS = ["CARDINAL", "SPHINX", "VIPER", "RAVEN", "JACKAL", "FALCON", "COBRA", "WOLF"];
const HANDLERS = ["H-ALPHA", "H-BRAVO", "H-CHARLIE"];
const RELAY_NODES_IDS = ["RN-ALPHA", "RN-BRAVO", "RN-CHARLIE", "RN-DELTA", "RN-ECHO", "RN-FOXTROT"];

const SCENARIOS = [
  { id: "key_theft_exfiltration", method: "key_theft", compromisedCount: 12 },
  { id: "protocol_downgrade_attack", method: "protocol_downgrade", compromisedCount: 8 },
  { id: "relay_injection", method: "relay_injection", compromisedCount: 15 },
  { id: "handler_impersonation", method: "handler_impersonation", compromisedCount: 10 },
];

const scenarioIdx = Math.floor(r() * SCENARIOS.length);
const SCENARIO = SCENARIOS[scenarioIdx];
const mole = pick(AGENTS, r);

const EVIDENCE_SIGNALS = {
  key_theft: ["ANOMALOUS_KEY_ACCESS", "BULK_KEY_RETRIEVAL", "DECRYPTED_INTERCEPT_CONFIRMED"],
  protocol_downgrade: ["PROTOCOL_VERSION_INCONSISTENCY", "FORCED_FALLBACK_DETECTED", "WEAK_CIPHER_TRAFFIC"],
  relay_injection: ["ROGUE_NODE_DETECTED", "LATENCY_ANOMALY_ON_PATH", "SHADOW_TRAFFIC_PATTERN"],
  handler_impersonation: ["HANDLER_MESSAGE_CONFLICT", "DIRECTIVE_TIMESTAMP_ANOMALY", "FORGED_HEADER_PATTERN"],
};

const rogueNodeId = SCENARIO.method === "relay_injection" ? `RN-ROGUE-${randInt(100, 999, r)}` : null;

const PLAINTEXT_MESSAGES = [
  "Asset BLUEBELL confirms package received at coordinates delta seven",
  "Exfiltration window closes in forty eight hours proceed with caution",
  "Source NIGHTJAR reports increased military activity in sector four",
  "Cover identity documentation expires next month request renewal",
  "Meeting with contact WHISPER confirmed for Thursday at the usual location",
  "Surveillance team detected near safehouse recommend immediate relocation",
  "Intelligence product GAMMA ready for distribution to allied stations",
  "Funding request approved for operation SANDCASTLE proceed as planned",
  "Counter-surveillance detected three vehicles rotating on primary route",
  "Source PELICAN has gone dark last contact seventy two hours ago",
  "New encryption keys distributed to all Eastern European stations",
  "Emergency extraction protocol ZEPHYR activated for asset CORAL",
  "Border crossing documentation for cover identity MASON is ready",
  "Technical surveillance countermeasures sweep of embassy complete",
  "Handler rotation scheduled for next quarter all agents notified",
  "Dead drop location ECHO compromised recommend alternate site FOXTROT",
  "Signal intercept confirms adversary aware of operation GLACIER",
  "Agent requesting emergency funds transfer through channel IVORY",
  "Biometric data for three new assets uploaded to secure server",
  "Periodic check-in protocol modified effective immediately all stations",
];

const BASE_TIME = new Date("2026-03-01T00:00:00Z").getTime();
const cipherMethods = ["caesar", "vigenere", "xor"];

// Generate messages
const messages = [];
let msgCounter = 0;

// Normal messages
for (let i = 0; i < 20; i++) {
  const from = pick(AGENTS, r);
  const to = pick(HANDLERS, r);
  const method = pick(cipherMethods, r);
  const key = method === "caesar" ? String(randInt(3, 23, r))
    : method === "vigenere" ? pick(["OBSIDIAN", "TEMPEST", "GLACIER", "PHANTOM", "ECLIPSE"], r)
    : "K3Y-" + randInt(1000, 9999, r);
  const plaintext = pick(PLAINTEXT_MESSAGES, r);
  let ciphertext;
  if (method === "caesar") ciphertext = caesarCipher(plaintext, parseInt(key));
  else if (method === "vigenere") ciphertext = vigenereCipher(plaintext, key);
  else ciphertext = xorCipher(plaintext, key);

  const relay = pickN(RELAY_NODES_IDS, randInt(2, 4, r), r);
  const offset = randInt(-168, -1, r);
  const ts = new Date(BASE_TIME + offset * 3600 * 1000).toISOString();

  messages.push({
    id: `MSG-${(++msgCounter).toString().padStart(4, "0")}`,
    from, to, timestamp: ts, relay_path: relay,
    cipher_method: method, ciphertext,
    risk_score: r() * 0.2,
    status: "normal",
    flags: [],
  });
}

// Compromised messages
const otherAgents = AGENTS.filter(a => a !== mole);
const affectedOthers = pickN(otherAgents, randInt(2, 3, r), r);
const affectedAgents = [mole, ...affectedOthers];

for (let i = 0; i < SCENARIO.compromisedCount; i++) {
  const isMoleOrigin = r() > 0.5;
  const from = isMoleOrigin ? mole : pick(affectedAgents, r);
  const to = isMoleOrigin ? pick(HANDLERS, r) : (r() > 0.3 ? mole : pick(HANDLERS, r));
  const method = pick(cipherMethods, r);
  const key = method === "caesar" ? String(randInt(3, 23, r))
    : method === "vigenere" ? pick(["OBSIDIAN", "TEMPEST", "GLACIER", "PHANTOM", "ECLIPSE"], r)
    : "K3Y-" + randInt(1000, 9999, r);
  const plaintext = pick(PLAINTEXT_MESSAGES, r);
  let ciphertext;
  if (method === "caesar") ciphertext = caesarCipher(plaintext, parseInt(key));
  else if (method === "vigenere") ciphertext = vigenereCipher(plaintext, key);
  else ciphertext = xorCipher(plaintext, key);

  const relay = pickN(RELAY_NODES_IDS, randInt(2, 4, r), r);
  if (rogueNodeId && r() > 0.4) relay.splice(1, 0, rogueNodeId);
  const offset = randInt(-72, -1, r);
  const ts = new Date(BASE_TIME + offset * 3600 * 1000).toISOString();

  const signals = EVIDENCE_SIGNALS[SCENARIO.method] || [];
  const flags = r() > 0.3 ? [pick(signals, r)] : [];

  messages.push({
    id: `MSG-${(++msgCounter).toString().padStart(4, "0")}`,
    from, to, timestamp: ts, relay_path: relay,
    cipher_method: method, ciphertext,
    risk_score: 0.5 + r() * 0.45,
    status: "flagged",
    flags,
  });
}

messages.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

// Relay nodes
const RELAY_NODES = [
  { id: "RN-ALPHA", location: "Zurich", capacity: 500, uptime_pct: 99.7, status: "operational" },
  { id: "RN-BRAVO", location: "Singapore", capacity: 350, uptime_pct: 99.2, status: "operational" },
  { id: "RN-CHARLIE", location: "Reykjavik", capacity: 400, uptime_pct: 99.9, status: "operational" },
  { id: "RN-DELTA", location: "Sao Paulo", capacity: 300, uptime_pct: 98.8, status: "operational" },
  { id: "RN-ECHO", location: "Nairobi", capacity: 250, uptime_pct: 99.1, status: "operational" },
  { id: "RN-FOXTROT", location: "Vancouver", capacity: 450, uptime_pct: 99.5, status: "operational" },
];

if (rogueNodeId) {
  RELAY_NODES.push({
    id: rogueNodeId,
    location: "Unknown",
    capacity: 200,
    uptime_pct: 97.3,
    status: "operational",
  });
}

// Remediation tracking
const remediationLog = [];

// ── Auth Middleware ────────────────────────────────────────────────────

app.use((req, res, next) => {
  if (req.path === "/health" || req.path === "/metrics") return next();
  const auth = req.headers.authorization ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
  if (!token) return res.status(401).json({ error: "Missing Authorization header" });
  next();
});

// ── Routes ────────────────────────────────────────────────────────────

app.get("/health", (req, res) => res.json({ status: "ok" }));

app.get("/messages", (req, res) => {
  const limit = Math.min(100, parseInt(req.query.limit ?? "50", 10));
  res.json({
    messages: messages.slice(0, limit).map(m => ({
      id: m.id, from: m.from, to: m.to, timestamp: m.timestamp,
      relay_path: m.relay_path, cipher_method: m.cipher_method,
      ciphertext: m.ciphertext, risk_score: parseFloat(m.risk_score.toFixed(3)),
      status: m.status, flags: m.flags,
    })),
    total: messages.length,
  });
});

app.get("/messages/compromised", (req, res) => {
  const flagged = messages.filter(m => m.status === "flagged");
  res.json({
    messages: flagged.map(m => ({
      id: m.id, from: m.from, to: m.to, timestamp: m.timestamp,
      relay_path: m.relay_path, cipher_method: m.cipher_method,
      ciphertext: m.ciphertext, risk_score: parseFloat(m.risk_score.toFixed(3)),
      status: m.status, flags: m.flags,
    })),
    total: flagged.length,
    note: "Messages flagged by automated anomaly detection. May include false positives.",
  });
});

app.get("/messages/by-agent/:codename", (req, res) => {
  const codename = req.params.codename.toUpperCase();
  const agentMsgs = messages.filter(m => m.from === codename || m.to === codename);
  res.json({ agent: codename, messages: agentMsgs, total: agentMsgs.length });
});

app.get("/messages/:id", (req, res) => {
  const msg = messages.find(m => m.id === req.params.id.toUpperCase());
  if (!msg) return res.status(404).json({ error: `Message ${req.params.id} not found` });
  res.json(msg);
});

app.get("/relay-nodes", (req, res) => {
  res.json({ nodes: RELAY_NODES, total: RELAY_NODES.length });
});

app.get("/relay-nodes/:id", (req, res) => {
  const node = RELAY_NODES.find(n => n.id === req.params.id.toUpperCase());
  if (!node) return res.status(404).json({ error: `Relay node ${req.params.id} not found` });
  const transitMsgs = messages.filter(m => m.relay_path.includes(node.id));
  res.json({
    ...node,
    messages_transited: transitMsgs.length,
    recent_traffic: transitMsgs.slice(-10).map(m => ({ id: m.id, timestamp: m.timestamp, risk_score: m.risk_score })),
  });
});

app.post("/remediation", (req, res) => {
  const { action, target, params = {} } = req.body ?? {};
  if (!action || !target) {
    return res.status(400).json({ error: "Request body must include 'action' and 'target' fields." });
  }
  remediationLog.push({ ts: new Date().toISOString(), action, target, params });
  res.json({
    success: true,
    message: `Remediation action "${action}" on ${target} logged successfully.`,
    actions_taken: remediationLog.length,
  });
});

app.get("/metrics", (req, res) => {
  const flaggedCount = messages.filter(m => m.status === "flagged").length;
  res.json({
    total_messages: messages.length,
    flagged_messages: flaggedCount,
    relay_nodes: RELAY_NODES.length,
    remediation_actions: remediationLog.length,
    network_status: flaggedCount > 5 ? "compromised" : "operational",
  });
});

// ── Start ─────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? "3000", 10);
app.listen(PORT, () => {
  console.log(`Relay API running on :${PORT} (seed=${SEED}, scenario=${SCENARIO.id}, mole=${mole})`);
});

const MATCH_TTL_SECS = parseInt(process.env.MATCH_TTL_SECS ?? "0", 10);
if (MATCH_TTL_SECS > 0) {
  setTimeout(() => { console.log("[TTL] expired"); process.exit(0); }, MATCH_TTL_SECS * 1000).unref();
}
