# Pipeline Breach: MCP-to-REST Migration Test Report

**Agent:** rest-tester-breach
**Date:** 2026-03-07
**Match ID:** 007c3b5f-7125-4508-bf33-75e88d697ad0
**Final Score:** 761/1000 (Win, +29 Elo)

---

## Summary

Successfully completed a full end-to-end test of the pipeline-breach challenge
using REST APIs exclusively. The MCP-to-REST migration is largely successful
with one significant bug in the documentation proxy service.

---

## Test Results by Service

### 1. Match Entry (PASS)

`POST /api/v1/matches/enter` with `{"challenge_slug": "pipeline-breach"}` works correctly.

- Returns match_id, workspace_url, challenge_md, submission_spec, checkpoint_url
- Service URLs are embedded in the challenge_md via template variables like `{{service_urls.pipeline-api}}`
- Template variables are correctly resolved to absolute paths like `/api/v1/matches/{match_id}/services/pipeline-api`
- Docker containers launch automatically (3 services: pipeline-api, build-logs, artifact-db)
- All containers reached healthy state within ~1 minute

### 2. Workspace Download (PASS)

`GET /api/v1/challenges/pipeline-breach/workspace?seed=...&match_id=...` returns a valid tar.gz.

Contents:
- `CHALLENGE.md` - Contains REST curl examples (NOT MCP) - properly migrated
- `triage_context.json` - Initial alert data
- `tools_reference.md` - Quick reference for all API endpoints
- `service_map.md` - Microservice architecture overview

### 3. CHALLENGE.md Content (PASS - REST, not MCP)

The CHALLENGE.md contains:
- REST curl command examples (e.g., `curl -X POST ... /tools/query_build_logs`)
- HTTP method + path tables for all endpoints
- No references to MCP, SSE, JSON-RPC, or MCP-style tool invocations
- Proper authentication instructions (Bearer token)
- All service URLs use the `/api/v1/matches/{match_id}/services/{service-name}/` pattern

### 4. Pipeline API Service (PASS - all endpoints)

Base: `/api/v1/matches/{match_id}/services/pipeline-api`

| Endpoint | Method | Status | Notes |
|---|---|---|---|
| `/pipeline/status` | GET | 200 OK | Returns all 8 service statuses correctly |
| `/pipeline/service/{id}` | GET | 200 OK | Returns detailed build info, compromised_package field |
| `/pipeline/topology` | GET | 200 OK | Returns services + dependency edges graph |
| `/pipeline/builds?service=X` | GET | 200 OK | Returns recent builds per service |
| `/pipeline/events?limit=N` | GET | 200 OK | Returns security events with severity levels |
| `/pipeline/remediate` | POST | 200 OK | Accepts pin_dependency, rotate_secrets, rebuild actions |
| `/metrics` | GET | 200 OK | Returns remediation scoring metrics |

### 5. Build Logs Service (PASS - all endpoints)

Base: `/api/v1/matches/{match_id}/services/build-logs`

| Endpoint | Method | Status | Notes |
|---|---|---|---|
| `/tools` | GET | 200 OK | Lists 4 available tools with parameter schemas |
| `/tools/query_build_logs` | POST | 200 OK | Accepts service, severity, pattern filters |
| `/tools/get_anomaly_timeline` | POST | 200 OK | Returns chronological anomaly events |
| `/tools/correlate_events` | POST | 200 OK | Cross-service event correlation works |
| `/tools/get_security_summary` | POST | 200 OK | Per-service finding counts |

### 6. Artifact DB Service (PASS - all endpoints)

Base: `/api/v1/matches/{match_id}/services/artifact-db`

| Endpoint | Method | Status | Notes |
|---|---|---|---|
| `/tools` | GET | 200 OK | Lists 3 tools (list_tables, schema, query) |
| `/tools/list_tables` | POST | 200 OK | Returns 7 tables with row counts and schemas |
| `/tools/schema` | POST | 200 OK | Returns table column definitions |
| `/tools/query` | POST | 200 OK | SQL queries work; tested multiple tables |

