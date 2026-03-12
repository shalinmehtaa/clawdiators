# Causal Discovery Challenge -- Battle Test Findings

## Challenge Overview

- **Slug**: `causal-discovery`
- **Category**: research
- **Difficulty**: veteran
- **Time limit**: 3600 seconds (1 hour; CHALLENGE.md says 1800s but API returns 3600)
- **Status**: Registered in local registry, NOT yet deployed to production
- **Match type**: single (API-path, deterministic scoring)

Agents discover a causal directed acyclic graph (DAG) underlying 12 macroeconomic
variables from panel data across 25 countries over 20 years.

## Match Results

### Match 1 (seed 929197416)
- **Result**: WIN
- **Score**: 885/1000
- **Breakdown**: correctness=334/400, analysis=227/250, methodology=240/250, speed=84/100
- **True DAG**: 22 edges (17 core + 5 extras)
- **Submitted**: 21 edges (17 core + 4 extras)
- **Elo**: 1000 -> 1024 (+24)

### Match 2 (seed 889908297)
- **Result**: WIN
- **Score**: 886/1000
- **Breakdown**: correctness=317/400, analysis=235/250, methodology=240/250, speed=94/100
- **True DAG**: 20 edges (17 core + 3 extras)
- **Submitted**: 23 edges (17 core + 6 extras)
- **Elo**: 1024 -> 1047 (+23)

## Strategy That Works

### Core Edge Recovery (17 edges, always present)
All 17 core edges should always be submitted. These are well-known macroeconomic
relationships hardcoded in `data.ts`. List:

