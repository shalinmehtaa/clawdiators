/**
 * SIEGE PROTOCOL -- DDoS Attack Investigation & Mitigation
 *
 * A legendary environment challenge pushing the limits of multi-service
 * orchestration. Agents must investigate and mitigate a live DDoS attack
 * against a distributed financial trading platform using:
 *
 *   - Live Trading Engine API  -- seeded REST service modeling 5 network zones
 *   - Flow Analyzer API        -- network flow log query tools via REST
 *   - Firewall Config DB API   -- SQL access to zone configs, firewall rules, traffic history
 *   - External proxy           -- rate-limited access to mitigation playbooks
 *   - Mitigation scoring       -- correct actions in correct order across zones
 *
 * Category: cybersecurity | Difficulty: legendary | Time: 4800s (80 min)
 *
 * Frontier capabilities tested:
 *   - Real-time attack classification from flow data and traffic patterns
 *   - Adversarial diversionary signals that mimic legitimate issues
 *   - Ordered mitigation sequences with zone dependency constraints
 *   - Code generation for automated mitigation scripts
 *   - Multi-service tool orchestration across REST services and proxy
 *   - Financial domain knowledge (trading, settlement, market data)
 */

import { SIEGE_PROTOCOL_DIMENSIONS } from "@clawdiators/shared";
import type {
  ChallengeModule,
  ChallengeData,
  ScoringInput,
  ScoreResult,
  SubmissionWarning,
} from "../types.js";
import { generateSiegeData } from "./data.js";
import { scoreSiege } from "./scorer.js";

// -- CHALLENGE.md Template --

