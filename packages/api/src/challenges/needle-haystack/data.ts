import { mulberry32 } from "../../services/whimsy.js";

// ── Types ────────────────────────────────────────────────────────────

export interface HaystackGroundTruth {
  answers: Array<{
    question_id: number;
    answer: string;
    source_files: string[];
  }>;
}

export interface HaystackData {
  objective: string;
  groundTruth: HaystackGroundTruth;
  files: Record<string, string>;
}

// ── Data pools ──────────────────────────────────────────────────────

const REEF_NAMES = [
  "Crimson Atoll", "Midnight Trench", "Jade Shallows", "Obsidian Shelf",
  "Pearl Basin", "Sapphire Ridge", "Coral Throne", "Amber Deep",
  "Emerald Narrows", "Iron Coast", "Opal Cavern", "Ruby Seamount",
  "Frost Reef", "Copper Banks", "Silver Drift", "Onyx Abyss",
];

const SPECIES = [
  "Giant Reef Crab", "Blue-Ring Nautilus", "Crimson Starfish",
  "Deep Sea Anglerfish", "Electric Eel", "Phantom Jellyfish",
  "Golden Seahorse", "Iron Lobster", "Jade Mantis Shrimp",
  "Kelp Dragon", "Luminous Squid", "Midnight Octopus",
  "Noble Pufferfish", "Opal Clam", "Pearl Whale",
];

const TRADE_GOODS = [
  "refined coral", "deep-sea pearls", "phosphorescent algae",
  "abyssal iron", "sea silk", "volcanic glass",
  "bioluminescent dye", "nautilus shell fragments", "kelp fiber",
  "tidal crystals", "reef amber", "obsidian shards",
];

const EVENT_TYPES = [
  "volcanic eruption", "great migration", "tidal shift",
  "coral bleaching", "treaty signing", "trade route opening",
  "territorial dispute", "species discovery", "resource depletion",
  "storm damage", "population boom", "diplomatic summit",
];

// ── Generator ────────────────────────────────────────────────────────

