// THE generator. Deals one card per axis from no-repeat bags, cross-checks the
// axes, builds the room object, and bakes its background once. Consumes only
// data/ + rng (architecture.md §4 rule 2).
import { ROOM, TAU } from '../config.js';
import { Bag, clamp, dist, rand, randi, chance, pick, mulberry32, hashString } from '../rng.js';
import { BIOMES, BIOMES_BY_TIER, tierForRound } from '../data/biomes.js';
import { LAYOUTS, LAYOUT_IDS } from '../data/layouts.js';
import { paintPattern, paintSignature } from '../data/patterns.js';
import { SPECIES } from './breakables.js';
import { seedHazards } from './hazards.js';
import { buildWaves, availableRecipes, dangerStage, depthIdx, RECIPES } from './director.js';
import { view } from '../render/camera.js';
import { ANNEX } from '../config.js';
import { rollEvent } from './events.js';
import { stacks } from './items.js';
import { bossForRound } from './bosses.js';
import { MUTATORS } from '../data/mutators.js';
import { FLOORPLANS, FLOORPLAN_IDS } from '../data/floorplans.js';
import { seedRoomShop } from './shop.js';

export function rollRoom(run, round) {
  const rng = run.rng;
  const bags = run.bags;

  // ── axis 1: biome (tier-banded bag) ──
  const tier = tierForRound(round, run.overdrive);
  const tierKey = 'biome_' + tier;
  if (!bags[tierKey]) {
    const ids = tier === 'any' ? BIOMES.map(b => b.id) : BIOMES_BY_TIER[tier].map(b => b.id);
    bags[tierKey] = new Bag(ids, tier === 'any' ? 2 : 1);
  }
  const dealtBiomeId = bags[tierKey].deal(rng);
  const biome = BIOMES.find(b => b.id === dealtBiomeId);

  // ── axis 2+4: layout & recipe (recipe first: density cross-check) ──
  if (!bags.layout) bags.layout = new Bag(LAYOUT_IDS, 2);
  if (!bags.recipe) bags.recipe = new Bag(Object.keys(RECIPES), 1);
  const avail = availableRecipes(round);
  let recipeId = 'mixed';
  for (let i = 0; i < 8; i++) {
    const r = bags.recipe.deal(rng);
    if (avail.includes(r)) { recipeId = r; break; }
  }
  const bossId = bossForRound(round, run.overdrive);
  const layoutId = bossId ? pick(rng, ['ring', 'crossroads']) : bags.layout.deal(rng);

  // ── axis 6: mutator (rare, loud) ──
  // Big rooms need occasional rule-spice, but pure 10% RNG can ghost the run for
  // ages. Add a quiet pity counter so the system stays rare without becoming
  // invisible in unlucky seeds.
  let mutator = null;
  if (!bossId && round >= 5) {
    run.sinceMutator = run.sinceMutator ?? 0;
    // pity 12 (not 8): keeps the effective mutator rate ~10.6% — rare but never
    // ghosting a run. Deliberately tuned last session; kept over the base's 8.
    const forceMutator = run.sinceMutator >= 12;
    if (forceMutator || chance(rng, 0.10)) {
      mutator = MUTATORS[Math.floor(rng() * MUTATORS.length)];
      run.sinceMutator = 0;
    } else run.sinceMutator++;
  }
  const sizeScale = mutator?.sizeScale || 1;

  const portrait = view.mobile && view.portrait;
  // Giant sprawl on desktop; phones pull the landscape size back (portrait stays modest).
  // Safe to go big: floor/lanes are viewport-culled and the enemy budget is already capped.
  const deviceScale = view.mobile ? (portrait ? 1 : 0.7) : 1;
  const room = {
    round, idx: depthIdx(round), stage: dangerStage(round, run.overdrive),
    biome, layoutId, recipeId, mutatorId: mutator?.id || null, mutator, eventId: null, bossId,
    floorplanId: 'none', openings: [], sanctum: null, tiers: [], vents: [], setpieces: [],
    districts: [], flowLanes: [], skyRails: [], skyways: [], signs: [], traffic: [], districtName: '', districtSubtitle: '', backgroundScale: 1,
    // city-scale sprawl — give the player a LOT of ground to dash across. Density
    // (cover, ambient, enemy budget) scales with area below so the space stays full.
    w: Math.round((portrait ? rand(rng, 1900, 2280) : rand(rng, bossId ? 3300 : 3800, bossId ? 4000 : 4400)) * sizeScale * deviceScale),
    h: Math.round((portrait ? rand(rng, 2400, 2800) : rand(rng, bossId ? 2500 : 2700, bossId ? 3000 : 3150)) * sizeScale * deviceScale),
    wall: ROOM.WALL,
    obstacles: [], landmarks: [], annex: null, hazards: [], lanes: [], edgeRail: { phase: rng() * TAU },
    enemies: [], bullets: [], pickups: [], particles: [], floats: [],
    ambient: [], spawnQueue: [], pendingWaves: null, spawnAnchors: [],
    cleared: false, clearT: 0, portal: null, time: 0,
    background: null,
  };
  const px = room.w / 2, py = room.h * 0.66; // player spawn
  const portalX = room.w / 2, portalY = room.h * 0.20;

  // ── neon districts + flow lanes (the sprawl reads as a city) — seeded BEFORE the
  // cover scatter so obstacles can keep clear of the boost boulevards. ──
  room.districtName = rollDistrictName(room, rng);
  room.districtSubtitle = rollDistrictSubtitle(room, rng);
  seedDistricts(room, rng, px, py, portalX, portalY);
  seedFlowLanes(room, rng, px, py, portalX, portalY);
  seedCityDressing(room, rng, px, py, portalX, portalY);

  // ── floorplan (Phase 8a): partition walls before the cover scatter ──
  if (!bags.floorplan) bags.floorplan = new Bag(FLOORPLAN_IDS, 2);
  // Weighted open-room roll happens outside the Bag. Duplicate 'none' cards get
  // suppressed by Bag recent-history, so this is the honest way to control partition rate.
  // 0.38 → ~62% of non-boss rooms get chambers (player likes the walls). Dial up for fewer.
  const openChance = 0.38;
  let floorplanId = (bossId || chance(rng, openChance)) ? 'none' : bags.floorplan.deal(rng);
  if (floorplanId !== 'none') {
    const plan = FLOORPLANS[floorplanId](room, rng, room.idx);
    const trial = plan.walls;
    // place, then validate: spawn must be clear of walls and the portal reachable
    const spawnInWall = trial.some(o => px > o.x - 24 && px < o.x + o.w + 24 && py > o.y - 24 && py < o.y + o.h + 24);
    room.obstacles.push(...trial);
    const reach = reachableFrom(room, px, py);
    if (spawnInWall || !reach.has(portalX, portalY)) {
      room.obstacles.length = 0;   // fall back to an open room rather than risk a softlock
      floorplanId = 'none';
    } else {
      room.openings = plan.openings;
      room.sanctum = plan.sanctum || null;
    }
  }
  room.floorplanId = floorplanId;
  const partitioned = floorplanId !== 'none';

  // ── axis 2 continued: obstacles from the layout generator ──
  const density = (RECIPES[recipeId]?.density || 0);
  // Big rooms need a visual/combat anchor before scatter, so cover arranges around
  // a designed thing instead of confetti. Validated later with the same reachability audit.
  const landmark = !bossId && chance(rng, partitioned ? 0.55 : 0.92) && placeLandmark(room, rng, px, py, portalX, portalY);
  // cover scales ~linearly with area so density holds across the much bigger floor
  // (kept moderate — the sprawl reads full from ambient/decals/enemies, not a cover maze).
  const areaBonus = Math.max(2, Math.round((roomAreaScale(room) - 1) * 6));
  // cap scales with area so cover density holds across the much bigger sprawl
  const coverCap = Math.round((partitioned ? 22 : 28) * clamp(roomAreaScale(room) / 4, 1, 2.1));
  const count = clamp(6 + density + areaBonus + Math.floor(room.stage * 0.45) + randi(rng, 0, 2)
    - (partitioned ? 2 : 0) - (landmark ? 2 : 0), partitioned ? 4 : 6, coverCap);
  const spots = LAYOUTS[layoutId](room, rng, count);
  for (const s of spots) {
    if (dist(s.x, s.y, px, py) < ROOM.SPAWN_CLEAR) continue;
    let o;
    if (s.rect) {
      const w = s.wide ? rand(rng, 155, 260) : s.tall ? rand(rng, 72, 112) : rand(rng, 105, 210);
      const h = s.tall ? rand(rng, 155, 260) : s.wide ? rand(rng, 66, 108) : rand(rng, 72, 132);
      o = { type: 'rect', x: s.x - w / 2, y: s.y - h / 2, w, h, style: biome.obstacleStyle, round: 16 };
    } else {
      o = { type: 'circle', x: s.x, y: s.y, rad: s.big ? rand(rng, 66, 96) : rand(rng, 40, 70), style: biome.obstacleStyle };
    }
    if (!fits(room, o)) continue;
    room.obstacles.push(o);
  }
  // placement hygiene can reject spots; guarantee a minimum of cover
  for (let tries = 0; room.obstacles.length < (partitioned ? 5 : 7) && tries < 50; tries++) {
    const o = {
      type: 'circle', x: rand(rng, room.wall + 150, room.w - room.wall - 150),
      y: rand(rng, room.wall + 140, room.h - room.wall - 170),
      rad: rand(rng, 42, 66), style: biome.obstacleStyle,
    };
    if (dist(o.x, o.y, px, py) < ROOM.SPAWN_CLEAR || !fits(room, o)) continue;
    room.obstacles.push(o);
  }

  // Big-room architecture: short ribs, cracked barricades, landmarks, dash bells, and soft rubble.
  // These are validated for portal reachability, so they add traversal decisions without softlocks.
  addRoomStructures(room, rng, px, py, portalX, portalY, partitioned, !!landmark);
  const forceRubble = !bossId && !partitioned && !landmark;
  if (!bossId && (forceRubble || chance(rng, partitioned ? 0.36 : 0.48))) rubbleField(room, rng, px, py, portalX, portalY);

  // ── elevation: more second-layer rooms, plus vent launchers to make climbing
  // feel like movement tech instead of just walking at a ramp.
  if (!bossId) seedVerticality(room, rng, px, py, portalX, portalY, partitioned);
  if (!bossId && room.tiers.length) seedVents(room, rng, px, py, portalX, portalY);
  if (!bossId && room.tiers.length) seedSkyRails(room, rng);
  if (!bossId && room.tiers.length) seedHighGroundRewards(room, rng);
  seedLandmarkProps(room, rng, px, py, portalX, portalY);
  if (!bossId) seedRoomShop(room, rng, run, px, py, portalX, portalY);

  // ── glass biomes furnish breakable chain-glass (the shard/volatile projectile
  // hazard is retired; this cover IS their identity now — shoot or dash one and the
  // blast chains to its neighbours). Breakable circles never block reachability. ──
  if (biome.hazard === 'volatile' || biome.hazard === 'shard') {
    const n = randi(rng, 3, 5);
    for (let i = 0; i < n; i++) {
      const o = {
        type: 'circle', x: rand(rng, room.wall + 130, room.w - room.wall - 130),
        y: rand(rng, room.wall + 120, room.h - room.wall - 150),
        rad: rand(rng, 18, 26), style: 'glassNode',
        breakable: true, species: 'volatileShard', hp: SPECIES.volatileShard.hp, volatile: true,
      };
      if (dist(o.x, o.y, px, py) < 220 || !fits(room, o)) continue;
      room.obstacles.push(o);
    }
  }

  // ── biomes that lost their area hazard furnish breakable biome-styled cover in
  // its place, so they stay as furnished as the altar/laser biomes. Covers the
  // snare/thorn projectile-roots AND the removed fog/spore gas clouds (fen/mycelium)
  // — not the gas mechanic, just native furniture. rollSpecies already biases these
  // plant/fungal/bone biomes toward rootCyst/marrowJar, so the cover reads native. ──
  const COVER_FROM_HAZARD = new Set(['snare', 'thorn', 'fog', 'spore']);
  if (!bossId && COVER_FROM_HAZARD.has(biome.hazard)) {
    const n = randi(rng, 2, 4) + (room.idx >= 4 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      for (let tries = 0; tries < 18; tries++) {
        const species = rollSpecies(rng, biome, room.idx, false);
        const o = {
          type: 'circle', x: rand(rng, room.wall + 130, room.w - room.wall - 130),
          y: rand(rng, room.wall + 120, room.h - room.wall - 150),
          rad: rand(rng, 34, 56), style: biome.obstacleStyle,
          breakable: true, species, hp: SPECIES[species].hp + room.idx * 0.6,
        };
        if (dist(o.x, o.y, px, py) < ROOM.SPAWN_CLEAR || dist(o.x, o.y, portalX, portalY) < 150 || !fits(room, o)) continue;
        room.obstacles.push(o);
        break;
      }
    }
  }

  // ── breakable conversion (species weights with biome bumps) ──
  const breakN = randi(rng, 1, 3) + (mutator?.breakBonus || 0) + (run.oath === 'hunger' ? 1 : 0);
  const candidates = room.obstacles.filter(o => !o.breakable && !o.landmark && o.type === 'circle' && o.rad < 72);
  for (let i = 0; i < breakN && candidates.length; i++) {
    const o = candidates.splice(Math.floor(rng() * candidates.length), 1)[0];
    o.breakable = true;
    o.species = rollSpecies(rng, biome, room.idx, mutator?.idolBump || run.oath === 'hunger');
    o.hp = SPECIES[o.species].hp + room.idx * 0.8;
  }

  // ── sealed mystery vaults: obvious smashable shells whose contents are hidden until broken. ──
  if (!bossId) seedMysteryVaults(room, rng, px, py, portalX, portalY);

  // ── sealed annex (skip when a floorplan already partitions the room) ──
  const compass = stacks(run.player, 'cacheCompass');
  const annexChance = ANNEX.CHANCE + compass * 0.12 + (run.oath === 'blind' ? 0.15 : 0);
  if (!bossId && !partitioned && chance(rng, annexChance)) buildAnnex(room, rng);

  // ── axis 3: hazard kit ──
  seedHazards(room, rng);
  if (mutator?.extraLane) {
    const pos = rand(rng, room.wall + 220, room.w - room.wall - 220);
    room.lanes.push({
      type: 'sightline', vertical: true, x1: pos, y1: room.wall + 40, x2: pos, y2: room.h - room.wall - 40,
      width: 26, t: rng() * 2, period: 3.2, telegraphFrom: 0.40, activeFrom: 0.74, activeTo: 0.98,
      active: false, tele: false, hitCd: 0, color: biome.pal.accent2,
    });
  }

  // ── ambient particles ──
  // ambient drift fills the sprawl with life (the cheap, non-obstructive kind of "full")
  const ambN = Math.round((view.mobile ? 30 : 52) * Math.min(2.6, Math.sqrt(roomAreaScale(room))));
  for (let i = 0; i < ambN; i++) {
    room.ambient.push({
      type: pick(rng, biome.ambient), x: rng() * room.w, y: rng() * room.h,
      vx: rand(rng, -12, 12), vy: rand(rng, -18, 8), phase: rng() * TAU, r: rand(rng, 1.5, 4),
    });
  }

  // ── axis 4: waves ──
  buildWaves(room, rng);

  // ── axis 5: room event (the spice slot) ──
  rollEvent(room, rng);
  pruneUnreachableTiers(room, px, py);
  sanitizePendingSpawns(room, rng, px, py, portalX, portalY);

  // ── bake the background once ──
  room.background = bakeBackground(room, rng);
  return room;
}

