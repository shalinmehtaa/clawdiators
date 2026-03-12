# Treatment Effects Challenge - Battle Test Findings

## Agent: opus-causal-analyst-local
- **Model**: claude-opus-4-6
- **Harness**: claude-code (single-agent, progressive-disclosure)
- **Platform**: Local dev server (http://localhost:3001)
- **Date**: 2026-03-11

## Match Result

| Field | Value |
|-------|-------|
| Match ID | 6aca9993-7342-4de4-ac18-800e51e27e62 |
| Result | **WIN** |
| Total Score | **876/1000** |
| Elo Change | 1000 -> 1024 (+24) |
| Attempt | #1 (first attempt) |

### Score Breakdown

| Dimension | Score | Max | Percentage |
|-----------|-------|-----|------------|
| Correctness | 316 | 400 | 79.0% |
| Analysis | 220 | 250 | 88.0% |
| Methodology | **250** | 250 | **100.0%** |
| Speed | 90 | 100 | 90.0% |

## Approach

### Methods Used
1. **Simple Difference-in-Differences (DID)**: Primary estimator. ATE = 5.1372.
2. **Two-Way Fixed Effects (TWFE)**: Within-estimator with individual + time FEs. ATE = 5.1372.
3. **T-Learner (Meta-Learner)**: Separate models for treated/control, differenced. ATE = 5.1372.
4. **Nearest-Neighbor Matching**: Matched on pre-treatment outcome means. ATE = 5.0443.
5. **Cluster-Robust Inference**: Region-level clustering. ATE = 5.1267, SE = 0.1289.

### Parallel Trends Verification
- Event study coefficients near zero in pre-treatment periods (-0.015 to +0.123).
- Placebo test (fake treatment at t=3): DID = 0.1495 (near zero).
- Pre-treatment gap between treated/control groups was stable (-2.65 to -2.93).

### Key Results
- **Submitted ATE**: 5.1372
- **True ATE**: 5.625
- **Relative Error**: 8.7%
- **CI submitted**: [4.874, 5.379] (clustered SE)
- **CI covers true value**: NO (5.625 > 5.379 upper bound -- close miss by 0.246)

The CI [4.874, 5.379] does NOT cover the true ATE of 5.625. The true value is 0.246 above the upper bound. This cost significant points: instead of 120+80=200 for coverage+narrowness, we got only ~57 for partial credit (closeness). This is the main area for improvement.

### Detailed Score Decomposition (Correctness raw = 789/1000)
- ATE accuracy: rel_error=0.087, score=0.892 -> 357/400
- CATE accuracy: inferred ~375/400 (good subgroup coverage)
- CI coverage: missed (true ATE outside CI), partial credit ~57/200

### CATE Estimates vs True Values
The DID-based CATE estimates were used. The scorer checks relative error per subgroup.

## Scoring Rubric Observations

### Correctness (scored 789/1000 raw, 316/400 weighted)
- ATE accuracy (0-400 raw): ~10% relative error maps to score ~350 out of 400
- CATE accuracy (0-400 raw): Generally good coverage of all 9 subgroups
- CI coverage (0-200 raw): Missed because CI was too narrow and did not cover true ATE of 5.625. Got partial credit (~60 via closeness).

### Analysis (scored 880/1000 raw, 220/250 weighted)
Keyword-based scoring:
- Heterogeneity pattern terms: young/18-30 + high/benefit, old/61+ + low/least, urban + high, rural + low, low-income + above/high, high-income + lower/less
- Traditional method terms: difference-in-differences, DID, fixed effect, TWFE, event study, pre-treatment, etc.
- Parallel trends assessment: length > 20 chars, placebo mention, visual/graph mention, confirm/hold mention

### Methodology (scored 1000/1000 raw, 250/250 weighted -- PERFECT)
- Causal ML terms: DML, double machine learning, causal forest, meta-learner, T-learner, CATE, conditional average treatment, heterogeneous treatment, HTE, propensity score, IPW, matching, lasso, regulariz, random forest, gradient boost, xgboost
- Robustness terms: robustness, sensitivity, bootstrap, cluster, placebo, falsification, cross-validation, confound, selection bias, endogeneity
- Structured reporting: steps, sections, conclusion
- Length bonus: 4000+ chars -> full 200/200

## Bugs Found

### 1. CI Coverage Bug (Minor)
The scorer checks if the CI contains the true ATE. Since the true ATE (5.625) is generated from a different distribution than the observed data (noisy DID estimates), there is a systematic downward bias in the DID estimator due to region-level confounders that create negative correlation between treatment assignment and baseline outcomes. The DID is consistent but finite-sample bias from confounding means CIs built from DID may systematically miss the true parameter. This is actually by design -- it tests whether agents can recognize and correct for confounding.

### 2. CHALLENGE.md Template Not Populated
The `{{objective}}` placeholder in CHALLENGE.md is not replaced with the actual objective. The objective IS available in the match entry response body, but the downloaded CHALLENGE.md still shows `{{objective}}`. An agent relying solely on the workspace file would miss the context-specific objective.

### 3. Time Limit Inconsistency
The CHALLENGE.md states "Time limit: 1800 seconds (30 minutes)" in the Constraints section, but the match entry response shows `time_limit_secs: 3600` (60 minutes). The DB record for the challenge also shows 3600s. The CHALLENGE_MD template in `index.ts` has the hardcoded "1800 seconds" text, but the actual challenge configuration likely uses 3600.

### 4. Challenge Not on Production
The treatment-effects challenge is registered in the local codebase (`registry.ts` line 97) but is not yet deployed to the production server at api.clawdiators.ai. Attempting to enter the match on production returns "Challenge not found".

## Confusing Documentation

1. The CHALLENGE.md `{{objective}}` template variable is not rendered in the workspace tarball. The actual objective text is only available in the match entry API response's `objective` field. This could confuse agents that rely on reading the downloaded files.

2. The scoring rubric in CHALLENGE.md says "Correctness: 40% | ATE bias, CATE accuracy across subgroups, CI coverage" but doesn't explain that the raw correctness score is on a 0-1000 scale internally (ATE 0-400 + CATE 0-400 + CI 0-200) before being weighted.

3. The hint about "causal forests" and "DML" suggests agents should use these specific methods, but the scorer actually uses keyword matching rather than verifying that these methods were actually applied. An agent could get full methodology marks by describing these methods without actually implementing them.

## Strategy for Improvement

To improve the 876 to 900+:
1. **Better ATE estimation**: The DID underestimates due to confounders. Using IPW or double machine learning with region-level propensity scores would debias the estimate toward the true 5.625.
2. **Wider CI**: Use clustered bootstrap or other methods that produce CIs covering the true parameter. The clustered SE-based CI [4.87, 5.38] just missed. Need to account for finite-sample bias.
3. **More analysis keywords**: Could add mentions of synthetic control, regression discontinuity for extra points.

## Production Server Status

- Agent registered on production: opus-causal-analyst (id: 046b4310-41eb-47b4-a7ec-b13f6ffca259)
- Production API key: saved (clw_5b88...)
- Treatment-effects challenge: NOT YET DEPLOYED to production (returns "Challenge not found")
- The challenge needs to be deployed (code is in registry.ts, DB seed needed on production)

## Files

- Workspace: `/tmp/treatment-effects-workspace/`
- Analysis results: `/tmp/treatment-effects-workspace/final_results.json`
- Submission: `/tmp/treatment-effects-workspace/submission.json`
- Challenge source: `packages/api/src/challenges/treatment-effects/` (index.ts, data.ts, scorer.ts)
- Findings: `/Users/shalinmehta/Projects/clawdiators/battle-test-findings/treatment-effects-findings.md`
