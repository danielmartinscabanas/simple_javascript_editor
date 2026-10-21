// Arena + card definitions. World units ≈ CR tiles. Player side is +z, rival side is -z.

export const ARENA = { halfW: 9, halfL: 16, cell: 0.5 };
export const RIFT_HALF = 3.0;                 // |z| < RIFT_HALF is the Weeping Rift
export const ISLAND_R = 1.6;
export const CAUSEWAY_HALF = 0.8;
export const BRIDGES = [-6.2, 6.2];           // side bridge centre x
export const BRIDGE_HALF = 1.0;

export const TEAM = { PLAYER: 0, RIVAL: 1 };

export const TOWERS = [
  { kind: 'keep', x: 0, z: 13.2, half: 1.5, hp: 4200, dmg: 115, hitSpeed: 1.0, range: 7.0 },
  { kind: 'bell', x: -5.6, z: 9.8, half: 1.1, hp: 2600, dmg: 92, hitSpeed: 0.8, range: 7.5 },
  { kind: 'bell', x: 5.6, z: 9.8, half: 1.1, hp: 2600, dmg: 92, hitSpeed: 0.8, range: 7.5 },
];

// Mirrored for the rival by flipping z.
export const MAUSOLEUMS = [{ x: 0, z: 6.6, hx: 1.5, hz: 1.0 }];
export const STATUES = [{ x: -2.7, z: 9.4, r: 0.45 }, { x: 2.7, z: 9.4, r: 0.45 }];
export const THICKETS = [
  { x: -3.4, z: 4.8, r: 1.3 }, { x: 3.4, z: 4.8, r: 1.3 },
  { x: -8.1, z: 6.4, r: 0.95 }, { x: 8.1, z: 6.4, r: 0.95 },
];
export const MIRES = [{ x: -6.2, z: 4.1, r: 1.15 }, { x: 6.2, z: 4.1, r: 1.15 }];

// Spike galleries: rectangles. Shared (not mirrored) — they sit on the crossings.
export const SPIKES = [
  { x: 0, z: 2.3, hx: CAUSEWAY_HALF, hz: 0.7, period: 4.0, offset: 0.0 },
  { x: 0, z: -2.3, hx: CAUSEWAY_HALF, hz: 0.7, period: 4.0, offset: 2.0 },
  { x: -6.2, z: 0, hx: BRIDGE_HALF, hz: 0.6, period: 7.0, offset: 1.0 },
  { x: 6.2, z: 0, hx: BRIDGE_HALF, hz: 0.6, period: 7.0, offset: 4.5 },
];
export const SPIKE_WARN = 0.9, SPIKE_UP = 0.8, SPIKE_DMG = 130;

export const ALTAR = { x: 0, z: 0, r: 1.9, captureTime: 4.5, bonus: 0.4 };

export const SOULS = { max: 10, start: 5, regen: 1 / 2.8 };
export const MATCH = { regulation: 180, overtime: 60, doubleAt: 60 };

export const FACTION = [
  { name: 'The Ashen Vigil', glow: 0x9fd6ff, cloth: 0x3c4d75, trim: 0xa8b4d0, banner: 0x1c2436, css: '#9fd6ff' },
  { name: 'Crimson Covenant', glow: 0xff3524, cloth: 0x761820, trim: 0xc03a2e, banner: 0x4a0b10, css: '#ff4a3a' },
];

