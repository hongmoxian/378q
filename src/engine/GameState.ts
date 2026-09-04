import type { Card, Controller, Team } from "../rules/cards";
import type { Combo } from "../rules/combo";
export type Phase="INITIAL_DEAL"|"PLAYING"|"HAND_FINISHED"|"MATCH_FINISHED";
export interface PlayerState { seat:0|1|2|3; team:Team; controller:Controller; hand:Card[]; scoreCardsWon:Card[]; }
export interface PendingPass { seat:0|1|2|3; stake:number; }
export interface HandPlay { seat:0|1|2|3; type:Combo["type"]; stake:number; }
export interface GameState { phase:Phase; handNumber:number; players:PlayerState[]; teamScores:{RED:number;BLUE:number}; handStartScores:{RED:number;BLUE:number}; dealerSeat:number; currentTurn:number; currentCombo:Combo|null; comboOwnerSeat:number|null; lastSuccessfulSeat:number|null; consecutivePasses:number; pendingPasses:PendingPass[]; handPlays:HandPlay[]; luckCardUses:number; winnerTeam:Team|null; handWinnerSeat:number|null; logs:string[]; }
