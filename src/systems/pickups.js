// Floor pickups: sparks (score/pulse/meta), repair, heart, marrow, module cores (Phase 4).
import { state } from '../state.js';
import { dist, norm } from '../rng.js';
import { burst, addFloat } from '../render/particles.js';
import { sfx } from '../audio/sfx.js';
import { sparkScore } from './score.js';
import { grantItem } from './draft.js';

export function dropPickup(room, type, x, y, opts = {}) {
  room.pickups.push({
    type, x, y,
    vx: (Math.random() * 160 - 80), vy: (Math.random() * 160 - 80),
    r: type === 'spark' ? 6 : 11, life: opts.life ?? 10, level: opts.level ?? null, ...opts,
  });
}

export function updatePickups(room, dt) {
  const p = state.run.player;
  for (let i = room.pickups.length - 1; i >= 0; i--) {
    const q = room.pickups[i];
    q.life -= dt;
    const d = dist(q.x, q.y, p.x, p.y);
    const levelOk = q.level == null || q.level === (p.level || 0);
    if (levelOk && d < p.pickup + q.r) {
      const k = norm(p.x - q.x, p.y - q.y);
      q.vx += k.x * 780 * dt; q.vy += k.y * 780 * dt;
    }
    q.x += q.vx * dt; q.y += q.vy * dt;
    q.vx *= Math.pow(0.18, dt); q.vy *= Math.pow(0.18, dt);
    if (levelOk && d < p.r + q.r + 6) {
      collect(room, p, q);
      room.pickups.splice(i, 1);
      continue;
    }
    if (q.life <= 0) room.pickups.splice(i, 1);
  }
}

function collect(room, p, q) {
  switch (q.type) {
    case 'spark':
      sparkScore();
      break;
    case 'repair':
      p.hp = Math.min(p.maxHp, p.hp + 2);
      addFloat(room, p.x, p.y - 40, '+2', '#7efab7');
      sfx('care');
      break;
    case 'heart':
      p.maxHp += 1; p.hp = Math.min(p.maxHp, p.hp + 1);
      addFloat(room, p.x, p.y - 40, '+1 ♥', '#ff8ea6', true);
      sfx('care');
      break;
    case 'marrow':
      p.maxHp += 1; p.hp = Math.min(p.maxHp, p.hp + 2);
      addFloat(room, p.x, p.y - 40, '✦', '#f7d7ff', true);
      sfx('care');
      break;
    case 'amp':
      p.perks.damage += 1;
      addFloat(room, p.x, p.y - 40, '+15%', '#ffbe73');
      sfx('care');
      break;
    case 'rapid':
      p.perks.fire += 1;
      addFloat(room, p.x, p.y - 40, '+⚡', '#9fd2ff');
      sfx('care');
      break;
    case 'frame':
      p.perks.speed += 1;
      p.speed = p.baseSpeed * (1 + 0.08 * p.perks.speed);
      addFloat(room, p.x, p.y - 40, '+→', '#b6f69d');
      sfx('care');
      break;
    case 'core':
      grantItem(q.itemId, 'found');
      break;
    default:
      sfx('pickup');
  }
  burst(room, q.x, q.y, q.type === 'spark' ? room.biome.pal.accent : '#fff', q.type === 'spark' ? 2 : 10, 120, 0.3, 2);
}

// clear-time vacuum: pull every spark home so the portal moment feels paid
export function vacuumSparks(room) {
  const p = state.run.player;
  for (const q of room.pickups) {
    if (q.type !== 'spark') continue;
    const k = norm(p.x - q.x, p.y - q.y);
    q.vx = k.x * 900; q.vy = k.y * 900;
    q.life = Math.max(q.life, 3);
  }
}
