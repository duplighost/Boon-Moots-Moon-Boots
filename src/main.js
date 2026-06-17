// Boot + frame loop + mode state machine + debug API.
import { state, saveNow } from './state.js';
import { decayFx } from './systems/juice.js';
import { resize, updateCamera, view } from './render/camera.js';
import { initDraw, drawFrame } from './render/draw.js';
import { loadSprites } from './render/sprites.js';
import { updateParticles } from './render/particles.js';
import { initInput, getMove, getAim, tickTouchDash } from './ui/input.js';
import { updateBehavior } from './systems/notices.js';
import { ensureBgm, toggleBgm } from './audio/bgm.js';
import {
  initOverlays, showTitle, showCodex, showPause, wirePauseButtons, wireSfxButton,
  wireBgmButton, setMenu, hideOverlays, updateHud, setSfxLabels,
} from './ui/overlays.js';
import { updatePlayer } from './systems/player.js';
import { updateEnemies, updateSpawnQueue, makeEnemy } from './systems/enemies.js';
import { updateBullets } from './systems/bullets.js';
import { updateHazards } from './systems/hazards.js';
import { updatePickups } from './systems/pickups.js';
import { tickDirector } from './systems/director.js';
import { tickCombo } from './systems/score.js';
import { startRun, updateRound, updateTransition, beginRound } from './systems/rooms.js';
import { ensure as ensureAudio, toggleSfx, sfx } from './audio/sfx.js';
import { rollRoom, reachableFrom } from './systems/roomRoller.js';
import { damageEnemy } from './systems/combat.js';
import { wireDraftUi, pickCard, boonReroll, grantItem } from './systems/draft.js';
import { updateCare } from './systems/events.js';
import { updateShop } from './systems/shop.js';
import { stacks } from './systems/items.js';
import { renderDraft, updateBuildChips } from './ui/overlays.js';
import { FX, VERSION } from './config.js';

let canvas, bloomCanvas, last = 0;

export function boot() {
  canvas = document.getElementById('game');
  bloomCanvas = document.createElement('canvas');
  initDraw(canvas, bloomCanvas);
  resize(canvas, bloomCanvas);
  addEventListener('resize', () => resize(canvas, bloomCanvas), { passive: true });
  loadSprites();
  initOverlays();

  const menu = {
    start: () => { ensureAudio(); ensureBgm(); startRun(); updateHud(); },
    restart: () => { startRun(); updateHud(); },
  };
  setMenu(menu);
  const actions = {
    start: () => menu.start(),
    pause: togglePause,
    codex: () => { if (state.mode === 'title' || state.mode === 'dead') showCodex(); },
    toggleSfx: () => { toggleSfx(); setSfxLabels(); },
    toggleBgm: () => { toggleBgm(); updateHud(); },
    firstInteract: () => { ensureAudio(); ensureBgm(); },
  };
  initInput(canvas, actions);
  wirePauseButtons(togglePause, actions.toggleSfx);
  wireSfxButton(actions.toggleSfx);
  wireBgmButton(actions.toggleBgm);
  wireDraftUi(
    (choices, canReroll) => renderDraft(choices, canReroll, pickCard, boonReroll,
      (id) => stacks(state.run?.player, id)),
    (player) => updateBuildChips(player),
  );
  showTitle(menu);
  updateHud();
  installDebug(actions);

  addEventListener('pagehide', finalSave);
  addEventListener('beforeunload', finalSave);

  last = performance.now();
  requestAnimationFrame(frame);
}

function togglePause() {
  if (state.mode === 'pause') {
    state.mode = state.oldMode || 'play';
    showPause(false);
  } else if (state.mode === 'play') {
    state.oldMode = state.mode;
    state.mode = 'pause';
    showPause(true, state.save.settings.sfx ? 'sfx on' : 'sfx off');
  }
}

function finalSave() {
  if (state.run) {
    state.save.bestScore = Math.max(state.save.bestScore || 0, Math.floor(state.run.score));
    state.save.bestRound = Math.max(state.save.bestRound || 0, state.run.round);
  }
  saveNow();
}

