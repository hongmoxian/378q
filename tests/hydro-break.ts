import type { Card, Rank } from "../src/rules/cards";
import { GameEngine } from "../src/engine/GameEngine";
import { chooseAction } from "../src/ai/GreedyAI";
import { classifyCombo } from "../src/rules/combo";

const card = (rank: Rank, index: number, suit: "SPADE" | "HEART" | "CLUB" | "DIAMOND"): Card =>
  ({ id: `${rank}${index}`, deck: 0 as const, rank, suit, category: "PLAYABLE" as const });

function runScenario(name: string, p2hand: Card[], enemyFiller: number) {
  const engine = new GameEngine(() => Math.random());
  engine.startNewMatch();
  const state = engine.getState() as { players: { hand: Card[] }[]; currentTurn: number };
  state.players[2].hand = p2hand;
  const fill = (total: number, offset: number) => Array.from({ length: total }, (_, i) => card("J", offset + i, i % 2 ? "DIAMOND" : "SPADE"));
  state.players[1].hand = [card("4", 0, "DIAMOND"), ...fill(enemyFiller, 20)];
  state.players[3].hand = [card("7", 0, "SPADE"), card("7", 1, "HEART"), card("7", 2, "CLUB"), card("4", 0, "SPADE"), card("4", 1, "HEART"), ...fill(enemyFiller + 1, 40)];
  state.currentTurn = 1;
  engine.playCards(1, [card("4", 0, "DIAMOND").id]);
  state.currentTurn = 3;
  engine.playCards(3, [card("7", 0, "SPADE").id, card("7", 1, "HEART").id, card("7", 2, "CLUB").id, card("4", 0, "SPADE").id, card("4", 1, "HEART").id]);
  state.currentTurn = 2;

  const action = chooseAction(engine, 2);
  const p2 = engine.getState().players[2]!;
  const chosen = action && action.kind === "PLAY" ? action.cardIds.map((id) => p2.hand.find((c) => c.id === id)!).filter(Boolean) : null;
  const combo = chosen ? classifyCombo(chosen) : null;
  const detail = combo ? `${combo.type} (${chosen!.map((c) => c.rank).join(" ")})` : action?.kind;
  const brokeHydro = combo?.type === "BOMB_WITH_PAIR" && chosen!.filter((c) => c.rank === "8").length >= 3;
  console.log(`${name}: ${detail}${brokeHydro ? "  ✗ 拆了8氢!" : "  ✓"}`);
}

const HYDRO8 = [card("8", 0, "SPADE"), card("8", 1, "HEART"), card("8", 2, "CLUB"), card("8", 3, "DIAMOND")];

// 非紧急(敌 ≥5 张):7炸在手,8氢不拆成 8 炸,应该 PASS 或整氢
runScenario("非紧急·8氢+炸弹结构", [...HYDRO8, card("3", 0, "SPADE"), card("3", 1, "HEART"), card("3", 2, "CLUB"), card("5", 0, "SPADE"), card("5", 1, "HEART"), card("6", 0, "SPADE"), card("2", 0, "HEART")], 7);
// 非紧急·仅 8 氢+散单:不拆氢,建议不管
runScenario("非紧急·仅8氢+散单", [...HYDRO8, card("6", 0, "SPADE"), card("2", 0, "HEART")], 7);
// 紧急(敌 2 张):允许出整氢接管
runScenario("紧急·仅8氢+散单", [...HYDRO8, card("6", 0, "SPADE"), card("2", 0, "HEART")], 2);

// 场景4:用户场景——手里 3 组功能牌(3氢/7氢/8氢),最小是 3氢;敌人(P3)领单 Q,
// 我方(P0)先不管 → 队友已表态管不上 → AI 出最小的 3 氢压上去
function runScenario4() {
  const engine = new GameEngine(() => Math.random());
  engine.startNewMatch();
  const state = engine.getState() as { players: { hand: Card[] }[]; currentTurn: number };
  state.players[2].hand = [
    card("3", 0, "SPADE"), card("3", 1, "HEART"), card("3", 2, "CLUB"), card("3", 3, "DIAMOND"),
    card("7", 0, "SPADE"), card("7", 1, "HEART"), card("7", 2, "CLUB"), card("7", 3, "DIAMOND"),
    card("8", 0, "SPADE"), card("8", 1, "HEART"), card("8", 2, "CLUB"), card("8", 3, "DIAMOND"),
  ];
  state.players[3].hand = [card("Q", 0, "SPADE"), ...Array.from({ length: 9 }, (_, i) => card("J", 30 + i, i % 2 ? "DIAMOND" : "SPADE"))];
  state.players[0].hand = [card("6", 0, "SPADE"), card("6", 1, "HEART"), card("2", 0, "HEART"), card("2", 1, "DIAMOND"), card("4", 40, "SPADE")];
  state.players[1].hand = [card("5", 0, "SPADE"), card("5", 1, "HEART"), card("9", 20, "SPADE"), card("9", 21, "HEART"), card("4", 30, "SPADE")];
  state.currentTurn = 3;
  engine.playCards(3, [card("Q", 0, "SPADE").id]);
  engine.pass(0); // 我方(队友)先表态:管不上
  engine.pass(1); // 敌方
  state.currentTurn = 2;
  const action = chooseAction(engine, 2);
  const p2 = engine.getState().players[2]!;
  const chosen = action && action.kind === "PLAY" ? action.cardIds.map((id) => p2.hand.find((c) => c.id === id)!).filter(Boolean) : null;
  const combo = chosen ? classifyCombo(chosen) : null;
  const detail = combo ? `${combo.type} (${chosen!.map((c) => c.rank).join(" ")})` : action?.kind;
  const playedHydro = combo?.type === "HYDROGEN_BOMB";
  console.log(`场景4(3组氢弹,队友先不管,敌出单Q): ${detail} → ${playedHydro ? "✓ 出最小氢弹" : action?.kind === "PASS" ? "仍PASS" : "?"}`);
}
runScenario4();
