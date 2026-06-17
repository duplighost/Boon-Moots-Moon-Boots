// Entity painters: the Moots sprite + vector enemies/obstacles (No Moon/BM idiom).
import { TAU, PLAYER } from '../config.js';
import { clamp } from '../rng.js';
import { dashSpinPhase } from '../systems/player.js';
import { state } from '../state.js';
import { reduced } from '../systems/juice.js';

export const moots = { img: null, ready: false };
export const mootsDressed = { img: null, ready: false }; // unlocked by beating the final boss
export const bossCards = {}; // bossId -> {img, ready}

const PLAYER_DRAW_SCALE = PLAYER.DRAW_SCALE || 1;
const PLAYER_EFFECT_SCALE = Math.max(0.78, PLAYER_DRAW_SCALE);

export function loadSprites() {
  if (typeof Image === 'undefined') return;
  const img = new Image();
  img.onload = () => { moots.ready = true; };
  img.src = './assets/moots.webp';
  moots.img = img;
  const dressed = new Image();
  dressed.onload = () => { mootsDressed.ready = true; };
  dressed.src = './assets/moots-dressed.webp';
  mootsDressed.img = dressed;
  for (const [id, file] of Object.entries({
    falseMoon: 'false-moon-card', warden: 'warden-card', spiggot: 'spiggot-card', archon: 'archon-card',
  })) {
    const card = new Image();
    bossCards[id] = { img: card, ready: false };
    card.onload = () => { bossCards[id].ready = true; };
    card.src = `./assets/bosses/${file}.webp`;
  }
}

function shadow(ctx, x, y, w, h, a) {
  ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.ellipse(x, y, w, h, 0, 0, TAU); ctx.fill(); ctx.restore();
}

// ── player ──────────────────────────────────────────────────────────────────
export function drawPlayer(ctx, p, room) {
  const pal = room.biome.pal;
  const spin = dashSpinPhase(p);
  const sp = Math.hypot(p.vx || 0, p.vy || 0);
  const pose = { speed: sp, vx: p.vx || 0, vy: p.vy || 0, moveFace: p.moveFace || 0, animT: p.animT || 0, dash: p.dashT > 0, rail: !!p.rail?.active, vent: p.ventT > 0, surface: p._surface, aim: p.face || 0 };
  // combo charged aura: at a high score multiplier the passenger runs hot — a pulsing
  // ring that intensifies + shifts colour with the combo (completes the power fantasy).
  const combo = state.run?.combo || 1;
  if (combo > 2.4 && !reduced()) {
    const k = Math.min(1, (combo - 2.4) / 8), tt = performance.now() / 1000;
    const col = combo > 9 ? '#ffffff' : combo > 5 ? '#ff9bf5' : pal.accent3;
    const rr = (p.r + 12 + Math.sin(tt * 7) * 3) * (1 + k * 0.5);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = (0.16 + k * 0.30) * (0.7 + 0.3 * Math.sin(tt * 9));
    ctx.strokeStyle = col; ctx.lineWidth = 2 + k * 2.5;
    ctx.shadowColor = col; ctx.shadowBlur = 10 + k * 14;
    ctx.beginPath(); ctx.arc(p.x, p.y - 6, rr, 0, TAU); ctx.stroke();
    ctx.restore();
  }
  // slipstream trail — directional speed-smear behind movement (concept panel 3)
  if (sp > 150) {
    const inv = 1 / sp, bx = -p.vx * inv, by = -p.vy * inv;       // backward unit
    const perpx = -by, perpy = bx;
    const len = Math.min(52, sp * 0.045) * PLAYER_EFFECT_SCALE * (p.dashT > 0 ? 1.7 : 1);
    // start the wake behind the body so it never sits over his (part-transparent) sprite
    const baseX = p.x + bx * 22 * PLAYER_EFFECT_SCALE, baseY = p.y - 12 * PLAYER_EFFECT_SCALE + by * 22 * PLAYER_EFFECT_SCALE;
    ctx.save();
    ctx.fillStyle = p.dashT > 0 ? pal.accent3 : pal.accent;
    for (let i = -1; i <= 1; i++) {
      const ox = perpx * i * 7 * PLAYER_EFFECT_SCALE, oy = perpy * i * 7 * PLAYER_EFFECT_SCALE;
      ctx.globalAlpha = (0.24 - Math.abs(i) * 0.07) * (p.dashT > 0 ? 1.5 : 1);
      ctx.beginPath();
      ctx.moveTo(baseX + ox + perpx * 3, baseY + oy + perpy * 3);
      ctx.lineTo(baseX + ox + bx * len, baseY + oy + by * len);
      ctx.lineTo(baseX + ox - perpx * 3, baseY + oy - perpy * 3);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  for (let i = p.after.length - 1; i >= 0; i--) {
    const a = p.after[i];
    // dash afterimages burn brighter than the idle motion ghost — a vivid streak of you
    const aAlpha = clamp(a.life / (a.dash ? 0.22 : 0.16), 0, 1) * (a.dash ? 0.44 : 0.16);
    drawPlayerBody(ctx, a.x, a.y, a.face, pal, aAlpha, true, a.spin || 0,
      { speed: a.dash ? 520 : 120, moveFace: a.moveFace || a.face, animT: a.animT || 0, rail: a.rail });
  }
  if (p.dashT > 0) {
    const k = clamp(p.dashT / (p.dashDur || 0.001), 0, 1), ring = 1 - k;
    ctx.save(); ctx.translate(p.x, p.y - 20 * PLAYER_DRAW_SCALE);
    ctx.globalAlpha = 0.30 + 0.34 * Math.sin(ring * Math.PI);
    ctx.strokeStyle = pal.accent3; ctx.shadowColor = pal.accent3; ctx.shadowBlur = 20; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(0, 0, (42 + ring * 10) * PLAYER_EFFECT_SCALE, (12 + Math.sin(spin * 2) * 3) * PLAYER_EFFECT_SCALE, Math.sin(spin) * 0.10, 0, TAU); ctx.stroke();
    ctx.strokeStyle = pal.accent2; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, 7 * PLAYER_EFFECT_SCALE, (32 + ring * 8) * PLAYER_EFFECT_SCALE, 8 * PLAYER_EFFECT_SCALE, 0, 0, TAU); ctx.stroke();
    ctx.restore();
  }
  if (p.rail?.active) {
    const rocket = (p.rail.rocketT || 0) > 0;
    const dir = Math.atan2(p.vy || 0, p.vx || 0);
    ctx.save(); ctx.translate(p.x, p.y - 14 * PLAYER_DRAW_SCALE); ctx.rotate(dir);
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rocket ? '#ffffff' : pal.accent2; ctx.lineWidth = rocket ? 3 : 2;
    ctx.globalAlpha = rocket ? 0.75 : 0.42;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(-18 * PLAYER_EFFECT_SCALE, side * 18 * PLAYER_EFFECT_SCALE);
      ctx.lineTo(34 * PLAYER_EFFECT_SCALE, side * 26 * PLAYER_EFFECT_SCALE);
      ctx.stroke();
    }
    ctx.restore();
  }
  // companions (item visuals)
  if (p._orbitals) for (const o of p._orbitals) {
    if (o.x === undefined) continue;
    ctx.save();
    ctx.fillStyle = '#f3dcff'; ctx.shadowColor = '#f3dcff'; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.arc(o.x, o.y, 7, 0, TAU); ctx.fill();
    ctx.restore();
  }
  if (p._drones) for (const d of p._drones) {
    if (d.x === undefined) continue;
    ctx.save();
    ctx.fillStyle = '#ffd36e'; ctx.shadowColor = '#ffd36e'; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(d.x, d.y, 6, 0, TAU); ctx.fill();
    ctx.fillStyle = '#3a2c10';
    ctx.fillRect(d.x - 2, d.y - 2, 4, 4);
    ctx.restore();
  }
  if (p._cat) drawCat(ctx, p._cat.x, p._cat.y, 0.58, pal);
  drawRocketBoots(ctx, p, pose, pal);   // exhaust jets behind the boots → instant directionality
  drawPlayerBody(ctx, p.x, p.y, p.face, pal, 1, false, spin, pose);
  if (p.hurt > 0) {
    ctx.strokeStyle = pal.bad + 'cc'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(p.x, p.y, (42 + (1 - p.hurt / 0.42) * 28) * PLAYER_EFFECT_SCALE, 0, TAU); ctx.stroke();
  }
  if (p.inv > 0 && p.hurt <= 0) {
    ctx.strokeStyle = pal.accent3 + 'aa'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(p.x, p.y, (31 + Math.sin(performance.now() / 80) * 3) * PLAYER_EFFECT_SCALE, 0, TAU); ctx.stroke();
  }
  if (p.shield > 0) {
    ctx.strokeStyle = pal.accent + '99'; ctx.lineWidth = 2;
    for (let i = 0; i < p.shield; i++) { ctx.beginPath(); ctx.arc(p.x, p.y, (38 + i * 5) * PLAYER_EFFECT_SCALE, 0, TAU); ctx.stroke(); }
  }
}

