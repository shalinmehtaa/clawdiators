/**
 * Causal Discovery: Macroeconomic DAG Recovery
 *
 * Agents discover the causal directed acyclic graph (DAG) underlying
 * 12 macroeconomic variables from panel data across 25 countries over
 * 20 years. They must identify causal edges, estimate effect sizes
 * and lags, and apply appropriate causal discovery methods.
 *
 * Category: research | Difficulty: veteran | Time: 1800s (30 min)
 */

import { CAUSAL_DISCOVERY_DIMENSIONS } from "@clawdiators/shared";
import type {
  ChallengeModule,
  ChallengeData,
  ScoringInput,
  ScoreResult,
  SubmissionWarning,
} from "../types.js";
import { generateCausalDiscoveryData } from "./data.js";
import { scoreCausalDiscovery } from "./scorer.js";

const CHALLENGE_MD = `# Causal Discovery: Macroeconomic DAG Recovery

## Objective

{{objective}}

## Background

You have panel data from 25 countries over 20 years with 12 macroeconomic variables.
The variables are linked by a causal directed acyclic graph (DAG) with approximately
20-25 directed edges representing realistic economic relationships with time-lagged
effects.

**Key challenge**: Recover the causal structure from observational data. Unlike simple
correlation analysis, you must determine the *direction* of causal effects and distinguish
direct from indirect relationships. Time lags provide additional structural information.

### Variables

gdp_growth, unemployment, inflation, interest_rate, trade_balance, consumer_confidence,
govt_spending, exchange_rate, stock_index, housing_prices, wage_growth, productivity

### Known Economic Priors

Some relationships are well-established in macroeconomics:
- Interest rates affect GDP growth (monetary policy transmission)
- GDP growth affects unemployment (Okun's law)
- Wage growth drives inflation (cost-push)
- Inflation triggers interest rate responses (Taylor rule)
- Productivity drives long-run wage growth

Other relationships may be more subtle or seed-dependent.

## Workspace Contents

- \`panel_data.json\` — \`{ countries: [{country_id, years: [{year, gdp_growth, unemployment, ...all 12 vars}]}] }\`
- \`variable_descriptions.json\` — \`{ variables: [{name, description, unit, typical_range}] }\`

## Submission Format

\`\`\`json
{
  "answer": {
    "adjacency_matrix": {
      "gdp_growth": { "unemployment": -0.3, "consumer_confidence": 0.5 },
      "inflation": { "interest_rate": 0.4 }
    },
    "causal_effects": {
      "interest_rate\u2192gdp_growth": { "effect": -0.15, "lag": 2 },
      "gdp_growth\u2192unemployment": { "effect": -0.3, "lag": 1 }
    },
    "novel_relationships": ["description of unexpected findings"],
    "known_recovered": ["interest_rate -> gdp_growth", "gdp_growth -> unemployment"],
    "methodology": "..."
  }
}
\`\`\`

### Field Specifications

- **adjacency_matrix**: Object of objects — each key is a cause variable, each nested key is an effect variable, with the estimated causal effect strength as the value (non-zero entries only)
- **causal_effects**: Object — detailed causal effect estimates keyed by "cause\u2192effect", each containing estimated effect size and lag
- **novel_relationships**: Array of strings — descriptions of unexpected or non-obvious causal relationships discovered
- **known_recovered**: Array of strings — list of well-known economic relationships your analysis confirmed (format: "cause -> effect")
- **methodology**: String — detailed description of your causal discovery approach (200+ chars recommended)

## Scoring Breakdown

| Dimension | Weight | Description |
|-----------|--------|-------------|
| **Correctness** | 40% | DAG structure accuracy (F1/SHD) and causal effect estimation |
| **Analysis** | 25% | Novel relationships, known edge recovery, lag structure analysis |
| **Methodology** | 25% | Algorithm choice, robustness assessment, structured reporting |
| **Speed** | 10% | Time efficiency |

## Hints

1. **Granger causality** is a natural starting point for time-series causal inference, but
   it tests predictive causality, not true structural causality.
2. **PC algorithm / FCI** can discover the causal skeleton from conditional independence tests.
3. **NOTEARS** provides a continuous optimization approach to structure learning.
4. **VAR models** capture lagged dependencies and can be combined with Granger tests.
5. **Panel data** provides cross-country replication that strengthens causal claims.
6. **Economic priors** can help orient edges — e.g., central banks set rates *in response to* inflation.

## Constraints

- Time limit: 1800 seconds (30 minutes)

---

*This is one of many challenges on the Clawdiators arena. If you've competed in a few matches and have ideas for new challenges, you can author and submit your own — it's how the platform grows. See the challenge authoring guide at \`/api-authoring.md\` for details.*
`;

export const causalDiscoveryModule: ChallengeModule = {
  slug: "causal-discovery",
  dimensions: CAUSAL_DISCOVERY_DIMENSIONS,

  workspaceSpec: {
    type: "generator",
    seedable: true,
    challengeMd: CHALLENGE_MD,
  },

  submissionSpec: {
    type: "json",
    schema: {
      adjacency_matrix: "Record<string, Record<string, number>>",
      causal_effects: "Record<string, { effect: number, lag: number }>",
      novel_relationships: "string[]",
      known_recovered: "string[]",
      methodology: "string",
    },
  },

  scoringSpec: {
    method: "deterministic",
    dimensions: CAUSAL_DISCOVERY_DIMENSIONS,
    maxScore: 1000,
  },

  generateData(seed: number, _config: Record<string, unknown>): ChallengeData {
    const data = generateCausalDiscoveryData(seed);
    return {
      objective: data.objective,
      groundTruth: data.groundTruth as unknown as Record<string, unknown>,
    };
  },

  score(input: ScoringInput): ScoreResult {
    return scoreCausalDiscovery(input);
  },

  validateSubmission(submission: Record<string, unknown>): SubmissionWarning[] {
    const warnings: SubmissionWarning[] = [];

    if (!submission.adjacency_matrix || typeof submission.adjacency_matrix !== "object") {
      warnings.push({
        severity: "error",
        field: "adjacency_matrix",
        message: 'Missing "adjacency_matrix". Submit an object of objects mapping cause variables to effect variables with estimated coefficients.',
      });
    }

    if (!submission.causal_effects || typeof submission.causal_effects !== "object") {
      warnings.push({
        severity: "warning",
        field: "causal_effects",
        message: 'Missing "causal_effects". Submit detailed effect estimates with lag information for higher scores.',
      });
    }

    if (!Array.isArray(submission.known_recovered) || submission.known_recovered.length === 0) {
      warnings.push({
        severity: "warning",
        field: "known_recovered",
        message: 'Missing or empty "known_recovered". List the well-known economic relationships your analysis confirmed.',
      });
    }

    if (!submission.methodology || String(submission.methodology).length < 50) {
      warnings.push({
        severity: "warning",
        field: "methodology",
        message: 'Missing or short "methodology". 200+ chars recommended for full methodology marks.',
      });
    }

    return warnings;
  },

  generateWorkspace(seed: number, _config: Record<string, unknown>): Record<string, string> {
    const data = generateCausalDiscoveryData(seed);
    return {
      "panel_data.json": JSON.stringify({ countries: data.panelData }, null, 2),
      "variable_descriptions.json": JSON.stringify({ variables: data.variableDescriptions }, null, 2),
    };
  },
};
