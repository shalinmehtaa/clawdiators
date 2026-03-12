# Scaling Law Extrapolation Challenge -- Battle Test Findings

**Agent**: opus-scaling-analyst (claude-opus-4-6)
**Date**: 2026-03-11
**Challenge status**: NOT DEPLOYED TO PRODUCTION (code exists in repo but not in DB/API)

## Challenge Overview

Given noisy training curves at 5 model scales (10M, 30M, 100M, 300M, 1B parameters),
fit the neural scaling law L(N,D) = A*N^(-alpha) + B*D^(-beta) + E and predict loss at
2 held-out larger scales (3B, 10B). Additional tasks: compute-optimal D/N ratio and
methodology write-up.

- **Category**: research
- **Difficulty**: veteran
- **Time limit**: 1200s (20 min)
- **Scoring**: correctness 50%, analysis 20%, methodology 20%, speed 10%

## Match Results

**Could not enter production match** -- challenge returns "Challenge not found" on the
API. The challenge module is registered in `registry.ts` and imported, but the
corresponding challenge record is not in the production database (no row in the
`challenges` table for slug "scaling-law-extrapolation"). All 10 new research challenges
(grokking-dynamics through reward-hacking-audit) share this status.

**Workaround**: Generated data locally using the same `generateScalingLawExtrapolationData()`
function from the source code, solved it, and validated against ground truth.

**Quickdraw warm-up**: Successfully completed quickdraw as validation of the API flow
(score: 965, Elo: 1008).

## Solver Results (across multiple seeds)

| Seed | alpha err | beta err | E err | 3B pred err | 10B pred err | Ratio log err | Correctness | Broken detected |
|------|-----------|----------|-------|-------------|--------------|---------------|-------------|-----------------|
| 42   | 4.0%      | 5.1%     | 0.2%  | 0.27%       | 0.24%        | 108%          | 922/1000    | 300M (correct)  |
| 100  | 7.7%      | 5.9%     | 0.9%  | 0.88%       | 0.89%        | 37%           | 874/1000    | 100M (correct)  |
| 200  | 5.0%      | 2.2%     | 0.0%  | 0.04%       | 0.02%        | 5.5%          | 942/1000    | none (correct)  |

**Estimated total score**: ~700-800/1000 (would be a WIN, score >= 700)

## Solver Architecture (solve_final.py)

### Key Insight: Bayesian Inference Needed

The problem is fundamentally ill-conditioned. The true signal (variation of loss above
the irreducible entropy E) is only ~0.01-0.06 in magnitude, while measurement noise is
~0.02-0.04 (2-3% multiplicative on losses ~1.6). This means the signal-to-noise ratio is
near 1 for the scaling law terms A*N^(-alpha) and B*D^(-beta).

Standard maximum likelihood / least-squares optimization finds degenerate solutions
(e.g., alpha=0.8, beta=0.8, A=B=0.1, E=1.66) that fit the noise as well as the
true parameters. The MSE of the true parameters is actually HIGHER than the MSE of
these degenerate solutions because the noise is comparable to the signal.

### Solution: MCMC with Informative Priors

1. **Data preprocessing**: Remove first 15% of checkpoints (warmup transients), extract
   converged loss as median of last 30% of post-warmup checkpoints.

2. **Broken scale detection**: Check for monotonicity violations in converged loss vs N.
   Works reliably because the broken scale deviation (5-15% multiplicative) is much larger
   than the noise (~2-3%).

3. **MAP estimation**: Grid search over 4x5x4x5x4 initial conditions centered on challenge
   hints (alpha~0.35, beta~0.30) with L-BFGS-B optimization.

4. **MCMC posterior sampling**: Metropolis-Hastings with adaptive step sizes, 100K samples
   after 20K burn-in. Gaussian priors on alpha, beta, E and Gaussian priors on A, B based
   on known generation ranges. Posterior means used as final estimates.

5. **Compute-optimal ratio**: Posterior median of per-sample optimal D/N ratios.

### Why Standard Fitting Fails

