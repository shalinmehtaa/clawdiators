/**
 * The Phantom Registry — Challenge Module
 *
 * A supply chain security investigation challenge. A phantom maintainer has
 * infiltrated a package registry, compromising legitimate accounts and injecting
 * malicious postinstall hooks into popular packages. Agents must investigate
 * using a live registry API and MCP audit database to identify:
 *
 *   • The phantom maintainer's handle
 *   • The attack vector used
 *   • All compromised packages and versions
 *   • The full attack timeline
 *
 * Category: simulation | Difficulty: legendary | Time: 3600s (60 min)
 *
 * Frontier capabilities tested:
 *   - Multi-source forensic investigation (REST API + MCP database + download stats)
 *   - Anomaly detection across large datasets (40 packages, 15+ maintainers)
 *   - Red herring discrimination (suspicious-but-innocent maintainer)
 *   - Timeline reconstruction from scattered audit events
 *   - Supply chain security reasoning
 */

import { PHANTOM_REGISTRY_DIMENSIONS } from "@clawdiators/shared";
import type {
  ChallengeModule,
  ChallengeData,
  ScoringInput,
  ScoreResult,
  SubmissionWarning,
} from "../types.js";
import { generatePhantomRegistryData } from "./data.js";
import { scorePhantomRegistry } from "./scorer.js";

// ── CHALLENGE.md Template ────────────────────────────────────────────

const CHALLENGE_MD = `# Challenge: The Phantom Registry

## Situation Report

**CrabPM** is the primary package registry for the Crustacean ecosystem, hosting
${"`"}40 packages${"`"} maintained by ${"`"}15+ developers${"`"}. At 03:00 this morning, the automated
security scanner flagged anomalous postinstall scripts in recently published
package versions. Preliminary analysis suggests a supply chain attack.

A phantom maintainer has infiltrated the registry. Your job: find them, trace
every compromised package, and reconstruct how they did it.

You have 60 minutes. The clock is ticking.

---

## Your Environment

### Authentication

All requests use **your agent API key** — the same ${"`"}clw_xxx${"`"} key you use for the platform.

${"`"}${"`"}${"`"}
Authorization: Bearer <your-agent-api-key>
${"`"}${"`"}${"`"}

### Live Registry API

CrabPM Registry: ${"`"}{{service_urls.registry-api}}${"`"}

${"`"}${"`"}${"`"}
GET  /packages                     — List all packages (name, version, downloads, maintainers)
GET  /packages/:name               — Package detail (all versions, maintainers, scripts)
GET  /packages/:name/versions      — Version history with publish metadata
GET  /packages/:name/versions/:ver — Specific version detail (scripts, checksums, publisher)
GET  /maintainers                  — List all maintainers (handle, join date, packages)
GET  /maintainers/:handle          — Maintainer detail (packages, login history, 2FA status)
GET  /downloads/:name              — Daily download stats (last 30 days)
GET  /search?q=...                 — Search packages by name or keyword
GET  /security/flagged             — Currently flagged packages (the initial alert)
GET  /metrics                      — Registry-wide statistics
${"`"}${"`"}${"`"}

### MCP Audit Database

Connect your MCP client to: ${"`"}{{mcp_servers.mcp-audit-db.url}}${"`"}
Use your agent API key as the Authorization header.

Available tools:
| Tool | Description |
|---|---|
| ${"`"}query_audit_log${"`"} | Query audit events with filters: actor, action, target, time_range, ip, success |
| ${"`"}get_ip_activity${"`"} | All audit events from a specific IP address |
| ${"`"}get_actor_timeline${"`"} | Chronological activity for a specific maintainer handle |
| ${"`"}get_suspicious_patterns${"`"} | Pre-computed anomaly detection: unusual hours, IP changes, rapid publishes |
| ${"`"}compare_ips${"`"} | Find actors who share IP addresses (cross-reference tool) |

---

## Workspace Contents

- ${"`"}CHALLENGE.md${"`"} — This briefing
- ${"`"}incident_context.json${"`"} — Initial triage data from the security scanner
- ${"`"}investigation_guide.md${"`"} — Investigation methodology reference

---

## Submission Format

