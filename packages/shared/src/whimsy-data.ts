import type { TitleDef } from "./types";

// Bout name components
export const BOUT_ADJECTIVES = [
  "Crimson",
  "Vermilion",
  "Abyssal",
  "Coral",
  "Tidal",
  "Brine-Soaked",
  "Shell-Cracking",
  "Tempest-Forged",
  "Obsidian",
  "Phosphorescent",
  "Iron-Clad",
  "Saltwater",
  "Kelp-Wreathed",
  "Barnacle-Studded",
  "Thunder-Shelled",
  "Midnight",
  "Pearlescent",
  "Volcanic",
  "Frost-Tipped",
  "Ancient",
  "Sunken",
  "Riptide",
  "Brackish",
  "Luminous",
  "Cerulean",
  "Stormborn",
  "Reef-Scarred",
  "Trench-Deep",
  "Crystal",
  "Ember-Touched",
];

export const BOUT_NOUNS = [
  "Verdict",
  "Reckoning",
  "Clash",
  "Pinch",
  "Showdown",
  "Bout",
  "Duel",
  "Trial",
  "Convergence",
  "Reckoning",
  "Skirmish",
  "Contest",
  "Gauntlet",
  "Fracas",
  "Melee",
  "Sortie",
  "Engagement",
  "Crucible",
  "Tempest",
  "Upheaval",
  "Cataclysm",
  "Maelstrom",
  "Crescendo",
  "Eclipse",
  "Onslaught",
  "Cascade",
  "Avalanche",
  "Torrent",
  "Eruption",
  "Salvo",
];

// Title definitions — ordered by precedence (highest first)
export const TITLES: TitleDef[] = [
  {
    name: "Leviathan",
    requirement: "Reach 2000 Elo",
    check: (a) => a.elo >= 2000,
  },
  {
    name: "Diamond Shell",
    requirement: "Reach 1800 Elo",
    check: (a) => a.elo >= 1800,
  },
  {
    name: "Golden Claw",
    requirement: "Reach 1600 Elo",
    check: (a) => a.elo >= 1600,
  },
  {
    name: "Silver Pincer",
    requirement: "Reach 1400 Elo",
    check: (a) => a.elo >= 1400,
  },
  {
    name: "Bronze Carapace",
    requirement: "Reach 1200 Elo",
    check: (a) => a.elo >= 1200,
  },
  {
    name: "Shell Commander",
    requirement: "Win 10 matches",
    check: (a) => a.winCount >= 10,
  },
  {
    name: "Arena Architect",
    requirement: "Author 1 approved community challenge",
    check: (a) => (a.challengesAuthored ?? 0) >= 1,
  },
  {
    name: "Claw Proven",
    requirement: "Win 3 matches",
    check: (a) => a.winCount >= 3,
  },
  {
    name: "Seasoned Scuttler",
    requirement: "Complete 5 matches",
    check: (a) => a.matchCount >= 5,
  },
  {
    name: "Arena Initiate",
    requirement: "Complete 1 match",
    check: (a) => a.matchCount >= 1,
  },
  {
    name: "Fresh Hatchling",
    requirement: "Just registered",
    check: () => true,
  },
];

// Flavour text templates
export const FLAVOUR_WIN = [
  "{agentName} crushes {boutName} with a score of {score}! The Clawloseum trembles. ({eloChange})",
  "Victory tastes like sea salt. {agentName} claims {boutName} — {score} points of pure dominance. ({eloChange})",
  "The crowd roars as {agentName} conquers {boutName}! Score: {score}. ({eloChange})",
  "{agentName} scuttles triumphantly from {boutName}. {score} points — the shell stands strong. ({eloChange})",
  "A devastating performance! {agentName} takes {boutName} with {score}. ({eloChange})",
];

export const FLAVOUR_LOSS = [
  "{agentName} falls in {boutName}. Score: {score}. The ocean remembers. ({eloChange})",
  "The tides turn against {agentName} in {boutName}. {score} points — a lesson in humility. ({eloChange})",
  "{boutName} proves too much for {agentName}. Score: {score}. But every molt makes you stronger. ({eloChange})",
  "A tough day at the Clawloseum. {agentName} scores {score} in {boutName}. ({eloChange})",
  "{agentName} retreats from {boutName} with {score}. The shell is cracked, but not broken. ({eloChange})",
];

export const FLAVOUR_DRAW = [
  "{agentName} holds steady in {boutName}. Score: {score}. Neither victory nor defeat — the ocean is patient. ({eloChange})",
  "A balanced showing! {agentName} earns {score} in {boutName}. The scales tip to neither side. ({eloChange})",
  "{boutName} ends in equilibrium. {agentName} scores {score}. ({eloChange})",
];

export const FLAVOUR_REGISTER = [
  "A new challenger approaches! {agentName} enters the Clawloseum. The waters ripple.",
  "{agentName} has been spotted near the Clawloseum gates. Fresh shell, sharp claws.",
  "The Clawloseum welcomes {agentName}. May your pincers be swift and your shell unyielding.",
  "Another contender joins the fray! {agentName} scuttles into the colosseum.",
];

export const FLAVOUR_TITLE = [
  "{agentName} has earned the title of {title}! The Clawloseum acknowledges their prowess.",
  "Hear ye! {agentName} is now known as {title}! A shell worthy of legend.",
  "The title of {title} has been bestowed upon {agentName}. The depths echo with respect.",
];

export const FLAVOUR_HEALTH = [
  "The Clawloseum stirs...",
  "Claws sharpened, shell polished. Ready.",
  "The tides are favorable. The Clawloseum awaits.",
  "Deep beneath the waves, the colosseum hums with anticipation.",
];

// Fictional stock tickers
export const STOCK_TICKERS = [
  "CLWX",
  "SOLR",
  "DPTH",
  "KRLL",
  "REEF",
  "TRNT",
  "ANCH",
  "BRNE",
  "PLNK",
  "SHEL",
];

// Cities for weather API
export const WEATHER_CITIES = [
  "Clawston",
  "Pinchford",
  "Shellhaven",
  "Tidemoore",
  "Brinegate",
  "Coralwick",
  "Reefbury",
  "Kelpshire",
  "Abyssford",
  "Pearlton",
  "Barnacle Bay",
  "Trenchville",
  "Molton",
  "Surfcrest",
  "Depthsend",
  "Clamharbor",
  "Lobsterville",
  "Wavebreak",
  "Saltmere",
  "Anchorpoint",
];

// Weather conditions
export const WEATHER_CONDITIONS = [
  "sunny",
  "partly cloudy",
  "overcast",
  "light rain",
  "heavy rain",
  "thunderstorm",
  "foggy",
  "windy",
  "clear skies",
  "drizzle",
];

// News topics
export const NEWS_TOPICS = [
  "Maritime Commerce",
  "Deep Sea Technology",
  "Clawloseum Sports",
  "Tidal Politics",
  "Reef Conservation",
];
