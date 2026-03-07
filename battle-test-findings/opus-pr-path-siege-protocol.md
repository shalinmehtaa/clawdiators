# Battle Test Findings: PR-Path Challenge Authoring (siege-protocol)

Agent: Claude Opus 4.6
Date: 2026-03-07
Goal: Author the most complex, boundary-pushing PR-path environment challenge possible.

---

## 1. Challenge Designed: SIEGE PROTOCOL

**Slug**: `siege-protocol`
**Category**: cybersecurity
**Difficulty**: legendary
**Match type**: multi-checkpoint
**Time limit**: 4800 seconds (80 minutes)
**Services**: 3 Docker containers (trading-engine, flow-analyzer, firewall-db)

### Premise

P1 DDoS attack against the AEGIS distributed financial trading platform. Agents must investigate a live incident using three interconnected services, identify the true attack vector among diversionary noise, execute mitigation in strict dependency order, and produce a full threat assessment report.

### Complexity Dimensions

1. **8 attack scenarios** (vs 5 for lighthouse-incident reference): volumetric_syn_flood, slowloris_api_exhaustion, order_injection_dos, websocket_amplification, settlement_kafka_flood, dns_reflection_edge, api_credential_stuffing, memcached_amplification_mixed
2. **5 network zones** with dependency relationships: edge-ingress, api-gateway, order-engine, market-data, settlement-bus
3. **Diversionary attacks**: Every scenario includes a secondary diversion with realistic symptoms in a different zone to mislead agents
4. **Strict mitigation ordering**: 409 errors for out-of-order actions (financial dependency chain)
5. **3-service investigation**: Trading engine (status/mitigation/docs), flow analyzer (traffic/correlation), firewall DB (SQL queries on 7 tables)
6. **Documentation proxy**: 8 playbooks + architecture docs accessible via /docs endpoint
7. **Live metrics blending**: Scorer combines self-reported submission with /__internal/metrics from trading-engine
8. **Multi-dimensional output**: attack_vector, attack_evidence, impact_chain, mitigation_actions_taken, mitigation_script, threat_assessment, methodology

### Scoring (5 dimensions, 1000 max)

| Dimension     | Weight | What It Measures                                         |
|---------------|--------|----------------------------------------------------------|
| correctness   | 25%    | Exact attack vector ID match + evidence quality          |
| completeness  | 30%    | Mitigation action coverage + ordering + live metrics     |
| analysis      | 15%    | Impact chain accuracy (Jaccard + order bonus)            |
| code_quality  | 15%    | Mitigation script quality: idempotency, error handling   |
| methodology   | 15%    | Playbook references, multi-source synthesis, report depth|

---

## 2. Files Created

### Challenge Module (5 files)
- `packages/api/src/challenges/siege-protocol/index.ts` -- ChallengeModule export, CHALLENGE.md template, workspace generation, submission validation
- `packages/api/src/challenges/siege-protocol/data.ts` -- Seeded data generator (mulberry32), 8 scenarios, flow logs, 7 firewall DB tables
- `packages/api/src/challenges/siege-protocol/scorer.ts` -- 5-dimension scorer with anti-gaming, diversion penalties, live metrics blending
- `packages/api/src/challenges/siege-protocol/docker-compose.yml` -- 3 services with resource limits and health checks

### Docker Services (9 files)
- `services/trading-engine/index.js` -- Express, scenario selection, zone health, ordered mitigation, docs proxy, /__internal/metrics
- `services/trading-engine/package.json` + `Dockerfile`
- `services/flow-analyzer/index.js` -- REST tools API: query_flows, get_attack_timeline, correlate_flows, get_threat_summary
- `services/flow-analyzer/package.json` + `Dockerfile`
- `services/firewall-db/index.js` -- SQLite in-memory, 7 tables, read-only SQL enforcement
- `services/firewall-db/package.json` + `Dockerfile` (with python3/make/g++ for better-sqlite3)

### Modified Files
- `packages/shared/src/constants.ts` -- Added SIEGE_PROTOCOL_DIMENSIONS
- `packages/api/src/challenges/registry.ts` -- Added import + register(siegeProtocolModule)
- `packages/db/src/seed.ts` -- Added siege-protocol seed entry + activeSlugs entry

---

## 3. Verification Results

### TypeScript Compilation
```
pnpm --filter @clawdiators/api exec tsc --noEmit
```
Result: Clean pass, zero errors.

### Test Suite
```
pnpm --filter @clawdiators/api test
```
Result: 761 passed, 1 skipped, 28 test files. All existing tests continue to pass.

### Manual Verification (temporary verify.ts script)

| Check                  | Result | Notes                                                    |
|------------------------|--------|----------------------------------------------------------|
| Data determinism       | PASS   | 5 seeds produce identical output across runs             |
| Scenario coverage      | PASS   | 8/8 scenarios reachable across seeds 0-199               |
| Scoring determinism    | PASS   | Same seed+submission always produces same score          |
| Perfect submission     | 969    | correctness=250, completeness=300, analysis=150, code_quality=120, methodology=149 |
| Empty submission       | 0      | All dimensions zero (anti-gaming works)                  |
| Random submission      | 0      | All dimensions zero (anti-gaming works)                  |

Perfect submission scores 969/1000 (not 1000) because:
- code_quality loses 30 points: bash script lacks Python-style imports/structure
- methodology loses 1 point: minor rounding in section matching

This is healthy -- a truly flawless submission is extremely difficult to craft.

---

## 4. Bugs Found

### Bug 1: ScoringInput type lacks `seed` field but scorers sometimes need it

**Impact**: Low. Scorers access ground truth via `input.groundTruth` (which is regenerated from seed by the platform before scoring), so this works. But the lighthouse-incident scorer.ts contains a comment referencing "seed" in its ground truth object, suggesting some confusion about where seed data flows.

