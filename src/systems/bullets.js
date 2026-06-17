// Projectiles for both sides, with pierce/bounce hooks and obstacle cover.
import { CAPS } from '../config.js';
import { state } from '../state.js';
import { clamp, dist, norm } from '../rng.js';
import { view } from '../render/camera.js';
import { particle } from '../render/particles.js';
import { damageEnemy, hurtPlayer } from './combat.js';
import { damageObstacle } from './breakables.js';
import { hooks } from './items.js';

export function spawnBullet(room, owner, x, y, vx, vy, r, damage, life, color, opts = {}) {
  const cap = owner === 'enemy'
    ? (view.mobile ? CAPS.ENEMY_BULLETS.mobile : CAPS.ENEMY_BULLETS.desktop)
    : (view.mobile ? CAPS.PLAYER_BULLETS.mobile : CAPS.PLAYER_BULLETS.desktop);
  let count = 0;
  for (const b of room.bullets) if (b.owner === owner) count++;
  if (count > cap) return null;
  const b = { owner, x, y, vx, vy, r, damage, life, max: life, color,
    pierce: opts.pierce || 0, bounces: opts.bounces || 0, level: opts.level || 0, hitIds: null, ...opts };
  if (owner === 'player') hooks.run('onBulletSpawn', b);
  room.bullets.push(b);
  return b;
}

export function fireEnemyShot(room, e, dx, dy, speed, r, life, color) {
  return spawnBullet(room, 'enemy', e.x + dx * (e.r + 6), e.y + dy * (e.r + 6), dx * speed, dy * speed, r, 1, life, color || e.color, { level: e.boss ? 1 : (e.level || 0) });
}

// No Moon's two firing grammars (game_inline.js:5124-5167)
export function fireEnemyBurst(room, e, tx, ty, count, spread, speed, life, color) {
  const base = Math.atan2(ty - e.y, tx - e.x);
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1) - 0.5;
    const a = base + t * spread;
    fireEnemyShot(room, e, Math.cos(a), Math.sin(a), speed, 5.2, life, color);
  }
}

export function fireEnemyRing(room, e, count, speed, life, color, offset = 0) {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + offset;
    fireEnemyShot(room, e, Math.cos(a), Math.sin(a), speed, 5.0, life, color);
  }
}

// Dashing through an enemy round flips it into a small friendly shard aimed at the
// nearest enemy — rewards aggressive movement and makes bullet pressure interactive.
function convertBullet(room, b, p) {
  if (b.converted) return;
  let best = null, bd = Infinity;
  for (const e of room.enemies) {
    if (e.hp <= 0) continue;
    const d = dist(b.x, b.y, e.x, e.y);
    if (d < bd) { best = e; bd = d; }
  }
  const sp = Math.hypot(b.vx, b.vy) || 300;
  let nx, ny;
  if (best) { const n = norm(best.x - b.x, best.y - b.y); nx = n.x; ny = n.y; }
  else { nx = -b.vx / sp; ny = -b.vy / sp; } // no target: send it back the way it came
  const speed = Math.max(560, sp);
  b.owner = 'player';
  b.vx = nx * speed; b.vy = ny * speed;
  b.r = Math.max(3, b.r * 0.8);
  b.damage = (p.damage * (1 + p.perks.damage * 0.15)) * 0.6;
  b.color = '#bdfcff';
  b.converted = true;
  b.pierce = 0; b.bounces = 0; b.hitIds = null; b.turn = 0;
  b.life = Math.max(b.life, 0.6);
  b.level = p.level;
  particle(room, b.x, b.y, '#ffffff', 0, 0, 0.16, 4);
}