const OLD_ROOM_AREA = 1500 * 1020;
function roomAreaScale(room) { return (room.w * room.h) / OLD_ROOM_AREA; }

function architecturalWall(x, y, w, h, breakable, idx) {
  const o = { type: 'rect', x, y, w: Math.max(12, w), h: Math.max(12, h), wall: true, ledgeHeight: Infinity, style: breakable ? 'door' : 'wall', round: breakable ? 4 : 5 };
  if (breakable) Object.assign(o, { breakable: true, species: 'wallSegment', hp: 8 + idx * 1.6 });
  return o;
}

function clearOfPoint(o, x, y, pad) {
  const b = aabb(o);
  const cx = clamp(x, b.x, b.x + b.w), cy = clamp(y, b.y, b.y + b.h);
  return dist(x, y, cx, cy) > pad;
}

function tryAddGroup(room, group, px, py, portalX, portalY) {
  const before = room.obstacles.length;
  for (const o of group) {
    const spawnPad = o.wall ? (o.breakable ? 300 : 335) : 285;
    if (!clearOfPoint(o, px, py, spawnPad) || !clearOfPoint(o, portalX, portalY, o.wall ? 150 : 120) || !fits(room, o, o.wall ? 28 : 22)) {
      room.obstacles.length = before;
      return false;
    }
    room.obstacles.push(o);
  }
  const reach = reachableFrom(room, px, py);
  if (!reach.has(portalX, portalY)) { room.obstacles.length = before; return false; }
  return true;
}

function addRoomStructures(room, rng, px, py, portalX, portalY, partitioned, hasLandmark = false) {
  const target = room.bossId ? 1 : partitioned ? 1 : (hasLandmark ? 1 : 2);
  const tries = room.bossId ? 4 : partitioned ? 7 : 12;
  let placed = 0;
  const kinds = partitioned ? ['island', 'barricade', 'pillarCrown'] : ['ribGate', 'barricade', 'brokenSpine', 'island', 'pillarCrown'];
  for (let t = 0; t < tries && placed < target; t++) {
    const group = makeStructureGroup(room, rng, pick(rng, kinds));
    if (group.length && tryAddGroup(room, group, px, py, portalX, portalY)) {
      placed++;
      room.landmarks.push({ kind: group[0].archKind || 'structure', x: group.reduce((a, o) => a + (o.x || 0) + (o.w || 0) / 2, 0) / group.length, y: group.reduce((a, o) => a + (o.y || 0) + (o.h || 0) / 2, 0) / group.length });
    }
  }

  if (!room.bossId) {
    const bells = chance(rng, 0.56) ? 1 + (roomAreaScale(room) > 1.8 && chance(rng, 0.12) ? 1 : 0) : 0;
    for (let i = 0; i < bells; i++) placeDashBell(room, rng, px, py, portalX, portalY);
  }
}