function frame(t) {
  const raw = Math.min(0.05, Math.max(0.0005, (t - last) / 1000));
  last = t;
  state.frameTimes.push(raw);
  if (state.frameTimes.length > 120) state.frameTimes.shift();
  // adaptive quality: sustained slow frames in play → shed bloom + particles (sticky)
  if (!state.lowFx && state.mode === 'play' && state.frameTimes.length === 120) {
    const avg = state.frameTimes.reduce((a, b) => a + b, 0) / 120;
    if (avg > 0.024) state.lowFx = true;
  }

  decayFx(raw);
  step(raw);
  drawFrame();
  updateHud();
  requestAnimationFrame(frame);
}

export function step(raw) {
  const room = state.room;
  switch (state.mode) {
    case 'play': {
      if (!state.run || !room) break;
      if (state.fx.hitPause > 0) {
        updateParticles(room, raw * 0.55);
        break;
      }
      const dt = Math.min(0.033, raw) * (state.fx.slowMo > 0 ? FX.SLOWMO_SCALE : 1);
      tickTouchDash();
      const move = getMove(), aim = getAim();
      const p = state.run.player;
      updatePlayer(p, move, aim, room, dt);
      updateBehavior(room, p, move, aim, raw);
      updateSpawnQueue(room, dt);
      tickDirector(room, dt);
      updateEnemies(room, dt);
      updateBullets(room, dt);
      updateHazards(room, dt);
      updatePickups(room, dt);
      updateCare(room, dt);
      updateShop(room, dt);
      updateParticles(room, raw);
      tickCombo(raw);
      updateRound(dt);
      updateCamera(dt);
      break;
    }
    case 'transition': {
      if (room) {
        updateParticles(room, raw);
        updateCamera(Math.min(0.033, raw));
      }
      updateTransition(raw);
      break;
    }
    default: {
      if (room) updateParticles(room, raw);
    }
  }
}

