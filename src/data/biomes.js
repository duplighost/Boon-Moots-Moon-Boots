// All 22 No Moon biomes (docs/no-moon-systems.md §3, game_inline.js:406-866).
// Palettes for the first 10 are Boon Moots v50's ports (index.html:120-130);
// the rest derive bg/floor as dark tints of their No Moon accents.
// hazard + bias from the biome→mechanic table; features/extras are pattern names
// in data/patterns.js; ambient modes are arcade assignments in the same family.

const B = (id, tier, name, mech, hazard, bias, pal, features, extras, ambient, style) =>
  ({ id, tier, name, mech, hazard, bias, pal, features, extras, ambient, obstacleStyle: style });

export const BIOMES = [
  // ─ early ─
  B('verdigris', 'early', 'Verdigris Court', 'ROOT SNARE', 'snare', ['charger', 'skitter'],
    { bg: '#08110b', floor: '#173024', accent: '#8cf0b7', accent2: '#dbffe5', accent3: '#3f7354', bad: '#ff6b6b' },
    ['gridSoft', 'vines', 'plinths'], ['petals', 'glyphs', 'pools'], ['petals', 'fireflies'], 'rootStone'),
  B('fen', 'early', 'Drownlight Fen', 'DROWN FOG', 'fog', ['gunner', 'sniper'],
    { bg: '#071116', floor: '#10252e', accent: '#79dcff', accent2: '#b7f6ff', accent3: '#335461', bad: '#ff6b6b' },
    ['pools', 'reeds', 'mudRings'], ['fogBanks', 'lilyLights', 'glyphs'], ['rain', 'spores'], 'fenStump'),
  B('mirror', 'early', 'Mirror Orchard', 'MIRROR SHARDS', 'shard', ['sniper', 'turret'],
    { bg: '#080f18', floor: '#171f33', accent: '#84d0ff', accent2: '#f0b8ff', accent3: '#3b5d84', bad: '#ff6b6b' },
    ['glassShards', 'cracks', 'reflections'], ['petals', 'hexes', 'halos'], ['petals', 'sparks'], 'glassNode'),
  B('rosewire', 'early', 'Rosewire Atrium', 'THORN AMBUSH', 'thorn', ['skitter', 'charger'],
    { bg: '#0c0812', floor: '#25162a', accent: '#ff93cf', accent2: '#b9ffb8', accent3: '#6f345d', bad: '#ff5c91' },
    ['petals', 'braids', 'arches'], ['pools', 'glyphs', 'plinths'], ['petals', 'sparks'], 'bloomBulb'),
  // ─ mid ─
  B('ember', 'mid', 'Cinder Span', 'SLAG PULSE', 'pulse', ['brute', 'charger'],
    { bg: '#0c0706', floor: '#271611', accent: '#ff9b62', accent2: '#ffd0a1', accent3: '#6d2d1c', bad: '#ff6b6b' },
    ['cracks', 'embers', 'fans'], ['monoliths', 'kilnRings', 'ashWaves'], ['embers', 'ash'], 'slagHeart'),
  B('mycelium', 'mid', 'Lumen Mycelia', 'SPORE BLOOM', 'spore', ['hexer', 'skitter'],
    { bg: '#090713', floor: '#181427', accent: '#c596ff', accent2: '#9effdc', accent3: '#5b3a84', bad: '#ff6b6b' },
    ['hyphae', 'caps', 'sporeRings'], ['glowDots', 'pools', 'halos'], ['spores', 'pollen'], 'mycoCap'),
  B('shardreef', 'mid', 'Shardreef Causeway', 'SHARD CHAIN', 'volatile', ['sniper', 'gunner'],
    { bg: '#081119', floor: '#102434', accent: '#7ce8ff', accent2: '#c6adff', accent3: '#2f5871', bad: '#ff6b6b' },
    ['hexes', 'glassShards', 'pools'], ['circuits', 'reflections', 'halos'], ['sparks', 'rain'], 'glassNode'),
  B('coilroot', 'mid', 'Coilroot Vault', 'CONDUCTOR GRID', 'lane', ['turret', 'hexer'],
    { bg: '#090b08', floor: '#161a10', accent: '#d8c979', accent2: '#94ffbf', accent3: '#525728', bad: '#ff6b6b' },
    ['circuits', 'roots', 'monoliths'], ['gridSoft', 'rings', 'glyphs'], ['sparks', 'fireflies'], 'machineHub'),
  // ─ late ─
  B('archive', 'late', 'Obsidian Archive', 'ARCHIVE SIGHTLINES', 'sightline', ['sniper', 'turret'],
    { bg: '#06070c', floor: '#151822', accent: '#ffd46f', accent2: '#fff0ac', accent3: '#59607a', bad: '#ff6b6b' },
    ['gridSoft', 'orbits', 'stacks'], ['stars', 'circuits', 'halos'], ['pollen', 'ash'], 'archivePillar'),
  B('basilica', 'late', 'Null Basilica', 'RITUAL PRESSURE', 'ritual', ['hexer', 'myrmidon'],
    { bg: '#07060d', floor: '#151223', accent: '#d9c8ff', accent2: '#ffd88c', accent3: '#5d557b', bad: '#ff6b6b' },
    ['arches', 'bones', 'halos'], ['glyphs', 'stacks', 'stars'], ['pollen', 'ash'], 'basilicaIdol'),
  B('forge', 'late', 'Sable Forge', 'SLAG PULSE', 'pulse', ['brute', 'turret'],
    { bg: '#0d0705', floor: '#241209', accent: '#ff8864', accent2: '#ffc682', accent3: '#62301c', bad: '#ff6b6b' },
    ['embers', 'circuits', 'fans'], ['cracks', 'stacks', 'ashWaves'], ['embers', 'sparks'], 'slagHeart'),
  B('ossuary', 'late', 'Auric Ossuary', 'BONE AMBUSH', 'thorn', ['brute', 'myrmidon'],
    { bg: '#0c0a05', floor: '#211b0e', accent: '#f5d16c', accent2: '#a9e8ff', accent3: '#5e5026', bad: '#ff6b6b' },
    ['bones', 'halos', 'glyphs'], ['stars', 'pools', 'orbits'], ['ash', 'pollen'], 'boneMound'),
  // ─ abyss ─
  B('noctlith', 'abyss', 'Noctlith Gallery', 'NOCTLITH SIGHTLINES', 'sightline', ['sniper', 'hexer'],
    { bg: '#05070d', floor: '#11182a', accent: '#9fd2ff', accent2: '#ffd37c', accent3: '#39507a', bad: '#ff6b6b' },
    ['stacks', 'glyphs', 'orbits'], ['circuits', 'halos', 'gridSoft'], ['ash', 'fireflies'], 'archivePillar'),
  B('frostreliquary', 'abyss', 'Frost Reliquary', 'FROST SHARDS', 'shard', ['sniper', 'turret'],
    { bg: '#060b10', floor: '#122230', accent: '#a7ecff', accent2: '#fff0bd', accent3: '#3a6275', bad: '#ff6b6b' },
    ['glassShards', 'halos', 'rings'], ['bones', 'orbits', 'hexes'], ['rain', 'sparks'], 'glassNode'),
  B('stormloom', 'abyss', 'Stormloom Array', 'STORMLOOM GRID', 'lane', ['turret', 'hexer'],
    { bg: '#06100c', floor: '#10261f', accent: '#8cf3d9', accent2: '#d2b6ff', accent3: '#2f6354', bad: '#ff6b6b' },
    ['braids', 'circuits', 'hexes'], ['rings', 'stacks', 'reflections'], ['sparks', 'rain'], 'machineHub'),
  B('umbraharvest', 'abyss', 'Umbra Harvest', 'UMBRA HARVEST', 'thorn', ['charger', 'myrmidon'],
    { bg: '#100711', floor: '#241226', accent: '#ffadcf', accent2: '#f9e59f', accent3: '#6b3a55', bad: '#ff5c91' },
    ['petals', 'roots', 'halos'], ['stars', 'monoliths', 'rings'], ['petals', 'ash'], 'bloomBulb'),
  // ─ zenith ─
  B('auricspire', 'zenith', 'Auric Spire', 'AURIC RITE', 'ritual', ['hexer', 'sniper'],
    { bg: '#0c0905', floor: '#221a0c', accent: '#ffe07c', accent2: '#e4d2ff', accent3: '#6b5a2a', bad: '#ff6b6b' },
    ['arches', 'stacks', 'orbits'], ['halos', 'stars', 'monoliths'], ['pollen', 'sparks'], 'basilicaIdol'),
  B('blacksungarden', 'zenith', 'Blacksun Garden', 'BLACKSUN THORNS', 'thorn', ['skitter', 'myrmidon'],
    { bg: '#0b0610', floor: '#1d1026', accent: '#dcb0ff', accent2: '#ffe69b', accent3: '#56396b', bad: '#ff6b6b' },
    ['petals', 'roots', 'rings'], ['monoliths', 'glyphs', 'stars'], ['petals', 'fireflies'], 'rootStone'),
  B('solarium', 'zenith', 'Sable Solarium', 'SOLAR BURN', 'pulse', ['brute', 'sniper'],
    { bg: '#0d0905', floor: '#26190b', accent: '#ffcb7b', accent2: '#b8ecff', accent3: '#6d4d22', bad: '#ff6b6b' },
    ['kilnRings', 'fans', 'halos'], ['embers', 'orbits', 'glassShards'], ['embers', 'pollen'], 'kilnPillar'),
  B('crownworks', 'zenith', 'Crownworks Engine', 'CROWNWORKS GRID', 'lane', ['turret', 'hexer'],
    { bg: '#060a10', floor: '#101e2e', accent: '#9ec6ff', accent2: '#ffe79a', accent3: '#39557a', bad: '#ff6b6b' },
    ['circuits', 'orbits', 'stacks'], ['halos', 'hexes', 'stars'], ['sparks', 'ash'], 'machineHub'),
  // ─ final ─
  B('empyrean', 'final', 'Empyrean Vestibule', 'EMPYREAN RITE', 'ritual', ['hexer', 'myrmidon'],
    { bg: '#0c0a06', floor: '#221d0e', accent: '#ffe391', accent2: '#f3d7ff', accent3: '#6b5e30', bad: '#ff6b6b' },
    ['halos', 'orbits', 'glyphs'], ['arches', 'stacks', 'rings'], ['pollen', 'sparks'], 'basilicaIdol'),
  B('nullthrone', 'final', 'Null Throne', 'NULL PRESSURE', 'ritual', ['sniper', 'hexer', 'myrmidon'],
    { bg: '#0c060c', floor: '#1f111f', accent: '#ffd0ff', accent2: '#fff0b0', accent3: '#5e3a5e', bad: '#ff6b6b' },
    ['stars', 'glyphs', 'halos'], ['circuits', 'stacks', 'hexes'], ['ash', 'sparks'], 'basilicaIdol'),
];

export const BIOMES_BY_TIER = {};
for (const b of BIOMES) (BIOMES_BY_TIER[b.tier] = BIOMES_BY_TIER[b.tier] || []).push(b);

export const biomeById = (id) => BIOMES.find(b => b.id === id);

// round → tier band (design doc §3; final band reserved for the Archon round)
export function tierForRound(round, overdrive) {
  if (overdrive) return 'any';
  if (round <= 4) return 'early';
  if (round <= 8) return 'mid';
  if (round <= 12) return 'late';
  if (round <= 16) return 'abyss';
  if (round <= 19) return 'zenith';
  return 'final';
}
