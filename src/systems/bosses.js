// Boss brains. Warden + Archon are full No Moon ports (docs/no-moon-systems.md §2,
// game_inline.js:9025-9087); False Moon + Spiggot are new minibosses built on the
// same template (one signature pattern each, ~40-45% boss HP).
import { state } from '../state.js';
import { TAU } from '../config.js';
import { clamp, damp, dist, norm } from '../rng.js';
import { fireEnemyBurst, fireEnemyRing, fireEnemyShot } from './bullets.js';
import { spawnTelegraphed, makeEnemy } from './enemies.js';
import { addFloat, burst, ripple } from '../render/particles.js';
import { addSlowFog, distPointSegment } from './hazards.js';
import { hurtPlayer } from './combat.js';
import { addShake, addFlash, slowMo } from './juice.js';
import { sfx } from '../audio/sfx.js';

export const BOSSES = {
  falseMoon: {
    name: 'False Moon', round: 5, hp: 36, r: 36, speed: 70, color: '#f0b8ff',
    score: 600, card: 'false-moon-card', brain: falseMoonBrain,
  },
  warden: {
    name: 'Graven Warden', round: 10, hp: 76, r: 44, speed: 82, color: '#ffe27d',
    score: 980, card: 'warden-card', brain: wardenBrain,
  },
  spiggot: {
    name: 'Spiggot', round: 15, hp: 58, r: 38, speed: 78, color: '#9effdc',
    score: 800, card: 'spiggot-card', brain: spiggotBrain,
  },
  archon: {
    name: 'Null Archon', round: 20, hp: 126, r: 54, speed: 88, color: '#f5d9ff',
    score: 1800, card: 'archon-card', brain: archonBrain,
  },
};

const BOSS_ORDER = ['falseMoon', 'warden', 'spiggot', 'archon'];

export function bossForRound(round, overdrive) {
  if (round % 5 !== 0) return null;
  if (!overdrive && round <= 20) {
    return Object.entries(BOSSES).find(([, b]) => b.round === round)?.[0] ?? null;
  }
  // overdrive: cycle the roster, scaling handled by stage
  return BOSS_ORDER[(Math.floor(round / 5) - 1) % BOSS_ORDER.length];
}

export function makeBoss(bossId, room) {
  const def = BOSSES[bossId];
  const e = makeEnemy('skitter', room.w / 2, room.wall + 150, room); // base shell, fully overridden
  const hpScale = 1 + room.idx * 0.08 + room.stage * 0.06;
  const spdScale = 1 + room.stage * 0.03;
  Object.assign(e, {
    type: 'boss', bossId, boss: true, display: def.name,
    r: def.r, hp: def.hp * hpScale, maxHp: def.hp * hpScale,
    speed: def.speed * spdScale, color: def.color, score: def.score,
    brain: def.brain, fireCd: 1.2, ringCd: 2.4, dashCd: 3.4, summons: 0, phaseLock: 0,
    // signature-gimmick state: shield gap (warden), gravity pull (false moon),
    // spore spiral (spiggot), city-lane weapon (archon).
    shieldAngle: 0, gapHalf: 0.6, pullCd: 4, pullT: 0, armT: 0,
    spiralA: 0, spiralCd: 0, laneCd: 6, laneArmT: 0, laneLiveT: 0, laneHitCd: 0,
    slamCd: 4.6, bloomCd: 4.5, bloomHitCd: 0, eclipse: 0, // arena hooks: warden slams, spiggot blooms, moon eclipse
  });
  return e;
}

function summonFromBoss(boss, types, room) {
  for (const type of types) {
    for (let tries = 0; tries < 12; tries++) {
      const a = Math.random() * TAU, d = 34 + Math.random() * 76;
      const x = boss.x + Math.cos(a) * (boss.r + d);
      const y = boss.y + Math.sin(a) * (boss.r + d);
      if (x > room.wall + 30 && x < room.w - room.wall - 30 && y > room.wall + 30 && y < room.h - room.wall - 30) {
        spawnTelegraphed(room, type, x, y, 0.7);
        break;
      }
    }
  }
  addFloat(room, boss.x, boss.y - boss.r - 26, '❖', room.biome.pal.bad, false, 0.6);
  burst(room, boss.x, boss.y, boss.color, 16, 200, 0.5, 3);
  sfx('telegraph');
}

