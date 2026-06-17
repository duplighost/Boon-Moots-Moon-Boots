// Background decoration painters — No Moon's 34-pattern vocabulary
// (docs/no-moon-systems.md §4, game_inline.js:3831-4260). Pure functions; baked
// once per room onto the background canvas. Signature: (ctx, w, h, rng, pal).
import { TAU } from '../config.js';
import { rand, randi } from '../rng.js';

const a = (rng, lo, hi) => lo + rng() * (hi - lo);

// Background pattern counts are absolute; the room canvas nearly doubled, so a
// fixed count thinned out. Scale counts to area (1x at the old size, capped at
// ~2.2x) so floor texture density holds in the bigger arena. Baked once per room.
let AREA = 1;
const REF_AREA = 1.6e6;
const N = (base) => Math.round(base * AREA);

function stroke(ctx, color, alpha, width = 1.5) {
  ctx.strokeStyle = color; ctx.globalAlpha = alpha; ctx.lineWidth = width;
}
function fill(ctx, color, alpha) {
  ctx.fillStyle = color; ctx.globalAlpha = alpha;
}
function wander(ctx, rng, x, y, steps, stepLen, turn) {
  let ang = rng() * TAU;
  ctx.beginPath(); ctx.moveTo(x, y);
  for (let s = 0; s < steps; s++) {
    ang += a(rng, -turn, turn);
    x += Math.cos(ang) * stepLen; y += Math.sin(ang) * stepLen;
    ctx.lineTo(x, y);
  }
  ctx.stroke();
}