// Rocket-boot exhaust: two jets from the feet pointing OPPOSITE travel. This is the
// clearest read of where Moots is going (a symmetric front-facing ghost can't show it
// with facing alone), and it's the whole point of "Rocket Shoes". Idle → soft hover
// jets straight down; speed lengthens them; dash/charge-pad make them blaze white-hot.
function drawRocketBoots(ctx, p, pose, pal) {
  if (reduced()) return;
  const sp = pose.speed || 0;
  let dx, dy;
  if (sp > 24) { const inv = 1 / sp; dx = -p.vx * inv; dy = -p.vy * inv; } // thrust opposes travel
  else { dx = 0; dy = 1; }                                                  // hover: jets point down
  const t = performance.now() / 1000;
  const k = clamp(sp / (PLAYER.SPEED * 1.4), 0, 1);
  const dash = pose.dash, charge = pose.surface === 'charge';
  const baseLen = (dash ? 50 : 12 + k * 34) * (charge ? 1.3 : 1) * PLAYER_EFFECT_SCALE;
  const core = dash ? '#ffffff' : charge ? '#eaffff' : '#fff2cf';
  const outer = dash ? pal.accent3 : charge ? pal.accent2 : pal.accent;
  const px = -dy, py = dx;
  const bootY = p.y + 17 * PLAYER_EFFECT_SCALE;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const side of [-1, 1]) {
    const ox = p.x + side * 8.5 * PLAYER_EFFECT_SCALE;
    const oy = bootY;
    const flick = 0.82 + Math.sin(t * 38 + side * 2) * 0.12 + Math.random() * 0.12;
    const len = baseLen * flick;
    const w = (dash ? 9 : 4.5 + k * 3.2) * PLAYER_EFFECT_SCALE;
    ctx.globalAlpha = 0.45 + k * 0.32 + (dash ? 0.2 : 0);
    ctx.fillStyle = outer; ctx.shadowColor = outer; ctx.shadowBlur = dash ? 18 : 9;
    flamePath(ctx, ox, oy, dx, dy, len, w, px, py); ctx.fill();
    ctx.shadowBlur = 0; ctx.globalAlpha = 0.8 + (dash ? 0.18 : 0);
    ctx.fillStyle = core;
    flamePath(ctx, ox, oy, dx, dy, len * 0.6, w * 0.55, px, py); ctx.fill();
  }
  ctx.restore();
}
function flamePath(ctx, ox, oy, dx, dy, len, w, px, py) {
  ctx.beginPath();
  ctx.moveTo(ox + px * w, oy + py * w);
  ctx.quadraticCurveTo(ox + dx * len * 0.5 + px * w * 0.7, oy + dy * len * 0.5 + py * w * 0.7, ox + dx * len, oy + dy * len);
  ctx.quadraticCurveTo(ox + dx * len * 0.5 - px * w * 0.7, oy + dy * len * 0.5 - py * w * 0.7, ox - px * w, oy - py * w);
  ctx.closePath();
}

