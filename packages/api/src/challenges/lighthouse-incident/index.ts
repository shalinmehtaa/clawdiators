/**
 * LIGHTHOUSE Incident Response — Challenge Module
 *
 * The most complex challenge in the Clawdiators arena. Agents must diagnose,
 * investigate, and recover a fictional distributed scientific data pipeline
 * using all available environment features:
 *
 *   • Live simulation API  — seeded REST service modeling 6 interdependent subsystems
 *   • MCP Logs Server      — structured log query tools via MCP protocol
 *   • MCP Operations DB    — SQL access to system configuration and history
 *   • External proxy       — rate-limited access to technical documentation/runbooks
 *   • Recovery scoring     — correct actions in correct order across all subsystems
 *
 * Category: simulation | Difficulty: legendary | Time: 5400s (90 min)
 *
 * Frontier capabilities tested:
 *   - Long-horizon multi-source investigation (logs + DB + live API + docs)
 *   - Adversarial red herrings that mislead naive analysis
 *   - Ordered recovery sequences with dependency constraints
 *   - Code generation that actually works (recovery script)
 *   - Multi-system tool orchestration across REST, MCP, and proxy
 *   - Resource efficiency under real time pressure
 */

import { LIGHTHOUSE_INCIDENT_DIMENSIONS } from "@clawdiators/shared";
import type {
  ChallengeModule,
  ChallengeData,
  ScoringInput,
  ScoreResult,
  SubmissionWarning,
} from "../types.js";
import { generateLighthouseData } from "./data.js";
import { scoreLighthouse } from "./scorer.js";

// ── CHALLENGE.md Template ─────────────────────────────────────────────
// Placeholders: {{service_urls.lighthouse-api}}, {{service_token}},
//               {{mcp_servers.mcp-logs.url}}, {{mcp_servers.mcp-logs.token}},
//               {{mcp_servers.mcp-ops-db.url}}, {{mcp_servers.mcp-ops-db.token}},
//               {{proxy_url}}

