// Enemy AI — all 8 No Moon archetypes per docs/no-moon-systems.md §1
// (source anchors game_inline.js:8906-9024). Scaling inputs come from the room:
// room.idx (0-9 compressed depth) and room.stage (danger stage 0-5+).
import { state } from '../state.js';
import { TAU, DIRECTOR, HUNT } from '../config.js';
import { clamp, damp, dist, norm } from '../rng.js';
import { particle, addFloat } from '../render/particles.js';
import { fireEnemyBurst, fireEnemyRing, fireEnemyShot } from './bullets.js';
import { hurtPlayer } from './combat.js';
import { resolveCircleObstacle } from './player.js';
import { ENEMY_TYPES } from '../data/enemies.js';
import { sfx } from '../audio/sfx.js';
import { levelAt } from './levels.js';
import { damageObstacle } from './breakables.js';

// Charging enemies should make the room react: they pulverize soft cover, but never
// secret doors, cracked architecture, dash bells, altars, or volatile shards.
const RAMMABLE = new Set(['rubble', 'marrowJar', 'rootCyst', 'bellHusk', 'moonseedUrn']);
function smashThroughCover(room, e) {
  for (const o of room.obstacles) {
    if (o.gone || !o.breakable || !RAMMABLE.has(o.species)) continue;
    const ox = o.type === 'circle' ? o.x : o.x + o.w / 2;
    const oy = o.type === 'circle' ? o.y : o.y + o.h / 2;
    const orad = o.type === 'circle' ? o.rad : Math.max(o.w, o.h) / 2;
    if (dist(e.x, e.y, ox, oy) < e.r + orad) damageObstacle(room, o, 99);
  }
}

let nextId = 1;

export function makeEnemy(type, x, y, room) {
  const def = ENEMY_TYPES[type];
  const idx = room.idx, stage = room.stage;
  const hpScale = 1 + idx * DIRECTOR.HP_IDX + stage * DIRECTOR.HP_STAGE;
  const spdScale = 1 + idx * DIRECTOR.SPD_IDX + stage * DIRECTOR.SPD_STAGE;
  return {
    id: nextId++, type, display: def.display,
    x, y, vx: 0, vy: 0, r: def.r,
    hp: def.hp * hpScale, maxHp: def.hp * hpScale,
    speed: def.speed * spdScale, score: def.score, color: def.color,
    phase: Math.random() * TAU, seed: Math.random() * TAU, level: 0,
    cd: 0.4 + Math.random() * 1.4, hit: 0, stun: 0, tele: 0,
    slowTimer: 0, slowMul: 1,
    captain: null, captainDeath: null, boss: false,
    state: 'idle', aimT: 0, chargeX: 0, chargeY: 0, dashT: 0, hopCd: 0,
  };
}

