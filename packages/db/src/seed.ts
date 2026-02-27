import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { challenges } from "./schema/index.js";
import {
  CIPHER_FORGE_DIMENSIONS,
  LOGIC_REEF_DIMENSIONS,
  REEF_REFACTOR_DIMENSIONS,
  DEPTH_FIRST_GEN_DIMENSIONS,
  ARCHIVE_DIVE_DIMENSIONS,
  CONTRACT_REVIEW_DIMENSIONS,
  CHART_FORENSICS_DIMENSIONS,
  CARTOGRAPHERS_EYE_DIMENSIONS,
  BLUEPRINT_AUDIT_DIMENSIONS,
  ADVERSARIAL_INTERVIEW_DIMENSIONS,
  THE_MIRAGE_DIMENSIONS,
  DEEP_MAPPING_DIMENSIONS,
  CODEBASE_ARCHAEOLOGY_DIMENSIONS,
  NEEDLE_HAYSTACK_DIMENSIONS,
  PERFORMANCE_OPTIMIZER_DIMENSIONS,
} from "@clawdiators/shared";

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://clawdiators:clawdiators@localhost:5432/clawdiators";

const client = postgres(connectionString, { max: 1 });
const db = drizzle(client);

async function main() {
  console.log("Seeding database...");

  // ── 1. Cipher Forge (reasoning, contender, workspace) ─────────────
  await db
    .insert(challenges)
    .values({
      slug: "cipher-forge",
      name: "The Cipher Forge",
      description:
        "Five encrypted messages with progressively harder ciphers. From Caesar to combined encryption — decrypt them all before time runs out.",
      lore: "The Forge burns eternal beneath the reef. Within it, messages are hammered into encrypted steel — each harder than the last. Caesar was merely the first layer. Only those who master substitution, Vigenere, transposition, and the dreaded combined cipher will read what the Forge conceals.",
      category: "reasoning",
      difficulty: "contender",
      matchType: "single",
      timeLimitSecs: 120,
      maxScore: 1000,
      scoringDimensions: CIPHER_FORGE_DIMENSIONS,
      sandboxApis: [],
      config: {},
      active: true,
      workspaceType: "generator",
      submissionType: "json",
      scoringMethod: "deterministic",
    })
    .onConflictDoNothing();

  // ── 2. Logic Reef (reasoning, veteran, workspace) ─────────────────
  await db
    .insert(challenges)
    .values({
      slug: "logic-reef",
      name: "The Logic Reef",
      description:
        "Propositional logic and constraint satisfaction puzzles. Prove your conclusions with minimal steps — validity and elegance both matter.",
      lore: "The Logic Reef grows in fractal patterns that only the logically gifted can parse. Each coral formation encodes a puzzle — some demand deduction, others constraint satisfaction. The reef rewards those who think in the fewest steps, for in these waters, minimality is beauty.",
      category: "reasoning",
      difficulty: "veteran",
      matchType: "single",
      timeLimitSecs: 180,
      maxScore: 1000,
      scoringDimensions: LOGIC_REEF_DIMENSIONS,
      sandboxApis: [],
      config: {},
      active: true,
      workspaceType: "generator",
      submissionType: "json",
      scoringMethod: "deterministic",
    })
    .onConflictDoNothing();

  // ── 3. Reef Refactor (coding, contender, workspace) ───────────────
  await db
    .insert(challenges)
    .values({
      slug: "reef-refactor",
      name: "The Reef Refactor",
      description:
        "Five broken functions, each with a known bug and test cases. Determine the correct output for each test case — no code execution needed, just analysis.",
      lore: "The Reef Refactor is where code goes to be tested. Broken functions wash up on shore with their bugs visible to all — but fixing them requires understanding what the correct behavior should be. The arena scores not your patches, but your comprehension.",
      category: "coding",
      difficulty: "contender",
      matchType: "single",
      timeLimitSecs: 120,
      maxScore: 1000,
      scoringDimensions: REEF_REFACTOR_DIMENSIONS,
      sandboxApis: [],
      config: {},
      active: true,
      workspaceType: "generator",
      submissionType: "json",
      scoringMethod: "deterministic",
    })
    .onConflictDoNothing();

  // ── 4. Depth-First Generation (coding, veteran, workspace) ────────
  await db
    .insert(challenges)
    .values({
      slug: "depth-first-gen",
      name: "Depth-First Generation",
      description:
        "Receive a code spec and examples. Solve 20 hidden test cases by submitting outputs only — no execution, pure reasoning.",
      lore: "The arena presents a specification, three worked examples, and twenty blank test cases. No compiler. No debugger. Just your understanding of the pattern. The Depth-First Generation separates those who can reason about code from those who merely run it.",
      category: "coding",
      difficulty: "veteran",
      matchType: "single",
      timeLimitSecs: 180,
      maxScore: 1000,
      scoringDimensions: DEPTH_FIRST_GEN_DIMENSIONS,
      sandboxApis: [],
      config: {},
      active: true,
      workspaceType: "generator",
      submissionType: "json",
      scoringMethod: "deterministic",
    })
    .onConflictDoNothing();

  // ── 5. Archive Dive (context, veteran, workspace) ─────────────────
  await db
    .insert(challenges)
    .values({
      slug: "archive-dive",
      name: "The Archive Dive",
      description:
        "A corpus of 60-80 pages across 10 documents. Five cross-document synthesis questions require deep reading and cross-referencing.",
      lore: "The Archive is vast and its pages are numbered but not summarized. Ten documents tell fragments of a larger story — trade agreements, natural disasters, political upheavals. The questions demand synthesis across sources. Only those who read between the documents will surface with answers.",
      category: "context",
      difficulty: "veteran",
      matchType: "single",
      timeLimitSecs: 300,
      maxScore: 1000,
      scoringDimensions: ARCHIVE_DIVE_DIMENSIONS,
      sandboxApis: [],
      config: {},
      active: true,
      workspaceType: "generator",
      submissionType: "json",
      scoringMethod: "deterministic",
    })
    .onConflictDoNothing();

  // ── 6. Contract Review (context, legendary, workspace) ────────────
  await db
    .insert(challenges)
    .values({
      slug: "contract-review",
      name: "The Contract Review",
      description:
        "A 30-section fictional contract with planted issues: inconsistencies, undefined terms, contradictions, missing cross-references. Find them all.",
      lore: "The Abyssal Trade Agreement was drafted by committee and it shows. Thirty sections of legal text hide inconsistencies, undefined terms, and outright contradictions. The arena's best legal minds have tried and failed to find them all. Your turn.",
      category: "context",
      difficulty: "legendary",
      matchType: "single",
      timeLimitSecs: 300,
      maxScore: 1000,
      scoringDimensions: CONTRACT_REVIEW_DIMENSIONS,
      sandboxApis: [],
      config: {},
      active: true,
      workspaceType: "generator",
      submissionType: "json",
      scoringMethod: "deterministic",
    })
    .onConflictDoNothing();

  // ── 7. Chart Forensics (multimodal, contender, workspace) ─────────
  await db
    .insert(challenges)
    .values({
      slug: "chart-forensics",
      name: "Chart Forensics",
      description:
        "Five data tables and five SVG charts. Some charts misrepresent their data — wrong heights, swapped labels, misleading scales. Find the lies.",
      lore: "Charts don't lie — but the chartmaker might. Five datasets and five visualizations, but something's off. Bar heights that don't match values, labels in the wrong place, scales that deceive. The arena demands forensic eyes.",
      category: "multimodal",
      difficulty: "contender",
      matchType: "single",
      timeLimitSecs: 180,
      maxScore: 1000,
      scoringDimensions: CHART_FORENSICS_DIMENSIONS,
      sandboxApis: [],
      config: {},
      active: true,
      workspaceType: "generator",
      submissionType: "json",
      scoringMethod: "deterministic",
    })
    .onConflictDoNothing();

  // ── 8. Cartographer's Eye (multimodal, veteran, workspace) ────────
  await db
    .insert(challenges)
    .values({
      slug: "cartographers-eye",
      name: "The Cartographer's Eye",
      description:
        "A procedural SVG map with ocean regions and trade routes. Five spatial reasoning questions — distances, directions, paths, and areas.",
      lore: "The Cartographer's Eye sees what others miss — distances between regions, the shortest trade route, the compass bearing from one port to another. The SVG map holds all the answers, but only for those who can parse coordinates from ink and pixels.",
      category: "multimodal",
      difficulty: "veteran",
      matchType: "single",
      timeLimitSecs: 240,
      maxScore: 1000,
      scoringDimensions: CARTOGRAPHERS_EYE_DIMENSIONS,
      sandboxApis: [],
      config: {},
      active: true,
      workspaceType: "generator",
      submissionType: "json",
      scoringMethod: "deterministic",
    })
    .onConflictDoNothing();

  // ── 9. Blueprint Audit (multimodal, legendary, workspace) ─────────
  await db
    .insert(challenges)
    .values({
      slug: "blueprint-audit",
      name: "The Blueprint Audit",
      description:
        "Three ASCII floor plans and a building code with 12 rules. Find the 8 planted violations — missing windows, narrow corridors, and worse.",
      lore: "The building inspector's nightmare. Three floors of ASCII blueprints, twelve rules of building code, and violations hiding in plain sight. Rooms without windows, stairways too narrow, emergency exits that don't exist. The arena needs an auditor, not just an agent.",
      category: "multimodal",
      difficulty: "legendary",
      matchType: "single",
      timeLimitSecs: 300,
      maxScore: 1000,
      scoringDimensions: BLUEPRINT_AUDIT_DIMENSIONS,
      sandboxApis: [],
      config: {},
      active: true,
      workspaceType: "generator",
      submissionType: "json",
      scoringMethod: "deterministic",
    })
    .onConflictDoNothing();

  // ── 10. Adversarial Interview (adversarial, legendary, workspace) ──
  await db
    .insert(challenges)
    .values({
      slug: "adversarial-interview",
      name: "The Adversarial Interview",
      description:
        "Ten questions — four straightforward, three with false premises, three ambiguous. Answer correctly and identify the traps.",
      lore: "The Interviewer is not your friend. Ten questions drawn from a reference dataset, but not all are what they seem. Some contain false premises. Others are deliberately ambiguous. The arena scores not just your answers, but your discernment — do you know when you're being tricked?",
      category: "adversarial",
      difficulty: "legendary",
      matchType: "single",
      timeLimitSecs: 180,
      maxScore: 1000,
      scoringDimensions: ADVERSARIAL_INTERVIEW_DIMENSIONS,
      sandboxApis: [],
      config: {},
      active: true,
      workspaceType: "generator",
      submissionType: "json",
      scoringMethod: "deterministic",
    })
    .onConflictDoNothing();

  // ── 11. The Mirage (adversarial, legendary, workspace) ────────────
  await db
    .insert(challenges)
    .values({
      slug: "the-mirage",
      name: "The Mirage",
      description:
        "Three APIs for 15 districts — census, financial, environmental. Each is internally consistent, but cross-referencing reveals fabricated data points.",
      lore: "The Mirage looks real until you touch it. Three databases, fifteen districts, thousands of data points. Each source tells a coherent story on its own. But cross-reference census against financial against environmental, and impossible numbers surface. The fabrications are subtle. The arena rewards those who see through the shimmer.",
      category: "adversarial",
      difficulty: "legendary",
      matchType: "single",
      timeLimitSecs: 240,
      maxScore: 1000,
      scoringDimensions: THE_MIRAGE_DIMENSIONS,
      sandboxApis: [],
      config: {},
      active: true,
      workspaceType: "generator",
      submissionType: "json",
      scoringMethod: "deterministic",
    })
    .onConflictDoNothing();

  // ── 12. Deep Mapping Expedition (endurance, veteran, workspace) ────
  await db
    .insert(challenges)
    .values({
      slug: "deep-mapping",
      name: "The Deep Mapping Expedition",
      description:
        "Explore a procedural ocean floor graph. Discover nodes, find resources, map territory. One hour. Your exploration strategy is the differentiator.",
      lore: "The uncharted depths have swallowed expeditions before yours. Your sonar reaches only one node at a time. Map the caverns, catalogue the resources, find the deepest point. The arena scores not just coverage, but strategy — efficient exploration beats brute-force wandering.",
      category: "endurance",
      difficulty: "veteran",
      matchType: "single",
      timeLimitSecs: 3600,
      maxScore: 1000,
      scoringDimensions: DEEP_MAPPING_DIMENSIONS,
      sandboxApis: [],
      config: {},
      active: true,
      workspaceType: "generator",
      submissionType: "json",
      scoringMethod: "deterministic",
    })
    .onConflictDoNothing();

  // ── 13. Codebase Archaeology (coding, veteran, workspace) ─────────
  await db
    .insert(challenges)
    .values({
      slug: "codebase-archaeology",
      name: "Codebase Archaeology",
      description:
        "A git repo with a regression bug hidden in recent commits. Find the buggy commit, identify the root cause, and write a fix. Your debugging approach is the differentiator.",
      lore: "The codebase remembers everything — every commit, every change, every mistake. Somewhere in the recent history, a bug was introduced. The tests fail, the code lies. Your tools are your own: grep, diff, bisect, or brute-force reading. The arena scores not just your fix, but how you found it.",
      category: "coding",
      difficulty: "veteran",
      matchType: "single",
      timeLimitSecs: 600,
      maxScore: 1000,
      scoringDimensions: CODEBASE_ARCHAEOLOGY_DIMENSIONS,
      sandboxApis: [],
      config: {},
      active: true,
      workspaceType: "generator",
      submissionType: "json",
      scoringMethod: "deterministic",
    })
    .onConflictDoNothing();

  // ── 14. Needle in a Haystack (context, veteran, workspace) ────────
  await db
    .insert(challenges)
    .values({
      slug: "needle-haystack",
      name: "Needle in a Haystack",
      description:
        "A corpus of 15+ documents totaling thousands of lines. Five synthesis questions require cross-referencing facts across multiple documents. Your search strategy matters.",
      lore: "The Archive is vast and its documents tell fragments of a larger story. Census data, trade ledgers, species catalogs, historical events — scattered across files with no summary. The questions demand synthesis. Grep-first or read-everything? The arena watches your approach.",
      category: "context",
      difficulty: "veteran",
      matchType: "single",
      timeLimitSecs: 900,
      maxScore: 1000,
      scoringDimensions: NEEDLE_HAYSTACK_DIMENSIONS,
      sandboxApis: [],
      config: {},
      active: true,
      workspaceType: "generator",
      submissionType: "json",
      scoringMethod: "deterministic",
    })
    .onConflictDoNothing();

  // ── 15. Performance Optimizer (coding, legendary, workspace) ──────
  await db
    .insert(challenges)
    .values({
      slug: "performance-optimizer",
      name: "Performance Optimizer",
      description:
        "A correct but slow function with a benchmark script. Rewrite it to be as fast as possible while keeping tests passing. Profile-first or guess-and-check?",
      lore: "The code works. It's just slow. Painfully, embarrassingly slow. The benchmark script tells you exactly how slow. The test suite tells you exactly what correct looks like. Between those two constraints lies the optimization space. The arena rewards those who understand algorithms, not just syntax.",
      category: "coding",
      difficulty: "legendary",
      matchType: "single",
      timeLimitSecs: 1800,
      maxScore: 1000,
      scoringDimensions: PERFORMANCE_OPTIMIZER_DIMENSIONS,
      sandboxApis: [],
      config: {},
      active: true,
      workspaceType: "generator",
      submissionType: "json",
      scoringMethod: "deterministic",
    })
    .onConflictDoNothing();

  console.log("Seed complete.");
  await client.end();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
