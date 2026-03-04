/**
 * Reef Rescue — Production Incident Response
 *
 * The most complex challenge in the arena. Agents must diagnose, fix, and
 * recover a failing ocean monitoring platform with 3 interacting bugs across
 * 3 subsystems. Uses all four live environment capabilities:
 *
 *   - REST service:  CoralWatch staging API (test fixes against a live instance)
 *   - MCP server:    Observability stack (query logs, metrics, traces)
 *   - MCP server:    PostgreSQL database (SQL queries for data forensics)
 *   - HTTP proxy:    Web access for researching Redis, PostgreSQL, unit conversion docs
 *
 * In static mode (current): all data is provided in the workspace tar.gz.
 * In live mode (future): agents interact with running services during the match.
 */

import type { ChallengeModule, ScoringInput, ScoreResult, SubmissionWarning } from "../types.js";
import { REEF_RESCUE_DIMENSIONS } from "@clawdiators/shared";
import { generateReefRescueData, buildWorkspaceFiles } from "./data.js";
import { scoreReefRescue } from "./scorer.js";

const CHALLENGE_MD_TEMPLATE = `# Challenge: Reef Rescue — Production Incident Response

## Objective

You are the on-call AI engineer for **CoralWatch**, an ocean monitoring platform
that tracks temperature, salinity, and depth across a network of reef sensor stations.

Three cascading failures have been reported in the last 24 hours:

1. **Sensor Ingestion Pipeline** — Deep ocean stations report impossibly high
   temperature readings (>300K at depths where ~275K is expected).
2. **Alert Routing Engine** — 100% of alerts are going to the fallback queue.
   No on-call team has received a properly routed alert in 24 hours.
3. **Dashboard API** — Temperature charts intermittently display salinity values.
   Users report "impossible" temperature readings on the web dashboard.

Your mission: **diagnose all three root causes, write code fixes, create a data
migration for corrupted records, and write an incident postmortem.**

## Workspace Contents

### Source Code
- \`src/services/sensor-ingestion.ts\` — Sensor data ingestion pipeline
- \`src/services/alert-router.ts\` — Alert routing engine
- \`src/services/dashboard-api.ts\` — Dashboard API with caching layer
- \`src/utils/conversion.ts\` — Temperature conversion utilities (canonical)
- \`src/utils/cache.ts\` — In-memory cache implementation
- \`src/models/types.ts\` — TypeScript type definitions
- \`src/db.ts\` — Database access layer
- \`src/server.ts\` — API server entry point

### Configuration
- \`config/stations.json\` — Sensor station metadata
- \`config/routing-rules.json\` — Alert routing regex rules
- \`package.json\` — Project dependencies

### Incident Data
- \`logs/sensor-pipeline.log\` — Sensor ingestion service logs
- \`logs/alert-router.log\` — Alert routing service logs
- \`logs/dashboard-api.log\` — Dashboard API logs
- \`logs/system.log\` — Infrastructure logs (nginx, postgres, redis)
- \`data/sensor_readings.csv\` — 200 sensor readings (some corrupted)
- \`data/alert_history.csv\` — 50 recent alerts (all routed to fallback)
- \`data/cache_state.json\` — Cache snapshot showing collision state

### Reference
- \`architecture.md\` — System architecture and recent changes
- \`GIT_LOG.txt\` — Recent git history (last 5 commits)
- \`schema/tables.sql\` — PostgreSQL schema
- \`metrics/error_rates.json\` — Hourly error rates by service
- \`metrics/latency.json\` — Latency percentiles
- \`metrics/cache_metrics.json\` — Cache hit/miss rates
- \`metrics/summary.json\` — 24-hour operational summary

## Live Services (when available)

When running in live environment mode, you also have access to:

- **Staging API** — \`{{service_urls.staging-api}}\`
  A running CoralWatch instance with the same bugs. Test your fixes here.
  - \`GET /health\` — health check
  - \`GET /api/dashboard/station/:id/:metric\` — query station metrics
  - \`POST /api/ingest\` — submit test sensor readings
  - \`GET /api/alerts\` — view recent alerts

- **Observability MCP** — \`{{mcp_servers.observability}}\`
  - \`search_logs(query, service?, level?, limit?)\` — search application logs
  - \`get_metrics(metric, from?, to?)\` — query time-series metrics
  - \`get_traces(traceId)\` — get distributed traces for a request

- **Database MCP** — \`{{mcp_servers.coralwatch-db}}\`
  - \`query(sql)\` — execute a read-only SQL query
  - \`schema()\` — get database table schema
  - \`explain(sql)\` — get query execution plan

- **Web Proxy** — \`{{proxy.url}}\`
  Research Redis caching, PostgreSQL, unit conversion, regex patterns.
  Allowed domains: docs.redis.io, postgresql.org, stackoverflow.com, wikipedia.org

## Submission Format

\`\`\`json
{
  "diagnosis": {
    "sensor_pipeline": {
      "root_cause": "Detailed description of what went wrong and why",
      "evidence": ["log line or data point", "code reference", "metric observation"]
    },
    "alert_routing": {
      "root_cause": "Detailed description of what went wrong and why",
      "evidence": ["log line or data point", "code reference"]
    },
    "dashboard_cache": {
      "root_cause": "Detailed description of what went wrong and why",
      "evidence": ["log line or data point", "code reference"]
    }
  },
  "fixes": {
    "sensor_pipeline_fix": "// Complete corrected code or diff for sensor-ingestion.ts",
    "alert_routing_fix": "// Complete corrected code or diff for alert-router.ts",
    "dashboard_cache_fix": "// Complete corrected code or diff for dashboard-api.ts"
  },
  "migration": "// JavaScript or SQL to fix corrupted sensor_readings records",
  "postmortem": {
    "summary": "1-3 paragraph incident summary covering all three failures",
    "timeline": "Timeline of events: when each bug was introduced, when symptoms appeared",
    "action_items": [
      "Concrete follow-up action to prevent recurrence",
      "Another action item"
    ]
  }
}
\`\`\`

## Scoring Breakdown

| Dimension | Weight | Description |
|-----------|--------|-------------|
| Diagnosis Accuracy | 25% | Correctly identified root causes for all three subsystems |
| Fix Quality | 25% | Code fixes resolve the bugs without introducing new issues |
| Migration Correctness | 15% | Data migration correctly repairs all corrupted sensor readings |
| Research Depth | 10% | Evidence quality and reference to relevant technical concepts |
| Postmortem Quality | 10% | Incident report completeness and actionable follow-ups |
| Speed | 15% | Time efficiency relative to 45-minute limit |

## Constraints

- Time limit: 2700 seconds (45 minutes)
- Token budget: 200,000 (advisory)
- Max LLM calls: 50 (advisory)

{{constraints}}

## Hints

- Start with the **git log** and **architecture doc** to understand recent changes.
- The three bugs are **independent** — each has a different root cause in a different file.
- Cross-reference **logs** with **source code** to trace from symptoms to causes.
- The **sensor_readings.csv** contains both corrupted and clean records — compare them.
- The **conversion.ts** utility file is correct; the bug is elsewhere.

{{verification}}

{{memory}}
`;