function makeStructureGroup(room, rng, kind) {
  const cx = rand(rng, room.w * 0.28, room.w * 0.72);
  const cy = rand(rng, room.h * 0.26, room.h * 0.58);
  const idx = room.idx;
  const style = room.biome.obstacleStyle;
  if (kind === 'ribGate') {
    const gap = rand(rng, 245, 350), len = rand(rng, 235, 370), thick = rand(rng, 24, 34);
    const a = architecturalWall(cx - gap / 2 - thick, cy - len / 2, thick, len, false, idx);
    const b = architecturalWall(cx + gap / 2, cy - len / 2, thick, len, false, idx);
    a.archKind = b.archKind = 'ribGate';
    return [a, b];
  }
  if (kind === 'brokenSpine') {
    const horizontal = chance(rng, 0.55), n = 3, out = [];
    const len = rand(rng, 145, 220), thick = rand(rng, 24, 32), gap = rand(rng, 96, 132);
    for (let i = 0; i < n; i++) {
      const off = (i - 1) * (len + gap);
      const breakable = i === 1 && chance(rng, 0.65);
      const o = horizontal
        ? architecturalWall(cx + off - len / 2, cy - thick / 2, len, thick, breakable, idx)
        : architecturalWall(cx - thick / 2, cy + off - len / 2, thick, len, breakable, idx);
      o.archKind = 'brokenSpine'; out.push(o);
    }
    return out;
  }
  if (kind === 'barricade') {
    const horizontal = chance(rng, 0.5), len = rand(rng, 250, 410), thick = rand(rng, 25, 34);
    const o = horizontal
      ? architecturalWall(cx - len / 2, cy - thick / 2, len, thick, true, idx)
      : architecturalWall(cx - thick / 2, cy - len / 2, thick, len, true, idx);
    o.archKind = 'barricade';
    return [o];
  }
  if (kind === 'pillarCrown') {
    const out = [];
    const rad = rand(rng, 58, 78), rr = rand(rng, 150, 225), start = rng() * TAU;
    for (let i = 0; i < 3; i++) {
      const a = start + (i / 3) * TAU;
      out.push({ type: 'circle', x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr * 0.72, rad, style, archKind: 'pillarCrown' });
    }
    return out;
  }
  // island: one big readable landmark plus a small smashable satellite
  return [
    { type: 'circle', x: cx, y: cy, rad: rand(rng, 78, 106), style, archKind: 'island' },
    { type: 'circle', x: cx + rand(rng, -150, 150), y: cy + rand(rng, -115, 115), rad: rand(rng, 38, 52), style: 'basilicaIdol', breakable: true, species: rollSpecies(rng, room.biome, idx, false), hp: 4 + idx * 0.7, archKind: 'island' },
  ];
}

function placeDashBell(room, rng, px, py, portalX, portalY) {
  for (let tries = 0; tries < 50; tries++) {
    const o = {
      type: 'circle', x: rand(rng, room.wall + 190, room.w - room.wall - 190),
      y: rand(rng, room.wall + 160, room.h - room.wall - 190),
      rad: rand(rng, 28, 36), style: 'basilicaIdol', breakable: true,
      species: 'dashBell', hp: SPECIES.dashBell.hp + room.idx * 0.35, archKind: 'dashBell',
    };
    if (dist(o.x, o.y, px, py) < ROOM.SPAWN_CLEAR + 70 || dist(o.x, o.y, portalX, portalY) < 150 || !fits(room, o, 28)) continue;
    room.obstacles.push(o);
    room.landmarks.push({ kind: 'dashBell', x: o.x, y: o.y });
    return true;
  }
  return false;
}

function pointBlockedForSpawn(room, x, y, pad = 42) {
  for (const o of room.obstacles) {
    if (o.gone) continue;
    if (o.type === 'circle') { if (dist(x, y, o.x, o.y) < o.rad + pad) return true; }
    else {
      const cx = clamp(x, o.x, o.x + o.w), cy = clamp(y, o.y, o.y + o.h);
      if (dist(x, y, cx, cy) < pad) return true;
    }
  }
  return false;
}

function findReachableSpawn(room, rng, reach, px, py) {
  for (let tries = 0; tries < 80; tries++) {
    const side = randi(rng, 0, 3), w = room.wall;
    const x = side === 1 ? room.w - w - rand(rng, 90, 230)
      : side === 3 ? w + rand(rng, 90, 230)
      : rand(rng, w + 130, room.w - w - 130);
    const y = side === 0 ? w + rand(rng, 90, 210)
      : side === 2 ? room.h - w - rand(rng, 90, 210)
      : rand(rng, w + 120, room.h - w - 120);
    if (dist(x, y, px, py) < 460 || pointBlockedForSpawn(room, x, y) || !reach.has(x, y)) continue;
    return { x, y };
  }
  const cells = Array.from(reach.cells || []);
  for (let tries = 0; tries < 120 && cells.length; tries++) {
    const raw = cells[Math.floor(rng() * cells.length)];
    const c = typeof raw === 'number' ? raw % reach.cols : Number(String(raw).split(',')[0]);
    const r = typeof raw === 'number' ? Math.floor(raw / reach.cols) : Number(String(raw).split(',')[1]);
    const x = c * CELL + CELL / 2, y = r * CELL + CELL / 2;
    if (dist(x, y, px, py) >= 460 && !pointBlockedForSpawn(room, x, y)) return { x, y };
  }
  return { x: room.w / 2, y: room.wall + 120 };
}

function sanitizePendingSpawns(room, rng, px, py, portalX, portalY) {
  const reach = reachableFrom(room, px, py);
  const fix = (s) => {
    if (!s || (reach.has(s.x, s.y) && !pointBlockedForSpawn(room, s.x, s.y) && dist(s.x, s.y, px, py) >= 460)) return;
    const p = findReachableSpawn(room, rng, reach, px, py);
    s.x = p.x; s.y = p.y;
  };
  if (room.pendingWaves) {
    for (const w of room.pendingWaves) if (w.spawns) for (const s of w.spawns) fix(s);
  }
  for (const s of room.spawnQueue) fix(s);
  // Cache safe edge-biased anchors for late reinforcement waves. Without this,
  // a big-room wall structure can make a random edge spawn technically legal
  // but unreachable — the worst kind of haunted bullshit.
  room.spawnAnchors = [];
  for (let i = 0; i < 22; i++) {
    const p = findReachableSpawn(room, rng, reach, px, py);
    if (!room.spawnAnchors.some(a => dist(a.x, a.y, p.x, p.y) < 125)) room.spawnAnchors.push(p);
  }
  // If a generated solid accidentally boxed the portal after late event placement, fail open.
  if (!reach.has(portalX, portalY)) room.obstacles = room.obstacles.filter(o => !(o.archKind && o.wall && !o.breakable));
}

function aabb(o) {
  return o.type === 'circle'
    ? { x: o.x - o.rad, y: o.y - o.rad, w: o.rad * 2, h: o.rad * 2 }
    : { x: o.x, y: o.y, w: o.w, h: o.h };
}

// AABB overlap with a margin (correct for long walls; the old center-distance
// test rejected most of the room around a partition wall).
function fits(room, o, margin = 20) {
  const w = room.wall, b = aabb(o);
  if (b.x < w + 10 || b.y < w + 10 || b.x + b.w > room.w - w - 10 || b.y + b.h > room.h - w - 10) return false;
  if (!o.allowLane && nearProtectedFlowLane(room, o, margin)) return false; // keep boost boulevards clear
  for (const other of room.obstacles) {
    const a = aabb(other);
    if (b.x < a.x + a.w + margin && b.x + b.w + margin > a.x &&
        b.y < a.y + a.h + margin && b.y + b.h + margin > a.y) return false;
  }
  return true;
}

// Coarse-grid flood-fill from the player spawn. Breakable walls count as passable
// (the player can smash them). Used to guarantee no unclearable/softlocked rooms.
const CELL = 44;
export function reachableFrom(room, sx, sy) {
  const cols = Math.ceil(room.w / CELL), rows = Math.ceil(room.h / CELL);
  const total = cols * rows;
  const blocked = new Uint8Array(total);
  const inset = room.wall + 8;
  const cellIndex = (c, r) => r * cols + c;

  // Boundary cells: marked once so the flood-fill does not re-test wall math for
  // every neighbor. Solid walls/ledges are rasterized into the same cheap mask.
  for (let r = 0; r < rows; r++) {
    const cy = r * CELL + CELL / 2;
    for (let c = 0; c < cols; c++) {
      const cx = c * CELL + CELL / 2;
      if (cx < inset || cy < inset || cx > room.w - inset || cy > room.h - inset) blocked[cellIndex(c, r)] = 1;
    }
  }
  for (const o of room.obstacles) {
    if (!o.wall || o.breakable) continue;
    const x0 = o.x - 16, y0 = o.y - 16, x1 = o.x + o.w + 16, y1 = o.y + o.h + 16;
    const c0 = clamp(Math.floor((x0 - CELL / 2) / CELL) + 1, 0, cols - 1);
    const c1 = clamp(Math.ceil((x1 - CELL / 2) / CELL) - 1, 0, cols - 1);
    const r0 = clamp(Math.floor((y0 - CELL / 2) / CELL) + 1, 0, rows - 1);
    const r1 = clamp(Math.ceil((y1 - CELL / 2) / CELL) - 1, 0, rows - 1);
    if (c1 < c0 || r1 < r0) continue;
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) blocked[cellIndex(c, r)] = 1;
  }

  const seenBits = new Uint8Array(total);
  const seen = new Set();
  const sc = clamp(Math.floor(sx / CELL), 0, cols - 1), sr = clamp(Math.floor(sy / CELL), 0, rows - 1);
  const start = cellIndex(sc, sr);
  const stack = [start];
  seenBits[start] = 1; seen.add(start);
  while (stack.length) {
    const id = stack.pop();
    const c = id % cols, r = Math.floor(id / cols);
    const push = (nc, nr) => {
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) return;
      const ni = cellIndex(nc, nr);
      if (seenBits[ni] || blocked[ni]) return;
      seenBits[ni] = 1; seen.add(ni); stack.push(ni);
    };
    push(c + 1, r); push(c - 1, r); push(c, r + 1); push(c, r - 1);
  }
  return {
    cols, rows, cells: seen,
    has: (x, y) => {
      const c = Math.floor(x / CELL), r = Math.floor(y / CELL);
      if (c < 0 || r < 0 || c >= cols || r >= rows) return false;
      return seenBits[cellIndex(c, r)] === 1;
    },
  };
}

function seedVerticality(room, rng, px, py, portalX, portalY, partitioned) {
  const scale = roomAreaScale(room);
  const large = scale > 3.2;
  const wantsTier = chance(rng, partitioned ? 0.86 : 1.0);
  if (!wantsTier) return 0;
  const mobileCap = view.mobile ? 3 : 5;
  const minTarget = partitioned ? 2 : 3;
  const target = clamp(
    minTarget + (large ? 1 : 0) + (room.idx >= 3 && large ? 1 : 0) + (room.idx >= 6 && !view.mobile ? 1 : 0),
    minTarget,
    mobileCap,
  );
  let made = 0;
  for (let i = 0; i < target && made < mobileCap; i++) {
    if (maybeTier(room, rng, px, py, portalX, portalY, { smaller: i > 0, partitioned, dense: true })) made++;
  }
  return made;
}


