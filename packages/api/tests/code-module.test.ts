import { describe, it, expect } from "vitest";
import { createCodeModule } from "../src/challenges/primitives/code-module.js";
import {
  checkCodeSyntax,
  checkCodeSecurity,
  checkContentSafety,
  checkDeterminism,
  checkBaselineSolveability,
  checkAntiGaming,
  runAllGates,
  buildModuleForSpec,
} from "../src/challenges/primitives/gates.js";
import { validateSpec } from "../src/challenges/primitives/validator.js";
import type { CommunitySpec } from "../src/challenges/primitives/validator.js";

// ── Fixtures ──────────────────────────────────────────────────────────

const validDataJs = `
function generateData(seed) {
  var random = rng(seed);
  var target = Math.floor(random() * 1000);
  var isEven = target % 2 === 0;
  return {
    objective: "Find the number. Clue: it is " + (isEven ? "even" : "odd") + ".",
    groundTruth: { answer: target },
    clue: isEven ? "even" : "odd",
  };
}
module.exports = { generateData: generateData };
`;

const validScorerJs = `
function score(input) {
  var submission = input.submission;
  var groundTruth = input.groundTruth;
  var correct = submission.answer === groundTruth.answer;
  var accuracy = correct ? 700 : 0;
  var elapsed = (new Date(input.submittedAt) - new Date(input.startedAt)) / 1000;
  var speed = Math.round(Math.max(0, 1 - elapsed / 120) * 300);
  return { breakdown: { accuracy: accuracy, speed: speed, total: accuracy + speed } };
}
module.exports = { score: score };
`;

const validWorkspaceJs = `
function generateWorkspace(seed) {
  var data = generateData(seed);
  return {
    "puzzle.json": JSON.stringify({ clue: data.clue }, null, 2),
    "instructions.txt": "Read puzzle.json and find the target number.",
  };
}
module.exports = { generateWorkspace: generateWorkspace };
`;

const validValidatorJs = `
function validate(submission, groundTruth) {
  var warnings = [];
  if (submission.answer === undefined) {
    warnings.push({ severity: "error", field: "answer", message: "Missing answer field" });
  } else if (typeof submission.answer !== "number") {
    warnings.push({ severity: "warning", field: "answer", message: "Answer should be a number" });
  }
  return warnings;
}
module.exports = { validate: validate };
`;

const validHelpersJs = `
function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max);
}
`;

const codeBasedSpec: CommunitySpec = {
  slug: "code-test",
  name: "Code Test Challenge",
  description: "A code-based challenge for testing the code module system.",
  lore: "The ancient code scrolls contain wisdom for those who dare to run them.",
  category: "reasoning",
  difficulty: "newcomer",
  matchType: "single",
  timeLimitSecs: 120,
  workspace: {
    type: "generator",
    seedable: true,
    challengeMd: "# Code Test\n\nFind the number with seed {{seed}}.\n\n## Submission\nSubmit JSON with `answer` field.",
  },
  submission: { type: "json", schema: { answer: "number" } },
  scoring: {
    method: "deterministic",
    dimensions: [
      { key: "accuracy", label: "Accuracy", weight: 0.7, description: "Correctness of answer", color: "emerald" },
      { key: "speed", label: "Speed", weight: 0.3, description: "Time efficiency", color: "sky" },
    ],
    maxScore: 1000,
  },
  codeFiles: {
    "data.js": validDataJs,
    "scorer.js": validScorerJs,
  },
};

// ── createCodeModule ──────────────────────────────────────────────────

