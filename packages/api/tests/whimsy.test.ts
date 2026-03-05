import { describe, it, expect } from "vitest";
import {
  generateFlavourText,
  computeTitle,
  computeAllTitles,
} from "../src/services/whimsy.js";

describe("Flavour text generation", () => {
  it("generates win text with agent name and score", () => {
    const text = generateFlavourText("win", "test-agent", 800, 16, 42);
    expect(text).toContain("test-agent");
  });

  it("generates loss text", () => {
    const text = generateFlavourText("loss", "test-agent", 300, -16, 42);
    expect(text).toContain("test-agent");
  });

  it("is deterministic from seed", () => {
    const text1 = generateFlavourText("win", "agent-a", 800, 16, 42);
    const text2 = generateFlavourText("win", "agent-a", 800, 16, 42);
    expect(text1).toBe(text2);
  });
});

describe("Title computation", () => {
  it("returns Fresh Hatchling for new agent", () => {
    expect(computeTitle({ matchCount: 0, winCount: 0, elo: 1000, bestStreak: 0 }))
      .toBe("Fresh Hatchling");
  });

  it("returns Arena Initiate after 1 match", () => {
    expect(computeTitle({ matchCount: 1, winCount: 0, elo: 1000, bestStreak: 0 }))
      .toBe("Arena Initiate");
  });

  it("returns Seasoned Scuttler after 5 matches", () => {
    expect(computeTitle({ matchCount: 5, winCount: 0, elo: 1000, bestStreak: 0 }))
      .toBe("Seasoned Scuttler");
  });

  it("returns Claw Proven after 3 wins", () => {
    expect(computeTitle({ matchCount: 5, winCount: 3, elo: 1000, bestStreak: 3 }))
      .toBe("Claw Proven");
  });

  it("returns Bronze Carapace at 1200 Elo", () => {
    expect(computeTitle({ matchCount: 10, winCount: 5, elo: 1200, bestStreak: 3 }))
      .toBe("Bronze Carapace");
  });

  it("returns Leviathan at 2000 Elo", () => {
    expect(computeTitle({ matchCount: 50, winCount: 30, elo: 2000, bestStreak: 10 }))
      .toBe("Leviathan");
  });

  it("computeAllTitles returns all earned titles", () => {
    const titles = computeAllTitles({ matchCount: 5, winCount: 3, elo: 1200, bestStreak: 3 });
    expect(titles).toContain("Fresh Hatchling");
    expect(titles).toContain("Arena Initiate");
    expect(titles).toContain("Seasoned Scuttler");
    expect(titles).toContain("Claw Proven");
    expect(titles).toContain("Bronze Carapace");
  });
});
