"use client";

// 効果音。すべて Web Audio でその場で合成する（素材ファイルを使わない）。
// content/site.json の sounds にパスを書くと、その音だけファイル再生に切り替わる。

import { site, type SoundName } from "./content";

const MUTE_KEY = "ippom.muted";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
let loaded = false;
const listeners = new Set<() => void>();

function loadMuted() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    muted = localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    muted = false;
  }
}

export function subscribeMuted(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isMuted(): boolean {
  loadMuted();
  return muted;
}

export function setMuted(value: boolean) {
  muted = value;
  try {
    localStorage.setItem(MUTE_KEY, value ? "1" : "0");
  } catch {
    // 保存できなくても、この画面では切り替わる。
  }
  if (master && ctx) master.gain.setTargetAtTime(value ? 0 : 0.5, ctx.currentTime, 0.01);
  listeners.forEach((l) => l());
}

/** ブラウザの制限で、音は最初のタップのあとでないと鳴らせない。最初の操作で呼ぶ。 */
export function unlockSound() {
  loadMuted();
  if (typeof window === "undefined") return;
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
}

interface ToneOpts {
  freq: number;
  to?: number;
  type?: OscillatorType;
  at?: number;
  dur: number;
  gain?: number;
}

function tone({ freq, to, type = "triangle", at = 0, dur, gain = 0.4 }: ToneOpts) {
  if (!ctx || !master) return;
  const t0 = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noise({ at = 0, dur, gain = 0.4, cutoff = 1200 }: { at?: number; dur: number; gain?: number; cutoff?: number }) {
  if (!ctx || !master) return;
  const t0 = ctx.currentTime + at;
  const length = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = cutoff;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter).connect(g).connect(master);
  src.start(t0);
}

const semitone = (base: number, steps: number) => base * Math.pow(2, steps / 12);

function thump() {
  tone({ freq: 150, to: 45, type: "sine", dur: 0.28, gain: 0.9 });
  noise({ dur: 0.12, gain: 0.5, cutoff: 900 });
}

const synth: Record<SoundName, (step: number) => void> = {
  // 枠1段ごと。段が進むほど音程が上がる。
  tick: (step) => {
    const f = semitone(392, (step - 1) * 2);
    tone({ freq: f, type: "square", dur: 0.09, gain: 0.18 });
    tone({ freq: f * 2, type: "triangle", dur: 0.14, gain: 0.25 });
  },
  // 10点。駆け上がってから和音を伸ばす。
  ippon: () => {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      tone({ freq: f, type: "square", at: i * 0.09, dur: 0.16, gain: 0.22 });
    });
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f) => {
      tone({ freq: f, type: "sawtooth", at: 0.4, dur: 1.4, gain: 0.14 });
      tone({ freq: f, type: "triangle", at: 0.4, dur: 1.6, gain: 0.2 });
    });
    noise({ at: 0.4, dur: 0.9, gain: 0.25, cutoff: 6000 });
  },
  // 9点以下。少し下がる2音。
  oshii: () => {
    tone({ freq: 392, type: "triangle", dur: 0.22, gain: 0.3 });
    tone({ freq: 311.13, to: 277.18, type: "triangle", at: 0.2, dur: 0.45, gain: 0.3 });
  },
  // ハンコ（優・良・可）
  stamp: () => {
    thump();
    tone({ freq: 880, type: "triangle", at: 0.03, dur: 0.25, gain: 0.2 });
  },
  // ハンコ（秀）。派手に。
  stampTop: () => {
    thump();
    [659.25, 783.99, 987.77, 1318.5].forEach((f, i) => {
      tone({ freq: f, type: "square", at: 0.05 + i * 0.08, dur: 0.2, gain: 0.2 });
    });
    [659.25, 987.77, 1318.5].forEach((f) => {
      tone({ freq: f, type: "triangle", at: 0.4, dur: 1.1, gain: 0.2 });
    });
    noise({ at: 0.4, dur: 0.7, gain: 0.2, cutoff: 6000 });
  },
  // ハンコ（不可）。低い音。
  stampFail: () => {
    thump();
    tone({ freq: 110, to: 65, type: "sawtooth", at: 0.05, dur: 0.7, gain: 0.3 });
  },
};

/** 効果音を鳴らす。step は tick のときの段数（1〜10）。 */
export function playSound(name: SoundName, step = 1) {
  if (!ctx || isMuted()) return;
  const file = site.sounds[name] as string | null;
  if (file) {
    const audio = new Audio(file);
    if (name === "tick") {
      audio.preservesPitch = false;
      audio.playbackRate = Math.pow(2, ((step - 1) * 2) / 12);
    }
    audio.volume = 0.6;
    void audio.play().catch(() => {});
    return;
  }
  synth[name](step);
}