export const PATTERNS = {
  gridSoft(ctx, w, h, rng, pal) {
    stroke(ctx, pal.accent, 0.05, 1);
    const gap = a(rng, 118, 150);
    for (let x = gap / 2; x < w; x += gap) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = gap / 2; y < h; y += gap) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    fill(ctx, pal.accent, 0.08);
    for (let i = 0; i < N(50); i++) ctx.fillRect(rng() * w, rng() * h, 2, 2);
  },
  vines(ctx, w, h, rng, pal) {
    stroke(ctx, pal.accent3, 0.16, 1.6);
    for (let i = 0; i < N(60); i++) wander(ctx, rng, rng() * w, rng() * h, randi(rng, 3, 6), a(rng, 16, 38), 0.95);
  },
  plinths(ctx, w, h, rng, pal) {
    for (let i = 0; i < N(24); i++) {
      const x = rng() * w, y = rng() * h, r = a(rng, 8, 22);
      stroke(ctx, pal.accent3, 0.18, 1.4);
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, r * 0.55, 0, TAU); ctx.stroke();
    }
  },
  pools(ctx, w, h, rng, pal) {
    for (let i = 0; i < N(36); i++) {
      const x = rng() * w, y = rng() * h, rx = a(rng, 18, 56);
      fill(ctx, pal.accent, 0.05);
      ctx.beginPath(); ctx.ellipse(x, y, rx, rx * a(rng, 0.4, 0.7), rng() * TAU, 0, TAU); ctx.fill();
    }
  },
  reeds(ctx, w, h, rng, pal) {
    stroke(ctx, pal.accent3, 0.2, 1.3);
    for (let i = 0; i < N(140); i++) {
      const x = rng() * w, y = rng() * h, len = a(rng, 10, 26);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + a(rng, -8, 8), y - len); ctx.stroke();
    }
  },
  mudRings(ctx, w, h, rng, pal) {
    stroke(ctx, '#e8d9b6', 0.07, 1.2);
    for (let i = 0; i < N(56); i++) {
      const x = rng() * w, y = rng() * h, r = a(rng, 8, 26);
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
      if (rng() < 0.5) { ctx.beginPath(); ctx.arc(x, y, r * 0.6, 0, TAU); ctx.stroke(); }
    }
  },
  fogBanks(ctx, w, h, rng, pal) {
    for (let i = 0; i < N(24); i++) {
      fill(ctx, '#d8f8ff', 0.035);
      ctx.beginPath(); ctx.ellipse(rng() * w, rng() * h, a(rng, 70, 180), a(rng, 26, 60), rng() * 0.6, 0, TAU); ctx.fill();
    }
  },
  lilyLights(ctx, w, h, rng, pal) {
    fill(ctx, pal.accent2, 0.22);
    for (let i = 0; i < N(90); i++) { ctx.beginPath(); ctx.arc(rng() * w, rng() * h, a(rng, 1.4, 3.6), 0, TAU); ctx.fill(); }
  },
  glassShards(ctx, w, h, rng, pal) {
    stroke(ctx, pal.accent, 0.14, 1.2);
    for (let i = 0; i < N(62); i++) {
      const x = rng() * w, y = rng() * h, n = randi(rng, 4, 6), r = a(rng, 8, 26);
      ctx.beginPath();
      for (let k = 0; k < n; k++) {
        const ang = (k / n) * TAU + rng() * 0.6;
        const rr = r * a(rng, 0.5, 1);
        k ? ctx.lineTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr) : ctx.moveTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr);
      }
      ctx.closePath(); ctx.stroke();
    }
  },
  reflections(ctx, w, h, rng, pal) {
    stroke(ctx, '#ffffff', 0.10, 1.2);
    for (let i = 0; i < N(100); i++) {
      const x = rng() * w, y = rng() * h, len = a(rng, 8, 42);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len, y); ctx.stroke();
    }
  },
  cracks(ctx, w, h, rng, pal) {
    stroke(ctx, pal.accent3, 0.2, 1.1);
    for (let i = 0; i < N(76); i++) wander(ctx, rng, rng() * w, rng() * h, randi(rng, 3, 5), a(rng, 16, 42), 0.75);
  },
  petals(ctx, w, h, rng, pal) {
    for (let i = 0; i < N(180); i++) {
      fill(ctx, rng() < 0.5 ? pal.accent : pal.accent2, 0.12);
      ctx.beginPath(); ctx.ellipse(rng() * w, rng() * h, a(rng, 2, 5), a(rng, 1.2, 2.8), rng() * TAU, 0, TAU); ctx.fill();
    }
  },
  braids(ctx, w, h, rng, pal) {
    stroke(ctx, pal.accent3, 0.14, 1.3);
    for (let i = 0; i < N(50); i++) {
      const x = rng() * w, y = rng() * h, ang = rng() * TAU, len = a(rng, 30, 70);
      for (const off of [-4, 4]) {
        ctx.beginPath();
        for (let s = 0; s <= 6; s++) {
          const t = s / 6;
          const px = x + Math.cos(ang) * len * t + Math.cos(ang + Math.PI / 2) * (off + Math.sin(t * TAU) * 4);
          const py = y + Math.sin(ang) * len * t + Math.sin(ang + Math.PI / 2) * (off + Math.sin(t * TAU) * 4);
          s ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        ctx.stroke();
      }
    }
  },
  arches(ctx, w, h, rng, pal) {
    stroke(ctx, pal.accent3, 0.18, 1.6);
    for (let i = 0; i < N(20); i++) {
      const x = rng() * w, y = rng() * h, r = a(rng, 18, 54);
      ctx.beginPath(); ctx.arc(x, y, r, Math.PI, TAU); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x - r, y + r * 0.6); ctx.moveTo(x + r, y); ctx.lineTo(x + r, y + r * 0.6); ctx.stroke();
    }
  },
  embers(ctx, w, h, rng, pal) {
    for (let i = 0; i < N(130); i++) {
      fill(ctx, rng() < 0.6 ? pal.accent : pal.accent2, a(rng, 0.06, 0.2));
      ctx.beginPath(); ctx.arc(rng() * w, rng() * h, a(rng, 1.5, 5), 0, TAU); ctx.fill();
    }
  },
  fans(ctx, w, h, rng, pal) {
    stroke(ctx, pal.accent3, 0.15, 1.3);
    for (let i = 0; i < N(28); i++) {
      const x = rng() * w, y = rng() * h, base = rng() * TAU, span = a(rng, 0.5, 1.3);
      for (let k = 1; k <= 3; k++) {
        ctx.beginPath(); ctx.arc(x, y, k * a(rng, 8, 14), base, base + span); ctx.stroke();
      }
    }
  },
  kilnRings(ctx, w, h, rng, pal) {
    stroke(ctx, pal.accent, 0.08, 1.6);
    for (let i = 0; i < N(30); i++) {
      const x = rng() * w, y = rng() * h;
      for (let k = 1; k <= randi(rng, 2, 3); k++) { ctx.beginPath(); ctx.arc(x, y, k * a(rng, 9, 15), 0, TAU); ctx.stroke(); }
    }
  },
  ashWaves(ctx, w, h, rng, pal) {
    stroke(ctx, '#f8d0b5', 0.08, 1.2);
    for (let i = 0; i < N(48); i++) {
      const x = rng() * w, y = rng() * h, len = a(rng, 40, 90), amp = a(rng, 4, 12);
      ctx.beginPath();
      for (let s = 0; s <= 8; s++) {
        const t = s / 8;
        s ? ctx.lineTo(x + len * t, y + Math.sin(t * TAU) * amp) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
  },
  hyphae(ctx, w, h, rng, pal) {
    stroke(ctx, pal.accent3, 0.16, 1.2);
    for (let i = 0; i < N(64); i++) {
      const x = rng() * w, y = rng() * h;
      wander(ctx, rng, x, y, 5, a(rng, 10, 22), 0.7);
      if (rng() < 0.5) wander(ctx, rng, x, y, 3, a(rng, 8, 16), 0.9);
    }
  },
  caps(ctx, w, h, rng, pal) {
    for (let i = 0; i < N(56); i++) {
      const x = rng() * w, y = rng() * h, r = a(rng, 4, 12);
      fill(ctx, pal.accent, 0.13);
      ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.55, 0, Math.PI, TAU); ctx.fill();
      stroke(ctx, pal.accent3, 0.18, 1.2);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + r * 0.9); ctx.stroke();
    }
  },
  sporeRings(ctx, w, h, rng, pal) {
    stroke(ctx, pal.accent2, 0.1, 1);
    for (let i = 0; i < N(70); i++) {
      const x = rng() * w, y = rng() * h, r = a(rng, 6, 18);
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
      if (rng() < 0.4) { ctx.beginPath(); ctx.arc(x, y, r * 0.5, 0, TAU); ctx.stroke(); }
    }
  },
  glowDots(ctx, w, h, rng, pal) {
    for (let i = 0; i < N(130); i++) {
      fill(ctx, rng() < 0.5 ? pal.accent : pal.accent2, a(rng, 0.1, 0.3));
      ctx.beginPath(); ctx.arc(rng() * w, rng() * h, a(rng, 1.2, 5.2), 0, TAU); ctx.fill();
    }
  },
  hexes(ctx, w, h, rng, pal) {
    stroke(ctx, pal.accent, 0.10, 1.2);
    for (let i = 0; i < N(50); i++) {
      const x = rng() * w, y = rng() * h, r = a(rng, 8, 22), rot = rng() * TAU;
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const ang = rot + (k / 6) * TAU;
        k ? ctx.lineTo(x + Math.cos(ang) * r, y + Math.sin(ang) * r) : ctx.moveTo(x + Math.cos(ang) * r, y + Math.sin(ang) * r);
      }
      ctx.closePath(); ctx.stroke();
    }
  },
  circuits(ctx, w, h, rng, pal) {
    stroke(ctx, pal.accent, 0.12, 1.2);
    fill(ctx, pal.accent, 0.2);
    for (let i = 0; i < N(60); i++) {
      let x = rng() * w, y = rng() * h;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let s = 0; s < randi(rng, 2, 4); s++) {
        if (rng() < 0.5) x += a(rng, -50, 50); else y += a(rng, -50, 50);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, 2.2, 0, TAU); ctx.fill();
    }
  },
  roots(ctx, w, h, rng, pal) {
    for (let i = 0; i < N(38); i++) {
      stroke(ctx, pal.accent3, 0.2, a(rng, 2, 3.4));
      wander(ctx, rng, rng() * w, rng() * h, 4, a(rng, 18, 34), 0.6);
      stroke(ctx, pal.accent3, 0.14, 1.1);
      wander(ctx, rng, rng() * w, rng() * h, 4, a(rng, 12, 24), 0.8);
    }
  },
  monoliths(ctx, w, h, rng, pal) {
    for (let i = 0; i < N(24); i++) {
      const x = rng() * w, y = rng() * h, ww = a(rng, 18, 42), hh = a(rng, 32, 76);
      fill(ctx, pal.accent3, 0.13);
      ctx.fillRect(x, y, ww, hh);
      stroke(ctx, pal.accent3, 0.22, 1.2);
      ctx.strokeRect(x, y, ww, hh);
    }
  },
  rings(ctx, w, h, rng, pal) {
    stroke(ctx, pal.accent, 0.08, 1.4);
    for (let i = 0; i < N(34); i++) {
      ctx.beginPath(); ctx.arc(rng() * w, rng() * h, a(rng, 10, 36), 0, TAU); ctx.stroke();
    }
  },
  orbits(ctx, w, h, rng, pal) {
    stroke(ctx, pal.accent, 0.12, 1.2);
    fill(ctx, pal.accent2, 0.3);
    for (let i = 0; i < N(26); i++) {
      const x = rng() * w, y = rng() * h, r = a(rng, 18, 54), s = rng() * TAU, e = s + a(rng, 1.2, 4.4);
      ctx.beginPath(); ctx.arc(x, y, r, s, e); ctx.stroke();
      ctx.beginPath(); ctx.arc(x + Math.cos(e) * r, y + Math.sin(e) * r, 2.4, 0, TAU); ctx.fill();
    }
  },
  stacks(ctx, w, h, rng, pal) {
    for (let i = 0; i < N(32); i++) {
      const x = rng() * w, y = rng() * h, ww = a(rng, 20, 58);
      for (let k = 0; k < randi(rng, 2, 3); k++) {
        fill(ctx, pal.accent3, 0.14);
        const hh = a(rng, 8, 16);
        ctx.fillRect(x + a(rng, -4, 4), y - k * (hh + 2), ww * a(rng, 0.7, 1), hh);
      }
    }
  },
  glyphs(ctx, w, h, rng, pal) {
    stroke(ctx, pal.accent2, 0.16, 1.2);
    for (let i = 0; i < N(90); i++) {
      const x = rng() * w, y = rng() * h, s = a(rng, 3, 8);
      ctx.beginPath();
      if (rng() < 0.5) { ctx.moveTo(x - s, y); ctx.lineTo(x + s, y); ctx.moveTo(x, y - s); ctx.lineTo(x, y + s); }
      else { ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y + s); ctx.moveTo(x + s, y - s); ctx.lineTo(x - s, y + s); }
      ctx.stroke();
    }
  },
  bones(ctx, w, h, rng, pal) {
    stroke(ctx, pal.accent2, 0.11, 1.6);
    fill(ctx, pal.accent2, 0.16);
    for (let i = 0; i < N(28); i++) {
      const x = rng() * w, y = rng() * h, ang = rng() * TAU, len = a(rng, 14, 34);
      const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
      ctx.beginPath(); ctx.moveTo(x, y);
      ctx.quadraticCurveTo((x + x2) / 2 + a(rng, -6, 6), (y + y2) / 2 + a(rng, -6, 6), x2, y2); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, 2.2, 0, TAU); ctx.arc(x2, y2, 2.2, 0, TAU); ctx.fill();
    }
  },
  halos(ctx, w, h, rng, pal) {
    stroke(ctx, pal.accent, 0.06, 2);
    for (let i = 0; i < N(20); i++) {
      ctx.beginPath(); ctx.arc(rng() * w, rng() * h, a(rng, 30, 90), 0, TAU); ctx.stroke();
    }
  },
  stars(ctx, w, h, rng, pal) {
    fill(ctx, '#ffffff', 0.16);
    for (let i = 0; i < N(130); i++) {
      const x = rng() * w, y = rng() * h, r = a(rng, 1, 2.6);
      ctx.beginPath();
      for (let k = 0; k < 8; k++) {
        const ang = (k / 8) * TAU, rr = k % 2 ? r : r * 2.2;
        k ? ctx.lineTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr) : ctx.moveTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr);
      }
      ctx.closePath(); ctx.fill();
    }
  },
};

