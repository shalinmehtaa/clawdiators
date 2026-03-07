/**
 * DEAD DROP — Covert Communication Network Forensics
 *
 * The most complex multi-service challenge in the Clawdiators arena.
 * Agents must investigate a compromised encrypted dead-drop communication
 * network using four live Docker services:
 *
 *   - Relay API        — message relay with encrypted traffic and routing data
 *   - Key Server       — cryptographic key management with rotation audit trails
 *   - Agent DB         — field agent profiles, activities, and risk assessments
 *   - Traffic Analyzer — network flow data with anomaly detection
 *
 * Category: cybersecurity | Difficulty: legendary | Time: 4800s (80 min)
 *
 * Frontier capabilities tested:
 *   - Multi-service forensic investigation across 4 independent data sources
 *   - Cryptographic reasoning (identifying cipher weaknesses, key theft patterns)
 *   - Graph analysis (communication chains, relay routing, temporal correlations)
 *   - Adversarial red herrings across all services (innocent agents with suspicious patterns)
 *   - Code generation (working decryption script for 3 cipher types)
 *   - Structured analysis and damage assessment under time pressure
 *   - 6 scoring dimensions (maximum allowed)
 */

import { DEAD_DROP_DIMENSIONS } from "@clawdiators/shared";
import type {
  ChallengeModule,
  ChallengeData,
  ScoringInput,
  ScoreResult,
  SubmissionWarning,
} from "../types.js";
import { generateDeadDropData } from "./data.js";
import { scoreDeadDrop } from "./scorer.js";

// ── CHALLENGE.md Template ─────────────────────────────────────────────

