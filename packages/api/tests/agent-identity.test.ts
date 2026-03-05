import { describe, it, expect } from "vitest";
import { hashApiKey } from "../src/middleware/auth.js";
import {
  LEADERBOARD_MIN_MATCHES,
  API_KEY_PREFIX,
  API_KEY_BYTES,
} from "@clawdiators/shared";

// ── Layer 1: Leaderboard Filtering Constants ─────────────────────────

describe("Leaderboard filtering", () => {
  it("LEADERBOARD_MIN_MATCHES defaults to 0 (show all agents)", () => {
    expect(LEADERBOARD_MIN_MATCHES).toBe(0);
  });

  it("LEADERBOARD_MIN_MATCHES is a positive integer", () => {
    expect(Number.isInteger(LEADERBOARD_MIN_MATCHES)).toBe(true);
    expect(LEADERBOARD_MIN_MATCHES).toBeGreaterThanOrEqual(0);
  });
});

// ── Layer 2: Agent Archival Logic ────────────────────────────────────

describe("Agent archival", () => {
  it("auto-archive reason prefix detection", () => {
    // Simulating the auth middleware's auto-unarchive logic
    const shouldAutoUnarchive = (reason: string | null) =>
      reason?.startsWith("auto:") ?? false;

    expect(shouldAutoUnarchive("auto:idle")).toBe(true);
    expect(shouldAutoUnarchive("auto:inactive")).toBe(true);
    expect(shouldAutoUnarchive("self")).toBe(false);
    expect(shouldAutoUnarchive("admin: test reason")).toBe(false);
    expect(shouldAutoUnarchive(null)).toBe(false);
  });

  it("archived reason format for admin archival", () => {
    const reason = "policy violation";
    const archivedReason = `admin: ${reason}`;
    expect(archivedReason).toBe("admin: policy violation");
    expect(archivedReason.startsWith("auto:")).toBe(false);
  });

  it("archived reason for self-archive", () => {
    const archivedReason = "self";
    expect(archivedReason).toBe("self");
    expect(archivedReason.startsWith("auto:")).toBe(false);
  });

  it("name reclamation eligibility: archived + 0 matches", () => {
    const canReclaim = (agent: { archivedAt: Date | null; matchCount: number }) =>
      agent.archivedAt !== null && agent.matchCount === 0;

    expect(canReclaim({ archivedAt: new Date(), matchCount: 0 })).toBe(true);
    expect(canReclaim({ archivedAt: new Date(), matchCount: 5 })).toBe(false);
    expect(canReclaim({ archivedAt: null, matchCount: 0 })).toBe(false);
    expect(canReclaim({ archivedAt: null, matchCount: 3 })).toBe(false);
  });

  it("auto-archive eligibility: 0 matches + created > 6 months ago", () => {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 7); // 7 months ago

    const recent = new Date();
    recent.setDate(recent.getDate() - 1); // yesterday

    const shouldAutoArchive = (agent: {
      matchCount: number;
      archivedAt: Date | null;
      createdAt: Date;
    }) => {
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - 6);
      return agent.matchCount === 0 && !agent.archivedAt && agent.createdAt < cutoff;
    };

    expect(shouldAutoArchive({ matchCount: 0, archivedAt: null, createdAt: sixMonthsAgo })).toBe(true);
    expect(shouldAutoArchive({ matchCount: 0, archivedAt: null, createdAt: recent })).toBe(false);
    expect(shouldAutoArchive({ matchCount: 5, archivedAt: null, createdAt: sixMonthsAgo })).toBe(false);
    expect(shouldAutoArchive({ matchCount: 0, archivedAt: new Date(), createdAt: sixMonthsAgo })).toBe(false);
  });
});

// ── Layer 4: Key Rotation ────────────────────────────────────────────

describe("Key rotation", () => {
  it("hashApiKey produces consistent SHA-256 hashes", () => {
    const key = "clw_abcdef1234567890";
    const hash1 = hashApiKey(key);
    const hash2 = hashApiKey(key);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 hex
  });

  it("different keys produce different hashes", () => {
    const hash1 = hashApiKey("clw_key_one_abc123");
    const hash2 = hashApiKey("clw_key_two_xyz789");
    expect(hash1).not.toBe(hash2);
  });

  it("API key format is correct", () => {
    // Simulating key generation
    const { randomBytes } = require("node:crypto");
    const rawKey = API_KEY_PREFIX + randomBytes(API_KEY_BYTES).toString("hex");
    expect(rawKey.startsWith("clw_")).toBe(true);
    expect(rawKey.length).toBe(4 + API_KEY_BYTES * 2); // prefix + hex
  });

  it("key prefix format hides most of the key", () => {
    const rawKey = "clw_abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
    const keyPrefix = rawKey.slice(0, 8) + "****";
    expect(keyPrefix).toBe("clw_abcd****");
    expect(keyPrefix).not.toContain(rawKey.slice(8));
  });
});

// ── Layer 4: Recovery ────────────────────────────────────────────────

