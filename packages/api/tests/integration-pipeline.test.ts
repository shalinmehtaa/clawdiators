/**
 * End-to-end integration test for the community challenge pipeline.
 *
 * Tests the FULL HTTP lifecycle through Hono's app.fetch():
 *   register agent → submit draft → gates pass → admin approve →
 *   enter match → submit answer → verify score → replay
 *
 * Challenge: "sort-sprint-*" — a code-based Tier 1 challenge
 * using all 5 code files (data.js, scorer.js, helpers.js, workspace.js, validator.js).
 *
 * REQUIRES: PostgreSQL running (docker compose up -d)
 * NO Docker eval images needed — Tier 1 challenges score in-process via VM.
 *
 * Run: pnpm --filter @clawdiators/api test tests/integration-pipeline.test.ts
 */

// ── Env setup (must be before app import) ────────────────────────────
process.env.ADMIN_API_KEY = "test-admin-key-integ-pipeline";

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

vi.mock("../src/challenges/docker-evaluator.js", async () => {
  const actual = await vi.importActual("../src/challenges/docker-evaluator.js");
  const { mockGenerateDataInDocker, mockScoreInDocker, mockExecuteCodeInDocker } = await import("./helpers/inline-executor.js");
  return {
    ...actual,
    generateDataInDocker: mockGenerateDataInDocker,
    scoreInDocker: mockScoreInDocker,
    executeCodeInDocker: mockExecuteCodeInDocker,
  };
});

import app from "../src/index.js";
import { createCodeModule } from "../src/challenges/primitives/code-module.js";
import type { CommunitySpec } from "../src/challenges/primitives/validator.js";
import {
  db, agents, matches, challenges, challengeDrafts,
  challengeMemory, challengeAnalytics, trackProgress,
} from "@clawdiators/db";
import { eq, like, inArray } from "drizzle-orm";

// ── Code files ───────────────────────────────────────────────────────

const HELPERS_JS = `
// Shared utilities for sort-sprint challenge
function arraysMatch(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (var i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
function isAscending(arr) {
  if (!Array.isArray(arr)) return false;
  for (var i = 1; i < arr.length; i++) {
    if (arr[i] < arr[i - 1]) return false;
  }
  return true;
}
`;

const DATA_JS = `
function generateData(seed) {
  var random = rng(seed);
  var size = Math.floor(random() * 6) + 5;
  var numbers = [];
  for (var i = 0; i < size; i++) {
    numbers.push(Math.floor(random() * 1000));
  }
  var sorted = numbers.slice().sort(function(a, b) { return a - b; });
  return {
    objective: 'Sort this array in ascending order: ' + JSON.stringify(numbers),
    groundTruth: { sorted: sorted },
    numbers: numbers
  };
}
module.exports = { generateData: generateData };
`;

const SCORER_JS = `
function score(input) {
  var submission = input.submission;
  var groundTruth = input.groundTruth;
  var startedAt = new Date(input.startedAt);
  var submittedAt = new Date(input.submittedAt);
  var correctness = 0;
  var completeness = 0;
  var speed = 0;
  var submitted = submission.sorted;
  var expected = groundTruth.sorted;
  if (Array.isArray(submitted) && Array.isArray(expected)) {
    if (arraysMatch(submitted, expected)) {
      correctness = 500;
      completeness = 300;
    } else if (isAscending(submitted)) {
      correctness = 250;
      var expectedCounts = {};
      for (var i = 0; i < expected.length; i++) {
        expectedCounts[expected[i]] = (expectedCounts[expected[i]] || 0) + 1;
      }
      var overlap = 0;
      for (var j = 0; j < submitted.length; j++) {
        if (expectedCounts[submitted[j]] && expectedCounts[submitted[j]] > 0) {
          overlap++;
          expectedCounts[submitted[j]]--;
        }
      }
      completeness = Math.round((overlap / Math.max(expected.length, 1)) * 300);
    }
  }
  // Speed: only award speed points if something correct was submitted
  var elapsed = (submittedAt.getTime() - startedAt.getTime()) / 1000;
  var timeLimit = 120;
  if (correctness > 0) {
    speed = Math.round(Math.max(0, 1 - elapsed / timeLimit) * 200);
  }
  var total = correctness + completeness + speed;
  return { breakdown: { correctness: correctness, completeness: completeness, speed: speed, total: total } };
}
module.exports = { score: score };
`;

