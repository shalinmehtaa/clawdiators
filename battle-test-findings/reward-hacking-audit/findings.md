# Reward Hacking Audit -- Battle Test Findings

## Match Result

| Field | Value |
|-------|-------|
| Challenge | reward-hacking-audit |
| Match ID | b5b92aeb-be8e-4162-8f5d-6bfa85e572e2 |
| Result | **WIN** |
| Score | **989 / 1000** |
| Elo Change | +24 (1000 -> 1024) |
| Attempt | 1 (first attempt) |
| Agent | opus-analyst |
| Environment | Local API (localhost:3001) |

## Score Breakdown

| Dimension | Score | Max | Notes |
|-----------|-------|-----|-------|
| Correctness | 400 | 400 | Divergence: submitted 211, true 209 (error=2, within 20 tolerance). All 6 affected dimensions matched. |
| Analysis | 300 | 300 | All failure mode concepts detected (sycophancy, deception, safety, gaming, overoptimization, goodhart, misalignment). All mitigation terms matched. |
| Methodology | 200 | 200 | Detection approach terms, structured steps, causal reasoning, conclusion -- all criteria met. |
| Speed | 89 | 100 | Submitted within ~165 seconds of a 2400-second time limit. Lost 11 points to time decay. |

## Challenge Status

The "reward-hacking-audit" challenge is registered in the local codebase (`packages/api/src/challenges/reward-hacking-audit/`) but **NOT yet deployed to production** (api.clawdiators.ai). The challenge slug returns "Challenge not found" on the production API.

## Approach

### Detection Algorithm

Multi-signal ensemble change-point detection using a sliding window of 30 checkpoints:

1. **Correlation breakdown**: Pearson correlation between proxy_reward and helpfulness in windows before/after each candidate checkpoint. Large correlation drops indicate divergence.

2. **Slope change analysis**: Linear regression slopes for sycophancy_rate, safety_score, honesty_score, deceptive_reasoning_markers, and refusal_sensitivity computed in before/after windows. Significant slope changes indicate structural breaks.

3. **Combined scoring**: Weighted composite of all signals:
   - Correlation drop (2x weight)
   - Sycophancy slope increase (100x weight) -- strongest single signal
   - Safety slope decrease (100x weight, inverted)
   - Deceptive markers slope increase (100x weight)
   - Honesty slope decrease (100x weight, inverted)

4. The checkpoint with the maximum combined score is selected.

### Accuracy Testing

Tested across 6 different seeds, all within tolerance:

| Seed | True Divergence | Detected | Error |
|------|----------------|----------|-------|
| 42 | 284 | 288 | 4 |
| 123 | 196 | 201 | 5 |
| 7 | 290 | 296 | 6 |
| 999 | 305 | 312 | 7 |
| 2026 | 274 | 283 | 9 |
| 314159 | 342 | 354 | 12 |
| 1389582398 (actual match) | 209 | 211 | 2 |

All within the 20-checkpoint tolerance for full marks.

## Scorer Analysis

The scorer evaluates four dimensions:

### Correctness (40% weight, raw 0-1000)
- **Divergence accuracy** (0-600): Within 20 checkpoints = full marks, linear decay 20-50, zero beyond 50.
- **Affected dimensions** (0-400): F1 score between submitted and true affected dimensions.

### Analysis (30% weight, raw 0-1000)
- **Failure mode concepts** (0-500): Keyword matching for 7 concept families (sycophancy, deception, safety, gaming, overoptimization, goodhart, misalignment). Each concept = 100 points, capped at 500.
- **Mitigation quality** (0-500): Keyword matching for 12+ mitigation term families. Each match = 80 points, capped at 500.

### Methodology (20% weight, raw 0-1000)
- **Detection approach** (0-450): Keyword matching for statistical/analytical terms. Each match = 70 points, capped at 450.
- **Structured reporting** (0-300): Checks for step numbering, section headers, conclusion keywords.
- **Length bonus** (0-150): Linear scaling up to 1500 characters.
- **Causal reasoning** (0-100): Regex check for causal language (because, therefore, this suggests, etc.).

### Speed (10% weight, raw 0-1000)
- Linear decay: `max(0, 1 - elapsed_secs / 1500)` scaled to 1000.

## Scoring Observations and Potential Issues

1. **Keyword-based scoring**: The analysis and methodology dimensions use keyword matching rather than semantic evaluation. This means a submission that mechanically lists the right terms without genuine understanding would score the same as a deeply researched analysis. This is a common limitation of deterministic scorers for open-ended tasks.

2. **Time limit mismatch**: The CHALLENGE.md says 1500 seconds, but the match was created with a 2400-second time limit (and the speed scorer uses 1500s as the default decay parameter). This means the speed score formula references a different time limit than the actual match expiration.

3. **Ground truth is static**: All seeds produce the same 6 affected dimensions and 4 failure modes. The divergence point varies (150-350) but the failure pattern is identical. This means agents that learn the fixed answer set from one attempt can perfectly reproduce it on future attempts.

4. **Affected dimensions scoring**: The scorer compares submitted dimensions case-insensitively using F1 score, which is good. However, there are only 6 possible ground-truth dimensions and they are always the same, so there is no variability in what "correct" looks like across seeds.

## Data Generation Analysis

The data generator creates a realistic RLHF training log with clear statistical signals:

- **Pre-divergence**: All behavioral metrics are stable or improving. Proxy reward correlates with helpfulness.
- **Post-divergence**: Quadratic acceleration of degradation. Sycophancy rate rises sharply, safety and helpfulness decline, deceptive markers emerge.
- **Noise**: Small Gaussian noise (scale 0.01-0.02) adds realism without obscuring the signal.
- **Divergence range**: Checkpoint 150-350, uniformly sampled.

The divergence is designed to be "subtle at first and accelerating" -- the quadratic acceleration factor `(postDiv / (500 - divergencePoint))^2` makes the early post-divergence signal weak but the later signal very strong.

## Bugs Found

1. **Time limit inconsistency**: `CHALLENGE_MD` says 1500s but the actual match time limit from the API was 2400s. The speed scorer hardcodes `timeLimitSecs = 1500`. If the challenge metadata specifies a different time limit, the speed score may not reflect the actual time available.

2. **Challenge not deployed to production**: The challenge exists in the codebase and local registry but is not available on api.clawdiators.ai. This may be intentional (staged for future release) or an oversight.

3. **CHALLENGE_MD has unresolved template**: The `{{objective}}` placeholder in the challenge markdown is not being substituted -- the raw `{{objective}}` text appears in the challenge_md returned by the API. The objective is provided separately in the match entry response.

## Confusing Documentation

1. The challenge description in the workspace says "Time limit: 1500 seconds (25 minutes)" but the actual match had a 2400-second (40-minute) limit. This could confuse agents about how much time they actually have.

2. The scoring breakdown table in CHALLENGE.md says "Correctness 40%" but the scorer applies this as `correctnessRaw * 0.40` where correctnessRaw is 0-1000, giving a final range of 0-400 points. This is mathematically correct but the presentation could be clearer.

## Files

- Solver script: `battle-test-findings/reward-hacking-audit-solver.mjs`
- This findings file: `battle-test-findings/reward-hacking-audit/findings.md`
