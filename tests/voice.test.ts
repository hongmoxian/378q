import { describe, expect, it } from "vitest";
import { classifyCombo } from "../src/rules/combo";
import { comboVoice } from "../src/voice";

const card = (rank: string, index: number, suit: "SPADE" | "HEART" = "SPADE") => ({ id: `${rank}-${index}`, deck: 0 as const, rank: rank as never, suit, category: "PLAYABLE" as const });

describe("Chinese play calls", () => {
  it("uses the requested names for common combos", () => {
    expect(comboVoice(classifyCombo([card("A", 0)]) as never)).toBe("尖");
    expect(comboVoice(classifyCombo([card("Q", 0), card("Q", 1)]) as never)).toBe("对Q");
    expect(comboVoice(classifyCombo([card("3", 0), card("3", 1), card("3", 2), card("3", 3)]) as never)).toBe("三氢");
    expect(comboVoice(classifyCombo([card("Q", 0), card("8", 0), card("7", 0), card("3", 0)]) as never)).toBe("顺三七八夺");
  });
});
