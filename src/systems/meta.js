// Meta: shrine (sparks → permanent), oaths, daily mode helpers.
// Shrine defs are Boon Moots' verbatim (index.html:186-192).
import { state, saveNow } from '../state.js';
import { todaySeed } from '../rng.js';

export const SHRINE_DEFS = [
  { id: 'shrine_hp',    name: 'Stubborn Heart', desc: '+1 max integrity every run.', cost: 80 },
  { id: 'shrine_speed', name: 'Restless Soles', desc: '+18 base speed.',             cost: 100 },
  { id: 'shrine_spark', name: 'Spark Magnet',   desc: '+40 pickup range.',           cost: 90 },
  { id: 'shrine_head',  name: 'Headstart',      desc: 'Start each run at round 2 with a free graft.', cost: 200 },
];

export function buyShrine(id) {
  const def = SHRINE_DEFS.find(s => s.id === id);
  if (!def) return false;
  const sh = state.save.shrine;
  if (sh[id] || (state.save.sparks || 0) < def.cost) return false;
  state.save.sparks -= def.cost;
  sh[id] = true;
  saveNow();
  return true;
}

export function applyShrine(p) {
  const sh = state.save.shrine || {};
  if (sh.shrine_hp) { p.maxHp += 1; p.hp += 1; }
  if (sh.shrine_speed) { p.baseSpeed += 18; p.speed = p.baseSpeed; }
  if (sh.shrine_spark) p.pickup += 40;
}

export const OATHS = [
  { id: 'none',   name: 'No Oath',            desc: 'Baseline descent. The room can still ruin you honestly.' },
  { id: 'glass',  name: 'Oath of Glass',      desc: '+25% damage, −2 max integrity. Beautiful, dumb.' },
  { id: 'hunger', name: 'Oath of Hunger',     desc: 'More forbidden pots, more debt. The run grows greedier.' },
  { id: 'blind',  name: 'Oath of the Blind Moon', desc: 'No danger arrows. More annexes whisper behind the wall.' },
];

export const oathsUnlocked = () => (state.save.lifetime.wins || 0) > 0;

export function applyOath(run, p) {
  if (run.oath === 'glass') {
    p.damage *= 1.25;
    p.maxHp = Math.max(2, p.maxHp - 2);
    p.hp = Math.min(p.hp, p.maxHp);
  }
  // hunger/blind are read by the roller and the danger-triangle draw
}

export function bankDaily() {
  const run = state.run;
  if (!run?.daily) return;
  const today = todaySeed();
  const best = state.save.dailyBest;
  if (best.date !== today || Math.floor(run.score) > best.score) {
    state.save.dailyBest = { date: today, score: Math.max(best.date === today ? best.score : 0, Math.floor(run.score)) };
    saveNow();
  }
}

export function dailyBestToday() {
  const b = state.save.dailyBest;
  return b.date === todaySeed() ? b.score : null;
}
