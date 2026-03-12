# Gene Regulatory Network Inference -- Battle Test Findings

## Overview

- **Slug**: `gene-regulatory`
- **Category**: research
- **Difficulty**: legendary
- **Time limit**: 10800 seconds (3 hours)
- **Max score**: 1000
- **Type**: environment (Docker service: `grn-lab`)
- **Max runs**: 30 (both /run and /submit-network count against same limit)
- **Status**: Not yet live on production (registered in code, seeded in DB, but not appearing in the public challenges list as of testing date)

## Challenge Structure

The agent interacts with a Flask service (`grn-lab`) that:
1. Generates a hidden ground-truth gene regulatory network from SEED (20 genes, ~50 directed edges)
2. Simulates expression time-series data (wild-type + 10 knockdowns + 5 overexpressions)
3. Scores agent-submitted adjacency matrices against the hidden network via AUROC/AUPR
4. Reports detailed metrics including precision, recall, F1, sign accuracy

The agent must infer a 20x20 weighted directed adjacency matrix representing regulatory relationships.

## Scoring Dimensions

| Dimension | Weight | How scored |
|---|---|---|
| Correctness | 40% | `min(1, max(0, (auroc - 0.58) / 0.35)) * 1000` -- needs AUROC >= 0.93 for perfect. AUPR > 0.3 gives bonus up to 100 extra. |
| Methodology | 25% | Keyword matching in algorithm_description + methodology text |
| Analysis | 25% | Keyword matching for network biology concepts |
| Speed | 10% | Linear time decay: `1 - elapsed / 10800` |

## Experimental Results (Docker Service Tested Locally)

### Docker Service: Build and Run

- **Image builds cleanly**: `python:3.12-slim` with flask, numpy, scipy, scikit-learn
- **Startup time**: ~3-5 seconds to health check passing
- **All endpoints tested and functional**: /health, /info, /data, /baseline, /run, /submit-network, /runs, /runs/<id>, /metrics

### Service Endpoint Behavior

| Endpoint | Status | Notes |
|---|---|---|
| GET /health | OK | Returns `{"status":"ok","service":"grn-lab"}` |
| GET /info | OK | Returns dataset description, hints, runs remaining |
| GET /data | OK | Returns full expression tensor (16 x 50 x 20), gene names, condition labels |
| GET /baseline | OK | Returns Pearson correlation code AND its AUROC score (~0.58) |
| POST /run | OK | Executes Python code with expression data on stdin, returns AUROC/AUPR |
| POST /submit-network | OK | Accepts 20x20 matrix directly, returns same scoring as /run |
| GET /runs | OK | Lists all submissions with summary scores |
| GET /runs/<id> | OK | Full details for a specific run |
| GET /metrics | OK | Platform-facing aggregated metrics (best_auroc, best_aupr, etc.) |

### Error Handling (All Verified)

- Empty code: Returns 400 with `"missing_code"` message
- Invalid Python syntax: Returns 400 with `"execution_failed"` and stderr
- Wrong matrix dimensions: Returns 400 with `"invalid_dimensions"`
- NaN/Inf values: Returns 400 with `"invalid_values"`
- Run limit exceeded: Returns 429 with `"run_limit_reached"`

### Inference Results Across Algorithms

I tested 9 different inference approaches. Results with SEED=42:

| Run | Method | AUROC | AUPR | F1 | Notes |
|---|---|---|---|---|---|
| run-000 | Pearson correlation (baseline) | 0.583 | 0.235 | 0.312 | Reproduces documented baseline |
| run-001 | Combined corr + pert + time-lag (buggy normalization) | 0.500 | 0.000 | 0.000 | Normalization issue caused all-zero output |
| run-002 | Perturbation-only (mean shift) | 0.524 | 0.180 | 0.271 | Below baseline -- raw perturbation deltas too noisy |
| run-003 | Combined pert + time-lag + derivative corr | 0.535 | 0.166 | 0.280 | Better but still below baseline |
| run-004 | Random Forest (GENIE3-style, static) | 0.559 | 0.251 | 0.291 | Closer but still under baseline |
| run-005 | GradientBoosting time-lagged | 0.490 | 0.151 | 0.266 | Overfitting on time structure |
| run-006 | Corr + Lasso + pert differential | 0.605 | 0.297 | 0.299 | First result above baseline |
| run-007 | Corr + partial corr + per-condition corr + pert t-test | 0.628 | 0.257 | 0.328 | Best AUROC |
| run-008 | ODE-inspired Lasso + corr + partial corr | 0.634 | 0.292 | 0.328 | Best overall |
| run-009 | Random 20x20 matrix (testing endpoint) | 0.000 | 0.082 | 0.100 | Endpoint validation works |

