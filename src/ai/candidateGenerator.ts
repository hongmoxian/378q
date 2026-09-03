import type { GameEngine } from "../engine/GameEngine";
import type { PlayAction } from "../engine/actions";
import { classifyCombo, canBeat } from "../rules/combo";
import type { Card, PlayableRank } from "../rules/cards";

const PLAYABLE_RANKS: readonly PlayableRank[] = ["Q", "8", "7", "3", "2", "A", "J", "9", "6", "4"];

function addAction(actions: PlayAction[], cards: Card[]): void {
  const combo = classifyCombo(cards);
  if (combo.type !== "INVALID") actions.push({ kind: "PLAY", cardIds: cards.map((card) => card.id) });
}

function allLegalCombos(hand: Card[]): PlayAction[] {
  const result: PlayAction[] = [];
  for (const card of hand) {
    const combo = classifyCombo([card]);
    if (combo.type !== "INVALID") result.push({ kind: "PLAY", cardIds: [card.id] });
  }
  for (const rank of PLAYABLE_RANKS) {
    const sameRank = hand.filter((card) => card.rank === rank);
    if (sameRank.length >= 2) addAction(result, sameRank.slice(0, 2));
  }
  for (const size of [4, 5, 6, 7, 8]) {
    for (const rank of PLAYABLE_RANKS) {
      const sameRank = hand.filter((card) => card.rank === rank);
      if (sameRank.length >= size) addAction(result, sameRank.slice(0, size));
    }
  }
  const byRank = new Map<PlayableRank, Card[]>();
  for (const card of hand) {
    const rank = card.rank as PlayableRank;
    const group = byRank.get(rank) ?? [];
    group.push(card);
    byRank.set(rank, group);
  }
  for (const bodyRank of PLAYABLE_RANKS) {
    const body = byRank.get(bodyRank) ?? [];
    if (body.length < 3) continue;
    for (const pairRank of PLAYABLE_RANKS) {
      if (pairRank === bodyRank) continue;
      const pair = byRank.get(pairRank) ?? [];
      if (pair.length >= 2) addAction(result, [...body.slice(0, 3), ...pair.slice(0, 2)]);
    }
  }
  const q873: Card[][] = [];
  let hasAllQ873 = true;
  for (const rank of ["Q", "8", "7", "3"] as const) {
    const cards = byRank.get(rank) ?? [];
    if (!cards.length) { hasAllQ873 = false; break; }
    q873.push(cards);
  }
  if (hasAllQ873) {
    for (const candidate of q873[0].flatMap((q) => q873[1].flatMap((eight) => q873[2].flatMap((seven) => q873[3].map((three) => [q, eight, seven, three]))))) {
      addAction(result, candidate);
    }
  }
  return result;
}

export function getCandidates(engine: GameEngine, seat: number): PlayAction[] {
  const state = engine.getState();
  if (!state.currentCombo) return engine.getLegalLeadActions(seat);
  const player = state.players[seat];
  if (!player || state.currentTurn !== seat) return [];
  const actions = allLegalCombos(player.hand).filter((action) => {
    const cards = action.cardIds.map((id) => player.hand.find((card) => card.id === id)).filter((card): card is Card => card !== undefined);
    const combo = classifyCombo(cards);
    return combo.type !== "INVALID" && canBeat(combo, state.currentCombo!);
  });
  actions.push({ kind: "PASS", cardIds: [] });
  return actions;
}
