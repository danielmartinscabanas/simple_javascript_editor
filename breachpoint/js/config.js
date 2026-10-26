// Arena + card definitions. World units ≈ tiles. Player side is +z, rival side is -z.

// Map "Dustline": three lanes (Long on the left, Mid, Tunnels on the right) split by a dry riverbed.
// World units ≈ metres. The player's base is +z, the rival's -z. Features are authored for the player half
// (and, where marked, the left side); helpers in nav.js mirror them.
export const ARENA = { halfW: 20, halfL: 34, cell: 0.5 };
export const RIVER = { half: 1.7 };            // |z| < half is the riverbed: deep sand everywhere except bridges
export const LANES = {
  L: { x: -17, half: 2.9 },                   // Long: open and mined
  M: { x: 0, half: 2.6 },                     // Mid: short and straight over the supply drop
  R: { x: 17, half: 2.9 },                    // Tunnels: a walled stretch hides troops at the river
};
export const BASE = { z: 30.5, hx: 8, z0: 24.6 };    // plaza from z0 to the back edge
export const LEG = { z0: 25.9, z1: 30.3 };            // side lanes turn into the base along this band
export const TUNNEL_COVER = { x: 17, z: 0, hx: 2.9, hz: 4.2 }; // units inside are concealed

// Lane waypoints from the player's base to the rival's (rival team: negate z and reverse).
export const ROUTES = {
  L: [[-9, 28.1], [-17, 28.1], [-17, 0], [-17, -28.1], [-9, -28.1], [0, -30.5]],
  M: [[0, 25], [0, 0], [0, -25], [0, -30.5]],
  R: [[9, 28.1], [17, 28.1], [17, 0], [17, -28.1], [9, -28.1], [0, -30.5]],
};

export const TEAM = { PLAYER: 0, RIVAL: 1 };

// Per lane an outer (tier 1) and inner (tier 2) outpost, then the Command Post. Inner outposts are shielded
// until their lane's outer one falls; the Command Post is shielded until any inner outpost falls.
export const TOWERS = [
  { kind: 'keep', lane: 'M', tier: 3, x: 0, z: 30.6, half: 1.5, hp: 7800, dmg: 150, hitSpeed: 0.8, range: 7.5 },
  { kind: 'bell', lane: 'L', tier: 1, x: -17, z: 12, half: 1.1, hp: 3800, dmg: 115, hitSpeed: 0.75, range: 7.5 },
  { kind: 'bell', lane: 'L', tier: 2, x: -13, z: 28.1, half: 1.1, hp: 4800, dmg: 130, hitSpeed: 0.75, range: 7.5 },
  { kind: 'bell', lane: 'M', tier: 1, x: 0, z: 10, half: 1.1, hp: 3800, dmg: 115, hitSpeed: 0.75, range: 7.5 },
  { kind: 'bell', lane: 'M', tier: 2, x: 0, z: 19.5, half: 1.1, hp: 4800, dmg: 130, hitSpeed: 0.75, range: 7.5 },
  { kind: 'bell', lane: 'R', tier: 1, x: 17, z: 12, half: 1.1, hp: 3800, dmg: 115, hitSpeed: 0.75, range: 7.5 },
  { kind: 'bell', lane: 'R', tier: 2, x: 13, z: 28.1, half: 1.1, hp: 4800, dmg: 130, hitSpeed: 0.75, range: 7.5 },
];

