// In-room score shop: a single tempting graft kiosk per room. It uses the same
// item pool as drafts, but costs points so the combo/score loop has an immediate
// tactical spend inside the level.
import { state } from '../state.js';
import { dist, rand, pick, clamp } from '../rng.js';
import { itemById } from '../data/items.js';
import { chooseCards, grantItem } from './draft.js';
import { addFloat, burst, ripple } from '../render/particles.js';
import { addFlash, addShake, haptic } from './juice.js';
import { sfx } from '../audio/sfx.js';

export function seedRoomShop(room, rng, run, px, py, portalX, portalY) {
  if (!run?.player || room.bossId) return false;
  const stock = chooseCards(3);
  if (!stock.length) return false;
  // Closer to Claude's vendor: a readable score sink that pays out a surprise graft
  // when you physically cut through it. Cost is simple and consistent; the stock is
  // rolled up front so the room stays deterministic.
  const cost = Math.round((260 + room.round * 72) / 10) * 10;
  const anchors = [
    { x: px + room.w * 0.16, y: py - room.h * 0.10 },
    { x: px - room.w * 0.16, y: py - room.h * 0.10 },
    { x: room.w * 0.5, y: room.h * 0.47 },
    { x: portalX + room.w * 0.13, y: portalY + room.h * 0.18 },
    { x: portalX - room.w * 0.13, y: portalY + room.h * 0.18 },
  ];
  for (let tries = 0; tries < 72; tries++) {
    const a = tries < anchors.length ? anchors[tries] : pick(rng, anchors);
    const x = clampShop(a.x + rand(rng, -175, 175), room.wall + 130, room.w - room.wall - 130);
    const y = clampShop(a.y + rand(rng, -135, 135), room.wall + 130, room.h - room.wall - 150);
    if (dist(x, y, px, py) < 300 || dist(x, y, portalX, portalY) < 180 || blocked(room, x, y, 96)) continue;
    room.shop = {
      x, y, r: 54, itemId: stock[0].id, stock: stock.map(i => i.id), cost, bought: false,
      phase: rng() * Math.PI * 2, bump: 0, denyT: 0, soldT: 0, hotT: 0, cutT: 0, dashLatch: false,
    };
    room.landmarks?.push({ kind: 'shop', x, y });
    return true;
  }
  return false;
}

export function updateShop(room, dt) {
  const shop = room?.shop;
  if (!shop) return;
  shop.bump = Math.max(0, (shop.bump || 0) - dt);
  shop.denyT = Math.max(0, (shop.denyT || 0) - dt);
  shop.soldT = Math.max(0, (shop.soldT || 0) - dt);
  shop.hotT = Math.max(0, (shop.hotT || 0) - dt);
  shop.cutT = Math.max(0, (shop.cutT || 0) - dt);
  if (shop.bought) return;

  const p = state.run?.player;
  if (!p || state.mode !== 'play') return;
  const d = dist(p.x, p.y, shop.x, shop.y);
  shop.inRange = !shop.bought && d < shop.r + p.r + 92;
  if (d > shop.r + p.r + 82) shop.dashLatch = false;
  // Path-based dash contact fixes the “I dashed through it but it didn't buy” miss
  // that can happen when a fast frame lands just beyond the kiosk center.
  if (dashTouchesShop(p, shop) && !shop.dashLatch) {
    shop.dashLatch = true;
    shop.cutT = 0.26;
    shop.hotT = Math.max(shop.hotT || 0, 0.30);
    tryBuyShop(null, { dash: true });
  }
}