export function paintPattern(name, ctx, w, h, rng, pal) {
  const fn = PATTERNS[name];
  if (!fn) return;
  AREA = Math.min(2.2, Math.max(1, (w * h) / REF_AREA));
  ctx.save();
  fn(ctx, w, h, rng, pal);
  ctx.restore();
  ctx.globalAlpha = 1;
}

// ── Per-biome signature emblem ────────────────────────────────────────────────
// One large, faint "hero" motif baked into the floor centre so each biome reads as
// itself — consistent within a biome, distinct across them. Mapped by family; the
// biome's own palette differentiates members of a family. Kept low-alpha so it never
// competes with enemies/bullets (the player is colourblind — signals stay shape-first).
const SIGNATURE_OF = {
  verdigris: 'bloom', blacksungarden: 'bloom',
  fen: 'tide',
  mirror: 'fracture', shardreef: 'fracture', frostreliquary: 'fracture',
  rosewire: 'thorn', umbraharvest: 'thorn', ossuary: 'thorn',
  ember: 'forge', forge: 'forge', solarium: 'forge',
  mycelium: 'spore',
  coilroot: 'conduit', stormloom: 'conduit', crownworks: 'conduit',
  archive: 'astral', noctlith: 'astral',
  basilica: 'rite', auricspire: 'rite', empyrean: 'rite', nullthrone: 'rite',
};

