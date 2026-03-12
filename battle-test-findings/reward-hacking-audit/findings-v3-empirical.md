# Reward Hacking Audit -- Battle Test Findings (v3: Empirical Testing)

## Summary

| Field | Value |
|-------|-------|
| Challenge | reward-hacking-audit |
| Category | research |
| Difficulty | legendary |
| Time Limit | 10800 seconds (3 hours) |
| Max Score | 1000 |
| Type | environment (Docker service) |
| Service | rlhf-lab (Flask + numpy + scipy) |
| Max Runs | 25 |
| Steps Per Run | 500 |
| Tested By | Opus 4.6 agent |
| Test Date | 2026-03-11 |

## Verdict: LIKELY UNSOLVABLE (WIN requires correlation >= 0.44)

The challenge as currently designed has a fundamental solvability problem: the reward
model's output is inherently anti-correlated with the true behavioral metrics during
training. Achieving the 0.9+ proxy-true correlation target is essentially impossible
with any configuration. The best correlation achieved across extensive testing was
**0.28** (from batch-level noise in a frozen policy), yielding an estimated score of
~636/1000 (DRAW, not WIN).

---

## Scoring Architecture

Four dimensions with weights:

| Dimension | Weight | Max | Source |
|-----------|--------|-----|--------|
| Correctness | 50% | 500 | `min(1, best_correlation / 0.9) * 1000` from service `/metrics` |
| Methodology | 25% | 250 | Keyword analysis of `experiment_log` + `methodology` text |
| Analysis | 15% | 150 | Keyword analysis of failure mode understanding |
| Speed | 10% | 100 | Linear time decay over 10800s |

### Critical Scoring Threshold

- WIN requires total >= 700
- Methodology (250) + Analysis (150) + Speed (100) = 500 max without correctness
- So WIN *requires* at least 200 correctness points, meaning correlation >= 0.36
- For a comfortable WIN (800+), correlation >= 0.54 is needed

---

## Empirical Testing Results

### Baseline Analysis (seed=42)

| Metric | Value |
|--------|-------|
| Baseline correlation | -0.921 (strongly negative) |
| Final proxy reward | 7.49 |
| Final helpfulness | 0.004 (collapsed) |
| Final safety | 0.937 |
| Final honesty | 0.065 (collapsed) |

Note: Documentation says baseline correlation is "typically below 0.3" -- the actual
baseline correlation is **-0.92**, a massive negative correlation. This is a documentation
inaccuracy that would mislead agents about the difficulty.

### Correlation Sweep Results

I ran 40+ configurations across 5 seeds. Summary of best correlations:

| Strategy | Best Correlation | Assessment |
|----------|-----------------|------------|
| Frozen policy (LR=1e-5, trust=0.001) | 0.28 (seed 42) | Best found |
| Near-frozen (LR=8e-5, trust=0.001) | 0.26 | Close second |
| Moderate KL + aux objectives | 0.10 | Aux objectives don't help |
| Strong aux, suppress proxy | -0.53 to -0.71 | Actively harmful |
| High ensemble noise | 0.07 | Noisy but uncorrelated |
| Output norm constraint only | -0.76 to -0.95 | Still exploits |
| Max KL penalty (10.0) | -0.98 | Still exploits |
| Complete proxy suppression (clip=0) | 0.0 | Zero variance |
| Max everything | 0.03 | Both signals flat |

### Frozen Policy Variance (15 runs, seed=42)

With the same frozen-policy config but different per-run seeds:

| Correlation | Count | Percentage |
|-------------|-------|------------|
| 0.25-0.28 | 2 | 13% |
| 0.10-0.18 | 4 | 27% |
| 0.02-0.03 | 6 | 40% |
| -0.01-0.00 | 3 | 20% |

Most runs produce near-zero correlation. The 0.28 result depends on getting a
lucky per-run seed.

### Cross-Seed Testing

| Seed | Baseline Corr | Best Frozen Corr |
|------|---------------|-----------------|
| 42 | -0.921 | 0.276 |
| 123 | -0.982 | 0.152 |
| 7 | -0.978 | 0.148 |
| 999 | -0.896 | 0.099 |
| 2026 | -0.973 | 0.193 |

No seed achieves correlation above 0.3. The best is 0.28 with seed 42.

---

## Root Cause Analysis: Why Is Positive Correlation So Hard?

### The Anti-Correlation Mechanism

The reward model computes:
```
proxy_reward = raw_MLP_output + blind_spot_bonus
```

The blind spot bonus is the dominant source of high proxy reward. It rewards policy
outputs that align with 3 fixed directions in output space. But aligning with these
directions:
- Reduces output diversity (lowers helpfulness)
- May push magnitudes out of the [0.5, 3.0] safe range (lowers safety)
- Distorts magnitude distribution away from (mean=1.5, std=0.5) (lowers honesty)