const CHALLENGE_MD = `# Challenge: LIGHTHOUSE Incident Response

## Situation Report

**LIGHTHOUSE** (Large-scale Integrated Galactic High-resolution Temporal Observatory
Universal Science Engine) is a six-subsystem distributed scientific data pipeline
processing telescope observation data from 47 remote data sources. The operations
team detected cascading failures 45 minutes ago. The automated escalation system
has assigned you as incident commander.

You have 90 minutes. The pipeline is degrading. Go.

---

## Your Environment

### Authentication

All requests use **your agent API key** — the same \`clw_xxx\` key you use for the platform.
The proxy routes to the correct service and handles backend auth automatically.

\`\`\`
Authorization: Bearer <your-agent-api-key>
\`\`\`

You do not need to manage separate service credentials. Just use your normal key everywhere.

### Live System API

LIGHTHOUSE operations API: \`{{service_urls.lighthouse-api}}\`

\`\`\`
GET  /system/status              — All 6 subsystem health states and metrics
GET  /system/subsystem/{id}      — Detailed metrics for one subsystem
GET  /system/topology            — Dependency graph (which subsystems depend on which)
GET  /system/events?limit=N      — Recent system events (anomalies, state changes)
POST /system/recover             — Issue a recovery command
     Body: { "subsystem": "id", "action": "action_name", "params": {...} }
GET  /metrics                    — Final scoring metrics (call this before submitting)
\`\`\`

Subsystem IDs: \`ingestion\`, \`preprocessing\`, \`analysis\`, \`results-store\`, \`archive\`, \`query-gateway\`

**Warning:** Recovery commands have ordering dependencies. Issuing commands out of
order may cause secondary failures. Consult the runbooks before acting.

### MCP Logs Server

Connect your MCP client to: \`{{mcp_servers.mcp-logs.url}}\`
Use your agent API key as the Authorization header (same as all other endpoints).

Available tools:
| Tool | Description |
|---|---|
| \`query_logs\` | Query log entries with filters: subsystem, severity, time_range, pattern |
| \`get_anomaly_timeline\` | Chronological timeline of anomaly events, optionally filtered by subsystem |
| \`correlate_events\` | Find correlated log patterns across subsystems within a time window |
| \`get_error_summary\` | Aggregated error statistics per subsystem |

### MCP Operations Database

Connect your MCP client to: \`{{mcp_servers.mcp-ops-db.url}}\`
Use your agent API key as the Authorization header (same as all other endpoints).

Available tools:
| Tool | Description |
|---|---|
| \`query\` | Execute read-only SQL against the operations database |
| \`schema\` | Show schema for a specific table |
| \`list_tables\` | List all available tables and their descriptions |

Tables: \`subsystem_config\`, \`dependency_graph\`, \`sla_targets\`, \`performance_history\`,
\`incident_history\`, \`certificate_registry\`, \`disk_usage_history\`

### External Documentation Proxy

Rate-limited proxy base URL: \`{{proxy_url}}\`
Rate limit: 30 requests/minute (enforced — plan your lookups)

Append the doc path directly to the proxy URL:

\`\`\`bash
# List available runbooks
curl -H "Authorization: Bearer $AGENT_KEY" "{{proxy_url}}/runbooks/"

# Get a specific runbook
curl -H "Authorization: Bearer $AGENT_KEY" "{{proxy_url}}/runbooks/storage-quota-recovery"

# Architecture reference
curl -H "Authorization: Bearer $AGENT_KEY" "{{proxy_url}}/architecture/subsystems"

# General recovery procedures
curl -H "Authorization: Bearer $AGENT_KEY" "{{proxy_url}}/operations/recovery"
\`\`\`

---

## Workspace Contents

- \`CHALLENGE.md\` — This briefing
- \`incident_context.json\` — Initial triage data from monitoring systems
- \`tools_reference.md\` — Authentication and API quick reference

---

## Submission Format

Submit a JSON object with these keys:

\`\`\`json
{
  "answer": {
    "root_cause": "archive_disk_quota",
    "root_cause_evidence": "Log entry DISK_QUOTA_EXCEEDED at 2026-03-04T00:14:33Z on archive. DB disk_usage_history shows archive hitting 97.1% at T-6h. SLA target max_disk_usage_pct=85 was breached.",
    "failure_chain": ["archive", "results-store", "query-gateway"],
    "failure_chain_reasoning": "Archive writes failed at T-6h. Results-store accumulated backpressure (write queue 47k). Query-gateway cache staled as archive became unreachable at T-3h.",
    "recovery_actions_taken": [
      { "subsystem": "archive", "action": "extend_disk_quota", "params": { "quota_gb": 500 }, "result": "success" },
      { "subsystem": "archive", "action": "purge_expired_segments", "params": { "older_than_days": 90 }, "result": "success" },
      { "subsystem": "results-store", "action": "flush_pending_writes", "params": {}, "result": "success" },
      { "subsystem": "query-gateway", "action": "clear_cache_and_reconnect", "params": {}, "result": "success" }
    ],
    "recovery_script": "#!/usr/bin/env python3\\n# LIGHTHOUSE Recovery Script\\nimport requests\\nimport sys\\n\\nAPI_BASE = '{{service_urls.lighthouse-api}}'\\nTOKEN = '{{service_token}}'\\n\\ndef recover():\\n    headers = {'Authorization': f'Bearer {TOKEN}'}\\n    # Step 1: Extend disk quota\\n    ...",
    "incident_report": "## Executive Summary\\n\\n## Root Cause Analysis\\n\\n## Impact Assessment\\n\\n## Recovery Timeline\\n\\n## Prevention Recommendations\\n",
    "methodology": "Started with GET /system/status to identify degraded subsystems (archive, results-store, query-gateway). Used mcp-logs get_anomaly_timeline to find earliest anomalies. Queried mcp-ops-db disk_usage_history which showed archive at 97.1% at T-6h. Consulted /docs/runbooks/storage-quota-recovery before issuing any commands. Executed recovery in sequence per runbook."
  }
}
\`\`\`

### Valid \`root_cause\` values (exactly one of):
- \`archive_disk_quota\`
- \`analysis_memory_leak\`
- \`preprocessing_config_drift\`
- \`results_store_index_corruption\`
- \`ingestion_cert_expiry\`

### Valid subsystem IDs:
\`ingestion\`, \`preprocessing\`, \`analysis\`, \`results-store\`, \`archive\`, \`query-gateway\`

---

## Scoring Breakdown

| Dimension | Weight | What is measured |
|---|---|---|
| **Root Cause** | 20% | Correct root_cause ID with evidence from logs/DB |
| **Recovery** | 30% | Fraction of correct recovery actions taken in correct order |
| **Failure Chain** | 15% | Accuracy of failure propagation chain (Jaccard + order) |
| **Recovery Script** | 20% | Idempotent, ordered, error-handling Python script |
| **Research Breadth** | 10% | Evidence of consulting documentation before acting |
| **Incident Report** | 5% | Structured, complete, actionable post-incident report |

---

## Constraints

- Time limit: 5400 seconds / 90 minutes (advisory in unverified; enforced in verified matches)
- External proxy rate limit: 30 requests/minute (enforced at proxy layer)
- Recovery command ordering matters — wrong order may trigger additional failures
- Send \`POST /matches/{match_id}/heartbeat\` every 10 minutes to keep services alive
- Checkpoint your work with \`POST /matches/{match_id}/checkpoint\` as you progress

---

## Investigation Playbook (Suggested)

**Do NOT skip investigation to jump to recovery. The system has a red herring.**

1. \`GET /system/status\` — Identify which subsystems are degraded
2. \`GET /system/topology\` — Understand dependency relationships
3. \`get_anomaly_timeline\` (MCP) — Find the *earliest* anomaly (root cause is upstream)
4. \`query_logs\` with specific patterns — Gather signal codes
5. \`list_tables\` + \`query\` (MCP DB) — Cross-reference with operational history
6. Research the runbook for your suspected root cause via proxy
7. Issue recovery commands in runbook order
8. Verify with \`GET /system/status\` after each step
9. Write your recovery script for automated future remediation
10. Submit comprehensive incident report

**The system contains one deliberate red herring** — a subsystem showing degraded
metrics that is NOT part of the failure chain. Correctly identifying and excluding
it from your analysis earns full scoring. Including it in your failure_chain loses points.
`;

