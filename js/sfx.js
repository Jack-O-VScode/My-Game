/**
 * Tiny WebAudio blips so the game ships with sound but no assets.
 * The context is created lazily on the first gesture (iOS requires it).
 */

let ctx = null;
let enabled = true;

function context() {
  if (ctx) return ctx;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    ctx = null;
  }
  return ctx;
}

export function setEnabled(on) {
  enabled = !!on;
}

function tone(freq, duration, type = 'sine', gain = 0.06, delay = 0) {
  if (!enabled) return;
  const ac = context();
  if (!ac) return;
  if (ac.state === 'suspended') ac.resume().catch(() => {});
  const t0 = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const amp = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.015);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(amp).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

export const sfx = {
  care: () => tone(520, 0.12, 'triangle'),
  coin: () => { tone(880, 0.08, 'square', 0.04); tone(1320, 0.1, 'square', 0.035, 0.06); },
  buy: () => { tone(660, 0.1, 'triangle'); tone(990, 0.14, 'triangle', 0.05, 0.08); },
  levelUp: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 'triangle', 0.05, i * 0.09)),
  levelDown: () => [440, 349, 262].forEach((f, i) => tone(f, 0.2, 'sawtooth', 0.035, i * 0.11)),
  nope: () => tone(160, 0.16, 'sawtooth', 0.04),
  tap: () => tone(340, 0.05, 'sine', 0.03),
};
