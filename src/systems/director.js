// Spawn director: budgets, recipes, staged waves, captain promotion, danger math.
// Grammar from No Moon (docs/no-moon-systems.md §1); staged delivery from the
// bellroom prototype's one good idea. Every spawn is telegraphed — nothing
// materializes on top of the player.
import { state } from '../state.js';
import { CAPS, DIRECTOR } from '../config.js';
import { clamp, dist, rand, randi, weightedPick, chance } from '../rng.js';
import { ENEMY_TYPES, POOL_WEIGHTS, CAPTAINS } from '../data/enemies.js';
import { spawnTelegraphed } from './enemies.js';
import { makeBoss } from './bosses.js';
import { addFloat } from '../render/particles.js';
import { addPulseHazard, addSlowFog } from './hazards.js';
import { view } from '../render/camera.js';

export const dangerStage = (round, overdrive) => {
  const s = Math.floor(round / DIRECTOR.STAGE_DIV);
  return overdrive ? s : Math.min(DIRECTOR.STAGE_CAP, s);
};
export const depthIdx = (round) => Math.min(9, Math.floor((round - 1) / 2));
export const isBossRound = (round) => round % 5 === 0;

// Recipes: weight multipliers over the base pool + density hints for the roller.
export const RECIPES = {
  mixed:         { needs: [],           mult: {},                                density: 0 },
  swarm:         { needs: [],           mult: { skitter: 3.2, gunner: 0.6 },     density: -1, countAdj: 2 },
  gunline:       { needs: ['turret'],   mult: { gunner: 2.6, turret: 2.4, skitter: 0.5 }, density: 2 },
  bite:          { needs: ['charger'],  mult: { charger: 3.0, skitter: 1.4, gunner: 0.4 }, density: -1 },
  anchor:        { needs: ['brute'],    mult: { brute: 3.4, skitter: 1.2 },      density: 0 },
  sniperGallery: { needs: ['sniper'],   mult: { sniper: 3.2, turret: 1.8, skitter: 0.6 }, density: 2 },
  hex:           { needs: ['hexer'],    mult: { hexer: 3.0, turret: 1.4, myrmidon: 1.4 }, density: 1 },
};

export function availableRecipes(round) {
  const have = Object.keys(ENEMY_TYPES).filter(t => ENEMY_TYPES[t].from <= round);
  return Object.keys(RECIPES).filter(id => RECIPES[id].needs.every(t => have.includes(t)));
}

function buildPool(round, recipe) {
  const pool = [];
  for (const [type, def] of Object.entries(ENEMY_TYPES)) {
    if (def.from > round) continue;
    let w = POOL_WEIGHTS[type];
    if (typeof w === 'function') w = w(round);
    w *= (RECIPES[recipe]?.mult[type] ?? 1);
    if (w > 0) pool.push({ item: type, w, cost: def.cost });
  }
  return pool;
}

export function rollComposition(rng, round, recipe, overdrive, budgetMult = 1) {
  const stage = dangerStage(round, overdrive);
  // Slightly denser than before (the brief: "slightly more, not packed") — ~12% up.
  let budget = (9 + round * 1.7 + stage * 1.5 + (RECIPES[recipe]?.countAdj || 0)) * budgetMult;
  const cap = view.mobile ? CAPS.ENEMIES.mobile : CAPS.ENEMIES.desktop;
  const pool = buildPool(round, recipe);
  const list = [];
  let guard = 80;
  while (budget >= 1 && list.length < cap && guard-- > 0) {
    const affordable = pool.filter(p => p.cost <= budget);
    if (!affordable.length) break;
    const type = weightedPick(rng, affordable);
    list.push(type);
    budget -= ENEMY_TYPES[type].cost;
  }
  return list;
}

// Spawn geometry: cluster points hugging edges, away from the player spawn.
// Big architectural rooms cache reachable anchors in roomRoller; late waves use
// those first so a reinforcement never appears behind a decorative murder-wall.
function sealedAnnexContains(room, x, y, pad = 0) {
  const a = room.annex;
  if (!a || a.opened) return false;
  const r = a.rect;
  return x > r.x - pad && x < r.x + r.w + pad && y > r.y - pad && y < r.y + r.h + pad;
}

function spawnBlocked(room, x, y, pad = 44) {
  if (sealedAnnexContains(room, x, y, pad + 18)) return true;
  for (const o of room.obstacles) {
    if (o.gone) continue;
    if (o.type === 'circle') {
      if (dist(x, y, o.x, o.y) < o.rad + pad) return true;
    } else {
      const cx = clamp(x, o.x, o.x + o.w), cy = clamp(y, o.y, o.y + o.h);
      if (dist(x, y, cx, cy) < pad) return true;
    }
  }
  return false;
}