export function paintSignature(biome, ctx, w, h, rng, pal) {
  const fn = EMBLEMS[SIGNATURE_OF[biome.id] || 'astral'];
  if (!fn) return;
  ctx.save();
  ctx.translate(w / 2, h * 0.44);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  fn(ctx, Math.min(w, h) * 0.22, rng, pal);
  ctx.restore();
  ctx.globalAlpha = 1;
}

function emblemStar(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const an = (i / 10) * TAU - Math.PI / 2, rr = i % 2 ? r * 0.45 : r; i ? ctx.lineTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr) : ctx.moveTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr); }
  ctx.closePath(); ctx.fill();
}
function polyRing(ctx, R, n, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i <= n; i++) { const an = (i / n) * TAU + rot; i ? ctx.lineTo(Math.cos(an) * R, Math.sin(an) * R) : ctx.moveTo(Math.cos(an) * R, Math.sin(an) * R); }
  ctx.closePath();
}

const EMBLEMS = {
  bloom(ctx, R, rng, pal) {                 // botanical: radial petals between two rings
    const petals = 8 + Math.floor(rng() * 4);
    ctx.strokeStyle = pal.accent; ctx.globalAlpha = 0.13; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, R * 0.92, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, R * 0.5, 0, TAU); ctx.stroke();
    ctx.strokeStyle = pal.accent3; ctx.globalAlpha = 0.18; ctx.lineWidth = 2.4;
    for (let i = 0; i < petals; i++) {
      ctx.save(); ctx.rotate((i / petals) * TAU);
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(R * 0.28, -R * 0.5, 0, -R);
      ctx.quadraticCurveTo(-R * 0.28, -R * 0.5, 0, 0); ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = pal.accent2; ctx.globalAlpha = 0.1; ctx.beginPath(); ctx.arc(0, 0, R * 0.16, 0, TAU); ctx.fill();
  },
  tide(ctx, R, rng, pal) {                  // concentric ripple rings + lily nodes
    ctx.strokeStyle = pal.accent; ctx.lineWidth = 2.2;
    for (let i = 1; i <= 5; i++) { ctx.globalAlpha = 0.14 - i * 0.013; ctx.beginPath(); ctx.arc(0, 0, R * (i / 5), 0, TAU); ctx.stroke(); }
    ctx.fillStyle = pal.accent2; ctx.globalAlpha = 0.12;
    for (let i = 0; i < 6; i++) { const an = (i / 6) * TAU + rng() * 0.3, rr = R * (0.45 + rng() * 0.5); ctx.beginPath(); ctx.ellipse(Math.cos(an) * rr, Math.sin(an) * rr, 11, 6, an, 0, TAU); ctx.fill(); }
  },
  fracture(ctx, R, rng, pal) {              // shattered radial star + crack zigzags
    const spikes = 6 + Math.floor(rng() * 3);
    ctx.strokeStyle = pal.accent; ctx.globalAlpha = 0.16; ctx.lineWidth = 2;
    for (let i = 0; i < spikes; i++) {
      const an = (i / spikes) * TAU + rng() * 0.1;
      const mx = Math.cos(an) * R * 0.5, my = Math.sin(an) * R * 0.5;
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.lineTo(mx + Math.cos(an + 0.4) * R * 0.2, my + Math.sin(an + 0.4) * R * 0.2);
      ctx.lineTo(Math.cos(an) * R, Math.sin(an) * R); ctx.stroke();
    }
    ctx.strokeStyle = pal.accent2; ctx.globalAlpha = 0.12;
    ctx.beginPath();
    for (let i = 0; i <= spikes; i++) { const an = (i / spikes) * TAU, rr = i % 2 ? R * 0.55 : R; i ? ctx.lineTo(Math.cos(an) * rr, Math.sin(an) * rr) : ctx.moveTo(Math.cos(an) * rr, Math.sin(an) * rr); }
    ctx.closePath(); ctx.stroke();
  },
  thorn(ctx, R, rng, pal) {                 // a barbed wreath between two rings
    ctx.strokeStyle = pal.accent; ctx.globalAlpha = 0.12; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke();
    ctx.strokeStyle = pal.accent3; ctx.globalAlpha = 0.17; ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.arc(0, 0, R * 0.7, 0, TAU); ctx.stroke();
    ctx.strokeStyle = pal.accent; ctx.globalAlpha = 0.15; ctx.lineWidth = 1.8;
    for (let i = 0; i < 16; i++) {
      const an = (i / 16) * TAU, dir = i % 2 ? 1 : -1;
      const bx = Math.cos(an) * R * 0.7, by = Math.sin(an) * R * 0.7;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + Math.cos(an + dir * 0.5) * R * 0.3, by + Math.sin(an + dir * 0.5) * R * 0.3); ctx.stroke();
    }
    ctx.fillStyle = pal.accent2; ctx.globalAlpha = 0.1; ctx.beginPath(); ctx.arc(0, 0, R * 0.15, 0, TAU); ctx.fill();
  },
  forge(ctx, R, rng, pal) {                 // a cracked sun: radial rays + kiln rings
    ctx.strokeStyle = pal.accent2; ctx.lineWidth = 2;
    for (let i = 1; i <= 3; i++) { ctx.globalAlpha = 0.11; ctx.beginPath(); ctx.arc(0, 0, R * (0.4 + i * 0.2), 0, TAU); ctx.stroke(); }
    ctx.strokeStyle = pal.accent; ctx.globalAlpha = 0.16; ctx.lineWidth = 2.4;
    for (let i = 0; i < 12; i++) { const an = (i / 12) * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(an) * R * 0.2, Math.sin(an) * R * 0.2); ctx.lineTo(Math.cos(an) * R, Math.sin(an) * R); ctx.stroke(); }
    ctx.fillStyle = pal.accent2; ctx.globalAlpha = 0.14; ctx.beginPath(); ctx.arc(0, 0, R * 0.18, 0, TAU); ctx.fill();
  },
  spore(ctx, R, rng, pal) {                 // mandala of spore-rings + dotted halos
    for (let ring = 1; ring <= 3; ring++) {
      const rr = R * (ring / 3), dots = 6 * ring;
      ctx.strokeStyle = pal.accent; ctx.globalAlpha = 0.13; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU); ctx.stroke();
      ctx.fillStyle = pal.accent2; ctx.globalAlpha = 0.12;
      for (let i = 0; i < dots; i++) { const an = (i / dots) * TAU; ctx.beginPath(); ctx.arc(Math.cos(an) * rr, Math.sin(an) * rr, 3, 0, TAU); ctx.fill(); }
    }
  },
  conduit(ctx, R, rng, pal) {               // circuit mandala: hexes + traces + nodes
    ctx.strokeStyle = pal.accent; ctx.globalAlpha = 0.14; ctx.lineWidth = 2;
    polyRing(ctx, R, 6, -Math.PI / 2); ctx.stroke();
    polyRing(ctx, R * 0.5, 6, -Math.PI / 2); ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const an = (i / 6) * TAU - Math.PI / 2;
      ctx.strokeStyle = pal.accent3; ctx.globalAlpha = 0.16; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(an) * R, Math.sin(an) * R); ctx.stroke();
      ctx.fillStyle = pal.accent2; ctx.globalAlpha = 0.15; ctx.beginPath(); ctx.arc(Math.cos(an) * R, Math.sin(an) * R, 4, 0, TAU); ctx.fill();
    }
  },
  astral(ctx, R, rng, pal) {                // constellation: orbital ellipses + stars
    ctx.strokeStyle = pal.accent3; ctx.globalAlpha = 0.14; ctx.lineWidth = 1.8;
    for (let i = 0; i < 3; i++) { ctx.save(); ctx.rotate((i / 3) * Math.PI); ctx.beginPath(); ctx.ellipse(0, 0, R, R * 0.42, 0, 0, TAU); ctx.stroke(); ctx.restore(); }
    ctx.fillStyle = pal.accent2; ctx.globalAlpha = 0.16;
    for (let i = 0; i < 10; i++) { const an = rng() * TAU, rr = R * (0.2 + rng() * 0.8); emblemStar(ctx, Math.cos(an) * rr, Math.sin(an) * rr, 3 + rng() * 2); }
    ctx.fillStyle = pal.accent; ctx.globalAlpha = 0.2; emblemStar(ctx, 0, 0, 6);
  },
  rite(ctx, R, rng, pal) {                  // rose window: petaled mandala + arches
    ctx.strokeStyle = pal.accent; ctx.globalAlpha = 0.15; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, R * 0.5, 0, TAU); ctx.stroke();
    ctx.strokeStyle = pal.accent2; ctx.globalAlpha = 0.13; ctx.lineWidth = 1.8;
    for (let i = 0; i < 8; i++) {
      ctx.save(); ctx.rotate((i / 8) * TAU);
      ctx.beginPath(); ctx.moveTo(0, -R * 0.5);
      ctx.quadraticCurveTo(R * 0.16, -R * 0.75, 0, -R);
      ctx.quadraticCurveTo(-R * 0.16, -R * 0.75, 0, -R * 0.5); ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = pal.accent3; ctx.globalAlpha = 0.12; ctx.beginPath(); ctx.arc(0, 0, R * 0.16, 0, TAU); ctx.fill();
  },
};
