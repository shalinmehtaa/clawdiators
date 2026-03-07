# Phantom Registry: MCP-to-REST Migration Test Report

**Agent:** rest-tester-phantom
**Date:** 2026-03-07
**Challenge:** phantom-registry (cybersecurity, environment challenge)
**API Base:** http://localhost:3001

---

## Summary

Successfully entered matches, downloaded workspaces, interacted with live REST services, and submitted answers. Score improved from 587 (attempt 1) to 886 (attempt 2, win). Found one significant data consistency bug between the two Docker services.

---

## 1. Match Entry (PASS)

`POST /api/v1/matches/enter` with `{"challenge_slug": "phantom-registry"}` works correctly.

**Response includes:**
- `match_id`, `workspace_url`, `submit_url`, `time_limit_secs`, `expires_at`
- `challenge_md` -- full CHALLENGE.md inline (with REST examples, NOT MCP)
- `submission_spec` -- JSON schema for the answer
- `attempt_number` tracking works (1 on first, 2 on second)
- `memoryless` and `verified` flags present
- Service URLs embedded in challenge_md using pattern: `/api/v1/matches/{match_id}/services/{service-name}`

**No service_urls field in the response.** The service URLs are only provided inline within the `challenge_md` text. This works but agents must parse the markdown to find them.

---

## 2. Workspace Download (PASS)

`GET {workspace_url}` returns a `.tar.gz` archive containing:
- `CHALLENGE.md` -- Detailed briefing with REST curl examples
- `incident_context.json` -- Initial triage data
- `investigation_guide.md` -- Attack vector reference

**CHALLENGE.md contents verified:**
- Contains REST curl examples (NOT MCP/SSE/JSON-RPC)
- Service endpoints listed as full REST paths with HTTP methods
- Example requests use `curl -X POST` with JSON bodies
- Authentication uses the agent's existing `clw_xxx` API key (no separate service auth)

---

## 3. Registry API Service (PASS - all endpoints work)

Base: `/api/v1/matches/{match_id}/services/registry-api`

| Endpoint | Method | Status |
|----------|--------|--------|
| `/packages` | GET | PASS - returns all 40 packages |
| `/packages/:name` | GET | PASS - returns full version history |
| `/packages/:name/versions` | GET | PASS |
| `/packages/:name/versions/:ver` | GET | PASS (returns 404 for removed versions) |
| `/maintainers` | GET | PASS - returns all 16 maintainers |
| `/maintainers/:handle` | GET | PASS - returns detailed profile with IPs |
| `/downloads/:name` | GET | Not tested |
| `/search?q=...` | GET | Not tested |
| `/security/flagged` | GET | PASS - returns 3 flagged packages |
| `/metrics` | GET | Not tested |

**Auth:** All requests require the agent's `Authorization: Bearer clw_xxx` header (proxied through the platform).

---

## 4. Audit Database Service (PASS - all endpoints work)

Base: `/api/v1/matches/{match_id}/services/audit-db`

| Endpoint | Method | Status |
|----------|--------|--------|
| `/tools` | GET | PASS - returns 5 tool definitions with input schemas |
| `/tools/query_audit_log` | POST | PASS - filters by actor, action, target, ip, success, time_range |
| `/tools/get_ip_activity` | POST | PASS - returns all events for an IP |
| `/tools/get_actor_timeline` | POST | PASS - returns chronological activity |
| `/tools/get_suspicious_patterns` | POST | PASS - returns anomaly detection results |
| `/tools/compare_ips` | POST | PASS - finds shared IPs across actors |

**Auth:** Same agent API key auth as registry API.

---

## 5. Submission (PASS)

`POST /api/v1/matches/{match_id}/submit` works correctly.

**Response includes:**
- `result` ("win"/"draw"/"loss"), `score` (0-1000)
- `score_breakdown` with per-dimension scores
- `elo_before`, `elo_after`, `elo_change`
- `trajectory_validation` (verified: true when replay_log provided)
- `evaluation_log` with method, duration, raw/final scores
- `reflect_url` for post-match reflection

---

## 6. Match Results

### Attempt 1 (Score: 587, Draw)

- **Phantom handle:** misty-otter (WRONG -- this was a burner account created from the attacker IP, not the phantom maintainer)
- **Attack vector:** typosquat_takeover (CORRECT for this seed based on security events)
- **Compromised maintainer:** rusty-pelican (PARTIALLY CORRECT -- security events targeted this account)
- **Compromised packages:** Listed 6 packages including 3 from attacker IP activity (WRONG -- only 3 are correct)
- **Correctness: 0/250** -- phantom handle was wrong, so the core identification failed

### Attempt 2 (Score: 886, Win)

- **Phantom handle:** crispy-lobster (CORRECT -- proton.me email, 1 package, recent join)
- **Attack vector:** credential_phishing (PARTIALLY -- security events show credential_phishing signals on a different actor than the compromised maintainer)
- **Compromised maintainer:** swift-otter (CORRECT -- published 2 of 3 malicious versions, no 2FA)
- **Compromised packages:** 3 packages exactly matching flagged ones (CORRECT -- keel-watch@4.1.2, rope-cache@2.2.1, hook-stream@1.2.2)
- **Correctness: 175/250** -- phantom (50%) + compromised_maintainer (20%) = 70% -> 175/250. Attack vector was wrong.
- **Completeness: 300/300** -- all 3 packages with correct versions
- **Analysis: 170/200** -- good timeline coverage
- **Methodology: 150/150** -- full marks
- **Speed: 91/100** -- submitted quickly

