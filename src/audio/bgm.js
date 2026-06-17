// Procedural BGM — No Moon's 86 BPM stress-responsive sequencer
// (docs/no-moon-systems.md §7, game_inline.js:1460-1724). Note tables for bass/
// arp/lead are No Moon's; the chord voicings are our own A-minor set fitted to
// those tables (the original chord table wasn't captured in the inventory).
import { state } from '../state.js';

const STEP = 60 / 86 / 2;          // 8th notes at 86 BPM
const LOOKAHEAD = 0.28;            // seconds scheduled ahead
const POLL = 82;                   // ms scheduler tick

const BASS = [55.00, 0, 55.00, 0, 73.42, 0, 65.41, 0, 49.00, 0, 61.74, 0, 55.00, 0, 41.20, 0];
const ARP = [220.00, 261.63, 293.66, 329.63, 261.63, 220.00, 196.00, 174.61, 207.65, 246.94, 293.66, 349.23, 311.13, 246.94, 207.65, 174.61];
const LEAD = [0, 0, 0, 0, 329.63, 0, 0, 293.66, 0, 261.63, 0, 0, 246.94, 0, 0, 0, 0, 0, 349.23, 0, 0, 329.63, 0, 293.66, 0, 0, 246.94, 0, 220.00, 0, 0, 0];
const CHORDS = [
  [110.00, 164.81, 220.00, 261.63], // Am
  [87.31, 130.81, 174.61, 220.00],  // F
  [98.00, 146.83, 196.00, 246.94],  // G
  [82.41, 123.47, 164.81, 207.65],  // Em
];

let ac = null, out = null, timer = null, nextTime = 0, step = 0;

function chain() {
  out = ac.createGain();
  out.gain.value = 0;
  const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 74;
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3600;
  const lim = ac.createDynamicsCompressor();
  lim.threshold.value = -26; lim.knee.value = 18; lim.ratio.value = 5;
  lim.attack.value = 0.006; lim.release.value = 0.16;
  out.connect(hp); hp.connect(lp); lp.connect(lim); lim.connect(ac.destination);
  out.gain.setTargetAtTime(0.18, ac.currentTime, 0.05);
}

function stress() {
  const run = state.run, room = state.room;
  if (!run || !room || state.mode === 'title') return 0.12;
  let s = Math.min(1, run.round / 20) * 0.5;
  if (room.enemies.some(e => e.boss)) s += 0.32;
  if (run.player && run.player.hp <= 1) s += 0.18;
  return Math.min(1, s);
}

function osc(freq, t, dur, type, gain, filterFreq) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  if (filterFreq) {
    const f = ac.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = filterFreq;
    o.connect(f); f.connect(g);
  } else {
    o.connect(g);
  }
  g.connect(out);
  o.start(t); o.stop(t + dur + 0.05);
}

function noiseHit(t, dur, gain, hp = false) {
  const len = Math.max(1, Math.floor(ac.sampleRate * dur));
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
  const s = ac.createBufferSource(), g = ac.createGain(), f = ac.createBiquadFilter();
  f.type = hp ? 'highpass' : 'bandpass';
  f.frequency.value = hp ? 5200 : 1400;
  s.buffer = buf; g.gain.value = gain;
  s.connect(f); f.connect(g); g.connect(out);
  s.start(t);
}

function schedule() {
  if (!ac || !state.save.settings.bgm) return;
  const s = stress();
  while (nextTime < ac.currentTime + LOOKAHEAD) {
    const t = nextTime, i16 = step % 16, i32 = step % 32;
    // kick on the beat
    if (i16 % 4 === 0) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(78, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      g.gain.setValueAtTime(0.18, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
      o.connect(g); g.connect(out);
      o.start(t); o.stop(t + 0.2);
    }
    // snare / hat
    if (i16 % 8 === 4) noiseHit(t, 0.09, 0.05 + s * 0.03);
    else if (i16 % 2 === 1 && (s > 0.3 || i16 % 4 === 3)) noiseHit(t, 0.03, 0.014 + s * 0.012, true);
    // bass
    const bf = BASS[i16];
    if (bf) osc(bf, t, STEP * 1.8, s > 0.55 ? 'sawtooth' : 'triangle', 0.07, 320 + s * 420);
    // arp — density rises with stress
    const arpGate = s > 0.6 ? (i16 % 2 === 0) : [3, 7, 11, 15].includes(i16);
    if (arpGate) osc(ARP[i16], t, STEP * 0.9, s > 0.5 ? 'square' : 'triangle', 0.022 + s * 0.014, 900 + s * 900);
    // lead
    const lf = LEAD[i32];
    if (lf) osc(lf, t, STEP * 1.6, 'sine', 0.03 + s * 0.012, 1150 + s * 520);
    // chord pad every 2 bars
    if (i32 === 0) {
      const chord = CHORDS[Math.floor(step / 32) % CHORDS.length];
      chord.forEach((f, vi) => osc(f, t + vi * 0.03, STEP * 14, 'triangle', 0.016, 700 + s * 300));
    }
    nextTime += STEP;
    step++;
  }
}

export function ensureBgm() {
  if (!state.save.settings.bgm) return;
  if (typeof AudioContext === 'undefined' && typeof webkitAudioContext === 'undefined') return;
  if (!ac) {
    ac = new (typeof AudioContext !== 'undefined' ? AudioContext : webkitAudioContext)();
    chain();
    nextTime = ac.currentTime + 0.05;
    timer = setInterval(schedule, POLL);
  }
  if (ac.state === 'suspended') ac.resume();
  out.gain.setTargetAtTime(0.18, ac.currentTime, 0.05);
}

export function toggleBgm() {
  state.save.settings.bgm = !state.save.settings.bgm;
  if (state.save.settings.bgm) ensureBgm();
  else if (out) out.gain.setTargetAtTime(0, ac.currentTime, 0.03);
  return state.save.settings.bgm;
}
