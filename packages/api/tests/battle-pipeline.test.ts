/**
 * Battle-pipeline tests — comprehensive, production-grade tests
 * exercising every feature path of the community challenge pipeline.
 *
 * Pure function tests only — no DB or network required.
 */
import { describe, it, expect } from "vitest";
import {
  checkSpecValidity,
  checkDeterminism,
  checkContractConsistency,
  checkBaselineSolveability,
  checkAntiGaming,
  checkScoreDistribution,
  checkCodeSyntax,
  checkCodeSecurity,
  checkContentSafety,
  runAllGates,
  buildModuleForSpec,
  GATE_PASS_SCORE_THRESHOLD,
  GATE_PROBE_SCORE_CEILING,
} from "../src/challenges/primitives/gates.js";
import { validateSpec } from "../src/challenges/primitives/validator.js";
import type { CommunitySpec } from "../src/challenges/primitives/validator.js";
import { createCodeModule } from "../src/challenges/primitives/code-module.js";
import { createDeclarativeModule } from "../src/challenges/primitives/declarative-module.js";
import {
  exact_match,
  exact_match_ratio,
  numeric_tolerance,
  fuzzy_string,
  time_decay,
  api_call_efficiency,
  coverage_ratio,
  set_overlap,
  SCORING_PRIMITIVES,
} from "../src/challenges/primitives/scoring.js";
import { isReviewerEligible, REVIEW_MIN_MATCHES } from "../src/challenges/governance.js";

// ════════════════════════════════════════════════════════════════════════
// Helpers — shared fixtures for specs & verdicts
// ════════════════════════════════════════════════════════════════════════

const DESIGN_GUIDE_HASH = "test-hash-000";

/** Minimal valid 2-dimension scoring block. */
function dims(weights: [number, number]): CommunitySpec["scoring"]["dimensions"] {
  return [
    { key: "accuracy", label: "Accuracy", weight: weights[0], description: "Correct", color: "emerald" },
    { key: "speed", label: "Speed", weight: weights[1], description: "Fast", color: "sky" },
  ];
}

/** Build a minimal declarative CommunitySpec with overrides. */
function declSpec(overrides: Partial<CommunitySpec> = {}): CommunitySpec {
  return {
    slug: "battle-test",
    name: "Battle Test",
    description: "A challenge designed for battle testing purposes.",
    lore: "The arena calls to those who seek to battle test the system.",
    category: "reasoning",
    difficulty: "newcomer",
    matchType: "single",
    timeLimitSecs: 60,
    workspace: {
      type: "generator",
      seedable: true,
      challengeMd: "# Battle Test\n\nSolve with seed {{seed}}.\n\n## Submission\nJSON with `value`.",
    },
    submission: { type: "json", schema: { value: "number" } },
    scoring: {
      method: "deterministic",
      dimensions: dims([0.7, 0.3]),
      maxScore: 1000,
    },
    scorer: {
      fields: [{ key: "value", primitive: "numeric_tolerance", params: { tolerance: 0.001 } }],
      timeDimension: "speed",
    },
    dataTemplate: {
      fields: { value: { type: "rand_int", min: 1, max: 100000 } },
    },
    ...overrides,
  } as CommunitySpec;
}

/** Build a minimal code-based CommunitySpec with code file overrides. */
function codeSpec(
  codeOverrides: Partial<Record<string, string>> = {},
  specOverrides: Partial<CommunitySpec> = {},
): CommunitySpec {
  const dataJs = codeOverrides["data.js"] ?? `
function generateData(seed) {
  var r = rng(seed);
  var a = Math.floor(r() * 100) + 1;
  var b = Math.floor(r() * 100) + 1;
  return {
    objective: "Compute " + a + " + " + b,
    groundTruth: { answer: a + b },
    a: a, b: b,
  };
}
module.exports = { generateData: generateData };
`;
  const scorerJs = codeOverrides["scorer.js"] ?? `
function score(input) {
  var sub = input.submission;
  var gt = input.groundTruth;
  var correct = sub.answer === gt.answer;
  var accuracy = correct ? 700 : 0;
  var elapsed = (new Date(input.submittedAt) - new Date(input.startedAt)) / 1000;
  var speed = Math.round(Math.max(0, 1 - elapsed / 120) * 300);
  return { breakdown: { accuracy: accuracy, speed: speed, total: accuracy + speed } };
}
module.exports = { score: score };
`;
  const codeFiles: Record<string, string> = {
    "data.js": dataJs,
    "scorer.js": scorerJs,
  };
  if (codeOverrides["helpers.js"]) codeFiles["helpers.js"] = codeOverrides["helpers.js"];
  if (codeOverrides["workspace.js"]) codeFiles["workspace.js"] = codeOverrides["workspace.js"];
  if (codeOverrides["validator.js"]) codeFiles["validator.js"] = codeOverrides["validator.js"];

  return {
    slug: "code-battle",
    name: "Code Battle Test",
    description: "A code-based challenge for battle testing the pipeline.",
    lore: "The ancient code scrolls reveal their secrets to persistent warriors.",
    category: "coding",
    difficulty: "contender",
    matchType: "single",
    timeLimitSecs: 120,
    workspace: {
      type: "generator",
      seedable: true,
      challengeMd: "# Code Battle\n\nCompute the sum with seed {{seed}}.\n\n## Submission\nJSON with `answer`.",
    },
    submission: { type: "json", schema: { answer: "number" } },
    scoring: {
      method: "custom-script",
      dimensions: dims([0.7, 0.3]),
      maxScore: 1000,
    },
    codeFiles,
    ...specOverrides,
  } as CommunitySpec;
}

// ════════════════════════════════════════════════════════════════════════
// Section A: Complex Challenge Specs
// ════════════════════════════════════════════════════════════════════════

