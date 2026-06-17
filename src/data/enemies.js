// Enemy archetype stats — ported from No Moon ENEMY_TYPES (docs/no-moon-systems.md §1,
// game_inline.js:1024). Score values are arcade additions (No Moon has no score system).
// `from` = first round the director may deal the type (compressed 20-round route).

export const ENEMY_TYPES = {
  skitter:  { display: 'Pewling',     cost: 1, hp: 2.2, speed: 128, r: 14, color: '#ff7b72', score: 60,  from: 1 },
  gunner:   { display: 'Censer',      cost: 2, hp: 3.6, speed: 104, r: 16, color: '#ffba73', score: 100, from: 1 },
  charger:  { display: 'Ramwraith',   cost: 2, hp: 4.4, speed: 126, r: 18, color: '#ff5c91', score: 110, from: 2 },
  turret:   { display: 'Lectern',     cost: 2, hp: 4.9, speed: 42, r: 18, color: '#c494ff', score: 120, from: 3 },
  brute:    { display: 'Ox-Warden',   cost: 3, hp: 8.1, speed: 86, r: 24, color: '#ffa06a', score: 170, from: 4 },
  sniper:   { display: 'Long Candle', cost: 3, hp: 4.8, speed: 112, r: 17, color: '#9cd7ff', score: 140, from: 6 },
  hexer:    { display: 'Antiphon',    cost: 3, hp: 5.4, speed: 112, r: 18, color: '#a8ffd8', score: 150, from: 8 },
  myrmidon: { display: 'Crown-Sworn', cost: 4, hp: 7.4, speed: 122, r: 21, color: '#ffd39a', score: 170, from: 10 },
};

// Director pool weights by round (compressed from No Moon's by-biome-index table,
// game_inline.js:4269-4296). w may be a number or (round, stage) => number.
export const POOL_WEIGHTS = {
  skitter: 8,
  gunner: 5,
  charger: 3,
  turret: 3,
  brute: (round) => 2 + Math.floor(round * 0.18),
  sniper: (round) => 3 + Math.floor(round * 0.06),
  hexer: (round) => 3 + Math.floor(round * 0.06),
  myrmidon: (round) => 2 + Math.floor(round * 0.055),
};

// Captain (elite) affixes — No Moon game_inline.js:14458-14464.
export const CAPTAINS = [
  { id: 'bell_fed',        title: 'Bell-Fed',        hosts: ['skitter', 'charger'], hp: 1.35, speed: 1.16, color: '#ffd47a', onDeath: 'debtMinion' },
  { id: 'ash_drunk',       title: 'Ash-Drunk',       hosts: ['gunner', 'brute'],    hp: 1.38, speed: 0.94, color: '#ff9b6f', onDeath: 'pulseHazard' },
  { id: 'perched_witness', title: 'Perched Witness', hosts: ['sniper', 'turret'],   hp: 1.30, speed: 0.88, color: '#d9e8ff', onDeath: null },
  { id: 'doorbreaker',     title: 'Doorbreaker',     hosts: ['charger', 'brute'],   hp: 1.48, speed: 1.08, color: '#ff8fa3', onDeath: null },
  { id: 'saintless',       title: 'Saintless',       hosts: ['hexer', 'myrmidon'],  hp: 1.42, speed: 1.00, color: '#c8ffdf', onDeath: 'slowFog' },
];

export const BESTIARY = {
  skitter:  'No Moon skitter logic in arcade shoes. Fast, rude, beautifully chewable.',
  gunner:   'A little shrine-gunner that keeps its distance and spits censer-fire.',
  charger:  'Telegraphs a lane, then becomes the lane.',
  turret:   'Mostly stationary. Reads you for filth from behind cover.',
  brute:    'The wall got employed.',
  sniper:   'Telegraphs a long sightline, then nails it.',
  hexer:    'Orbiting argument rings. Changes where "safe" means.',
  myrmidon: 'Dash, slash, reconsider nothing.',
};