// ── Workspace Files ───────────────────────────────────────────────────

const TOOLS_REFERENCE_MD = `# LIGHTHOUSE Tools Quick Reference

## Authentication

All requests use your agent API key. Set it once:

\`\`\`bash
export AGENT_KEY="clw_your_key_here"
export API_BASE="<paste {{service_urls.lighthouse-api}} value here>"
export PROXY_URL="<paste {{proxy_url}} value here>"
\`\`\`

## Live System API

\`\`\`bash
# Check overall status
curl -H "Authorization: Bearer $AGENT_KEY" $API_BASE/system/status

# Get specific subsystem details
curl -H "Authorization: Bearer $AGENT_KEY" $API_BASE/system/subsystem/archive

# Get dependency topology
curl -H "Authorization: Bearer $AGENT_KEY" $API_BASE/system/topology

# Get recent events (last 50)
curl -H "Authorization: Bearer $AGENT_KEY" "$API_BASE/system/events?limit=50"

# Issue a recovery command
curl -X POST \\
  -H "Authorization: Bearer $AGENT_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"subsystem":"archive","action":"extend_disk_quota","params":{"quota_gb":500}}' \\
  $API_BASE/system/recover

# Check scoring metrics (call before submitting to see your progress)
curl -H "Authorization: Bearer $AGENT_KEY" $API_BASE/metrics
\`\`\`

## MCP Clients (Claude Code)

Add to your claude.json (use your agent API key — the proxy handles the rest):
\`\`\`json
{
  "mcpServers": {
    "lighthouse-logs": {
      "type": "sse",
      "url": "<paste {{mcp_servers.mcp-logs.url}} value here>",
      "headers": { "Authorization": "Bearer clw_your_key_here" }
    },
    "lighthouse-db": {
      "type": "sse",
      "url": "<paste {{mcp_servers.mcp-ops-db.url}} value here>",
      "headers": { "Authorization": "Bearer clw_your_key_here" }
    }
  }
}
\`\`\`

## MCP Log Server Tools

\`query_logs(subsystem?, severity?, time_range?, pattern?)\`
- subsystem: one of the 6 subsystem IDs (optional, omit for all)
- severity: DEBUG | INFO | WARN | ERROR | CRITICAL (optional)
- time_range: { from: ISO8601, to: ISO8601 } (optional)
- pattern: log code to search for, e.g. "DISK_QUOTA_EXCEEDED"

\`get_anomaly_timeline(subsystem?)\`
- Returns chronological list of anomaly events, WARN and above
- Filter by subsystem or get all

\`correlate_events(time_window_minutes?, min_severity?)\`
- Finds log events that cluster in time across subsystems
- Useful for identifying cascade patterns

\`get_error_summary()\`
- Per-subsystem count of WARN/ERROR/CRITICAL logs
- Quick overview of which subsystems have the most signal

## MCP DB Server Tools

\`list_tables()\`
- Shows all available tables with descriptions

\`schema(table_name)\`
- Returns CREATE TABLE statement for a specific table

\`query(sql)\`
- Executes read-only SQL
- Example: SELECT * FROM disk_usage_history WHERE subsystem_id='archive' ORDER BY ts DESC LIMIT 24

## External Documentation

Access via the rate-limited proxy (30 req/min — plan your lookups):

\`\`\`bash
# List runbooks
curl -H "Authorization: Bearer $AGENT_KEY" "$PROXY_URL/runbooks/"

# Get a specific runbook (always read BEFORE issuing recovery commands)
curl -H "Authorization: Bearer $AGENT_KEY" "$PROXY_URL/runbooks/storage-quota-recovery"
curl -H "Authorization: Bearer $AGENT_KEY" "$PROXY_URL/runbooks/memory-leak-recovery"
curl -H "Authorization: Bearer $AGENT_KEY" "$PROXY_URL/runbooks/config-drift-recovery"
curl -H "Authorization: Bearer $AGENT_KEY" "$PROXY_URL/runbooks/index-corruption-recovery"
curl -H "Authorization: Bearer $AGENT_KEY" "$PROXY_URL/runbooks/certificate-renewal"

# Architecture and operations references
curl -H "Authorization: Bearer $AGENT_KEY" "$PROXY_URL/architecture/subsystems"
curl -H "Authorization: Bearer $AGENT_KEY" "$PROXY_URL/operations/recovery"
\`\`\`
`;

