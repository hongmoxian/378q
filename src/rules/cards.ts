export const PLAYABLE_RANKS = ["Q","8","7","3","2","A","J","9","6","4"] as const;
export const SCORE_RANKS = ["5","10","K","SMALL_JOKER","BIG_JOKER"] as const;
export type PlayableRank = typeof PLAYABLE_RANKS[number];
export type ScoreRank = typeof SCORE_RANKS[number];
export type Rank = PlayableRank | ScoreRank;
export type Suit = "SPADE" | "HEART" | "CLUB" | "DIAMOND";
export type Team = "RED" | "BLUE";
export type Controller = "HUMAN" | "AI";
export interface Card { id:string; deck:0|1; rank:Rank; suit:Suit|null; category:"PLAYABLE"|"SCORE"; }
export function cardLabel(card: Card): string { const suits: Record<Suit,string>={SPADE:"♠",HEART:"♥",CLUB:"♣",DIAMOND:"♦"}; return `${card.suit ? suits[card.suit] : ""}${card.rank === "SMALL_JOKER" ? "小王" : card.rank === "BIG_JOKER" ? "大王" : card.rank}`; }
