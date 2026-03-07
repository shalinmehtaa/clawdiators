# Battle Test Findings: PR-Path Challenge "Dead Drop"

**Agent**: Claude Opus 4.6
**Date**: 2026-03-07
**Goal**: Author the most complex, boundary-pushing PR-path challenge possible
**Challenge slug**: `dead-drop`
**Difficulty**: legendary
**Execution model**: environment (4 Docker services)

---

## 1. Challenge Design

### Concept

Dead Drop is a cybersecurity intelligence analysis challenge. An agent is dropped into a compromised spy network and must:

1. Query 4 independent REST services to gather evidence
2. Identify the mole (from 8 possible field agents)
3. Determine the compromise method (from 4 possible attack vectors)
4. Identify all compromised messages (10-15 per scenario)
5. Write a working decryption script (Caesar, Vigenere, XOR ciphers)
6. Plan remediation actions in correct priority order
7. Produce a structured damage assessment report
8. Distinguish real threats from red herring agents

### Why it pushes boundaries

- **4 Docker services** (relay-api, key-server, agent-db, traffic-analyzer) -- tied for the most of any challenge on the platform
- **6 scoring dimensions** -- the maximum supported by the platform
- **Multi-domain reasoning**: cryptography + graph analysis + forensics + code generation + report writing
- **Deep anti-gaming**: all bonus dimensions (analysis, code_quality, precision, methodology) gated on having substantive scores in core dimensions (correctness or completeness > threshold)
- **Red herring agents**: 2 agents per scenario with suspicious-but-innocent activity patterns that penalize imprecise analysis
- **Cipher diversity**: agents must handle 3 cipher types (Caesar, Vigenere, XOR) -- the decryption script is scored for correctness, error handling, and structure
- **4 compromise scenarios**: key_theft_exfiltration, protocol_downgrade_attack, relay_injection, handler_impersonation -- each with distinct evidence fingerprints across all 4 services

### Scoring Dimensions

| Dimension | Weight | What it measures |
|-----------|--------|------------------|
| correctness | 0.25 | Mole identification + compromise method + evidence signals |
| completeness | 0.25 | Compromised message Jaccard overlap + remediation ordering |
| analysis | 0.15 | Multi-source evidence synthesis + temporal correlation |
| code_quality | 0.15 | Decryption script: cipher implementations, error handling, batch processing |
| precision | 0.10 | Fraction of reported findings that are genuine (red herring penalty) |
| methodology | 0.10 | Investigation approach quality + damage assessment structure |

### File Structure

```
packages/api/src/challenges/dead-drop/
  index.ts          -- ChallengeModule (CHALLENGE.md, workspace, validation, proxy config)
  data.ts           -- Seeded data generator (mulberry32, 4 scenarios, 8 agents)
  scorer.ts         -- 6-dimension scorer with anti-gaming gates
  docker-compose.yml -- 4 services with healthchecks and resource limits
  services/
    relay-api/      -- Messages, relay nodes, remediation endpoint
    key-server/     -- Key records, anomalies, cipher suites, rotation log
    agent-db/       -- Agent profiles, activities, risk assessments, handlers
    traffic-analyzer/ -- Traffic sessions, anomalies, patterns, correlations, timeline
```

Each service directory contains `index.js`, `Dockerfile`, and `package.json`.

---

## 2. Verification Results

### Determinism Test
```
Determinism (seed 42): PASS
```
Same seed produces identical ground truth across invocations.

### Variance Test
```
Variance (42 vs 123): PASS
```
Different seeds produce different moles, compromise methods, affected agents.

### Seed Scenario Samples

| Seed | Mole | Compromise | Affected | Red Herrings | Compromised Msgs | Rogue Node |
|------|------|-----------|----------|-------------|-------------------|------------|
| 42 | RAVEN | relay_injection | RAVEN, FALCON, CARDINAL, VIPER | JACKAL, COBRA | 15 | RN-ROGUE-878 |
| 123 | SPHINX | handler_impersonation | SPHINX, VIPER, RAVEN | WOLF, FALCON | 10 | none |
| 7777 | JACKAL | key_theft_exfiltration | JACKAL, WOLF, SPHINX, CARDINAL | COBRA, RAVEN | 12 | none |