// ── console verification API (Boon Moots' passengerTactile* pattern) ─────────
function installDebug(actions) {
  if (typeof window === 'undefined') return;
  window.oneRoomDebug = {
    version: VERSION,
    state: () => ({
      version: VERSION, mode: state.mode,
      view: { W: view.W, H: view.H, dpr: view.DPR, mobile: view.mobile, scale: view.scale },
      run: state.run ? {
        seed: state.run.seedText, round: state.run.round,
        score: Math.floor(state.run.score), combo: +state.run.combo.toFixed(2),
        kills: state.run.kills, hp: state.run.player?.hp, maxHp: state.run.player?.maxHp,
        dashReady: (state.run.player?.dashCd || 0) <= 0,
      } : null,
      room: state.room ? {
        round: state.room.round, biome: state.room.biome.id, layout: state.room.layoutId,
        recipe: state.room.recipeId, stage: state.room.stage,
        enemies: state.room.enemies.length, queued: state.room.spawnQueue.length,
        bullets: state.room.bullets.length, obstacles: state.room.obstacles.filter(o => !o.gone).length,
        hazards: state.room.hazards.length, lanes: state.room.lanes.length,
        particles: state.room.particles.length, cleared: state.room.cleared,
        annex: state.room.annex ? state.room.annex.kind : null,
        floorplan: state.room.floorplanId, tiers: state.room.tiers.length,
        vents: state.room.vents?.length || 0, skyRails: state.room.skyRails?.length || 0, setpieces: state.room.setpieces?.length || 0,
        shop: state.room.shop ? { itemId: state.room.shop.itemId, cost: state.room.shop.cost, bought: !!state.room.shop.bought } : null,
        edgeRail: !!state.room.edgeRail,
        bossId: state.room.bossId, eventId: state.room.eventId,
        overdrive: state.run?.overdrive || false,
      } : null,
      save: { bestScore: state.save.bestScore, bestRound: state.save.bestRound, sparks: state.save.sparks, runs: state.save.runs },
    }),
    start: (seed) => { actions.start ? (seed != null ? startRun(seed) : startRun()) : startRun(seed); updateHud(); return window.oneRoomDebug.state(); },
    skipRound: () => {
      if (!state.run) startRun();
      else { hideOverlays(); state.mode = 'play'; state.transition = null; beginRound(state.run.round + 1); }
      return window.oneRoomDebug.state();
    },
    killAll: () => {
      const room = state.room;
      if (!room) return null;
      room.spawnQueue.length = 0;
      if (room.pendingWaves) for (const w of room.pendingWaves) w.fired = true;
      for (const e of room.enemies.slice()) damageEnemy(e, 99999, 0, 0, 'shot');
      return window.oneRoomDebug.state();
    },
    grant: (id) => { grantItem(id, 'debug'); return state.run?.player.modules; },
    // art inspection: a frozen row of one of each enemy type
    lineup: () => {
      const room = state.room; if (!room) return null;
      const types = ['skitter', 'gunner', 'charger', 'turret', 'brute', 'sniper', 'hexer', 'myrmidon'];
      room.enemies.length = 0; room.spawnQueue.length = 0; room.bullets.length = 0;
      if (room.pendingWaves) for (const w of room.pendingWaves) w.fired = true;
      const y = room.h * 0.5, x0 = room.w * 0.5 - (types.length - 1) * 70 / 2;
      types.forEach((t, i) => {
        const e = makeEnemy(t, x0 + i * 70, y, room);
        e.hp = e.maxHp = 9999; e.stun = 9999; // hold still for the photo
        room.enemies.push(e);
      });
      const p = state.run.player; p.x = room.w * 0.5; p.y = y + 150;
      return types.join(', ');
    },
    pick: (i = 0) => { pickCard(i); return window.oneRoomDebug.state(); },
    // headless variety audit: generate n rooms, return axis summaries
    roll: (n = 20) => {
      if (!state.run) startRun('audit');
      const out = [];
      const run = state.run;
      for (let i = 1; i <= n; i++) {
        const r = rollRoom(run, i);
        const reach = reachableFrom(r, r.w / 2, r.h * 0.66);
        out.push({
          round: i, biome: r.biome.id, layout: r.layoutId, recipe: r.recipeId,
          stage: r.stage, obstacles: r.obstacles.length,
          hazards: r.hazards.length + r.lanes.length,
          breakables: r.obstacles.filter(o => o.breakable).length,
          waves: r.pendingWaves?.length || 0, annex: r.annex?.kind || null,
          boss: r.bossId || null, event: r.eventId || null,
          floorplan: r.floorplanId, tiers: r.tiers.length,
          vents: r.vents?.length || 0, skyRails: r.skyRails?.length || 0, setpieces: r.setpieces?.length || 0,
          shop: !!r.shop, edgeRail: !!r.edgeRail,
          portalReachable: reach.has(r.w / 2, r.h * 0.20),
        });
      }
      let repeats = 0;
      for (let i = 1; i < out.length; i++) {
        if (out[i].biome === out[i - 1].biome) repeats++;
        // boss arenas force ring/crossroads outside the bag — exempt from the audit
        if (!out[i].boss && !out[i - 1].boss && out[i].layout === out[i - 1].layout) repeats++;
      }
      return { rooms: out, consecutiveRepeats: repeats };
    },
    selfTest: () => {
      const small = [];
      if (typeof document !== 'undefined') {
        for (const n of document.querySelectorAll('button')) {
          const r = n.getBoundingClientRect();
          if (r.width > 0 && r.height > 0 && (r.width < 44 || r.height < 44)) {
            small.push({ text: (n.textContent || '').trim().slice(0, 30), w: Math.round(r.width), h: Math.round(r.height) });
          }
        }
      }
      const times = state.frameTimes.slice().sort((a, b) => a - b);
      const p95 = times.length ? times[Math.floor(times.length * 0.95)] : 0;
      return {
        ok: small.length === 0,
        version: VERSION,
        frameP95ms: +(p95 * 1000).toFixed(2),
        lowFx: state.lowFx,
        smallTargets: small,
        overflow: typeof document !== 'undefined' ? document.documentElement.scrollWidth - innerWidth : 0,
      };
    },
    sfxTest: () => { sfx('kill'); return 'played kill'; },
  };
}
