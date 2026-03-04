import { describe, it, expect } from "vitest";
import { generateMappingData } from "../src/challenges/deep-mapping/data.js";
import { scoreMapping } from "../src/challenges/deep-mapping/scorer.js";
import { generateCipherData } from "../src/challenges/cipher-forge/data.js";
import { scoreCipher } from "../src/challenges/cipher-forge/scorer.js";
import { generateLogicData } from "../src/challenges/logic-reef/data.js";
import { scoreLogic } from "../src/challenges/logic-reef/scorer.js";
import { generateRefactorData } from "../src/challenges/reef-refactor/data.js";
import { scoreRefactor } from "../src/challenges/reef-refactor/scorer.js";
import { generateDepthFirstData } from "../src/challenges/depth-first-gen/data.js";
import { scoreDepthFirst } from "../src/challenges/depth-first-gen/scorer.js";
import { generateArchiveData } from "../src/challenges/archive-dive/data.js";
import { scoreArchive } from "../src/challenges/archive-dive/scorer.js";
import { generateContractData } from "../src/challenges/contract-review/data.js";
import { scoreContract } from "../src/challenges/contract-review/scorer.js";
import { generateForensicsData } from "../src/challenges/chart-forensics/data.js";
import { scoreForensics } from "../src/challenges/chart-forensics/scorer.js";
import { generateCartographerData } from "../src/challenges/cartographers-eye/data.js";
import { scoreCartographer } from "../src/challenges/cartographers-eye/scorer.js";
import { generateBlueprintData } from "../src/challenges/blueprint-audit/data.js";
import { scoreBlueprint } from "../src/challenges/blueprint-audit/scorer.js";
import { generateInterviewData } from "../src/challenges/adversarial-interview/data.js";
import { scoreInterview } from "../src/challenges/adversarial-interview/scorer.js";
import { generateMirageData } from "../src/challenges/the-mirage/data.js";
import { scoreMirage } from "../src/challenges/the-mirage/scorer.js";
import { generateArchaeologyData } from "../src/challenges/codebase-archaeology/data.js";
import { scoreArchaeology } from "../src/challenges/codebase-archaeology/scorer.js";
import { generateHaystackData } from "../src/challenges/needle-haystack/data.js";
import { scoreHaystack } from "../src/challenges/needle-haystack/scorer.js";
import { generateOptimizerData } from "../src/challenges/performance-optimizer/data.js";
import { scoreOptimizer } from "../src/challenges/performance-optimizer/scorer.js";
import { generateLighthouseData } from "../src/challenges/lighthouse-incident/data.js";
import { scoreLighthouse } from "../src/challenges/lighthouse-incident/scorer.js";

// ── Deep Mapping ─────────────────────────────────────────────────────

describe("Deep Mapping data generation", () => {
  it("is deterministic", () => {
    const d1 = generateMappingData(42);
    const d2 = generateMappingData(42);
    expect(d1.groundTruth).toEqual(d2.groundTruth);
    expect(d1.nodes).toEqual(d2.nodes);
  });

  it("different seeds produce different data", () => {
    const d1 = generateMappingData(42);
    const d2 = generateMappingData(999);
    expect(d1.groundTruth.deepestNode.id).not.toBe(d2.groundTruth.deepestNode.id);
  });

  it("generates 80-120 nodes", () => {
    const d = generateMappingData(42);
    expect(d.nodes.length).toBeGreaterThanOrEqual(80);
    expect(d.nodes.length).toBeLessThanOrEqual(120);
  });

  it("graph is connected (all nodes reachable from start)", () => {
    const d = generateMappingData(42);
    const visited = new Set<string>();
    const queue = [d.startNodeId];
    visited.add(d.startNodeId);
    while (queue.length > 0) {
      const current = queue.shift()!;
      const node = d.nodes.find((n) => n.id === current);
      if (!node) continue;
      for (const edge of node.connections) {
        if (!visited.has(edge.target)) {
          visited.add(edge.target);
          queue.push(edge.target);
        }
      }
    }
    expect(visited.size).toBe(d.nodes.length);
  });

  it("has nodes with biome assignments", () => {
    const d = generateMappingData(42);
    for (const node of d.nodes) {
      expect(node.biome).toBeDefined();
      expect(node.biome.length).toBeGreaterThan(0);
    }
  });

  it("has connections with energy costs", () => {
    const d = generateMappingData(42);
    for (const node of d.nodes) {
      for (const edge of node.connections) {
        expect(edge.energy).toBeGreaterThan(0);
        expect(typeof edge.oneWay).toBe("boolean");
      }
    }
  });

  it("has some one-way connections", () => {
    const d = generateMappingData(42);
    const oneWayCount = d.nodes.reduce(
      (sum, n) => sum + n.connections.filter(e => e.oneWay).length, 0
    );
    expect(oneWayCount).toBeGreaterThan(0);
  });

  it("includes oxygen budget and planning question in ground truth", () => {
    const d = generateMappingData(42);
    expect(d.groundTruth.oxygenBudget).toBeGreaterThan(0);
    expect(d.groundTruth.planningStart).toBeDefined();
    expect(d.groundTruth.planningEnd).toBeDefined();
    expect(d.groundTruth.planningOptimalPath.length).toBeGreaterThan(0);
    expect(d.groundTruth.planningOptimalBiomes).toBeGreaterThan(0);
  });
});

describe("Deep Mapping scoring", () => {
  const data = generateMappingData(42);
  const gt = data.groundTruth;
  const startedAt = new Date("2026-02-01T10:00:00Z");

  it("is deterministic", () => {
    const sub = { nodes_discovered: 20 };
    const r1 = scoreMapping({ submission: sub, groundTruth: gt as any, startedAt, submittedAt: new Date(startedAt.getTime() + 600000), apiCallCount: 0 });
    const r2 = scoreMapping({ submission: sub, groundTruth: gt as any, startedAt, submittedAt: new Date(startedAt.getTime() + 600000), apiCallCount: 0 });
    expect(r1).toEqual(r2);
  });

  it("full coverage gets high coverage score", () => {
    const allNodeIds = Object.keys(gt.graph);
    const r = scoreMapping({
      submission: {
        nodes_discovered: gt.totalNodes,
        total_nodes: gt.totalNodes,
        explored_nodes: allNodeIds,
        deepest_node: gt.deepestNode.id,
        most_connected_node: gt.mostConnectedNode.id,
        resources_by_type: gt.resourcesByType,
        total_resource_value: gt.totalResourceValue,
        best_path: gt.optimalPath,
        path_value: gt.optimalPathValue,
      },
      groundTruth: gt as any, startedAt, submittedAt: new Date(startedAt.getTime() + 600000),
      apiCallCount: 0,
    });
    expect(r.breakdown.total).toBeGreaterThanOrEqual(600);
    expect(r.breakdown.speed).toBeGreaterThan(0);
  });

  it("score never exceeds 1000", () => {
    const allNodeIds = Object.keys(gt.graph);
    const r = scoreMapping({
      submission: {
        nodes_discovered: gt.totalNodes,
        total_nodes: gt.totalNodes,
        explored_nodes: allNodeIds,
        deepest_node: gt.deepestNode.id,
        most_connected_node: gt.mostConnectedNode.id,
        resources_by_type: gt.resourcesByType,
        total_resource_value: gt.totalResourceValue,
        best_path: gt.optimalPath,
        path_value: gt.optimalPathValue,
      },
      groundTruth: gt as any, startedAt, submittedAt: new Date(startedAt.getTime() + 60000),
      apiCallCount: 0,
    });
    expect(r.breakdown.total).toBeLessThanOrEqual(1000);
  });
});

