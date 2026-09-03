import { useEffect, useMemo, useRef, useState } from "react";
import { GameEngine } from "../engine/GameEngine";
import { playAI, hintCardIds } from "../ai/GreedyAI";
import type { Card, PlayableRank } from "../rules/cards";
import { classifyCombo } from "../rules/combo";
import { speakCombo, speakPass, speakBeatOrCombo, speakLowCards, isMuted, setMuted } from "../voice";
import { randomProfiles, type PlayerProfile } from "./profiles";
import { recordPlayerBeat, recordPlayerBigPlay } from "../ai/learnFromPlayer";
import { getComboStake } from "../rules/combo";

const engine = new GameEngine();
const PRIORITY_RANKS: readonly PlayableRank[] = ["3", "7", "8", "Q"];
const RANK_ORDER: readonly PlayableRank[] = ["Q", "8", "7", "3", "2", "A", "J", "9", "6", "4"];
const SUIT_CID: Record<Exclude<Card["suit"], null>, string> = { SPADE: "s", HEART: "h", DIAMOND: "d", CLUB: "c" };
engine.startNewMatch();

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "card-t": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & { cid?: string; opacity?: string }, HTMLElement>;
    }
  }
}

/** 映射到 card-t 的 cid 记法(牌点+花色小写,如 Qs/3h);大小王无 SVG,返回 null 走文字渲染 */
function cidOf(card: Card): string | null {
  return card.suit ? `${card.rank}${SUIT_CID[card.suit]}` : null;
}

/** 真实扑克牌面(开源 card-t Web Component,公有领域 Unlicense 授权) */
function CardFace({ card }: { card: Card }) {
  const cid = cidOf(card);
  if (cid) return <card-t className="card-face" cid={cid} opacity="1" />;
  return <span className={`card-face-joker ${card.rank === "BIG_JOKER" ? "red-suit" : ""}`}>{card.rank === "BIG_JOKER" ? "大王" : "小王"}</span>;
}

/** 横排手牌展示行:名字 + 一整行牌(可换行),用于查看队友牌与结算亮牌 */
function CardRow({ profile, controller, team, cards, highlight }: { profile: PlayerProfile; controller: string; team: string; cards: Card[]; highlight?: boolean }) {
  return (
    <div className={`card-row ${highlight ? "row-active" : ""}`}>
      <div className="card-row-title">
        <b>{profile.name}{controller === "HUMAN" ? "(你)" : ""}</b>
        <span>{team === "RED" ? "红队" : "蓝队"} · {cards.length} 张</span>
      </div>
      <div className="card-row-cards">{cards.map((card) => <span className="mini-card" key={card.id}><CardFace card={card} /></span>)}</div>
    </div>
  );
}

type FxKind = "bomb" | "hydrogen" | "q873" | "suited";
const FX_TEXT: Record<FxKind, string> = { bomb: "炸弹!", hydrogen: "氢弹!!", q873: "378 夺!", suited: "顺 378 夺!" };
const FX_RINGS: Record<FxKind, number> = { bomb: 1, hydrogen: 3, q873: 2, suited: 3 };

function fxOf(combo: Card[] | undefined): FxKind | null {
  if (!combo) return null;
  const type = classifyCombo(combo).type;
  if (type === "BOMB_WITH_PAIR") return "bomb";
  if (type === "HYDROGEN_BOMB") return "hydrogen";
  if (type === "Q873_MIXED") return "q873";
  if (type === "Q873_SUITED") return "suited";
  return null;
}