export function generateHaystackData(seed: number): HaystackData {
  const rng = mulberry32(seed);
  const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];
  const randInt = (min: number, max: number) => Math.floor(rng() * (max - min + 1)) + min;
  const pickN = <T>(arr: T[], n: number): T[] => {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, n);
  };

  // Select 8 reef regions for this universe
  const regions = pickN(REEF_NAMES, 8);
  // Select species and goods
  const activeSpecies = pickN(SPECIES, 10);
  const activeGoods = pickN(TRADE_GOODS, 8);

  // Generate fact database: each "needle" is a specific fact planted across documents
  const needles: Array<{
    questionId: number;
    question: string;
    answer: string;
    plantedIn: string[];
    factSnippets: string[];
  }> = [];

  // Needle 1: What is the total population across all regions?
  const populations: Record<string, number> = {};
  for (const region of regions) {
    populations[region] = randInt(5000, 50000);
  }
  const totalPop = Object.values(populations).reduce((a, b) => a + b, 0);
  needles.push({
    questionId: 1,
    question: "What is the total combined population across all documented regions?",
    answer: String(totalPop),
    plantedIn: ["census-report.txt", "regional-overview.txt"],
    factSnippets: regions.map(r => `${r}: population ${populations[r].toLocaleString()}`),
  });

  // Needle 2: Which region exports the most trade goods?
  const exports: Record<string, string[]> = {};
  for (const region of regions) {
    const count = randInt(1, 4);
    exports[region] = pickN(activeGoods, count);
  }
  const topExporter = regions.reduce((a, b) => exports[a].length >= exports[b].length ? a : b);
  needles.push({
    questionId: 2,
    question: "Which region exports the highest number of distinct trade goods?",
    answer: topExporter,
    plantedIn: ["trade-ledger.txt", "economic-report.txt"],
    factSnippets: regions.map(r => `${r} exports: ${exports[r].join(", ")}`),
  });

  // Needle 3: Which species was discovered most recently?
  const discoveries: Array<{ species: string; year: number; region: string }> = [];
  for (const sp of activeSpecies) {
    discoveries.push({
      species: sp,
      year: randInt(1800, 2024),
      region: pick(regions),
    });
  }
  discoveries.sort((a, b) => a.year - b.year);
  const mostRecent = discoveries[discoveries.length - 1];
  needles.push({
    questionId: 3,
    question: "Which species was discovered most recently, and in what year?",
    answer: `${mostRecent.species}, ${mostRecent.year}`,
    plantedIn: ["species-catalog.txt", "discovery-log.txt"],
    factSnippets: discoveries.map(d => `${d.species}: discovered ${d.year} in ${d.region}`),
  });

  // Needle 4: What event affected the most regions simultaneously?
  const events: Array<{ type: string; year: number; regions: string[] }> = [];
  for (let i = 0; i < 12; i++) {
    const affectedCount = randInt(1, 5);
    events.push({
      type: pick(EVENT_TYPES),
      year: randInt(1900, 2024),
      regions: pickN(regions, affectedCount),
    });
  }
  const biggestEvent = events.reduce((a, b) => a.regions.length >= b.regions.length ? a : b);
  needles.push({
    questionId: 4,
    question: "What event type affected the most regions simultaneously, and how many regions were affected?",
    answer: `${biggestEvent.type}, ${biggestEvent.regions.length} regions`,
    plantedIn: ["historical-events.txt", "regional-overview.txt"],
    factSnippets: events.map(e => `${e.year}: ${e.type} affected ${e.regions.join(", ")}`),
  });

  // Needle 5: Cross-reference — which region has both the highest population AND is a top exporter?
  const popRanked = [...regions].sort((a, b) => populations[b] - populations[a]);
  const exportRanked = [...regions].sort((a, b) => exports[b].length - exports[a].length);
  // Find first region in top 3 of both
  let crossRefAnswer = "none";
  for (const region of popRanked.slice(0, 3)) {
    if (exportRanked.slice(0, 3).includes(region)) {
      crossRefAnswer = region;
      break;
    }
  }
  if (crossRefAnswer === "none") {
    crossRefAnswer = popRanked[0]; // fallback
  }
  needles.push({
    questionId: 5,
    question: "Which region ranks in the top 3 for both population and number of distinct exports?",
    answer: crossRefAnswer,
    plantedIn: ["census-report.txt", "trade-ledger.txt"],
    factSnippets: [
      `Population ranking: ${popRanked.slice(0, 3).map(r => `${r} (${populations[r]})`).join(", ")}`,
      `Export ranking: ${exportRanked.slice(0, 3).map(r => `${r} (${exports[r].length} goods)`).join(", ")}`,
    ],
  });

  // ── Generate document files ───────────────────────────────────────
  const files: Record<string, string> = {};

  // Census report
  files["documents/census-report.txt"] = generateCensusReport(regions, populations, rng);

  // Trade ledger
  files["documents/trade-ledger.txt"] = generateTradeLedger(regions, exports, activeGoods, rng);

  // Species catalog
  files["documents/species-catalog.txt"] = generateSpeciesCatalog(discoveries, rng);

  // Discovery log
  files["documents/discovery-log.txt"] = generateDiscoveryLog(discoveries, rng);

  // Historical events
  files["documents/historical-events.txt"] = generateEventsDoc(events, rng);

  // Regional overview
  files["documents/regional-overview.txt"] = generateRegionalOverview(regions, populations, exports, events, rng);

  // Economic report
  files["documents/economic-report.txt"] = generateEconomicReport(regions, exports, activeGoods, rng);

  // Generate 8 additional filler documents (noise)
  for (let i = 0; i < 8; i++) {
    const fillerName = pick([
      "navigation-charts", "weather-patterns", "cultural-notes",
      "construction-records", "diplomatic-correspondence", "resource-surveys",
      "marine-biology-notes", "geological-survey", "fishing-quotas",
      "shipping-manifests", "port-authority-logs", "environmental-assessment",
    ]);
    files[`documents/${fillerName}-${i + 1}.txt`] = generateFillerDoc(
      `${fillerName}-${i + 1}`, regions, activeSpecies, rng
    );
  }

  // Questions file
  files["QUESTIONS.json"] = JSON.stringify(
    needles.map(n => ({ id: n.questionId, question: n.question })),
    null,
    2,
  );

  const objective =
    `Search through the document corpus in the documents/ directory. ` +
    `Answer the ${needles.length} questions listed in QUESTIONS.json. ` +
    `Each answer requires cross-referencing information across multiple documents.`;

  return {
    objective,
    groundTruth: {
      answers: needles.map(n => ({
        question_id: n.questionId,
        answer: n.answer,
        source_files: n.plantedIn,
      })),
    },
    files,
  };
}