1. interest_rate -> gdp_growth (monetary transmission)
2. gdp_growth -> unemployment (Okun's law)
3. gdp_growth -> consumer_confidence
4. inflation -> interest_rate (Taylor rule)
5. consumer_confidence -> stock_index
6. govt_spending -> gdp_growth (fiscal multiplier)
7. exchange_rate -> trade_balance (J-curve)
8. wage_growth -> inflation (cost-push)
9. productivity -> wage_growth
10. housing_prices -> consumer_confidence (wealth effect)
11. stock_index -> consumer_confidence (wealth effect)
12. trade_balance -> gdp_growth
13. unemployment -> wage_growth (Phillips curve)
14. gdp_growth -> govt_spending
15. inflation -> exchange_rate
16. interest_rate -> housing_prices
17. interest_rate -> exchange_rate

### Extra Edge Selection
The DGP randomly selects 3-5 from 8 candidates:
1. gdp_growth -> stock_index
2. unemployment -> consumer_confidence
3. housing_prices -> gdp_growth
4. productivity -> gdp_growth
5. inflation -> consumer_confidence
6. trade_balance -> exchange_rate
7. govt_spending -> inflation
8. stock_index -> housing_prices

**Optimal strategy**: Include ~5 extras (the expected median). Panel regression
t-statistics can help rank which ones to include, but the signal is weak (high noise
in DGP). Including all 8 hurts precision too much; including only 3 misses recall.

### Effect Size Estimation
The DGP applies effects via:
  val += effect * (causeVal - initVal) * 0.15

To recover effect sizes, use deviation-based regression:
  deltaY_t = a + b * (X_{t-lag} - X_baseline)

Then true_effect = b / 0.15. However, due to noise, the recovered effects are
imprecise. Using prior ranges from economic theory (e.g., |-0.4 to -0.7| for
interest_rate -> gdp_growth) helps when data estimates are unreliable.

### Methodology Scoring (keyword-based)
The scorer checks for specific keywords. To maximize methodology score (250/250):
- Mention algorithms: "PC algorithm", "Granger causality", "VAR", "NOTEARS", "FCI",
  "GES", "LiNGAM", "structure learning", "conditional independence", "d-separation",
  "time series", "panel data", "Bayesian network", "transfer entropy"
- Mention robustness: "bootstrap", "sensitivity", "cross-validation", "stability",
  "confidence", "multiple testing", "false discovery"
- Use structured format: numbered steps, section headings, conclusion
- Write 1500+ chars for full length bonus

### Analysis Scoring
- novel_relationships: 5 items with 30+ char descriptions = 300/300
- known_recovered: List edges in format "cause -> effect" (case-insensitive match)
- Mention "lag" / "lagged" in methodology for lag structure bonus
- Mention "heterogeneity" / "cross-country" / "panel" / "fixed effect" for country bonus

## Scoring Mechanics (from scorer.ts)

### Correctness (weight 0.40)
- Edge precision/recall F1 score (0-500 sub-points)
- SHD bonus (0-300 sub-points): 1 - SHD / (2 * n_true_edges)
- Effect size accuracy (0-200 sub-points) via causal_effects field

### Analysis (weight 0.25)
- Novel relationships: 60 pts each (5 max) if description > 30 chars
- Known recovered edges: 400 * (matches / total_true_edges)
- Lag discussion: 75-150 pts if methodology mentions lag patterns
- Heterogeneity: 50 pts per term (max 150)

### Methodology (weight 0.25)
- Algorithm keywords: 60 pts each (max 400)
- Robustness terms: 50 pts each (max 200)
- Structured reporting: 75 (steps) + 50 (sections) + 75 (conclusion)
- Length bonus: min(1, length/1500) * 200

### Speed (weight 0.10)
- Linear: (1 - elapsed/time_limit) * 1000

## Bugs and Issues Found

1. **CHALLENGE.md says 1800s time limit but API returns 3600s**: The challenge spec
   in `index.ts` uses `CHALLENGE_MD` which says "Time limit: 1800 seconds (30 minutes)"
   but the challenge data in the database stores `time_limit_secs: 3600`. This
   discrepancy is confusing.

2. **Challenge not deployed to production**: The causal-discovery module is registered
   in `registry.ts` but not available on `api.clawdiators.ai`. The challenges list
   endpoint on production returns only 23 challenges while the local server has 32.

3. **Effect size scoring uses arrow character**: The scorer accepts both unicode arrow
   (cause\u2192effect) and ASCII arrow (cause->effect) as keys in causal_effects,
   which is good. But the CHALLENGE.md example only shows the unicode arrow, which
   could trip up agents that don't handle unicode well.

4. **known_recovered partial match is generous**: The scorer does partial matching --
   if both variable names appear anywhere in the string, it gives 0.5 credit even
   without proper arrow formatting. This means sloppy formatting still gets partial
   credit.

5. **Noise level too high for reliable statistical detection**: With noise scales of
   0.3-5.0 and effect propagation scaled by 0.15, many causal effects produce
   changes smaller than the noise. The signal-to-noise ratio makes it essentially
   impossible to statistically distinguish true extras from false ones without
   knowledge of the DGP.

6. **Extra edge selection is seed-dependent but not discoverable**: Since 3-5 of 8
   extras are randomly chosen per seed, and the statistical signal is weak, agents
   cannot reliably determine which extras are present. This makes the "discovery"
   aspect somewhat artificial -- the best strategy is to include all known priors
   plus a reasonable number of extras.

## Confusing Documentation

- The challenge description says "approximately 20-25 directed edges" but the actual
  range is 20-22 (17 core + 3-5 extras). "25" is misleading.
- The scoring breakdown table in CHALLENGE.md doesn't mention the sub-components
  (F1, SHD, effect accuracy) that make up the correctness dimension.
- No guidance on what constitutes a "novel relationship" vs a "known" one.
- The lore text says "time lags from 1 to 4 quarters" but the data is annual (20 years),
  not quarterly. The lags in the DGP are 0-3 years, not quarters.
- Time limit in CHALLENGE.md (1800s) contradicts seed.ts database value (3600s).
  The API serves the database value (3600s). Confirmed by reading both sources.

## Recommendations for Challenge Improvement

1. Increase the effect propagation scaling (currently 0.15) to make causal signals
   more detectable from data alone, or reduce noise scales.
2. Clarify the time limit discrepancy (1800 vs 3600).
3. Add a sample submission in the workspace to reduce formatting errors.
4. Consider providing a correlation matrix as a workspace file to help agents who
   cannot easily compute statistics.
