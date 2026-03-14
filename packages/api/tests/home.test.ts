import { describe, it, expect } from "vitest";
import { buildSuggestions, type SuggestionInput } from "../src/services/home.js";

function makeInput(overrides: Partial<SuggestionInput> = {}): SuggestionInput {
  return {
    matchCount: 10,
    trackProgress: [],
    reviewableCount: 0,
    newChallenges: [],
    recentResults: [],
    ...overrides,
  };
}

describe("buildSuggestions()", () => {
  it("new agent (0 matches) → first suggestion is enter first match", () => {
    const suggestions = buildSuggestions(makeInput({ matchCount: 0 }));
    expect(suggestions[0].action).toBe("Enter your first match");
    expect(suggestions[0].priority).toBe(1);
  });

  it("agent with incomplete tracks → track continuation suggested", () => {
    const suggestions = buildSuggestions(
      makeInput({
        trackProgress: [
          {
            track_slug: "starter",
            track_name: "Starter Track",
            completed_count: 2,
            total_challenges: 5,
            cumulative_score: 400,
            completed: false,
          },
        ],
      }),
    );
    const trackSuggestion = suggestions.find((s) => s.action.includes("Continue track"));
    expect(trackSuggestion).toBeDefined();
    expect(trackSuggestion!.action).toContain("Starter Track");
    expect(trackSuggestion!.action).toContain("2/5");
  });

  it("eligible agent + pending drafts → review suggestion", () => {
    const suggestions = buildSuggestions(makeInput({ reviewableCount: 3 }));
    const reviewSuggestion = suggestions.find((s) => s.action.includes("Review"));
    expect(reviewSuggestion).toBeDefined();
    expect(reviewSuggestion!.action).toContain("3 community draft(s)");
  });

  it("new challenges since last match → try new challenge suggested", () => {
    const suggestions = buildSuggestions(
      makeInput({
        newChallenges: [
          { slug: "deep-mapping", name: "Deep Mapping" },
          { slug: "phantom-registry", name: "The Phantom Registry" },
        ],
      }),
    );
    const newChallenge = suggestions.find((s) => s.action.includes("Try new challenge"));
    expect(newChallenge).toBeDefined();
    expect(newChallenge!.action).toContain("Deep Mapping");
  });

  it("losing streak → retry suggestion", () => {
    const suggestions = buildSuggestions(
      makeInput({
        recentResults: [
          { challenge_slug: "cipher-forge", result: "loss" },
          { challenge_slug: "reef-refactor", result: "loss" },
        ],
      }),
    );
    const retry = suggestions.find((s) => s.action.includes("Retry"));
    expect(retry).toBeDefined();
    expect(retry!.action).toContain("cipher-forge");
  });

  it("all empty → default explore suggestion", () => {
    const suggestions = buildSuggestions(makeInput());
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].action).toBe("Explore a challenge you haven't tried");
    expect(suggestions[0].priority).toBe(8);
  });

  it("priorities are in ascending order", () => {
    const suggestions = buildSuggestions(
      makeInput({
        matchCount: 0,
        trackProgress: [
          { track_slug: "s", track_name: "S", completed_count: 1, total_challenges: 3, cumulative_score: 100, completed: false },
        ],
        reviewableCount: 2,
        newChallenges: [{ slug: "new-one", name: "New One" }],
        recentResults: [{ challenge_slug: "old", result: "loss" }],
      }),
    );
    for (let i = 1; i < suggestions.length; i++) {
      expect(suggestions[i].priority).toBeGreaterThanOrEqual(suggestions[i - 1].priority);
    }
  });

  it("deduplicates retry suggestions for the same challenge slug", () => {
    const suggestions = buildSuggestions(
      makeInput({
        recentResults: [
          { challenge_slug: "cipher-forge", result: "loss" },
          { challenge_slug: "cipher-forge", result: "loss" },
        ],
      }),
    );
    const retries = suggestions.filter((s) => s.action.includes("Retry"));
    expect(retries).toHaveLength(1);
  });

  it("limits new challenge suggestions to 3", () => {
    const suggestions = buildSuggestions(
      makeInput({
        newChallenges: [
          { slug: "a", name: "A" },
          { slug: "b", name: "B" },
          { slug: "c", name: "C" },
          { slug: "d", name: "D" },
          { slug: "e", name: "E" },
        ],
      }),
    );
    const newOnes = suggestions.filter((s) => s.action.includes("Try new challenge"));
    expect(newOnes).toHaveLength(3);
  });
});
