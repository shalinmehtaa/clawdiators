# Battle Test Findings: API-Path Challenge Authoring ("topology-weaver")

**Agent**: opus-battle-tester (claude-opus-4-6)
**Agent ID**: 94ae0db7-c169-4673-88ab-5cd5614d3049
**Date**: 2026-03-07
**Draft ID**: 6a26c0a1-aad8-4acf-8687-357c02644263
**Draft Status**: pending_review (all 9 gates passed)

---

## Summary

Registered as an agent, read all public documentation (skill.md, api-authoring.md, challenge-design-guide.md, primitives endpoint), and authored a complex multi-objective graph optimization challenge called "Topology Weaver" via the API path. The challenge passed all 9 automated gates on the first dry-run attempt and on the real submission.

---

## Steps Taken

### 1. Documentation Discovery

Fetched all skill files from the documented URLs:
- `GET http://localhost:3000/skill.md` -- 200 OK (726 lines)
- `GET http://localhost:3000/api-authoring.md` -- 200 OK (597 lines)
- `GET http://localhost:3000/challenge-design-guide.md` -- **404 Not Found** (BUG, see below)
- `GET http://localhost:3001/challenge-design-guide.md` -- 200 OK (486 lines, works on API port)
- `GET http://localhost:3001/api/v1/challenges/primitives` -- 200 OK
- `GET http://localhost:3001/api/v1/challenges/scaffold?type=code&category=reasoning&difficulty=veteran&dimensions=correctness,speed,methodology,analysis,completeness` -- 200 OK

### 2. Agent Registration

```
POST /api/v1/agents/register
```

Registered as `opus-battle-tester` with harness `claude-code`, single-agent loop, progressive-disclosure context strategy. Registration returned API key, claim URL, and first challenge suggestion (quickdraw). No issues.

### 3. Challenge Survey

`GET /api/v1/challenges` returned 20 active challenges. Reviewed categories and identified a gap: no challenge testing multi-objective graph optimization with constraint satisfaction and anomaly detection combined.

### 4. Challenge Design & Local Testing

Designed "Topology Weaver" -- a veteran-difficulty reasoning challenge that tests:
- Dijkstra shortest path (minimum latency)
- Widest path / max-bandwidth path (maximize minimum edge bandwidth)
- Minimum cost path
- Constrained routing (bandwidth + latency constraints simultaneously)
- Phantom node detection (impossible routes)
- Bottleneck identification (global graph analysis)
- Topology improvement suggestion (analytical reasoning)

Implemented and tested locally:
- `data.js`: 7230 chars, procedural graph generation with mulberry32 PRNG, 8-12 nodes, spanning tree + extra edges, 7 queries (5 real + 2 phantom), full solver producing groundTruth
- `scorer.js`: 3211 chars, multi-dimension scoring with partial credit, anti-gaming gates on correctness
- `workspace.js`: Custom workspace generating topology.json and queries.json

Local verification results:
- Reference answer (seed 42): 957/1000 (with simulated 2-min elapsed time)
- Empty submission probe: 0/1000
- Null fields probe: 0/1000
- Random UUID probe: 0/1000
- Determinism: identical output for same seed, different output for different seeds

### 5. Dry-Run Validation

```
POST /api/v1/challenges/drafts/dry-run
```

All 9 gates passed on first attempt:

| Gate | Result | Details |
|------|--------|---------|
| spec_validity | PASS | -- |
| code_syntax | PASS | 3 files checked |
| code_security | PASS | 3 files scanned |
| content_safety | PASS | 6 sources scanned |
| determinism | PASS | Seeds 42, 123, 7777 tested |
| contract_consistency | PASS | -- |
| baseline_solveability | PASS | Score: 1000, threshold: 350 |
| anti_gaming | PASS | Worst probe: 0, ceiling: 200 |
| score_distribution | PASS | Reference: 1000, max probe: 0 |

### 6. Draft Submission

```
POST /api/v1/challenges/drafts
```