// Cinematic entrance, run on the boss's first live tick: bullet-time, a flash, the
// name slams in (rendered huge by draw.js off introT), the boss holds menacingly and
// is untouchable, then the fight begins. Returns true while the intro is still playing.
function bossIntro(e, room, dt) {
  if (e.introT === undefined) {
    e.introT = 1.05; e.invulnT = 1.05;
    slowMo(0.45); addFlash(0.42); addShake(0.6); sfx('telegraph');
  }
  e.introT -= dt;
  if (e.introT > 0) {
    e.vx = damp(e.vx, 0, 4, dt); e.vy = damp(e.vy, 0, 4, dt); // hold, coiled
    return true;
  }
  return false;
}

// A boss crossing 50% HP TRANSFORMS — a theatrical phase shift: wipe incoming fire
// (a fair reset, not a free hit), shockwave + flash + shake, the boss grows/recolors
// and goes ENRAGED, briefly untouchable while it changes. Each brain escalates its
// signature gimmick off e.enraged afterward.
function bossPhaseShift(e, room, label, hotColor) {
  e.phased = true;
  e.enraged = true;
  e.invulnT = 0.75;
  e.phaseLock = Math.max(e.phaseLock || 0, 0.75);
  e.color = hotColor || e.color;
  e.r *= 1.08;
  for (const b of room.bullets) if (b.owner === 'enemy') b.life = 0; // dramatic bullet-wipe (mark, never reassign mid-loop)
  burst(room, e.x, e.y, hotColor || e.color, 44, 480, 0.85, 5);
  ripple(room, e.x, e.y, '#ffffff', 340, 1.0);
  ripple(room, e.x, e.y, hotColor || e.color, 240, 0.85);
  addFlash(0.5); addShake(0.95);
  addFloat(room, e.x, e.y - e.r - 38, label, hotColor || '#ffffff', true, 1.5);
  sfx('pulse'); sfx('clear');
}

// ◆ Warden GRAVE SLAMS: marks floor zones (telegraph fills) then slams them — area
// damage. draw.js renders e.slams (s.t = telegraph countdown, s.flash = impact).
function updateGraveSlams(e, room, p, dt) {
  e.slamCd -= dt;
  if (e.slamCd <= 0) {
    e.slamCd = e.enraged ? 3.2 : 4.8;
    e.slams = e.slams || [];
    const n = e.enraged ? 4 : 3;
    for (let i = 0; i < n; i++) {
      const sx = room.wall + 220 + Math.random() * Math.max(1, room.w - room.wall * 2 - 440);
      const sy = room.wall + 220 + Math.random() * Math.max(1, room.h - room.wall * 2 - 440);
      e.slams.push({ x: sx, y: sy, r: 120 + Math.random() * 70, t: 0.95, flash: 0 });
    }
    sfx('telegraph');
  }
  if (!e.slams) return;
  for (const s of e.slams) {
    if (s.t > 0) {
      s.t -= dt;
      if (s.t <= 0) {
        s.flash = 0.3;
        burst(room, s.x, s.y, '#ffd24d', 18, 280, 0.4, 4); addShake(0.35);
        if (dist(p.x, p.y, s.x, s.y) < s.r + p.r) hurtPlayer(1, p.x, p.y, 'warden');
      }
    } else if (s.flash > 0) s.flash -= dt;
  }
  e.slams = e.slams.filter(s => s.t > 0 || s.flash > 0);
}

// ◆ Spiggot SPORE BLOOM: grows toxic fields that expand and drag/chip — keep moving.
// draw.js renders e.blooms (b.r grows to b.maxR, b.life fades them out).
function updateSporeBloom(e, room, p, dt) {
  e.bloomCd -= dt;
  if (e.bloomCd <= 0) {
    e.bloomCd = e.enraged ? 2.8 : 4.4;
    e.blooms = e.blooms || [];
    if (e.blooms.length < 6) {
      const a = Math.random() * TAU, dd = 60 + Math.random() * 240;
      e.blooms.push({
        x: clamp(e.x + Math.cos(a) * dd, room.wall + 60, room.w - room.wall - 60),
        y: clamp(e.y + Math.sin(a) * dd, room.wall + 60, room.h - room.wall - 60),
        r: 24, maxR: 150 + Math.random() * 110, life: 6,
      });
    }
    sfx('telegraph');
  }
  if (!e.blooms) return;
  e.bloomHitCd -= dt;
  let inBloom = false;
  for (const b of e.blooms) { b.life -= dt; b.r = Math.min(b.maxR, b.r + dt * 70); if (dist(p.x, p.y, b.x, b.y) < b.r * 0.82 + p.r) inBloom = true; }
  if (inBloom) {
    p.vx *= Math.pow(0.72, dt * 3); p.vy *= Math.pow(0.72, dt * 3);
    if (e.bloomHitCd <= 0) { e.bloomHitCd = 0.85; hurtPlayer(1, p.x, p.y, 'spiggot'); }
  }
  e.blooms = e.blooms.filter(b => b.life > 0);
}

