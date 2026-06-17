// Moots. Movement/dash/pulse are Boon Moots v50 ports (docs/boon-moots-notes.md §3);
// weapon and damage scale are No Moon's Moots (twin-relay).
import { PLAYER, TAU } from '../config.js';
import { state } from '../state.js';
import { clamp, damp, dist, norm } from '../rng.js';
import { particle, burst, addFloat, ripple } from '../render/particles.js';
import { addShake, addFlash, slowMo, hitPause, haptic, reduced } from './juice.js';
import { sfx } from '../audio/sfx.js';
import { spawnBullet } from './bullets.js';
import { damageEnemy } from './combat.js';
import { damageObstacle } from './breakables.js';
import { hooks } from './items.js';
import { view } from '../render/camera.js';
import { levelAt, surfaceAt } from './levels.js';

export function makePlayer() {
  return {
    x: 750, y: 700, vx: 0, vy: 0, r: PLAYER.R, aimX: 1, aimY: 0, face: 0, level: 0,
    hp: PLAYER.MAX_HP, maxHp: PLAYER.MAX_HP, shield: 0, shieldMax: 0, shieldTimer: 0,
    inv: 0, hurt: 0, dead: false, roomHit: false,
    speed: PLAYER.SPEED, baseSpeed: PLAYER.SPEED,
    accel: PLAYER.ACCEL, stop: PLAYER.STOP, turn: PLAYER.TURN, lateral: PLAYER.LATERAL,
    fireDelay: PLAYER.FIRE_DELAY, fireCd: 0, damage: PLAYER.DAMAGE, crit: PLAYER.CRIT,
    dashCdBase: PLAYER.DASH_CD, dashCd: 0, dashT: 0, dashDur: PLAYER.DASH_DUR,
    dashSpinDir: 1, lastDashAngle: null, after: [],
    pickup: PLAYER.PICKUP_RANGE,
    perks: { damage: 0, fire: 0, speed: 0, maxHp: 0 },
    modules: {},
    boon: { charges: 0, progress: 0, need: 2 },
    shots: 0, dashes: 0, stillT: 0, wasMoving: false, brakeT: 0, flowT: 0,
    animT: 0, moveFace: 0, rail: null, air: null, airZ: 0, ventT: 0,
    comboHealFx: 0, comboTierFx: 0, _railLatchCd: 0,
    _ventExitX: null, _ventExitY: null, _ventExitLevel: null, _enterPortalNow: false,
    _dashFrameActive: false, _dashLastX: 750, _dashLastY: 700,
  };
}

export function dashSpinPhase(p) {
  if (!p || p.dashT <= 0) return 0;
  return (1 - clamp(p.dashT / (p.dashDur || 0.001), 0, 1)) * TAU * (p.dashSpinDir || 1);
}

