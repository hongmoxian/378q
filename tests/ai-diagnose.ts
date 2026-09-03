import { GameEngine } from "../src/engine/GameEngine";
import { chooseAction } from "../src/ai/GreedyAI";
import { classifyCombo } from "../src/rules/combo";

// 模拟 N 局完整对局(纯 AI,无倒计时/语音),统计行为指标
const N = 300;
let totalActions = 0, totalPass = 0;
let bombUsed = 0, hydrogenUsed = 0, q873Used = 0, suitedUsed = 0;
let passWithBombInHand = 0, passWithHydrogenInHand = 0;
const perSeatPass: number[] = [0, 0, 0, 0];
const perSeatActions: number[] = [0, 0, 0, 0];
let longestAllPassStreak = 0, currentAllPassStreak = 0;
let stuckGames = 0;

for (let g = 0; g < N; g++) {
  const engine = new GameEngine(() => Math.random());
  engine.startNewMatch();
  let guard = 0;
  let finished = false;
  while (guard++ < 3000) {
    const state = engine.getState();
    if (state.phase === "MATCH_FINISHED") { finished = true; break; }
    if (state.phase !== "PLAYING") { engine.startNextHand(); continue; }
    const seat = state.currentTurn;
    const action = chooseAction(engine, seat);
    if (!action) break;
    totalActions++;
    perSeatActions[seat]!++;
    const player = state.players[seat]!;
    const hasBomb = player.hand.some((c, i, arr) => arr.filter(x => x.rank === c.rank).length >= 3);
    const hasHydrogen = ["3","7","8","Q","2","A","J","9","6","4"].some(r => player.hand.filter(c => c.rank === r).length >= 4);
    if (action.kind === "PASS") {
      totalPass++;
      perSeatPass[seat]!++;
      currentAllPassStreak++;
      if (hasBomb) passWithBombInHand++;
      if (hasHydrogen) passWithHydrogenInHand++;
    } else {
      currentAllPassStreak = 0;
      const cards = action.cardIds.map(id => player.hand.find(c => c.id === id)!);
      const combo = classifyCombo(cards);
      if (combo.type === "BOMB_WITH_PAIR") bombUsed++;
      if (combo.type === "HYDROGEN_BOMB") hydrogenUsed++;
      if (combo.type === "Q873_MIXED") q873Used++;
      if (combo.type === "Q873_SUITED") suitedUsed++;
    }
    longestAllPassStreak = Math.max(longestAllPassStreak, currentAllPassStreak);
    try {
      if (action.kind === "PASS") engine.pass(seat);
      else engine.playCards(seat, action.cardIds);
    } catch { break; }
  }
  if (!finished) stuckGames++;
}

console.log(`模拟 ${N} 局(每局最多3000步):`);
console.log(`未完成(卡死)局数: ${stuckGames}`);
console.log(`总动作 ${totalActions}, PASS ${totalPass} (${(totalPass/totalActions*100).toFixed(1)}%)`);
for (let s = 0; s < 4; s++) console.log(`  P${s}: PASS率 ${(perSeatPass[s]!/(perSeatActions[s]||1)*100).toFixed(1)}%`);
console.log(`最长连续全 PASS 轮数(约): ${longestAllPassStreak}`);
console.log(`大招使用: 炸弹×${bombUsed} 氢弹×${hydrogenUsed} 378Q×${q873Used} 顺378×${suitedUsed}`);
console.log(`带炸弹在身却 PASS 的次数: ${passWithBombInHand}`);
console.log(`带氢弹在身却 PASS 的次数: ${passWithHydrogenInHand}`);