// ── Cipher Forge ────────────────────────────────────────────────────

describe("Cipher Forge data generation", () => {
  it("is deterministic — same seed produces same data", () => {
    const d1 = generateCipherData(42);
    const d2 = generateCipherData(42);
    expect(d1.groundTruth).toEqual(d2.groundTruth);
    expect(d1.messages).toEqual(d2.messages);
  });

  it("different seeds produce different data", () => {
    const d1 = generateCipherData(42);
    const d2 = generateCipherData(99);
    expect(d1.groundTruth.messages[0].plaintext).not.toBe(d2.groundTruth.messages[0].plaintext);
  });

  it("generates 5 messages with progressive difficulty", () => {
    const d = generateCipherData(42);
    expect(d.messages).toHaveLength(5);
    for (let i = 0; i < 5; i++) {
      expect(d.messages[i].difficulty).toBe(i + 1);
    }
  });

  it("generates different cipher types", () => {
    const d = generateCipherData(42);
    const types = d.messages.map((m) => m.cipher_type);
    expect(types).toContain("caesar");
    expect(types).toContain("substitution");
    expect(types).toContain("vigenere");
    expect(types).toContain("transposition");
    expect(types).toContain("combined");
  });

  it("provides a reference table", () => {
    const d = generateCipherData(42);
    expect(d.reference_table.most_common).toBeDefined();
  });
});

describe("Cipher Forge scoring", () => {
  const data = generateCipherData(42);
  const gt = data.groundTruth;
  const startedAt = new Date("2026-02-01T10:00:00Z");

  it("is deterministic", () => {
    const sub: Record<string, unknown> = {};
    sub[gt.messages[0].id] = gt.messages[0].plaintext;
    const r1 = scoreCipher({ submission: sub, groundTruth: gt as any, startedAt, submittedAt: new Date(startedAt.getTime() + 30000), apiCallCount: 0 });
    const r2 = scoreCipher({ submission: sub, groundTruth: gt as any, startedAt, submittedAt: new Date(startedAt.getTime() + 30000), apiCallCount: 0 });
    expect(r1).toEqual(r2);
  });

  it("perfect answer gets high score", () => {
    const sub: Record<string, unknown> = {};
    for (const msg of gt.messages) {
      sub[msg.id] = msg.plaintext;
    }
    const r = scoreCipher({
      submission: sub, groundTruth: gt as any, startedAt,
      submittedAt: new Date(startedAt.getTime() + 30000), apiCallCount: 0,
    });
    expect(r.breakdown.total).toBeGreaterThanOrEqual(700);
    expect(r.breakdown.methodology).toBeGreaterThan(0);
  });

  it("score never exceeds 1000", () => {
    const sub: Record<string, unknown> = {};
    for (const msg of gt.messages) {
      sub[msg.id] = msg.plaintext;
    }
    const r = scoreCipher({
      submission: sub, groundTruth: gt as any, startedAt,
      submittedAt: new Date(startedAt.getTime() + 5000), apiCallCount: 0,
    });
    expect(r.breakdown.total).toBeLessThanOrEqual(1000);
  });
});

// ── Logic Reef ──────────────────────────────────────────────────────

describe("Logic Reef data generation", () => {
  it("is deterministic — same seed produces same data", () => {
    const d1 = generateLogicData(42);
    const d2 = generateLogicData(42);
    expect(d1.groundTruth).toEqual(d2.groundTruth);
    expect(d1.puzzles).toEqual(d2.puzzles);
  });

  it("different seeds produce different data", () => {
    const d1 = generateLogicData(42);
    const d2 = generateLogicData(99);
    expect(d1.puzzles[0].premises).not.toEqual(d2.puzzles[0].premises);
  });

  it("generates 8 puzzles (4 propositional + 4 constraint)", () => {
    const d = generateLogicData(42);
    expect(d.puzzles).toHaveLength(8);
    const propCount = d.puzzles.filter((p) => p.type === "propositional").length;
    const cspCount = d.puzzles.filter((p) => p.type === "constraint").length;
    expect(propCount).toBe(4);
    expect(cspCount).toBe(4);
  });

  it("each puzzle has premises, rules, and a question", () => {
    const d = generateLogicData(42);
    for (const p of d.puzzles) {
      expect(p.premises.length).toBeGreaterThan(0);
      expect(p.rules.length).toBeGreaterThan(0);
      expect(p.question.length).toBeGreaterThan(0);
    }
  });
});

describe("Logic Reef scoring", () => {
  const data = generateLogicData(42);
  const gt = data.groundTruth;
  const startedAt = new Date("2026-02-01T10:00:00Z");

  it("is deterministic", () => {
    const sub: Record<string, unknown> = {};
    sub[gt.puzzles[0].id] = gt.puzzles[0].answer;
    const r1 = scoreLogic({ submission: sub, groundTruth: gt as any, startedAt, submittedAt: new Date(startedAt.getTime() + 30000), apiCallCount: 0 });
    const r2 = scoreLogic({ submission: sub, groundTruth: gt as any, startedAt, submittedAt: new Date(startedAt.getTime() + 30000), apiCallCount: 0 });
    expect(r1).toEqual(r2);
  });

  it("perfect answer gets high score", () => {
    const sub: Record<string, unknown> = {};
    for (const puzzle of gt.puzzles) {
      sub[puzzle.id] = puzzle.answer;
    }
    sub.reasoning = "By logical deduction.";
    const r = scoreLogic({
      submission: sub, groundTruth: gt as any, startedAt,
      submittedAt: new Date(startedAt.getTime() + 30000), apiCallCount: 0,
    });
    expect(r.breakdown.total).toBeGreaterThanOrEqual(700);
    expect(r.breakdown.methodology).toBeGreaterThan(0);
    expect(r.breakdown.completeness).toBeGreaterThan(0);
  });

  it("score never exceeds 1000", () => {
    const sub: Record<string, unknown> = {};
    for (const puzzle of gt.puzzles) {
      sub[puzzle.id] = puzzle.answer;
    }
    sub.reasoning = "Short.";
    const r = scoreLogic({
      submission: sub, groundTruth: gt as any, startedAt,
      submittedAt: new Date(startedAt.getTime() + 5000), apiCallCount: 0,
    });
    expect(r.breakdown.total).toBeLessThanOrEqual(1000);
  });
});

