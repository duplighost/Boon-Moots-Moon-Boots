// Room-scoped particles + floats, budgeted (Boon Moots budgets).
import { CAPS, TAU } from '../config.js';
import { view } from './camera.js';
import { clamp } from '../rng.js';
import { state } from '../state.js';

export const budget = () => {
  const base = view.mobile ? CAPS.PARTICLES.mobile : CAPS.PARTICLES.desktop;
  return state.lowFx ? base >> 1 : base;
};

export function particle(room, x, y, color, vx, vy, life = 0.45, r = 3, kind = 'dot') {
  if (!room || room.particles.length > budget()) return;
  room.particles.push({ kind, x, y, vx, vy, life, max: life, r, color });
}

export function burst(room, x, y, color, n, speed = 150, life = 0.4, r = 3) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, s = speed * (0.4 + Math.random() * 0.9);
    particle(room, x, y, color, Math.cos(a) * s, Math.sin(a) * s, life * (0.7 + Math.random() * 0.6), r * (0.6 + Math.random() * 0.9));
  }
}

export function addFloat(room, x, y, text, color, big = false, life = 0.72) {
  if (!room) return;
  room.floats.push({ x, y, text, color, big, life, max: life });
}

export function updateParticles(room, dt) {
  if (!room) return;
  for (let i = room.particles.length - 1; i >= 0; i--) {
    const p = room.particles[i];
    p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx *= Math.pow(0.16, dt); p.vy *= Math.pow(0.16, dt);
    if (p.life <= 0) room.particles.splice(i, 1);
  }
  for (let i = room.floats.length - 1; i >= 0; i--) {
    const f = room.floats[i];
    f.life -= dt; f.y -= 34 * dt;
    if (f.life <= 0) room.floats.splice(i, 1);
  }
  if (room.ambient) for (const a of room.ambient) {
    a.x += a.vx * dt; a.y += a.vy * dt; a.phase += dt;
    if (a.x < -24) a.x = room.w + 12; if (a.x > room.w + 24) a.x = -12;
    if (a.y < -24) a.y = room.h + 12; if (a.y > room.h + 24) a.y = -12;
  }
}

export function drawParticles(ctx, room) {
  for (const p of room.particles) {
    const a = clamp(p.life / p.max, 0, 1);
    if (p.kind === 'ring') { // expanding floor ripple (dash punctuation)
      const rad = p.r + (1 - a) * p.grow;
      ctx.globalAlpha = a * 0.7;
      ctx.strokeStyle = p.color; ctx.lineWidth = 2.5;
      ctx.shadowColor = p.color; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, rad, rad * 0.5, 0, 0, TAU); ctx.stroke();
      continue;
    }
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.1, p.r * a), 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
}

// flat expanding ring on the ground — dash/landing punctuation (concept panel 3 right)
export function ripple(room, x, y, color, maxR = 70, life = 0.45) {
  if (!room || room.particles.length > budget()) return;
  room.particles.push({ kind: 'ring', x, y, vx: 0, vy: 0, life, max: life, r: 8, grow: maxR, color });
}

export function drawFloats(ctx, room) {
  ctx.textAlign = 'center';
  for (const f of room.floats) {
    ctx.globalAlpha = clamp(f.life / 0.5, 0, 1);
    if (f.big) {
      ctx.font = '900 28px Inter, system-ui, sans-serif';
      ctx.shadowColor = f.color; ctx.shadowBlur = 16; ctx.fillStyle = '#fff';
      ctx.fillText(f.text, f.x, f.y);
      ctx.shadowBlur = 0;
    } else {
      ctx.font = '900 18px Inter, system-ui, sans-serif';
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
  }
  ctx.globalAlpha = 1; ctx.textAlign = 'left';
}
