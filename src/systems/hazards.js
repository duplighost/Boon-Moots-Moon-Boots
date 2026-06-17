// Biome hazards at Boon Moots kit scale. The projectile-spitting kinds (spore/
// snare/thorn/shard/volatile) were retired — they were unkillable and stalled the
// pace — so roomRoller furnishes those biomes with breakable cover instead. What
// remains is choreography you dodge, not turrets: altar shockwaves (pulse/ritual),
// laser lanes (lane/sightline), the enemy-slowing lotus, and the transient slow-fog
// spawned by broken cysts / captain deaths / the Spiggot boss.
import { state } from '../state.js';
import { clamp, dist, rand, randi } from '../rng.js';
import { HAZARD_KITS } from '../data/hazardKits.js';
import { hurtPlayer } from './combat.js';

export function seedHazards(room, rng) {
  const type = room.biome.hazard;
  const kit = HAZARD_KITS[type];
  if (!kit) return;
  const stage = room.stage;
  const w = room.wall;

  if (type === 'pulse' || type === 'ritual') {
    const spots = kit.altars === 1
      ? [{ x: room.w * 0.5, y: room.h * 0.48 }]
      : [{ x: room.w * 0.5, y: room.h * 0.40 }, { x: room.w * 0.34, y: room.h * 0.62 }, { x: room.w * 0.66, y: room.h * 0.62 }];
    for (const s of spots) {
      room.hazards.push({
        type, x: s.x + rand(rng, -40, 40), y: s.y + rand(rng, -30, 30), r: kit.r,
        period: Math.max(1.2, rand(rng, kit.period[0], kit.period[1]) + (kit.perStage.period || 0) * stage),
        active: kit.active, waveSpan: Math.min(room.w, room.h) * kit.waveSpan,
        t: rng() * 2, wave: 0, on: false, hitCd: 0,
        color: type === 'ritual' ? room.biome.pal.accent : room.biome.pal.accent2,
      });
    }
    return;
  }

  if (type === 'lane' || type === 'sightline') {
    const n = Math.round(clamp(randi(rng, kit.count[0], kit.count[1]) + (kit.perStage.count || 0) * stage, 2, 7))
      - (state.runMobileLite ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const vertical = type === 'lane' ? i % 2 === 0 : rng() < 0.45;
      const pos = vertical ? rand(rng, w + 200, room.w - w - 200) : rand(rng, w + 170, room.h - w - 170);
      room.lanes.push({
        type, vertical,
        x1: vertical ? pos : w + 40, y1: vertical ? w + 40 : pos,
        x2: vertical ? pos : room.w - w - 40, y2: vertical ? room.h - w - 40 : pos,
        width: kit.width,
        t: rng() * 2.4,
        period: Math.max(1.6, rand(rng, kit.period[0], kit.period[1]) + (kit.perStage.period || 0) * stage),
        telegraphFrom: kit.telegraphFrom, activeFrom: kit.activeFrom, activeTo: kit.activeTo,
        active: false, tele: false, hitCd: 0,
        color: vertical ? room.biome.pal.accent : room.biome.pal.accent2,
      });
    }
    return;
  }

  // Any other biome.hazard (fog/spore/snare/thorn/shard/volatile) seeds nothing.
  // Those projectile/area hazards are retired: snare/thorn/shard/volatile biomes
  // get breakable cover from roomRoller; fog/spore biomes stay clear.
}

export function updateHazards(room, dt) {
  const p = state.run.player;
  // once the room is cleared the walk to the portal is a victory lap: the
  // remaining hazards (altar pulses, laser lanes, lingering fog) go inert.
  // draw.js dims them so it reads as off.
  if (room.cleared) return;
  for (const h of room.hazards) {
    h.phase = (h.phase || 0) + dt;
    h.cd = Math.max(0, (h.cd || 0) - dt);
    h.hitCd = Math.max(0, (h.hitCd || 0) - dt);
    const d = dist(h.x, h.y, p.x, p.y);
    const harm = (h.level || 0) === p.level; // only harms a player on its level

    if (h.type === 'lotus') {
      // slows ENEMIES only (marrowSpring's gift / blackLotus load-in bloom)
      if (h.life !== undefined) { h.life -= dt; }
      for (const e of room.enemies) {
        if (e.hp > 0 && dist(h.x, h.y, e.x, e.y) < h.r + e.r) {
          e.slowTimer = Math.max(e.slowTimer || 0, 0.2);
          e.slowMul = Math.min(e.slowMul, h.slow);
        }
      }
    } else if (h.type === 'fog') {
      // transient slow-fog (broken cyst / captain death / Spiggot boss): slows
      // only — never spits, never damages. Biome ambient fog is no longer seeded.
      if (harm && d < h.r + p.r) {
        p.vx *= Math.pow(h.slow, dt * 8); p.vy *= Math.pow(h.slow, dt * 8);
      }
    } else if (h.type === 'pulse' || h.type === 'ritual') {
      h.t = ((h.t || 0) + dt) % h.period;
      const on = h.t > 0.64;
      h.on = on;
      h.wave = on ? ((h.t - 0.64) / Math.max(0.1, h.period - 0.64)) * h.waveSpan : 0;
      if (harm && on && h.hitCd <= 0 && Math.abs(d - h.wave) < p.r + 10 && p.inv <= 0) {
        h.hitCd = 0.55;
        hurtPlayer(1, h.x, h.y, 'hazard');
      }
    }
  }

  for (let i = room.hazards.length - 1; i >= 0; i--) {
    if (room.hazards[i].life !== undefined && room.hazards[i].life <= 0) room.hazards.splice(i, 1);
  }

  for (const l of room.lanes) {
    l.t = ((l.t || 0) + dt) % l.period;
    l.hitCd = Math.max(0, (l.hitCd || 0) - dt);
    const ph = l.t / l.period;
    l.tele = ph > l.telegraphFrom && ph <= l.activeFrom;
    l.active = ph > l.activeFrom && ph < l.activeTo;
    if (l.active && l.hitCd <= 0 && p.inv <= 0 && (l.level || 0) === p.level &&
        distPointSegment(p.x, p.y, l.x1, l.y1, l.x2, l.y2) < p.r + l.width * 0.5) {
      l.hitCd = 0.65;
      hurtPlayer(1, (l.x1 + l.x2) / 2, (l.y1 + l.y2) / 2, 'hazard');
    }
  }
}

export function distPointSegment(px, py, x1, y1, x2, y2) {
  const vx = x2 - x1, vy = y2 - y1, wx = px - x1, wy = py - y1;
  const c = clamp((wx * vx + wy * vy) / Math.max(1, vx * vx + vy * vy), 0, 1);
  return Math.hypot(px - (x1 + vx * c), py - (y1 + vy * c));
}

export function addPulseHazard(room, x, y, opts = {}) {
  room.hazards.push({
    type: 'pulse', x, y, r: opts.r || 30,
    period: opts.period || 2.6, active: 0.42, waveSpan: opts.span || 240,
    t: 0, wave: 0, on: false, hitCd: 0,
    color: opts.color || room.biome.pal.accent2,
  });
}

export function addSlowFog(room, x, y, opts = {}) {
  room.hazards.push({
    type: 'fog', x, y, r: opts.r || 96, slow: opts.slow || 0.58,
    phase: 0, cd: 0, hitCd: 0, color: opts.color || room.biome.pal.accent,
  });
}
