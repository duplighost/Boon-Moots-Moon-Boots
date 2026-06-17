// Frame composition — fixed order (architecture.md §2): baked bg → hazards →
// telegraphs → portal → pickups → y-sorted entities → bullets → particles →
// floats → bloom → screen overlay → danger triangles → flash → transition.
import { TAU, BLOOM } from '../config.js';
import { state } from '../state.js';
import { clamp } from '../rng.js';
import { view, cam, applyWorldTransform, uiTransform } from './camera.js';
import { drawPlayer, drawEnemy, drawObstacle, drawCare, roundRectPath, starPath, heartPath, bossCards, mix as mixHex } from './sprites.js';

const TIER_LIFT = 34; // px a platform (level 1) rises; entities on it lift to match
import { drawParticles, drawFloats } from './particles.js';
import { ENEMY_TYPES } from '../data/enemies.js';
import { itemById } from '../data/items.js';
import { reduced } from '../systems/juice.js';
import { moveTouch, aimTouch } from '../ui/input.js';

let canvas = null, ctx = null, bloomCanvas = null, bloomCtx = null;

export function initDraw(c, bc) {
  canvas = c;
  ctx = c.getContext('2d', { alpha: false, desynchronized: true });
  bloomCanvas = bc;
  bloomCtx = bc.getContext('2d');
  return ctx;
}

export function drawFrame() {
  if (!ctx) return;
  uiTransform(ctx);
  // render-state hygiene: never let a leaked alpha/filter/blend from a prior
  // frame darken the next one (defensive — fixes the rare "screen went dark").
  ctx.globalAlpha = 1; ctx.filter = 'none'; ctx.globalCompositeOperation = 'source-over'; ctx.shadowBlur = 0;
  ctx.fillStyle = '#05070b';
  ctx.fillRect(0, 0, view.W, view.H);

  const room = state.room;
  if (!room) { drawTitleBg(); return; }
  const p = state.run?.player;
  const pal = room.biome.pal;

  applyWorldTransform(ctx);

  // baked background
  if (room.background) ctx.drawImage(room.background, 0, 0, room.w, room.h); // baked at backgroundScale, drawn full-size
  else { ctx.fillStyle = pal.floor; ctx.fillRect(0, 0, room.w, room.h); }
  drawFloorMotion(room, pal);    // the living, moving floor — biome-specific currents
  drawFlowLanes(room, pal, p);   // animated neon boost boulevards over the baked floor

  // wall frame
  ctx.strokeStyle = pal.accent3; ctx.globalAlpha = 0.85; ctx.lineWidth = 5;
  roundRectPath(ctx, room.wall - 20, room.wall - 20, room.w - room.wall * 2 + 40, room.h - room.wall * 2 + 40, 26);
  ctx.stroke();
  ctx.globalAlpha = 0.25; ctx.strokeStyle = pal.accent; ctx.lineWidth = 12;
  roundRectPath(ctx, room.wall - 28, room.wall - 28, room.w - room.wall * 2 + 56, room.h - room.wall * 2 + 56, 30);
  ctx.stroke();
  ctx.globalAlpha = 1;

  drawEdgeRail(room, pal, p);
  drawTiers(room, pal);
  drawSkyRails(room, pal, p);
  drawAnnexSeals(room, pal);
  drawSetpieces(room, pal);
  drawVents(room, pal, p);
  drawHazardsUnder(room, pal);
  drawBossArena(room, pal);      // boss arena hooks: warden grave-slams + spiggot spore blooms
  drawMines(room);
  drawSpawnGlyphs(room);
  if (room.portal) drawPortal(room, pal);
  drawShop(room, pal, p);
  if (room.care) for (const c of room.care) drawCare(ctx, c, pal);
  drawPickups(room, pal);

  // y-sorted entities; raised (level>0) things sort above ground and lift visually
  const LIFT = TIER_LIFT;
  const renderables = [];
  const ov = visibleRect(140);
  for (const o of room.obstacles) if (!o.gone) {
    // viewport-cull cover: giant rooms only render the obstacles actually on screen
    const bx0 = o.type === 'circle' ? o.x - o.rad : o.x, by0 = o.type === 'circle' ? o.y - o.rad : o.y;
    const bx1 = o.type === 'circle' ? o.x + o.rad : o.x + o.w, by1 = o.type === 'circle' ? o.y + o.rad : o.y + o.h;
    if (bx1 < ov.l || bx0 > ov.r || by1 < ov.t || by0 > ov.b) continue;
    const lv = o.level || (o.ledge ? 1 : 0);
    renderables.push({ y: o.type === 'circle' ? o.y + o.rad : o.y + o.h, lv, lift: (o.level || 0) * LIFT, draw: () => drawObstacle(ctx, o, room) });
  }
  for (const e of room.enemies) renderables.push({ y: e.y + e.r, lv: e.level || 0, lift: (e.level || 0) * LIFT, draw: () => drawEnemy(ctx, e, room) });
  if (p && !p.dead) renderables.push({ y: p.y + p.r + 6, lv: p.level || 0, lift: (p.level || 0) * LIFT + (p.airZ || 0), draw: () => drawPlayer(ctx, p, room) });
  renderables.sort((a, b) => (a.lv - b.lv) || (a.y - b.y));
  for (const r of renderables) {
    if (r.lift) { ctx.save(); ctx.translate(0, -r.lift); r.draw(); ctx.restore(); }
    else r.draw();
  }

  drawAnnexCurtain(room, pal); // top veil hides any accidental pre-open contents
  drawLanesOver(room);
  drawBullets(room);
  drawParticles(ctx, room);
  drawFloats(ctx, room);

  // bloom composite (No Moon recipe: half-res, screen blend)
  if (!reduced() && !state.lowFx && bloomCanvas) {
    bloomCtx.setTransform(1, 0, 0, 1, 0, 0);
    bloomCtx.clearRect(0, 0, bloomCanvas.width, bloomCanvas.height);
    bloomCtx.drawImage(canvas, 0, 0, bloomCanvas.width, bloomCanvas.height);
    uiTransform(ctx);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = BLOOM.ALPHA;
    ctx.filter = BLOOM.FILTER;
    ctx.drawImage(bloomCanvas, 0, 0, view.W, view.H);
    ctx.restore();
  }

  // screen overlay: biome tint, vignette, frame, danger triangles, flash
  uiTransform(ctx);
  const tint = ctx.createRadialGradient(view.W / 2, view.H * 0.46, Math.min(view.W, view.H) * 0.2, view.W / 2, view.H / 2, Math.max(view.W, view.H) * 0.7);
  tint.addColorStop(0, hexA(pal.accent, 0.04));
  tint.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, view.W, view.H);

  const vg = ctx.createRadialGradient(view.W / 2, view.H * 0.48, Math.min(view.W, view.H) * 0.22, view.W / 2, view.H / 2, Math.max(view.W, view.H) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.38)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, view.W, view.H);

  // combo "on fire" edge-glow — ambient heat that builds + shifts colour with your
  // score multiplier (the screen itself starts burning as you chain kills).
  const combo = state.run?.combo || 1;
  if (combo > 2.2 && !reduced()) {
    const k = Math.min(1, (combo - 2.2) / 8);
    const pulse = 0.7 + 0.3 * Math.sin(performance.now() / 1000 * 6);
    const col = combo > 9 ? '255,255,255' : combo > 5 ? '255,150,240' : '255,210,120';
    const cg = ctx.createRadialGradient(view.W / 2, view.H / 2, Math.min(view.W, view.H) * 0.34, view.W / 2, view.H / 2, Math.max(view.W, view.H) * 0.7);
    cg.addColorStop(0, 'rgba(0,0,0,0)');
    cg.addColorStop(1, `rgba(${col},${((0.06 + k * 0.17) * pulse).toFixed(3)})`);
    ctx.fillStyle = cg;
    ctx.fillRect(0, 0, view.W, view.H);
  }

  drawEclipse(room); // False Moon's eclipse darkens the field around the moon
  if (state.mode === 'play') drawSpeedStreaks(p); // anime speed-lines at dash/flow velocity
  if (p && state.mode === 'play' && state.run?.oath !== 'blind') drawDangerTriangles(room, p);
  if (room.portal) drawPortalArrow(room);
  drawBossBar(room);
  drawBossIntro(room);
  if (state.mode === 'play') { drawPad(moveTouch, '#7dfdff'); drawPad(aimTouch, '#ffd36e'); }

  if (state.fx.flash > 0) {
    ctx.fillStyle = `rgba(255,235,245,${clamp(state.fx.flash * 0.5, 0, 0.5)})`;
    ctx.fillRect(0, 0, view.W, view.H);
  }

  if (state.transition) drawTransition();
}