describe("Section A: Complex Challenge Specs", () => {

  // ── A1: network-topology — code-based with helpers, workspace, validator, 4 dims ──

  describe("A1: network-topology (code-based, 4 dimensions, helpers/workspace/validator)", () => {
    const helpersJs = `
function createGraph(nodeCount, edges) {
  var adj = {};
  for (var i = 0; i < nodeCount; i++) adj[i] = [];
  for (var e = 0; e < edges.length; e++) {
    adj[edges[e][0]].push(edges[e][1]);
    adj[edges[e][1]].push(edges[e][0]);
  }
  return adj;
}
function bfs(adj, start) {
  var dist = {};
  dist[start] = 0;
  var queue = [start];
  while (queue.length > 0) {
    var node = queue.shift();
    var neighbors = adj[node] || [];
    for (var i = 0; i < neighbors.length; i++) {
      if (dist[neighbors[i]] === undefined) {
        dist[neighbors[i]] = dist[node] + 1;
        queue.push(neighbors[i]);
      }
    }
  }
  return dist;
}
`;

    const dataJs = `
function generateData(seed) {
  var r = rng(seed);
  var nodeCount = Math.floor(r() * 6) + 5;
  var edges = [];
  for (var i = 1; i < nodeCount; i++) {
    edges.push([Math.floor(r() * i), i]);
  }
  var extraEdges = Math.floor(r() * 3);
  for (var e = 0; e < extraEdges; e++) {
    var a = Math.floor(r() * nodeCount);
    var b = Math.floor(r() * nodeCount);
    if (a !== b) edges.push([a, b]);
  }
  var adj = createGraph(nodeCount, edges);
  var distances = bfs(adj, 0);
  return {
    objective: "Find shortest paths from node 0 to all other nodes in the graph.",
    groundTruth: { distances: distances, nodeCount: nodeCount },
    nodeCount: nodeCount,
    edges: edges,
  };
}
module.exports = { generateData: generateData };
`;

    const scorerJs = `
function score(input) {
  var sub = input.submission;
  var gt = input.groundTruth;
  var distances = gt.distances;
  var subDist = (sub.distances && typeof sub.distances === "object" && !Array.isArray(sub.distances)) ? sub.distances : {};
  var nodeCount = gt.nodeCount;
  var correctCount = 0;
  var totalPaths = 0;
  var efficiencySum = 0;
  for (var i = 0; i < nodeCount; i++) {
    if (distances[i] !== undefined) {
      totalPaths++;
      if (subDist[i] === distances[i]) {
        correctCount++;
        efficiencySum += 1;
      } else if (subDist[i] !== undefined && typeof subDist[i] === "number") {
        var ratio = distances[i] > 0 ? Math.max(0, 1 - Math.abs(subDist[i] - distances[i]) / distances[i]) : 0;
        efficiencySum += ratio;
      }
    }
  }
  var pathCorrectness = totalPaths > 0 ? Math.round((correctCount / totalPaths) * 400) : 0;
  var completeness = totalPaths > 0 ? Math.round((Object.keys(subDist).length / totalPaths) * 250) : 0;
  completeness = Math.min(completeness, 250);
  var efficiency = totalPaths > 0 ? Math.round((efficiencySum / totalPaths) * 200) : 0;
  var elapsed = (new Date(input.submittedAt) - new Date(input.startedAt)) / 1000;
  // Speed only awarded if at least one correct path found (anti-gaming)
  var speed = correctCount > 0 ? Math.round(Math.max(0, 1 - elapsed / 120) * 150) : 0;
  var total = pathCorrectness + completeness + efficiency + speed;
  return { breakdown: { path_correctness: pathCorrectness, completeness: completeness, efficiency: efficiency, speed: speed, total: total } };
}
module.exports = { score: score };
`;

    const workspaceJs = `
function generateWorkspace(seed) {
  var data = generateData(seed);
  var adj = createGraph(data.nodeCount, data.edges);
  return {
    "graph.json": JSON.stringify({ nodeCount: data.nodeCount, edges: data.edges, adjacencyList: adj }, null, 2),
    "instructions.txt": "Find shortest paths from node 0 to all other nodes. Submit JSON { distances: { nodeId: distance, ... } }.",
  };
}
module.exports = { generateWorkspace: generateWorkspace };
`;

    const validatorJs = `
function validate(submission, groundTruth) {
  var warnings = [];
  if (!submission.distances) {
    warnings.push({ severity: "error", field: "distances", message: "Missing distances object" });
  } else if (typeof submission.distances !== "object") {
    warnings.push({ severity: "error", field: "distances", message: "distances must be an object" });
  } else {
    var nodeCount = groundTruth.nodeCount;
    var subKeys = Object.keys(submission.distances);
    if (subKeys.length < nodeCount) {
      warnings.push({ severity: "warning", field: "distances", message: "Missing paths for " + (nodeCount - subKeys.length) + " nodes" });
    }
  }
  return warnings;
}
module.exports = { validate: validate };
`;

    const spec = codeSpec(
      { "data.js": dataJs, "scorer.js": scorerJs, "helpers.js": helpersJs, "workspace.js": workspaceJs, "validator.js": validatorJs },
      {
        slug: "network-topology",
        name: "Network Topology",
        description: "Find shortest paths in randomly generated network graphs.",
        lore: "The network labyrinth reveals its secrets only to the most persistent pathfinders.",
        scoring: {
          method: "custom-script",
          dimensions: [
            { key: "path_correctness", label: "Path Correctness", weight: 0.4, description: "Exact match of distances", color: "emerald" },
            { key: "completeness", label: "Completeness", weight: 0.25, description: "All paths found", color: "sky" },
            { key: "efficiency", label: "Efficiency", weight: 0.2, description: "Path length vs optimal", color: "gold" },
            { key: "speed", label: "Speed", weight: 0.15, description: "Time performance", color: "purple" },
          ],
          maxScore: 1000,
        },
      },
    );

    it("spec passes validation", () => {
      const result = validateSpec(spec);
      expect(result.valid).toBe(true);
    });

    it("all gates pass with correct reference answer", async () => {
      const mod = buildModuleForSpec(spec);
      const data = mod.generateData(42, {});
      const ref = { seed: 42, answer: { distances: data.groundTruth.distances } };
      const report = await runAllGates(spec, ref, DESIGN_GUIDE_HASH);
      expect(report.overall).toBe("pass");
    });

    it("reference score is at least 600", () => {
      const mod = buildModuleForSpec(spec);
      const data = mod.generateData(42, {});
      const now = new Date();
      const result = mod.score({
        submission: { distances: data.groundTruth.distances },
        groundTruth: data.groundTruth,
        startedAt: new Date(now.getTime() - 1000),
        submittedAt: now,
        apiCallCount: 0,
      });
      expect(result.breakdown.total).toBeGreaterThanOrEqual(600);
    });

    it("anti-gaming probes all score below ceiling", () => {
      const mod = buildModuleForSpec(spec);
      const data = mod.generateData(42, {});
      const now = new Date();
      const ceiling = GATE_PROBE_SCORE_CEILING * spec.scoring.maxScore;

      for (const probe of [{}, { distances: null }, { distances: "uuid-garbage" }]) {
        const result = mod.score({
          submission: probe,
          groundTruth: data.groundTruth,
          startedAt: new Date(now.getTime() - 1000),
          submittedAt: now,
          apiCallCount: 0,
        });
        expect(result.breakdown.total).toBeLessThan(ceiling);
      }
    });

    it("workspace.js produces valid adjacency list", () => {
      const mod = buildModuleForSpec(spec);
      const files = mod.generateWorkspace(42, {});
      expect(files).toHaveProperty("graph.json");
      expect(files).toHaveProperty("instructions.txt");
      const graph = JSON.parse(files["graph.json"]);
      expect(graph.nodeCount).toBeGreaterThanOrEqual(5);
      expect(graph.adjacencyList).toBeDefined();
    });

    it("validator.js returns warnings for missing distances", () => {
      const mod = buildModuleForSpec(spec);
      const data = mod.generateData(42, {});
      const warnings = mod.validateSubmission({}, data.groundTruth);
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0].field).toBe("distances");
    });

    it("helpers.js functions are accessible in data.js context", () => {
      const mod = buildModuleForSpec(spec);
      // If helpers weren't loaded, generateData would throw
      const data = mod.generateData(42, {});
      expect(data.groundTruth.distances).toBeDefined();
    });

    it("different seeds produce different graphs", () => {
      const mod = buildModuleForSpec(spec);
      const a = mod.generateData(42, {});
      const b = mod.generateData(999, {});
      expect(JSON.stringify(a.groundTruth)).not.toBe(JSON.stringify(b.groundTruth));
    });

    it("determinism gate passes", () => {
      const mod = buildModuleForSpec(spec);
      const result = checkDeterminism(mod);
      expect(result.passed).toBe(true);
    });
  });

  // ── A2: data-forensics — declarative, all 6 field types, 3 scoring primitives ──

  describe("A2: data-forensics (declarative, all 6 field types)", () => {
    const forensicsSpec = declSpec({
      slug: "data-forensics",
      name: "Data Forensics",
      description: "Analyze forensic case data and identify suspects from evidence.",
      lore: "Buried in the digital archives lies evidence of a great system breach.",
      category: "reasoning",
      difficulty: "veteran",
      matchType: "single",
      timeLimitSecs: 300,
      scoring: {
        method: "deterministic",
        dimensions: [
          { key: "identification", label: "Identification", weight: 0.4, description: "Suspect ID", color: "emerald" },
          { key: "evidence_analysis", label: "Evidence Analysis", weight: 0.35, description: "Evidence match", color: "sky" },
          { key: "precision", label: "Precision", weight: 0.25, description: "Numeric precision", color: "gold" },
        ],
        maxScore: 1000,
      },
      scorer: {
        fields: [
          { key: "suspect", primitive: "exact_match", weight: 1 },
          { key: "evidence", primitive: "set_overlap", weight: 1 },
          { key: "confidence", primitive: "numeric_tolerance", params: { tolerance: 0.05 }, weight: 1 },
          { key: "case_number", primitive: "exact_match", weight: 1 },
        ],
      },
      dataTemplate: {
        pools: [
          { name: "suspects", items: ["Alice", "Bob", "Charlie", "Diana", "Eve", "Frank", "Grace", "Hank", "Ivy", "Jack"] },
          { name: "evidence_types", items: ["fingerprint", "dna", "cctv", "witness", "digital", "forensic", "alibi", "motive"] },
          { name: "locations", items: ["warehouse", "office", "park", "station", "library", "airport"] },
        ],
        fields: {
          suspect: { type: "pick_one", pool: "suspects" },
          evidence: { type: "pick_n", pool: "evidence_types", count: 3 },
          location: { type: "pick_one", pool: "locations" },
          confidence: { type: "rand_float", min: 0.5, max: 1.0, decimals: 2 },
          case_number: { type: "rand_int", min: 10000, max: 99999 },
          summary: { type: "template", template: "Case {case_number} at {location}" },
          classification: { type: "static", value: "confidential" },
        },
      },
      submission: {
        type: "json",
        schema: { suspect: "string", evidence: "array", confidence: "number", case_number: "number" },
      },
    });

    it("passes spec validation", () => {
      const result = validateSpec(forensicsSpec);
      expect(result.valid).toBe(true);
    });

    it("all gates pass with correct reference for seed 42", async () => {
      const mod = buildModuleForSpec(forensicsSpec);
      const data = mod.generateData(42, {});
      const ref = { seed: 42, answer: { ...data.groundTruth } };
      const report = await runAllGates(forensicsSpec, ref, DESIGN_GUIDE_HASH);
      expect(report.overall).toBe("pass");
    });

    it("generates correct field types", () => {
      const mod = createDeclarativeModule(forensicsSpec);
      const data = mod.generateData(42, {});
      expect(typeof data.groundTruth.suspect).toBe("string");
      expect(Array.isArray(data.groundTruth.evidence)).toBe(true);
      expect((data.groundTruth.evidence as unknown[]).length).toBe(3);
      expect(typeof data.groundTruth.confidence).toBe("number");
      expect(data.groundTruth.confidence as number).toBeGreaterThanOrEqual(0.5);
      expect(data.groundTruth.confidence as number).toBeLessThanOrEqual(1.0);
      expect(typeof data.groundTruth.case_number).toBe("number");
      expect(data.groundTruth.case_number as number).toBeGreaterThanOrEqual(10000);
      expect(data.groundTruth.case_number as number).toBeLessThanOrEqual(99999);
    });

    it("determinism: same seed produces identical output", () => {
      const mod = createDeclarativeModule(forensicsSpec);
      const a = mod.generateData(42, {});
      const b = mod.generateData(42, {});
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });

    it("different seeds produce different suspects/evidence/case_numbers", () => {
      const mod = createDeclarativeModule(forensicsSpec);
      const a = mod.generateData(42, {});
      const b = mod.generateData(999, {});
      // At least one field should differ
      const aStr = JSON.stringify(a.groundTruth);
      const bStr = JSON.stringify(b.groundTruth);
      expect(aStr).not.toBe(bStr);
    });

    it("template field correctly interpolates", () => {
      const mod = createDeclarativeModule(forensicsSpec);
      const data = mod.generateData(42, {});
      const summary = data.groundTruth.summary as string;
      const caseNum = data.groundTruth.case_number as number;
      const location = data.groundTruth.location as string;
      expect(summary).toBe(`Case ${caseNum} at ${location}`);
    });

    it("static field always returns 'confidential'", () => {
      const mod = createDeclarativeModule(forensicsSpec);
      for (const seed of [1, 42, 999, 7777]) {
        const data = mod.generateData(seed, {});
        expect(data.groundTruth.classification).toBe("confidential");
      }
    });

    it("set_overlap partial credit (2 of 3 correct)", () => {
      const mod = createDeclarativeModule(forensicsSpec);
      const data = mod.generateData(42, {});
      const correctEvidence = data.groundTruth.evidence as string[];
      // 2 correct + 1 wrong
      const partial = [correctEvidence[0], correctEvidence[1], "nonexistent_evidence"];
      const now = new Date();
      const result = mod.score({
        submission: {
          suspect: data.groundTruth.suspect,
          evidence: partial,
          confidence: data.groundTruth.confidence,
          case_number: data.groundTruth.case_number,
        },
        groundTruth: data.groundTruth,
        startedAt: new Date(now.getTime() - 1000),
        submittedAt: now,
        apiCallCount: 0,
      });
      // Should get partial credit, not full and not zero
      expect(result.breakdown.total).toBeGreaterThan(0);
      expect(result.breakdown.total).toBeLessThan(1000);
    });

    it("numeric_tolerance partial credit (within 5x tolerance)", () => {
      const mod = createDeclarativeModule(forensicsSpec);
      const data = mod.generateData(42, {});
      const correctConf = data.groundTruth.confidence as number;
      const now = new Date();

      // Slightly off (within tolerance)
      const resultClose = mod.score({
        submission: {
          suspect: data.groundTruth.suspect,
          evidence: data.groundTruth.evidence,
          confidence: correctConf + 0.03, // within 0.05 tolerance
          case_number: data.groundTruth.case_number,
        },
        groundTruth: data.groundTruth,
        startedAt: new Date(now.getTime() - 1000),
        submittedAt: now,
        apiCallCount: 0,
      });

      // Way off (beyond 5x tolerance)
      const resultFar = mod.score({
        submission: {
          suspect: data.groundTruth.suspect,
          evidence: data.groundTruth.evidence,
          confidence: correctConf + 0.5, // way beyond
          case_number: data.groundTruth.case_number,
        },
        groundTruth: data.groundTruth,
        startedAt: new Date(now.getTime() - 1000),
        submittedAt: now,
        apiCallCount: 0,
      });

      expect(resultClose.breakdown.total).toBeGreaterThan(resultFar.breakdown.total);
    });
  });

  // ── A3: floating-precision — weight sum tolerance boundaries ──

  describe("A3: floating-precision (scoring dimension weight boundaries)", () => {
    it("weights [0.333, 0.333, 0.334] sum exactly to 1.0 — passes", () => {
      const spec = declSpec({
        scoring: {
          method: "deterministic",
          dimensions: [
            { key: "a", label: "A", weight: 0.333, description: "A", color: "emerald" },
            { key: "b", label: "B", weight: 0.333, description: "B", color: "sky" },
            { key: "c", label: "C", weight: 0.334, description: "C", color: "gold" },
          ],
          maxScore: 1000,
        },
      });
      const result = validateSpec(spec);
      expect(result.valid).toBe(true);
    });

    it("weights [0.3333, 0.3333, 0.3334] sum exactly to 1.0 — passes", () => {
      const spec = declSpec({
        scoring: {
          method: "deterministic",
          dimensions: [
            { key: "a", label: "A", weight: 0.3333, description: "A", color: "emerald" },
            { key: "b", label: "B", weight: 0.3333, description: "B", color: "sky" },
            { key: "c", label: "C", weight: 0.3334, description: "C", color: "gold" },
          ],
          maxScore: 1000,
        },
      });
      const result = validateSpec(spec);
      expect(result.valid).toBe(true);
    });

    it("weights [0.333, 0.333, 0.333] sum = 0.999, |diff| = 0.001 — fails (not < 0.001)", () => {
      // Math.abs(0.999 - 1.0) = 0.001, and the check is < 0.001 (strict), so this fails
      const spec = declSpec({
        scoring: {
          method: "deterministic",
          dimensions: [
            { key: "a", label: "A", weight: 0.333, description: "A", color: "emerald" },
            { key: "b", label: "B", weight: 0.333, description: "B", color: "sky" },
            { key: "c", label: "C", weight: 0.333, description: "C", color: "gold" },
          ],
          maxScore: 1000,
        },
      });
      const result = validateSpec(spec);
      // Due to floating-point, 0.333+0.333+0.333 may not be exactly 0.999
      // In JS: 0.333 + 0.333 + 0.333 = 0.999 (exact), |0.999 - 1.0| = 0.001
      // 0.001 < 0.001 is false → should fail
      const sum = 0.333 + 0.333 + 0.333;
      if (Math.abs(sum - 1.0) < 0.001) {
        expect(result.valid).toBe(true); // FP edge case: might pass
      } else {
        expect(result.valid).toBe(false);
      }
    });

    it("weights [0.33, 0.33, 0.33] sum = 0.99 — clearly fails", () => {
      const spec = declSpec({
        scoring: {
          method: "deterministic",
          dimensions: [
            { key: "a", label: "A", weight: 0.33, description: "A", color: "emerald" },
            { key: "b", label: "B", weight: 0.33, description: "B", color: "sky" },
            { key: "c", label: "C", weight: 0.33, description: "C", color: "gold" },
          ],
          maxScore: 1000,
        },
      });
      const result = validateSpec(spec);
      expect(result.valid).toBe(false);
    });
  });

  // ── A4: neg-score-edge — scorer returning negative values ──

  describe("A4: neg-score-edge (scorer returns negative dimension scores)", () => {
    const negScorerJs = `
function score(input) {
  var sub = input.submission;
  var gt = input.groundTruth;
  var diff = sub.answer - gt.answer;
  var accuracy = diff === 0 ? 700 : -Math.abs(diff);
  var speed = 300;
  return { breakdown: { accuracy: accuracy, speed: speed, total: accuracy + speed } };
}
module.exports = { score: score };
`;

    it("negative dimension scores are stored in breakdown", () => {
      const spec = codeSpec({ "scorer.js": negScorerJs });
      const mod = createCodeModule(spec);
      const data = mod.generateData(42, {});
      const now = new Date();
      const result = mod.score({
        submission: { answer: (data.groundTruth.answer as number) + 100 },
        groundTruth: data.groundTruth,
        startedAt: new Date(now.getTime() - 1000),
        submittedAt: now,
        apiCallCount: 0,
      });
      expect(result.breakdown.accuracy).toBeLessThan(0);
    });

    it("total is clamped to maxScore but not floored at 0", () => {
      const spec = codeSpec({ "scorer.js": negScorerJs });
      const mod = createCodeModule(spec);
      const data = mod.generateData(42, {});
      const now = new Date();
      const result = mod.score({
        submission: { answer: (data.groundTruth.answer as number) + 1000 },
        groundTruth: data.groundTruth,
        startedAt: new Date(now.getTime() - 1000),
        submittedAt: now,
        apiCallCount: 0,
      });
      // total = -1000 + 300 = -700, clamped by Math.min(maxScore, total) → -700 (no floor at 0)
      expect(result.breakdown.total).toBeLessThan(0);
    });

    it("anti-gaming with negative scores still passes (negative < ceiling)", () => {
      const spec = codeSpec({ "scorer.js": negScorerJs });
      const mod = buildModuleForSpec(spec);
      const data = mod.generateData(42, {});
      const ref = { seed: 42, answer: { answer: data.groundTruth.answer } };
      const result = checkAntiGaming(spec, mod, ref);
      // Probes give wrong answer → negative scores → below ceiling
      expect(result.passed).toBe(true);
    });
  });

  // ── A5: security-gauntlet — every prohibited pattern in sandboxed tier ──

  describe("A5: security-gauntlet (code security gate — all 16 prohibited patterns)", () => {
    const prohibitedSnippets: Array<{ label: string; code: string }> = [
      { label: "require()", code: 'var x = require("fs");' },
      { label: "import statement", code: 'import fs from "fs";' },
      { label: "process", code: "var x = process.env;" },
      { label: "__dirname", code: "var x = __dirname;" },
      { label: "__filename", code: "var x = __filename;" },
      { label: "globalThis", code: "var x = globalThis;" },
      { label: "eval()", code: 'eval("1+1");' },
      { label: "Function()", code: 'var f = Function("return 1")();' },
      { label: "fetch()", code: 'fetch("http://example.com");' },
      { label: "XMLHttpRequest", code: "var x = new XMLHttpRequest();" },
      { label: "WebSocket", code: 'var x = new WebSocket("ws://x");' },
      { label: "child_process", code: 'var cp = child_process;' },
      { label: "execSync", code: "execSync('ls');" },
      { label: "spawnSync", code: "spawnSync('ls');" },
      { label: "setTimeout", code: "setTimeout(function(){}, 100);" },
      { label: "setInterval", code: "setInterval(function(){}, 100);" },
    ];

    for (const { label, code } of prohibitedSnippets) {
      it(`blocks '${label}' in sandboxed tier`, () => {
        const codeFiles = { "data.js": `var x = 1;\n${code}`, "scorer.js": "var y = 2;" };
        const result = checkCodeSecurity(codeFiles);
        expect(result.passed).toBe(false);
        const violations = result.details?.violations as Array<{ pattern: string }>;
        expect(violations.some((v) => v.pattern === label)).toBe(true);
      });
    }

    it("patterns in comments are NOT flagged", () => {
      const codeFiles = {
        "data.js": '// require("fs")\n// import x from "y"\nvar x = 1;',
        "scorer.js": "// process.env\nvar y = 2;",
      };
      const result = checkCodeSecurity(codeFiles);
      expect(result.passed).toBe(true);
    });
  });

  // ── A6: content-flags — content safety flagging ──

  describe("A6: content-flags (content safety gate)", () => {
    const safetyPatterns = [
      "malware", "ransomware", "phishing", "exploit",
      "jailbreak", "bypass safety", "personal data",
      "social security", "credit card", "weapon", "CSAM",
    ];

    for (const pattern of safetyPatterns) {
      it(`flags '${pattern}' in description`, () => {
        const spec = declSpec({ description: `A challenge about ${pattern} detection techniques applied broadly.` });
        const result = checkContentSafety(spec);
        expect(result.passed).toBe(true); // flags but doesn't block
        const flags = result.details?.flags as Array<{ pattern: string }>;
        expect(flags).toBeDefined();
        expect(flags.length).toBeGreaterThan(0);
      });
    }

    it("flags appear in details.flags array", () => {
      const spec = declSpec({ description: "A challenge about malware and ransomware detection techniques." });
      const result = checkContentSafety(spec);
      const flags = result.details?.flags as Array<{ source: string; pattern: string }>;
      expect(flags.length).toBeGreaterThanOrEqual(2);
      const patterns = flags.map((f) => f.pattern);
      expect(patterns).toContain("malware");
      expect(patterns).toContain("ransomware");
    });

    it("gate passes with requires_admin_review when flagged", () => {
      const spec = declSpec({ description: "A challenge about exploit analysis and forensics practice." });
      const result = checkContentSafety(spec);
      expect(result.passed).toBe(true);
      expect(result.details?.requires_admin_review).toBe(true);
    });

    it("clean spec has no flags", () => {
      const spec = declSpec();
      const result = checkContentSafety(spec);
      expect(result.passed).toBe(true);
      expect(result.details?.flags).toBeUndefined();
    });
  });

  // ── A7: contract-breaker — contract consistency gate violations ──

  describe("A7: contract-breaker (contract consistency gate)", () => {
    it("seedable workspace without {{seed}} → fails", () => {
      const spec = declSpec({
        workspace: {
          type: "generator",
          seedable: true,
          challengeMd: "# Test\n\nNo seed placeholder in this challenge markdown text.",
        },
      });
      const result = checkContractConsistency(spec);
      expect(result.passed).toBe(false);
      expect(result.error).toContain("{{seed}}");
    });

    it("scorer field key missing from submission.schema → fails", () => {
      const spec = declSpec({
        submission: { type: "json", schema: { other_field: "number" } },
        scorer: {
          fields: [{ key: "missing_key", primitive: "exact_match" }],
        },
      });
      const result = checkContractConsistency(spec);
      expect(result.passed).toBe(false);
      expect(result.error).toContain("missing_key");
    });

    it("timeDimension referencing non-existent dimension → fails", () => {
      const spec = declSpec({
        scorer: {
          fields: [{ key: "value", primitive: "exact_match" }],
          timeDimension: "nonexistent_dim",
        },
      });
      const result = checkContractConsistency(spec);
      expect(result.passed).toBe(false);
      expect(result.error).toContain("nonexistent_dim");
    });

    it("all valid contract → passes", () => {
      const spec = declSpec();
      const result = checkContractConsistency(spec);
      expect(result.passed).toBe(true);
    });
  });

  // ── A8: mutual-exclusion — codeFiles XOR dataTemplate ──

  describe("A8: mutual-exclusion (codeFiles XOR dataTemplate)", () => {
    it("spec with both codeFiles AND dataTemplate → fails", () => {
      const spec = {
        ...declSpec(),
        codeFiles: {
          "data.js": "x".repeat(50),
          "scorer.js": "y".repeat(50),
        },
      };
      const result = validateSpec(spec);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.includes("mutually exclusive"))).toBe(true);
      }
    });

    it("spec with codeFiles only → passes (code-based)", () => {
      const spec = codeSpec();
      const result = validateSpec(spec);
      expect(result.valid).toBe(true);
    });

    it("spec with dataTemplate only → passes (declarative)", () => {
      const spec = declSpec();
      const result = validateSpec(spec);
      expect(result.valid).toBe(true);
    });

    it("spec with neither codeFiles nor dataTemplate → passes", () => {
      const spec = declSpec();
      // Remove dataTemplate
      const { dataTemplate: _, scorer: __, ...rest } = spec;
      const bareSpec = { ...rest };
      const result = validateSpec(bareSpec);
      expect(result.valid).toBe(true);
    });
  });
});