// ── Graven Warden (game_inline.js:9025-9055) ────────────────────────────────
function wardenBrain(e, room, p, to, d, dt) {
  if (bossIntro(e, room, dt)) return;
  const idx = room.idx;
  const hpFrac = e.hp / e.maxHp;
  e.phaseLock = Math.max(0, (e.phaseLock || 0) - dt);
  if (hpFrac < 0.75 && e.summons < 1) { e.summons = 1; e.phaseLock = 0.70; summonFromBoss(e, ['skitter', 'gunner'], room); }
  if (hpFrac < 0.46 && e.summons < 2) { e.summons = 2; e.phaseLock = 0.82; summonFromBoss(e, ['charger', 'brute'], room); }
  if (hpFrac < 0.5 && !e.phased) bossPhaseShift(e, room, 'THE WARDEN UNSEALS', '#ffd24d');
  const phase3 = hpFrac < 0.46 || e.enraged;

  // ★ SIGNATURE: armored, with one rotating GAP in its shield. Only hits/dashes that
  // come through the gap deal full damage — everything else sparks off (combat.js).
  // Enraged: the shield spins faster and the gap narrows — the window gets meaner.
  e.shield = true;
  e.shieldAngle = (e.shieldAngle + dt * (e.enraged ? 2.4 : 1.4)) % TAU;
  e.gapHalf = e.enraged ? 0.46 : 0.62;
  e.shieldSpark = Math.max(0, (e.shieldSpark || 0) - dt);
  if (e.phaseLock <= 0) updateGraveSlams(e, room, p, dt); // ◆ ARENA HOOK — grave slams

  let ax = to.x * e.speed * 0.78, ay = to.y * e.speed * 0.78;
  if (e.phaseLock > 0) { ax *= 0.2; ay *= 0.2; }
  e.vx = damp(e.vx, ax, 5, dt); e.vy = damp(e.vy, ay, 5, dt);

  e.fireCd -= dt; e.ringCd -= dt;
  const enemyBullets = room.bullets.reduce((n, b) => n + (b.owner === 'enemy' ? 1 : 0), 0);
  if (e.phaseLock <= 0 && enemyBullets < 108) {
    if (e.fireCd <= 0) {
      e.fireCd = phase3 ? 1.12 : 1.46;
      fireEnemyBurst(room, e, p.x, p.y, phase3 ? 5 : 4, phase3 ? 0.92 : 0.74, 266 + idx * 10, 3.2, '#ffe394');
    }
    if (e.ringCd <= 0) {
      e.ringCd = phase3 ? 2.45 : 3.18;
      fireEnemyRing(room, e, phase3 ? 12 : 10, 202 + idx * 8, 3.25, '#ffe394', e.phase * 0.45);
    }
  }
}