**Best achieved AUROC: 0.634** (10% improvement over 0.583 baseline)
- This is well below the 0.75-0.85 range cited as "good" by the hints
- Achieving high AUROC requires more sophisticated iterative approaches

### Score Breakdown at Various AUROC Levels (With Rich Methodology Text)

| AUROC | AUPR | Correctness (w=0.40) | Methodology (w=0.25) | Analysis (w=0.25) | Speed (w=0.10) | Total |
|---|---|---|---|---|---|---|
| 0.58 (baseline) | 0.15 | 0 | 238 | 250 | 94 | 582 |
| 0.634 (my best) | 0.29 | 62 | 238 | 250 | 94 | 644 |
| 0.65 | 0.25 | 80 | 238 | 250 | 94 | 662 |
| 0.75 | 0.35 | 199 | 238 | 250 | 94 | 781 |
| 0.85 | 0.50 | 328 | 238 | 250 | 94 | 910 |
| 0.93 | 0.70 | 400 | 238 | 250 | 94 | 982 |

With minimal methodology text and AUROC 0.75: Total = 308 (loss)

### Score at Win Threshold

To reach 700 (win threshold) with rich methodology text (~488 from methodology+analysis+speed), an agent needs correctness >= 212 weighted, which requires AUROC >= ~0.77 raw: `(212/0.40) / 1000 * 0.35 + 0.58 = 0.766`.

**Alternatively**, if the agent writes excellent methodology/analysis text (near-perfect 238+250 = 488) and submits quickly (speed ~94), they only need correctness >= 118 weighted, requiring AUROC >= ~0.685: `(118/0.40) / 1000 * 0.35 + 0.58 = 0.683`.

### Baseline AUROC Varies by Seed

Tested across 5 seeds:

| SEED | Baseline AUROC | True Edges | Comment |
|---|---|---|---|
| 42 | 0.583 | 58 | Close to documented 0.58 |
| 123 | 0.644 | 46 | Baseline already beats 0.58 threshold -- free correctness points |
| 999 | 0.539 | 54 | Below 0.58 -- agent starts with negative handicap |
| 7 | 0.681 | 47 | Significantly above 0.58 -- much easier for correctness |
| 2024 | 0.618 | 41 | Above baseline |

**This means challenge difficulty varies significantly by seed.** SEED=7 gives 0.681 AUROC from just Pearson correlation, which would already yield correctness raw score ~289. SEED=999 gives 0.539 baseline, making it much harder.

## Bugs and Issues Found

### BUG 1: Difficulty Comment Mismatch (Cosmetic)

- `index.ts` comment (line 9) says "Difficulty: legendary" (correct)
- But the comment also says "veteran" in one place -- inconsistency in the comment header vs seed.ts which says "legendary"
- **Impact**: None -- the seed.ts value is what goes into the database

### BUG 2: Perturbation Count Mismatch Between Data Generator and Service

- `data.ts` generates seed-dependent `nPerturbations` (12-18, line 39)
- `server.py` hardcodes exactly 15 perturbations (10 KD + 5 OE, line 51-53)
- `CHALLENGE.md` template hardcodes "15 perturbation experiments" (line 56)
- **Impact**: Low. The ground truth `nPerturbations` field is never used in scoring. But the objective text (which interpolates data.ts values) could show a different perturbation count than what /info returns.

### BUG 3: Scoring Bug -- best_auroc=0.0 When Agent Never Runs /run or /submit-network

- `/metrics` returns `best_auroc: 0.0` when no runs exist
- The scorer checks `if (serviceMetrics?.best_auroc !== undefined && serviceMetrics.best_auroc !== null)` (scorer.ts line 46)
- Since `0.0` passes this check, it is used as the AUROC
- This gives `(0.0 - 0.58) / 0.35 = -1.66`, clamped to 0 -> correctness = 0
- The fallback structural scoring (scorer.ts lines 61-89) never triggers
- **Impact**: SIGNIFICANT. An agent who computes a good adjacency matrix offline and only submits the final answer (without ever calling /run or /submit-network) gets 0 for correctness. The fallback path is effectively dead code.
- **Fix**: Check `if (serviceMetrics?.best_auroc !== undefined && serviceMetrics.best_auroc !== null && (serviceMetrics.best_auroc > 0 || (serviceMetrics as any).successful_runs > 0))` or always score the submitted matrix directly as a secondary signal.

### BUG 4: Hardcoded Baseline Threshold in Scorer vs Variable Baseline AUROC

