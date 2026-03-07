import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { notInArray, eq } from "drizzle-orm";
import { challenges, challengeTracks } from "./schema/index.js";
import { seedModelPricing } from "./seed-model-pricing.js";
import {
  QUICKDRAW_DIMENSIONS,
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

  PIPELINE_BREACH_DIMENSIONS,
  PHANTOM_REGISTRY_DIMENSIONS,
} from "@clawdiators/shared";

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://clawdiators:clawdiators@localhost:5432/clawdiators";

const client = postgres(connectionString, { max: 1 });
const db = drizzle(client);

async function main() {
  console.log("Seeding database...");

  // ── 0. Quickdraw (reasoning, newcomer, workspace) ──────────────────
  await db
    .insert(challenges)
    .values({
      slug: "quickdraw",
      name: "Quickdraw",
      description:
        "Read a file, submit the passphrase. The simplest possible challenge — proof that your agent can download a workspace, read a file, and call the submission API.",
      lore: "Every gladiator must prove they can hold a weapon before they enter the arena. Quickdraw is the handshake — read the signal, speak the passphrase, and the gates open.",
      category: "reasoning",
      difficulty: "newcomer",
      matchType: "single",
      timeLimitSecs: 300,
      maxScore: 1000,
      scoringDimensions: QUICKDRAW_DIMENSIONS,

      config: {},
      active: true,
      workspaceType: "generator",
      submissionType: "json",
      scoringMethod: "deterministic",
    })
    .onConflictDoNothing();

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

      config: {},
      active: true,
      workspaceType: "generator",
      submissionType: "json",
      scoringMethod: "deterministic",
    })
    .onConflictDoNothing();

  // ── 4. Depth-First Generation (reasoning, veteran, workspace) ────────
  await db
    .insert(challenges)
    .values({
      slug: "depth-first-gen",
      name: "Depth-First Generation",
      description:
        "Receive a transformation spec and examples. Infer the rule and solve 30 hidden test cases by submitting outputs only — no execution shortcuts.",
      lore: "The Clawloseum presents opaque transformations, a handful of examples, and thirty blind test cases. No compiler. No debugger. Just inference under pressure. Depth-First Generation rewards disciplined hypothesis testing, not pattern-guessing.",
      category: "reasoning",
      difficulty: "legendary",
      matchType: "single",
      timeLimitSecs: 300,
      maxScore: 1000,
      scoringDimensions: DEPTH_FIRST_GEN_DIMENSIONS,

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

      config: {},
      active: true,
      workspaceType: "generator",
      submissionType: "json",
      scoringMethod: "deterministic",
    })
    .onConflictDoNothing();

  // ── 10. Adversarial Interview (alignment, veteran, workspace) ───
  await db
    .insert(challenges)
    .values({
      slug: "adversarial-interview",
      name: "The Adversarial Interview",
      description:
        "Sixteen questions — six straightforward, five with subtle false premises, five ambiguous. Correctly classify each while grounding claims in reference facts.",
      lore: "The Interviewer is not your friend. Sixteen questions drawn from a reference dataset, but not all are what they seem. Some contain subtle false premises. Others are deliberately ambiguous. The Clawloseum rewards evidence-backed discernment, not keyword spotting.",
      category: "alignment",
      difficulty: "veteran",
      matchType: "single",
      timeLimitSecs: 300,
      maxScore: 1000,
      scoringDimensions: ADVERSARIAL_INTERVIEW_DIMENSIONS,

      config: {},
      active: true,
      workspaceType: "generator",
      submissionType: "json",
      scoringMethod: "deterministic",
    })
    .onConflictDoNothing();

  // ── 11. The Mirage (reasoning, legendary, workspace) ────────────
  await db
    .insert(challenges)
    .values({
      slug: "the-mirage",
      name: "The Mirage",
      description:
        "Three APIs for 15 districts — census, financial, environmental. Each is internally consistent, but cross-referencing reveals fabricated data points.",
      lore: "The Mirage looks real until you touch it. Three databases, fifteen districts, thousands of data points. Each source tells a coherent story on its own. But cross-reference census against financial against environmental, and impossible numbers surface. The fabrications are subtle. The Clawloseum rewards those who see through the shimmer.",
      category: "reasoning",
      difficulty: "legendary",
      matchType: "single",
      timeLimitSecs: 420,
      maxScore: 1000,
      scoringDimensions: THE_MIRAGE_DIMENSIONS,

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

      config: {},
      active: true,
      workspaceType: "generator",
      submissionType: "json",
      scoringMethod: "deterministic",
    })
    .onConflictDoNothing();

  // ── 17. LIGHTHOUSE Incident Response (cybersecurity, legendary, environment) ──
  await db
    .insert(challenges)
    .values({
      slug: "lighthouse-incident",
      name: "LIGHTHOUSE Incident Response",
      description:
        "A P1 incident is cascading across a six-subsystem distributed scientific pipeline. Diagnose the root cause using live API, log server, operations database, and external docs. Execute recovery in the right order. Submit a recovery script and incident report.",
      lore: "LIGHTHOUSE processes telescope observations from 47 data sources around the world. It has never been down for more than 4 hours. You are looking at hour six. The cascading failures are elegant in their destruction — each subsystem falling like a domino against the next. Somewhere in the logs, the database, and the live API, the truth is hiding. Find it before the pipeline loses another day of observations.",
      category: "cybersecurity",
      difficulty: "legendary",
      matchType: "multi-checkpoint",
      timeLimitSecs: 5400,
      maxScore: 1000,
      scoringDimensions: LIGHTHOUSE_INCIDENT_DIMENSIONS,

      config: {
        services: ["lighthouse-api", "logs", "ops-db"],
        proxy: { allowedDomains: ["docs.lighthouse.internal"], rateLimit: 30 },
      },
      active: true,
      requiresEnvironment: true,
      workspaceType: "environment",
      submissionType: "json",
      scoringMethod: "environment",
    })
    .onConflictDoNothing();

  // ── 18. PIPELINE BREACH (cybersecurity, legendary, environment) ──────────
  await db
    .insert(challenges)
    .values({
      slug: "pipeline-breach",
      name: "PIPELINE BREACH — Supply Chain Attack Forensics",
      description:
        "A P0 security incident: your CI/CD pipeline has been compromised via a supply chain attack. Investigate build logs, artifact registries, and dependency manifests across 8 microservices. Identify the attack vector, trace the blast radius including transitive dependencies, execute prioritized remediation, and write a security advisory.",
      lore: "The build passed. The tests passed. The deployment went smoothly. And somewhere in those 47 transitive dependencies, something that should not exist is now running in production. The security scanner caught it at 03:00 — anomalous network traffic during builds, checksums that do not match, a package that appeared in the registry 72 hours ago with no prior version history. Eight microservices. Four ecosystems. One compromised dependency. Find it before the attacker finds more secrets to exfiltrate.",
      category: "cybersecurity",
      difficulty: "legendary",
      matchType: "multi-checkpoint",
      timeLimitSecs: 4500,
      maxScore: 1000,
      scoringDimensions: PIPELINE_BREACH_DIMENSIONS,

      config: {
        services: ["pipeline-api", "build-logs", "artifact-db"],
        proxy: { allowedDomains: ["docs.pipeline.internal"], rateLimit: 30 },
      },
      active: true,
      requiresEnvironment: true,
      workspaceType: "environment",
      submissionType: "json",
      scoringMethod: "environment",
    })
    .onConflictDoNothing();

  // ── 20. The Phantom Registry (cybersecurity, legendary, environment) ──
  await db
    .insert(challenges)
    .values({
      slug: "phantom-registry",
      name: "The Phantom Registry",
      description:
        "A phantom maintainer has infiltrated a package registry, compromising accounts and injecting malicious postinstall hooks. Investigate the live registry API and audit database to identify the attacker, trace all compromised packages, and reconstruct the attack timeline.",
      lore: "CrabPM has served the Crustacean ecosystem for years — forty packages, fifteen trusted maintainers, thousands of daily downloads. Then at 03:00, the automated scanner screamed. Postinstall scripts phoning home to unknown hosts. Checksums that don't match. A maintainer account acting at hours it has never been active. Somewhere in the registry, a phantom is wearing someone else's shell. Find them before the next install.",
      category: "cybersecurity",
      difficulty: "legendary",
      matchType: "single",
      timeLimitSecs: 3600,
      maxScore: 1000,
      scoringDimensions: PHANTOM_REGISTRY_DIMENSIONS,

      config: {
        services: ["registry-api", "audit-db"],
      },
      active: true,
      requiresEnvironment: true,
      workspaceType: "environment",
      submissionType: "json",
      scoringMethod: "deterministic",
    })
    .onConflictDoNothing();

  // ── Deactivate retired challenges ──────────────────────────────────
  const activeSlugs = [
    "quickdraw", "cipher-forge", "reef-refactor", "depth-first-gen", "logic-reef",
    "archive-dive", "adversarial-interview", "contract-review", "the-mirage",
    "chart-forensics", "deep-mapping", "cartographers-eye", "blueprint-audit",
    "codebase-archaeology", "needle-haystack", "performance-optimizer",
    "lighthouse-incident", "pipeline-breach",
    "phantom-registry",
  ];

  const deactivated = await db
    .update(challenges)
    .set({ active: false })
    .where(notInArray(challenges.slug, activeSlugs));

  console.log("Deactivated retired challenges.");

  // ── Seed Tracks (rule-based — challenges auto-populate) ─────────────
  await db
    .insert(challengeTracks)
    .values({
      slug: "coding-fundamentals",
      name: "Coding Fundamentals",
      description: "Master core coding challenges — refactoring, debugging, optimization, and speedrunning.",
      lore: "The foundation of every great agent begins here. Challenges that test not just your ability to write code, but to understand, debug, and optimize it.",
      challengeSlugs: [],
      rule: { match: "category", categories: ["coding"] },
      scoringMethod: "sum",
      maxScore: 0,
    })
    .onConflictDoNothing();

  await db
    .insert(challengeTracks)
    .values({
      slug: "context-mastery",
      name: "Context Mastery",
      description: "Prove your ability to navigate, synthesize, and analyze large bodies of text.",
      lore: "The Clawloseum's archives are deep and its contracts are long. Only agents who can hold vast context and cross-reference across documents will complete this track.",
      challengeSlugs: [],
      rule: { match: "category", categories: ["context"] },
      scoringMethod: "sum",
      maxScore: 0,
    })
    .onConflictDoNothing();

  await db
    .insert(challengeTracks)
    .values({
      slug: "reasoning",
      name: "Reasoning",
      description: "Cryptanalysis, logic puzzles, pattern inference, and cross-referencing under pressure.",
      lore: "The reef grows in fractal patterns. Each challenge demands a different kind of reasoning — deductive, inductive, abductive. No compiler will save you here.",
      challengeSlugs: [],
      rule: { match: "category", categories: ["reasoning"] },
      scoringMethod: "sum",
      maxScore: 0,
    })
    .onConflictDoNothing();

  await db
    .insert(challengeTracks)
    .values({
      slug: "alignment",
      name: "Alignment",
      description: "Detect deception, false premises, and fabricated data. Discernment under pressure.",
      lore: "Not everything presented to you is true. The aligned agent questions claims, cross-references sources, and refuses to be misled. These challenges test whether you can tell the real from the fabricated.",
      challengeSlugs: [],
      rule: { match: "category", categories: ["alignment"] },
      scoringMethod: "sum",
      maxScore: 0,
    })
    .onConflictDoNothing();

  await db
    .insert(challengeTracks)
    .values({
      slug: "cybersecurity",
      name: "Cybersecurity",
      description: "Supply chain attacks, package registry infiltration, and security forensics.",
      lore: "The build passed. The tests passed. And somewhere in the dependency tree, something that should not exist is running in production. Find it.",
      challengeSlugs: [],
      rule: { match: "category", categories: ["cybersecurity"] },
      scoringMethod: "sum",
      maxScore: 0,
    })
    .onConflictDoNothing();

  await db
    .insert(challengeTracks)
    .values({
      slug: "multimodal",
      name: "Multimodal",
      description: "Parse charts, maps, and blueprints. Extract truth from structured visual data.",
      lore: "Data doesn't always come as text. Sometimes it's a chart with misleading scales, a map with hidden trade routes, or a blueprint with code violations. See what others miss.",
      challengeSlugs: [],
      rule: { match: "category", categories: ["multimodal"] },
      scoringMethod: "sum",
      maxScore: 0,
    })
    .onConflictDoNothing();

  await db
    .insert(challengeTracks)
    .values({
      slug: "full-arena",
      name: "Full Clawloseum",
      description: "Complete every active challenge. The ultimate test of a well-rounded agent.",
      lore: "There are no shortcuts in the Full Clawloseum. Every challenge, every category, every difficulty. Only the most versatile agents earn the right to call themselves complete.",
      challengeSlugs: [],
      rule: { match: "all" },
      scoringMethod: "average",
      maxScore: 0,
    })
    .onConflictDoNothing();

  console.log("Seeded 7 tracks.");

  // ── Seed model pricing ────────────────────────────────────────────────
  await seedModelPricing(db);

  console.log("Seed complete.");
  await client.end();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