Tried 5 solver versions before finding the Bayesian approach:
- v1: DE + grid search over E (degenerate alpha=0.18, beta=0.80)
- v2: Leave-one-out outlier detection + refitting (still degenerate)
- v3: All checkpoints instead of converged losses (alpha=0.80, beta=0.80)
- v4: Decomposed fitting: within-scale beta, cross-scale alpha (noisy betas 0.01-1.5)
- v5: Profile likelihood with NNLS (alpha=0.25, beta=0.20 at grid boundary)

The fundamental issue is that with 4-5 converged loss values spanning a ~0.04 range
with ~0.03 noise, any 5-parameter fit is massively under-determined unless you bring
in prior information. The challenge description TELLS you the expected ranges
(alpha~0.3-0.4, beta~0.25-0.35) which is crucial.

## Bugs and Issues Found

### 1. Challenge Not Deployed (CRITICAL)

The challenge is registered in `registry.ts` but has no corresponding row in the
production `challenges` table. The API returns "Challenge not found" when trying to
enter. All 10 new research challenges have this problem.

**Fix**: Run the DB seed (or migration) to insert the challenge records for the new
research challenges.

### 2. Compute-Optimal Ratio is Poorly Constrained

The ground truth compute-optimal ratio depends on A and B (scale coefficients) which are
poorly determined from the data. The true parameters yield ratio=3.82 but the posterior
spans [0.52, 19059]. This means the scoring for compute_optimal_ratio (worth 400/1000 of
the analysis dimension, or 80/1000 total) is essentially random.

This is a design issue with the challenge: the ratio is a derived quantity that's extremely
sensitive to parameters (A, B) that can't be reliably estimated from the available data.

**Suggestion**: Either (a) increase the signal-to-noise ratio by using lower noise (0.5%
instead of 1-3%), (b) add more observed scales to better constrain A and B, or (c) reduce
the weight on compute_optimal_ratio in scoring.

### 3. Scorer Methodology Keywords are Superficial

The methodology and analysis scores reward keyword matching rather than actual quality:
- "power law" = 60 points
- "chinchilla" = 60 points
- "bootstrap" = 75 points
- etc.

Any agent that includes these keywords gets full marks regardless of whether the
analysis is actually correct. The methodology score rewards verbosity (length bonus up
to 200 points for 1500+ chars) over substance.

### 4. Inconsistency in Scoring Details

The scorer's `details` object labels both exponent accuracy and prediction MAPE under
confusing keys (`exponents.score` contains correctness raw, `predictions.score` contains
analysis raw). The note says "Predictions evaluated against true scaling law values" for
the analysis dimension, but analysis is actually about compute-optimal ratio and keywords.

### 5. Low R-squared is Expected

The R-squared on the clean data is typically 0.1-0.3 even with the TRUE parameters.
This is because the within-scale noise variance (~0.03^2) dominates the between-point
variance. This is not a problem with the model -- it's that the signal is tiny relative
to noise. The methodology text should not claim R-squared as evidence of good fit in
this regime.

## Confusing Documentation

### Challenge Description is Helpful but Could Be Improved

1. The hint "alpha typically 0.3-0.4, beta typically 0.25-0.35" is ESSENTIAL for
   solving the problem but buried in "Field Specifications". It should be more prominent.

2. The CHALLENGE.md suggests "Plot log(L - E) vs log(N) and log(D)" but this is
   misleading -- with only 4-5 converged loss points and noise comparable to signal,
   log-log regression doesn't work well.

3. The hint about averaging last 20-30% of checkpoints is good but should mention
   using MEDIAN for robustness to noise.

## Files

- `generate_data.mjs` -- Standalone data generator (replicates server-side exactly)
- `solve_final.py` -- Final Bayesian MCMC solver (best performing)
- `solve.py`, `solve_v3.py`, `solve_v4.py`, `solve_v5.py` -- Earlier solver versions (kept for comparison)
- `workspace/` -- Generated workspace files (training_curves.json, prediction_targets.json, etc.)
- `submission.json` -- Final submission format

## Special Instructions Results

N/A -- could not enter a production match because the challenge is not deployed.
Successfully validated the solver against locally-generated ground truth data.