const WORKSPACE_JS = `
function generateWorkspace(seed) {
  var data = generateData(seed);
  var files = {};
  files['numbers.json'] = JSON.stringify(data.numbers, null, 2);
  files['instructions.txt'] = 'Sort the numbers in numbers.json in ascending order.\\nSubmit as { "sorted": [...] }';
  return files;
}
module.exports = { generateWorkspace: generateWorkspace };
`;

const VALIDATOR_JS = `
function validate(submission, groundTruth) {
  var warnings = [];
  if (!submission.sorted) {
    warnings.push({ severity: 'error', field: 'sorted', message: 'Missing required field: sorted' });
  } else if (!Array.isArray(submission.sorted)) {
    warnings.push({ severity: 'error', field: 'sorted', message: 'sorted must be an array' });
  } else if (submission.sorted.length === 0) {
    warnings.push({ severity: 'warn', field: 'sorted', message: 'Submitted empty array' });
  }
  return warnings;
}
module.exports = { validate: validate };
`;

// ── Unique slug per test run ─────────────────────────────────────────

const SLUG = `sort-sprint-${Date.now()}`;

function buildSpec(): CommunitySpec {
  return {
    slug: SLUG,
    name: "Sort Sprint (Integration Test)",
    description: "Sort an array of numbers in ascending order as fast and accurately as possible.",
    lore: "In the data halls of the arena, scattered numbers await their champion. Only the swiftest sorter prevails in this trial of order and precision.",
    category: "coding",
    difficulty: "newcomer",
    matchType: "single",
    timeLimitSecs: 120,
    workspace: {
      type: "archive",
      seedable: true,
      challengeMd:
        "# Sort Sprint\n\nSort the array in `numbers.json` in ascending order.\n\n## Submission\n\nSubmit JSON: `{ \"sorted\": [1, 2, 3, ...] }`\n\nSeed: {{seed}}",
    },
    submission: {
      type: "json",
      schema: { sorted: "array of numbers" },
    },
    scoring: {
      method: "custom-script",
      dimensions: [
        { key: "correctness", label: "Correctness", weight: 0.5, description: "Is the array correctly sorted?", color: "emerald" },
        { key: "completeness", label: "Completeness", weight: 0.3, description: "Are all original elements present?", color: "sky" },
        { key: "speed", label: "Speed", weight: 0.2, description: "How quickly was it submitted?", color: "gold" },
      ],
      maxScore: 1000,
    },
    codeFiles: {
      "data.js": DATA_JS,
      "scorer.js": SCORER_JS,
      "helpers.js": HELPERS_JS,
      "workspace.js": WORKSPACE_JS,
      "validator.js": VALIDATOR_JS,
    },
  } as CommunitySpec;
}

// ── HTTP helpers ─────────────────────────────────────────────────────

const BASE = "http://test";

async function httpJson(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; json: any }> {
  const init: RequestInit = { method, headers: { ...headers } };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    (init.headers as Record<string, string>)["Content-Type"] = "application/json";
  }
  const res = await app.fetch(new Request(`${BASE}${path}`, init));
  const json = await res.json();
  return { status: res.status, json };
}

function agentReq(method: string, path: string, body: unknown | undefined, apiKey: string) {
  return httpJson(method, path, body, { Authorization: `Bearer ${apiKey}` });
}

function adminReq(method: string, path: string, body?: unknown) {
  return httpJson(method, path, body, {
    Authorization: `Bearer ${process.env.ADMIN_API_KEY!}`,
  });
}

/** Poll a predicate until true, or throw after timeout. */
async function poll(
  predicate: () => Promise<boolean>,
  label: string,
  { timeout = 30_000, interval = 300 } = {},
): Promise<void> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error(`poll timed out after ${timeout}ms: ${label}`);
}

/** Extract seed from workspace URL like "/api/v1/challenges/slug/workspace?seed=12345&..." */
function extractSeed(workspaceUrl: string): number {
  const m = workspaceUrl.match(/seed=(\d+)/);
  if (!m) throw new Error(`No seed in workspace URL: ${workspaceUrl}`);
  return parseInt(m[1], 10);
}

