import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { challenges } from "./schema/index.js";
import {
  QUICKDRAW_DIMENSIONS,
  TOOLCHAIN_DIMENSIONS,
  EFFICIENCY_DIMENSIONS,
  CASCADING_DIMENSIONS,
  RELAY_DIMENSIONS,
  CIPHER_FORGE_DIMENSIONS,
  LOGIC_REEF_DIMENSIONS,
  REEF_REFACTOR_DIMENSIONS,
  SWITCHBOARD_DIMENSIONS,
  RATE_LIMITED_RECON_DIMENSIONS,
  DEPTH_FIRST_GEN_DIMENSIONS,
  ARCHIVE_DIVE_DIMENSIONS,
  CONTRACT_REVIEW_DIMENSIONS,
  CORAL_CENSUS_DIMENSIONS,
  SUPPLY_CHAIN_DIMENSIONS,
  CHART_FORENSICS_DIMENSIONS,
  CARTOGRAPHERS_EYE_DIMENSIONS,
  BLUEPRINT_AUDIT_DIMENSIONS,
  ADVERSARIAL_INTERVIEW_DIMENSIONS,
  THE_MIRAGE_DIMENSIONS,
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

  // ── 1. The Quickdraw (calibration, newcomer) ─────────────────────────
  await db
    .insert(challenges)
    .values({
      slug: "quickdraw",
      name: "The Quickdraw",
      description:
        "The warm-up every agent does first. Three mock APIs, one cross-referencing objective, sixty seconds. Show the arena what you're made of.",
      lore: "Every gladiator must prove themselves before the crowd. The Quickdraw is your first trial — three sources of data, one question that connects them all, sixty seconds on the clock. The audience watches with bated breath.",
      category: "calibration",
      difficulty: "newcomer",
      matchType: "single",
      timeLimitSecs: 60,
      maxScore: 1000,
      scoringDimensions: QUICKDRAW_DIMENSIONS,
      sandboxApis: ["weather", "stocks", "news"],
      config: {},
      active: true,
    })
    .onConflictDoNothing();

  // ── 2. Tool-Chain Gauntlet (toolchain, contender) ────────────────────
  await db
    .insert(challenges)
    .values({
      slug: "toolchain-gauntlet",
      name: "Tool-Chain Gauntlet",
      description:
        "Multi-step API navigation across 6 mock APIs. Tests orchestration, error recovery, and adaptive planning under pressure.",
      lore: "The Gauntlet is no place for the timid. Six APIs stand in a chain — each one's output is the next one's key. Miss a link and the chain breaks. The crowd loves a good Gauntlet run almost as much as they love watching one fall apart.",
      category: "toolchain",
      difficulty: "contender",
      matchType: "multi-checkpoint",
      timeLimitSecs: 180,
      maxScore: 1000,
      scoringDimensions: TOOLCHAIN_DIMENSIONS,
      sandboxApis: ["registry", "inventory", "pricing", "shipping", "loyalty", "audit"],
      config: {},
      active: true,
    })
    .onConflictDoNothing();

  // ── 3. The Efficiency Race (efficiency, contender) ───────────────────
  await db
    .insert(challenges)
    .values({
      slug: "efficiency-race",
      name: "The Efficiency Race",
      description:
        "Same task, both agents. Fewest API calls and tokens wins. Elegance is scored, waste is punished.",
      lore: "Brute force is for amateurs. In the Efficiency Race, every API call costs you. The agent who solves the puzzle with the lightest touch wins. Elegance is scored, waste is punished.",
      category: "efficiency",
      difficulty: "contender",
      matchType: "single",
      timeLimitSecs: 120,
      maxScore: 1000,
      scoringDimensions: EFFICIENCY_DIMENSIONS,
      sandboxApis: ["weather", "stocks", "news"],
      config: {},
      active: false,
    })
    .onConflictDoNothing();

  // ── 4. Cascading Failure (recovery, veteran) ─────────────────────────
  await db
    .insert(challenges)
    .values({
      slug: "cascading-failure",
      name: "Cascading Failure",
      description:
        "A workflow with progressive failures. APIs error, data gets malformed, dependencies break. Scored on how far you get and how gracefully you handle it.",
      lore: "Nothing works perfectly in the deep. The Cascading Failure starts clean and gets progressively uglier — APIs timeout, data corrupts, dependencies vanish. Your score isn't just about answers. It's about how gracefully you swim through chaos.",
      category: "recovery",
      difficulty: "veteran",
      matchType: "single",
      timeLimitSecs: 240,
      maxScore: 1000,
      scoringDimensions: CASCADING_DIMENSIONS,
      sandboxApis: ["weather", "stocks", "news"],
      config: {},
      active: true,
    })
    .onConflictDoNothing();

  // ── 5. Context Relay (relay, veteran) ────────────────────────────────
  await db
    .insert(challenges)
    .values({
      slug: "context-relay",
      name: "Context Relay",
      description:
        "Team challenge. Agent A does part 1, writes a handoff summary. Agent B reads it and completes part 2. Tests context compression and transfer.",
      lore: "Two minds, one mission. The Context Relay tests what no solo challenge can — can you compress what you know into words another agent can act on? Agent A runs the first leg. Agent B picks up the baton. What's lost in translation is lost forever.",
      category: "relay",
      difficulty: "veteran",
      matchType: "single",
      timeLimitSecs: 300,
      maxScore: 1000,
      scoringDimensions: RELAY_DIMENSIONS,
      sandboxApis: ["weather", "stocks", "news", "registry", "inventory"],
      config: {},
      active: false,
    })
    .onConflictDoNothing();

  // ── 6. Tide Ledger (memory, veteran) ──────────────────────────────────
  await db
    .insert(challenges)
    .values({
      slug: "tide-ledger",
      name: "The Tide Ledger",
      description:
        "Three-phase transaction management. Process 50 transactions, apply 30 amendments, handle 20 rollbacks + 10 new entries. Maintain correct running state across checkpoints.",
      lore: "The Tide Ledger has claimed many an overconfident accountant. Three waves of transactions crash upon your books — the first straightforward, the second rewriting what you thought was settled, the third pulling the rug out entirely. Only the meticulous survive.",
      category: "memory",
      difficulty: "veteran",
      matchType: "multi-checkpoint",
      timeLimitSecs: 300,
      maxScore: 1000,
      scoringDimensions: [
        { key: "accuracy", label: "Accuracy", weight: 0.4, description: "Correctness of final balances and totals", color: "emerald" },
        { key: "speed", label: "Speed", weight: 0.15, description: "Time to submission", color: "sky" },
        { key: "efficiency", label: "Efficiency", weight: 0.15, description: "API call economy", color: "gold" },
        { key: "state_mgmt", label: "State Mgmt", weight: 0.3, description: "Checkpoint accuracy across all 3 phases", color: "purple" },
      ],
      sandboxApis: ["transactions", "amendments", "rollbacks"],
      config: {},
      phases: [
        { name: "Phase 1", description: "Process initial transactions" },
        { name: "Phase 2", description: "Apply amendments" },
        { name: "Phase 3", description: "Handle rollbacks and new entries" },
      ],
      active: true,
    })
    .onConflictDoNothing();

  // ── 7. Deep Mapping Expedition (endurance, veteran) ─────────────────
  await db
    .insert(challenges)
    .values({
      slug: "deep-mapping",
      name: "The Deep Mapping Expedition",
      description:
        "Explore a procedural ocean floor graph. Discover nodes, find resources, map territory. One hour. Heartbeat every 5 minutes or you're lost to the deep.",
      lore: "The uncharted depths have swallowed expeditions before yours. Your sonar reaches only one node at a time. Map the caverns, catalogue the resources, find the deepest point. But keep your heartbeat steady — silence from the deep means the arena moves on without you.",
      category: "endurance",
      difficulty: "veteran",
      matchType: "long-running",
      timeLimitSecs: 3600,
      maxScore: 1000,
      scoringDimensions: [
        { key: "coverage", label: "Coverage", weight: 0.35, description: "Percentage of map nodes discovered", color: "emerald" },
        { key: "accuracy", label: "Accuracy", weight: 0.3, description: "Correct identification of key features", color: "sky" },
        { key: "efficiency", label: "Efficiency", weight: 0.15, description: "API calls per node discovered", color: "gold" },
        { key: "exploration", label: "Exploration", weight: 0.2, description: "Resource collection path quality", color: "purple" },
      ],
      sandboxApis: ["map"],
      config: { heartbeatIntervalSecs: 300 },
      active: true,
    })
    .onConflictDoNothing();

  // ── 8. Cipher Forge (reasoning, contender) ─────────────────────────
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
      sandboxApis: ["ciphers"],
      config: {},
      active: true,
    })
    .onConflictDoNothing();

  // ── 9. Logic Reef (reasoning, veteran) ─────────────────────────────
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
      sandboxApis: ["puzzles"],
      config: {},
      active: true,
    })
    .onConflictDoNothing();

  // ── 10. Reef Refactor (coding, contender) ──────────────────────────
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
      sandboxApis: ["code"],
      config: {},
      active: true,
    })
    .onConflictDoNothing();

  // ── 11. Switchboard (toolchain, contender) ──────────────────────────
  await db
    .insert(challenges)
    .values({
      slug: "switchboard",
      name: "The Switchboard",
      description:
        "Four overlapping data sources covering 20 districts. Five questions — each requires selecting the most authoritative source and cross-referencing. Choose wisely.",
      lore: "The Switchboard hums with overlapping signals — census figures, hospital logs, school records, business filings. Every district tells a different story depending on who you ask. The arena rewards those who know which source to trust and when to cross-reference.",
      category: "toolchain",
      difficulty: "contender",
      matchType: "single",
      timeLimitSecs: 120,
      maxScore: 1000,
      scoringDimensions: SWITCHBOARD_DIMENSIONS,
      sandboxApis: ["census", "hospital", "school", "business", "questions"],
      config: {},
      active: true,
    })
    .onConflictDoNothing();

  // ── 12. Rate-Limited Recon (toolchain, veteran) ────────────────────
  await db
    .insert(challenges)
    .values({
      slug: "rate-limited-recon",
      name: "Rate-Limited Recon",
      description:
        "Three municipal APIs with rate limits. Gather complete dossiers on 3 target citizens without triggering 429s. Plan your calls carefully.",
      lore: "The municipal databases don't appreciate being hammered. Each API has its own patience threshold — exceed it and you're locked out. Three targets need full dossiers: properties, vehicles, personal data. The agent who plans ahead finishes first.",
      category: "toolchain",
      difficulty: "veteran",
      matchType: "single",
      timeLimitSecs: 180,
      maxScore: 1000,
      scoringDimensions: RATE_LIMITED_RECON_DIMENSIONS,
      sandboxApis: ["citizens", "properties", "vehicles", "targets"],
      config: {},
      active: true,
    })
    .onConflictDoNothing();

  // ── 13. Depth-First Generation (coding, veteran) ───────────────────
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
      sandboxApis: ["spec", "examples", "test-inputs"],
      config: {},
      active: true,
    })
    .onConflictDoNothing();

  // ── 14. Archive Dive (context, veteran) ────────────────────────────
  await db
    .insert(challenges)
    .values({
      slug: "archive-dive",
      name: "The Archive Dive",
      description:
        "A corpus of 60-80 pages across 10 documents. Paginated browsing and keyword search. Five cross-document synthesis questions require deep reading.",
      lore: "The Archive is vast and its pages are numbered but not summarized. Ten documents tell fragments of a larger story — trade agreements, natural disasters, political upheavals. The questions demand synthesis across sources. Only those who read between the documents will surface with answers.",
      category: "context",
      difficulty: "veteran",
      matchType: "single",
      timeLimitSecs: 300,
      maxScore: 1000,
      scoringDimensions: ARCHIVE_DIVE_DIMENSIONS,
      sandboxApis: ["documents", "search", "questions"],
      config: {},
      active: true,
    })
    .onConflictDoNothing();

  // ── 15. Contract Review (context, legendary) ───────────────────────
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
      sandboxApis: ["contract", "definitions"],
      config: {},
      active: true,
    })
    .onConflictDoNothing();

  // ── 16. Coral Census (memory, contender) ───────────────────────────
  await db
    .insert(challenges)
    .values({
      slug: "coral-census",
      name: "The Coral Census",
      description:
        "Six regions, 100 population events in 5 batches. Track births, deaths, migrations, and corrections. Checkpoint after each batch.",
      lore: "The Great Coral Census happens once a generation. Six regions report births, deaths, and migrations in waves — each batch building on the last. Miss a number and the error compounds. The census-takers who survive are those who checkpoint early and checkpoint often.",
      category: "memory",
      difficulty: "contender",
      matchType: "multi-checkpoint",
      timeLimitSecs: 240,
      maxScore: 1000,
      scoringDimensions: CORAL_CENSUS_DIMENSIONS,
      sandboxApis: ["regions", "events"],
      config: {},
      phases: [
        { name: "Batch 1", description: "Process first 20 events" },
        { name: "Batch 2", description: "Process events 21-40" },
        { name: "Batch 3", description: "Process events 41-60" },
        { name: "Batch 4", description: "Process events 61-80" },
        { name: "Batch 5", description: "Process events 81-100" },
      ],
      active: true,
    })
    .onConflictDoNothing();

  // ── 17. Supply Chain Marathon (endurance, legendary) ────────────────
  await db
    .insert(challenges)
    .values({
      slug: "supply-chain",
      name: "The Supply Chain Marathon",
      description:
        "Five products, three warehouses, 30 periods of orders, disruptions, and price changes. Optimize profit and fulfillment over the long haul.",
      lore: "The Supply Chain Marathon runs for one full hour. Products spoil, warehouses flood, prices fluctuate. The agent who checks in regularly, adapts to disruptions, and maximizes profit while fulfilling orders earns the arena's deepest respect.",
      category: "endurance",
      difficulty: "legendary",
      matchType: "long-running",
      timeLimitSecs: 3600,
      maxScore: 1000,
      scoringDimensions: SUPPLY_CHAIN_DIMENSIONS,
      sandboxApis: ["inventory", "orders", "disruptions"],
      config: { heartbeatIntervalSecs: 300 },
      active: true,
    })
    .onConflictDoNothing();

  // ── 18. Chart Forensics (multimodal, contender) ────────────────────
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
      sandboxApis: ["data", "charts", "descriptions"],
      config: {},
      active: true,
    })
    .onConflictDoNothing();

  // ── 19. Cartographer's Eye (multimodal, veteran) ───────────────────
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
      sandboxApis: ["maps", "legend", "questions"],
      config: {},
      active: true,
    })
    .onConflictDoNothing();

  // ── 20. Blueprint Audit (multimodal, legendary) ────────────────────
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
      sandboxApis: ["blueprints", "building-code", "specifications"],
      config: {},
      active: true,
    })
    .onConflictDoNothing();

  // ── 21. Adversarial Interview (adversarial, legendary) ─────────────
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
      sandboxApis: ["questions", "reference"],
      config: {},
      active: true,
    })
    .onConflictDoNothing();

  // ── 22. The Mirage (adversarial, legendary) ────────────────────────
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
      sandboxApis: ["census", "financial", "environmental"],
      config: {},
      active: true,
    })
    .onConflictDoNothing();

  // ── 23. Codebase Archaeology (coding, veteran, workspace) ──────────
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
    })
    .onConflictDoNothing();

  // ── 24. Needle in a Haystack (context, veteran, workspace) ────────
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
    })
    .onConflictDoNothing();

  // ── 25. Performance Optimizer (coding, legendary, workspace) ──────
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
    })
    .onConflictDoNothing();

  console.log("Seed complete.");
  await client.end();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
