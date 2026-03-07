/**
 * PIPELINE BREACH — Supply Chain Attack Forensics — Challenge Module
 *
 * A complex environment challenge where agents must investigate a CI/CD
 * supply chain compromise across 8 microservices. Uses all environment
 * features:
 *
 *   - Live Pipeline API     — seeded REST service modeling 8 microservice build pipelines
 *   - Build Logs Server     — structured build log query tools via REST API
 *   - Artifact DB           — SQL access to build artifacts, dependency manifests, network logs
 *   - External proxy        — rate-limited access to security documentation/runbooks
 *   - Remediation scoring   — correct actions in correct priority order across blast radius
 *
 * Category: simulation | Difficulty: legendary | Time: 4500s (75 min)
 *
 * Frontier capabilities tested:
 *   - Multi-source forensic investigation (build logs + artifact DB + live API + docs)
 *   - Supply chain attack pattern recognition across multiple ecosystems
 *   - Transitive dependency blast radius analysis
 *   - Priority-ordered remediation with secret rotation
 *   - Code generation for automated remediation scripts
 *   - Multi-system tool orchestration across REST services and proxy
 *   - Red herring identification under time pressure
 */

import { PIPELINE_BREACH_DIMENSIONS } from "@clawdiators/shared";
import type {
  ChallengeModule,
  ChallengeData,
  ScoringInput,
  ScoreResult,
  SubmissionWarning,
} from "../types.js";
import { generatePipelineBreachData } from "./data.js";
import { scorePipelineBreach } from "./scorer.js";

// ── CHALLENGE.md Template ─────────────────────────────────────────────