describe("createCodeModule", () => {
  it("creates a module with correct slug and dimensions", () => {
    const mod = createCodeModule(codeBasedSpec);
    expect(mod.slug).toBe("code-test");
    expect(mod.dimensions).toHaveLength(2);
    expect(mod.dimensions[0].key).toBe("accuracy");
  });

  it("sets scoringSpec.method to custom-script", () => {
    const mod = createCodeModule(codeBasedSpec);
    expect(mod.scoringSpec?.method).toBe("custom-script");
  });

  it("generateData returns objective and groundTruth", () => {
    const mod = createCodeModule(codeBasedSpec);
    const data = mod.generateData(42, {});
    expect(data.objective).toContain("Find the number");
    expect(data.groundTruth).toBeDefined();
    expect(typeof data.groundTruth.answer).toBe("number");
  });

  it("generateData is deterministic — same seed produces same output", () => {
    const mod = createCodeModule(codeBasedSpec);
    const a = mod.generateData(42, {});
    const b = mod.generateData(42, {});
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("generateData produces different output for different seeds", () => {
    const mod = createCodeModule(codeBasedSpec);
    const a = mod.generateData(42, {});
    const b = mod.generateData(123, {});
    expect(a.groundTruth.answer).not.toBe(b.groundTruth.answer);
  });

  it("score returns correct breakdown for exact match", () => {
    const mod = createCodeModule(codeBasedSpec);
    const data = mod.generateData(42, {});
    const now = new Date();
    const result = mod.score({
      submission: { answer: data.groundTruth.answer },
      groundTruth: data.groundTruth,
      startedAt: new Date(now.getTime() - 1000),
      submittedAt: now,
      apiCallCount: 0,
    });
    expect(result.breakdown.accuracy).toBe(700);
    expect(result.breakdown.speed).toBeGreaterThan(0);
    expect(result.breakdown.total).toBeGreaterThan(0);
  });

  it("score returns 0 accuracy for wrong answer", () => {
    const mod = createCodeModule(codeBasedSpec);
    const data = mod.generateData(42, {});
    const now = new Date();
    const result = mod.score({
      submission: { answer: -1 },
      groundTruth: data.groundTruth,
      startedAt: new Date(now.getTime() - 1000),
      submittedAt: now,
      apiCallCount: 0,
    });
    expect(result.breakdown.accuracy).toBe(0);
  });

  it("score clamps total to maxScore", () => {
    const spec: CommunitySpec = {
      ...codeBasedSpec,
      scoring: { ...codeBasedSpec.scoring, maxScore: 500 },
      codeFiles: {
        "data.js": validDataJs,
        "scorer.js": `
function score(input) {
  return { breakdown: { accuracy: 600, speed: 300, total: 900 } };
}
module.exports = { score: score };
`,
      },
    };
    const mod = createCodeModule(spec);
    const result = mod.score({
      submission: {},
      groundTruth: {},
      startedAt: new Date(),
      submittedAt: new Date(),
      apiCallCount: 0,
    });
    expect(result.breakdown.total).toBe(500);
  });

  it("score auto-computes total if not provided", () => {
    const spec: CommunitySpec = {
      ...codeBasedSpec,
      codeFiles: {
        "data.js": validDataJs,
        "scorer.js": `
function score(input) {
  return { breakdown: { accuracy: 400, speed: 200 } };
}
module.exports = { score: score };
`,
      },
    };
    const mod = createCodeModule(spec);
    const result = mod.score({
      submission: {},
      groundTruth: {},
      startedAt: new Date(),
      submittedAt: new Date(),
      apiCallCount: 0,
    });
    expect(result.breakdown.total).toBe(600);
  });
});

// ── generateWorkspace ─────────────────────────────────────────────────

describe("createCodeModule generateWorkspace", () => {
  it("auto-generates workspace from data when no workspace.js", () => {
    const mod = createCodeModule(codeBasedSpec);
    const files = mod.generateWorkspace!(42, {});
    expect(files).toBeDefined();
    expect(files["objective.txt"]).toContain("Find the number");
  });

  it("uses workspace.js when provided", () => {
    const spec: CommunitySpec = {
      ...codeBasedSpec,
      codeFiles: {
        "data.js": validDataJs,
        "scorer.js": validScorerJs,
        "workspace.js": validWorkspaceJs,
      },
    };
    const mod = createCodeModule(spec);
    const files = mod.generateWorkspace!(42, {});
    expect(files["puzzle.json"]).toBeDefined();
    expect(files["instructions.txt"]).toContain("puzzle.json");
  });
});

// ── validateSubmission ────────────────────────────────────────────────

describe("createCodeModule validateSubmission", () => {
  it("returns empty array when no validator.js", () => {
    const mod = createCodeModule(codeBasedSpec);
    const warnings = mod.validateSubmission!({}, {});
    expect(warnings).toEqual([]);
  });

  it("returns warnings from validator.js", () => {
    const spec: CommunitySpec = {
      ...codeBasedSpec,
      codeFiles: {
        "data.js": validDataJs,
        "scorer.js": validScorerJs,
        "validator.js": validValidatorJs,
      },
    };
    const mod = createCodeModule(spec);
    const warnings = mod.validateSubmission!({}, {});
    expect(warnings).toHaveLength(1);
    expect(warnings[0].severity).toBe("error");
    expect(warnings[0].field).toBe("answer");
  });

  it("returns type warning for non-number answer", () => {
    const spec: CommunitySpec = {
      ...codeBasedSpec,
      codeFiles: {
        "data.js": validDataJs,
        "scorer.js": validScorerJs,
        "validator.js": validValidatorJs,
      },
    };
    const mod = createCodeModule(spec);
    const warnings = mod.validateSubmission!({ answer: "hello" }, {});
    expect(warnings).toHaveLength(1);
    expect(warnings[0].severity).toBe("warning");
  });
});

// ── Error handling ────────────────────────────────────────────────────

describe("createCodeModule error handling", () => {
  it("throws when data.js has no generateData export", () => {
    const spec: CommunitySpec = {
      ...codeBasedSpec,
      codeFiles: {
        "data.js": "module.exports = { notGenerateData: function() {} };",
        "scorer.js": validScorerJs,
      },
    };
    const mod = createCodeModule(spec);
    expect(() => mod.generateData(42, {})).toThrow("data.js must export a generateData(seed) function");
  });

  it("throws when scorer.js has no score export", () => {
    const spec: CommunitySpec = {
      ...codeBasedSpec,
      codeFiles: {
        "data.js": validDataJs,
        "scorer.js": "module.exports = { notScore: function() {} };",
      },
    };
    const mod = createCodeModule(spec);
    expect(() => mod.score({
      submission: {},
      groundTruth: {},
      startedAt: new Date(),
      submittedAt: new Date(),
      apiCallCount: 0,
    })).toThrow("scorer.js must export a score(input) function");
  });

  it("throws when generateData returns non-object", () => {
    const spec: CommunitySpec = {
      ...codeBasedSpec,
      codeFiles: {
        "data.js": `
function generateData(seed) { return "not an object"; }
module.exports = { generateData: generateData };
`,
        "scorer.js": validScorerJs,
      },
    };
    const mod = createCodeModule(spec);
    expect(() => mod.generateData(42, {})).toThrow("generateData must return an object");
  });

  it("throws when generateData is missing objective", () => {
    const spec: CommunitySpec = {
      ...codeBasedSpec,
      codeFiles: {
        "data.js": `
function generateData(seed) { return { groundTruth: { x: 1 } }; }
module.exports = { generateData: generateData };
`,
        "scorer.js": validScorerJs,
      },
    };
    const mod = createCodeModule(spec);
    expect(() => mod.generateData(42, {})).toThrow("objective");
  });

  it("throws when generateData is missing groundTruth", () => {
    const spec: CommunitySpec = {
      ...codeBasedSpec,
      codeFiles: {
        "data.js": `
function generateData(seed) { return { objective: "test" }; }
module.exports = { generateData: generateData };
`,
        "scorer.js": validScorerJs,
      },
    };
    const mod = createCodeModule(spec);
    expect(() => mod.generateData(42, {})).toThrow("groundTruth");
  });

  it("throws when scorer returns non-number dimension", () => {
    const spec: CommunitySpec = {
      ...codeBasedSpec,
      codeFiles: {
        "data.js": validDataJs,
        "scorer.js": `
function score(input) {
  return { breakdown: { accuracy: "not a number", speed: 0, total: 0 } };
}
module.exports = { score: score };
`,
      },
    };
    const mod = createCodeModule(spec);
    expect(() => mod.score({
      submission: {},
      groundTruth: {},
      startedAt: new Date(),
      submittedAt: new Date(),
      apiCallCount: 0,
    })).toThrow("must be a number");
  });
});

// ── Helpers support ───────────────────────────────────────────────────

describe("createCodeModule helpers", () => {
  it("makes helpers.js functions available to data.js", () => {
    const spec: CommunitySpec = {
      ...codeBasedSpec,
      codeFiles: {
        "data.js": `
function generateData(seed) {
  var random = rng(seed);
  var raw = Math.floor(random() * 2000);
  var clamped = clamp(raw, 0, 999);
  return {
    objective: "Find the clamped number.",
    groundTruth: { answer: clamped },
  };
}
module.exports = { generateData: generateData };
`,
        "scorer.js": validScorerJs,
        "helpers.js": validHelpersJs,
      },
    };
    const mod = createCodeModule(spec);
    const data = mod.generateData(42, {});
    expect(data.groundTruth.answer).toBeLessThanOrEqual(999);
    expect(data.groundTruth.answer).toBeGreaterThanOrEqual(0);
  });
});

// ── checkCodeSyntax ───────────────────────────────────────────────────

describe("checkCodeSyntax", () => {
  it("passes for valid JS files", () => {
    const result = checkCodeSyntax({
      "data.js": validDataJs,
      "scorer.js": validScorerJs,
    });
    expect(result.passed).toBe(true);
    expect(result.details.files_checked).toContain("data.js");
  });

  it("fails for syntax errors", () => {
    const result = checkCodeSyntax({
      "data.js": "function broken( { return }",
      "scorer.js": validScorerJs,
    });
    expect(result.passed).toBe(false);
    expect(result.error).toContain("data.js");
  });

  it("reports multiple files with errors", () => {
    const result = checkCodeSyntax({
      "data.js": "function broken( {",
      "scorer.js": "function also_broken( {",
    });
    expect(result.passed).toBe(false);
    const issues = result.details.issues as string[];
    expect(issues.length).toBe(2);
  });
});

// ── checkCodeSecurity ─────────────────────────────────────────────────

describe("checkCodeSecurity", () => {
  it("passes for clean sandboxed code", () => {
    const result = checkCodeSecurity({
      "data.js": validDataJs,
      "scorer.js": validScorerJs,
    });
    expect(result.passed).toBe(true);
  });

  it("fails when code uses require()", () => {
    const result = checkCodeSecurity({
      "data.js": `var fs = require('fs');\nfunction generateData(seed) { return { objective: "x", groundTruth: {} }; }\nmodule.exports = { generateData: generateData };`,
      "scorer.js": validScorerJs,
    });
    expect(result.passed).toBe(false);
    expect(result.error).toContain("require()");
  });

  it("fails when code uses eval()", () => {
    const result = checkCodeSecurity({
      "data.js": validDataJs,
      "scorer.js": `var x = eval("1+1");\nfunction score(input) { return { breakdown: { total: x } }; }\nmodule.exports = { score: score };`,
    });
    expect(result.passed).toBe(false);
    expect(result.error).toContain("eval()");
  });

  it("fails when code uses process", () => {
    const result = checkCodeSecurity({
      "data.js": `var pid = process.pid;\nfunction generateData(s) { return { objective: "x", groundTruth: {} }; }\nmodule.exports = { generateData: generateData };`,
      "scorer.js": validScorerJs,
    });
    expect(result.passed).toBe(false);
    expect(result.error).toContain("process");
  });

  it("fails when code uses fetch()", () => {
    const result = checkCodeSecurity({
      "data.js": validDataJs,
      "scorer.js": `function score(input) { fetch("http://evil.com"); return { breakdown: { total: 0 } }; }\nmodule.exports = { score: score };`,
    });
    expect(result.passed).toBe(false);
    expect(result.error).toContain("fetch()");
  });

  it("fails when code uses setTimeout", () => {
    const result = checkCodeSecurity({
      "data.js": `function generateData(s) { setTimeout(function(){}, 0); return { objective: "x", groundTruth: {} }; }\nmodule.exports = { generateData: generateData };`,
      "scorer.js": validScorerJs,
    });
    expect(result.passed).toBe(false);
    expect(result.error).toContain("setTimeout");
  });

  it("skips check lines that are comments", () => {
    const result = checkCodeSecurity({
      "data.js": `// This line mentions require() but it's a comment\nfunction generateData(s) { var r = rng(s); return { objective: "x", groundTruth: { v: Math.floor(r() * 100) } }; }\nmodule.exports = { generateData: generateData };`,
      "scorer.js": validScorerJs,
    });
    expect(result.passed).toBe(true);
  });

  it("passes for Tier 2+ (networked) — relaxed restrictions", () => {
    const result = checkCodeSecurity({
      "data.js": `var fs = require('fs');\nfunction generateData(s) { return { objective: "x", groundTruth: {} }; }\nmodule.exports = { generateData: generateData };`,
      "scorer.js": validScorerJs,
    }, "networked");
    expect(result.passed).toBe(true);
    expect(result.details.note).toContain("relaxed");
  });

  it("includes violation details with file, pattern, and line number", () => {
    const result = checkCodeSecurity({
      "scorer.js": `function score(input) {\n  var x = eval("1");\n  return { breakdown: { total: 0 } };\n}\nmodule.exports = { score: score };`,
    });
    expect(result.passed).toBe(false);
    const violations = result.details.violations as Array<{ file: string; pattern: string; line: number }>;
    expect(violations[0].file).toBe("scorer.js");
    expect(violations[0].pattern).toBe("eval()");
    expect(violations[0].line).toBe(2);
  });
});

// ── checkContentSafety ────────────────────────────────────────────────

describe("checkContentSafety", () => {
  it("passes for clean content", () => {
    const result = checkContentSafety(codeBasedSpec);
    expect(result.passed).toBe(true);
  });

  it("flags malware references (but still passes — warning only)", () => {
    const spec: CommunitySpec = {
      ...codeBasedSpec,
      description: "Write a malware detector for sandbox testing.",
    };
    const result = checkContentSafety(spec);
    expect(result.passed).toBe(true); // flags, doesn't block
    expect(result.details.requires_admin_review).toBe(true);
    const flags = result.details.flags as Array<{ source: string; pattern: string }>;
    expect(flags.some((f) => f.pattern === "malware")).toBe(true);
  });

  it("flags phishing in challengeMd", () => {
    const spec: CommunitySpec = {
      ...codeBasedSpec,
      workspace: {
        ...codeBasedSpec.workspace,
        challengeMd: "# Phishing Detection\n\nBuild a phishing email classifier with seed {{seed}}.",
      },
    };
    const result = checkContentSafety(spec);
    expect(result.passed).toBe(true);
    expect(result.details.requires_admin_review).toBe(true);
  });

  it("flags harmful content in code files", () => {
    const spec: CommunitySpec = {
      ...codeBasedSpec,
      codeFiles: {
        "data.js": `
// Generate ransomware detection scenarios
function generateData(seed) {
  var random = rng(seed);
  return { objective: "Detect the threat", groundTruth: { answer: Math.floor(random() * 100) } };
}
module.exports = { generateData: generateData };
`,
        "scorer.js": validScorerJs,
      },
    };
    const result = checkContentSafety(spec);
    expect(result.passed).toBe(true);
    expect(result.details.requires_admin_review).toBe(true);
  });
});

// ── buildModuleForSpec ────────────────────────────────────────────────

describe("buildModuleForSpec", () => {
  it("returns code module for code-based spec", () => {
    const mod = buildModuleForSpec(codeBasedSpec);
    expect(mod.slug).toBe("code-test");
    expect(mod.scoringSpec?.method).toBe("custom-script");
  });

  it("returns declarative module for declarative spec", () => {
    const declSpec: CommunitySpec = {
      ...codeBasedSpec,
      codeFiles: undefined,
      dataTemplate: {
        fields: { value: { type: "rand_int", min: 1, max: 100000 } },
      },
      scorer: {
        fields: [{ key: "value", primitive: "numeric_tolerance", params: { tolerance: 0.001 } }],
        timeDimension: "speed",
      },
    };
    const mod = buildModuleForSpec(declSpec);
    expect(mod.slug).toBe("code-test");
    expect(mod.scoringSpec?.method).toBe("deterministic");
  });
});

// ── Integration: code-based spec through gates ────────────────────────

describe("runAllGates with code-based specs", () => {
  it("passes all gates for a valid code-based spec with correct reference", async () => {
    const mod = createCodeModule(codeBasedSpec);
    const data = mod.generateData(42, {});
    const report = await runAllGates(
      codeBasedSpec,
      { seed: 42, answer: { answer: data.groundTruth.answer } },
      "test-hash",
    );
    expect(report.overall).not.toBe("fail");
    expect(report.gates.spec_validity.passed).toBe(true);
    expect(report.gates.code_syntax).toBeDefined();
    expect(report.gates.code_syntax!.passed).toBe(true);
    expect(report.gates.code_security).toBeDefined();
    expect(report.gates.code_security!.passed).toBe(true);
    expect(report.gates.determinism.passed).toBe(true);
  });

  it("fails when code has syntax errors", async () => {
    const brokenSpec: CommunitySpec = {
      ...codeBasedSpec,
      codeFiles: {
        "data.js": "// This is a data generator with a syntax error that is long enough to pass min length\nfunction broken( { return }",
        "scorer.js": validScorerJs,
      },
    };
    const report = await runAllGates(brokenSpec, { seed: 42, answer: {} }, "h");
    expect(report.overall).toBe("fail");
    expect(report.gates.code_syntax!.passed).toBe(false);
    // Subsequent gates should be skipped
    expect(report.gates.determinism.error).toContain("Skipped");
  });

  it("fails when code has security violations", async () => {
    const unsafeDataJs = [
      "var fs = require('fs');",
      "function generateData(seed) {",
      "  var r = rng(seed);",
      "  return { objective: 'Find the answer to the question below', groundTruth: { answer: Math.floor(r() * 100) } };",
      "}",
      "module.exports = { generateData: generateData };",
    ].join("\n");
    const unsafeSpec: CommunitySpec = {
      ...codeBasedSpec,
      codeFiles: {
        "data.js": unsafeDataJs,
        "scorer.js": validScorerJs,
      },
    };
    const report = await runAllGates(unsafeSpec, { seed: 42, answer: {} }, "h");
    expect(report.overall).toBe("fail");
    expect(report.gates.code_security!.passed).toBe(false);
    // Subsequent gates should be skipped
    expect(report.gates.determinism.error).toContain("Skipped");
  });

  it("does not include code gates for declarative specs", async () => {
    const declSpec: CommunitySpec = {
      slug: "decl-test",
      name: "Declarative Test",
      description: "A declarative challenge for testing the gate system.",
      lore: "The ancient scrolls of declaration await the worthy.",
      category: "reasoning",
      difficulty: "newcomer",
      matchType: "single",
      timeLimitSecs: 60,
      workspace: {
        type: "generator",
        seedable: true,
        challengeMd: "# Test\n\nSeed {{seed}}.\n\n## Submission\nJSON with value.",
      },
      submission: { type: "json", schema: { value: "number" } },
      scoring: {
        method: "deterministic",
        dimensions: [
          { key: "accuracy", label: "Accuracy", weight: 0.7, description: "Correctness", color: "emerald" },
          { key: "speed", label: "Speed", weight: 0.3, description: "Speed", color: "sky" },
        ],
        maxScore: 1000,
      },
      scorer: {
        fields: [{ key: "value", primitive: "numeric_tolerance", params: { tolerance: 0.001 } }],
        timeDimension: "speed",
      },
      dataTemplate: {
        fields: { value: { type: "rand_int", min: 1, max: 100000 } },
      },
    };
    const report = await runAllGates(
      declSpec,
      { seed: 42, answer: { value: 43068 } }, // Will only match if deterministic
      "h",
    );
    expect(report.gates.code_syntax).toBeUndefined();
    expect(report.gates.code_security).toBeUndefined();
    expect(report.gates.content_safety).toBeUndefined();
  });

  it("warns when content safety flags are detected", async () => {
    const flaggedSpec: CommunitySpec = {
      ...codeBasedSpec,
      description: "Build a malware detection system for cybersecurity eval.",
    };
    const mod = createCodeModule(flaggedSpec);
    const data = mod.generateData(42, {});
    const report = await runAllGates(
      flaggedSpec,
      { seed: 42, answer: { answer: data.groundTruth.answer } },
      "h",
    );
    // Content safety flags → warn (not fail)
    expect(report.gates.content_safety).toBeDefined();
    expect(report.gates.content_safety!.details.requires_admin_review).toBe(true);
    expect(report.overall).toBe("warn");
  });
});

// ── Validator schema: codeFiles field ─────────────────────────────────

describe("communitySpecSchema codeFiles validation", () => {
  it("accepts a spec with codeFiles and no dataTemplate", () => {
    const result = validateSpec(codeBasedSpec);
    expect(result.valid).toBe(true);
  });

  it("rejects a spec with both codeFiles and dataTemplate", () => {
    const result = validateSpec({
      ...codeBasedSpec,
      dataTemplate: { fields: { x: { type: "rand_int", min: 0, max: 10 } } },
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("mutually exclusive"))).toBe(true);
    }
  });

  it("rejects codeFiles with data.js under 50 chars", () => {
    const result = validateSpec({
      ...codeBasedSpec,
      codeFiles: { "data.js": "short", "scorer.js": validScorerJs },
    });
    expect(result.valid).toBe(false);
  });

  it("rejects codeFiles with scorer.js under 50 chars", () => {
    const result = validateSpec({
      ...codeBasedSpec,
      codeFiles: { "data.js": validDataJs, "scorer.js": "short" },
    });
    expect(result.valid).toBe(false);
  });

  it("accepts codeFiles with optional workspace.js", () => {
    const result = validateSpec({
      ...codeBasedSpec,
      codeFiles: {
        "data.js": validDataJs,
        "scorer.js": validScorerJs,
        "workspace.js": validWorkspaceJs,
      },
    });
    expect(result.valid).toBe(true);
  });

  it("accepts environment with sandboxed tier", () => {
    const result = validateSpec({
      ...codeBasedSpec,
      environment: { tier: "sandboxed" },
    });
    expect(result.valid).toBe(true);
  });

  it("rejects gpu tier without image", () => {
    const result = validateSpec({
      ...codeBasedSpec,
      environment: { tier: "gpu" },
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("image"))).toBe(true);
    }
  });

  it("accepts gpu tier with image", () => {
    const result = validateSpec({
      ...codeBasedSpec,
      environment: { tier: "gpu", image: "eval-cuda:latest" },
    });
    expect(result.valid).toBe(true);
  });

  it("rejects assets with sandboxed tier", () => {
    const result = validateSpec({
      ...codeBasedSpec,
      assets: [{ url: "https://example.com/data.bin", sha256: "a".repeat(64), filename: "data.bin", size: 1000 }],
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("assets"))).toBe(true);
    }
  });

  it("accepts assets with networked tier", () => {
    const result = validateSpec({
      ...codeBasedSpec,
      environment: { tier: "networked" },
      assets: [{ url: "https://example.com/data.bin", sha256: "a".repeat(64), filename: "data.bin", size: 1000 }],
    });
    expect(result.valid).toBe(true);
  });

  it("still allows scorer-less declarative specs at maxScore <= 1000", () => {
    const result = validateSpec({
      ...codeBasedSpec,
      codeFiles: undefined,
      scorer: undefined,
      scoring: { ...codeBasedSpec.scoring, maxScore: 1000 },
    });
    expect(result.valid).toBe(true);
  });

  it("allows maxScore > 1000 for code-based specs without scorer", () => {
    const result = validateSpec({
      ...codeBasedSpec,
      scorer: undefined,
      scoring: { ...codeBasedSpec.scoring, maxScore: 5000 },
    });
    expect(result.valid).toBe(true);
  });

  it("rejects judgeModel with sandboxed tier", () => {
    const result = validateSpec({
      ...codeBasedSpec,
      scoring: { ...codeBasedSpec.scoring, judgeModel: "claude-haiku-4-5-20251001" },
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("judgeModel"))).toBe(true);
    }
  });

  it("accepts judgeModel with networked tier", () => {
    const result = validateSpec({
      ...codeBasedSpec,
      scoring: { ...codeBasedSpec.scoring, judgeModel: "claude-haiku-4-5-20251001", rubric: "Score quality" },
      environment: { tier: "networked" },
    });
    expect(result.valid).toBe(true);
  });

  it("accepts rubric without judgeModel (rubric is optional standalone)", () => {
    const result = validateSpec({
      ...codeBasedSpec,
      scoring: { ...codeBasedSpec.scoring, rubric: "Quality rubric text" },
    });
    expect(result.valid).toBe(true);
  });
});

