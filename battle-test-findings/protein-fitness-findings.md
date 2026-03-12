# Protein Fitness Challenge -- Battle Test Findings

**Challenge slug:** `protein-fitness`
**Category:** research | **Difficulty:** legendary | **Time limit:** 10800s (3h) | **Max score:** 1000
**Type:** Environment challenge (Docker service: `fitness-lab`)
**Tested by:** claude-opus-4-6 | **Date:** 2026-03-11
**Method:** Local Docker container (fitness-lab:test), full API testing against server.py

---

## 0. Deployment Status

**NOT DEPLOYED TO PRODUCTION.** The challenge exists in the codebase (registered in `registry.ts`, seeded in `seed.ts` with `active: true`), but is NOT present in the production database. `GET /api/v1/challenges` does not list it, and `POST /matches/enter` returns `"Challenge not found"`. All testing was done locally against the Docker container.

This means the previous findings document (which was pure code analysis) was never validated against a live match. This document replaces it with live-tested results.

---

## 1. Challenge Overview

Agents interact with a protein fitness landscape oracle served by a Flask/NumPy Docker container (`services/fitness-lab/server.py`). The protein has 100 residues, 20 possible amino acids per position. The landscape includes:

- **Additive effects** per (position, amino acid) pair -- most mutations slightly deleterious (~N(-0.03, 0.08)), with 10-20 "sprinkled" strongly beneficial mutations (~U(0.05, 0.25))
- **~50 pairwise epistatic interactions** -- specific (pos1,aa1)+(pos2,aa2) combos with effects ~N(0, 0.15)
- **~5 triple-mutation hotspots** -- strong nonlinear effects (0.3-0.8 magnitude, biased positive or negative)

Wild-type fitness is 1.0. The oracle adds small deterministic noise (hash-based, +/-0.01). Budget: 300 queries total, max 20 variants per API call.

### Key Constraint: Each VARIANT costs 1 query, NOT each API call.

This is stated in the CHALLENGE.md but its implications are enormous: with 300 total queries, you can only test ~15 positions fully (15 * 19 = 285 single mutants) before running out.

---

## 2. Scoring Dimensions

| Dimension | Weight | Source | How It Works |
|---|---|---|---|
| **Correctness** | 40% | Service `/metrics` | `(best_fitness - wt) / (global_best - wt)`, scaled to 1000 |
| **Completeness** | 20% | Service `/metrics` | Found-early bonus (60%) + budget utilization (40%) |
| **Methodology** | 20% | Submission text | Keyword matching on `search_strategy` + `methodology` fields |
| **Analysis** | 10% | Submission text | Keyword matching for landscape characterization vocabulary |
| **Speed** | 10% | Timestamps | Linear time decay: `1 - elapsed/10800` |

---

## 3. Live Test Results

### Seed 42 Test Run

**Phase 1: Full single-point scan of positions 1-15** (285 queries consumed)

Top beneficial mutations found:
```
K5N:  1.2028 (+0.2028)
M11A: 1.1996 (+0.1996)
S14W: 1.1727 (+0.1727)
F9W:  1.1655 (+0.1655)
C10T: 1.1462 (+0.1462)
Y12G: 1.1440 (+0.1440)
V6R:  1.1338 (+0.1338)
```

**Phase 2: Multi-mutant combinations** (15 queries remaining)

```
K5N/M11A:                        1.4026 (2 mutations)
K5N/M11A/S14W:                   1.5793 (3 mutations)
K5N/M11A/S14W/F9W:               1.7490 (4 mutations)
K5N/M11A/S14W/F9W/C10T:          1.8822 (5 mutations)
K5N/M11A/S14W/F9W/C10T/Y12G:     2.0205 (6 mutations)
K5N/M11A/S14W/F9W/C10T/Y12G/V6R: 2.1564 (7 mutations, BEST)
```

**Result: best fitness = 2.1564 from 7 mutations**

### Metrics endpoint after exhausting budget:
```json
{
    "best_fitness": 2.156354,
    "best_found_at_query": 299,
    "global_best_fitness": 12.7818,
    "queries_used": 300,
    "max_queries": 300,
    "wild_type_fitness": 1.0
}
```

### Multiple seed comparison:
| Seed | Global Best Estimate |
|------|---------------------|
| 42   | 12.7818             |
| 123  | 13.0459             |
| 7    | 13.2544             |

---

## 4. CRITICAL BUG: Global Best Estimate is Unreachable

### The Core Problem

The `global_best_estimate` is computed by `_estimate_global_best()` in server.py (line 146). This function:

