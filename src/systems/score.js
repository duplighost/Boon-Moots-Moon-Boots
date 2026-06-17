// Combo, streaks, bonuses, bests.
import { COMBO, SCORE, STREAK_NAMES } from '../config.js';
import { state, saveNow } from '../state.js';
import { addFloat, burst, ripple } from '../render/particles.js';
import { addFlash, addShake } from './juice.js';
import { sfx } from '../audio/sfx.js';
import { damp } from '../rng.js';

// Crossing an integer combo tier (×2, ×3 …) fires escalating juice — the climb feels huge.
function comboMilestone(tier, e) {
  const room = state.room; if (!room) return;
  const k = Math.min(1, (tier - 2) / 10);
  addFlash(0.12 + k * 0.30);
  addShake(0.22 + k * 0.75);
  const hot = tier >= 10 ? '#ffffff' : tier >= 6 ? '#ff9bf5' : (room.biome?.pal.accent3 || '#ffd36e');
  addFloat(room, e.x, e.y - 78, `×${tier}`, hot, true, 1.05 + k * 0.7);
  burst(room, e.x, e.y, hot, 10 + tier * 2, 210 + tier * 28, 0.5, 3);
  const p = state.run?.player;
  if (p) p.comboTierFx = Math.max(p.comboTierFx || 0, 0.65);
  maybeComboHeal(room, tier);
  sfx('pulse');
}


function maybeComboHeal(room, tier) {
  // Combo health is now early, loud, and deterministic: every fresh integer tier
  // from ×2 upward visibly repairs 1 missing HP. At full health it banks a tiny
  // one-hit guard instead, so the milestone still feels like it did something.
  if (!Number.isFinite(tier) || tier < 2) return false;
  const p = state.run?.player;
  if (!p) return false;
  if (!(room.comboHealedTiers instanceof Set)) room.comboHealedTiers = new Set(room.comboHealedTiers || []);
  if (room.comboHealedTiers.has(tier)) return false;
  room.comboHealedTiers.add(tier);
  state.run.lastComboHealTier = tier;
  p.comboHealFx = Math.max(p.comboHealFx || 0, 1.15);

  let didGain = false;
  if (p.hp < p.maxHp) {
    p.hp = Math.min(p.maxHp, p.hp + 1);
    didGain = true;
    addFloat(room, p.x, p.y - 64, `+1♥ ×${tier}`, '#7efab7', true, 0.98);
  } else {
    const guardCap = Math.max(1, p.shieldMax || 0);
    if ((p.shield || 0) < guardCap) {
      p.shield = Math.min(guardCap, (p.shield || 0) + 1);
      didGain = true;
      addFloat(room, p.x, p.y - 64, `◇ ×${tier}`, '#bdfcff', true, 0.86);
    } else {
      addFloat(room, p.x, p.y - 64, `×${tier}`, '#7efab7', true, 0.72);
    }
  }

  addFlash(0.20);
  addShake(0.42);
  ripple(room, p.x, p.y, didGain ? '#7efab7' : '#bdfcff', 132, 0.38);
  burst(room, p.x, p.y, didGain ? '#7efab7' : '#bdfcff', 26, 235, 0.48, 3.6);
  sfx('care');
  return didGain;
}


export function tickCombo(raw) {
  const run = state.run;
  if (!run) return;
  run.comboT = Math.max(0, run.comboT - raw);
  if (run.comboT <= 0) run.combo = damp(run.combo, 1, 3, raw);
  if (run.streakT > 0) {
    run.streakT = Math.max(0, run.streakT - raw);
    if (run.streakT <= 0) run.streak = 0;
  }
}

export function killScore(e) {
  const run = state.run;
  const prevTier = Math.floor(run.combo);
  run.combo = Math.min(COMBO.CAP, run.combo + (e.boss ? COMBO.PER_BOSS : COMBO.PER_KILL));
  const tier = Math.floor(run.combo);
  if (tier > prevTier && tier >= 2) comboMilestone(tier, e);
  run.comboT = COMBO.WINDOW;
  const pts = Math.floor(e.score * run.combo
    * (run.overdrive ? SCORE.OVERDRIVE_MULT : 1)
    * (state.room?.mutator?.scoreMult || 1));
  run.score += pts;
  run.kills++; run.roomKills++;
  state.save.lifetime.kills++;
  state.save.bestiary[e.type] = (state.save.bestiary[e.type] || 0) + 1;
  run.streak++; run.streakT = 0.8;
  if (run.streak < STREAK_NAMES.length && STREAK_NAMES[run.streak] && state.room) {
    addFloat(state.room, e.x, e.y - 58, STREAK_NAMES[run.streak], state.room.biome?.pal.accent3 || '#ffd36e', true);
  }
  return pts;
}

export function sparkScore() {
  const run = state.run;
  run.score += Math.floor(SCORE.SPARK * run.combo);
  state.save.sparks = (state.save.sparks || 0) + 1;
}

export function roomClearScore(room) {
  const run = state.run;
  let total = Math.floor((SCORE.CLEAR_BASE + run.round * SCORE.CLEAR_PER_ROUND) * run.combo);
  const parts = [{ text: `+${total}`, big: true }];
  if (!run.player.roomHit) {
    const noHit = Math.floor(SCORE.NO_HIT * run.combo);
    total += noHit;
    parts.push({ text: `☆ +${noHit}` });
  }
  if (run.round >= SCORE.SPEED_FROM_ROUND) {
    const speed = Math.max(0, Math.floor(SCORE.SPEED_MAX - room.time * SCORE.SPEED_DRAIN));
    if (speed > 0) { total += speed; parts.push({ text: `⚡ +${speed}` }); }
  }
  run.score += total;
  saveNow();
  return parts;
}
