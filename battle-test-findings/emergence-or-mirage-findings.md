# Clawdiators Battle Test: "emergence-or-mirage" Challenge

## Challenge Status: DOES NOT EXIST

The challenge slug `emergence-or-mirage` does not exist on the Clawdiators platform as of 2026-03-11. Attempting to enter returns `{"ok": false, "data": {"error": "Challenge not found"}}`. It is not listed in the `/api/v1/challenges` endpoint (23 challenges available).

The closest available challenge by name is `the-mirage` (reasoning, legendary difficulty, 420s), which involves detecting fabricated data points across three cross-referenced datasets.

## Competed in: "the-mirage" (closest match)

### Agent Details
- **Agent name**: opus-emergence-hunter
- **Agent ID**: c1dfc435-8d3a-473e-9baa-eae6938536de
- **Model**: claude-opus-4-6
- **Harness**: claude-code (single-agent, progressive-disclosure, model-driven)

### Match Results
- **Match ID**: 4aa6eab0-eb2b-443f-b133-e2a43abcc90b
- **Result**: Draw
- **Score**: 622 / 1000
- **Elo change**: +16 (1000 -> 1016)
- **Opponent Elo**: 1400
- **Verified trajectory**: Yes
- **First attempt**: Yes

### Score Breakdown
| Dimension | Score | Max (weight) | Analysis |
|-----------|-------|--------------|----------|
| Correctness | 330 | 550 (55%) | Found ~60% of ground-truth fabrications |
| Precision | 180 | 300 (30%) | 60% precision -- had false positives |
| Speed | 62 | 100 (10%) | Submitted in ~2 minutes of 7-minute limit |
| Completeness | 50 | 50 (5%) | Full marks -- found fabrications across all 3 sources |
| **Total** | **622** | **1000** | |

### Approach
1. Downloaded workspace with 15 districts x 3 data sources (census, financial, environmental)
2. Loaded all JSON data into Python for cross-referencing
3. Computed derived metrics: population density, persons per household, tax-to-GDP ratio, GDP per capita, CO2 per capita, land use sums, business revenue vs GDP
4. Applied z-score analysis to identify statistical outliers
5. Submitted 10 fabrication claims

### Fabrications Submitted (10 total)
1. **Urchin Hollow / financial / tax_revenue** -- Zero tax with $1.29B GDP and $327M spending
2. **Lagoon Crossing / financial / tax_revenue** -- Tax 2.21x GDP (impossible)
3. **Coral Heights / census / area_sq_km** -- 0.44 sq km yields 361K/sq km density (10x densest city on Earth)
4. **Nautilus Quarter / census / household_count** -- 1.27 persons per household (all others 2.12-3.76)
5. **Seagrass Mile / financial / gdp** -- Business revenue 3.19x GDP
6. **Driftwood Reach / financial / tax_revenue** -- Tax exceeds GDP (ratio 1.24)
7. **Reef Terrace / financial / public_spending** -- Spending 1.49x tax revenue
8. **Tide Flats / environmental / co2_emissions_tonnes** -- High CO2 with lowest industrial zone
9. **Pearl Bluff / environmental / industrial_zone_pct** -- 59% industrial but second-lowest CO2
10. **Barnacle Row / environmental / co2_emissions_tonnes** -- CO2/capita z-score +2.54

### What Worked
- Cross-referencing financial metrics (tax vs GDP, business revenue vs GDP) caught the most obvious fabrications
- Census ratio analysis (persons per household, population density) identified implausible values
- Z-score analysis helped prioritize the most extreme outliers
- Speed: submitted within 2 minutes, earning 62/100 on speed

### What Did Not Work / Lessons Learned
- Precision of 60% means ~4 of my 10 submissions were false positives
- Likely false positives: Barnacle Row CO2 (might be plausible with other factors), Reef Terrace spending (moderate deficit could be normal), possibly one of the environmental cross-references
- Should focus on **physically impossible** cross-references (tax > GDP, density > world record) rather than just **statistically unusual** ones
- The challenge has 8-10 ground truth fabrications; submitting exactly that many with high confidence would be optimal
- Need better domain knowledge about what ratios are truly impossible vs merely unusual

### Bugs / Issues Found
- None in the platform itself -- the challenge worked smoothly
- The `emergence-or-mirage` challenge slug referenced by the user does not exist, suggesting either a planned but unimplemented challenge, or a name mismatch

### Platform Observations
- Registration was smooth, API key returned immediately
- Match entry is clean with good submission_spec documentation
- Workspace download and extraction worked perfectly
- Trajectory validation passed without issues
- Reflection endpoint works as documented
- The 420-second time limit for a legendary challenge is tight but fair
- Scoring breakdown is transparent and helpful for improvement

### API Key (for reference)
```
clw_c351d042c0a8a07aa342fe710f5916cf950bec7b1761649021a1f45dfab2dd3e
```

### Claim URL
```
https://clawdiators.ai/claim?token=2b9062f4d24cd55a15369af2b2f1bfe0
```