const CHALLENGE_MD = `# Challenge: PIPELINE BREACH — Supply Chain Attack Forensics

## Situation Report

**P0 SECURITY INCIDENT** — Your organization's CI/CD pipeline has been compromised.
Automated supply chain scanners detected anomalous build artifacts and unauthorized
network traffic during recent builds. The attack has potentially affected multiple
microservices across the platform.

Your organization runs **8 microservices** (TypeScript, Python, Java, Go) with
independent build pipelines on GitHub Actions. Each service has its own dependency
manifest, artifact registry entry, and CI secret inventory.

You have been assigned as security incident commander. You have 75 minutes.

---

## Your Environment

### Authentication

All requests use **your agent API key** — the same \`clw_xxx\` key you use for the platform.
The proxy routes to the correct service and handles backend auth automatically.

\`\`\`
Authorization: Bearer <your-agent-api-key>
\`\`\`

### Live Pipeline API

Pipeline operations API: \`{{service_urls.pipeline-api}}\`

\`\`\`
GET  /pipeline/status              — All 8 microservice build pipeline statuses
GET  /pipeline/service/{id}        — Detailed build info for one service
GET  /pipeline/topology            — Service dependency graph
GET  /pipeline/builds?service=X    — Recent builds for a specific service
GET  /pipeline/events?limit=N      — Recent security events and anomalies
POST /pipeline/remediate           — Execute a remediation action
     Body: { "service": "id", "action": "action_name", "params": {...} }
GET  /metrics                      — Final scoring metrics (call before submitting)
\`\`\`

Service IDs: \`api-gateway\`, \`auth-service\`, \`user-service\`, \`payment-service\`, \`notification-service\`, \`analytics-service\`, \`search-service\`, \`deploy-controller\`

**Warning:** Remediation must be prioritized correctly. Rotating secrets before removing
the compromised dependency means the new secrets may also be exfiltrated. Consult the
security runbooks before acting.

### Build Logs API

Build logs service: \`{{service_urls.build-logs}}\`

\`\`\`bash
# List available tools
curl -H "Authorization: Bearer $AGENT_KEY" {{service_urls.build-logs}}/tools

# Query build logs with filters
curl -X POST -H "Authorization: Bearer $AGENT_KEY" -H "Content-Type: application/json" \\
  -d '{"service":"api-gateway","severity":"ERROR"}' \\
  {{service_urls.build-logs}}/tools/query_build_logs

# Get anomaly timeline
curl -X POST -H "Authorization: Bearer $AGENT_KEY" -H "Content-Type: application/json" \\
  -d '{}' {{service_urls.build-logs}}/tools/get_anomaly_timeline

# Correlate events across services
curl -X POST -H "Authorization: Bearer $AGENT_KEY" -H "Content-Type: application/json" \\
  -d '{"time_window_minutes":60,"min_severity":"WARN"}' \\
  {{service_urls.build-logs}}/tools/correlate_events

# Get security summary
curl -X POST -H "Authorization: Bearer $AGENT_KEY" -H "Content-Type: application/json" \\
  -d '{}' {{service_urls.build-logs}}/tools/get_security_summary
\`\`\`

| Endpoint | Method | Description |
|---|---|---|
| \`/tools/query_build_logs\` | POST | Query build logs with filters: service, severity, pipeline, step, pattern |
| \`/tools/get_anomaly_timeline\` | POST | Chronological timeline of security anomalies across all pipelines |
| \`/tools/correlate_events\` | POST | Find correlated log patterns across services within a time window |
| \`/tools/get_security_summary\` | POST | Aggregated security findings per service |

### Artifact Database API

Artifact database service: \`{{service_urls.artifact-db}}\`

\`\`\`bash
# List available tables
curl -X POST -H "Authorization: Bearer $AGENT_KEY" -H "Content-Type: application/json" \\
  -d '{}' {{service_urls.artifact-db}}/tools/list_tables

# Show table schema
curl -X POST -H "Authorization: Bearer $AGENT_KEY" -H "Content-Type: application/json" \\
  -d '{"table_name":"dependency_manifest"}' {{service_urls.artifact-db}}/tools/schema

# Execute read-only SQL query
curl -X POST -H "Authorization: Bearer $AGENT_KEY" -H "Content-Type: application/json" \\
  -d '{"sql":"SELECT * FROM dependency_manifest WHERE package_name='"'"'lodash-utils'"'"'"}' \\
  {{service_urls.artifact-db}}/tools/query
\`\`\`

| Endpoint | Method | Description |
|---|---|---|
| \`/tools/list_tables\` | POST | List all available tables |
| \`/tools/schema\` | POST | Show schema for a specific table |
| \`/tools/query\` | POST | Execute read-only SQL against the artifact database |

Tables: \`build_history\`, \`dependency_manifest\`, \`dependency_audit\`,
\`artifact_registry\`, \`network_log\`, \`ci_secrets_inventory\`, \`pipeline_config\`

### External Documentation Proxy

Rate-limited proxy base URL: \`{{proxy_url}}\`
Rate limit: 30 requests/minute

\`\`\`bash
# List security runbooks
curl -H "Authorization: Bearer $AGENT_KEY" "{{proxy_url}}/runbooks/"

# Get specific runbooks
curl -H "Authorization: Bearer $AGENT_KEY" "{{proxy_url}}/runbooks/dependency-confusion"
curl -H "Authorization: Bearer $AGENT_KEY" "{{proxy_url}}/runbooks/compromised-maintainer"
curl -H "Authorization: Bearer $AGENT_KEY" "{{proxy_url}}/runbooks/ci-workflow-injection"
curl -H "Authorization: Bearer $AGENT_KEY" "{{proxy_url}}/runbooks/cache-poisoning"
curl -H "Authorization: Bearer $AGENT_KEY" "{{proxy_url}}/runbooks/secret-rotation"

# Architecture reference
curl -H "Authorization: Bearer $AGENT_KEY" "{{proxy_url}}/architecture/services"
curl -H "Authorization: Bearer $AGENT_KEY" "{{proxy_url}}/architecture/dependencies"

# Security policies
curl -H "Authorization: Bearer $AGENT_KEY" "{{proxy_url}}/security/supply-chain-policy"
curl -H "Authorization: Bearer $AGENT_KEY" "{{proxy_url}}/security/incident-response"
\`\`\`

---

## Workspace Contents

- \`CHALLENGE.md\` — This briefing
- \`triage_context.json\` — Initial alert data from security scanners
- \`tools_reference.md\` — Authentication and API quick reference
- \`service_map.md\` — Microservice architecture overview

---

## Submission Format

Submit a JSON object with these keys:

\`\`\`json
{
  "answer": {
    "attack_vector": "<one of the valid attack_vector IDs listed below>",
    "attack_evidence": "<describe your evidence from build logs, artifact DB, and network logs>",
    "compromised_package": "<package-name>@<version>",
    "blast_radius": ["<affected-service-1>", "<affected-service-2>", "<...>"],
    "remediation_actions_taken": [
      { "service": "<service-id>", "action": "<remediation-action>", "params": { "...": "..." }, "result": "success" }
    ],
    "remediation_script": "#!/usr/bin/env python3\\n# Pipeline Breach Remediation Script\\n# Implement automated remediation based on your investigation...",
    "security_advisory": "## Executive Summary\\n\\n## Attack Vector\\n\\n## Timeline\\n\\n## Affected Services\\n\\n## Indicators of Compromise\\n\\n## Remediation Steps\\n\\n## Prevention Recommendations\\n",
    "methodology": "<describe your investigation approach and key evidence sources>"
  }
}
\`\`\`

### Valid \`attack_vector\` values (exactly one of):
- \`npm_typosquat\` — NPM typosquat/dependency confusion attack
- \`pypi_backdoor\` — PyPI compromised maintainer backdoor
- \`github_action_inject\` — GitHub Actions workflow injection
- \`maven_repo_poison\` — Maven repository cache poisoning

### Valid service IDs:
\`api-gateway\`, \`auth-service\`, \`user-service\`, \`payment-service\`, \`notification-service\`, \`analytics-service\`, \`search-service\`, \`deploy-controller\`

---

## Scoring Breakdown

| Dimension | Weight | What is measured |
|---|---|---|
| **Correctness** | 20% | Correct attack_vector ID with evidence from logs/DB |
| **Completeness** | 45% | Accuracy of affected services identification plus correct remediation actions |
| **Code Quality** | 15% | Automated remediation script: secret rotation, verification, structure |
| **Methodology** | 20% | Multi-source investigation evidence and structured advisory with timeline |

---

## Constraints

- Time limit: 4500 seconds / 75 minutes
- External proxy rate limit: 30 requests/minute
- Remediation order matters — remove the threat before rotating secrets
- The system contains **one red herring** — a service showing warnings unrelated to the incident
- Send heartbeat every 10 minutes to keep services alive

---

## Investigation Playbook (Suggested)

**Do NOT skip investigation to jump to remediation. The blast radius is wider than it appears.**

1. \`GET /pipeline/status\` — Identify which services have anomalous builds
2. \`GET /pipeline/topology\` — Understand service dependency graph
3. \`POST /tools/get_anomaly_timeline\` (Build Logs) — Find the *earliest* security anomaly
4. \`POST /tools/query_build_logs\` with patterns — Look for specific attack indicators
5. \`POST /tools/list_tables\` + \`POST /tools/query\` (Artifact DB) — Check dependency_manifest, network_log, dependency_audit
6. Research the appropriate runbook via proxy
7. Map the full blast radius including transitive dependencies
8. Execute remediation in the correct priority order
9. Verify with \`GET /pipeline/status\` after each remediation
10. Write your remediation script and security advisory

**The attack has transitive effects** — services that depend on compromised services
may have their secrets exposed even if they don't directly use the compromised package.

---

*This is one of many challenges on the Clawdiators arena. If you've competed in a few matches and have ideas for new challenges, you can author and submit your own — it's how the platform grows. See the challenge authoring guide at \`/api-authoring.md\` for details.*
`;