// ── hazards ─────────────────────────────────────────────────────────────────
// raised platforms drawn as an extruded block so the HEIGHT actually reads: a
// dark cliff face you can see, a biome-tinted walkable top, and real stepped
// stairs at the ramp. LIFT must match TIER_LIFT in the entity sort below.
function drawTiers(room, pal) {
  if (!room.tiers) return;
  for (const t of room.tiers) {
    const L = TIER_LIFT;
    const topY = t.y - L;                 // screen Y of the walkable top surface
    ctx.save();
    // ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    roundRectPath(ctx, t.x + 8, t.y + t.h - 6, t.w, 22, 12); ctx.fill();

    // the solid block body (top → ground): its bottom band is the visible cliff
    const body = ctx.createLinearGradient(0, topY, 0, t.y + t.h);
    body.addColorStop(0, mixHex(pal.floor, '#000000', 0.45));
    body.addColorStop(1, mixHex(pal.bg, '#000000', 0.3));
    ctx.fillStyle = body;
    roundRectPath(ctx, t.x, topY, t.w, t.h + L, 10); ctx.fill();
    // cliff striations (vertical) on the front band
    ctx.strokeStyle = hexA(pal.bg, 0.6); ctx.lineWidth = 1.5;
    for (let sx = t.x + 14; sx < t.x + t.w - 8; sx += 22) {
      ctx.beginPath(); ctx.moveTo(sx, topY + t.h * 0.6); ctx.lineTo(sx, t.y + t.h - 4); ctx.stroke();
    }

    // walkable top surface (biome-tinted, lighter)
    const top = ctx.createLinearGradient(0, topY, 0, topY + t.h);
    top.addColorStop(0, mixHex(pal.floor, pal.accent, 0.22));
    top.addColorStop(1, mixHex(pal.floor, '#ffffff', 0.04));
    ctx.fillStyle = top;
    roundRectPath(ctx, t.x, topY, t.w, t.h, 10); ctx.fill();
    // a few biome accent motes so the surface matches the room (deterministic)
    ctx.fillStyle = hexA(pal.accent2, 0.5);
    for (let i = 0; i < 6; i++) {
      const mx = t.x + 18 + ((i * 97) % Math.max(1, t.w - 36));
      const my = topY + 14 + ((i * 61) % Math.max(1, t.h - 24));
      ctx.beginPath(); ctx.arc(mx, my, 2, 0, TAU); ctx.fill();
    }
    // lit top rim + base shade line where cliff meets top
    ctx.strokeStyle = hexA(pal.accent2, 0.7); ctx.lineWidth = 2;
    roundRectPath(ctx, t.x, topY, t.w, t.h, 10); ctx.stroke();

    // real stairs at the ramp gap: stacked steps climbing from ground to top
    if (t.ramp) {
      const sw = Math.min(t.ramp.w || 150, t.w * 0.55);
      const steps = 4, sh = L / steps;
      for (let i = 0; i < steps; i++) {
        const stepY = (t.y + t.h) - (i + 1) * sh;
        const inset = (steps - 1 - i) * 3;
        ctx.fillStyle = mixHex(pal.floor, pal.accent, 0.1 + i * 0.05);
        roundRectPath(ctx, t.ramp.x - sw / 2 + inset, stepY, sw - inset * 2, sh + 2, 2); ctx.fill();
        ctx.strokeStyle = hexA(pal.accent2, 0.55); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(t.ramp.x - sw / 2 + inset, stepY); ctx.lineTo(t.ramp.x + sw / 2 - inset, stepY); ctx.stroke();
      }
    }
    ctx.restore();
  }
}

function drawEdgeRail(room, pal, p) {
  if (!room.edgeRail) return;
  const inset = room.wall + 2;
  const t = room.time || performance.now() / 1000;
  const active = !!p?.rail?.active;
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = active ? 0.32 : 0.14;
  ctx.strokeStyle = active ? '#ffffff' : pal.accent2;
  ctx.lineWidth = active ? 12 : 7;
  roundRectPath(ctx, inset, inset, room.w - inset * 2, room.h - inset * 2, 28); ctx.stroke();
  ctx.globalAlpha = active ? 0.85 : 0.38;
  ctx.lineWidth = active ? 3.8 : 2.2;
  ctx.setLineDash([28, 22]);
  ctx.lineDashOffset = -t * (active ? 360 : 130) - (room.edgeRail.phase || 0) * 40;
  roundRectPath(ctx, inset, inset, room.w - inset * 2, room.h - inset * 2, 28); ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function drawSkyRails(room, pal, p) {
  const rails = room.skyRails || [];
  if (!rails.length) return;
  const t = room.time || performance.now() / 1000;
  const activeRail = p?.rail?.active && p.rail.kind === 'sky' ? p.rail.rail : null;
  ctx.save();
  ctx.translate(0, -TIER_LIFT); // these are second-layer rails; floor-level dashes ignore them
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.globalCompositeOperation = 'lighter';
  for (const r of rails) {
    const active = activeRail === r;
    const col = r.color || pal.accent2;
    ctx.globalAlpha = active ? 0.42 : 0.18;
    ctx.strokeStyle = active ? '#ffffff' : col;
    ctx.lineWidth = active ? (r.trunk ? 19 : 16) : (r.trunk ? 13 : 10);
    ctx.beginPath(); ctx.moveTo(r.x1, r.y1); ctx.lineTo(r.x2, r.y2); ctx.stroke();
    ctx.globalAlpha = active ? 0.92 : 0.46;
    ctx.lineWidth = active ? (r.trunk ? 5.2 : 4.2) : (r.trunk ? 3.0 : 2.4);
    ctx.setLineDash([24, 18]);
    ctx.lineDashOffset = -t * (active ? 420 : 160) - (r.phase || 0) * 30;
    ctx.beginPath(); ctx.moveTo(r.x1, r.y1); ctx.lineTo(r.x2, r.y2); ctx.stroke();
    ctx.setLineDash([]);
    // end caps: readable latch points without floor text
    ctx.globalAlpha = active ? 0.90 : 0.40;
    ctx.fillStyle = hexA(col, active ? 0.42 : 0.22);
    ctx.strokeStyle = active ? '#ffffff' : col;
    for (const [x, y] of [[r.x1, r.y1], [r.x2, r.y2]]) {
      ctx.beginPath(); ctx.arc(x, y, active ? 13 : 10, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, 4, 0, TAU); ctx.fill();
    }
  }
  ctx.restore();
}

function drawAnnexSeals(room, pal) {
  const a = room.annex;
  if (!a || a.opened) return;
  const r = a.rect, t = room.time || performance.now() / 1000;
  ctx.save();
  ctx.fillStyle = 'rgba(2,4,10,0.84)';
  ctx.strokeStyle = hexA(pal.accent2, 0.78); ctx.lineWidth = 2.5;
  roundRectPath(ctx, r.x - 10, r.y - 10, r.w + 20, r.h + 20, 16); ctx.fill(); ctx.stroke();
  ctx.globalAlpha = 0.28 + Math.sin(t * 3 + a.cx * 0.01) * 0.08;
  ctx.strokeStyle = pal.accent3; ctx.lineWidth = 1.5; ctx.setLineDash([12, 10]);
  for (let y = r.y + 18; y < r.y + r.h - 10; y += 32) {
    ctx.beginPath(); ctx.moveTo(r.x + 16, y); ctx.lineTo(r.x + r.w - 16, y + Math.sin(t + y) * 5); ctx.stroke();
  }
  ctx.setLineDash([]);
  // visual lock/sigil instead of ground text
  ctx.globalAlpha = 0.72; ctx.strokeStyle = '#fff7ff'; ctx.lineWidth = 3;
  const cx = a.cx, cy = a.cy, w = 34, h = 26;
  ctx.beginPath(); ctx.arc(cx, cy - 10, 16, Math.PI, 0); ctx.stroke();
  roundRectPath(ctx, cx - w / 2, cy - 8, w, h, 5); ctx.stroke();
  ctx.globalAlpha = 0.52 + Math.sin(t * 4) * 0.10;
  ctx.beginPath(); ctx.moveTo(cx, cy + 1); ctx.lineTo(cx, cy + 10); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy - 1, 3.5, 0, TAU); ctx.stroke();
  ctx.restore();
}