// ── Tier 2+ evaluator wrapper ───────────────────────────────────────

describe("createCodeModule Tier 2+ evaluator wrapper", () => {
  const networkedSpec: CommunitySpec = {
    ...codeBasedSpec,
    environment: { tier: "networked" },
  };

  it("sandboxed tier does NOT set evaluator script", () => {
    const mod = createCodeModule(codeBasedSpec);
    expect(mod.scoringSpec?.evaluator).toBeUndefined();
  });

  it("networked tier sets evaluator script", () => {
    const mod = createCodeModule(networkedSpec);
    expect(mod.scoringSpec?.evaluator).toBeDefined();
    expect(typeof mod.scoringSpec?.evaluator).toBe("string");
  });

  it("evaluator wrapper contains scorer.js code", () => {
    const mod = createCodeModule(networkedSpec);
    const wrapper = mod.scoringSpec?.evaluator!;
    // scorer.js has a "score" function
    expect(wrapper).toContain("function score(input)");
  });

  it("evaluator wrapper reads submission.json and ground-truth.json", () => {
    const mod = createCodeModule(networkedSpec);
    const wrapper = mod.scoringSpec?.evaluator!;
    expect(wrapper).toContain("submission.json");
    expect(wrapper).toContain("ground-truth.json");
  });

  it("evaluator wrapper reads timing metadata from env vars", () => {
    const mod = createCodeModule(networkedSpec);
    const wrapper = mod.scoringSpec?.evaluator!;
    expect(wrapper).toContain("STARTED_AT");
    expect(wrapper).toContain("SUBMITTED_AT");
    expect(wrapper).toContain("API_CALL_COUNT");
  });

  it("mod.score() still works in-process for Tier 2+ specs (gate checking)", () => {
    const mod = createCodeModule(networkedSpec);
    const data = mod.generateData(42, {});
    const now = new Date();
    const result = mod.score({
      submission: { answer: data.groundTruth.answer },
      groundTruth: data.groundTruth,
      startedAt: new Date(now.getTime() - 1000),
      submittedAt: now,
      apiCallCount: 0,
    });
    expect(result.breakdown.accuracy).toBe(700);
    expect(result.breakdown.total).toBeGreaterThan(0);
  });

  it("evaluator wrapper includes LLM judge when judgeModel is set", () => {
    const specWithJudge: CommunitySpec = {
      ...codeBasedSpec,
      environment: { tier: "networked" },
      scoring: {
        ...codeBasedSpec.scoring,
        judgeModel: "claude-haiku-4-5-20251001",
        rubric: "Score on clarity and correctness",
      },
    };
    const mod = createCodeModule(specWithJudge);
    const wrapper = mod.scoringSpec?.evaluator!;
    expect(wrapper).toContain("llmJudge");
    expect(wrapper).toContain("claude-haiku-4-5-20251001");
    expect(wrapper).toContain("Score on clarity and correctness");
  });

  it("gpu tier also generates evaluator wrapper", () => {
    const gpuSpec: CommunitySpec = {
      ...codeBasedSpec,
      environment: { tier: "gpu", image: "eval-cuda:latest" },
    };
    const mod = createCodeModule(gpuSpec);
    expect(mod.scoringSpec?.evaluator).toBeDefined();
  });
});