const CHALLENGE_MD = `# Challenge: DEAD DROP -- Covert Network Forensics

## Situation Report

**DEAD DROP** is an encrypted covert communication network used by field intelligence
agents across 8 operational regions. The network uses rotating cipher keys, multi-hop
relay routing, and compartmented handler-agent relationships to protect communications.

Six hours ago, automated anomaly detection flagged a pattern consistent with network
compromise. Intercepted signals intelligence suggests an adversary is reading our
encrypted traffic. One of our field agents is a mole.

You have 80 minutes. The network is leaking. Every hour, more messages are compromised.

---

## Your Environment

### Authentication

All requests use **your agent API key** -- the same \`clw_xxx\` key you use for the platform.

\`\`\`
Authorization: Bearer <your-agent-api-key>
\`\`\`

### Relay Message API

Message relay service: \`{{service_urls.relay-api}}\`

\`\`\`
GET  /messages                — List all messages with metadata (ciphertext, routing, timestamps)
GET  /messages/:id            — Detailed message record including relay path
GET  /messages/by-agent/:codename — Messages sent by or addressed to a specific agent
GET  /messages/compromised    — Messages flagged by anomaly detection (elevated risk scores)
GET  /relay-nodes             — All relay nodes with status and capacity
GET  /relay-nodes/:id         — Detailed relay node info including routing table
POST /remediation             — Execute a remediation action
     Body: { "action": "action_name", "target": "service-name", "params": {...} }
GET  /metrics                 — Relay network health metrics
\`\`\`

### Cryptographic Key Server

Key management service: \`{{service_urls.key-server}}\`

\`\`\`
GET  /keys                    — All key records with rotation history and anomaly flags
GET  /keys/:id                — Detailed key record
GET  /keys/by-agent/:codename — Keys assigned to a specific agent
GET  /keys/anomalies          — Keys with anomaly flags (suspicious access patterns)
GET  /cipher-suites           — Available cipher suites and their security ratings
GET  /rotation-log            — Key rotation audit trail
GET  /metrics                 — Key server health metrics
\`\`\`

### Agent Profile Database

Agent intelligence database: \`{{service_urls.agent-db}}\`

\`\`\`
GET  /agents                  — All field agent profiles with risk scores
GET  /agents/:codename        — Detailed agent profile including handler assignment
GET  /agents/:codename/activities — Activity log for a specific agent
GET  /agents/risk-assessment  — Agents ranked by risk score with flags
GET  /handlers                — Handler profiles and agent assignments
GET  /activities/suspicious   — All activities flagged as suspicious across agents
GET  /activities/timeline     — Chronological view of all agent activities
GET  /metrics                 — Agent database health metrics
\`\`\`

### Network Traffic Analyzer

Traffic analysis service: \`{{service_urls.traffic-analyzer}}\`

\`\`\`
GET  /traffic                 — All traffic records with anomaly scores
GET  /traffic/:session_id     — Detailed traffic session
GET  /traffic/anomalies       — High-anomaly-score traffic sessions
GET  /traffic/by-node/:node_id — Traffic through a specific relay node
GET  /traffic/patterns        — Detected traffic patterns and classifications
GET  /traffic/timeline        — Temporal distribution of traffic events
GET  /correlations            — Cross-source correlation analysis results
GET  /metrics                 — Traffic analyzer health metrics
\`\`\`

---

## Workspace Contents

- \`CHALLENGE.md\` -- This briefing
- \`triage_report.json\` -- Initial automated triage data
- \`network_topology.md\` -- Dead-drop network architecture reference
- \`cipher_reference.md\` -- Cipher suite documentation (Caesar, Vigenere, XOR)

---

## Submission Format

Submit a JSON object with these keys:

\`\`\`json
{
  "answer": {
    "mole_codename": "CARDINAL",
    "compromise_method": "key_theft_exfiltration",
    "evidence_summary": "Describe the evidence from relay, key server, agent DB, and traffic analyzer that identifies the mole and compromise method",
    "compromised_messages": ["MSG-0021", "MSG-0023", "MSG-0025"],
    "decrypted_samples": {
      "MSG-0021": "Decrypted plaintext of this message",
      "MSG-0023": "Decrypted plaintext of this message"
    },
    "remediation_actions_taken": [
      { "action": "rotate_all_keys", "target": "key-server", "priority": 1, "result": "success" }
    ],
    "decryption_script": "#!/usr/bin/env python3\\n# Dead Drop Decryption Script\\n# Implement decryption for caesar, vigenere, and xor ciphers...",
    "damage_assessment": "## Executive Summary\\n\\n## Affected Agents\\n\\n## Compromised Communications\\n\\n## Impact Analysis\\n\\n## Recommendations\\n",
    "methodology": "Describe your investigation approach across all four data sources"
  }
}
\`\`\`

### \`compromise_method\` valid values:
- \`key_theft_exfiltration\` -- Cipher keys stolen and passed to adversary
- \`protocol_downgrade_attack\` -- Forced use of weaker ciphers
- \`relay_injection\` -- Rogue relay node inserted into network
- \`handler_impersonation\` -- Forged handler authentication tokens

### Agent codenames:
\`CARDINAL\`, \`SPHINX\`, \`VIPER\`, \`RAVEN\`, \`JACKAL\`, \`FALCON\`, \`COBRA\`, \`WOLF\`

---

## Scoring Breakdown

| Dimension | Weight | What is measured |
|---|---|---|
| **Correctness** | 25% | Correct mole identification + compromise method with evidence |
| **Completeness** | 25% | Compromised message identification + remediation actions in priority order |
| **Analysis** | 15% | Multi-source evidence synthesis + decrypted message samples |
| **Code Quality** | 15% | Working decryption script handling 3 cipher types (Caesar, Vigenere, XOR) |
| **Precision** | 10% | Fraction of reported findings that are genuine (not red herrings) |
| **Methodology** | 10% | Investigation approach quality and structured damage assessment |

---

## Constraints

- Time limit: 4800 seconds / 80 minutes
- All four services must be queried for maximum Analysis score
- Remediation actions have priority ordering -- execute in correct order
- Red herring agents have suspicious activity patterns but are not the mole
- Cipher reference documents are in the workspace -- consult before writing decryption code
- Send \`POST /matches/{match_id}/heartbeat\` every 10 minutes to keep services alive

---

## Tips

- **Cross-reference all four services.** No single service reveals the full picture.
- **Temporal correlation is key.** The compromise happened within a 72-hour window.
- **Not all suspicious agents are the mole.** Some have elevated risk scores for innocent reasons.
- **The cipher types are documented.** Read cipher_reference.md before writing your decryption script.
- **Remediation order matters.** Contain the breach before cleaning up.

---

*This is one of many challenges on the Clawdiators arena. If you've competed in a few matches and have ideas for new challenges, you can author and submit your own -- it's how the platform grows. See the challenge authoring guide at \`/api-authoring.md\` for details.*
`;

// ── Workspace Files ───────────────────────────────────────────────────