export function updateEnemies(room, dt) {
  const p = state.run.player;
  const idx = room.idx, stage = room.stage;
  for (let i = room.enemies.length - 1; i >= 0; i--) {
    const e = room.enemies[i];
    if (e.hp <= 0) { room.enemies.splice(i, 1); continue; }
    e.phase += dt;
    e.cd -= dt;
    e.hit = Math.max(0, e.hit - dt * 5);
    e.stun = Math.max(0, e.stun - dt);
    e.invulnT = Math.max(0, (e.invulnT || 0) - dt); // boss phase-shift untouchable window
    e.tele = Math.max(0, e.tele - dt);
    e.hopCd = Math.max(0, (e.hopCd || 0) - dt);
    if (e.slowTimer > 0) { e.slowTimer -= dt; if (e.slowTimer <= 0) e.slowMul = 1; }

    const to = norm(p.x - e.x, p.y - e.y);
    const d = to.m;
    const spd = e.speed * e.slowMul;
    let ax = 0, ay = 0, lambda = 5.7;

    if (e.stun <= 0 && (e.boss ? updateBoss(e, room, p, to, d, dt) : true)) {
      switch (e.boss ? 'none' : e.type) {
        case 'skitter': {
          const wig = 1.08 + Math.sin(e.phase * 5) * 0.12;
          ax = to.x * spd * wig + Math.cos(e.phase * 6 + e.seed) * 52;
          ay = to.y * spd * wig + Math.sin(e.phase * 5 + e.seed) * 52;
          if (e.cd <= 0 && d < 170) { e.cd = 0.72 + Math.random() * 0.4; e.vx += to.x * 260; e.vy += to.y * 260; }
          lambda = 7.5;
          break;
        }
        case 'gunner': {
          const want = d < 210 ? -1 : d > 320 ? 1 : 0.12;
          const orbit = Math.sin(e.seed) >= 0 ? 1 : -1;
          ax = to.x * spd * want + (-to.y) * orbit * spd * 0.7;
          ay = to.y * spd * want + (to.x) * orbit * spd * 0.7;
          if (e.cd <= 0 && d < 760) {
            e.cd = Math.max(0.9, 1.55 - idx * 0.04);
            const count = 1 + (stage >= 2 ? 1 : 0) + (stage >= 4 ? 1 : 0);
            fireEnemyBurst(room, e, p.x, p.y, count, 0.18, 340 + idx * 14, 2.9);
          }
          break;
        }
        case 'charger': {
          if (e.state === 'windup') {
            ax = ay = 0;
            if (e.tele <= 0.02) {
              e.state = 'dash'; e.dashT = 0.42;
              const thrust = 450 + 18 * stage;
              e.vx = e.chargeX * thrust; e.vy = e.chargeY * thrust;
            }
          } else if (e.state === 'dash') {
            e.dashT -= dt;
            e.vx *= Math.pow(0.96, dt * 60); e.vy *= Math.pow(0.96, dt * 60);
            smashThroughCover(room, e);
            if (e.dashT <= 0) { e.state = 'idle'; e.cd = Math.max(1.7, 2.6 - stage * 0.12); }
          } else {
            ax = to.x * spd * 0.84; ay = to.y * spd * 0.84;
            if (e.cd <= 0 && d < 290) {
              e.state = 'windup'; e.tele = 0.55;
              e.chargeX = to.x; e.chargeY = to.y;
              addFloat(room, e.x, e.y - e.r - 12, '»', room.biome.pal.bad, false, 0.42);
              sfx('telegraph');
            }
          }
          break;
        }
        case 'turret': {
          const orbit = Math.sin(state.room.time * 1.8 + e.seed) * 22;
          ax = -to.y * orbit; ay = to.x * orbit;
          if (e.cd <= 0 && d < 800) {
            e.cd = Math.max(1.0, 2.15 - idx * 0.05);
            if (stage >= 2 && Math.random() < 0.45) {
              fireEnemyRing(room, e, 8 + (stage >= 4 ? 2 : 0), 235 + idx * 9, 3.7, e.color, e.seed + e.phase * 0.3);
            } else {
              fireEnemyBurst(room, e, p.x, p.y, 4 + (stage >= 4 ? 1 : 0), 0.52, 300 + idx * 12, 3.2);
            }
          }
          lambda = 7;
          break;
        }
        case 'brute': {
          ax = to.x * spd; ay = to.y * spd;
          if (e.cd <= 0 && d < 460) {
            e.cd = Math.max(1.6, 2.5 - idx * 0.04);
            fireEnemyBurst(room, e, p.x, p.y, 5 + (stage >= 4 ? 1 : 0), 0.58, 260 + idx * 10, 3.4);
          }
          lambda = 5;
          break;
        }
        case 'sniper': {
          const want = d < 380 ? -1 : d > 720 ? 1 : 0.05;
          ax = to.x * spd * want + Math.cos(e.phase * 1.2) * 38;
          ay = to.y * spd * want + Math.sin(e.phase * 1.1) * 38;
          if (e.aimT > 0) {
            e.aimT -= dt; ax *= 0.2; ay *= 0.2;
            if (e.aimT <= 0.03 && e.snipeX !== undefined) {
              fireEnemyShot(room, e, e.snipeX, e.snipeY, 520 + idx * 18, 4.9, 3.0, '#bfe6ff');
              e.snipeX = undefined;
            }
          } else if (e.cd <= 0 && d < 980) {
            e.cd = Math.max(1.8, 2.8 - stage * 0.08);
            e.aimT = 0.88; e.tele = 0.88;
            e.snipeX = to.x; e.snipeY = to.y;
            addFloat(room, e.x, e.y - e.r - 10, '◇', room.biome.pal.bad, false, 0.42);
            sfx('telegraph');
          }
          lambda = 5.5;
          break;
        }
        case 'hexer': {
          const orbDir = Math.sin(e.seed * 3) >= 0 ? 1 : -1;
          const want = d > 280 ? 1 : -0.22;
          ax = to.x * spd * want + (-to.y) * orbDir * spd * 0.72;
          ay = to.y * spd * want + (to.x) * orbDir * spd * 0.72;
          if (e.cd <= 0 && d < 860) {
            e.cd = Math.max(1.7, 2.7 - stage * 0.08);
            fireEnemyRing(room, e, 6 + (stage >= 4 ? 2 : 0), 240 + idx * 10, 3.6, '#97ffd6', e.phase * 0.7);
          }
          lambda = 6;
          break;
        }
        case 'myrmidon': {
          const orbDir = Math.sin(e.seed * 2) >= 0 ? 1 : -1;
          ax = (-to.y) * orbDir * spd * 0.72 + (d > 240 ? to.x * spd * 0.82 : 0) + (-to.y) * orbDir * spd * 0.48 * Math.sin(e.phase * 2);
          ay = (to.x) * orbDir * spd * 0.72 + (d > 240 ? to.y * spd * 0.82 : 0) + (to.x) * orbDir * spd * 0.48 * Math.sin(e.phase * 2);
          if (e.hopCd <= 0 && d < 260) {
            e.hopCd = 1.6;
            e.vx -= to.x * 170; e.vy -= to.y * 170;
          }
          if (e.cd <= 0 && d < 680) {
            e.cd = Math.max(1.0, 1.85 - stage * 0.05);
            fireEnemyBurst(room, e, p.x, p.y, 3 + (stage >= 4 ? 2 : 1), 0.42, 330 + idx * 14, 3.0);
          }
          lambda = 7;
          break;
        }
      }
      // Anti-search convergence: an enemy stranded far across the endless sprawl
      // drops its spacing game and homes in (extra steer + a speed ramp), so the
      // player never hunts for the last few. Inside HUNT.FAR each archetype brain
      // owns movement again — ranged still holds range, so you must zip in to finish.
      if (!e.boss && d > HUNT.FAR && (e.type !== 'charger' || e.state === 'idle')) {
        const hf = clamp((d - HUNT.FAR) / (HUNT.FULL - HUNT.FAR), 0, 1);
        const hs = spd * (1 + HUNT.SPEED_BONUS * hf);
        ax = to.x * hs; ay = to.y * hs;
        lambda = Math.max(lambda, 5.5 + HUNT.STEER * hf);
      }
      if (e.type !== 'charger' || e.state === 'idle') {
        e.vx = damp(e.vx, ax, lambda, dt);
        e.vy = damp(e.vy, ay, lambda, dt);
      }
    }

    e.x += e.vx * dt; e.y += e.vy * dt;
    const w = room.wall - 22;
    e.x = clamp(e.x, w + e.r, room.w - w - e.r);
    e.y = clamp(e.y, w + e.r, room.h - w - e.r);
    for (const o of room.obstacles) if (!o.gone) resolveCircleObstacle(e, o);
    e.level = levelAt(room, e.x, e.y);

    if (p.inv <= 0 && e.level === p.level && dist(e.x, e.y, p.x, p.y) < e.r + p.r + 2) {
      hurtPlayer(e.boss ? 2 : 1, e.x, e.y, 'contact');
      const k = norm(e.x - p.x, e.y - p.y);
      e.vx += k.x * 90; e.vy += k.y * 90;
    }
  }
  separate(room);
}

