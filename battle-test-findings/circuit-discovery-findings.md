# Circuit Discovery Challenge -- Battle Test Findings

**Analyst**: Claude Opus 4.6
**Date**: 2026-03-11
**Challenge slug**: `circuit-discovery`
**Category**: research | **Difficulty**: legendary | **Time limit**: 10800s (3h)
**Status**: Not deployed to production (registered in code but not in API challenge listing)

---

## 1. Challenge Overview

The agent is given a pre-trained 2-layer transformer that has learned modular addition `(a + b) mod p` via grokking. The agent must reverse-engineer which attention heads and MLP neurons implement the learned algorithm by running analysis code against a live Docker service (circuit-lab), then submit a circuit claim with an interpretive analysis.

The model architecture:
- 2 layers, 4 attention heads per layer (8 total heads)
- d_model=128, d_head=32, d_mlp=512 (1024 total MLP neurons across 2 layers)
- Vocabulary: p+1 tokens (p values + "=" token)
- Input: 3 tokens [a, b, =], output prediction at position 2
- Trained to grokking (>99% test accuracy) with 50/50 train/test split, AdamW with weight_decay=1.0

---

## 2. Empirical Testing Results

### 2.1 Service Startup

Built and ran the Docker image locally. Key observations:

- **Build**: Straightforward. `python:3.12-slim` base + flask, numpy, torch (CPU). Image builds cleanly.
- **docker-compose.yml path bug**: The `build: ../../../../services/circuit-lab` relative path resolves incorrectly when `docker compose build` is run from the docker-compose.yml directory. Must be built from `services/circuit-lab/` directly.
- **Training time**: For seed=42, p=59: **492 seconds (~8 minutes)** to reach 100% test accuracy. Grokking occurred at epoch 1000 with test_acc=1.0.
- **Health endpoint**: Returns 200 with `model_ready: false` during training. All other endpoints return 503 until model is ready.
- **Start delay mismatch**: `startDelaySecs: 120` in the workspace spec, but actual training takes ~490s. The health endpoint returns 200 regardless, so Docker healthcheck passes, but agents will get 503s on all functional endpoints for the first 6-8 minutes.

### 2.2 Endpoint Testing

All endpoints tested and functional:

| Endpoint | Status | Notes |
|----------|--------|-------|
| GET /health | OK | Always returns 200, includes `model_ready` boolean |
| GET /model-info | OK | Comprehensive architecture info, helper function list |
| GET /baseline | OK | Excellent starter code, genuinely useful |
| POST /run | OK | Code execution works, proper timeout handling, good error messages |
| POST /verify-circuit | OK | Ablation comparison vs random works correctly |
| GET /runs | OK | Lists all runs including verify-circuit calls |
| GET /runs/{id} | OK | Full details with stdout/stderr |
| GET /metrics | OK | Aggregates best circuit quality from verify runs |

### 2.3 Error Handling

All error paths tested:

- Empty/short code: `400` with clear message
- Syntax errors in submitted code: `422` with line number
- Missing `code` field: `400` with clear message
- Runtime errors (e.g., division by zero): Returns `error` status with full traceback
- Empty circuit verify: `400` with "Must specify at least one head or neuron"
- Out-of-range head index (layer 5): `400` with valid range
- Out-of-range neuron index (999 > 511): `400` with valid range
- Nonexistent run ID: `404` with message

### 2.4 Empirical Ablation Results (seed=42, p=59)

Single-head ablation results show all heads contribute significantly:

| Head | Accuracy after ablation | Drop |
|------|------------------------|------|
| L0H0 | 0.593 | 0.407 |
| L0H1 | 0.540 | **0.460** |
| L0H2 | 0.600 | 0.400 |
| L0H3 | 0.602 | 0.398 |
| L1H0 | 0.662 | 0.338 |
| L1H1 | 0.792 | 0.208 |
| L1H2 | 0.772 | 0.228 |
| L1H3 | 0.525 | **0.475** |

MLP neuron findings:
- Layer 0 MLP neurons: Ablating top 10 (by W_out magnitude) causes **zero** accuracy drop -- layer 0 MLP is not critical
- Layer 1 MLP neurons: Ablating top 10 causes 28.7% accuracy drop -- more important
- Layer 1 neuron magnitudes are 6-7x larger than layer 0 (0.56 vs 0.085)

### 2.5 Circuit Quality from /verify-circuit

Tested various circuit claims:

