// Parameterized layout generators — the room's bones. Each consumes ≥4 rolled
// parameters so the same layout never stamps twice (the prototypes' core failure).
// Returns obstacle spots {x, y, w?: weight for size}; the roller does placement
// hygiene (spawn clearance, overlap, walls). Sources: No Moon findThemedSpot
// modes (game_inline.js:3120-3196) + Boon Moots noMoonObstacleSpot (index.html:373-399).
import { TAU } from '../config.js';
import { rand, randi } from '../rng.js';

export const LAYOUT_IDS = ['courtyard', 'ring', 'lanesH', 'lanesV', 'crossroads', 'spine', 'pockets', 'edges', 'scatter'];

export const LAYOUTS = {
  // ring of cover around the center with a rolled gap arc
  courtyard(room, rng, count) {
    const spots = [];
    const cx = room.w * rand(rng, 0.46, 0.54), cy = room.h * rand(rng, 0.44, 0.54);
    const rad = Math.min(room.w, room.h) * rand(rng, 0.22, 0.32);
    const gapAt = randi(rng, 0, count - 1), gapLen = randi(rng, 1, 2);
    const a0 = rng() * TAU, squash = rand(rng, 0.8, 1);
    for (let i = 0; i < count; i++) {
      if (i >= gapAt && i < gapAt + gapLen) continue;
      const a = a0 + (i / count) * TAU + rand(rng, -0.16, 0.16);
      spots.push({ x: cx + Math.cos(a) * rad, y: cy + Math.sin(a) * rad * squash });
    }
    if (rng() < 0.4) spots.push({ x: cx, y: cy, big: true });
    return spots;
  },
  // tight double-able ring, sometimes nested
  ring(room, rng, count) {
    const spots = [];
    const cx = room.w * rand(rng, 0.45, 0.55), cy = room.h * rand(rng, 0.42, 0.52);
    const rings = rng() < 0.35 ? 2 : 1;
    for (let k = 0; k < rings; k++) {
      const rad = Math.min(room.w, room.h) * (rings === 2 ? (k === 0 ? rand(rng, 0.16, 0.2) : rand(rng, 0.3, 0.36)) : rand(rng, 0.2, 0.3));
      const n = rings === 2 ? Math.ceil(count / 2) : count;
      const a0 = rng() * TAU, skip = randi(rng, 0, n - 1);
      for (let i = 0; i < n; i++) {
        if (i === skip) continue;
        const a = a0 + (i / n) * TAU + rand(rng, -0.12, 0.12);
        spots.push({ x: cx + Math.cos(a) * rad, y: cy + Math.sin(a) * rad });
      }
    }
    return spots;
  },
  lanesH(room, rng, count) {
    const spots = [];
    const lanes = randi(rng, 2, 3);
    const phase = rand(rng, -60, 60);
    const skipLane = rng() < 0.3 ? randi(rng, 0, lanes - 1) : -1;
    for (let i = 0; i < count; i++) {
      const lane = i % lanes;
      if (lane === skipLane) continue;
      spots.push({
        x: rand(rng, room.wall + 130, room.w - room.wall - 130),
        y: ((lane + 1) * room.h) / (lanes + 1) + phase + rand(rng, -46, 46),
        rect: rng() < 0.7, wide: true,
      });
    }
    return spots;
  },
  lanesV(room, rng, count) {
    const spots = [];
    const lanes = randi(rng, 2, 4);
    const phase = rand(rng, -70, 70);
    const skipLane = rng() < 0.3 ? randi(rng, 0, lanes - 1) : -1;
    for (let i = 0; i < count; i++) {
      const lane = i % lanes;
      if (lane === skipLane) continue;
      spots.push({
        x: ((lane + 1) * room.w) / (lanes + 1) + phase + rand(rng, -52, 52),
        y: rand(rng, room.wall + 120, room.h - room.wall - 130),
        rect: rng() < 0.7, tall: true,
      });
    }
    return spots;
  },
  crossroads(room, rng, count) {
    const spots = [];
    const ox = rand(rng, -120, 120), oy = rand(rng, -90, 90);
    for (let i = 0; i < count; i++) {
      const vertical = i % 2 === (rng() < 0.5 ? 0 : 1);
      const off = (Math.floor(i / 2) - Math.floor(count / 4)) * rand(rng, 120, 165) + rand(rng, -35, 35);
      spots.push(vertical
        ? { x: room.w * 0.5 + ox + off, y: rand(rng, room.wall + 130, room.h - room.wall - 160), rect: rng() < 0.5 }
        : { x: rand(rng, room.wall + 130, room.w - room.wall - 130), y: room.h * 0.5 + oy + off, rect: rng() < 0.5 });
    }
    return spots;
  },
  spine(room, rng, count) {
    const spots = [];
    const vertical = rng() < 0.55;
    const wobble = rand(rng, 30, 130), bias = rand(rng, 0.35, 0.65), freq = rand(rng, 1.5, 3);
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      if (vertical) {
        spots.push({
          x: room.w * bias + Math.sin(t * freq * Math.PI) * wobble + rand(rng, -40, 40),
          y: room.wall + 110 + t * (room.h - room.wall * 2 - 220),
        });
      } else {
        spots.push({
          x: room.wall + 110 + t * (room.w - room.wall * 2 - 220),
          y: room.h * bias + Math.sin(t * freq * Math.PI) * wobble + rand(rng, -36, 36),
        });
      }
    }
    return spots;
  },
  pockets(room, rng, count) {
    const spots = [];
    const nPockets = randi(rng, 3, 4);
    const centers = [];
    for (let k = 0; k < nPockets; k++) {
      centers.push({
        x: room.w * rand(rng, 0.2, 0.8),
        y: room.h * rand(rng, 0.2, 0.72),
      });
    }
    for (let i = 0; i < count; i++) {
      const c = centers[i % nPockets];
      spots.push({ x: c.x + rand(rng, -120, 120), y: c.y + rand(rng, -95, 95) });
    }
    return spots;
  },
  edges(room, rng, count) {
    const spots = [];
    const sides = [0, 1, 2, 3].filter(() => rng() < 0.85);
    if (!sides.length) sides.push(randi(rng, 0, 3));
    const m = rand(rng, 120, 190);
    for (let i = 0; i < count; i++) {
      const side = sides[i % sides.length];
      if (side === 0) spots.push({ x: rand(rng, room.wall + 150, room.w - room.wall - 150), y: room.wall + m + rand(rng, -40, 40) });
      else if (side === 1) spots.push({ x: room.w - room.wall - m + rand(rng, -35, 35), y: rand(rng, room.wall + 160, room.h - room.wall - 160) });
      else if (side === 2) spots.push({ x: rand(rng, room.wall + 150, room.w - room.wall - 150), y: room.h - room.wall - m + rand(rng, -35, 35) });
      else spots.push({ x: room.wall + m + rand(rng, -35, 35), y: rand(rng, room.wall + 160, room.h - room.wall - 160) });
    }
    return spots;
  },
  scatter(room, rng, count) {
    const spots = [];
    for (let i = 0; i < count; i++) {
      spots.push({
        x: rand(rng, room.wall + 140, room.w - room.wall - 140),
        y: rand(rng, room.wall + 130, room.h - room.wall - 160),
        rect: rng() < 0.45,
      });
    }
    return spots;
  },
};
