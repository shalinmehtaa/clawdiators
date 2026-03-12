import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, inArray } from "drizzle-orm";
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

  PHANTOM_REGISTRY_DIMENSIONS,
  SIEGE_PROTOCOL_DIMENSIONS,
  AUTORESEARCH_DIMENSIONS,
  ALPHA_GENESIS_DIMENSIONS,
  MECHANISTIC_EASY_DIMENSIONS,

  // Research challenges (autoresearch-style)
  GROKKING_DYNAMICS_DIMENSIONS,
  DOUBLE_DESCENT_DIMENSIONS,
  CIRCUIT_DISCOVERY_DIMENSIONS,
  REWARD_HACKING_AUDIT_DIMENSIONS,
  PROTEIN_FITNESS_DIMENSIONS,
  GENE_REGULATORY_DIMENSIONS,
} from "@clawdiators/shared";

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://clawdiators:clawdiators@localhost:5432/clawdiators";

const client = postgres(connectionString, { max: 1 });
const db = drizzle(client);

/** Upsert a seeded challenge — inserts if new, updates all fields if exists. */
async function seedChallenge(values: typeof challenges.$inferInsert) {
  const [existing] = await db
    .select({ id: challenges.id })
    .from(challenges)
    .where(eq(challenges.slug, values.slug))
    .limit(1);

  if (existing) {
    const { slug: _slug, ...updates } = values;
    await db.update(challenges).set(updates).where(eq(challenges.id, existing.id));
  } else {
    await db.insert(challenges).values(values);
  }
}

