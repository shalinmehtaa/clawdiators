import { describe, it, expect } from "vitest";
import { computeStructuralHash, hasStructurallyChanged } from "../src/services/harness.js";
import type { HarnessInfo } from "@clawdiators/shared";
import {
  KNOWN_FRAMEWORKS,
  KNOWN_FRAMEWORK_IDS,
  SUGGESTED_LOOP_TYPES,
  SUGGESTED_CONTEXT_STRATEGIES,
  SUGGESTED_ERROR_STRATEGIES,
  CANONICAL_TOOLS,
} from "@clawdiators/shared";

function makeHarness(overrides: Partial<HarnessInfo> = {}): HarnessInfo {
  return {
    id: "test-harness",
    name: "Test Harness",
    baseFramework: "claude-code",
    loopType: "single-agent",
    contextStrategy: "progressive-disclosure",
    errorStrategy: "model-driven",
    tools: ["bash", "read", "write"],
    ...overrides,
  };
}

// ── computeStructuralHash ───────────────────────────────────────────

describe("computeStructuralHash()", () => {
  it("returns a 16-character hex string", () => {
    const hash = computeStructuralHash(makeHarness());
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("is deterministic — same input produces same hash", () => {
    const h = makeHarness();
    expect(computeStructuralHash(h)).toBe(computeStructuralHash(h));
  });

  it("ignores cosmetic fields (name, description, version)", () => {
    const a = makeHarness({ name: "Harness Alpha", description: "First", version: "1.0" });
    const b = makeHarness({ name: "Harness Beta", description: "Second", version: "2.0" });
    expect(computeStructuralHash(a)).toBe(computeStructuralHash(b));
  });

  it("differs when baseFramework changes", () => {
    const a = makeHarness({ baseFramework: "claude-code" });
    const b = makeHarness({ baseFramework: "cursor" });
    expect(computeStructuralHash(a)).not.toBe(computeStructuralHash(b));
  });

  it("differs when loopType changes", () => {
    const a = makeHarness({ loopType: "single-agent" });
    const b = makeHarness({ loopType: "multi-agent" });
    expect(computeStructuralHash(a)).not.toBe(computeStructuralHash(b));
  });

  it("differs when contextStrategy changes", () => {
    const a = makeHarness({ contextStrategy: "progressive-disclosure" });
    const b = makeHarness({ contextStrategy: "static" });
    expect(computeStructuralHash(a)).not.toBe(computeStructuralHash(b));
  });

  it("differs when errorStrategy changes", () => {
    const a = makeHarness({ errorStrategy: "model-driven" });
    const b = makeHarness({ errorStrategy: "linter-gated" });
    expect(computeStructuralHash(a)).not.toBe(computeStructuralHash(b));
  });

  it("differs when tools change", () => {
    const a = makeHarness({ tools: ["bash", "read"] });
    const b = makeHarness({ tools: ["bash", "read", "write"] });
    expect(computeStructuralHash(a)).not.toBe(computeStructuralHash(b));
  });

  it("is stable regardless of tool order", () => {
    const a = makeHarness({ tools: ["write", "read", "bash"] });
    const b = makeHarness({ tools: ["bash", "read", "write"] });
    expect(computeStructuralHash(a)).toBe(computeStructuralHash(b));
  });

  it("handles missing optional fields", () => {
    const h = makeHarness({
      baseFramework: undefined,
      loopType: undefined,
      contextStrategy: undefined,
      errorStrategy: undefined,
      tools: undefined,
    });
    const hash = computeStructuralHash(h);
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("treats undefined tools and empty tools differently from present tools", () => {
    const a = makeHarness({ tools: undefined });
    const b = makeHarness({ tools: ["bash"] });
    expect(computeStructuralHash(a)).not.toBe(computeStructuralHash(b));
  });
});

// ── hasStructurallyChanged ──────────────────────────────────────────

describe("hasStructurallyChanged()", () => {
  it("returns true when stored is null", () => {
    expect(hasStructurallyChanged(makeHarness(), null)).toBe(true);
  });

  it("returns false when current and stored are identical", () => {
    const h = makeHarness();
    expect(hasStructurallyChanged(h, h)).toBe(false);
  });

  it("returns false when only cosmetic fields differ", () => {
    const current = makeHarness({ name: "New Name", version: "2.0" });
    const stored = makeHarness({ name: "Old Name", version: "1.0" });
    expect(hasStructurallyChanged(current, stored)).toBe(false);
  });

  it("returns true when structural field changes", () => {
    const current = makeHarness({ loopType: "multi-agent" });
    const stored = makeHarness({ loopType: "single-agent" });
    expect(hasStructurallyChanged(current, stored)).toBe(true);
  });

  it("returns true when tools change", () => {
    const current = makeHarness({ tools: ["bash", "read", "write", "grep"] });
    const stored = makeHarness({ tools: ["bash", "read", "write"] });
    expect(hasStructurallyChanged(current, stored)).toBe(true);
  });
});

// ── KNOWN_FRAMEWORKS ────────────────────────────────────────────────

describe("KNOWN_FRAMEWORKS", () => {
  it("has at least 28 entries", () => {
    expect(KNOWN_FRAMEWORKS.length).toBeGreaterThanOrEqual(28);
  });

  it("has unique IDs", () => {
    const ids = KNOWN_FRAMEWORKS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every entry has required fields", () => {
    for (const f of KNOWN_FRAMEWORKS) {
      expect(f.id).toBeTruthy();
      expect(f.name).toBeTruthy();
      expect(["ide", "cli", "cloud", "framework", "other"]).toContain(f.category);
      expect(typeof f.description).toBe("string");
      expect(Array.isArray(f.defaultTools)).toBe(true);
    }
  });

  it("includes the 'custom' catch-all", () => {
    expect(KNOWN_FRAMEWORK_IDS).toContain("custom");
  });

  it("includes claude-code", () => {
    expect(KNOWN_FRAMEWORK_IDS).toContain("claude-code");
  });

  it("KNOWN_FRAMEWORK_IDS matches KNOWN_FRAMEWORKS", () => {
    expect(KNOWN_FRAMEWORK_IDS).toEqual(KNOWN_FRAMEWORKS.map((f) => f.id));
  });
});

// ── Suggested values ────────────────────────────────────────────────

describe("Suggested taxonomy values", () => {
  it("SUGGESTED_LOOP_TYPES is non-empty and contains single-agent", () => {
    expect(SUGGESTED_LOOP_TYPES.length).toBeGreaterThan(0);
    expect(SUGGESTED_LOOP_TYPES).toContain("single-agent");
  });

  it("SUGGESTED_CONTEXT_STRATEGIES is non-empty and contains progressive-disclosure", () => {
    expect(SUGGESTED_CONTEXT_STRATEGIES.length).toBeGreaterThan(0);
    expect(SUGGESTED_CONTEXT_STRATEGIES).toContain("progressive-disclosure");
  });

  it("SUGGESTED_ERROR_STRATEGIES is non-empty and contains model-driven", () => {
    expect(SUGGESTED_ERROR_STRATEGIES.length).toBeGreaterThan(0);
    expect(SUGGESTED_ERROR_STRATEGIES).toContain("model-driven");
  });

  it("CANONICAL_TOOLS is non-empty and contains bash, read, write", () => {
    expect(CANONICAL_TOOLS.length).toBeGreaterThan(0);
    expect(CANONICAL_TOOLS).toContain("bash");
    expect(CANONICAL_TOOLS).toContain("read");
    expect(CANONICAL_TOOLS).toContain("write");
  });
});
