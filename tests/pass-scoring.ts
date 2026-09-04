import type { Card, Rank } from "../src/rules/cards";
import { GameEngine } from "../src/engine/GameEngine";

const card = (rank: Rank, index: number, suit: "SPADE" | "HEART" | "CLUB" | "DIAMOND"): Card =>
  ({ id: `${rank}${index}`, deck: 0 as const, rank, suit, category: "PLAYABLE" as const });

const engine = new GameEngine(() => Math.random());
engine.startNewMatch();
const st = engine.getState() as { players: { hand: Card[] }[]; currentTurn: number; teamScores: { RED: number; BLUE: number }; pendingPasses: unknown[]; logs: string[] };

// ---- 场景1:敌方领单,我方两家 + 敌方一家都不管 → 每队只扣一次 ----
st.players[1].hand = [card("4", 0, "DIAMOND"), card("9", 20, "SPADE")];
st.players[2].hand = [card("J", 0, "SPADE"), card("J", 1, "HEART"), card("6", 0, "SPADE")];
st.players[3].hand = [card("Q", 0, "SPADE"), card("Q", 1, "HEART"), card("6", 1, "SPADE")];
st.players[0].hand = [card("K", 0, "SPADE"), card("K", 1, "HEART"), card("6", 2, "SPADE")];
const before = { ...st.teamScores };
st.currentTurn = 1;
engine.playCards(1, [card("4", 0, "DIAMOND").id]);
engine.pass(2); // RED(敌,记 5)
engine.pass(3); // BLUE(同队,不记)
engine.pass(0); // RED(敌,记 5)→ 3 连,结算
const after = { ...st.teamScores };
console.log(`场景1(敌领单,三家全不管): 起始 R${before.RED}:B${before.BLUE} → R${after.RED}:B${after.BLUE}`);
console.log(`  RED 扣 ${before.RED - after.RED}(期望 5),BLUE 扣 ${before.BLUE - after.BLUE}(期望 5),pending=${st.pendingPasses.length}`);

// ---- 场景2:敌方领对,我方一家不管、另一家接管 → 不扣分 ----
st.players[1].hand = [card("4", 20, "SPADE"), card("4", 21, "HEART"), card("9", 30, "HEART")];
st.players[2].hand = [card("J", 0, "SPADE"), card("J", 1, "HEART"), card("6", 0, "SPADE")];
st.players[0].hand = [card("A", 0, "SPADE"), card("A", 1, "HEART"), card("6", 2, "SPADE")];
st.players[3].hand = [card("Q", 0, "SPADE"), card("Q", 1, "HEART"), card("6", 1, "SPADE")];
const before2 = { ...st.teamScores };
st.currentTurn = 1;
engine.playCards(1, [card("4", 20, "SPADE").id, card("4", 21, "HEART").id]);
engine.pass(2); // RED(敌,记 10)
engine.pass(3); // BLUE(同队,不记)
engine.playCards(0, [card("A", 0, "SPADE").id, card("A", 1, "HEART").id]); // 我方接管 → 免扣
const after2 = { ...st.teamScores };
console.log(`场景2(敌方领对,我方接管): 起始 R${before2.RED}:B${before2.BLUE} → R${after2.RED}:B${after2.BLUE}(期望不变),pending=${st.pendingPasses.length}`);
