/**
 * 玩家操作学习:记录玩家(座位0)的出牌决策,供 AI 模仿其风格。
 *
 * 记录两类信号:
 * 1. 压牌阈值——玩家面对不同档位敌方牌时选择压/不压的倾向;
 * 2. 大招使用——玩家多早舍得打出炸弹/氢弹/378Q(以当时手牌数衡量)。
 *
 * 数据持久化在 localStorage(键 q873-ai-learn),跨对局累积,用滑动窗口保留最近记录,
 * 读取时计算"激进指数"(0~1):越接近 1 说明玩家越激进,AI 出手越果断。
 */

const STORE_KEY = "q873-ai-learn";
const MAX_SAMPLES = 200;

export interface LearnData {
  /** 玩家压牌样本:[敌方牌 stake, 是否压(1/0)] */
  beatSamples: Array<[number, number]>;
  /** 玩家打大招时的手牌剩余数:1=很早打(激进),越大越保守 */
  bigPlayHandSize: number[];
}

interface WritableStore extends Storage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function load(): LearnData {
  try {
    if (typeof localStorage === "undefined") return { beatSamples: [], bigPlayHandSize: [] };
    const raw = (localStorage as WritableStore).getItem(STORE_KEY);
    if (!raw) return { beatSamples: [], bigPlayHandSize: [] };
    const parsed = JSON.parse(raw) as Partial<LearnData>;
    return {
      beatSamples: Array.isArray(parsed.beatSamples) ? parsed.beatSamples.slice(-MAX_SAMPLES) : [],
      bigPlayHandSize: Array.isArray(parsed.bigPlayHandSize) ? parsed.bigPlayHandSize.slice(-MAX_SAMPLES) : [],
    };
  } catch {
    return { beatSamples: [], bigPlayHandSize: [] };
  }
}

function save(data: LearnData): void {
  try {
    if (typeof localStorage === "undefined") return;
    (localStorage as WritableStore).setItem(STORE_KEY, JSON.stringify(data));
  } catch { /* ignore */ }
}

/** 记录:玩家面对敌方 stake 的牌,选择了压还是过。 */
export function recordPlayerBeat(stake: number, beat: boolean): void {
  const data = load();
  data.beatSamples.push([stake, beat ? 1 : 0]);
  data.beatSamples = data.beatSamples.slice(-MAX_SAMPLES);
  save(data);
}

/** 记录:玩家打出大牌型(bomb/hydrogen/q873)时手里还剩几张。 */
export function recordPlayerBigPlay(handSize: number): void {
  const data = load();
  data.bigPlayHandSize.push(handSize);
  data.bigPlayHandSize = data.bigPlayHandSize.slice(-MAX_SAMPLES);
  save(data);
}

/**
 * 激进指数 0~1(无数据时返回 0.5 中性):
 * = 玩家压牌率 × 0.6 + 早打大招程度 × 0.4。
 */
export function playerAggressiveness(): number {
  const data = load();
  if (!data.beatSamples.length && !data.bigPlayHandSize.length) return 0.5;
  let beatRate = 0.5;
  if (data.beatSamples.length >= 8) {
    beatRate = data.beatSamples.reduce((sum, [, beat]) => sum + beat, 0) / data.beatSamples.length;
  }
  let earlyBig = 0.5;
  if (data.bigPlayHandSize.length >= 5) {
    const avg = data.bigPlayHandSize.reduce((a, b) => a + b, 0) / data.bigPlayHandSize.length;
    // 20 张手牌时打大招=1 分(极激进),5 张时打=0 分(很保守)
    earlyBig = Math.max(0, Math.min(1, (20 - avg) / 15));
  }
  return Math.max(0, Math.min(1, beatRate * 0.6 + earlyBig * 0.4));
}

/** 清空学习数据(调试用)。 */
export function resetLearn(): void {
  try { localStorage.removeItem(STORE_KEY); } catch { /* ignore */ }
}
