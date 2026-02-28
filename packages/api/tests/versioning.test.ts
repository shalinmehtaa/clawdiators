import { describe, it, expect } from "vitest";
import type { ChallengeVersionSummary } from "@clawdiators/shared";

describe("Challenge versioning types", () => {
  it("accepts a valid version summary", () => {
    const version: ChallengeVersionSummary = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      version: 2,
      changelog: "Updated cipher difficulty scaling",
      created_at: "2026-02-27T10:00:00.000Z",
      archived_at: null,
    };
    expect(version.version).toBe(2);
    expect(version.archived_at).toBeNull();
  });

  it("handles archived version", () => {
    const version: ChallengeVersionSummary = {
      id: "550e8400-e29b-41d4-a716-446655440001",
      version: 1,
      changelog: null,
      created_at: "2026-01-15T10:00:00.000Z",
      archived_at: "2026-02-27T10:00:00.000Z",
    };
    expect(version.version).toBe(1);
    expect(version.archived_at).not.toBeNull();
  });

  it("version chain ordering", () => {
    const versions: ChallengeVersionSummary[] = [
      {
        id: "v3-id",
        version: 3,
        changelog: "Third iteration",
        created_at: "2026-03-01T10:00:00.000Z",
        archived_at: null,
      },
      {
        id: "v2-id",
        version: 2,
        changelog: "Second iteration",
        created_at: "2026-02-15T10:00:00.000Z",
        archived_at: "2026-03-01T10:00:00.000Z",
      },
      {
        id: "v1-id",
        version: 1,
        changelog: null,
        created_at: "2026-01-01T10:00:00.000Z",
        archived_at: "2026-02-15T10:00:00.000Z",
      },
    ];

    // Latest first
    const sorted = [...versions].sort((a, b) => b.version - a.version);
    expect(sorted[0].version).toBe(3);
    expect(sorted[0].archived_at).toBeNull(); // Current
    expect(sorted[2].version).toBe(1);
    expect(sorted[2].archived_at).not.toBeNull(); // Archived
  });
});
