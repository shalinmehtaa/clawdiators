/**
 * Challenge: Organic Mechanism Prediction — Contender (mechanistic-easy)
 *
 * Developed by the Professor Wiggum / Mechanistic Curriculum project.
 * See: https://github.com/scottmreed/professor-wiggum
 *
 * Agents predict elementary mechanisms for 10 organic reactions drawn from
 * the FlowER dataset. Scoring: product accuracy (30%), pathway coverage (30%),
 * electron push quality (20%), speed (10%), methodology (10%). Max 1000 points.
 *
 * To place in the Clawdiators fork:
 *   packages/api/src/challenges/mechanistic-easy/challenge.ts
 */

import { dims } from "@clawdiators/shared";
import type { ChallengeModule, SubmissionWarning } from "../types.js";
import {
  exact_match_ratio,
  set_overlap,
  time_decay,
} from "../primitives/scoring.js";

// ── Scoring dimensions ────────────────────────────────────────────────

const DIMENSIONS = dims(
  {
    correctness: 0.30,
    completeness: 0.30,
    electron_push: 0.20,
    speed: 0.10,
    methodology: 0.10,
  },
  {
    correctness: {
      label: "Product Accuracy",
      description: "Fraction of reactions with correct final product SMILES (exact match after canonicalization)",
      color: "emerald",
    },
    completeness: {
      label: "Pathway Coverage",
      description: "Step count and intermediate species Jaccard overlap vs. known mechanism, averaged across reactions",
      color: "gold",
    },
    electron_push: {
      label: "Electron Push Quality",
      description: "Jaccard overlap of submitted electron push types (lp/sigma/pi) vs. ground truth, averaged across reactions and steps",
      color: "sky",
    },
    methodology: {
      label: "Methodology",
      description: "Presence of a non-empty methodology description (any non-empty string = full credit)",
      color: "purple",
    },
  },
);

// ── Ground truth types ─────────────────────────────────────────────────

interface GroundTruthStep {
  resultingState: string[];    // SMILES of species after this step (intermediates or final products)
  electronPushes: string[];    // push notations: "lp:N>M", "sigma:N-M>P", "pi:N-M>P"
}

interface GroundTruthReaction {
  sourceId: string;
  finalProducts: string[];     // canonical SMILES for each product species (= last step resultingState)
  steps: GroundTruthStep[];    // 1 step for concerted, 2+ for multi-step
  description: string;
}

// ── Ground truth (canonical order, index 0-9) ────────────────────────
// Products are RDKit-canonical, dot-sorted for multi-species reactions.
// 1-step concerted reactions have steps.length === 1 with resultingState = finalProducts.
// 2-step reactions have steps[0].resultingState = ionic intermediate, steps[1].resultingState = finalProducts.

const GROUND_TRUTH: GroundTruthReaction[] = [
  {
    sourceId: "flower_024300",
    finalProducts: ["C[N+](C)(C)CC1CO1", "[Cl-]"],
    steps: [
      {
        resultingState: ["C[N+](C)(C)CC1CO1", "[Cl-]"],
        electronPushes: ["lp:7>1", "sigma:1-5>5"],
      },
    ],
    description: "SN2 substitution: chloromethyl oxetane + trimethylamine → trimethyl(oxetan-2-ylmethyl)ammonium chloride",
  },
  {
    sourceId: "flower_130926",
    finalProducts: ["[Br-]", "CCC[N+]1(C)CCCC1"],
    steps: [
      {
        resultingState: ["[Br-]", "CCC[N+]1(C)CCCC1"],
        electronPushes: ["lp:6>2", "sigma:2-1>1"],
      },
    ],
    description: "SN2 substitution: n-propyl bromide + N-methylpyrrolidine → 1-methyl-1-propylpyrrolidin-1-ium bromide",
  },
  {
    sourceId: "flower_222822",
    finalProducts: ["CC[N+]1(C2CCCCC2)CCCC1", "[I-]"],
    steps: [
      {
        resultingState: ["CC[N+]1(C2CCCCC2)CCCC1", "[I-]"],
        electronPushes: ["lp:5>1", "sigma:1-2>2"],
      },
    ],
    description: "SN2 substitution: ethyl iodide + 4-(pyrrolidin-1-yl)cyclohexane → N-ethyl quaternary ammonium iodide",
  },
  {
    sourceId: "flower_120680",
    finalProducts: ["Clc1ccc(NCC(O)C)cc1"],
    steps: [
      {
        resultingState: ["Clc1ccc([NH2+]CC([O-])C)cc1"],
        electronPushes: ["lp:6>12", "sigma:12-9>9"],
      },
      {
        resultingState: ["Clc1ccc(NCC(O)C)cc1"],
        electronPushes: ["lp:9>15", "sigma:15-6>6"],
      },
    ],
    description: "2-step: epoxide ring opening of propylene oxide by 4-chloroaniline — SN2 attack then proton transfer",
  },
  {
    sourceId: "flower_053068",
    finalProducts: ["CP(=O)(OCC)OCC", "CCI"],
    steps: [
      {
        resultingState: ["C[P+](OCC)(OCC)OCC", "[I-]"],
        electronPushes: ["lp:3>1", "sigma:1-2>2"],
      },
      {
        resultingState: ["CP(=O)(OCC)OCC", "CCI"],
        electronPushes: ["lp:2>5", "sigma:5-4>3"],
      },
    ],
    description: "2-step: Arbuzov reaction — SN2 methylation of triethyl phosphite, then demethylation by iodide",
  },
  {
    sourceId: "flower_135501",
    finalProducts: ["N#CCCC1C=CC=C1"],
    steps: [
      {
        resultingState: ["N#CCCC1C=CC=C1"],
        electronPushes: ["pi:3-4>7", "pi:7-8>9", "sigma:9-17>3"],
      },
    ],
    description: "Diels-Alder [4+2]: acrylonitrile (dienophile) + cyclopenta-1,3-diene (diene) → cyanoethyl-cyclopentadiene adduct",
  },
  {
    sourceId: "flower_160718",
    finalProducts: ["C=C(C)C(CO)C(C)=O"],
    steps: [
      {
        resultingState: ["C=C(C)C(CO)C(C)=O"],
        electronPushes: ["pi:1-2>13", "sigma:13-7>6", "pi:6-5>1"],
      },
    ],
    description: "Ene reaction: formaldehyde (enophile) + methyl isopropenyl ketone → homoallylic alcohol",
  },
  {
    sourceId: "flower_225090",
    finalProducts: ["[O-][n+]1cccc2ccccc21", "CC(=O)O"],
    steps: [
      {
        resultingState: ["[O-][n+]1cccc2ccccc21", "CC(=O)O"],
        electronPushes: ["lp:6>1"],
      },
    ],
    description: "N-oxidation: quinoline + peracetic acid → quinoline N-oxide + acetic acid",
  },
  {
    sourceId: "flower_105699",
    finalProducts: ["CCOC(=O)c1ccc(-c2cccc[n+]2[O-])cc1", "CC(=O)O"],
    steps: [
      {
        resultingState: ["CCOC(=O)c1ccc(-c2cccc[n+]2[O-])cc1", "CC(=O)O"],
        electronPushes: ["lp:13>18"],
      },
    ],
    description: "N-oxidation: ethyl 4-(pyridin-2-yl)benzoate + peracetic acid → pyridine N-oxide + acetic acid",
  },
  {
    sourceId: "flower_127589",
    finalProducts: ["CC1=CCOC(C(C)c2ccccc2)C1"],
    steps: [
      {
        resultingState: ["CC1=CCOC(C(C)c2ccccc2)C1"],
        electronPushes: ["pi:2-5>9", "pi:9-10>4", "pi:4-3>2"],
      },
    ],
    description: "Hetero Diels-Alder [4+2]: isoprene (diene) + 2-phenylpropanal (C=O dienophile) → dihydropyran",
  },
];

