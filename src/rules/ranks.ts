import type { PlayableRank } from "./cards";
export const RANK_POWER: Record<PlayableRank,number> = {Q:10,"8":9,"7":8,"3":7,"2":6,A:5,J:4,"9":3,"6":2,"4":1};
export function getRankPower(rank: PlayableRank): number { return RANK_POWER[rank]; }
