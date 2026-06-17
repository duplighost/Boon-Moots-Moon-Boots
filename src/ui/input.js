// Input: keyboard + mouse + gamepad + the Boon Moots two-thumbs-anywhere touch
// system (index.html:445-591 port: pads assigned by screen half, flick = dash,
// aim-tap = pulse, mid-drag shove detection with a latch).
import { state } from '../state.js';
import { norm, dist } from '../rng.js';
import { screenToWorld } from '../render/camera.js';
import { tryDash } from '../systems/player.js';
import { pickCard, boonReroll } from '../systems/draft.js';
import { tryBuyShop } from '../systems/shop.js';

const keys = Object.create(null);
const mouse = { x: 0, y: 0, down: false, seen: false };
let actions = null;
let suppressUntil = 0;
let padDashLatch = false;

const makePad = () => ({
  id: null, startX: 0, startY: 0, x: 0, y: 0, dx: 0, dy: 0,
  len: 0, maxLen: 0, startT: 0, prevLen: 0, prevT: 0, speed: 0,
  dashLatch: false, dashed: false,
});
export const moveTouch = makePad();
export const aimTouch = makePad();

export function suppressInput(ms) {
  suppressUntil = (typeof performance !== 'undefined' ? performance.now() : 0) + ms;
  hardClearPad(moveTouch);
  hardClearPad(aimTouch);
}
const now = () => (typeof performance !== 'undefined' ? performance.now() : 0);
const suppressed = () => now() < suppressUntil;

function setPad(pad, touch) {
  pad.id = touch.identifier;
  pad.startX = pad.x = touch.clientX;
  pad.startY = pad.y = touch.clientY;
  pad.dx = pad.dy = 0;
  pad.len = pad.maxLen = pad.prevLen = pad.speed = 0;
  pad.startT = pad.prevT = now();
  pad.dashLatch = false;
  pad.dashed = false;
}

function updatePad(pad, touch) {
  const t = now(), oldX = pad.x, oldY = pad.y, oldLen = pad.len || 0;
  pad.x = touch.clientX; pad.y = touch.clientY;
  const dt = Math.max(1, t - (pad.prevT || t));
  pad.speed = Math.hypot(pad.x - oldX, pad.y - oldY) / dt * 1000;
  pad.prevT = t;
  pad.prevLen = oldLen;
  const dx = (pad.x - pad.startX) / 70, dy = (pad.y - pad.startY) / 70;
  const l = Math.hypot(dx, dy);
  pad.len = Math.min(1, l);
  pad.maxLen = Math.max(pad.maxLen, pad.len);
  if (l > 1) { pad.dx = dx / l; pad.dy = dy / l; } else { pad.dx = dx; pad.dy = dy; }
}

function clearPad(pad) {
  pad.id = null; pad.dx = pad.dy = pad.len = 0; pad.maxLen = 0; pad.speed = 0; pad.dashed = false;
}
function hardClearPad(pad) { Object.assign(pad, makePad()); }

function assignTouch(touch) {
  const half = (typeof innerWidth !== 'undefined' ? innerWidth : 1280) * 0.5;
  if (touch.clientX < half) {
    if (moveTouch.id === null) setPad(moveTouch, touch);
    else if (aimTouch.id === null) setPad(aimTouch, touch);
  } else {
    if (aimTouch.id === null) setPad(aimTouch, touch);
    else if (moveTouch.id === null) setPad(moveTouch, touch);
  }
}

function releaseTouches(list) {
  for (const t of list) {
    if (t.identifier === aimTouch.id) {
      const age = now() - aimTouch.startT;
      const flick = age < 230 && aimTouch.maxLen > 0.82 && (aimTouch.speed > 620 || aimTouch.len > 0.86) && !aimTouch.dashed;
      if (!suppressed() && flick) tryDash(aimTouch.dx, aimTouch.dy);
      clearPad(aimTouch);
    }
    if (t.identifier === moveTouch.id) {
      const quick = now() - moveTouch.startT < 230;
      const flick = moveTouch.maxLen > 0.80 && moveTouch.speed > 560;
      if (quick && flick && !suppressed() && state.run?.player?.dashCd <= 0) tryDash(moveTouch.dx, moveTouch.dy);
      clearPad(moveTouch);
    }
  }
}

