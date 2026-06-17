// Round lifecycle: transition → live → clear → portal → next. Boon Moots'
// skeleton (index.html:277-305, 911-948) with the Room Roller in place of the
// theme deck.
import { state, newRun, bankBests, saveNow } from '../state.js';
import { dist } from '../rng.js';
import { rollRoom } from './roomRoller.js';
import { makePlayer } from './player.js';
import { roomClearScore } from './score.js';
import { vacuumSparks } from './pickups.js';
import { wavesDone } from './director.js';
import { addFloat, burst, ripple } from '../render/particles.js';
import { snapCamera } from '../render/camera.js';
import { addShake, addFlash, slowMo } from './juice.js';
import { sfx } from '../audio/sfx.js';
import { suppressInput } from '../ui/input.js';
import { showDeath, showOverlay, hideOverlays, updateHud, whisper } from '../ui/overlays.js';
import { hooks } from './items.js';
import { openDraft, chooseCards, grantItem } from './draft.js';
import { dropPickup } from './pickups.js';
import { applyShrine } from './meta.js';
import { notice } from './notices.js';
import { CLEAR_LINES, DEATH_LINES, MUTATOR_LINES } from '../data/lines.js';

export function startRun(seedText = Date.now()) {
  hooks.clear();
  const run = newRun(seedText);
  run.player = makePlayer();
  applyShrine(run.player);
  hideOverlays();
  state.mode = 'play';
  if (state.save.shrine?.shrine_head) {
    const free = chooseCards(1)[0];
    if (free) grantItem(free.id, 'found');
    beginRound(2);
  } else {
    beginRound(1);
  }
  saveNow();
}

function applyRoom(room) {
  state.room = room;
  const p = state.run.player;
  p.x = room.w / 2; p.y = room.h * 0.66;
  p.vx = p.vy = 0;
  // A room transition must never carry traversal state across the threshold.
  // Stale rail/vent/dash/flow flags could make the next room feel like an
  // invisible hand was pulling the player before they had touched anything.
  p.level = 0;
  p.dashT = 0; p.dashCd = 0;
  p.rail = null; p.air = null; p.airZ = 0; p.ventT = 0; p.flowT = 0;
  p.brakeT = 0; p._ventCd = 0; p._railLatchCd = 0; p.comboHealFx = 0; p.comboTierFx = 0;
  p._enterPortalNow = false; p._ventExitX = null; p._ventExitY = null; p._ventExitLevel = null;
  state.run.lastComboHealTier = null;
  p._dashStartLevel = null; p._dashHitIds = null;
  p._dashCutPrimed = false; p._dashFrameActive = false; p._lastX = p.x; p._lastY = p.y; p._dashLastX = p.x; p._dashLastY = p.y;
  p.inv = Math.max(p.inv, 0.9);
  p.roomHit = false;
  p.after.length = 0;
  suppressInput(160);
  snapCamera();
  addFloat(room, room.w / 2, room.wall + 64, biomeSigil(room.biome.hazard), room.biome.pal.accent3, true, 1.05);
  if (room.mutator) {
    addFloat(room, room.w / 2, room.wall + 104, room.mutator.name, room.biome.pal.bad, true, 1.5);
    whisper(MUTATOR_LINES[room.mutator.id] || '');
  }
  if (room.bossId) {
    const boss = room.enemies.find(e => e.boss);
    if (boss) addFloat(room, room.w / 2, room.wall + 110, boss.display.toUpperCase(), room.biome.pal.bad, true, 1.35);
  }
  hooks.run('onRoomStart', room);
}


function biomeSigil(hazard) {
  return ({
    snare: '⌘', fog: '◌', shard: '◇', thorn: '✹', pulse: '◎', spore: '✣',
    volatile: '⬖', lane: '↯', sightline: '◈', ritual: '☾',
  })[hazard] || '✦';
}

export function beginRound(n) {
  state.run.round = n;
  state.run.roomKills = 0;
  applyRoom(rollRoom(state.run, n));
}

