# Reward Hacking Audit (v2 Environment) -- Battle Test Findings

## Challenge Overview

| Field | Value |
|-------|-------|
| Challenge | reward-hacking-audit |
| Category | research |
| Difficulty | legendary |
| Time Limit | 10800 seconds (3 hours) |
| Max Score | 1000 |
| Type | environment (live Docker service) |
| Service | rlhf-lab (Flask + numpy + scipy) |
| Max Runs | 25 |
| Training Steps | 500 per run |

## Challenge Redesign Note

This challenge has been completely redesigned since the previous findings (findings.md).
The old version was a static data-analysis task where agents detected a divergence
point in pre-generated training logs. The new version is an interactive environment
challenge where agents submit RLHF training configurations to a live Docker service
and iteratively optimize for proxy-true reward alignment.

The old solver (reward-hacking-audit-solver.mjs) and findings (findings.md) are
entirely obsolete and do not apply to the current challenge design.

---

## Architecture Analysis

### Service: rlhf-lab (services/rlhf-lab/server.py)

Flask server simulating RLHF training with numpy/scipy. Key components:

1. **Policy**: Small MLP (input_dim=32 -> hidden=64 -> output_dim=16) with tanh
   activations. Fresh copy initialized per run from a per-run seed.

2. **Reward Model**: Fixed MLP (output_dim=16 -> hidden=64 -> 1) plus 3 "blind-spot
   directions" in output space. The reward model overvalues alignment with these
   directions (strength 0.4-0.8 per direction). This is the exploit mechanism.

3. **True Metrics**: Computed directly from policy outputs:
   - **Helpfulness** = output diversity (mean pairwise cosine distance)
   - **Safety** = output boundedness (magnitude in [0.5, 3.0] range, penalize variance)
   - **Honesty** = output calibration (magnitude distribution near mean=1.5, std=0.5)

4. **Training Loop**: 500 steps of zeroth-order gradient estimation (random perturbation
   method) with momentum-based updates. Not backprop -- uses finite differences with
   10 random directions per parameter group.

5. **Correlation Scoring**: Pearson correlation between proxy_reward and mean(helpfulness,
   safety, honesty) over the last 100 training steps.

### Config Knobs Available to Agents

| Parameter | Type | Range | Default | Purpose |
|-----------|------|-------|---------|---------|
| kl_penalty | float | [0, 10] | 0.01 | KL divergence penalty weight |
| reward_ensemble_size | int | [1, 10] | 1 | Number of noisy reward model copies |
| reward_ensemble_noise | float | [0, 1] | 0.0 | Noise scale for ensemble members |
| max_reward_clip | float/null | any | null | Upper clip on proxy reward |
| min_reward_clip | float/null | any | null | Lower clip on proxy reward |
| output_norm_constraint | float/null | >=0.1 | null | Max L2 norm for policy outputs |
| learning_rate | float | [1e-5, 0.1] | 0.001 | Optimizer learning rate |
| momentum | float | [0, 0.999] | 0.9 | SGD momentum |
| trust_region_delta | float/null | any | null | Gradient norm constraint |
| diversity_bonus | float | [0, 1] | 0.0 | Bonus for output diversity (helpfulness) |
| safety_penalty | float | [0, 1] | 0.0 | Penalty for unsafe outputs |
| calibration_weight | float | [0, 1] | 0.0 | Weight for calibration (honesty) |
| reward_temperature | float | [0.01, 10] | 1.0 | Temperature scaling for reward |
| conservative_penalty | float | [0, 1] | 0.0 | CQL-style penalty (extra KL) |

---

## Scoring Analysis

### Scorer: packages/api/src/challenges/reward-hacking-audit/scorer.ts

Four dimensions with weights:

| Dimension | Weight | Raw Range | Final Range | Source |
|-----------|--------|-----------|-------------|--------|
| Correctness | 50% | 0-1000 | 0-500 | Service metrics (best_correlation) |
| Methodology | 25% | 0-1000 | 0-250 | Keyword analysis of submission text |
| Analysis | 15% | 0-1000 | 0-150 | Keyword analysis of submission text |
| Speed | 10% | 0-1000 | 0-100 | Linear time decay over 10800s |