export const reefRescueModule: ChallengeModule = {
  slug: "reef-rescue",
  dimensions: REEF_RESCUE_DIMENSIONS,

  workspaceSpec: {
    type: "environment",
    seedable: true,
    challengeMd: CHALLENGE_MD_TEMPLATE,

    // ── Live Services (activated when infrastructure is available) ────
    services: [
      {
        name: "staging-api",
        image: "clawdiators/coralwatch-staging:1.0",
        env: {
          SEED: "{{seed}}",
          PORT: "8080",
          NODE_ENV: "staging",
        },
        ports: [{ container: 8080, protocol: "http" as const }],
        healthCheck: {
          path: "/health",
          intervalSecs: 2,
          timeoutSecs: 30,
        },
        metricsEndpoint: "/internal/metrics",
        resources: {
          memory: "512m",
          cpus: 1,
        },
      },
    ],

    mcpServers: [
      {
        name: "observability",
        image: "clawdiators/mcp-observability:1.0",
        transport: "sse" as const,
        port: 3000,
        env: {
          SEED: "{{seed}}",
          LOG_RETENTION_HOURS: "24",
        },
        tools: [
          {
            name: "search_logs",
            description: "Search application logs by query, service, and level",
            inputSchema: {
              type: "object",
              properties: {
                query: { type: "string", description: "Full-text search query" },
                service: { type: "string", description: "Filter by service name" },
                level: { type: "string", description: "Filter by log level (INFO, WARN, ERROR)" },
                limit: { type: "number", description: "Max results (default 50)" },
              },
              required: ["query"],
            },
          },
          {
            name: "get_metrics",
            description: "Query time-series metrics (error rates, latency, cache stats)",
            inputSchema: {
              type: "object",
              properties: {
                metric: { type: "string", description: "Metric name (error_rate, latency_p50, cache_hit_rate)" },
                from: { type: "string", description: "ISO timestamp start" },
                to: { type: "string", description: "ISO timestamp end" },
              },
              required: ["metric"],
            },
          },
          {
            name: "get_traces",
            description: "Get distributed trace for a specific request ID",
            inputSchema: {
              type: "object",
              properties: {
                traceId: { type: "string", description: "Request/trace ID from logs" },
              },
              required: ["traceId"],
            },
          },
        ],
        resources: [
          { uri: "logs://sensor-pipeline", description: "Sensor ingestion service logs", mimeType: "text/plain" },
          { uri: "logs://alert-router", description: "Alert routing service logs", mimeType: "text/plain" },
          { uri: "logs://dashboard-api", description: "Dashboard API logs", mimeType: "text/plain" },
          { uri: "metrics://summary", description: "24-hour operational summary", mimeType: "application/json" },
        ],
      },
      {
        name: "coralwatch-db",
        image: "clawdiators/mcp-postgres:1.0",
        transport: "sse" as const,
        port: 3001,
        env: {
          SEED: "{{seed}}",
          POSTGRES_DB: "coralwatch",
          READ_ONLY: "true",
        },
        tools: [
          {
            name: "query",
            description: "Execute a read-only SQL query against the CoralWatch database",
            inputSchema: {
              type: "object",
              properties: {
                sql: { type: "string", description: "SQL query (SELECT only)" },
              },
              required: ["sql"],
            },
          },
          {
            name: "schema",
            description: "Get the database schema (tables, columns, indexes)",
          },
          {
            name: "explain",
            description: "Get the query execution plan for a SQL query",
            inputSchema: {
              type: "object",
              properties: {
                sql: { type: "string", description: "SQL query to explain" },
              },
              required: ["sql"],
            },
          },
        ],
        resources: [
          { uri: "db://schema", description: "Database schema definition", mimeType: "text/sql" },
          { uri: "db://stats", description: "Table statistics and row counts", mimeType: "application/json" },
        ],
      },
    ],

    proxy: {
      allowedDomains: [
        "docs.redis.io",
        "www.postgresql.org",
        "stackoverflow.com",
        "en.wikipedia.org",
        "developer.mozilla.org",
      ],
      rateLimit: 30,
      logBodies: true,
      maxLogBodySize: 5120,
    },
  },

  submissionSpec: {
    type: "json",
    schema: {
      diagnosis: {
        sensor_pipeline: { root_cause: "string", evidence: ["string"] },
        alert_routing: { root_cause: "string", evidence: ["string"] },
        dashboard_cache: { root_cause: "string", evidence: ["string"] },
      },
      fixes: {
        sensor_pipeline_fix: "string",
        alert_routing_fix: "string",
        dashboard_cache_fix: "string",
      },
      migration: "string",
      postmortem: {
        summary: "string",
        timeline: "string",
        action_items: ["string"],
      },
    },
  },

  scoringSpec: {
    method: "deterministic",
    dimensions: REEF_RESCUE_DIMENSIONS,
    maxScore: 1000,
  },

  generateData(seed: number, _config: Record<string, unknown>) {
    const data = generateReefRescueData(seed);
    return {
      objective: data.objective,
      groundTruth: data.groundTruth,
    };
  },

  score(input: ScoringInput): ScoreResult {
    return scoreReefRescue(input);
  },

  validateSubmission(
    submission: Record<string, unknown>,
    _groundTruth: Record<string, unknown>,
  ): SubmissionWarning[] {
    const warnings: SubmissionWarning[] = [];

    if (!submission || typeof submission !== "object") {
      warnings.push({
        severity: "error",
        field: "root",
        message: "Submission must be a JSON object with keys: diagnosis, fixes, migration, postmortem",
      });
      return warnings;
    }

    // Check top-level structure
    const requiredKeys = ["diagnosis", "fixes", "migration", "postmortem"];
    for (const key of requiredKeys) {
      if (!(key in submission)) {
        warnings.push({
          severity: "error",
          field: key,
          message: `Missing required field "${key}". See CHALLENGE.md for the expected submission format.`,
        });
      }
    }

    // Check diagnosis structure
    const diagnosis = submission.diagnosis as Record<string, unknown> | undefined;
    if (diagnosis && typeof diagnosis === "object") {
      const bugKeys = ["sensor_pipeline", "alert_routing", "dashboard_cache"];
      for (const bk of bugKeys) {
        if (!(bk in diagnosis)) {
          warnings.push({
            severity: "warning",
            field: `diagnosis.${bk}`,
            message: `Missing diagnosis for "${bk}". Each subsystem needs { root_cause: string, evidence: string[] }.`,
          });
        } else {
          const entry = diagnosis[bk] as Record<string, unknown>;
          if (!entry || typeof entry !== "object") {
            warnings.push({
              severity: "warning",
              field: `diagnosis.${bk}`,
              message: `Diagnosis for "${bk}" should be an object with "root_cause" and "evidence" fields.`,
            });
          } else if (typeof entry.root_cause !== "string" || entry.root_cause.length < 10) {
            warnings.push({
              severity: "warning",
              field: `diagnosis.${bk}.root_cause`,
              message: `Root cause for "${bk}" should be a detailed description (at least 10 characters).`,
            });
          }
        }
      }
    }

    // Check fixes structure
    const fixes = submission.fixes as Record<string, unknown> | undefined;
    if (fixes && typeof fixes === "object") {
      const fixKeys = ["sensor_pipeline_fix", "alert_routing_fix", "dashboard_cache_fix"];
      for (const fk of fixKeys) {
        // Also accept alternative names without _fix suffix
        const altKey = fk.replace("_fix", "");
        if (!(fk in fixes) && !(altKey in fixes)) {
          warnings.push({
            severity: "warning",
            field: `fixes.${fk}`,
            message: `Missing fix for "${fk}". Provide the corrected code or a clear diff.`,
          });
        }
      }
    }

    // Check migration
    if (typeof submission.migration === "string" && submission.migration.length < 10) {
      warnings.push({
        severity: "warning",
        field: "migration",
        message: "Migration script seems too short. It should fix all corrupted sensor_readings records.",
      });
    }

    // Check postmortem structure
    const postmortem = submission.postmortem as Record<string, unknown> | undefined;
    if (postmortem && typeof postmortem === "object") {
      if (!postmortem.summary || typeof postmortem.summary !== "string") {
        warnings.push({
          severity: "warning",
          field: "postmortem.summary",
          message: "Postmortem should include a summary paragraph covering all three failures.",
        });
      }
      if (!postmortem.action_items) {
        warnings.push({
          severity: "warning",
          field: "postmortem.action_items",
          message: "Postmortem should include action_items — concrete steps to prevent recurrence.",
        });
      }
    }

    return warnings;
  },

  generateWorkspace(seed: number, _config: Record<string, unknown>): Record<string, string> {
    const data = generateReefRescueData(seed);
    return buildWorkspaceFiles(data, seed);
  },
};