export function tryBuyShop(pointer = null, opts = {}) {
  const room = state.room, run = state.run, p = run?.player, shop = room?.shop;
  if (!room || !run || !p || !shop || shop.bought || state.mode !== 'play') return false;
  const pointerHit = pointer ? dist(pointer.x, pointer.y, shop.x, shop.y) < shop.r + 48 : false;
  if (pointer && !pointerHit) return false;
  const d = dist(p.x, p.y, shop.x, shop.y);
  const dashHit = !!opts.dash || dashTouchesShop(p, shop);
  const near = d < shop.r + p.r + 84;
  if (!near && !dashHit) {
    if (pointerHit) {
      shop.bump = 0.22; shop.denyT = 0.28;
      addFloat(room, shop.x, shop.y - 58, '↘', '#bdfcff', false, 0.42);
      sfx('break');
      return true;
    }
    return false;
  }
  shop.hotT = Math.max(shop.hotT || 0, dashHit ? 0.34 : 0.20);
  if (dashHit) shop.cutT = Math.max(shop.cutT || 0, 0.24);
  if (run.score < shop.cost) {
    shop.bump = 0.30; shop.denyT = 0.40;
    addFloat(room, shop.x, shop.y - 58, `⊘ ${shop.cost}`, '#ff8fa3', true, 0.48);
    ripple(room, shop.x, shop.y, '#ff8fa3', 78, 0.26);
    burst(room, shop.x, shop.y, '#ff8fa3', 8, 120, 0.22, 2.2);
    sfx('break');
    haptic(10);
    return true;
  }

  const item = chooseShopItem(shop);
  if (!item) {
    shop.bump = 0.24; shop.denyT = 0.32;
    addFloat(room, shop.x, shop.y - 58, '⊘', '#ff8fa3', true, 0.44);
    sfx('break');
    return true;
  }

  run.score = Math.max(0, run.score - shop.cost);
  shop.bought = true;
  shop.itemId = item.id;
  shop.bump = 0.74; shop.soldT = 1.05;
  p.dashCd = 0;
  p.inv = Math.max(p.inv, 0.20);
  grantItem(item.id, 'shop');
  // The item name already pops at the player from grantItem. The kiosk itself
  // answers with mostly visual feedback: symbol, ring, burst, and a hard score spend.
  addFloat(room, shop.x, shop.y - 62, '✦', item.color || '#ffd36e', true, 0.66);
  ripple(room, shop.x, shop.y, item.color || '#ffd36e', 156, 0.50);
  ripple(room, shop.x, shop.y, '#ffffff', 84, 0.30);
  burst(room, shop.x, shop.y, item.color || '#ffd36e', 42, 380, 0.54, 4.5);
  burst(room, shop.x, shop.y, '#ffffff', 24, 250, 0.32, 3.3);
  addFlash(0.22); addShake(0.32); haptic(22);
  sfx('pickup');
  return true;
}

function chooseShopItem(shop) {
  const ids = (shop.stock && shop.stock.length ? shop.stock : [shop.itemId]).filter(Boolean);
  const available = ids.map(itemById).filter(Boolean);
  if (!available.length) return itemById(shop.itemId);
  const rng = state.run?.rng || Math.random;
  return available[Math.floor(rng() * available.length)] || available[0];
}

function dashTouchesShop(p, shop) {
  const dashLike = p && (p.dashT > 0 || p._dashFrameActive || (p.rail?.rocketT || 0) > 0);
  if (!dashLike) return false;
  const x0 = Number.isFinite(p._dashLastX) ? p._dashLastX : Number.isFinite(p._lastX) ? p._lastX : p.x;
  const y0 = Number.isFinite(p._dashLastY) ? p._dashLastY : Number.isFinite(p._lastY) ? p._lastY : p.y;
  const pad = shop.r + p.r + 54;
  return segmentPointDist(x0, y0, p.x, p.y, shop.x, shop.y) <= pad || dist(p.x, p.y, shop.x, shop.y) <= pad;
}

function segmentPointDist(x1, y1, x2, y2, px, py) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy || 1;
  const t = clamp(((px - x1) * dx + (py - y1) * dy) / len2, 0, 1);
  return dist(px, py, x1 + dx * t, y1 + dy * t);
}

function blocked(room, x, y, pad) {
  for (const o of room.obstacles || []) {
    if (o.gone) continue;
    if (o.type === 'circle') {
      if (dist(x, y, o.x, o.y) < (o.rad || 0) + pad) return true;
    } else {
      const cx = clampShop(x, o.x, o.x + o.w), cy = clampShop(y, o.y, o.y + o.h);
      if (dist(x, y, cx, cy) < pad) return true;
    }
  }
  for (const t of room.tiers || []) {
    if (x > t.x - pad && x < t.x + t.w + pad && y > t.y - pad && y < t.y + t.h + pad) return true;
  }
  const a = room.annex;
  if (a && !a.opened && x > a.rect.x - pad && x < a.rect.x + a.rect.w + pad && y > a.rect.y - pad && y < a.rect.y + a.rect.h + pad) return true;
  return false;
}

function clampShop(v, a, b) { return Math.max(a, Math.min(b, v)); }