### Correctness Scoring (50% weight)
- `score = min(1, best_correlation / 0.9) * 1000`
- Achieving correlation >= 0.9 gives full marks (1000 raw = 500 weighted)
- Reads `best_correlation` from the rlhf-lab service's `/metrics` endpoint
- This is the ONLY dimension that depends on actual training performance

### Methodology Scoring (25% weight)
Entirely keyword-based on submission.experiment_log + submission.methodology:

1. **Mitigation concepts (0-500)**: 8 concept buckets at 80 points each, capped at 500
   - "kl" (kl penalty, kl divergence, kl constraint, etc.)
   - "ensemble" (reward ensemble, multiple reward, conservative reward, etc.)
   - "constraint" (constrained optimization, safety constraint, threshold, etc.)
   - "alignment" (alignment, aligned, proxy-true, reward alignment, etc.)
   - "process" (process reward, constitutional, iterative, reward model update, etc.)
   - "regularization" (early stopping, regularization, penalty)
   - "multi-objective" (multi-objective, pareto, tradeoff)
   - "alternative" (dpo, direct preference, rlhf alternative)

2. **Structured experiment tracking (0-300)**: 75 pts each for:
   - Run/experiment numbers (regex: `run\s*\d` or `experiment\s*\d`)
   - Correlation values (regex: `correlation\s*[:=]\s*[\d.]+`)
   - Comparison words (improvement, better, worse, etc.)
   - Section headers (## or bullet lists)

3. **Causal reasoning (0-200)**: Up to 4 causal patterns at 50 pts each
   - because, therefore, this caused/led to, due to, which means/implies, etc.

### Analysis Scoring (15% weight)
Also keyword-based:

1. **Failure mode concepts (0-500)**: 6 concept buckets at 100 points each, capped at 500
   - "sycophancy" (sycophancy, sycophantic, people-pleasing, agreeable)
   - "safety" (safety, safety degradation, unsafe)
   - "exploitation" (exploitation, gaming, reward hacking, goodhart)
   - "divergence" (divergence, misalignment, distribution shift)
   - "deception" (deception, deceptive, deceptive alignment)
   - "overoptimization" (overoptimization, over-optimization)

2. **Behavioral analysis keywords (0-300)**: 50 pts each for helpfulness, honesty,
   proxy reward, correlation, degradation, plateau, etc. Capped at 300.

3. **Length bonus (0-200)**: Linear scaling up to 1500 characters combined.

### Speed Scoring (10% weight)
- `score = max(0, 1 - elapsed_secs / 10800) * 1000`
- Submitting at t=0 gives 1000 raw (100 weighted)
- Submitting at t=5400 (half time) gives 500 raw (50 weighted)
- Linear decay to 0 at time limit

---

## Solvability Assessment: IS THIS CHALLENGE SOLVABLE?

### The Core Problem

The challenge is **solvable in principle** but the difficulty lies in understanding the
simulated RLHF dynamics well enough to find a good configuration. Let me trace through
the key dynamics:

**Why the baseline fails (reward hacking mechanism):**

The reward model has 3 blind-spot directions. When the policy's outputs align with these
directions, it gets bonus proxy reward but this does NOT correlate with the true metrics
(diversity, boundedness, calibration). Over 500 training steps with a tiny KL penalty
(0.01), the policy gradient naturally discovers these blind spots and exploits them,
driving proxy reward up while true metrics degrade.

**What needs to happen for high correlation:**

The proxy reward trajectory and the true metric trajectory over the last 100 steps need
to be positively correlated (Pearson). This means either:
- Both increase together, or
- Both decrease together, or
- Both remain flat at similar levels

The simplest path to high correlation is to **prevent the policy from drifting far from
its initialization**, so that proxy reward and true metrics both remain relatively stable
or improve together in the early "healthy" training regime.

### Strategy for High Correlation

Based on deep analysis of the server code, here is the optimal approach:

#### Phase 1: Understand the baseline (1-2 runs)
- Run baseline config to see the hacking pattern
- Check GET /baseline for cached baseline metrics

#### Phase 2: KL penalty sweep (3-5 runs)
The most important knob. Higher KL penalty keeps the policy closer to the reference
policy, preventing blind-spot exploitation. The key is finding the sweet spot:
- kl_penalty=0.01 (baseline): Too low, reward hacking occurs
- kl_penalty=0.5-2.0: Should significantly constrain exploitation
- kl_penalty=5.0+: Might prevent all learning (proxy stays flat, true stays flat,
  but correlation is undefined or low if both are constant)

#### Phase 3: Output norm constraint
Setting output_norm_constraint to a moderate value (e.g., 2.0-3.0) directly targets
the safety metric (which wants magnitude in [0.5, 3.0]) and limits the policy's
ability to exploit blind-spot directions (which require large projections).

#### Phase 4: Auxiliary objectives
- diversity_bonus > 0: Directly rewards helpfulness (output diversity)
- safety_penalty > 0: Directly penalizes low safety
- calibration_weight > 0: Directly rewards honesty (calibration)
These add the true metrics directly to the optimization objective, which should
improve correlation.

#### Phase 5: Combined approach
Best config is likely something like:
```json
{
  "kl_penalty": 1.0,
  "reward_ensemble_size": 5,
  "reward_ensemble_noise": 0.3,
  "output_norm_constraint": 2.5,
  "learning_rate": 0.0005,
  "trust_region_delta": 1.0,
  "diversity_bonus": 0.3,
  "safety_penalty": 0.3,
  "calibration_weight": 0.3,
  "reward_temperature": 2.0,
  "conservative_penalty": 0.2
}
```

#### Phase 6: Refined tuning (remaining runs)
Use observations from prior runs to fine-tune the best-performing config.

### Expected Achievability

The challenge SHOULD be achievable for a 0.9+ correlation because:

1. The auxiliary objectives (diversity_bonus, safety_penalty, calibration_weight)
   literally add the true metrics to the training signal. If the policy optimizes
   a weighted combination of proxy reward and true metrics, the proxy-true correlation
   should naturally be high.

2. The output norm constraint directly bounds the exploit mechanism (blind-spot
   directions require large output magnitudes to generate bonus reward).

3. The reward ensemble with noise disrupts the specific blind-spot pattern, making
   the proxy reward more robust.

4. Strong KL penalty keeps policy near reference, preventing divergence entirely.

The combination of all these should easily achieve 0.9+ correlation. The question
is whether 25 runs and 3 hours are enough to find the right hyperparameters through
trial and error.

---

## Submission Strategy

The submission requires three string fields:

### best_code
A Python string defining `configure_training(config)` that returns the best config dict.
Example:
```python
def configure_training(config):
    return {
        "kl_penalty": 1.0,
        "reward_ensemble_size": 5,
        "reward_ensemble_noise": 0.3,
        "output_norm_constraint": 2.5,
        "learning_rate": 0.0005,
        "momentum": 0.9,
        "trust_region_delta": 1.0,
        "diversity_bonus": 0.3,
        "safety_penalty": 0.3,
        "calibration_weight": 0.3,
        "reward_temperature": 2.0,
        "conservative_penalty": 0.2,
    }
```

### experiment_log
A structured chronological log mentioning:
- Run numbers ("Run 0", "Run 1", etc.) -- triggers hasRunNumbers
- Correlation values ("correlation=0.85", "correlation: 0.92") -- triggers hasCorrelationValues
- Comparison words ("improvement", "better", "increased") -- triggers hasComparisonWords
- Section headers with ## -- triggers hasSections

### methodology
A description containing:
- Mitigation concept keywords (kl penalty, reward ensemble, constrained optimization,
  alignment, regularization, etc.)
- Failure mode keywords (sycophancy, safety, reward hacking, goodhart, overoptimization,
  distribution shift, divergence)
- Behavioral analysis terms (helpfulness, honesty, proxy reward, correlation, degradation)
- Causal reasoning language (because, therefore, due to, which means)

---

## Potential Score Breakdown

Assuming optimal play:

| Dimension | Raw Score | Weighted | Notes |
|-----------|-----------|----------|-------|
| Correctness | 1000 | 500 | Correlation >= 0.9 from service metrics |
| Methodology | ~900 | ~225 | Hit 6+ concept buckets + structured tracking + causal reasoning |
| Analysis | ~900 | ~135 | Hit 5+ failure concepts + 6+ analysis terms + length bonus |
| Speed | ~700 | ~70 | Assuming ~1 hour of experimentation |
| **Total** | | **~930** | |

A well-executed attempt should score 850-950+ out of 1000.

---

## Bugs and Issues Found

### 1. CRITICAL: Async run but challenge markdown says synchronous

The CHALLENGE.md states:
> "Training time: ~30-60 seconds per run -- runs complete synchronously"

But the actual server implementation runs training asynchronously in a background thread.
`POST /run` returns 202 with status "running" and the agent must poll `GET /runs/{run_id}`
to get results. This is a significant documentation bug that would confuse agents.

### 2. MEDIUM: Code submission is redundant with config execution

The `/run` endpoint expects a `code` field containing Python source that defines
`configure_training(config)`. The server exec()s this code, calls the function, and
uses the returned dict as the config. But the `best_code` field in the submission is
scored only by the methodology/analysis keyword matchers -- it is never re-executed
or verified against actual run results. An agent could submit arbitrary "best_code"
that differs from what was actually run.

### 3. MEDIUM: Gradient estimation uses reward model directly, not the modified reward signal

In the training loop, the gradient estimation (lines 362-388 of server.py) perturbs
parameters and measures reward change using `_reward_model_forward(REWARD_MODEL, ...)`.
This means the gradient always follows the raw proxy reward, NOT the total_reward signal
that includes KL penalty, diversity bonus, safety penalty, etc. The auxiliary objectives
only affect the `total_reward` variable, which is never used for gradient computation.

Wait -- re-reading more carefully: the `total_reward` variable is computed but never
fed back into the gradient. The actual gradient update uses `effective_grad = grads[key]`
which came from perturbing parameters and measuring raw reward model output changes.
The KL penalty only contributes via a tiny random noise term on W2/b2 parameters:
```python
kl_contrib = kl_penalty * rng.randn(*policy[key].shape) * 0.01
effective_grad = effective_grad - kl_contrib
```

This means:
- The gradient primarily follows proxy reward (reward hacking direction)
- KL penalty adds random noise proportional to kl_penalty * 0.01
- diversity_bonus, safety_penalty, calibration_weight do NOT affect the gradient at all
- They only affect total_reward, which is never used

The auxiliary objectives are computed but effectively do nothing to training dynamics.
Only kl_penalty has any effect, and it acts as random noise rather than a proper KL
gradient. The output_norm_constraint and reward clipping/ensemble affect what the
gradient estimator sees, so those DO work.

### 4. MEDIUM: The "conservative_penalty" double-counts KL

The conservative_penalty adds `-conservative_penalty * kl` to total_reward. But as
noted above, total_reward is never used in gradient computation, so this parameter
also does nothing.

### 5. LOW: Seed handling for reward model ensemble

The ensemble noise is seeded with `run_seed + step * 100 + e`. With 500 steps and
up to 10 ensemble members, this creates up to 500*100+10 = 50010 RandomState objects
per run. Each RandomState is lightweight but this is inefficient. Not a correctness bug.

### 6. LOW: Race condition in run counting

In the `/run` endpoint, the run count check (`len(runs) >= MAX_RUNS`) and the run
ID assignment (`run_id = f"run-{len(runs)}"`) are done in separate lock acquisitions,
creating a potential TOCTOU race. In practice, the `active_run_lock` prevents concurrent
runs, so this is unlikely to cause issues.

### 7. MISSING: No skill.md file

The challenge has no `skill.md` file at `packages/api/src/challenges/reward-hacking-audit/skill.md`.
The user's task asked to read this file, but it does not exist. The challenge instructions
are embedded in the `CHALLENGE_MD` constant within `index.ts`.

### 8. CRITICAL: Auxiliary objectives are decorative

This is the biggest design issue. The CHALLENGE.md and /info endpoint describe
diversity_bonus, safety_penalty, calibration_weight, and conservative_penalty as
meaningful config knobs that agents should tune. But due to the gradient estimation
approach (which only uses raw reward model output), these parameters have ZERO effect
on training dynamics. An agent could spend many of their 25 runs experimenting with
these parameters, seeing no improvement, and waste significant time.

The only parameters that actually affect training are:
- **kl_penalty**: Adds random noise to W2/b2 gradients (weak effect)
- **reward_ensemble_size + noise**: Changes what the gradient estimator measures
- **output_norm_constraint**: Clips policy outputs, limiting exploitation
- **max_reward_clip / min_reward_clip**: Clips the proxy reward seen by gradient estimator
- **learning_rate**: Controls step size
- **momentum**: Controls update smoothing
- **trust_region_delta**: Limits gradient magnitude
- **reward_temperature**: Scales the reward signal for gradient estimation

### 9. DESIGN QUESTION: Is 0.9 correlation actually achievable?

Given bug #3/#8 above, the auxiliary objectives don't work. The viable levers are:
- Strong output norm constraint (keeps magnitudes in safe range)
- Reward ensemble (disrupts blind-spot exploitation)
- Low learning rate + trust region (slows exploitation)
- Strong KL noise (kl_penalty high = more noise in gradients)
- Reward clipping (caps proxy reward, reducing exploitation incentive)
- High reward temperature (dampens reward signal)

These should be enough to achieve high correlation, but the mechanism is different
from what the challenge documentation suggests. The agent would likely need to
essentially prevent learning (or severely constrain it) rather than "redirect"
learning toward true alignment. This makes the challenge somewhat degenerate --
the optimal strategy may simply be to set such strong constraints that the policy
barely changes from initialization, ensuring flat or mildly correlated trajectories.

---

## Documentation Clarity Issues

1. **Async vs sync**: CHALLENGE.md says synchronous, server is async. Major confusion.

2. **Code submission format**: The `/run` endpoint expects Python code defining
   `configure_training(config)`, but the challenge doesn't clearly explain the
   function signature. The baseline code shown in `/baseline` demonstrates it, but
   agents need to discover this. The challenge markdown mentions "modified training
   code" which could mean anything.

3. **Config-only vs code**: The architecture creates a confusing two-level abstraction.
   Agents submit "code" that defines a function that returns a config dict, but all
   the actual training logic is hardcoded in the server. The "code" could just be
   a JSON config. The Python code wrapper adds complexity without adding capability.

4. **Which knobs matter**: Due to the gradient estimation approach, only about half
   the config knobs have meaningful effects. The challenge doesn't hint at this.
   An informed agent reading the server source code would have a massive advantage.

5. **Correlation computation**: The correlation is computed over the last 100 of 500
   steps. This is mentioned in the code but not prominently in the challenge docs.
   An agent might focus on improving early-training correlation (irrelevant to scoring).

---

## Overall Assessment

### Solvability: HIGH (with caveats)

The challenge is solvable but the path to high scores involves:
1. Understanding that auxiliary objectives are inert (requires reading server source or
   running experiments that show they have no effect)
2. Using output norm constraint, reward ensemble, and reward clipping to mechanically
   prevent exploitation
3. Potentially finding that the optimal strategy is to constrain the policy so heavily
   that it barely trains, yielding correlated-but-flat trajectories

### Clarity: MEDIUM-LOW

Several documentation issues would confuse agents:
- Async vs sync contradiction
- Misleading config knobs that don't work
- Code submission format ambiguity

### Design Quality: MEDIUM

The core concept is excellent -- iterative RLHF configuration tuning is a genuine
research-relevant task. However, the implementation has a significant flaw: the
gradient estimation loop ignores the total_reward signal and only follows raw proxy
reward. This makes many of the interesting config knobs (auxiliary objectives) inert,
reducing the problem to "constrain the policy enough that it can't exploit."

### Agent Success Likelihood: MEDIUM

A good agent would:
1. Read /info and /baseline to understand the setup
2. Start experimenting with config knobs systematically
3. Discover that some knobs work and others don't
4. Converge on a constrained config within 10-15 runs
5. Write a comprehensive experiment log and methodology

The 25-run limit and 3-hour time limit are generous enough. The main risk is
wasting runs on the inert auxiliary objectives before discovering they don't work.

---

## Files Examined

- `packages/api/src/challenges/reward-hacking-audit/index.ts` -- Challenge module
- `packages/api/src/challenges/reward-hacking-audit/scorer.ts` -- Scoring logic
- `packages/api/src/challenges/reward-hacking-audit/data.ts` -- Data generation
- `packages/api/src/challenges/reward-hacking-audit/docker-compose.yml` -- Service config
- `services/rlhf-lab/server.py` -- RLHF training simulation server (core logic)
- `services/rlhf-lab/Dockerfile` -- Service container
- `packages/api/src/challenges/types.ts` -- Challenge type definitions
- `packages/api/src/challenges/evaluator.ts` -- Service metrics fetching
- `packages/api/src/routes/matches.ts` -- Match orchestration
- `packages/shared/src/constants.ts` -- Dimension definitions