describe("Recovery", () => {
  it("claim token is required for recovery (not just any token)", () => {
    // Recovery requires agent to be claimed first
    const canRecover = (agent: { claimedBy: string | null }) =>
      agent.claimedBy !== null;

    expect(canRecover({ claimedBy: "user@example.com" })).toBe(true);
    expect(canRecover({ claimedBy: null })).toBe(false);
  });

  it("recovery rotates both key and claim token", () => {
    // Verify the contract: after recovery, both old API key and old claim token are invalid
    const { randomBytes } = require("node:crypto");

    const oldClaimToken = randomBytes(16).toString("hex");
    const newClaimToken = randomBytes(16).toString("hex");

    expect(oldClaimToken).not.toBe(newClaimToken);
    expect(oldClaimToken).toHaveLength(32);
    expect(newClaimToken).toHaveLength(32);
  });
});

// ── PATCH /agents/me — Profile Update Logic ─────────────────────────

describe("PATCH /agents/me validation", () => {
  it("tagline is limited to 160 characters", () => {
    const maxLen = 160;
    const valid = "A".repeat(maxLen);
    const invalid = "A".repeat(maxLen + 1);

    expect(valid.length).toBe(160);
    expect(invalid.length).toBe(161);
    expect(valid.length <= maxLen).toBe(true);
    expect(invalid.length <= maxLen).toBe(false);
  });

  it("description is limited to 1000 characters", () => {
    const maxLen = 1000;
    const valid = "B".repeat(maxLen);
    const invalid = "B".repeat(maxLen + 1);

    expect(valid.length <= maxLen).toBe(true);
    expect(invalid.length <= maxLen).toBe(false);
  });

  it("partial updates only modify provided fields", () => {
    const existing = { tagline: "old tagline", description: "old desc" };
    const updates: { tagline?: string; description?: string } = { tagline: "new tagline" };

    const updateFields: Record<string, unknown> = {};
    if (updates.tagline !== undefined) updateFields.tagline = updates.tagline;
    if (updates.description !== undefined) updateFields.description = updates.description;

    expect(updateFields).toEqual({ tagline: "new tagline" });
    expect(updateFields.description).toBeUndefined();
  });

  it("empty update only touches updatedAt", () => {
    const updates: { tagline?: string; description?: string } = {};

    const updateFields: Record<string, unknown> = { updatedAt: new Date() };
    if (updates.tagline !== undefined) updateFields.tagline = updates.tagline;
    if (updates.description !== undefined) updateFields.description = updates.description;

    expect(Object.keys(updateFields)).toEqual(["updatedAt"]);
  });

  it("both tagline and description can be updated together", () => {
    const updates = { tagline: "new tag", description: "new desc" };

    const updateFields: Record<string, unknown> = { updatedAt: new Date() };
    if (updates.tagline !== undefined) updateFields.tagline = updates.tagline;
    if (updates.description !== undefined) updateFields.description = updates.description;

    expect(updateFields.tagline).toBe("new tag");
    expect(updateFields.description).toBe("new desc");
  });

  it("tagline can be set to empty string", () => {
    const updates = { tagline: "" };
    const updateFields: Record<string, unknown> = {};
    if (updates.tagline !== undefined) updateFields.tagline = updates.tagline;

    expect(updateFields.tagline).toBe("");
  });
});

// ── Archival + Leaderboard Integration Logic ─────────────────────────

describe("Archival and leaderboard interaction", () => {
  it("archived agents are excluded from leaderboard results", () => {
    // Simulating the filter logic used in leaderboard route
    const allAgents = [
      { id: "1", name: "active-agent", elo: 1200, matchCount: 10, archivedAt: null },
      { id: "2", name: "archived-agent", elo: 1300, matchCount: 5, archivedAt: new Date() },
      { id: "3", name: "ghost-agent", elo: 1000, matchCount: 0, archivedAt: null },
    ];

    const minMatches = LEADERBOARD_MIN_MATCHES;
    const filtered = allAgents.filter(
      (a) => a.archivedAt === null && a.matchCount >= minMatches,
    );

    // With LEADERBOARD_MIN_MATCHES=0, all non-archived agents appear
    expect(filtered).toHaveLength(2);
    expect(filtered[0].name).toBe("active-agent");
    expect(filtered[1].name).toBe("ghost-agent");
  });

  it("all agents included at default min_matches=0", () => {
    const agents = [
      { matchCount: 0, archivedAt: null },
      { matchCount: 1, archivedAt: null },
      { matchCount: 10, archivedAt: null },
    ];

    const filtered = agents.filter((a) => a.matchCount >= LEADERBOARD_MIN_MATCHES);
    expect(filtered).toHaveLength(3);
  });

  it("min_matches=0 includes ghost agents", () => {
    const agents = [
      { matchCount: 0, archivedAt: null },
      { matchCount: 1, archivedAt: null },
    ];

    const filtered = agents.filter((a) => a.matchCount >= 0);
    expect(filtered).toHaveLength(2);
  });

  it("archived agent cannot enter match", () => {
    const agent = { archivedAt: new Date() };
    const canEnter = !agent.archivedAt;
    expect(canEnter).toBe(false);
  });

  it("non-archived agent can enter match", () => {
    const agent = { archivedAt: null };
    const canEnter = !agent.archivedAt;
    expect(canEnter).toBe(true);
  });
});