// ── cachedAssets injection ───────────────────────────────────────────

describe("createCodeModule cachedAssets", () => {
  it("injects CACHED_ASSETS global into data.js execution", () => {
    const specWithAssetAware: CommunitySpec = {
      ...codeBasedSpec,
      codeFiles: {
        "data.js": `
function generateData(seed) {
  var random = rng(seed);
  var extra = typeof CACHED_ASSETS !== "undefined" ? CACHED_ASSETS.key : "none";
  return {
    objective: "Find the number. Asset: " + extra,
    groundTruth: { answer: Math.floor(random() * 1000) },
  };
}
module.exports = { generateData: generateData };
`,
        "scorer.js": validScorerJs,
      },
    };
    const mod = createCodeModule(specWithAssetAware, { cachedAssets: { key: "test-value" } });
    const data = mod.generateData(42, {});
    expect(data.objective).toContain("test-value");
  });

  it("CACHED_ASSETS is undefined when not provided", () => {
    const specWithAssetCheck: CommunitySpec = {
      ...codeBasedSpec,
      codeFiles: {
        "data.js": `
function generateData(seed) {
  var random = rng(seed);
  var hasAssets = typeof CACHED_ASSETS !== "undefined";
  return {
    objective: "Has assets: " + hasAssets,
    groundTruth: { answer: Math.floor(random() * 1000) },
  };
}
module.exports = { generateData: generateData };
`,
        "scorer.js": validScorerJs,
      },
    };
    const mod = createCodeModule(specWithAssetCheck);
    const data = mod.generateData(42, {});
    expect(data.objective).toContain("Has assets: false");
  });

  it("CACHED_ASSETS available in scorer context", () => {
    const specWithAssetScorer: CommunitySpec = {
      ...codeBasedSpec,
      codeFiles: {
        "data.js": validDataJs,
        "scorer.js": `
function score(input) {
  var bonus = typeof CACHED_ASSETS !== "undefined" ? 100 : 0;
  return { breakdown: { accuracy: bonus, speed: 0, total: bonus } };
}
module.exports = { score: score };
`,
      },
    };
    const mod = createCodeModule(specWithAssetScorer, { cachedAssets: { lookup: [1, 2, 3] } });
    const result = mod.score({
      submission: {},
      groundTruth: {},
      startedAt: new Date(),
      submittedAt: new Date(),
      apiCallCount: 0,
    });
    expect(result.breakdown.accuracy).toBe(100);
  });
});