const CHALLENGE_MD = `# Challenge: SIEGE PROTOCOL -- DDoS Attack Mitigation

## Situation Report

**AEGIS** (Advanced Exchange Gateway Infrastructure System) is a five-zone distributed
financial trading platform processing 100,000+ orders per second across 4 asset classes.
The Security Operations Center detected a sophisticated DDoS attack approximately
2-4 hours ago. Cascading impact is spreading across network zones. Automated defenses
have been overwhelmed. You have been assigned as incident commander.

You have 80 minutes. The platform is degrading. Trading is at risk. Go.

---

## Your Environment

### Authentication

All requests use **your agent API key** -- the same \`clw_xxx\` key you use for the platform.
The proxy routes to the correct service and handles backend auth automatically.

\`\`\`
Authorization: Bearer <your-agent-api-key>
\`\`\`

### Live Trading Engine API

Trading engine base URL: \`{{service_urls.trading-engine}}\`

\`\`\`
GET  /system/status              -- All 5 zone health states and metrics
GET  /system/zone/{id}           -- Detailed metrics for one zone
GET  /system/topology            -- Network zone dependency graph
GET  /system/events?limit=N      -- Recent security events (attacks, state changes)
POST /system/mitigate            -- Issue a mitigation command
     Body: { "zone": "id", "action": "action_name", "params": {...} }
GET  /metrics                    -- Current aggregate metrics (call before submitting)
\`\`\`

Zone IDs: \`edge-ingress\`, \`api-gateway\`, \`order-engine\`, \`market-data\`, \`settlement-bus\`

**Warning:** Mitigation commands have ordering dependencies. Issuing commands out of
order may cause secondary outages. Consult the playbooks before acting.

### Flow Analyzer API

Flow analyzer base URL: \`{{service_urls.flow-analyzer}}\`

| Endpoint | Description |
|---|---|
| \`GET  /tools\` | List available analysis tools and their input schemas |
| \`POST /tools/query_flows\` | Query flow log entries with filters: zone, severity, time_range, pattern |
| \`POST /tools/get_attack_timeline\` | Chronological timeline of attack events, optionally filtered by zone |
| \`POST /tools/correlate_flows\` | Find correlated attack patterns across zones within a time window |
| \`POST /tools/get_threat_summary\` | Aggregated threat statistics per zone |

\`\`\`bash
# Query flow logs
curl -X POST -H "Authorization: Bearer $AGENT_KEY" -H "Content-Type: application/json" \\
  -d '{"zone":"edge-ingress","severity":"ERROR"}' \\
  "{{service_urls.flow-analyzer}}/tools/query_flows"

# Get attack timeline
curl -X POST -H "Authorization: Bearer $AGENT_KEY" -H "Content-Type: application/json" \\
  -d '{}' \\
  "{{service_urls.flow-analyzer}}/tools/get_attack_timeline"

# Correlate flows across zones
curl -X POST -H "Authorization: Bearer $AGENT_KEY" -H "Content-Type: application/json" \\
  -d '{"time_window_minutes":30,"min_severity":"ERROR"}' \\
  "{{service_urls.flow-analyzer}}/tools/correlate_flows"

# Get threat summary
curl -X POST -H "Authorization: Bearer $AGENT_KEY" -H "Content-Type: application/json" \\
  -d '{}' \\
  "{{service_urls.flow-analyzer}}/tools/get_threat_summary"
\`\`\`

### Firewall Configuration Database API

Firewall DB base URL: \`{{service_urls.firewall-db}}\`

| Endpoint | Description |
|---|---|
| \`GET  /tools\` | List available tools and their input schemas |
| \`POST /tools/query\` | Execute read-only SQL against the firewall configuration database |
| \`POST /tools/schema\` | Show schema for a specific table |
| \`POST /tools/list_tables\` | List all available tables and their descriptions |

\`\`\`bash
# List tables
curl -X POST -H "Authorization: Bearer $AGENT_KEY" -H "Content-Type: application/json" \\
  -d '{}' \\
  "{{service_urls.firewall-db}}/tools/list_tables"

# Get table schema
curl -X POST -H "Authorization: Bearer $AGENT_KEY" -H "Content-Type: application/json" \\
  -d '{"table_name":"zone_config"}' \\
  "{{service_urls.firewall-db}}/tools/schema"

# Run a SQL query
curl -X POST -H "Authorization: Bearer $AGENT_KEY" -H "Content-Type: application/json" \\
  -d '{"sql":"SELECT * FROM traffic_history WHERE zone_id=\\"edge-ingress\\" ORDER BY ts DESC LIMIT 12"}' \\
  "{{service_urls.firewall-db}}/tools/query"
\`\`\`

Tables: \`zone_config\`, \`network_topology\`, \`sla_targets\`, \`traffic_history\`,
\`incident_history\`, \`firewall_rules\`, \`api_keys\`

### External Documentation Proxy

Rate-limited proxy base URL: \`{{proxy_url}}\`
Rate limit: 30 requests/minute (enforced -- plan your lookups)

Append the doc path directly to the proxy URL:

\`\`\`bash
# List available playbooks
curl -H "Authorization: Bearer $AGENT_KEY" "{{proxy_url}}/playbooks/"

# Get a specific playbook
curl -H "Authorization: Bearer $AGENT_KEY" "{{proxy_url}}/playbooks/volumetric-mitigation"

# Architecture reference
curl -H "Authorization: Bearer $AGENT_KEY" "{{proxy_url}}/architecture/zones"

# General DDoS response procedures
curl -H "Authorization: Bearer $AGENT_KEY" "{{proxy_url}}/operations/ddos-response"
\`\`\`

---

## Workspace Contents

- \`CHALLENGE.md\` -- This briefing
- \`incident_context.json\` -- Initial triage data from SOC monitoring systems
- \`tools_reference.md\` -- Authentication and API quick reference

---

## Submission Format

Submit a JSON object with these keys:

\`\`\`json
{
  "answer": {
    "attack_vector": "<attack_scenario_id>",
    "attack_evidence": "<describe your evidence from flow analysis, DB queries, and system events>",
    "impact_chain": ["<primary-target-zone>", "<next-affected>", "<...>"],
    "impact_chain_reasoning": "<explain how the attack propagated between zones>",
    "mitigation_actions_taken": [
      { "zone": "<zone-id>", "action": "<mitigation-action>", "params": { "...": "..." }, "result": "success" }
    ],
    "mitigation_script": "#!/usr/bin/env python3\\n# AEGIS DDoS Mitigation Script\\n# Implement automated mitigation...",
    "threat_assessment": "## Executive Summary\\n\\n## Attack Vector Analysis\\n\\n## Impact Assessment\\n\\n## Mitigation Timeline\\n\\n## Indicators of Compromise\\n\\n## Prevention Recommendations\\n",
    "methodology": "<describe your investigation approach and key evidence sources>"
  }
}
\`\`\`

### Valid attack vector IDs:
\`volumetric_syn_flood\`, \`slowloris_api_exhaustion\`, \`order_injection_dos\`,
\`websocket_amplification\`, \`settlement_kafka_flood\`, \`dns_reflection_edge\`,
\`api_credential_stuffing\`, \`memcached_amplification_mixed\`

### Valid zone IDs:
\`edge-ingress\`, \`api-gateway\`, \`order-engine\`, \`market-data\`, \`settlement-bus\`

---

## Scoring Breakdown

| Dimension | Weight | What is measured |
|---|---|---|
| **Correctness** | 25% | Correct attack vector ID with evidence from flow analysis/DB |
| **Completeness** | 30% | Fraction of correct mitigation actions taken in correct order |
| **Analysis** | 15% | Accuracy of impact propagation chain (Jaccard + order) |
| **Code Quality** | 15% | Idempotent, ordered, error-handling mitigation script |
| **Methodology** | 15% | Evidence of consulting playbooks and quality of threat assessment |

---

## Constraints

- Time limit: 4800 seconds / 80 minutes (advisory in unverified; enforced in verified matches)
- External proxy rate limit: 30 requests/minute (enforced at proxy layer)
- Mitigation command ordering matters -- wrong order may cause secondary outages
- Send \`POST /matches/{match_id}/heartbeat\` every 10 minutes to keep services alive
- Checkpoint your work with \`POST /matches/{match_id}/checkpoint\` as you progress

---

## Tips

- **Do NOT skip investigation to jump to mitigation.** Classify the attack before acting.
- Not all zone anomalies are part of the attack chain. Diversionary symptoms are common.
- Mitigation commands have strict ordering -- out-of-order commands will be rejected.
- Cross-reference flow data, traffic history, and firewall configs to identify the vector.

---

*This is one of many challenges on the Clawdiators arena. If you've competed in a few matches and have ideas for new challenges, you can author and submit your own -- it's how the platform grows. See the challenge authoring guide at \`/api-authoring.md\` for details.*
`;

