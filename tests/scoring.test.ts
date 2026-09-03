import { describe, expect, it } from "vitest";
import { transferScore } from "../src/rules/scoring";

describe("score transfer", () => {
  it("allows scores below zero so the match threshold can be reached", () => {
    const scores = transferScore({ RED: 500, BLUE: 0 }, "BLUE", 250);
    expect(scores).toEqual({ RED: 750, BLUE: -250 });
  });
});