### 7. Documentation Proxy (FAIL - all paths return 404)

Base: `/api/v1/matches/{match_id}/proxy`

| Endpoint | Method | Status | Notes |
|---|---|---|---|
| `/runbooks/` | GET | 404 | Returns HTML: "Cannot GET /docs/runbooks/" |
| `/runbooks/compromised-maintainer` | GET | 404 | Returns HTML: "Cannot GET /docs/runbooks/compromised-maintainer" |
| `/runbooks/dependency-confusion` | GET | 404 | Returns HTML error |
| `/runbooks/secret-rotation` | GET | 404 | Returns HTML error |
| `/security/supply-chain-policy` | GET | 404 | Returns HTML error |
| `/architecture/services` | GET | 404 | Returns HTML error |

### 8. Submission (PASS)

`POST /api/v1/matches/{match_id}/submit` works correctly and returns scoring breakdown.

---

## Bugs Found

### BUG 1: Documentation Proxy Completely Broken (Severity: HIGH)

**Description:** All proxy endpoints return HTML 404 errors: `Cannot GET /docs/...`

**Root Cause:** The proxy route in `service-proxy.ts` forwards requests to the backend service
with path prefix `/docs` (the default from `proxySpec.backendPathPrefix ?? "/docs"`). However:

1. The proxy config in `pipeline-breach/index.ts` does NOT specify `backendService` or `backendPathPrefix`
2. The proxy defaults to the first service (`pipeline-api`)
3. The pipeline-api service has NO `/docs/*` routes - it only serves `/pipeline/*`, `/metrics`, and `/health`
4. No dedicated docs service exists in the docker-compose.yml

**Impact:** Agents cannot access any documentation, runbooks, architecture references, or
security policies through the proxy. This means:
- The investigation playbook step 6 ("Research the appropriate runbook via proxy") is impossible
- Security runbooks for dependency-confusion, compromised-maintainer, ci-workflow-injection,
  cache-poisoning, and secret-rotation are all inaccessible
- Architecture and security policy documentation is inaccessible

**Fix Options:**
1. Add a `/docs/*` route handler to the pipeline-api Express app that serves the runbook/docs content
2. Add a dedicated docs service to docker-compose.yml and update the proxy config to reference it
3. Add `backendService` and `backendPathPrefix` to the proxy config pointing to a service that
   actually has docs routes

**Code Location:**
- Proxy config: `packages/api/src/challenges/pipeline-breach/index.ts` lines ~280-285 (proxy spec)
- Proxy routing: `packages/api/src/routes/service-proxy.ts` lines ~155-170 (default pathPrefix)
- Pipeline API: `packages/api/src/challenges/pipeline-breach/services/pipeline-api/index.js` (no /docs routes)

### BUG 2: tools_reference.md Contains Unresolved Template Variables (Severity: LOW)

**Description:** The `tools_reference.md` file in the workspace contains raw template variable
placeholders like `<paste {{service_urls.pipeline-api}} value here>` instead of resolved URLs.

**Example from file:**
```
export API_BASE="<paste {{service_urls.pipeline-api}} value here>"
export BUILD_LOGS_URL="<paste {{service_urls.build-logs}} value here>"
```

The CHALLENGE.md properly resolves `{{service_urls.*}}` templates, but tools_reference.md does not
because it's returned from `generateWorkspace()` as a static string. The template resolution in
`injectChallengeMdContext()` only runs on the challengeMd field.

**Impact:** Minor. Agents must extract the actual URLs from CHALLENGE.md rather than tools_reference.md.
The CHALLENGE.md correctly provides all resolved URLs.

---

## Confusing Documentation

### challenge.config still references "mcpServers"

The challenge details endpoint (`GET /api/v1/challenges/pipeline-breach`) returns:
```json
"config": {
    "proxy": { "rateLimit": 30, "allowedDomains": ["docs.pipeline.internal"] },
    "services": ["pipeline-api"],
    "mcpServers": ["mcp-build-logs", "mcp-artifact-db"]
}
```

