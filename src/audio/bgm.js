// Adaptive synthwave score for Rocket Shoes. A WebAudio sequencer that actually
// composes: each biome tier gets its own key, mode, chord progression and tempo; a
// generative lead plays melodic licks fitted to the current chord; and the whole
// arrangement layers UP with intensity (depth + combo + boss) so chaining kills cranks
// the music toward full outrun. Sidechain pump on the kick, a dotted-eighth delay send,
// and a soft limiter keep it glued. Public API is unchanged: ensureBgm / toggleBgm.
import { state } from '../state.js';

// ── musical material ─────────────────────────────────────────────────────────
const SCALES = {
  aeolian:   [0, 2, 3, 5, 7, 8, 10],
  dorian:    [0, 2, 3, 5, 7, 9, 10],
  phrygian:  [0, 1, 3, 5, 7, 8, 10],
  ionian:    [0, 2, 4, 5, 7, 9, 11],
  lydian:    [0, 2, 4, 6, 7, 9, 11],
  harmonic:  [0, 2, 3, 5, 7, 8, 11],
};

// One palette per descent band — the soundtrack changes character as you go deeper.
// prog = scale degrees (0-based), one chord per bar. transpose set per biome below.
const PALETTES = {
  early:  { scale: 'aeolian',  prog: [0, 5, 2, 6], bpm: 96,  lead: 'warm'   },
  mid:    { scale: 'dorian',   prog: [0, 3, 4, 0], bpm: 104, lead: 'pluck'  },
  late:   { scale: 'phrygian', prog: [0, 1, 6, 0], bpm: 108, lead: 'tense'  },
  abyss:  { scale: 'aeolian',  prog: [0, 6, 5, 6], bpm: 100, lead: 'airy'   },
  zenith: { scale: 'lydian',   prog: [0, 4, 5, 3], bpm: 112, lead: 'bright' },
  final:  { scale: 'harmonic', prog: [0, 4, 5, 4], bpm: 120, lead: 'epic'   },
};
const BOSS_PAL = { scale: 'aeolian',  prog: [0, 6, 5, 6], bpm: 130, lead: 'drive' };
const MENU_PAL = { scale: 'dorian',   prog: [0, 3, 0, 4], bpm: 90,  lead: 'airy'  };

// comfortable transpositions (semitones from A) keyed off the biome so neighbours differ
const ROOTS = [0, 3, 5, 7, -2, 8, 10, 2];

// melodic licks: {a: sixteenth 0-15, d: scale-degree above the chord root, dur in 16ths}
// chosen per 4-bar phrase and transposed onto the live chord — coherent, repeating,
// and always in key. Index 0 is the sparse "calm" lick.
const LICKS = [
  [{ a: 0, d: 4, dur: 6 }, { a: 8, d: 2, dur: 6 }],
  [{ a: 0, d: 0, dur: 2 }, { a: 2, d: 2, dur: 2 }, { a: 4, d: 4, dur: 4 }, { a: 10, d: 3, dur: 2 }, { a: 12, d: 2, dur: 4 }],
  [{ a: 0, d: 4, dur: 2 }, { a: 3, d: 5, dur: 1 }, { a: 4, d: 4, dur: 2 }, { a: 6, d: 2, dur: 2 }, { a: 8, d: 0, dur: 3 }, { a: 12, d: 2, dur: 4 }],
  [{ a: 2, d: 2, dur: 2 }, { a: 4, d: 3, dur: 1 }, { a: 6, d: 4, dur: 2 }, { a: 8, d: 6, dur: 2 }, { a: 11, d: 4, dur: 1 }, { a: 12, d: 5, dur: 4 }],
];

// ── runtime state ────────────────────────────────────────────────────────────
const LOOKAHEAD = 0.30, POLL = 60;
let ac = null, master = null, harmonyBus = null, duckGain = null, drumBus = null;
let delay = null, delaySend = null, lpf = null;
let timer = null, nextTime = 0, step = 0, STEP = 60 / 100 / 4;
let active = null, intensity = 0.2;

function buildGraph() {
  master = ac.createGain(); master.gain.value = 0;
  const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 36;
  lpf = ac.createBiquadFilter(); lpf.type = 'lowpass'; lpf.frequency.value = 3200; lpf.Q.value = 0.6;
  const lim = ac.createDynamicsCompressor();
  lim.threshold.value = -16; lim.knee.value = 22; lim.ratio.value = 6; lim.attack.value = 0.004; lim.release.value = 0.18;
  master.connect(hp); hp.connect(lpf); lpf.connect(lim); lim.connect(ac.destination);

  harmonyBus = ac.createGain(); harmonyBus.gain.value = 1;
  duckGain = ac.createGain(); duckGain.gain.value = 1;       // sidechained by the kick
  harmonyBus.connect(duckGain); duckGain.connect(master);
  drumBus = ac.createGain(); drumBus.gain.value = 1;
  drumBus.connect(master);

  // dotted-eighth feedback delay (the classic synthwave smear) on a send
  delay = ac.createDelay(1.5); delay.delayTime.value = 0.28;
  const fb = ac.createGain(); fb.gain.value = 0.36;
  const wet = ac.createGain(); wet.gain.value = 0.26;
  delaySend = ac.createGain(); delaySend.gain.value = 1;
  delaySend.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(master);
}