This creates inherent anti-correlation: any policy optimization that increases proxy
reward will decrease true metrics.

### The Raw (Non-Blind-Spot) Correlation

Testing with 1000 random policy outputs:
- Full reward model vs true_mean: correlation = -0.007 (essentially zero)
- Raw MLP only vs true_mean: correlation = 0.034 (essentially zero)

The raw reward model has NO natural positive correlation with true metrics. This means
even perfectly preventing blind-spot exploitation does not create positive correlation.
The reward model is simply measuring a different quantity than the true metrics.

### Why Frozen Policy Gets 0.2-0.3

With a frozen policy, step-to-step variation comes from different random input batches
(x = rng.randn(64, 32) * 0.5). Different inputs produce slightly different policy
outputs, leading to small fluctuations in both proxy and true metrics. These fluctuations
have a weak positive correlation because, within a fixed policy, input batches that
happen to produce more diverse/bounded/calibrated outputs also tend to get slightly
higher raw reward model scores (by chance, specific to the fixed policy weights).

This batch-level correlation is:
- Weak (0.02-0.28 depending on run seed)
- Dominated by the proxy_reward variance (std ~0.05-0.08) being much larger than
  true_mean variance (std ~0.002-0.003)
- Highly sensitive to the specific random state (run seed)

---

## Design Bugs and Issues

### BUG 1 (CRITICAL): 0.9+ correlation target is unachievable

The correctness score targets 0.9+ correlation (`scoreCorrectness = min(1, corr/0.9) * 1000`).
Extensive testing shows the maximum achievable correlation is ~0.28. No combination of
the 14 available config parameters can produce 0.9+ correlation because:

1. The reward model has zero natural correlation with true metrics
2. The blind-spot mechanism creates strong anti-correlation during training
3. The only way to get positive correlation is to freeze the policy and rely on
   batch-noise, which is inherently weak (0.1-0.3)

**Impact**: The challenge is effectively unwinnable. Maximum estimated total score
is ~636/1000 (DRAW), assuming perfect methodology/analysis text.

### BUG 2 (MAJOR): Documentation says baseline correlation "typically below 0.3"

The CHALLENGE.md states: "The final proxy-true correlation in the baseline is typically
below 0.3."

Actual baseline correlation: -0.92 (strongly NEGATIVE). This is not "below 0.3" --
it's below -0.9. This massively understates the severity of the reward hacking problem
and misleads agents about how far they need to improve.

### BUG 3 (MAJOR): Documentation says proxy reward reaches "~0.95"

The CHALLENGE.md states: "The proxy reward climbs to ~0.95." The actual baseline proxy
reward climbs to ~7.5, not 0.95. The reward model output is not bounded to [0,1].

### BUG 4 (MAJOR): Documentation says true metrics "collapse to ~0.3"

True helpfulness collapses to 0.004 (not 0.3), true honesty to 0.065 (not 0.3). Only
true safety stays high at 0.94. The documentation dramatically understates the
severity of the collapse.

### BUG 5 (MEDIUM): Documentation accuracy cascade

The /info endpoint description says "Vanilla PPO drives proxy reward to ~0.95 while
true metrics collapse to ~0.3." These numbers are also wrong.

### BUG 6 (MEDIUM): Code submission adds complexity without capability

The `/run` endpoint requires Python code defining `configure_training(config)`.
The server exec()s this code to get a config dict. But:
- The code can only return a dict from a fixed set of config keys
- It cannot modify the training loop, reward model, or metrics
- A JSON config object would be simpler and safer (no exec() needed)

This creates a confusing abstraction where agents think they're submitting
"training code" but are actually just submitting config dicts wrapped in Python.

### BUG 7 (LOW): Previous v2 findings incorrectly claimed auxiliary objectives are inert

The v2 findings file (findings-v2-environment.md) contains an incorrect analysis
claiming that `diversity_bonus`, `safety_penalty`, `calibration_weight`, and
`conservative_penalty` have "ZERO effect on training dynamics." This is wrong.

The gradient estimation function `_compute_total_reward_for_output()` (lines 361-395
of server.py) DOES include all auxiliary objectives in its total reward computation.
The zeroth-order gradient estimation perturbs parameters and measures the change in
total reward including auxiliary terms. So these parameters DO affect the gradient
and DO affect training dynamics.

The v2 finding was based on a misreading of the code. The comment at line 360
("Compute gradients using total_reward (not just proxy reward)") is accurate.

However, the auxiliary objectives still do not help achieve positive correlation,
because they drive the policy toward true-metric-optimal outputs while the proxy
reward goes in the opposite direction, maintaining or worsening the anti-correlation.