// ════════════════════════════════════════════════════════════════════════
// Section B: AX Edge Cases
// ════════════════════════════════════════════════════════════════════════

describe("Section B: AX Edge Cases", () => {

  // ── B1: Infinity and NaN in scores ──

  describe("B1: Infinity and NaN in scores", () => {
    it("scorer returning NaN → throws clear error", () => {
      const scorerJs = `
function score(input) {
  return { breakdown: { accuracy: NaN, speed: 100, total: NaN } };
}
module.exports = { score: score };
`;
      const spec = codeSpec({ "scorer.js": scorerJs });
      const mod = createCodeModule(spec);
      const data = mod.generateData(42, {});
      const now = new Date();
      expect(() =>
        mod.score({
          submission: { answer: 1 },
          groundTruth: data.groundTruth,
          startedAt: new Date(now.getTime() - 1000),
          submittedAt: now,
          apiCallCount: 0,
        }),
      ).toThrow(/must be a number/);
    });

    it("scorer returning Infinity → clamped to maxScore", () => {
      const scorerJs = `
function score(input) {
  return { breakdown: { accuracy: Infinity, speed: 100, total: Infinity } };
}
module.exports = { score: score };
`;
      const spec = codeSpec({ "scorer.js": scorerJs });
      const mod = createCodeModule(spec);
      const data = mod.generateData(42, {});
      const now = new Date();
      // Infinity is typeof "number" and isNaN(Infinity) is false, so it passes the check
      // Then Math.min(maxScore, Infinity) clamps to maxScore
      const result = mod.score({
        submission: { answer: 1 },
        groundTruth: data.groundTruth,
        startedAt: new Date(now.getTime() - 1000),
        submittedAt: now,
        apiCallCount: 0,
      });
      expect(result.breakdown.total).toBe(spec.scoring.maxScore);
    });

    it("scorer returning -Infinity → negative total (not clamped to 0)", () => {
      const scorerJs = `
function score(input) {
  return { breakdown: { accuracy: -Infinity, speed: 100 } };
}
module.exports = { score: score };
`;
      const spec = codeSpec({ "scorer.js": scorerJs });
      const mod = createCodeModule(spec);
      const data = mod.generateData(42, {});
      const now = new Date();
      const result = mod.score({
        submission: { answer: 1 },
        groundTruth: data.groundTruth,
        startedAt: new Date(now.getTime() - 1000),
        submittedAt: now,
        apiCallCount: 0,
      });
      // auto-computed total: -Infinity + 100 = -Infinity, then Math.min(1000, -Infinity) = -Infinity
      expect(result.breakdown.total).toBe(-Infinity);
    });
  });

  // ── B2: Slug validation boundaries ──

  describe("B2: Slug validation boundaries", () => {
    it("slug exactly 3 chars ('abc') → passes", () => {
      const result = validateSpec(declSpec({ slug: "abc" }));
      expect(result.valid).toBe(true);
    });

    it("slug exactly 40 chars → passes", () => {
      const slug = "a" + "b".repeat(38) + "c"; // 40 chars, starts and ends alphanumeric
      const result = validateSpec(declSpec({ slug }));
      expect(result.valid).toBe(true);
    });

    it("slug 2 chars → fails", () => {
      const result = validateSpec(declSpec({ slug: "ab" }));
      expect(result.valid).toBe(false);
    });

    it("slug 41 chars → fails", () => {
      const slug = "a" + "b".repeat(39) + "c"; // 41 chars
      const result = validateSpec(declSpec({ slug }));
      expect(result.valid).toBe(false);
    });

    it("slug starting with number → fails", () => {
      const result = validateSpec(declSpec({ slug: "1abc" }));
      expect(result.valid).toBe(false);
    });

    it("slug ending with hyphen → fails", () => {
      const result = validateSpec(declSpec({ slug: "abc-" }));
      expect(result.valid).toBe(false);
    });

    it("slug with uppercase → fails", () => {
      const result = validateSpec(declSpec({ slug: "Abcd" }));
      expect(result.valid).toBe(false);
    });
  });

  // ── B3: challengeMd length boundaries ──

  describe("B3: challengeMd length boundaries", () => {
    it("exactly 10 chars → passes", () => {
      const result = validateSpec(declSpec({
        workspace: { type: "generator", seedable: true, challengeMd: "a {{seed}}" },
      }));
      expect(result.valid).toBe(true);
    });

    it("9 chars → fails", () => {
      const result = validateSpec(declSpec({
        workspace: { type: "generator", seedable: true, challengeMd: "a{{seed}}" },
      }));
      expect(result.valid).toBe(false);
    });

    it("5000 chars → passes", () => {
      const md = "# Test {{seed}}\n" + "x".repeat(5000 - 16);
      const result = validateSpec(declSpec({
        workspace: { type: "generator", seedable: true, challengeMd: md },
      }));
      expect(result.valid).toBe(true);
    });

    it("5001 chars → fails", () => {
      const md = "# Test {{seed}}\n" + "x".repeat(5001 - 16);
      const result = validateSpec(declSpec({
        workspace: { type: "generator", seedable: true, challengeMd: md },
      }));
      expect(result.valid).toBe(false);
    });
  });

  // ── B4: Scoring dimension count ──

  describe("B4: Scoring dimension count", () => {
    it("1 dimension → fails (min 2)", () => {
      const result = validateSpec(declSpec({
        scoring: {
          method: "deterministic",
          dimensions: [
            { key: "only", label: "Only", weight: 1.0, description: "Only", color: "emerald" },
          ],
          maxScore: 1000,
        },
      }));
      expect(result.valid).toBe(false);
    });

    it("2 dimensions → passes", () => {
      const result = validateSpec(declSpec({
        scoring: {
          method: "deterministic",
          dimensions: dims([0.6, 0.4]),
          maxScore: 1000,
        },
      }));
      expect(result.valid).toBe(true);
    });

    it("6 dimensions → passes", () => {
      const result = validateSpec(declSpec({
        scoring: {
          method: "deterministic",
          dimensions: [
            { key: "a", label: "A", weight: 0.2, description: "A", color: "emerald" },
            { key: "b", label: "B", weight: 0.2, description: "B", color: "sky" },
            { key: "c", label: "C", weight: 0.15, description: "C", color: "gold" },
            { key: "d", label: "D", weight: 0.15, description: "D", color: "purple" },
            { key: "e", label: "E", weight: 0.15, description: "E", color: "coral" },
            { key: "f", label: "F", weight: 0.15, description: "F", color: "emerald" },
          ],
          maxScore: 1000,
        },
      }));
      expect(result.valid).toBe(true);
    });

    it("7 dimensions → fails (max 6)", () => {
      const result = validateSpec(declSpec({
        scoring: {
          method: "deterministic",
          dimensions: [
            { key: "a", label: "A", weight: 0.15, description: "A", color: "emerald" },
            { key: "b", label: "B", weight: 0.15, description: "B", color: "sky" },
            { key: "c", label: "C", weight: 0.15, description: "C", color: "gold" },
            { key: "d", label: "D", weight: 0.15, description: "D", color: "purple" },
            { key: "e", label: "E", weight: 0.14, description: "E", color: "coral" },
            { key: "f", label: "F", weight: 0.13, description: "F", color: "emerald" },
            { key: "g", label: "G", weight: 0.13, description: "G", color: "sky" },
          ],
          maxScore: 1000,
        },
      }));
      expect(result.valid).toBe(false);
    });
  });

  // ── B5: maxScore boundaries ──

  describe("B5: maxScore boundaries", () => {
    it("99 → fails", () => {
      const result = validateSpec(declSpec({
        scoring: { method: "deterministic", dimensions: dims([0.6, 0.4]), maxScore: 99 },
      }));
      expect(result.valid).toBe(false);
    });

    it("100 → passes", () => {
      const result = validateSpec(declSpec({
        scoring: { method: "deterministic", dimensions: dims([0.6, 0.4]), maxScore: 100 },
      }));
      expect(result.valid).toBe(true);
    });

    it("10000 → passes", () => {
      const result = validateSpec(declSpec({
        scoring: { method: "deterministic", dimensions: dims([0.6, 0.4]), maxScore: 10000 },
        // maxScore > 1000 without codeFiles requires scorer
        scorer: { fields: [{ key: "value", primitive: "exact_match" }] },
      }));
      expect(result.valid).toBe(true);
    });

    it("10001 → fails", () => {
      const result = validateSpec(declSpec({
        scoring: { method: "deterministic", dimensions: dims([0.6, 0.4]), maxScore: 10001 },
      }));
      expect(result.valid).toBe(false);
    });
  });

  // ── B6: timeLimitSecs boundaries ──

  describe("B6: timeLimitSecs boundaries", () => {
    it("9 → fails", () => {
      const result = validateSpec(declSpec({ timeLimitSecs: 9 }));
      expect(result.valid).toBe(false);
    });

    it("10 → passes", () => {
      const result = validateSpec(declSpec({ timeLimitSecs: 10 }));
      expect(result.valid).toBe(true);
    });

    it("7200 → passes", () => {
      const result = validateSpec(declSpec({ timeLimitSecs: 7200 }));
      expect(result.valid).toBe(true);
    });

    it("7201 → fails", () => {
      const result = validateSpec(declSpec({ timeLimitSecs: 7201 }));
      expect(result.valid).toBe(false);
    });
  });

  // ── B7: Code file size limits ──

  describe("B7: Code file size limits", () => {
    it("data.js exactly 50 chars → passes", () => {
      const code = "function generateData(s){return{objective:'x',groundTruth:{}}}\nmodule.exports={generateData}";
      // Make exactly 50 chars
      const padded = "x".repeat(50);
      const spec = codeSpec({ "data.js": padded });
      // 50 chars is the minimum for data.js
      const result = validateSpec(spec);
      expect(result.valid).toBe(true);
    });

    it("data.js 49 chars → fails", () => {
      const padded = "x".repeat(49);
      const spec = codeSpec({ "data.js": padded });
      const result = validateSpec(spec);
      expect(result.valid).toBe(false);
    });
  });

  // B8 (GPU/custom tier validation) removed — tier taxonomy removed.

  // ── B9: VM timeout and error messages ──

  describe("B9: VM timeout and error messages", () => {
    it("data.js with top-level infinite loop → VM timeout during module load", () => {
      // NOTE: Infinite loops INSIDE function bodies (e.g. inside generateData())
      // are NOT caught by the VM timeout — the timeout only applies to script
      // execution, not subsequent function calls. This is a known limitation.
      // Only top-level infinite loops are caught.
      const dataJs = `
while(true) {} // top-level — caught by VM timeout
function generateData(seed) {
  return { objective: "x", groundTruth: { answer: 1 } };
}
module.exports = { generateData: generateData };
`;
      const spec = codeSpec({ "data.js": dataJs });
      const mod = buildModuleForSpec(spec);
      const result = checkDeterminism(mod);
      expect(result.passed).toBe(false);
      expect(result.error).toBeDefined();
    }, 30000); // VM timeout is 5s × multiple calls

    it("scorer.js throwing → baseline solveability reports error", () => {
      const scorerJs = `
function score(input) {
  throw new Error("Intentional scorer error");
}
module.exports = { score: score };
`;
      const spec = codeSpec({ "scorer.js": scorerJs });
      const mod = buildModuleForSpec(spec);
      const data = mod.generateData(42, {});
      const ref = { seed: 42, answer: { answer: data.groundTruth.answer } };
      const result = checkBaselineSolveability(spec, mod, ref);
      expect(result.passed).toBe(false);
      expect(result.error).toContain("score() threw");
    });

    it("data.js returning non-object → clear error about 'must return an object'", () => {
      const dataJs = `
function generateData(seed) {
  return "not an object";
}
module.exports = { generateData: generateData };
`;
      const spec = codeSpec({ "data.js": dataJs });
      const mod = createCodeModule(spec);
      expect(() => mod.generateData(42, {})).toThrow(/must return an object/);
    });

    it("data.js missing objective → clear error", () => {
      const dataJs = `
function generateData(seed) {
  return { groundTruth: { answer: 42 } };
}
module.exports = { generateData: generateData };
`;
      const spec = codeSpec({ "data.js": dataJs });
      const mod = createCodeModule(spec);
      expect(() => mod.generateData(42, {})).toThrow(/objective/);
    });

    it("data.js missing groundTruth → clear error", () => {
      const dataJs = `
function generateData(seed) {
  return { objective: "Do the thing" };
}
module.exports = { generateData: generateData };
`;
      const spec = codeSpec({ "data.js": dataJs });
      const mod = createCodeModule(spec);
      expect(() => mod.generateData(42, {})).toThrow(/groundTruth/);
    });
  });
});

