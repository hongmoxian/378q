import type { Card, PlayableRank } from "./cards";
import { getRankPower } from "./ranks";
import { COMBO_STAKE, COMBO_TIER } from "./ruleConfig";
export type ComboType = keyof typeof COMBO_TIER;
export interface Combo { type:ComboType; cards:Card[]; rank?:PlayableRank; }
export interface InvalidCombo { type:"INVALID"; cards:Card[]; }
export type ClassifiedCombo = Combo | InvalidCombo;
const invalid=(cards:Card[]):InvalidCombo=>({type:"INVALID",cards});
export function classifyCombo(cards:Card[]): ClassifiedCombo {
 if(!cards.length || cards.some(c=>c.category!=="PLAYABLE")) return invalid(cards);
 const ranks=cards.map(c=>c.rank as PlayableRank); const counts=new Map<PlayableRank,number>(); ranks.forEach(r=>counts.set(r,(counts.get(r)??0)+1));
 if(cards.length===1) return {type:"SINGLE",cards,rank:ranks[0]};
 if(cards.length===2 && counts.size===1) return {type:"PAIR",cards,rank:ranks[0]};
 if(cards.length>=4 && cards.length<=8 && counts.size===1) return {type:"HYDROGEN_BOMB",cards,rank:ranks[0]};
 if(cards.length===4 && ["Q","8","7","3"].every(r=>counts.has(r as PlayableRank))){const suits=new Set(cards.map(c=>c.suit)); return {type:suits.size===1?"Q873_SUITED":"Q873_MIXED",cards};}
 if(cards.length===5 && counts.size===2 && [...counts.values()].sort((a,b)=>b-a).join(",")==="3,2"){const rank=[...counts.entries()].find(([,n])=>n===3)?.[0]; return {type:"BOMB_WITH_PAIR",cards,rank};}
 return invalid(cards);
}
export function canLead(combo:ClassifiedCombo): combo is Combo { return combo.type==="SINGLE" || combo.type==="PAIR"; }
export function canBeat(challenger:Combo,current:Combo):boolean { if(challenger.type===current.type){ if(challenger.type==="Q873_MIXED"||challenger.type==="Q873_SUITED") return false; return challenger.rank!==undefined&&current.rank!==undefined&&getRankPower(challenger.rank)>getRankPower(current.rank); } return COMBO_TIER[challenger.type]>COMBO_TIER[current.type]; }
export function getComboStake(combo:Combo):number { return COMBO_STAKE[combo.type]; }