// Place one raised platform: a rect tier whose perimeter is ledge walls, with a
// ramp gap on the edge facing the player. Ledges block movement always and block
// low bullets (high-ground); the ramp lets you walk up. Validated for spawn
// clearance + portal reachability; bails cleanly if it can't fit.
function maybeTier(room, rng, px, py, portalX, portalY, opts = {}) {
  const T = 26;
  const scale = opts.smaller ? rand(rng, opts.dense ? 0.58 : 0.70, opts.dense ? 0.80 : 0.86) : (opts.dense ? rand(rng, 0.88, 1.0) : 1);
  const tw = room.w * rand(rng, opts.partitioned ? 0.15 : 0.18, opts.partitioned ? 0.23 : 0.29) * scale;
  const th = room.h * rand(rng, opts.partitioned ? 0.13 : 0.16, opts.partitioned ? 0.21 : 0.26) * scale;
  for (let tries = 0; tries < 34; tries++) {
    const tx = rand(rng, room.wall + 80, room.w - room.wall - 80 - tw);
    const ty = rand(rng, room.wall + 80, room.h * (opts.partitioned ? 0.62 : 0.58) - th); // upper/mid area, clear of spawn
    const rect = { x: tx, y: ty, w: tw, h: th };
    // keep clear of spawn and portal points
    const pad = 90;
    const hit = (qx, qy) => qx > tx - pad && qx < tx + tw + pad && qy > ty - pad && qy < ty + th + pad;
    if (hit(px, py) || hit(portalX, portalY)) continue;
    if (room.tiers.some(t => rectOverlap(rect, t, opts.dense ? 76 : 120))) continue;
    // ramp on the bottom edge (faces the player below); gap centred-ish
    const gap = rand(rng, 150, 200);
    const rgx = tx + tw * rand(rng, 0.4, 0.6);
    const tierId = room._nextTierId = (room._nextTierId || 0) + 1;
    const ledges = [
      wallSlab(tx - T / 2, ty - T / 2, tw + T, T),                                   // top
      wallSlab(tx - T / 2, ty + th - T / 2, (rgx - gap / 2) - (tx - T / 2), T),       // bottom-left
      wallSlab(rgx + gap / 2, ty + th - T / 2, (tx + tw + T / 2) - (rgx + gap / 2), T), // bottom-right
      wallSlab(tx - T / 2, ty - T / 2, T, th + T),                                   // left
      wallSlab(tx + tw - T / 2, ty - T / 2, T, th + T),                              // right
    ];
    for (const l of ledges) l.tierId = tierId;
    const before = room.obstacles.length;
    room.obstacles.push(...ledges);
    // portal AND the platform interior must be reachable (else a perched sniper
    // would be unkillable and stall the room).
    const reach = reachableFrom(room, px, py);
    const keepsOlderTiersReachable = room.tiers.every(t => reach.has(t.x + t.w / 2, t.y + t.h / 2));
    if (!reach.has(portalX, portalY) || !reach.has(tx + tw / 2, ty + th / 2) || !keepsOlderTiersReachable) {
      room.obstacles.length = before; // undo, try again
      continue;
    }
    room.tiers.push({ id: tierId, x: tx, y: ty, w: tw, h: th, height: 1, ramp: { x: rgx, y: ty + th, w: gap }, phase: rng() * TAU });
    room.landmarks.push({ kind: 'highGround', x: tx + tw / 2, y: ty + th / 2 });
    return true;
  }
  return false;
}
function wallSlab(x, y, w, h) {
  return { type: 'rect', x, y, w: Math.max(8, w), h: Math.max(8, h), wall: true, ledge: true, ledgeHeight: 1, style: 'ledge', round: 3 };
}

function rectOverlap(a, b, margin = 0) {
  return a.x < b.x + b.w + margin && a.x + a.w + margin > b.x
    && a.y < b.y + b.h + margin && a.y + a.h + margin > b.y;
}

function pruneUnreachableTiers(room, px, py) {
  if (!room.tiers?.length) return;
  const reach = reachableFrom(room, px, py);
  const keep = new Set();
  for (const t of room.tiers) if (reach.has(t.x + t.w / 2, t.y + t.h / 2)) keep.add(t.id);
  if (keep.size === room.tiers.length) return;
  room.tiers = room.tiers.filter(t => keep.has(t.id));
  room.obstacles = room.obstacles.filter(o => !o.tierId || keep.has(o.tierId));
  room.vents = (room.vents || []).filter(v => {
    const toOk = (v.toLevel || 0) === 0 || room.tiers.some(t => t.height === v.toLevel && pointInRect(v.toX, v.toY, t));
    const fromOk = (v.fromLevel || 0) === 0 || room.tiers.some(t => t.height === v.fromLevel && pointInRect(v.x, v.y, t));
    return toOk && fromOk;
  });
}

function pointInRect(x, y, r) { return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }

function seedVents(room, rng, px, py, portalX, portalY) {
  const reach = reachableFrom(room, px, py);
  const addVent = (x, y, toX, toY, toLevel, kind = 'updraft', fromLevel = 0) => {
    room.vents.push({ x, y, r: 46, toX, toY, toLevel, fromLevel, kind, phase: rng() * TAU, flash: 0 });
    room.landmarks.push({ kind: 'vent', x, y });
  };
  for (const t of room.tiers) {
    const target = { x: t.x + t.w * rand(rng, 0.36, 0.64), y: t.y + t.h * rand(rng, 0.33, 0.58) };
    let placed = false;
    const candidates = [
      { x: t.ramp.x + rand(rng, -70, 70), y: t.y + t.h + rand(rng, 105, 210) },
      { x: t.x - rand(rng, 110, 190), y: t.y + t.h * rand(rng, 0.35, 0.75) },
      { x: t.x + t.w + rand(rng, 110, 190), y: t.y + t.h * rand(rng, 0.35, 0.75) },
      { x: t.x + t.w * rand(rng, 0.28, 0.72), y: t.y - rand(rng, 105, 180) },
    ];
    for (const c of candidates) {
      const x = clamp(c.x, room.wall + 105, room.w - room.wall - 105);
      const y = clamp(c.y, room.wall + 105, room.h - room.wall - 125);
      if (!reach.has(x, y) || !ventClear(room, x, y, 66) || dist(x, y, px, py) < 180 || dist(x, y, portalX, portalY) < 130) continue;
      addVent(x, y, target.x, target.y, t.height, 'updraft', 0);
      placed = true;
      break;
    }
    // A matching drop fan on bigger high-ground rooms gives an easy stylish exit.
    if (placed && roomAreaScale(room) > 3.5 && chance(rng, 0.48)) {
      const outX = clamp(t.ramp.x + rand(rng, -130, 130), room.wall + 120, room.w - room.wall - 120);
      const outY = clamp(t.y + t.h + rand(rng, 210, 330), room.wall + 120, room.h - room.wall - 120);
      if (reach.has(outX, outY) && ventClear(room, outX, outY, 62)) {
        addVent(target.x + rand(rng, -70, 70), target.y + rand(rng, -45, 45), outX, outY, 0, 'dropfan', t.height);
      }
    }
  }
}

function ventClear(room, x, y, pad) {
  for (const o of room.obstacles || []) {
    if (o.gone) continue;
    if (o.type === 'circle') { if (dist(x, y, o.x, o.y) < (o.rad || 0) + pad) return false; }
    else {
      const cx = clamp(x, o.x, o.x + o.w), cy = clamp(y, o.y, o.y + o.h);
      if (dist(x, y, cx, cy) < pad) return false;
    }
  }
  return true;
}

function seedSkyRails(room, rng) {
  const tiers = room.tiers || [];
  if (tiers.length < 2) return;
  const point = (t, jitter = 0.24) => ({
    x: t.x + t.w * rand(rng, 0.50 - jitter, 0.50 + jitter),
    y: t.y + t.h * rand(rng, 0.42 - jitter * 0.35, 0.54 + jitter * 0.35),
  });
  const pairs = [];
  for (let i = 0; i < tiers.length; i++) for (let j = i + 1; j < tiers.length; j++) {
    const a = tiers[i], b = tiers[j];
    const ax = a.x + a.w / 2, ay = a.y + a.h * 0.48;
    const bx = b.x + b.w / 2, by = b.y + b.h * 0.48;
    pairs.push({ a, b, d: dist(ax, ay, bx, by) });
  }
  const used = new Set();
  const key = (a, b) => [a.id, b.id].sort((u, v) => u - v).join(':');
  const add = (pair, trunk = false) => {
    if (!pair) return false;
    const k = key(pair.a, pair.b);
    if (used.has(k)) return false;
    used.add(k);
    const A = point(pair.a, trunk ? 0.18 : 0.24), B = point(pair.b, trunk ? 0.18 : 0.24);
    room.skyRails.push({
      x1: A.x, y1: A.y, x2: B.x, y2: B.y,
      level: 1, width: trunk ? 48 : 40, boost: trunk ? 1190 : 1040,
      trunk,
      color: chance(rng, 0.5) ? room.biome.pal.accent2 : room.biome.pal.accent3,
      phase: rng() * TAU,
    });
    room.landmarks.push({ kind: trunk ? 'skyRailSpine' : 'skyRail', x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 });
    return true;
  };

  // One long express spine creates the “map momentum” path; then each island gets
  // at least one connector where possible.
  pairs.sort((a, b) => b.d - a.d);
  add(pairs[0], true);
  const maxRails = Math.min(view.mobile ? 3 : 5, pairs.length);
  const connected = new Set();
  for (const r of room.skyRails) {
    const a = tiers.find(t => pointInRect(r.x1, r.y1, t));
    const b = tiers.find(t => pointInRect(r.x2, r.y2, t));
    if (a) connected.add(a.id); if (b) connected.add(b.id);
  }
  const near = [...pairs].sort((a, b) => a.d - b.d);
  for (const t of tiers) {
    if (room.skyRails.length >= maxRails) break;
    const pair = near.find(p => (p.a === t || p.b === t) && !used.has(key(p.a, p.b))) || near.find(p => !used.has(key(p.a, p.b)));
    if (add(pair, false)) { connected.add(pair.a.id); connected.add(pair.b.id); }
  }
  for (const pair of near) {
    if (room.skyRails.length >= maxRails) break;
    add(pair, false);
  }
}

