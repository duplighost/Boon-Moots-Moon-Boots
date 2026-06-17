// Meta: shrine (sparks → permanent run upgrades). Oaths and the daily mode were
// removed — Rocket Shoes is one clean "Play" button into the run.
import { state, saveNow } from '../state.js';

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
