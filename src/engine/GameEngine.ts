import { buildFullDeck, buildPlayableDeck, shuffle } from "../rules/deck";
import { cardLabel, type Card, type PlayableRank, type Team } from "../rules/cards";
import { classifyCombo, canBeat, canLead, getComboStake, type Combo } from "../rules/combo";
import { scoreCards, transferScore } from "../rules/scoring";
import type { GameState, PlayerState } from "./GameState";
import { assertState } from "./invariants";
import type { PlayAction } from "./actions";

const PLAYABLE_RANKS: readonly PlayableRank[] = ["Q", "8", "7", "3", "2", "A", "J", "9", "6", "4"];

function possibleCombos(hand: Card[]): Card[][] {
  const groups = new Map<PlayableRank, Card[]>();
  for (const card of hand) {
    if (card.category !== "PLAYABLE") continue;
    const rank = card.rank as PlayableRank;
    groups.set(rank, [...(groups.get(rank) ?? []), card]);
  }
  const result: Card[][] = hand.map((card) => [card]);
  for (const rank of PLAYABLE_RANKS) {
    const cards = groups.get(rank) ?? [];
    if (cards.length >= 2) result.push(cards.slice(0, 2));
    for (const size of [4, 5, 6, 7, 8]) if (cards.length >= size) result.push(cards.slice(0, size));
  }
  for (const bodyRank of PLAYABLE_RANKS) {
    const body = groups.get(bodyRank) ?? [];
    if (body.length < 3) continue;
    for (const pairRank of PLAYABLE_RANKS) {
      if (pairRank === bodyRank) continue;
      const pair = groups.get(pairRank) ?? [];
      if (pair.length >= 2) result.push([...body.slice(0, 3), ...pair.slice(0, 2)]);
    }
  }
  const q873 = (["Q", "8", "7", "3"] as const).map((rank) => groups.get(rank) ?? []);
  if (q873.every((cards) => cards.length > 0)) {
    for (const q of q873[0]) for (const eight of q873[1]) for (const seven of q873[2]) for (const three of q873[3]) result.push([q, eight, seven, three]);
  }
  return result;
}

export class GameEngine {
  private state: GameState;
  private rng: () => number;

  constructor(rng: () => number = Math.random) {
    this.rng = rng;
    this.state = this.empty();
  }

  private empty(): GameState {
    return {
      phase: "INITIAL_DEAL",
      handNumber: 0,
      players: [0, 1, 2, 3].map((seat) => ({ seat: seat as 0 | 1 | 2 | 3, team: seat % 2 === 0 ? "RED" : "BLUE", controller: seat === 0 ? "HUMAN" : "AI", hand: [], scoreCardsWon: [] })),
      teamScores: { RED: 0, BLUE: 0 },
      handStartScores: { RED: 0, BLUE: 0 },
      dealerSeat: 0,
      currentTurn: 0,
      currentCombo: null,
      comboOwnerSeat: null,
      lastSuccessfulSeat: null,
      consecutivePasses: 0,
      pendingPasses: [],
      handPlays: [],
      luckCardUses: 3,
      winnerTeam: null,
      handWinnerSeat: null,
      logs: [],
    };
  }

  getState(): GameState { return this.state; }

  startNewMatch(): void {
    this.state = this.empty();
    const deck = shuffle(buildFullDeck(), this.rng);
    let dealer: number | null = null;
    deck.forEach((card, index) => {
      const player = this.state.players[index % 4];
      if (card.category === "SCORE") player.scoreCardsWon.push(card);
      else player.hand.push(card);
      if (dealer === null && card.rank === "3" && card.suit === "SPADE") dealer = player.seat;
    });
    this.state.teamScores = {
      RED: scoreCards(this.state.players[0].scoreCardsWon.concat(this.state.players[2].scoreCardsWon)),
      BLUE: scoreCards(this.state.players[1].scoreCardsWon.concat(this.state.players[3].scoreCardsWon)),
    };
    this.state.handStartScores = { RED: this.state.teamScores.RED, BLUE: this.state.teamScores.BLUE };
    this.state.dealerSeat = dealer ?? 0;
    this.state.currentTurn = this.state.dealerSeat;
    this.state.handNumber = 1;
    this.state.phase = "PLAYING";
    this.state.logs.push(`第一局发牌完成，庄家 P${this.state.dealerSeat}`);
    assertState(this.state);
  }

