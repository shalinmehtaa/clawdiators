import { mulberry32 } from "../../services/whimsy.js";

// ── Types ────────────────────────────────────────────────────────────

export interface ArchaeologyGroundTruth {
  buggy_commit_index: number;
  buggy_commit_message: string;
  bug_description: string;
  correct_function_body: string;
  function_name: string;
  file_path: string;
}

export interface ArchaeologyData {
  objective: string;
  groundTruth: ArchaeologyGroundTruth;
  /** Files for the workspace, keyed by relative path. */
  files: Record<string, string>;
}

// ── Data pools ──────────────────────────────────────────────────────

const FUNCTION_TEMPLATES = [
  {
    name: "calculateDiscount",
    file: "src/pricing.ts",
    correct: `export function calculateDiscount(price: number, discountPct: number): number {
  if (discountPct < 0 || discountPct > 100) throw new Error("Invalid discount");
  return Math.round(price * (1 - discountPct / 100) * 100) / 100;
}`,
    buggy: `export function calculateDiscount(price: number, discountPct: number): number {
  if (discountPct < 0 || discountPct > 100) throw new Error("Invalid discount");
  return Math.round(price * (discountPct / 100) * 100) / 100;
}`,
    test: `import { calculateDiscount } from "./pricing";

describe("calculateDiscount", () => {
  test("10% off 100 = 90", () => {
    expect(calculateDiscount(100, 10)).toBe(90);
  });
  test("50% off 200 = 100", () => {
    expect(calculateDiscount(200, 50)).toBe(100);
  });
  test("0% off keeps price", () => {
    expect(calculateDiscount(99.99, 0)).toBe(99.99);
  });
  test("100% off = 0", () => {
    expect(calculateDiscount(50, 100)).toBe(0);
  });
  test("75% off 80 = 20", () => {
    expect(calculateDiscount(80, 75)).toBe(20);
  });
});`,
    bugDesc: "Returns the discount amount instead of the discounted price (multiplies by discount instead of subtracting it)",
  },
  {
    name: "processOrder",
    file: "src/orders.ts",
    correct: `export function processOrder(items: { price: number; qty: number }[]): number {
  return items.reduce((total, item) => total + item.price * item.qty, 0);
}`,
    buggy: `export function processOrder(items: { price: number; qty: number }[]): number {
  return items.reduce((total, item) => total + item.price + item.qty, 0);
}`,
    test: `import { processOrder } from "./orders";

describe("processOrder", () => {
  test("single item", () => {
    expect(processOrder([{ price: 10, qty: 3 }])).toBe(30);
  });
  test("multiple items", () => {
    expect(processOrder([{ price: 5, qty: 2 }, { price: 10, qty: 1 }])).toBe(20);
  });
  test("empty order", () => {
    expect(processOrder([])).toBe(0);
  });
  test("large order", () => {
    expect(processOrder([{ price: 99.99, qty: 10 }])).toBeCloseTo(999.9);
  });
});`,
    bugDesc: "Adds price + qty instead of multiplying price * qty",
  },
  {
    name: "parseDate",
    file: "src/dates.ts",
    correct: `export function parseDate(input: string): { year: number; month: number; day: number } {
  const parts = input.split("-");
  if (parts.length !== 3) throw new Error("Invalid date format");
  return { year: parseInt(parts[0]), month: parseInt(parts[1]), day: parseInt(parts[2]) };
}`,
    buggy: `export function parseDate(input: string): { year: number; month: number; day: number } {
  const parts = input.split("-");
  if (parts.length !== 3) throw new Error("Invalid date format");
  return { year: parseInt(parts[2]), month: parseInt(parts[1]), day: parseInt(parts[0]) };
}`,
    test: `import { parseDate } from "./dates";

describe("parseDate", () => {
  test("parses 2024-03-15", () => {
    expect(parseDate("2024-03-15")).toEqual({ year: 2024, month: 3, day: 15 });
  });
  test("parses 2000-01-01", () => {
    expect(parseDate("2000-01-01")).toEqual({ year: 2000, month: 1, day: 1 });
  });
  test("rejects invalid", () => {
    expect(() => parseDate("not-a-date")).toThrow();
  });
});`,
    bugDesc: "Swaps year and day — returns day as year and year as day",
  },
  {
    name: "averageScore",
    file: "src/stats.ts",
    correct: `export function averageScore(scores: number[]): number {
  if (scores.length === 0) return 0;
  const sum = scores.reduce((a, b) => a + b, 0);
  return Math.round((sum / scores.length) * 100) / 100;
}`,
    buggy: `export function averageScore(scores: number[]): number {
  if (scores.length === 0) return 0;
  const sum = scores.reduce((a, b) => a + b, 0);
  return Math.round((sum / (scores.length - 1)) * 100) / 100;
}`,
    test: `import { averageScore } from "./stats";

describe("averageScore", () => {
  test("average of [80, 90, 100]", () => {
    expect(averageScore([80, 90, 100])).toBe(90);
  });
  test("average of [50]", () => {
    expect(averageScore([50])).toBe(50);
  });
  test("empty array", () => {
    expect(averageScore([])).toBe(0);
  });
  test("decimal average", () => {
    expect(averageScore([1, 2, 3])).toBe(2);
  });
});`,
    bugDesc: "Divides by (length - 1) instead of length — off-by-one in denominator",
  },
];

const COMMIT_MESSAGES_INNOCENT = [
  "Add initial project structure",
  "Set up TypeScript configuration",
  "Add utility helper functions",
  "Update README with usage docs",
  "Refactor module imports",
  "Add input validation",
  "Improve error messages",
  "Add type definitions",
  "Clean up whitespace",
  "Update dependencies",
  "Add logging support",
  "Fix typo in comments",
  "Optimize loop performance",
  "Add config file",
  "Restructure directory layout",
];

