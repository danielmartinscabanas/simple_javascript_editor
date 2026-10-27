// Battle maps. Every map is authored for the player's half (z > 0) and mirrored across z = 0 for the rival,
// so both sides play exactly the same ground. Shapes, lane counts and crossings vary from map to map.
//
// Fields (all coordinates in metres, player half unless noted):
//   arena {halfW, halfL}   bounding box;  voids: out-of-bounds rects/polygons
//   paths / grass          ground dressing; river {half, kind} a band across z = 0 with `crossings`
//   water                  impassable water (canal, moat); bridges are walkable decks over it
//   blocks                 hard cover by kind;  covers: concealment zones;  sands, mines
//   objectives             full list (already symmetric);  towers (tier 1/2 per lane, keep)
//   routes                 lane waypoints from the player's base to the rival's;  decor: props without collision

// mirror helpers for authoring: copies with x negated (centred entries are kept once)
const mx = (list) => list.flatMap((f) => (Math.abs(f.x) < 0.01 ? [f] : [f, { ...f, x: -f.x }]));
const mxPts = (list) => list.flatMap((p) => (Math.abs(p[2]) < 0.01 ? [p] : [p, [p[0], p[1], -p[2], p[3], p[4] !== undefined ? -p[4] : undefined]]));

// ---------------------------------------------------------------------------------------------------------
const DUSTLINE = {
  id: 'dustline', name: 'Dustline', theme: 'desert',
  blurb: 'Three desert lanes split by a dry riverbed.',
  arena: { halfW: 20, halfL: 34 },
  deployEdge: 1.9, camZ: 17,
  river: { half: 1.7, kind: 'sand' },
  crossings: [{ x: -17, half: 2.9 }, { x: 0, half: 2.6 }, { x: 17, half: 2.9 }],
  paths: [
    ...mx([{ x: -17, z: 16, hx: 2.9, hz: 14.3 }, { x: -12.9, z: 28.1, hx: 4.95, hz: 2.2 }]),
    { x: 0, z: 13.15, hx: 2.6, hz: 11.45 },
    { x: 0, z: 29.3, hx: 8, hz: 4.7, kind: 'plaza' },
  ],
  blocks: mx([
    { x: -14.1, z: 6.6, hx: 0.25, hz: 2.6, kind: 'wall' },
    { x: -14.1, z: 17.6, hx: 0.25, hz: 5.0, kind: 'wall' },
    { x: -2.85, z: 6.6, hx: 0.25, hz: 2.4, kind: 'wall' },
    { x: -2.85, z: 15.2, hx: 0.25, hz: 3.0, kind: 'wall' },
    { x: -5.4, z: 24.6, hx: 2.6, hz: 0.25, kind: 'wall' },
    { x: -11.1, z: 24.6, hx: 3.0, hz: 0.25, kind: 'wall' },
    { x: -8.25, z: 32.2, hx: 0.25, hz: 1.8, kind: 'wall' },
    { x: -10.3, z: 5.6, hx: 2.0, hz: 1.4, kind: 'house' },
    { x: -6.0, z: 12.6, hx: 1.4, hz: 2.0, kind: 'house' },
    { x: -10.6, z: 18.4, hx: 1.8, hz: 1.6, kind: 'house' },
    { x: -5.9, z: 5.4, hx: 1.1, hz: 0.45, kind: 'container' },
    { x: -6.4, z: 21.4, hx: 1.1, hz: 0.45, kind: 'container' },
    { x: -9.0, z: 10.4, hx: 0.4, hz: 0.4, kind: 'crates' },
    { x: -12.6, z: 13.2, hx: 0.4, hz: 0.4, kind: 'barrels' },
    { x: -15.6, z: 20.2, hx: 0.3, hz: 0.6, kind: 'barrier' },
  ]).concat([
    { x: 1.4, z: 15.0, hx: 0.4, hz: 0.4, kind: 'crates' },
    { x: -1.3, z: 6.0, hx: 0.6, hz: 0.3, kind: 'barrier' },
    { x: 14.1, z: 2.1, hx: 0.25, hz: 2.1, kind: 'wall' },   // Tunnels: inner wall through the river
  ]),
  covers: [{ x: 17, z: 0, hx: 2.9, hz: 4.2, kind: 'tunnel' }],
  sands: mx([{ x: -12.0, z: 10.6, r: 1.1 }, { x: -17, z: 21.5, r: 1.0 }]),
  mines: mx([{ x: -17, z: 3.4 }, { x: 0, z: 4.6 }, { x: -8.4, z: 15.2 }]),
  objectives: [
    { id: 'drop', name: 'Supply Drop', x: 0, z: 0, r: 1.9, captureTime: 4.5, effect: 'funds', bonus: 0.4, blurb: 'funds +40%', short: 'Drop' },
    { id: 'armory', name: 'Armory', x: -8.8, z: 0, r: 1.8, captureTime: 6, effect: 'damage', bonus: 0.15, blurb: 'troops +15% damage', short: 'Arm' },
    { id: 'medic', name: 'Med Station', x: 8.8, z: 0, r: 1.8, captureTime: 6, effect: 'heal', bonus: 0.015, blurb: 'troops heal 1.5%/s', short: 'Med' },
  ],
  towers: [
    { kind: 'keep', lane: 'M', tier: 3, x: 0, z: 30.6, half: 1.5 },
    { kind: 'bell', lane: 'L', tier: 1, x: -17, z: 12, half: 1.1 },
    { kind: 'bell', lane: 'L', tier: 2, x: -13, z: 28.1, half: 1.1 },
    { kind: 'bell', lane: 'M', tier: 1, x: 0, z: 10, half: 1.1 },
    { kind: 'bell', lane: 'M', tier: 2, x: 0, z: 19.5, half: 1.1 },
    { kind: 'bell', lane: 'R', tier: 1, x: 17, z: 12, half: 1.1 },
    { kind: 'bell', lane: 'R', tier: 2, x: 13, z: 28.1, half: 1.1 },
  ],
  routes: {
    L: [[-9, 28.1], [-17, 28.1], [-17, 0], [-17, -28.1], [-9, -28.1], [0, -30.5]],
    M: [[0, 25], [0, 0], [0, -25], [0, -30.5]],
    R: [[9, 28.1], [17, 28.1], [17, 0], [17, -28.1], [9, -28.1], [0, -30.5]],
  },
  laneNames: { L: 'Long', M: 'Mid', R: 'Tunnels' },
  laneMarks: { L: 'A', M: 'M', R: 'B' },
  briefing: [
    ['Lanes', 'Long (left, open and mined), Mid (straight over the river) and Tunnels (right; the walled stretch at the river hides troops).'],
    ['Riverbed', 'Deep sand slows everything on the ground except on the three bridges.'],
  ],
  decor: [],
};