export function updatePlayer(p, move, aim, room, dt) {
  p.inv = Math.max(0, p.inv - dt);
  p.hurt = Math.max(0, p.hurt - dt);
  p.fireCd = Math.max(0, p.fireCd - dt);
  p.dashCd = Math.max(0, p.dashCd - dt);
  p.brakeT = Math.max(0, p.brakeT - dt);
  p.flowT = Math.max(0, (p.flowT || 0) - dt);
  p.ventT = Math.max(0, (p.ventT || 0) - dt);
  p._ventCd = Math.max(0, (p._ventCd || 0) - dt);
  p._railLatchCd = Math.max(0, (p._railLatchCd || 0) - dt);
  p.comboHealFx = Math.max(0, (p.comboHealFx || 0) - dt);
  p.comboTierFx = Math.max(0, (p.comboTierFx || 0) - dt);
  tickVentTimers(room, dt);
  if (p._ventExitX != null) {
    const sameLevel = (p.level || 0) === (p._ventExitLevel || 0);
    if (!sameLevel || dist(p.x, p.y, p._ventExitX, p._ventExitY) > 118) {
      p._ventExitX = p._ventExitY = p._ventExitLevel = null;
    }
  }

  const wasDashing = p.dashT > 0;
  // Remember dash travel for systems that update after player movement this frame
  // (shops, in particular). A dash can end by timer/rail/vent before those systems
  // see p.dashT, but the player still visibly cut through the object this frame.
  p._dashFrameActive = wasDashing || (p.rail?.rocketT || 0) > 0;
  p.dashT = Math.max(0, p.dashT - dt);
  if (wasDashing && p.dashT <= 0) { // landing punctuation — reads as the dash "slam" stop
    p._dashHitIds = null;
    p._dashStartLevel = null;
    ripple(room, p.x, p.y, room.biome.pal.accent2, 92);
    ripple(room, p.x, p.y, '#ffffff', 46, 0.32);
    burst(room, p.x, p.y, room.biome.pal.accent3, 10, 150, 0.3, 2.6);
  }
  if (p.shieldMax > 0 && p.shield < p.shieldMax) {
    p.shieldTimer += dt;
    if (p.shieldTimer >= 10) { p.shield++; p.shieldTimer = 0; }
  }

  // aim + auto-fire: the gun never stops. Manual aim wins; with no manual aim, lock
  // onto the nearest enemy so you keep shooting without aiming (constant flow state).
  let firing = false;
  if (aim.active) {
    p.aimX = aim.x; p.aimY = aim.y; firing = true;
  } else if (!room.cleared) {
    const tgt = nearestEnemy(room, p);
    if (tgt) { const n = norm(tgt.x - p.x, tgt.y - p.y); p.aimX = n.x; p.aimY = n.y; firing = true; }
  }
  p.face = Math.atan2(p.aimY, p.aimX);
  if (firing && p.fireCd <= 0) firePlayer(p, room);

  if (updateAirborne(p, room, dt)) {
    finishPlayerFrame(p, room, Math.hypot(p.vx, p.vy), dt, true);
    return;
  }
  if (updateRailRide(p, room, move, dt)) {
    finishPlayerFrame(p, room, Math.hypot(p.vx, p.vy), dt, true);
    return;
  }

  // ground surface under the boots (Moonless-inspired): slick lets you DRIFT (almost no
  // friction), tar DRAGS you (a dash glides over it), charge plates SHOVE you along and
  // lift your top speed. p._surface is exposed for the wake fx in draw/sprites.
  p._surface = surfaceAt(room, p.x, p.y, p.level || 0);
  const surf = p.dashT > 0 ? null : p._surface; // a committed dash ignores the ground

  // Boon Moots movement model (index.html:612-643)
  const beforeSpeed = Math.hypot(p.vx, p.vy);
  const analog = clamp(move.l, 0, 1);
  const surfSpeed = surf === 'tar' ? 0.60 : surf === 'charge' ? 1.16 : 1;
  const desiredX = move.x * p.speed * (0.58 + 0.42 * analog) * surfSpeed;
  const desiredY = move.y * p.speed * (0.58 + 0.42 * analog) * surfSpeed;
  if (p.dashT > 0) {
    // committed dash glide — ride the impulse, ignore steering, ease out gently
    p.vx = damp(p.vx, 0, PLAYER.DASH_GLIDE, dt);
    p.vy = damp(p.vy, 0, PLAYER.DASH_GLIDE, dt);
    p.stillT = 0;
  } else if (move.active) {
    const inLen = Math.hypot(move.x, move.y) || 1, ix = move.x / inLen, iy = move.y / inLen;
    const alignment = beforeSpeed > 1 ? (p.vx * ix + p.vy * iy) / beforeSpeed : 1;
    const reverse = clamp(-alignment, 0, 1);
    const turnPressure = clamp((1 - alignment) * 0.55, 0, 1);
    const response = p.accel + p.turn * turnPressure + 7.5 * reverse;
    p.vx = damp(p.vx, desiredX, response, dt);
    p.vy = damp(p.vy, desiredY, response, dt);
    const px = -iy, py = ix;
    const lateral = p.vx * px + p.vy * py;
    const grip = surf === 'slick' ? 0.30 : 1;                 // ice keeps your line → drift
    const lf = (1 - Math.exp(-p.lateral * (0.42 + turnPressure * 0.7) * dt)) * grip;
    p.vx -= px * lateral * lf; p.vy -= py * lateral * lf;
    if (surf === 'charge') { p.vx += ix * 1100 * dt; p.vy += iy * 1100 * dt; p.flowT = Math.max(p.flowT || 0, 0.10); }
    p.stillT = 0;
  } else {
    if (p.wasMoving && beforeSpeed > 118 && p.brakeT <= 0 && !reduced()) {
      p.brakeT = 0.12;
      const back = norm(-p.vx, -p.vy);
      for (let i = 0; i < 8; i++) {
        particle(room, p.x - back.x * 8, p.y - back.y * 8, room.biome.pal.accent3,
          back.x * (80 + Math.random() * 110) + (Math.random() * 80 - 40),
          back.y * (80 + Math.random() * 110) + (Math.random() * 80 - 40), 0.20, 2 + Math.random() * 2.5);
      }
    }
    const brakeMul = surf === 'slick' ? 0.28 : surf === 'tar' ? 1.7 : 1;
    const brake = (p.stop + Math.min(13, beforeSpeed / 65)) * brakeMul;
    p.vx = damp(p.vx, 0, brake, dt); p.vy = damp(p.vy, 0, brake, dt);
    if (Math.hypot(p.vx, p.vy) < 7 && surf !== 'slick') { p.vx = 0; p.vy = 0; }
    if (room.enemies.length > 0) p.stillT += dt;
  }
  // flow lanes: neon boost boulevards push you along them — momentum highways across
  // the sprawl. Riding one lifts the speed cap so the lane actually feels light-speed.
  applyFlowLanes(p, room, move, dt);
  const flowing = (p.flowT || 0) > 0;
  const surfCap = surf === 'slick' ? 1.12 : surf === 'tar' ? 0.66 : surf === 'charge' ? 1.30 : 1;
  const maxV = p.speed * surfCap * (p.dashT > 0 ? PLAYER.DASH_SPEED_MULT * (flowing ? 1.36 : 1)
    : flowing ? PLAYER.MAX_SPEED_MULT * 1.85 : PLAYER.MAX_SPEED_MULT);
  let sp = Math.hypot(p.vx, p.vy);
  if (sp > maxV) { p.vx = p.vx / sp * maxV; p.vy = p.vy / sp * maxV; sp = maxV; }
  const oldX = p.x, oldY = p.y, oldLevel = p.level || 0;
  p._lastX = oldX; p._lastY = oldY;
  if (p._dashFrameActive) { p._dashLastX = oldX; p._dashLastY = oldY; }
  p.x += p.vx * dt; p.y += p.vy * dt;
  const w = room.wall - 18;
  p.x = clamp(p.x, w + p.r, room.w - w - p.r);
  p.y = clamp(p.y, w + p.r, room.h - w - p.r);
  if (p.dashT > 0) dashBreakCrossedObstacles(p, room, oldX, oldY, p.x, p.y);
  const blockedAnnexDash = blockSealedAnnexBreach(p, room, oldX, oldY);
  for (const o of room.obstacles) if (!o.gone) resolveCircleObstacle(p, o);
  p.level = levelAt(room, p.x, p.y); // ground=0, raised platform=1 (set by ramps)
  if (p.dashT > 0) {
    // on the victory lap the express rail wins over vents, so a dash toward the exit
    // always grabs the rail home instead of getting bounced up a launcher.
    const tookExpress = room.escapeRail && !room.escapeRail.used && tryLatchEscapeRail(p, room, oldX, oldY);
    if (!tookExpress) {
      maybeVentLaunch(p, room, oldX, oldY, true);
      maybeLatchRail(p, room, oldX, oldY, p._dashStartLevel ?? oldLevel);
    }
    performDashCut(p, room, PLAYER.DASH_SWEEP_RANGE || PLAYER.DASH_HIT_RANGE); // cut enemies along the travel, not just at launch
  } else {
    maybeVentLaunch(p, room, oldX, oldY, false);
    // The express escape rail is so forgiving you can grab it just by carrying speed
    // toward it — no precise dash required (the brief: "easy to dash onto").
    if (room.escapeRail && !room.escapeRail.used && !p.rail && !p.air && Math.hypot(p.vx, p.vy) > 260) {
      tryLatchEscapeRail(p, room, oldX, oldY, true); // only when heading for the exit
    }
  }

  finishPlayerFrame(p, room, Math.hypot(p.vx, p.vy), dt, move.active);
}


function sealedAnnexContains(room, x, y, pad = 0) {
  const a = room.annex;
  if (!a || a.opened || !a.rect) return false;
  const r = a.rect;
  return x > r.x - pad && x < r.x + r.w + pad && y > r.y - pad && y < r.y + r.h + pad;
}

function blockSealedAnnexBreach(p, room, oldX, oldY) {
  const a = room.annex;
  if (!a || a.opened || !a.rect) return false;
  if (!sealedAnnexContains(room, p.x, p.y, p.r * 0.2)) return false;

  if (!sealedAnnexContains(room, oldX, oldY, p.r * 0.2)) {
    p.x = oldX; p.y = oldY;
  } else {
    // Safety fallback if a save/load or spawn somehow starts inside: push through
    // the nearest exterior side, not through the sealed door trigger.
    const r = a.rect;
    const sides = [
      { d: Math.abs(p.x - r.x), x: r.x - p.r - 2, y: p.y },
      { d: Math.abs(p.x - (r.x + r.w)), x: r.x + r.w + p.r + 2, y: p.y },
      { d: Math.abs(p.y - r.y), x: p.x, y: r.y - p.r - 2 },
      { d: Math.abs(p.y - (r.y + r.h)), x: p.x, y: r.y + r.h + p.r + 2 },
    ].sort((u, v) => u.d - v.d)[0];
    p.x = sides.x; p.y = sides.y;
  }
  p.vx *= -0.18; p.vy *= -0.18;
  p.dashT = 0; p._dashHitIds = null; p._dashStartLevel = null;
  p.inv = Math.max(p.inv, 0.10);
  addFloat(room, p.x, p.y - 42, 'LOCKED', room.biome.pal.bad, false, 0.38);
  ripple(room, p.x, p.y, room.biome.pal.bad, 82, 0.30);
  return true;
}