// Hard cover, left-side player quadrant (x < 0, z > 0); mirrored to all four quadrants unless `noMirrorX`.
// kind: wall (low plaster wall), house (flat-roofed block), container, crates, barrels, barrier
export const BLOCKS = [
  // lane edges with gaps into the jungle
  { x: -14.1, z: 6.6, hx: 0.25, hz: 2.6, kind: 'wall' },
  { x: -14.1, z: 17.6, hx: 0.25, hz: 5.0, kind: 'wall' },
  { x: -2.85, z: 6.6, hx: 0.25, hz: 2.4, kind: 'wall' },
  { x: -2.85, z: 15.2, hx: 0.25, hz: 3.0, kind: 'wall' },
  // base perimeter
  { x: -5.4, z: 24.6, hx: 2.6, hz: 0.25, kind: 'wall' },
  { x: -11.1, z: 24.6, hx: 3.0, hz: 0.25, kind: 'wall' },
  { x: -8.25, z: 32.2, hx: 0.25, hz: 1.8, kind: 'wall' },
  // jungle blocks
  { x: -10.3, z: 5.6, hx: 2.0, hz: 1.4, kind: 'house' },
  { x: -6.0, z: 12.6, hx: 1.4, hz: 2.0, kind: 'house' },
  { x: -10.6, z: 18.4, hx: 1.8, hz: 1.6, kind: 'house' },
  { x: -5.9, z: 5.4, hx: 1.1, hz: 0.45, kind: 'container' },
  { x: -6.4, z: 21.4, hx: 1.1, hz: 0.45, kind: 'container' },
  { x: -9.0, z: 10.4, hx: 0.4, hz: 0.4, kind: 'crates' },
  { x: -12.6, z: 13.2, hx: 0.4, hz: 0.4, kind: 'barrels' },
  // lane cover
  { x: -15.6, z: 20.2, hx: 0.3, hz: 0.6, kind: 'barrier' },
  { x: 1.4, z: 15.0, hx: 0.4, hz: 0.4, kind: 'crates', noMirrorX: true },
  { x: -1.3, z: 6.0, hx: 0.6, hz: 0.3, kind: 'barrier', noMirrorX: true },
  // Tunnels: side walls of the covered stretch (right lane only)
  { x: 14.1, z: 2.1, hx: 0.25, hz: 2.1, kind: 'wall', noMirrorX: true },
];
export const SANDS = [{ x: -12.0, z: 10.6, r: 1.1 }, { x: -17, z: 21.5, r: 1.0 }]; // deep sand: halves ground speed (mirrored)
export const MINES = [{ x: -17, z: 3.4 }, { x: 0, z: 4.6 }, { x: -8.4, z: 15.2 }];  // proximity mines (mirrored)
export const MINE = { radius: 0.55, splash: 1.2, dmg: 190, rearm: 9 };

// River objectives. Troops alone on a pad capture it; the effect lasts until the rival takes it back.
export const OBJECTIVES = [
  { id: 'drop', name: 'Supply Drop', x: 0, z: 0, r: 1.9, captureTime: 4.5, effect: 'funds', bonus: 0.4, blurb: 'funds +40%' },
  { id: 'armory', name: 'Armory', x: -8.8, z: 0, r: 1.8, captureTime: 6, effect: 'damage', bonus: 0.15, blurb: 'troops +15% damage' },
  { id: 'medic', name: 'Med Station', x: 8.8, z: 0, r: 1.8, captureTime: 6, effect: 'heal', bonus: 0.015, blurb: 'troops heal 1.5%/s' },
];
export const ALTAR = OBJECTIVES[0];
export const SOULS = { max: 10, start: 6, regen: 1 / 2.6 };
export const MATCH = { regulation: 480, overtime: 120, doubleAt: 120 };
export const WAVES = { first: 18, every: 30, count: 3 };   // recruit squads per lane
export const BOUNTY = { tower: 2 };                         // funds for destroying an outpost

// Veterancy. Units earn XP in combat; levels add HP, damage and attack speed. XP a card's units earn also
// ranks the card up, so later deployments of it arrive at a higher level.
export const XP = {
  combatPerSec: 1.0, perDamage: 1 / 45, kill: 6, killRecruit: 2, killTower: 25,
  maxLevel: 4, hpPerLevel: 0.18, dmgPerLevel: 0.15, hastePerLevel: 0.05,
  curve: (card) => { const a = 10 + card.cost * 4; return [a, a * 2.2, a * 3.8]; },     // unit level 2, 3, 4
  rankAt: (card) => { const a = 10 + card.cost * 4; return [a * 2.5, a * 6]; },         // card rank 2, 3
};