function drawAnnexCurtain(room, pal) {
  const a = room.annex;
  if (!a || a.opened) return;
  const r = a.rect, t = room.time || performance.now() / 1000;
  ctx.save();
  // A second, top-side occlusion pass: the sealed annex stays a real surprise even
  // if a stray enemy/pickup/telegraph would otherwise draw over the lower seal.
  roundRectPath(ctx, r.x + 8, r.y + 8, r.w - 16, r.h - 16, 14);
  ctx.clip();
  const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
  g.addColorStop(0, 'rgba(1,4,11,0.96)');
  g.addColorStop(0.55, 'rgba(5,8,20,0.91)');
  g.addColorStop(1, 'rgba(0,0,0,0.96)');
  ctx.fillStyle = g;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = hexA(pal.accent2, 0.30); ctx.lineWidth = 1.2;
  const gap = 30;
  for (let x = r.x - r.h; x < r.x + r.w + r.h; x += gap) {
    ctx.globalAlpha = 0.24 + Math.sin(t * 2.2 + x * 0.017) * 0.06;
    ctx.beginPath();
    ctx.moveTo(x, r.y + r.h + 18);
    ctx.lineTo(x + r.h * 0.72, r.y - 18);
    ctx.stroke();
  }
  ctx.strokeStyle = hexA(pal.accent3, 0.34); ctx.lineWidth = 2.2;
  ctx.setLineDash([18, 16]); ctx.lineDashOffset = -t * 80;
  for (let y = r.y + 24; y < r.y + r.h; y += 46) {
    ctx.globalAlpha = 0.30;
    ctx.beginPath();
    ctx.moveTo(r.x + 18, y + Math.sin(t * 1.6 + y) * 5);
    ctx.lineTo(r.x + r.w - 18, y + Math.cos(t * 1.4 + y) * 5);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.restore();

  // Re-draw the lock above the veil so the chamber reads as intentional architecture,
  // not a black rectangle. The door itself remains smashable at the edge.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = hexA(pal.accent2, 0.72); ctx.lineWidth = 2.3;
  roundRectPath(ctx, r.x - 10, r.y - 10, r.w + 20, r.h + 20, 16); ctx.stroke();
  const cx = a.cx, cy = a.cy;
  ctx.globalAlpha = 0.74 + Math.sin(t * 4) * 0.12;
  ctx.strokeStyle = '#fff7ff'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(cx, cy - 10, 16, Math.PI, 0); ctx.stroke();
  roundRectPath(ctx, cx - 17, cy - 8, 34, 26, 5); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy + 1); ctx.lineTo(cx, cy + 10); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy - 1, 3.5, 0, TAU); ctx.stroke();
  ctx.globalAlpha = 0.36;
  ctx.beginPath(); ctx.arc(cx, cy, 48 + Math.sin(t * 3) * 4, 0, TAU); ctx.stroke();
  ctx.restore();
}

function drawSetpieces(room, pal) {
  const t = room.time || performance.now() / 1000;
  for (const s of room.setpieces || []) {
    const lift = (s.level || 0) * TIER_LIFT;
    ctx.save();
    ctx.translate(s.x, s.y - lift);
    const col = s.color || pal.accent2;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.70;
    ctx.strokeStyle = col; ctx.fillStyle = hexA(col, 0.16); ctx.lineWidth = 2.2;
    const pulse = 1 + Math.sin(t * 2 + s.phase) * 0.08;
    if (s.kind === 'holoTower' || s.kind === 'liftBeacon') {
      ctx.beginPath(); ctx.ellipse(0, 18, s.r * 0.78, s.r * 0.22, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-s.r * 0.42, 14); ctx.lineTo(0, -s.r * 1.35 * pulse); ctx.lineTo(s.r * 0.42, 14); ctx.closePath(); ctx.stroke();
      ctx.globalAlpha = 0.32; ctx.beginPath(); ctx.moveTo(0, -s.r * 1.2); ctx.lineTo(0, -s.r * 2.2); ctx.stroke();
    } else if (s.kind === 'moonPool') {
      ctx.beginPath(); ctx.ellipse(0, 0, s.r * 1.1, s.r * 0.55, Math.sin(t + s.phase) * 0.08, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.globalAlpha = 0.45; ctx.beginPath(); ctx.arc(0, 0, s.r * 0.42 * pulse, 0, TAU); ctx.stroke();
    } else if (s.kind === 'marketArch' || s.kind === 'bridgeMast') {
      ctx.beginPath(); ctx.moveTo(-s.r, s.r * 0.5); ctx.quadraticCurveTo(0, -s.r * 1.2, s.r, s.r * 0.5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-s.r * 0.6, s.r * 0.5); ctx.lineTo(-s.r * 0.6, -s.r * 0.15); ctx.moveTo(s.r * 0.6, s.r * 0.5); ctx.lineTo(s.r * 0.6, -s.r * 0.15); ctx.stroke();
    } else if (s.kind === 'signalPylon') {
      // antenna/pylon glyph: readable architecture, no label stamped on the floor
      ctx.beginPath(); ctx.moveTo(0, -s.r * 0.95); ctx.lineTo(-s.r * 0.34, s.r * 0.42); ctx.lineTo(s.r * 0.34, s.r * 0.42); ctx.closePath(); ctx.stroke();
      ctx.globalAlpha = 0.42;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath(); ctx.arc(0, -s.r * 0.78, s.r * (0.36 + i * 0.22) * pulse, -0.92, -0.18); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, -s.r * 0.78, s.r * (0.36 + i * 0.22) * pulse, Math.PI + 0.18, Math.PI + 0.92); ctx.stroke();
      }
    } else {
      // ghost billboard: abstract neon bars instead of placeholder words
      roundRectPath(ctx, -s.r * 1.1, -s.r * 0.42, s.r * 2.2, s.r * 0.84, 8); ctx.fill(); ctx.stroke();
      ctx.globalAlpha = 0.46; ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const yy = -s.r * 0.23 + i * s.r * 0.15;
        ctx.beginPath(); ctx.moveTo(-s.r * 0.72, yy); ctx.lineTo(s.r * (0.18 + 0.12 * i), yy + Math.sin(t * 3 + i) * 2); ctx.stroke();
      }
      ctx.globalAlpha = 0.70; ctx.beginPath(); ctx.arc(s.r * 0.62, 0, s.r * 0.12 * pulse, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }
}