function seedHighGroundRewards(room, rng) {
  const tiers = room.tiers || [];
  if (!tiers.length) return;
  const max = Math.min(view.mobile ? 2 : 3, tiers.length);
  const ordered = [...tiers].sort((a, b) => (b.w * b.h) - (a.w * a.h));
  for (let i = 0; i < max; i++) {
    const t = ordered[i];
    const species = i === 0 || chance(rng, 0.55) ? 'mirrorVault' : 'cacheAltar';
    const rad = species === 'mirrorVault' ? 52 : 41;
    const o = {
      type: 'circle',
      x: t.x + t.w * rand(rng, 0.36, 0.64),
      y: t.y + t.h * rand(rng, 0.34, 0.60),
      rad,
      style: species === 'mirrorVault' ? 'glassNode' : 'basilicaIdol',
      breakable: true,
      species,
      hp: SPECIES[species].hp + room.idx * (species === 'mirrorVault' ? 1.7 : 1.25),
      altar: true,
      level: t.height || 1,
      secretSeal: species === 'mirrorVault',
      archKind: 'skyCache',
      phase: rng() * TAU,
    };
    if (!fits(room, o, 8)) continue;
    room.obstacles.push(o);
    room.landmarks.push({ kind: 'skyCache', x: o.x, y: o.y });
    room.setpieces.push({ kind: 'liftBeacon', x: o.x + rand(rng, -34, 34), y: o.y - 58, r: 26, level: o.level, color: room.biome.pal.accent2, phase: rng() * TAU });
  }
}

function seedMysteryVaults(room, rng, px, py, portalX, portalY) {
  const already = room.obstacles.some(o => !o.gone && (o.species === 'mirrorVault' || o.species === 'gambitAltar' || o.species === 'cacheAltar'));
  let target = already ? (chance(rng, 0.35) ? 1 : 0) : 1;
  if (room.round >= 3 && roomAreaScale(room) > 4.3 && chance(rng, 0.45)) target++;
  for (let i = 0; i < target; i++) placeMysteryVault(room, rng, px, py, portalX, portalY);
}

function placeMysteryVault(room, rng, px, py, portalX, portalY) {
  for (let tries = 0; tries < 70; tries++) {
    const x = rand(rng, room.wall + 210, room.w - room.wall - 210);
    const y = rand(rng, room.wall + 180, room.h - room.wall - 210);
    if (dist(x, y, px, py) < ROOM.SPAWN_CLEAR + 70 || dist(x, y, portalX, portalY) < 210) continue;
    const o = {
      type: 'circle', x, y, rad: 56, style: 'glassNode',
      breakable: true, species: 'mirrorVault', hp: SPECIES.mirrorVault.hp + room.idx * 1.8,
      altar: true, secretSeal: true, archKind: 'mysteryVault', phase: rng() * TAU,
    };
    if (!fits(room, o, 20)) continue;
    room.obstacles.push(o);
    for (let i = 0; i < 3; i++) room.setpieces.push({
      kind: 'moonPool', x: x + Math.cos((i / 3) * TAU) * 78, y: y + Math.sin((i / 3) * TAU) * 78,
      r: 13, color: room.biome.pal.accent2, phase: rng() * TAU,
    });
    room.landmarks.push({ kind: 'mysteryVault', x, y });
    return true;
  }
  return false;
}



function seedLandmarkProps(room, rng, px, py, portalX, portalY) {
  const kinds = ['holoTower', 'moonPool', 'signalPylon', 'marketArch', 'ghostBillboard', 'bridgeMast', 'liftBeacon'];
  const target = room.bossId ? randi(rng, 2, 4) : randi(rng, 4, view.mobile ? 6 : 8);
  for (let tries = 0; tries < 90 && room.setpieces.length < target; tries++) {
    let x = rand(rng, room.wall + 190, room.w - room.wall - 190);
    let y = rand(rng, room.wall + 170, room.h - room.wall - 190);
    // Bias a couple of landmarks toward high-ground destinations so vents have
    // an obvious place they are throwing you, not a random patch of floor.
    if (room.tiers.length && tries < room.tiers.length * 3) {
      const t = room.tiers[tries % room.tiers.length];
      x = t.x + t.w * rand(rng, 0.22, 0.78);
      y = t.y + t.h * rand(rng, 0.24, 0.72);
    }
    if (dist(x, y, px, py) < 250 || dist(x, y, portalX, portalY) < 170 || pointBlockedForSpawn(room, x, y, 58)) continue;
    if (room.setpieces.some(s => dist(x, y, s.x, s.y) < 260)) continue;
    const kind = pick(rng, kinds);
    room.setpieces.push({ kind, x, y, r: rand(rng, 34, 62), level: levelFor(room, x, y), phase: rng() * TAU, color: chance(rng, 0.5) ? room.biome.pal.accent2 : room.biome.pal.accent3 });
    room.landmarks.push({ kind, x, y });
  }
}

function levelFor(room, x, y) {
  for (const t of room.tiers || []) if (x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h) return t.height;
  return 0;
}

function placeLandmark(room, rng, px, py, portalX, portalY) {
  const before = room.obstacles.length;
  const style = room.biome.obstacleStyle;
  const clearOf = (x, y, r) =>
    dist(x, y, px, py) > 210 + r * 0.4 && dist(x, y, portalX, portalY) > 135 + r;
  const tryPush = (o) => {
    const ax = o.type === 'circle' ? o.x : o.x + o.w / 2;
    const ay = o.type === 'circle' ? o.y : o.y + o.h / 2;
    const ar = o.type === 'circle' ? o.rad : Math.max(o.w, o.h) / 2;
    if (!clearOf(ax, ay, ar) || !fits(room, o, 22)) return false;
    o.landmark = true; o.archKind = o.archKind || 'setpiece';
    room.obstacles.push(o); return true;
  };

  let cx = room.w / 2, cy = room.h * 0.44;
  for (let t = 0; t < 10; t++) {
    const region = rng();
    cx = region < 0.4 ? room.w * rand(rng, 0.40, 0.60)
      : region < 0.7 ? room.w * rand(rng, 0.18, 0.34)
      : room.w * rand(rng, 0.66, 0.82);
    cy = room.h * rand(rng, 0.32, 0.56);
    if (clearOf(cx, cy, 90)) break;
  }

  const kind = pick(rng, ['monument', 'pillars', 'ruin', 'crater']);
  let placed = 0;
  if (kind === 'monument') {
    placed += tryPush({ type: 'circle', x: cx, y: cy, rad: rand(rng, 86, 116), style, archKind: 'monument' }) ? 1 : 0;
    const sat = randi(rng, 4, 6), rx = rand(rng, 150, 220), a0 = rng() * TAU;
    for (let i = 0; i < sat; i++) {
      const a = a0 + (i / sat) * TAU + rand(rng, -0.25, 0.25);
      placed += tryPush({ type: 'circle', x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * rx * 0.62, rad: rand(rng, 36, 58), style, archKind: 'monument' }) ? 1 : 0;
    }
  } else if (kind === 'pillars') {
    const n = randi(rng, 5, 7), rx = Math.min(room.w, room.h) * rand(rng, 0.17, 0.24), a0 = rng() * TAU;
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * TAU;
      placed += tryPush({ type: 'circle', x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * rx * 0.6, rad: rand(rng, 48, 70), style, archKind: 'pillarCourt' }) ? 1 : 0;
    }
    if (rng() < 0.5) placed += tryPush({ type: 'circle', x: cx, y: cy, rad: rand(rng, 40, 56), style, archKind: 'pillarCourt' }) ? 1 : 0;
  } else if (kind === 'ruin') {
    const n = randi(rng, 3, 5);
    for (let i = 0; i < n; i++) {
      const horiz = rng() < 0.5;
      const sw = horiz ? rand(rng, 230, 360) : rand(rng, 66, 108);
      const sh = horiz ? rand(rng, 66, 108) : rand(rng, 190, 300);
      placed += tryPush({ type: 'rect', x: cx + rand(rng, -270, 270) - sw / 2, y: cy + rand(rng, -150, 150) - sh / 2, w: sw, h: sh, style, round: 14, archKind: 'ruin' }) ? 1 : 0;
    }
  } else {
    const n = randi(rng, 8, 11), rx = Math.min(room.w, room.h) * rand(rng, 0.18, 0.25), a0 = rng() * TAU;
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * TAU;
      placed += tryPush({ type: 'circle', x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * rx * 0.6, rad: rand(rng, 32, 50), style, archKind: 'crater' }) ? 1 : 0;
    }
  }

  const ok = placed >= 3 && reachableFrom(room, px, py).has(portalX, portalY);
  if (!ok) { room.obstacles.length = before; return false; }
  room.landmarks.push({ kind, x: cx, y: cy });
  return true;
}

function rubbleField(room, rng, px, py, portalX, portalY) {
  for (let attempt = 0; attempt < 7; attempt++) {
    const before = room.obstacles.length;
    const cx = rand(rng, room.wall + 240, room.w - room.wall - 240);
    const cy = rand(rng, room.wall + 200, room.h - room.wall - 220);
    if (dist(cx, cy, px, py) < ROOM.SPAWN_CLEAR + 40 || dist(cx, cy, portalX, portalY) < 180) continue;
    const n = randi(rng, 5, 9);
    let placed = 0;
    for (let i = 0; i < n; i++) {
      const a = rng() * TAU, rr = rand(rng, 0, 142);
      const o = {
        type: 'circle', x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr,
        rad: rand(rng, 20, 32), style: room.biome.obstacleStyle,
        breakable: true, species: 'rubble', hp: SPECIES.rubble.hp + room.idx * 0.5,
        archKind: 'rubble', softCover: true,
      };
      if (dist(o.x, o.y, px, py) < ROOM.SPAWN_CLEAR || !fits(room, o, 6)) continue;
      room.obstacles.push(o); placed++;
    }
    if (placed >= 3 && reachableFrom(room, px, py).has(portalX, portalY)) {
      room.landmarks.push({ kind: 'rubble', x: cx, y: cy });
      return true;
    }
    room.obstacles.length = before;
  }
  return false;
}