// type: unit | spell | building.  speed in tiles/s.  range measured edge-to-edge.
export const CARDS = {
  knight: {
    name: 'Grave Knight', cost: 3, type: 'unit', count: 1, model: 'knight',
    hp: 1450, dmg: 165, hitSpeed: 1.2, range: 0.8, sight: 5.5, speed: 1.2, radius: 0.45, mass: 6,
    air: false, hitsAir: false, lore: 'Oathbound past death. Holds the line.',
  },
  horde: {
    name: 'Ossuary Horde', cost: 3, type: 'unit', count: 6, model: 'skeleton', spread: 0.7,
    hp: 75, dmg: 68, hitSpeed: 1.0, range: 0.5, sight: 5.5, speed: 1.8, radius: 0.28, mass: 1,
    air: false, hitsAir: false, lore: 'Six of the unburied, eager and brittle.',
  },
  hunters: {
    name: 'Witch-Hunters', cost: 4, type: 'unit', count: 2, model: 'hunter', spread: 0.6,
    hp: 360, dmg: 112, hitSpeed: 1.1, range: 5.5, sight: 6.5, speed: 1.2, radius: 0.35, mass: 3,
    air: false, hitsAir: true, projectile: 'bolt', lore: 'Twin crossbows. They hunt what flies.',
  },
  gargoyle: {
    name: 'Gargoyle', cost: 4, type: 'unit', count: 1, model: 'gargoyle',
    hp: 760, dmg: 150, hitSpeed: 1.25, range: 0.7, sight: 5.5, speed: 1.8, radius: 0.5, mass: 4,
    air: true, hitsAir: true, lore: 'A cathedral sentinel, torn from its perch.',
  },
  colossus: {
    name: 'Bone Colossus', cost: 6, type: 'unit', count: 1, model: 'colossus',
    hp: 3300, dmg: 230, hitSpeed: 1.6, range: 0.9, sight: 7, speed: 0.8, radius: 0.85, mass: 20,
    air: false, hitsAir: false, buildingsOnly: true, deathSpawn: { card: 'horde', count: 3 },
    lore: 'Marches only on spires. Shatters into the horde.',
  },
  hemomancer: {
    name: 'Hemomancer', cost: 5, type: 'unit', count: 1, model: 'witch',
    hp: 720, dmg: 145, hitSpeed: 1.5, range: 5.0, sight: 6, speed: 1.2, radius: 0.4, mass: 4,
    air: false, hitsAir: true, projectile: 'blood', splash: 1.3, lore: 'Hurls bursting orbs of blood.',
  },
  vampire: {
    name: 'Vampire Lord', cost: 5, type: 'unit', count: 1, model: 'vampire',
    hp: 1150, dmg: 270, hitSpeed: 1.4, range: 0.8, sight: 5.5, speed: 1.8, radius: 0.45, mass: 6,
    air: false, hitsAir: false, lifesteal: 0.45, lore: 'Swift and cruel. Drinks from every wound.',
  },
  wraiths: {
    name: 'Wraiths', cost: 3, type: 'unit', count: 3, model: 'wraith', spread: 0.6,
    hp: 210, dmg: 88, hitSpeed: 1.0, range: 0.8, sight: 5.5, speed: 2.2, radius: 0.32, mass: 1,
    air: true, hitsAir: true, lore: 'Three cold whispers on the wind.',
  },
  lantern: {
    name: 'Gallows Lantern', cost: 4, type: 'building', count: 1, model: 'lantern',
    hp: 1100, dmg: 120, hitSpeed: 0.9, range: 6.0, sight: 6.0, radius: 0.7, lifetime: 32,
    air: false, hitsAir: true, projectile: 'soul', lore: 'A hanged flame that hates the living.',
  },
  hellfire: {
    name: 'Hellfire', cost: 4, type: 'spell', model: 'sigilFire',
    radius: 2.5, dmg: 580, towerMul: 0.35, lore: 'A falling star of brimstone.',
  },
  crows: {
    name: 'Murder of Crows', cost: 3, type: 'spell', model: 'sigilCrow',
    radius: 3.6, dmg: 80, waves: 3, towerMul: 0.4, lore: 'Three waves of beaks over a wide field.',
  },
  raise: {
    name: 'Raise the Dead', cost: 5, type: 'spell', model: 'sigilGrave',
    radius: 2.4, spawn: 'horde', spawnCount: 11, duration: 6, lore: 'The ground gives back eleven of its dead.',
  },
};

export const DEFAULT_DECK = ['knight', 'horde', 'hunters', 'gargoyle', 'colossus', 'vampire', 'hellfire', 'crows'];

export const RIVAL_NAMES = [
  'Malachai the Unshriven', 'Sister Vesper', 'Lord Ashcroft', 'Morwenna Vex', 'The Hollow Prior',
  'Ser Corvin Gall', 'Lady Isolde Black', 'Abbot Mordrane', 'Eleanor of the Pyre', 'Duke Valerian',
  'Grimwald Thorne', 'Mother Ysolde', 'Cassius Nocturne', 'Brother Ambrose', 'Seraphine Lacrimosa',
];
export const RIVAL_HOUSES = [
  'Order of the Black Rose', 'The Lachrymose Choir', 'House Varnhallow', 'Ossuary Brethren',
  'The Pale Collegium', 'Ravenmoor Lyceum', 'Sanguine Scriptorium', 'Covenant of Ash',
];
export const RANKS = [
  [0, 'Acolyte'], [150, 'Penitent'], [400, 'Lamplighter'], [700, 'Inquisitor'],
  [1000, 'Canon of Thorns'], [1400, 'Bishop of Ash'], [1900, 'Archlector'],
];
export const rankFor = (t) => RANKS.reduce((a, r) => (t >= r[0] ? r[1] : a), RANKS[0][1]);

export const EMOTES = ['Ave Mortis.', 'Well fought.', 'Thou art doomed.', 'Mercy… none.'];
