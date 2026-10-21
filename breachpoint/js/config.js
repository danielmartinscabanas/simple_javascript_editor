// Arena + card definitions. World units ≈ tiles. Player side is +z, rival side is -z.

export const ARENA = { halfW: 9, halfL: 16, cell: 0.5 };
export const WALL_HALF = 2.0;                  // |z| < WALL_HALF is the central sandstone wall
export const LONG_X = -6.2, LONG_HALF = 1.1;   // Long Doors (wide, left)
export const MID_HALF = 0.75;                  // Mid Doors (narrow, centre)
export const TUNNEL_X = 6.2, TUNNEL_HALF = 1.0;// Tunnels (covered, right)
export const TUNNEL_COVER = { x: TUNNEL_X, z: 0, hx: 1.25, hz: 3.4 }; // roofed section: units inside are concealed

export const TEAM = { PLAYER: 0, RIVAL: 1 };

export const TOWERS = [
  { kind: 'keep', x: 0, z: 13.2, half: 1.5, hp: 4200, dmg: 105, hitSpeed: 0.8, range: 7.0 },
  { kind: 'bell', x: -5.6, z: 9.8, half: 1.1, hp: 2600, dmg: 82, hitSpeed: 0.7, range: 7.5 },
  { kind: 'bell', x: 5.6, z: 9.8, half: 1.1, hp: 2600, dmg: 82, hitSpeed: 0.7, range: 7.5 },
];

// Hard cover. Listed for the player half; the rival half mirrors z.
export const BLOCKS = [
  { x: 0, z: 6.6, hx: 1.5, hz: 1.0, kind: 'house' },
  { x: -2.9, z: 5.4, hx: 1.25, hz: 0.5, kind: 'container' },
  { x: 2.7, z: 4.9, hx: 0.55, hz: 0.55, kind: 'crates' },
  { x: 3.6, z: 8.0, hx: 0.45, hz: 0.45, kind: 'barrels' },
  { x: -2.6, z: 9.3, hx: 0.5, hz: 0.5, kind: 'crates' },
  { x: 8.0, z: 4.6, hx: 0.5, hz: 0.6, kind: 'barrier' },
];
export const SANDS = [{ x: -6.2, z: 4.3, r: 1.2 }];            // deep sand: halves ground speed
export const MINES = [                                         // proximity mines, re-arm after a delay
  { x: 0, z: 1.3 }, { x: 0, z: -1.3 }, { x: LONG_X, z: 0 },
];
export const MINE = { radius: 0.55, splash: 1.2, dmg: 190, rearm: 9 };

export const ALTAR = { x: 0, z: 0, r: 1.9, captureTime: 4.5, bonus: 0.4 }; // supply drop in Mid
export const SOULS = { max: 10, start: 5, regen: 1 / 2.8 };
export const MATCH = { regulation: 180, overtime: 60, doubleAt: 60 };

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
    hp: 300, dmg: 340, hitSpeed: 2.5, range: 8.5, sight: 9, speed: 1.0, radius: 0.35, mass: 3,
    air: false, hitsAir: true, projectile: 'slug', sfx: 'sniper', lore: 'Out-ranges the towers. One shot, one problem solved.',
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
    air: false, hitsAir: true, projectile: 'tracer', sfx: 'smg', lore: 'Automated turret. Rapid fire at ground and air for 32 seconds.',
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