// ── Null Archon (game_inline.js:9056-9087) ──────────────────────────────────
function archonBrain(e, room, p, to, d, dt) {
  if (bossIntro(e, room, dt)) return;
  const idx = room.idx;
  const hpFrac = e.hp / e.maxHp;
  e.phaseLock = Math.max(0, (e.phaseLock || 0) - dt);
  if (hpFrac < 0.82 && e.summons < 1) { e.summons = 1; e.phaseLock = 0.7; summonFromBoss(e, ['charger', 'sniper'], room); }
  if (hpFrac < 0.58 && e.summons < 2) { e.summons = 2; e.phaseLock = 0.7; summonFromBoss(e, ['hexer', 'myrmidon'], room); }
  if (hpFrac < 0.34 && e.summons < 3) { e.summons = 3; e.phaseLock = 0.82; summonFromBoss(e, ['brute', 'sniper', 'hexer'], room); }
  if (hpFrac < 0.5 && !e.phased) bossPhaseShift(e, room, 'THE NULL UNFOLDS', '#ff9bf5');
  const enraged = hpFrac < 0.34 || e.enraged;

  let ax = to.x * e.speed * 0.88, ay = to.y * e.speed * 0.88;
  if (e.phaseLock > 0) { ax *= 0.2; ay *= 0.2; }
  e.dashCd -= dt;
  if (d < 540 && e.dashCd <= 0) {
    e.dashCd = 2.6;
    const a = Math.atan2(to.y, to.x) + (Math.random() < 0.5 ? 0.82 : -0.82);
    e.vx += Math.cos(a) * 240; e.vy += Math.sin(a) * 240;
  }
  e.vx = damp(e.vx, ax, 5, dt); e.vy = damp(e.vy, ay, 5, dt);

  // ★ SIGNATURE: weaponize the city. Arm the flow lanes (telegraph: they flash red),
  // then they turn LETHAL — standing on a boost boulevard burns you. Get off the neon.
  // (draw.js reads laneArmT/laneLiveT off this boss to light the lanes.)
  e.laneCd -= dt;
  const lanes = room.flowLanes || [];
  if (e.laneCd <= 0 && lanes.length) {
    e.laneCd = enraged ? 5.5 : 7.5; e.laneArmT = 1.3;
    addFloat(room, room.w / 2, room.wall + 90, '!', '#ff6b6b', true, 1.0);
    sfx('telegraph'); addFlash(0.18);
  }
  if (e.laneArmT > 0) { e.laneArmT -= dt; if (e.laneArmT <= 0) e.laneLiveT = enraged ? 2.2 : 1.7; }
  if (e.laneLiveT > 0) {
    e.laneLiveT -= dt; e.laneHitCd -= dt;
    if (p.inv <= 0 && e.laneHitCd <= 0) {
      for (const l of lanes) {
        if (distPointSegment(p.x, p.y, l.x1, l.y1, l.x2, l.y2) < (l.width || 78) * 0.5 + p.r) {
          e.laneHitCd = 0.55; hurtPlayer(1, p.x, p.y, 'archon'); break;
        }
      }
    }
  }

  e.fireCd -= dt; e.ringCd -= dt;
  if (e.phaseLock <= 0) {
    if (e.fireCd <= 0) {
      e.fireCd = enraged ? 0.72 : 1.0;
      fireEnemyBurst(room, e, p.x, p.y, enraged ? 9 : 7, enraged ? 1.4 : 1.05, 310 + idx * 14, 4.1, '#f7dbff');
    }
    if (e.ringCd <= 0) {
      e.ringCd = enraged ? 1.22 : 1.7;
      fireEnemyRing(room, e, enraged ? 18 : 14, 235 + idx * 12, 4.2, '#ffeaa9', e.seed + e.phase * 0.3);
    }
  }
}