export function clearRoom(room) {
  room.cleared = true;
  room.clearT = 0.5;
  room.bullets.length = 0;
  state.save.lifetime.rooms++;
  const p = state.run.player;
  const parts = roomClearScore(room);
  let y = p.y - 70;
  for (const part of parts) {
    addFloat(room, p.x, y, part.text, part.big ? '#ffffff' : room.biome.pal.accent2, !!part.big, 0.95);
    y -= 34;
  }
  vacuumSparks(room);
  sfx('clear');
  if (!p.roomHit && !state.run.flags.nohit) { state.run.flags.nohit = true; notice('nohit'); }
  if (state.run.round === 13 && !state.run.flags.truth) { state.run.flags.truth = true; notice('truth'); }
  else whisper(CLEAR_LINES[(state.run.round - 1) % CLEAR_LINES.length]);
  const boon = p.boon;
  boon.progress += room.bossId ? boon.need : 1; // bosses pay full lacing
  if (boon.progress >= boon.need) { boon.progress = 0; boon.charges = Math.min(1, boon.charges + 1); }
  if (room.bossId === 'archon' && !state.run.overdrive && !state.run.won) routeWin();
  room.portal = { x: room.w / 2, y: room.h * 0.20, r: 62, t: 0, open: 0 };
  if (room.eventId === 'ambushNest') {
    dropPickup(room, 'heart', room.portal.x, room.portal.y + 80);
    addFloat(room, room.portal.x, room.portal.y + 60, '+1 ♥', '#ff8ea6', true, 0.70);
  }
  // ── Make the clear UNMISSABLE: a screen flash + slam, a shockwave off the player,
  // a banner, and a portal that visibly punches open with a column of light. ──
  addFlash(0.5); addShake(0.42); slowMo(0.12);
  sfx('portal');
  ripple(room, p.x, p.y, '#ffffff', 220, 0.7);
  ripple(room, p.x, p.y, room.biome.pal.accent2, 320, 0.5);
  addFloat(room, p.x, p.y - 96, 'STAGE CLEAR', '#ffffff', true, 1.25);
  addFloat(room, p.x, p.y - 60, '↯ dash the rail home', room.biome.pal.accent2, false, 1.1);
  for (let i = 0; i < 50; i++) {
    const a = (i / 50) * Math.PI * 2, rr = 40 + Math.random() * 170;
    burst(room, room.portal.x, room.portal.y, room.biome.pal.accent3, 1, rr * 1.7, 0.85, 3);
  }
  spawnEscapeRail(room, p);
  hooks.run('onRoomClear', room);
}

// The express rail: a bright, ultra-fast grind line that springs from where you stand
// straight to the portal. It is deliberately forgiving to latch (player.js
// tryLatchEscapeRail) so a single dash toward the exit rockets you home — the smooth,
// obvious victory lap the brief asked for. You can still walk if you want.
function spawnEscapeRail(room, p) {
  const po = room.portal;
  if (!po) return;
  if (dist(p.x, p.y, po.x, po.y) < 320) { room.escapeRail = null; return; } // already on top of it
  // A ground-level express lane straight to the (ground-level) portal. Level 0 always,
  // so it never floats off a rooftop and the rider lands at the portal cleanly even if
  // the room was cleared up top (latching simply drops you onto the lane).
  room.escapeRail = {
    x1: p.x, y1: p.y, x2: po.x, y2: po.y,
    level: 0, width: 58, used: false, t: 0, phase: 0,
    color: '#eaffff',
  };
  addFloat(room, (p.x + po.x) / 2, (p.y + po.y) / 2, '↯', '#eaffff', true, 0.9);
}