function drawVents(room, pal, p) {
  const vents = room.vents || [];
  if (!vents.length) return;
  const t = room.time || performance.now() / 1000;
  for (const v of vents) {
    const active = p && dist2(p.x, p.y, v.x, v.y) < Math.pow(v.r + p.r + 16, 2);
    const lift = (v.fromLevel || 0) * TIER_LIFT;
    ctx.save(); ctx.translate(v.x, v.y - lift);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = active ? 0.85 : 0.55;
    const col = v.kind === 'dropfan' ? pal.accent3 : pal.accent2;
    ctx.strokeStyle = v.flash > 0 ? '#ffffff' : col; ctx.fillStyle = hexA(col, active ? 0.20 : 0.12); ctx.lineWidth = active ? 3.5 : 2.2;
    ctx.beginPath(); ctx.arc(0, 0, v.r * (0.72 + (v.flash || 0) * 0.8), 0, TAU); ctx.fill(); ctx.stroke();
    ctx.setLineDash([8, 9]); ctx.lineDashOffset = -t * 120 - (v.phase || 0) * 20;
    ctx.beginPath(); ctx.arc(0, 0, v.r * 0.43, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    ctx.globalAlpha = active ? 0.90 : 0.45;
    for (let i = 0; i < 4; i++) {
      const a = t * 3.2 + v.phase + i * TAU / 4;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * 8, Math.sin(a) * 8); ctx.lineTo(Math.cos(a) * (v.r * 0.54), Math.sin(a) * (v.r * 0.54)); ctx.stroke();
    }
    // subtle landing line so players learn “this fan throws me THERE.”
    if (active || v.flash > 0) {
      ctx.globalAlpha = 0.26; ctx.setLineDash([16, 20]); ctx.lineDashOffset = -t * 180;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo((v.toX - v.x) * 0.5, (v.toY - v.y) * 0.5 - 90, v.toX - v.x, v.toY - v.y - (v.toLevel || 0) * TIER_LIFT + lift); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }
}

function drawShop(room, pal, p) {
  const s = room.shop;
  if (!s) return;
  const item = itemById(s.itemId);
  const t = room.time || performance.now() / 1000;
  if (s.bought) {
    if ((s.soldT || 0) <= 0) return;
    const k = Math.max(0, Math.min(1, s.soldT / 1.05));
    const col = item?.color || '#ffd36e';
    ctx.save(); ctx.translate(s.x, s.y);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.55 * k;
    ctx.strokeStyle = col; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(0, 0, s.r * (1.2 + (1 - k) * 1.2), 0, TAU); ctx.stroke();
    ctx.globalAlpha = 0.35 * k; ctx.fillStyle = hexA(col, 0.24);
    starPath(ctx, 0, -2, s.r * (0.42 + (1 - k) * 0.45), s.r * 0.18, 6); ctx.fill();
    ctx.globalAlpha = 0.70 * k; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-26, 14); ctx.lineTo(4, -18); ctx.lineTo(28, -2); ctx.stroke();
    ctx.restore();
    return;
  }
  const near = !!s.inRange || (p && dist2(p.x, p.y, s.x, s.y) < Math.pow(s.r + p.r + 88, 2));
  const bump = (s.bump || 0) * 28;
  const deny = s.denyT || 0;
  ctx.save(); ctx.translate(s.x, s.y);
  ctx.globalCompositeOperation = 'lighter';
  const col = item?.color || pal.accent3;
  ctx.globalAlpha = near ? 0.96 : 0.72;
  ctx.strokeStyle = deny > 0 ? '#ff8fa3' : col;
  ctx.fillStyle = hexA(deny > 0 ? '#ff8fa3' : col, near ? 0.22 : 0.13);
  ctx.lineWidth = near ? 3.2 : 2.2;
  ctx.rotate(Math.sin(t * 2.2 + s.phase) * 0.08);
  starPath(ctx, 0, -2 - bump * 0.15, s.r * 0.74 + bump, s.r * 0.34 + bump * 0.45, 6); ctx.fill(); ctx.stroke();
  ctx.rotate(-Math.sin(t * 2.2 + s.phase) * 0.08);
  // item core + orbiting cost pips; numbers stay, labels go
  ctx.globalAlpha = 0.92; ctx.fillStyle = col;
  ctx.beginPath(); ctx.arc(0, -5, 10 + Math.sin(t * 5 + s.phase) * 1.5, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#ffffff'; ctx.globalAlpha = 0.68; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.arc(0, -5, 19 + Math.sin(t * 3) * 2, 0, TAU); ctx.stroke();
  ctx.font = '900 14px Inter, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = deny > 0 ? '#ffced7' : '#fff7ff'; ctx.globalAlpha = 0.90;
  ctx.fillText(String(s.cost), 0, 18);
  // a small slash-lane across the kiosk says “dash through me” without another label
  const cut = Math.max(0, s.cutT || 0);
  ctx.globalAlpha = cut > 0 ? 0.92 : near ? 0.66 : 0.36;
  ctx.strokeStyle = cut > 0 ? '#ffffff' : '#ffffff'; ctx.lineWidth = cut > 0 ? 4.4 : near ? 2.8 : 1.9;
  ctx.beginPath(); ctx.moveTo(-s.r * 0.70, -s.r * 0.18); ctx.lineTo(s.r * 0.14, -s.r * 0.56); ctx.lineTo(s.r * 0.70, -s.r * 0.12); ctx.stroke();
  if (cut > 0) {
    ctx.globalAlpha = Math.min(0.75, cut * 3.2);
    ctx.strokeStyle = col; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(-s.r * 1.05, s.r * 0.45); ctx.lineTo(s.r * 1.05, -s.r * 0.45); ctx.stroke();
  }
  if (near) {
    ctx.globalAlpha = 0.58 + Math.sin(t * 7) * 0.16;
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, -s.r - 18, 12, 0, TAU); ctx.stroke();
    ctx.font = '900 13px Inter, system-ui, sans-serif'; ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.88;
    ctx.fillText('E', 0, -s.r - 17);
  }
  ctx.restore();
}

function dist2(x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1; return dx * dx + dy * dy;
}

// The living, moving floor: slow biome-specific currents under the fight. Ported from
// ChatGPT's "neon districts" build. No shadowBlur (perf), gated by reduced()/lowFx.
// The world rect currently visible through the camera (world-space), padded by margin.
// Per-frame renderers cull to this so room size costs nothing — a giant room only ever
// draws the viewport's worth of currents/lanes.
function visibleRect(margin = 0) {
  const invS = 1 / (view.scale || 1);
  return { l: cam.x - margin, t: cam.y - margin, r: cam.x + view.W * invS + margin, b: cam.y + view.H * invS + margin };
}

