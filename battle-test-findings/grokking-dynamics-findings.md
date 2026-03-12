# Grokking Dynamics -- Battle Test Findings

Tested by: Opus 4.6 agent
Method: Local Docker testing (service built and run locally; challenge not deployed to production API)
Date: 2026-03-11/12

## Challenge Overview

- **Slug**: grokking-dynamics
- **Category**: research (autoresearch-style)
- **Difficulty**: legendary
- **Time Limit**: 10800 seconds (3 hours)
- **Match Type**: single, environment-based (requires Docker service)
- **Max Score**: 1000
- **Service**: grokking-lab v2.0 (Docker, Python/Flask, PyTorch CPU)

The agent must accelerate the "grokking" phenomenon in a small transformer trained on modular addition (a+b) mod p. Agents submit modified Python training scripts to a live PyTorch training service, observe training curves and Fourier analysis, and iterate. The baseline groks at ~epoch 3000; the goal is to make it grok as early as possible.

## Deployment Status

**NOT LIVE.** The challenge is registered in registry.ts and seeded in seed.ts with `active: true`, but it does not appear on the production API (`GET /api/v1/challenges` returns 23 challenges, grokking-dynamics is not among them). The Docker image `clawdiators/grokking-lab:2.0` has not been deployed to production. All testing below was done against a locally-built Docker container.

## Scoring Dimensions

| Dimension     | Weight | How scored                                                                 |
|---------------|--------|----------------------------------------------------------------------------|
| Correctness   | 60%    | Speedup factor: baseline_epoch / best_epoch. Linear from 1x (0) to 10x (1000). |
| Methodology   | 20%    | Keyword matching on experiment_log + methodology text                      |
| Analysis      | 10%    | Keyword matching for Fourier/circuit/mechanistic concepts                  |
| Speed         | 10%    | Linear time decay over 3-hour match                                        |

## Previous Findings Report -- Corrections

The previous version of this file contained two "critical bug" claims that are **factually incorrect**:

### FALSE: Bug 1 -- `train_code` vs `code` field name mismatch

The previous report claimed the CHALLENGE_MD told agents to use `{"train_code": "..."}` while the server expected `"code"`. This is wrong. The CHALLENGE_MD curl example (line 79 of index.ts) clearly shows `{"code": "import torch\\n..."}`, which matches the server's `data.get("code", "")`. There is no field name mismatch.

### FALSE: Bug 2 -- `baseline_grokking_epoch` vs `default_grokking_epoch` scoring mismatch

The previous report claimed the scorer reads `metrics.baseline_grokking_epoch` which doesn't exist in the /metrics response. This is wrong. The scorer reads `metrics.best_speedup_factor` (scorer.ts line 45), which IS correctly returned by the /metrics endpoint. The scorer does not reference `baseline_grokking_epoch` anywhere. The correctness scoring works correctly.

## Live Testing Results

### Service Endpoints Tested

| Endpoint | Status | Notes |
|----------|--------|-------|
| GET /health | OK | Returns `{"status": "ok", "service": "grokking-lab"}` |
| GET /info | OK | Returns p value, constraints, interface description |
| GET /baseline | OK | Returns full baseline_train.py code, p value, baseline grokking epoch |
| POST /run | OK | Accepts `{"code": "..."}`, returns 202 with run_id |
| GET /runs | OK | Lists all runs with summaries |
| GET /runs/{id} | OK | Returns full run details including training history |
| GET /metrics | OK | Returns scoring metrics with speedup calculation |

### Training Runs Executed (p=89, seed=42)

| Run | Config | Epochs | Time | Grokking Epoch | Status |
|-----|--------|--------|------|-----------------|--------|
| run-000 | d=128, 2L, wd=1.0, lr=1e-3 | 3000 | 90s | N/A | TIMEOUT |
| run-001 | d=128, 1L, wd=2.0, lr=3e-3 | 1500 | 90s | N/A | TIMEOUT |
| run-002 | d=64, 1L, wd=2.0, lr=3e-3 | 600 | 90s | N/A | TIMEOUT |
| run-003 | MLP d=64, wd=2.0, lr=3e-3 | 200 | 8.75s | N/A | Memorized only |
| run-004 | d=32, 1L, wd=5.0, lr=1e-2 | 500 | 34.45s | N/A | Did not grok (WD too aggressive) |
| run-005 | d=64, 1L, wd=1.0, lr=3e-3 | 1500 | 73.63s | 1450 | GROKKED (2.069x speedup) |
| run-006 | d=64, 1L, wd=3.0, lr=1e-2 + cosine | 500 | 1008s | N/A | Completed but no grok; TIMEOUT BUG |

### Key Finding: Run-005 Successfully Grokked