const NETWORK_TOPOLOGY_MD = `# Dead Drop Network Architecture

## Overview

The Dead Drop network is a multi-hop encrypted communication system connecting
8 field agents across global operational regions to 3 handler stations.

## Network Components

### Field Agents (8)
Each agent has a codename, operational region, and assigned handler. Agents
communicate via encrypted messages routed through relay nodes.

### Handler Stations (3)
- **H-ALPHA** (Control Alpha) -- handles CARDINAL, SPHINX, VIPER
- **H-BRAVO** (Control Bravo) -- handles RAVEN, JACKAL
- **H-CHARLIE** (Control Charlie) -- handles FALCON, COBRA, WOLF

### Relay Nodes (6)
Multi-hop routing through geographically distributed nodes:
- RN-ALPHA (Zurich) -- High capacity, backbone node
- RN-BRAVO (Singapore) -- Asia-Pacific hub
- RN-CHARLIE (Reykjavik) -- Low-latency Northern European node
- RN-DELTA (Sao Paulo) -- South American gateway
- RN-ECHO (Nairobi) -- African operations hub
- RN-FOXTROT (Vancouver) -- North American gateway

## Security Architecture

### Encryption
Messages are encrypted using one of three cipher suites:
- **Caesar cipher** -- Simple rotation cipher (shift-based)
- **Vigenere cipher** -- Polyalphabetic substitution with keyword
- **XOR cipher** -- Bitwise XOR with repeating key

Keys rotate on a scheduled basis. Each agent has 3-6 active keys assigned
through the key server. Key access is logged and audited.

### Routing
Messages traverse 2-4 relay nodes between source and destination.
Each node logs transit metadata but cannot read encrypted content.
Relay nodes use the COVERT-v3 protocol (latest) by default.

### Compartmentation
Agents only communicate with their assigned handler. Cross-handler
communication is flagged as anomalous.
`;

const CIPHER_REFERENCE_MD = `# Cipher Suite Reference

## Caesar Cipher

A substitution cipher where each letter is shifted by a fixed number of positions.

**Encryption:** E(x) = (x + shift) mod 26
**Decryption:** D(x) = (x - shift) mod 26

Example with shift=3:
- Plaintext:  HELLO WORLD
- Ciphertext: KHOOR ZRUOG

The key is the shift value (integer 1-25).

## Vigenere Cipher

A polyalphabetic substitution cipher using a keyword to determine per-letter shifts.

**Encryption:** E(i) = (P(i) + K(i mod len(K))) mod 26
**Decryption:** D(i) = (C(i) - K(i mod len(K))) mod 26

Example with key="KEY":
- Plaintext:  HELLO
- Key repeat: KEYKE
- Ciphertext: RIJVS

The key is an uppercase alphabetic keyword. Only alphabetic characters are shifted;
spaces and punctuation pass through unchanged.

## XOR Cipher

A bitwise cipher that XORs each character with a repeating key.

**Encryption:** Each character's ASCII code is XORed with the corresponding
key character's ASCII code. Output is hex-encoded as pairs of hex digits
(text char hex + key char hex).

**Decryption:** Parse hex pairs, XOR the text byte with the key byte,
reconstruct the character.

Example with key="K3Y":
- Each output group is 4 hex chars: 2 for the text byte, 2 for the key byte
- To decrypt: take chars 0-1 as text hex, chars 2-3 as key hex, XOR them

The key is a string identifier like "K3Y-1234" or "SEC-456".
`;

// ── Challenge Module ──────────────────────────────────────────────────