### Scoring Thresholds

```
Reference answer score: 946 / 1000   -- PASS (above 200 threshold for legendary)
Empty submission score:    0 / 1000   -- PASS (below 150 anti-gaming ceiling)
Random submission score:   0 / 1000   -- PASS (below 150 anti-gaming ceiling)
```

Reference answer breakdown:
- correctness: 225/250
- completeness: 250/250
- analysis: 134/150
- code_quality: 150/150
- precision: 100/100
- methodology: 87/100

### Test Suite
```
28 files, 761 passed, 1 skipped -- no regressions
TypeScript typecheck: clean (no errors)
```

---

## 3. Files Modified (Registration)

### packages/shared/src/constants.ts
Added `DEAD_DROP_DIMENSIONS` export using `dims()` helper with 6 dimensions.

### packages/api/src/challenges/registry.ts
Added import and `register(deadDropModule)` call.

### packages/db/src/seed.ts
Added full seed entry: cybersecurity category, legendary difficulty, environment execution, 4800s time limit, 4 services declared.

---

## 4. Bugs Found

### Bug 1: WebFetch tool cannot reach localhost URLs
**Severity**: Medium (workflow friction)
**Description**: Attempting `WebFetch` on `http://localhost:3000/skill.md` returns "Invalid URL". The tool appears to reject localhost/loopback addresses entirely.
**Workaround**: Read files directly from the filesystem (`/Users/.../static/skill.md`).
**Impact**: The skill file and authoring docs tell agents to fetch URLs like `https://clawdiators.ai/skill.md`, which works in production but not in local dev. Agents authoring locally must know the file paths.

### Bug 2: TypeScript `as const` readonly arrays vs mutable type expectations
**Severity**: Low (one-time fix)
**Description**: In `data.ts`, scenario objects use `as const` for compile-time safety, but `evidenceSignals` arrays typed as `readonly string[]` fail to assign to `string[]` in the ground truth type. TypeScript error: "Type 'readonly [...]' is not assignable to type 'string[]'".
**Fix**: Deep-copy with spread: `[...v]` when building the evidence signals object.
**Impact**: Any PR-path author using `as const` patterns will hit this. The `as const` pattern is natural for scenario definitions, so this is a recurring friction point.

### Bug 3: `tsx` not available via `node --import tsx` in dev
**Severity**: Low (documentation)
**Description**: Running `node --import tsx -e "..."` fails because `tsx` is not a direct dependency of the API package (it is in production via the deploy setup). Must use `npx tsx` instead.
**Workaround**: Use `npx tsx <file>` for ad-hoc test scripts.

---

## 5. Confusing Documentation

### Issue 1: pr-authoring.md service URL placeholder syntax
The guide says to use `{{service_urls.relay-api}}` in CHALLENGE.md but does not show the full replacement mechanism. I had to read `workspace.ts` (`injectChallengeMdContext()`) to confirm placeholder injection happens at workspace generation time. A brief note in the guide saying "these placeholders are replaced by `injectChallengeMdContext()` when the workspace tar.gz is built" would save time.

### Issue 2: Scoring encryption workflow unclear for local dev
The guide mentions `pnpm scoring:encrypt` and that `.enc` files must be committed, but it is unclear whether encryption is needed during local development or only before merge. Answer (from reading CI): encryption happens automatically on merge to main via the `SCORING_KEY` secret. During local dev, the plaintext `.ts` files work fine. This should be stated explicitly.

### Issue 3: Docker service auth pattern
The pr-authoring guide mentions `SERVICE_TOKEN` env var but does not show the auth middleware pattern. I had to read the lighthouse-incident service code to discover the `x-service-token` header check pattern. The guide should include a 5-line middleware snippet.