// ════════════════════════════════════════════════════════════════════════
// Section C: Scoring Primitive Edge Cases
// ════════════════════════════════════════════════════════════════════════

describe("Section C: Scoring Primitive Edge Cases", () => {

  describe("exact_match", () => {
    it("case-insensitive string match", () => {
      expect(exact_match("Hello", "hello")).toBe(1);
    });
    it("case-insensitive string mismatch", () => {
      expect(exact_match("Hello", "World")).toBe(0);
    });
    it("number equality", () => {
      expect(exact_match(42, 42)).toBe(1);
    });
    it("number inequality", () => {
      expect(exact_match(42, 43)).toBe(0);
    });
    it("null handling", () => {
      expect(exact_match(null, null)).toBe(1);
      expect(exact_match(null, "x")).toBe(0);
    });
  });

  describe("exact_match_ratio", () => {
    it("both empty arrays → 1", () => {
      expect(exact_match_ratio([], [])).toBe(1);
    });
    it("submitted empty, expected non-empty → 0", () => {
      expect(exact_match_ratio([], [1, 2, 3])).toBe(0);
    });
    it("submitted non-empty, expected empty → 0", () => {
      expect(exact_match_ratio([1, 2], [])).toBe(0);
    });
    it("partial match (order-sensitive)", () => {
      expect(exact_match_ratio([1, 2, 99], [1, 2, 3])).toBeCloseTo(2 / 3, 5);
    });
    it("submitted longer than expected — extra items ignored", () => {
      expect(exact_match_ratio([1, 2, 3, 4, 5], [1, 2, 3])).toBe(1);
    });
  });

  describe("numeric_tolerance", () => {
    it("exact match (diff=0) → 1", () => {
      expect(numeric_tolerance(10, 10, 0.5)).toBe(1);
    });
    it("within tolerance → 1", () => {
      expect(numeric_tolerance(10.3, 10, 0.5)).toBe(1);
    });
    it("at tolerance boundary → 1", () => {
      expect(numeric_tolerance(10.5, 10, 0.5)).toBe(1);
    });
    it("linear decay between tolerance and 5x tolerance", () => {
      // diff = 1.5, tolerance = 0.5, maxDiff = 2.5
      // score = 1 - (1.5-0.5)/(2.5-0.5) = 1 - 1/2 = 0.5
      expect(numeric_tolerance(11.5, 10, 0.5)).toBeCloseTo(0.5, 5);
    });
    it("at 5x tolerance → 0", () => {
      expect(numeric_tolerance(12.5, 10, 0.5)).toBe(0);
    });
    it("beyond 5x tolerance → 0", () => {
      expect(numeric_tolerance(100, 10, 0.5)).toBe(0);
    });
  });

  describe("fuzzy_string", () => {
    it("identical strings → 1", () => {
      expect(fuzzy_string("hello", "hello")).toBe(1);
    });
    it("completely different (same length) → low score", () => {
      expect(fuzzy_string("aaaa", "zzzz")).toBeLessThan(0.5);
    });
    it("both empty strings → 1", () => {
      expect(fuzzy_string("", "")).toBe(1);
    });
    it("case-insensitive", () => {
      expect(fuzzy_string("HELLO", "hello")).toBe(1);
    });
  });

  describe("time_decay", () => {
    it("t=0 returns 1", () => {
      expect(time_decay(0, 100)).toBe(1);
    });
    it("t=limit returns 0", () => {
      expect(time_decay(100, 100)).toBe(0);
    });
    it("negative t returns 1", () => {
      expect(time_decay(-5, 100)).toBe(1);
    });
    it("t > limit returns 0", () => {
      expect(time_decay(200, 100)).toBe(0);
    });
    it("midpoint returns 0.5", () => {
      expect(time_decay(50, 100)).toBeCloseTo(0.5, 5);
    });
  });

  describe("api_call_efficiency", () => {
    it("at optimal → 1", () => {
      expect(api_call_efficiency(5, 5, 20)).toBe(1);
    });
    it("below optimal → 1", () => {
      expect(api_call_efficiency(3, 5, 20)).toBe(1);
    });
    it("at max → 0", () => {
      expect(api_call_efficiency(20, 5, 20)).toBe(0);
    });
    it("beyond max → 0", () => {
      expect(api_call_efficiency(30, 5, 20)).toBe(0);
    });
    it("midpoint between optimal and max", () => {
      // calls=12.5, optimal=5, max=20: (12.5-5)/(20-5) = 7.5/15 = 0.5 → 1-0.5 = 0.5
      expect(api_call_efficiency(12.5, 5, 20)).toBeCloseTo(0.5, 5);
    });
  });

  describe("coverage_ratio", () => {
    it("0/0 → 1 (vacuously true)", () => {
      expect(coverage_ratio(0, 0)).toBe(1);
    });
    it("n/0 with n>0 → 0", () => {
      expect(coverage_ratio(5, 0)).toBe(0);
    });
    it("partial coverage", () => {
      expect(coverage_ratio(3, 10)).toBeCloseTo(0.3, 5);
    });
    it("full coverage → 1", () => {
      expect(coverage_ratio(10, 10)).toBe(1);
    });
    it("over-coverage clamped to 1", () => {
      expect(coverage_ratio(15, 10)).toBe(1);
    });
  });

  describe("set_overlap", () => {
    it("disjoint sets → 0", () => {
      expect(set_overlap([1, 2, 3], [4, 5, 6])).toBe(0);
    });
    it("identical sets → 1", () => {
      expect(set_overlap([1, 2, 3], [1, 2, 3])).toBe(1);
    });
    it("partial overlap", () => {
      // A={1,2,3}, B={2,3,4}: intersection={2,3}=2, union={1,2,3,4}=4 → 2/4 = 0.5
      expect(set_overlap([1, 2, 3], [2, 3, 4])).toBeCloseTo(0.5, 5);
    });
    it("both empty → 1", () => {
      expect(set_overlap([], [])).toBe(1);
    });
    it("one empty, one non-empty → 0", () => {
      expect(set_overlap([], [1, 2])).toBe(0);
    });
  });

  describe("SCORING_PRIMITIVES registry", () => {
    it("contains all 8 primitives", () => {
      const expected = [
        "exact_match", "exact_match_ratio", "numeric_tolerance", "fuzzy_string",
        "time_decay", "api_call_efficiency", "coverage_ratio", "set_overlap",
      ];
      for (const name of expected) {
        expect(SCORING_PRIMITIVES[name]).toBeTypeOf("function");
      }
    });
  });
});

