// Hazard kit parameter tables by danger stage. Mechanics in systems/hazards.js;
// parameters from No Moon (docs/no-moon-systems.md §3) at Boon Moots kit sizes.
// Each entry: base params + perStage escalation (the prototypes' static-timer
// mistake is fixed here).
//
// Only the dodge-choreography hazards remain: altar shockwaves (pulse/ritual) and
// laser lanes (lane/sightline). The projectile-spitting kits (fog/spore/snare/
// thorn/shard/volatile) were retired — those biomes furnish breakable cover via
// roomRoller instead, and seedHazards' `if (!kit) return` handles their absence.

export const HAZARD_KITS = {
  pulse: {
    altars: 1, r: 34, period: [2.0, 3.2], active: 0.42, waveSpan: 0.55,
    perStage: { period: -0.12 },
  },
  ritual: {
    altars: 3, r: 34, period: [2.8, 4.0], active: 0.42, waveSpan: 0.55,
    perStage: { period: -0.14 },
  },
  lane: {
    count: [3, 5], width: 38, period: [2.7, 3.4], telegraphFrom: 0.34, activeFrom: 0.70, activeTo: 1.05,
    perStage: { count: 0.35, period: -0.1 },
  },
  sightline: {
    count: [2, 4], width: 26, period: [3.0, 3.8], telegraphFrom: 0.40, activeFrom: 0.74, activeTo: 0.98,
    perStage: { count: 0.35, period: -0.1 },
  },
};