export function resolveCircleObstacle(ent, o) {
  if (o.level != null && (ent.level || 0) !== o.level) return;
  if (o.type === 'circle') {
    const n = norm(ent.x - o.x, ent.y - o.y), min = ent.r + o.rad;
    if (n.m < min) {
      const push = min - n.m;
      ent.x += n.x * push; ent.y += n.y * push;
      ent.vx += n.x * push * 5; ent.vy += n.y * push * 5;
    }
    return;
  }
  const nx = clamp(ent.x, o.x, o.x + o.w), ny = clamp(ent.y, o.y, o.y + o.h);
  const n = norm(ent.x - nx, ent.y - ny);
  if (n.m < ent.r) {
    const push = ent.r - n.m;
    ent.x += n.x * push; ent.y += n.y * push;
    ent.vx += n.x * push * 5; ent.vy += n.y * push * 5;
  }
}

// Flow lanes: while you're within a lane, get pushed along it (sign follows your
// intent), with a soft lateral pull toward the lane so you carve rather than snap.
// Ported from ChatGPT's "neon districts" build. (No gun-kick recoil ported.)
function applyFlowLanes(p, room, move, dt) {
  const lanes = room.flowLanes || [];
  if (!lanes.length) return false;
  // Flow lanes are speed roads, not invisible conveyor belts. They now amplify a
  // deliberate along-lane move/dash, but they do not pull an idle player at spawn
  // or fight perpendicular input when the player is simply trying to cross.
  const ridingDash = p.dashT > 0;
  if (!move.active && !ridingDash) return false;
  const dirX = ridingDash ? p.vx : move.x;
  const dirY = ridingDash ? p.vy : move.y;
  const dirLen = Math.hypot(dirX, dirY) || 1;
  let best = null, bestS = null, bestScore = -Infinity, bestAlong = 0;
  for (const l of lanes) {
    const s = pointSegmentInfo(p.x, p.y, l.x1, l.y1, l.x2, l.y2);
    const width = (l.width || 78) + p.r;
    if (s.d > width) continue;
    const along = (dirX / dirLen) * s.lx + (dirY / dirLen) * s.ly;
    const absAlong = Math.abs(along);
    // Keep crossing neutral. This is the key fix for the vague “being pulled but
    // still able to move” feel when a road happens to pass under the start area.
    if (!ridingDash && absAlong < 0.25) continue;
    if (ridingDash && absAlong < 0.14) continue;
    const falloff = clamp(1 - s.d / width, 0, 1);
    const score = falloff * (0.35 + absAlong * 1.15);
    if (score > bestScore) { bestScore = score; best = l; bestS = s; bestAlong = along; }
  }
  if (!best) return false;
  const l = best, s = bestS;
  const falloff = clamp(1 - s.d / ((l.width || 78) + p.r), 0, 1);
  const sign = bestAlong < 0 ? -1 : 1;
  const intentStrength = ridingDash ? 1 : clamp((Math.abs(bestAlong) - 0.25) / 0.75, 0, 1);
  const boost = (l.boost || 210) * (0.32 + falloff * 0.74) * (0.35 + intentStrength * 0.65) * (ridingDash ? 1.55 : 1);
  p.vx += s.lx * sign * boost * dt;
  p.vy += s.ly * sign * boost * dt;
  // Soft recentering only when the player has chosen the road. No snap when crossing.
  const lateral = p.vx * s.nx + p.vy * s.ny;
  const steer = (0.025 + falloff * 0.07) * (0.35 + intentStrength * 0.65) * (ridingDash ? 0.55 : 1);
  p.vx -= s.nx * lateral * steer;
  p.vy -= s.ny * lateral * steer;
  p.flowT = 0.16;
  if (Math.random() < (ridingDash ? 0.42 : 0.14 + intentStrength * 0.08)) {
    particle(room, p.x - s.lx * sign * 18, p.y - s.ly * sign * 18, l.color || room.biome.pal.accent3,
      -s.lx * sign * 80 + (Math.random() * 80 - 40), -s.ly * sign * 80 + (Math.random() * 80 - 40), 0.18, 2.5 + falloff * 2.5);
  }
  return true;
}

function pointSegmentInfo(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy || 1;
  const t = clamp(((px - x1) * dx + (py - y1) * dy) / len2, 0, 1);
  const cx = x1 + dx * t, cy = y1 + dy * t;
  const len = Math.sqrt(len2) || 1;
  const lx = dx / len, ly = dy / len;
  return { d: dist(px, py, cx, cy), lx, ly, nx: -ly, ny: lx, t, cx, cy };
}

function tickVentTimers(room, dt) {
  for (const v of room.vents || []) v.flash = Math.max(0, (v.flash || 0) - dt);
}

function updateAnimPose(p, sp, dt) {
  if (sp > 20) p.moveFace = Math.atan2(p.vy, p.vx);
  const gait = p.air ? 7.5 : p.rail?.active ? 12 : p.dashT > 0 ? 14 : 4.2 + Math.min(7, sp / 75);
  p.animT = (p.animT || 0) + dt * gait;
}

function finishPlayerFrame(p, room, sp, dt, movingIntent) {
  updateAnimPose(p, sp, dt);
  const dashLike = p.dashT > 0 || p.rail?.rocketT > 0 || p.air?.dash;
  // trail + afterimages — small motes spawned BEHIND the body (particles draw on
  // top of entities, so a big one here reads as a blob stuck to him; keep it small
  // and offset back so it's a wake, not a smear on his chest)
  if (sp > 60 && !reduced()) {
    const bx = -p.vx / sp, by = -p.vy / sp;
    particle(room, p.x + bx * 26, p.y - 10 + by * 26, dashLike ? room.biome.pal.accent3 : room.biome.pal.accent,
      bx * 55, by * 55, dashLike ? 0.18 : 0.14, dashLike ? 6 : 3.5, 'dot');
  }
  // ground-surface wake — sells the surface you're skating on (ice shimmer / charge
  // sparks / tar bubbles), only on foot (not airborne / railing).
  if (p._surface && sp > 130 && !p.air && !p.rail?.active && !reduced() && Math.random() < 0.55) {
    const inv = 1 / sp, bx = -p.vx * inv, by = -p.vy * inv;
    const col = p._surface === 'tar' ? '#150a18' : p._surface === 'charge' ? room.biome.pal.accent3 : '#eaffff';
    particle(room, p.x + bx * 16, p.y + 8 + by * 16, col,
      bx * 60 + (Math.random() * 70 - 35), by * 60 + (Math.random() * 70 - 35),
      0.24, p._surface === 'charge' ? 3.6 : 2.6, 'dot');
  }
  // afterimages — longer-lived and more numerous during a dash/rail rocket/vent hop
  p.after.unshift({
    x: p.x, y: p.y, face: p.face, spin: dashSpinPhase(p), life: dashLike ? 0.22 : 0.16,
    dash: dashLike, moveFace: p.moveFace, animT: p.animT, rail: !!p.rail?.active, airZ: p.airZ || 0,
  });
  const afterCap = dashLike ? (view.mobile ? 9 : 13) : (view.mobile ? 6 : 9);
  if (p.after.length > afterCap) p.after.pop();
  for (let i = p.after.length - 1; i >= 0; i--) {
    p.after[i].life -= dt;
    if (p.after[i].life <= 0) p.after.splice(i, 1);
  }
  p.wasMoving = movingIntent || sp > 35;
  hooks.run('tick', dt);
}

