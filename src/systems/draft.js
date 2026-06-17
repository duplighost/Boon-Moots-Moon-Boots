// Draft at the portal: 3 cards, stacking weights, boon reroll. (No Moon draft
// mechanics at Boon Moots cadence — every clear.)
import { state } from '../state.js';
import { ITEMS, itemById } from '../data/items.js';
import { stacks } from './items.js';
import { installItem } from './itemEffects.js';
import { sfx } from '../audio/sfx.js';
import { addFloat } from '../render/particles.js';

let current = null; // {choices, onDone}
let renderFn = null, chipsFn = null;

export function wireDraftUi(render, chips) { renderFn = render; chipsFn = chips; }

function availableItems() {
  const p = state.run.player;
  return ITEMS.filter(i => !i.maxStacks || stacks(p, i.id) < i.maxStacks);
}

export function chooseCards(n = 3) {
  const p = state.run.player, rng = state.run.rng;
  const pool = availableItems().map(i => ({
    item: i,
    w: i.weight * (1 + 0.12 * Math.min(3, stacks(p, i.id))),
  }));
  const picks = [];
  for (let k = 0; k < n && pool.length; k++) {
    let total = 0;
    for (const c of pool) total += c.w;
    let roll = rng() * total;
    let idx = pool.length - 1;
    for (let i = 0; i < pool.length; i++) { roll -= pool[i].w; if (roll <= 0) { idx = i; break; } }
    picks.push(pool.splice(idx, 1)[0].item);
  }
  return picks;
}

// Auto-grant a power-up at the portal instead of stopping for a choice: deal the
// usual 3 cards, take one, grant it (grantItem flashes the name + chimes since the
// source isn't 'draft'), plus a "POWER UP" lead-in. No menu, no pause — pure flow.
export function autoGrant() {
  if (!state.run) return null;
  const choices = chooseCards(3);
  if (!choices.length) return null;
  const item = choices[Math.floor(state.run.rng() * choices.length)];
  grantItem(item.id, 'auto');
  if (state.room) addFloat(state.room, state.run.player.x, state.run.player.y - 80, '⚡ POWER UP', '#bdfcff', true, 0.85);
  return item;
}

export function openDraft(onDone) {
  current = { choices: chooseCards(3), onDone };
  state.oldMode = state.mode;
  state.mode = 'portalDraft';
  sfx('draft');
  renderFn?.(current.choices, state.run.player.boon.charges > 0);
}

export function pickCard(i) {
  if (!current || state.mode !== 'portalDraft') return;
  const item = current.choices[i];
  if (!item) return;
  grantItem(item.id, 'draft');
  const done = current.onDone;
  current = null;
  renderFn?.(null);
  done?.();
}

export function boonReroll() {
  const p = state.run?.player;
  if (!p || p.boon.charges <= 0) return false;
  if (state.mode === 'portalDraft' && current) {
    p.boon.charges--;
    current.choices = chooseCards(3);
    sfx('draft');
    renderFn?.(current.choices, p.boon.charges > 0);
    return true;
  }
  // outside the draft: re-roll loose module cores on the floor
  const room = state.room;
  const cores = room?.pickups.filter(q => q.type === 'core') || [];
  if (cores.length) {
    p.boon.charges--;
    for (const c of cores) {
      const fresh = chooseCards(1)[0];
      if (fresh) c.itemId = fresh.id;
      addFloat(room, c.x, c.y - 20, '↻', '#f3dcff', false, 0.5);
    }
    sfx('draft');
    return true;
  }
  return false;
}

export function grantItem(id, source = 'found') {
  const p = state.run.player;
  const item = itemById(id);
  if (!item) return;
  const have = stacks(p, id);
  if (item.maxStacks && have >= item.maxStacks) {
    p.hp = Math.min(p.maxHp, p.hp + 1); // overflow converts to repair (No Moon rule)
    addFloat(state.room, p.x, p.y - 44, '+1', '#7efab7');
    return;
  }
  p.modules[id] = have + 1;
  installItem(id, p);
  state.save.seenItems[id] = true;
  state.save.graftPicks = state.save.graftPicks || {};
  state.save.graftPicks[id] = (state.save.graftPicks[id] || 0) + 1;
  if (state.room && source !== 'draft') {
    addFloat(state.room, p.x, p.y - 52, item.name.toUpperCase(), item.color, true, 0.9);
  }
  sfx('care');
  chipsFn?.(p);
}