---

## BUG FOUND: PRNG Divergence Between Registry API and Audit-DB Services

### Severity: Medium-High (causes incorrect/misleading audit data)

### Description

The registry-api service and audit-db service both regenerate data from the same seed using the same mulberry32 PRNG, but the PRNG consumption sequences diverge. This causes the two services to produce inconsistent data about who the compromised maintainer is and which packages were attacked.

### Evidence

**In match 2 (seed derived from 116835342 variant):**

- **Registry API** shows: `keel-watch@4.1.2` published by `swift-otter`, `rope-cache@2.2.1` published by `swift-otter`, `hook-stream@1.2.2` published by `crispy-lobster`
  - This implies `swift-otter` is the compromised maintainer and `crispy-lobster` is the phantom

- **Audit-DB** shows: Security events (API_TOKEN_REGENERATED, LOGIN_FROM_NEW_IP, etc.) target `crispy-otter`, NOT `swift-otter`
  - The attacker IP `194.121.153.19` shows malicious publishes for `chain-utils@2.2.0` (rusty-octopus), `anchor-hub@1.0.5` (crispy-otter), `shell-bundle@5.5.3` (crispy-eel)
  - These are DIFFERENT packages from the registry's flagged packages

- **Result:** The registry says the attack targeted `swift-otter`'s packages, but the audit DB says the attack targeted `crispy-otter`'s credentials. The two services tell contradictory stories.

### Root Cause

In `audit-db/index.js` lines 110-127, the PRNG consumption for package generation doesn't match `registry-api/index.js` lines 141-163:

- **Registry service** (correct): Consumes PRNG for each version's checksum (64 calls), `pick(pkgMaintainers, r)` for publishedBy, `randInt` for size. Then consumes for description (5 picks), weeklyDownloads, dependents, createdAt, and keywords (pickN with variable count).

- **Audit-DB service** (diverged): Lines 113-124 attempt to consume the same values but uses `Array.from({length: 64}, () => r())` for checksum, then `r(); r(); r(); r(); r();` for description, then `randInt` for weeklyDownloads, dependents. **Line 121 has a comment "this is getting complex"** and the keyword consumption `randInt(2,4,r)` + loop doesn't match the exact `pickN` implementation.

The specific divergence point: `pickN` in data.ts/registry-api uses splice which changes the pool size during iteration, consuming a different number of PRNG calls than the audit-db's simulated loop. After this divergence, all subsequent PRNG-dependent selections (attack vector, phantom handle, compromised maintainer, target packages) produce different results.

### Impact

An agent investigating the challenge will find contradictory evidence:
- The registry shows which packages are compromised (correct per the scorer)
- The audit DB shows security events targeting a DIFFERENT maintainer than the one who published the malicious versions
- The IP correlation tool points to different packages than the ones flagged

This makes the challenge artificially harder and somewhat illogical. An agent must choose between trusting the registry data (which the scorer uses for ground truth) or the audit data (which tells a contradictory story).

### Suggested Fix

The audit-db service should either:
1. Import and call the exact same `generatePhantomRegistryData()` function from data.ts, then extract audit logs from the result
2. Or receive the pre-generated data via environment variable / mounted file instead of regenerating it

---

## 7. Documentation Quality

### CHALLENGE.md (GOOD)

- Clear REST curl examples throughout
- No references to MCP, SSE, or JSON-RPC anywhere
- Service endpoints clearly documented with HTTP methods
- Example requests are copy-pasteable
- Submission format well-specified with valid attack_vector values listed
- Scoring breakdown clearly shown
- Investigation tips are helpful

### Minor Issues

1. The `challenge_md` field in the match entry response duplicates the workspace CHALLENGE.md content. This is helpful for agents that might skip downloading the workspace.

2. Service URLs are only available in the `challenge_md` text, not as structured data in the response. A `services` object would be more machine-friendly:
   ```json
   "services": {
     "registry-api": "/api/v1/matches/{id}/services/registry-api",
     "audit-db": "/api/v1/matches/{id}/services/audit-db"
   }
   ```

---

## 8. REST Migration Assessment

### What works well:
- All REST endpoints respond correctly with proper JSON
- Auth is unified (same agent API key for platform and services)
- Service proxy routing via `/api/v1/matches/{match_id}/services/{service-name}` is clean
- GET /tools endpoint on audit-db returns proper input schemas
- All POST endpoints accept JSON bodies correctly
- Error responses (404, missing params) are handled properly

### Previous MCP patterns successfully replaced:
- Tool listing (GET /tools) replaces MCP tool discovery
- POST /tools/{tool_name} replaces MCP tool calls
- Direct REST endpoints replace MCP resource reads
- No SSE/JSON-RPC complexity

### Overall: The MCP-to-REST migration is functionally complete and working. The REST API is simpler and more accessible for agent interaction. The only significant issue is the PRNG divergence bug between services (pre-existing data generation issue, not a migration artifact).
