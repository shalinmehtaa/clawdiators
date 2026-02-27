import { mulberry32 } from "../../services/whimsy.js";

// ── Types ────────────────────────────────────────────────────────────

export interface OptimizerGroundTruth {
  /** The optimal algorithm approach */
  optimal_approach: string;
  /** Expected best-case complexity */
  optimal_complexity: string;
  /** Key optimizations available */
  optimizations: string[];
  /** The function name to optimize */
  function_name: string;
  /** File containing the slow code */
  file_path: string;
}

export interface OptimizerData {
  objective: string;
  groundTruth: OptimizerGroundTruth;
  files: Record<string, string>;
}

// ── Problem Templates ────────────────────────────────────────────────

interface ProblemTemplate {
  name: string;
  file: string;
  description: string;
  slowCode: string;
  fastCode: string;
  benchmarkCode: string;
  testCode: string;
  optimalApproach: string;
  optimalComplexity: string;
  optimizations: string[];
}

function generateProblems(rng: () => number): ProblemTemplate[] {
  const arraySize = 5000 + Math.floor(rng() * 5000);
  const targetValue = Math.floor(rng() * 1000) + 500;

  return [
    {
      name: "findDuplicates",
      file: "src/duplicates.ts",
      description: "Find all duplicate values in an array",
      slowCode: `// Find all values that appear more than once in the array.
// Returns a sorted array of unique duplicate values.
export function findDuplicates(arr: number[]): number[] {
  const duplicates: number[] = [];
  // O(n^2) — compare every pair
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      if (arr[i] === arr[j] && !duplicates.includes(arr[i])) {
        duplicates.push(arr[i]);
      }
    }
  }
  return duplicates.sort((a, b) => a - b);
}`,
      fastCode: `export function findDuplicates(arr: number[]): number[] {
  const seen = new Set<number>();
  const duplicates = new Set<number>();
  for (const val of arr) {
    if (seen.has(val)) duplicates.add(val);
    else seen.add(val);
  }
  return [...duplicates].sort((a, b) => a - b);
}`,
      benchmarkCode: `import { findDuplicates } from "./duplicates";

const SIZE = ${arraySize};
const arr = Array.from({ length: SIZE }, (_, i) => i % ${Math.floor(arraySize * 0.7)});

console.log("Benchmarking findDuplicates with", SIZE, "elements...");
const start = performance.now();
const result = findDuplicates(arr);
const elapsed = performance.now() - start;

console.log(\`Result: \${result.length} duplicates found\`);
console.log(\`Time: \${elapsed.toFixed(2)}ms\`);
console.log(\`Elements/ms: \${(SIZE / elapsed).toFixed(2)}\`);

// Validation
const expected = [...new Set(arr.filter((v, i) => arr.indexOf(v) !== i))].sort((a, b) => a - b);
const pass = JSON.stringify(result) === JSON.stringify(expected);
console.log(\`Correctness: \${pass ? "PASS" : "FAIL"}\`);`,
      testCode: `import { findDuplicates } from "./duplicates";

describe("findDuplicates", () => {
  test("finds duplicates", () => {
    expect(findDuplicates([1, 2, 3, 2, 4, 3])).toEqual([2, 3]);
  });
  test("no duplicates", () => {
    expect(findDuplicates([1, 2, 3])).toEqual([]);
  });
  test("all same", () => {
    expect(findDuplicates([5, 5, 5])).toEqual([5]);
  });
  test("empty", () => {
    expect(findDuplicates([])).toEqual([]);
  });
  test("large array correctness", () => {
    const arr = Array.from({ length: 1000 }, (_, i) => i % 700);
    const result = findDuplicates(arr);
    expect(result.length).toBe(300);
  });
});`,
      optimalApproach: "Use a Set to track seen values; add to duplicates Set on second occurrence",
      optimalComplexity: "O(n) average, O(n log n) for sorting output",
      optimizations: [
        "Replace O(n^2) nested loop with Set-based single pass",
        "Replace duplicates.includes() O(n) check with Set.has() O(1)",
        "Use Set for deduplication instead of manual checking",
      ],
    },
    {
      name: "twoSum",
      file: "src/two-sum.ts",
      description: "Find two numbers in an array that sum to a target value",
      slowCode: `// Find indices of two numbers that add up to the target.
// Returns [index1, index2] or [-1, -1] if no pair found.
export function twoSum(nums: number[], target: number): [number, number] {
  // O(n^2) brute force
  for (let i = 0; i < nums.length; i++) {
    for (let j = i + 1; j < nums.length; j++) {
      if (nums[i] + nums[j] === target) {
        return [i, j];
      }
    }
  }
  return [-1, -1];
}`,
      fastCode: `export function twoSum(nums: number[], target: number): [number, number] {
  const map = new Map<number, number>();
  for (let i = 0; i < nums.length; i++) {
    const complement = target - nums[i];
    if (map.has(complement)) {
      return [map.get(complement)!, i];
    }
    map.set(nums[i], i);
  }
  return [-1, -1];
}`,
      benchmarkCode: `import { twoSum } from "./two-sum";

const SIZE = ${arraySize};
const nums = Array.from({ length: SIZE }, (_, i) => i);
const target = ${targetValue} + ${targetValue + 1}; // indices ${targetValue} and ${targetValue + 1}

console.log("Benchmarking twoSum with", SIZE, "elements...");
const start = performance.now();
const result = twoSum(nums, target);
const elapsed = performance.now() - start;

console.log(\`Result: [\${result}]\`);
console.log(\`Time: \${elapsed.toFixed(2)}ms\`);
console.log(\`Elements/ms: \${(SIZE / elapsed).toFixed(2)}\`);
console.log(\`Correctness: \${result[0] === ${targetValue} && result[1] === ${targetValue + 1} ? "PASS" : "FAIL"}\`);`,
      testCode: `import { twoSum } from "./two-sum";

describe("twoSum", () => {
  test("finds pair", () => {
    expect(twoSum([2, 7, 11, 15], 9)).toEqual([0, 1]);
  });
  test("finds later pair", () => {
    expect(twoSum([3, 2, 4], 6)).toEqual([1, 2]);
  });
  test("no pair", () => {
    expect(twoSum([1, 2, 3], 100)).toEqual([-1, -1]);
  });
  test("large array", () => {
    const nums = Array.from({ length: 10000 }, (_, i) => i);
    const [a, b] = twoSum(nums, 9999);
    expect(nums[a] + nums[b]).toBe(9999);
  });
});`,
      optimalApproach: "Use a HashMap to store seen values; look up complement in O(1)",
      optimalComplexity: "O(n)",
      optimizations: [
        "Replace O(n^2) nested loop with single-pass HashMap approach",
        "Store complement lookup for O(1) pair finding",
        "Early return on first match",
      ],
    },
    {
      name: "sortByFrequency",
      file: "src/frequency-sort.ts",
      description: "Sort array elements by their frequency (most frequent first)",
      slowCode: `// Sort array by element frequency (most frequent first).
// Elements with same frequency maintain original order.
export function sortByFrequency(arr: number[]): number[] {
  // O(n^2) — count each element by scanning entire array
  const counts: Array<{ val: number; count: number; firstIdx: number }> = [];

  for (let i = 0; i < arr.length; i++) {
    let found = false;
    for (const entry of counts) {
      if (entry.val === arr[i]) {
        entry.count++;
        found = true;
        break;
      }
    }
    if (!found) {
      counts.push({ val: arr[i], count: 1, firstIdx: i });
    }
  }

  counts.sort((a, b) => b.count - a.count || a.firstIdx - b.firstIdx);

  const result: number[] = [];
  for (const entry of counts) {
    for (let j = 0; j < entry.count; j++) {
      result.push(entry.val);
    }
  }
  return result;
}`,
      fastCode: `export function sortByFrequency(arr: number[]): number[] {
  const countMap = new Map<number, number>();
  const firstIdx = new Map<number, number>();
  for (let i = 0; i < arr.length; i++) {
    countMap.set(arr[i], (countMap.get(arr[i]) ?? 0) + 1);
    if (!firstIdx.has(arr[i])) firstIdx.set(arr[i], i);
  }
  const entries = [...countMap.entries()].sort(
    (a, b) => b[1] - a[1] || firstIdx.get(a[0])! - firstIdx.get(b[0])!
  );
  const result: number[] = [];
  for (const [val, count] of entries) {
    for (let j = 0; j < count; j++) result.push(val);
  }
  return result;
}`,
      benchmarkCode: `import { sortByFrequency } from "./frequency-sort";

const SIZE = ${arraySize};
const arr = Array.from({ length: SIZE }, () => Math.floor(Math.random() * ${Math.floor(arraySize * 0.3)}));

console.log("Benchmarking sortByFrequency with", SIZE, "elements...");
const start = performance.now();
const result = sortByFrequency(arr);
const elapsed = performance.now() - start;

console.log(\`Result length: \${result.length}\`);
console.log(\`Time: \${elapsed.toFixed(2)}ms\`);
console.log(\`Elements/ms: \${(SIZE / elapsed).toFixed(2)}\`);
console.log(\`Correctness: \${result.length === SIZE ? "PASS" : "FAIL"}\`);`,
      testCode: `import { sortByFrequency } from "./frequency-sort";

describe("sortByFrequency", () => {
  test("sorts by frequency", () => {
    expect(sortByFrequency([1, 2, 2, 3, 3, 3])).toEqual([3, 3, 3, 2, 2, 1]);
  });
  test("preserves order for same frequency", () => {
    const result = sortByFrequency([1, 2, 3]);
    expect(result).toEqual([1, 2, 3]);
  });
  test("single element", () => {
    expect(sortByFrequency([5])).toEqual([5]);
  });
  test("empty", () => {
    expect(sortByFrequency([])).toEqual([]);
  });
});`,
      optimalApproach: "Use a Map for O(1) frequency counting instead of linear scan",
      optimalComplexity: "O(n log n) due to sorting",
      optimizations: [
        "Replace linear-scan counting with Map-based O(1) lookups",
        "Separate frequency counting from sorting",
        "Use Map instead of array search for entry lookup",
      ],
    },
  ];
}

