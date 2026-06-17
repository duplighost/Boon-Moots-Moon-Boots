// Breakable obstacle species — No Moon's pots with consequences
// (docs/no-moon-systems.md §5, game_inline.js:14440-14714). Volatile shards chain.
import { state } from '../state.js';
import { dist, norm } from '../rng.js';
import { burst, addFloat, ripple } from '../render/particles.js';
import { sfx } from '../audio/sfx.js';
import { addShake, hitPause } from './juice.js';
import { dropPickup } from './pickups.js';
import { spawnBullet } from './bullets.js';
import { addPulseHazard, addSlowFog } from './hazards.js';
import { spawnTelegraphed } from './enemies.js';
import { hurtPlayer, damageEnemy } from './combat.js';
import { cacheAltarBreak, gambitAltarBreak, mirrorVaultBreak } from './events.js';

export const SPECIES = {
  marrowJar:      { hp: 3, label: 'Marrow Jar' },
  bellHusk:       { hp: 4, label: 'Bell Husk' },
  blackGlass:     { hp: 3, label: 'Black Glass' },
  rootCyst:       { hp: 4, label: 'Root Cyst' },
  falseIdol:      { hp: 7, label: 'False Idol' },
  moonseedUrn:    { hp: 4, label: 'Moonseed Urn' },
  annexDoor:      { hp: 9, label: 'Sealed Door' },
  wallSegment:    { hp: 7, label: 'Cracked Wall' },
  rubble:         { hp: 2, label: 'Rubble' },
  volatileShard:  { hp: 2, label: 'Volatile Shard' },
  dashBell:       { hp: 4, label: 'Dash Bell' },
  cacheAltar:     { hp: 8, label: 'Moon Cache' },
  gambitAltar:    { hp: 11, label: 'Gambit Shrine' },
  mirrorVault:    { hp: 10, label: 'Mirror Vault' },
};

export function damageObstacle(room, o, dmg) {
  if (!o.breakable || o.gone) return;
  o.hp -= dmg;
  o.shake = 0.12;
  if (o.hp <= 0) breakObstacle(room, o);
}

export function breakObstacle(room, o) {
  if (o.gone) return;
  o.gone = true;
  const x = o.type === 'circle' ? o.x : o.x + o.w / 2;
  const y = o.type === 'circle' ? o.y : o.y + o.h / 2;
  sfx('break');
  addShake(0.08); hitPause('shot');
  burst(room, x, y, room.biome.pal.accent2, 14, 160, 0.45, 3);
  const fx = effects[o.species];
  if (fx) fx(room, o, x, y);
}

