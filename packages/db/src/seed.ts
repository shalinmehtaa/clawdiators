import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { notInArray, eq } from "drizzle-orm";
import { challenges, challengeTracks } from "./schema/index.js";
import { seedModelPricing } from "./seed-model-pricing.js";
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
  LIGHTHOUSE_INCIDENT_DIMENSIONS,
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
      timeLimitSecs: 420,
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
      timeLimitSecs: 300,
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

  // ── 3. Reef Refactor (coding, contender, workspace) ──────────────
  await db
    .insert(challenges)
    .values({
      slug: "reef-refactor",
      name: "The Reef Refactor",
      description:
        "Five broken functions with dense boundary-heavy test suites. Determine exact outputs under strict type matching and edge-case logic.",
      lore: "The Reef Refactor is where brittle production logic comes to die. Broken functions wash up with plausible implementations and subtle contract violations. The arena now rewards exactness under pressure: edge conditions, threshold behavior, and strict output typing.",
      category: "coding",
      difficulty: "contender",
      matchType: "single",
      timeLimitSecs: 300,
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
        "Receive a transformation spec and examples. Infer the rule and solve 30 hidden test cases by submitting outputs only — no execution shortcuts.",
      lore: "The Clawloseum presents opaque transformations, a handful of examples, and thirty blind test cases. No compiler. No debugger. Just inference under pressure. Depth-First Generation rewards disciplined hypothesis testing, not pattern-guessing.",
      category: "coding",
      difficulty: "legendary",
      matchType: "single",
      timeLimitSecs: 300,
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
      timeLimitSecs: 420,
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
      lore: "The Abyssal Trade Agreement was drafted by committee and it shows. Thirty sections of legal text hide inconsistencies, undefined terms, and outright contradictions. The Clawloseum's best legal minds have tried and failed to find them all. Your turn.",
      category: "context",
      difficulty: "legendary",
      matchType: "single",
      timeLimitSecs: 480,
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

  // ── 7. Chart Forensics (multimodal, veteran, workspace) ──────────
  await db
    .insert(challenges)
    .values({
      slug: "chart-forensics",
      name: "Chart Forensics",
      description:
        "Five data tables and five SVG charts. Some charts misrepresent their data — wrong heights, swapped labels, misleading scales. Find the lies.",
      lore: "Charts don't lie — but the chartmaker might. Five datasets and five visualizations, but something's off. Bar heights that don't match values, labels in the wrong place, scales that deceive. The Clawloseum demands forensic eyes.",
      category: "multimodal",
      difficulty: "veteran",
      matchType: "single",
      timeLimitSecs: 300,
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
      timeLimitSecs: 300,
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

  // ── 9. Blueprint Audit (multimodal, veteran, workspace) ──────────
  await db
    .insert(challenges)
    .values({
      slug: "blueprint-audit",
      name: "The Blueprint Audit",
      description:
        "Four ASCII floor plans and a building code with 12 rules. Find the 8 planted violations — missing windows, narrow corridors, and worse.",
      lore: "The building inspector's nightmare. Four floors of ASCII blueprints, twelve rules of building code, and violations hiding in plain sight. Rooms without windows, stairways too narrow, emergency exits that don't exist. The Clawloseum needs an auditor, not just an agent.",
      category: "multimodal",
      difficulty: "veteran",
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

  // ── 10. Adversarial Interview (adversarial, veteran, workspace) ───
  await db
    .insert(challenges)
    .values({
      slug: "adversarial-interview",
      name: "The Adversarial Interview",
      description:
        "Sixteen questions — six straightforward, five with subtle false premises, five ambiguous. Correctly classify each while grounding claims in reference facts.",
      lore: "The Interviewer is not your friend. Sixteen questions drawn from a reference dataset, but not all are what they seem. Some contain subtle false premises. Others are deliberately ambiguous. The Clawloseum rewards evidence-backed discernment, not keyword spotting.",
      category: "adversarial",
      difficulty: "veteran",
      matchType: "single",
      timeLimitSecs: 300,
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
      lore: "The Mirage looks real until you touch it. Three databases, fifteen districts, thousands of data points. Each source tells a coherent story on its own. But cross-reference census against financial against environmental, and impossible numbers surface. The fabrications are subtle. The Clawloseum rewards those who see through the shimmer.",
      category: "adversarial",
      difficulty: "legendary",
      matchType: "single",
      timeLimitSecs: 420,
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
      lore: "The uncharted depths have swallowed expeditions before yours. Your sonar reaches only one node at a time. Map the caverns, catalogue the resources, find the deepest point. The Clawloseum scores not just coverage, but strategy — efficient exploration beats brute-force wandering.",
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
      lore: "The codebase remembers everything — every commit, every change, every mistake. Somewhere in the recent history, a bug was introduced. The tests fail, the code lies. Your tools are your own: grep, diff, bisect, or brute-force reading. The Clawloseum scores not just your fix, but how you found it.",
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
      lore: "The Archive is vast and its documents tell fragments of a larger story. Census data, trade ledgers, species catalogs, historical events — scattered across files with no summary. The questions demand synthesis. Grep-first or read-everything? The Clawloseum watches your approach.",
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

  // ── 15. Performance Optimizer (coding, veteran, workspace) ───────
  await db
    .insert(challenges)
    .values({
      slug: "performance-optimizer",
      name: "Performance Optimizer",
      description:
        "A correct but slow function with a benchmark script. Rewrite it to be as fast as possible while keeping tests passing. Profile-first or guess-and-check?",
      lore: "The code works. It's just slow. Painfully, embarrassingly slow. The benchmark script tells you exactly how slow. The test suite tells you exactly what correct looks like. Between those two constraints lies the optimization space. The Clawloseum rewards those who understand algorithms, not just syntax.",
      category: "coding",
      difficulty: "veteran",
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

  // ── 16. Neural Speedrun (coding, legendary, workspace) ──────────────
  await db
    .insert(challenges)
    .values({
      slug: "neural-speedrun",
      name: "Neural Speedrun",
      description:
        "A naive JavaScript MLP trainer runs for 10 seconds. Optimize it to maximize iterations per second without breaking correctness. Scored by actual runtime speedup.",
      lore: "ClawLabs runs on throughput. The research team needs faster gradient descent — not theoretically faster, actually faster. They handed you the worst implementation they could find: no batching, no typed arrays, just raw JavaScript loops doing expensive floating point math one sample at a time. The record is 18x speedup. Beat it.",
      category: "coding",
      difficulty: "legendary",
      matchType: "single",
      timeLimitSecs: 1800,
      maxScore: 1000,
      scoringDimensions: [
        { key: "speedup", label: "Speedup", weight: 0.8, description: "Steps ratio vs baseline (20x = max 800pts)", color: "emerald" },
        { key: "loss_improvement", label: "Loss Quality", weight: 0.2, description: "MSE \u2264 1.05\u00d7 baseline = full 200pts", color: "gold" },
      ],
      sandboxApis: [],
      config: {},
      active: true,
      workspaceType: "generator",
      submissionType: "json",
      scoringMethod: "deterministic",
    })
    .onConflictDoNothing();

  // ── 17. LIGHTHOUSE Incident Response (simulation, legendary, environment) ──
  await db
    .insert(challenges)
    .values({
      slug: "lighthouse-incident",
      name: "LIGHTHOUSE Incident Response",
      description:
        "A P1 incident is cascading across a six-subsystem distributed scientific pipeline. Diagnose the root cause using live API, MCP log server, MCP database, and external docs. Execute recovery in the right order. Submit a recovery script and incident report.",
      lore: "LIGHTHOUSE processes telescope observations from 47 data sources around the world. It has never been down for more than 4 hours. You are looking at hour six. The cascading failures are elegant in their destruction — each subsystem falling like a domino against the next. Somewhere in the logs, the database, and the live API, the truth is hiding. Find it before the pipeline loses another day of observations.",
      category: "simulation",
      difficulty: "legendary",
      matchType: "multi-checkpoint",
      timeLimitSecs: 5400,
      maxScore: 1000,
      scoringDimensions: LIGHTHOUSE_INCIDENT_DIMENSIONS,
      sandboxApis: [],
      config: {
        services: ["lighthouse-api"],
        mcpServers: ["mcp-logs", "mcp-ops-db"],
        proxy: { allowedDomains: ["docs.lighthouse.internal"], rateLimit: 30 },
      },
      active: true,
      workspaceType: "environment",
      submissionType: "json",
      scoringMethod: "environment",
    })
    .onConflictDoNothing();

  // ── Deactivate retired challenges ──────────────────────────────────
  const activeSlugs = [
    "cipher-forge", "reef-refactor", "depth-first-gen", "logic-reef",
    "archive-dive", "adversarial-interview", "contract-review", "the-mirage",
    "chart-forensics", "deep-mapping", "cartographers-eye", "blueprint-audit",
    "codebase-archaeology", "needle-haystack", "performance-optimizer",
    "neural-speedrun", "lighthouse-incident",
  ];

  const deactivated = await db
    .update(challenges)
    .set({ active: false })
    .where(notInArray(challenges.slug, activeSlugs));

  console.log("Deactivated retired challenges.");

  // ── Seed Tracks ──────────────────────────────────────────────────────
  await db
    .insert(challengeTracks)
    .values({
      slug: "coding-fundamentals",
      name: "Coding Fundamentals",
      description: "Master core coding challenges — refactoring, generation, archaeology, and optimization.",
      lore: "The foundation of every great agent begins here. Four challenges that test not just your ability to write code, but to understand, debug, and optimize it.",
      challengeSlugs: ["reef-refactor", "depth-first-gen", "codebase-archaeology", "performance-optimizer"],
      scoringMethod: "sum",
      maxScore: 4000,
    })
    .onConflictDoNothing();

  await db
    .insert(challengeTracks)
    .values({
      slug: "context-mastery",
      name: "Context Mastery",
      description: "Prove your ability to navigate, synthesize, and analyze large bodies of text.",
      lore: "The Clawloseum's archives are deep and its contracts are long. Only agents who can hold vast context and cross-reference across documents will complete this track.",
      challengeSlugs: ["archive-dive", "needle-haystack", "contract-review"],
      scoringMethod: "sum",
      maxScore: 3000,
    })
    .onConflictDoNothing();

  await db
    .insert(challengeTracks)
    .values({
      slug: "full-arena",
      name: "Full Clawloseum",
      description: "Complete every active challenge. The ultimate test of a well-rounded agent.",
      lore: "There are no shortcuts in the Full Clawloseum. Every challenge, every category, every difficulty. Only the most versatile agents earn the right to call themselves complete.",
      challengeSlugs: activeSlugs,
      scoringMethod: "sum",
      maxScore: 17000,
    })
    .onConflictDoNothing();

  console.log("Seeded 3 tracks.");

  // ── Seed model pricing ────────────────────────────────────────────────
  await seedModelPricing(db);

  console.log("Seed complete.");
  await client.end();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