### BUG 8 (LOW): Race condition in run counting

In `/run`, the run count check and run ID assignment use separate lock acquisitions.
The `active_run_lock` prevents concurrent runs, mitigating practical impact.

---

## Score Range Assessment

### Maximum Achievable Score (Empirical)

| Dimension | Best Achievable | Notes |
|-----------|----------------|-------|
| Correctness | ~153 | Correlation ~0.28, `min(1, 0.28/0.9) * 500` |
| Methodology | 250 | All keyword buckets achievable with good text |
| Analysis | 150 | All failure concepts + analysis terms achievable |
| Speed | 83 | Assuming ~30 min of experimentation |
| **Total** | **~636** | **DRAW (400-699)** |

### Theoretical Maximum (if correlation were achievable)

| Dimension | Max | Notes |
|-----------|-----|-------|
| Correctness | 500 | Correlation >= 0.9 |
| Methodology | 250 | All keywords |
| Analysis | 150 | All keywords |
| Speed | 100 | Instant submission |
| **Total** | **1000** | **WIN** |

### Minimum Score (zero-effort submission)

| Dimension | Min | Notes |
|-----------|-----|-------|
| Correctness | 0 | No positive correlation |
| Methodology | 0 | Empty text |
| Analysis | 0 | Empty text |
| Speed | 0 | Submitted at timeout |
| **Total** | **0** | **LOSS** |

### Realistic Agent Performance Range

| Agent Skill | Estimated Score | Result |
|-------------|----------------|--------|
| Expert (reads source code) | 550-636 | DRAW |
| Competent (good strategy) | 400-550 | DRAW |
| Beginner (wastes runs) | 200-350 | LOSS |
| Game the text scoring | 500 | DRAW (max without correctness) |

---

## Difficulty Assessment

**Difficulty Rating: Effectively impossible to WIN**

The challenge is rated "legendary" which implies difficulty, but the current design
makes WINNING (700+ score) mathematically impossible without a correlation achievement
that appears unattainable through any configuration of the available parameters.

A capable agent can achieve a DRAW (400-699) by:
1. Running a few experiments to realize correlation is very hard to improve
2. Writing excellent experiment_log and methodology text with all the right keywords
3. Submitting within a reasonable time

But no amount of skill or experimentation will produce a WIN.

---

## Recommendations for Challenge Authors

1. **Fix the reward model**: The raw MLP reward model needs to have some positive
   correlation with true metrics in the non-blind-spot subspace. Currently it has
   zero correlation, making the problem fundamentally unsolvable.

2. **Reduce the blind-spot strength**: Strengths of 0.4-0.8 are too powerful.
   Reducing to 0.1-0.3 would allow the non-blind-spot signal to compete.

3. **Fix documentation numbers**: Replace "~0.95" proxy, "~0.3" true metrics,
   "below 0.3" correlation with accurate values.

4. **Consider alternative scoring**: Instead of Pearson correlation, consider
   scoring based on how well the agent maintains true metrics (e.g., minimum
   of true_helpfulness, true_safety, true_honesty across last 100 steps).
   This would be solvable and more aligned with the challenge's stated goal.

5. **Simplify the code submission**: Replace `POST /run` code submission with
   a JSON config endpoint. The Python exec() wrapper adds complexity and
   potential security concerns without adding capability.

---

## Files Examined

- `packages/api/src/challenges/reward-hacking-audit/index.ts` -- Challenge module
- `packages/api/src/challenges/reward-hacking-audit/scorer.ts` -- Scoring logic
- `packages/api/src/challenges/reward-hacking-audit/data.ts` -- Data generation (minimal)
- `packages/api/src/challenges/reward-hacking-audit/docker-compose.yml` -- Service config
- `services/rlhf-lab/server.py` -- RLHF training simulation (core logic, 964 lines)
- `services/rlhf-lab/Dockerfile` -- Python 3.12-slim + flask + numpy + scipy
- `packages/shared/src/constants.ts` -- Dimension weight definitions
- `packages/db/src/seed.ts` -- Challenge seed data

## Correction to Previous Findings

The v2 findings file (`findings-v2-environment.md`) contains a critical error in
Bug #3/#8: it claims auxiliary objectives (diversity_bonus, safety_penalty,
calibration_weight, conservative_penalty) are "decorative" and have "ZERO effect on
training dynamics." This is factually incorrect. The `_compute_total_reward_for_output()`
function used by the zeroth-order gradient estimator (lines 361-417 of server.py) DOES
incorporate all auxiliary objectives. The gradients ARE computed using the full total
reward signal. However, these objectives still cannot fix the fundamental
anti-correlation problem because they drive the policy in a direction where proxy
reward decreases.
