// Room events — the spice slot (No Moon breach flavors reframed in-room,
// game_inline.js:11994-12379, plus Boon Moots care objects index.html:895-897).
// The roller calls applyEvent after hazards/waves are built.
import { state } from '../state.js';
import { dist, rand, randi, pick, chance, weightedPick, norm } from '../rng.js';
import { dropPickup } from './pickups.js';
import { addSlowFog, addPulseHazard } from './hazards.js';
import { spawnTelegraphed } from './enemies.js';
import { hurtPlayer } from './combat.js';
import { chooseCards } from './draft.js';
import { addFloat, burst } from '../render/particles.js';
import { sfx } from '../audio/sfx.js';
import { stacks } from './items.js';
import { notice } from './notices.js';

const EVENTS = [
  { id: 'care',         w: 5, from: 1 },
  { id: 'moonCache',    w: 6, from: 2 },
  { id: 'gambitShrine', w: 5, from: 3 },
  { id: 'ambushNest',   w: 5, from: 4 },
  { id: 'marrowSpring', w: 4, from: 5 },
  { id: 'mirrorVault',  w: 7, from: 2 },
  { id: 'blackMarket',  w: 3, from: 7 },
];

export function rollEvent(room, rng) {
  const run = state.run;
  if (room.bossId) return; // boss arenas stay clean
  run.sinceEvent = run.sinceEvent ?? 99;
  const force = run.sinceEvent >= 3;
  const odds = room.mutator?.eventBoost ? 0.86 : 0.58;
  if (!force && !chance(rng, odds)) { run.sinceEvent++; return; }
  const pool = EVENTS.filter(e => e.from <= room.round)
    .map(e => ({ item: e.id, w: e.w + (room.round >= 7 && (e.id === 'blackMarket' || e.id === 'mirrorVault') ? 2 : 0) }));
  if (!pool.length) { run.sinceEvent++; return; }
  room.eventId = weightedPick(rng, pool);
  run.sinceEvent = 0;
  apply[room.eventId]?.(room, rng);
}

function eventSpot(room, rng, margin = 200) {
  for (let tries = 0; tries < 30; tries++) {
    const x = rand(rng, room.wall + margin, room.w - room.wall - margin);
    const y = rand(rng, room.wall + margin * 0.7, room.h - room.wall - margin);
    if (dist(x, y, room.w / 2, room.h * 0.66) < 390) continue;
    let ok = true;
    for (const o of room.obstacles) {
      const ox = o.type === 'circle' ? o.x : o.x + o.w / 2;
      const oy = o.type === 'circle' ? o.y : o.y + o.h / 2;
      if (dist(x, y, ox, oy) < 90) { ok = false; break; }
    }
    if (ok) return { x, y };
  }
  return { x: room.w / 2, y: room.h * 0.3 };
}

const apply = {
  care(room, rng) {
    const p = state.run.player;
    const n = Math.min(1 + Math.floor(stacks(p, 'gigi') / 2), 2);
    room.care = room.care || [];
    for (let i = 0; i < n; i++) {
      const s = eventSpot(room, rng, 170);
      room.care.push({ x: s.x, y: s.y, r: 34, used: false, kind: pick(rng, ['lamp', 'bench', 'umbrella', 'pie']), phase: rng() * 6 });
    }
  },
  moonCache(room, rng) {
    const s = eventSpot(room, rng);
    addBreakableAltar(room, s, 'cacheAltar', 8 + room.idx * 2);
  },
  gambitShrine(room, rng) {
    const s = eventSpot(room, rng);
    addBreakableAltar(room, s, 'gambitAltar', 11 + room.idx * 2.2);
  },
  ambushNest(room, rng) {
    // extra pressure now, a heart at the door later (rooms.js reads eventId)
    const extra = 2 + Math.floor(room.idx * 0.5);
    const types = ['skitter', 'skitter', 'gunner', 'charger'].filter((t, i) => i < 2 + room.idx);
    if (room.pendingWaves?.[0]) {
      for (let i = 0; i < extra; i++) {
        room.pendingWaves[0].spawns.push({
          type: pick(rng, types),
          x: rand(rng, room.wall + 90, room.w - room.wall - 90),
          y: rand(rng, room.wall + 80, room.h * 0.4),
          delay: 1.2 + i * 0.2,
        });
      }
    }
    for (let i = 0; i < 2; i++) {
      const s = eventSpot(room, rng, 160);
      addSlowFog(room, s.x, s.y, { r: 110, slow: 0.56 });
    }
  },
  marrowSpring(room, rng) {
    const s = eventSpot(room, rng);
    room.hazards.push({ type: 'lotus', x: s.x, y: s.y, r: 150, slow: 0.62, phase: 0, cd: 0, hitCd: 0, color: '#c9f7e2' });
    dropPickup(room, 'marrow', s.x, s.y, { life: 9999 });
  },
  mirrorVault(room, rng) {
    const s = eventSpot(room, rng);
    // Contents stay hidden until the shell cracks. No pickups/enemies are placed
    // under the seal, so the vault can actually surprise you.
    room.obstacles.push({
      type: 'circle', x: s.x, y: s.y, rad: 58, style: 'glassNode',
      breakable: true, species: 'mirrorVault', hp: 10 + room.idx * 2, altar: true, secretSeal: true,
      phase: rng() * 6.28,
    });
    for (let i = 0; i < 3; i++) {
      room.setpieces = room.setpieces || [];
      room.setpieces.push({
        kind: 'moonPool', x: s.x + Math.cos((i / 3) * 6.28) * 72, y: s.y + Math.sin((i / 3) * 6.28) * 72,
        r: 14, color: room.biome.pal.accent2, phase: rng() * 6.28,
      });
    }
  },
  blackMarket(room, rng) {
    const s = eventSpot(room, rng);
    room.care = room.care || [];
    room.care.push({ x: s.x, y: s.y, r: 36, used: false, kind: 'market', phase: rng() * 6 });
    addPulseHazard(room, s.x, s.y, { r: 28, span: 240, period: 2.6 });
  },
};