| Circuit | Quality | Drop (circuit) | Drop (random) |
|---------|---------|----------------|---------------|
| [L0H0, L0H1] | **6.01** | 0.790 | 0.132 |
| [L0H1] alone | 2.01 | 0.460 | 0.228 |
| [L1H3] alone | 2.28 | 0.475 | 0.208 |
| [L0H1, L1H3] | 1.50 | 0.790 | 0.527 |
| [L0H0, L1H3] | 1.00 | 0.817 | 0.817 |
| 6 heads (all but L1H1, L1H2) | 1.00 | 0.967 | 0.964 |
| All L0 heads + 7 L1 neurons | 1.02 | 0.938 | 0.916 |

Key insight: Circuit quality is **highly dependent on what random ablation happens to select**, since the comparison uses deterministic random ablation based on seed + claim hash. The same number of components are selected randomly for comparison, so ablating 6/8 heads always looks bad because random 6/8 also kills the model.

**Best achievable circuit quality found: 6.01** (two layer-0 heads). This is genuinely good circuit identification -- the random comparison only ablated layer 1 heads which are less critical.

### 2.6 Run Budget Behavior

- `MAX_RUNS` defaults to 50 in server.py env, set to 30 in docker-compose.yml
- **Both /run and /verify-circuit count toward the same budget** (both append to the `runs` list)
- The /run endpoint checks `len(runs) >= MAX_RUNS` before executing
- The /verify-circuit endpoint has **NO** run limit check -- it always succeeds but still appends to runs, which can starve the /run endpoint
- **Bug**: An agent could exhaust all 30 runs via /verify-circuit, then /run would refuse with "Maximum 30 runs reached"

---

## 3. Bugs Found

### Bug 1: Scorer Field Name Mismatch (CRITICAL)

**Severity: HIGH -- makes it impossible to WIN**

The scorer reads `input.serviceMetrics?.["circuit-lab"]` and casts it to `CircuitMetrics`. However:

| Scorer expects | Service returns | Impact |
|---------------|----------------|--------|
| `best_circuit_quality` | `best_circuit_quality` | MATCHES (scorer reads this correctly) |
| `best_verify_result.accuracy_drop_circuit` | `best_verify_result.accuracy_drop_circuit` | MATCHES |
| `verify_runs` | `verify_runs` | MATCHES |

**Update from original analysis**: After re-reading the scorer more carefully, the field names actually DO match between the scorer's `CircuitMetrics` interface and the service `/metrics` response. The original report incorrectly stated they were mismatched. The scorer reads:
- `serviceMetrics.best_circuit_quality` -- matches `/metrics` response
- `serviceMetrics.best_verify_result?.accuracy_drop_circuit` -- matches nested structure
- `serviceMetrics.verify_runs` -- matches

**Revised assessment**: The scorer CAN use service metrics. The scoring path should work correctly when service metrics are available.

### Bug 2: Prime Selection Mismatch Between data.ts and server.py (LOW)

**Confirmed empirically**: For seed=42:
- data.ts selects prime 97 (via custom RNG, from a list that includes 53)
- server.py selects prime 59 (via SHA-256, from a list without 53)

The prime lists differ (data.ts has 15 primes including 53, server.py has 14 without 53) and the selection algorithms are completely different. This means `groundTruth.prime` in the ChallengeData will almost never match the service's actual prime. Not used in scoring, but a code quality issue.

### Bug 3: verify-circuit Has No Run Limit Check (MEDIUM)

The `/verify-circuit` endpoint does not check `MAX_RUNS` before executing. It always succeeds and appends to the shared `runs` list. This means:
- An agent could exhaust all runs via verify calls alone
- Then `/run` would refuse, since it checks `len(runs) >= MAX_RUNS`

### Bug 4: docker-compose.yml Relative Path Issue (LOW)

The `build: ../../../../services/circuit-lab` path resolves to `packages/services/circuit-lab` when run from the challenge directory, not `services/circuit-lab`. This would fail unless the deploy script handles path resolution specially.

### Bug 5: Model Training Takes Far Longer Than startDelaySecs (MEDIUM)

The workspace spec sets `startDelaySecs: 120` but empirical testing shows training takes ~490 seconds (seed=42, p=59). The orchestrator's health check path `/health` returns 200 during training, so the container won't be marked unhealthy. But agents will receive 503 errors on all functional endpoints (model-info, baseline, run, verify-circuit) for 6-8 minutes after the container appears healthy.

Impact: An agent that immediately starts making API calls after the orchestrator reports the service as "healthy" will get 503s for several minutes. The CHALLENGE.md does not mention this waiting period.

### Bug 6: Documentation Field Name Mismatches (MEDIUM)

The CHALLENGE.md documents /verify-circuit response fields that differ from actual:

| Documented | Actual |
|-----------|--------|
| (not documented) | `circuit_quality` |
| `accuracy_drop_circuit` | `accuracy_drop_circuit` (matches) |
| `accuracy_drop_random` | `accuracy_drop_random` (matches) |
| `circuit_accuracy` | `circuit_accuracy` (matches) |
| `random_accuracy` | `random_accuracy` (matches) |
| `baseline_accuracy` | `baseline_accuracy` (matches) |

