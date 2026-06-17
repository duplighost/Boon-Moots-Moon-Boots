// Floorplan generators — Phase 8a. Each returns an array of wall rects that
// partition the room into real chambers, BEFORE the cover scatter. Walls are
// solid (block movement + all bullets). Openings are generous (the small-door
// complaint); some dividers seal with a breakable segment you smash to open.
// Connectivity is guaranteed by construction and validated by flood-fill in the
// roller (docs/room-architecture.md §2). Partitions sit in the upper/middle band
// so the player spawn (≈0.66h) stays clear and you traverse them to the portal.
import { rand, randi, chance, pick, clamp } from '../rng.js';

// Partition plans. roomRoller does the weighted 'none' roll separately so duplicate
// no-room cards cannot be suppressed by Bag recent-history. The chamber plans
// (gallery/warren/antechamber/Lcourt) place walls in unique, organized arrangements
// with deliberately-staggered doorways, validated for connectivity by the roller.
export const FLOORPLAN_IDS = ['bisect', 'innerSanctum', 'spineCorridor', 'quadrants', 'gallery', 'warren', 'antechamber', 'Lcourt'];

const T = 30;                 // wall thickness
const GAP = [170, 230];       // opening width — at least ~4 player diameters

function wall(x, y, w, h, style, extra = {}) {
  return { type: 'rect', x, y, w, h, wall: true, ledgeHeight: Infinity, style, round: 4, ...extra };
}

// a wall line with ONE opening. horizontal: spans xa..xb at center-y `c`.
// If breakable, the opening is filled by a smashable segment (room looks sealed
// until you break through); else it's just an open gap.
// `frac` (0..1) optionally positions the opening along the span — pass it to
// stagger doorways deliberately (organized flow); omit for a random opening.
function lineH(rng, c, xa, xb, idx, breakable, out, openings, frac = null) {
  const span = xb - xa;
  const gap = Math.min(rand(rng, GAP[0], GAP[1]), span * 0.55);
  const lo = xa + gap * 0.75, hi = xb - gap * 0.75;
  const gx = frac == null ? rand(rng, lo, hi) : clamp(lo + (hi - lo) * frac, lo, hi);
  out.push(wall(xa, c - T / 2, (gx - gap / 2) - xa, T, 'wall'));
  out.push(wall(gx + gap / 2, c - T / 2, xb - (gx + gap / 2), T, 'wall'));
  if (breakable) out.push(wall(gx - gap / 2, c - T / 2, gap, T, 'door', { breakable: true, species: 'wallSegment', hp: 7 + idx * 2 }));
  openings.push({ x: gx, y: c, breakable });
}
function lineV(rng, c, ya, yb, idx, breakable, out, openings, frac = null) {
  const span = yb - ya;
  const gap = Math.min(rand(rng, GAP[0], GAP[1]), span * 0.55);
  const lo = ya + gap * 0.75, hi = yb - gap * 0.75;
  const gy = frac == null ? rand(rng, lo, hi) : clamp(lo + (hi - lo) * frac, lo, hi);
  out.push(wall(c - T / 2, ya, T, (gy - gap / 2) - ya, 'wall'));
  out.push(wall(c - T / 2, gy + gap / 2, T, yb - (gy + gap / 2), 'wall'));
  if (breakable) out.push(wall(c - T / 2, gy - gap / 2, T, gap, 'door', { breakable: true, species: 'wallSegment', hp: 7 + idx * 2 }));
  openings.push({ x: c, y: gy, breakable });
}

