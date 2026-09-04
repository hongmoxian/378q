/**
 * 背景音乐:优先加载 public/bgm.mp3(用户自备音频),
 * 文件缺失时回退到程序化合成的"魔法风"循环(原创,无版权问题)。
 * 状态记忆在 localStorage;浏览器策略要求用户点击后才能出声。
 */

const MUSIC_KEY = "q873-music";
let musicOn = false;
let audioEl: HTMLAudioElement | null = null;
let audioFailed = false;
let synth: { ctx: AudioContext; timer: number } | null = null;

export function isMusicOn(): boolean {
  return musicOn;
}

export function toggleMusic(): boolean {
  musicOn = !musicOn;
  try { localStorage.setItem(MUSIC_KEY, musicOn ? "1" : "0"); } catch { /* ignore */ }
  if (musicOn) startPlayback(); else stopPlayback();
  return musicOn;
}

/** 从 localStorage 恢复偏好;实际出声需等用户手势(调用方在点击时触发)。 */
export function restoreMusicPref(): boolean {
  try { musicOn = localStorage.getItem(MUSIC_KEY) === "1"; } catch { musicOn = false; }
  return musicOn;
}

function startPlayback(): void {
  if (!audioFailed) {
    if (!audioEl) {
      audioEl = new Audio(`${import.meta.env.BASE_URL}bgm.mp3`);
      audioEl.loop = true;
      audioEl.volume = 0.3;
      audioEl.addEventListener("error", () => { audioFailed = true; audioEl = null; if (musicOn) startSynth(); });
    }
    audioEl.play().catch(() => { /* 浏览器手势限制等,忽略 */ });
    return;
  }
  startSynth();
}

function stopPlayback(): void {
  audioEl?.pause();
  stopSynth();
}

/** 程序化合成魔法风 BGM:A 小调五声琶音 + 持续和弦垫,循环播放。 */
function startSynth(): void {
  if (synth) return;
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return;
  const ctx = new Ctx();
  const master = ctx.createGain();
  master.gain.value = 0.05;
  master.connect(ctx.destination);

  // 持续和弦垫(A 小调:A3 + E4 + C5),极低音量
  for (const freq of [220, 329.63, 523.25]) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const padGain = ctx.createGain();
    padGain.gain.value = 0.25;
    osc.connect(padGain);
    padGain.connect(master);
    osc.start();
  }

  // 五声琶音序列(魔法感上行+下行)
  const scale = [220, 261.63, 293.66, 329.63, 392, 440, 523.25, 587.33];
  const seq = [0, 2, 4, 3, 2, 4, 5, 4, 3, 5, 6, 5, 4, 3, 2, 0, 2, 4, 6, 7, 6, 4, 3, 2, 0, 1, 3, 2, 1, 0, 0, 1];
  let step = 0;
  const timer = window.setInterval(() => {
    if (!synth) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = scale[seq[step % seq.length]!]!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.9, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + 0.55);
    if (step % 8 === 0) {
      const bass = ctx.createOscillator();
      bass.type = "sine";
      bass.frequency.value = 110;
      const bg = ctx.createGain();
      bg.gain.setValueAtTime(0.0001, t);
      bg.gain.exponentialRampToValueAtTime(0.6, t + 0.03);
      bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      bass.connect(bg);
      bg.connect(master);
      bass.start(t);
      bass.stop(t + 0.95);
    }
    step += 1;
  }, 260);

  synth = { ctx, timer };
}

function stopSynth(): void {
  if (!synth) return;
  window.clearInterval(synth.timer);
  void synth.ctx.close();
  synth = null;
}