export default function GameTable() {
  const [, refresh] = useState(0);
  const state = engine.getState();
  const [selected, setSelected] = useState<string[]>([]);
  const [aiThinking, setAiThinking] = useState(false);
  const [fx, setFx] = useState<{ kind: FxKind; ts: number } | null>(null);
  const [shake, setShake] = useState(false);
  const [muted, setMutedState] = useState(isMuted());
  const [countdown, setCountdown] = useState<number | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [peek, setPeek] = useState(false);
  const [profiles, setProfiles] = useState<PlayerProfile[]>(() => randomProfiles());
  const human = state.players[0];
  const lastComboKey = useRef("");
  const countdownStartedHand = useRef(-1);

  useEffect(() => {
    if (state.phase === "PLAYING" && state.currentTurn !== 0 && countdown === null) {
      setAiThinking(true);
      const timer = setTimeout(() => {
        playAI(engine, state.currentTurn);
        setAiThinking(false);
        refresh((value) => value + 1);
      }, 2000);
      return () => { clearTimeout(timer); setAiThinking(false); };
    }
    return undefined;
  }, [state.phase, state.currentTurn, state.currentCombo, state.handNumber, countdown]);

  // 每小局开始:3 秒准备倒计时(以 handNumber 变化为准,新一轮接牌不会误触发)
  useEffect(() => {
    if (state.phase !== "PLAYING" || state.currentCombo !== null || state.comboOwnerSeat !== null || state.consecutivePasses !== 0) return;
    if (countdownStartedHand.current === state.handNumber) return;
    countdownStartedHand.current = state.handNumber;
    setCountdown(3);
  }, [state.phase, state.handNumber, state.currentCombo, state.comboOwnerSeat, state.consecutivePasses]);

  // 倒计时走秒:3 → 2 → 1 → GO(短暂) → 结束后庄家开始出牌
  useEffect(() => {
    if (countdown === null) return undefined;
    if (countdown <= 0) {
      const timer = setTimeout(() => setCountdown(null), 700);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(() => setCountdown((value) => (value === null ? null : value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  // 每小局结束:亮牌 3 秒(展示所有未出完玩家的手牌),期间"下一小局"不可点
  useEffect(() => {
    if (state.phase === "HAND_FINISHED" || state.phase === "MATCH_FINISHED") {
      setRevealing(true);
      const timer = setTimeout(() => setRevealing(false), 3000);
      return () => { clearTimeout(timer); setRevealing(false); };
    }
    setRevealing(false);
    return undefined;
  }, [state.phase, state.handNumber]);

  // 出牌特效:炸弹 / 氢弹 / 378Q(含同花),检测到新 combo 时触发
  useEffect(() => {
    const combo = state.currentCombo;
    if (!combo) return;
    const key = `${state.comboOwnerSeat}-${combo.cards.map((card) => card.id).join(",")}`;
    if (key === lastComboKey.current) return;
    lastComboKey.current = key;
    const kind = fxOf(combo.cards);
    if (!kind) return;
    const ts = Date.now();
    setFx({ kind, ts });
    if (kind === "bomb" || kind === "hydrogen" || kind === "suited") {
      setShake(true);
      setTimeout(() => setShake(false), 600);
    }
    const timer = setTimeout(() => setFx(null), 1500);
    return () => clearTimeout(timer);
  }, [state.currentCombo, state.comboOwnerSeat]);

  // 报警语音:某玩家只剩 1~2 张牌时提醒(每局每座位只报一次)
  // 依赖用"各家手牌数拼串":引擎原地修改状态,引用不变,必须用值依赖才能在出牌后触发
  const warnedLow = useRef<Set<number>>(new Set());
  const warnedHand = useRef(-1);
  const handCounts = state.players.map((player) => player.hand.length).join(",");
  useEffect(() => {
    if (state.phase !== "PLAYING") return;
    if (warnedHand.current !== state.handNumber) {
      warnedHand.current = state.handNumber;
      warnedLow.current.clear();
    }
    for (const player of state.players) {
      if (player.hand.length !== 1 && player.hand.length !== 2) continue;
      if (warnedLow.current.has(player.seat)) continue;
      warnedLow.current.add(player.seat);
      speakLowCards(player.hand.length);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, handCounts, state.handNumber]);

  const groups = useMemo(() => {
    const ordered = [...human.hand].sort((a, b) => RANK_ORDER.indexOf(b.rank as PlayableRank) - RANK_ORDER.indexOf(a.rank as PlayableRank));
    const grouped = (ranks: readonly PlayableRank[]) => ranks.map((rank) => ({ rank, cards: ordered.filter((card) => card.rank === rank) })).filter((group) => group.cards.length > 0);
    return { priority: grouped(PRIORITY_RANKS), other: grouped(RANK_ORDER.filter((rank) => !PRIORITY_RANKS.includes(rank))) };
  }, [human.hand]);

  const toggle = (card: Card) => setSelected((cards) => cards.includes(card.id) ? cards.filter((id) => id !== card.id) : [...cards, card.id]);
  const perform = (action: () => void): boolean => {
    try { action(); setSelected([]); refresh((value) => value + 1); return true; } catch (error) { alert((error as Error).message); return false; }
  };
  const playHuman = () => {
    const cards = selected.map((id) => human.hand.find((card) => card.id === id)).filter((card): card is Card => card !== undefined);
    const combo = classifyCombo(cards);
    const beating = state.currentCombo !== null;
    if (perform(() => engine.playCards(0, selected)) && combo.type !== "INVALID") {
      // 学习信号:玩家压牌选择 + 大招出手时机
      if (beating && state.currentCombo) recordPlayerBeat(getComboStake(state.currentCombo), true);
      const isBig = combo.type === "BOMB_WITH_PAIR" || combo.type === "HYDROGEN_BOMB" || combo.type === "Q873_MIXED" || combo.type === "Q873_SUITED";
      if (isBig) recordPlayerBigPlay(human.hand.length);
      if (beating) speakBeatOrCombo(combo);
      else speakCombo(combo);
    }
  };
  const passHuman = () => {
    if (perform(() => engine.pass(0))) {
      if (state.currentCombo) recordPlayerBeat(getComboStake(state.currentCombo), false);
      speakPass();
    }
  };
  const useLuck = () => { if (perform(() => engine.useLuckCard(0))) setCountdown(3); };
  const showHint = () => {
    const ids = hintCardIds(engine, 0);
    if (!ids) { alert("没有能压住的牌,建议点「不管」"); return; }
    setSelected(ids);
  };
  const restart = () => { engine.startNewMatch(); setSelected([]); setProfiles(randomProfiles()); refresh((value) => value + 1); };
  const toggleMute = () => { const next = !muted; setMuted(next); setMutedState(next); };
  const currentCards = state.currentCombo?.cards ?? [];
  const settled = state.phase === "HAND_FINISHED" || state.phase === "MATCH_FINISHED";
  const redDelta = state.teamScores.RED - state.handStartScores.RED;
  const blueDelta = state.teamScores.BLUE - state.handStartScores.BLUE;

  return (
    <main>
      <header><div><span className="brand">378Q</span><span className="sub">四人对家组队牌类游戏</span></div><div className="header-btns"><button onClick={toggleMute}>{muted ? "🔇 语音关" : "🔊 语音开"}</button><button onClick={restart}>新局</button></div></header>
      <section className="score"><div className="red"><span>红队</span><b>{state.teamScores.RED}</b></div><div className="round">第 {state.handNumber} 小局 · 庄家 P{state.dealerSeat} · 当前 P{state.currentTurn}</div><div className="blue"><span>蓝队</span><b>{state.teamScores.BLUE}</b></div></section>
      {settled && (
        <section className="settlement">
          <span className="settle-title">本局结算</span>
          <div className="settle-row red"><span>红队</span><b className={redDelta >= 0 ? "gain" : "loss"}>{redDelta >= 0 ? `+${redDelta}` : redDelta}</b><small>{state.handStartScores.RED} → {state.teamScores.RED}</small></div>
          <div className="settle-row blue"><span>蓝队</span><b className={blueDelta >= 0 ? "gain" : "loss"}>{blueDelta >= 0 ? `+${blueDelta}` : blueDelta}</b><small>{state.handStartScores.BLUE} → {state.teamScores.BLUE}</small></div>
        </section>
      )}
      <section className={`table ${aiThinking ? "ai-thinking" : ""} ${shake ? "shake" : ""}`} style={{ backgroundImage: `linear-gradient(145deg, rgba(28,53,59,.86), rgba(18,38,44,.9)), url(${import.meta.env.BASE_URL}table-bg.jpg)`, backgroundSize: "cover", backgroundPosition: "center" }}>
        <div className="center">
          <div className="table-caption">{state.currentCombo ? state.currentCombo.type : "等待出牌"}</div>
          {currentCards.length > 0 && <div className="played-cards">{currentCards.map((card, index) => <span className="mini-card" key={card.id} style={{ animationDelay: `${index * 60}ms` }}><CardFace card={card} /></span>)}</div>}
          <small>{state.currentCombo ? `P${state.comboOwnerSeat} 出牌` : "领牌阶段只能出单张或对子"}</small>
          {aiThinking && countdown === null && <em className="thinking">AI 思考中…</em>}
        </div>
        {countdown !== null && (
          <div className="countdown-overlay" key={`${state.handNumber}-${countdown}`}>
            <span className="count-num">{countdown > 0 ? countdown : "GO!"}</span>
            <small>{countdown > 0 ? `准备中…庄家 P${state.dealerSeat} 即将出牌,可使用手气卡` : "开始!"}</small>
          </div>
        )}
        {fx && (
          <div className={`fx fx-${fx.kind}`} key={fx.ts}>
            {Array.from({ length: FX_RINGS[fx.kind] }, (_, index) => <i className="ring" key={index} style={{ animationDelay: `${index * 0.12}s` }} />)}
            <span>{FX_TEXT[fx.kind]}</span>
          </div>
        )}
        <div className="seats">{state.players.map((player) => { const profile = profiles[player.seat]!; const hoverable = settled && player.controller !== "HUMAN" && player.hand.length > 0; const ally = player.seat === 0 || player.team === human.team; return <div className={`seat seat-${player.seat} ${state.currentTurn === player.seat ? "active" : ""} ${revealing && player.hand.length > 0 ? "revealing" : ""}`} key={player.seat}><div className="avatar"><img src={profile.avatar} alt={profile.name} /><i className="seat-badge">{player.seat}</i></div><div className="seat-info"><b>{profile.name}{player.controller === "HUMAN" ? "（你）" : ""}</b><em className={`tag ${ally ? "ally" : "enemy"}`}>{player.controller === "HUMAN" ? "自己" : ally ? "队友" : "敌人"}</em><span>{player.hand.length} 张</span></div>{hoverable && <div className="hover-cards">{player.hand.map((card) => <span className="mini-card" key={card.id}><CardFace card={card} /></span>)}</div>}</div>; })}</div>
      </section>
      {peek && (() => {
        const teammate = state.players.find((player) => player.seat !== 0 && player.team === human.team)!;
        return (
          <section className="peek-board">
            <CardRow profile={profiles[teammate.seat]!} controller={teammate.controller} team={teammate.team} cards={teammate.hand} highlight={state.currentTurn === teammate.seat} />
          </section>
        );
      })()}
      {settled && (
        <section className="peek-board">
          {state.players.map((player) => <CardRow profile={profiles[player.seat]!} controller={player.controller} team={player.team} cards={player.hand} highlight={player.seat === state.handWinnerSeat} key={player.seat} />)}
        </section>
      )}
      <section className="hand">
        <div className="hand-title"><span>你的手牌</span><span>{human.hand.length} 张</span></div>
        <div className="hand-groups deal" key={`${state.handNumber}-${3 - state.luckCardUses}`}>
          <div className="hand-group"><div className="group-title">重点牌组 <span>3 · 7 · 8 · Q</span></div><div className="cards">{groups.priority.flatMap((group) => group.cards).map((card, index) => <CardButton card={card} selected={selected.includes(card.id)} onClick={toggle} dealDelay={index * 45} key={card.id} />)}</div></div>
          <div className="hand-group"><div className="group-title">其他牌</div><div className="cards">{groups.other.flatMap((group) => group.cards).map((card, index) => <CardButton card={card} selected={selected.includes(card.id)} onClick={toggle} dealDelay={index * 45} key={card.id} />)}</div></div>
        </div>
        <div className="actions"><button className="primary" disabled={countdown !== null || state.currentTurn !== 0 || selected.length === 0 || state.phase !== "PLAYING"} onClick={playHuman}>出牌</button><button disabled={countdown !== null || state.currentTurn !== 0 || !state.currentCombo || state.phase !== "PLAYING"} onClick={passHuman}>不管</button><button disabled={countdown !== null || state.currentTurn !== 0 || state.phase !== "PLAYING"} onClick={showHint}>💡 提示</button><button className={peek ? "primary" : ""} onClick={() => setPeek((value) => !value)}>{peek ? "👁 收起队友牌" : "👁 看队友牌"}</button>{state.phase === "PLAYING" && state.handNumber > 1 && state.luckCardUses > 0 && state.currentCombo === null && state.comboOwnerSeat === null && state.consecutivePasses === 0 && <button onClick={useLuck}>🎴 手气卡 ×{state.luckCardUses}</button>}{state.phase === "HAND_FINISHED" && <button disabled={revealing} onClick={() => perform(() => engine.startNextHand())}>{revealing ? "亮牌中…" : "下一小局"}</button>}{state.phase === "MATCH_FINISHED" && <strong className="winner">大局结束：{state.winnerTeam === "RED" ? "红队" : "蓝队"}获胜</strong>}</div>
      </section>
      <section className="logs">{state.logs.slice(-8).map((log, index) => <div key={`${index}-${log}`}>{log}</div>)}</section>
    </main>
  );
}

function CardButton({ card, selected, onClick, dealDelay = 0 }: { card: Card; selected: boolean; onClick: (card: Card) => void; dealDelay?: number }) {
  return <button className={`card ${selected ? "selected" : ""}`} style={{ animationDelay: `${dealDelay}ms` }} onClick={() => onClick(card)}><CardFace card={card} /></button>;
}
