import { describe, it, expect } from "vitest";
import { sortVersionSummaries, getCurrentVersion } from "../src/services/challenge-versions.js";
import type { ChallengeVersionSummary } from "@clawdiators/shared";

const v3: ChallengeVersionSummary = {
  id: "v3-id",
  version: 3,
  changelog: "Third iteration",
  created_at: "2026-03-01T10:00:00.000Z",
  archived_at: null,
};
const v2: ChallengeVersionSummary = {
  id: "v2-id",
  version: 2,
  changelog: "Second iteration",
  created_at: "2026-02-15T10:00:00.000Z",
  archived_at: "2026-03-01T10:00:00.000Z",
};
const v1: ChallengeVersionSummary = {
  id: "v1-id",
  version: 1,
  changelog: null,
  created_at: "2026-01-01T10:00:00.000Z",
  archived_at: "2026-02-15T10:00:00.000Z",
};

describe("sortVersionSummaries()", () => {
  it("sorts descending by version number (latest first)", () => {
    const sorted = sortVersionSummaries([v1, v2, v3]);
    expect(sorted.map((v) => v.version)).toEqual([3, 2, 1]);
  });

  it("does not mutate the input array", () => {
    const input = [v1, v2, v3];
    sortVersionSummaries(input);
    expect(input[0].version).toBe(1);
  });

  it("single element array returns unchanged", () => {
    expect(sortVersionSummaries([v2])).toHaveLength(1);
    expect(sortVersionSummaries([v2])[0].id).toBe("v2-id");
  });

  it("handles already-sorted input", () => {
    const sorted = sortVersionSummaries([v3, v2, v1]);
    expect(sorted.map((v) => v.version)).toEqual([3, 2, 1]);
  });

  it("current version (archived_at=null) appears first", () => {
    const sorted = sortVersionSummaries([v1, v2, v3]);
    expect(sorted[0].archived_at).toBeNull();
  });

  it("all non-current versions have archived_at set", () => {
    const sorted = sortVersionSummaries([v1, v2, v3]);
    for (const v of sorted.slice(1)) {
      expect(v.archived_at).not.toBeNull();
    }
  });
});

describe("getCurrentVersion()", () => {
  it("returns the version with archived_at=null", () => {
    const current = getCurrentVersion([v1, v2, v3]);
    expect(current?.version).toBe(3);
    expect(current?.archived_at).toBeNull();
  });

  it("returns undefined when all versions are archived", () => {
    expect(getCurrentVersion([v1, v2])).toBeUndefined();
  });

  it("changelog can be null for older versions", () => {
    expect(v1.changelog).toBeNull();
  });
});
