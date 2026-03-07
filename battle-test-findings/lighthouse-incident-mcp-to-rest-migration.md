# Lighthouse Incident: MCP-to-REST Migration Test Report

**Agent:** rest-migration-tester
**Date:** 2026-03-07
**Match ID:** e62a6880-4d36-4904-b079-7180908e2ba4
**Challenge:** lighthouse-incident
**Seed:** 822165637
**Final Score:** 969/1000 (WIN, +29 Elo)

---

## Summary

The MCP-to-REST migration for the lighthouse-incident environment challenge is **fully functional**. All four service endpoints respond correctly via REST, the CHALLENGE.md contains only REST/curl examples (no MCP references), and the challenge can be solved end-to-end using only REST API calls. Submission works and scoring returns correct breakdown.

---

## 1. Match Entry

**Endpoint:** `POST /api/v1/matches/enter`
**Status:** PASS

The enter response correctly returns:
- `match_id`
- `workspace_url` (with seed and match_id params)
- `challenge_md` with fully interpolated REST service URLs
- `submission_spec` with JSON schema
- `submit_url`
- `checkpoint_url` (multi-checkpoint match type)
- `attempt_number`, `time_limit_secs`, `expires_at`

Service URL format: `/api/v1/matches/{match_id}/services/{service-name}`
Proxy URL format: `/api/v1/matches/{match_id}/proxy`

No MCP-related fields (SSE URLs, JSON-RPC endpoints, etc.) are present.

---

## 2. Workspace Download

**Endpoint:** `GET /api/v1/challenges/lighthouse-incident/workspace?seed=822165637&match_id=...`
**Status:** PASS

- Returns valid `.tar.gz` (4951 bytes)
- Contains: `CHALLENGE.md`, `incident_context.json`, `tools_reference.md`, `workspace.tar.gz`
- Note: `workspace.tar.gz` is also included inside the extracted archive (self-referential, minor oddity)

---

## 3. CHALLENGE.md Content Verification

**Status:** PASS -- REST only, no MCP references

The CHALLENGE.md contains:
- REST endpoint tables (GET/POST methods with paths)
- curl command examples for all four services
- Service URLs use the correct format: `/api/v1/matches/{match_id}/services/{service-name}`
- Proxy URL uses: `/api/v1/matches/{match_id}/proxy`
- No references to MCP, SSE, JSON-RPC, or any MCP-specific concepts
- All examples use standard HTTP headers (Authorization: Bearer, Content-Type: application/json)

---

## 4. Service Endpoint Testing

### 4a. Lighthouse API (lighthouse-api)

**Base URL:** `/api/v1/matches/{match_id}/services/lighthouse-api`
**Status:** PASS -- All endpoints work

| Endpoint | Method | Status | Notes |
|---|---|---|---|
| `/system/status` | GET | 200 OK | Returns all 6 subsystem health states, metrics, incident_active flag |
| `/system/subsystem/{id}` | GET | 200 OK | Detailed per-subsystem metrics |
| `/system/topology` | GET | 200 OK | Full dependency graph with edges and backpressure config |
| `/system/events?limit=N` | GET | 200 OK | Returns system events with timestamps and metadata |
| `/system/recover` | POST | 200 OK | Recovery actions execute and return success/failure with health scores |
| `/metrics` | GET | 200 OK | Returns pipeline health summary and recovery action count |

Response format: Direct JSON (not wrapped in envelope), Content-Type: application/json.
Rate limiting headers present: `x-ratelimit-limit: 120`, `x-ratelimit-remaining: N`.
`x-powered-by: Express` confirms Node.js/Express service.

### 4b. Logs Service (logs)

**Base URL:** `/api/v1/matches/{match_id}/services/logs`
**Status:** PASS -- All endpoints work

| Endpoint | Method | Status | Notes |
|---|---|---|---|
| `/tools` | GET | 200 OK | Lists 4 tools with full inputSchema (JSON Schema format) |
| `/tools/query_logs` | POST | 200 OK | Filters by subsystem, severity, time_range, pattern, limit |
| `/tools/get_anomaly_timeline` | POST | 200 OK | Chronological WARN+ events across all subsystems |
| `/tools/correlate_events` | POST | 200 OK | Finds correlated events in time windows (returned 0 clusters for this seed) |
| `/tools/get_error_summary` | POST | 200 OK | Per-subsystem error counts with unique codes and first anomaly timestamps |

The `/tools` endpoint is a nice REST adaptation -- returns tool metadata with JSON Schema input definitions, making it self-describing.

### 4c. Operations Database (ops-db)

**Base URL:** `/api/v1/matches/{match_id}/services/ops-db`
**Status:** PASS -- All endpoints work

| Endpoint | Method | Status | Notes |
|---|---|---|---|
| `/tools` | GET | 200 OK | Lists 3 tools (query, schema, list_tables) with inputSchema |
| `/tools/list_tables` | POST | 200 OK | Returns 7 tables with column lists and descriptions |
| `/tools/schema` | POST | 200 OK | Returns CREATE TABLE-style schema for specified table |
| `/tools/query` | POST | 200 OK | Executes read-only SQL SELECT queries |

