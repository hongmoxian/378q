import type { GameEngine } from "../engine/GameEngine";
import type { PlayAction } from "../engine/actions";
import { getCandidates } from "./candidateGenerator";
import { actionScore } from "./evaluateAction";
import { speakCombo, speakPass, speakBeatOrCombo } from "../voice";
import { classifyCombo } from "../rules/combo";

export function chooseAction(engine: GameEngine, seat: number): PlayAction | null {
  const actions = getCandidates(engine, seat);
  if (!actions.length) return null;
  const state = engine.getState();
  return actions.reduce((best, action) => actionScore(action, state, seat) > actionScore(best, state, seat) ? action : best);
}

export function playAI(engine: GameEngine, seat: number): void {
  const stateBefore = engine.getState();
  const action = chooseAction(engine, seat);
  if (!action) return;
  if (action.kind === "PASS") {
    engine.pass(seat);
    speakPass();
    return;
  }
  const player = engine.getState().players[seat];
  const combo = classifyCombo(action.cardIds.map((id) => player.hand.find((card) => card.id === id)).filter((card) => card !== undefined));
  engine.playCards(seat, action.cardIds);
  if (combo.type !== "INVALID") {
    if (stateBefore.currentCombo) speakBeatOrCombo(combo);
    else speakCombo(combo);
  }
}

/**
 * 提示:为玩家(seat 0)计算当前最优出牌,返回要选中的牌 id 列表。
 * 与 AI 共用同一套候选生成与评分逻辑(合法牌型 + 结构保护 + 大招分级),
 * 返回 null 表示没有能压住的牌(建议过牌);领牌时返回推荐领出的组合。
 */
export function hintCardIds(engine: GameEngine, seat: number): string[] | null {
  const action = chooseAction(engine, seat);
  if (!action || action.kind === "PASS") return null;
  return action.cardIds;
}