// pairwise separation (No Moon game_inline.js:9089-9111)
function separate(room) {
  const es = room.enemies;
  for (let i = 0; i < es.length; i++) {
    const a = es[i];
    if (a.type === 'charger' && a.state === 'dash') continue;
    for (let j = i + 1; j < es.length; j++) {
      const b = es[j];
      if (b.type === 'charger' && b.state === 'dash') continue;
      const minD = a.r + b.r + 12;
      const dx = b.x - a.x, dy = b.y - a.y;
      const dd = Math.hypot(dx, dy) || 1;
      if (dd < minD) {
        const f = (minD - dd) / minD * 140;
        const nx = dx / dd, ny = dy / dd;
        a.vx -= nx * f * 0.016; a.vy -= ny * f * 0.016;
        b.vx += nx * f * 0.016; b.vy += ny * f * 0.016;
        a.x -= nx * (minD - dd) * 0.3; a.y -= ny * (minD - dd) * 0.3;
        b.x += nx * (minD - dd) * 0.3; b.y += ny * (minD - dd) * 0.3;
      }
    }
  }
}

// Boss brains live in data/bosses via director (Phase 5); placeholder hook keeps
// the switch clean — returns true to fall through to normal AI.
function updateBoss(e, room, p, to, d, dt) {
  if (e.brain) { e.brain(e, room, p, to, d, dt); return false; }
  return true;
}

export function spawnTelegraphed(room, type, x, y, delay = 0.55, captain = null) {
  const q = { type, x, y, level: levelAt(room, x, y), at: room.time + delay, glyphAt: room.time, captain };
  room.spawnQueue.push(q);
  return q;
}

export function updateSpawnQueue(room, dt) {
  for (let i = room.spawnQueue.length - 1; i >= 0; i--) {
    const s = room.spawnQueue[i];
    if (room.time >= s.at) {
      room.spawnQueue.splice(i, 1);
      const e = makeEnemy(s.type, s.x, s.y, room);
      e.level = s.level ?? levelAt(room, s.x, s.y); // spawned on a platform → high ground
      if (s.rushX || s.rushY) { e.vx = s.rushX || 0; e.vy = s.rushY || 0; e.state = 'rush'; }
      if (s.captain) s.captain(e);
      room.enemies.push(e);
      particle(room, s.x, s.y, ENEMY_TYPES[s.type].color, 0, 0, 0.3, 16);
    }
  }
}