  startNextHand(): void {
    if (this.state.phase !== "HAND_FINISHED") throw new Error("current hand is not finished");
    const deck = shuffle(buildPlayableDeck(), this.rng);
    this.state.players.forEach((player) => { player.hand = []; player.scoreCardsWon = []; });
    deck.forEach((card, index) => this.state.players[index % 4].hand.push(card));
    this.state.handNumber += 1;
    this.state.dealerSeat = (this.state.dealerSeat + 1) % 4;
    this.state.currentTurn = this.state.dealerSeat;
    this.state.currentCombo = null;
    this.state.comboOwnerSeat = null;
    this.state.lastSuccessfulSeat = null;
    this.state.consecutivePasses = 0;
    this.state.pendingPasses = [];
    this.state.handPlays = [];
    this.state.luckCardUses = 3;
    this.state.handWinnerSeat = null;
    this.state.phase = "PLAYING";
    this.state.handStartScores = { RED: this.state.teamScores.RED, BLUE: this.state.teamScores.BLUE };
    assertState(this.state);
  }

  /**
   * 手气卡:仅玩家(非 AI)可用,每小局 3 次,首局不可用。
   * 把全桌手牌收回重新洗牌,按各人原手牌数重发(庄家、回合、得分不变)。
   * 仅限本小局还没人出牌/过牌时使用。
   */
  useLuckCard(seat: number): void {
    if (this.state.phase !== "PLAYING") throw new Error("当前阶段不能使用手气卡");
    if (this.state.players[seat]?.controller !== "HUMAN") throw new Error("手气卡仅玩家可用");
    if (this.state.handNumber <= 1) throw new Error("首局不能使用手气卡");
    if (this.state.luckCardUses <= 0) throw new Error("手气卡已用完");
    if (this.state.currentCombo !== null || this.state.comboOwnerSeat !== null || this.state.consecutivePasses !== 0) {
      throw new Error("本局开始出牌后不能使用手气卡");
    }
    const all = this.state.players.flatMap((player) => player.hand);
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [all[i], all[j]] = [all[j]!, all[i]!];
    }
    let offset = 0;
    this.state.players.forEach((player) => {
      player.hand = all.slice(offset, offset + player.hand.length);
      offset += player.hand.length;
    });
    this.state.luckCardUses -= 1;
    this.state.logs.push(`P${seat} 使用手气卡(剩 ${this.state.luckCardUses} 次)`);
  }

  private requireTurn(seat: number): PlayerState {
    if (this.state.phase !== "PLAYING") throw new Error("game is not playing");
    if (seat !== this.state.currentTurn) throw new Error("not this player's turn");
    const player = this.state.players[seat];
    if (!player) throw new Error("invalid seat");
    return player;
  }

  playCards(seat: number, cardIds: string[]): void {
    const player = this.requireTurn(seat);
    const cards = cardIds.map((id) => player.hand.find((card) => card.id === id));
    if (cards.some((card) => card === undefined) || new Set(cardIds).size !== cardIds.length) throw new Error("card not in hand");
    const selected = cards as Card[];
    const result = classifyCombo(selected);
    if (result.type === "INVALID") throw new Error("invalid combo");
    if (!this.state.currentCombo) {
      if (!canLead(result)) throw new Error("special combos cannot lead");
    } else if (!canBeat(result, this.state.currentCombo)) {
      throw new Error("combo cannot beat current");
    }
    player.hand = player.hand.filter((card) => !cardIds.includes(card.id));
    this.state.currentCombo = result;
    this.state.comboOwnerSeat = seat;
    this.state.lastSuccessfulSeat = seat;
    this.state.consecutivePasses = 0;
    this.state.pendingPasses = [];
    this.state.handPlays.push({ seat: seat as 0 | 1 | 2 | 3, type: result.type, stake: getComboStake(result) });
    this.state.logs.push(`P${seat} 出 ${result.type}:${result.cards.map(cardLabel).join(" ")}`);
    if (player.hand.length === 0) {
      this.state.phase = "HAND_FINISHED";
      this.state.handWinnerSeat = seat;
      this.state.logs.push(`P${seat} 出完牌`);
      return;
    }
    this.state.currentTurn = (seat + 1) % 4;
    assertState(this.state);
  }

  /**
   * 不管:不再即时扣分,只记录;结算时机:
   * - 本轮内有人接管出牌 → 之前的不管全部免扣;
   * - 连续三次不管(轮次结束,无人接管)→ 每支队伍只扣一次(不叠加)。
   */
  pass(seat: number): void {
    const player = this.requireTurn(seat);
    if (!this.state.currentCombo || this.state.comboOwnerSeat === null) throw new Error("cannot pass while leading");
    const owner = this.state.players[this.state.comboOwnerSeat]!;
    if (player.team === owner.team) {
      this.state.logs.push(`P${seat} 不管（队友，不扣分）`);
    } else {
      this.state.pendingPasses.push({ seat: seat as 0 | 1 | 2 | 3, stake: getComboStake(this.state.currentCombo) });
      this.state.logs.push(`P${seat} 不管`);
    }
    this.state.consecutivePasses += 1;
    if (this.state.consecutivePasses >= 3) {
      this.settlePendingPasses();
      if (this.state.phase === "MATCH_FINISHED") return;
      this.state.currentTurn = this.state.comboOwnerSeat;
      this.state.currentCombo = null;
      this.state.comboOwnerSeat = null;
      this.state.consecutivePasses = 0;
    } else {
      this.state.currentTurn = (seat + 1) % 4;
    }
    assertState(this.state);
  }

  /** 轮次结束结算:按队伍去重,每队只扣一次本轮记录的最高 stake。 */
  private settlePendingPasses(): void {
    const ownerSeat = this.state.comboOwnerSeat;
    this.state.pendingPasses = this.state.pendingPasses.filter((pending) => {
      const passer = this.state.players[pending.seat]!;
      const owner = ownerSeat !== null ? this.state.players[ownerSeat] : null;
      return owner !== null && passer.team !== owner.team;
    });
    if (!this.state.pendingPasses.length) return;
    const owed = new Map<Team, number>();
    for (const pending of this.state.pendingPasses) {
      const team = this.state.players[pending.seat]!.team;
      owed.set(team, Math.max(owed.get(team) ?? 0, pending.stake));
    }
    for (const [team, amount] of owed) {
      this.state.teamScores = transferScore(this.state.teamScores, team, amount);
      this.state.logs.push(`${team} 连续不管，-${amount}`);
    }
    this.state.pendingPasses = [];
    if (this.state.teamScores.RED < -200 || this.state.teamScores.BLUE < -200) {
      this.state.phase = "MATCH_FINISHED";
      this.state.winnerTeam = this.state.teamScores.RED < -200 ? "BLUE" : "RED";
    }
  }

  isMatchFinished(): boolean { return this.state.phase === "MATCH_FINISHED"; }
  isHandFinished(): boolean { return this.state.phase === "HAND_FINISHED"; }

  getLegalLeadActions(seat: number): PlayAction[] {
    const player = this.state.players[seat];
    if (!player || this.state.currentTurn !== seat || this.state.currentCombo) return [];
    const actions: PlayAction[] = [];
    for (const card of player.hand) actions.push({ kind: "PLAY", cardIds: [card.id] });
    for (const rank of PLAYABLE_RANKS) {
      const cards = player.hand.filter((card) => card.rank === rank);
      if (cards.length >= 2) actions.push({ kind: "PLAY", cardIds: cards.slice(0, 2).map((card) => card.id) });
    }
    return actions;
  }

  getLegalResponseActions(seat: number): PlayAction[] {
    const player = this.state.players[seat];
    if (!player || this.state.currentTurn !== seat || !this.state.currentCombo) return [];
    const actions: PlayAction[] = [];
    for (const cards of possibleCombos(player.hand)) {
      const combo = classifyCombo(cards);
      if (combo.type !== "INVALID" && canBeat(combo, this.state.currentCombo)) actions.push({ kind: "PLAY", cardIds: cards.map((card) => card.id) });
    }
    actions.push({ kind: "PASS", cardIds: [] });
    return actions;
  }
}
