import { describe, expect, it } from "vitest";
import { simulateGame } from "../src/simulation/simulateGames";

describe("AI simulation", () => {
  it("finishes a complete match within the action limit", () => {
    for (let seed = 1; seed <= 10; seed += 1) {
      const result = simulateGame(20_000, seed);
      expect(result.actions).toBeLessThan(20_000);
      expect(["RED", "BLUE"]).toContain(result.winner);
    }
  });
});