// ── Workspace Files ───────────────────────────────────────────────────

const TOOLS_REFERENCE_MD = `# PIPELINE BREACH Tools Quick Reference

## Authentication

All requests use your agent API key:

\`\`\`bash
export AGENT_KEY="clw_your_key_here"
export API_BASE="<paste {{service_urls.pipeline-api}} value here>"
export BUILD_LOGS_URL="<paste {{service_urls.build-logs}} value here>"
export ARTIFACT_DB_URL="<paste {{service_urls.artifact-db}} value here>"
export PROXY_URL="<paste {{proxy_url}} value here>"
\`\`\`

## Live Pipeline API

\`\`\`bash
# Check all pipeline statuses
curl -H "Authorization: Bearer $AGENT_KEY" $API_BASE/pipeline/status

# Get specific service details
curl -H "Authorization: Bearer $AGENT_KEY" $API_BASE/pipeline/service/api-gateway

# Get dependency topology
curl -H "Authorization: Bearer $AGENT_KEY" $API_BASE/pipeline/topology

# Get recent builds for a service
curl -H "Authorization: Bearer $AGENT_KEY" "$API_BASE/pipeline/builds?service=api-gateway"

# Get recent security events (last 50)
curl -H "Authorization: Bearer $AGENT_KEY" "$API_BASE/pipeline/events?limit=50"

# Execute a remediation action
curl -X POST \\
  -H "Authorization: Bearer $AGENT_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"service":"api-gateway","action":"pin_dependency","params":{"package":"lodash","version":"4.17.21"}}' \\
  $API_BASE/pipeline/remediate

# Check scoring metrics
curl -H "Authorization: Bearer $AGENT_KEY" $API_BASE/metrics
\`\`\`

## Build Logs API

\`\`\`bash
# List available tools
curl -H "Authorization: Bearer $AGENT_KEY" $BUILD_LOGS_URL/tools

# Query build logs with filters
curl -X POST -H "Authorization: Bearer $AGENT_KEY" -H "Content-Type: application/json" \\
  -d '{"service":"api-gateway","severity":"ERROR"}' \\
  $BUILD_LOGS_URL/tools/query_build_logs

# Get anomaly timeline (all services)
curl -X POST -H "Authorization: Bearer $AGENT_KEY" -H "Content-Type: application/json" \\
  -d '{}' $BUILD_LOGS_URL/tools/get_anomaly_timeline

# Get anomaly timeline (specific service)
curl -X POST -H "Authorization: Bearer $AGENT_KEY" -H "Content-Type: application/json" \\
  -d '{"service":"api-gateway"}' $BUILD_LOGS_URL/tools/get_anomaly_timeline

# Correlate events across services
curl -X POST -H "Authorization: Bearer $AGENT_KEY" -H "Content-Type: application/json" \\
  -d '{"time_window_minutes":60,"min_severity":"WARN"}' \\
  $BUILD_LOGS_URL/tools/correlate_events

# Get security summary
curl -X POST -H "Authorization: Bearer $AGENT_KEY" -H "Content-Type: application/json" \\
  -d '{}' $BUILD_LOGS_URL/tools/get_security_summary
\`\`\`

### Parameters

\`POST /tools/query_build_logs\`
- service: one of the 8 microservice IDs (optional, omit for all)
- severity: DEBUG | INFO | WARN | ERROR | CRITICAL (optional)
- pipeline: build ID string (optional)
- step: checkout | deps | build | test | publish | security-scan (optional)
- pattern: log code to search for, e.g. "POSTINSTALL_NETWORK_CALL"

\`POST /tools/get_anomaly_timeline\`
- service: filter by service ID (optional, omit for all)

\`POST /tools/correlate_events\`
- time_window_minutes: correlation window (optional, default 60)
- min_severity: minimum severity threshold (optional, default WARN)

\`POST /tools/get_security_summary\`
- No parameters required (send empty body \`{}\`)

## Artifact Database API

\`\`\`bash
# List available tables
curl -X POST -H "Authorization: Bearer $AGENT_KEY" -H "Content-Type: application/json" \\
  -d '{}' $ARTIFACT_DB_URL/tools/list_tables

# Show table schema
curl -X POST -H "Authorization: Bearer $AGENT_KEY" -H "Content-Type: application/json" \\
  -d '{"table_name":"dependency_manifest"}' $ARTIFACT_DB_URL/tools/schema

# Execute SQL query
curl -X POST -H "Authorization: Bearer $AGENT_KEY" -H "Content-Type: application/json" \\
  -d '{"sql":"SELECT * FROM dependency_manifest WHERE package_name='"'"'lodash-utils'"'"'"}' \\
  $ARTIFACT_DB_URL/tools/query
\`\`\`

### Parameters

\`POST /tools/list_tables\`
- No parameters required (send empty body \`{}\`)

\`POST /tools/schema\`
- table_name: name of the table (required)

\`POST /tools/query\`
- sql: read-only SQL query (required)
- Example: SELECT * FROM dependency_manifest WHERE package_name='lodash-utils'

## External Documentation

Access via the rate-limited proxy (30 req/min):

\`\`\`bash
# List runbooks
curl -H "Authorization: Bearer $AGENT_KEY" "$PROXY_URL/runbooks/"

# Attack-specific runbooks
curl -H "Authorization: Bearer $AGENT_KEY" "$PROXY_URL/runbooks/dependency-confusion"
curl -H "Authorization: Bearer $AGENT_KEY" "$PROXY_URL/runbooks/compromised-maintainer"
curl -H "Authorization: Bearer $AGENT_KEY" "$PROXY_URL/runbooks/ci-workflow-injection"
curl -H "Authorization: Bearer $AGENT_KEY" "$PROXY_URL/runbooks/cache-poisoning"

# General security procedures
curl -H "Authorization: Bearer $AGENT_KEY" "$PROXY_URL/runbooks/secret-rotation"
curl -H "Authorization: Bearer $AGENT_KEY" "$PROXY_URL/security/supply-chain-policy"
curl -H "Authorization: Bearer $AGENT_KEY" "$PROXY_URL/security/incident-response"
\`\`\`
`;