// ── Document generators ──────────────────────────────────────────────

function generateCensusReport(
  regions: string[],
  populations: Record<string, number>,
  rng: () => number,
): string {
  let doc = "=== ANNUAL REEF CENSUS REPORT ===\n\n";
  doc += "Compiled by the Bureau of Reef Statistics\n";
  doc += `Report year: ${Math.floor(rng() * 5) + 2020}\n\n`;
  doc += "--- POPULATION DATA ---\n\n";

  for (const region of regions) {
    const pop = populations[region];
    const growth = (rng() * 10 - 3).toFixed(1);
    doc += `Region: ${region}\n`;
    doc += `  Registered inhabitants: ${pop.toLocaleString()}\n`;
    doc += `  Year-over-year growth: ${growth}%\n`;
    doc += `  Housing units: ${Math.floor(pop / (2 + rng() * 2)).toLocaleString()}\n`;
    doc += `  Median depth of residence: ${Math.floor(rng() * 500 + 50)}m\n\n`;
  }

  doc += "--- END OF CENSUS REPORT ---\n";
  return doc;
}

function generateTradeLedger(
  regions: string[],
  exports: Record<string, string[]>,
  allGoods: string[],
  rng: () => number,
): string {
  let doc = "=== INTER-REEF TRADE LEDGER ===\n\n";
  doc += "Quarter 4 Summary\n\n";

  for (const region of regions) {
    doc += `--- ${region.toUpperCase()} ---\n`;
    doc += `Exports:\n`;
    for (const good of exports[region]) {
      const vol = Math.floor(rng() * 10000 + 500);
      doc += `  - ${good}: ${vol.toLocaleString()} units\n`;
    }
    doc += `Total export categories: ${exports[region].length}\n`;
    doc += `Trade balance: ${(rng() * 200000 - 50000).toFixed(0)} credits\n\n`;
  }

  doc += "--- COMMODITY PRICE INDEX ---\n\n";
  for (const good of allGoods) {
    doc += `${good}: ${(rng() * 100 + 5).toFixed(2)} credits/unit\n`;
  }

  return doc;
}

function generateSpeciesCatalog(
  discoveries: Array<{ species: string; year: number; region: string }>,
  rng: () => number,
): string {
  let doc = "=== REEF SPECIES CATALOG ===\n\n";
  doc += "Maintained by the Academy of Marine Sciences\n\n";

  for (const d of discoveries) {
    doc += `## ${d.species}\n`;
    doc += `First documented: ${d.year}\n`;
    doc += `Primary habitat: ${d.region}\n`;
    doc += `Conservation status: ${["stable", "threatened", "endangered", "recovering"][Math.floor(rng() * 4)]}\n`;
    doc += `Average size: ${(rng() * 200 + 5).toFixed(1)}cm\n`;
    doc += `Diet: ${["herbivore", "carnivore", "omnivore", "filter feeder"][Math.floor(rng() * 4)]}\n`;
    doc += `Notable features: ${["bioluminescent", "venomous", "armored", "camouflaged", "migratory"][Math.floor(rng() * 5)]}\n\n`;
  }

  return doc;
}

function generateDiscoveryLog(
  discoveries: Array<{ species: string; year: number; region: string }>,
  rng: () => number,
): string {
  let doc = "=== DISCOVERY LOG: CHRONOLOGICAL ===\n\n";

  const sorted = [...discoveries].sort((a, b) => a.year - b.year);
  for (const d of sorted) {
    doc += `[${d.year}] ${d.species}\n`;
    doc += `  Location: ${d.region}\n`;
    doc += `  Discovered by: Dr. ${["Coral", "Reef", "Deep", "Shell", "Wave"][Math.floor(rng() * 5)]} ${["Morrison", "Chen", "Okonkwo", "Petrov", "Santos"][Math.floor(rng() * 5)]}\n`;
    doc += `  Expedition: ${["Deep Survey", "Coastal Mapping", "Biodiversity Census", "Resource Expedition"][Math.floor(rng() * 4)]}\n\n`;
  }

  return doc;
}

