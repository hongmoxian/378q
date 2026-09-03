import { GameEngine } from "../engine/GameEngine";
import { playAI } from "../ai/GreedyAI";
import { createSeededRng } from "../rules/deck";

export function simulateGame(maxActions = 10_000, seed?: number): { winner: "RED" | "BLUE" | null; actions: number } {
  const engine = new GameEngine(seed === undefined ? Math.random : createSeededRng(seed));
  engine.startNewMatch();
  let actions = 0;
  while (!engine.isMatchFinished() && actions < maxActions) {
    if (engine.isHandFinished()) {
      engine.startNextHand();
      continue;
    }
    playAI(engine, engine.getState().currentTurn);
    actions += 1;
  }
  return { winner: engine.getState().winnerTeam, actions };
}