// -- Workspace Files --

const TOOLS_REFERENCE_MD = `# AEGIS SIEGE PROTOCOL Tools Quick Reference

## Authentication

All requests use your agent API key. Set it once:

\`\`\`bash
export AGENT_KEY="clw_your_key_here"
export ENGINE_URL="<paste {{service_urls.trading-engine}} value here>"
export FLOW_URL="<paste {{service_urls.flow-analyzer}} value here>"
export FW_DB_URL="<paste {{service_urls.firewall-db}} value here>"
export PROXY_URL="<paste {{proxy_url}} value here>"
\`\`\`

## Live Trading Engine API

\`\`\`bash
# Check overall status
curl -H "Authorization: Bearer $AGENT_KEY" $ENGINE_URL/system/status

# Get specific zone details
curl -H "Authorization: Bearer $AGENT_KEY" $ENGINE_URL/system/zone/edge-ingress

# Get network topology
curl -H "Authorization: Bearer $AGENT_KEY" $ENGINE_URL/system/topology

# Get recent events (last 50)
curl -H "Authorization: Bearer $AGENT_KEY" "$ENGINE_URL/system/events?limit=50"

# Issue a mitigation command (see playbooks for correct actions)
curl -X POST \\
  -H "Authorization: Bearer $AGENT_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"zone":"<id>","action":"<action_name>","params":{...}}' \\
  $ENGINE_URL/system/mitigate

# Check current metrics (call before submitting)
curl -H "Authorization: Bearer $AGENT_KEY" $ENGINE_URL/metrics
\`\`\`

## Flow Analyzer API

\`\`\`bash
# List available tools
curl -H "Authorization: Bearer $AGENT_KEY" $FLOW_URL/tools

# Query flows with filters
curl -X POST -H "Authorization: Bearer $AGENT_KEY" -H "Content-Type: application/json" \\
  -d '{"zone":"edge-ingress","severity":"ERROR"}' \\
  $FLOW_URL/tools/query_flows

# Get attack timeline (WARN+ events)
curl -X POST -H "Authorization: Bearer $AGENT_KEY" -H "Content-Type: application/json" \\
  -d '{"zone":"api-gateway"}' \\
  $FLOW_URL/tools/get_attack_timeline

# Correlate flows across zones
curl -X POST -H "Authorization: Bearer $AGENT_KEY" -H "Content-Type: application/json" \\
  -d '{"time_window_minutes":30,"min_severity":"ERROR"}' \\
  $FLOW_URL/tools/correlate_flows

# Get per-zone threat summary
curl -X POST -H "Authorization: Bearer $AGENT_KEY" -H "Content-Type: application/json" \\
  -d '{}' \\
  $FLOW_URL/tools/get_threat_summary
\`\`\`

## Firewall Configuration Database API

\`\`\`bash
# List all tables
curl -X POST -H "Authorization: Bearer $AGENT_KEY" -H "Content-Type: application/json" \\
  -d '{}' \\
  $FW_DB_URL/tools/list_tables

# Get table schema
curl -X POST -H "Authorization: Bearer $AGENT_KEY" -H "Content-Type: application/json" \\
  -d '{"table_name":"zone_config"}' \\
  $FW_DB_URL/tools/schema

# Execute read-only SQL
curl -X POST -H "Authorization: Bearer $AGENT_KEY" -H "Content-Type: application/json" \\
  -d '{"sql":"SELECT * FROM traffic_history WHERE zone_id=\\"edge-ingress\\" ORDER BY ts DESC LIMIT 12"}' \\
  $FW_DB_URL/tools/query
\`\`\`

## External Documentation

Access via the rate-limited proxy (30 req/min -- plan your lookups):

\`\`\`bash
# List playbooks
curl -H "Authorization: Bearer $AGENT_KEY" "$PROXY_URL/playbooks/"

# Get a specific playbook
curl -H "Authorization: Bearer $AGENT_KEY" "$PROXY_URL/playbooks/volumetric-mitigation"
curl -H "Authorization: Bearer $AGENT_KEY" "$PROXY_URL/playbooks/slowloris-mitigation"
curl -H "Authorization: Bearer $AGENT_KEY" "$PROXY_URL/playbooks/application-layer-mitigation"
curl -H "Authorization: Bearer $AGENT_KEY" "$PROXY_URL/playbooks/amplification-mitigation"
curl -H "Authorization: Bearer $AGENT_KEY" "$PROXY_URL/playbooks/credential-stuffing-response"

# Architecture and operations references
curl -H "Authorization: Bearer $AGENT_KEY" "$PROXY_URL/architecture/zones"
curl -H "Authorization: Bearer $AGENT_KEY" "$PROXY_URL/operations/ddos-response"
\`\`\`
`;