With d_model=64, 1 layer, wd=1.0, lr=3e-3, full-batch training:
- Memorization at epoch 150 (train_acc hits 95%)
- val_acc jumps from ~0.15 to 0.93 between epochs 1300-1350
- Grokking detected at epoch 1450 (val_acc > 0.95)
- Speedup factor: 3000/1450 = 2.069x
- Fourier analysis detected dominant modes at frequencies 5 and 84 (=89-5), 3 and 86 (=89-3), showing the expected paired frequency structure for modular arithmetic

## Actual Bugs Found

### BUG 1 (Critical): 90-second timeout insufficient for default model size

The baseline model uses d_model=128, 2 layers, and trains for 7500 epochs. On CPU in Docker (2 CPU cores, 2GB RAM), the default architecture cannot even complete 1500 epochs in 90 seconds. The baseline's 7500 epochs would take roughly 5-10 minutes.

This means:
- Agents CANNOT run the baseline code as-is. It will always timeout.
- Agents MUST modify the architecture (reduce d_model to 64 or smaller, reduce to 1 layer) just to fit within the timeout, before even trying to accelerate grokking.
- The challenge docs say "the baseline groks at ~epoch 3000" but the baseline cannot reach epoch 3000 within the run timeout.

This is the challenge's most serious issue. An agent that doesn't realize the timeout constraint will waste multiple runs (each costing 90+ seconds of wall clock time) before discovering they need a smaller model.

**Impact**: Every agent's first run with the baseline will fail. The challenge effectively requires agents to independently discover that the timeout forces architectural changes.

### BUG 2 (Medium): subprocess.run timeout not always enforced

Run-006 ran for 1008 seconds despite `subprocess.run(timeout=90)`. The subprocess timeout should raise `subprocess.TimeoutExpired` after 90 seconds, but this did not happen for at least one run. The process completed normally with `status: "completed"` after running for over 16 minutes.

This is inconsistent -- runs 000-002 correctly timed out at 90s. The difference may be related to Docker resource contention or Python's subprocess timeout behavior under certain conditions. On a production server with multiple concurrent matches, this could cause resource exhaustion.

**Location**: server.py line 381

### BUG 3 (Minor): 202 response fields differ from documentation

The CHALLENGE_MD shows the 202 response including `runs_remaining` and `match_time_remaining_secs`, but the actual server returns `p` and `timeout_seconds` instead:

Documented:
```json
{
  "run_id": "run-0",
  "status": "running",
  "message": "Training started. Poll GET /runs/{run_id} for results.",
  "runs_remaining": 29,
  "match_time_remaining_secs": 10742.3
}
```

Actual:
```json
{
  "run_id": "run-000-4812ff",
  "status": "running",
  "message": "Training started. Poll GET /runs/{run_id} for results.",
  "p": 89,
  "timeout_seconds": 90
}
```

**Impact**: Low. Agents parsing the 202 response for `runs_remaining` will get undefined, but they can use `GET /runs` or `GET /info` to check run counts.

### BUG 4 (Minor): Run ID format in docs vs actual

The CHALLENGE_MD shows `run-0` as the run ID format and suggests polling `/runs/run-0`. The actual format is `run-{counter:03d}-{uuid_hex[:6]}` (e.g., `run-000-4812ff`). Agents using the documented ID format will get 404s.

**Impact**: Low. The run ID is returned in the 202 response, so agents can use that. But the docs' polling example would fail.

### BUG 5 (Minor): Concurrent run limit undocumented

The server enforces a maximum of 2 concurrent runs (server.py line 562), returning 429 with `error: "too_many_concurrent"`. This is not documented in the CHALLENGE_MD. With 30 runs and ~30-90 second training times, an agent that tries to batch-submit runs will hit this limit.

**Impact**: Low. The error message is clear, and agents will adapt.

### BUG 6 (Minor): Modular base may differ between objective text and service

data.ts generates `modularBase = randInt(59, 113)` which can be any integer. server.py rounds to the nearest prime. For seed=42, both produce p=89, but for other seeds they could diverge.

**Impact**: Negligible. Agents learn the actual p from GET /baseline and GET /info.

## Scoring Analysis

### Score Calculation

The scorer works correctly (verified by reading scorer.ts):

**Correctness (60%)**: `min(1, (speedup - 1) / 9) * 1000 * 0.60`
- 1x speedup (no improvement) = 0 points
- 2x speedup = 67 points
- 5x speedup = 267 points
- 10x speedup = 600 points (maximum)

**Methodology (20%)**: Keyword matching up to 200 points
- Systematic keywords (12 keywords, 70 pts each, capped at 400): sweep, ablation, baseline, hypothesis, etc.
- Hypothesis keywords (13 keywords, 60 pts each, capped at 300): predict, expect, because, evidence, weight decay, etc.
- Structured tracking (50 pts each): run numbers, epoch values, comparison words, markdown headers
- Length bonus (up to 100 pts for 2000+ chars)
- Maximum raw: 1000, weighted: 200

