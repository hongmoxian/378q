import type { PlayAction } from "../engine/actions";
import type { GameState } from "../engine/GameState";
import { classifyCombo, canBeat, getComboStake, type Combo } from "../rules/combo";
import { COMBO_TIER } from "../rules/ruleConfig";
import { getRankPower } from "../rules/ranks";
import { PLAYABLE_RANKS, type PlayableRank } from "../rules/cards";
import { planHand, planLoss, type PlanEntry } from "./handPlan";
import { playerAggressiveness } from "./learnFromPlayer";

type Hand = GameState["players"][number]["hand"];

/** 敌方最少剩牌数:越小说明对手越接近跑光。 */
function opponentPressure(state: GameState, seat: number): number {
  const myTeam = state.players[seat]?.team;
  let min = 99;
  for (const player of state.players) {
    if (!player || player.team === myTeam) continue;
    min = Math.min(min, player.hand.length);
  }
  return min;
}

/** 本轮队友(对家)已 PASS 且当前牌由敌方持有:队友接不了,该自己顶上。 */
function teammatePassed(state: GameState, seat: number): boolean {
  const myTeam = state.players[seat]?.team;
  const owner = state.comboOwnerSeat !== null ? state.players[state.comboOwnerSeat] : null;
  if (!myTeam || !owner || owner.team === myTeam) return false;
  return state.pendingPasses.some((pending) => {
    const passer = state.players[pending.seat]!;
    return passer.team === myTeam && pending.seat !== seat;
  });
}

/** 推断队友是否在囤功能牌:本局只出过单/对、手牌还多、且本轮 PASS 过(管不上或留大招)。 */
function teammateHoardsBig(state: GameState, seat: number): boolean {
  const myTeam = state.players[seat]?.team;
  if (!myTeam) return false;
  const mate = state.players.find((player) => player.team === myTeam && player.seat !== seat);
  if (!mate) return false;
  const plays = state.handPlays.filter((play) => play.seat === mate.seat);
  if (!plays.length || mate.hand.length < 6) return false;
  const onlyWeak = plays.every((play) => play.type === "SINGLE" || play.type === "PAIR");
  const matePassedOnce = state.pendingPasses.some((pending) => pending.seat === mate.seat);
  return onlyWeak && matePassedOnce;
}

/** 牌型的隐藏价值(用于计算"我方功能牌 vs 敌方牌"的分差)。 */
function comboHiddenValue(combo: Combo): number {
  const power = combo.rank === undefined ? 0 : getRankPower(combo.rank);
  switch (combo.type) {
    case "Q873_SUITED": return 1100;
    case "Q873_MIXED": return 1000;
    case "HYDROGEN_BOMB": return 800 + power;
    case "BOMB_WITH_PAIR": return 350;
    case "PAIR": return 10 + power * 2;
    default: return power * 2;
  }
}

/** PASS 的阶段系数:前期(手牌多)不管便宜,后期(手牌少)不管代价大。 */
function passPhaseFactor(handSize: number): number {
  if (handSize >= 14) return 0.5;
  if (handSize <= 6) return 1.5;
  return 1.0;
}