export function drawPlayerBody(ctx, x, y, face, pal, alpha = 1, ghost = false, spinPhase = 0, pose = {}) {
  ctx.save(); ctx.globalAlpha = alpha;
  shadow(ctx, x, y + 18 * PLAYER_DRAW_SCALE, 20 * PLAYER_DRAW_SCALE, 7 * PLAYER_DRAW_SCALE, ghost ? 0.1 : 0.30);
  ctx.translate(x, y);
  const speed = pose.speed || 0;
  const moving = speed > 28 && !ghost;
  const k = clamp(speed / (PLAYER.SPEED * 1.5), 0, 1);
  // float higher when idle (ghost hover), pump faster when running
  const bob = ghost ? 0 : (moving ? Math.sin((pose.animT || 0) * 2.2) * (2.4 + k * 2.6) : Math.sin((pose.animT || 0) * 1.3) * 2.0);
  // strong bank into horizontal travel + a little rail shimmy
  const lean = ghost ? 0 : clamp((pose.vx || 0) / 700, -0.26, 0.26) + (pose.rail ? Math.sin((pose.animT || 0) * 7) * 0.05 : 0);
  ctx.translate(0, bob);
  ctx.rotate(lean);
  ctx.scale(PLAYER_DRAW_SCALE, PLAYER_DRAW_SCALE); // visual scale lives in config; collision stays separate
  const spinning = !ghost && Math.abs(spinPhase) > 0.001;
  if (moving && !spinning) drawStepAccents(ctx, pose, pal, k);
  const dressed = !ghost && state.save?.gotDressed && mootsDressed.ready;  // win cosmetic
  const bodyImg = dressed ? mootsDressed.img : moots.img;
  const bodyReady = dressed ? mootsDressed.ready : moots.ready;
  if (bodyReady && !ghost) {
    const yaw = Math.cos(spinPhase);
    const stepSquash = moving ? 1 + Math.sin((pose.animT || 0) * 2) * 0.025 : 1;
    // speed-stretch: streamline taller + narrower when fast, exaggerated on a dash
    const stretchY = 1 + k * 0.12 + (pose.dash ? 0.16 : 0);
    const squashX = 1 - k * 0.05;
    const sx = spinning ? (0.28 + 0.72 * Math.abs(yaw)) : (1 + k * 0.04) * squashX;
    // face the way you're running; face your aim when standing still
    const flip = spinning ? (yaw < 0 ? -1 : 1)
      : moving ? (Math.cos(pose.moveFace || 0) < -0.2 ? -1 : 1)
      : (Math.cos(pose.aim || 0) < -0.2 ? -1 : 1);
    ctx.save();
    ctx.scale(sx * flip, (1 + 0.035 * Math.sin(spinPhase * 2)) * stretchY / stepSquash);
    ctx.drawImage(bodyImg, -36, -72, 72, 106);
    ctx.restore();
    if (spinning) {
      ctx.save(); ctx.globalAlpha = alpha * 0.55;
      ctx.strokeStyle = pal.accent3; ctx.shadowColor = pal.accent3; ctx.shadowBlur = 14; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, -23, 37 * sx, 10, 0, 0, TAU); ctx.stroke();
      ctx.restore();
    }
    drawEmitter(ctx, face, pal);
  } else {
    // fallback blob until the sprite loads (Boon Moots index.html:1416)
    if (spinning) {
      const yaw = Math.cos(spinPhase);
      ctx.scale((0.35 + 0.65 * Math.abs(yaw)) * (yaw < 0 ? -1 : 1), 1 + 0.035 * Math.sin(spinPhase * 2));
    }
    ctx.fillStyle = ghost ? pal.accent : '#fff5f8';
    ctx.strokeStyle = '#05030a'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.ellipse(0, -8, 21, 27, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#05030a';
    ctx.beginPath(); ctx.arc(-8, -12, 4, 0, TAU); ctx.arc(8, -12, 4, 0, TAU); ctx.fill();
    ctx.fillStyle = pal.accent2;
    const step = moving ? Math.sin((pose.animT || 0) * 2) * 3 : 0;
    ctx.fillRect(-17, 19 + step, 14, 16); ctx.fillRect(4, 19 - step, 14, 16);
    drawEmitter(ctx, face, pal);
  }
  ctx.restore(); ctx.globalAlpha = 1;
}