Draft created with ID `6a26c0a1-aad8-4acf-8687-357c02644263`. Gates re-ran and all passed. Status moved to `pending_review`.

---

## Bug Found

### challenge-design-guide.md returns 404 via frontend (port 3000)

**Severity**: Medium (documentation accessibility)

The skill file at `/skill.md` contains this reference:
```
| **DESIGN-GUIDE.md** | What makes a great challenge | `http://localhost:3000/challenge-design-guide.md` |
```

And the design guide itself references:
```
Full guide: `http://localhost:3001/api-authoring.md`
```

However, `GET http://localhost:3000/challenge-design-guide.md` returns **404**. The file is served correctly from the API server at port 3001.

Other static files work fine through the frontend:
- `/skill.md` -- 200
- `/api-authoring.md` -- 200
- `/heartbeat.md` -- 200
- `/pr-authoring.md` -- 200

**Root cause hypothesis**: The Next.js rewrites in `next.config.ts` likely proxy `/skill.md`, `/api-authoring.md`, `/heartbeat.md`, and `/pr-authoring.md` to the API server, but `challenge-design-guide.md` is missing from the rewrite rules. An agent following the documented URL in skill.md would get a 404 and would need to know to try port 3001 instead.

**Impact**: An agent relying solely on the documented base URL (`http://localhost:3000`) would be unable to read the challenge design guide, which is the authoritative document for challenge authoring philosophy and requirements. The agent would need to discover the API-direct URL on its own.

---

## Documentation Observations

### Things That Worked Well

1. **Skill file is comprehensive.** The skill.md has everything needed to register, compete, and start authoring. The linked api-authoring.md has the complete spec schema.

2. **Scaffold endpoint is useful.** `GET /api/v1/challenges/scaffold` generates a valid starting template. This saved time on getting the structural skeleton right.

3. **Dry-run endpoint is extremely valuable.** Being able to validate against all gates without creating a DB record is the right design. The `fix_suggestion` fields (documented but not triggered for me since all gates passed) sound helpful for iterative debugging.

4. **PRNG documentation is clear.** The mulberry32 source code and usage examples are well-documented, and the common patterns (randInt, pick, shuffle) are provided.

5. **Gate thresholds are well-documented.** Knowing that veteran needs 35% baseline and 20% anti-gaming ceiling let me calibrate my scorer weights upfront.

6. **Code security gate documentation is thorough.** The prohibited patterns list and the workaround (string concatenation) are clearly documented.

### Minor Documentation Gaps

1. **workspace.js and generateData interaction**: The api-authoring.md says workspace.js exports `generateWorkspace(seed)` but does not explicitly state that `generateData` is available in scope when workspace.js runs. I assumed it would be (since helpers.js is prepended) and it worked, but this could trip up an author.

2. **Scorer dimension score ranges**: The design guide says "Dimensions are scored 0-1000 internally, then multiplied by weight." But in practice, the scorer returns raw points that sum to `total`, and the dimension weights in the spec are for display/leaderboard only. The scorer.js example in api-authoring.md shows raw point values (500, 200, 300) that sum to 1000. This could be confusing -- are the weights cosmetic or functional?

3. **Design guide self-references wrong port**: The design guide contains `Full guide: http://localhost:3001/api-authoring.md` -- this references port 3001 (API) rather than 3000 (documented base URL). Inconsistent with the skill file's base URL convention.

---

## Challenge Design: Topology Weaver

### What Makes It Boundary-Pushing

1. **Multi-algorithm requirement**: Agents must implement or reason about four distinct graph algorithms (Dijkstra for shortest path, modified Dijkstra for widest path, Dijkstra for min-cost, and constrained Dijkstra with edge filtering).

2. **Mixed query types in a single challenge**: Each query requires recognizing its type and applying the correct algorithm. No single algorithm solves all queries.

3. **Anomaly detection**: Two of the seven queries reference phantom nodes that do not exist in the topology. Agents must detect this rather than returning nonsensical paths.

4. **Constrained optimization**: The "constrained" query type requires simultaneous bandwidth and latency constraints -- filtering edges by bandwidth while optimizing for latency with a max-latency bound.

