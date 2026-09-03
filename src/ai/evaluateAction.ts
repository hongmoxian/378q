import type { PlayAction } from "../engine/actions";
import type { GameState } from "../engine/GameState";
import { classifyCombo, getComboStake } from "../rules/combo";
import { COMBO_TIER } from "../rules/ruleConfig";
import { getRankPower } from "../rules/ranks";
import { planLoss } from "./handPlan";
import { playerAggressiveness } from "./learnFromPlayer";

type Hand = GameState["players"][number]["hand"];

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
 * 核心决策:以"手牌规划"为基准评分。
 * - planLoss(出掉的牌损失的功能牌隐藏分)是唯一的拆牌代价:
 *   顺378Q=1100 > Q氢 850 > 8氢 840 > 7氢 830 > 3氢 820 > 炸弹 350,
 *   分数越高的功能牌越舍不得出——阈值逻辑自然涌现;
 * - 散牌(不在规划里的单/对)出掉零损失,反而 +25 消耗奖励;
 * - 玩家风格学习:激进指数越高,拆功能牌的痛感越轻(AI 敢打);
 * - 紧急时刻(敌方剩牌 <= 2)压牌 +900,救命优先;
 * - 对家已不管时己方压牌 +600;不压队友的牌(-800)。
 */
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
  const loss = planLoss(player.hand, cards);
  const spent = cards.length === player.hand.length;
  if (spent) return 100_000;

  if (!state.currentCombo) {
    // 领牌:只能出单/对,优先小牌并消耗散牌;拆功能牌领牌会承受 planLoss
    const rankPower = combo.rank === undefined ? 0 : getRankPower(combo.rank);
    return 1_000 - rankPower * 20 + (combo.type === "PAIR" ? 15 : 0) - loss + (loss === 0 ? 25 : 0);
  }

  const tier = COMBO_TIER[combo.type];
  const rankPower = combo.rank === undefined ? 0 : getRankPower(combo.rank);
  // 玩家激进指数 0~1 → 拆牌痛感 ×(1.5 - 指数):激进 0.9 时痛感 ×0.6,保守 0.1 时 ×1.4
  const painFactor = 1.5 - playerAggressiveness();
  let score = 1_000 - tier * 100 - rankPower * 10 + combo.cards.length * 3;
  score -= Math.round(loss * painFactor);
  if (loss === 0) score += 25;
  if (teammatePassed(state, seat)) score += 600;
  if (urgent) score += 900;
  if (state.comboOwnerSeat !== null && state.players[state.comboOwnerSeat].team === player.team) score -= 800;
  return score;
}
