import type { PlayAction } from "../engine/actions";
import type { GameState } from "../engine/GameState";
import { classifyCombo, getComboStake } from "../rules/combo";
import { COMBO_TIER } from "../rules/ruleConfig";
import { getRankPower } from "../rules/ranks";

type Hand = GameState["players"][number]["hand"];
type ComboType = keyof typeof COMBO_TIER;
const PLAYABLE_RANKS = ["Q", "8", "7", "3", "2", "A", "J", "9", "6", "4"] as const;
const Q873_RANKS = ["Q", "8", "7", "3"] as const;

function count(cards: Hand, rank: string): number {
  return cards.filter((card) => card.rank === rank).length;
}

/** 敌方最少剩牌数:越小说明对手越接近跑光,局势越紧急。 */
function opponentPressure(state: GameState, seat: number): number {
  const myTeam = state.players[seat]?.team;
  let min = 99;
  for (const player of state.players) {
    if (!player || player.team === myTeam) continue;
    min = Math.min(min, player.hand.length);
  }
  return min;
}

function stillHasQ873(remaining: Hand): boolean {
  return Q873_RANKS.every((rank) => count(remaining, rank) > 0);
}

function stillHasBomb(remaining: Hand): boolean {
  return PLAYABLE_RANKS.some((body) => count(remaining, body) >= 3 && PLAYABLE_RANKS.some((pair) => pair !== body && count(remaining, pair) >= 2));
}

/**
 * 结构保护:出掉 played 后,是否拆散了手上仍然可成的 Q873 / 氢弹 / 炸弹。
 * 冗余豁免:如果出牌后剩余手牌仍能组成该结构,不惩罚。
 * 量级设计:拆 Q873(700)> 氢弹(450)> 炸弹(150),保证 AI 面对"只能拆 Q873 才能压"时,
 * 会优先改出整块的炸弹/氢弹(它们不破坏 Q873,惩罚更小),而不是拆散 Q873。
 */
function protectedStructureDamage(hand: Hand, played: Hand, comboType: string, urgent: boolean): number {
  if (played.length === hand.length) return 0;
  const playedIds = new Set(played.map((card) => card.id));
  const remaining = hand.filter((card) => !playedIds.has(card.id));
  let damage = 0;

  // 拆 Q873:手上四张齐全,出掉组件后无法再组成 Q873 才算拆
  if (comboType !== "Q873_MIXED" && comboType !== "Q873_SUITED" && Q873_RANKS.every((rank) => count(hand, rank) > 0)) {
    if (!stillHasQ873(remaining) && played.some((card) => (Q873_RANKS as readonly string[]).includes(card.rank))) damage += urgent ? 150 : 700;
  }

  // 拆氢弹:某点数凑满 4 张,出掉后凑不齐了
  if (comboType !== "HYDROGEN_BOMB") {
    for (const rank of PLAYABLE_RANKS) {
      if (count(hand, rank) >= 4 && count(remaining, rank) < 4 && played.some((card) => card.rank === rank)) damage += urgent ? 120 : 450;
    }
  }

  // 拆炸弹:三带二结构被破坏且破坏后无法重组
  if (comboType !== "BOMB_WITH_PAIR") {
    if (stillHasBomb(hand) && !stillHasBomb(remaining)) damage += urgent ? 60 : 150;
  }
  return damage;
}

/** 队友(对家)在本轮已 PASS,且当前牌由敌方持有:队友接不了,该自己顶上。 */
function teammatePassed(state: GameState, seat: number): boolean {
  if (state.lastPassSeat === null || state.comboOwnerSeat === null) return false;
  if (state.lastPassSeat === seat) return false;
  const teammate = state.players[state.lastPassSeat];
  const owner = state.players[state.comboOwnerSeat];
  if (!teammate || !owner) return false;
  return teammate.team === state.players[seat].team && owner.team !== state.players[seat].team;
}

/**
 * 用大招压小牌的浪费惩罚,决定接牌优先顺序:炸弹 > 普通378Q > 氢弹 > 顺378Q。
 * 考虑三个因素:
 * 1. 牌型等级——基础惩罚顺378Q(800)> 氢弹(500)> 378Q(250)> 炸弹(120),
 *    同样能压住时 AI 总选代价最小的一种,大招留给关键时刻;
 * 2. 开局阶段——手牌 >= 14 张(开局/前中期)时惩罚 ×3:第一轮宁可 PASS 期待队友,
 *    手牌 <= 6 张(收尾)时惩罚 ×0.6:该出手就出手;
 * 3. 队友状态——队友尚未 PASS(+300):队友可能还能接,自己先别抢大招。
 * 敌方已出炸弹级牌(stake > 10)时不罚:敌大招我方必须跟上,否则跑分。
 * 紧急时刻(敌方剩牌 <= 2)全部豁免。
 */
const WASTE_BASE: Partial<Record<ComboType, number>> = {
  BOMB_WITH_PAIR: 120,
  Q873_MIXED: 250,
  HYDROGEN_BOMB: 500,
  Q873_SUITED: 800,
};

function wastePenalty(comboType: ComboType, state: GameState, seat: number, urgent: boolean): number {
  if (urgent) return 0;
  const base = WASTE_BASE[comboType];
  if (!base) return 0;
  const stake = state.currentCombo ? getComboStake(state.currentCombo) : 0;
  if (stake > 10) return 0;
  const handSize = state.players[seat]?.hand.length ?? 0;
  let penalty = base;
  if (handSize >= 14) penalty = Math.round(penalty * 3);
  else if (handSize <= 6) penalty = Math.round(penalty * 0.6);
  if (!teammatePassed(state, seat)) penalty += 300;
  return penalty;
}

export function actionScore(action: PlayAction, state: GameState, seat: number): number {
  const player = state.players[seat];
  if (!player) return Number.NEGATIVE_INFINITY;
  const urgent = opponentPressure(state, seat) <= 2;
  if (action.kind === "PASS") {
    if (!state.currentCombo || state.comboOwnerSeat === null) return Number.NEGATIVE_INFINITY;
    return state.players[state.comboOwnerSeat].team === player.team ? 0 : -getComboStake(state.currentCombo);
  }
  const cards = action.cardIds.map((id) => player.hand.find((card) => card.id === id)).filter((card) => card !== undefined);
  const combo = classifyCombo(cards);
  if (combo.type === "INVALID") return Number.NEGATIVE_INFINITY;
  if (!state.currentCombo) {
    // 领牌:保护牌型结构,不能为了出小牌而拆 Q873 / 炸弹
    const rankPower = combo.rank === undefined ? 0 : getRankPower(combo.rank);
    return 1_000 - rankPower * 20 + (combo.type === "PAIR" ? 15 : 0) + combo.cards.length * 2 - protectedStructureDamage(player.hand, cards, combo.type, urgent);
  }
  const tier = COMBO_TIER[combo.type];
  const rankPower = combo.rank === undefined ? 0 : getRankPower(combo.rank);
  let score = 1_000 - tier * 100 - rankPower * 10 + combo.cards.length * 3;
  if (combo.cards.length === player.hand.length) score += 100_000;
  score -= protectedStructureDamage(player.hand, cards, combo.type, urgent);
  score -= wastePenalty(combo.type, state, seat, urgent);
  // 对家不管后,己方压牌意愿提升
  if (teammatePassed(state, seat)) score += 600;
  // 对手临近出完时,压牌的战术价值上升
  if (urgent && combo.cards.length !== player.hand.length) score += 900;
  if (state.comboOwnerSeat !== null && state.players[state.comboOwnerSeat].team === player.team && combo.cards.length !== player.hand.length) score -= 800;
  return score;
}