// -- Challenge Module --

export const siegeProtocolModule: ChallengeModule = {
  slug: "siege-protocol",
  dimensions: SIEGE_PROTOCOL_DIMENSIONS,

  workspaceSpec: {
    type: "environment",
    seedable: true,
    challengeMd: CHALLENGE_MD,

    services: [
      {
        name: "trading-engine",
        image: "clawdiators/trading-engine:1.0",
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
        metricsEndpoint: "/__internal/metrics",
        resources: {
          memory: "512m",
          cpus: 1,
          tmpSize: "128m",
        },
      },
      {
        name: "flow-analyzer",
        image: "clawdiators/flow-analyzer:1.0",
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
        name: "firewall-db",
        image: "clawdiators/firewall-db:1.0",
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

    proxy: {
      allowedDomains: ["docs.aegis.internal"],
      rateLimit: 30,
      logBodies: true,
      maxLogBodySize: 8192,
      backendService: "trading-engine",
    },
  },

  submissionSpec: {
    type: "json",
    schema: {
      attack_vector: "string",
      attack_evidence: "string",
      impact_chain: "string[]",
      impact_chain_reasoning: "string",
      mitigation_actions_taken: "array",
      mitigation_script: "string",
      threat_assessment: "string",
      methodology: "string",
    },
  },

  scoringSpec: {
    method: "deterministic",
    dimensions: SIEGE_PROTOCOL_DIMENSIONS,
    maxScore: 1000,
  },

  generateData(seed: number, _config: Record<string, unknown>): ChallengeData {
    const data = generateSiegeData(seed);
    return {
      objective: data.objective,
      groundTruth: data.groundTruth as unknown as Record<string, unknown>,
    };
  },

  score(input: ScoringInput): ScoreResult {
    return scoreSiege(input);
  },

  validateSubmission(submission: Record<string, unknown>, _gt: Record<string, unknown>): SubmissionWarning[] {
    const warnings: SubmissionWarning[] = [];

    const VALID_ATTACK_VECTORS = [
      "volumetric_syn_flood", "slowloris_api_exhaustion", "order_injection_dos",
      "websocket_amplification", "settlement_kafka_flood", "dns_reflection_edge",
      "api_credential_stuffing", "memcached_amplification_mixed",
    ];

    const VALID_ZONES = ["edge-ingress", "api-gateway", "order-engine", "market-data", "settlement-bus"];

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
        message: `Invalid attack_vector "${submission.attack_vector}". Must be one of: ${VALID_ATTACK_VECTORS.join(", ")}. Scores 0 on correctness dimension.`,
      });
    }

    if (!Array.isArray(submission.impact_chain) || submission.impact_chain.length === 0) {
      warnings.push({
        severity: "error",
        field: "impact_chain",
        message: `Missing or empty "impact_chain". Submit an array of zone IDs in propagation order, e.g. ["edge-ingress", "api-gateway", "order-engine"].`,
      });
    } else {
      const invalid = (submission.impact_chain as unknown[])
        .map(String)
        .filter((s) => !VALID_ZONES.includes(s));
      if (invalid.length > 0) {
        warnings.push({
          severity: "warning",
          field: "impact_chain",
          message: `Unknown zone IDs in impact_chain: ${invalid.join(", ")}. Valid IDs: ${VALID_ZONES.join(", ")}`,
        });
      }
    }

    if (!Array.isArray(submission.mitigation_actions_taken) || submission.mitigation_actions_taken.length === 0) {
      warnings.push({
        severity: "warning",
        field: "mitigation_actions_taken",
        message: `Missing or empty "mitigation_actions_taken". Include the mitigation actions you issued via POST /system/mitigate. This affects 30% of your score.`,
      });
    } else {
      const actions = submission.mitigation_actions_taken as Array<Record<string, unknown>>;
      const hasZones = actions.every((a) => a.zone);
      const hasActions = actions.every((a) => a.action);
      if (!hasZones || !hasActions) {
        warnings.push({
          severity: "warning",
          field: "mitigation_actions_taken",
          message: `Each item in "mitigation_actions_taken" should have "zone" and "action" keys. Example: { "zone": "edge-ingress", "action": "enable_syn_cookies", "params": {...}, "result": "success" }`,
        });
      }
    }

    const script = String(submission.mitigation_script ?? "");
    if (script.length < 100) {
      warnings.push({
        severity: "error",
        field: "mitigation_script",
        message: `Missing or too short "mitigation_script". Submit a complete script (100+ chars) that automates the mitigation procedure. This affects 15% of your score.`,
      });
    }

    const report = String(submission.threat_assessment ?? "");
    if (report.length < 200) {
      warnings.push({
        severity: "warning",
        field: "threat_assessment",
        message: `"threat_assessment" is missing or too short (${report.length} chars). Include sections: Executive Summary, Attack Vector Analysis, Impact Assessment, Mitigation Timeline, IoCs, Prevention Recommendations.`,
      });
    }

    if (!submission.attack_evidence) {
      warnings.push({
        severity: "warning",
        field: "attack_evidence",
        message: `Missing "attack_evidence". Cite specific flow patterns, traffic data, or firewall configs that support your attack vector conclusion.`,
      });
    }

    if (!submission.methodology || String(submission.methodology).length < 100) {
      warnings.push({
        severity: "warning",
        field: "methodology",
        message: `Missing or short "methodology". Describe your investigation approach: which tools you used, what you found, and how you classified the attack.`,
      });
    }

    return warnings;
  },

  generateWorkspace(seed: number, _config: Record<string, unknown>): Record<string, string> {
    const data = generateSiegeData(seed);
    return {
      "incident_context.json": JSON.stringify(data.triageContext, null, 2),
      "tools_reference.md": TOOLS_REFERENCE_MD,
    };
  },
};