function addBreakableAltar(room, s, species, hp, level = s.level || 0) {
  room.obstacles.push({
    type: 'circle', x: s.x, y: s.y, rad: 40, style: 'basilicaIdol',
    breakable: true, species, hp, altar: true, level,
  });
}

// ── altar outcomes (called from breakables.js) ───────────────────────────────

export function mirrorVaultBreak(room, x, y, level = 0) {
  const roll = Math.random();
  if (roll < 0.44) {
    addFloat(room, x, y - 30, '!', room.biome.pal.bad, true, 0.72);
    const n = 3 + Math.floor(room.idx * 0.42);
    for (let i = 0; i < n; i++) {
      const a = (i / Math.max(1, n)) * Math.PI * 2 + Math.random() * 0.35;
      const rr = 64 + Math.random() * 46;
      const sx = x + Math.cos(a) * rr, sy = y + Math.sin(a) * rr;
      const q = spawnTelegraphed(room, pick(Math.random, ['skitter', 'skitter', 'gunner', 'hexer']), sx, sy, 0.10 + i * 0.055);
      if (q) {
        const rush = norm(sx - x, sy - y);
        q.rushX = rush.x * (330 + i * 42);
        q.rushY = rush.y * (330 + i * 42);
      }
    }
    burst(room, x, y, room.biome.pal.bad, 32, 300, 0.46, 3.8);
    sfx('telegraph');
  } else {
    addFloat(room, x, y - 30, '◆◆', '#ffd36e', true, 0.72);
    dropPickup(room, pick(Math.random, ['rapid', 'marrow', 'frame']), x - 26, y, { life: 9999, level });
    dropPickup(room, pick(Math.random, ['amp', 'repair', 'heart']), x + 26, y, { life: 9999, level });
    burst(room, x, y, '#ffd36e', 28, 280, 0.46, 3.8);
    sfx('pickup');
  }
}


export function cacheAltarBreak(room, x, y, level = 0) {
  dropCore(room, x - 18, y, level);
  dropPickup(room, pick(Math.random, ['heart', 'repair', 'amp', 'rapid', 'frame']), x + 18, y, { level });
  addFloat(room, x, y - 26, '◆', '#ffd36e', true);
}

export function gambitAltarBreak(room, x, y, level = 0) {
  const roll = Math.random();
  if (roll < 0.28) {
    addFloat(room, x, y - 26, '✦✦', '#ffd36e', true);
    dropCore(room, x - 20, y, level); dropCore(room, x + 20, y, level);
    if (Math.random() < 0.55) dropPickup(room, pick(Math.random, ['heart', 'marrow', 'amp', 'rapid']), x, y + 26, { level });
  } else if (roll < 0.58) {
    addFloat(room, x, y - 26, '!', '#ff8fa3', true);
    const n = 2 + Math.floor(room.idx * 0.4);
    for (let i = 0; i < n; i++) {
      spawnTelegraphed(room, pick(Math.random, ['skitter', 'gunner', 'charger']), x + Math.random() * 160 - 80, y + Math.random() * 120 - 60, 0.42 + i * 0.13);
    }
  } else if (roll < 0.78) {
    addFloat(room, x, y - 26, '☾', '#dcb0ff', true);
    addPulseHazard(room, x, y, { r: 30, span: 280, period: 2.15 });
    dropCore(room, x, y + 20, level);
  } else {
    addFloat(room, x, y - 26, '+♥', '#b9ffb8', true);
    dropPickup(room, 'repair', x - 16, y, { level });
    dropPickup(room, 'repair', x + 16, y, { level });
  }
}

export function dropCore(room, x, y, level = 0) {
  const fresh = chooseCards(1)[0];
  if (!fresh) return;
  dropPickup(room, 'core', x, y, { itemId: fresh.id, life: 9999, r: 12, level });
}

// ── care / market objects (touch once) ──────────────────────────────────────
export function updateCare(room, dt) {
  if (!room.care) return;
  const p = state.run.player;
  for (const c of room.care) {
    c.phase += dt;
    if (c.used || dist(c.x, c.y, p.x, p.y) > c.r + p.r + 10) continue;
    c.used = true;
    if (c.kind === 'market') {
      hurtPlayer(1, c.x, c.y, 'bargain');
      p.inv = Math.max(p.inv, 1.2);
      dropCore(room, c.x - 16, c.y - 30);
      if (Math.random() < 0.62) dropCore(room, c.x + 16, c.y - 30);
      addFloat(room, c.x, c.y - 40, '−1 ♥', '#ffd47a', true);
      sfx('break');
    } else {
      p.hp = Math.min(p.maxHp, p.hp + (c.kind === 'pie' ? 2 : 1));
      p.shield = Math.min(Math.max(1, p.shieldMax || 1), p.shield + 1);
      p.dashCd = 0; // care also refreshes your dash
      addFloat(room, c.x, c.y - 40, '♥', '#9bffd1', true);
      if (!state.run.flags.care) { state.run.flags.care = true; notice('care'); }
      sfx('care');
    }
    burst(room, c.x, c.y, '#9bffd1', 24, 160, 0.6, 3);
  }
}