The `mcpServers` field name and the `mcp-` prefixed names are remnants of the MCP era.
These should be renamed to match the REST paradigm (e.g., `restServices` or just `services`
including build-logs and artifact-db). Currently `services` only lists `pipeline-api` while
the other two are under `mcpServers`.

### skill.md has no environment challenge documentation

The skill.md file does not document:
- How environment challenges work
- The `/api/v1/matches/{match_id}/services/{service}/...` URL pattern
- How the proxy works
- That Docker containers are launched automatically

Agents must rely entirely on CHALLENGE.md for this information.

---

## Score Breakdown

| Dimension | Score | Max | Notes |
|---|---|---|---|
| Correctness | 200 | 200 | Full marks - correct attack_vector (pypi_backdoor) |
| Completeness | 284 | 450 | Good but not perfect blast radius + remediation |
| Code Quality | 117 | 150 | Remediation script scored well |
| Methodology | 160 | 200 | Multi-source investigation documented |
| **Total** | **761** | **1000** | **Win (+29 Elo)** |

---

## Service Endpoint Test Matrix (Complete)

All calls used the pattern:
```
{METHOD} http://localhost:3001/api/v1/matches/{match_id}/services/{service-name}/{path}
Authorization: Bearer clw_...
```

| Service | Endpoint | Method | HTTP Status | Response Format |
|---|---|---|---|---|
| pipeline-api | /pipeline/status | GET | 200 | JSON `{ok, data}` |
| pipeline-api | /pipeline/service/user-service | GET | 200 | JSON `{ok, data}` |
| pipeline-api | /pipeline/service/api-gateway | GET | 200 | JSON `{ok, data}` |
| pipeline-api | /pipeline/topology | GET | 200 | JSON `{ok, data}` |
| pipeline-api | /pipeline/events?limit=20 | GET | 200 | JSON `{ok, data}` |
| pipeline-api | /pipeline/remediate | POST | 200 | JSON `{ok, data}` |
| pipeline-api | /metrics | GET | 200 | JSON `{ok, data}` |
| build-logs | /tools | GET | 200 | JSON `{tools}` |
| build-logs | /tools/query_build_logs | POST | 200 | JSON `{ok, data}` |
| build-logs | /tools/get_anomaly_timeline | POST | 200 | JSON `{ok, data}` |
| build-logs | /tools/correlate_events | POST | 200 | JSON `{ok, data}` |
| build-logs | /tools/get_security_summary | POST | 200 | JSON `{ok, data}` |
| artifact-db | /tools | GET | 200 | JSON `{tools}` |
| artifact-db | /tools/list_tables | POST | 200 | JSON `{ok, data}` |
| artifact-db | /tools/schema | POST | 200 | JSON `{ok, data}` |
| artifact-db | /tools/query | POST | 200 | JSON `{ok, data}` |
| proxy | /runbooks/ | GET | 404 | HTML error |
| proxy | /runbooks/compromised-maintainer | GET | 404 | HTML error |
| proxy | /runbooks/dependency-confusion | GET | 404 | HTML error |
| proxy | /security/supply-chain-policy | GET | 404 | HTML error |
| proxy | /architecture/services | GET | 404 | HTML error |

---

## Conclusion

The MCP-to-REST migration for pipeline-breach is **mostly successful**:

- **3 out of 4 services work perfectly** via REST (pipeline-api, build-logs, artifact-db)
- **CHALLENGE.md is fully migrated** to REST curl examples with no MCP references
- **Match workflow is complete**: enter -> workspace download -> service interaction -> remediation -> metrics -> submit
- **The challenge is solvable** using only REST calls (score: 761, Win)

**One critical bug:** The documentation proxy is completely non-functional because there is
no docs route handler on the backend service. This prevents access to security runbooks and
policy documentation.

**One naming issue:** The challenge config still uses `mcpServers` field name for what are
now REST services.
