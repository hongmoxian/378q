import type { Card, PlayableRank } from "../rules/cards";
import { getRankPower } from "../rules/ranks";

/**
 * 手牌规划器:把一手牌分解成"功能牌(顺378Q/氢弹/炸弹带队)+ 剩余散牌(对/单)"。
 * AI 出牌决策以规划为基准——出牌损失的功能牌隐藏分就是它的"保留价值"。
 *
 * 隐藏分表(决策级,数字越大越舍不得出):
 *   顺378Q 1100 > Q氢 850 > 8氢 840 > 7氢 830 > 3氢 820 > 炸弹(三带二) 350
 * 剩余散牌不计分,但对子每对 +2(微弱偏好,让规划倾向少拆对子)。
 */

const Q873_RANKS: readonly PlayableRank[] = ["Q", "8", "7", "3"];
const BOMB_SCORE = 350;
const Q873_SCORE = 1000;
const SUITED_Q873_SCORE = 1100;
const PAIR_BONUS = 2;

function hydrogenScore(rank: PlayableRank): number {
  return 800 + getRankPower(rank);
}

export type PlanKind = "Q873_MIXED" | "Q873_SUITED" | "HYDROGEN" | "BOMB";

export interface PlanEntry {
  kind: PlanKind;
  score: number;
  cards: Card[];
}

export interface HandPlan {
  entries: PlanEntry[];
  usedIds: Set<string>;
  total: number;
}

const memo = new Map<string, HandPlan>();

function groupByRank(hand: Card[]): Map<string, Card[]> {
  const groups = new Map<string, Card[]>();
  for (const card of hand) {
    if (card.category !== "PLAYABLE") continue;
    const list = groups.get(card.rank) ?? [];
    list.push(card);
    groups.set(card.rank, list);
  }
  return groups;
}

/** 生成一枚"氢弹数量分配方案"下的分解结果(内部用)。 */
function evaluatePlan(groups: Map<string, Card[]>, hydro: Map<string, number>, useQ873: boolean): HandPlan {
  const remaining = new Map<string, Card[]>();
  for (const [rank, cards] of groups) remaining.set(rank, [...cards]);
  const entries: PlanEntry[] = [];
  const usedIds = new Set<string>();

  const consume = (rank: string, count: number): Card[] => {
    const list = remaining.get(rank) ?? [];
    if (list.length < count) return [];
    const taken = list.slice(0, count);
    remaining.set(rank, list.slice(count));
    taken.forEach((card) => usedIds.add(card.id));
    return taken;
  };

  if (useQ873) {
    const parts = Q873_RANKS.map((rank) => consume(rank, 1));
    if (parts.every((cards) => cards.length === 1)) {
      const cards = parts.flat();
      const sameSuit = new Set(cards.map((card) => card.suit)).size === 1;
      entries.push({ kind: sameSuit ? "Q873_SUITED" : "Q873_MIXED", score: sameSuit ? SUITED_Q873_SCORE : Q873_SCORE, cards });
    } else {
      // 扣牌失败(理论不会发生,调用方已保证),回滚
      for (const cards of parts) cards.forEach((card) => (remaining.get(card.rank) ?? []).push(card));
      usedIds.clear();
    }
  }

  for (const [rank, count] of hydro) {
    for (let i = 0; i < count; i++) {
      const cards = consume(rank, 4);
      if (cards.length === 4) entries.push({ kind: "HYDROGEN", score: hydrogenScore(rank as PlayableRank), cards });
    }
  }

  // 炸弹:剩余某点数 >=3 张(三张)+ 另一点数 >=2 张(带队)——贪心配对
  let guard = 0;
  while (guard++ < 4) {
    const bodyRank = [...remaining.entries()].filter(([, cards]) => cards.length >= 3).sort((a, b) => getRankPower(a[0] as PlayableRank) - getRankPower(b[0] as PlayableRank))[0];
    if (!bodyRank) break;
    const pairRank = [...remaining.entries()].filter(([rank, cards]) => rank !== bodyRank[0] && cards.length >= 2).sort((a, b) => getRankPower(a[0] as PlayableRank) - getRankPower(b[0] as PlayableRank))[0];
    if (!pairRank) break;
    const body = consume(bodyRank[0], 3);
    const pair = consume(pairRank[0], 2);
    entries.push({ kind: "BOMB", score: BOMB_SCORE, cards: [...body, ...pair] });
  }

  // 剩余对子微弱加成(让规划倾向少拆对子)
  const pairBonus = [...remaining.values()].filter((cards) => cards.length >= 2).length * PAIR_BONUS;
  const total = entries.reduce((sum, entry) => sum + entry.score, 0) + pairBonus;
  return { entries, usedIds, total };
}

/** 计算一手牌的最优功能牌分解(带 memo,同手牌只算一次)。 */
export function planHand(hand: Card[]): HandPlan {
  const key = hand.map((card) => card.id).sort().join("|");
  const cached = memo.get(key);
  if (cached) return cached;

  const groups = groupByRank(hand);
  const hydroRanks = [...groups.entries()].filter(([, cards]) => cards.length >= 4).map(([rank]) => rank);
  const canQ873 = Q873_RANKS.every((rank) => (groups.get(rank)?.length ?? 0) >= 1);

  let best: HandPlan = { entries: [], usedIds: new Set(), total: 0 };
  // 剩余对子基线
  best.total = [...groups.values()].filter((cards) => cards.length >= 2).length * PAIR_BONUS;

  // 每个点数的氢弹数量:0..floor(n/4),混合进制枚举
  const options = hydroRanks.map((rank) => ({ rank, max: Math.floor(groups.get(rank)!.length / 4) }));
  const comboCount = options.reduce((product, option) => product * (option.max + 1), 1);
  const q873Variants = canQ873 ? [false, true] : [false];

  for (let combo = 0; combo < comboCount; combo++) {
    const hydro = new Map<string, number>();
    let rest = combo;
    for (const option of options) {
      hydro.set(option.rank, rest % (option.max + 1));
      rest = Math.floor(rest / (option.max + 1));
    }
    for (const useQ873 of q873Variants) {
      const plan = evaluatePlan(groups, hydro, useQ873);
      if (plan.total > best.total) best = plan;
    }
  }

  if (memo.size > 4000) memo.clear();
  memo.set(key, best);
  return best;
}

/** 规划总价值(功能牌隐藏分 + 对子加成)。 */
export function planValue(hand: Card[]): number {
  return planHand(hand).total;
}

/** 出掉 played 后损失了多少规划价值(= 被拆掉/消耗掉的功能牌隐藏分)。 */
export function planLoss(hand: Card[], played: Card[]): number {
  if (!played.length) return 0;
  const playedIds = new Set(played.map((card) => card.id));
  const before = planValue(hand);
  const after = planValue(hand.filter((card) => !playedIds.has(card.id)));
  return Math.max(0, before - after);
}