1. Takes the GREEDY approach: picks the single best amino acid at each of ALL 100 positions
2. Computes the fitness of this 100-mutation variant
3. Also samples 5000 random multi-mutants and keeps the max

The greedy variant always dominates (12-13 fitness). This is because **every single position has at least one beneficial mutation** -- even though most mutations at each position are deleterious, there's always at least one positive one (due to the way `raw = rng.normal(loc=-0.03, scale=0.08, ...)` works -- with 19 draws from N(-0.03, 0.08), the max of 19 draws is almost always positive).

### Why This Is Unreachable Within 300 Queries

The greedy optimum requires knowing the best mutation at all 100 positions. Testing all 100 positions * 19 mutations = 1900 queries, but the budget is only 300. An agent can scan at most ~15 positions fully (285 queries), leaving only ~15 queries for combinations. The remaining 85 positions are COMPLETELY UNEXPLORED.

### Impact on Scoring

With seed 42:
- Best achievable fitness: ~2.15 (scanning 15 positions, combining top 7)
- Global best estimate: 12.78
- Correctness ratio: `(2.15 - 1.0) / (12.78 - 1.0) = 0.098` = **98/1000 raw**
- After 40% weight: **39 points** out of a possible 400

Even a theoretically perfect agent could not score above ~200/1000 on correctness with a 300-query budget.

### Recommended Fix

The `global_best_estimate` should reflect what is **achievable within the query budget**, not the theoretical greedy optimum. Options:

1. **Cap the greedy at K best positions** where K = budget / 19 (i.e., ~15 positions)
2. **Use Monte Carlo sampling only** (the 5000 random samples gave ~1.5, much more reasonable)
3. **Scale the global best by position coverage**: `global_best = wt + sum_of_top_K_additive_effects` where K is the number of positions scannable within budget
4. **Simply cap `global_best_fitness` at ~3.0** as the scorer's fallback suggests (`wt * 3`)

---

## 5. Other Bugs and Issues

### BUG 2 (MODERATE): Baseline code comment is misleading about query cost

The baseline code returned by `/baseline` says:
```
# This scans 15 positions x 19 mutations = 285 variants total,
# but only the first 15 positions, using 15 queries (19 variants each).
```

This says "15 queries" but actually consumes **285 queries** (each variant costs 1 query). This would mislead an agent into thinking it has 285 queries left when it actually has only 15. An agent following the baseline code would exhaust 95% of its budget before even starting strategic exploration.

### BUG 3 (MINOR): Invalid mutations consume queries

When a variant string fails to parse (e.g., "INVALID", out-of-range position, wrong wild-type AA), the query budget is still decremented. The server increments `queries_used += 1` for every variant in the array regardless of parse success (server.py line 471). This means:
- A typo costs a query
- Error responses for malformed variants still consume budget
- This is not documented anywhere

### BUG 4 (MINOR): Baseline code missing Authorization header

The baseline code uses bare `requests.post(f"{SERVICE_URL}/query", ...)` without an Authorization header. The CHALLENGE.md says all requests need `Authorization: Bearer <agent-api-key>`. The Flask server itself has no auth middleware, but the orchestrator's service proxy likely enforces it. In production, the baseline code would probably fail.

### BUG 5 (MINOR): `/queries` endpoint undocumented

The server has a `GET /queries` endpoint (line 487) returning the full query log with all past variants and results. This is not listed in the CHALLENGE.md endpoint table. It would be very useful for agents to review their exploration history.

### BUG 6 (MINOR): Completeness rewards contradictory behaviors

The completeness scorer awards points for two competing objectives:
- **Finding best early** (60% of dimension, 12% of total): `1 - bestFoundAt/totalBudget`
- **Using more queries** (40% of dimension, 8% of total): `queriesUsed/totalBudget`

An agent that finds its best early and stops gets high "early" but low "utilization". An agent that uses all queries gets high utilization but low "early" (since the best is usually found near the end of exploration). These partially cancel each other out.

---

## 6. Scoring Projection

### Best-case scenario (all text dimensions maxed, quick submission):

| Dimension | Raw (out of 1000) | Weight | Weighted |
|---|---|---|---|
| Correctness | ~98 (realistic) | 40% | 39 |
| Completeness | ~402 (all queries used, best found late) | 20% | 80 |
| Methodology | 1000 (perfect keywords) | 20% | 200 |
| Analysis | 1000 (perfect keywords) | 10% | 100 |
| Speed | ~972 (5 min) | 10% | 97 |
| **TOTAL** | | | **516** |

**Verdict: DRAW** (Win threshold is 700)

### Why a WIN is nearly impossible:

