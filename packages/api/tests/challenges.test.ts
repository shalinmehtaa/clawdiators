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

  it("generates 30-40 nodes", () => {
    const d = generateMappingData(42);
    expect(d.nodes.length).toBeGreaterThanOrEqual(30);
    expect(d.nodes.length).toBeLessThanOrEqual(40);
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
      for (const conn of node.connections) {
        if (!visited.has(conn)) {
          visited.add(conn);
          queue.push(conn);
        }
      }
    }
    expect(visited.size).toBe(d.nodes.length);
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
    const r = scoreMapping({
      submission: {
        nodes_discovered: gt.totalNodes,
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
    expect(r.breakdown.strategy).toBeGreaterThan(0);
  });

  it("score never exceeds 1000", () => {
    const r = scoreMapping({
      submission: {
        nodes_discovered: gt.totalNodes,
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

  it("generates 6 puzzles (3 propositional + 3 constraint)", () => {
    const d = generateLogicData(42);
    expect(d.puzzles).toHaveLength(6);
    const propCount = d.puzzles.filter((p) => p.type === "propositional").length;
    const cspCount = d.puzzles.filter((p) => p.type === "constraint").length;
    expect(propCount).toBe(3);
    expect(cspCount).toBe(3);
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
    expect(r.breakdown.reasoning_depth).toBeGreaterThan(0);
    expect(r.breakdown.methodology).toBeGreaterThan(0);
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
    expect(r.breakdown.coverage).toBe(0);
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
    expect(r.breakdown.citations).toBeGreaterThan(0);
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
    sub.reasoning = { q1: "By distance calculation", q2: "Measured coordinates", q3: "BFS path", q4: "Compared radii", q5: "atan2 compass" };
    const r = scoreCartographer({
      submission: sub, groundTruth: gt as any, startedAt,
      submittedAt: new Date(startedAt.getTime() + 60000), apiCallCount: 0,
    });
    expect(r.breakdown.total).toBeGreaterThanOrEqual(700);
    expect(r.breakdown.methodology).toBeGreaterThan(0);
  });

  it("score never exceeds 1000", () => {
    const sub: Record<string, unknown> = {};
    for (const ans of gt.answers) {
      sub[ans.question_id] = String(ans.answer);
    }
    sub.reasoning = { q1: "calc", q2: "calc", q3: "calc", q4: "calc", q5: "calc" };
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
    expect(r.breakdown.thoroughness).toBeGreaterThan(0);
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
    expect(r.breakdown.identification).toBe(0);
    expect(r.breakdown.fix_quality).toBe(0);
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
    expect(d.groundTruth.answers.length).toBeGreaterThanOrEqual(5);
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
    expect(r.breakdown.citations).toBeGreaterThan(0);
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
    expect(r.breakdown.accuracy).toBe(0);
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
    expect(r.breakdown.optimization).toBe(0);
    expect(r.breakdown.correctness).toBe(0);
  });
});