// Factions. Which one each team plays is chosen in the menu (team 0 = player).
export const SIDES = {
  ct: { id: 'ct', name: 'Counter-Terrorists', short: 'CT', glow: 0x5ab4ff, cloth: 0x2a4f7a, trim: 0x9cc6ef, banner: 0x1d3f6b, css: '#5ab4ff' },
  t: { id: 't', name: 'Insurgents', short: 'T', glow: 0xffa53a, cloth: 0x7a5a2a, trim: 0xe0b46a, banner: 0x6b3f12, css: '#ffa53a' },
};
export const FACTION = [SIDES.ct, SIDES.t];          // overwritten by setSides()
export function setSides(playerSide) {
  FACTION[0] = SIDES[playerSide];
  FACTION[1] = SIDES[playerSide === 'ct' ? 't' : 'ct'];
}

// type: unit | spell | building.  speed in tiles/s.  range measured edge-to-edge.
export const CARDS = {
  rifle: {
    name: 'Riflemen', cost: 4, type: 'unit', count: 2, model: 'rifleman', spread: 0.55,
    hp: 360, dmg: 96, hitSpeed: 0.9, range: 5.0, sight: 6.5, speed: 1.2, radius: 0.35, mass: 3,
    air: false, hitsAir: true, projectile: 'tracer', sfx: 'rifle', lore: 'Two riflemen. Steady fire at anything, ground or air.',
  },
  smg: {
    name: 'SMG Rush', cost: 3, type: 'unit', count: 4, model: 'smg', spread: 0.6,
    hp: 170, dmg: 42, hitSpeed: 0.38, range: 2.6, sight: 5.5, speed: 1.7, radius: 0.3, mass: 2,
    air: false, hitsAir: true, projectile: 'tracer', sfx: 'smg', lore: 'Four fast shooters who shred at close range.',
  },
  sniper: {
    name: 'Marksman', cost: 4, type: 'unit', count: 1, model: 'sniper',
    hp: 300, dmg: 320, hitSpeed: 2.4, range: 7.2, sight: 8, speed: 1.0, radius: 0.35, mass: 3, structMul: 0.4,
    air: false, hitsAir: true, projectile: 'slug', sfx: 'sniper', lore: 'Long-range precision. Deletes troops; barely scratches concrete.',
  },
  heavy: {
    name: 'Heavy Gunner', cost: 5, type: 'unit', count: 1, model: 'heavy',
    hp: 1750, dmg: 175, hitSpeed: 1.3, range: 2.2, sight: 5.5, speed: 0.95, radius: 0.5, mass: 9,
    air: false, hitsAir: false, projectile: 'buckshot', splash: 1.1, sfx: 'shotgun', lore: 'Armoured shotgunner. Every blast hits the whole huddle.',
  },
  mech: {
    name: 'Assault Mech', cost: 7, type: 'unit', count: 1, model: 'mech',
    hp: 3800, dmg: 240, hitSpeed: 1.6, range: 3.2, sight: 7, speed: 0.75, radius: 0.85, mass: 22,
    air: false, hitsAir: false, buildingsOnly: true, projectile: 'shell', splash: 0.8, sfx: 'cannon',
    lore: 'Walks straight for structures and shells them. Huge armour.',
  },
  k9: {
    name: 'K-9 Unit', cost: 2, type: 'unit', count: 1, model: 'dog',
    hp: 400, dmg: 80, hitSpeed: 0.8, range: 0.6, sight: 5.5, speed: 2.2, radius: 0.38, mass: 3,
    air: false, hitsAir: false, sfx: 'bite', lore: 'Fast, cheap and relentless. Great for pulling fire.',
  },
  breacher: {
    name: 'Breacher', cost: 4, type: 'unit', count: 1, model: 'breacher',
    hp: 850, dmg: 700, hitSpeed: 1.6, range: 0.7, sight: 7, speed: 1.9, radius: 0.4, mass: 5,
    air: false, hitsAir: false, buildingsOnly: true, breach: { splash: 1.6, splashDmg: 180 }, sfx: 'plant',
    lore: 'Sprints to a structure, plants a charge and blows it. Gone with the blast.',
  },
  drone: {
    name: 'Recon Drone', cost: 3, type: 'unit', count: 1, model: 'drone',
    hp: 430, dmg: 62, hitSpeed: 0.55, range: 4.0, sight: 6, speed: 2.0, radius: 0.45, mass: 3,
    air: true, hitsAir: true, projectile: 'laser', sfx: 'laser', lore: 'Armed hover-drone. Ground troops without rifles cannot touch it.',
  },
  swarm: {
    name: 'Kamikaze Drones', cost: 3, type: 'unit', count: 3, model: 'kamikaze', spread: 0.55,
    hp: 120, dmg: 210, hitSpeed: 1, range: 0.4, sight: 6, speed: 2.7, radius: 0.32, mass: 1,
    air: true, hitsAir: true, kamikaze: { splash: 1.25 }, sfx: 'boom', lore: 'Three loitering munitions. Each one dives into a target and detonates.',
  },
  sentry: {
    name: 'Sentry Gun', cost: 4, type: 'building', count: 1, model: 'sentry',
    hp: 1150, dmg: 52, hitSpeed: 0.32, range: 6.5, sight: 6.5, radius: 0.7, lifetime: 32,
    air: false, hitsAir: true, projectile: 'tracer', sfx: 'sentry', lore: 'Automated turret. Rapid fire at ground and air for 32 seconds.',
  },
  recruit: {
    name: 'Recruit', cost: 0, type: 'unit', count: 1, model: 'recruit', minion: true,
    hp: 260, dmg: 34, hitSpeed: 1.0, range: 4.0, sight: 6, speed: 1.15, radius: 0.32, mass: 2,
    air: false, hitsAir: true, projectile: 'tracer', sfx: 'recruit', lore: 'Squads that march every lane on a timer.',
  },
  frag: {
    name: 'Frag Grenade', cost: 3, type: 'spell', model: 'grenade',
    radius: 2.2, dmg: 430, towerMul: 0.35, lore: 'Thrown, bounces once, detonates. Clears a huddle.',
  },
  smoke: {
    name: 'Smoke Grenade', cost: 2, type: 'spell', model: 'smokecan',
    radius: 2.6, duration: 7, lore: 'A wall of smoke for 7 seconds. Units inside cannot be targeted from outside it.',
  },
  flash: {
    name: 'Flashbang', cost: 2, type: 'spell', model: 'flashcan',
    radius: 3.0, dmg: 40, stun: 2.4, towerMul: 0.5, lore: 'Blinds everything in the area. Enemies freeze for 2.4 seconds.',
  },
  molotov: {
    name: 'Molotov', cost: 4, type: 'spell', model: 'molotov',
    radius: 2.0, dps: 75, duration: 7, towerMul: 0.3, lore: 'A pool of fire for 7 seconds. Burns ground troops that stand in it.',
  },
};