function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

// Choose the palette for the current room/mode (root keyed off the biome).
function derivePalette() {
  const run = state.run, room = state.room;
  if (!run || !room || state.mode === 'title' || state.mode === 'dead') {
    return finalize(MENU_PAL, 'A', 'menu');
  }
  if (room.enemies && room.enemies.some(e => e.boss)) {
    return finalize(BOSS_PAL, room.biome.id, 'boss:' + room.biome.id);
  }
  const base = PALETTES[room.biome.tier] || PALETTES.early;
  return finalize(base, room.biome.id, room.biome.id);
}
function finalize(base, keySeed, sig) {
  const semis = ROOTS[hash(keySeed) % ROOTS.length];
  const rootHz = 55 * Math.pow(2, semis / 12);  // bass A1 = 55Hz, transposed
  return { ...base, rootHz, sig };
}

// scale degree → frequency (degree may be negative or span octaves; octave shifts up)
function deg2hz(pal, degree, octave = 0) {
  const sc = SCALES[pal.scale], L = sc.length;
  let d = degree, oct = octave;
  oct += Math.floor(d / L); d = ((d % L) + L) % L;
  return pal.rootHz * Math.pow(2, (sc[d] + 12 * oct) / 12);
}

// ── synthesis voices ─────────────────────────────────────────────────────────
function tone(freq, t, dur, type, gain, opts = {}) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  if (opts.glide) { o.frequency.setValueAtTime(freq * opts.glide, t); o.frequency.exponentialRampToValueAtTime(freq, t + 0.06); }
  else o.frequency.setValueAtTime(freq, t);
  if (opts.detune) o.detune.setValueAtTime(opts.detune, t);
  const a = opts.attack ?? 0.008;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = o;
  if (opts.filter) { const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(opts.filter, t); if (opts.sweep) f.frequency.exponentialRampToValueAtTime(Math.max(180, opts.filter * opts.sweep), t + dur); f.Q.value = opts.q ?? 1; o.connect(f); node = f; }
  node.connect(g);
  g.connect(opts.bus || harmonyBus);
  if (opts.send) { const sg = ac.createGain(); sg.gain.value = opts.send; g.connect(sg); sg.connect(delaySend); }
  o.start(t); o.stop(t + dur + 0.06);
}

// fat detuned lead (supersaw-lite: three slightly detuned saws)
function lead(freq, t, dur, gain, send) {
  for (const det of [-7, 0, 8]) tone(freq, t, dur, 'sawtooth', gain / 2.4, { detune: det, attack: 0.012, filter: 2600, q: 2, send, glide: 1.04 });
}

function kick(t, gain) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(46, t + 0.10);
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  o.connect(g); g.connect(drumBus); o.start(t); o.stop(t + 0.2);
  // sidechain pump: dip the harmony bus on the kick, recover over ~2 sixteenths
  duckGain.gain.cancelScheduledValues(t);
  duckGain.gain.setValueAtTime(0.42, t);
  duckGain.gain.linearRampToValueAtTime(1.0, t + Math.min(0.5, STEP * 2.2));
}

function noise(t, dur, gain, type, freq, q = 1) {
  const len = Math.max(1, Math.floor(ac.sampleRate * dur));
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.6);
  const s = ac.createBufferSource(), g = ac.createGain(), f = ac.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.buffer = buf; s.connect(f); f.connect(g); g.connect(drumBus); s.start(t); s.stop(t + dur + 0.02);
}
function snare(t, gain) {
  noise(t, 0.16, gain, 'bandpass', 1900, 0.8);
  noise(t, 0.05, gain * 0.6, 'highpass', 3800);
  tone(180, t, 0.12, 'triangle', gain * 0.4, { bus: drumBus });
}
function hat(t, gain, open) { noise(t, open ? 0.10 : 0.03, gain, 'highpass', 8200); }

// ── arrangement ──────────────────────────────────────────────────────────────
function targetIntensity() {
  const run = state.run, room = state.room;
  if (!run || !room) return 0.20;                       // menu: dreamy
  if (state.mode === 'dead') return 0.0;
  let s = 0.30 + Math.min(1, run.round / 22) * 0.30;    // ramps with depth
  const combo = run.combo || 1;
  s += Math.min(0.30, ((combo - 1) / 13) * 0.30);       // COMBO cranks the arrangement
  if (room.enemies && room.enemies.some(e => e.boss)) s += 0.16;
  if (run.overdrive) s += 0.08;
  if (run.player && run.player.hp <= 1) s += 0.08;      // tension when near death
  if (room.cleared) s -= 0.22;                          // victory lap exhales
  return Math.max(0, Math.min(1, s));
}

