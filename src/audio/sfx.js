// WebAudio synth SFX — Boon Moots recipes (boon-moots-notes.md §5, index.html:552-561).
import { state, saveNow } from '../state.js';

let ac = null, master = null;

export function ensure() {
  if (!state.save.settings.sfx) return;
  if (typeof AudioContext === 'undefined' && typeof webkitAudioContext === 'undefined') return;
  if (!ac) {
    ac = new (typeof AudioContext !== 'undefined' ? AudioContext : webkitAudioContext)();
    master = ac.createGain();
    master.gain.value = 0.05;
    master.connect(ac.destination);
  }
  if (ac.state === 'suspended') ac.resume();
}

function note(freq, dur = 0.06, type = 'sine', gain = 0.06, delay = 0) {
  if (!ac || !state.save.settings.sfx) return;
  const t = ac.currentTime + delay;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.05);
}

function noise(dur = 0.04, gain = 0.05) {
  if (!ac || !state.save.settings.sfx) return;
  const len = Math.max(1, Math.floor(ac.sampleRate * dur));
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.6);
  const s = ac.createBufferSource(), g = ac.createGain();
  s.buffer = buf; g.gain.value = gain;
  s.connect(g); g.connect(master);
  s.start();
}

export function sfx(kind) {
  if (!state.save.settings.sfx) return;
  ensure();
  switch (kind) {
    case 'shot': note(520, 0.035, 'triangle', 0.025); break;
    case 'dash': noise(0.035, 0.055); note(250, 0.04, 'triangle', 0.05); break;
    case 'kill': note(600, 0.045, 'sine', 0.05); note(900, 0.06, 'sine', 0.035, 0.03); break;
    case 'hurt': noise(0.09, 0.08); note(95, 0.13, 'sawtooth', 0.045); break;
    case 'pulse': noise(0.12, 0.08); note(110, 0.2, 'triangle', 0.07); note(880, 0.18, 'sine', 0.04, 0.05); break;
    case 'clear': note(392, 0.07, 'sine', 0.055); note(588, 0.08, 'sine', 0.045, 0.06); note(784, 0.1, 'sine', 0.035, 0.12); break;
    case 'care': note(330, 0.12, 'sine', 0.05); note(495, 0.16, 'sine', 0.04, 0.08); break;
    case 'break': noise(0.06, 0.07); note(170, 0.07, 'square', 0.03); break;
    case 'pickup': note(740, 0.05, 'sine', 0.03); break;
    case 'draft': note(440, 0.08, 'triangle', 0.04); note(660, 0.1, 'triangle', 0.03, 0.07); break;
    case 'portal': note(294, 0.12, 'sine', 0.045); note(440, 0.14, 'sine', 0.04, 0.08); note(587, 0.16, 'sine', 0.03, 0.16); break;
    case 'telegraph': note(180, 0.05, 'square', 0.02); break;
  }
}

export function toggleSfx() {
  state.save.settings.sfx = !state.save.settings.sfx;
  if (state.save.settings.sfx) ensure();
  saveNow();
  return state.save.settings.sfx;
}