// ---------------------------------------------------------------------------------------------------------
// Overpass: an octagonal city block. A canal cuts off the B side, crossed only by footbridges and the
// highway overpass in the middle; the A side runs past a park; the Connector tunnel links the bases to the plaza.
const OVERPASS = {
  id: 'overpass', name: 'Overpass', theme: 'urban',
  blurb: 'A city block split by a canal: park on A, the Monster tunnel on B, the overpass in the middle.',
  arena: { halfW: 22, halfL: 33 },
  deployEdge: 1.2, camZ: 16, towerHp: 1.5,
  river: null,
  crossings: [],
  voids: [
    ...mx([{ poly: [[-22, 33], [-22, 25.5], [-14.5, 33]] }]),       // cut corners behind the bases
    ...mx([{ poly: [[-22, 0], [-22, 7], [-19.2, 3.5], [-19.2, 0]] }]), // city blocks pinching the middle flanks
    { x: 20.8, z: 16, hx: 1.2, hz: 2.4 },
    { x: -20.8, z: 18.5, hx: 1.2, hz: 2.2 },
  ],
  water: [{ x: 7.4, z: 12.4, hx: 2.0, hz: 12.4 }],                 // the canal (mirrored: z −24.8..24.8)
  bridges: [
    { x: 7.4, z: 0, hx: 2.3, hz: 2.4, kind: 'overpass' },
    { x: 7.4, z: 13.6, hx: 2.3, hz: 1.05, kind: 'foot' },
  ],
  paths: [
    { x: -15.6, z: 13.5, hx: 3.0, hz: 13.5, kind: 'road' },
    { x: 15.6, z: 13.5, hx: 3.0, hz: 13.5, kind: 'road' },
    { x: -12.6, z: 27.6, hx: 4.6, hz: 2.4, kind: 'road' },
    { x: 12.6, z: 27.6, hx: 4.6, hz: 2.4, kind: 'road' },
    { x: 0.4, z: 12.3, hx: 4.0, hz: 12.3, kind: 'plaza' },
    { x: 0, z: 29.3, hx: 8, hz: 3.7, kind: 'plaza' },
  ],
  grass: [{ x: -8, z: 9, hx: 4.6, hz: 7.2 }],
  blocks: [
    // A side
    { x: -10.4, z: 20.4, hx: 2.4, hz: 1.7, kind: 'building' },
    { x: -9.8, z: 14.6, hx: 1.2, hz: 0.9, kind: 'building', h: 0.9 },   // park restrooms
    { x: -19.6, z: 10.8, hx: 0.75, hz: 1.3, kind: 'car' },
    { x: -12.2, z: 4.0, hx: 0.75, hz: 1.4, kind: 'car' },
    { x: -17.6, z: 22.6, hx: 1.1, hz: 0.45, kind: 'container' },
    ...[[-11.6, 6.4], [-5.0, 4.4], [-4.6, 13.8], [-11.8, 11.2], [-7.0, 16.6]].map(([x, z]) => ({ x, z, hx: 0.3, hz: 0.3, kind: 'tree' })),
    // middle
    { x: -3.4, z: 18.0, hx: 0.25, hz: 3.0, kind: 'wall' },             // Connector walls
    { x: 1.4, z: 18.0, hx: 0.25, hz: 3.0, kind: 'wall' },
    { x: 2.8, z: 7.6, hx: 0.6, hz: 0.18, kind: 'barrier' },
    { x: -2.2, z: 3.4, hx: 0.6, hz: 0.18, kind: 'barrier' },
    { x: 3.4, z: 12.6, hx: 0.6, hz: 0.6, kind: 'kiosk' },
    // B side (across the canal)
    { x: 12.4, z: 5.8, hx: 0.25, hz: 2.8, kind: 'wall' },              // Monster tunnel walls
    { x: 18.8, z: 5.8, hx: 0.25, hz: 2.8, kind: 'wall' },
    { x: 20.4, z: 22.0, hx: 1.1, hz: 1.8, kind: 'building' },
    { x: 11.0, z: 18.6, hx: 0.75, hz: 1.3, kind: 'car' },
    { x: 18.4, z: 12.2, hx: 1.1, hz: 0.45, kind: 'container' },
    { x: 13.2, z: 22.8, hx: 0.6, hz: 0.18, kind: 'barrier' },
  ],
  covers: [
    { x: -1.0, z: 18.0, hx: 2.15, hz: 3.0, kind: 'tunnel' },          // Connector
    { x: 15.6, z: 5.8, hx: 3.0, hz: 2.8, kind: 'tunnel' },            // Monster
    { x: -8.6, z: 8.2, hx: 1.9, hz: 1.7, kind: 'grove' },             // park groves
  ],
  sands: [],
  mines: [{ x: -15.6, z: 3.6 }, { x: 0.8, z: 5.0 }, { x: 15.6, z: 10.4 }],
  objectives: [
    { id: 'drop', name: 'Supply Drop', x: -0.4, z: 0, r: 1.9, captureTime: 4.5, effect: 'funds', bonus: 0.4, blurb: 'funds +40%', short: 'Drop' },
    { id: 'armory', name: 'Construction Site', x: -9.0, z: 0, r: 1.8, captureTime: 6, effect: 'damage', bonus: 0.15, blurb: 'troops +15% damage', short: 'Arm' },
    { id: 'medic', name: 'Pharmacy', x: 7.4, z: 0, r: 1.7, captureTime: 6, effect: 'heal', bonus: 0.015, blurb: 'troops heal 1.5%/s', short: 'Med' },
  ],
  towers: [
    { kind: 'keep', lane: 'C', tier: 3, x: 0, z: 30.4, half: 1.5 },
    { kind: 'bell', lane: 'A', tier: 1, x: -15.6, z: 12.4, half: 1.1 },
    { kind: 'bell', lane: 'A', tier: 2, x: -11.4, z: 27.6, half: 1.1 },
    { kind: 'bell', lane: 'B', tier: 1, x: 15.6, z: 13.0, half: 1.1 },
    { kind: 'bell', lane: 'B', tier: 2, x: 11.4, z: 27.6, half: 1.1 },
  ],
  routes: {
    A: [[-7, 27.6], [-15.6, 27.6], [-15.6, 0], [-15.6, -27.6], [-7, -27.6], [0, -30.4]],
    C: [[-1, 25], [-1, 18], [-0.5, 8], [-0.4, 0], [-0.5, -8], [-1, -18], [-1, -25], [0, -30.4]],
    B: [[7, 27.6], [15.6, 27.6], [15.6, 0], [15.6, -27.6], [7, -27.6], [0, -30.4]],
  },
  laneNames: { A: 'A Park', B: 'B Monster', C: 'Connector' },
  laneMarks: { A: 'A', B: 'B' },
  briefing: [
    ['Two lanes and a tunnel', 'A runs past the park, B lies across the canal through the Monster tunnel. The Connector is a walled passage from your base to the plaza with no outposts of its own.'],
    ['The middle', 'The Supply Drop sits in the plaza, the Pharmacy on the overpass and the Construction Site between the park and the plaza: hold the middle to hold them.'],
    ['The canal', 'Impassable on foot: cross it on the overpass in the middle or the footbridges. Drones fly straight over.'],
    ['Cover', 'Troops inside the Connector, the Monster tunnel or the park grove are hidden until enemies get close.'],
  ],
  decor: [
    ...[[-9.4, 7.0], [-7.8, 9.6], [-9.8, 9.2], [-7.2, 7.2]].map(([x, z]) => ['cs_tree-large', { h: 3.2 }, x, z]),
    ['cr_sign-highway', { h: 2.6 }, 10.4, 3.4, Math.PI],
    ['cr_light-curved', { h: 2.6 }, -3.6, 9.5, Math.PI / 2], ['cr_light-curved', { h: 2.6 }, 4.6, 10.5, -Math.PI / 2],
    ['cr_light-curved', { h: 2.6 }, -12.4, 18.0, Math.PI / 2], ['cr_light-curved', { h: 2.6 }, 12.4, 16.0, -Math.PI / 2],
    ['cs_planter', { w: 1.0 }, -4.4, 26.0], ['cs_planter', { w: 1.0 }, 4.4, 26.0],
    ['cr_construction-cone', { h: 0.45 }, -7.4, 1.9], ['cr_construction-cone', { h: 0.45 }, -10.6, 1.6], ['cr_construction-cone', { h: 0.45 }, -11.0, -1.4],
    ['cc_detail-parasol-a', { h: 1.6 }, -2.6, 10.8],
  ],
};