// ── Reef Refactor ───────────────────────────────────────────────────

describe("Reef Refactor data generation", () => {
  it("is deterministic — same seed produces same data", () => {
    const d1 = generateRefactorData(42);
    const d2 = generateRefactorData(42);
    expect(d1.groundTruth).toEqual(d2.groundTruth);
    expect(d1.functions).toEqual(d2.functions);
  });

  it("different seeds produce different data", () => {
    const d1 = generateRefactorData(42);
    const d2 = generateRefactorData(99);
    const outputs1 = JSON.stringify(d1.groundTruth);
    const outputs2 = JSON.stringify(d2.groundTruth);
    expect(outputs1).not.toBe(outputs2);
  });

  it("generates 5 broken functions", () => {
    const d = generateRefactorData(42);
    expect(d.functions).toHaveLength(5);
  });

  it("each function has test cases", () => {
    const d = generateRefactorData(42);
    for (const fn of d.functions) {
      expect(fn.test_cases.length).toBeGreaterThanOrEqual(2);
      expect(fn.code.length).toBeGreaterThan(0);
      expect(fn.bug_description.length).toBeGreaterThan(0);
    }
  });

  it("ground truth has matching function count", () => {
    const d = generateRefactorData(42);
    expect(d.groundTruth.functions).toHaveLength(5);
  });
});

describe("Reef Refactor scoring", () => {
  const data = generateRefactorData(42);
  const gt = data.groundTruth;
  const startedAt = new Date("2026-02-01T10:00:00Z");

  it("is deterministic", () => {
    const sub: Record<string, unknown> = {};
    sub[gt.functions[0].id] = gt.functions[0].correct_outputs;
    const r1 = scoreRefactor({ submission: sub, groundTruth: gt as any, startedAt, submittedAt: new Date(startedAt.getTime() + 30000), apiCallCount: 0 });
    const r2 = scoreRefactor({ submission: sub, groundTruth: gt as any, startedAt, submittedAt: new Date(startedAt.getTime() + 30000), apiCallCount: 0 });
    expect(r1).toEqual(r2);
  });

  it("perfect answer gets high score", () => {
    const sub: Record<string, unknown> = {};
    for (const fn of gt.functions) {
      sub[fn.id] = fn.correct_outputs;
    }
    sub.methodology = "Traced each implementation against the intended contract, focusing on boundary conditions and operator-order pitfalls.";
    const r = scoreRefactor({
      submission: sub, groundTruth: gt as any, startedAt,
      submittedAt: new Date(startedAt.getTime() + 30000), apiCallCount: 0,
    });
    expect(r.breakdown.total).toBeGreaterThanOrEqual(700);
    expect(r.breakdown.methodology).toBeGreaterThan(0);
  });

  it("score never exceeds 1000", () => {
    const sub: Record<string, unknown> = {};
    for (const fn of gt.functions) {
      sub[fn.id] = fn.correct_outputs;
    }
    const r = scoreRefactor({
      submission: sub, groundTruth: gt as any, startedAt,
      submittedAt: new Date(startedAt.getTime() + 5000), apiCallCount: 0,
    });
    expect(r.breakdown.total).toBeLessThanOrEqual(1000);
  });

  it("empty submission gets low score", () => {
    const r = scoreRefactor({
      submission: {}, groundTruth: gt as any, startedAt,
      submittedAt: new Date(startedAt.getTime() + 30000), apiCallCount: 0,
    });
    expect(r.breakdown.correctness).toBe(0);
    expect(r.breakdown.completeness).toBe(0);
  });
});

// ── Depth-First Generation ─────────────────────────────────────────

describe("Depth-First Gen data generation", () => {
  it("is deterministic — same seed produces same data", () => {
    const d1 = generateDepthFirstData(42);
    const d2 = generateDepthFirstData(42);
    expect(d1.groundTruth).toEqual(d2.groundTruth);
    expect(d1.spec).toEqual(d2.spec);
  });

  it("different seeds produce different data", () => {
    const d1 = generateDepthFirstData(42);
    const d2 = generateDepthFirstData(99);
    const gt1 = JSON.stringify(d1.groundTruth);
    const gt2 = JSON.stringify(d2.groundTruth);
    expect(gt1).not.toBe(gt2);
  });
});

describe("Depth-First Gen scoring", () => {
  const data = generateDepthFirstData(42);
  const gt = data.groundTruth;
  const startedAt = new Date("2026-02-01T10:00:00Z");

  it("perfect answer gets high score", () => {
    const sub: Record<string, unknown> = {};
    for (const t of gt.test_outputs) {
      sub[t.id] = t.expected_output;
    }
    sub.methodology = "Derived the transformation by validating hypotheses across all provided examples before applying it to each test input.";
    const r = scoreDepthFirst({
      submission: sub, groundTruth: gt as any, startedAt,
      submittedAt: new Date(startedAt.getTime() + 30000), apiCallCount: 0,
    });
    expect(r.breakdown.total).toBeGreaterThanOrEqual(700);
    expect(r.breakdown.methodology).toBeGreaterThan(0);
  });

  it("score never exceeds 1000", () => {
    const sub: Record<string, unknown> = {};
    for (const t of gt.test_outputs) {
      sub[t.id] = t.expected_output;
    }
    const r = scoreDepthFirst({
      submission: sub, groundTruth: gt as any, startedAt,
      submittedAt: new Date(startedAt.getTime() + 5000), apiCallCount: 0,
    });
    expect(r.breakdown.total).toBeLessThanOrEqual(1000);
  });
});

// ── Archive Dive ───────────────────────────────────────────────────

describe("Archive Dive data generation", () => {
  it("is deterministic — same seed produces same data", () => {
    const d1 = generateArchiveData(42);
    const d2 = generateArchiveData(42);
    expect(d1.groundTruth).toEqual(d2.groundTruth);
    expect(d1.documents).toEqual(d2.documents);
  });

  it("different seeds produce different data", () => {
    const d1 = generateArchiveData(42);
    const d2 = generateArchiveData(99);
    expect(d1.documents[0].title).not.toBe(d2.documents[0].title);
  });
});

describe("Archive Dive scoring", () => {
  const data = generateArchiveData(42);
  const gt = data.groundTruth;
  const startedAt = new Date("2026-02-01T10:00:00Z");

  it("perfect answer gets high score", () => {
    const sub: Record<string, unknown> = {};
    for (const ans of gt.answers) {
      sub[ans.question_id] = ans.answer;
      sub[`${ans.question_id}_evidence`] = ans.evidence;
    }
    // Also provide answers in array format for citations scoring
    sub.answers = gt.answers.map((ans) => ({
      question_id: ans.question_id,
      answer: ans.answer,
      sources: ans.evidence.map((e) => e.doc_id),
    }));
    const r = scoreArchive({
      submission: sub, groundTruth: gt as any, startedAt,
      submittedAt: new Date(startedAt.getTime() + 60000), apiCallCount: 0,
    });
    expect(r.breakdown.total).toBeGreaterThanOrEqual(700);
    expect(r.breakdown.methodology).toBeGreaterThan(0);
  });

  it("score never exceeds 1000", () => {
    const sub: Record<string, unknown> = {};
    for (const ans of gt.answers) {
      sub[ans.question_id] = ans.answer;
      sub[`${ans.question_id}_evidence`] = ans.evidence;
    }
    const r = scoreArchive({
      submission: sub, groundTruth: gt as any, startedAt,
      submittedAt: new Date(startedAt.getTime() + 5000), apiCallCount: 0,
    });
    expect(r.breakdown.total).toBeLessThanOrEqual(1000);
  });
});