function drawStepAccents(ctx, pose, pal, k) {
  const a = pose.animT || 0;
  const stride = 8 + k * 8;
  const step = Math.sin(a * 2);
  ctx.save();
  ctx.globalAlpha = 0.32 + k * 0.22;
  ctx.fillStyle = pose.rail ? pal.accent2 : pal.accent3;
  for (const side of [-1, 1]) {
    const sx = side * (11 + k * 4);
    const sy = 24 + side * step * stride;
    ctx.beginPath(); ctx.ellipse(sx, sy, 5.5, 2.3, 0, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = pose.vent ? 0.60 : 0.26;
  ctx.strokeStyle = pal.accent2; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(-18, 30); ctx.lineTo(18, 30 + Math.sin(a * 4) * 3); ctx.stroke();
  ctx.restore();
}

// Aim emitter: a chunky haunted blaster (concept panel 2) — cylinder body with
// glowing cyan chamber-windows, twin front barrels, a top loop, a tiny ghost
// emblem. Reads by SHAPE (colourblind-safe), biome-coloured energy, dark outline.
// Held at body level pointing where you aim; shots leave the barrel tips.
function drawEmitter(ctx, face, pal) {
  ctx.save();
  const emitterY = PLAYER.EMITTER_Y;
  const muzzleX = PLAYER.EMITTER_LEN;
  const twinY = PLAYER.TWIN_OFFSET;
  ctx.translate(0, emitterY); // art-space offset; outer DRAW_SCALE makes this match firePlayer
  ctx.rotate(face);
  ctx.lineJoin = 'round';
  const ink = '#0b0c14', metal = '#322b44', metalHi = '#4d4366', barrel = '#241f30';

  // top loop / hook
  ctx.strokeStyle = metalHi; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(4, -14, 4.5, Math.PI * 0.15, Math.PI * 1.85); ctx.stroke();

  // twin barrels at the muzzle
  ctx.strokeStyle = ink; ctx.lineWidth = 2;
  for (const sgn of [-1, 1]) {
    ctx.fillStyle = barrel;
    roundRectPath(ctx, muzzleX - 15, sgn * twinY - 3.4, 15, 6.8, 2); ctx.fill(); ctx.stroke();
  }

  // main cylinder body
  ctx.fillStyle = metal;
  roundRectPath(ctx, -9, -10, 28, 20, 7); ctx.fill(); ctx.stroke();
  ctx.fillStyle = metalHi; // top bevel
  roundRectPath(ctx, -6, -9, 22, 4.5, 3); ctx.fill();

  // glowing chamber windows (the "energy" — biome-coloured)
  ctx.shadowColor = pal.accent; ctx.shadowBlur = 7; ctx.fillStyle = pal.accent;
  for (const cx of [-3, 3, 9]) { roundRectPath(ctx, cx, -5, 3, 10, 1.5); ctx.fill(); }
  ctx.shadowBlur = 0;

  // tiny ghost emblem on the receiver
  ctx.fillStyle = hexA('#eef3ff', 0.85);
  ctx.beginPath(); ctx.arc(-3.5, 4, 2.4, Math.PI, 0); ctx.lineTo(-1.1, 7); ctx.lineTo(-3.5, 6); ctx.lineTo(-5.9, 7); ctx.closePath(); ctx.fill();

  // grip + muzzle tips
  ctx.fillStyle = barrel; ctx.strokeStyle = ink; ctx.lineWidth = 2;
  roundRectPath(ctx, -5, 9, 9, 7, 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = pal.accent; ctx.shadowColor = pal.accent; ctx.shadowBlur = 8;
  for (const sgn of [-1, 1]) { ctx.beginPath(); ctx.arc(muzzleX, sgn * twinY, 2.6, 0, TAU); ctx.fill(); }
  ctx.shadowBlur = 0;
  ctx.restore();
}

// Gigi (Boon Moots index.html:1420)
export function drawCat(ctx, x, y, s, pal) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  shadow(ctx, 0, 14, 20, 6, 0.25);
  ctx.fillStyle = '#11131b';
  ctx.beginPath(); ctx.ellipse(0, 0, 26, 18, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#f9f6ee';
  ctx.beginPath(); ctx.ellipse(-8, 1, 12, 16, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#11131b';
  ctx.beginPath();
  ctx.moveTo(-18, -10); ctx.lineTo(-10, -30); ctx.lineTo(-2, -9);
  ctx.moveTo(8, -9); ctx.lineTo(16, -30); ctx.lineTo(22, -8);
  ctx.fill();
  ctx.fillStyle = pal.accent3;
  ctx.beginPath(); ctx.arc(-7, -3, 2.8, 0, TAU); ctx.arc(9, -3, 2.8, 0, TAU); ctx.fill();
  ctx.restore();
}

// care / market objects
export function drawCare(ctx, c, pal) {
  const t = performance.now() / 1000;
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.globalAlpha = c.used ? 0.35 : 1;
  shadow(ctx, 0, 22, 26, 8, 0.28);
  const glow = c.used ? 0 : 10 + Math.sin(t * 2.4 + c.phase) * 5;
  ctx.shadowColor = c.kind === 'market' ? '#ffd47a' : '#9bffd1';
  ctx.shadowBlur = glow;
  if (c.kind === 'lamp') {
    ctx.strokeStyle = '#d8c979'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(0, 20); ctx.lineTo(0, -26); ctx.stroke();
    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath(); ctx.arc(0, -32, 9, 0, TAU); ctx.fill();
  } else if (c.kind === 'bench') {
    ctx.fillStyle = '#9b8c6a';
    ctx.fillRect(-24, -4, 48, 8);
    ctx.fillRect(-20, 4, 6, 14); ctx.fillRect(14, 4, 6, 14);
  } else if (c.kind === 'umbrella') {
    ctx.strokeStyle = '#b6a8d8'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, 22); ctx.lineTo(0, -18); ctx.stroke();
    ctx.fillStyle = pal.accent2;
    ctx.beginPath(); ctx.arc(0, -18, 22, Math.PI, TAU); ctx.fill();
  } else if (c.kind === 'pie') {
    ctx.fillStyle = '#e8b06a';
    ctx.beginPath(); ctx.ellipse(0, 0, 18, 11, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#a8763a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, -2, 13, 7, 0, 0, TAU); ctx.stroke();
  } else if (c.kind === 'market') {
    ctx.fillStyle = '#241a10';
    ctx.strokeStyle = '#ffd47a'; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(-22, 18); ctx.lineTo(0, -24); ctx.lineTo(22, 18); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffd47a';
    ctx.font = '900 14px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('1♥', 0, 10);
  }
  ctx.restore();
}

// ── enemies ─────────────────────────────────────────────────────────────────
// Glowing eyes give the object-monsters personality (adapted from Boon Moots'
// drawEnemyEyes, index.html:1387). A near-black body tint keyed to the biome.
function enemyEyes(ctx, x, y, rx, ry, color) {
  ctx.save();
  ctx.shadowColor = color; ctx.shadowBlur = 12; ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, -0.18, 0, TAU);
  ctx.ellipse(-x, y, rx, ry, 0.18, 0, TAU);
  ctx.fill();
  ctx.restore();
}
const darkOf = (pal) => mix(pal.bg, '#000000', 0.35);

export function drawEnemy(ctx, e, room) {
  const pal = room.biome.pal;
  shadow(ctx, e.x, e.y + e.r * 0.85, e.r * 1.15, e.r * 0.34, 0.26);
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.shadowColor = e.color; ctx.shadowBlur = e.captain ? 12 : 5;
  const flash = e.hit > 0;
  const body = flash ? '#ffffff' : e.color;     // boss case still uses this
  const dark = darkOf(pal);
  const A = pal.accent, B = pal.accent2;          // bright biome accents for detail/eyes

  switch (e.type) {
    case 'skitter': { // Pewling — twitchy little bug-body
      ctx.rotate(Math.sin(e.phase * 9) * 0.18);
      const s = e.r / 15;
      ctx.strokeStyle = e.color; ctx.globalAlpha = 0.7; ctx.lineWidth = 3;
      for (let k = -1; k <= 1; k++) {
        ctx.beginPath();
        ctx.moveTo(-6 * s, k * 6 * s); ctx.lineTo(-25 * s, k * 11 * s + Math.sin(e.phase * 8 + k) * 4);
        ctx.moveTo(6 * s, k * 6 * s); ctx.lineTo(25 * s, k * 11 * s - Math.sin(e.phase * 8 + k) * 4);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = dark; ctx.beginPath(); ctx.arc(0, 0, e.r, 0, TAU); ctx.fill();
      ctx.fillStyle = e.color; ctx.beginPath(); ctx.arc(0, 0, e.r * 0.62, 0, TAU); ctx.fill();
      enemyEyes(ctx, -5 * s, -3 * s, 4, 3, B);
      break;
    }
    case 'gunner': { // Censer — squat incense/shrine box trailing smoke
      ctx.rotate(Math.sin(e.phase * 1.3) * 0.12);
      const s = e.r / 18;
      ctx.fillStyle = dark; ctx.strokeStyle = e.color; ctx.lineWidth = 3;
      roundRectPath(ctx, -20 * s, -24 * s, 40 * s, 44 * s, 8 * s); ctx.fill(); ctx.stroke();
      ctx.fillStyle = e.color; roundRectPath(ctx, -12 * s, -14 * s, 24 * s, 26 * s, 5 * s); ctx.fill();
      ctx.fillStyle = dark; roundRectPath(ctx, 4 * s, -4 * s, 22 * s, 8 * s, 4 * s); ctx.fill();
      ctx.globalAlpha = 0.33; ctx.strokeStyle = B; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, -24 * s); ctx.bezierCurveTo(-16 * s, -44 * s, 17 * s, -46 * s, 0, -66 * s); ctx.stroke();
      ctx.globalAlpha = 1;
      enemyEyes(ctx, -6 * s, 2 * s, 4, 3, B);
      break;
    }
    case 'charger': { // Ramwraith — sharp triangular charger with motion streaks
      const dir = (e.state === 'windup' || e.state === 'dash') ? { x: e.chargeX || e.vx, y: e.chargeY || e.vy } : { x: e.vx, y: e.vy };
      if (e.state === 'windup') {
        ctx.save(); ctx.rotate(Math.atan2(e.chargeY || e.vy, e.chargeX || e.vx));
        ctx.globalAlpha = 0.4 + 0.3 * Math.sin(e.phase * 30);
        ctx.strokeStyle = pal.bad; ctx.lineWidth = 3; ctx.setLineDash([10, 8]);
        ctx.beginPath(); ctx.moveTo(e.r, 0); ctx.lineTo(e.r + 320, 0); ctx.stroke();
        ctx.restore();
      }
      const moving = Math.hypot(dir.x, dir.y) > 30 || e.state === 'dash';
      ctx.rotate(moving ? Math.atan2(dir.y, dir.x) + Math.PI / 2 : Math.sin(e.phase) * 0.12);
      const s = e.r / 24;
      for (let i = 0; i < 3; i++) { // motion streaks
        ctx.globalAlpha = 0.18; ctx.fillStyle = e.color;
        ctx.beginPath(); ctx.moveTo(-14 * s, -20 * s - i * 11 * s); ctx.lineTo(14 * s, -20 * s - i * 11 * s); ctx.lineTo(0, -48 * s - i * 16 * s); ctx.closePath(); ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = e.color; ctx.strokeStyle = '#ffffffcc'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, -34 * s); ctx.lineTo(24 * s, 19 * s); ctx.lineTo(-24 * s, 19 * s); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff4e8'; ctx.fillRect(-14 * s, -7 * s, 28 * s, 8 * s); ctx.fillRect(-19 * s, 9 * s, 38 * s, 7 * s);
      ctx.fillStyle = dark; roundRectPath(ctx, -17 * s, 4 * s, 34 * s, 17 * s, 5 * s); ctx.fill();
      enemyEyes(ctx, -7 * s, 11 * s, 5, 4, B);
      break;
    }
    case 'turret': { // Lectern — haunted book stand / altar (stationary)
      const s = e.r / 20;
      ctx.fillStyle = dark; ctx.strokeStyle = e.color; ctx.lineWidth = 3;
      roundRectPath(ctx, -25 * s, -19 * s, 50 * s, 38 * s, 8 * s); ctx.fill(); ctx.stroke();
      ctx.fillStyle = e.color; ctx.globalAlpha = 0.9; roundRectPath(ctx, -18 * s, -13 * s, 36 * s, 22 * s, 5 * s); ctx.fill(); ctx.globalAlpha = 1;
      ctx.strokeStyle = dark; ctx.lineWidth = 2;
      for (let y = -7; y < 8; y += 6) { ctx.beginPath(); ctx.moveTo(-12 * s, y * s); ctx.lineTo(12 * s, y * s); ctx.stroke(); }
      ctx.strokeStyle = B; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-9 * s, 20 * s); ctx.lineTo(-16 * s, 38 * s); ctx.moveTo(9 * s, 20 * s); ctx.lineTo(16 * s, 38 * s); ctx.stroke();
      break;
    }
    case 'brute': { // Ox-Warden — heavy horned brute
      const s = e.r / 34;
      ctx.fillStyle = dark; ctx.strokeStyle = e.color; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.ellipse(0, 2 * s, e.r * 1.05, e.r * 0.82, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = B; ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(-18 * s, -18 * s); ctx.quadraticCurveTo(-40 * s, -36 * s, -54 * s, -20 * s);
      ctx.moveTo(18 * s, -18 * s); ctx.quadraticCurveTo(40 * s, -36 * s, 54 * s, -20 * s); ctx.stroke();
      ctx.fillStyle = e.color; ctx.beginPath(); ctx.arc(0, 0, e.r * 0.38, 0, TAU); ctx.fill();
      enemyEyes(ctx, -10 * s, -7 * s, 6, 5, B);
      break;
    }
    case 'sniper': { // Long Candle — tall candle with a flaring flame
      const s = e.r / 17;
      const aim = e.aimT > 0;
      if (aim && e.snipeX !== undefined) {
        ctx.save(); ctx.rotate(Math.atan2(e.snipeY, e.snipeX));
        ctx.globalAlpha = 0.35; ctx.strokeStyle = pal.bad; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(960, 0); ctx.stroke(); ctx.restore();
      }
      ctx.fillStyle = dark; ctx.strokeStyle = aim ? pal.bad : e.color; ctx.lineWidth = 3;
      roundRectPath(ctx, -10 * s, -34 * s, 20 * s, 56 * s, 8 * s); ctx.fill(); ctx.stroke();
      const flame = 1 + Math.sin(e.phase * 12) * 0.15;
      ctx.fillStyle = aim ? pal.bad : B;
      ctx.beginPath(); ctx.ellipse(0, -43 * s, 7 * flame * s, 13 * flame * s, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = e.color; ctx.globalAlpha = 0.7; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-22 * s, -2 * s); ctx.lineTo(22 * s, -2 * s); ctx.stroke(); ctx.globalAlpha = 1;
      enemyEyes(ctx, -4 * s, -12 * s, 3, 3, A);
      break;
    }
    case 'hexer': { // Antiphon — rotating ritual wheel / glyph
      const s = e.r / 19;
      ctx.rotate(e.phase * 0.6);
      ctx.strokeStyle = e.color; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, e.r * 0.95, 0, TAU); ctx.stroke();
      for (let k = 0; k < 6; k++) {
        const a = k * TAU / 6;
        ctx.beginPath(); ctx.moveTo(Math.cos(a) * e.r * 0.45, Math.sin(a) * e.r * 0.45); ctx.lineTo(Math.cos(a) * e.r * 1.2, Math.sin(a) * e.r * 1.2); ctx.stroke();
      }
      ctx.fillStyle = dark; ctx.beginPath(); ctx.arc(0, 0, e.r * 0.7, 0, TAU); ctx.fill();
      ctx.fillStyle = e.color; ctx.beginPath(); ctx.arc(0, 0, e.r * 0.32, 0, TAU); ctx.fill();
      enemyEyes(ctx, -5 * s, -3 * s, 3, 3, B);
      break;
    }
    case 'myrmidon': { // Crown-Sworn — crowned triangular knight
      const s = e.r / 23;
      const a = Math.hypot(e.vx, e.vy) > 40 ? Math.atan2(e.vy, e.vx) + Math.PI / 2 : Math.sin(e.phase) * 0.16;
      ctx.rotate(a);
      ctx.fillStyle = dark; ctx.strokeStyle = e.color; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, -32 * s); ctx.lineTo(25 * s, 20 * s); ctx.lineTo(-25 * s, 20 * s); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = B; // crown
      ctx.beginPath();
      ctx.moveTo(-17 * s, -35 * s); ctx.lineTo(-7 * s, -23 * s); ctx.lineTo(0, -38 * s); ctx.lineTo(7 * s, -23 * s); ctx.lineTo(17 * s, -35 * s); ctx.lineTo(12 * s, -18 * s); ctx.lineTo(-12 * s, -18 * s);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = A; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 18 * s); ctx.lineTo(0, 42 * s); ctx.stroke();
      enemyEyes(ctx, -7 * s, 3 * s, 4, 4, B);
      break;
    }
    case 'boss': {
      const t = performance.now() / 1000;
      ctx.shadowBlur = 26;
      ctx.strokeStyle = body; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, e.r, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, e.r * 0.72, 0, TAU); ctx.stroke();
      ctx.fillStyle = body; ctx.globalAlpha = 0.22;
      ctx.beginPath(); ctx.arc(0, 0, e.r, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
      if (e.bossId === 'archon' || e.bossId === 'falseMoon') {
        ctx.save(); ctx.rotate(t * 0.18);
        ctx.fillStyle = body;
        starPath(ctx, 0, 0, e.r * 0.52, e.r * 0.22, 6); ctx.fill();
        ctx.restore();
        for (let k = 0; k < 4; k++) {
          const a = t * 0.6 + (k / 4) * TAU;
          ctx.beginPath(); ctx.arc(Math.cos(a) * e.r * 0.86, Math.sin(a) * e.r * 0.86, 4, 0, TAU);
          ctx.fillStyle = body; ctx.fill();
        }
      } else if (e.bossId === 'spiggot') {
        ctx.fillStyle = body;
        ctx.beginPath(); ctx.ellipse(0, -e.r * 0.18, e.r * 0.5, e.r * 0.34, 0, Math.PI, TAU); ctx.fill();
        ctx.strokeStyle = body; ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, e.r * 0.5); ctx.stroke();
        for (let k = 0; k < 5; k++) {
          const a = t * 0.9 + (k / 5) * TAU;
          ctx.beginPath(); ctx.arc(Math.cos(a) * e.r * 0.6, Math.sin(a) * e.r * 0.6, 3, 0, TAU); ctx.fill();
        }
      } else { // warden
        ctx.save(); ctx.rotate(Math.atan2(e.vy, e.vx));
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.moveTo(e.r * 0.55, 0); ctx.lineTo(-e.r * 0.2, -e.r * 0.3); ctx.lineTo(-e.r * 0.2, e.r * 0.3);
        ctx.closePath(); ctx.fill();
        ctx.restore();
        ctx.beginPath(); ctx.moveTo(0, -e.r * 1.05); ctx.lineTo(-7, -e.r * 0.8); ctx.lineTo(7, -e.r * 0.8); ctx.closePath();
        ctx.fillStyle = body; ctx.fill();
      }
      break;
    }
    default: {
      ctx.fillStyle = body;
      ctx.beginPath(); ctx.arc(0, 0, e.r, 0, TAU); ctx.fill();
    }
  }
  if (flash && e.type !== 'boss') { // white pop on hit, shape-agnostic
    ctx.globalAlpha = clamp(e.hit / 0.11, 0, 1) * 0.55;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(0, 0, e.r * 1.12, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  // Warden's rotating shield: an armour arc with one open GAP. Aim/dash through the
  // gap (the opening) — hits anywhere else spark off (combat.js).
  if (e.shield) {
    const sr = e.r + 16, gap = e.gapHalf || 0.6, spark = (e.shieldSpark || 0) > 0;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = spark ? '#ffffff' : hexA('#ffe27d', 0.7);
    ctx.shadowColor = '#ffe27d'; ctx.shadowBlur = spark ? 16 : 8;
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(e.x, e.y, sr, e.shieldAngle + gap, e.shieldAngle + TAU - gap); ctx.stroke();
    // little arrow at the gap so the opening reads as "shoot here"
    ctx.globalAlpha = 0.8; ctx.strokeStyle = hexA('#ffffff', 0.85); ctx.lineWidth = 2.4; ctx.shadowBlur = 0;
    const ga = e.shieldAngle, gx = e.x + Math.cos(ga) * sr, gy = e.y + Math.sin(ga) * sr;
    ctx.beginPath(); ctx.arc(gx, gy, 7, 0, TAU); ctx.stroke();
    ctx.restore();
  }

  // staggered: reeling from a dash blow — woozy stun-stars orbit the head, a clear
  // "off-balance, finish me" read that sets up the satisfying kill.
  if (!e.boss && e.stun > 0.12) {
    const t = performance.now() / 1000;
    ctx.save();
    ctx.globalAlpha = Math.min(1, e.stun / 0.35) * 0.95;
    ctx.fillStyle = '#ffffff'; ctx.shadowColor = '#bdfcff'; ctx.shadowBlur = 8;
    for (let i = 0; i < 3; i++) {
      const a = t * 7 + (i / 3) * TAU;
      starPath(ctx, e.x + Math.cos(a) * e.r * 0.8, e.y - e.r - 7 + Math.sin(a) * 3.5, 3.4, 1.5, 5);
      ctx.fill();
    }
    ctx.restore();
  }

  if (e.captain) {
    // elite threat tag — reads as "this one's dangerous", not the enemy's name:
    // a diamond marker + a small dim label
    ctx.save();
    ctx.textAlign = 'center';
    const ty = e.y - e.r * 1.7;
    ctx.fillStyle = e.color; ctx.shadowColor = e.color; ctx.shadowBlur = 8;
    ctx.beginPath(); // marker diamond
    ctx.moveTo(e.x, ty - 11); ctx.lineTo(e.x + 5, ty - 6); ctx.lineTo(e.x, ty - 1); ctx.lineTo(e.x - 5, ty - 6);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 0.8;
    ctx.font = '800 9px Inter, system-ui, sans-serif';
    ctx.fillText(e.captain.toUpperCase(), e.x, ty + 11);
    ctx.restore();
  }
  if (e.maxHp > 6 && e.hp < e.maxHp) {
    const w = e.r * 1.8;
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.fillRect(e.x - w / 2, e.y - e.r - 12, w, 4);
    ctx.fillStyle = e.color;
    ctx.fillRect(e.x - w / 2, e.y - e.r - 12, w * clamp(e.hp / e.maxHp, 0, 1), 4);
  }
}

// ── obstacles ───────────────────────────────────────────────────────────────
const STYLE_GROUPS = {
  rootStone: 'stone', boneMound: 'stone', fenStump: 'stump', slagHeart: 'stump',
  glassNode: 'glass', bloomBulb: 'bloom', mycoCap: 'bloom',
  machineHub: 'machine', kilnPillar: 'machine',
  archivePillar: 'idol', basilicaIdol: 'idol',
  boundary: 'boundary', door: 'door', wall: 'wall', ledge: 'wall',
};

export function drawObstacle(ctx, o, room) {
  if (o.gone || o.ledge) return; // tier ledges are rendered as part of the platform (drawTiers)
  const pal = room.biome.pal;
  const group = STYLE_GROUPS[o.style] || 'stone';
  const sh = o.shake = Math.max(0, (o.shake || 0) - 0.016);
  const jx = sh > 0 ? (Math.random() - 0.5) * 6 : 0;
  const jy = sh > 0 ? (Math.random() - 0.5) * 6 : 0;
  ctx.save();
  ctx.translate(jx, jy);

  if (group === 'boundary') {
    ctx.fillStyle = pal.bg;
    ctx.strokeStyle = pal.accent3; ctx.lineWidth = 2;
    roundRectPath(ctx, o.x, o.y, o.w, o.h, 4); ctx.fill(); ctx.stroke();
    ctx.restore();
    return;
  }
  if (group === 'wall') {
    // architectural partition: solid slab with a lit cap edge + drop shadow
    shadow(ctx, o.x + o.w / 2, o.y + o.h + 4, o.w / 2, 7, 0.32);
    const horizontal = o.w >= o.h;
    const g = horizontal
      ? ctx.createLinearGradient(0, o.y, 0, o.y + o.h)
      : ctx.createLinearGradient(o.x, 0, o.x + o.w, 0);
    g.addColorStop(0, mix(pal.floor, '#ffffff', 0.10));
    g.addColorStop(0.5, pal.floor);
    g.addColorStop(1, pal.bg);
    ctx.fillStyle = g;
    roundRectPath(ctx, o.x, o.y, o.w, o.h, 5); ctx.fill();
    ctx.strokeStyle = pal.accent3; ctx.lineWidth = 2;
    ctx.stroke();
    // lit top edge
    ctx.strokeStyle = mix(pal.accent, '#ffffff', 0.3);
    ctx.globalAlpha = 0.5; ctx.lineWidth = 2;
    ctx.beginPath();
    if (horizontal) { ctx.moveTo(o.x + 4, o.y + 1.5); ctx.lineTo(o.x + o.w - 4, o.y + 1.5); }
    else { ctx.moveTo(o.x + 1.5, o.y + 4); ctx.lineTo(o.x + 1.5, o.y + o.h - 4); }
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();
    return;
  }
  if (group === 'door') {
    const cracked = o.hp < 5;
    const horizontal = o.w >= o.h;
    const g = horizontal ? ctx.createLinearGradient(0, o.y, 0, o.y + o.h) : ctx.createLinearGradient(o.x, 0, o.x + o.w, 0);
    g.addColorStop(0, mix(pal.bg, pal.accent2, 0.18));
    g.addColorStop(0.5, mix(pal.floor, '#000000', 0.38));
    g.addColorStop(1, mix(pal.bg, '#000000', 0.22));
    ctx.fillStyle = g;
    ctx.strokeStyle = pal.accent2; ctx.lineWidth = 2.4;
    roundRectPath(ctx, o.x, o.y, o.w, o.h, 5); ctx.fill(); ctx.stroke();
    // locking ribs: reads as a sealed mechanism instead of a placeholder rectangle
    ctx.globalAlpha = 0.55; ctx.strokeStyle = '#fff7ff'; ctx.lineWidth = 1.6;
    const ribs = 4;
    for (let i = 1; i <= ribs; i++) {
      const f = i / (ribs + 1);
      ctx.beginPath();
      if (horizontal) { ctx.moveTo(o.x + o.w * f, o.y + 4); ctx.lineTo(o.x + o.w * f, o.y + o.h - 4); }
      else { ctx.moveTo(o.x + 4, o.y + o.h * f); ctx.lineTo(o.x + o.w - 4, o.y + o.h * f); }
      ctx.stroke();
    }
    ctx.globalAlpha = 0.85; ctx.strokeStyle = pal.accent3; ctx.lineWidth = 2;
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2, rr = Math.min(o.w, o.h) * 0.28;
    ctx.beginPath(); ctx.arc(cx, cy, Math.max(5, rr), 0, TAU); ctx.stroke();
    // mechanical iris lock — no placeholder cross/X language.
    ctx.beginPath(); ctx.arc(cx, cy, Math.max(3, rr * 0.36), 0, TAU); ctx.stroke();
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a - 0.16) * rr * 0.55, cy + Math.sin(a - 0.16) * rr * 0.55);
      ctx.lineTo(cx + Math.cos(a) * rr * 0.30, cy + Math.sin(a) * rr * 0.30);
      ctx.lineTo(cx + Math.cos(a + 0.16) * rr * 0.55, cy + Math.sin(a + 0.16) * rr * 0.55);
      ctx.stroke();
    }
    if (cracked) {
      ctx.strokeStyle = '#ffffff'; ctx.globalAlpha = 0.72; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(o.x + o.w * 0.28, o.y + o.h * 0.16);
      ctx.lineTo(o.x + o.w * 0.47, o.y + o.h * 0.58);
      ctx.lineTo(o.x + o.w * 0.68, o.y + o.h * 0.86);
      ctx.moveTo(o.x + o.w * 0.48, o.y + o.h * 0.58);
      ctx.lineTo(o.x + o.w * 0.36, o.y + o.h * 0.82);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  const cx = o.type === 'circle' ? o.x : o.x + o.w / 2;
  const cy = o.type === 'circle' ? o.y : o.y + o.h / 2;
  const cr = o.type === 'circle' ? o.rad : Math.min(o.w, o.h) / 2;
  shadow(ctx, cx, cy + cr * 0.8, cr * 1.2, cr * 0.3, 0.3);

  ctx.fillStyle = pal.floor;
  ctx.strokeStyle = pal.accent3; ctx.lineWidth = 2.5;
  if (o.type === 'circle') {
    ctx.beginPath(); ctx.arc(o.x, o.y, o.rad, 0, TAU); ctx.fill(); ctx.stroke();
  } else {
    roundRectPath(ctx, o.x, o.y, o.w, o.h, o.round || 12); ctx.fill(); ctx.stroke();
  }

  const tt = performance.now() / 1000;
  // Shape-language pass: every obstacle family gets a readable silhouette/detail
  // instead of the old generic box-with-mark look.
  if (o.type !== 'circle') {
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = '#ffffff';
    roundRectPath(ctx, o.x + 7, o.y + 6, Math.max(2, o.w - 14), Math.min(12, o.h * 0.22), Math.min(7, o.round || 8)); ctx.fill();
    ctx.restore();
  }

  ctx.globalAlpha = 0.88;
  if (group === 'glass') {
    const vault = o.species === 'mirrorVault';
    if (vault) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, cr * 1.25);
      glow.addColorStop(0, hexA('#bfe8ff', 0.22));
      glow.addColorStop(0.68, hexA(pal.accent2, 0.10));
      glow.addColorStop(1, hexA(pal.accent2, 0));
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(cx, cy, cr * 1.25, 0, TAU); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = '#eaffff'; ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        const a = tt * 0.4 + i * TAU / 6;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * cr * 0.20, cy + Math.sin(a) * cr * 0.20);
        ctx.lineTo(cx + Math.cos(a + 0.22) * cr * 0.78, cy + Math.sin(a + 0.22) * cr * 0.78); ctx.stroke();
      }
      ctx.globalAlpha = 0.58; ctx.strokeStyle = pal.accent3; ctx.setLineDash([10, 10]); ctx.lineDashOffset = -tt * 55;
      ctx.beginPath(); ctx.arc(cx, cy, cr * 0.72, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      ctx.globalAlpha = 0.95;
    } else {
      ctx.strokeStyle = o.volatile ? '#bfe8ff' : pal.accent;
      ctx.lineWidth = 1.7;
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + i * TAU / 5 + (o.phase || 0) * 0.05;
        const r1 = cr * (i % 2 ? 0.18 : 0.28), r2 = cr * (0.58 + (i % 2) * 0.16);
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
        ctx.lineTo(cx + Math.cos(a + 0.35) * r2, cy + Math.sin(a + 0.35) * r2); ctx.stroke();
      }
      if (o.volatile) {
        ctx.shadowColor = '#bfe8ff'; ctx.shadowBlur = 14;
        ctx.fillStyle = '#bfe8ff';
        ctx.beginPath(); ctx.arc(cx, cy, cr * 0.3 + Math.sin(tt * 5) * 2, 0, TAU); ctx.fill();
      }
    }
  } else if (group === 'bloom') {
    ctx.fillStyle = mix(pal.accent, '#ffffff', 0.12);
    const petals = 6;
    for (let i = 0; i < petals; i++) {
      const a = i * TAU / petals + Math.sin(tt + (o.phase || 0)) * 0.04;
      ctx.beginPath();
      ctx.ellipse(cx + Math.cos(a) * cr * 0.24, cy + Math.sin(a) * cr * 0.12 - cr * 0.12,
        cr * 0.22, cr * 0.44, a, 0, TAU);
      ctx.fill();
    }
    ctx.strokeStyle = pal.accent3; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(cx, cy - cr * 0.18); ctx.lineTo(cx, cy + cr * 0.54); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy - cr * 0.15, cr * 0.18, 0, TAU); ctx.stroke();
  } else if (group === 'machine') {
    ctx.strokeStyle = pal.accent; ctx.lineWidth = 1.7;
    const pad = cr * 0.50;
    roundRectPath(ctx, cx - pad, cy - pad * 0.72, pad * 2, pad * 1.44, 6); ctx.stroke();
    ctx.globalAlpha = 0.62;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath(); ctx.moveTo(cx - pad * 0.72, cy + i * pad * 0.22); ctx.lineTo(cx + pad * 0.72, cy + i * pad * 0.22); ctx.stroke();
    }
    ctx.globalAlpha = 0.90; ctx.fillStyle = pal.accent;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      ctx.beginPath(); ctx.arc(cx + sx * pad * 0.55, cy + sy * pad * 0.42, 2.2, 0, TAU); ctx.fill();
    }
    ctx.beginPath(); ctx.arc(cx, cy, 3.2 + Math.sin(tt * 4 + (o.phase || 0)) * 0.6, 0, TAU); ctx.fill();
  } else if (group === 'idol') {
    ctx.strokeStyle = pal.accent2; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.arc(cx, cy - cr * 0.18, cr * 0.36, Math.PI * 0.08, Math.PI * 1.92); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - cr * 0.64); ctx.lineTo(cx - cr * 0.25, cy + cr * 0.34); ctx.lineTo(cx + cr * 0.25, cy + cr * 0.34); ctx.closePath(); ctx.stroke();
    ctx.globalAlpha = 0.62; ctx.fillStyle = pal.accent3;
    ctx.beginPath(); ctx.arc(cx - cr * 0.12, cy - cr * 0.18, 2.2, 0, TAU); ctx.arc(cx + cr * 0.12, cy - cr * 0.18, 2.2, 0, TAU); ctx.fill();
  } else if (group === 'stump') {
    ctx.strokeStyle = pal.accent3; ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(cx, cy, cr * (0.25 + i * 0.17), 0, TAU); ctx.stroke(); }
    ctx.globalAlpha = 0.62; ctx.strokeStyle = pal.accent;
    for (let i = 0; i < 4; i++) {
      const a = i * TAU / 4 + (o.phase || 0);
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * cr * 0.25, cy + Math.sin(a) * cr * 0.25);
      ctx.lineTo(cx + Math.cos(a) * cr * 0.76, cy + Math.sin(a) * cr * 0.76); ctx.stroke();
    }
  } else { // stone / rubble: faceted slab, not a signpost
    ctx.strokeStyle = pal.accent3; ctx.lineWidth = 1.45;
    ctx.beginPath();
    ctx.moveTo(cx - cr * 0.52, cy + cr * 0.15);
    ctx.lineTo(cx - cr * 0.18, cy - cr * 0.42);
    ctx.lineTo(cx + cr * 0.42, cy - cr * 0.24);
    ctx.lineTo(cx + cr * 0.30, cy + cr * 0.34);
    ctx.lineTo(cx - cr * 0.18, cy + cr * 0.44);
    ctx.closePath(); ctx.stroke();
    ctx.globalAlpha = 0.45; ctx.beginPath(); ctx.moveTo(cx - cr * 0.18, cy - cr * 0.42); ctx.lineTo(cx + cr * 0.05, cy + cr * 0.18); ctx.lineTo(cx + cr * 0.42, cy - cr * 0.24); ctx.stroke();
  }
  ctx.globalAlpha = 1;

  if (o.breakable && o.species !== 'volatileShard') {
    ctx.strokeStyle = o.species === 'mirrorVault' ? '#eaffff' : pal.accent2;
    ctx.globalAlpha = o.species === 'mirrorVault' ? 0.72 : 0.48;
    ctx.lineWidth = 1.25;
    if (o.type === 'circle') {
      ctx.beginPath(); ctx.arc(o.x, o.y, o.rad * 0.76, 0, TAU); ctx.stroke();
      ctx.globalAlpha *= 0.75;
      ctx.beginPath();
      ctx.moveTo(o.x - o.rad * 0.18, o.y - o.rad * 0.62);
      ctx.lineTo(o.x + o.rad * 0.06, o.y - o.rad * 0.16);
      ctx.lineTo(o.x - o.rad * 0.12, o.y + o.rad * 0.18);
      ctx.moveTo(o.x + o.rad * 0.12, o.y - o.rad * 0.10);
      ctx.lineTo(o.x + o.rad * 0.38, o.y + o.rad * 0.50);
      ctx.stroke();
    } else {
      // irregular fracture lines, not a UI cross
      ctx.beginPath();
      ctx.moveTo(o.x + o.w * 0.22, o.y + o.h * 0.18);
      ctx.lineTo(o.x + o.w * 0.42, o.y + o.h * 0.46);
      ctx.lineTo(o.x + o.w * 0.35, o.y + o.h * 0.78);
      ctx.moveTo(o.x + o.w * 0.44, o.y + o.h * 0.46);
      ctx.lineTo(o.x + o.w * 0.68, o.y + o.h * 0.30);
      ctx.lineTo(o.x + o.w * 0.78, o.y + o.h * 0.62);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

// ── shared paths ────────────────────────────────────────────────────────────
function hexA(hex, a) {
  const h = hex.replace('#', '');
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
}

export function mix(a, b, t) {
  const pa = parseInt(a.replace('#', ''), 16), pb = parseInt(b.replace('#', ''), 16);
  const ar = (pa >> 16) & 255, ag = (pa >> 8) & 255, ab = pa & 255;
  const br = (pb >> 16) & 255, bg = (pb >> 8) & 255, bb = pb & 255;
  const r = Math.round(ar + (br - ar) * t), g = Math.round(ag + (bg - ag) * t), bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r},${g},${bl})`;
}

export function roundRectPath(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function starPath(ctx, x, y, r1, r2, n) {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    const r = i % 2 ? r2 : r1;
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.closePath();
}

export function heartPath(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.42);
  ctx.bezierCurveTo(x - s * 1.25, y - s * 0.24, x - s * 0.72, y - s * 0.95, x, y - s * 0.45);
  ctx.bezierCurveTo(x + s * 0.72, y - s * 0.95, x + s * 1.25, y - s * 0.24, x, y + s * 0.42);
}

export function hexPath(ctx, x, y, r) {
  ctx.beginPath();
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU;
    k ? ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.closePath();
}