function updateAirborne(p, room, dt) {
  const a = p.air;
  if (!a) { p.airZ = 0; return false; }
  a.t += dt;
  const u = clamp(a.t / Math.max(0.001, a.dur), 0, 1);
  const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
  p.x = a.sx + (a.ex - a.sx) * e;
  p.y = a.sy + (a.ey - a.sy) * e;
  p.level = u > 0.58 ? a.toLevel : a.fromLevel;
  p.airZ = Math.sin(u * Math.PI) * (a.dash ? 84 : 58);
  const dir = norm(a.ex - a.sx, a.ey - a.sy);
  p.vx = dir.x * (a.dash ? 1260 : 720);
  p.vy = dir.y * (a.dash ? 1260 : 720);
  p.stillT = 0;
  if (!reduced() && Math.random() < 0.65) {
    particle(room, p.x - dir.x * 20, p.y - dir.y * 20, room.biome.pal.accent2,
      -dir.x * 130 + (Math.random() * 120 - 60), -dir.y * 130 + (Math.random() * 120 - 60), 0.20, 3 + Math.random() * 3, 'dot');
  }
  if (u >= 1) {
    p.x = a.ex; p.y = a.ey; p.level = a.toLevel; p.air = null; p.airZ = 0;
    p.vx = dir.x * (a.dash ? 1020 : 560);
    p.vy = dir.y * (a.dash ? 1020 : 560);
    ripple(room, p.x, p.y, room.biome.pal.accent2, a.dash ? 132 : 92, 0.42);
    burst(room, p.x, p.y, room.biome.pal.accent3, a.dash ? 20 : 12, a.dash ? 240 : 160, 0.35, 3);
  }
  return true;
}

function maybeVentLaunch(p, room, x0, y0, fromDash) {
  if (p._ventCd > 0 || p.air) return false;
  if (room.cleared) return false; // victory lap: vents go quiet, the express rail is the way home
  if (p._ventExitX != null && (p.level || 0) === (p._ventExitLevel || 0) && dist(p.x, p.y, p._ventExitX, p._ventExitY) < 116) return false;
  const vents = room.vents || [];
  if (!vents.length) return false;
  for (const v of vents) {
    if (v.fromLevel != null && (p.level || 0) !== v.fromLevel) continue;
    const range = v.r + p.r + (fromDash ? 34 : 2);
    const crossed = segmentPointDist(x0, y0, p.x, p.y, v.x, v.y) <= range;
    if (!crossed && dist(p.x, p.y, v.x, v.y) > range) continue;
    launchVent(p, room, v, fromDash);
    return true;
  }
  return false;
}

function launchVent(p, room, v, dash) {
  const fromLevel = p.level || 0;
  p.air = {
    t: 0, dur: dash ? 0.24 : 0.34,
    sx: p.x, sy: p.y, ex: v.toX, ey: v.toY,
    fromLevel, toLevel: v.toLevel ?? 1, dash,
  };
  p._ventCd = dash ? 0.34 : 0.48;
  p._ventExitX = v.toX; p._ventExitY = v.toY; p._ventExitLevel = v.toLevel ?? 1;
  p.ventT = dash ? 0.46 : 0.34;
  p.inv = Math.max(p.inv, dash ? 0.42 : 0.22);
  if (dash) { p.dashT = 0; p.dashCd = 0; }
  v.flash = 0.38;
  addFloat(room, v.x, v.y - 34, dash ? '↟↟' : '↟', room.biome.pal.accent2, true, dash ? 0.58 : 0.42);
  ripple(room, v.x, v.y, room.biome.pal.accent2, dash ? 126 : 86, 0.35);
  burst(room, v.x, v.y, '#ffffff', dash ? 24 : 12, dash ? 300 : 170, 0.32, 3.2);
  haptic(dash ? 18 : 10);
}

function segmentPointDist(x1, y1, x2, y2, px, py) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy || 1;
  const t = clamp(((px - x1) * dx + (py - y1) * dy) / len2, 0, 1);
  return dist(px, py, x1 + dx * t, y1 + dy * t);
}

function dashBreakCrossedObstacles(p, room, x0, y0, x1, y1) {
  for (const o of room.obstacles) {
    if (o.gone || !o.breakable) continue;
    const priority = o.wall || o.species === 'annexDoor' || o.species === 'wallSegment';
    const pad = p.r + (priority ? 18 : 8);
    if (segmentHitsObstacle(x0, y0, x1, y1, o, pad)) damageObstacle(room, o, priority ? 999 : p.damage * 3.0);
  }
}

function segmentHitsObstacle(x0, y0, x1, y1, o, pad) {
  if (o.type === 'circle') return segmentPointDist(x0, y0, x1, y1, o.x, o.y) < (o.rad || 0) + pad;
  const minX = o.x - pad, minY = o.y - pad, maxX = o.x + o.w + pad, maxY = o.y + o.h + pad;
  if (x0 >= minX && x0 <= maxX && y0 >= minY && y0 <= maxY) return true;
  if (x1 >= minX && x1 <= maxX && y1 >= minY && y1 <= maxY) return true;
  const steps = Math.max(2, Math.ceil(dist(x0, y0, x1, y1) / 32));
  for (let i = 1; i < steps; i++) {
    const t = i / steps, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
    if (x >= minX && x <= maxX && y >= minY && y <= maxY) return true;
  }
  return false;
}

function railBounds(room, p) {
  const inset = room.wall - 18 + p.r;
  const l = inset, t = inset, r = room.w - inset, b = room.h - inset;
  return { l, t, r, b, w: r - l, h: b - t, perim: 2 * ((r - l) + (b - t)) };
}