const HELPER_FILES: Record<string, string> = {
  "src/utils.ts": `export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}`,
  "src/config.ts": `export const CONFIG = {
  appName: "reef-commerce",
  version: "2.1.0",
  maxRetries: 3,
  timeoutMs: 5000,
};`,
  "src/logger.ts": `export function log(level: "info" | "warn" | "error", msg: string): void {
  const ts = new Date().toISOString();
  console.log(\`[\${ts}] [\${level.toUpperCase()}] \${msg}\`);
}`,
  "src/index.ts": `export { clamp, capitalize, sleep } from "./utils";
export { CONFIG } from "./config";
export { log } from "./logger";`,
  "tsconfig.json": `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*", "tests/**/*"]
}`,
  "package.json": `{
  "name": "reef-commerce",
  "version": "2.1.0",
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "build": "tsc"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}`,
};

// ── Generator ────────────────────────────────────────────────────────

export function generateArchaeologyData(seed: number): ArchaeologyData {
  const rng = mulberry32(seed);
  const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];
  const randInt = (min: number, max: number) => Math.floor(rng() * (max - min + 1)) + min;

  // Pick a function template
  const template = pick(FUNCTION_TEMPLATES);

  // Generate a "commit history" by listing commit messages.
  // The buggy commit is inserted at a random position.
  const totalCommits = randInt(12, 20);
  const buggyCommitIndex = randInt(3, totalCommits - 3); // not first or last few

  // Pick commit messages
  const shuffledMsgs = [...COMMIT_MESSAGES_INNOCENT];
  for (let i = shuffledMsgs.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffledMsgs[i], shuffledMsgs[j]] = [shuffledMsgs[j], shuffledMsgs[i]];
  }

  const buggyCommitMsg = pick([
    `Refactor ${template.name} for clarity`,
    `Update ${template.name} logic`,
    `Simplify ${template.name} implementation`,
    `Fix edge case in ${template.name}`,
  ]);

  // Build git log as a text file (we can't use real git, so we simulate it)
  const commits: Array<{ hash: string; index: number; message: string; isBuggy: boolean }> = [];
  for (let i = 0; i < totalCommits; i++) {
    // Deterministic fake hash
    const hashSeed = mulberry32(seed + i * 7919);
    const hash = Array.from({ length: 8 }, () =>
      "0123456789abcdef"[Math.floor(hashSeed() * 16)]
    ).join("");

    if (i === buggyCommitIndex) {
      commits.push({ hash, index: i, message: buggyCommitMsg, isBuggy: true });
    } else {
      const msg = shuffledMsgs[i % shuffledMsgs.length];
      commits.push({ hash, index: i, message: msg, isBuggy: false });
    }
  }

  // Build the git log text (newest first)
  const gitLog = [...commits].reverse().map((c, displayIdx) => {
    const daysAgo = displayIdx;
    return `commit ${c.hash}\nDate: ${daysAgo} days ago\n\n    ${c.message}\n`;
  }).join("\n");

  // Build files — the code has the BUGGY version (as if we're on the latest commit with the bug)
  const files: Record<string, string> = { ...HELPER_FILES };

  // Add the buggy source file
  files[template.file] = template.buggy;

  // Add the test file
  const testPath = template.file.replace("src/", "tests/").replace(".ts", ".test.ts");
  files[testPath] = template.test;

  // Add git log
  files["GIT_LOG.txt"] = gitLog;

  // Add a commit diff showing what the buggy commit changed
  const buggyCommit = commits[buggyCommitIndex];
  const diffBefore = template.correct;
  const diffAfter = template.buggy;

  files["COMMIT_HISTORY.md"] = `# Commit History

Total commits: ${totalCommits}

## Commits (newest first)

${[...commits].reverse().map(c =>
    `- \`${c.hash}\` ${c.message}`
  ).join("\n")}

## Suspect Commits (touched ${template.file})

The following commits modified \`${template.file}\`:

${commits
    .filter((_, i) => i === buggyCommitIndex || (rng() < 0.3 && i !== buggyCommitIndex))
    .map(c => `- \`${c.hash}\` ${c.message}`)
    .join("\n")}
`;

  // Add the diff for each commit that touched the file
  files[`diffs/${buggyCommit.hash}.diff`] = `diff --git a/${template.file} b/${template.file}
--- a/${template.file}
+++ b/${template.file}
${generateSimpleDiff(diffBefore, diffAfter)}`;

  const objective = `A regression was reported: \`${template.name}()\` in \`${template.file}\` is producing incorrect results. ` +
    `The test suite in \`${testPath}\` has failing tests. ` +
    `Review the commit history, find the commit that introduced the bug, fix the code, and ensure tests pass.`;

  return {
    objective,
    groundTruth: {
      buggy_commit_index: buggyCommitIndex,
      buggy_commit_message: buggyCommitMsg,
      bug_description: template.bugDesc,
      correct_function_body: template.correct,
      function_name: template.name,
      file_path: template.file,
    },
    files,
  };
}

function generateSimpleDiff(before: string, after: string): string {
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  const lines: string[] = [];
  const maxLen = Math.max(beforeLines.length, afterLines.length);
  for (let i = 0; i < maxLen; i++) {
    const b = beforeLines[i];
    const a = afterLines[i];
    if (b === a) {
      lines.push(` ${b ?? ""}`);
    } else {
      if (b !== undefined) lines.push(`-${b}`);
      if (a !== undefined) lines.push(`+${a}`);
    }
  }
  return lines.join("\n");
}
