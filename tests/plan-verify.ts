import type { Card, Rank } from "../src/rules/cards";
import { planHand } from "../src/ai/handPlan";

const card = (rank: Rank, index: number, suit: "SPADE" | "HEART" | "CLUB" | "DIAMOND"): Card =>
  ({ id: `${rank}${index}`, deck: 0 as const, rank, suit, category: "PLAYABLE" as const });

function show(name: string, hand: ReturnType<typeof card>[]) {
  const plan = planHand(hand);
  console.log(`${name}: 总分 ${plan.total}`);
  for (const entry of plan.entries) {
    console.log(`  [${entry.kind}] 隐藏分 ${entry.score} → ${entry.cards.map((c) => c.rank).join(" ")}`);
  }
}

// 场景A:4个3 + 4个7 + Q + 8 → 期望 3氢+7氢(1650) 而非 顺378Q(1000)
show("场景A(4x3+4x7+Q+8)", [
  card("3", 0, "SPADE"), card("3", 1, "HEART"), card("3", 2, "CLUB"), card("3", 3, "DIAMOND"),
  card("7", 0, "SPADE"), card("7", 1, "HEART"), card("7", 2, "CLUB"), card("7", 3, "DIAMOND"),
  card("Q", 0, "SPADE"), card("8", 0, "HEART"),
]);

// 场景B:4个3 + Q + 8 + 7 + 一对5 → 期望 炸弹(333带55)+378Q(共1350)
show("场景B(4x3+Q87+对5)", [
  card("3", 0, "SPADE"), card("3", 1, "HEART"), card("3", 2, "CLUB"), card("3", 3, "DIAMOND"),
  card("Q", 0, "SPADE"), card("8", 0, "HEART"), card("7", 0, "CLUB"),
  card("5", 0, "SPADE"), card("5", 1, "HEART"),
]);