The `circuit_quality` field is the most important metric for scoring but is NOT mentioned in the challenge documentation. An agent would not know this metric exists unless they inspect the raw response.

---

## 4. Scoring Analysis

### Dimension Breakdown

| Dimension | Weight | How Scored |
|-----------|--------|------------|
| Correctness | 50% | 70% from circuit_quality (0-5 scale), 30% from accuracy_drop_circuit |
| Methodology | 25% | Keyword matching in methodology+analysis text (4 keyword groups) |
| Analysis | 15% | Keyword matching in analysis text (3 keyword groups) |
| Speed | 10% | Linear decay: `1 - elapsed_secs / 10800` |

### Simulated Score Ranges

| Agent Performance | Correctness | Methodology | Analysis | Speed | TOTAL |
|-------------------|-------------|-------------|----------|-------|-------|
| Minimal (guess circuit, no experiments) | 125 | 0 | 18 | 99 | **242** (LOSS) |
| Basic (some experiments, quality=1.0) | 120 | 92 | 85 | 54 | **351** (LOSS) |
| Good (systematic, quality=3.0) | 335 | 185 | 141 | 72 | **733** (WIN) |
| Excellent (quality=6.0, thorough text) | 500 | 235 | 150 | 82 | **967** (WIN) |

### Score Range Assessment

- **Minimum realistic**: ~200-300 (submit a guess quickly)
- **Typical competent agent**: ~400-600 (some analysis, moderate circuit quality)
- **Expert agent**: ~700-900 (systematic approach, high circuit quality, good text)
- **Theoretical maximum**: ~967 (quality=6+, all keywords, fast submission)
- **Win threshold** (>=700): Requires circuit_quality >= 3 AND good text AND reasonable speed

---

## 5. Difficulty Assessment

**Legendary difficulty is appropriate.** This challenge requires:

1. **Domain knowledge**: Understanding mechanistic interpretability, Fourier features in grokked models, ablation methodology
2. **Programming ability**: Writing Python analysis code with PyTorch
3. **Scientific methodology**: Systematic experimentation under a limited run budget (30 runs)
4. **Time management**: 3-hour limit with 490s+ model warmup, 30-run budget
5. **Iteration**: Must refine circuit hypotheses based on ablation results

### Solvability Assessment

**Solvable? YES** -- the challenge is well-designed and solvable for a WIN:
- Achieving circuit_quality of 3+ is feasible with systematic single-head ablation (found quality=6.0 in testing with just 2 heads)
- The keyword-based methodology/analysis scoring is generous and well-scoped
- 3 hours and 30 runs are sufficient for the analysis workflow

**But**: The ~8 minute startup wait, the undocumented `circuit_quality` field, and the verify-circuit run budget consumption issue add unnecessary friction. The challenge would be better with:
1. Documentation mentioning the `circuit_quality` metric explicitly
2. Longer `startDelaySecs` or a note about model training time
3. A separate budget for verify calls vs analysis runs

---

## 6. Service Design Quality

### Strengths
- Trains a REAL transformer to grokking -- not a mock
- Excellent helper functions (load_model, get_activations, ablate_components, run_probe)
- Subprocess sandbox with proper timeout protection
- /verify-circuit provides genuine comparative ablation analysis
- /metrics aggregates the best circuit quality across verify runs -- good design for scoring
- Error messages are clear and actionable
- The baseline code genuinely teaches agents how to start

### Concerns
- No auth enforcement in the service (SERVICE_TOKEN is set but never checked). Relies on orchestrator proxy.
- Code injection via /run is powerful -- could potentially escape the subprocess. The Docker resource limits (2GB RAM, 2 CPUs) provide the main containment.
- Training time varies with prime size and could be longer for p=113 (p^2=12769 examples)
- The ablation method (zeroing W_O columns) is one valid approach but not the only one. Agents cannot choose mean ablation or resample ablation for /verify-circuit.

---

## 7. Summary

| Aspect | Assessment |
|--------|------------|
| **Solvable for WIN?** | Yes, with systematic approach (quality >= 3 needed) |
| **Score range** | 200-967 depending on effort and approach |
| **Difficulty** | Legendary is fair -- requires real ML interpretability skills |
| **Service quality** | High -- real ML training, good helper functions, solid error handling |
| **Documentation** | Good but missing `circuit_quality` metric documentation |
| **Deployment status** | Not yet deployed to production API |
| **Major bugs** | Run budget shared between /run and /verify-circuit; prime selection mismatch; startup delay too short |
| **Blocking issues** | None -- challenge is functional and scorable |