**Analysis (10%)**: Keyword matching up to 100 points
- Fourier keywords (11 keywords, 80 pts each, capped at 500): fourier, frequency, mode, spectral, etc.
- Circuit keywords (14 keywords, 80 pts each, capped at 500): circuit, modular, mod, embedding, memorization, etc.
- Maximum raw: 1000, weighted: 100

**Speed (10%)**: `(1 - elapsed/10800) * 1000 * 0.10`
- Immediate: 100 points
- 30 min: 83 points
- 3 hours: 0 points

### Achievable Score Ranges

| Speedup | Correctness | + Perfect Text | Total | Result |
|---------|-------------|----------------|-------|--------|
| 1x (no improvement) | 0 | +383 | 383 | LOSS |
| 2x (our test result) | 67 | +383 | 450 | DRAW |
| 3x | 133 | +383 | 516 | DRAW |
| 5x | 267 | +383 | 650 | DRAW |
| 7x | 400 | +383 | 783 | WIN |
| 10x+ | 600 | +383 | 983 | WIN |

**To WIN (score >= 700), you need approximately 7x speedup (grokking at epoch ~430) with perfect methodology/analysis text.**

### Realistic Score Assessment

Given the 90-second timeout constraint:
- Achievable speedup with d_model=64, 1 layer: 2-3x (grokking at ~1000-1500 epochs)
- With further optimization (higher WD, tuned LR, warmup): possibly 5-10x
- The d_model=128 baseline cannot complete within timeout, making it impossible to directly compare
- To achieve 10x speedup (epoch 300), the model must be small enough to complete 300+ epochs in 90s AND have the right inductive bias to grok quickly

**Realistic score: 400-700 (DRAW to low WIN)** for an agent that understands:
1. The timeout forces small models
2. Weight decay is the primary lever
3. Full-batch training helps grokking
4. How to craft keyword-rich methodology text

## Is the Challenge Solvable?

**YES**, but with significant caveats:

1. **The 90-second timeout is the hidden difficulty.** The challenge presents itself as "accelerate grokking from ~3000 epochs" but the real challenge is "build a model small enough to train within 90 seconds that still groks." This is not well-communicated.

2. **The scoring curve is steep.** To WIN, you need ~7x speedup. To get maximum correctness you need 10x. With the timeout constraint, achieving this is very difficult but theoretically possible.

3. **The text-based scoring (30%) can be gamed.** The methodology and analysis scores use pure keyword matching. An agent could include all target keywords without genuine understanding and score 200+100=300 out of 1000 just from text.

4. **The challenge rewards real ML understanding.** Despite the keyword-matching scorer, genuinely understanding grokking dynamics (weight decay as implicit regularization, Fourier circuit formation, memorization-generalization phase transition) is essential for achieving high speedup factors.

## Difficulty Assessment

**Legendary is correct.** This challenge requires:
- Understanding of the grokking phenomenon and its relationship to regularization
- Ability to write and modify PyTorch training code
- Strategic experiment design under resource constraints (30 runs, 90s each)
- Understanding of Fourier analysis in neural network representations
- Managing a multi-step iterative research process over a 3-hour match
- Discovering the timeout constraint from failures (undocumented challenge-within-a-challenge)

## Recommendations for Fixes

1. **CRITICAL**: Either increase the run timeout from 90s to at least 300s, or update the baseline code to use a smaller model that can complete within 90s. Currently the baseline is presented as the starting point but cannot physically run within the timeout.

2. **MEDIUM**: Fix `subprocess.run` timeout enforcement. Consider adding a hard kill via `subprocess.Popen` with `os.kill(SIGKILL)` after timeout, rather than relying on `subprocess.run(timeout=...)`.

3. **LOW**: Update the 202 response in the CHALLENGE_MD to match the actual server response (show `p` and `timeout_seconds` instead of `runs_remaining` and `match_time_remaining_secs`).

4. **LOW**: Update the run ID example from `run-0` to `run-000-xxxxxx` in the CHALLENGE_MD.

5. **LOW**: Document the concurrent run limit of 2 in the CHALLENGE_MD.

## Files Examined

- `packages/api/src/challenges/grokking-dynamics/index.ts` -- Challenge module
- `packages/api/src/challenges/grokking-dynamics/scorer.ts` -- Scoring logic
- `packages/api/src/challenges/grokking-dynamics/data.ts` -- Data generator
- `packages/api/src/challenges/grokking-dynamics/docker-compose.yml` -- Service definition
- `services/grokking-lab/server.py` -- Flask training service
- `services/grokking-lab/baseline_train.py` -- Baseline training script
- `services/grokking-lab/Dockerfile` -- Container definition
- `packages/db/src/seed.ts` -- Database seed (challenge definition)
- `packages/api/src/challenges/registry.ts` -- Challenge registry
- `packages/shared/src/constants.ts` -- Scoring dimension definitions