function hitObstacle(room, b) {
  for (const o of room.obstacles) {
    if (o.gone) continue;
    // high-ground: a bullet flies over a ledge it's at-or-above (ledgeHeight 1);
    // full walls are ledgeHeight Infinity so they always block; cover has none.
    if (o.level != null && (b.level || 0) < o.level) continue;
    if (o.ledgeHeight !== undefined && b.level >= o.ledgeHeight) continue;
    let nx, ny, inside;
    if (o.type === 'circle') {
      const d = dist(b.x, b.y, o.x, o.y);
      inside = d < o.rad + b.r;
      if (inside) { const n = norm(b.x - o.x, b.y - o.y); nx = n.x; ny = n.y; }
    } else {
      const cx = clamp(b.x, o.x, o.x + o.w), cy = clamp(b.y, o.y, o.y + o.h);
      inside = dist(b.x, b.y, cx, cy) < b.r;
      if (inside) {
        const n = norm(b.x - cx, b.y - cy);
        nx = n.m > 0.001 ? n.x : 0; ny = n.m > 0.001 ? n.y : -1;
      }
    }
    if (!inside) continue;
    if (b.owner === 'player' && o.breakable) damageObstacle(room, o, b.damage);
    // Enemy gunfire can chew through cracked architectural segments. It keeps big
    // rooms from freezing into static cover mazes, but it doesn't farm loot pots.
    if (b.owner === 'enemy' && o.breakable && o.species === 'wallSegment') damageObstacle(room, o, Math.max(0.45, b.damage * 0.38));
    if (b.owner === 'player' && b.bounces > 0) {
      const dot = b.vx * nx + b.vy * ny;
      b.vx -= 2 * dot * nx; b.vy -= 2 * dot * ny;
      b.x += nx * (b.r + 2); b.y += ny * (b.r + 2);
      b.bounces--;
      return false;
    }
    return true;
  }
  return false;
}

export function updateBullets(room, dt) {
  const p = state.run.player;
  for (let i = room.bullets.length - 1; i >= 0; i--) {
    const b = room.bullets[i];
    if (!b) continue; // defensive: never crash the rAF loop if the array shrank mid-iteration
    b.life -= dt;
    // homing (hunterMycelia hook sets b.turn)
    if (b.owner === 'player' && b.turn) {
      let best = null, bd = Infinity;
      const sp = Math.hypot(b.vx, b.vy) || 1;
      for (const e of room.enemies) {
        if (e.hp <= 0) continue;
        const d = dist(b.x, b.y, e.x, e.y);
        if (d < bd && d < 420) { best = e; bd = d; }
      }
      if (best) {
        const n = norm(best.x - b.x, best.y - b.y);
        const f = 1 - Math.exp(-b.turn * dt);
        b.vx += (n.x * sp - b.vx) * f; b.vy += (n.y * sp - b.vy) * f;
      }
    }
    b.x += b.vx * dt; b.y += b.vy * dt;
    // wall bounce for player bullets with charges
    if (b.owner === 'player' && b.bounces > 0) {
      const w = room.wall;
      if (b.x < w || b.x > room.w - w) { b.vx *= -1; b.x = clamp(b.x, w, room.w - w); b.bounces--; }
      if (b.y < w || b.y > room.h - w) { b.vy *= -1; b.y = clamp(b.y, w, room.h - w); b.bounces--; }
    }
    const out = b.x < -80 || b.y < -80 || b.x > room.w + 80 || b.y > room.h + 80;
    if (b.life <= 0 || out || hitObstacle(room, b)) { room.bullets.splice(i, 1); continue; }

    if (b.owner === 'player') {
      for (const e of room.enemies) {
        if (e.hp <= 0 || b.level < e.level) continue; // can't hit higher ground
        if (b.hitIds && b.hitIds.includes(e.id)) continue;
        if (dist(b.x, b.y, e.x, e.y) < b.r + e.r) {
          const k = norm(e.x - b.x, e.y - b.y);
          damageEnemy(e, b.damage, k.x * 120, k.y * 120, 'shot');
          particle(room, b.x, b.y, b.color, -b.vx * 0.06, -b.vy * 0.06, 0.14, 2);
          if (b.pierce > 0) {
            b.pierce--;
            (b.hitIds = b.hitIds || []).push(e.id);
          } else {
            b.life = 0;
          }
          break;
        }
      }
      if (b.life <= 0) { room.bullets.splice(i, 1); continue; }
    } else if (b.level >= p.level && dist(b.x, b.y, p.x, p.y) < b.r + p.r) {
      // conversion keys off dash STATE, not i-frames — so it survives any future i-frame retune
      if (p.dashT > 0) {
        convertBullet(room, b, p); // dash through enemy fire to flip it back at them (Cathedral's trick)
        continue;
      } else if (p.inv <= 0) {
        room.bullets.splice(i, 1);
        hurtPlayer(b.damage, b.x, b.y, 'bullet');
        continue;
      }
    }
  }
}