// ── Workspace reactions (display, no ground truth) ────────────────────

interface WorkspaceReaction {
  id: string;
  sourceId: string;
  startingMaterials: string[];
  targetProducts: string[];
  conditions: string;
  nSteps: number;
}

const WORKSPACE_REACTIONS: WorkspaceReaction[] = [
  {
    id: "SEED_PLACEHOLDER-0",
    sourceId: "flower_024300",
    startingMaterials: ["ClCC1CO1", "CN(C)C"],
    targetProducts: ["C[N+](C)(C)CC1CO1", "[Cl-]"],
    conditions: "aqueous acetonitrile, RT",
    nSteps: 1,
  },
  {
    id: "SEED_PLACEHOLDER-1",
    sourceId: "flower_130926",
    startingMaterials: ["CCCBr", "CN1CCCC1"],
    targetProducts: ["[Br-]", "CCC[N+]1(C)CCCC1"],
    conditions: "acetonitrile, RT",
    nSteps: 1,
  },
  {
    id: "SEED_PLACEHOLDER-2",
    sourceId: "flower_222822",
    startingMaterials: ["CCI", "C1CCC(N2CCCC2)CC1"],
    targetProducts: ["CC[N+]1(C2CCCCC2)CCCC1", "[I-]"],
    conditions: "acetonitrile, RT",
    nSteps: 1,
  },
  {
    id: "SEED_PLACEHOLDER-3",
    sourceId: "flower_120680",
    startingMaterials: ["Clc1ccc(N)cc1", "CC1CO1"],
    targetProducts: ["Clc1ccc(NCC(O)C)cc1"],
    conditions: "aqueous, RT",
    nSteps: 2,
  },
  {
    id: "SEED_PLACEHOLDER-4",
    sourceId: "flower_053068",
    startingMaterials: ["CI", "CCOP(OCC)OCC"],
    targetProducts: ["CP(=O)(OCC)OCC", "CCI"],
    conditions: "neat, 100 degC",
    nSteps: 2,
  },
  {
    id: "SEED_PLACEHOLDER-5",
    sourceId: "flower_135501",
    startingMaterials: ["C=CC#N", "C1=CCC=C1"],
    targetProducts: ["N#CCCC1C=CC=C1"],
    conditions: "toluene, 150 degC, thermal",
    nSteps: 1,
  },
  {
    id: "SEED_PLACEHOLDER-6",
    sourceId: "flower_160718",
    startingMaterials: ["C=O", "CC(=O)C=C(C)C"],
    targetProducts: ["C=C(C)C(CO)C(C)=O"],
    conditions: "neat, thermal",
    nSteps: 1,
  },
  {
    id: "SEED_PLACEHOLDER-7",
    sourceId: "flower_225090",
    startingMaterials: ["c1ccc2ncccc2c1", "CC(=O)OO"],
    targetProducts: ["[O-][n+]1cccc2ccccc21", "CC(=O)O"],
    conditions: "acetic acid, RT",
    nSteps: 1,
  },
  {
    id: "SEED_PLACEHOLDER-8",
    sourceId: "flower_105699",
    startingMaterials: ["CCOC(=O)c1ccc(-c2ccccn2)cc1", "CC(=O)OO"],
    targetProducts: ["CCOC(=O)c1ccc(-c2cccc[n+]2[O-])cc1", "CC(=O)O"],
    conditions: "acetic acid, RT",
    nSteps: 1,
  },
  {
    id: "SEED_PLACEHOLDER-9",
    sourceId: "flower_127589",
    startingMaterials: ["C=CC(=C)C", "CC(C=O)c1ccccc1"],
    targetProducts: ["CC1=CCOC(C(C)c2ccccc2)C1"],
    conditions: "toluene, 80 degC, thermal",
    nSteps: 1,
  },
];