function drawFloorMotion(room, pal) {
  if (reduced() || state.lowFx) return;
  const t = room.time || performance.now() / 1000;
  const wall = room.wall + 22;
  const vis = visibleRect(120);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // slow water/stained-glass currents (faint — preserve biome identity, not neon soup)
  const gap = room.bossId ? 82 : 108;
  const wave = 8 + Math.sin(t * 0.7) * 2;
  ctx.globalAlpha = room.cleared ? 0.055 : 0.085;
  ctx.strokeStyle = pal.accent2;
  ctx.lineWidth = 1.35;
  const gx0 = Math.max(wall, vis.l), gx1 = Math.min(room.w - wall, vis.r);
  for (let y = wall + ((t * 36) % gap); y < room.h - wall; y += gap) {
    if (y < vis.t || y > vis.b || gx0 > gx1) continue;   // cull off-screen currents
    ctx.beginPath();
    let first = true;
    for (let x = gx0; x <= gx1; x += 64) {
      const yy = y + Math.sin(t * 1.45 + x * 0.012 + y * 0.017) * wave;
      if (first) { ctx.moveTo(x, yy); first = false; } else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  // biome-specific motion language (keyed on the biome's hazard tag)
  const hazard = room.biome.hazard;
  if (hazard === 'pulse' || hazard === 'ritual') {
    ctx.globalAlpha = room.cleared ? 0.08 : 0.12; ctx.strokeStyle = pal.accent; ctx.lineWidth = 2.2;
    const cx = room.w / 2, cy = room.h * 0.46;
    for (let i = 0; i < 4; i++) {
      const r = 120 + i * 82 + Math.sin(t * 1.8 + i) * 9;
      ctx.beginPath(); ctx.ellipse(cx, cy, r, r * 0.58, 0, 0, TAU); ctx.stroke();
    }
  } else if (hazard === 'lane' || hazard === 'sightline') {
    ctx.globalAlpha = room.cleared ? 0.06 : 0.10; ctx.strokeStyle = pal.accent3; ctx.lineWidth = 2;
    for (let x = wall + 70; x < room.w - wall; x += 180) {
      const wob = Math.sin(t * 1.2 + x * 0.01) * 16;
      ctx.beginPath(); ctx.moveTo(x, wall + 60); ctx.lineTo(x + wob, room.h - wall - 60); ctx.stroke();
    }
  } else if (hazard === 'thorn' || hazard === 'snare') {
    ctx.globalAlpha = room.cleared ? 0.055 : 0.09; ctx.strokeStyle = pal.accent; ctx.lineWidth = 2.1;
    for (let i = 0; i < 7; i++) {
      const y = wall + 120 + i * ((room.h - wall * 2 - 240) / 6);
      const side = i % 2 ? room.w - wall : wall, dir = i % 2 ? -1 : 1;
      ctx.beginPath(); ctx.moveTo(side, y);
      ctx.bezierCurveTo(side + dir * 160, y + Math.sin(t + i) * 34, room.w / 2 + dir * 80, y + Math.cos(t * 0.8 + i) * 48, room.w / 2, room.h * 0.46);
      ctx.stroke();
    }
  } else if (hazard === 'shard' || hazard === 'volatile') {
    ctx.globalAlpha = room.cleared ? 0.07 : 0.13; ctx.strokeStyle = pal.accent2; ctx.lineWidth = 2.4;
    for (let i = 0; i < 18; i++) {
      const x = wall + ((i * 137 + Math.sin(t + i) * 24) % Math.max(1, room.w - wall * 2));
      const y = wall + ((i * 211 + Math.cos(t * 0.7 + i) * 28) % Math.max(1, room.h - wall * 2));
      ctx.beginPath(); ctx.moveTo(x - 18, y + 18); ctx.lineTo(x + 18, y - 18); ctx.stroke();
    }
  } else if (hazard === 'fog' || hazard === 'spore') {
    ctx.globalAlpha = room.cleared ? 0.045 : 0.075; ctx.strokeStyle = pal.accent; ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const x = wall + ((i * 251 + t * 30) % Math.max(1, room.w - wall * 2));
      const y = room.h * (0.26 + (i % 5) * 0.12) + Math.sin(t * 0.8 + i) * 22;
      ctx.beginPath(); ctx.ellipse(x, y, 62 + i * 3, 22 + Math.sin(t + i) * 5, 0, 0, TAU); ctx.stroke();
    }
  }
  ctx.restore();
}

// Animated neon boost boulevards (the flow lanes). Additive glow + scrolling dashes;
// brighter when the player is riding one. (Ported from ChatGPT's "neon districts".)
function drawFlowLanes(room, pal, player) {
  const lanes = room.flowLanes || [];
  if (!lanes.length || reduced()) return;
  const t = room.time || performance.now() / 1000;
  // Null Archon signature: the boss can weaponize the lanes — armed (warning flash)
  // then lethal (burns you). Light them up red so the danger is unmissable.
  const archon = room.enemies.find(en => en.bossId === 'archon');
  const arming = archon && (archon.laneArmT || 0) > 0;
  const lethal = archon && (archon.laneLiveT || 0) > 0;
  const dangerPulse = lethal ? 0.5 + 0.5 * Math.abs(Math.sin(t * 12)) : arming ? 0.4 * Math.abs(Math.sin(t * 22)) : 0;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  const vis = visibleRect(160);
  for (const l of lanes) {
    // cull lanes whose span is entirely off-screen (giant rooms stay cheap)
    if (Math.max(l.x1, l.x2) < vis.l || Math.min(l.x1, l.x2) > vis.r || Math.max(l.y1, l.y2) < vis.t || Math.min(l.y1, l.y2) > vis.b) continue;
    const active = player && flowDist(player.x, player.y, l.x1, l.y1, l.x2, l.y2) < (l.width || 78) + player.r + 12;
    const color = (arming || lethal) ? '#ff4d4d' : (l.color || pal.accent3);
    const width = l.width || 78;
    // NOTE: no ctx.shadowBlur here — at city scale (long strokes × ~14 lanes × 3
    // passes/frame) it tanks the frame rate. The 'lighter' blend + the bloom pass
    // give the neon glow for free.
    ctx.globalAlpha = (active ? 0.22 : 0.12) + dangerPulse * 0.55;
    ctx.strokeStyle = color; ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(l.x1, l.y1); ctx.lineTo(l.x2, l.y2); ctx.stroke();
    ctx.globalAlpha = active ? 0.72 : 0.34;
    ctx.lineWidth = active ? 5.8 : 3.4;
    ctx.setLineDash([30, 22]);
    ctx.lineDashOffset = -(t * (active ? 250 : 130) + (l.phase || 0) * 30);
    ctx.beginPath(); ctx.moveTo(l.x1, l.y1); ctx.lineTo(l.x2, l.y2); ctx.stroke();
    if (active) { // bright white speed-line only on the lane you're riding (perf)
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 1.6;
      ctx.setLineDash([8, 34]);
      ctx.lineDashOffset = -(t * 360 + (l.phase || 0) * 40);
      ctx.strokeStyle = '#ffffff';
      ctx.beginPath(); ctx.moveTo(l.x1, l.y1); ctx.lineTo(l.x2, l.y2); ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  ctx.shadowBlur = 0;
  ctx.restore();
}
function flowDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy || 1;
  const tt = clamp(((px - x1) * dx + (py - y1) * dy) / len2, 0, 1);
  return Math.hypot(px - (x1 + dx * tt), py - (y1 + dy * tt));
}

function drawHazardsUnder(room, pal) {
  const t = performance.now() / 1000;
  ctx.save();
  if (room.cleared) ctx.globalAlpha = 0.4; // powered down on the victory lap
  for (const h of room.hazards) {
    if (h.type === 'fog' || h.type === 'lotus') {
      // soft gas: transient slow-fog and the enemy-slowing lotus. (Biome ambient
      // fog and the spore/snare/thorn/shard/volatile hazards are retired.)
      const g = ctx.createRadialGradient(h.x, h.y, h.r * 0.2, h.x, h.y, h.r);
      g.addColorStop(0, hexA(h.color, h.type === 'lotus' ? 0.12 : 0.16));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(h.x, h.y, h.r + Math.sin(t * 1.4 + h.phase) * 6, 0, TAU); ctx.fill();
      if (h.type === 'lotus') {
        ctx.strokeStyle = hexA(h.color, 0.4); ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(h.x, h.y, h.r * 0.96, 0, TAU); ctx.stroke();
      }
    } else if (h.type === 'pulse' || h.type === 'ritual') {
      // Architecture, not enemy: pedestal + floor sigil that emits circular damage.
      const bob = Math.sin(t * 2 + h.phase) * 0.08;
      ctx.strokeStyle = hexA(h.color, 0.82); ctx.lineWidth = 2.4;
      ctx.fillStyle = hexA(h.color, 0.16);
      ctx.save(); ctx.translate(h.x, h.y);
      ctx.rotate(Math.PI / 4 + bob);
      ctx.beginPath(); ctx.rect(-h.r * 0.38, -h.r * 0.38, h.r * 0.76, h.r * 0.76); ctx.fill(); ctx.stroke();
      ctx.rotate(-Math.PI / 4 - bob);
      ctx.globalAlpha = 0.55;
      ctx.beginPath(); ctx.arc(0, 0, h.r * (0.78 + Math.sin(t * 2 + h.phase) * 0.08), 0, TAU); ctx.stroke();
      ctx.globalAlpha = 0.78; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-h.r * 0.36, 0); ctx.lineTo(h.r * 0.36, 0); ctx.moveTo(0, -h.r * 0.36); ctx.lineTo(0, h.r * 0.36); ctx.stroke();
      ctx.restore();
      if (h.on && h.wave > 0) {
        ctx.strokeStyle = hexA(h.color, clamp(1 - h.wave / h.waveSpan, 0.15, 0.9));
        ctx.lineWidth = 7;
        ctx.beginPath(); ctx.arc(h.x, h.y, h.wave, 0, TAU); ctx.stroke();
      }
    }
  }
  ctx.restore();
}

function drawLanesOver(room) {
  if (room.cleared) return; // lanes go dark on the victory lap
  for (const l of room.lanes) {
    if (!l.tele && !l.active) continue;
    ctx.save();
    if (l.tele) {
      ctx.globalAlpha = 0.3;
      ctx.strokeStyle = l.color; ctx.lineWidth = 2; ctx.setLineDash([12, 10]);
      ctx.beginPath(); ctx.moveTo(l.x1, l.y1); ctx.lineTo(l.x2, l.y2); ctx.stroke();
    } else {
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = l.color;
      ctx.shadowColor = l.color; ctx.shadowBlur = 18;
      ctx.lineWidth = l.width;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(l.x1, l.y1); ctx.lineTo(l.x2, l.y2); ctx.stroke();
    }
    ctx.restore();
  }
}

function drawSpawnGlyphs(room) {
  for (const s of room.spawnQueue) {
    const def = ENEMY_TYPES[s.type];
    const t = clamp((room.time - s.glyphAt) / Math.max(0.01, s.at - s.glyphAt), 0, 1);
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.globalAlpha = 0.25 + t * 0.6;
    ctx.strokeStyle = def?.color || '#fff';
    ctx.lineWidth = 2;
    ctx.rotate(t * Math.PI);
    const r = 18 * (1 - t * 0.4);
    ctx.strokeRect(-r, -r, r * 2, r * 2);
    ctx.beginPath(); ctx.arc(0, 0, r * 1.5 * (1 - t), 0, TAU); ctx.stroke();
    ctx.restore();
  }
}

function drawPortal(room, pal) {
  const po = room.portal;
  const t = performance.now() / 1000;
  const pulse = 0.5 + 0.5 * Math.sin(t * 3);
  const r = po.r + Math.sin(t * 5) * 3;

  // tight bright aura (no muddy blur — keep the glow contained)
  const aura = ctx.createRadialGradient(po.x, po.y, r * 0.15, po.x, po.y, r * 1.5);
  aura.addColorStop(0, hexA('#ffffff', 0.55));
  aura.addColorStop(0.3, hexA(pal.accent, 0.45));
  aura.addColorStop(0.7, hexA(pal.accent3, 0.22));
  aura.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.fillStyle = aura;
  ctx.beginPath(); ctx.arc(po.x, po.y, r * 1.5, 0, TAU); ctx.fill();

  // rotating spokes — reads as a gate, not a blur
  ctx.translate(po.x, po.y);
  ctx.rotate(t * 0.8);
  ctx.strokeStyle = hexA(pal.accent2, 0.5); ctx.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45);
    ctx.lineTo(Math.cos(a) * r * 1.1, Math.sin(a) * r * 1.1);
    ctx.stroke();
  }
  ctx.rotate(-t * 1.6);
  // crisp bright double ring
  ctx.shadowColor = pal.accent; ctx.shadowBlur = 10;
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(0, 0, r * 0.92, 0, TAU); ctx.stroke();
  ctx.strokeStyle = hexA(pal.accent3, 0.9); ctx.lineWidth = 4;
  starPath(ctx, 0, 0, r * 0.78, r * 0.34, 6);
  ctx.stroke();
  // hot core
  ctx.shadowBlur = 16 + pulse * 8;
  ctx.fillStyle = hexA('#ffffff', 0.75 + pulse * 0.25);
  ctx.beginPath(); ctx.arc(0, 0, r * 0.2 + pulse * 3, 0, TAU); ctx.fill();
  ctx.restore();

  // sparks spiralling inward (cheap: a couple per frame)
  if (room.particles.length < 240 && Math.random() < 0.6) {
    const a = Math.random() * TAU, rr = r * (1.8 + Math.random() * 0.6);
    room.particles.push({
      kind: 'dot', x: po.x + Math.cos(a) * rr, y: po.y + Math.sin(a) * rr,
      vx: -Math.cos(a) * 160, vy: -Math.sin(a) * 160, life: 0.5, max: 0.5,
      r: 2 + Math.random() * 2, color: pal.accent2,
    });
  }
}