// ---------------------------------------------------------------------------------------------------------
// Citadel: each side holds a walled castle behind a moat; the walls open only at two gatehouses with
// drawbridges. Between the castles lies a village: market square, smithy and chapel, with orchards on the flanks.
const WALL_Z = 21.6, MOAT_Z = 19.4;
const CITADEL = {
  id: 'citadel', name: 'Citadel', theme: 'castle',
  blurb: 'Two castles behind moats; a village between them. Every siege goes through a gatehouse.',
  arena: { halfW: 20, halfL: 34 },
  deployEdge: 1.2, camZ: 16, towerHp: 1.3,
  river: null,
  crossings: [],
  voids: [
    ...mx([{ poly: [[-20, 0], [-20, 4.4], [-18.2, 2.2], [-18.2, 0]] }]), // rocky outcrops at the flanks
  ],
  water: [{ x: 0, z: MOAT_Z, hx: 20, hz: 1.25 }],
  bridges: mx([{ x: -8, z: MOAT_Z, hx: 1.3, hz: 1.45, kind: 'drawbridge' }]),
  paths: [
    ...mx([{ x: -8, z: 18.6, hx: 1.4, hz: 6.6, kind: 'cobble' }, { x: -12.4, z: 7.0, hx: 1.7, hz: 7.0, kind: 'cobble' }]),
    { x: 0, z: 3.0, hx: 6.0, hz: 3.0, kind: 'cobble' },
    { x: 0, z: 28.0, hx: 9.5, hz: 6.0, kind: 'plaza' },
  ],
  grass: [],
  blocks: [
    // curtain wall with two gates
    { x: 0, z: WALL_Z, hx: 6.6, hz: 0.45, kind: 'wall' },
    ...mx([{ x: -14.7, z: WALL_Z, hx: 5.3, hz: 0.45, kind: 'wall' }]),
    // courtyard
    ...mx([{ x: -15.6, z: 28.0, hx: 2.2, hz: 1.6, kind: 'house' }, { x: -4.8, z: 25.0, hx: 0.5, hz: 0.5, kind: 'stall' }]),
    // village
    ...mx([
      { x: -4.6, z: 8.0, hx: 1.5, hz: 1.2, kind: 'house' },
      { x: -17.6, z: 6.8, hx: 1.2, hz: 1.5, kind: 'house' },
      { x: -11.4, z: 15.4, hx: 1.3, hz: 1.0, kind: 'house' },
      { x: -3.6, z: 13.2, hx: 2.0, hz: 0.3, kind: 'hedge' },
      { x: -3.4, z: 2.6, hx: 0.5, hz: 0.5, kind: 'stall' },
      { x: -7.6, z: 4.6, hx: 0.45, hz: 0.65, kind: 'cart' },
      { x: -19.0, z: 15.0, hx: 0.8, hz: 0.7, kind: 'rock' },
    ]),
    { x: 0, z: 6.2, hx: 1.0, hz: 1.0, kind: 'fountain' },
  ],
  covers: mx([{ x: -16.2, z: 11.4, hx: 2.6, hz: 2.4, kind: 'grove' }]),
  sands: [],
  mines: mx([{ x: -12.4, z: 3.4 }]),
  objectives: [
    { id: 'drop', name: 'Market', x: 0, z: 0, r: 1.9, captureTime: 4.5, effect: 'funds', bonus: 0.4, blurb: 'funds +40%', short: 'Market' },
    { id: 'armory', name: 'Smithy', x: -10.4, z: 0, r: 1.8, captureTime: 6, effect: 'damage', bonus: 0.15, blurb: 'troops +15% damage', short: 'Smithy' },
    { id: 'medic', name: 'Chapel', x: 10.4, z: 0, r: 1.8, captureTime: 6, effect: 'heal', bonus: 0.015, blurb: 'troops heal 1.5%/s', short: 'Chapel' },
  ],
  towers: [
    { kind: 'keep', lane: 'W', tier: 3, x: 0, z: 30.4, half: 1.5 },
    { kind: 'bell', lane: 'W', tier: 1, x: -8, z: 14.6, half: 1.1 },
    { kind: 'bell', lane: 'W', tier: 2, x: -11.6, z: 25.4, half: 1.1 },
    { kind: 'bell', lane: 'E', tier: 1, x: 8, z: 14.6, half: 1.1 },
    { kind: 'bell', lane: 'E', tier: 2, x: 11.6, z: 25.4, half: 1.1 },
  ],
  routes: {
    W: [[-5, 26], [-8, 23.2], [-8, MOAT_Z], [-8, 16.6], [-12.4, 11], [-12.4, 0], [-12.4, -11], [-8, -16.6], [-8, -MOAT_Z], [-8, -23.2], [-5, -26], [0, -30.4]],
    E: [[5, 26], [8, 23.2], [8, MOAT_Z], [8, 16.6], [12.4, 11], [12.4, 0], [12.4, -11], [8, -16.6], [8, -MOAT_Z], [8, -23.2], [5, -26], [0, -30.4]],
  },
  laneNames: { W: 'West Gate', E: 'East Gate' },
  laneMarks: { W: 'W', E: 'E' },
  briefing: [
    ['Two gates', 'Your castle wall opens only at the West and East gatehouses, each over a drawbridge across the moat. A gate tower guards each bridge; the inner towers and the keep wait in the courtyard.'],
    ['The village', 'Fight over the Market (funds), the Smithy (damage) and the Chapel (healing) between the castles. The orchards on each flank hide troops under the trees.'],
    ['The moat', 'Impassable on foot. Drones and kamikazes fly over the walls; everything else goes through a gate.'],
  ],
  decor: [
    ...mxPts([
      ['ft_tree-high', { h: 3.6 }, -17.4, 10.2], ['ft_tree-crooked', { h: 3.0 }, -15.0, 12.6], ['ft_tree-high', { h: 3.4 }, -17.0, 13.0], ['ft_tree-crooked', { h: 2.8 }, -14.8, 9.8],
      ['ft_lantern', { h: 1.8 }, -6.4, 0.0], ['ft_lantern', { h: 1.8 }, -9.8, 17.2],
      ['kc_flag-banner-long', { h: 2.8 }, -9.6, WALL_Z + 0.5], ['kc_flag-banner-long', { h: 2.8 }, -6.4, WALL_Z + 0.5],
      ['ft_banner-red', { h: 1.4 }, -10.4, 3.4],
      ['kc_siege-catapult', { w: 2.2 }, -18.2, 31.0, 0.6],
    ]),
    ['ft_tree-high', { h: 3.2 }, -1.6, 17.8], ['ft_tree-high', { h: 3.0 }, 1.8, 17.2],
  ],
  // castle dressing: corner towers along the wall and gatehouse towers beside each gate
  wallTowers: [...mx([{ x: -19.4, z: WALL_Z }, { x: -9.75, z: WALL_Z }, { x: -6.25, z: WALL_Z }])],
};

export const MAPS = { dustline: DUSTLINE, overpass: OVERPASS, citadel: CITADEL };
export const MAP_ORDER = ['dustline', 'overpass', 'citadel'];