5. **Global analysis beyond queries**: The bottleneck identification requires analyzing the entire topology, not just answering the specific queries.

6. **Analytical reasoning**: The improvement suggestion tests whether agents can synthesize their graph analysis into actionable recommendations.

7. **Procedural generation quality**: 8-12 nodes, spanning tree + random extra edges, seed-dependent node names, variable query type distribution per seed. Each seed produces a meaningfully different problem.

8. **Partial credit scoring**: Correct reachability but wrong path/metric earns 30% per query. Correct bottleneck nodes but wrong bandwidth earns 150/250. Any reasoned improvement earns 100/200 even if it targets the wrong link.

### Scoring Design Rationale

| Dimension | Weight | Max Points | Rationale |
|-----------|--------|------------|-----------|
| Correctness | 40% | 400 | Core graph algorithm accuracy, 7 queries with partial credit |
| Analysis | 25% | 250 | Bottleneck identification -- global topology analysis |
| Methodology | 20% | 200 | Improvement suggestion quality, gated on correctness > 0 |
| Speed | 15% | 150 | Time pressure (420s), gated on correctness > 0 |

Anti-gaming: Speed and methodology are both gated on correctness > 0, so empty/random submissions always score exactly 0.

### Reference Answer (Seed 42)

Network: 11 nodes, 14 edges. Seven queries:
- q-42-0: constrained, delta->theta, min_bw=27, max_lat=66 -- INFEASIBLE (no path meeting both constraints)
- q-42-1: constrained, beta->lambda, min_bw=43, max_lat=95 -- path: beta->eta->zeta->lambda, latency=46
- q-42-2: max_bandwidth, eta->delta -- path via zeta->lambda->alpha->delta, bw=65
- q-42-3: min_cost, delta->iota -- path: delta->beta->eta->iota, cost=26
- q-42-4: max_bandwidth, epsilon->kappa -- path via iota->eta->zeta->lambda->kappa, bw=50
- q-42-5: min_cost to phantom-42-0 -- node_not_found
- q-42-6: constrained to phantom-42-1 -- node_not_found

Bottleneck: kappa-42 <-> theta-42, bandwidth=12 (lowest in topology)

---

## API Call Log

| # | Method | Endpoint | Status | Notes |
|---|--------|----------|--------|-------|
| 1 | GET | /skill.md | 200 | Via port 3000 |
| 2 | GET | /api/v1/challenges | 200 | 20 active challenges returned |
| 3 | GET | /api-authoring.md | 200 | Via port 3000 |
| 4 | GET | /challenge-design-guide.md | **404** | Via port 3000 (BUG) |
| 5 | GET | /challenge-design-guide.md | 200 | Via port 3001 (workaround) |
| 6 | GET | /api/v1/challenges/primitives | 200 | Scoring primitives reference |
| 7 | GET | /api/v1/challenges/scaffold | 200 | Template with 5 dimensions |
| 8 | POST | /api/v1/agents/register | 200 | Agent created |
| 9 | POST | /api/v1/challenges/drafts/dry-run | 200 | All 9 gates passed |
| 10 | POST | /api/v1/challenges/drafts | 200 | Draft created, gates passed |
| 11 | GET | /api/v1/challenges/drafts/:id/gate-report | 200 | Confirmed all gates passed |
| 12 | GET | /api/v1/challenges/drafts/:id | 200 | Status: pending_review |
| 13 | GET | /.well-known/agent.json | 200 | Agent discovery metadata |

---

## Conclusion

The API authoring path works well for complex challenges. The dry-run endpoint, scaffold generator, and clear gate documentation make it possible to author a passing challenge on the first real submission. The main issue found is the broken frontend proxy for `challenge-design-guide.md`, which is a real obstacle for agents following the documented URLs. The challenge "Topology Weaver" is now pending review and tests multi-objective graph optimization, constrained routing, anomaly detection, and analytical reasoning -- capabilities not covered by existing challenges.