function railPoint(room, p, s) {
  const B = railBounds(room, p);
  s = ((s % B.perim) + B.perim) % B.perim;
  if (s < B.w) return { x: B.l + s, y: B.t, tx: 1, ty: 0, nx: 0, ny: 1, side: 'n', s };
  s -= B.w;
  if (s < B.h) return { x: B.r, y: B.t + s, tx: 0, ty: 1, nx: -1, ny: 0, side: 'e', s: B.w + s };
  s -= B.h;
  if (s < B.w) return { x: B.r - s, y: B.b, tx: -1, ty: 0, nx: 0, ny: -1, side: 's', s: B.w + B.h + s };
  s -= B.w;
  return { x: B.l, y: B.b - s, tx: 0, ty: -1, nx: 1, ny: 0, side: 'w', s: B.w + B.h + B.w + s };
}

function pointToRailS(room, p, x, y) {
  const B = railBounds(room, p);
  const dTop = Math.abs(y - B.t), dRight = Math.abs(x - B.r), dBottom = Math.abs(y - B.b), dLeft = Math.abs(x - B.l);
  const min = Math.min(dTop, dRight, dBottom, dLeft);
  if (min === dTop) return clamp(x, B.l, B.r) - B.l;
  if (min === dRight) return B.w + (clamp(y, B.t, B.b) - B.t);
  if (min === dBottom) return B.w + B.h + (B.r - clamp(x, B.l, B.r));
  return B.w + B.h + B.w + (B.b - clamp(y, B.t, B.b));
}

function maybeLatchRail(p, room, x0 = p.x, y0 = p.y, startLevel = p.level || 0) {
  if (p.rail?.active || p.air || (p._railLatchCd || 0) > 0) return false;
  if (tryLatchEscapeRail(p, room, x0, y0)) return true; // victory-lap express wins priority
  if (tryLatchSkyRail(p, room, x0, y0, startLevel)) return true;
  if (!room.edgeRail) return false;
  const B = railBounds(room, p);
  const near = Math.min(Math.abs(p.x - B.l), Math.abs(p.x - B.r), Math.abs(p.y - B.t), Math.abs(p.y - B.b));
  // Formerly 7px: too exact for a giant-room dash at 60fps. A wider magnetic
  // window keeps the rail reliable without forcing accidental latches in open floor.
  if (near > 26) return false;
  const s = pointToRailS(room, p, p.x, p.y);
  const info = railPoint(room, p, s);
  const dot = p.vx * info.tx + p.vy * info.ty;
  const dir = dot < -40 ? -1 : 1;
  p.rail = { active: true, kind: 'edge', s, dir, speed: Math.max(760, Math.abs(dot) * 0.74), rocketT: 0, t: 0 };
  p.dashT = 0;
  p.dashCd = 0;
  p.inv = Math.max(p.inv, 0.22);
  p.x = info.x; p.y = info.y; p.level = 0;
  ripple(room, p.x, p.y, room.biome.pal.accent2, 92, 0.35);
  addFloat(room, p.x, p.y - 46, '↯', room.biome.pal.accent2, false, 0.42);
  return true;
}

function tryLatchSkyRail(p, room, x0, y0, startLevel = p.level || 0) {
  if ((p._railLatchCd || 0) > 0) return false;
  const rails = room.skyRails || [];
  if (!rails.length || startLevel < 1 || (p.level || 0) < 1) return false; // floor-level dashes pass underneath
  let best = null, bestInfo = null, bestD = Infinity;
  for (const r of rails) {
    if ((r.level || 1) !== (p.level || 0)) continue;
    const d = segmentSegmentDist(x0, y0, p.x, p.y, r.x1, r.y1, r.x2, r.y2);
    const info = pointSegmentInfo(p.x, p.y, r.x1, r.y1, r.x2, r.y2);
    const width = (r.width || 36) + p.r + 12;
    if (d > width && info.d > width) continue;
    const score = Math.min(d, info.d);
    if (score < bestD) { bestD = score; best = r; bestInfo = info; }
  }
  if (!best) return false;
  const dot = p.vx * bestInfo.lx + p.vy * bestInfo.ly;
  const dir = Math.abs(dot) > 40 ? (dot >= 0 ? 1 : -1) : (bestInfo.t < 0.5 ? 1 : -1);
  p.rail = { active: true, kind: 'sky', rail: best, u: bestInfo.t, dir, speed: Math.max(760, Math.abs(dot) * 0.72), rocketT: 0, t: 0 };
  p.dashT = 0;
  p.dashCd = 0;
  p.inv = Math.max(p.inv, 0.24);
  p.x = bestInfo.cx; p.y = bestInfo.cy; p.level = best.level || 1;
  ripple(room, p.x, p.y, best.color || room.biome.pal.accent2, 104, 0.36);
  addFloat(room, p.x, p.y - 46, '↯', best.color || room.biome.pal.accent2, false, 0.42);
  return true;
}

function skyRailPoint(r, u) {
  u = clamp(u, 0, 1);
  const dx = r.x2 - r.x1, dy = r.y2 - r.y1;
  const len = Math.hypot(dx, dy) || 1;
  const tx = dx / len, ty = dy / len;
  return { x: r.x1 + dx * u, y: r.y1 + dy * u, tx, ty, nx: -ty, ny: tx, u, len };
}

// ── Express escape rail (spawned on room clear, rooms.js spawnEscapeRail) ──
// A single forgiving grind line from where you cleared the room to the portal. Latches
// from ANY level with a fat magnetic window so one dash (or just carrying speed) toward
// the exit rockets you home at ultra speed. Optional — you can ignore it and walk.
function tryLatchEscapeRail(p, room, x0, y0, requireToward = false) {
  const r = room.escapeRail;
  if (!r || r.used || p.rail?.active || p.air || (p._railLatchCd || 0) > 0) return false;
  const info = pointSegmentInfo(p.x, p.y, r.x1, r.y1, r.x2, r.y2);
  const segd = segmentSegmentDist(x0, y0, p.x, p.y, r.x1, r.y1, r.x2, r.y2);
  const reach = (r.width || 58) + p.r + 56; // deliberately huge — trivial to grab
  if (info.d > reach && segd > reach) return false;
  // Auto-latch (just carrying speed, no dash) must only fire when you're actually
  // heading for the exit — otherwise crossing/backtracking near the line would yank
  // you home against your will. A deliberate dash skips this (the dash IS the intent).
  if (requireToward) {
    const sp = Math.hypot(p.vx, p.vy) || 1;
    const tn = norm(r.x2 - p.x, r.y2 - p.y);
    if ((p.vx * tn.x + p.vy * tn.y) / sp < 0.4) return false; // not moving portal-ward
  }
  p.rail = {
    active: true, kind: 'escape', rail: r, u: clamp(info.t, 0, 0.97), dir: 1,
    speed: Math.max(1500, Math.hypot(p.vx, p.vy)), rocketT: 0, t: 0,
  };
  p.dashT = 0; p.dashCd = 0;
  p.inv = Math.max(p.inv, 0.4);
  p.x = info.cx; p.y = info.cy; p.level = r.level || 0;
  sfx('dash'); haptic(16); addShake(0.2); hitPause('shot');
  ripple(room, p.x, p.y, r.color, 132, 0.46);
  burst(room, p.x, p.y, '#ffffff', 20, 320, 0.3, 3.6);
  addFloat(room, p.x, p.y - 50, '↯↯', r.color, true, 0.5);
  return true;
}