// mid-drag dash detection — runs every play frame (BM index.html:579-591)
export function tickTouchDash() {
  if (state.mode !== 'play' || suppressed()) return;
  const p = state.run?.player;
  if (!p) return;
  // mid-drag dash detection — only a deliberate slam from rest triggers the
  // left-thumb dash, so swinging the held stick to change direction never dashes.
  if (moveTouch.id !== null && moveTouch.len > 0.82 && p.dashCd <= 0 && !moveTouch.dashLatch) {
    const slammedFromRest = (moveTouch.prevLen || 0) < 0.55 && moveTouch.len > 0.82;
    if (slammedFromRest) {
      tryDash(moveTouch.dx, moveTouch.dy);
      moveTouch.dashLatch = true;
    }
  }
  if (moveTouch.len < 0.56) moveTouch.dashLatch = false;
  if (aimTouch.id !== null && aimTouch.len > 0.82 && p.dashCd <= 0 && !aimTouch.dashLatch) {
    const age = now() - aimTouch.startT;
    if (age < 230 && aimTouch.speed > 920) {
      tryDash(aimTouch.dx, aimTouch.dy);
      aimTouch.dashLatch = true;
      aimTouch.dashed = true;
    }
  }
  if (aimTouch.len < 0.48) aimTouch.dashLatch = false;
}

export function initInput(canvas, a) {
  actions = a;
  addEventListener('keydown', onKeyDown, { passive: false });
  addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; }, { passive: true });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    mouse.x = e.clientX; mouse.y = e.clientY; mouse.seen = true;
  }, { passive: true });
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') return; // touch handled by touch events
    if (state.mode === 'title' || state.mode === 'dead') return;
    if (state.mode !== 'play') return;
    actions.firstInteract?.();
    const w = screenToWorld(e.clientX, e.clientY);
    if (tryBuyShop(w)) { e.preventDefault(); return; }
    if (e.button === 2) { tryDash(null, null, getMove()); return; } // right-click also dashes
    mouse.down = true;
    mouse.x = e.clientX; mouse.y = e.clientY; mouse.seen = true;
  }, { passive: false });
  addEventListener('pointerup', (e) => { if (e.button === 0) mouse.down = false; }, { passive: true });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('touchstart', (e) => {
    if (state.mode !== 'play') return;
    e.preventDefault();
    actions.firstInteract?.();
    for (const t of e.changedTouches) {
      const w = screenToWorld(t.clientX, t.clientY);
      if (tryBuyShop(w)) return;
    }
    for (const t of e.changedTouches) assignTouch(t);
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    if (state.mode !== 'play') return;
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === moveTouch.id) updatePad(moveTouch, t);
      if (t.identifier === aimTouch.id) updatePad(aimTouch, t);
    }
  }, { passive: false });
  canvas.addEventListener('touchend', (e) => {
    if (state.mode !== 'play') return;
    e.preventDefault();
    releaseTouches(e.changedTouches);
  }, { passive: false });
  canvas.addEventListener('touchcancel', (e) => {
    if (state.mode !== 'play') return;
    e.preventDefault();
    releaseTouches(e.changedTouches);
  }, { passive: false });
}

function onKeyDown(e) {
  const k = e.key.toLowerCase();
  keys[k] = true;
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'tab'].includes(k)) e.preventDefault();
  if (e.repeat) return;
  actions?.firstInteract?.();
  if (k === 'enter' && (state.mode === 'title' || state.mode === 'dead')) actions?.start?.();
  if (state.mode === 'play' && !suppressed()) {
    if (k === ' ' || k === 'shift') tryDash(null, null, getMove()); // spacebar = spin-dash
    if (k === 'e' || k === 'f' || k === 'enter') tryBuyShop();
    if (k === 'r') boonReroll();
  }
  if (state.mode === 'portalDraft') {
    if (k === '1' || k === '2' || k === '3') pickCard(Number(k) - 1);
    if (k === 'r') boonReroll();
  }
  if (k === 'tab') actions?.codex?.();
  if (k === 'escape' || k === 'p') actions?.pause?.();
  if (k === 'm') actions?.toggleSfx?.();
  if (k === 'b') actions?.toggleBgm?.();
}