export const FLOORPLANS = {
  none() { return { walls: [], openings: [] }; },

  bisect(room, rng, idx) {
    const walls = [], openings = [];
    const w = room.wall;
    const breakable = chance(rng, 0.4);
    if (chance(rng, 0.6)) {
      // horizontal divider between portal (top) and spawn (lower)
      lineH(rng, room.h * rand(rng, 0.40, 0.5), w + 30, room.w - w - 30, idx, breakable, walls, openings);
    } else {
      // vertical divider, off-centre so it never bisects the spawn point
      lineV(rng, room.w * (chance(rng, 0.5) ? rand(rng, 0.30, 0.4) : rand(rng, 0.6, 0.7)), w + 30, room.h - w - 30, idx, breakable, walls, openings);
    }
    return { walls, openings };
  },

  spineCorridor(room, rng, idx) {
    // two vertical walls → central hallway (holds spawn) + two side chambers
    const walls = [], openings = [];
    const w = room.wall;
    const lx = room.w * rand(rng, 0.30, 0.36);
    const rx = room.w * rand(rng, 0.64, 0.70);
    lineV(rng, lx, w + 30, room.h - w - 30, idx, chance(rng, 0.3), walls, openings);
    lineV(rng, rx, w + 30, room.h - w - 30, idx, chance(rng, 0.3), walls, openings);
    return { walls, openings };
  },

  quadrants(room, rng, idx) {
    // a cross, offset so the spawn sits clear in one quadrant; gaps near the hub
    const walls = [], openings = [];
    const w = room.wall;
    const cy = room.h * rand(rng, 0.42, 0.5);
    const cx = room.w * (chance(rng, 0.5) ? rand(rng, 0.40, 0.46) : rand(rng, 0.54, 0.6));
    lineH(rng, cy, w + 30, room.w - w - 30, idx, false, walls, openings);
    lineV(rng, cx, w + 30, room.h - w - 30, idx, false, walls, openings);
    return { walls, openings };
  },

  innerSanctum(room, rng, idx) {
    // a walled box in the upper-middle with 1-2 entrances; holds the good stuff
    const walls = [], openings = [];
    const bw = room.w * rand(rng, 0.34, 0.44);
    const bh = room.h * rand(rng, 0.24, 0.30);
    const bx = room.w * 0.5 - bw / 2 + rand(rng, -40, 40);
    // sit the box mid-room: portal stays clear above it, spawn clear below it
    const by = room.h * rand(rng, 0.42, 0.47) - bh / 2;
    const gap = rand(rng, GAP[0], GAP[1]);
    // bottom edge always has the main entrance (faces the player)
    const egx = bx + bw * rand(rng, 0.35, 0.65);
    walls.push(wall(bx, by + bh - T / 2, (egx - gap / 2) - bx, T, 'wall'));
    walls.push(wall(egx + gap / 2, by + bh - T / 2, (bx + bw) - (egx + gap / 2), T, 'wall'));
    // top edge solid, sides solid (optionally a 2nd side entrance)
    walls.push(wall(bx, by - T / 2, bw, T, 'wall'));
    const sideGap = chance(rng, 0.5);
    if (sideGap) {
      const sgy = by + bh * rand(rng, 0.35, 0.6);
      walls.push(wall(bx - T / 2, by, T, (sgy - gap / 2) - by, 'wall'));
      walls.push(wall(bx - T / 2, sgy + gap / 2, T, (by + bh) - (sgy + gap / 2), 'wall'));
      walls.push(wall(bx + bw - T / 2, by, T, bh, 'wall'));
      openings.push({ x: bx, y: sgy, breakable: false });
    } else {
      walls.push(wall(bx - T / 2, by, T, bh, 'wall'));
      walls.push(wall(bx + bw - T / 2, by, T, bh, 'wall'));
    }
    openings.push({ x: egx, y: by + bh, breakable: false });
    return { walls, openings, sanctum: { x: bx, y: by, w: bw, h: bh } };
  },

  gallery(room, rng, idx) {
    // three stacked halls joined by doorways staggered to opposite sides, so you
    // zigzag spawn → middle → portal instead of walking a straight line.
    const walls = [], openings = [];
    const w = room.wall, xa = w + 30, xb = room.w - w - 30;
    const y1 = room.h * rand(rng, 0.30, 0.36);
    const y2 = room.h * rand(rng, 0.52, 0.57);
    const leftFirst = chance(rng, 0.5);
    lineH(rng, y1, xa, xb, idx, chance(rng, 0.35), walls, openings, leftFirst ? 0.20 : 0.80);
    lineH(rng, y2, xa, xb, idx, chance(rng, 0.30), walls, openings, leftFirst ? 0.80 : 0.20);
    return { walls, openings };
  },

  warren(room, rng, idx) {
    // four chambers around an OPEN central hub: an H wall and a V wall, each split
    // into two arms that stop short of meeting. Reads as four rooms; always threads
    // the centre (the hub never seals), so connectivity is guaranteed by design.
    const walls = [], openings = [];
    const w = room.wall, xa = w + 30, xb = room.w - w - 30, ya = w + 30, yb = room.h - w - 30;
    const cx = room.w * (chance(rng, 0.5) ? rand(rng, 0.36, 0.44) : rand(rng, 0.56, 0.64));
    const cy = room.h * rand(rng, 0.44, 0.52);
    const hub = rand(rng, 120, 165);
    walls.push(wall(xa, cy - T / 2, (cx - hub) - xa, T, 'wall'));
    walls.push(wall(cx + hub, cy - T / 2, xb - (cx + hub), T, 'wall'));
    walls.push(wall(cx - T / 2, ya, T, (cy - hub) - ya, 'wall'));
    walls.push(wall(cx - T / 2, cy + hub, T, yb - (cy + hub), 'wall'));
    openings.push({ x: cx, y: cy, breakable: false });
    return { walls, openings };
  },

  antechamber(room, rng, idx) {
    // a portal antechamber up top (entered through one door) over the main hall,
    // plus a short stub hanging into the hall for an asymmetric nook.
    const walls = [], openings = [];
    const w = room.wall, xa = w + 30, xb = room.w - w - 30;
    const cy = room.h * rand(rng, 0.30, 0.37);
    lineH(rng, cy, xa, xb, idx, chance(rng, 0.45), walls, openings);
    if (chance(rng, 0.7)) {
      const sx = room.w * (chance(rng, 0.5) ? rand(rng, 0.32, 0.42) : rand(rng, 0.58, 0.68));
      walls.push(wall(sx - T / 2, cy + T / 2, T, room.h * rand(rng, 0.13, 0.20), 'wall'));
    }
    return { walls, openings };
  },

  Lcourt(room, rng, idx) {
    // an L of walls tucks a court into one upper corner; the rest stays one big
    // room. Open on two sides (never seals) — it shapes the space without a door.
    const walls = [], openings = [];
    const right = chance(rng, 0.5);
    const cx = room.w * (right ? rand(rng, 0.54, 0.62) : rand(rng, 0.38, 0.46));
    const cy = room.h * rand(rng, 0.34, 0.44);
    const vLen = room.h * rand(rng, 0.17, 0.25);
    const hLen = room.w * rand(rng, 0.20, 0.28);
    walls.push(wall(cx - T / 2, cy, T, vLen, 'wall'));
    walls.push(wall(right ? cx - T / 2 : cx - hLen + T / 2, cy + vLen - T / 2, hLen, T, 'wall'));
    return { walls, openings };
  },
};