function legalSpawnPoint(room, x, y) {
  const w = room.wall;
  return x > w + 55 && x < room.w - w - 55 && y > w + 55 && y < room.h - w - 55
    && dist(x, y, room.w / 2, room.h * 0.66) >= 460
    && !sealedAnnexContains(room, x, y, 86)
    && !spawnBlocked(room, x, y);
}

function jitterSpawn(room, rng, c, rx = 70, ry = 55) {
  const anchorMode = !!room.spawnAnchors?.length;
  const jx = anchorMode ? Math.min(32, rx) : rx;
  const jy = anchorMode ? Math.min(28, ry) : ry;
  for (let tries = 0; tries < 10; tries++) {
    const x = clamp(c.x + rand(rng, -jx, jx), room.wall + 60, room.w - room.wall - 60);
    const y = clamp(c.y + rand(rng, -jy, jy), room.wall + 60, room.h - room.wall - 60);
    if (legalSpawnPoint(room, x, y)) return { x, y };
  }
  return { x: c.x, y: c.y };
}

function spawnPoints(room, rng, n) {
  const pts = [];
  const anchors = room.spawnAnchors || [];
  const w = room.wall;
  const p = state.run?.player;
  for (let i = 0; i < n; i++) {
    // Anti-search: most clusters ring the player at engage range, so on an endless map
    // you never trek to find the fight — it comes to you. (Ranged types still hold their
    // distance once close, so you must zip in to finish them: waiting is never enough.)
    if (p && chance(rng, 0.55)) {
      let done = false;
      for (let tries = 0; tries < 16; tries++) {
        const a = rng() * Math.PI * 2, rr = rand(rng, 640, 1180);
        const x = clamp(p.x + Math.cos(a) * rr, w + 70, room.w - w - 70);
        const y = clamp(p.y + Math.sin(a) * rr, w + 70, room.h - w - 70);
        if (legalSpawnPoint(room, x, y) && dist(x, y, p.x, p.y) > 520) { pts.push({ x, y }); done = true; break; }
      }
      if (done) continue;
    }
    if (anchors.length) {
      for (let tries = 0; tries < 24; tries++) {
        const a = anchors[randi(rng, 0, anchors.length - 1)];
        const p = jitterSpawn(room, rng, a, 34, 30);
        if (legalSpawnPoint(room, p.x, p.y)) { pts.push(p); break; }
      }
      if (pts.length > i) continue;
    }
    for (let tries = 0; tries < 30; tries++) {
      const side = randi(rng, 0, 3);
      const x = side === 1 ? room.w - w - rand(rng, 60, 170)
        : side === 3 ? w + rand(rng, 60, 170)
        : rand(rng, w + 80, room.w - w - 80);
      const y = side === 0 ? w + rand(rng, 60, 150)
        : side === 2 ? room.h - w - rand(rng, 60, 150)
        : rand(rng, w + 80, room.h - w - 80);
      if (legalSpawnPoint(room, x, y)) { pts.push({ x, y }); break; }
    }
    if (pts.length <= i) pts.push({ x: room.w / 2, y: room.wall + 90 });
  }
  return pts;
}

