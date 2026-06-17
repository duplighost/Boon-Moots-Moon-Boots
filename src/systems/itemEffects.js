// Item effect implementations. Each install runs once per item per run and
// registers hooks that read live stack counts — systems never switch on ids.
// Effect numbers from docs/no-moon-systems.md §5.
import { state } from '../state.js';
import { TAU, PLAYER, COMBO } from '../config.js';
import { dist, norm, clamp } from '../rng.js';
import { hooks, stacks } from './items.js';
import { spawnBullet } from './bullets.js';
import { damageEnemy } from './combat.js';
import { dropPickup } from './pickups.js';
import { particle, burst, addFloat } from '../render/particles.js';
import { sfx } from '../audio/sfx.js';

const st = (id) => stacks(state.run?.player, id);
const pdmg = (p) => p.damage * (1 + p.perks.damage * 0.15);

const installers = {
  ricochet(p) {
    hooks.on('onBulletSpawn', 'ricochet', (b) => { b.bounces = (b.bounces || 0) + st('ricochet'); });
  },
  phaseDrill(p) {
    hooks.on('onBulletSpawn', 'phaseDrill', (b) => { b.pierce = (b.pierce || 0) + st('phaseDrill'); });
  },
  hunterMycelia(p) {
    hooks.on('onBulletSpawn', 'hunterMycelia', (b) => {
      b.turn = Math.max(b.turn || 0, 4.4 + st('hunterMycelia') * 1.45);
      b.life += 0.04 * st('hunterMycelia');
    });
  },
  lunarCaliber(p) {
    hooks.on('onBulletSpawn', 'lunarCaliber', (b) => {
      const n = st('lunarCaliber');
      b.r *= 1 + 0.16 * n;
      b.damage *= 1 + 0.14 * n;
    });
  },
  moonShard(p) {
    hooks.on('onBulletSpawn', 'moonShard', (b) => {
      if (Math.random() < 0.07 * st('moonShard')) { b.damage *= 1.8; b.color = '#ffffff'; b.r *= 1.15; }
    });
  },
  cryoRime(p) {
    hooks.on('onHit', 'cryoRime', (e) => {
      const n = st('cryoRime');
      e.slowTimer = Math.max(e.slowTimer || 0, 0.75 + n * 0.2);
      e.slowMul = Math.max(0.42, 1 - 0.16 * n);
    });
  },
  staticLink(p) {
    hooks.on('onHit', 'staticLink', (e, dmg, kind) => {
      if (kind === 'chain') return; // no infinite ladders
      const room = state.room, n = st('staticLink');
      if (Math.random() > 0.30 + n * 0.08) return;
      let best = null, bd = Infinity;
      for (const o of room.enemies) {
        if (o === e || o.hp <= 0) continue;
        const d = dist(e.x, e.y, o.x, o.y);
        if (d < bd && d < 230 + n * 40) { best = o; bd = d; }
      }
      if (best) {
        damageEnemy(best, pdmg(state.run.player) * (0.32 + n * 0.09), 0, 0, 'chain');
        addFloat(room, best.x, best.y - 24, 'ϟ', '#8cf3d9', false, 0.4);
        for (let i = 0; i < 6; i++) particle(room, e.x, e.y, '#8cf3d9', (best.x - e.x) * (1 + Math.random() * 2), (best.y - e.y) * (1 + Math.random() * 2), 0.22, 2);
      }
    });
  },
  shrapnelChamber(p) {
    hooks.on('onHit', 'shrapnelChamber', (e, dmg, kind) => {
      if (kind !== 'shot') return;
      const n = st('shrapnelChamber'), room = state.room;
      if (Math.random() > 0.24 + n * 0.1) return;
      const frags = 2 + n;
      for (let i = 0; i < frags; i++) {
        const a = Math.random() * TAU;
        spawnBullet(room, 'player', e.x, e.y, Math.cos(a) * 420, Math.sin(a) * 420, 3, pdmg(state.run.player) * 0.3, 0.32, '#ffc682', { frag: true });
      }
    });
  },
  executionBloom() {
    hooks.on('modDamage', 'executionBloom', (dmg, e) => {
      const n = st('executionBloom');
      return e.hp < e.maxHp * (0.3 + 0.04 * n) ? dmg * (1 + 0.3 * n) : dmg;
    });
  },
  splitWake() {
    hooks.on('onKill', 'splitWake', (e) => {
      const n = st('splitWake'), room = state.room, p = state.run.player;
      const shots = 2 + n;
      const base = Math.atan2(e.y - p.y, e.x - p.x);
      for (let i = 0; i < shots; i++) {
        const a = base + (i / (shots - 1) - 0.5) * (0.7 + n * 0.12);
        spawnBullet(room, 'player', e.x, e.y, Math.cos(a) * 560, Math.sin(a) * 560, 3.4, pdmg(p) * (0.42 + 0.05 * n), 0.5, '#b7f6ff', { frag: true });
      }
    });
  },
  graveCharge() {
    hooks.on('onKill', 'graveCharge', (e) => {
      const n = st('graveCharge'), room = state.room, p = state.run.player;
      const r = 78 + n * 16;
      burst(room, e.x, e.y, '#ff9b6f', 12, 200, 0.4, 3);
      for (const o of room.enemies) {
        if (o === e || o.hp <= 0) continue;
        const d = dist(e.x, e.y, o.x, o.y);
        if (d < r + o.r) {
          const k = norm(o.x - e.x, o.y - e.y);
          damageEnemy(o, pdmg(p) * (0.5 + 0.18 * n) * (1 - (d / (r + o.r)) * 0.4), k.x * 160, k.y * 160, 'chain');
        }
      }
    });
  },
  siphonVane() {
    hooks.on('onKill', 'siphonVane', (e) => {
      const p = state.run.player;
      if (p.hp < p.maxHp && Math.random() < 0.05 + 0.04 * st('siphonVane')) dropPickup(state.room, 'repair', e.x, e.y);
    });
  },
  bloodTithe() {
    hooks.on('onKill', 'bloodTithe', () => {
      const p = state.run.player;
      p._tithe = (p._tithe || 0) + 1;
      const need = Math.max(6, 14 - st('bloodTithe') * 2);
      if (p._tithe >= need) {
        p._tithe = 0;
        if (p.hp < p.maxHp) {
          p.hp += 1;
          addFloat(state.room, p.x, p.y - 44, '+1', '#ff6b6b');
          sfx('care');
        }
      }
    });
  },
  haloDrain() { // close kills preserve combo heat — dash itself is already feel-first
    hooks.on('onKill', 'haloDrain', (e) => {
      const p = state.run.player;
      if (dist(p.x, p.y, e.x, e.y) < 190) {
        state.run.comboT = Math.max(state.run.comboT || 0, COMBO.WINDOW * (0.42 + st('haloDrain') * 0.14));
        addFloat(state.room, p.x, p.y - 58, '☼', '#ffe69b', false, 0.42);
      }
    });
  },
  kinetic() { // dash primes the next volley(s): bigger, harder, piercing (firePlayer reads _dashPrimed)
    hooks.on('onDash', 'kinetic', (p) => {
      p._dashPrimed = Math.max(p._dashPrimed || 0, st('kinetic'));
    });
  },
  spiteCore() {
    hooks.on('onPlayerHurt', 'spiteCore', () => {
      const p = state.run.player, room = state.room, n = st('spiteCore');
      const shots = 7 + n * 2;
      for (let i = 0; i < shots; i++) {
        const a = (i / shots) * TAU;
        spawnBullet(room, 'player', p.x, p.y, Math.cos(a) * 540, Math.sin(a) * 540, 3.8, pdmg(p) * 0.45, 0.6, '#ff8fa3', { frag: true });
      }
      sfx('break');
    });
  },
  rearArray() {
    hooks.on('onFire', 'rearArray', (p, aim) => {
      const n = st('rearArray'), room = state.room;
      for (let i = 0; i < n; i++) {
        const a = Math.atan2(-aim.y, -aim.x) + (i - (n - 1) / 2) * 0.16;
        spawnBullet(room, 'player', p.x - aim.x * 14, p.y + aim.oy - aim.y * 14,
          Math.cos(a) * 700, Math.sin(a) * 700, 3.4, pdmg(p) * 0.42, 0.6, '#ffd39a', { frag: true });
      }
    });
  },
  sidecarLances() {
    hooks.on('onFire', 'sidecarLances', (p, aim) => {
      const n = st('sidecarLances'), room = state.room;
      for (let side = -1; side <= 1; side += 2) {
        for (let i = 0; i < n; i++) {
          const a = Math.atan2(aim.y, aim.x) + side * (Math.PI / 2);
          spawnBullet(room, 'player', p.x, p.y + aim.oy,
            Math.cos(a) * 640, Math.sin(a) * 640, 3.2, pdmg(p) * (0.32 + 0.05 * i), 0.5, '#aef3ff', { frag: true });
        }
      }
    });
  },
  echoChamber() {
    hooks.on('onFire', 'echoChamber', (p, aim) => {
      p._echo = p._echo || [];
      if (p.shots % 4 !== 0) return;
      p._echo.push({ t: 0.22, x: aim.x, y: aim.y, oy: aim.oy });
    });
    hooks.on('tick', 'echoChamber', (dt) => {
      const p = state.run.player, room = state.room;
      if (!p._echo?.length) return;
      for (let i = p._echo.length - 1; i >= 0; i--) {
        const e = p._echo[i];
        e.t -= dt;
        if (e.t <= 0) {
          p._echo.splice(i, 1);
          const n = Math.min(3, st('echoChamber'));
          const px = -e.y, py = e.x;
          for (let side = -1; side <= 1; side += 2) {
            spawnBullet(room, 'player', p.x + e.x * 18 + px * 7 * side, p.y + e.oy + e.y * 18 + py * 7 * side,
              e.x * PLAYER.SHOT_SPEED * 0.92, e.y * PLAYER.SHOT_SPEED * 0.92,
              3.6, pdmg(p) * PLAYER.SHOT_MULT * (0.5 + 0.1 * n), 0.7, '#d9c8ff', { frag: true });
          }
        }
      }
    });
  },
  emberMine() {
    hooks.on('tick', 'emberMine', (dt) => {
      const p = state.run.player, room = state.room;
      p._mineCd = (p._mineCd || 0) - dt;
      const moving = Math.hypot(p.vx, p.vy) > 90;
      if (moving && p._mineCd <= 0) {
        p._mineCd = Math.max(1.0, 2.4 - st('emberMine') * 0.35);
        (room.mines = room.mines || []).push({ x: p.x, y: p.y, arm: 0.5, r: 12 });
      }
      if (!room.mines) return;
      for (let i = room.mines.length - 1; i >= 0; i--) {
        const m = room.mines[i];
        m.arm -= dt;
        if (m.arm > 0) continue;
        for (const e of room.enemies) {
          if (e.hp <= 0) continue;
          if (dist(m.x, m.y, e.x, e.y) < 56 + e.r) {
            room.mines.splice(i, 1);
            burst(room, m.x, m.y, '#ff8864', 14, 220, 0.4, 3);
            sfx('break');
            const n = st('emberMine');
            for (const o of room.enemies) {
              const d = dist(m.x, m.y, o.x, o.y);
              if (o.hp > 0 && d < 92 + o.r) {
                const k = norm(o.x - m.x, o.y - m.y);
                damageEnemy(o, pdmg(p) * (0.7 + 0.22 * n), k.x * 180, k.y * 180, 'chain');
              }
            }
            break;
          }
        }
      }
    });
  },
  orbitalHalo() {
    hooks.on('tick', 'orbitalHalo', (dt) => {
      const p = state.run.player, room = state.room;
      const n = st('orbitalHalo');
      p._orbitals = p._orbitals || [];
      while (p._orbitals.length < n) p._orbitals.push({ a: Math.random() * TAU, hitCd: 0 });
      while (p._orbitals.length > n) p._orbitals.pop();
      for (let i = 0; i < p._orbitals.length; i++) {
        const o = p._orbitals[i];
        o.a += dt * 2.6;
        o.hitCd = Math.max(0, o.hitCd - dt);
        o.x = p.x + Math.cos(o.a + (i * TAU) / n) * 74;
        o.y = p.y - 16 + Math.sin(o.a + (i * TAU) / n) * 74;
        for (const e of room.enemies) {
          if (e.hp <= 0 || o.hitCd > 0) continue;
          if (dist(o.x, o.y, e.x, e.y) < 12 + e.r) {
            o.hitCd = 0.34;
            const k = norm(e.x - o.x, e.y - o.y);
            damageEnemy(e, pdmg(p) * 0.5, k.x * 140, k.y * 140, 'chain');
          }
        }
        for (let bi = room.bullets.length - 1; bi >= 0; bi--) {
          const b = room.bullets[bi];
          if (b.owner === 'enemy' && dist(o.x, o.y, b.x, b.y) < 16 + b.r) {
            room.bullets.splice(bi, 1);
            particle(room, b.x, b.y, '#f3dcff', 0, 0, 0.2, 3);
          }
        }
      }
    });
  },
  scavengerDrone() {
    hooks.on('tick', 'scavengerDrone', (dt) => {
      const p = state.run.player, room = state.room;
      const n = st('scavengerDrone');
      p._drones = p._drones || [];
      while (p._drones.length < n) p._drones.push({ a: Math.random() * TAU, cd: 0 });
      while (p._drones.length > n) p._drones.pop();
      for (let i = 0; i < p._drones.length; i++) {
        const d = p._drones[i];
        d.a += dt * 1.7;
        d.cd -= dt;
        d.x = p.x + Math.cos(d.a + (i * TAU) / n) * 56;
        d.y = p.y - 30 + Math.sin(d.a + (i * TAU) / n) * 40;
        if (d.cd <= 0) {
          let best = null, bd = Infinity;
          for (const e of room.enemies) {
            const dd = dist(d.x, d.y, e.x, e.y);
            if (e.hp > 0 && dd < bd && dd < 520) { best = e; bd = dd; }
          }
          if (best) {
            d.cd = Math.max(0.24, 0.62 - n * 0.05);
            const k = norm(best.x - d.x, best.y - d.y);
            spawnBullet(room, 'player', d.x, d.y, k.x * 700, k.y * 700, 3, pdmg(p) * 0.34, 0.8, '#ffd36e', { frag: true });
          }
        }
      }
    });
  },
  gigi() {
    hooks.on('tick', 'gigi', (dt) => {
      const p = state.run.player, room = state.room;
      const c = p._cat = p._cat || { a: 0, cd: 2, pounce: 0, x: p.x, y: p.y };
      c.a += dt * 1.1;
      c.cd -= dt;
      if (c.pounce > 0) {
        c.pounce -= dt;
        c.x += c.vx * dt; c.y += c.vy * dt;
        for (const e of room.enemies) {
          if (e.hp > 0 && dist(c.x, c.y, e.x, e.y) < 22 + e.r) {
            const k = norm(e.x - c.x, e.y - c.y);
            damageEnemy(e, pdmg(p) * (0.8 + 0.3 * st('gigi')), k.x * 240, k.y * 240, 'dash');
            e.slowTimer = Math.max(e.slowTimer || 0, 0.6);
            e.slowMul = 0.6;
            c.pounce = 0;
            addFloat(room, e.x, e.y - 30, '♡', '#f9f6ee', false, 0.5);
            break;
          }
        }
      } else {
        c.x = p.x + Math.cos(c.a) * 76;
        c.y = p.y + Math.sin(c.a) * 50;
        if (c.cd <= 0) {
          let best = null, bd = Infinity;
          for (const e of room.enemies) {
            const dd = dist(c.x, c.y, e.x, e.y);
            if (e.hp > 0 && dd < bd && dd < 360) { best = e; bd = dd; }
          }
          if (best) {
            c.cd = Math.max(2.2, 3.6 - st('gigi') * 0.4);
            c.pounce = 0.4;
            const k = norm(best.x - c.x, best.y - c.y);
            c.vx = k.x * 620; c.vy = k.y * 620;
          }
        }
      }
    });
  },
  hullScripture(p) { p.maxHp += 1; p.hp += 1; },
  aegisLattice(p) { /* grant() bumps shieldMax per stack */ },
  gravityWell(p) { /* grant() bumps pickup range per stack */ },
  cacheCompass() { /* roller reads stacks for annex odds; door pings on room start */ },
  sutureEngine() {
    hooks.on('onRoomClear', 'sutureEngine', () => {
      const p = state.run.player;
      if (p.hp < p.maxHp && Math.random() < 0.25 + 0.18 * st('sutureEngine')) {
        p.hp += 1;
        addFloat(state.room, p.x, p.y - 44, '+1 ♥', '#b9ffb8');
      }
    });
  },
  riftCapacitor() {
    hooks.on('onRoomClear', 'riftCapacitor', () => {
      const p = state.run.player;
      p._capacitor = (p._capacitor || 0) + 1;
      const need = Math.max(2, 5 - st('riftCapacitor'));
      if (p._capacitor >= need) {
        p._capacitor = 0;
        if (p.hp < p.maxHp) { p.hp += 1; addFloat(state.room, p.x, p.y - 44, '+1 ♥', '#9ec6ff'); }
      }
    });
  },
  blackLotus() {
    hooks.on('onRoomStart', 'blackLotus', (room) => {
      room.hazards.push({
        type: 'lotus', x: room.w / 2, y: room.h * 0.66,
        r: 120 + st('blackLotus') * 20, slow: 0.5, phase: 0, cd: 0, hitCd: 0,
        life: 5, color: '#c596ff',
      });
    });
  },
};

// per-stack stat bumps applied on every grant (not just install)
export const perStack = {
  hullScripture(p) { /* first grant handled in installer; further stacks: */ },
  aegisLattice(p) { p.shieldMax = Math.min(2, p.shieldMax + 1); p.shield = Math.min(p.shieldMax, p.shield + 1); },
  gravityWell(p) { p.pickup += 70; },
  redline(p) { p.perks.fire += 1; }, // each grant cycles the guns ~10% faster (firePlayer: 0.9^fire)
};

export function installItem(id, player) {
  player._installed = player._installed || {};
  if (player._installed[id]) {
    // repeat grants: stat-bump items apply again; hooks already read live stacks
    if (id === 'hullScripture') { player.maxHp += 1; player.hp += 1; }
    perStack[id]?.(player);
    return;
  }
  player._installed[id] = true;
  installers[id]?.(player);
  perStack[id]?.(player);
}
