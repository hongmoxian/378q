import type { GameState } from "./GameState";
export function assertState(state: GameState): void {
  if (state.teamScores.RED + state.teamScores.BLUE !== 500) throw new Error("team scores must total 500");
  if (state.currentTurn < 0 || state.currentTurn > 3) throw new Error("invalid turn");
}