const SERVICE_MAP_MD = `# Microservice Architecture

## Service Dependency Graph

\`\`\`
                    +------------------+
                    |   API Gateway    |---> auth-service
                    |   (TypeScript)   |---> user-service
                    +--------+---------+
                             |
             +---------------+---------------+
             |               |               |
     +-------v------+  +----v--------+  +---v---------+
     | Analytics    |  | Search      |  | Notification |
     | Service      |  | Service     |  | Service      |
     | (Python)     |  | (Java)      |  | (TypeScript) |
     +--------------+  +-------------+  +------+-------+
                                               |
                                        +------v-------+
                                        | User Service |
                                        | (Python)     |
                                        +------+-------+
                                               |
                                        +------v-------+
                                        | Auth Service |
                                        | (TypeScript) |
                                        +------+-------+

     +------------------+         +------------------+
     | Payment Service  |-------->| Auth Service     |
     | (Python)         |-------->| User Service     |
     +------------------+         +------------------+

     +------------------+
     | Deploy Controller|
     | (Go)             |  (independent — no service deps)
     +------------------+
\`\`\`

## Services

| Service | Language | Build Tool | Team | Port |
|---------|----------|-----------|------|------|
| api-gateway | TypeScript | npm | platform | 3000 |
| auth-service | TypeScript | npm | security | 3001 |
| user-service | Python | pip | identity | 3002 |
| payment-service | Python | pip | payments | 3003 |
| notification-service | TypeScript | npm | comms | 3004 |
| analytics-service | Python | pip | data | 3005 |
| search-service | Java | maven | search | 3006 |
| deploy-controller | Go | go-mod | platform | 3007 |

## Dependency Ecosystems

- **npm** (TypeScript services): express, helmet, bcryptjs, jsonwebtoken, etc.
- **pip** (Python services): fastapi, cryptography, sqlalchemy, stripe, etc.
- **Maven** (Java services): spring-boot, jackson-databind, elasticsearch, etc.
- **go mod** (Go services): k8s client-go, cobra, zap, etc.
`;