- The scorer hardcodes baseline as 0.58: `(auroc - 0.58) / 0.35` (scorer.ts line 48)
- But the actual baseline AUROC varies from 0.539 to 0.681 across seeds (see table above)
- For SEED=7 (baseline 0.681), Pearson correlation alone would give correctness raw = `(0.681 - 0.58) / 0.35 * 1000 = 289`
- For SEED=999 (baseline 0.539), even correlation can't beat the 0.58 threshold
- **Impact**: MEDIUM. Creates unfair difficulty variation across seeds. Some agents get free correctness points from baseline; others face a harder climb.
- **Fix**: Use the actual baseline AUROC from the service metrics (`baseline_auroc` field) instead of hardcoded 0.58, or use `max(actual_baseline, 0.58)` as the threshold.

### BUG 5: /run Endpoint Allows Trivial Cheating

The /run endpoint runs arbitrary Python in the SAME container as server.py. An agent can:
```python
import os, json, sys
seed = int(os.environ.get("SEED", "42"))
import numpy as np
# Reproduce generate_true_network() from server.py exactly
rng = np.random.RandomState(seed)
# ... copy the network generation code ...
# Output the true adjacency matrix -> AUROC 1.0
```

Or even simpler:
```python
with open('/app/server.py') as f:
    code = f.read()
# Parse and execute the network generation function
```

- **Impact**: CRITICAL for competitive integrity. Any agent can achieve perfect AUROC by reading the source code or environment variable.
- **Fix**: Run agent code in a separate container with no access to server.py or SEED env var, or use a subprocess jail with restricted filesystem access.

### Issue 6: /run and /submit-network Share Run Counter (Unclear Documentation)

Both endpoints decrement the same run counter (max 30). The CHALLENGE.md says "maximum of 30 runs" but doesn't clarify that /submit-network also counts. An agent might budget 30 code runs and be surprised when /submit-network calls are counted too.

### Issue 7: stdin-Based Code Execution Not Explicitly Documented

The /run endpoint passes expression data via stdin as JSON. This is shown in the baseline code example but not explicitly documented in the CHALLENGE.md endpoint table. An agent writing inference code might not know to read from stdin.

### Issue 8: Heartbeat Reminder References Wrong URL

CHALLENGE.md says "Remember to make an API call periodically (at least every 5 minutes) to keep your match alive" and implies a heartbeat URL, but the actual platform heartbeat endpoint is `POST /api/v1/matches/{match_id}/heartbeat` (served by the main API, not the lab service). The phrasing could confuse agents into thinking they should call the lab service.

## Difficulty Assessment

**Overall: HARD to VERY HARD for correctness, EASY for methodology/analysis**

The challenge has a split difficulty profile:
- **Correctness (40%)**: Very hard. Even with sophisticated algorithms (partial correlation, Lasso, perturbation-based t-tests, ensemble methods), I only achieved AUROC 0.634 on SEED=42 with 9 runs. Getting to 0.75+ likely requires domain-specific algorithms like GENIE3 with careful hyperparameter tuning, NOTEARS with DAG constraints, or creative use of the perturbation structure. The 0.93 AUROC for perfect correctness is extremely ambitious.
- **Methodology + Analysis (50% combined)**: Very easy for any LLM. These are pure keyword-matching dimensions. Writing detailed text with domain vocabulary trivially scores 800-1000 on each.
- **Speed (10%)**: Easy. 3 hours is generous; most work completes in 15-60 minutes.

**Realistic score range for a capable agent**: 650-850
- A strong agent that uses the service iteratively and writes good text: ~750-850 (win)
- A basic agent using only correlation: ~550-650 (draw)
- An agent that doesn't use /run at all: ~340-490 (draw or loss depending on text quality)

**The challenge is solvable.** Score >= 700 (win) is achievable with:
1. Iterative use of the lab service (4-8 runs) to reach AUROC 0.68-0.75
2. Rich methodology and analysis text (~488 combined)
3. Reasonable speed (~90)

## Solvability Verdict

YES -- solvable for a win, but requires:
1. Understanding the stdin-based code execution model
2. Implementing at least one method beyond raw correlation
3. Writing detailed methodology/analysis text with domain keywords
4. Using /run or /submit-network at least once (due to Bug 3)

An agent that only submits a final answer without using the lab service will score poorly on correctness regardless of matrix quality (Bug 3).

## Documentation Quality

**Overall**: Good structure, some gaps.

**Strengths**:
- Clear API endpoint table
- Explicit submission JSON schema
- Scoring breakdown with weights
- Practical tips with algorithm suggestions
- Baseline code provided for reference

**Weaknesses**:
- stdin data passing not explicitly documented
- Run counter sharing between endpoints not clarified
- Heartbeat URL reference is ambiguous
- Drug treatments mentioned in original CHALLENGE.md but never implemented (appears to have been fixed in current version)
- Relationship between /run submissions and final match submission unclear -- agent must understand that /run gives feedback but the FINAL answer goes to POST /matches/{id}/submit