**Details**: The `ScoringInput` interface in `types.ts` has no `seed` property. Ground truth is pre-generated by the module's `generateData(seed)` and passed to `score()` via `input.groundTruth`. This is correct behavior, but not documented anywhere -- I had to trace through the lighthouse-incident reference implementation to understand the data flow.

### Bug 2: Verification scripts cannot run with `tsx -e` in eval context

**Impact**: Development experience. When trying to verify challenge code via inline evaluation:
```bash
pnpm --filter @clawdiators/api exec tsx -e "import { generateSiegeData } from './src/challenges/siege-protocol/data.js'; ..."
```
This fails with `ERR_MODULE_NOT_FOUND` because tsx's eval context resolves relative paths from a virtual location, not the package root. The workaround is writing a temporary .ts file and running it with `tsx path/to/file.ts`.

---

## 5. Confusing Documentation

### Issue 1: No explicit documentation on ScoreResult shape

The `ScoreBreakdown` type is defined in `packages/shared/src/types.ts` as `{ [dimension: string]: number }` -- a simple object with dimension keys plus "total". However, the skill.md and pr-authoring.md guides don't explicitly show what the scorer should return. I had to read the type definition and cross-reference with lighthouse-incident to understand the expected shape:
```typescript
return {
  breakdown: {
    correctness: 250,   // weighted score (raw * weight)
    completeness: 300,
    analysis: 150,
    total: 700,
  },
};
```

**Recommendation**: Add an explicit "ScoreResult shape" section to pr-authoring.md showing the breakdown object structure with the "total" key requirement.

### Issue 2: Submission field names vary between challenges

The lighthouse-incident module expects fields like `root_cause`, `recovery_actions`, `investigation_report`. My siege-protocol uses `attack_vector`, `mitigation_actions_taken`, `threat_assessment`. There's no guidance on naming conventions -- each challenge picks its own submission schema. This is fine for flexibility, but could benefit from a "recommended naming" section showing common patterns.

### Issue 3: Service metrics access pattern underdocumented

The scorer can access live metrics via `input.serviceMetrics?.["service-name"]`, where the key must match the docker-compose service name exactly. This critical detail is only discoverable by reading the `ScoringInput` type definition and cross-referencing with existing scorer implementations. The pr-authoring.md guide mentions `metricsEndpoint: "/__internal/metrics"` in the workspace spec but doesn't explain how the data flows to the scorer.

### Issue 4: Anti-gaming requirements implied, not specified

The challenge design guide says empty/random submissions should score below difficulty ceilings, but doesn't specify exact thresholds. I verified my scorer returns 0 for both empty and random submissions, which is safe, but the expected range (must be below X%) is not clearly stated.

### Issue 5: docker-compose healthcheck duplication

The docker-compose.yml has a `healthcheck` section, AND the Dockerfile has a separate `HEALTHCHECK` directive. These could conflict. The siege-protocol and lighthouse-incident both have this pattern. It's unclear which one takes precedence in the platform's container orchestrator.

---

## 6. Design Decisions & Rationale

### Why 8 scenarios instead of 5?
More scenarios means less chance of an agent memorizing answers across attempts. With 8 scenarios and mulberry32 PRNG, the probability of seeing the same scenario twice in 3 attempts is lower, making the challenge more robust against brute-force approaches.

### Why strict mitigation ordering?
Financial systems have real dependency chains (you can't restart the settlement bus before stabilizing the order engine). The 409 error on out-of-order actions forces agents to understand the architecture, not just enumerate mitigations. This tests genuine reasoning about system dependencies.

### Why diversionary attacks?
Real DDoS incidents always have noise -- cascading failures, correlated symptoms, and red herrings. The diversion zone shows legitimate-looking attack symptoms that are actually side effects. Agents that chase the diversion score lower on correctness and impact_chain (diversion penalty multiplier).

### Why 3 services instead of 1?
Single-service challenges can be solved by exhaustive API enumeration. Three interconnected services require the agent to synthesize information across sources -- flow data from the analyzer, configuration from the firewall DB, and live state from the trading engine. No single service has the complete picture.

### Why bash/Python script scoring?
The mitigation_script dimension tests code generation quality -- can the agent produce a script that's idempotent, handles errors, and applies mitigations in the right order? This goes beyond just identifying the attack to actually operationalizing the response.

---

## 7. Platform Observations

### What works well
- The ChallengeModule interface is clean and well-typed
- mulberry32 PRNG with `pick()` and `pickN()` helpers makes deterministic generation easy
- The registry pattern (import + register) is simple and scalable
- Docker-compose with SEED/MATCH_ID/SERVICE_TOKEN env vars is a good pattern
- The `dims()` helper in constants.ts makes dimension declaration concise

### What could be improved
- A challenge template generator (scaffold command) would save significant time -- currently you have to manually create 12+ files by studying existing challenges
- The scoring encryption step (`pnpm scoring:encrypt`) is mentioned in memory but not in the authoring docs
- No local testing harness for Docker services -- you have to mentally verify that the Express services match the data generator's output
- The evaluator.ts dispatch logic should be documented: how does the platform know to call `module.score()` vs `evaluateInDocker()`?

---

## 8. Remaining Work for Production

1. **Scoring encryption**: Run `pnpm scoring:encrypt` to create `.enc` files for data.ts and scorer.ts
2. **Docker image testing**: Build and test all 3 service images locally with `docker compose up`
3. **Seed database**: Run the updated seed.ts to create the challenge entry in the DB
4. **Migration**: If the seed.ts insert fails due to missing slug, may need a migration
5. **CI integration**: Ensure the docker-compose.yml is picked up by `deploy.sh`'s dynamic discovery glob
