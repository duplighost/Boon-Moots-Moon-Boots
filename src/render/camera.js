// Viewport + damped camera with aim-lead, kick and shake (No Moon's model).
import { clamp, damp } from '../rng.js';
import { state } from '../state.js';
import { coarse } from '../systems/juice.js';
import { FX } from '../config.js';

export const view = { W: 1, H: 1, DPR: 1, scale: 1, baseScale: 1, zoom: 1, mobile: false, portrait: false };
export const cam = { x: 0, y: 0, kickX: 0, kickY: 0 };
export function resize(canvas, bloomCanvas) {
  const iw = (typeof innerWidth !== 'undefined') ? innerWidth : 1280;
  const ih = (typeof innerHeight !== 'undefined') ? innerHeight : 720;
  view.mobile = coarse() || iw < 760 || ih < 560;
  view.portrait = ih >= iw;
  view.DPR = Math.min(view.mobile ? 1.35 : 2, Math.max(1, (typeof devicePixelRatio !== 'undefined' ? devicePixelRatio : 1)));
  // adaptive zoom keyed to the smaller screen dimension: keeps sprites readable on a
  // phone instead of the old fixed 0.52 portrait (which shrank everything to a dot —
  // the "harder to see on mobile" gripe). Bigger phones get a touch more zoom.
  const small = Math.min(iw, ih);
  // desktop zooms out to 0.82 so the larger arena reads as roomy (was 1.0); mobile stays adaptive
  view.baseScale = view.mobile ? clamp(small / 560, 0.62, 0.92) : 0.82;
  view.scale = view.baseScale * view.zoom;
  view.W = Math.max(320, Math.floor(iw));
  view.H = Math.max(320, Math.floor(ih));
  if (canvas) {
    canvas.width = Math.floor(view.W * view.DPR);
    canvas.height = Math.floor(view.H * view.DPR);
    canvas.style.width = view.W + 'px';
    canvas.style.height = view.H + 'px';
  }
  if (bloomCanvas) {
    bloomCanvas.width = Math.max(1, Math.floor(view.W * view.DPR * 0.5));
    bloomCanvas.height = Math.max(1, Math.floor(view.H * view.DPR * 0.5));
  }
  // One-time portrait nudge: fade in, auto-dismiss, re-arm only after rotating away.
  if (typeof document !== 'undefined') {
    const hint = document.getElementById('rotateHint');
    if (hint) {
      const inPortrait = view.mobile && view.portrait;
      if (inPortrait && !view._rotateHintArmed) {
        view._rotateHintArmed = true;
        hint.classList.add('show');
        clearTimeout(view._rotateHintTimer);
        view._rotateHintTimer = setTimeout(() => hint.classList.remove('show'), 6000);
      } else if (!inPortrait) {
        view._rotateHintArmed = false;
        clearTimeout(view._rotateHintTimer);
        hint.classList.remove('show');
      }
    }
  }
}

export function snapCamera() {
  const p = state.run?.player, room = state.room;
  if (!p || !room) return;
  view.zoom = 1; view.scale = view.baseScale; // each room starts un-zoomed
  const vw = view.W / view.scale, vh = view.H / view.scale;
  cam.x = clampCam(p.x - vw / 2, room.w, vw);
  cam.y = clampCam(p.y - vh / 2, room.h, vh);
}

function clampCam(v, roomSpan, viewSpan) {
  if (viewSpan >= roomSpan) return (roomSpan - viewSpan) / 2; // room smaller than view: center
  return clamp(v, 0, roomSpan - viewSpan);
}

export function kick(x, y) { cam.kickX += x; cam.kickY += y; }

export function updateCamera(dt) {
  const p = state.run?.player, room = state.room;
  if (!p || !room) return;
  // the room opens up a touch at dash speed, then eases back (Cathedral's speed-zoom)
  const spd = Math.hypot(p.vx, p.vy);
  const zt = clamp(1 - Math.max(0, spd - 600) / 4200, 0.95, 1);
  view.zoom = damp(view.zoom, zt, 6, dt);
  view.scale = view.baseScale * view.zoom;
  const vw = view.W / view.scale, vh = view.H / view.scale;
  const tx = p.x + p.aimX * 58 + p.vx * 0.09 - vw / 2;
  const ty = p.y + p.aimY * 58 + p.vy * 0.09 - vh / 2;
  cam.x = damp(cam.x, clampCam(tx, room.w, vw), 8.8, dt);
  cam.y = damp(cam.y, clampCam(ty, room.h, vh), 8.8, dt);
  cam.kickX = damp(cam.kickX, 0, 17, dt);
  cam.kickY = damp(cam.kickY, 0, 17, dt);
}

// world transform for the frame; returns the shake offsets applied
export function applyWorldTransform(ctx) {
  const s = state.fx.shake;
  const mag = s * s * FX.SHAKE_GAIN;   // quadratic trauma: tiny hits barely move, big hits punch
  const ox = (Math.random() * 2 - 1) * mag;
  const oy = (Math.random() * 2 - 1) * mag;
  ctx.setTransform(view.DPR * view.scale, 0, 0, view.DPR * view.scale,
    (-cam.x - cam.kickX + ox) * view.DPR * view.scale,
    (-cam.y - cam.kickY + oy) * view.DPR * view.scale);
}

export function uiTransform(ctx) {
  ctx.setTransform(view.DPR, 0, 0, view.DPR, 0, 0);
}

export function screenToWorld(sx, sy) {
  return { x: cam.x + sx / view.scale, y: cam.y + sy / view.scale };
}
