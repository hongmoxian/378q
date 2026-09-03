import type { Card, Team } from "./cards";
const SCORE_VALUES: Partial<Record<Card["rank"], number>> = {
  "5": 5,
  "10": 10,
  K: 10,
  SMALL_JOKER: 50,
  BIG_JOKER: 100,
};

export const scoreOf = (card: Card): number => SCORE_VALUES[card.rank] ?? 0;
export function scoreCards(cards:Card[]):number{return cards.reduce((sum,card)=>sum+scoreOf(card),0);}
export function transferScore(scores: Record<Team, number>, from: Team, amount: number): Record<Team, number> {
  const to = from === "RED" ? "BLUE" : "RED";
  return { ...scores, [from]: scores[from] - amount, [to]: scores[to] + amount };
}