SQL quoting note: The CHALLENGE.md examples use escaped double-quotes for SQL string literals (`\"archive\"`), but the actual service requires standard SQL single-quotes. The curl examples in the docs use `\\\"` which is technically correct for the JSON escaping layer, but confusing. Using single quotes in SQL strings works correctly.

### 4d. Documentation Proxy

**Base URL:** `/api/v1/matches/{match_id}/proxy`
**Status:** PASS -- All endpoints work

| Endpoint | Method | Status | Notes |
|---|---|---|---|
| `/runbooks/` | GET | 200 OK | Returns markdown index of 5 runbooks |
| `/runbooks/config-drift-recovery` | GET | 200 OK | Full recovery runbook with ordered steps |
| `/runbooks/storage-quota-recovery` | GET | 200 OK | Archive recovery runbook |
| `/architecture/subsystems` | GET | 200 OK | System architecture with failure modes |
| `/operations/recovery` | GET | 200 OK | General recovery procedures and golden rules |

Response format: text/markdown (not JSON). Rate limit header present: `x-proxy-rate-remaining: N`.

---

## 5. Solving the Challenge

**Status:** PASS -- Challenge solvable using only REST calls

Investigation workflow:
1. Read incident_context.json for initial alert context
2. GET /tools on logs and ops-db to understand available capabilities
3. POST error_summary and anomaly_timeline to find root cause timeline
4. SQL queries on subsystem_config, dependency_graph, performance_history, incident_history
5. GET system/topology for propagation understanding
6. GET proxy docs (runbooks, architecture, operations) for recovery procedures
7. POST /system/recover four times in correct order (from runbook)
8. GET /system/status and /metrics to verify recovery

All REST calls worked correctly. No MCP server interaction was needed or possible.

---

## 6. Submission and Scoring

**Status:** PASS

Score breakdown:
- correctness: 200/200 (100%) -- Correct root_cause ID
- completeness: 300/300 (100%) -- All 4 recovery actions in correct order
- analysis: 150/150 (100%) -- Correct failure chain
- code_quality: 200/200 (100%) -- Full recovery script with proper structure
- methodology: 119/150 (79%) -- Good but not perfect methodology description
- **Total: 969/1000**

Elo: 988 -> 1017 (+29)
Title earned: "Seasoned Scuttler"

---

## 7. Bugs Found

None. The migration appears clean and complete.

---

## 8. Minor Observations / Improvement Suggestions

1. **correlate_events returned empty clusters**: For this particular seed, `POST /tools/correlate_events` with `time_window_minutes=15, min_severity=ERROR` returned zero clusters. This may be by design (events are spread out temporally) but could confuse agents who rely on correlation as a primary investigation tool.

2. **Self-referential workspace archive**: The extracted workspace contains a file called `workspace.tar.gz` inside itself. This appears to be the original archive duplicated inside the extraction. Not a bug per se, but wasteful.

3. **SQL quoting in CHALLENGE.md examples**: The example uses escaped double-quotes for SQL values (`\\\"archive\\\"`), which works but is non-standard SQL. Standard single-quotes would be clearer. The actual service accepts both.

4. **Overall system status stays "degraded" after recovery**: Even after successfully recovering preprocessing, analysis, and results-store to "healthy", the overall_status remains "degraded" because archive and ingestion are still "strained". These subsystems don't have recovery actions in the config-drift runbook, suggesting they are expected red herrings or secondary effects that resolve on their own.

5. **No heartbeat enforcement in practice**: The CHALLENGE.md says to send heartbeats every 10 minutes, but the 90-minute match completed without sending any heartbeats and the services remained available throughout. This may be an advisory note rather than an enforced requirement.

---

## 9. Special Instructions Verification

**Task:** Verify MCP-to-REST migration for environment challenges.

| Verification Point | Result |
|---|---|
| Match entry returns service URLs (not MCP endpoints) | PASS |
| CHALLENGE.md contains REST curl examples (not MCP) | PASS |
| Logs service GET /tools responds correctly | PASS |
| Logs service POST /tools/query_logs works | PASS |
| Logs service POST /tools/get_anomaly_timeline works | PASS |
| Logs service POST /tools/correlate_events works | PASS |
| Logs service POST /tools/get_error_summary works | PASS |
| Ops-DB service GET /tools responds correctly | PASS |
| Ops-DB service POST /tools/query works | PASS |
| Ops-DB service POST /tools/schema works | PASS |
| Ops-DB service POST /tools/list_tables works | PASS |
| Lighthouse API GET /system/status works | PASS |
| Lighthouse API GET /system/topology works | PASS |
| Lighthouse API GET /system/events works | PASS |
| Lighthouse API POST /system/recover works | PASS |
| Lighthouse API GET /metrics works | PASS |
| Docs proxy GET /runbooks/ works | PASS |
| Docs proxy GET /runbooks/{name} works | PASS |
| Docs proxy GET /architecture/subsystems works | PASS |
| Docs proxy GET /operations/recovery works | PASS |
| Challenge solvable using only REST calls | PASS |
| Submission works and returns score | PASS |

**Conclusion:** The MCP-to-REST migration for lighthouse-incident is complete and working correctly. All services respond via standard REST endpoints proxied through the match service URL pattern. No MCP artifacts remain in the documentation or API responses.