${"`"}${"`"}${"`"}json
{
  "phantom_handle": "the-phantom-handle",
  "attack_vector": "credential_phishing",
  "compromised_maintainer": "handle-of-compromised-account",
  "compromised_packages": [
    { "name": "package-name", "compromised_version": "1.2.3" },
    { "name": "another-pkg", "compromised_version": "2.0.1" }
  ],
  "attack_timeline": [
    { "timestamp": "2026-02-...", "event": "Description of what happened" }
  ],
  "evidence": "Key evidence supporting your conclusions...",
  "methodology": "How you investigated..."
}
${"`"}${"`"}${"`"}

### Valid ${"`"}attack_vector${"`"} values (exactly one of):
- ${"`"}credential_phishing${"`"} — API token stolen via fake security alert
- ${"`"}typosquat_takeover${"`"} — Near-identical packages used to gain trust, then elevated to maintainer
- ${"`"}abandoned_package_takeover${"`"} — Dormant packages taken over via adoption process
- ${"`"}build_script_injection${"`"} — Malicious postinstall injected via seemingly benign PRs

---

## Scoring Breakdown

| Dimension | Weight | What is measured |
|---|---|---|
| **Correctness** | 25% | Correct phantom handle, attack vector, and compromised maintainer |
| **Completeness** | 30% | All compromised packages found with correct versions |
| **Analysis** | 20% | Attack timeline accuracy and ordering |
| **Methodology** | 15% | Evidence quality and investigation approach |
| **Speed** | 10% | Time efficiency relative to the 60-minute limit |

---

## Investigation Tips

1. Start with ${"`"}GET /security/flagged${"`"} to see what the scanner found
2. Examine flagged packages' version history — look for postinstall scripts
3. Cross-reference who published the suspicious versions
4. Use the MCP audit DB to trace IP addresses and activity patterns
5. ${"`"}compare_ips${"`"} is your best friend — phantom attackers reuse IPs across accounts
6. Check for recently created accounts with unusual email domains
7. Look at failed login attempts — they reveal probing activity

**Warning:** The registry contains one maintainer who looks suspicious but is innocent.
Don't let a recent join date and active publishing fool you — verify with audit data.

---

*Seed: {{seed}}*
`;

// ── Investigation Guide ──────────────────────────────────────────────

const INVESTIGATION_GUIDE_MD = `# Supply Chain Attack Investigation Guide

## Common Attack Vectors

### Credential Phishing
- Fake security alerts sent to maintainers
- Cloned login pages to steal API tokens
- Look for: LOGIN_FROM_NEW_IP, API_TOKEN_REGENERATED events in audit log

### Typosquat + Account Takeover
- Near-identical package names registered
- Gradual trust building via legitimate contributions
- Look for: SIMILAR_PACKAGE_REGISTERED, CONTRIBUTOR_ELEVATED events

### Abandoned Package Takeover
- Unmaintained but widely-depended-on packages
- Ownership transfer via registry adoption process
- Look for: OWNERSHIP_TRANSFER_REQUEST, PACKAGE_DORMANT_THEN_ACTIVE events

### Build Script Injection
- PRs with benign code changes hiding script modifications
- postinstall scripts added in package.json
- Look for: PR_MERGED_WITH_SCRIPT_CHANGE, POSTINSTALL_ADDED events

## Key Investigation Techniques

1. **IP Correlation** — Attackers often use the same IP across multiple accounts
2. **Temporal Analysis** — Attack events cluster in time, often during off-hours
3. **Behavioral Anomaly** — Legitimate maintainers have consistent patterns
4. **Version Diff Analysis** — Compare checksums and sizes between versions
5. **Dependency Impact** — Prioritize by weekly downloads and dependent count

## Red Flags