function rollSpecies(rng, biome, idx, idolBump = false) {
  const w = { marrowJar: 18, bellHusk: 12, blackGlass: 12, rootCyst: 10, moonseedUrn: 7, falseIdol: 3 };
  if (idolBump) { w.falseIdol += 8; w.moonseedUrn += 6; }
  if (['mirror', 'shardreef', 'frostreliquary'].includes(biome.id)) w.blackGlass += 18;
  if (['verdigris', 'fen', 'mycelium', 'coilroot', 'rosewire', 'blacksungarden'].includes(biome.id)) { w.rootCyst += 14; w.marrowJar += 8; }
  if (['basilica', 'ossuary', 'empyrean', 'nullthrone', 'auricspire'].includes(biome.id)) { w.falseIdol += 7; w.bellHusk += 10; }
  if (idx >= 5) w.falseIdol += 3;
  const pool = Object.entries(w).map(([item, wt]) => ({ item, w: wt }));
  let total = 0; for (const p of pool) total += p.w;
  let roll = rng() * total;
  for (const p of pool) { roll -= p.w; if (roll <= 0) return p.item; }
  return 'marrowJar';
}

function buildAnnex(room, rng) {
  const side = pick(rng, ['n', 'e', 'w']); // not south: player spawns low
  const w = room.wall;
  const span = rand(rng, 250, 340), depth = rand(rng, 155, 225);
  let rect, doorRect, cx, cy;
  if (side === 'n') {
    const x = rand(rng, w + 160, room.w - w - 160 - span);
    rect = { x, y: w, w: span, h: depth };
    doorRect = { x: x + span * 0.3, y: w + depth - 16, w: span * 0.4, h: 18 };
    cx = x + span / 2; cy = w + depth * 0.45;
  } else if (side === 'e') {
    const y = rand(rng, w + 140, room.h - w - 140 - span);
    rect = { x: room.w - w - depth, y, w: depth, h: span };
    doorRect = { x: room.w - w - depth - 2, y: y + span * 0.3, w: 18, h: span * 0.4 };
    cx = room.w - w - depth * 0.45; cy = y + span / 2;
  } else {
    const y = rand(rng, w + 140, room.h - w - 140 - span);
    rect = { x: w, y, w: depth, h: span };
    doorRect = { x: w + depth - 16, y: y + span * 0.3, w: 18, h: span * 0.4 };
    cx = w + depth * 0.45; cy = y + span / 2;
  }
  const ambush = chance(rng, ANNEX.AMBUSH);
  room.annex = {
    side, rect, opened: false, cx, cy,
    kind: ambush ? 'ambush' : 'secret',
    ambushType: pick(rng, ['skitter', 'skitter', 'gunner']),
    ambushCount: randi(rng, 2, 3),
    reward: pick(rng, ['heart', 'repair', 'marrow']),
  };
  // flank walls (solid) + the breakable door
  const t = 18;
  if (side === 'n') {
    room.obstacles.push(
      { type: 'rect', x: rect.x - t, y: rect.y, w: t, h: rect.h, style: 'boundary', solidWall: true },
      { type: 'rect', x: rect.x + rect.w, y: rect.y, w: t, h: rect.h, style: 'boundary', solidWall: true },
      { type: 'rect', x: rect.x, y: rect.y + rect.h - 2, w: doorRect.x - rect.x, h: t, style: 'boundary', solidWall: true },
      { type: 'rect', x: doorRect.x + doorRect.w, y: rect.y + rect.h - 2, w: rect.x + rect.w - doorRect.x - doorRect.w, h: t, style: 'boundary', solidWall: true },
    );
  } else if (side === 'e') {
    room.obstacles.push(
      { type: 'rect', x: rect.x, y: rect.y - t, w: rect.w, h: t, style: 'boundary', solidWall: true },
      { type: 'rect', x: rect.x, y: rect.y + rect.h, w: rect.w, h: t, style: 'boundary', solidWall: true },
      { type: 'rect', x: rect.x - 2, y: rect.y, w: t, h: doorRect.y - rect.y, style: 'boundary', solidWall: true },
      { type: 'rect', x: rect.x - 2, y: doorRect.y + doorRect.h, w: t, h: rect.y + rect.h - doorRect.y - doorRect.h, style: 'boundary', solidWall: true },
    );
  } else {
    room.obstacles.push(
      { type: 'rect', x: rect.x, y: rect.y - t, w: rect.w, h: t, style: 'boundary', solidWall: true },
      { type: 'rect', x: rect.x, y: rect.y + rect.h, w: rect.w, h: t, style: 'boundary', solidWall: true },
      { type: 'rect', x: rect.x + rect.w - t + 2, y: rect.y, w: t, h: doorRect.y - rect.y, style: 'boundary', solidWall: true },
      { type: 'rect', x: rect.x + rect.w - t + 2, y: doorRect.y + doorRect.h, w: t, h: rect.y + rect.h - doorRect.y - doorRect.h, style: 'boundary', solidWall: true },
    );
  }
  room.obstacles.push({
    type: 'rect', ...doorRect, style: 'door',
    breakable: true, species: 'annexDoor', hp: SPECIES.annexDoor.hp + room.idx,
  });
}

// ── Neon districts + flow lanes (ported from ChatGPT's "neon districts" build) ──
// Districts are big NON-COLLIDING city slabs baked under the fight (the sprawl reads
// as a place, not added collision). Flow lanes are wide boost boulevards that speed
// you along them (player.js applyFlowLanes) — momentum highways across the sprawl.
const DISTRICT_PREFIX = ['Neon', 'Orbital', 'Nullstar', 'Chrome', 'Afterlight', 'Prism', 'Ghost', 'Blackglass', 'Void', 'Signal'];
const DISTRICT_CORE = ['Arcology', 'Market', 'Harbor', 'Rail', 'Stack', 'Canal', 'Sprawl', 'Exchange', 'Array', 'Boulevard'];
const DISTRICT_KIND = ['market', 'rail', 'dock', 'arcology', 'reactor', 'garden', 'data', 'shrine'];

function rollDistrictName(room, rng) {
  if (room.bossId) return `${pick(rng, DISTRICT_PREFIX)} ${pick(rng, ['Citadel', 'Apex', 'Kill-Stack', 'Throne'])}`;
  return `${pick(rng, DISTRICT_PREFIX)} ${pick(rng, DISTRICT_CORE)}`;
}
function rollDistrictSubtitle(room, rng) {
  const suffix = pick(rng, ['endless district', 'cyberpunk drift', 'orbital block', 'star-city floor', 'light-speed lane']);
  return `${room.biome.mech} · ${suffix}`;
}

function seedDistricts(room, rng, px, py, portalX, portalY) {
  const pal = room.biome.pal;
  const cols = room.w > 4200 ? 5 : 4;
  const rows = room.h > 3200 ? 5 : 4;
  const wall = room.wall + 120;
  // Each neighborhood gets a DISTINCT neon hue, spread around the colour wheel from a
  // room-random base, so a single sprawl reads as different districts — not one colour.
  const baseHue = Math.floor(rng() * 360);
  let id = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (chance(rng, 0.12)) continue;
      const cw = (room.w - wall * 2) / cols;
      const ch = (room.h - wall * 2) / rows;
      const x = wall + c * cw + rand(rng, 24, 76);
      const y = wall + r * ch + rand(rng, 24, 76);
      const w = cw * rand(rng, 0.58, 0.86);
      const h = ch * rand(rng, 0.54, 0.82);
      const cx = x + w / 2, cy = y + h / 2;
      if (dist(cx, cy, px, py) < 360 || dist(cx, cy, portalX, portalY) < 260) continue;
      const hue = (baseHue + id * 64) % 360;
      room.districts.push({
        id: id++, x, y, w, h, cx, cy,
        kind: pick(rng, DISTRICT_KIND),
        color: `hsl(${hue}, 80%, 62%)`,
        phase: rng() * TAU,
      });
    }
  }
  // functional anchors stay in the biome's own accents (home / exit / plaza = places, not blocks)
  room.districts.push(
    { id: id++, x: px - 360, y: py - 240, w: 720, h: 480, cx: px, cy: py, kind: 'spawn', color: pal.accent3, phase: rng() * TAU },
    { id: id++, x: portalX - 340, y: portalY - 220, w: 680, h: 440, cx: portalX, cy: portalY, kind: 'exit', color: pal.accent2, phase: rng() * TAU },
    { id: id++, x: room.w * 0.5 - 420, y: room.h * 0.47 - 300, w: 840, h: 600, cx: room.w * 0.5, cy: room.h * 0.47, kind: 'plaza', color: pal.accent, phase: rng() * TAU },
  );
}