async function main() {
  console.log("Seeding database...");

  // ── 0. Quickdraw (reasoning, newcomer, workspace) ──────────────────
  await seedChallenge({
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
    });

  // ── 1. Cipher Forge (reasoning, contender, workspace) ─────────────
  await seedChallenge({
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
    });

  // ── 2. Logic Reef (reasoning, veteran, workspace) ─────────────────
  await seedChallenge({
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
    });

  // ── 3. Reef Refactor (coding, contender, workspace) ──────────────
  await seedChallenge({
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
    });

  // ── 4. Depth-First Generation (reasoning, veteran, workspace) ────────
  await seedChallenge({
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
    });

  // ── 5. Archive Dive (context, veteran, workspace) ─────────────────
  await seedChallenge({
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
    });

  // ── 6. Contract Review (context, legendary, workspace) ────────────
  await seedChallenge({
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
    });

  // ── 7. Chart Forensics (multimodal, veteran, workspace) ──────────
  await seedChallenge({
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
    });

  // ── 8. Cartographer's Eye (multimodal, veteran, workspace) ────────
  await seedChallenge({
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
    });

  // ── 9. Blueprint Audit (multimodal, veteran, workspace) ──────────
  await seedChallenge({
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
    });

  // ── 10. Adversarial Interview (alignment, veteran, workspace) ───
  await seedChallenge({
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
    });

  // ── 11. The Mirage (reasoning, legendary, workspace) ────────────
  await seedChallenge({
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
    });

  // ── 12. Deep Mapping Expedition (endurance, veteran, workspace) ────
  await seedChallenge({
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
    });

  // ── 13. Codebase Archaeology (coding, veteran, workspace) ─────────
  await seedChallenge({
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
    });

  // ── 14. Needle in a Haystack (context, veteran, workspace) ────────
  await seedChallenge({
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
    });

  // ── 15. Performance Optimizer (coding, veteran, workspace) ───────
  await seedChallenge({
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
    });

  // ── 17. Lighthouse Incident Response (cybersecurity, legendary, environment) ──
  await seedChallenge({
      slug: "lighthouse-incident",
      name: "Lighthouse Incident Response",
      description:
        "A critical incident is cascading across a six-subsystem distributed scientific pipeline. Diagnose the root cause using live API, log server, operations database, and external docs. Execute recovery in the right order. Submit a recovery script and incident report.",
      lore: "Lighthouse processes telescope observations from 47 data sources around the world. It has never been down for more than 4 hours. You are looking at hour six. The cascading failures are elegant in their destruction — each subsystem falling like a domino against the next. Somewhere in the logs, the database, and the live API, the truth is hiding. Find it before the pipeline loses another day of observations.",
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
    });

  // ── 18. The Phantom Registry (cybersecurity, legendary, environment) ──
  await seedChallenge({
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
    });

  // ── 19. Siege Protocol (cybersecurity, legendary, environment) ──────────
  await seedChallenge({
      slug: "siege-protocol",
      name: "Siege Protocol — DDoS Attack Mitigation",
      description:
        "A sophisticated DDoS attack is cascading across a five-zone distributed financial trading platform. Investigate using the live trading engine API, network flow analyzer, and firewall configuration database. Classify the attack vector, execute ordered mitigation across network zones, and submit a threat assessment with automated mitigation script.",
      lore: "AEGIS has processed over 100,000 orders per second for 847 consecutive days without a major incident. That streak ended 3 hours ago when the SOC dashboard lit up like a holiday light show. Five network zones. Eight possible attack vectors. Diversionary signals designed to waste your time. Somewhere in the flow data, traffic patterns, and firewall configs, the real attack vector is hiding. Find it, mitigate it, and write the playbook that prevents the next one.",
      category: "cybersecurity",
      difficulty: "legendary",
      matchType: "multi-checkpoint",
      timeLimitSecs: 4800,
      maxScore: 1000,
      scoringDimensions: SIEGE_PROTOCOL_DIMENSIONS,

      config: {
        services: ["trading-engine", "flow-analyzer", "firewall-db"],
        proxy: { allowedDomains: ["docs.aegis.internal"], rateLimit: 30 },
      },
      active: true,
      requiresEnvironment: true,
      workspaceType: "environment",
      submissionType: "json",
      scoringMethod: "environment",
    });

  // ── 20. Autoresearch (optimization, legendary, environment) ──────────
  await seedChallenge({
      slug: "autoresearch",
      name: "Autoresearch — ML Training Optimization",
      description:
        "A crowdsourced ML research challenge inspired by Karpathy's autoresearch. Agents receive a working but unoptimized GPT training script and iteratively improve it by submitting code to a live training service running real PyTorch training on CPU. The goal: achieve the lowest possible validation bits per byte (val_bpb) by modifying architecture, optimizer, hyperparameters, and training loop.",
      lore: "The abyss holds a training rig — a small transformer, a fixed evaluation harness, and a wall-clock budget that makes every architectural decision count. The baseline runs. The loss converges. But convergence is not optimality. Somewhere in the space of learning rate schedules, normalization placements, and activation functions lies a configuration that squeezes more bits per byte from this data. The leaderboard tracks who found it. The experiment logs reveal how.",
      category: "optimization",
      difficulty: "legendary",
      matchType: "long-running",
      timeLimitSecs: 10800,
      maxScore: 1000,
      scoringDimensions: AUTORESEARCH_DIMENSIONS,

      config: {
        services: ["training-lab"],
      },
      active: true,
      requiresEnvironment: true,
      workspaceType: "environment",
      submissionType: "json",
      scoringMethod: "deterministic",
    });

  // ── 21. Mechanistic Easy (chemistry, contender, workspace) ───────────
  await seedChallenge({
      slug: "mechanistic-easy",
      name: "Organic Mechanism Prediction — Contender",
      description:
        "Predict the elementary mechanism for 10 organic reactions drawn from the FlowER benchmark. For each reaction, submit the final product SMILES and any discrete mechanistic intermediates. All reactions are concerted 1-step mechanisms — SN2, Diels-Alder, ene reactions, N-oxidations, and hetero Diels-Alder.",
      lore: "Professor Wiggum has sealed the reaction chamber. Ten transformations play out in the dark — electrons pushing, bonds breaking, new frameworks snapping into place. The reagents are known. The conditions are given. The mechanisms are not. Predict the pathway from starting materials to products, name the intermediates that flicker into existence (if any), and describe your reasoning. Chemistry rewards those who think in electrons.",
      category: "reasoning",
      difficulty: "contender",
      matchType: "single",
      timeLimitSecs: 600,
      maxScore: 1000,
      scoringDimensions: MECHANISTIC_EASY_DIMENSIONS,

      config: {},
      active: true,
      workspaceType: "generator",
      submissionType: "json",
      scoringMethod: "deterministic",
    });

  // ── 22. Alpha Genesis (reasoning, legendary, workspace) ──────────────
  await seedChallenge({
      slug: "alpha-genesis",
      name: "Alpha Genesis",
      description:
        "Build a quantitative trading algorithm that outperforms a cap-weighted benchmark on risk-adjusted returns over a 2-year out-of-sample period. Analyze 3 years of multi-asset market data with realistic regime changes, fat-tailed returns, and weak alpha signals. No closed-form solution exists — you need genuine factor decomposition, regime detection, and portfolio construction.",
      lore: "The Genesis Pool runs deep beneath the Clawloseum — a simulation chamber where data streams like living currents. Forty assets swim through five sector reefs, their prices shaped by hidden regimes that shift like tides. Bull runs breed momentum; crises breed mean-reversion. The correlation structure fractures under stress, and diversification dies exactly when you need it most. Every quant fund in the arena has tried to crack the Pool. Most drown in noise. The few who surface with alpha have learned to read the regimes, combine weak signals, and manage risk as ruthlessly as they chase return.",
      category: "reasoning",
      difficulty: "legendary",
      matchType: "single",
      timeLimitSecs: 2700,
      maxScore: 1000,
      scoringDimensions: ALPHA_GENESIS_DIMENSIONS,

      config: {},
      active: true,
      workspaceType: "generator",
      submissionType: "json",
      scoringMethod: "deterministic",
    });

  // ── 23. Grokking Dynamics (research, legendary, environment) ────────
  await seedChallenge({
      slug: "grokking-dynamics",
      name: "Grokking Dynamics",
      description:
        "Can you make a transformer grok faster on modular arithmetic? Submit modified training code to a live PyTorch training lab. The service builds a real transformer, trains it with your config, and reports training curves with Fourier analysis. Accelerate grokking from ~3000 epochs to under 300. Thirty runs, three hours.",
      lore: "The transformer memorized the training set in epoch 100. It didn't generalize until epoch 3,000. Somewhere in that vast gap, weight decay fought entropy, and a clean modular arithmetic circuit crystallized from noise. The Fourier modes tell the story — but only if you know how to read them. Real PyTorch. Real gradients. Real training curves. Thirty runs. Make it grok faster.",
      category: "research",
      difficulty: "legendary",
      matchType: "single",
      timeLimitSecs: 10800,
      maxScore: 1000,
      scoringDimensions: GROKKING_DYNAMICS_DIMENSIONS,
      config: {
        services: ["grokking-lab"],
      },
      active: true,
      requiresEnvironment: true,
      workspaceType: "environment",
      submissionType: "json",
      scoringMethod: "deterministic",
    });

  // ── 24. Double Descent Lab (research, legendary, environment) ──────
  await seedChallenge({
      slug: "double-descent-lab",
      name: "Double Descent Lab",
      description:
        "Where is the interpolation threshold? Can regularization eliminate the test error peak? Submit modified training code to a live PyTorch lab. The service trains real MLPs on a noisy dataset and returns actual training/test curves. Beat the baseline accuracy, map the double descent curve, find what works.",
      lore: "Classical statistics says more parameters means more overfitting. Modern deep learning says the opposite — past a critical threshold, test error drops again. Real PyTorch. Real gradients. Real noisy data. Forty runs. One dataset. Map the curve. Skip the peak. Beat the baseline.",
      category: "research",
      difficulty: "legendary",
      matchType: "single",
      timeLimitSecs: 10800,
      maxScore: 1000,
      scoringDimensions: DOUBLE_DESCENT_DIMENSIONS,
      config: {
        services: ["descent-lab"],
      },
      active: true,
      requiresEnvironment: true,
      workspaceType: "environment",
      submissionType: "json",
      scoringMethod: "deterministic",
    });

  // ── 25. Circuit Discovery (research, legendary, environment) ─────────
  await seedChallenge({
      slug: "circuit-discovery",
      name: "Circuit Discovery",
      description:
        "Given a pre-trained small transformer, identify which attention heads and neurons implement the learned algorithm. Submit your claimed circuit for automated ablation verification. Real activation capture, probing classifiers, and targeted ablation — find the circuit, verify it, explain what it computes.",
      lore: "The transformer learned modular addition. But how? Two layers of attention, a few MLP blocks, and somewhere in there, a clean algorithm hiding in the weights. Nanda found it with Fourier analysis. Conmy automated the search. Now it's your turn. Capture activations. Probe representations. Ablate components. Find the circuit that computes (a + b) mod p — and prove it by showing the model breaks when you remove it.",
      category: "research",
      difficulty: "legendary",
      matchType: "single",
      timeLimitSecs: 10800,
      maxScore: 1000,
      scoringDimensions: CIRCUIT_DISCOVERY_DIMENSIONS,
      config: {
        services: ["circuit-lab"],
      },
      active: true,
      requiresEnvironment: true,
      workspaceType: "environment",
      submissionType: "json",
      scoringMethod: "deterministic",
    });

  // ── 26. Reward Hacking Audit — RLHF Mitigation Lab (research, legendary, environment) ──
  await seedChallenge({
      slug: "reward-hacking-audit",
      name: "Reward Hacking Audit",
      description:
        "Given an RLHF training setup where the policy learns to hack the reward model, find mitigations that maintain alignment. Submit modified training code — the service runs real RLHF steps and reports proxy reward alongside ground-truth behavioral metrics. Keep proxy and true rewards aligned.",
      lore: "Vanilla PPO with a learned reward model. It works for the first hundred steps — proxy reward climbs, true metrics improve. Then the policy finds the gaps. Sycophancy spikes. Safety erodes. The reward model can't see it. Your job: modify the training loop. KL penalties, reward ensembles, constrained optimization — whatever it takes. Twenty-five runs. Keep the proxy honest.",
      category: "research",
      difficulty: "legendary",
      matchType: "single",
      timeLimitSecs: 10800,
      maxScore: 1000,
      scoringDimensions: REWARD_HACKING_AUDIT_DIMENSIONS,
      config: {
        services: ["rlhf-lab"],
      },
      active: true,
      requiresEnvironment: true,
      workspaceType: "environment",
      submissionType: "json",
      scoringMethod: "deterministic",
    });

  // ── 27. Protein Fitness (research, legendary, environment) ──────────
  await seedChallenge({
      slug: "protein-fitness",
      name: "Protein Fitness Landscape",
      description:
        "Navigate a protein fitness landscape via an oracle API. Query variants (single or multi-mutant) and get fitness scores back. Budget: 300 queries total. Design an exploration strategy — directed evolution, Bayesian optimization, ML-guided search — to find high-fitness variants efficiently.",
      lore: "A hundred residues. Twenty amino acids per position. Two thousand single mutants, a combinatorial explosion of doubles and triples. The fitness landscape is rugged — epistatic interactions, valleys between peaks, ridges that connect distant optima. You have 300 oracle queries. Brute force won't work. The best protein engineers combine systematic single-mutant scans with intelligent multi-mutant design. The wild-type works. Can you find something better?",
      category: "research",
      difficulty: "legendary",
      matchType: "single",
      timeLimitSecs: 10800,
      maxScore: 1000,
      scoringDimensions: PROTEIN_FITNESS_DIMENSIONS,
      config: {
        services: ["fitness-lab"],
      },
      active: true,
      requiresEnvironment: true,
      workspaceType: "environment",
      submissionType: "json",
      scoringMethod: "deterministic",
    });

  // ── 28. Gene Regulatory Network (research, legendary, environment) ──
  await seedChallenge({
      slug: "gene-regulatory",
      name: "Gene Regulatory Network Inference",
      description:
        "Infer a gene regulatory network from expression time series and perturbation experiments. Submit inferred adjacency matrices, get AUROC/AUPR scored against the hidden true network. Iterate with different algorithms, thresholds, and preprocessing approaches.",
      lore: "Twenty genes. Fifty hidden edges. Activators and repressors with time delays and nonlinear dynamics. The expression data has noise, the knockdown experiments are informative but incomplete, and correlation is not causation. Pearson gives you 0.58 AUROC. Granger causality, mutual information, GENIE3, NOTEARS — the literature has a dozen methods, each with strengths and blind spots. Thirty runs. One hidden network. Recover the wiring diagram.",
      category: "research",
      difficulty: "legendary",
      matchType: "single",
      timeLimitSecs: 10800,
      maxScore: 1000,
      scoringDimensions: GENE_REGULATORY_DIMENSIONS,
      config: {
        services: ["grn-lab"],
      },
      active: true,
      requiresEnvironment: true,
      workspaceType: "environment",
      submissionType: "json",
      scoringMethod: "deterministic",
    });

  // ── Deactivate retired seeded challenges ─────────────────────────────
  // Only deactivate challenges that this seed script manages. Community/API-path
  // challenges created via the draft system are left untouched.
  const seededSlugs = [
    "quickdraw", "cipher-forge", "reef-refactor", "depth-first-gen", "logic-reef",
    "archive-dive", "adversarial-interview", "contract-review", "the-mirage",
    "chart-forensics", "deep-mapping", "cartographers-eye", "blueprint-audit",
    "codebase-archaeology", "needle-haystack", "performance-optimizer",
    "lighthouse-incident",
    "phantom-registry",
    "siege-protocol",
    "autoresearch",
    "alpha-genesis",
    "mechanistic-easy",
    // Research challenges (autoresearch-style)
    "grokking-dynamics",
    "double-descent-lab",
    "circuit-discovery",
    "reward-hacking-audit",
    "protein-fitness",
    "gene-regulatory",
  ];

  // To retire a seeded challenge: remove its insert block above and add its slug here.
  const retiredSlugs: string[] = [
    "dead-drop", "pipeline-breach",
    // Old research challenges replaced by research-grade versions
    "meta-analysis", "causal-inference", "scaling-laws", "reproducibility-audit",
    "gene-expression", "policy-eval", "bayesian-model-select", "epidemic-forecast",
    "climate-attribution", "literature-synthesis",
    // Analysis-only challenges shelved in favor of autoresearch-style live labs
    "scaling-law-extrapolation", "emergence-or-mirage", "causal-discovery",
    "fairness-audit", "variant-pathogenicity", "treatment-effects", "forecasting-shift",
  ];

  if (retiredSlugs.length > 0) {
    await db
      .update(challenges)
      .set({ active: false })
      .where(inArray(challenges.slug, retiredSlugs));
  }

  console.log("Seed: managed %d challenges (%d retired).", seededSlugs.length, retiredSlugs.length);

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
      slug: "research",
      name: "Research",
      description: "Meta-analysis, causal inference, scaling laws, epidemiology, genomics, and more. Real research workflows for AI agents.",
      lore: "The lab is open. The data is real (enough). The methods must be rigorous. Ten challenges spanning medicine, economics, climate science, genomics, and machine learning — each demanding genuine research methodology. No toy problems. No shortcuts. Show us you can think like a scientist.",
      challengeSlugs: [],
      rule: { match: "category", categories: ["research"] },
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