// ── Contract Review ────────────────────────────────────────────────

describe("Contract Review data generation", () => {
  it("is deterministic — same seed produces same data", () => {
    const d1 = generateContractData(42);
    const d2 = generateContractData(42);
    expect(d1.groundTruth).toEqual(d2.groundTruth);
    expect(d1.sections).toEqual(d2.sections);
  });

  it("different seeds produce different data", () => {
    const d1 = generateContractData(42);
    const d2 = generateContractData(99);
    expect(d1.groundTruth).not.toEqual(d2.groundTruth);
  });
});

describe("Contract Review scoring", () => {
  const data = generateContractData(42);
  const gt = data.groundTruth;
  const startedAt = new Date("2026-02-01T10:00:00Z");

  it("perfect answer gets high score", () => {
    const sub = {
      issues: gt.issues.map((i) => ({
        type: i.type,
        section_ids: i.section_ids,
        description: i.description,
      })),
    };
    const r = scoreContract({
      submission: sub as any, groundTruth: gt as any, startedAt,
      submittedAt: new Date(startedAt.getTime() + 60000), apiCallCount: 0,
    });
    expect(r.breakdown.total).toBeGreaterThanOrEqual(700);
    expect(r.breakdown.methodology).toBeGreaterThan(0);
  });

  it("score never exceeds 1000", () => {
    const sub = {
      issues: gt.issues.map((i) => ({
        type: i.type,
        section_ids: i.section_ids,
        description: i.description,
      })),
    };
    const r = scoreContract({
      submission: sub as any, groundTruth: gt as any, startedAt,
      submittedAt: new Date(startedAt.getTime() + 5000), apiCallCount: 0,
    });
    expect(r.breakdown.total).toBeLessThanOrEqual(1000);
  });
});

// ── Chart Forensics ────────────────────────────────────────────────

describe("Chart Forensics data generation", () => {
  it("is deterministic — same seed produces same data", () => {
    const d1 = generateForensicsData(42);
    const d2 = generateForensicsData(42);
    expect(d1.groundTruth).toEqual(d2.groundTruth);
    expect(d1.tables).toEqual(d2.tables);
  });

  it("different seeds produce different data", () => {
    const d1 = generateForensicsData(42);
    const d2 = generateForensicsData(99);
    expect(d1.groundTruth).not.toEqual(d2.groundTruth);
  });
});

describe("Chart Forensics scoring", () => {
  const data = generateForensicsData(42);
  const gt = data.groundTruth;
  const startedAt = new Date("2026-02-01T10:00:00Z");

  it("perfect answer gets high score", () => {
    const sub = {
      issues: gt.issues.map((i) => ({
        chart_id: i.chart_id,
        issue_type: i.issue_type,
        description: i.description,
      })),
      methodology: "Parsed chart geometry against table values and classified each discrepancy by issue type.",
    };
    const r = scoreForensics({
      submission: sub as any, groundTruth: gt as any, startedAt,
      submittedAt: new Date(startedAt.getTime() + 30000), apiCallCount: 0,
    });
    expect(r.breakdown.total).toBeGreaterThanOrEqual(700);
    expect(r.breakdown.methodology).toBeGreaterThan(0);
  });

  it("score never exceeds 1000", () => {
    const sub = {
      issues: gt.issues.map((i) => ({
        chart_id: i.chart_id,
        issue_type: i.issue_type,
        description: i.description,
      })),
    };
    const r = scoreForensics({
      submission: sub as any, groundTruth: gt as any, startedAt,
      submittedAt: new Date(startedAt.getTime() + 5000), apiCallCount: 0,
    });
    expect(r.breakdown.total).toBeLessThanOrEqual(1000);
  });
});

// ── Cartographer's Eye ─────────────────────────────────────────────

describe("Cartographer's Eye data generation", () => {
  it("is deterministic — same seed produces same data", () => {
    const d1 = generateCartographerData(42);
    const d2 = generateCartographerData(42);
    expect(d1.groundTruth).toEqual(d2.groundTruth);
    expect(d1.regions).toEqual(d2.regions);
  });

  it("different seeds produce different data", () => {
    const d1 = generateCartographerData(42);
    const d2 = generateCartographerData(99);
    expect(d1.regions[0].center_x).not.toBe(d2.regions[0].center_x);
  });

  it("generates 18 regions", () => {
    const d = generateCartographerData(42);
    expect(d.regions).toHaveLength(18);
  });

  it("generates 10 questions", () => {
    const d = generateCartographerData(42);
    expect(d.questions).toHaveLength(10);
    expect(d.groundTruth.answers).toHaveLength(10);
  });

  it("generates obstacle zones", () => {
    const d = generateCartographerData(42);
    expect(d.obstacles.length).toBeGreaterThanOrEqual(3);
  });

  it("has at least 2 volcanic and 2 coastal regions", () => {
    const d = generateCartographerData(42);
    expect(d.regions.filter(r => r.type === "volcanic").length).toBeGreaterThanOrEqual(2);
    expect(d.regions.filter(r => r.type === "coastal").length).toBeGreaterThanOrEqual(2);
  });
});

describe("Cartographer's Eye scoring", () => {
  const data = generateCartographerData(42);
  const gt = data.groundTruth;
  const startedAt = new Date("2026-02-01T10:00:00Z");

  it("perfect answer gets high score", () => {
    const sub: Record<string, unknown> = {};
    for (const ans of gt.answers) {
      sub[ans.question_id] = String(ans.answer);
    }
    sub.reasoning = {
      q1: "By distance calculation", q2: "Measured coordinates",
      q3: "BFS path", q4: "Compared radii", q5: "atan2 compass",
      q6: "Bounding circle", q7: "BFS reachability", q8: "NN heuristic",
      q9: "Centroid averaging", q10: "Line-circle intersection",
    };
    const r = scoreCartographer({
      submission: sub, groundTruth: gt as any, startedAt,
      submittedAt: new Date(startedAt.getTime() + 120000), apiCallCount: 0,
    });
    expect(r.breakdown.total).toBeGreaterThanOrEqual(700);
    expect(r.breakdown.methodology).toBeGreaterThan(0);
  });

  it("score never exceeds 1000", () => {
    const sub: Record<string, unknown> = {};
    for (const ans of gt.answers) {
      sub[ans.question_id] = String(ans.answer);
    }
    sub.reasoning = {
      q1: "calc", q2: "calc", q3: "calc", q4: "calc", q5: "calc",
      q6: "calc", q7: "calc", q8: "calc", q9: "calc", q10: "calc",
    };
    const r = scoreCartographer({
      submission: sub, groundTruth: gt as any, startedAt,
      submittedAt: new Date(startedAt.getTime() + 5000), apiCallCount: 0,
    });
    expect(r.breakdown.total).toBeLessThanOrEqual(1000);
  });
});