function seedFlowLanes(room, rng, px, py, portalX, portalY) {
  const pal = room.biome.pal;
  const wall = room.wall + 92;
  const clampX = (x) => clamp(x, wall, room.w - wall);
  const clampY = (y) => clamp(y, wall, room.h - wall);
  const add = (x1, y1, x2, y2, width, boost, color, kind = 'boulevard') => room.flowLanes.push({
    x1: clampX(x1), y1: clampY(y1), x2: clampX(x2), y2: clampY(y2),
    width, boost, color, phase: rng() * TAU, kind,
  });
  const mid = {
    x: clampX(room.w / 2 + rand(rng, -room.w * 0.12, room.w * 0.12)),
    y: clampY(room.h * rand(rng, 0.43, 0.51)),
  };
  const arteryW = room.bossId ? 148 : 136;
  add(px, py, mid.x, mid.y, arteryW, 365, pal.accent3, 'artery');
  add(mid.x, mid.y, portalX, portalY + 24, arteryW, 365, pal.accent2, 'artery');
  // Giant-room city grid: wide non-blocking boost boulevards — readable routes, not collision.
  const hBands = room.bossId ? [0.34, 0.58] : [0.30, 0.50, 0.70];
  for (const f of hBands) {
    const y = clampY(room.h * f + rand(rng, -70, 70));
    add(wall + rand(rng, 0, 90), y, room.w - wall - rand(rng, 0, 90), y + rand(rng, -85, 85), rand(rng, 92, 130), rand(rng, 280, 345), chance(rng, 0.5) ? pal.accent : pal.accent3);
  }
  const vBands = room.bossId ? [0.38, 0.62] : [0.28, 0.50, 0.72];
  for (const f of vBands) {
    const x = clampX(room.w * f + rand(rng, -80, 80));
    add(x, wall + rand(rng, 0, 90), x + rand(rng, -90, 90), room.h - wall - rand(rng, 0, 90), rand(rng, 82, 118), rand(rng, 250, 320), chance(rng, 0.5) ? pal.accent2 : pal.accent3);
  }
  const diagonals = room.bossId ? 1 : 2;
  for (let i = 0; i < diagonals; i++) {
    const leftStart = chance(rng, 0.5);
    add(leftStart ? wall : room.w - wall, rand(rng, room.h * 0.25, room.h * 0.42),
      leftStart ? room.w - wall : wall, rand(rng, room.h * 0.58, room.h * 0.78),
      rand(rng, 70, 96), rand(rng, 225, 290), chance(rng, 0.5) ? pal.accent : pal.accent2, 'side');
  }
}

// ── City dressing (ported from ChatGPT's Round 2): skyways, neon signs, traffic
// flecks. All NON-COLLIDING and BAKED into the background — the "well-fleshed world"
// without any per-frame cost or new collision. ──
const SIGN_WORDS = ['NULL', 'MOON', 'EXIT', 'EAT', 'LIVE', 'HUSH', 'GOD', 'WIRE', 'GRAFT', 'BLOOM', 'NOIR', 'OPEN', 'KILL', 'SAINT'];

function seedCityDressing(room, rng, px, py, portalX, portalY) {
  const pal = room.biome.pal;
  const districts = room.districts || [];
  const lanes = room.flowLanes || [];
  const byDist = (a, b) => dist(a.cx, a.cy, b.cx, b.cy);

  // Elevated transit rails between neighborhoods — depth without stealing pathing.
  const skyCount = room.bossId ? randi(rng, 3, 5) : randi(rng, view.mobile ? 5 : 7, view.mobile ? 8 : 11);
  for (let i = 0; i < skyCount && districts.length > 1; i++) {
    const a = pick(rng, districts);
    const options = districts.filter(d => d !== a).sort((u, v) => byDist(a, u) - byDist(a, v));
    const b = options[Math.min(options.length - 1, randi(rng, 1, Math.min(5, Math.max(1, options.length - 1))))] || pick(rng, districts);
    if (!b || dist(a.cx, a.cy, b.cx, b.cy) < 520) continue;
    room.skyways.push({
      x1: a.cx + rand(rng, -a.w * 0.18, a.w * 0.18), y1: a.cy + rand(rng, -a.h * 0.18, a.h * 0.18),
      x2: b.cx + rand(rng, -b.w * 0.18, b.w * 0.18), y2: b.cy + rand(rng, -b.h * 0.18, b.h * 0.18),
      color: chance(rng, 0.5) ? a.color : pal.accent3, width: rand(rng, 18, 34), phase: rng() * TAU,
    });
  }

  // Tiny neon signage gives each slab a "place" without becoming cover (district-tinted).
  const signCount = room.bossId ? randi(rng, 5, 9) : randi(rng, view.mobile ? 16 : 24, view.mobile ? 28 : 42);
  for (let i = 0; i < signCount && districts.length; i++) {
    const d = pick(rng, districts);
    const edge = randi(rng, 0, 3), pad = 36;
    const x = edge === 0 ? d.x + rand(rng, pad, d.w - pad) : edge === 1 ? d.x + d.w - rand(rng, 8, 26) : edge === 2 ? d.x + rand(rng, pad, d.w - pad) : d.x + rand(rng, 8, 26);
    const y = edge === 0 ? d.y + rand(rng, 8, 26) : edge === 1 ? d.y + rand(rng, pad, d.h - pad) : edge === 2 ? d.y + d.h - rand(rng, 8, 26) : d.y + rand(rng, pad, d.h - pad);
    if (dist(x, y, px, py) < 250 || dist(x, y, portalX, portalY) < 190) continue;
    room.signs.push({
      x, y, w: rand(rng, 56, 132), h: rand(rng, 18, 34),
      rot: edge === 1 || edge === 3 ? Math.PI / 2 + rand(rng, -0.08, 0.08) : rand(rng, -0.08, 0.08),
      color: chance(rng, 0.55) ? d.color : chance(rng, 0.5) ? pal.accent : pal.accent2,
      text: pick(rng, SIGN_WORDS),
    });
  }

  // Baked traffic flecks along the boost roads — the metropolis feels inhabited.
  const trafficCount = room.bossId ? randi(rng, 28, 44) : randi(rng, view.mobile ? 70 : 105, view.mobile ? 105 : 150);
  for (let i = 0; i < trafficCount && lanes.length; i++) {
    const l = pick(rng, lanes);
    const at = rand(rng, 0.04, 0.96), dx = l.x2 - l.x1, dy = l.y2 - l.y1;
    const len = Math.hypot(dx, dy) || 1, lx = dx / len, ly = dy / len, nx = -ly, ny = lx;
    const off = rand(rng, -(l.width || 80) * 0.42, (l.width || 80) * 0.42);
    room.traffic.push({
      x: l.x1 + dx * at + nx * off, y: l.y1 + dy * at + ny * off,
      lx, ly, len: rand(rng, 18, 64), color: chance(rng, 0.58) ? l.color : '#ffffff', alpha: rand(rng, 0.08, 0.24),
    });
  }
}

// obstacles keep clear of the main arteries/boulevards so the boost routes stay open.
function nearProtectedFlowLane(room, o, margin = 0) {
  if (!room.flowLanes?.length) return false;
  const b = aabb(o);
  const pts = [
    [b.x + b.w / 2, b.y + b.h / 2], [b.x, b.y], [b.x + b.w, b.y],
    [b.x, b.y + b.h], [b.x + b.w, b.y + b.h],
  ];
  const radius = o.type === 'circle' ? o.rad : Math.min(140, Math.hypot(b.w, b.h) * 0.36);
  for (const l of room.flowLanes) {
    if (l.kind !== 'artery') continue; // keep only the main spawn→portal arteries clear
    const protect = (l.width || 90) * 0.5 + radius + margin;
    if (pts.some(([x, y]) => distPointSegment(x, y, l.x1, l.y1, l.x2, l.y2) < protect)) return true;
  }
  return false;
}

function distPointSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy || 1;
  const t = clamp(((px - x1) * dx + (py - y1) * dy) / len2, 0, 1);
  return dist(px, py, x1 + dx * t, y1 + dy * t);
}