function schedule() {
  if (!ac || !state.save.settings.bgm) return;
  // smooth the intensity toward target so layers fade in/out musically
  intensity += (targetIntensity() - intensity) * 0.10;
  const s = intensity;
  lpf.frequency.setTargetAtTime(2600 + s * 3200, ac.currentTime, 0.2); // brighten when hot

  while (nextTime < ac.currentTime + LOOKAHEAD) {
    const t = nextTime, i = step % 16, bar = Math.floor(step / 16), phrase = Math.floor(bar / 4);

    // re-key the song at bar boundaries when the room/mode changed (no mid-bar jumps)
    if (i === 0) {
      const pal = derivePalette();
      if (!active || pal.sig !== active.sig) {
        active = pal; STEP = 60 / pal.bpm / 4;
        delay.delayTime.setTargetAtTime((60 / pal.bpm) * 0.75, ac.currentTime, 0.05); // dotted-8th
      }
    }
    const pal = active || (active = derivePalette());
    const chordDeg = pal.prog[bar % pal.prog.length];
    const swing = (i % 2 === 1) ? STEP * 0.12 : 0;       // light swing on the offbeats

    // ── drums ──
    const fourOnFloor = s > 0.52;
    if (i === 0 || i === 8 || (fourOnFloor && (i === 4 || i === 12))) kick(t, 0.22);
    else if (s > 0.78 && i === 14) kick(t, 0.14);        // pickup at full tilt
    if (i === 4 || i === 12) snare(t, 0.12 + s * 0.05);
    if (s > 0.22 && i % 2 === 0) hat(t + swing, 0.018 + s * 0.02, false);
    if (s > 0.45 && i % 4 === 2) hat(t + swing, 0.03, true);

    // ── bass: driving outrun pulse on the chord root ──
    if (i % 2 === 0 || (s > 0.5 && i % 2 === 1)) {
      const oct = (i % 4 === 2) ? 1 : 0;                 // octave bounce
      tone(deg2hz(pal, chordDeg, oct), t + swing, STEP * (i % 4 === 0 ? 1.6 : 1.0),
        s > 0.55 ? 'sawtooth' : 'triangle', 0.085, { filter: 360 + s * 700, q: 3, sweep: 0.7 });
    }

    // ── pad: sustain the 7th chord across the bar with a slow filter open ──
    if (i === 0) {
      const dur = STEP * 16 * 1.02;
      [0, 2, 4, 6].forEach((iv, vi) => tone(deg2hz(pal, chordDeg + iv, 1), t + vi * 0.02, dur, 'triangle', 0.016 + s * 0.006, { attack: 0.12, filter: 700 + s * 700, q: 0.7 }));
    }

    // ── arp: chord tones cascading, density rises with intensity ──
    if (s > 0.40) {
      const tones = [0, 2, 4, 6, 7];
      const gate = s > 0.66 ? true : (i % 2 === 0);
      if (gate) {
        const iv = tones[(step) % tones.length];
        tone(deg2hz(pal, chordDeg + iv, 2), t + swing, STEP * 0.85, s > 0.6 ? 'square' : 'triangle', 0.02 + s * 0.012, { filter: 1400 + s * 1600, q: 2, send: 0.18 });
      }
    }

    // ── lead: a melodic lick per 4-bar phrase, fitted to the live chord ──
    const playLead = state.mode !== 'title' ? s > 0.34 : s > 0.12;
    if (playLead) {
      const lick = LICKS[s < 0.4 ? 0 : 1 + (phrase % (LICKS.length - 1))];
      for (const n of lick) {
        if (n.a === i) lead(deg2hz(pal, chordDeg + n.d, 2), t + swing, STEP * n.dur * 0.92, 0.05 + s * 0.02, 0.3);
      }
    }

    nextTime += STEP;
    step++;
  }
}

// ── public API ───────────────────────────────────────────────────────────────
export function ensureBgm() {
  if (!state.save.settings.bgm) return;
  if (typeof AudioContext === 'undefined' && typeof webkitAudioContext === 'undefined') return;
  if (!ac) {
    ac = new (typeof AudioContext !== 'undefined' ? AudioContext : webkitAudioContext)();
    buildGraph();
    active = derivePalette(); STEP = 60 / active.bpm / 4;
    delay.delayTime.value = (60 / active.bpm) * 0.75;
    nextTime = ac.currentTime + 0.06;
    timer = setInterval(schedule, POLL);
  }
  if (ac.state === 'suspended') ac.resume();
  master.gain.setTargetAtTime(0.22, ac.currentTime, 0.4); // gentle fade-in
}

export function toggleBgm() {
  state.save.settings.bgm = !state.save.settings.bgm;
  if (state.save.settings.bgm) ensureBgm();
  else if (master) master.gain.setTargetAtTime(0, ac.currentTime, 0.06);
  return state.save.settings.bgm;
}
