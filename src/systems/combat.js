// Shared damage/kill/hurt resolution — the one place hp changes hands.
import { state } from '../state.js';
import { PLAYER, TAU } from '../config.js';
import { norm } from '../rng.js';
import { particle, burst, addFloat, ripple } from '../render/particles.js';
import { addShake, addFlash, hitPause, haptic, slowMo } from './juice.js';
import { sfx } from '../audio/sfx.js';
import { killScore } from './score.js';
import { hooks } from './items.js';

export function damageEnemy(e, dmg, kx = 0, ky = 0, kind = 'shot') {
  if (e.hp <= 0) return;
  if (e.invulnT > 0) { e.shieldSpark = 0.1; return; } // mid phase-shift transformation: untouchable
  const wasStaggered = (e.stun || 0) > 0.12;   // already reeling before this blow?
  dmg = hooks.reduce('modDamage', dmg, e, kind);
  // Warden's rotating shield gap: only hits/dashes that come through the GAP land full
  // damage; everything else sparks off the armour. (kx,ky is the hit direction.)
  if (e.shield && (kx || ky)) {
    const hitAng = Math.atan2(-ky, -kx);
    const diff = Math.abs(((hitAng - (e.shieldAngle || 0) + Math.PI) % TAU + TAU) % TAU - Math.PI);
    if (diff > (e.gapHalf || 0.6)) { dmg *= 0.12; e.shieldSpark = 0.12; }
  }
  e.hp -= dmg;
  e.vx += kx; e.vy += ky;
  e.hit = Math.max(e.hit || 0, kind === 'dash' ? 0.18 : 0.11);
  // a dash blow STAGGERS non-boss enemies: their AI is gated on stun, so they reel
  // (and read as off-balance) long enough to set up a satisfying finish.
  e.stun = Math.max(e.stun || 0, kind === 'dash' && !e.boss ? 0.35 : 0.032);
  const room = state.room;
  hitPause(kind === 'pulse' ? 'pulse' : kind === 'dash' ? 'dash' : kind === 'chain' ? 'chain' : 'shot');
  addShake(kind === 'pulse' ? 0.28 : kind === 'dash' ? 0.18 : 0.06);
  for (let i = 0; i < 4; i++) {
    particle(room, e.x, e.y, kind === 'pulse' ? room.biome.pal.accent3 : e.color,
      (Math.random() * 180 - 90) + kx * 0.08, (Math.random() * 180 - 90) + ky * 0.08, 0.22, 2 + Math.random() * 2.4);
  }
  hooks.run('onHit', e, dmg, kind);
  if (e.hp <= 0) killEnemy(e, kind, wasStaggered);
}

export function killEnemy(e, kind = 'shot', staggered = false) {
  const room = state.room, run = state.run, p = run.player;
  e.hp = 0;
  if (e.boss && room.pendingWaves) {
    // the head dies, the summons stop coming (live escorts still fight)
    for (const w of room.pendingWaves) w.fired = true;
    room.spawnQueue.length = 0;
  }
  killScore(e);
  p.dashCd = Math.max(0, p.dashCd - PLAYER.DASH_KILL_REFUND); // every kill feeds the dash loop a little
  // spark scatter (meta currency)
  const n = (e.boss ? 24 : (e.captain ? 8 : 3 + Math.floor(Math.random() * 3)))
    + (room.mutator?.sparkBonus || 0);
  for (let i = 0; i < n; i++) {
    room.pickups.push({
      type: 'spark', x: e.x + Math.random() * 24 - 12, y: e.y + Math.random() * 24 - 12,
      vx: Math.random() * 240 - 120, vy: Math.random() * 240 - 120, r: 6, life: 8,
    });
  }
  const repairsAllowed = !room.mutator?.noRepairDrops || e.boss;
  if (repairsAllowed && (e.boss || Math.random() < 0.035) && p.hp < p.maxHp) {
    room.pickups.push({ type: 'repair', x: e.x, y: e.y, vx: Math.random() * 160 - 80, vy: Math.random() * 160 - 80, r: 11, life: 8 });
  }
  // death FX: a BOSS going down is the run's climax (below); a dash-kill gets the big
  // "pop"; anything else the standard burst.
  if (e.boss) {
    bossDeathFX(room, e);
  } else if (kind === 'dash') {
    dashKillPop(room, e, p);
    sfx('kill'); sfx('break'); // shatter crunch layered on the kill chime
  } else {
    burst(room, e.x, e.y, e.color, 13, 170, 0.5, 3);
    hitPause('kill');
    addShake(0.18);
    sfx('kill');
  }
  // executing an already-reeling enemy is a skill beat — punctuate it
  if (staggered && !e.boss) {
    ripple(room, e.x, e.y, room.biome.pal.accent3, 70, 0.32);
    addFloat(room, e.x, e.y - (e.r || 16) - 10, '✕', '#ffffff', false, 0.4);
  }
  if (e.captainDeath) e.captainDeath(e);
  hooks.run('onKill', e);
}