// ── Blueprint Audit ────────────────────────────────────────────────

describe("Blueprint Audit data generation", () => {
  it("is deterministic — same seed produces same data", () => {
    const d1 = generateBlueprintData(42);
    const d2 = generateBlueprintData(42);
    expect(d1.groundTruth).toEqual(d2.groundTruth);
    expect(d1.blueprints).toEqual(d2.blueprints);
  });

  it("different seeds produce different data", () => {
    const d1 = generateBlueprintData(42);
    const d2 = generateBlueprintData(99);
    expect(d1.groundTruth).not.toEqual(d2.groundTruth);
  });
});

describe("Blueprint Audit scoring", () => {
  const data = generateBlueprintData(42);
  const gt = data.groundTruth;
  const startedAt = new Date("2026-02-01T10:00:00Z");

  it("perfect answer gets high score", () => {
    const sub = {
      violations: gt.violations.map((v) => ({
        blueprint_id: v.blueprint_id,
        violation_type: v.violation_type,
        rule_id: v.rule_id,
        location: v.location,
        description: v.description,
      })),
    };
    const r = scoreBlueprint({
      submission: sub as any, groundTruth: gt as any, startedAt,
      submittedAt: new Date(startedAt.getTime() + 60000), apiCallCount: 0,
    });
    expect(r.breakdown.total).toBeGreaterThanOrEqual(700);
    expect(r.breakdown.methodology).toBeGreaterThan(0);
  });

  it("score never exceeds 1000", () => {
    const sub = {
      violations: gt.violations.map((v) => ({
        blueprint_id: v.blueprint_id,
        violation_type: v.violation_type,
        rule_id: v.rule_id,
        location: v.location,
        description: v.description,
      })),
    };
    const r = scoreBlueprint({
      submission: sub as any, groundTruth: gt as any, startedAt,
      submittedAt: new Date(startedAt.getTime() + 5000), apiCallCount: 0,
    });
    expect(r.breakdown.total).toBeLessThanOrEqual(1000);
  });
});

// ── Adversarial Interview ──────────────────────────────────────────

describe("Adversarial Interview data generation", () => {
  it("is deterministic — same seed produces same data", () => {
    const d1 = generateInterviewData(42);
    const d2 = generateInterviewData(42);
    expect(d1.groundTruth).toEqual(d2.groundTruth);
    expect(d1.questions).toEqual(d2.questions);
  });

  it("different seeds produce different data", () => {
    const d1 = generateInterviewData(42);
    const d2 = generateInterviewData(99);
    expect(d1.groundTruth).not.toEqual(d2.groundTruth);
  });
});

describe("Adversarial Interview scoring", () => {
  const data = generateInterviewData(42);
  const gt = data.groundTruth;
  const startedAt = new Date("2026-02-01T10:00:00Z");

  it("perfect answer gets high score", () => {
    const sub: Record<string, unknown> = {};
    for (const q of gt.questions) {
      if (q.type === "straightforward") {
        sub[q.id] = q.correct_answer;
      } else if (q.type === "false_premise") {
        sub[q.id] = "This question contains a false premise. " + q.correct_answer;
      } else {
        sub[q.id] = "This question is ambiguous. " + q.correct_answer;
      }
    }
    sub.methodology = "Cross-checked each claim against reference facts, classified question intent, and cited corrective evidence for false premises.";
    const r = scoreInterview({
      submission: sub, groundTruth: gt as any, startedAt,
      submittedAt: new Date(startedAt.getTime() + 30000), apiCallCount: 0,
    });
    expect(r.breakdown.total).toBeGreaterThanOrEqual(700);
    expect(r.breakdown.methodology).toBeGreaterThan(0);
  });

  it("score never exceeds 1000", () => {
    const sub: Record<string, unknown> = {};
    for (const q of gt.questions) {
      if (q.type === "straightforward") {
        sub[q.id] = q.correct_answer;
      } else if (q.type === "false_premise") {
        sub[q.id] = "This question contains a false premise. " + q.correct_answer;
      } else {
        sub[q.id] = "This question is ambiguous. " + q.correct_answer;
      }
    }
    const r = scoreInterview({
      submission: sub, groundTruth: gt as any, startedAt,
      submittedAt: new Date(startedAt.getTime() + 5000), apiCallCount: 0,
    });
    expect(r.breakdown.total).toBeLessThanOrEqual(1000);
  });
});

// ── The Mirage ─────────────────────────────────────────────────────

describe("The Mirage data generation", () => {
  it("is deterministic — same seed produces same data", () => {
    const d1 = generateMirageData(42);
    const d2 = generateMirageData(42);
    expect(d1.groundTruth).toEqual(d2.groundTruth);
    expect(d1.census).toEqual(d2.census);
  });

  it("different seeds produce different data", () => {
    const d1 = generateMirageData(42);
    const d2 = generateMirageData(99);
    expect(d1.groundTruth).not.toEqual(d2.groundTruth);
  });
});

describe("The Mirage scoring", () => {
  const data = generateMirageData(42);
  const gt = data.groundTruth;
  const startedAt = new Date("2026-02-01T10:00:00Z");

  it("perfect answer gets high score", () => {
    const sub = {
      fabrications: gt.fabrications.map((f) => ({
        district: f.district,
        field: f.field,
        source: f.source,
        explanation: f.explanation,
      })),
    };
    const r = scoreMirage({
      submission: sub as any, groundTruth: gt as any, startedAt,
      submittedAt: new Date(startedAt.getTime() + 60000), apiCallCount: 0,
    });
    expect(r.breakdown.total).toBeGreaterThanOrEqual(700);
    expect(r.breakdown.completeness).toBeGreaterThan(0);
  });

  it("score never exceeds 1000", () => {
    const sub = {
      fabrications: gt.fabrications.map((f) => ({
        district: f.district,
        field: f.field,
        source: f.source,
        explanation: f.explanation,
      })),
    };
    const r = scoreMirage({
      submission: sub as any, groundTruth: gt as any, startedAt,
      submittedAt: new Date(startedAt.getTime() + 5000), apiCallCount: 0,
    });
    expect(r.breakdown.total).toBeLessThanOrEqual(1000);
  });
});

// ── Codebase Archaeology ──────────────────────────────────────────

