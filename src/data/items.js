// Pure item catalog — No Moon's 28-item pool (docs/no-moon-systems.md §5) plus
// Boon Moots converts (gigi, haloDrain). Effects live in systems/itemEffects.js.
// weight = draft weight; maxStacks omitted = unlimited.

export const ITEMS = [
  { id: 'ricochet',       name: 'Prism Teeth',       type: 'projectile',  weight: 4, color: '#84d0ff', desc: 'Shots ricochet off walls and stone. Stacks add extra rebounds.' },
  { id: 'splitWake',      name: 'Split Wake',        type: 'on-kill',     weight: 4, color: '#b7f6ff', desc: 'Killing shots split into a fan of smaller rounds.' },
  { id: 'orbitalHalo',    name: 'Orbital Halo',      type: 'defense',     weight: 5, color: '#f3dcff', desc: 'A ward circles you, clips enemies, and eats stray bullets.' },
  { id: 'rearArray',      name: 'Rear Array',        type: 'weapon',      weight: 4, color: '#ffd39a', desc: 'Each volley spits stingers behind you.' },
  { id: 'graveCharge',    name: 'Grave Charge',      type: 'on-kill',     weight: 6, color: '#ff9b6f', desc: 'Enemies detonate when they die.' },
  { id: 'hunterMycelia',  name: 'Hunter Mycelia',    type: 'projectile',  weight: 6, color: '#9effdc', desc: 'All shots gain a homing itch. Stacks tighten the turn.' },
  { id: 'phaseDrill',     name: 'Phase Drill',       type: 'projectile',  weight: 6, color: '#c6adff', desc: 'Rounds punch through extra bodies before dying.' },
  { id: 'sidecarLances',  name: 'Sidecar Lances',    type: 'weapon',      weight: 3, color: '#aef3ff', desc: 'Every volley also spits lateral side-shots.' },
  { id: 'staticLink',     name: 'Arc Rosary',        type: 'control',     weight: 5, color: '#8cf3d9', desc: 'Hits arc damage into a nearby enemy like beads on a string.' },
  { id: 'cryoRime',       name: 'Gravemire Liturgy', type: 'control',     weight: 5, color: '#a7ecff', desc: 'Every hit drags enemy movement down.' },
  { id: 'scavengerDrone', name: 'Lantern Pup',       type: 'companion',   weight: 4, color: '#ffd36e', desc: 'A little bastard pup circles you and shoots for itself.' },
  { id: 'emberMine',      name: 'Ember Mine',        type: 'trap',        weight: 4, color: '#ff8864', desc: 'Moving leaves armed mines behind you.' },
  { id: 'spiteCore',      name: 'Spite Core',        type: 'retaliation', weight: 4, color: '#ff8fa3', desc: 'Taking a hit spits a radial burst back into the room.' },
  { id: 'shrapnelChamber',name: 'Shrapnel Chamber',  type: 'projectile',  weight: 3, color: '#ffc682', desc: 'Impacts burst into fragments.' },
  { id: 'echoChamber',    name: 'Echo Chamber',      type: 'tempo',       weight: 4, maxStacks: 3, color: '#d9c8ff', desc: 'Volleys repeat as a spectral aftershock.' },
  { id: 'cacheCompass',   name: 'Hush Compass',      type: 'utility',     weight: 4, maxStacks: 3, color: '#ffd46f', desc: 'The room hides more annexes, and you can smell them.' },
  { id: 'gravityWell',    name: 'Covetmark',         type: 'utility',     weight: 4, color: '#dcb0ff', desc: 'Pickups pull toward you from farther out.' },
  { id: 'hullScripture',  name: 'Hull Scripture',    type: 'survival',    weight: 3, maxStacks: 3, color: '#7efab7', desc: 'Raises max integrity by 1.' },
  { id: 'bloodTithe',     name: 'Blood Tithe',       type: 'survival',    weight: 4, color: '#ff6b6b', desc: 'Every handful of kills repairs the hull.' },
  { id: 'sutureEngine',   name: 'Hull Suture',       type: 'survival',    weight: 3, maxStacks: 3, color: '#b9ffb8', desc: 'Clearing rooms while wounded can stitch integrity back.' },
  { id: 'lunarCaliber',   name: 'Lunar Caliber',     type: 'damage',      weight: 5, color: '#fff0b0', desc: 'Player rounds hit harder and wider.' },
  { id: 'blackLotus',     name: 'Black Lotus',       type: 'control',     weight: 4, color: '#c596ff', desc: 'Each new room loads in with a slowing bloom around you.' },
  { id: 'aegisLattice',   name: 'Aegis Lattice',     type: 'defense',     weight: 3, maxStacks: 2, color: '#b8ecff', desc: 'A regenerating guard layer. Reknits when you go unhit.' },
  { id: 'siphonVane',     name: 'Siphon Vane',       type: 'survival',    weight: 4, maxStacks: 4, color: '#9ee6ff', desc: 'Kills can shed repair blooms.' },
  { id: 'executionBloom', name: 'Execution Bloom',   type: 'damage',      weight: 4, maxStacks: 4, color: '#ffadcf', desc: 'Wounded enemies take extra finishing damage.' },
  { id: 'moonShard',      name: 'Moon Shard',        type: 'damage',      weight: 4, maxStacks: 4, color: '#f6f0ff', desc: 'Player shots can critically flare.' },
  { id: 'riftCapacitor',  name: 'Rift Capacitor',    type: 'tempo',       weight: 3, maxStacks: 3, color: '#9ec6ff', desc: 'After enough clears, the hull recharges one integrity.' },
  { id: 'gigi',           name: 'Gigi Management',   type: 'companion',   weight: 3, maxStacks: 3, color: '#f9f6ee', desc: 'The cat makes calls. The calls are pounces.' },
  { id: 'haloDrain',      name: 'Halo Drain',        type: 'tempo',       weight: 4, maxStacks: 3, color: '#ffe69b', desc: 'Close kills keep your combo heat alive longer. Stay in the thick of it and keep scoring.' },
  { id: 'redline',        name: 'Redline Liturgy',   type: 'tempo',       weight: 5, maxStacks: 4, color: '#ff9e6b', desc: 'Your guns cycle faster. Stacks shave more off every shot.' },
  { id: 'kinetic',        name: 'Kinetic Primer',    type: 'tempo',       weight: 4, maxStacks: 3, color: '#eaffff', desc: 'After a dash, your next shots hit harder and punch through. Stacks prime more volleys.' },
];

export const itemById = (id) => ITEMS.find(i => i.id === id);
