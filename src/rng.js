// Seeded RNG + dealing helpers. All generation pulls from a run's mulberry32
// stream; Math.random is reserved for non-gameplay cosmetics.

export function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function mulberry32(seed) {
  return function () {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
export const norm = (x, y) => { const m = Math.hypot(x, y) || 1; return { x: x / m, y: y / m, m }; };
export const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

export const rand = (rng, a, b) => a + rng() * (b - a);
export const randi = (rng, a, b) => Math.floor(a + rng() * (b - a + 1));
export const chance = (rng, p) => rng() < p;
export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

export function shuffle(rng, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function weightedPick(rng, pool) { // pool: [{item, w}]
  let total = 0;
  for (const p of pool) total += p.w;
  let roll = rng() * total;
  for (const p of pool) { roll -= p.w; if (roll <= 0) return p.item; }
  return pool[pool.length - 1]?.item;
}

// No-repeat dealer: shuffled bag that reshuffles when empty and refuses to deal
// anything in its recent-history window. The core anti-boring device.
export class Bag {
  constructor(items, noRepeat = 1) {
    this.items = items.slice();
    this.noRepeat = Math.min(noRepeat, Math.max(0, items.length - 1));
    this.pile = [];
    this.recent = [];
  }
  deal(rng) {
    if (this.items.length === 0) return undefined;
    if (this.items.length === 1) return this.items[0];
    for (let tries = 0; tries < 40; tries++) {
      if (this.pile.length === 0) this.pile = shuffle(rng, this.items.slice());
      const card = this.pile.pop();
      if (this.recent.includes(card)) continue;
      this.recent.push(card);
      if (this.recent.length > this.noRepeat) this.recent.shift();
      return card;
    }
    return this.items[Math.floor(rng() * this.items.length)];
  }
}