function updateEscapeRailRide(p, room, move, dt) {
  const r = p.rail.rail;
  if (!r || r.used) { p.rail = null; return false; }
  p.rail.t += dt;
  const target = 2750; // ultra speed home
  p.rail.speed = damp(p.rail.speed || target, target, 8, dt);
  const info0 = skyRailPoint(r, p.rail.u || 0);
  p.rail.u = (p.rail.u || 0) + p.rail.speed * dt / Math.max(1, info0.len);
  // a hard perpendicular flick bails you off — you stay in control of the lap
  if (move.active) {
    const side = move.x * info0.nx + move.y * info0.ny;
    if (p.rail.t > 0.07 && Math.abs(side) > 0.62) {
      return detachRail(p, room, { ...info0, dir: 1 }, info0.nx * Math.sign(side), info0.ny * Math.sign(side),
        { speed: 820, carry: 360, cd: 0.26, glyph: '↘', color: r.color });
    }
  }
  const ended = p.rail.u >= 1;
  const at = skyRailPoint(r, clamp(p.rail.u, 0, 1));
  p.x = at.x; p.y = at.y;
  p.vx = at.tx * p.rail.speed; p.vy = at.ty * p.rail.speed;
  p.level = r.level || 0; p.stillT = 0; p.inv = Math.max(p.inv, 0.25);
  if (!reduced() && Math.random() < 0.9) {
    const bx = -at.tx, by = -at.ty;
    particle(room, p.x + bx * 18, p.y + by * 18, Math.random() < 0.5 ? '#ffffff' : r.color,
      bx * (160 + Math.random() * 220), by * (160 + Math.random() * 220), 0.2, 5.5, 'dot');
  }
  if (ended) {
    r.used = true;
    p.x = r.x2; p.y = r.y2; p.vx *= 0.18; p.vy *= 0.18;
    p.rail = null; p._railLatchCd = Math.max(p._railLatchCd || 0, 0.1);
    p.level = levelAt(room, p.x, p.y);
    p._enterPortalNow = true; // deliver straight into the portal (rooms.updateRound)
    ripple(room, p.x, p.y, r.color, 120, 0.42);
    burst(room, p.x, p.y, '#ffffff', 16, 240, 0.3, 3);
  }
  return true;
}

function segmentSegmentDist(ax, ay, bx, by, cx, cy, dx, dy) {
  if (segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy)) return 0;
  return Math.min(
    segmentPointDist(ax, ay, bx, by, cx, cy), segmentPointDist(ax, ay, bx, by, dx, dy),
    segmentPointDist(cx, cy, dx, dy, ax, ay), segmentPointDist(cx, cy, dx, dy, bx, by),
  );
}

function segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
  const eps = 1e-6;
  const orient = (px, py, qx, qy, rx, ry) => (qx - px) * (ry - py) - (qy - py) * (rx - px);
  const onSeg = (px, py, qx, qy, rx, ry) =>
    qx >= Math.min(px, rx) - eps && qx <= Math.max(px, rx) + eps &&
    qy >= Math.min(py, ry) - eps && qy <= Math.max(py, ry) + eps;
  const o1 = orient(ax, ay, bx, by, cx, cy), o2 = orient(ax, ay, bx, by, dx, dy);
  const o3 = orient(cx, cy, dx, dy, ax, ay), o4 = orient(cx, cy, dx, dy, bx, by);
  if (Math.abs(o1) <= eps && onSeg(ax, ay, cx, cy, bx, by)) return true;
  if (Math.abs(o2) <= eps && onSeg(ax, ay, dx, dy, bx, by)) return true;
  if (Math.abs(o3) <= eps && onSeg(cx, cy, ax, ay, dx, dy)) return true;
  if (Math.abs(o4) <= eps && onSeg(cx, cy, bx, by, dx, dy)) return true;
  return ((o1 < -eps && o2 > eps) || (o1 > eps && o2 < -eps)) &&
    ((o3 < -eps && o4 > eps) || (o3 > eps && o4 < -eps));
}



function detachRail(p, room, info, ix, iy, opts = {}) {
  const n = norm(ix, iy);
  if (n.m < 0.05) return false;
  const carry = opts.carry ?? 300;
  const speed = opts.speed ?? 720;
  p.rail = null;
  p._railLatchCd = Math.max(p._railLatchCd || 0, opts.cd ?? 0.24);
  p.inv = Math.max(p.inv, 0.12);
  p.vx = n.x * speed + (info?.tx || 0) * (info?.dir || 1) * carry;
  p.vy = n.y * speed + (info?.ty || 0) * (info?.dir || 1) * carry;
  p.flowT = Math.max(p.flowT || 0, 0.08);
  ripple(room, p.x, p.y, opts.color || room.biome.pal.accent2, 72, 0.24);
  burst(room, p.x, p.y, '#ffffff', 8, 150, 0.22, 2.4);
  addFloat(room, p.x, p.y - 42, opts.glyph || '↘', opts.color || room.biome.pal.accent2, false, 0.32);
  return true;
}

function updateRailRide(p, room, move, dt) {
  if (!p.rail?.active) return false;
  if (p.rail.kind === 'escape') return updateEscapeRailRide(p, room, move, dt);
  if (p.rail.kind === 'sky') return updateSkyRailRide(p, room, move, dt);
  const info0 = railPoint(room, p, p.rail.s || 0);
  if (move.active) {
    const along = move.x * info0.tx + move.y * info0.ty;
    const inward = move.x * info0.nx + move.y * info0.ny;
    // Edge rails are highways, not traps. Steering into the room peels you off;
    // dashing/holding along the rail still rockets around the loop.
    if (p.rail.t > 0.055 && inward > 0.34 && Math.abs(inward) >= Math.abs(along) * 0.62) {
      const info = { ...info0, dir: p.rail.dir || 1 };
      return detachRail(p, room, info, info0.nx + info0.tx * along * 0.16, info0.ny + info0.ty * along * 0.16,
        { speed: 760, carry: 340, cd: 0.24, glyph: '↘' });
    }
    if (Math.abs(along) > 0.35) p.rail.dir = along > 0 ? 1 : -1;
  }
  p.rail.t += dt;
  p.rail.rocketT = Math.max(0, (p.rail.rocketT || 0) - dt);
  const target = p.rail.rocketT > 0 ? 1980 : 980;
  p.rail.speed = damp(p.rail.speed || target, target, p.rail.rocketT > 0 ? 8 : 4.5, dt);
  p.rail.s = (p.rail.s || 0) + (p.rail.dir || 1) * p.rail.speed * dt;
  const info = railPoint(room, p, p.rail.s);
  p.x = info.x; p.y = info.y;
  p.vx = info.tx * (p.rail.dir || 1) * p.rail.speed;
  p.vy = info.ty * (p.rail.dir || 1) * p.rail.speed;
  p.level = 0; p.stillT = 0; p.flowT = Math.max(p.flowT || 0, 0.08);
  if (p.rail.rocketT > 0) {
    if (!(p._dashHitIds instanceof Set)) p._dashHitIds = new Set();
    performDashCut(p, room, PLAYER.DASH_SWEEP_RANGE * 1.35);
  }
  if (!reduced() && Math.random() < (p.rail.rocketT > 0 ? 0.70 : 0.28)) {
    const bx = -info.tx * (p.rail.dir || 1), by = -info.ty * (p.rail.dir || 1);
    particle(room, p.x + bx * 18, p.y + by * 18, p.rail.rocketT > 0 ? '#ffffff' : room.biome.pal.accent2,
      bx * (120 + Math.random() * 160), by * (120 + Math.random() * 160), 0.18, p.rail.rocketT > 0 ? 5 : 3, 'dot');
  }
  return true;
}