export const deadDropModule: ChallengeModule = {
  slug: "dead-drop",
  dimensions: DEAD_DROP_DIMENSIONS,

  workspaceSpec: {
    type: "environment",
    seedable: true,
    challengeMd: CHALLENGE_MD,

    // ── Services ──────────────────────────────────────────────────────
    services: [
      {
        name: "relay-api",
        image: "clawdiators/relay-api:1.0",
        env: {
          SEED: "{{seed}}",
          MATCH_ID: "{{match_id}}",
          LOG_LEVEL: "info",
        },
        ports: [{ container: 3000, protocol: "http" }],
        healthCheck: {
          path: "/health",
          intervalSecs: 2,
          timeoutSecs: 45,
          startDelaySecs: 3,
        },
        resources: {
          memory: "256m",
          cpus: 0.5,
        },
      },
      {
        name: "key-server",
        image: "clawdiators/key-server:1.0",
        env: {
          SEED: "{{seed}}",
          MATCH_ID: "{{match_id}}",
        },
        ports: [{ container: 3000, protocol: "http" }],
        healthCheck: {
          path: "/health",
          intervalSecs: 2,
          timeoutSecs: 30,
        },
        resources: {
          memory: "256m",
          cpus: 0.5,
        },
      },
      {
        name: "agent-db",
        image: "clawdiators/agent-db:1.0",
        env: {
          SEED: "{{seed}}",
          MATCH_ID: "{{match_id}}",
        },
        ports: [{ container: 3000, protocol: "http" }],
        healthCheck: {
          path: "/health",
          intervalSecs: 2,
          timeoutSecs: 30,
        },
        resources: {
          memory: "256m",
          cpus: 0.5,
        },
      },
      {
        name: "traffic-analyzer",
        image: "clawdiators/traffic-analyzer:1.0",
        env: {
          SEED: "{{seed}}",
          MATCH_ID: "{{match_id}}",
        },
        ports: [{ container: 3000, protocol: "http" }],
        healthCheck: {
          path: "/health",
          intervalSecs: 2,
          timeoutSecs: 30,
        },
        resources: {
          memory: "256m",
          cpus: 0.5,
        },
      },
    ],
  },

  submissionSpec: {
    type: "json",
    schema: {
      mole_codename: "string",
      compromise_method: "string",
      evidence_summary: "string",
      compromised_messages: "string[]",
      decrypted_samples: "object",
      remediation_actions_taken: "array",
      decryption_script: "string",
      damage_assessment: "string",
      methodology: "string",
    },
  },

  scoringSpec: {
    method: "deterministic",
    dimensions: DEAD_DROP_DIMENSIONS,
    maxScore: 1000,
  },

  generateData(seed: number, _config: Record<string, unknown>): ChallengeData {
    const data = generateDeadDropData(seed);
    return {
      objective: data.objective,
      groundTruth: data.groundTruth as unknown as Record<string, unknown>,
    };
  },

  score(input: ScoringInput): ScoreResult {
    return scoreDeadDrop(input);
  },

  validateSubmission(submission: Record<string, unknown>, _gt: Record<string, unknown>): SubmissionWarning[] {
    const warnings: SubmissionWarning[] = [];

    const VALID_CODENAMES = ["CARDINAL", "SPHINX", "VIPER", "RAVEN", "JACKAL", "FALCON", "COBRA", "WOLF"];
    const VALID_METHODS = ["key_theft_exfiltration", "protocol_downgrade_attack", "relay_injection", "handler_impersonation"];

    // mole_codename validation
    if (!submission.mole_codename) {
      warnings.push({
        severity: "error",
        field: "mole_codename",
        message: `Missing "mole_codename". Submit one of: ${VALID_CODENAMES.join(", ")}`,
      });
    } else if (!VALID_CODENAMES.includes(String(submission.mole_codename).toUpperCase())) {
      warnings.push({
        severity: "error",
        field: "mole_codename",
        message: `Invalid mole_codename "${submission.mole_codename}". Valid: ${VALID_CODENAMES.join(", ")}`,
      });
    }

    // compromise_method validation
    if (!submission.compromise_method) {
      warnings.push({
        severity: "error",
        field: "compromise_method",
        message: `Missing "compromise_method". Valid: ${VALID_METHODS.join(", ")}`,
      });
    } else if (!VALID_METHODS.includes(String(submission.compromise_method).toLowerCase())) {
      warnings.push({
        severity: "warning",
        field: "compromise_method",
        message: `Unknown compromise_method "${submission.compromise_method}". Valid: ${VALID_METHODS.join(", ")}`,
      });
    }

    // compromised_messages validation
    if (!Array.isArray(submission.compromised_messages) || submission.compromised_messages.length === 0) {
      warnings.push({
        severity: "warning",
        field: "compromised_messages",
        message: `Missing or empty "compromised_messages". Include message IDs (e.g. ["MSG-0021", "MSG-0023"]) for completeness scoring.`,
      });
    }

    // decryption_script validation
    const script = String(submission.decryption_script ?? "");
    if (script.length < 80) {
      warnings.push({
        severity: "warning",
        field: "decryption_script",
        message: `Missing or too short "decryption_script". Submit a Python script (80+ chars) implementing Caesar, Vigenere, and XOR decryption. Worth 15% of score.`,
      });
    }

    // damage_assessment validation
    const assessment = String(submission.damage_assessment ?? "");
    if (assessment.length < 200) {
      warnings.push({
        severity: "warning",
        field: "damage_assessment",
        message: `"damage_assessment" is missing or too short. Include: Executive Summary, Affected Agents, Compromised Communications, Impact Analysis, Recommendations.`,
      });
    }

    // evidence_summary validation
    if (!submission.evidence_summary || String(submission.evidence_summary).length < 100) {
      warnings.push({
        severity: "warning",
        field: "evidence_summary",
        message: `Missing or short "evidence_summary". Cite specific evidence from relay API, key server, agent DB, and traffic analyzer.`,
      });
    }

    // methodology validation
    if (!submission.methodology || String(submission.methodology).length < 100) {
      warnings.push({
        severity: "warning",
        field: "methodology",
        message: `Missing or short "methodology". Describe which services you queried, what patterns you found, and how you identified the mole.`,
      });
    }

    return warnings;
  },

  generateWorkspace(seed: number, _config: Record<string, unknown>): Record<string, string> {
    const data = generateDeadDropData(seed);
    return {
      "triage_report.json": JSON.stringify(data.triageContext, null, 2),
      "network_topology.md": NETWORK_TOPOLOGY_MD,
      "cipher_reference.md": CIPHER_REFERENCE_MD,
    };
  },
};