export function actionScore(action: PlayAction, state: GameState, seat: number): number {
  const player = state.players[seat];
  if (!player) return Number.NEGATIVE_INFINITY;
  const urgent = opponentPressure(state, seat) <= 2;

  if (action.kind === "PASS") {
    if (!state.currentCombo || state.comboOwnerSeat === null) return Number.NEGATIVE_INFINITY;
    if (state.players[state.comboOwnerSeat]!.team === player.team) return 0;
    return -getComboStake(state.currentCombo) * passPhaseFactor(player.hand.length);
  }

  const cards = action.cardIds.map((id) => player.hand.find((card) => card.id === id)).filter((card) => card !== undefined);
  const combo = classifyCombo(cards);
  if (combo.type === "INVALID") return Number.NEGATIVE_INFINITY;
  const loss = planLoss(player.hand, cards);
  if (cards.length === player.hand.length) return 100_000;

  if (!state.currentCombo) {
    // 领牌:只能出单/对,优先小牌并消耗散牌;拆功能牌领牌会承受 planLoss
    const rankPower = combo.rank === undefined ? 0 : getRankPower(combo.rank);
    return 1_000 - rankPower * 20 + (combo.type === "PAIR" ? 15 : 0) - loss + (loss === 0 ? 25 : 0);
  }

  const tier = COMBO_TIER[combo.type];
  const rankPower = combo.rank === undefined ? 0 : getRankPower(combo.rank);
  let score = 1_000 - tier * 100 - rankPower * 10 + combo.cards.length * 3;

  // 拆功能牌的代价 = planLoss × 多因素系数 × 玩家风格
  const painFactor = 1.5 - playerAggressiveness();
  let mult = 1.0;
  if (loss > 0) {
    // 1. 功能牌组数:越多越容易出,越少越留
    const plan = planHand(player.hand);
    const functionalCount = plan.entries.length;
    mult *= functionalCount >= 3 ? 0.6 : functionalCount <= 1 ? 1.4 : 1.0;
    // 2. 敌人手牌数:越少越容易出
    const enemyMin = opponentPressure(state, seat);
    if (enemyMin <= 2) mult *= 0.5;
    else if (enemyMin <= 4) mult *= 0.7;
    else if (enemyMin >= 8) mult *= 1.3;
    // 3. 队友已 PASS(管不上或留大招):自己顶上
    if (teammatePassed(state, seat)) mult *= 0.75;
    // 4. 队友疑似囤功能牌(只出过单/对且牌还多):自己更要出
    if (teammateHoardsBig(state, seat)) mult *= 0.85;
    // 5. 隐藏分差:敌方牌与我方能管上的最小功能牌分差越大越不出
    const enemyHidden = comboHiddenValue(state.currentCombo!);
    const beatingFunctional = plan.entries
      .map((entry) => ({ entry, combo: classifyCombo(entry.cards) }))
      .filter((item): item is { entry: PlanEntry; combo: Combo } => item.combo.type !== "INVALID" && canBeat(item.combo, state.currentCombo!));
    const minFunctional = beatingFunctional.length ? Math.min(...beatingFunctional.map((item) => item.entry.score)) : undefined;
    if (minFunctional !== undefined) {
      const gap = minFunctional - enemyHidden;
      if (gap > 0) mult *= 1 + Math.min(0.6, gap / 600);
    }
  }

  score -= Math.round(loss * mult * painFactor);
  if (loss === 0) score += 25;
  // 拆功能牌去打防守型单/对(如抽炸弹里的对子管对子):重罚,宁可整块出
  if (loss > 0 && (combo.type === "PAIR" || combo.type === "SINGLE")) score -= 400;
  // 氢弹拆用降级(出"炸弹"却吞掉了完整氢弹):非紧急重罚
  if (combo.type === "BOMB_WITH_PAIR" && loss >= 800 && !urgent) score -= 700;
  // 敌方出单/对时,用整块炸弹接管:奖励
  if (state.currentCombo && (state.currentCombo.type === "PAIR" || state.currentCombo.type === "SINGLE") && combo.type === "BOMB_WITH_PAIR") score += 600;
  if (teammatePassed(state, seat)) score += 600;
  if (urgent) score += 900;
  if (state.comboOwnerSeat !== null && state.players[state.comboOwnerSeat].team === player.team) score -= 800;
  return score;
}

function canBeatEntry(challenger: Combo, current: Combo): boolean {
  if (challenger.type === current.type) {
    if (challenger.type === "Q873_MIXED" || challenger.type === "Q873_SUITED") return false;
    return challenger.rank !== undefined && current.rank !== undefined && getRankPower(challenger.rank) > getRankPower(current.rank);
  }
  return COMBO_TIER[challenger.type] > COMBO_TIER[current.type];
}