function updateSkyRailRide(p, room, move, dt) {
  const r = p.rail.rail;
  if (!r) { p.rail = null; return false; }
  const info0 = skyRailPoint(r, p.rail.u || 0);
  if (move.active) {
    const along = move.x * info0.tx + move.y * info0.ty;
    const side = move.x * info0.nx + move.y * info0.ny;
    // Push perpendicular to a sky rail to drop/peel off. This makes long upper
    // routes feel optional and stylish instead of sticky.
    if (p.rail.t > 0.055 && Math.abs(side) > 0.38 && Math.abs(side) >= Math.abs(along) * 0.74) {
      const info = { ...info0, dir: p.rail.dir || 1 };
      return detachRail(p, room, info, info0.nx * Math.sign(side) + info0.tx * along * 0.12,
        info0.ny * Math.sign(side) + info0.ty * along * 0.12,
        { speed: 780, carry: 360, cd: 0.26, glyph: side > 0 ? '↙' : '↘', color: r.color || room.biome.pal.accent2 });
    }
    if (Math.abs(along) > 0.35) p.rail.dir = along > 0 ? 1 : -1;
  }
  p.rail.t += dt;
  p.rail.rocketT = Math.max(0, (p.rail.rocketT || 0) - dt);
  const target = p.rail.rocketT > 0 ? 2200 : (r.boost || 1320);
  p.rail.speed = damp(p.rail.speed || target, target, p.rail.rocketT > 0 ? 9 : 5.2, dt);
  p.rail.u = (p.rail.u || 0) + (p.rail.dir || 1) * p.rail.speed * dt / Math.max(1, info0.len);
  const ended = p.rail.u <= 0 || p.rail.u >= 1;
  const info = skyRailPoint(r, p.rail.u);
  p.x = info.x; p.y = info.y;
  p.vx = info.tx * (p.rail.dir || 1) * p.rail.speed;
  p.vy = info.ty * (p.rail.dir || 1) * p.rail.speed;
  p.level = r.level || 1; p.stillT = 0; p.flowT = Math.max(p.flowT || 0, 0.10);
  if (p.rail.rocketT > 0) {
    if (!(p._dashHitIds instanceof Set)) p._dashHitIds = new Set();
    performDashCut(p, room, PLAYER.DASH_SWEEP_RANGE * 1.45);
  }
  if (!reduced() && Math.random() < (p.rail.rocketT > 0 ? 0.76 : 0.36)) {
    const bx = -info.tx * (p.rail.dir || 1), by = -info.ty * (p.rail.dir || 1);
    particle(room, p.x + bx * 18, p.y + by * 18, p.rail.rocketT > 0 ? '#ffffff' : (r.color || room.biome.pal.accent2),
      bx * (130 + Math.random() * 180), by * (130 + Math.random() * 180), 0.18, p.rail.rocketT > 0 ? 5.5 : 3.2, 'dot');
  }
  if (ended) {
    p.rail = null;
    p._railLatchCd = Math.max(p._railLatchCd || 0, 0.18);
    p.inv = Math.max(p.inv, 0.12);
    ripple(room, p.x, p.y, r.color || room.biome.pal.accent2, 70, 0.24);
  }
  return true;
}