function generateEventsDoc(
  events: Array<{ type: string; year: number; regions: string[] }>,
  rng: () => number,
): string {
  let doc = "=== HISTORICAL EVENTS CHRONICLE ===\n\n";

  const sorted = [...events].sort((a, b) => a.year - b.year);
  for (const e of sorted) {
    doc += `[${e.year}] ${e.type.toUpperCase()}\n`;
    doc += `  Affected regions: ${e.regions.join(", ")}\n`;
    doc += `  Severity: ${["minor", "moderate", "major", "catastrophic"][Math.floor(rng() * 4)]}\n`;
    doc += `  Duration: ${Math.floor(rng() * 24 + 1)} months\n`;
    doc += `  Estimated impact: ${Math.floor(rng() * 1000000)} credits\n\n`;
  }

  return doc;
}

function generateRegionalOverview(
  regions: string[],
  populations: Record<string, number>,
  exports: Record<string, string[]>,
  events: Array<{ type: string; year: number; regions: string[] }>,
  rng: () => number,
): string {
  let doc = "=== REGIONAL OVERVIEW ===\n\n";
  doc += "Comprehensive summary of all documented reef regions.\n\n";

  for (const region of regions) {
    doc += `### ${region}\n`;
    doc += `Population: ${populations[region].toLocaleString()}\n`;
    doc += `Primary exports: ${exports[region].join(", ")}\n`;
    doc += `Depth range: ${Math.floor(rng() * 100 + 10)}-${Math.floor(rng() * 500 + 200)}m\n`;
    doc += `Climate: ${["tropical", "temperate", "arctic", "volcanic"][Math.floor(rng() * 4)]}\n`;

    const regionEvents = events.filter(e => e.regions.includes(region));
    if (regionEvents.length > 0) {
      doc += `Notable events: ${regionEvents.map(e => `${e.type} (${e.year})`).join("; ")}\n`;
    }
    doc += `\n`;
  }

  return doc;
}

function generateEconomicReport(
  regions: string[],
  exports: Record<string, string[]>,
  allGoods: string[],
  rng: () => number,
): string {
  let doc = "=== ECONOMIC ANALYSIS REPORT ===\n\n";
  doc += "Inter-Reef Economic Council\n\n";

  doc += "## Trade Volume Summary\n\n";
  for (const region of regions) {
    doc += `${region}: ${exports[region].length} export categories, `;
    doc += `total volume ${Math.floor(rng() * 50000 + 5000).toLocaleString()} units\n`;
  }

  doc += "\n## Commodity Analysis\n\n";
  for (const good of allGoods) {
    doc += `${good}:\n`;
    doc += `  Producers: ${regions.filter(r => exports[r].includes(good)).join(", ") || "none"}\n`;
    doc += `  Demand trend: ${["rising", "stable", "declining"][Math.floor(rng() * 3)]}\n\n`;
  }

  return doc;
}

function generateFillerDoc(
  title: string,
  regions: string[],
  species: string[],
  rng: () => number,
): string {
  const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];
  let doc = `=== ${title.toUpperCase().replace(/-/g, " ")} ===\n\n`;

  // Generate plausible-looking filler content
  const paragraphs = Math.floor(rng() * 8) + 4;
  for (let i = 0; i < paragraphs; i++) {
    const region = pick(regions);
    const sp = pick(species);
    const templates = [
      `The ${region} region reported ${Math.floor(rng() * 100)} incidents during the survey period. ` +
        `Notable observations include ${sp} activity near the ${pick(["northern", "southern", "eastern", "western"])} boundary.`,
      `Survey team ${Math.floor(rng() * 20) + 1} documented conditions in ${region}. ` +
        `Water temperature averaged ${(rng() * 15 + 10).toFixed(1)}°C with visibility of ${Math.floor(rng() * 30 + 5)}m.`,
      `Maintenance records for ${region} indicate ${Math.floor(rng() * 50)} structures require attention. ` +
        `Priority level: ${["low", "medium", "high"][Math.floor(rng() * 3)]}.`,
      `The ${sp} population in ${region} showed ${["growth", "decline", "stability"][Math.floor(rng() * 3)]} ` +
        `over the monitoring period. Further study recommended.`,
    ];
    doc += pick(templates) + "\n\n";
  }

  return doc;
}