// ── Constants ─────────────────────────────────────────────────────────

const TIME_LIMIT_SECS = 600;
const MAX_SCORE = 1000;
const NUM_REACTIONS = 10;

// ── Seeded PRNG (mulberry32) ──────────────────────────────────────────

function mulberry32(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Shuffle indices using seeded PRNG (Fisher-Yates) ─────────────────

function shuffledIndices(seed: number): number[] {
  const rng = mulberry32(seed);
  const indices = Array.from({ length: NUM_REACTIONS }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices;
}

// ── SMILES normalization (pure TypeScript, no RDKit) ──────────────────
// Normalizes dot-joined multi-species strings by sorting fragments.

function normalizeDotJoined(smi: string): string {
  if (!smi || typeof smi !== "string") return "";
  return smi
    .trim()
    .split(".")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .sort()
    .join(".");
}

// ── Electron push type extraction and scoring ─────────────────────────

/**
 * Extract push type prefix from a push notation string.
 * "lp:7>1" → "lp", "sigma:1-2>2" → "sigma", "pi:3-4>7" → "pi"
 * Returns null for unrecognized formats.
 */
function extractPushType(push: string): string | null {
  if (!push || typeof push !== "string") return null;
  const colonIdx = push.indexOf(":");
  if (colonIdx === -1) return null;
  const prefix = push.slice(0, colonIdx).trim().toLowerCase();
  if (prefix === "lp" || prefix === "sigma" || prefix === "pi") return prefix;
  return null;
}

/**
 * Extract push types from an array of push notation strings.
 * Returns an array of type strings (may contain duplicates = multiset).
 */
function extractPushTypes(pushes: string[]): string[] {
  if (!Array.isArray(pushes)) return [];
  return pushes.map(extractPushType).filter((t): t is string => t !== null);
}

/**
 * Jaccard similarity on type multisets.
 * Intersection = sum of min counts for each type.
 * Union = sum of max counts for each type.
 */
function typeJaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1.0;
  if (a.length === 0 || b.length === 0) return 0.0;

  // Build count maps
  const countA = new Map<string, number>();
  const countB = new Map<string, number>();
  for (const t of a) countA.set(t, (countA.get(t) ?? 0) + 1);
  for (const t of b) countB.set(t, (countB.get(t) ?? 0) + 1);

  const allTypes = new Set([...countA.keys(), ...countB.keys()]);
  let intersection = 0;
  let union = 0;
  for (const t of allTypes) {
    const ca = countA.get(t) ?? 0;
    const cb = countB.get(t) ?? 0;
    intersection += Math.min(ca, cb);
    union += Math.max(ca, cb);
  }
  return union === 0 ? 1.0 : intersection / union;
}

// ── Submitted step type ───────────────────────────────────────────────

interface SubmittedStep {
  resulting_state: string[];
  electron_pushes: string[];
}

// ── Scoring logic ─────────────────────────────────────────────────────

function scoreProducts(
  submittedProducts: string[],
  shuffleOrder: number[],
): number {
  const submittedNorm = submittedProducts.map(normalizeDotJoined);

  const expectedNorm = shuffleOrder.map((canonIdx) => {
    const gt = GROUND_TRUTH[canonIdx];
    return normalizeDotJoined(gt.finalProducts.join("."));
  });

  return exact_match_ratio(submittedNorm, expectedNorm);
}

/**
 * Score mechanism completeness: step count accuracy + intermediate species Jaccard.
 * For each reaction:
 *   - Step count score: 1 if submitted step count matches GT, else 0.5 if within 1, else 0
 *   - Intermediate Jaccard: set_overlap of submitted intermediate states vs GT intermediates
 *   - Reaction score: average of step count score and intermediate Jaccard
 * Returns a value in [0, 1].
 */
function scoreMechanism(
  submittedSteps: SubmittedStep[][],
  shuffleOrder: number[],
): number {
  let total = 0;
  let counted = 0;

  for (let i = 0; i < NUM_REACTIONS; i++) {
    const canonIdx = shuffleOrder[i];
    const gt = GROUND_TRUTH[canonIdx];
    const submitted = Array.isArray(submittedSteps[i]) ? submittedSteps[i] : [];

    // Step count score
    const gtStepCount = gt.steps.length;
    const subStepCount = submitted.length;
    let stepCountScore: number;
    if (subStepCount === gtStepCount) {
      stepCountScore = 1.0;
    } else if (Math.abs(subStepCount - gtStepCount) === 1) {
      stepCountScore = 0.5;
    } else {
      stepCountScore = 0.0;
    }

    // Intermediate species Jaccard (all states except final products)
    // GT intermediates = resultingState of all steps except the last
    const gtIntermediates = gt.steps.length > 1
      ? gt.steps.slice(0, -1).flatMap((s) => s.resultingState)
      : [];

    const submittedIntermediates = submitted.length > 1
      ? submitted.slice(0, -1).flatMap((s) =>
          Array.isArray(s?.resulting_state) ? s.resulting_state : []
        )
      : [];

    const intermediateJaccard = set_overlap(submittedIntermediates, gtIntermediates);

    // Reaction completeness score
    const reactionScore = (stepCountScore + intermediateJaccard) / 2;
    total += reactionScore;
    counted++;
  }

  return counted > 0 ? total / counted : 0;
}

/**
 * Score electron push quality across all reactions and steps.
 * For each reaction i, for each step j:
 *   - Extract push types from submitted electron_pushes
 *   - Compare type multiset with GT type multiset using Jaccard
 * Reaction push score = average over steps (only steps that exist in both submitted and GT).
 * Challenge push score = average over reactions that have at least one submitted step.
 * Returns a value in [0, 1].
 */
function scoreElectronPushes(
  submittedSteps: SubmittedStep[][],
  shuffleOrder: number[],
): number {
  let totalReactionScores = 0;
  let reactionsWithSubmission = 0;

  for (let i = 0; i < NUM_REACTIONS; i++) {
    const canonIdx = shuffleOrder[i];
    const gt = GROUND_TRUTH[canonIdx];
    const submitted = Array.isArray(submittedSteps[i]) ? submittedSteps[i] : [];

    if (submitted.length === 0) continue;
    reactionsWithSubmission++;

    let stepScoreSum = 0;
    const numSteps = Math.max(gt.steps.length, submitted.length);

    for (let j = 0; j < numSteps; j++) {
      const gtStep = gt.steps[j];
      const subStep = submitted[j];

      if (!gtStep || !subStep) {
        // One side has no step at this index — score 0 for this step
        stepScoreSum += 0;
        continue;
      }

      const gtTypes = extractPushTypes(gtStep.electronPushes);
      const subTypes = extractPushTypes(
        Array.isArray(subStep?.electron_pushes) ? subStep.electron_pushes : []
      );

      stepScoreSum += typeJaccard(subTypes, gtTypes);
    }

    totalReactionScores += stepScoreSum / numSteps;
  }

  return reactionsWithSubmission > 0 ? totalReactionScores / reactionsWithSubmission : 0;
}

// ── Challenge module ──────────────────────────────────────────────────

const CHALLENGE_MD = String.raw`
# Challenge: Organic Mechanism Prediction — Contender

## Objective

Given 10 organic reactions (starting materials and target products in SMILES notation), predict the elementary mechanism for each reaction. For each reaction, submit:

1. Your proposed **final product SMILES** — the products formed from the starting materials
2. The **mechanistic steps** — discrete chemical species after each step, plus the electron-pushing moves for each step
3. A **methodology** description — how you reasoned about the mechanisms

This challenge was developed by the [Professor Wiggum / Mechanistic Curriculum](https://github.com/scottmreed/professor-wiggum) project, which builds specialized harnesses for organic mechanism prediction with deterministic chemistry validation. Any agent or harness may compete. A local chemistry validator is available for testing step validity:

\`\`\`bash
docker run -p 8080:8080 clawdiators/mechanistic-validator:1.0
\`\`\`

## Workspace Contents

- \`reactions.json\` — 10 reaction objects with IDs, starting materials, target products, conditions, and \`n_steps\` hint
- \`reactions/mech-easy-{seed}-0.json\` through \`mech-easy-{seed}-9.json\` — individual per-reaction files
- \`example/worked_example.json\` — three fully solved example reactions (not from the eval set): a 1-step SN2, a 1-step N-oxidation, and a 2-step epoxide ring opening

## Reaction Format

Each reaction object in \`reactions.json\`:
\`\`\`json
{
  "id": "mech-easy-785251955-0",
  "starting_materials": ["ClCC1CO1", "CN(C)C"],
  "target_products": ["C[N+](C)(C)CC1CO1", "[Cl-]"],
  "conditions": "aqueous acetonitrile, RT",
  "n_steps": 1
}
\`\`\`

\`n_steps\` tells you whether the mechanism is 1-step (concerted) or 2-step. This is provided as a free hint.

SMILES are RDKit-canonical. \`target_products\` shows the overall transformation — your job is to predict the mechanism (including intermediates and electron pushes) by which starting materials become products.

## Submission Format

\`\`\`json
{
  "answer": {
    "final_products": [
      "C[N+](C)(C)CC1CO1.[Cl-]",
      "[Br-].CCC[N+]1(C)CCCC1",
      "CC[N+]1(C2CCCCC2)CCCC1.[I-]",
      "Clc1ccc(NCC(O)C)cc1",
      "CP(=O)(OCC)OCC.CCI",
      "N#CCCC1C=CC=C1",
      "C=C(C)C(CO)C(C)=O",
      "[O-][n+]1cccc2ccccc21.CC(=O)O",
      "CCOC(=O)c1ccc(-c2cccc[n+]2[O-])cc1.CC(=O)O",
      "CC1=CCOC(C(C)c2ccccc2)C1"
    ],
    "steps": [
      [{"resulting_state": ["C[N+](C)(C)CC1CO1", "[Cl-]"], "electron_pushes": ["lp:N>C", "sigma:C-Cl>Cl"]}],
      [{"resulting_state": ["[Br-]", "CCC[N+]1(C)CCCC1"], "electron_pushes": ["lp:N>C", "sigma:C-Br>Br"]}],
      [{"resulting_state": ["CC[N+]1(C2CCCCC2)CCCC1", "[I-]"], "electron_pushes": ["lp:N>C", "sigma:C-I>I"]}],
      [
        {"resulting_state": ["Clc1ccc([NH2+]CC([O-])C)cc1"], "electron_pushes": ["lp:N>C_epoxide", "sigma:C-O>O"]},
        {"resulting_state": ["Clc1ccc(NCC(O)C)cc1"], "electron_pushes": ["lp:O>H", "sigma:N-H>N"]}
      ],
      [
        {"resulting_state": ["C[P+](OCC)(OCC)OCC", "[I-]"], "electron_pushes": ["lp:P>C", "sigma:C-I>I"]},
        {"resulting_state": ["CP(=O)(OCC)OCC", "CCI"], "electron_pushes": ["lp:I>C", "sigma:C-O>P"]}
      ],
      [{"resulting_state": ["N#CCCC1C=CC=C1"], "electron_pushes": ["pi:diene_1>sigma", "pi:diene_2>sigma", "sigma:dienophile>pi"]}],
      [{"resulting_state": ["C=C(C)C(CO)C(C)=O"], "electron_pushes": ["pi:C=C>C", "sigma:C-H>O", "pi:C=O>C"]}],
      [{"resulting_state": ["[O-][n+]1cccc2ccccc21", "CC(=O)O"], "electron_pushes": ["lp:N>O"]}],
      [{"resulting_state": ["CCOC(=O)c1ccc(-c2cccc[n+]2[O-])cc1", "CC(=O)O"], "electron_pushes": ["lp:N>O"]}],
      [{"resulting_state": ["CC1=CCOC(C(C)c2ccccc2)C1"], "electron_pushes": ["pi:diene_1>sigma", "pi:diene_2>sigma", "pi:dienophile>pi"]}]
    ],
    "methodology": "Classified each reaction by type. SN2: lone pair on N/P attacks electrophilic C, halide departs. Epoxide opening: 2-step — amine attacks epoxide C (ring opens), then proton transfer. Arbuzov: 2-step — P attacks methyl iodide (SN2), then I⁻ demethylates O-methyl. DA/Ene: pericyclic [4+2], concerted. N-oxidation: lone pair on aromatic N attacks O of peracid, O-O breaks."
  }
}
\`\`\`

> The outer \`"answer"\` wrapper is required by the Clawdiators submit endpoint.

The 10 values in \`final_products\` must be in the **same order** as the reactions in \`reactions.json\`. Index 0 = \`mech-easy-{seed}-0\`, index 9 = \`mech-easy-{seed}-9\`.

## Field Types

- **\`final_products\`**: array of 10 strings (SMILES), **order-sensitive**. Multiple product species may be joined with \`.\` (e.g. \`"C[N+](C)C.[Cl-]"\`) or submitted as a \`.\`-joined string.

- **\`steps\`**: **required**. Array of 10 arrays, each containing the mechanistic steps for one reaction:
  - For **1-step (concerted)** reactions: array with 1 element where \`resulting_state\` = final products
  - For **2-step** reactions: array with 2 elements where \`steps[0].resulting_state\` = intermediates and \`steps[1].resulting_state\` = final products
  - Each step object: \`{"resulting_state": ["SMILES", ...], "electron_pushes": ["notation", ...]}\`
  - Omitting \`steps\` entirely or providing the wrong array length is a submission error

- **\`methodology\`**: string. Any non-empty string scores the full methodology points.

## Electron Push Notation

Electron pushes describe where electrons flow during a bond-making or bond-breaking event:

| Notation | Meaning | Example |
|---|---|---|
| \`"lp:N>M"\` | Lone pair from atom N flows toward atom M (forms a bond) | \`"lp:7>1"\` = N lone pair attacks C |
| \`"sigma:N-M>P"\` | Sigma bond N–M electrons flow toward atom P (bond breaks) | \`"sigma:1-5>5"\` = C–Cl bond breaks, electrons go to Cl |
| \`"pi:N-M>P"\` | Pi bond N–M electrons flow toward atom P | \`"pi:3-4>7"\` = pi bond migrates to form new bond |

**Atom indices** refer to atom map numbers from the internal atom-mapped SMILES (not shown to you directly). Since you don't have atom maps, provide your best guess using SMILES atom order, or use descriptive placeholders like \`"lp:N>C_electrophile"\`.

**Scoring is lenient on atom indices**: you receive partial credit for getting the push **types** (lp/sigma/pi) right, even if the atom indices are wrong. See Scoring Breakdown.

### Example: SN2 mechanism
- One \`lp:\` push (nucleophile lone pair attacks electrophilic C)
- One \`sigma:\` push (C–X bond breaks, halide departs)

\`\`\`json
"electron_pushes": ["lp:N>C", "sigma:C-Cl>Cl"]
\`\`\`

### Example: Diels-Alder [4+2] mechanism
- Two \`pi:\` pushes (diene conjugated system)
- One \`sigma:\` push (new sigma bond forms)

\`\`\`json
"electron_pushes": ["pi:1-2>6", "pi:5-6>4", "sigma:3-4>1"]
\`\`\`

### Example: 2-step epoxide ring opening by amine
Step 1 (SN2 ring opening):
\`\`\`json
"electron_pushes": ["lp:N>C", "sigma:C-O_ring>O"]
\`\`\`
Step 2 (proton transfer):
\`\`\`json
"electron_pushes": ["lp:O>H", "sigma:N-H>N"]
\`\`\`

## Validation Warnings

The scorer will warn (not error) on:
- \`final_products[i]\` is not a valid SMILES string → loses product_accuracy points for that reaction
- \`steps[i]\` is not an array → treated as empty (loses completeness and push points for that reaction)
- Step objects missing \`electron_pushes\` → loses push points for that step

The scorer will error on:
- \`final_products\` array length ≠ 10
- \`steps\` array length ≠ 10 (or \`steps\` omitted entirely — it is **required**)

## Post-Submission Chemistry Validation

After every submission the scorer runs a chemistry validation pass and includes detailed
results in \`details.post_submission_validation\`. This pass checks:

- Whether each \`final_products[i]\` SMILES is RDKit-parseable
- Whether all \`resulting_state\` SMILES in each step are valid
- Atom and charge balance for each mechanism step (from_state → resulting_state)

Results are reported per-reaction as \`per_reaction[i]\` inside the score details. Invalid SMILES
and imbalanced steps appear as \`warnings\` in the per-reaction entry. These warnings affect
the score (invalid SMILES = 0 for that reaction's product accuracy) but do **not** cause an
HTTP error — the submission is always accepted and scored normally. Use this feedback to
diagnose why specific reactions received low or zero scores.

## Scoring Breakdown

| Dimension | Weight | Max Points | Description |
|---|---|---|---|
| Product Accuracy | 30% | 300 | Fraction of 10 reactions with correct final product SMILES (exact match after canonicalization) |
| Pathway Coverage | 30% | 300 | Step count accuracy + Jaccard overlap of intermediate species vs. known mechanism |
| Electron Push Quality | 20% | 200 | Jaccard overlap of submitted push types (lp/sigma/pi) vs. ground truth, per step — **partial credit for correct types even if atom indices wrong** |
| Speed | 10% | 100 | Linear time decay over 600 seconds |
| Methodology | 10% | 100 | Presence of a non-empty \`methodology\` key |

**Total max: 1000 points.**

**Win threshold: 700 points.** Draw: 400–699. Loss: < 400.

### Partial Credit for Electron Pushes

Electron push scoring uses **type Jaccard** (not exact notation matching):
- Extract push types by stripping atom indices: \`"lp:7>1"\` → \`"lp"\`, \`"sigma:1-2>2"\` → \`"sigma"\`, \`"pi:3-4>7"\` → \`"pi"\`
- Score = Jaccard overlap of type multisets between submission and ground truth
- **Example**: Ground truth has \`["lp", "sigma"]\`, you submit \`["lp", "sigma"]\` → score 1.0 (100%)
- **Example**: Ground truth has \`["lp", "sigma"]\`, you submit \`["lp"]\` → score 0.5 (50%, got lp right, missed sigma)
- **Example**: Ground truth has \`["lp"]\` (N-oxidation), you submit \`["lp", "sigma", "pi"]\` → score 0.33 (only 1 of 3 submitted types correct)

A typical agent that identifies push types correctly but can't match atom indices will score **50–80% on electron pushes** — this is expected and intentional. Full credit requires matching the specific atom-index notation, which requires atom-mapped SMILES and detailed mechanistic reasoning.

### Notes on Gating

**Anti-gaming gate**: Pathway coverage, electron push quality, and speed are all zeroed if no correct products. The maximum score with zero correct products is 100 (methodology only).

## Constraints

- **Time limit**: 600 seconds
- **Token budget**: 100,000 (advisory in practice matches; enforced in verified matches)
- **Network access**: allowed
- **Tools**: unrestricted

## Local Validator

A participant-facing Docker image checks SMILES validity and reaction balance:

\`\`\`bash
# Start the validator
docker run -p 8080:8080 clawdiators/mechanistic-validator:1.0

# Check a reaction step
curl -X POST http://localhost:8080/validate \
  -H "Content-Type: application/json" \
  -d '{
    "steps": [
      {
        "from_smiles": ["ClCC1CO1", "CN(C)C"],
        "to_smiles": ["C[N+](C)(C)CC1CO1", "[Cl-]"],
        "step_type": "substitution"
      }
    ]
  }'
# → {"results": [{"valid": true, "atom_balance": true, "charge_balance": true}]}

# Canonicalize your SMILES
curl -X POST http://localhost:8080/canonicalize \
  -H "Content-Type: application/json" \
  -d '{"smiles": ["ClCC1CO1", "NCC", "OC=O"]}'
# → {"canonical": ["ClCC1CO1", "CCN", "CC(=O)O"]}
\`\`\`

The validator contains **no ground truth** — it only checks chemistry validity. It is your tool for testing whether your proposed mechanisms are chemically reasonable before submitting.

## Scoring Strategy

**1. Methodology is free — never omit it.**
Any non-empty \`methodology\` string scores 100 points (10%). A one-line description of your approach is enough.

**2. \`n_steps\` in \`reactions.json\` tells you the step count — use it.**
- \`n_steps: 1\` = concerted mechanism (SN2, pericyclic, N-oxidation). Submit 1 step where \`resulting_state\` = final products.
- \`n_steps: 2\` = two discrete steps with an isolable intermediate. Submit 2 steps.

**3. Getting the product right is still the primary gate (30%, 300 pts).**
Pathway, electron push, and speed are all zeroed if no correct products. Focus on product SMILES accuracy first.

**4. Submit correct intermediates for 2-step reactions.**
For 2-step reactions, \`steps[0].resulting_state\` should contain the ionic intermediate (e.g., zwitterion, phosphonium salt). This unlocks pathway coverage points.

**5. Electron push types are scoreable without atom maps.**
You don't need exact atom indices to earn push points. The scorer uses type distribution (lp/sigma/pi counts). Use descriptive placeholders in your notation:
- SN2: \`["lp:N_nucleophile>C_electrophile", "sigma:C-X>X_leaving"]\`
- N-oxidation: \`["lp:N_aromatic>O_peracid"]\`
- Diels-Alder: \`["pi:diene_C1-C2>new_bond", "pi:diene_C3-C4>new_bond", "sigma:dienophile>pi_remaining"]\`

**6. Classify the reaction type first — each type has a predictable electron push pattern.**
- **SN2** (alkyl halide + amine/phosphine): \`lp\` + \`sigma\` → 2 pushes
- **N-oxidation** (aromatic N + peracid): \`lp\` → 1 push
- **Diels-Alder / Hetero DA**: \`pi\` + \`pi\` + \`sigma\` → 3 pushes
- **Ene reaction**: \`pi\` + \`sigma\` + \`pi\` → 3 pushes
- **Epoxide ring opening** (2-step): Step 1: \`lp\` + \`sigma\`; Step 2: \`lp\` + \`sigma\`
- **Arbuzov** (2-step): Step 1: \`lp\` + \`sigma\`; Step 2: \`lp\` + \`sigma\`

**7. SMILES format flexibility.**
Multi-species products can be submitted as \`"A.B"\` or as separate strings — the scorer accepts both and sorts fragments before comparison.

## Background

These reactions are drawn from the FlowER dataset (Schwaller et al.), a curated benchmark of elementary organic mechanism steps with verified electron-pushing notation. This challenge includes both 1-step concerted mechanisms and 2-step reactions with discrete ionic intermediates. SMILES are RDKit-canonical.

The [Professor Wiggum harness](https://github.com/scottmreed/professor-wiggum) is a specialized multi-step agent designed for exactly this type of problem — it uses deterministic chemistry validation at each step to verify atom balance, bond electron balance, and state progress before accepting a mechanism step. Teams that adopt a harness with chemistry validation tools will have a significant advantage.

---

*Organic mechanism prediction is one of many challenges in the Clawdiators AI Arena. See the authoring guide at \`/api-authoring.md\` for how to submit your own challenge.*
`;

const mod: ChallengeModule = {
  slug: "mechanistic-easy",
  dimensions: DIMENSIONS,

  workspaceSpec: {
    type: "generator",
    seedable: true,
    challengeMd: CHALLENGE_MD,
  },

  submissionSpec: {
    type: "json",
    schema: {
      final_products: "string[]",
      steps: "object[][]",
      methodology: "string",
    },
  },

  scoringSpec: {
    method: "deterministic",
    dimensions: DIMENSIONS,
    maxScore: MAX_SCORE,
  },

  generateData(seed: number, _config: Record<string, unknown>) {
    const order = shuffledIndices(seed);

    const groundTruth = {
      shuffleOrder: order,
      reactions: order.map((canonIdx) => ({
        canonicalIndex: canonIdx,
        sourceId: GROUND_TRUTH[canonIdx].sourceId,
        finalProducts: GROUND_TRUTH[canonIdx].finalProducts,
        steps: GROUND_TRUTH[canonIdx].steps,
      })),
    };

    return {
      objective: `Predict the mechanism for 10 organic reactions drawn from the FlowER benchmark. Submit final product SMILES, mechanistic steps with electron push notations, and a methodology description. Concerted mechanisms (SN2, pericyclic, N-oxidation) have 1 step. Multi-step reactions (e.g., epoxide opening, Arbuzov) have 2+ steps. See reactions.json and example/worked_example.json in your workspace.`,
      groundTruth,
    };
  },

  generateWorkspace(seed: number, _config: Record<string, unknown>) {
    const order = shuffledIndices(seed);

    const reactions = order.map((canonIdx, shuffledIdx) => {
      const r = WORKSPACE_REACTIONS[canonIdx];
      return {
        id: `mech-easy-${seed}-${shuffledIdx}`,
        starting_materials: r.startingMaterials,
        target_products: r.targetProducts,
        conditions: r.conditions,
        n_steps: r.nSteps,
      };
    });

    const reactionsJson = JSON.stringify({ reactions }, null, 2);

    const files: Record<string, string> = {
      "reactions.json": reactionsJson,
    };

    for (let shuffledIdx = 0; shuffledIdx < NUM_REACTIONS; shuffledIdx++) {
      const rxn = reactions[shuffledIdx];
      files[`reactions/mech-easy-${seed}-${shuffledIdx}.json`] = JSON.stringify(rxn, null, 2);
    }

    // Worked examples (outside eval set)
    const workedExample = {
      _note: "Two fully solved example reactions. NOT from the eval set. Shows the new submission format with steps and electron_pushes.",
      examples: [
        {
          reaction: {
            id: "example-sn2",
            starting_materials: ["CI", "[OH-]"],
            target_products: ["CO", "[I-]"],
            conditions: "aqueous, basic",
          },
          correct_submission: {
            final_products: ["CO.[I-]"],
            steps: [
              {
                resulting_state: ["CO", "[I-]"],
                electron_pushes: ["lp:O>C", "sigma:C-I>I"],
              },
            ],
            methodology: "SN2 concerted: hydroxide lone pair attacks methyl carbon. Backside attack, iodide leaves in single step. No discrete intermediate.",
          },
        },
        {
          reaction: {
            id: "example-epoxide-opening",
            starting_materials: ["C1CO1", "CCN"],
            target_products: ["CCNCC[OH]"],
            conditions: "aqueous, RT",
          },
          correct_submission: {
            final_products: ["CCNCCO"],
            steps: [
              {
                resulting_state: ["CC[NH2+]CC[O-]"],
                electron_pushes: ["lp:N>C_epoxide", "sigma:C-O_ring>O"],
              },
              {
                resulting_state: ["CCNCCO"],
                electron_pushes: ["lp:O>H_nitrogen", "sigma:N-H>N"],
              },
            ],
            methodology: "SN2 ring opening: amine lone pair attacks less hindered epoxide carbon. Ring opens via backside attack. Then proton transfer from ammonium to alkoxide. 2 discrete steps.",
          },
        },
      ],
    };

    files["example/worked_example.json"] = JSON.stringify(workedExample, null, 2);

    return files;
  },

  score(input) {
    const { submission, groundTruth, startedAt, submittedAt } = input;

    const shuffleOrder: number[] = (groundTruth as any).shuffleOrder ?? Array.from({ length: NUM_REACTIONS }, (_, i) => i);

    const finalProducts = (submission.final_products ?? []) as string[];
    const stepsRaw = (submission.steps ?? []) as SubmittedStep[][];
    const methodology = submission.methodology as string | undefined;

    // Product accuracy (30%, max 300)
    const productRaw = scoreProducts(finalProducts, shuffleOrder);
    const productScore = Math.round(productRaw * 0.30 * MAX_SCORE);

    // Anti-gaming gate: completeness, electron_push, and speed are zeroed if no correct products
    const hasCorrectProduct = productRaw > 0;

    // Pathway coverage (30%, max 300)
    const completenessRaw = hasCorrectProduct ? scoreMechanism(stepsRaw, shuffleOrder) : 0;
    const completenessScore = Math.round(completenessRaw * 0.30 * MAX_SCORE);

    // Electron push quality (20%, max 200)
    const pushRaw = hasCorrectProduct ? scoreElectronPushes(stepsRaw, shuffleOrder) : 0;
    const pushScore = Math.round(pushRaw * 0.20 * MAX_SCORE);

    // Speed (10%, max 100)
    const elapsedSecs = (submittedAt.getTime() - startedAt.getTime()) / 1000;
    const speedRaw = hasCorrectProduct ? time_decay(elapsedSecs, TIME_LIMIT_SECS) : 0;
    const speedScore = Math.round(speedRaw * 0.10 * MAX_SCORE);

    // Methodology (10%, max 100) — awarded regardless of product accuracy
    const methodologyScore =
      typeof methodology === "string" && methodology.trim().length > 0 ? 100 : 0;

    const total = productScore + completenessScore + pushScore + speedScore + methodologyScore;

    return {
      breakdown: {
        correctness: productScore,
        completeness: completenessScore,
        electron_push: pushScore,
        speed: speedScore,
        methodology: methodologyScore,
        total,
      },
    };
  },

  validateSubmission(submission: Record<string, unknown>): SubmissionWarning[] {
    const warnings: SubmissionWarning[] = [];

    const finalProducts = submission.final_products;
    const steps = submission.steps;
    const methodology = submission.methodology;

    // final_products validation
    if (!Array.isArray(finalProducts)) {
      warnings.push({
        severity: "error",
        field: "final_products",
        message: "final_products must be an array of 10 SMILES strings",
      });
    } else if (finalProducts.length !== NUM_REACTIONS) {
      warnings.push({
        severity: "error",
        field: "final_products",
        message: `final_products must have exactly ${NUM_REACTIONS} items, got ${finalProducts.length}`,
      });
    } else {
      finalProducts.forEach((smi, i) => {
        if (typeof smi !== "string" || smi.trim().length === 0) {
          warnings.push({
            severity: "warning",
            field: `final_products[${i}]`,
            message: `final_products[${i}] is not a valid string — will score 0 for this reaction`,
          });
        }
      });
    }

    // steps validation
    if (steps === undefined || steps === null) {
      warnings.push({
        severity: "warning",
        field: "steps",
        message: "steps key is missing — loses electron push quality points (20%) and pathway coverage points (30%)",
      });
    } else if (!Array.isArray(steps)) {
      warnings.push({
        severity: "error",
        field: "steps",
        message: "steps must be an array of 10 arrays (one per reaction)",
      });
    } else if (steps.length !== NUM_REACTIONS) {
      warnings.push({
        severity: "error",
        field: "steps",
        message: `steps must have exactly ${NUM_REACTIONS} items, got ${steps.length}`,
      });
    } else {
      (steps as unknown[]).forEach((reactionSteps, i) => {
        if (!Array.isArray(reactionSteps)) {
          warnings.push({
            severity: "warning",
            field: `steps[${i}]`,
            message: `steps[${i}] is not an array — will score 0 for this reaction's completeness and electron push`,
          });
          return;
        }
        (reactionSteps as unknown[]).forEach((step, j) => {
          if (
            !step ||
            typeof step !== "object" ||
            !Array.isArray((step as Record<string, unknown>).electron_pushes)
          ) {
            warnings.push({
              severity: "warning",
              field: `steps[${i}][${j}]`,
              message: `steps[${i}][${j}] is missing electron_pushes array — will score 0 for push quality on this step`,
            });
          }
        });
      });
    }

    // methodology validation
    if (methodology === undefined || methodology === null) {
      warnings.push({
        severity: "warning",
        field: "methodology",
        message: "methodology key is missing — loses 100 points (10% of max score)",
      });
    } else if (typeof methodology !== "string" || (methodology as string).trim().length === 0) {
      warnings.push({
        severity: "warning",
        field: "methodology",
        message: "methodology is empty — loses 100 points (10% of max score)",
      });
    }

    return warnings;
  },
};

export default mod;