// nearest live enemy on the player's level — the auto-aim target when not aiming manually.
function nearestEnemy(room, p) {
  let best = null, bd = Infinity;
  const lv = p.level || 0;
  for (const e of room.enemies) {
    if (e.hp <= 0 || (e.level || 0) !== lv) continue;
    const dx = e.x - p.x, dy = e.y - p.y, d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

export function firePlayer(p, room) {
  // floor the cadence so stacked fire perks (Redline + 'rapid' pickups both bump perks.fire) can't
  // collapse the cooldown into a bullet/particle hose
  p.fireCd = Math.max(0.075, p.fireDelay * Math.pow(0.9, p.perks.fire));
  p.shots++;
  sfx('shot');
  const ax = p.aimX, ay = p.aimY;
  // Shots leave the visually shrunken muzzle. EMITTER_* are art-space constants;
  // DRAW_SCALE converts them to world-space so the bullets don't float ahead of the gun.
  const S = PLAYER.DRAW_SCALE || 1;
  const elen = PLAYER.EMITTER_LEN * S, eoy = PLAYER.EMITTER_Y * S, toff = PLAYER.TWIN_OFFSET * S;
  const ex = p.x + ax * elen, ey = p.y + eoy + ay * elen;
  // louder muzzle: a bright pop + a wider spray of sparks at the barrel tips
  particle(room, ex, ey, '#ffffff', ax * 70, ay * 70, 0.07, 5.5);
  for (let i = 0; i < 5; i++) {
    particle(room, ex, ey, room.biome.pal.accent,
      ax * (110 + Math.random() * 120) + (Math.random() * 70 - 35),
      ay * (110 + Math.random() * 120) + (Math.random() * 70 - 35), 0.17, 2.0 + Math.random() * 1.8);
  }
  const primed = (p._dashPrimed || 0) > 0;   // "dash primes next shot" relic empowers this volley
  if (primed) p._dashPrimed--;
  const dmgBase = p.damage * (1 + p.perks.damage * 0.15);
  const crit = Math.random() < p.crit;
  let dmg = dmgBase * PLAYER.SHOT_MULT * (crit ? PLAYER.CRIT_MULT : 1);
  if (primed) dmg *= PLAYER.DASH_PRIME_MULT;
  // twin-relay: two shots offset perpendicular (No Moon twin weapon)
  const px = -ay, py = ax;
  const r = primed ? PLAYER.SHOT_R * 1.5 : PLAYER.SHOT_R;
  const col = primed ? '#eaffff' : (crit ? '#ffffff' : room.biome.pal.accent);
  for (let side = -1; side <= 1; side += 2) {
    spawnBullet(room, 'player',
      ex + px * toff * side, ey + py * toff * side,
      ax * PLAYER.SHOT_SPEED + px * 28 * side, ay * PLAYER.SHOT_SPEED + py * 28 * side,
      r, dmg, PLAYER.SHOT_LIFE, col,
      { level: p.level, pierce: primed ? PLAYER.DASH_PRIME_PIERCE : 0, primed });
  }
  hooks.run('onFire', p, { x: ax, y: ay, oy: eoy });
}

// The dash is a continuous sweep: called at launch (big bite) and every frame while
// dashing (sweep range), so it cuts everything along the ~430px travel — not just
// whoever stood next to the launch pad. A per-dash Set caps each enemy to one hit.
function performDashCut(p, room, range) {
  if (!(p._dashHitIds instanceof Set)) p._dashHitIds = new Set();
  const dmg = p.damage * (1 + p.perks.damage * 0.15) * PLAYER.DASH_HIT_MULT;
  let hits = 0;
  for (const e of room.enemies) {
    if (e.hp <= 0 || e.level !== p.level) continue; // dash only cuts your own level
    const key = e.id ?? e;
    if (p._dashHitIds.has(key)) continue;           // one hit per enemy per dash
    if (dist(p.x, p.y, e.x, e.y) < range + e.r) {
      p._dashHitIds.add(key);
      const k = norm(e.x - p.x, e.y - p.y);
      damageEnemy(e, dmg, k.x * PLAYER.DASH_KNOCK, k.y * PLAYER.DASH_KNOCK, 'dash');
      // make it obvious the dash cut through: bright spark + a slash mark
      burst(room, e.x, e.y, '#ffffff', 9, 240, 0.28, 3);
      addFloat(room, e.x, e.y - e.r - 8, '✦', '#ffffff', false, 0.34);
      hits++;
    }
  }
  if (hits) {
    addFlash(0.14); addShake(0.26);
    // prime the next shot ONCE per dash (not once per enemy cut), so blender-dashing a
    // crowd doesn't turn into a frame-rate fire hose
    if (!p._dashCutPrimed) { p._dashCutPrimed = true; p.fireCd = 0; }
  }
  return hits;
}

export function tryDash(dx = null, dy = null, move = null) {
  if (state.mode !== 'play' || !state.run) return;
  const p = state.run.player, room = state.room;
  if (p.dashCd > 0 || p.dashT > 0 || p.air) return; // can't restart a dash mid-dash/vent-hop
  if (dx == null) {
    if (move && move.active) { dx = move.x; dy = move.y; }
    else { dx = p.aimX; dy = p.aimY; }
  }
  const n = norm(dx, dy);
  if (n.m < 0.08) return;

  // Rails: dash along the rail to rocket; dash away to cut off into a normal dash.
  if (p.rail?.active) {
    if (p.rail.kind === 'sky') {
      const info = skyRailPoint(p.rail.rail, p.rail.u || 0);
      const along = n.x * info.tx + n.y * info.ty;
      const inward = n.x * info.nx + n.y * info.ny;
      if (Math.abs(along) > 0.42 && Math.abs(along) >= Math.abs(inward) * 0.72) {
        p.rail.dir = along >= 0 ? 1 : -1;
        p.rail.speed = Math.max(p.rail.speed || 0, 2250);
        p.rail.rocketT = 0.56;
        p.lastDashAngle = Math.atan2(info.ty * p.rail.dir, info.tx * p.rail.dir);
        p._dashHitIds = new Set(); p._dashCutPrimed = false;
        p.inv = Math.max(p.inv, PLAYER.DASH_IFRAMES);
        p.dashCd = 0;
        p.dashes++;
        sfx('dash'); haptic(16); hitPause('shot'); addShake(0.24);
        ripple(room, p.x, p.y, p.rail.rail?.color || room.biome.pal.accent2, 118, 0.44);
        burst(room, p.x, p.y, '#ffffff', 18, 280, 0.30, 3.5);
        const hits = performDashCut(p, room, PLAYER.DASH_HIT_RANGE * 1.35);
        hooks.run('onDash', p, hits);
        slowMo(0.05);
        return;
      }
      p.rail = null; p._railLatchCd = Math.max(p._railLatchCd || 0, 0.20);
    } else {
      const info = railPoint(room, p, p.rail.s || pointToRailS(room, p, p.x, p.y));
      const along = n.x * info.tx + n.y * info.ty;
      const inward = n.x * info.nx + n.y * info.ny;
      if (Math.abs(along) > 0.42 && Math.abs(along) >= Math.abs(inward) * 0.72) {
        p.rail.dir = along >= 0 ? 1 : -1;
        p.rail.speed = Math.max(p.rail.speed || 0, 2100);
        p.rail.rocketT = 0.54;
        p.lastDashAngle = Math.atan2(info.ty * p.rail.dir, info.tx * p.rail.dir);
        p._dashHitIds = new Set(); p._dashCutPrimed = false;
        p.inv = Math.max(p.inv, PLAYER.DASH_IFRAMES);
        p.dashCd = 0;
        p.dashes++;
        sfx('dash'); haptic(16); hitPause('shot'); addShake(0.22);
        ripple(room, p.x, p.y, room.biome.pal.accent2, 110, 0.42);
        burst(room, p.x, p.y, '#ffffff', 16, 260, 0.28, 3.2);
        const hits = performDashCut(p, room, PLAYER.DASH_HIT_RANGE * 1.25);
        hooks.run('onDash', p, hits);
        slowMo(0.05);
        return;
      }
      p.rail = null; p._railLatchCd = Math.max(p._railLatchCd || 0, 0.20);
    }
  }

  p.lastDashAngle = Math.atan2(n.y, n.x);
  p.vx = n.x * PLAYER.DASH_IMPULSE; p.vy = n.y * PLAYER.DASH_IMPULSE;
  p.dashT = p.dashDur;
  p._dashStartLevel = p.level || 0;
  p._dashHitIds = new Set(); p._dashCutPrimed = false; // fresh per-dash hit-set + prime gate
  p.dashSpinDir = (n.x * p.aimY - n.y * p.aimX) >= 0 ? 1 : -1;
  p.inv = Math.max(p.inv, PLAYER.DASH_IFRAMES);
  p.dashCd = Math.min(p.dashCdBase, p.dashDur); // ready again by the time the committed dash ends
  p.dashes++;
  sfx('dash'); haptic(14); hitPause('shot'); addShake(0.16);
  ripple(room, p.x, p.y, room.biome.pal.accent3, 76); // launch punctuation
  for (let i = 0; i < 28; i++) {
    particle(room, p.x - n.x * 10, p.y - n.y * 10, room.biome.pal.accent3,
      -n.x * (150 + Math.random() * 270) + (Math.random() * 180 - 90),
      -n.y * (150 + Math.random() * 270) + (Math.random() * 180 - 90), 0.32, 2 + Math.random() * 3.8);
  }
  const hits = performDashCut(p, room, PLAYER.DASH_HIT_RANGE); // launch bite; the per-frame sweep continues it along the travel
  hooks.run('onDash', p, hits);   // relics (e.g. dash-primes-shot) listen here
  // bigger dash = bigger feedback
  slowMo(0.06);
}
