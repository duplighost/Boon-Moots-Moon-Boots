// The single state object + save plumbing + run creation.
import { SAVE_KEY, VERSION } from './config.js';
import { hashString, mulberry32 } from './rng.js';

function defaultSave() {
  return {
    version: VERSION, bestScore: 0, bestRound: 0, runs: 0, sparks: 0,
    gotDressed: false,   // unlocked the first time you beat the final boss — Moots wears the shirt forever
    settings: { sfx: true, bgm: true },
    bestiary: {}, notices: [], seenItems: {}, shrine: {},
    lifetime: { kills: 0, rooms: 0, deaths: 0, wins: 0, timePlayed: 0 },
  };
}

const storage = (typeof localStorage !== 'undefined') ? localStorage : {
  _m: new Map(), getItem(k) { return this._m.get(k) ?? null; },
  setItem(k, v) { this._m.set(k, String(v)); }, removeItem(k) { this._m.delete(k); },
};

export function loadSave() {
  try {
    if (typeof location !== 'undefined' && /[?&]fresh=1/.test(location.search)) storage.removeItem(SAVE_KEY);
    const raw = JSON.parse(storage.getItem(SAVE_KEY) || '{}');
    const save = Object.assign(defaultSave(), raw);
    save.settings = Object.assign(defaultSave().settings, raw.settings || {});
    save.lifetime = Object.assign(defaultSave().lifetime, raw.lifetime || {});
    return save;
  } catch { return defaultSave(); }
}

export function saveNow() {
  try { storage.setItem(SAVE_KEY, JSON.stringify(state.save)); } catch { /* private mode */ }
}

export const state = {
  mode: 'title', // title | play | transition | portalDraft | pause | dead
  save: loadSave(),
  run: null,
  room: null,
  transition: null,        // {timer, duration, title, sub, tag, swapped, onSwap}
  fx: { shake: 0, flash: 0, slowMo: 0, hitPause: 0 },
  frameTimes: [],          // ring buffer for selfTest
  lowFx: false,            // adaptive quality: set when frames stay slow; drops bloom + halves particles
  oldMode: 'title',
};

export function newRun(seedText = Date.now()) {
  const seed = hashString(String(seedText) + '|rocketshoes');
  state.run = {
    seed, seedText: String(seedText), rng: mulberry32(seed),
    round: 0, score: 0, combo: 1, comboT: 0,
    kills: 0, roomKills: 0, streak: 0, streakT: 0,
    overdrive: false, won: false,
    startedAt: Date.now(), bags: {},
    player: null,            // set by player.makePlayer via rooms.startRun
    flags: {},               // one-shot behavior notice latches
  };
  state.save.runs = (state.save.runs || 0) + 1;
  return state.run;
}

export function bankBests() {
  const run = state.run;
  if (!run) return;
  state.save.bestScore = Math.max(state.save.bestScore || 0, Math.floor(run.score));
  state.save.bestRound = Math.max(state.save.bestRound || 0, run.round);
  saveNow();
}