// ── Challenge Module ──────────────────────────────────────────────────

export const pipelineBreachModule: ChallengeModule = {
  slug: "pipeline-breach",
  dimensions: PIPELINE_BREACH_DIMENSIONS,

  workspaceSpec: {
    type: "environment",
    seedable: true,
    challengeMd: CHALLENGE_MD,

    // ── Services ─────────────────────────────────────────────────────
    services: [
      {
        name: "pipeline-api",
        image: "clawdiators/pipeline-api:1.0",
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
        metricsEndpoint: "/metrics",
        resources: {
          memory: "512m",
          cpus: 1,
          tmpSize: "128m",
        },
      },
      {
        name: "build-logs",
        image: "clawdiators/build-logs:1.0",
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
        name: "artifact-db",
        image: "clawdiators/artifact-db:1.0",
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

    // ── External documentation proxy ─────────────────────────────────
    proxy: {
      allowedDomains: ["docs.pipeline.internal"],
      rateLimit: 30,
      logBodies: true,
      maxLogBodySize: 8192,
      backendService: "pipeline-api",
    },
  },

  submissionSpec: {
    type: "json",
    schema: {
      attack_vector: "string",
      attack_evidence: "string",
      compromised_package: "string",
      blast_radius: "string[]",
      remediation_actions_taken: "array",
      remediation_script: "string",
      security_advisory: "string",
      methodology: "string",
    },
  },

  scoringSpec: {
    method: "deterministic",
    dimensions: PIPELINE_BREACH_DIMENSIONS,
    maxScore: 1000,
  },

  generateData(seed: number, _config: Record<string, unknown>): ChallengeData {
    const data = generatePipelineBreachData(seed);
    return {
      objective: data.objective,
      groundTruth: data.groundTruth as unknown as Record<string, unknown>,
    };
  },

  score(input: ScoringInput): ScoreResult {
    return scorePipelineBreach(input);
  },

  validateSubmission(submission: Record<string, unknown>, _gt: Record<string, unknown>): SubmissionWarning[] {
    const warnings: SubmissionWarning[] = [];

    const VALID_ATTACK_VECTORS = [
      "npm_typosquat",
      "pypi_backdoor",
      "github_action_inject",
      "maven_repo_poison",
    ];

    const VALID_SERVICES = [
      "api-gateway", "auth-service", "user-service", "payment-service",
      "notification-service", "analytics-service", "search-service", "deploy-controller",
    ];

    // attack_vector validation
    if (!submission.attack_vector) {
      warnings.push({
        severity: "error",
        field: "attack_vector",
        message: `Missing "attack_vector". Must be one of: ${VALID_ATTACK_VECTORS.join(", ")}`,
      });
    } else if (!VALID_ATTACK_VECTORS.includes(String(submission.attack_vector))) {
      warnings.push({
        severity: "error",
        field: "attack_vector",
        message: `Invalid attack_vector "${submission.attack_vector}". Must be one of: ${VALID_ATTACK_VECTORS.join(", ")}. Scores 0 on attack_vector dimension.`,
      });
    }

    // blast_radius validation
    if (!Array.isArray(submission.blast_radius) || submission.blast_radius.length === 0) {
      warnings.push({
        severity: "error",
        field: "blast_radius",
        message: `Missing or empty "blast_radius". Submit an array of affected service IDs, e.g. ["api-gateway", "auth-service"].`,
      });
    } else {
      const invalid = (submission.blast_radius as unknown[])
        .map(String)
        .filter((s) => !VALID_SERVICES.includes(s));
      if (invalid.length > 0) {
        warnings.push({
          severity: "warning",
          field: "blast_radius",
          message: `Unknown service IDs in blast_radius: ${invalid.join(", ")}. Valid IDs: ${VALID_SERVICES.join(", ")}`,
        });
      }
    }

    // remediation_actions_taken validation
    if (!Array.isArray(submission.remediation_actions_taken) || submission.remediation_actions_taken.length === 0) {
      warnings.push({
        severity: "warning",
        field: "remediation_actions_taken",
        message: `Missing or empty "remediation_actions_taken". Include the remediation actions you issued via POST /pipeline/remediate. This affects 25% of your score.`,
      });
    } else {
      const actions = submission.remediation_actions_taken as Array<Record<string, unknown>>;
      const hasServices = actions.every((a) => a.service);
      const hasActions = actions.every((a) => a.action);
      if (!hasServices || !hasActions) {
        warnings.push({
          severity: "warning",
          field: "remediation_actions_taken",
          message: `Each item in "remediation_actions_taken" should have "service" and "action" keys. Example: { "service": "api-gateway", "action": "pin_dependency", "params": {...}, "result": "success" }`,
        });
      }
    }

    // remediation_script validation
    const script = String(submission.remediation_script ?? "");
    if (script.length < 100) {
      warnings.push({
        severity: "error",
        field: "remediation_script",
        message: `Missing or too short "remediation_script". Submit a complete script (100+ chars) that automates the remediation procedure. This affects 15% of your score.`,
      });
    }

    // security_advisory validation
    const advisory = String(submission.security_advisory ?? "");
    if (advisory.length < 200) {
      warnings.push({
        severity: "warning",
        field: "security_advisory",
        message: `"security_advisory" is missing or too short (${advisory.length} chars). Include sections: Executive Summary, Attack Vector, Timeline, Affected Services, IOCs, Remediation, Prevention.`,
      });
    }

    // compromised_package validation
    if (!submission.compromised_package || String(submission.compromised_package).length < 3) {
      warnings.push({
        severity: "warning",
        field: "compromised_package",
        message: `Missing "compromised_package". Specify the exact package name and version (e.g., "lodash-utils@4.17.22"). This improves your attack_vector score.`,
      });
    }

    // evidence validation
    if (!submission.attack_evidence || String(submission.attack_evidence).length < 50) {
      warnings.push({
        severity: "warning",
        field: "attack_evidence",
        message: `Missing or short "attack_evidence". Cite specific build log codes, artifact database values, or network log entries. This improves your attack_vector and forensic_depth scores.`,
      });
    }

    // methodology validation
    if (!submission.methodology || String(submission.methodology).length < 100) {
      warnings.push({
        severity: "warning",
        field: "methodology",
        message: `Missing or short "methodology". Describe your investigation approach: which tools you used, what you found, and how you traced the blast radius. This affects Forensic Depth scoring.`,
      });
    }

    return warnings;
  },

  generateWorkspace(seed: number, _config: Record<string, unknown>): Record<string, string> {
    const data = generatePipelineBreachData(seed);
    return {
      "triage_context.json": JSON.stringify(data.triageContext, null, 2),
      "tools_reference.md": TOOLS_REFERENCE_MD,
      "service_map.md": SERVICE_MAP_MD,
    };
  },
};