// ── Tests ────────────────────────────────────────────────────────────

describe("Integration: Sort Sprint full lifecycle", () => {
  const spec = buildSpec();
  const mod = createCodeModule(spec);

  let agentKey = "";
  let agentId = "";
  let agentName = "";
  let draftId = "";
  let matchId1 = "";
  let matchId2 = "";

  // ── Helpers ──────────────────────────────────────────────────────────

  /** Delete all DB rows created by this test in safe FK order. */
  async function cleanupTestData(agentIds: string[], challengeSlugs: string[], draftIds: string[]) {
    // Leaf tables first, then parents.
    if (agentIds.length > 0) {
      await db.delete(challengeMemory).where(inArray(challengeMemory.agentId, agentIds));
      await db.delete(trackProgress).where(inArray(trackProgress.agentId, agentIds));
    }
    const challengeRows = challengeSlugs.length > 0
      ? await db.query.challenges.findMany({
          where: inArray(challenges.slug, challengeSlugs),
          columns: { id: true, slug: true },
        })
      : [];
    if (challengeRows.length > 0) {
      await db.delete(challengeAnalytics).where(inArray(challengeAnalytics.challengeId, challengeRows.map((c) => c.id)));
    }
    if (agentIds.length > 0) {
      await db.delete(matches).where(inArray(matches.agentId, agentIds));
    }
    if (draftIds.length > 0) {
      await db.delete(challengeDrafts).where(inArray(challengeDrafts.id, draftIds));
    }
    for (const ch of challengeRows) {
      await db.delete(challenges).where(eq(challenges.slug, ch.slug));
    }
    if (agentIds.length > 0) {
      await db.delete(agents).where(inArray(agents.id, agentIds));
    }
  }

  // ── Sweep stale leftovers from any previously interrupted runs ──────

  beforeAll(async () => {
    const staleAgents = await db.query.agents.findMany({
      where: like(agents.name, "integ-sort-%"),
      columns: { id: true },
    });
    const staleChallenges = await db.query.challenges.findMany({
      where: like(challenges.slug, "sort-sprint-%"),
      columns: { id: true, slug: true },
    });
    const staleDrafts = staleAgents.length > 0
      ? await db.query.challengeDrafts.findMany({
          where: inArray(challengeDrafts.authorAgentId, staleAgents.map((a) => a.id)),
          columns: { id: true },
        })
      : [];
    await cleanupTestData(
      staleAgents.map((a) => a.id),
      staleChallenges.map((c) => c.slug),
      staleDrafts.map((d) => d.id),
    );
  });

  // ── Step 0: Health check ───────────────────────────────────────────

  it("health endpoint works", async () => {
    const { status, json } = await httpJson("GET", "/health");
    expect(status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.status).toBe("alive");
  });

  // ── Step 1: Register test agent ────────────────────────────────────

  it("registers a test agent", async () => {
    agentName = `integ-sort-${Date.now()}`;
    const { status, json } = await httpJson("POST", "/api/v1/agents/register", {
      name: agentName,
      description: "Integration test agent for sort-sprint",
      base_model: "test-model",
      harness: { baseFramework: "custom" },
    });

    expect(status).toBe(201);
    expect(json.ok).toBe(true);
    expect(json.data.api_key).toMatch(/^clw_/);
    agentKey = json.data.api_key;
    agentId = json.data.agent.id;
  });

  // ── Step 2: Submit draft ───────────────────────────────────────────

  it("submits a challenge draft", async () => {
    // Compute reference answer for seed 42
    const data42 = await mod.generateData(42, {});
    expect(data42.groundTruth.sorted).toBeDefined();
    expect(Array.isArray(data42.groundTruth.sorted)).toBe(true);

    const { status, json } = await agentReq("POST", "/api/v1/challenges/drafts", {
      spec,
      referenceAnswer: {
        seed: 42,
        answer: { sorted: data42.groundTruth.sorted },
      },
    }, agentKey);

    expect(status).toBe(201);
    expect(json.ok).toBe(true);
    expect(json.data.id).toBeDefined();
    expect(json.data.gate_status).toBe("pending_gates");
    draftId = json.data.id;
  });

  // ── Step 3: Gates pass ─────────────────────────────────────────────

  it("all gates pass", async () => {
    // Poll until gates finish
    let gateReport: any;
    await poll(async () => {
      const { json } = await agentReq(
        "GET",
        `/api/v1/challenges/drafts/${draftId}/gate-report`,
        undefined,
        agentKey,
      );
      gateReport = json.data;
      return gateReport.gate_status !== "pending_gates";
    }, "gates to complete");

    expect(gateReport.gate_status).toBe("passed");

    // Verify key gates individually
    const gates = gateReport.gate_report.gates;
    expect(gates.spec_validity.passed).toBe(true);
    expect(gates.code_syntax.passed).toBe(true);
    expect(gates.code_security.passed).toBe(true);
    expect(gates.determinism.passed).toBe(true);
    expect(gates.baseline_solveability.passed).toBe(true);
    expect(gates.anti_gaming.passed).toBe(true);
    expect(gates.score_distribution.passed).toBe(true);
    expect(gates.contract_consistency.passed).toBe(true);
    expect(gates.content_safety.passed).toBe(true);
  }, 60_000); // Gates can take a few seconds

  // ── Step 4: Admin approve ──────────────────────────────────────────

  it("admin approves the draft → challenge is live", async () => {
    const { status, json } = await adminReq(
      "POST",
      `/api/v1/admin/drafts/${draftId}/approve`,
    );

    expect(status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.slug).toBe(SLUG);
  });

  // ── Step 5: Enter match ────────────────────────────────────────────

  it("enters a match for the new challenge", async () => {
    const { status, json } = await agentReq("POST", "/api/v1/matches/enter", {
      challenge_slug: SLUG,
    }, agentKey);

    expect(status).toBe(201);
    expect(json.ok).toBe(true);
    expect(json.data.match_id).toBeDefined();
    expect(json.data.challenge.slug).toBe(SLUG);
    expect(json.data.objective).toContain("Sort");
    expect(json.data.submit_url).toContain(json.data.match_id);
    expect(json.data.workspace_url).toContain(SLUG);
    expect(json.data.submission_spec).toBeDefined();
    expect(json.data.challenge_md).toContain("Sort Sprint");
    matchId1 = json.data.match_id;
  });

  // ── Step 6: Submit correct answer → high score ─────────────────────

  it("scores a correct answer as a win with high score", async () => {
    // Get the match to find the seed
    const { json: matchDetail } = await httpJson("GET", `/api/v1/matches/${matchId1}`);
    const workspaceUrl = `/api/v1/challenges/${SLUG}/workspace?seed=${matchDetail.data.id}`;

    // Actually get seed from the enter response's workspace_url
    // We stored matchId1 but need the workspace_url. Let's re-enter (same challenge returns existing match).
    const { json: reEnter } = await agentReq("POST", "/api/v1/matches/enter", {
      challenge_slug: SLUG,
    }, agentKey);
    const seed = extractSeed(reEnter.data.workspace_url);

    // Generate correct answer for this seed
    const data = await mod.generateData(seed, {});
    const correctAnswer = { sorted: data.groundTruth.sorted };

    // Submit
    const { status, json } = await agentReq(
      "POST",
      `/api/v1/matches/${matchId1}/submit`,
      {
        answer: correctAnswer,
        metadata: { model_id: "integration-test", token_count: 100 },
      },
      agentKey,
    );

    expect(status).toBe(200);
    expect(json.ok).toBe(true);

    // Score assertions
    expect(json.data.result).toBe("win");
    expect(json.data.score).toBeGreaterThanOrEqual(800); // 500 + 300 + ~200 speed
    expect(json.data.score_breakdown.correctness).toBe(500);
    expect(json.data.score_breakdown.completeness).toBe(300);
    expect(json.data.score_breakdown.speed).toBeGreaterThan(0);
    expect(json.data.score_breakdown.total).toBe(json.data.score);

    // Elo change
    expect(json.data.elo_change).toBeGreaterThan(0);
    expect(json.data.elo_after).toBeGreaterThan(json.data.elo_before);
  });

  // ── Step 7: Match replay accessible ────────────────────────────────

  it("match replay contains full details", async () => {
    const { status, json } = await httpJson("GET", `/api/v1/matches/${matchId1}`);

    expect(status).toBe(200);
    expect(json.data.status).toBe("completed");
    expect(json.data.result).toBe("win");
    expect(json.data.score_breakdown).toBeDefined();
    expect(json.data.score_breakdown.correctness).toBe(500);
    expect(json.data.challenge_slug).toBe(SLUG);
    expect(json.data.agent).toBeDefined();
    expect(json.data.agent.name).toBe(agentName);
  });

  // ── Step 8: Second match — wrong answer → low score ────────────────

  it("enters a second match and submits a wrong answer → low score", async () => {
    // Enter new match
    const { status: enterStatus, json: enterJson } = await agentReq(
      "POST",
      "/api/v1/matches/enter",
      { challenge_slug: SLUG },
      agentKey,
    );
    expect(enterStatus).toBe(201);
    matchId2 = enterJson.data.match_id;
    expect(matchId2).not.toBe(matchId1); // New match, new seed

    // Submit deliberately wrong answer
    const { status, json } = await agentReq(
      "POST",
      `/api/v1/matches/${matchId2}/submit`,
      {
        answer: { sorted: [999, 888, 777] }, // wrong: not the right numbers, not even sorted
        metadata: { model_id: "integration-test" },
      },
      agentKey,
    );

    expect(status).toBe(200);
    expect(json.data.score_breakdown.correctness).toBe(0);
    expect(json.data.score_breakdown.completeness).toBe(0);
    expect(json.data.score_breakdown.speed).toBe(0); // Speed gated on correctness > 0
    expect(json.data.score).toBe(0);
    expect(json.data.result).toBe("loss");
    expect(json.data.elo_change).toBeLessThan(0);
  });

  // ── Step 9: Partially correct answer ───────────────────────────────

  it("scores a partially correct answer with partial credit", async () => {
    // Enter third match
    const { json: enterJson } = await agentReq(
      "POST",
      "/api/v1/matches/enter",
      { challenge_slug: SLUG },
      agentKey,
    );
    const matchId3 = enterJson.data.match_id;
    const seed = extractSeed(enterJson.data.workspace_url);

    // Get correct answer, then modify it to be partially correct
    const data = await mod.generateData(seed, {});
    const correct = data.groundTruth.sorted as number[];

    // Submit a sorted array with only some of the right elements
    // Keep the first half correct, replace the rest
    const partial = correct.slice(0, Math.ceil(correct.length / 2));
    // Add some wrong numbers to fill up, keep it sorted
    for (let i = partial.length; i < correct.length; i++) {
      partial.push(partial[partial.length - 1] + 1);
    }

    const { status, json } = await agentReq(
      "POST",
      `/api/v1/matches/${matchId3}/submit`,
      {
        answer: { sorted: partial },
        metadata: { model_id: "integration-test" },
      },
      agentKey,
    );

    expect(status).toBe(200);
    // Partial answer: sorted array but not exactly matching
    // correctness = 250 (isAscending but not exact match)
    expect(json.data.score_breakdown.correctness).toBe(250);
    // completeness > 0 (some overlap with expected)
    expect(json.data.score_breakdown.completeness).toBeGreaterThan(0);
    expect(json.data.score_breakdown.completeness).toBeLessThan(300);
    // speed > 0 (correctness > 0)
    expect(json.data.score_breakdown.speed).toBeGreaterThan(0);
    // Total between 0 and 1000
    expect(json.data.score).toBeGreaterThan(0);
    expect(json.data.score).toBeLessThan(800);
  });

  // ── Step 10: Validator warnings ────────────────────────────────────

  it("returns submission warnings for malformed answers", async () => {
    // Enter match
    const { json: enterJson } = await agentReq(
      "POST",
      "/api/v1/matches/enter",
      { challenge_slug: SLUG },
      agentKey,
    );
    const matchId4 = enterJson.data.match_id;

    // Submit without the 'sorted' field
    const { status, json } = await agentReq(
      "POST",
      `/api/v1/matches/${matchId4}/submit`,
      {
        answer: { wrong_field: [1, 2, 3] },
        metadata: { model_id: "integration-test" },
      },
      agentKey,
    );

    expect(status).toBe(200);
    // Should have submission warnings from validator.js
    expect(json.data.submission_warnings).toBeDefined();
    expect(json.data.submission_warnings.length).toBeGreaterThan(0);
    expect(json.data.submission_warnings[0].field).toBe("sorted");
    expect(json.data.submission_warnings[0].message).toContain("Missing");
  });

  // ── Step 11: Workspace generation ──────────────────────────────────

  it("module generates valid workspace files", async () => {
    const files = await mod.generateWorkspace(42, {});
    expect(files["numbers.json"]).toBeDefined();
    expect(files["instructions.txt"]).toBeDefined();

    // numbers.json should parse to a valid array
    const numbers = JSON.parse(files["numbers.json"]);
    expect(Array.isArray(numbers)).toBe(true);
    expect(numbers.length).toBeGreaterThanOrEqual(5);
    expect(numbers.length).toBeLessThanOrEqual(10);

    // Instructions file should exist
    expect(files["instructions.txt"]).toContain("Sort");
  });

  // ── Step 12: Determinism ───────────────────────────────────────────

  it("generates deterministic data across runs", async () => {
    const a = await mod.generateData(42, {});
    const b = await mod.generateData(42, {});
    expect(a.groundTruth.sorted).toEqual(b.groundTruth.sorted);

    // Different seeds produce different data
    const c = await mod.generateData(999, {});
    expect(a.groundTruth.sorted).not.toEqual(c.groundTruth.sorted);
  });

  // ── Step 13: Agent stats updated ───────────────────────────────────

  it("agent profile reflects match history", async () => {
    // Fetch agent by checking the match detail agent field
    const { json } = await httpJson("GET", `/api/v1/matches/${matchId1}`);
    const agentId = json.data.agent.id;

    // Get agent's matches
    const { json: matchesJson } = await httpJson(
      "GET",
      `/api/v1/matches?agentId=${agentId}&limit=10`,
    );

    expect(matchesJson.data.length).toBeGreaterThanOrEqual(2); // At least the 2 matches above
    const completed = matchesJson.data.filter((m: any) => m.status === "completed");
    expect(completed.length).toBeGreaterThanOrEqual(2);
  });

  // ── Step 14: Draft status is approved ──────────────────────────────

  it("draft status shows approved", async () => {
    const { json } = await agentReq(
      "GET",
      `/api/v1/challenges/drafts/${draftId}`,
      undefined,
      agentKey,
    );

    expect(json.data.status).toBe("approved");
    expect(json.data.gate_status).toBe("passed");
    expect(json.data.gate_report).toBeDefined();
  });

  // ── Step 15: Cannot re-approve ─────────────────────────────────────

  it("rejects double-approval of the same draft", async () => {
    const { status, json } = await adminReq(
      "POST",
      `/api/v1/admin/drafts/${draftId}/approve`,
    );
    expect(status).toBe(400);
    expect(json.ok).toBe(false);
  });

  // ── Step 16: Admin can list the draft ──────────────────────────────

  it("admin draft listing includes the approved draft", async () => {
    const { status, json } = await adminReq(
      "GET",
      "/api/v1/admin/drafts?status=approved",
    );
    expect(status).toBe(200);
    const found = json.data.find((d: any) => d.id === draftId);
    expect(found).toBeDefined();
    expect(found.slug).toBe(SLUG);
    expect(found.status).toBe("approved");
    expect(found.gate_status).toBe("passed");
  });

  // ── Step 17: Challenge visible in public listing ───────────────────

  it("approved challenge appears in public challenges list", async () => {
    const { status, json } = await httpJson("GET", "/api/v1/challenges");
    expect(status).toBe(200);

    const found = json.data.find((ch: any) => ch.slug === SLUG);
    expect(found).toBeDefined();
    expect(found.name).toBe("Sort Sprint (Integration Test)");
    expect(found.category).toBe("coding");
    expect(found.difficulty).toBe("newcomer");
    expect(found.active).toBe(true);
  });

  // ── Cleanup ─────────────────────────────────────────────────────────

  afterAll(async () => {
    if (!agentId) return;
    try {
      await cleanupTestData(
        [agentId],
        [SLUG],
        draftId ? [draftId] : [],
      );
    } catch (err) {
      console.error("[afterAll cleanup failed]", err);
    }
  });
});
