import { PLAYABLE_RANKS, SCORE_RANKS, type Card, type Rank, type Suit } from "./cards";
const SUITS: Suit[] = ["SPADE","HEART","CLUB","DIAMOND"];
export function buildFullDeck(): Card[] { const cards:Card[]=[]; for (const deck of [0,1] as const) { for (const rank of [...PLAYABLE_RANKS,...SCORE_RANKS] as Rank[]) { const suits = rank === "SMALL_JOKER" || rank === "BIG_JOKER" ? [null] : rank === "5" || rank === "10" || rank === "K" ? SUITS : SUITS; for (const suit of suits) cards.push({id:`d${deck}-${rank}-${suit ?? "JOKER"}`,deck,rank,suit,category:(PLAYABLE_RANKS as readonly string[]).includes(rank)?"PLAYABLE":"SCORE"}); } } return cards; }
export function buildPlayableDeck(): Card[] { return buildFullDeck().filter(card => card.category === "PLAYABLE"); }
export function shuffle<T>(items:T[], rng:()=>number=Math.random): T[] { const result=items.slice(); for(let i=result.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[result[i],result[j]]=[result[j],result[i]];} return result; }
export function createSeededRng(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value * 1_664_525 + 1_013_904_223) >>> 0;
    return value / 4_294_967_296;
  };
}