// A boss going down is the climax of the run — earn it: big bullet-time, a staged
// shatter, twin shockwaves, the screen wiped clear (you won the exchange), a callout.
function bossDeathFX(room, e) {
  slowMo(0.9);
  addFlash(0.6); addShake(1.2); hitPause('boss');
  burst(room, e.x, e.y, e.color, 60, 540, 0.95, 6);
  burst(room, e.x, e.y, '#ffffff', 30, 320, 0.7, 4);
  ripple(room, e.x, e.y, '#ffffff', 430, 1.2);
  ripple(room, e.x, e.y, e.color, 300, 1.0);
  // wipe incoming enemy fire — you won the exchange. MARK them dead (the bullet loop
  // culls life<=0) rather than reassigning room.bullets: this runs from inside the
  // bullet loop (boss killed by a shot), and swapping the array out mid-iteration
  // crashes it (undefined index) → froze the game on boss kills.
  for (const b of room.bullets) if (b.owner === 'enemy') b.life = 0;
  addFloat(room, e.x, e.y - (e.r || 40) - 30, '✕', '#ffffff', true, 1.7);
  sfx('kill'); sfx('clear'); sfx('break');
}

// The dash-kill "pop": a directional slice along the dash line, a white core, twin
// shockwave rings, and a brief slow-mo beat. Reads as Moots cutting clean through.
function dashKillPop(room, e, p) {
  const ang = (p.lastDashAngle ?? Math.atan2(p.vy, p.vx)) || 0;
  // bright core flash + a bigger, faster enemy-colour shatter than a normal kill
  burst(room, e.x, e.y, '#ffffff', 10, 150, 0.26, 3.4);
  burst(room, e.x, e.y, e.color, e.boss ? 46 : 20, 250, 0.5, 3.2);
  // directional "slice" — debris flung both ways along the cut line
  for (let i = 0; i < 12; i++) {
    const a = ang + (i % 2 ? 0 : Math.PI) + (Math.random() - 0.5) * 0.55;
    const sp = 240 + Math.random() * 320;
    particle(room, e.x, e.y, i % 3 ? e.color : '#ffffff',
      Math.cos(a) * sp, Math.sin(a) * sp, 0.32 + Math.random() * 0.22, 2 + Math.random() * 2.6);
  }
  ripple(room, e.x, e.y, '#ffffff', 96, 0.4);
  ripple(room, e.x, e.y, e.color, 60, 0.32);
  slowMo(0.08);            // capped via Math.max — chained dash-kills don't run away
  addFlash(0.2);
  addShake(e.boss ? 0.55 : 0.34);
  hitPause(e.boss ? 'boss' : 'dashKill');
}

export function hurtPlayer(amount, sx, sy, source = 'hit') {
  const p = state.run?.player, room = state.room;
  if (!p || p.inv > 0 || state.mode !== 'play') return false;
  if (p.shield > 0) {
    p.shield--; amount = 0;
    p.inv = 0.36;
    addFloat(room, p.x, p.y - 44, '◆', '#aef3ff');
  } else {
    p.hp -= amount;
    p.inv = PLAYER.HURT_IFRAMES;
  }
  p.roomHit = true;
  p.hurt = 0.34;
  addShake(0.46); addFlash(0.32); hitPause('hurt'); haptic(48);
  sfx('hurt');
  const k = norm(p.x - sx, p.y - sy);
  p.vx += k.x * PLAYER.HURT_KNOCK; p.vy += k.y * PLAYER.HURT_KNOCK;
  burst(room, p.x, p.y, room?.biome?.pal.bad || '#ff6b6b', 20, 140, 0.45, 3);
  hooks.run('onPlayerHurt', amount, source);
  if (p.hp <= 0) p.dead = true; // rooms.js notices and runs the death flow
  return true;
}