// ── Generator ────────────────────────────────────────────────────────

export function generateOptimizerData(seed: number): OptimizerData {
  const rng = mulberry32(seed);

  const problems = generateProblems(rng);
  const template = problems[Math.floor(rng() * problems.length)];

  const files: Record<string, string> = {};

  // Main source file (slow version)
  files[template.file] = template.slowCode;

  // Benchmark script
  files["benchmark.ts"] = template.benchmarkCode;

  // Test file
  const testPath = template.file.replace("src/", "tests/").replace(".ts", ".test.ts");
  files[testPath] = template.testCode;

  // Config files
  files["package.json"] = `{
  "name": "perf-challenge",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "benchmark": "tsx benchmark.ts",
    "test": "vitest run"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^3.0.0",
    "tsx": "^4.19.0"
  }
}`;

  files["tsconfig.json"] = `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "outDir": "dist",
    "rootDir": "."
  },
  "include": ["src/**/*", "tests/**/*", "benchmark.ts"]
}`;

  const objective =
    `Optimize the \`${template.name}()\` function in \`${template.file}\`. ` +
    `The current implementation is correct but slow. ` +
    `Rewrite it to be as fast as possible while keeping the same behavior. ` +
    `Run the benchmark (benchmark.ts) to measure improvement. Tests must still pass.`;

  return {
    objective,
    groundTruth: {
      optimal_approach: template.optimalApproach,
      optimal_complexity: template.optimalComplexity,
      optimizations: template.optimizations,
      function_name: template.name,
      file_path: template.file,
    },
    files,
  };
}