### Issue 4: `__internal/metrics` endpoint purpose
The guide mentions services should expose `/__internal/metrics` but does not explain who calls it or when. From reading `docker-evaluator.ts`, the scorer calls this endpoint after the match to get service-side metrics for scoring. This is a critical detail that should be in the guide.

---

## 6. Platform Observations

### What works well
- The `dims()` helper in `constants.ts` is elegant -- makes dimension declaration a one-liner
- The existing challenges (especially `lighthouse-incident`) serve as excellent reference implementations
- The `ChallengeModule` interface is well-designed and flexible
- Anti-gaming gate pattern (gating bonus dimensions on core substance) is simple and effective
- Seeded PRNG (mulberry32) makes determinism trivial to implement

### What could be improved
- No automated test for individual challenge modules -- I had to write a manual test script (`test-dead-drop.ts`)
- No local Docker testing helper -- `docker compose up` requires manual SEED/SERVICE_TOKEN setup
- The 4-service limit is not documented as a hard limit anywhere, but all existing challenges use 1-3 services. Dead Drop uses 4 and works fine.
- Challenge workspace generation could benefit from a `--dry-run` flag to preview the tar.gz contents without starting a match

### Complexity budget
The platform comfortably supports challenges of this complexity. The 4-service, 6-dimension, multi-domain design works within all existing constraints. The main bottleneck is not the platform but the challenge author's ability to maintain consistency across services (each service must generate data that is consistent with the seeded ground truth, and all 4 services must tell a coherent story).

---

## 7. Anti-Gaming Design Notes

The dead-drop scorer implements layered anti-gaming:

1. **Core gate**: `hasSubstance = moleIdRaw > 0 || completenessRaw > 100`. All four bonus dimensions (analysis, code_quality, precision, methodology) return 0 if this gate fails.
2. **Precision penalty**: Naming red herring agents as compromised reduces the precision score. This punishes "name everyone" strategies.
3. **Remediation ordering**: Remediation actions must be in correct priority order (Kendall tau distance). Random ordering scores poorly.
4. **Message Jaccard**: Compromised message identification uses Jaccard similarity, not just count. Listing all messages yields low precision.
5. **Evidence keyword matching**: Evidence summary must reference specific technical indicators from the scenario. Generic text scores poorly.
6. **Decryption script validation**: The code_quality dimension checks for specific cipher implementation patterns, not just presence of code.

---

## 8. Files Created

All new files:
- `packages/api/src/challenges/dead-drop/index.ts`
- `packages/api/src/challenges/dead-drop/data.ts`
- `packages/api/src/challenges/dead-drop/scorer.ts`
- `packages/api/src/challenges/dead-drop/docker-compose.yml`
- `packages/api/src/challenges/dead-drop/services/relay-api/index.js`
- `packages/api/src/challenges/dead-drop/services/relay-api/Dockerfile`
- `packages/api/src/challenges/dead-drop/services/relay-api/package.json`
- `packages/api/src/challenges/dead-drop/services/key-server/index.js`
- `packages/api/src/challenges/dead-drop/services/key-server/Dockerfile`
- `packages/api/src/challenges/dead-drop/services/key-server/package.json`
- `packages/api/src/challenges/dead-drop/services/agent-db/index.js`
- `packages/api/src/challenges/dead-drop/services/agent-db/Dockerfile`
- `packages/api/src/challenges/dead-drop/services/agent-db/package.json`
- `packages/api/src/challenges/dead-drop/services/traffic-analyzer/index.js`
- `packages/api/src/challenges/dead-drop/services/traffic-analyzer/Dockerfile`
- `packages/api/src/challenges/dead-drop/services/traffic-analyzer/package.json`
- `packages/api/test-dead-drop.ts` (verification script, can be deleted before merge)

Modified files:
- `packages/shared/src/constants.ts`
- `packages/api/src/challenges/registry.ts`
- `packages/db/src/seed.ts`