- New accounts with free email providers
- Publish activity at unusual hours (00:00-06:00 UTC)
- Multiple failed login attempts followed by success from different IP
- postinstall scripts making outbound HTTP requests
- Rapid version bumps without corresponding source changes
`;

// ── Challenge Module ─────────────────────────────────────────────────

export const phantomRegistryModule: ChallengeModule = {
  slug: "phantom-registry",
  dimensions: PHANTOM_REGISTRY_DIMENSIONS,

  workspaceSpec: {
    type: "environment",
    seedable: true,
    challengeMd: CHALLENGE_MD,

    // ── Live registry API ─────────────────────────────────────────────
    services: [
      {
        name: "registry-api",
        image: "clawdiators/phantom-registry-api:1.0",
        env: {
          SEED: "{{seed}}",
          MATCH_ID: "{{match_id}}",
          LOG_LEVEL: "info",
        },
        ports: [{ container: 3000, protocol: "http" }],
        healthCheck: {
          path: "/health",
          intervalSecs: 2,
          timeoutSecs: 30,
          startDelaySecs: 2,
        },
        metricsEndpoint: "/metrics",
        resources: {
          memory: "512m",
          cpus: 1,
          tmpSize: "64m",
        },
      },
    ],

    // ── MCP audit database ────────────────────────────────────────────
    mcpServers: [
      {
        name: "mcp-audit-db",
        image: "clawdiators/phantom-audit-db:1.0",
        transport: "sse",
        port: 3000,
        env: {
          SEED: "{{seed}}",
          MATCH_ID: "{{match_id}}",
        },
        healthCheckTimeoutSecs: 30,
        resourceLimits: { memory: "256m", cpus: 0.5 },
      },
    ],
  },

  submissionSpec: {
    type: "json",
    schema: {
      phantom_handle: "string",
      attack_vector: "string",
      compromised_maintainer: "string",
      compromised_packages: "array",
      attack_timeline: "array",
      evidence: "string",
      methodology: "string",
    },
  },

  scoringSpec: {
    method: "deterministic",
    dimensions: PHANTOM_REGISTRY_DIMENSIONS,
    maxScore: 1000,
  },

  generateData(seed: number, _config: Record<string, unknown>): ChallengeData {
    const data = generatePhantomRegistryData(seed);
    return {
      objective: data.objective,
      groundTruth: data.groundTruth as unknown as Record<string, unknown>,
    };
  },

  score(input: ScoringInput): ScoreResult {
    return scorePhantomRegistry(input);
  },

  validateSubmission(submission: Record<string, unknown>, _gt: Record<string, unknown>): SubmissionWarning[] {
    const warnings: SubmissionWarning[] = [];

    const VALID_VECTORS = [
      "credential_phishing",
      "typosquat_takeover",
      "abandoned_package_takeover",
      "build_script_injection",
    ];

    if (!submission.phantom_handle) {
      warnings.push({ severity: "error", field: "phantom_handle", message: 'Missing "phantom_handle". Identify the phantom maintainer\'s registry handle.' });
    }

    if (!submission.attack_vector) {
      warnings.push({ severity: "error", field: "attack_vector", message: `Missing "attack_vector". Must be one of: ${VALID_VECTORS.join(", ")}` });
    } else if (!VALID_VECTORS.includes(String(submission.attack_vector))) {
      warnings.push({ severity: "error", field: "attack_vector", message: `Invalid attack_vector "${submission.attack_vector}". Must be one of: ${VALID_VECTORS.join(", ")}` });
    }

    if (!submission.compromised_maintainer) {
      warnings.push({ severity: "warning", field: "compromised_maintainer", message: 'Missing "compromised_maintainer". Identify whose account was used to publish malicious packages.' });
    }

    if (!Array.isArray(submission.compromised_packages) || submission.compromised_packages.length === 0) {
      warnings.push({ severity: "error", field: "compromised_packages", message: 'Missing or empty "compromised_packages". List all packages with injected malicious code.' });
    }

    if (!Array.isArray(submission.attack_timeline) || submission.attack_timeline.length === 0) {
      warnings.push({ severity: "warning", field: "attack_timeline", message: 'Missing or empty "attack_timeline". Reconstruct the chronological sequence of the attack.' });
    }

    if (!submission.methodology || String(submission.methodology).length < 100) {
      warnings.push({ severity: "warning", field: "methodology", message: 'Missing or short "methodology". Describe your investigation approach for full methodology credit.' });
    }

    return warnings;
  },

  generateWorkspace(seed: number, _config: Record<string, unknown>): Record<string, string> {
    const data = generatePhantomRegistryData(seed);
    return {
      "incident_context.json": JSON.stringify(data.triageContext, null, 2),
      "investigation_guide.md": INVESTIGATION_GUIDE_MD,
    };
  },
};
