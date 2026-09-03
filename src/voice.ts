import type { Card } from "./rules/cards";
import type { Combo } from "./rules/combo";

const MUTE_KEY = "q873-muted";
let muted = typeof localStorage !== "undefined" && localStorage.getItem(MUTE_KEY) === "1";

export function isMuted(): boolean { return muted; }
export function setMuted(value: boolean): void {
  muted = value;
  try { localStorage.setItem(MUTE_KEY, value ? "1" : "0"); } catch { /* ignore */ }
}

function pick<T>(items: readonly T[]): T { return items[Math.floor(Math.random() * items.length)]; }

const CN_DIGIT: Partial<Record<Card["rank"], string>> = { "2": "二", "3": "三", "4": "四", "6": "六", "7": "七", "8": "八", "9": "九" };

function rankVoice(rank: Card["rank"]): string {
  if (rank === "A") return "尖";
  if (rank === "J") return "勾";
  if (rank === "SMALL_JOKER") return "小王";
  if (rank === "BIG_JOKER") return "大王";
  return CN_DIGIT[rank] ?? rank;
}

export function comboVoice(combo: Combo): string {
  if (combo.type === "SINGLE") return rankVoice(combo.rank!);
  if (combo.type === "PAIR") return `对${rankVoice(combo.rank!)}`;
  if (combo.type === "HYDROGEN_BOMB") return `${rankVoice(combo.rank!)}氢`;
  if (combo.type === "BOMB_WITH_PAIR") return `${rankVoice(combo.rank!)}炸`;
  if (combo.type === "Q873_SUITED") return "顺三七八夺";
  return "三七八夺";
}

const PASS_LINES = ["不要", "不要了", "要不起", "过", "不压", "别这样"] as const;
const BEAT_LINES = ["大你", "压上", "吃你了", "跟上了", "接着"] as const;
const SPECIAL_LINES: Partial<Record<Combo["type"], readonly string[]>> = {
  BOMB_WITH_PAIR: ["炸弹", "炸了", "轰"],
  HYDROGEN_BOMB: ["氢弹", "核弹", "氢弹来了"],
  Q873_MIXED: ["三七八", "三七八夺"],
  Q873_SUITED: ["顺三七八", "同花三七八夺"],
};

function speak(text: string, rate = 1): void {
  if (muted || typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const Speech = window.SpeechSynthesisUtterance;
  if (!Speech) return;
  window.speechSynthesis.cancel();
  const utterance = new Speech(text);
  utterance.lang = "zh-CN";
  utterance.rate = rate;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

export function speakCombo(combo: Combo): void {
  const lines = SPECIAL_LINES[combo.type];
  if (lines && combo.type !== "SINGLE" && combo.type !== "PAIR" && Math.random() < 0.5) {
    speak(pick(lines), 0.95);
    return;
  }
  speak(comboVoice(combo), 0.9);
}

/** AI/玩家 PASS 时播报 */
export function speakPass(): void { speak(pick(PASS_LINES), 1.05); }

/** 压住对手时播报 */
export function speakBeat(): void { speak(pick(BEAT_LINES), 1.05); }

/** 压牌播报:50% 概率喊"大你"类口播,否则念牌名 */
export function speakBeatOrCombo(combo: Combo): void {
  if (Math.random() < 0.5) speakBeat();
  else speakCombo(combo);
}
