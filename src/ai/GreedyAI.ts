import type { GameEngine } from "../engine/GameEngine";
import type { PlayAction } from "../engine/actions";
import { getCandidates } from "./candidateGenerator";
import { actionScore } from "./evaluateAction";
import { speakCombo, speakPass, speakBeatOrCombo } from "../voice";
import { classifyCombo, getComboStake } from "../rules/combo";
import { planLoss } from "./handPlan";

const COMBO_NAME: Record<string, string> = {
  SINGLE: "单张", PAIR: "对子", BOMB_WITH_PAIR: "炸弹", HYDROGEN_BOMB: "氢弹",
  Q873_MIXED: "378Q", Q873_SUITED: "顺378Q",
};

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

export interface HintInfo {
  /** 推荐选中的牌 id;null = 建议不管 */
  cardIds: string[] | null;
  /** 决策依据说明 */
  reason: string;
}

/**
 * 提示:与 AI 完全同一套决策逻辑(候选生成 + 手牌规划 + 全部评分规则:
 * 拆牌代价/结构保护/队友状态/紧急压制/炸弹接管/玩家风格学习),
 * 并输出决策依据。cardIds 为 null 时 reason 解释为什么建议不管。
 */
export function hintInfo(engine: GameEngine, seat: number): HintInfo {
  const state = engine.getState();
  const actions = getCandidates(engine, seat);
  if (!actions.length) return { cardIds: null, reason: "当前没有可用动作" };
  const scored = actions
    .map((action) => ({ action, score: actionScore(action, state, seat) }))
    .sort((a, b) => b.score - a.score);
  const best = scored[0]!;

  // 建议不管:解释原因(压牌最差代价 vs 不管扣分)
  if (best.action.kind === "PASS" || !state.currentCombo) {
    if (best.action.kind === "PASS") {
      const alt = scored.find((item) => item.action.kind === "PLAY");
      const stake = getComboStake(state.currentCombo!);
      if (alt) return { cardIds: null, reason: `建议不管:压牌需消耗功能牌(净亏 ${Math.round(alt.score + stake)} 分),不管只扣 ${stake} 分` };
      return { cardIds: null, reason: "没有能压住的牌,只能不管" };
    }
  }

  const player = state.players[seat]!;
  const cards = best.action.cardIds.map((id) => player.hand.find((card) => card.id === id)).filter((card) => card !== undefined);
  const combo = classifyCombo(cards);
  if (combo.type === "INVALID") return { cardIds: null, reason: "无可用动作" };
  const name = COMBO_NAME[combo.type] ?? combo.type;
  const parts: string[] = [`推荐 ${name}${combo.rank ?? ""}`];
  const loss = state.currentCombo ? planLoss(player.hand, cards) : 0;
  if (state.currentCombo) {
    parts.push(loss > 0 ? `消耗功能牌(隐藏分 ${loss})` : "纯散牌消耗,不伤结构");
    const incomingSmall = state.currentCombo.type === "PAIR" || state.currentCombo.type === "SINGLE";
    if (incomingSmall && combo.type === "BOMB_WITH_PAIR") parts.push("整块炸弹接管夺权");
    if (teammatePassedNote(state, seat)) parts.push("队友已不管,需顶上");
  } else {
    parts.push(loss > 0 ? "(会拆功能牌,尽量先出散牌)" : "(领出散牌)");
  }
  return { cardIds: best.action.cardIds, reason: parts.join(" · ") };
}

function teammatePassedNote(state: GameState, seat: number): boolean {
  const myTeam = state.players[seat]?.team;
  const owner = state.comboOwnerSeat !== null ? state.players[state.comboOwnerSeat] : null;
  if (!myTeam || !owner || owner.team === myTeam) return false;
  return state.pendingPasses.some((pending) => {
    const passer = state.players[pending.seat]!;
    return passer.team === myTeam && pending.seat !== seat;
  });
}

// GameState 类型仅用于 teammatePassedNote 参数标注
type GameState = ReturnType<GameEngine["getState"]>;