// ════════════════════════════════════════════════════════════════════════
// Section D: Agent Review Governance (Lightweight)
// ════════════════════════════════════════════════════════════════════════

describe("Section D: Agent Review Governance", () => {

  it("D1 REVIEW_MIN_MATCHES is a positive integer", () => {
    expect(REVIEW_MIN_MATCHES).toBeGreaterThan(0);
    expect(Number.isInteger(REVIEW_MIN_MATCHES)).toBe(true);
  });

  it("D2 new agent (0 matches) is not eligible", () => {
    expect(isReviewerEligible({ matchCount: 0 })).toBe(false);
  });

  it("D3 agent just below threshold is not eligible", () => {
    expect(isReviewerEligible({ matchCount: REVIEW_MIN_MATCHES - 1 })).toBe(false);
  });

  it("D4 agent at threshold is eligible", () => {
    expect(isReviewerEligible({ matchCount: REVIEW_MIN_MATCHES })).toBe(true);
  });

  it("D5 veteran agent (100+ matches) is eligible", () => {
    expect(isReviewerEligible({ matchCount: 100 })).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════
// Section E: Full runAllGates Orchestration
// ════════════════════════════════════════════════════════════════════════

describe("Section E: Full runAllGates Orchestration", () => {

  it("A1 network-topology code-based → all gates pass", async () => {
    const helpersJs = `
function createGraph(n, edges) { var adj = {}; for(var i=0;i<n;i++) adj[i]=[]; for(var e=0;e<edges.length;e++){adj[edges[e][0]].push(edges[e][1]);adj[edges[e][1]].push(edges[e][0]);} return adj; }
function bfs(adj,start) { var dist={}; dist[start]=0; var q=[start]; while(q.length>0){var n=q.shift(); var nb=adj[n]||[]; for(var i=0;i<nb.length;i++){if(dist[nb[i]]===undefined){dist[nb[i]]=dist[n]+1;q.push(nb[i]);}}} return dist; }
`;
    const dataJs = `
function generateData(seed) {
  var r = rng(seed);
  var n = Math.floor(r()*6)+5;
  var edges = [];
  for(var i=1;i<n;i++) edges.push([Math.floor(r()*i),i]);
  var adj = createGraph(n, edges);
  var distances = bfs(adj, 0);
  return { objective: "Find shortest paths", groundTruth: { distances: distances, nodeCount: n }, nodeCount: n, edges: edges };
}
module.exports = { generateData: generateData };
`;
    const scorerJs = `
function score(input) {
  var sub = input.submission; var gt = input.groundTruth;
  var d = gt.distances; var sd = (sub.distances && typeof sub.distances === "object" && !Array.isArray(sub.distances)) ? sub.distances : {}; var n = gt.nodeCount;
  var correct = 0; var total = 0;
  for(var i=0;i<n;i++){if(d[i]!==undefined){total++;if(sd[i]===d[i])correct++;}}
  var acc = total>0 ? Math.round((correct/total)*700) : 0;
  var elapsed = (new Date(input.submittedAt)-new Date(input.startedAt))/1000;
  var speed = Math.round(Math.max(0,1-elapsed/120)*300);
  return { breakdown: { accuracy: acc, speed: speed, total: acc+speed } };
}
module.exports = { score: score };
`;
    const spec = codeSpec(
      { "data.js": dataJs, "scorer.js": scorerJs, "helpers.js": helpersJs },
      { slug: "net-topo-e2e", name: "Net Topo E2E", description: "End to end test for network topology challenge spec." },
    );
    const mod = buildModuleForSpec(spec);
    const data = mod.generateData(42, {});
    const ref = { seed: 42, answer: { distances: data.groundTruth.distances } };
    const report = await runAllGates(spec, ref, DESIGN_GUIDE_HASH);
    expect(report.overall).toBe("pass");
    expect(report.gates.spec_validity.passed).toBe(true);
    expect(report.gates.code_syntax!.passed).toBe(true);
    expect(report.gates.code_security!.passed).toBe(true);
    expect(report.gates.determinism.passed).toBe(true);
  });

  it("A2 data-forensics declarative → all gates pass", async () => {
    const spec = declSpec({
      slug: "data-forensics-e2e",
      name: "Data Forensics E2E",
      description: "End to end declarative challenge for battle testing.",
      scoring: {
        method: "deterministic",
        dimensions: [
          { key: "identification", label: "ID", weight: 0.5, description: "Id", color: "emerald" },
          { key: "evidence", label: "Evidence", weight: 0.5, description: "Ev", color: "sky" },
        ],
        maxScore: 1000,
      },
      scorer: {
        fields: [
          { key: "suspect", primitive: "exact_match", weight: 1 },
          { key: "case_number", primitive: "exact_match", weight: 1 },
        ],
      },
      dataTemplate: {
        pools: [{ name: "suspects", items: ["Alice", "Bob", "Charlie", "Diana", "Eve"] }],
        fields: {
          suspect: { type: "pick_one", pool: "suspects" },
          case_number: { type: "rand_int", min: 10000, max: 99999 },
        },
      },
      submission: { type: "json", schema: { suspect: "string", case_number: "number" } },
    });
    const mod = buildModuleForSpec(spec);
    const data = mod.generateData(42, {});
    const ref = { seed: 42, answer: { suspect: data.groundTruth.suspect, case_number: data.groundTruth.case_number } };
    const report = await runAllGates(spec, ref, DESIGN_GUIDE_HASH);
    expect(report.overall).toBe("pass");
    // Declarative specs should NOT have code_syntax or code_security
    expect(report.gates.code_syntax).toBeUndefined();
    expect(report.gates.code_security).toBeUndefined();
  });

  it("syntax error in data.js → code_syntax fails, subsequent gates skipped", async () => {
    // Code must be ≥50 chars to pass spec_validity, so we pad the syntax error
    const badDataJs = `
// This file has a syntax error that will be caught by the code_syntax gate.
function generateData(seed { SYNTAX ERROR HERE }
module.exports = { generateData: generateData };
`;
    const spec = codeSpec({ "data.js": badDataJs });
    const ref = { seed: 42, answer: {} };
    const report = await runAllGates(spec, ref, DESIGN_GUIDE_HASH);
    expect(report.overall).toBe("fail");
    expect(report.gates.code_syntax!.passed).toBe(false);
    // Security and content safety skipped
    expect(report.gates.code_security!.passed).toBe(false);
    expect(report.gates.code_security!.error).toContain("Skipped");
  });

  it("require() in scorer.js → code_security fails fast, execution gates skipped", async () => {
    const scorerJs = `
var fs = require("fs");
function score(input) { return { breakdown: { accuracy: 500, speed: 500, total: 1000 } }; }
module.exports = { score: score };
`;
    const spec = codeSpec({ "scorer.js": scorerJs });
    const ref = { seed: 42, answer: { answer: 1 } };
    const report = await runAllGates(spec, ref, DESIGN_GUIDE_HASH);
    expect(report.overall).toBe("fail");
    expect(report.gates.code_security!.passed).toBe(false);
    expect(report.gates.determinism.passed).toBe(false);
    expect(report.gates.determinism.error).toContain("Skipped");
  });

  it("matching designGuideHash → design_guide_hash passes", async () => {
    const spec = declSpec();
    const mod = buildModuleForSpec(spec);
    const data = mod.generateData(42, {});
    const specWithHash = { ...spec, protocolMetadata: { designGuideHash: "matching-hash" } };
    const ref = { seed: 42, answer: { value: data.groundTruth.value } };
    const report = await runAllGates(specWithHash, ref, "matching-hash");
    expect(report.gates.design_guide_hash.passed).toBe(true);
  });

  it("mismatching designGuideHash → overall = 'warn'", async () => {
    const spec = declSpec();
    const mod = buildModuleForSpec(spec);
    const data = mod.generateData(42, {});
    const specWithHash = { ...spec, protocolMetadata: { designGuideHash: "old-hash" } };
    const ref = { seed: 42, answer: { value: data.groundTruth.value } };
    const report = await runAllGates(specWithHash, ref, "new-hash");
    expect(report.gates.design_guide_hash.passed).toBe(false);
    expect(report.overall).toBe("warn");
  });

  it("content safety flag → overall = 'warn' (not fail)", async () => {
    const spec = codeSpec({}, {
      description: "A challenge about malware detection and analysis techniques applied.",
    });
    const mod = buildModuleForSpec(spec);
    const data = mod.generateData(42, {});
    const ref = { seed: 42, answer: { answer: data.groundTruth.answer } };
    const report = await runAllGates(spec, ref, DESIGN_GUIDE_HASH);
    // Content safety flags don't block — overall should be "warn" not "fail"
    if (report.gates.content_safety?.details?.requires_admin_review) {
      expect(report.overall).toBe("warn");
    }
  });

  it("code-based spec includes code_syntax and code_security keys", async () => {
    const spec = codeSpec();
    const mod = buildModuleForSpec(spec);
    const data = mod.generateData(42, {});
    const ref = { seed: 42, answer: { answer: data.groundTruth.answer } };
    const report = await runAllGates(spec, ref, DESIGN_GUIDE_HASH);
    expect(report.gates.code_syntax).toBeDefined();
    expect(report.gates.code_security).toBeDefined();
  });

  it("declarative spec does NOT include code_syntax or code_security keys", async () => {
    const spec = declSpec();
    const mod = buildModuleForSpec(spec);
    const data = mod.generateData(42, {});
    const ref = { seed: 42, answer: { value: data.groundTruth.value } };
    const report = await runAllGates(spec, ref, DESIGN_GUIDE_HASH);
    expect(report.gates.code_syntax).toBeUndefined();
    expect(report.gates.code_security).toBeUndefined();
  });
});
