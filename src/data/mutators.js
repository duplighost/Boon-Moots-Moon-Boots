// Floor mutators — axis 6 (design doc §3; floor-mood names from No Moon
// game_inline.js:14450-14456). 10% of non-boss rounds ≥5, announced loud.
// Pure data: fields are consumed by the roller, director, and combat/score.

export const MUTATORS = [
  { id: 'brokenFloor',    name: 'THE BROKEN FLOOR',    breakBonus: 2, idolBump: true },
  { id: 'listeningFloor', name: 'THE LISTENING FLOOR', extraSniper: true, extraLane: true },
  { id: 'generousFloor',  name: 'THE GENEROUS FLOOR',  sparkBonus: 2, eventBoost: true },
  { id: 'starvedFloor',   name: 'THE STARVED FLOOR',   noRepairDrops: true, scoreMult: 1.25 },
  { id: 'bellFed',        name: 'BELL-FED',            forceCaptains: 2 },
  { id: 'lowCeiling',     name: 'LOW CEILING',         sizeScale: 0.85 },
  { id: 'doubles',        name: 'DOUBLES',             doubleRecipe: true },
];

export const mutatorById = (id) => MUTATORS.find(m => m.id === id);