function paintNeonDistricts(ctx, room, rng, pal) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter'; // additive: each neighborhood's distinct neon hue glows
  // District slabs: big NON-COLLIDING city blocks under the fight, each its own neon colour.
  for (const d of room.districts || []) {
    ctx.save();
    ctx.translate(d.cx, d.cy);
    ctx.rotate(Math.sin(d.phase) * 0.035);
    const x = -d.w / 2, y = -d.h / 2;
    ctx.globalAlpha = d.kind === 'spawn' || d.kind === 'exit' ? 0.12 : 0.105;
    ctx.fillStyle = d.color || pal.accent3;
    roundRect(ctx, x, y, d.w, d.h, 22); ctx.fill();
    ctx.globalAlpha = 0.24;
    ctx.strokeStyle = d.color || pal.accent3;
    ctx.lineWidth = d.kind === 'plaza' ? 4 : 2.2;
    roundRect(ctx, x, y, d.w, d.h, 22); ctx.stroke();
    const cols = clamp(Math.floor(d.w / 150), 3, 9);
    const rows = clamp(Math.floor(d.h / 120), 2, 7);
    ctx.globalAlpha = 0.14;
    ctx.strokeStyle = d.kind === 'rail' ? pal.accent2 : d.color || pal.accent;
    ctx.lineWidth = 1.4;
    for (let c = 1; c < cols; c++) { const xx = x + (d.w * c) / cols; ctx.beginPath(); ctx.moveTo(xx, y + 18); ctx.lineTo(xx, y + d.h - 18); ctx.stroke(); }
    for (let r = 1; r < rows; r++) { const yy = y + (d.h * r) / rows; ctx.beginPath(); ctx.moveTo(x + 18, yy); ctx.lineTo(x + d.w - 18, yy); ctx.stroke(); }
    if (d.kind === 'reactor' || d.kind === 'plaza' || d.kind === 'exit') {
      ctx.globalAlpha = 0.20; ctx.strokeStyle = pal.accent2; ctx.lineWidth = 3;
      const rr = Math.min(d.w, d.h) * 0.26;
      ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, rr * 0.58, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }
  // Baked road shadows under the live flow lanes (drawn animated in draw.js).
  ctx.globalCompositeOperation = 'lighter';
  for (const l of room.flowLanes || []) {
    ctx.globalAlpha = l.kind === 'artery' ? 0.12 : 0.07;
    ctx.strokeStyle = l.color || pal.accent3;
    ctx.lineWidth = (l.width || 90) * (l.kind === 'artery' ? 1.22 : 1.05);
    ctx.beginPath(); ctx.moveTo(l.x1, l.y1); ctx.lineTo(l.x2, l.y2); ctx.stroke();
    ctx.globalAlpha *= 0.5; ctx.strokeStyle = pal.bg; ctx.lineWidth *= 0.42;
    ctx.beginPath(); ctx.moveTo(l.x1, l.y1); ctx.lineTo(l.x2, l.y2); ctx.stroke();
  }
  ctx.restore(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
}

// Baked city dressing: skyways (aerial rails), traffic flecks, and neon signage.
function paintCityDressing(ctx, room, rng, pal) {
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.globalCompositeOperation = 'lighter';
  for (const sw of room.skyways || []) {
    ctx.globalAlpha = 0.05; ctx.strokeStyle = sw.color || pal.accent2; ctx.lineWidth = (sw.width || 24) * 1.9;
    ctx.beginPath(); ctx.moveTo(sw.x1, sw.y1); ctx.lineTo(sw.x2, sw.y2); ctx.stroke();
    ctx.globalAlpha = 0.20; ctx.lineWidth = 1.7; ctx.setLineDash([22, 18]); ctx.lineDashOffset = (sw.phase || 0) * 18;
    ctx.beginPath(); ctx.moveTo(sw.x1, sw.y1); ctx.lineTo(sw.x2, sw.y2); ctx.stroke(); ctx.setLineDash([]);
  }
  for (const tr of room.traffic || []) {
    ctx.globalAlpha = tr.alpha || 0.12; ctx.strokeStyle = tr.color || pal.accent3; ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(tr.x - tr.lx * tr.len * 0.5, tr.y - tr.ly * tr.len * 0.5);
    ctx.lineTo(tr.x + tr.lx * tr.len * 0.5, tr.y + tr.ly * tr.len * 0.5);
    ctx.stroke();
  }
  for (const sg of room.signs || []) {
    ctx.save();
    ctx.translate(sg.x, sg.y); ctx.rotate(sg.rot || 0);
    ctx.globalAlpha = 0.15; ctx.fillStyle = sg.color || pal.accent;
    roundRect(ctx, -sg.w / 2, -sg.h / 2, sg.w, sg.h, 6); ctx.fill();
    ctx.globalAlpha = 0.40; ctx.strokeStyle = sg.color || pal.accent; ctx.lineWidth = 1.5;
    roundRect(ctx, -sg.w / 2, -sg.h / 2, sg.w, sg.h, 6); ctx.stroke();
    // abstract light-glyphs, not random words stamped into the floor
    ctx.globalAlpha = 0.48; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
    const bars = 3 + Math.floor(((sg.x + sg.y) % 3));
    for (let i = 0; i < bars; i++) {
      const yy = -sg.h * 0.24 + i * (sg.h * 0.18);
      ctx.beginPath(); ctx.moveTo(-sg.w * 0.32, yy); ctx.lineTo(sg.w * (0.12 + i * 0.08), yy); ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(sg.w * 0.32, 0, Math.min(7, sg.h * 0.20), 0, TAU); ctx.stroke();
    ctx.restore();
  }
  ctx.restore(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
}

function paintFloorIdentity(ctx, room, rng, pal) {
  const { w, h } = room, wall = room.wall;
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // corner brackets frame the floor
  ctx.globalAlpha = 0.13; ctx.strokeStyle = pal.accent3; ctx.lineWidth = 4;
  const m = wall + 36, L = 70 + rng() * 46;
  for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const x = sx > 0 ? m : w - m, y = sy > 0 ? m : h - m;
    ctx.beginPath(); ctx.moveTo(x + sx * L, y); ctx.lineTo(x, y); ctx.lineTo(x, y + sy * L); ctx.stroke();
  }
  ctx.restore(); ctx.globalAlpha = 1;
  // the biome's signature emblem is the centre motif (replaces the old generic one),
  // so every biome reads as itself even when two share a colour family.
  paintSignature(room.biome, ctx, w, h, rng, pal);
}

function paintArchitecturalDecals(room, ctx, rng, pal) {
  const spawn = { x: room.w / 2, y: room.h * 0.66 }, portal = { x: room.w / 2, y: room.h * 0.20 };
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  // A faint pilgrimage path gives the huge floor direction: spawn → middle → portal.
  const midY = room.h * (room.floorplanId === 'none' ? 0.46 : 0.50);
  ctx.strokeStyle = hexA(pal.accent3, 0.10); ctx.lineWidth = Math.max(46, Math.min(room.w, room.h) * 0.045);
  ctx.beginPath(); ctx.moveTo(spawn.x, spawn.y); ctx.bezierCurveTo(room.w * 0.44, midY, room.w * 0.56, midY, portal.x, portal.y); ctx.stroke();
  ctx.strokeStyle = hexA(pal.bg, 0.16); ctx.lineWidth *= 0.46;
  ctx.beginPath(); ctx.moveTo(spawn.x, spawn.y); ctx.bezierCurveTo(room.w * 0.46, midY, room.w * 0.54, midY, portal.x, portal.y); ctx.stroke();

  // Large room seals: one readable landmark beats fifty random freckles.
  const seals = room.bossId ? 3 : 2;
  for (let i = 0; i < seals; i++) {
    const x = room.w * rand(rng, 0.28, 0.72), y = room.h * rand(rng, 0.27, 0.62);
    const r = Math.min(room.w, room.h) * rand(rng, 0.08, 0.14);
    ctx.save(); ctx.translate(x, y); ctx.rotate(rng() * TAU);
    ctx.strokeStyle = hexA(i % 2 ? pal.accent2 : pal.accent, 0.12); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(0, 0, r, r * rand(rng, 0.42, 0.72), 0, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 0.75;
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.35, Math.sin(a) * r * 0.35); ctx.lineTo(Math.cos(a) * r * 0.92, Math.sin(a) * r * 0.92); ctx.stroke();
    }
    ctx.restore();
  }

  // Wall shadows and landmark halos baked into the floor so architecture feels rooted.
  for (const o of room.obstacles) {
    if (!o.archKind && !o.wall) continue;
    const b = aabb(o);
    ctx.fillStyle = hexA('#000000', o.wall ? 0.14 : 0.07);
    if (o.type === 'circle') {
      ctx.beginPath(); ctx.ellipse(o.x + 7, o.y + (o.rad || 20) * 0.72, (o.rad || 20) * 1.35, (o.rad || 20) * 0.38, 0, 0, TAU); ctx.fill();
    } else {
      roundRect(ctx, b.x + 5, b.y + b.h * 0.55, b.w, Math.max(12, b.h * 0.5), 8); ctx.fill();
    }
  }

  ctx.restore(); ctx.globalAlpha = 1;
}

function hexA(hex, alpha) {
  const h = hex.replace('#', '');
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${alpha})`;
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function chooseBackgroundScale(room) {
  // Cap the baked canvas so giant rooms don't allocate a 100MB+ bitmap. We draw in
  // room-space and output at this fraction, then scale the image back up at draw time.
  const maxPixels = view.mobile ? 5_600_000 : 9_000_000;
  const maxDim = view.mobile ? 3072 : 4096;
  const byPixels = Math.sqrt(maxPixels / Math.max(1, room.w * room.h));
  const byDim = maxDim / Math.max(room.w, room.h);
  return clamp(Math.min(1, byPixels, byDim), 0.34, 1);
}

function bakeBackground(room, rng) {
  if (typeof document === 'undefined') return null; // headless tests
  // Visual baking gets its OWN deterministic stream so it never advances the gameplay
  // RNG. Headless skips baking but the browser doesn't — without this they diverge, so
  // tests would validate a room sequence the player never sees. [bug ChatGPT flagged]
  rng = mulberry32(hashString(`${room.round}|${room.biome.id}|${room.layoutId}|${room.recipeId}|${room.districtName}|bg`));
  const c = document.createElement('canvas');
  const scale = chooseBackgroundScale(room);
  room.backgroundScale = scale;
  c.width = Math.max(1, Math.round(room.w * scale));
  c.height = Math.max(1, Math.round(room.h * scale));
  const ctx = c.getContext('2d');
  ctx.scale(scale, scale); // draw in room-space; the canvas is scaled-down (cheap for huge rooms)
  const pal = room.biome.pal;
  const g = ctx.createLinearGradient(0, 0, 0, room.h);
  g.addColorStop(0, pal.bg);
  g.addColorStop(1, pal.floor);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, room.w, room.h);

  // 2 feature patterns + 1 extra, dealt without in-room repeats
  const deck = [...room.biome.features];
  const picks = [];
  for (let i = 0; i < 2 && deck.length; i++) picks.push(deck.splice(Math.floor(rng() * deck.length), 1)[0]);
  picks.push(pick(rng, room.biome.extras));
  for (const name of picks) paintPattern(name, ctx, room.w, room.h, rng, pal);
  paintFloorIdentity(ctx, room, rng, pal);
  paintNeonDistricts(ctx, room, rng, pal);
  paintCityDressing(ctx, room, rng, pal);
  paintArchitecturalDecals(room, ctx, rng, pal);

  // annex floor tint
  if (room.annex) {
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = pal.bg;
    ctx.fillRect(room.annex.rect.x, room.annex.rect.y, room.annex.rect.w, room.annex.rect.h);
    ctx.globalAlpha = 1;
  }

  // biome lighting grade: a faint accent glow toward the portal gives each biome a
  // distinct light-source mood (warm forges, cold reliquaries) and pulls the eye up-room.
  const glow = ctx.createRadialGradient(room.w / 2, room.h * 0.2, 0, room.w / 2, room.h * 0.2, Math.max(room.w, room.h) * 0.5);
  glow.addColorStop(0, hexA(pal.accent, 0.05));
  glow.addColorStop(1, hexA(pal.accent, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, room.w, room.h);

  // baked edge darkening
  const v = ctx.createRadialGradient(room.w / 2, room.h / 2, Math.min(room.w, room.h) * 0.3, room.w / 2, room.h / 2, Math.max(room.w, room.h) * 0.72);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.42)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, room.w, room.h);
  return c;
}