function drawPickups(room, pal) {
  const t = performance.now() / 1000;
  for (const q of room.pickups) {
    const bob = Math.sin(t * 4 + q.x * 0.01) * 3;
    ctx.save();
    ctx.translate(q.x, q.y + bob - (q.level || 0) * TIER_LIFT);
    if (q.type === 'spark') {
      ctx.fillStyle = pal.accent2;
      ctx.shadowColor = pal.accent2; ctx.shadowBlur = 9;
      starPath(ctx, 0, 0, 5.5, 2.4, 4); ctx.fill();
    } else if (q.type === 'repair') {
      ctx.fillStyle = '#7efab7'; ctx.shadowColor = '#7efab7'; ctx.shadowBlur = 10;
      ctx.fillRect(-7, -2.4, 14, 4.8); ctx.fillRect(-2.4, -7, 4.8, 14);
    } else if (q.type === 'heart' || q.type === 'marrow') {
      const c = q.type === 'heart' ? '#ff8ea6' : '#f7d7ff';
      ctx.fillStyle = c; ctx.shadowColor = c; ctx.shadowBlur = 12;
      heartPath(ctx, 0, 0, 11); ctx.fill();
    } else if (q.type === 'core') {
      ctx.strokeStyle = '#f3dcff'; ctx.shadowColor = '#f3dcff'; ctx.shadowBlur = 14;
      ctx.lineWidth = 2.4;
      ctx.rotate(t * 0.8);
      ctx.strokeRect(-9, -9, 18, 18);
      ctx.fillStyle = '#f3dcff';
      ctx.beginPath(); ctx.arc(0, 0, 4, 0, TAU); ctx.fill();
    } else if (q.type === 'amp' || q.type === 'rapid' || q.type === 'frame') {
      const c = q.type === 'amp' ? '#ffbe73' : q.type === 'rapid' ? '#9fd2ff' : '#b6f69d';
      ctx.fillStyle = c; ctx.shadowColor = c; ctx.shadowBlur = 11;
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-7, -7, 14, 14);
      ctx.fillStyle = '#0a0d12';
      ctx.font = '900 9px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.rotate(-Math.PI / 4);
      ctx.fillText(q.type === 'amp' ? '+' : q.type === 'rapid' ? '»' : '↟', 0, 3);
    }
    ctx.restore();
  }
}