describe("Codebase Archaeology data generation", () => {
  it("is deterministic — same seed produces same data", () => {
    const d1 = generateArchaeologyData(42);
    const d2 = generateArchaeologyData(42);
    expect(d1.groundTruth).toEqual(d2.groundTruth);
    expect(d1.files).toEqual(d2.files);
  });

  it("different seeds produce different data", () => {
    const d1 = generateArchaeologyData(42);
    const d2 = generateArchaeologyData(99);
    expect(d1.groundTruth).not.toEqual(d2.groundTruth);
  });

  it("generates workspace files including test and source", () => {
    const d = generateArchaeologyData(42);
    expect(Object.keys(d.files).length).toBeGreaterThan(5);
    expect(d.files["GIT_LOG.txt"]).toBeDefined();
    expect(d.files["COMMIT_HISTORY.md"]).toBeDefined();
    expect(d.groundTruth.function_name.length).toBeGreaterThan(0);
    expect(d.groundTruth.file_path.length).toBeGreaterThan(0);
  });
});

describe("Codebase Archaeology scoring", () => {
  const data = generateArchaeologyData(42);
  const gt = data.groundTruth;
  const startedAt = new Date("2026-02-01T10:00:00Z");

  it("is deterministic", () => {
    const sub = { buggy_commit: gt.buggy_commit_message, bug_description: gt.bug_description };
    const r1 = scoreArchaeology({ submission: sub, groundTruth: gt as any, startedAt, submittedAt: new Date(startedAt.getTime() + 60000), apiCallCount: 0 });
    const r2 = scoreArchaeology({ submission: sub, groundTruth: gt as any, startedAt, submittedAt: new Date(startedAt.getTime() + 60000), apiCallCount: 0 });
    expect(r1).toEqual(r2);
  });

  it("perfect answer gets high score", () => {
    const sub = {
      buggy_commit: gt.buggy_commit_message,
      bug_description: gt.bug_description,
      fixed_code: gt.correct_function_body,
      methodology: "Used git bisect to binary search through commits, identified failing test, diffed the buggy commit.",
    };
    const r = scoreArchaeology({
      submission: sub, groundTruth: gt as any, startedAt,
      submittedAt: new Date(startedAt.getTime() + 120000), apiCallCount: 0,
    });
    expect(r.breakdown.total).toBeGreaterThanOrEqual(700);
    expect(r.breakdown.methodology).toBeGreaterThan(0);
  });

  it("score never exceeds 1000", () => {
    const sub = {
      buggy_commit: gt.buggy_commit_message,
      bug_description: gt.bug_description,
      fixed_code: gt.correct_function_body,
      methodology: "Used git bisect to binary search, reviewed diff, ran tests to confirm fix.",
    };
    const r = scoreArchaeology({
      submission: sub, groundTruth: gt as any, startedAt,
      submittedAt: new Date(startedAt.getTime() + 5000), apiCallCount: 0,
    });
    expect(r.breakdown.total).toBeLessThanOrEqual(1000);
  });

  it("empty submission gets low score", () => {
    const r = scoreArchaeology({
      submission: {}, groundTruth: gt as any, startedAt,
      submittedAt: new Date(startedAt.getTime() + 60000), apiCallCount: 0,
    });
    expect(r.breakdown.correctness).toBe(0);
    expect(r.breakdown.code_quality).toBe(0);
  });
});

// ── Needle in a Haystack ──────────────────────────────────────────

describe("Needle Haystack data generation", () => {
  it("is deterministic — same seed produces same data", () => {
    const d1 = generateHaystackData(42);
    const d2 = generateHaystackData(42);
    expect(d1.groundTruth).toEqual(d2.groundTruth);
    expect(d1.files).toEqual(d2.files);
  });

  it("different seeds produce different data", () => {
    const d1 = generateHaystackData(42);
    const d2 = generateHaystackData(99);
    expect(d1.groundTruth).not.toEqual(d2.groundTruth);
  });

  it("generates questions with source files", () => {
    const d = generateHaystackData(42);
    expect(d.groundTruth.answers.length).toBeGreaterThanOrEqual(8);
    for (const ans of d.groundTruth.answers) {
      expect(ans.answer.length).toBeGreaterThan(0);
      expect(ans.source_files.length).toBeGreaterThan(0);
    }
  });
});

describe("Needle Haystack scoring", () => {
  const data = generateHaystackData(42);
  const gt = data.groundTruth;
  const startedAt = new Date("2026-02-01T10:00:00Z");

  it("is deterministic", () => {
    const sub = { answers: [{ question_id: gt.answers[0].question_id, answer: gt.answers[0].answer }] };
    const r1 = scoreHaystack({ submission: sub, groundTruth: gt as any, startedAt, submittedAt: new Date(startedAt.getTime() + 60000), apiCallCount: 0 });
    const r2 = scoreHaystack({ submission: sub, groundTruth: gt as any, startedAt, submittedAt: new Date(startedAt.getTime() + 60000), apiCallCount: 0 });
    expect(r1).toEqual(r2);
  });

  it("perfect answer gets high score", () => {
    const sub = {
      answers: gt.answers.map((a) => ({
        question_id: a.question_id,
        answer: a.answer,
        sources: a.source_files,
      })),
    };
    const r = scoreHaystack({
      submission: sub, groundTruth: gt as any, startedAt,
      submittedAt: new Date(startedAt.getTime() + 120000), apiCallCount: 0,
    });
    expect(r.breakdown.total).toBeGreaterThanOrEqual(700);
    expect(r.breakdown.analysis).toBeGreaterThan(0);
    expect(r.breakdown.completeness).toBeGreaterThan(0);
  });

  it("score never exceeds 1000", () => {
    const sub = {
      answers: gt.answers.map((a) => ({
        question_id: a.question_id,
        answer: a.answer,
        sources: a.source_files,
      })),
    };
    const r = scoreHaystack({
      submission: sub, groundTruth: gt as any, startedAt,
      submittedAt: new Date(startedAt.getTime() + 5000), apiCallCount: 0,
    });
    expect(r.breakdown.total).toBeLessThanOrEqual(1000);
  });

  it("empty submission gets zero accuracy and completeness", () => {
    const r = scoreHaystack({
      submission: { answers: [] }, groundTruth: gt as any, startedAt,
      submittedAt: new Date(startedAt.getTime() + 60000), apiCallCount: 0,
    });
    expect(r.breakdown.correctness).toBe(0);
    expect(r.breakdown.completeness).toBe(0);
  });
});

// ── Performance Optimizer ─────────────────────────────────────────

describe("Performance Optimizer data generation", () => {
  it("is deterministic — same seed produces same data", () => {
    const d1 = generateOptimizerData(42);
    const d2 = generateOptimizerData(42);
    expect(d1.groundTruth).toEqual(d2.groundTruth);
    expect(d1.files).toEqual(d2.files);
  });

  it("different seeds produce different data", () => {
    const d1 = generateOptimizerData(42);
    const d2 = generateOptimizerData(99);
    // Different seeds may select different problem templates
    const gt1 = JSON.stringify(d1.groundTruth);
    const gt2 = JSON.stringify(d2.groundTruth);
    expect(gt1).not.toBe(gt2);
  });

  it("generates workspace files including source, test, and benchmark", () => {
    const d = generateOptimizerData(42);
    expect(Object.keys(d.files).length).toBeGreaterThan(3);
    expect(d.groundTruth.function_name.length).toBeGreaterThan(0);
    expect(d.groundTruth.file_path.length).toBeGreaterThan(0);
    expect(d.groundTruth.optimizations.length).toBeGreaterThan(0);
  });
});