export function buildWaves(room, rng) {
  const round = room.round;
  // scale the enemy budget with the (now city-scale) room so the sprawl stays full of action
  const areaMult = clamp(Math.sqrt((room.w * room.h) / (1500 * 1020)), 1, 2.6);

  if (room.bossId) {
    // boss arena: the boss is present as the room reveals; two escort waves follow
    room.enemies.push(makeBoss(room.bossId, room));
    const escortPool = room.biome.bias.filter(t => ENEMY_TYPES[t] && ENEMY_TYPES[t].from <= round);
    const escorts = escortPool.length ? escortPool : ['skitter'];
    room.pendingWaves = [];
    for (const at of [5, 8.5]) {
      const clusters = spawnPoints(room, rng, 2);
      const n = Math.round((2 + room.stage * 0.5) * areaMult);
      room.pendingWaves.push({
        at, fired: false,
        spawns: Array.from({ length: n }, (_, i) => {
          const c = clusters[i % clusters.length];
          const p = jitterSpawn(room, rng, c, 60, 50);
          return { type: escorts[i % escorts.length], x: p.x, y: p.y, delay: i * 0.15 };
        }),
      });
    }
    return;
  }

  let comp;
  if (room.mutator?.doubleRecipe) {
    // the room deals the hand twice: two compositions at reduced budget each
    comp = [
      ...rollComposition(rng, round, room.recipeId, state.run.overdrive, 0.62 * areaMult),
      ...rollComposition(rng, round, room.recipeId, state.run.overdrive, 0.62 * areaMult),
    ];
  } else {
    comp = rollComposition(rng, round, room.recipeId, state.run.overdrive, areaMult);
  }
  if (room.mutator?.extraSniper) {
    comp.push(ENEMY_TYPES.sniper.from <= round ? 'sniper' : 'gunner');
  }
  const splitAt = Math.max(2, Math.round(comp.length * DIRECTOR.REINFORCE_AT));
  const first = comp.slice(0, splitAt);
  const second = comp.slice(splitAt);
  const clusters = spawnPoints(room, rng, clamp(Math.ceil(first.length / 2.4), 2, 5));
  room.pendingWaves = [];

  const firstSpawns = first.map((type, i) => {
    const c = clusters[i % clusters.length];
    const p = jitterSpawn(room, rng, c, 70, 55);
    return { type, x: p.x, y: p.y, delay: 0.45 + i * 0.12 };
  });
  // High ground should be a reason to climb, not a single novelty perch. With a full
  // rooftop grid, seed enemies across many roofs so the rails/vents are a real combat
  // route and you find the fight up top instead of hunting for it.
  if (room.tiers && room.tiers.length) {
    const perches = [...room.tiers].sort((a, b) => (b.w * b.h) - (a.w * a.h)).slice(0, view.mobile ? 3 : 6);
    for (let i = 0; i < perches.length; i++) {
      const t = perches[i];
      const perch = ENEMY_TYPES.sniper.from <= round && i % 2 === 0 ? 'sniper'
        : ENEMY_TYPES.turret.from <= round ? 'turret'
        : ENEMY_TYPES.gunner ? 'gunner' : 'skitter';
      const x = t.x + t.w * rand(rng, 0.34, 0.66);
      const y = t.y + t.h * rand(rng, 0.34, 0.62);
      const spot = firstSpawns.find(s => !s._perched && (s.type === perch || i === 0)) || null;
      const data = { type: perch, x, y, delay: 0.25 + i * 0.16, _perched: true };
      if (spot) Object.assign(spot, data);
      else firstSpawns.push(data);
    }
  }
  room.pendingWaves.push({ at: 0, spawns: firstSpawns, fired: false });

  if (second.length) {
    room.pendingWaves.push({
      at: rand(rng, DIRECTOR.REINFORCE_DELAY[0], DIRECTOR.REINFORCE_DELAY[1]),
      orWhenLeft: 2, spawns: null, list: second, fired: false,
    });
  }

  // captain promotion (No Moon odds by depth, game_inline.js:14813-14826)
  const idx = room.idx;
  const baseChance = idx <= 1 ? 0.02 : idx <= 4 ? 0.07 : idx <= 7 ? 0.11 : 0.14;
  const forced = room.mutator?.forceCaptains || 0;
  let promoted = 0;
  for (const s of firstSpawns) {
    if (promoted >= Math.max(1, forced)) break;
    if (!forced && !chance(rng, baseChance)) continue;
    const eligible = CAPTAINS.filter(c => c.hosts.includes(s.type));
    if (!eligible.length) continue;
    const affix = eligible[Math.floor(rng() * eligible.length)];
    s.captain = (e) => applyCaptain(e, affix);
    promoted++;
  }
}

export function applyCaptain(e, affix) {
  e.captain = affix.title;
  e.hp *= affix.hp; e.maxHp = e.hp;
  e.speed *= affix.speed;
  e.r *= 1.12;
  e.color = affix.color;
  e.score = Math.floor(e.score * 1.7);
  if (affix.onDeath === 'debtMinion') {
    e.captainDeath = (en) => spawnTelegraphed(state.room, 'skitter', en.x, en.y, 0.6);
  } else if (affix.onDeath === 'pulseHazard') {
    e.captainDeath = (en) => addPulseHazard(state.room, en.x, en.y, { r: 26, span: 230 });
  } else if (affix.onDeath === 'slowFog') {
    e.captainDeath = (en) => addSlowFog(state.room, en.x, en.y, { r: 96 });
  }
}

export function tickDirector(room, dt) {
  if (!room.pendingWaves) return;
  for (const wave of room.pendingWaves) {
    if (wave.fired) continue;
    const due = room.time >= wave.at ||
      (wave.orWhenLeft != null && room.time > 2.2 && room.enemies.length + room.spawnQueue.length <= wave.orWhenLeft);
    if (!due) continue;
    wave.fired = true;
    if (wave.spawns) {
      for (const s of wave.spawns) spawnTelegraphed(room, s.type, s.x, s.y, DIRECTOR.TELEGRAPH + s.delay, s.captain);
    } else if (wave.list?.length) {
      const rng = Math.random;
      const clusters = spawnPoints(room, rng, clamp(Math.ceil(wave.list.length / 2.6), 1, 4));
      wave.list.forEach((type, i) => {
        const c = clusters[i % clusters.length];
        const p = jitterSpawn(room, rng, c, 70, 55);
        spawnTelegraphed(room, type, p.x, p.y, DIRECTOR.TELEGRAPH + i * 0.14);
      });
      if (room.enemies.length) addFloat(room, room.w / 2, room.wall + 70, '!', room.biome.pal.bad);
    }
  }
}

export function wavesDone(room) {
  return !room.pendingWaves || room.pendingWaves.every(w => w.fired);
}