export function getMove() {
  let x = 0, y = 0;
  if (keys.w || keys.arrowup) y -= 1;
  if (keys.s || keys.arrowdown) y += 1;
  if (keys.a || keys.arrowleft) x -= 1;
  if (keys.d || keys.arrowright) x += 1;
  x += moveTouch.dx || 0;
  y += moveTouch.dy || 0;
  const gp = (typeof navigator !== 'undefined' && navigator.getGamepads) ? navigator.getGamepads()[0] : null;
  if (gp) {
    const gx = Math.abs(gp.axes[0]) > 0.16 ? gp.axes[0] : 0;
    const gy = Math.abs(gp.axes[1]) > 0.16 ? gp.axes[1] : 0;
    x += gx; y += gy;
    if (gp.buttons[1]?.pressed || gp.buttons[0]?.pressed || gp.buttons[3]?.pressed) {
      if (!padDashLatch) { padDashLatch = true; if (state.mode === 'play' && !suppressed()) tryDash(null, null, getMoveRaw(x, y)); }
    } else padDashLatch = false;
  }
  if (suppressed()) return { x: 0, y: 0, active: false, l: 0 };
  return getMoveRaw(x, y);
}

function getMoveRaw(x, y) {
  const l = Math.hypot(x, y);
  if (l > 1) { x /= l; y /= l; }
  return { x, y, active: l > 0.06, l: Math.min(1, l) };
}

export function getAim() {
  const p = state.run?.player;
  if (!p) return { x: 1, y: 0, active: false, aiming: false };
  let ax = p.aimX, ay = p.aimY, firing = false, aiming = false;

  if (aimTouch.id !== null) {
    const tl = Math.hypot(aimTouch.dx, aimTouch.dy);
    const age = now() - aimTouch.startT;
    if (tl > 0.18) {
      ax = aimTouch.dx / (tl || 1); ay = aimTouch.dy / (tl || 1);
      firing = true; aiming = true;
    } else if (age > 115) {
      const n = nearestEnemyDir(p);
      ax = n.x; ay = n.y; firing = true; aiming = n.hit;
    }
  } else if (mouse.seen) {
    const w = screenToWorld(mouse.x, mouse.y);
    const n = norm(w.x - p.x, w.y - p.y);
    if (n.m > 8) { ax = n.x; ay = n.y; aiming = true; }
    firing = mouse.down;
  }
  const gp = (typeof navigator !== 'undefined' && navigator.getGamepads) ? navigator.getGamepads()[0] : null;
  if (gp) {
    const rx = Math.abs(gp.axes[2] || 0) > 0.2 ? gp.axes[2] : 0;
    const ry = Math.abs(gp.axes[3] || 0) > 0.2 ? gp.axes[3] : 0;
    if (rx || ry) {
      const n = norm(rx, ry);
      ax = n.x; ay = n.y; aiming = true; firing = true;
    }
  }
  if (keys.z) { // optional keyboard auto-aim fire (space is the dash now)
    firing = true;
    if (!aiming) {
      const n = nearestEnemyDir(p);
      ax = n.x; ay = n.y; aiming = n.hit;
    }
  }
  if (suppressed()) firing = false;
  return { x: ax, y: ay, active: firing, aiming };
}

function nearestEnemyDir(p) {
  let best = null, bd = Infinity;
  if (state.room) {
    for (const e of state.room.enemies) {
      const d = dist(p.x, p.y, e.x, e.y);
      // don't lock onto a target you can't legally hit from here (e.g. a sniper up a tier)
      if (e.hp > 0 && e.level <= p.level && d < bd && d < 620) { best = e; bd = d; }
    }
  }
  if (best) {
    const n = norm(best.x - p.x, best.y - p.y);
    return { x: n.x, y: n.y, hit: true };
  }
  return { x: p.aimX, y: p.aimY, hit: false };
}