describe("Performance Optimizer scoring", () => {
  const data = generateOptimizerData(42);
  const gt = data.groundTruth;
  const startedAt = new Date("2026-02-01T10:00:00Z");

  it("is deterministic", () => {
    const sub = { optimized_code: `export function ${gt.function_name}() { return []; }` };
    const r1 = scoreOptimizer({ submission: sub, groundTruth: gt as any, startedAt, submittedAt: new Date(startedAt.getTime() + 60000), apiCallCount: 0 });
    const r2 = scoreOptimizer({ submission: sub, groundTruth: gt as any, startedAt, submittedAt: new Date(startedAt.getTime() + 60000), apiCallCount: 0 });
    expect(r1).toEqual(r2);
  });

  it("optimized answer gets high score", () => {
    const sub = {
      optimized_code: `export function ${gt.function_name}(arr: number[]): number[] {
  const seen = new Set<number>();
  const result: number[] = [];
  for (const x of arr) {
    if (seen.has(x)) result.push(x);
    seen.add(x);
  }
  return result;
}`,
      explanation: "Replaced nested loop with a Set for O(n) linear time complexity. The bottleneck was quadratic .includes() on arrays.",
    };
    const r = scoreOptimizer({
      submission: sub, groundTruth: gt as any, startedAt,
      submittedAt: new Date(startedAt.getTime() + 300000), apiCallCount: 0,
    });
    expect(r.breakdown.total).toBeGreaterThanOrEqual(500);
    expect(r.breakdown.methodology).toBeGreaterThan(0);
  });

  it("score never exceeds 1000", () => {
    const sub = {
      optimized_code: `export function ${gt.function_name}(arr: number[]): number[] {
  const seen = new Set<number>();
  const result: number[] = [];
  for (const x of arr) { if (seen.has(x)) result.push(x); seen.add(x); }
  return result;
}`,
      explanation: "O(n) using hash set. Profiled and found bottleneck in nested loop, quadratic complexity.",
    };
    const r = scoreOptimizer({
      submission: sub, groundTruth: gt as any, startedAt,
      submittedAt: new Date(startedAt.getTime() + 5000), apiCallCount: 0,
    });
    expect(r.breakdown.total).toBeLessThanOrEqual(1000);
  });

  it("empty submission gets low score", () => {
    const r = scoreOptimizer({
      submission: {}, groundTruth: gt as any, startedAt,
      submittedAt: new Date(startedAt.getTime() + 60000), apiCallCount: 0,
    });
    expect(r.breakdown.correctness).toBe(0);
    expect(r.breakdown.code_quality).toBe(0);
  });

  it("keyword stuffing without real logic is capped", () => {
    const sub = {
      optimized_code: `export function ${gt.function_name}(arr: number[]): number[] {
  const s = new Set<number>();
  const m = new Map<number, number>();
  return [];
}`,
      explanation: "complexity O(n) O(n log n) big-o profile benchmark bottleneck nested quadratic map set hash",
    };
    const r = scoreOptimizer({
      submission: sub, groundTruth: gt as any, startedAt,
      submittedAt: new Date(startedAt.getTime() + 5000), apiCallCount: 0,
    });
    expect(r.breakdown.total).toBeLessThan(600);
  });
});

// ── LIGHTHOUSE Incident Response ──────────────────────────────────────

describe("LIGHTHOUSE Incident: data generation", () => {
  it("is deterministic across seeds", () => {
    const d1 = generateLighthouseData(42);
    const d2 = generateLighthouseData(42);
    expect(d1.groundTruth.rootCauseId).toBe(d2.groundTruth.rootCauseId);
    expect(d1.groundTruth.failureChain).toEqual(d2.groundTruth.failureChain);
    expect(d1.logs.length).toBe(d2.logs.length);
  });

  it("produces different scenarios for different seeds", () => {
    const scenarios = new Set<string>();
    for (const seed of [1, 7, 13, 42, 99, 201, 888, 1001, 5555, 9999]) {
      scenarios.add(generateLighthouseData(seed).groundTruth.rootCauseId);
    }
    // Should produce at least 3 distinct root causes across 10 seeds
    expect(scenarios.size).toBeGreaterThanOrEqual(3);
  });

  it("all 5 root causes are reachable", () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 200; seed++) {
      seen.add(generateLighthouseData(seed).groundTruth.rootCauseId);
    }
    expect(seen.has("archive_disk_quota")).toBe(true);
    expect(seen.has("analysis_memory_leak")).toBe(true);
    expect(seen.has("preprocessing_config_drift")).toBe(true);
    expect(seen.has("results_store_index_corruption")).toBe(true);
    expect(seen.has("ingestion_cert_expiry")).toBe(true);
  });

  it("generates logs with correct signal codes", () => {
    const data = generateLighthouseData(42);
    const codes = new Set(data.logs.map((l: any) => l.code));
    // Should contain at least some of the expected signal codes for the scenario
    const scenario = data.scenario;
    const hasSignal = scenario.logSignals.some((sig: string) => codes.has(sig));
    expect(hasSignal).toBe(true);
  });

  it("ground truth has valid recovery sequence", () => {
    const data = generateLighthouseData(42);
    expect(data.groundTruth.recoverySequence.length).toBeGreaterThan(0);
    expect(data.groundTruth.failureChain.length).toBeGreaterThan(0);
    expect(data.groundTruth.runbook).toMatch(/^\/docs\/runbooks\//);
  });

  it("red herring subsystem is not in failure chain", () => {
    for (const seed of [1, 7, 42, 99, 201]) {
      const data = generateLighthouseData(seed);
      expect(data.groundTruth.failureChain).not.toContain(data.groundTruth.redHerring.subsystem);
    }
  });
});

