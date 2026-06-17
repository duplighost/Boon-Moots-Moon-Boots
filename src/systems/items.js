// Item effect hook table. Systems call hooks; no system switches on item ids.
// The catalog itself (data/items.js) lands in Phase 4 — the plumbing exists now
// so bullets/combat/rooms are written against it from the start.
// Hook names: onFire(p, aim), onBulletSpawn(b), onHit(enemy, dmg, kind),
// onKill(enemy), onRoomClear(room), onPlayerHurt(amount, source), tick(dt).

const registry = new Map(); // hookName -> [{itemId, fn}]

export const hooks = {
  on(name, itemId, fn) {
    if (!registry.has(name)) registry.set(name, []);
    registry.get(name).push({ itemId, fn });
  },
  run(name, ...args) {
    const list = registry.get(name);
    if (!list) return;
    for (const h of list) h.fn(...args);
  },
  // reducer form: each hook returns the new value (e.g. modDamage)
  reduce(name, value, ...args) {
    const list = registry.get(name);
    if (!list) return value;
    for (const h of list) value = h.fn(value, ...args);
    return value;
  },
  clear() { registry.clear(); },
};

export function stacks(player, itemId) {
  return player?.modules?.[itemId] || 0;
}