const effects = {
  marrowJar(room, o, x, y) {
    if (Math.random() < 0.25 && state.run.player.hp < state.run.player.maxHp) dropPickup(room, 'repair', x, y);
    scatterSparks(room, x, y, 2);
  },
  bellHusk(room, o, x, y) {
    addFloat(room, x, y - 20, '◉', room.biome.pal.accent2, false, 0.55);
    if (Math.random() < 0.35) addPulseHazard(room, x, y, { r: 26, span: 220 });
    scatterSparks(room, x, y, Math.random() < 0.55 ? 4 : 2);
  },
  blackGlass(room, o, x, y) {
    const n = 5 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      spawnBullet(room, 'enemy', x, y, Math.cos(a) * 260, Math.sin(a) * 260, 4.6, 1, 1.4, room.biome.pal.accent2);
    }
    scatterSparks(room, x, y, 2);
  },
  rootCyst(room, o, x, y) {
    if (Math.random() < 0.55) addSlowFog(room, x, y, { r: 82 + Math.random() * 40 });
    if (Math.random() < 0.30) debtAmbush(room, x, y, 1);
    scatterSparks(room, x, y, 2);
  },
  falseIdol(room, o, x, y) {
    addFloat(room, x, y - 22, '!', '#ffd47a', true, 0.58);
    debtAmbush(room, x, y, 1 + (room.idx >= 3 ? 1 : 0));
    if (Math.random() < 0.55) addPulseHazard(room, x, y, { r: 30, span: 260 });
    scatterSparks(room, x, y, 6);
    if (state.run.player.hp < state.run.player.maxHp) dropPickup(room, 'repair', x, y);
  },
  moonseedUrn(room, o, x, y) {
    scatterSparks(room, x, y, Math.random() < 0.22 ? 5 : 3);
  },
  dashBell(room, o, x, y) {
    const p = state.run?.player;
    if (p) {
      p.dashCd = 0;
      p.fireCd = Math.min(p.fireCd, 0.02);
      addFloat(room, x, y - 24, '↯', '#bdfcff', true, 0.50);
    }
    const dmg = p ? p.damage * (1 + p.perks.damage * 0.15) * 0.42 : 0.45;
    for (const e of room.enemies) {
      if (e.hp <= 0) continue;
      const d = dist(x, y, e.x, e.y);
      if (d < 178 + e.r) {
        const k = norm(e.x - x, e.y - y);
        damageEnemy(e, dmg * (1 - Math.min(0.55, d / 360)), k.x * 220, k.y * 220, 'chain');
      }
    }
    ripple(room, x, y, '#bdfcff', 138, 0.38);
    burst(room, x, y, '#ffffff', 18, 260, 0.36, 3.2);
    scatterSparks(room, x, y, 3);
    addShake(0.18);
  },
  rubble(room, o, x, y) {
    // Cheap destructible debris: just enough dust/sparks to say “the room is changing”
    // without paying the full loot-piñata cost.
    if (Math.random() < 0.55) scatterSparks(room, x, y, 1);
  },
  wallSegment(room, o, x, y) {
    // the divider is breached — a wide passage opens
    addFloat(room, x, y - 20, '✦', room.biome.pal.accent2, true, 0.55);
    burst(room, x, y, room.biome.pal.accent3, 22, 220, 0.5, 4);
    addShake(0.14);
  },
  cacheAltar(room, o, x, y) { cacheAltarBreak(room, x, y, o.level || 0); },
  gambitAltar(room, o, x, y) { gambitAltarBreak(room, x, y, o.level || 0); },
  mirrorVault(room, o, x, y) { mirrorVaultBreak(room, x, y, o.level || 0); },
  annexDoor(room, o, x, y) {
    const annex = room.annex;
    if (!annex || annex.opened) return;
    annex.opened = true;
    if (annex.kind === 'ambush') {
      addFloat(room, x, y - 24, '!', room.biome.pal.bad, true, 0.58);
      // The sealed room opens as a spill-out, not a closet full of trapped enemies:
      // spawn just outside the doorway with tiny telegraphs so they immediately join
      // the fight and don't clip the player inside the annex.
      const target = state.run?.player || { x: x, y: y };
      const rush = norm(target.x - annex.cx, target.y - annex.cy);
      for (let i = 0; i < annex.ambushCount; i++) {
        const p = annexExitPoint(room, annex, o, i, annex.ambushCount);
        const q = spawnTelegraphed(room, annex.ambushType, p.x, p.y, 0.07 + i * 0.055);
        if (q) { q.rushX = rush.x * (280 + i * 45); q.rushY = rush.y * (280 + i * 45); }
      }
      ripple(room, x, y, room.biome.pal.bad, 150, 0.34);
    } else {
      addFloat(room, x, y - 24, '◆', '#ffd36e', true, 0.58);
      dropPickup(room, annex.reward, annex.cx, annex.cy);
      scatterSparks(room, annex.cx, annex.cy, 5);
    }
  },
  volatileShard(room, o, x, y) {
    // chain reaction (No Moon game_inline.js:9887)
    const radius = 92 + 1.2 * (o.rad || 24);
    const p = state.run.player;
    if (dist(x, y, p.x, p.y) < radius + p.r) hurtPlayer(1, x, y, 'volatile');
    const dmg = p.damage * (1 + p.perks.damage * 0.15) * 0.85;
    for (const e of room.enemies) {
      const d = dist(x, y, e.x, e.y);
      if (e.hp > 0 && d < radius + e.r) {
        const k = norm(e.x - x, e.y - y);
        damageEnemy(e, dmg * (1 - (d / radius) * 0.45), k.x * 200, k.y * 200, 'chain');
      }
    }
    burst(room, x, y, '#bfe8ff', 18, 240, 0.5, 3);
    addShake(0.18);
    for (const other of room.obstacles) {
      if (other !== o && !other.gone && other.species === 'volatileShard') {
        const ox = other.type === 'circle' ? other.x : other.x + other.w / 2;
        const oyy = other.type === 'circle' ? other.y : other.y + other.h / 2;
        if (dist(x, y, ox, oyy) < radius + (other.rad || 24)) {
          setTimeout(() => { if (!other.gone && state.room === room) breakObstacle(room, other); }, 90);
        }
      }
    }
  },
};

function annexExitPoint(room, annex, door, i, total) {
  const cx = door.x + door.w / 2;
  const cy = door.y + door.h / 2;
  const spread = (i - (total - 1) / 2) * 58 + (Math.random() * 18 - 9);
  const push = 78 + Math.random() * 28;
  const wall = room.wall + 36;
  if (annex.side === 'n') {
    return { x: clampLocal(cx + spread, wall, room.w - wall), y: clampLocal(cy + push, wall, room.h - wall) };
  }
  if (annex.side === 'e') {
    return { x: clampLocal(cx - push, wall, room.w - wall), y: clampLocal(cy + spread, wall, room.h - wall) };
  }
  return { x: clampLocal(cx + push, wall, room.w - wall), y: clampLocal(cy + spread, wall, room.h - wall) };
}

function clampLocal(v, a, b) { return Math.max(a, Math.min(b, v)); }

function scatterSparks(room, x, y, n) {
  for (let i = 0; i < n; i++) dropPickup(room, 'spark', x + Math.random() * 20 - 10, y + Math.random() * 20 - 10);
}

function debtAmbush(room, x, y, n) {
  const pool = ['skitter', 'skitter', 'gunner'];
  for (let i = 0; i < n; i++) {
    const type = pool[Math.floor(Math.random() * pool.length)];
    spawnTelegraphed(room, type, x + Math.random() * 120 - 60, y + Math.random() * 90 - 45, 0.6 + i * 0.2);
  }
}