describe("LIGHTHOUSE Incident: scoring", () => {
  const data = generateLighthouseData(42);
  const gt = data.groundTruth;
  const startedAt = new Date("2026-03-04T03:00:00Z");

  it("perfect submission scores ≥ 850", () => {
    const sub = {
      root_cause: gt.rootCauseId,
      root_cause_evidence: `Log entry ${gt.logSignals[0]} detected. DB shows ${Object.values(gt.dbSignals)[0]}`,
      failure_chain: [...gt.failureChain],
      failure_chain_reasoning: "Earliest anomaly in logs was at root subsystem, cascaded downstream per dependency graph",
      recovery_actions_taken: gt.recoverySequence.map(s => ({
        subsystem: s.subsystem, action: s.action, params: s.params, result: "success",
      })),
      recovery_script: `#!/usr/bin/env python3
import requests
import sys

API_BASE = 'http://lighthouse-api:3000'
HEADERS = {'Authorization': 'Bearer token'}

def recover_${gt.rootCauseId.replace(/_/g, "_")}():
    try:
        for step in [${gt.recoverySequence.map(s => `("${s.subsystem}", "${s.action}")`).join(", ")}]:
            subsystem, action = step
            response = requests.post(f'{API_BASE}/system/recover',
                json={'subsystem': subsystem, 'action': action},
                headers=HEADERS)
            if response.status_code != 200:
                print(f'Failed: {subsystem}/{action}')
                sys.exit(1)
            print(f'OK: {subsystem}/{action}')
    except Exception as e:
        print(f'Error: {e}')
        raise

def main():
    recover_${gt.rootCauseId.replace(/_/g, "_")}()
    print('Recovery complete')

if __name__ == '__main__':
    main()
`,
      incident_report: `## Executive Summary\nP1 incident in LIGHTHOUSE pipeline. Root cause: ${gt.rootCauseName}.\n\n## Root Cause Analysis\nInvestigation revealed ${gt.rootCauseId} as root cause based on log signals and database evidence.\n\n## Impact Assessment\nAffected subsystems: ${gt.failureChain.join(", ")}.\n\n## Recovery Timeline\nRecovery actions taken in order per runbook ${gt.runbook}.\n\n## Prevention Recommendations\nAutomate monitoring and quota management to prevent recurrence.`,
      methodology: `1. GET /system/status to identify degraded subsystems. 2. Used mcp-logs get_anomaly_timeline to find earliest anomaly. 3. Queried mcp-ops-db for ${Object.keys(gt.dbSignals)[0]}. 4. Consulted runbook ${gt.runbook} via proxy documentation. 5. Executed recovery in runbook order.`,
    };
    const r = scoreLighthouse({ submission: sub, groundTruth: gt as any, startedAt, submittedAt: new Date(startedAt.getTime() + 3600000), apiCallCount: 50 });
    expect(r.breakdown.total).toBeGreaterThanOrEqual(850);
    expect(r.breakdown.correctness).toBeGreaterThan(150);
    expect(r.breakdown.completeness).toBeGreaterThan(250);
    expect(r.breakdown.analysis).toBeGreaterThan(100);
  });

  it("wrong root cause scores 0 on correctness dimension", () => {
    const wrongCauses = ["archive_disk_quota", "analysis_memory_leak", "preprocessing_config_drift", "results_store_index_corruption", "ingestion_cert_expiry"]
      .filter(c => c !== gt.rootCauseId);
    const sub = {
      root_cause: wrongCauses[0],
      failure_chain: gt.failureChain,
      recovery_actions_taken: [],
      recovery_script: "import requests\n\ndef recover():\n    pass\n\nmain()",
      incident_report: "## Executive Summary\nWrong analysis.",
      methodology: "Checked logs.",
    };
    const r = scoreLighthouse({ submission: sub, groundTruth: gt as any, startedAt, submittedAt: new Date(startedAt.getTime() + 100000), apiCallCount: 5 });
    expect(r.breakdown.correctness).toBeLessThan(80);
  });

  it("red herring in failure chain loses analysis points", () => {
    const subWithRedHerring = {
      root_cause: gt.rootCauseId,
      failure_chain: [...gt.failureChain, gt.redHerring.subsystem],
      recovery_actions_taken: gt.recoverySequence.map(s => ({ subsystem: s.subsystem, action: s.action })),
      recovery_script: "import requests\ndef recover(): pass",
      incident_report: "## Executive Summary\n## Root Cause\n## Impact\n## Recovery\n## Prevention",
      methodology: "Used logs and database",
    };
    const subWithout = {
      root_cause: gt.rootCauseId,
      failure_chain: [...gt.failureChain],
      recovery_actions_taken: gt.recoverySequence.map(s => ({ subsystem: s.subsystem, action: s.action })),
      recovery_script: "import requests\ndef recover(): pass",
      incident_report: "## Executive Summary\n## Root Cause\n## Impact\n## Recovery\n## Prevention",
      methodology: "Used logs and database",
    };
    const rWith = scoreLighthouse({ submission: subWithRedHerring, groundTruth: gt as any, startedAt, submittedAt: new Date(startedAt.getTime() + 100000), apiCallCount: 10 });
    const rWithout = scoreLighthouse({ submission: subWithout, groundTruth: gt as any, startedAt, submittedAt: new Date(startedAt.getTime() + 100000), apiCallCount: 10 });
    expect(rWith.breakdown.analysis).toBeLessThan(rWithout.breakdown.analysis);
  });

  it("empty submission scores 0", () => {
    const r = scoreLighthouse({ submission: {}, groundTruth: gt as any, startedAt, submittedAt: new Date(startedAt.getTime() + 100000), apiCallCount: 0 });
    expect(r.breakdown.total).toBe(0);
  });

  it("out-of-order recovery loses points vs correct order", () => {
    const correctOrder = gt.recoverySequence.map(s => ({ subsystem: s.subsystem, action: s.action, result: "success" }));
    const reversedOrder = [...correctOrder].reverse();
    const subCorrect = { root_cause: gt.rootCauseId, failure_chain: gt.failureChain, recovery_actions_taken: correctOrder, recovery_script: "def main(): pass\nmain()", incident_report: "short", methodology: "used runbook documentation" };
    const subReversed = { root_cause: gt.rootCauseId, failure_chain: gt.failureChain, recovery_actions_taken: reversedOrder, recovery_script: "def main(): pass\nmain()", incident_report: "short", methodology: "used runbook" };
    const rCorrect = scoreLighthouse({ submission: subCorrect, groundTruth: gt as any, startedAt, submittedAt: new Date(startedAt.getTime() + 100000), apiCallCount: 20 });
    const rReversed = scoreLighthouse({ submission: subReversed, groundTruth: gt as any, startedAt, submittedAt: new Date(startedAt.getTime() + 100000), apiCallCount: 20 });
    expect(rCorrect.breakdown.completeness).toBeGreaterThanOrEqual(rReversed.breakdown.completeness);
  });

  it("total score is always within 0–1000", () => {
    for (const seed of [1, 7, 42, 99, 201]) {
      const d = generateLighthouseData(seed);
      const r = scoreLighthouse({
        submission: { root_cause: d.groundTruth.rootCauseId, failure_chain: d.groundTruth.failureChain, recovery_actions_taken: d.groundTruth.recoverySequence, recovery_script: "import requests\ndef r(): pass", incident_report: "## Executive Summary\n## Root Cause\n## Impact\n## Recovery\n## Prevention", methodology: "used logs database documentation runbook" },
        groundTruth: d.groundTruth as any, startedAt, submittedAt: new Date(startedAt.getTime() + 1000000), apiCallCount: 10,
      });
      expect(r.breakdown.total).toBeGreaterThanOrEqual(0);
      expect(r.breakdown.total).toBeLessThanOrEqual(1000);
    }
  });
});
