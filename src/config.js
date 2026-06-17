// All tuning lives here. Feel constants come from Boon Moots v50; content stats
// come from No Moon. Anchors refer to docs/ inventories.

export const TAU = Math.PI * 2;
export const SAVE_KEY = 'oneRoomNoMoon.v1';
export const VERSION = '1.0.0-rocket-shoes';

export const ROOM = {
  W: 2050, H: 1460, H_PORTRAIT: 1820,   // base dims (the roller rolls actual sizes; these document the target)
  WALL: 56,                 // playfield inset
  SPAWN_CLEAR: 360,         // radius around player spawn kept obstacle-free (scales with the bigger arena)
};

export const PLAYER = {
  R: 20, MAX_HP: 6,
  // Moots is drawn at this fraction of his original art size; collision stays separate.
  // Body, gun, body-hugging FX, and bullet emitter all key off this one knob.
  DRAW_SCALE: 0.70,
  SPEED: 370, ACCEL: 30.5, STOP: 42.0, TURN: 38, LATERAL: 16.5,
  MAX_SPEED_MULT: 1.18, DASH_SPEED_MULT: 5.95,
  FIRE_DELAY: 0.15, DAMAGE: 0.88, SHOT_MULT: 0.72, SHOT_SPEED: 860,
  // Bullet radius stays readable at the 0.82 camera zoom; shot lifetime was lengthened for the bigger arenas.
  SHOT_R: 4.2, SHOT_LIFE: 1.08, TWIN_OFFSET: 6,
  // Art-space gun offsets. firePlayer multiplies these by DRAW_SCALE so bullets leave the shrunken muzzle.
  EMITTER_Y: -16, EMITTER_LEN: 32,
  CRIT: 0.03, CRIT_MULT: 1.8,
  // the dash is the centerpiece: long, far, invincible throughout, hits hard+wide
  DASH_IMPULSE: 1880, DASH_DUR: 0.46, DASH_CD: 0.34, DASH_IFRAMES: 0.50,
  DASH_GLIDE: 1.55, DASH_HIT_RANGE: 172, DASH_SWEEP_RANGE: 132, DASH_HIT_MULT: 1.32, DASH_KNOCK: 560,
  DASH_KILL_REFUND: 0.09,   // every kill feeds the dash loop a little
  DASH_PRIME_MULT: 1.5, DASH_PRIME_PIERCE: 1, // "dash primes next shot" relic payload
  HURT_IFRAMES: 0.92, HURT_KNOCK: 370,
  PICKUP_RANGE: 132,
};

export const COMBO = { PER_KILL: 0.20, PER_BOSS: 1.1, CAP: 16, WINDOW: 3.15 };

export const SCORE = {
  CLEAR_BASE: 300, CLEAR_PER_ROUND: 82, NO_HIT: 400,
  SPEED_MAX: 900, SPEED_DRAIN: 20, SPEED_FROM_ROUND: 3,
  SPARK: 18, OVERDRIVE_MULT: 1.35,
};

export const CAPS = {
  // City-scale arenas: lift the ceilings so the sprawl stays full of action + flash.
  // Director budget scales with room area (see buildWaves); these are the hard caps.
  // TOP PLAYTEST DIAL: drop back if combat reads as soup or perf dips.
  ENEMIES: { mobile: 46, desktop: 76 },
  ENEMY_BULLETS: { mobile: 130, desktop: 220 },
  PLAYER_BULLETS: { mobile: 110, desktop: 210 },
  PARTICLES: { mobile: 180, desktop: 340 },
};

export const DIRECTOR = {
  // spawn count: clamp(BASE + round*PER_ROUND + rand(0,2) , MIN, cap)
  BASE: 5, PER_ROUND: 1.18, MIN: 5,
  TELEGRAPH: 0.42,            // warning glyph time before a spawn lands
  REINFORCE_AT: 0.70,         // fraction of count held for the second wave
  REINFORCE_DELAY: [1.6, 2.7],  // seconds (or when 2 enemies remain) — kept snappy for tempo
  // danger stage = min(5, floor(round / 4)) during the route
  STAGE_DIV: 4, STAGE_CAP: 5,
  // non-boss scaling per No Moon: hp ×(1 + stageIdx*0.13 + stage*0.08)
  HP_IDX: 0.13, HP_STAGE: 0.08, SPD_IDX: 0.045, SPD_STAGE: 0.045,
};

export const FX = {
  SHAKE_DECAY: 2.25, FLASH_DECAY: 1.7, SLOWMO_SCALE: 0.55,
  // camera shake is quadratic in trauma (Grave Signal model): offset = trauma²·GAIN.
  // small hits stop buzzing; big hits still punch. GAIN tuned so peak ≈ the old linear feel.
  SHAKE_GAIN: 30,
  HIT_PAUSE: { shot: 10, chain: 16, dash: 18, pulse: 30, kill: 24, dashKill: 40, boss: 58, hurt: 72 }, // ms
};

export const BLOOM = { ALPHA: 0.20, FILTER: 'blur(11px) saturate(1.16)' };

export const ANNEX = { CHANCE: 0.48, AMBUSH: 0.45 };

export const STREAK_NAMES = ['', '', '×2', '×3', '', '×5', '', '', '×8'];