function drawMines(room) {
  if (!room.mines) return;
  const t = performance.now() / 1000;
  for (const m of room.mines) {
    ctx.save();
    ctx.translate(m.x, m.y);
    const armed = m.arm <= 0;
    ctx.fillStyle = armed ? '#ff8864' : '#7a4634';
    ctx.shadowColor = '#ff8864';
    ctx.shadowBlur = armed ? 10 + Math.sin(t * 8) * 5 : 0;
    ctx.beginPath(); ctx.arc(0, 0, m.r, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2a130a';
    ctx.beginPath(); ctx.arc(0, 0, m.r * 0.4, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

function drawBullets(room) {
  for (const b of room.bullets) {
    ctx.save();
    ctx.fillStyle = b.color;
    ctx.shadowColor = b.color;
    ctx.shadowBlur = b.owner === 'player' ? 10 : 13;
    const sp = Math.hypot(b.vx, b.vy) || 1;
    if (sp > 60) {
      ctx.globalAlpha = 0.4;
      ctx.strokeStyle = b.color; ctx.lineWidth = b.r * 1.1; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(b.x - (b.vx / sp) * b.r * 3.2, b.y - (b.vy / sp) * b.r * 3.2);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (b.converted) {
      // reflected shot reads by SHAPE (diamond), not just colour — colourblind-safe
      const s = b.r * 1.5;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y - s); ctx.lineTo(b.x + s, b.y);
      ctx.lineTo(b.x, b.y + s); ctx.lineTo(b.x - s, b.y);
      ctx.closePath(); ctx.fill();
    } else if (b.primed) {
      // dash-primed empowered shot: filled core + a crisp white ring
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.9; ctx.lineWidth = 2; ctx.strokeStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 2.5, 0, TAU); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
}

function drawDangerTriangles(room, p) {
  const margin = 28, triSize = view.mobile ? 17 : 12; // bigger threat markers on phones
  let count = 0;
  for (const e of room.enemies) {
    if (e.hp <= 0 || count >= 8) break;
    const sx = (e.x - cam.x) * view.scale, sy = (e.y - cam.y) * view.scale;
    if (sx > margin && sx < view.W - margin && sy > margin && sy < view.H - margin) continue;
    count++;
    const cx = clamp(sx, margin, view.W - margin), cy = clamp(sy, margin, view.H - margin);
    const angle = Math.atan2(sy - view.H / 2, sx - view.W / 2);
    const isTele = (e.type === 'charger' && e.state === 'windup') || (e.type === 'sniper' && e.aimT > 0);
    const s = isTele ? triSize * 1.6 : triSize;
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(angle);
    ctx.globalAlpha = isTele ? 0.95 : 0.55;
    ctx.fillStyle = isTele ? '#ff3333' : e.color;
    ctx.beginPath();
    ctx.moveTo(s, 0); ctx.lineTo(-s * 0.5, -s * 0.6); ctx.lineTo(-s * 0.5, s * 0.6);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

// touch pad glyphs (Boon Moots index.html:1443-1444)
function drawPad(pad, color) {
  if (pad.id === null) return;
  ctx.save();
  ctx.globalAlpha = 0.46;
  ctx.strokeStyle = color; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(pad.startX, pad.startY, 70, 0, TAU); ctx.stroke();
  ctx.globalAlpha = 0.82;
  ctx.fillStyle = color + '44';
  ctx.beginPath(); ctx.arc(pad.startX + pad.dx * 70, pad.startY + pad.dy * 70, 26, 0, TAU); ctx.fill();
  if (pad.len > 0.80) {
    ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.arc(pad.startX, pad.startY, 82, 0, TAU); ctx.stroke();
  }
  ctx.restore();
}

// when the room is cleared and the portal is off-screen, point the way home
function drawPortalArrow(room) {
  const po = room.portal;
  const sx = (po.x - cam.x) * view.scale, sy = (po.y - cam.y) * view.scale;
  const margin = 46;
  if (sx > margin && sx < view.W - margin && sy > margin && sy < view.H - margin) return;
  const cx = clamp(sx, margin, view.W - margin), cy = clamp(sy, margin, view.H - margin);
  const angle = Math.atan2(sy - view.H / 2, sx - view.W / 2);
  const t = performance.now() / 1000;
  const pal = room.biome.pal;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.globalAlpha = 0.7 + Math.sin(t * 5) * 0.25;
  ctx.fillStyle = pal.accent3;
  ctx.shadowColor = pal.accent3; ctx.shadowBlur = 14;
  ctx.rotate(angle);
  const s = 16;
  ctx.beginPath();
  ctx.moveTo(s, 0); ctx.lineTo(-s * 0.6, -s * 0.7); ctx.lineTo(-s * 0.25, 0); ctx.lineTo(-s * 0.6, s * 0.7);
  ctx.closePath(); ctx.fill();
  ctx.rotate(-angle);
  starPath(ctx, -22 * Math.cos(angle), -22 * Math.sin(angle), 7, 3, 6);
  ctx.fill();
  ctx.restore();
}

// Boss arena hooks (world-space, on the floor): Warden grave-slams + Spiggot blooms.
function drawBossArena(room, pal) {
  const t = performance.now() / 1000;
  for (const e of room.enemies) {
    if (!e.boss) continue;
    if (e.slams) for (const s of e.slams) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      if (s.t > 0) {
        const fill = 1 - s.t / 0.95;
        ctx.globalAlpha = 0.18 + 0.22 * fill; ctx.strokeStyle = '#ffd24d'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.stroke();
        ctx.globalAlpha = 0.10 + 0.28 * fill; ctx.fillStyle = '#ffd24d';
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r * fill, 0, TAU); ctx.fill();   // the mark closes
      } else if (s.flash > 0) {
        ctx.globalAlpha = (s.flash / 0.3) * 0.6; ctx.fillStyle = '#fff3c4';
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
    if (e.blooms) for (const b of e.blooms) {
      const fade = clamp(b.life / 1.2, 0, 1);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(b.x, b.y, b.r * 0.2, b.x, b.y, b.r);
      g.addColorStop(0, hexA('#9effdc', 0.18 * fade)); g.addColorStop(0.7, hexA('#9effdc', 0.10 * fade)); g.addColorStop(1, hexA('#9effdc', 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.22 * fade; ctx.strokeStyle = '#9effdc'; ctx.lineWidth = 2;
      ctx.setLineDash([10, 10]); ctx.lineDashOffset = -t * 30;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.86, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      ctx.restore();
    }
  }
}

// False Moon ECLIPSE (screen-space): darkness closes in, clear around the moon.
function drawEclipse(room) {
  const moon = room.enemies?.find(e => e.bossId === 'falseMoon' && (e.eclipse || 0) > 0.02);
  if (!moon || reduced()) return;
  const k = Math.min(1, moon.eclipse) * 0.6;   // capped so the fight stays readable
  const mx = (moon.x - cam.x) * view.scale, my = (moon.y - cam.y) * view.scale;
  const g = ctx.createRadialGradient(mx, my, 70, mx, my, Math.max(view.W, view.H) * 0.85);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.45, `rgba(3,0,10,${(0.55 * k).toFixed(3)})`);
  g.addColorStop(1, `rgba(3,0,10,${k.toFixed(3)})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, view.W, view.H);
}

// Anime speed-streaks at high velocity (dash / flow-lane boost) — the "I'm FAST" rush.
// Screen-space lines trailing behind the travel direction; flicker reads as energy.
function drawSpeedStreaks(p) {
  if (!p || reduced()) return;
  const sp = Math.hypot(p.vx, p.vy);
  if (sp < 500) return;
  const k = clamp((sp - 500) / 850, 0, 1);
  const px = (p.x - cam.x) * view.scale, py = (p.y - cam.y) * view.scale;
  const ang = Math.atan2(p.vy, p.vx) + Math.PI;     // behind the direction of travel
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = p.dashT > 0 ? '#ffffff' : '#bfeaff';
  for (let i = 0; i < 20; i++) {
    const a = ang + (Math.random() - 0.5) * 1.85;
    const r0 = 190 + Math.random() * 210, r1 = r0 + 80 + k * 220;
    ctx.globalAlpha = (0.09 + k * 0.26) * (0.45 + 0.55 * Math.random());
    ctx.lineWidth = 1.2 + Math.random() * 2.6;
    ctx.beginPath();
    ctx.moveTo(px + Math.cos(a) * r0, py + Math.sin(a) * r0);
    ctx.lineTo(px + Math.cos(a) * r1, py + Math.sin(a) * r1);
    ctx.stroke();
  }
  ctx.restore();
}

// Cinematic boss entrance: the name slams in huge + fades over the ~1s intro hold.
function drawBossIntro(room) {
  const boss = room.enemies?.find(e => e.boss && (e.introT || 0) > 0);
  if (!boss) return;
  const a = clamp(boss.introT / 1.05, 0, 1);
  const pop = 1 + (1 - a) * 0.18;
  const cx = view.W / 2, cy = view.H * 0.4;
  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.globalAlpha = Math.min(1, a * 1.7);
  ctx.font = `900 ${Math.round(Math.min(66, view.W * 0.072) * pop)}px Inter, system-ui, sans-serif`;
  ctx.shadowColor = boss.color; ctx.shadowBlur = 26;
  ctx.fillStyle = boss.color;
  ctx.fillText(boss.display.toUpperCase(), cx, cy);
  ctx.shadowBlur = 0;
  ctx.globalAlpha = Math.min(1, a * 1.7) * 0.85;
  ctx.font = `600 ${Math.round(Math.min(18, view.W * 0.02))}px Inter, system-ui, sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText('✦ ✦ ✦', cx, cy + Math.min(46, view.W * 0.05));
  ctx.restore();
}

function drawBossBar(room) {
  const boss = room.enemies.find(e => e.boss && e.hp > 0);
  if (!boss) return;
  const w = Math.min(420, view.W * 0.6), h = 10;
  const x = (view.W - w) / 2, y = 64;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = '900 14px Inter, system-ui, sans-serif';
  ctx.fillStyle = boss.color;
  ctx.shadowColor = boss.color; ctx.shadowBlur = 12;
  ctx.fillText(boss.display.toUpperCase(), view.W / 2, y - 8);
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(0,0,0,.5)';
  ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  ctx.fillStyle = boss.color;
  ctx.fillRect(x, y, w * clamp(boss.hp / boss.maxHp, 0, 1), h);
  ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 1;
  ctx.strokeRect(x - 2, y - 2, w + 4, h + 4);
  ctx.restore();
}

// ── transition (Boon Moots' three-beat fade, index.html:928-948) ────────────
function drawTransition() {
  const t = state.transition;
  const p = clamp(t.timer / t.duration, 0, 1);
  if (p < 0.28) {
    ctx.fillStyle = `rgba(5,3,10,${p / 0.28})`;
    ctx.fillRect(0, 0, view.W, view.H);
  } else if (p < 0.72) {
    ctx.fillStyle = '#05030a';
    ctx.fillRect(0, 0, view.W, view.H);
    const a = Math.min(1, (p - 0.28) / 0.1) * Math.min(1, (0.72 - p) / 0.1);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    if (t.bossId && bossCards[t.bossId]?.ready) {
      const card = bossCards[t.bossId].img;
      const ch = Math.min(220, view.H * 0.32), cw = ch * (card.width / Math.max(1, card.height));
      ctx.drawImage(card, view.W / 2 - cw / 2, view.H / 2 - ch - 52, cw, ch);
    }
    ctx.fillStyle = '#fff7ff';
    ctx.font = '900 42px Inter, system-ui, sans-serif';
    ctx.fillText(t.title, view.W / 2, view.H / 2 - 8);
    ctx.font = '800 16px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#cabee0';
    ctx.fillText(t.sub, view.W / 2, view.H / 2 + 28);
    if (t.tag) {
      ctx.fillStyle = '#8fa3c8';
      ctx.font = '800 13px Inter, system-ui, sans-serif';
      ctx.fillText(t.tag, view.W / 2, view.H / 2 + 52);
    }
    if (t.mut) {
      ctx.fillStyle = '#ff8fa3';
      ctx.font = '900 15px Inter, system-ui, sans-serif';
      ctx.fillText(t.mut, view.W / 2, view.H / 2 + 78);
    }
    ctx.restore();
  } else {
    ctx.fillStyle = `rgba(5,3,10,${1 - (p - 0.72) / 0.28})`;
    ctx.fillRect(0, 0, view.W, view.H);
  }
}

// ── title backdrop ──────────────────────────────────────────────────────────
const titleMotes = [];
function drawTitleBg() {
  const t = performance.now() / 1000;
  const g = ctx.createLinearGradient(0, 0, 0, view.H);
  g.addColorStop(0, '#070411');
  g.addColorStop(1, '#0d1018');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, view.W, view.H);
  if (!titleMotes.length) {
    for (let i = 0; i < 70; i++) {
      titleMotes.push({ x: Math.random(), y: Math.random(), r: Math.random() * 2.2 + 0.6, s: Math.random() * 0.014 + 0.004, ph: Math.random() * TAU });
    }
  }
  for (const m of titleMotes) {
    m.y -= m.s * 0.016;
    if (m.y < -0.02) m.y = 1.02;
    ctx.globalAlpha = 0.3 + Math.sin(t * 2 + m.ph) * 0.2;
    ctx.fillStyle = '#9eb4d8';
    ctx.beginPath(); ctx.arc(m.x * view.W, m.y * view.H, m.r, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function hexA(hex, a) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}