export const DEFAULT_DECK = ['rifle', 'smg', 'sniper', 'heavy', 'k9', 'drone', 'frag', 'smoke'];

export const RIVAL_NAMES = [
  'Viper', 'Nomad_77', 'desert.fox', 'R4ZOR', 'Echo-Six', 'Kowalski', 'zer0cool', 'SandStorm',
  'Ghostwire', 'Havoc', 'mira_vex', 'Bravo-Two', 'KILO', 'Rook', 'Sh4dow', 'Atlas', 'Valkyrie', 'Crowbar',
];
export const RIVAL_HOUSES = [
  '[NVX] Novex', '[DST] Dust Rats', '[OPS] Black Ops Club', '[HQ] Headquarters', '[RB] Rush Brigade',
  '[CQB] Close Quarters', '[MRK] Marksmen', '[SND] Search Unit',
];
export const RANKS = [
  [0, 'Recruit'], [150, 'Private'], [400, 'Corporal'], [700, 'Sergeant'],
  [1000, 'Lieutenant'], [1400, 'Captain'], [1900, 'Major'], [2500, 'Commander'],
];
export const rankFor = (t) => RANKS.reduce((a, r) => (t >= r[0] ? r[1] : a), RANKS[0][1]);

export const EMOTES = ['gg', 'Nice shot!', 'Hold the line.', 'Push now!'];