// ── False Moon (miniboss: mirrors your aim back at you) ─────────────────────
function falseMoonBrain(e, room, p, to, d, dt) {
  if (bossIntro(e, room, dt)) return;
  const idx = room.idx;
  const hpFrac = e.hp / e.maxHp;
  // slow orbit, keeps middle distance
  const orbit = Math.atan2(e.y - p.y, e.x - p.x) + Math.PI / 2;
  const want = d < 300 ? -0.8 : d > 520 ? 0.9 : 0.05;
  const ax = to.x * e.speed * want + Math.cos(orbit) * e.speed * 0.85;
  const ay = to.y * e.speed * want + Math.sin(orbit) * e.speed * 0.85;
  e.vx = damp(e.vx, ax, 5.5, dt); e.vy = damp(e.vy, ay, 5.5, dt);

  if (hpFrac < 0.5 && !e.phased) bossPhaseShift(e, room, 'THE MOON SHEDS ITS MASK', '#ff7be0');

  // ★ SIGNATURE: the false moon INHALES (telegraph) then drags you in, then blasts a
  // ring outward. Dash to break the pull — i-frames + dash speed beat the gravity.
  // Enraged: it pulls more often and harder.
  e.pullCd -= dt;
  if (e.pullCd <= 0 && d < 820) {
    e.pullCd = e.enraged ? 4.0 : 5.6; e.armT = e.enraged ? 0.55 : 0.7; e.pullT = 0.8;
    addFloat(room, e.x, e.y - e.r - 28, '↺', '#f0b8ff', true, 0.8);
    ripple(room, e.x, e.y, '#f0b8ff', 130, 0.7); sfx('telegraph');
  }
  if (e.armT > 0) { e.armT -= dt; }                 // wind-up (read the inhale)
  else if (e.pullT > 0) {
    e.pullT -= dt;
    const k = norm(e.x - p.x, e.y - p.y);
    const force = 560 * (0.5 + 0.5 * clamp(1 - d / 820, 0, 1));
    p.vx += k.x * force * dt; p.vy += k.y * force * dt;
    if (e.pullT <= dt) { // release: ring blast outward
      fireEnemyRing(room, e, 16, 250 + idx * 8, 3.6, '#f0b8ff', e.phase);
      burst(room, e.x, e.y, '#f0b8ff', 22, 300, 0.5, 3); addShake(0.3);
    }
  }
  // ◆ ARENA HOOK — ECLIPSE: darkness closes in as it inhales, snaps back on the blast.
  // (draw.js reads e.eclipse to darken the room around the moon.)
  const eclTarget = e.armT > 0 ? clamp(1 - e.armT / (e.enraged ? 0.55 : 0.7), 0, 1) : (e.pullT > 0 ? 1 : 0);
  e.eclipse = damp(e.eclipse || 0, eclTarget, 7, dt);

  e.fireCd -= dt; e.ringCd -= dt;
  if (e.fireCd <= 0 && d < 820) {
    e.fireCd = 1.15;
    // signature: a volley along YOUR aim line, reflected back (punishes tunnel vision)
    const mirror = Math.atan2(p.aimY, p.aimX) + Math.PI;
    for (let k = -1; k <= 1; k++) {
      const a = mirror + k * 0.14;
      fireEnemyShot(room, e, Math.cos(a), Math.sin(a), 330 + idx * 8, 5.4, 2.6, '#f0b8ff');
    }
    fireEnemyBurst(room, e, p.x, p.y, 2, 0.22, 280 + idx * 8, 2.8, '#f0b8ff');
  }
  if (hpFrac < 0.5 && e.ringCd <= 0) {
    e.ringCd = 2.7;
    fireEnemyRing(room, e, 8, 190 + idx * 7, 3.0, '#f0b8ff', e.phase * 0.6);
  }
  if (hpFrac < 0.55 && e.summons < 1) { e.summons = 1; summonFromBoss(e, ['skitter', 'skitter'], room); }
}

// ── Spiggot (miniboss: spore rings + skitter brood) ─────────────────────────
function spiggotBrain(e, room, p, to, d, dt) {
  if (bossIntro(e, room, dt)) return;
  const idx = room.idx;
  const hpFrac = e.hp / e.maxHp;
  const ax = to.x * e.speed * 0.7 + Math.cos(e.phase * 1.4) * 50;
  const ay = to.y * e.speed * 0.7 + Math.sin(e.phase * 1.2) * 50;
  e.vx = damp(e.vx, ax, 5, dt); e.vy = damp(e.vy, ay, 5, dt);
  updateSporeBloom(e, room, p, dt); // ◆ ARENA HOOK — expanding spore fields

  e.ringCd -= dt; e.fireCd -= dt;
  if (e.ringCd <= 0) {
    e.ringCd = 2.1;
    fireEnemyRing(room, e, 10, 170 + idx * 6, 3.4, '#9effdc', e.phase * 0.8);
  }
  if (e.fireCd <= 0 && d < 600) {
    e.fireCd = 1.5;
    fireEnemyBurst(room, e, p.x, p.y, 3, 0.34, 250 + idx * 8, 2.9, '#c596ff');
  }
  if (hpFrac < 0.5 && !e.phased) bossPhaseShift(e, room, 'SPIGGOT BLOOMS OPEN', '#6effc0');
  // ★ SIGNATURE: once it blooms (≤50% HP), a slow rotating spore SPIRAL you weave/dash
  // through — a 4th arm and a faster cadence once enraged.
  if (e.enraged) {
    const arms = 4;
    e.spiralA += dt * 2.8;
    e.spiralCd -= dt;
    if (e.spiralCd <= 0) {
      e.spiralCd = 0.092;
      for (let arm = 0; arm < arms; arm++) {
        const a = e.spiralA + arm * (TAU / arms);
        fireEnemyShot(room, e, Math.cos(a), Math.sin(a), 200 + idx * 5, 4.6, 3.4, '#9effdc');
      }
    }
  }
  // brood at 75/50/25%
  const broodAt = [0.75, 0.5, 0.25];
  if (e.summons < broodAt.length && hpFrac < broodAt[e.summons]) {
    e.summons++;
    summonFromBoss(e, ['skitter', 'skitter'], room);
    addSlowFog(room, e.x, e.y, { r: 100, slow: 0.66, color: '#9effdc' });
  }
}