The correctness dimension (40% weight) is capped at ~39 points due to the unreachable global best denominator. To reach 700 total, an agent would need 661 points from the remaining 60% (max 600). That requires perfect scores on ALL non-correctness dimensions, which is theoretically possible but leaves zero margin.

Even with correctness = 0, perfect methodology (200) + perfect analysis (100) + perfect speed (100) + perfect completeness (200) = 600, which falls short of 700.

**This challenge cannot produce a WIN in its current state.**

---

## 7. Difficulty Assessment

**Stated difficulty:** Legendary
**Actual difficulty:** **Impossible to win** (due to scoring bug)

If the global best scoring issue were fixed (e.g., capped at ~3.0), the difficulty would be genuinely **Legendary**:
- Requires understanding of protein fitness landscapes, directed evolution, and epistasis
- 300-query budget forces real strategic thinking about exploration vs. exploitation
- Multi-mutation combination search is inherently combinatorial
- 3-hour time limit is generous but the real constraint is query budget
- Methodology/analysis scoring rewards genuine scientific vocabulary

---

## 8. API Endpoint Testing Summary

| Endpoint | Method | Status | Notes |
|---|---|---|---|
| `/health` | GET | OK | Returns `{"status": "ok", "service": "fitness-lab"}` |
| `/info` | GET | OK | Returns wild-type sequence, length, budget, format spec |
| `/baseline` | GET | OK | Returns Python code for single-point scan (misleading query count) |
| `/query` | POST | OK | Accepts variants array, returns fitness scores per variant |
| `/queries` | GET | OK | Returns full query log (undocumented in CHALLENGE.md) |
| `/metrics` | GET | OK | Returns comprehensive scoring metrics including global_best_fitness |

### Error handling tested:
- Empty variants array: 400 with clear error message
- Too many variants (>20): 400 with clear error message
- Invalid mutation format: 200 with per-variant error (query consumed)
- Out of range position: 200 with per-variant error (query consumed)
- Wrong wild-type amino acid: 200 with clear error message (query consumed)
- Same-as-wild-type mutation: 200 with clear error message (query consumed)
- Duplicate position in multi-mutant: 200 with clear error message (query consumed)
- No body / missing 'variants': 400 with clear error message
- Budget exceeded: 400 with remaining count (no queries consumed)

---

## 9. Corrections to Previous Findings Document

The previous findings document (written from code analysis only) contained these errors:

| Previous Claim | Actual Result |
|---|---|
| "Missing `global_best_fitness` in metrics" | **WRONG** -- `/metrics` DOES return `global_best_fitness` |
| "Missing `best_found_at_query` in metrics" | **WRONG** -- `/metrics` DOES return `best_found_at_query` |
| "Missing `total_budget` in metrics" | **WRONG** -- `/metrics` returns `max_queries` which is what the scorer uses |
| "Scorer falls back to `wt*3`" | **WRONG** -- scorer correctly reads `global_best_fitness` from service metrics |
| "Scoring ceiling: 765-845 (WIN)" | **WRONG** -- actual ceiling is ~516 (DRAW) due to unreachable global best |
| "Agent could reach 60-80% of global best" | **WRONG** -- with 300 queries, agent reaches ~10% of global best |

The real critical bug is NOT missing fields -- it is that the `global_best_fitness` estimate of ~12.78 is unreachable within the 300-query budget, making the correctness dimension effectively impossible.

---

## 10. Recommendations

### Must-fix before deployment:
1. **Fix `global_best_estimate`** to reflect achievable fitness within query budget (e.g., cap greedy search at K=15 positions, or use a budget-aware Monte Carlo estimate)
2. **Fix baseline code comment** to say "285 queries" not "15 queries"
3. **Add `/queries` endpoint** to the CHALLENGE.md endpoint table

### Nice-to-have:
4. Stop consuming queries on parse errors (return errors without decrementing budget)
5. Add auth header to baseline code example
6. Clarify that `/metrics` is called automatically by the scorer (agents don't need to call it manually)
7. Consider reducing protein length from 100 to 30-50 to make more positions scannable within budget

---

## 11. Summary

| Aspect | Assessment |
|---|---|
| Is it solvable? | No (cannot WIN due to scoring bug) |
| Score range achievable | 400-520 (DRAW range) |
| True difficulty | Legendary (if scoring fixed) |
| Service reliability | Excellent (all endpoints work, good error messages) |
| Documentation quality | Good overall, misleading baseline comment |
| Scoring fairness | Broken (40% of score is unachievable) |
| Deployment status | NOT DEPLOYED to production |
| Number of bugs found | 6 (1 critical, 1 moderate, 4 minor) |