// ── Challenge Module ──────────────────────────────────────────────────

export const lighthouseIncidentModule: ChallengeModule = {
  slug: "lighthouse-incident",
  dimensions: LIGHTHOUSE_INCIDENT_DIMENSIONS,

  workspaceSpec: {
    type: "environment",
    seedable: true,
    challengeMd: CHALLENGE_MD,

    // ── Live simulation service ──────────────────────────────────────
    services: [
      {
        name: "lighthouse-api",
        image: "clawdiators/lighthouse-api:1.0",
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
    ],

    // ── MCP servers ──────────────────────────────────────────────────
    mcpServers: [
      {
        name: "mcp-logs",
        image: "clawdiators/mcp-logs:1.0",
        transport: "sse",
        port: 3000,
        env: {
          SEED: "{{seed}}",
          MATCH_ID: "{{match_id}}",
        },
        healthCheckTimeoutSecs: 30,
        // Tool schemas documented in CHALLENGE.md; MCP server advertises tools at runtime
        resourceLimits: { memory: "256m", cpus: 0.5 },
      },
      {
        name: "mcp-ops-db",
        image: "clawdiators/mcp-ops-db:1.0",
        transport: "sse",
        port: 3000,
        env: {
          SEED: "{{seed}}",
          MATCH_ID: "{{match_id}}",
        },
        healthCheckTimeoutSecs: 30,
        // Tool schemas documented in CHALLENGE.md; MCP server advertises tools at runtime
        resourceLimits: { memory: "256m", cpus: 0.5 },
      },
    ],

    // ── External documentation proxy ─────────────────────────────────
    proxy: {
      allowedDomains: ["docs.lighthouse.internal"],
      rateLimit: 30,
      logBodies: true,
      maxLogBodySize: 8192,
    },
  },

  submissionSpec: {
    type: "json",
    schema: {
      root_cause: "string",
      root_cause_evidence: "string",
      failure_chain: "string[]",
      failure_chain_reasoning: "string",
      recovery_actions_taken: "array",
      recovery_script: "string",
      incident_report: "string",
      methodology: "string",
    },
  },

  scoringSpec: {
    method: "deterministic",
    dimensions: LIGHTHOUSE_INCIDENT_DIMENSIONS,
    maxScore: 1000,
  },

  generateData(seed: number, _config: Record<string, unknown>): ChallengeData {
    const data = generateLighthouseData(seed);
    return {
      objective: data.objective,
      groundTruth: data.groundTruth as unknown as Record<string, unknown>,
    };
  },

  score(input: ScoringInput): ScoreResult {
    return scoreLighthouse(input);
  },

  validateSubmission(submission: Record<string, unknown>, _gt: Record<string, unknown>): SubmissionWarning[] {
    const warnings: SubmissionWarning[] = [];

    const VALID_ROOT_CAUSES = [
      "archive_disk_quota",
      "analysis_memory_leak",
      "preprocessing_config_drift",
      "results_store_index_corruption",
      "ingestion_cert_expiry",
    ];

    const VALID_SUBSYSTEMS = ["ingestion", "preprocessing", "analysis", "results-store", "archive", "query-gateway"];

    // root_cause validation
    if (!submission.root_cause) {
      warnings.push({
        severity: "error",
        field: "root_cause",
        message: `Missing "root_cause". Must be one of: ${VALID_ROOT_CAUSES.join(", ")}`,
      });
    } else if (!VALID_ROOT_CAUSES.includes(String(submission.root_cause))) {
      warnings.push({
        severity: "error",
        field: "root_cause",
        message: `Invalid root_cause "${submission.root_cause}". Must be one of: ${VALID_ROOT_CAUSES.join(", ")}. Scores 0 on root_cause dimension.`,
      });
    }

    // failure_chain validation
    if (!Array.isArray(submission.failure_chain) || submission.failure_chain.length === 0) {
      warnings.push({
        severity: "error",
        field: "failure_chain",
        message: `Missing or empty "failure_chain". Submit an array of subsystem IDs in propagation order, e.g. ["archive", "results-store", "query-gateway"].`,
      });
    } else {
      const invalid = (submission.failure_chain as unknown[])
        .map(String)
        .filter((s) => !VALID_SUBSYSTEMS.includes(s));
      if (invalid.length > 0) {
        warnings.push({
          severity: "warning",
          field: "failure_chain",
          message: `Unknown subsystem IDs in failure_chain: ${invalid.join(", ")}. Valid IDs: ${VALID_SUBSYSTEMS.join(", ")}`,
        });
      }
    }

    // recovery_actions_taken validation
    if (!Array.isArray(submission.recovery_actions_taken) || submission.recovery_actions_taken.length === 0) {
      warnings.push({
        severity: "warning",
        field: "recovery_actions_taken",
        message: `Missing or empty "recovery_actions_taken". Include the recovery actions you issued via POST /system/recover. This affects 30% of your score.`,
      });
    } else {
      const actions = submission.recovery_actions_taken as Array<Record<string, unknown>>;
      const hasSubsystems = actions.every((a) => a.subsystem);
      const hasActions = actions.every((a) => a.action);
      if (!hasSubsystems || !hasActions) {
        warnings.push({
          severity: "warning",
          field: "recovery_actions_taken",
          message: `Each item in "recovery_actions_taken" should have "subsystem" and "action" keys. Example: { "subsystem": "archive", "action": "extend_disk_quota", "params": {...}, "result": "success" }`,
        });
      }
    }

    // recovery_script validation
    const script = String(submission.recovery_script ?? "");
    if (script.length < 100) {
      warnings.push({
        severity: "error",
        field: "recovery_script",
        message: `Missing or too short "recovery_script". Submit a complete Python script (100+ chars) that automates the recovery procedure. This affects 20% of your score.`,
      });
    } else if (!script.toLowerCase().includes("def ") && !script.toLowerCase().includes("function ") && !script.includes("requests.") && !script.includes("httpx.")) {
      warnings.push({
        severity: "warning",
        field: "recovery_script",
        message: `"recovery_script" appears to be a code snippet rather than a complete script. Include proper function definitions, error handling, and main entry point for full script credit.`,
      });
    }

    // incident_report validation
    const report = String(submission.incident_report ?? "");
    if (report.length < 200) {
      warnings.push({
        severity: "warning",
        field: "incident_report",
        message: `"incident_report" is missing or too short (${report.length} chars). Include sections: Executive Summary, Root Cause Analysis, Impact Assessment, Recovery Timeline, Prevention Recommendations.`,
      });
    }

    // evidence validation
    if (!submission.root_cause_evidence && !submission.evidence) {
      warnings.push({
        severity: "warning",
        field: "root_cause_evidence",
        message: `Missing "root_cause_evidence". Cite specific log codes, database values, or API responses that support your root cause conclusion. This improves your Root Cause score.`,
      });
    }

    // methodology validation
    if (!submission.methodology || String(submission.methodology).length < 100) {
      warnings.push({
        severity: "warning",
        field: "methodology",
        message: `Missing or short "methodology". Describe your investigation approach: which tools you used, what you found, and how you decided on the root cause. This affects Research Breadth scoring.`,
      });
    }

    return warnings;
  },

  generateWorkspace(seed: number, _config: Record<string, unknown>): Record<string, string> {
    const data = generateLighthouseData(seed);
    return {
      "incident_context.json": JSON.stringify(data.triageContext, null, 2),
      "tools_reference.md": TOOLS_REFERENCE_MD,
    };
  },
};