export function updateRound(dt) {
  const room = state.room, run = state.run, p = run.player;
  if (!room) return;
  room.time += dt;

  if (p.dead) { die(); return; }

  if (!room.cleared && room.enemies.length === 0 && room.spawnQueue.length === 0 && wavesDone(room) && room.time > 0.8) {
    clearRoom(room);
  }

  if (room.portal) {
    room.portal.t += dt;
    room.portal.open = Math.min(1, (room.portal.open || 0) + dt * 2.4); // punch-open animation
    room.clearT = Math.max(0, room.clearT - dt);
    // Normal entry waits a beat (the clear read); the express rail delivers you
    // straight in (p._enterPortalNow) so the victory lap never stalls at the door.
    const onPortal = dist(room.portal.x, room.portal.y, p.x, p.y) < room.portal.r + p.r;
    if (onPortal && (p._enterPortalNow || room.clearT <= 0)) {
      p._enterPortalNow = false;
      enterPortal();
    }
  }
}

function enterPortal() {
  sfx('portal');
  // Every clear now gets a real graft choice. The room pauses long enough for the
  // player to understand what changed, then the transition resumes.
  openDraft(() => startTransition());
}

export function startTransition() {
  const run = state.run;
  const next = rollRoom(run, run.round + 1);
  state.transition = {
    timer: 0, duration: next.bossId ? 1.2 : 0.62, swapped: false, next,
    title: next.bossId ? (next.enemies.find(e => e.boss)?.display || next.biome.name) : (next.districtName || next.biome.name),
    sub: 'round ' + (run.round + 1) + (run.overdrive ? ' ∞' : ''),
    tag: next.bossId ? next.biome.name : (next.districtSubtitle || next.biome.mech),
    mut: next.mutator?.name || null,
    bossId: next.bossId,
  };
  state.mode = 'transition';
}

export function updateTransition(raw) {
  const t = state.transition;
  if (!t) { state.mode = 'play'; return; }
  t.timer += raw;
  if (!t.swapped && t.timer >= t.duration * 0.4) {
    t.swapped = true;
    state.run.round += 1;
    state.run.roomKills = 0;
    applyRoom(t.next);
  }
  if (t.timer >= t.duration) {
    state.transition = null;
    state.mode = 'play';
  }
}

function routeWin() {
  const run = state.run;
  run.won = true;
  run.overdrive = true;
  state.save.lifetime.wins++;
  // First clear of the final boss: Moots earns the shirt — worn forever after. Save it
  // right away so the unlock survives even if the player closes the tab here.
  const firstTime = !state.save.gotDressed;
  state.save.gotDressed = true;
  bankBests();          // writes the save (bests + the new gotDressed flag)
  saveNow();            // belt-and-suspenders: guarantee the cosmetic unlock persists
  notice('endless');
  state.oldMode = 'play';
  state.mode = 'pause'; // freeze the world under the overlay; portal waits
  showOverlay(
    firstTime ? 'You Won! You Got Dressed!' : 'ROUTE BURNT OPEN',
    firstTime
      ? `Moots beat the bottom of the city and finally found a shirt. Score ${Math.floor(run.score).toLocaleString()} · round ${run.round}. Keep grinding forever, or lace up from the start — the boots don't care which.`
      : `The throne cracked. Score ${Math.floor(run.score).toLocaleString()} · round ${run.round}. ` +
        'The room does not stop. It just stops pretending there was a bottom.',
    [['Keep going ∞', () => { hideOverlays(); state.mode = 'play'; }],
     ['From the start', () => startRun()]],
    firstTime ? 'cosmetic unlocked: the striped shirt · overdrive: ×1.35 score · no ceiling'
      : 'overdrive: ×1.35 score · the whole biome deck · no ceiling',
  );
}

export function die() {
  const run = state.run;
  state.mode = 'dead';
  state.save.lifetime.deaths++;
  bankBests();
  updateHud();
  showDeath({
    score: Math.floor(run.score), round: run.round,
    best: state.save.bestScore, bestRound: state.save.bestRound,
    kills: run.kills,
    title: DEATH_LINES[Math.floor(Math.random() * DEATH_LINES.length)],
  }, () => startRun());
}
