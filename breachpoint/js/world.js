import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ARENA, MAP, RIVER, OBJECTIVES, TOWERS, FACTION } from './config.js';
import { ALL_BLOCKS, ALL_SANDS, ALL_MINES, ALL_VOIDS, ALL_WATER, ALL_BRIDGES, ALL_COVERS, mirrored, inShape, onBridge, prepareMap } from './nav.js';
import { sand, pavers, plaster, rng, grass, asphalt, concrete, water as waterTex, flagstones } from './textures.js';
import { prop, propBox } from './models.js';
import { Particles } from './particles.js';

const std = (o) => new THREE.MeshStandardMaterial(o);
const at = (o, x, y, z) => { o.position.set(x, y, z); return o; };
function mesh(geo, mat, cast = true, receive = true) {
  const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = receive; return m;
}
// a flat ground strip with its texture repeated per `metres`
function strip(tex, metres, w, d, x, z, y, color = 0xffffff, rot = 0) {
  const t = tex.clone(); t.needsUpdate = true; t.repeat.set(w / metres, d / metres);
  const m = mesh(new THREE.PlaneGeometry(w, d), std({ map: t, roughness: 0.92, color }), false, true);
  m.rotation.x = -Math.PI / 2; m.rotation.z = rot; m.position.set(x, y, z);
  return m;
}
const hash = (x, z) => { const v = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return v - Math.floor(v); };
// sample points inside a void shape on a grid
function pointsIn(shape, step) {
  const pts = [];
  const xs = shape.poly ? shape.poly.map((p) => p[0]) : [shape.x - shape.hx, shape.x + shape.hx];
  const zs = shape.poly ? shape.poly.map((p) => p[1]) : [shape.z - shape.hz, shape.z + shape.hz];
  for (let x = Math.min(...xs) + step / 2; x < Math.max(...xs); x += step) {
    for (let z = Math.min(...zs) + step / 2; z < Math.max(...zs); z += step) if (inShape(shape, x, z)) pts.push([x, z]);
  }
  if (!pts.length) pts.push([(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2]);
  return pts;
}

const THEMES = {
  desert: { bg: 0x9cc4e6, fog: [0xe2cfa6, 80, 220], hemi: [0xcfe3ff, 0xa07848, 1.15], sun: [0xfff0d0, 2.3], top: [0.30, 0.55, 0.86], hor: [0.93, 0.84, 0.66], dust: [0.85, 0.72, 0.52, 0.16] },
  urban: { bg: 0xa9bccc, fog: [0xb9c3c8, 95, 240], hemi: [0xdde8f4, 0x707070, 1.2], sun: [0xfff6e8, 2.15], top: [0.40, 0.57, 0.78], hor: [0.82, 0.84, 0.85], dust: [0.75, 0.75, 0.74, 0.08] },
  castle: { bg: 0x9cc8ea, fog: [0xc9d8c0, 95, 240], hemi: [0xd8ecff, 0x5a7a3a, 1.15], sun: [0xfff2d6, 2.35], top: [0.32, 0.58, 0.90], hor: [0.86, 0.90, 0.82], dust: [0.9, 0.95, 0.8, 0.06] },
};

export class World {
  constructor(scene) {
    prepareMap();
    this.scene = scene;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.theme = MAP.theme;
    this.th = THEMES[this.theme];
    this.t = 0;
    this.mats = {
      wall: std({ map: plaster(4), color: this.theme === 'urban' ? 0xb8b4ac : 0xc49a6a, roughness: 0.95 }),
      wallTop: std({ color: this.theme === 'urban' ? 0x6f6c66 : this.theme === 'castle' ? 0x6c665c : 0x7e5a38, roughness: 0.9 }),
      roofTop: std({ color: this.theme === 'urban' ? 0x5c5a58 : 0x9c7b56, roughness: 0.95 }),
      wood: std({ color: 0x6a4424, roughness: 0.85 }),
      darkWood: std({ color: 0x3e2614, roughness: 0.9 }),
      metal: std({ color: 0x4a4e52, roughness: 0.45, metalness: 0.7 }),
      shade: std({ color: 0x3a2c1c, roughness: 1 }),
      concrete: std({ map: concrete(31), color: 0xd0ccc4, roughness: 0.95 }),
      stone: std({ map: flagstones(41, 512, 512, 6), color: 0xb8b0a0, roughness: 0.95 }),
    };
    this.lights();
    this.sky();
    this.ground();
    this.river();
    this.waterways();
    this.voidFill();
    this.blocks();
    this.covers();
    this.castleDressing();
    this.mineField();
    this.objectivePads();
    this.siteMarks();
    this.sands();
    this.decor();
    this.perimeter();
    this.outskirts();
    this.zoneOverlay();
    this.fx = new Particles(this.root, 3200, true);
    this.smoke = new Particles(this.root, 2800, false);
    this.thicketMeshes = ALL_COVERS.map((c) => ({ def: { x: c.x, z: c.z }, rustle: 0 }));
    if (!this.thicketMeshes.length) this.thicketMeshes.push({ def: { x: 999, z: 999 }, rustle: 0 });
  }

  add(...o) { this.root.add(...o); return o[0]; }

  dispose() {
    this.scene.remove(this.root);
    this.root.traverse((o) => { if (o.geometry && o.isMesh) o.geometry.dispose(); });
  }

  lights() {
    const th = this.th;
    this.scene.background = new THREE.Color(th.bg);
    this.scene.fog = new THREE.Fog(...th.fog);
    this.add(new THREE.HemisphereLight(...th.hemi));
    this.add(new THREE.AmbientLight(0xfff0dd, 0.35));
    const sun = new THREE.DirectionalLight(...th.sun);
    sun.position.set(18, 34, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    const c = sun.shadow.camera;
    c.left = -ARENA.halfW - 6; c.right = ARENA.halfW + 6; c.top = ARENA.halfL + 6; c.bottom = -ARENA.halfL - 6; c.near = 1; c.far = 130;
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
    this.add(sun);
    const fill = new THREE.DirectionalLight(0xbcd4ff, 0.8);
    fill.position.set(-10, 12, 30);
    this.add(fill);
  }

  sky() {
    const th = this.th;
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Vector3(...th.top) }, hor: { value: new THREE.Vector3(...th.hor) } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: 'uniform vec3 top; uniform vec3 hor; varying vec3 vP; void main(){ gl_FragColor = vec4(mix(hor, top, smoothstep(-0.02, 0.5, vP.y)), 1.0); }',
    });
    this.add(new THREE.Mesh(new THREE.SphereGeometry(260, 32, 16), mat));
  }

  ground() {
    const W = ARENA.halfW, L = ARENA.halfL, th = this.theme;
    if (th === 'desert') {
      this.sandTex = sand(5);
      const g = mesh(new THREE.PlaneGeometry(320, 320), std({ map: this.sandTex, roughness: 1, color: 0xf2dcb0 }), false, true);
      g.rotation.x = -Math.PI / 2; g.position.y = -0.03;
      this.add(g);
      this.add(strip(sand(9), 6, W * 2, L * 2, 0, 0, -0.01, 0xd8bb88));
    } else if (th === 'urban') {
      this.add(strip(asphalt(7, false), 8, 320, 320, 0, 0, -0.03, 0x8a8a8a));
      this.add(strip(concrete(12), 4, W * 2, L * 2, 0, 0, -0.01, 0xd8d4cc));
    } else {
      this.sandTex = grass(5);
      this.add(strip(this.sandTex, 6, 320, 320, 0, 0, -0.03, 0xb8d0a0));
      this.add(strip(grass(9, [0.46, 0.6, 0.3]), 5, W * 2, L * 2, 0, 0, -0.01, 0xffffff));
    }
    const tex = {
      road: asphalt(11), plaza: th === 'urban' ? pavers(21, 1024, 1024, 8) : th === 'castle' ? flagstones(23, 1024, 1024, 8) : pavers(11, 1024, 1024, 8),
      cobble: flagstones(13, 1024, 1024, 8), path: pavers(11, 1024, 1024, 8),
    };
    for (const p of mirrored(MAP.paths)) {
      const kind = p.kind || 'path';
      const vertical = p.hz >= p.hx;
      const color = kind === 'plaza' ? (th === 'urban' ? 0xc8c4bc : th === 'castle' ? 0xd8d0c0 : 0xf4e6cc) : kind === 'cobble' ? 0xc8beac : 0xffffff;
      if (kind === 'road') this.add(strip(tex.road, 6, vertical ? p.hx * 2 : p.hz * 2, vertical ? p.hz * 2 : p.hx * 2, p.x, p.z, 0.004, 0xffffff, vertical ? 0 : Math.PI / 2));
      else this.add(strip(tex[kind] || tex.path, 8, p.hx * 2, p.hz * 2, p.x, p.z, kind === 'plaza' ? 0.006 : 0.005, color));
    }
    for (const g of mirrored(MAP.grass || [])) this.add(strip(grass(17), 4, g.hx * 2, g.hz * 2, g.x, g.z, 0.007, 0xffffff));
  }

  river() {
    if (!RIVER.half) return;
    this.add(strip(sand(21), 5, ARENA.halfW * 2, RIVER.half * 2, 0, 0, 0.003, 0xa98a5c));
    const pebbles = [];
    const r = rng(77);
    for (let i = 0; i < 160; i++) {
      const x = (r() - 0.5) * ARENA.halfW * 2, z = (r() - 0.5) * RIVER.half * 1.8;
      if (onBridge(x) || OBJECTIVES.some((o) => Math.hypot(x - o.x, z - o.z) < o.r + 0.5)) continue;
      const s = 0.05 + r() * 0.12;
      pebbles.push(new THREE.DodecahedronGeometry(s, 0).translate(x, s * 0.4, z));
    }
    if (pebbles.length) this.add(mesh(mergeGeometries(pebbles), std({ color: 0x8a7458, roughness: 1 }), false, true));
    const m = this.mats;
    for (const lane of MAP.crossings) {
      const w = lane.half * 2;
      this.add(at(mesh(new THREE.BoxGeometry(w, 0.08, RIVER.half * 2 + 0.6), m.wood, false, true), lane.x, 0.04, 0));
      for (let z = -RIVER.half; z <= RIVER.half; z += 0.5) this.add(at(mesh(new THREE.BoxGeometry(w, 0.02, 0.06), m.darkWood, false, true), lane.x, 0.09, z));
      if (ALL_COVERS.some((c) => inShape(c, lane.x, 0))) continue;
      for (const s of [-1, 1]) {
        this.add(at(mesh(new THREE.BoxGeometry(0.08, 0.08, RIVER.half * 2 + 0.6), m.darkWood), lane.x + s * (lane.half - 0.06), 0.55, 0));
        for (const z of [-RIVER.half, 0, RIVER.half]) this.add(at(mesh(new THREE.BoxGeometry(0.1, 0.55, 0.1), m.darkWood), lane.x + s * (lane.half - 0.06), 0.27, z));
      }
    }
  }

  // canals and moats with their banks, and the decks that cross them
  waterways() {
    if (!ALL_WATER.length) return;
    const wt = waterTex(3);
    this.waterTex = wt;
    const bankMat = this.theme === 'castle' ? this.mats.stone : this.mats.concrete;
    for (const w of ALL_WATER) {
      const wm = strip(wt, 3, w.hx * 2, w.hz * 2, w.x, w.z, 0.012, 0xa8c8d8);
      wm.material.roughness = 0.12; wm.material.metalness = 0.35; wm.receiveShadow = true;
      this.add(wm);
      // banks along the long edges, broken where a bridge lands
      const along = w.hx > w.hz;
      const len = along ? w.hx * 2 : w.hz * 2;
      for (const s of [-1, 1]) {
        const segs = [];
        let a = -len / 2;
        const gaps = ALL_BRIDGES.filter((b) => (along ? Math.abs(b.z - w.z) < w.hz + 0.5 : Math.abs(b.x - w.x) < w.hx + 0.5))
          .map((b) => (along ? [b.x - b.hx - w.x, b.x + b.hx - w.x] : [b.z - b.hz - w.z, b.z + b.hz - w.z])).sort((p, q) => p[0] - q[0]);
        for (const [g0, g1] of gaps) { if (g0 > a) segs.push([a, g0]); a = Math.max(a, g1); }
        if (a < len / 2) segs.push([a, len / 2]);
        for (const [s0, s1] of segs) {
          const l = s1 - s0, c = (s0 + s1) / 2;
          const geo = along ? new THREE.BoxGeometry(l, 0.32, 0.3) : new THREE.BoxGeometry(0.3, 0.32, l);
          const b = mesh(geo, bankMat);
          if (along) b.position.set(w.x + c, 0.1, w.z + s * (w.hz + 0.05)); else b.position.set(w.x + s * (w.hx + 0.05), 0.1, w.z + c);
          this.add(b);
        }
      }
    }
    for (const b of ALL_BRIDGES) this.bridge(b);
  }

  bridge(b) {
    const m = this.mats;
    if (b.kind === 'drawbridge') {
      const d = propBox('kc_bridge-draw', b.hx * 2, 0.16, b.hz * 2 + 0.3);
      if (d) { d.position.set(b.x, 0.02, b.z); this.add(d); }
      else this.add(at(mesh(new THREE.BoxGeometry(b.hx * 2, 0.12, b.hz * 2 + 0.3), m.wood), b.x, 0.06, b.z));
      for (const s of [-1, 1]) this.add(at(mesh(new THREE.BoxGeometry(0.06, 0.06, b.hz * 2.1), m.metal), b.x + s * (b.hx - 0.1), 0.5, b.z));
      return;
    }
    const deck = mesh(new THREE.BoxGeometry(b.hx * 2 + 0.6, 0.22, b.hz * 2), b.kind === 'overpass' ? m.concrete : m.wallTop);
    deck.position.set(b.x, 0.02, b.z); this.add(deck);
    if (b.kind === 'overpass') {
      this.add(strip(asphalt(5), 4, b.hx * 2 - 0.4, b.hz * 2, b.x, b.z, 0.14, 0xffffff));
      for (const s of [-1, 1]) {
        this.add(at(mesh(new THREE.BoxGeometry(b.hx * 2 + 0.6, 0.45, 0.18), m.concrete), b.x, 0.34, b.z + s * (b.hz - 0.05)));
        for (const dx of [-b.hx * 0.6, b.hx * 0.6]) { const p = prop('cr_bridge-pillar', { h: 0.9 }); if (p) { p.position.set(b.x + dx, -0.7, b.z + s * (b.hz - 0.4)); this.add(p); } }
      }
    } else {
      for (const s of [-1, 1]) {
        this.add(at(mesh(new THREE.BoxGeometry(b.hx * 2 + 0.6, 0.06, 0.06), m.metal), b.x, 0.62, b.z + s * (b.hz - 0.05)));
        for (const dx of [-b.hx, 0, b.hx]) this.add(at(mesh(new THREE.BoxGeometry(0.06, 0.6, 0.06), m.metal), b.x + dx, 0.32, b.z + s * (b.hz - 0.05)));
      }
    }
  }

  // out-of-bounds pockets: city blocks on the urban map, rock outcrops on the castle map
  voidFill() {
    for (const v of ALL_VOIDS) {
      const pts = pointsIn(v, this.theme === 'urban' ? 2.4 : 1.6);
      if (this.theme === 'urban') {
        const files = ['cc_low-detail-building-a', 'cc_low-detail-building-d', 'cc_low-detail-building-h', 'cc_building-g', 'cc_building-skyscraper-a'];
        for (const [x, z] of pts) {
          const f = files[Math.floor(hash(x, z) * files.length)];
          const p = propBox(f, 2.3, 3.5 + hash(z, x) * 4, 2.3);
          if (p) { p.position.set(x, 0, z); this.add(p); }
        }
      } else if (this.theme === 'castle') {
        for (const [x, z] of pts) {
          const p = prop(hash(x, z) < 0.5 ? 'kc_rocks-large' : 'ft_rock-large', { w: 1.8 + hash(z, x) * 0.8 });
          if (p) { p.position.x += x; p.position.z += z; p.rotation.y = hash(x * 3, z) * 6; this.add(p); }
        }
      } else {
        for (const [x, z] of pts) this.add(at(mesh(new THREE.DodecahedronGeometry(0.8, 0), std({ color: 0x9a7a52, roughness: 1 })), x, 0.3, z));
      }
    }
  }

  wallBox(b, h, mat = this.mats.wall, capMat = this.mats.wallTop) {
    const g = new THREE.Group();
    const body = mesh(new THREE.BoxGeometry(b.hx * 2, h, b.hz * 2), mat);
    body.position.y = h / 2;
    const uv = body.geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.max(b.hx, b.hz), uv.getY(i) * h / 2);
    const cap = mesh(new THREE.BoxGeometry(b.hx * 2 + 0.08, 0.1, b.hz * 2 + 0.08), capMat);
    cap.position.y = h + 0.05;
    g.add(body, cap);
    g.position.set(b.x, 0, b.z);
    this.add(g);
    return g;
  }

  // a run of modular pieces (castle walls, hedges) along a block's long axis
  tile(file, b, h, depth) {
    const along = b.hx >= b.hz;
    const len = (along ? b.hx : b.hz) * 2;
    const n = Math.max(1, Math.round(len / 1.4));
    const seg = len / n;
    for (let i = 0; i < n; i++) {
      const o = -len / 2 + seg * (i + 0.5);
      const p = propBox(file, along ? seg : depth, h, along ? depth : seg);
      if (!p) return false;
      p.position.set(b.x + (along ? o : 0), 0, b.z + (along ? 0 : o));
      this.add(p);
    }
    return true;
  }

  blocks() {
    const th = this.theme;
    for (const b of ALL_BLOCKS) {
      const rot = b.z < 0 ? Math.PI : 0;
      const k = b.kind;
      const place = (p, x = b.x, z = b.z, r = rot, y = 0) => { if (p) { p.position.x += x; p.position.z += z; p.position.y += y; p.rotation.y = r; this.add(p); } return p; };
      if (k === 'wall') {
        if (th === 'castle' && this.tile('kc_wall', b, 1.9, b.hx >= b.hz ? b.hz * 2 + 0.3 : b.hx * 2 + 0.3)) continue;
        this.wallBox(b, th === 'urban' ? 1.05 : 0.95, th === 'urban' ? this.mats.concrete : this.mats.wall);
      } else if (k === 'house') {
        if (th === 'castle') this.timberHouse(b, rot); else this.house(b, rot);
      } else if (k === 'building') {
        const big = b.hx * b.hz;
        const files = big > 3 ? ['cc_building-j', 'ci_building-f', 'ci_building-c', 'cc_building-e'] : ['cc_building-c', 'cc_building-a', 'cc_building-e', 'cc_building-g'];
        const f = files[Math.floor(hash(b.x, b.z) * files.length)];
        const p = propBox(f, b.hx * 2, (b.h || 1.6) + hash(b.z, b.x) * 0.8, b.hz * 2, rot);
        if (p) { p.position.set(b.x, 0, b.z); this.add(p); } else this.house(b, rot);
      } else if (k === 'car') {
        const files = ['v_sedan', 'v_taxi', 'v_van', 'v_delivery'];
        const along = b.hz > b.hx;
        place(prop(files[Math.floor(hash(b.x, b.z) * files.length)], { d: (along ? b.hz : b.hx) * 2 }), b.x, b.z, along ? (hash(b.z, b.x) < 0.5 ? 0 : Math.PI) : Math.PI / 2);
      } else if (k === 'tree') {
        place(th === 'castle' ? prop('ft_tree-high', { h: 3.4 }) : prop('cs_tree-large', { h: 3.4 }), b.x, b.z, hash(b.x, b.z) * 6);
      } else if (k === 'kiosk') {
        place(prop('b_crate-wide', { w: b.hx * 1.6 }));
        place(prop('cc_detail-parasol-a', { h: 1.7 }), b.x + 0.3, b.z - 0.2);
      } else if (k === 'hedge') {
        if (!this.tile('ft_hedge-large', b, 0.9, b.hx >= b.hz ? b.hz * 2 + 0.1 : b.hx * 2 + 0.1)) this.wallBox(b, 0.8, std({ color: 0x3f6a2a }));
      } else if (k === 'stall') place(prop(hash(b.x, b.z) < 0.5 ? 'ft_stall-red' : 'ft_stall-green', { w: b.hx * 2.2 }));
      else if (k === 'cart') place(prop('ft_cart', { d: b.hz * 2 }), b.x, b.z, hash(b.x, b.z) * 0.6 - 0.3);
      else if (k === 'fountain') place(prop('ft_fountain-round', { w: b.hx * 2.1 }));
      else if (k === 'rock') place(prop('ft_rock-large', { w: b.hx * 2.2 }), b.x, b.z, hash(b.x, b.z) * 6);
      else if (k === 'container') place(prop(b.x < 0 ? 'e_Container_Red' : 'e_Container_Green', { w: b.hx * 2.05 }));
      else if (k === 'crates') place(prop('b_crate-medium', { w: b.hx * 2 }));
      else if (k === 'barrels') {
        for (const [dx, dz] of [[-0.18, -0.18], [0.2, -0.12], [0, 0.2]]) place(prop('e_Barrel', { h: 0.7 }), b.x + dx, b.z + dz, hash(b.x + dx, b.z) * 3);
      } else if (k === 'barrier') {
        const along = b.hx > b.hz;
        const p = th === 'urban' ? prop('cr_construction-barrier', { d: Math.max(b.hx, b.hz) * 2 }) : null;
        if (p) place(p, b.x, b.z, along ? Math.PI / 2 : 0);
        else place(prop('r_detail-barrier-strong-type-a', { w: Math.max(b.hx, b.hz) * 2.1 }) || prop('e_TrafficBarrier_1', { w: Math.max(b.hx, b.hz) * 2 }), b.x, b.z, along ? 0 : Math.PI / 2);
      }
    }
  }

  house(b, rot) {
    const m = this.mats, h = 1.3;
    const g = this.wallBox(b, h);
    g.children[1].material = m.roofTop;
    const lip = [];
    for (const [w, d, x, z] of [[b.hx * 2, 0.12, 0, b.hz], [b.hx * 2, 0.12, 0, -b.hz], [0.12, b.hz * 2, b.hx, 0], [0.12, b.hz * 2, -b.hx, 0]]) {
      lip.push(new THREE.BoxGeometry(w + 0.08, 0.16, d + 0.08).translate(x, h + 0.16, z));
    }
    g.add(mesh(mergeGeometries(lip), m.wallTop));
    const face = rot ? 1 : -1;
    g.add(at(mesh(new THREE.BoxGeometry(0.6, 0.95, 0.06), m.darkWood), -b.hx * 0.35, 0.48, face * (b.hz + 0.01)));
    g.add(at(mesh(new THREE.BoxGeometry(0.5, 0.35, 0.06), m.shade), b.hx * 0.4, 0.85, face * (b.hz + 0.01)));
    const awning = mesh(new THREE.BoxGeometry(1.0, 0.04, 0.5), std({ color: [0x2f6f8f, 0x8f3f2f, 0x5f7f3f][Math.abs(Math.round(b.x * 3 + b.z)) % 3], roughness: 0.8 }));
    awning.position.set(-b.hx * 0.35, 1.1, face * (b.hz + 0.26)); awning.rotation.x = face * -0.25;
    g.add(awning);
    const ac = prop('r_detail-dumpster-closed', { w: 0.8 });
    if (ac) { ac.position.set(b.hx + 0.45, 0, 0); ac.rotation.y = Math.PI / 2; g.add(ac); }
  }

  // medieval house: a stretched stone block with a gabled roof from the fantasy town kit
  timberHouse(b, rot) {
    const h = 1.15;
    const ridgeAlongX = b.hx >= b.hz;
    const body = propBox('ft_wall-block', b.hx * 2, h, b.hz * 2);
    if (!body) return this.house(b, rot);
    body.position.set(b.x, 0, b.z); this.add(body);
    const roof = propBox('ft_roof-high-gable', b.hx * 2 + 0.25, 1.0, b.hz * 2 + 0.25, ridgeAlongX ? 0 : Math.PI / 2);
    if (roof) { roof.position.set(b.x, h, b.z); this.add(roof); }
    const face = rot ? 1 : -1;
    this.add(at(mesh(new THREE.BoxGeometry(0.5, 0.8, 0.06), this.mats.darkWood), b.x - b.hx * 0.3, 0.4, b.z + face * (b.hz + 0.01)));
  }

  covers() {
    const m = this.mats;
    for (const c of ALL_COVERS) {
      if (c.kind === 'tunnel') {
        const floor = mesh(new THREE.PlaneGeometry(c.hx * 2, c.hz * 2), std({ color: 0x3a3024, roughness: 1, transparent: true, opacity: 0.55 }), false, true);
        floor.rotation.x = -Math.PI / 2; floor.position.set(c.x, 0.1, c.z);
        this.add(floor);
        for (const s of [-1, 1]) {
          const beam = mesh(new THREE.BoxGeometry(c.hx * 2, 0.16, 0.16), this.theme === 'urban' ? m.metal : m.darkWood);
          beam.position.set(c.x, 0.18, c.z + s * c.hz);
          this.add(beam);
        }
      } else if (c.kind === 'grove') {
        const g = new THREE.Mesh(new THREE.CircleGeometry(1, 28), new THREE.MeshBasicMaterial({ color: 0x1e2a12, transparent: true, opacity: 0.32, depthWrite: false }));
        g.scale.set(c.hx * 1.15, c.hz * 1.15, 1); g.rotation.x = -Math.PI / 2; g.position.set(c.x, 0.012, c.z); g.renderOrder = 2;
        this.add(g);
      }
    }
    // Long Doors on Dustline: swung gates where Long meets the river
    if (MAP.id === 'dustline') {
      for (const sz of [-1, 1]) for (const s of [-1, 1]) {
        const pivot = new THREE.Group();
        pivot.position.set(-17 + s * 2.9, 0, sz * (RIVER.half + 0.5));
        pivot.add(at(mesh(new THREE.BoxGeometry(2.3, 1.0, 0.1), m.wood), -s * 1.16, 0.55, 0));
        pivot.rotation.y = s * sz * 1.25;
        this.add(pivot);
      }
    }
  }

  // castle towers at the wall corners and either side of each gate
  castleDressing() {
    for (const t of mirrored(MAP.wallTowers || [])) {
      const base = propBox('kc_tower-square', 1.5, 2.3, 1.5);
      if (!base) return;
      base.position.set(t.x, 0, t.z); this.add(base);
      const top = propBox('kc_tower-hexagon-roof', 1.5, 1.1, 1.5);
      if (top) { top.position.set(t.x, 2.3, t.z); this.add(top); }
    }
  }

  mineField() {
    this.mines = ALL_MINES.map((d) => {
      const g = new THREE.Group();
      const plate = mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.08, 14), this.mats.metal);
      plate.position.y = 0.04;
      const ledMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.15, 0.1) });
      const led = mesh(new THREE.SphereGeometry(0.05, 8, 6), ledMat, false, false);
      led.position.y = 0.12;
      g.add(plate, led);
      g.position.set(d.x, 0, d.z);
      this.add(g);
      return { def: d, group: g, led: ledMat, plate };
    });
  }

  objectivePads() {
    const tint = { drop: 0xf2d24a, armory: 0xff6a3c, medic: 0xf4f4f4 };
    const islandCol = { desert: 0xb79a6a, urban: 0x9a968e, castle: 0xa89c86 }[this.theme];
    this.pads = OBJECTIVES.map((o) => {
      const g = new THREE.Group();
      g.add(mesh(new THREE.CylinderGeometry(o.r + 0.4, o.r + 0.6, 0.12, 40), std({ color: islandCol, roughness: 1 }), false, true));
      const pad = new THREE.Mesh(new THREE.CircleGeometry(o.r, 40), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.2, depthWrite: false }));
      pad.rotation.x = -Math.PI / 2; pad.position.y = 0.07;
      g.add(pad);
      const markMat = new THREE.MeshBasicMaterial({ color: tint[o.id], transparent: true, opacity: 0.85, depthWrite: false });
      if (o.id === 'medic') {
        for (const r of [0, Math.PI / 2]) { const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 1.8), markMat); bar.rotation.set(-Math.PI / 2, 0, r); bar.position.y = 0.08; g.add(bar); }
      } else {
        for (let i = 0; i < 4; i++) {
          const c = new THREE.Mesh(new THREE.PlaneGeometry(0.24, o.r * 0.6), markMat);
          const a = i * Math.PI / 2 + Math.PI / 4;
          c.rotation.set(-Math.PI / 2, 0, a); c.position.set(Math.cos(a) * o.r * 0.62, 0.08, Math.sin(a) * o.r * 0.62);
          g.add(c);
        }
      }
      const progressMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(new THREE.RingGeometry(o.r - 0.16, o.r, 64, 1), progressMat);
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.09; ring.renderOrder = 6;
      g.add(ring);
      const castle = this.theme === 'castle';
      const piece = o.id === 'drop' ? (castle ? prop('ft_stall-red', { w: 1.0 }) : prop('b_crate-wide', { w: 0.9 }))
        : o.id === 'armory' ? (castle ? prop('kc_siege-ram', { w: 1.3 }) : prop('e_Pallet', { w: 1.0 }))
          : (castle ? prop('ft_banner-red', { h: 1.2 }) : prop('s_box-large', { w: 0.7 }));
      if (piece) { piece.position.y += 0.06; g.add(piece); }
      const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending });
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.35, 24, 12, 1, true), beaconMat);
      beam.position.y = 12; g.add(beam);
      const light = new THREE.PointLight(0xffffff, 0, 6, 1.5);
      light.position.set(0, 1.5, 0); g.add(light);
      g.position.set(o.x, ALL_BRIDGES.some((b) => inShape(b, o.x, o.z)) ? 0.1 : 0, o.z); // lift pads that sit on a bridge deck
      this.add(g);
      return { def: o, ring, progressMat, beaconMat, light };
    });
  }

  // stencilled lane letters by each outer outpost
  siteMarks() {
    const letter = (ch) => {
      const c = document.createElement('canvas'); c.width = c.height = 256;
      const g = c.getContext('2d');
      g.strokeStyle = 'rgba(240,200,60,0.85)'; g.lineWidth = 14;
      g.strokeRect(20, 20, 216, 216);
      g.fillStyle = 'rgba(240,200,60,0.85)';
      g.font = "bold 190px 'Black Ops One', Impact, 'Arial Black', sans-serif";
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(ch, 128, 140);
      g.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.5})`; g.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 6, 2 + Math.random() * 6); }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
      return t;
    };
    const marks = MAP.laneMarks || {};
    const tex = Object.fromEntries(Object.entries(marks).map(([k, v]) => [k, letter(v)]));
    for (const s of [1, -1]) for (const t of TOWERS.filter((t) => t.tier === 1 && tex[t.lane])) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({ map: tex[t.lane], transparent: true, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.rotation.z = s > 0 ? 0 : Math.PI;
      m.position.set(t.x + (Math.abs(t.x) < 1 ? 1.7 : 0), 0.02, s * (t.z - 2.6)); m.renderOrder = 2;
      this.add(m);
    }
  }

  sands() {
    this.mireDefs = ALL_SANDS;
    for (const s of this.mireDefs) {
      const dune = mesh(new THREE.SphereGeometry(s.r, 20, 10), std({ map: this.sandTex || sand(8), color: 0xe8c890, roughness: 1 }), false, true);
      dune.scale.set(1, 0.08, 1); dune.position.set(s.x, 0, s.z);
      this.add(dune);
    }
  }

  // map-specific props without collision (trees over groves, lamps, banners…)
  decor() {
    const list = (MAP.decor || []).flatMap((d) => (Math.abs(d[3]) < 1e-6 ? [d] : [d, [d[0], d[1], d[2], -d[3], d[4] !== undefined ? d[4] + Math.PI : Math.PI]]));
    for (const [file, opt, x, z, rot = 0] of list) {
      const p = prop(file, opt);
      if (!p) continue;
      p.position.x += x; p.position.z += z; p.rotation.y = rot;
      this.add(p);
    }
  }

  perimeter() {
    const W = ARENA.halfW, L = ARENA.halfL;
    const curb = [];
    for (const s of [-1, 1]) {
      curb.push(new THREE.BoxGeometry(0.35, 0.28, L * 2 + 0.6).translate(s * (W + 0.25), 0.14, 0));
      curb.push(new THREE.BoxGeometry(W * 2 + 0.85, 0.28, 0.35).translate(0, 0.14, s * (L + 0.25)));
    }
    this.add(mesh(mergeGeometries(curb), this.mats.wallTop));
  }

  outskirts() {
    const r = rng(42);
    const W = ARENA.halfW, L = ARENA.halfL;
    const put = (f, opt, x, z, rot) => { const p = prop(f, opt); if (p) { p.position.x += x; p.position.z += z; p.rotation.y = rot; this.add(p); } };
    if (this.theme === 'urban') {
      // a ring of city blocks framing the map
      const files = ['cc_low-detail-building-a', 'cc_low-detail-building-d', 'cc_low-detail-building-h', 'cc_low-detail-building-wide-a', 'cc_building-skyscraper-a', 'ci_building-c'];
      for (const s of [-1, 1]) {
        for (let z = -L; z <= L; z += 3.2) {
          const p = propBox(files[Math.floor(r() * files.length)], 2.8, 4 + r() * 6, 2.8);
          if (p) { p.position.set(s * (W + 3.2 + r() * 1.5), 0, z); this.add(p); }
        }
        for (let x = -W + 1; x <= W; x += 3.2) {
          const p = propBox(files[Math.floor(r() * files.length)], 2.8, 4 + r() * 6, 2.8);
          if (p) { p.position.set(x, 0, s * (L + 3.4 + r() * 1.5)); this.add(p); }
        }
        put('ci_chimney-medium', { h: 7 }, s * (W + 7), s * 12, 0);
        put('ci_detail-tank', { w: 2.4 }, s * (W + 6), -s * 8, r() * 6);
      }
      return;
    }
    if (this.theme === 'castle') {
      for (const s of [-1, 1]) {
        for (let z = -L; z <= L; z += 2.6) {
          put(r() < 0.6 ? 'kc_tree-large' : 'ft_tree-high', { h: 2.6 + r() * 1.6 }, s * (W + 1.6 + r() * 4), z + r() * 1.5, r() * 6);
          if (r() < 0.3) put('kc_rocks-large', { w: 1.2 + r() }, s * (W + 2.5 + r() * 4), z, r() * 6);
        }
        for (let x = -W; x <= W; x += 2.6) put(r() < 0.6 ? 'kc_tree-large' : 'kc_tree-small', { h: 2.4 + r() * 1.4 }, x + r(), s * (L + 1.8 + r() * 3), r() * 6);
        put('kc_siege-trebuchet', { w: 3.0 }, s * (W + 4), s * 22, s > 0 ? -1.2 : 1.9);
        put('kc_siege-catapult', { w: 2.4 }, -s * (W + 3.5), s * 6, s > 0 ? 1.2 : -1.9);
      }
      return;
    }
    const spots = [];
    for (const s of [-1, 1]) {
      for (const z of [-26, -14, -3, 9, 21]) {
        const kind = r();
        const x = s * (W + 2.6 + r() * 2.5), zz = z + r() * 4;
        if (kind < 0.3) spots.push(['v_Vehicle_Truck_Armored', { w: 2.4 }, x, zz, r() * 6]);
        else if (kind < 0.65) spots.push([r() < 0.5 ? 'e_Container_Red' : 'e_Container_Green', { w: 3 }, x, zz, r() * 0.6 - 0.3 + Math.PI / 2]);
        else if (kind < 0.8) spots.push(['e_Wheels_Stack', { h: 0.9 }, x, zz, r() * 6]);
        else spots.push(['b_crate-wide', { w: 1.2 }, x, zz, r() * 6]);
      }
      for (const x of [-12, 0, 12]) spots.push([r() < 0.5 ? 'e_PlasticBarrier' : 'e_Pallet', { w: 1.3 }, x + r() * 3, s * (L + 2.2), r() * 6]);
    }
    for (const [f, opt, x, z, rot] of spots) put(f, opt, x, z, rot);
  }

  zoneOverlay() {
    const cols = Math.round((ARENA.halfW * 2) / ARENA.cell), rows = Math.round((ARENA.halfL * 2) / ARENA.cell);
    const c = document.createElement('canvas');
    c.width = cols; c.height = rows;
    this.zoneCanvas = c;
    this.zoneTex = new THREE.CanvasTexture(c);
    this.zoneTex.magFilter = THREE.NearestFilter;
    const mat = new THREE.MeshBasicMaterial({ map: this.zoneTex, transparent: true, depthWrite: false, depthTest: false });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(ARENA.halfW * 2, ARENA.halfL * 2), mat);
    p.rotation.x = -Math.PI / 2; p.position.y = 0.05; p.renderOrder = 30;
    p.visible = false;
    this.zone = p;
    this.add(p);
  }

  paintZone(nav, valid) {
    const c = this.zoneCanvas, ctx = c.getContext('2d');
    const img = ctx.createImageData(c.width, c.height);
    for (let r = 0; r < c.height; r++) for (let col = 0; col < c.width; col++) {
      const [x, z] = nav.center(col, r);
      const i = (r * c.width + col) * 4;
      if (!valid(x, z)) { img.data[i] = 200; img.data[i + 1] = 30; img.data[i + 2] = 20; img.data[i + 3] = 70; }
      else { img.data[i] = 120; img.data[i + 1] = 220; img.data[i + 2] = 120; img.data[i + 3] = 22; }
    }
    ctx.putImageData(img, 0, 0);
    this.zoneTex.needsUpdate = true;
  }

  update(dt, sim) {
    this.t += dt;
    if (this.waterTex) this.waterTex.offset.set(this.t * 0.01, this.t * 0.02);
    if (Math.random() < dt * 12) {
      this.smoke.emit({ x: (Math.random() - 0.5) * 50, y: 0.3 + Math.random() * 2, z: (Math.random() - 0.5) * 70, vel: [1.4, 0.05, 0.3], velRand: 0.3, life: 6, size: 0.4, sizeEnd: 2.2, color: this.th.dust });
    }
    if (sim) {
      this.updateMines(sim);
      this.updateObjectives(sim, this.t);
      for (const th of this.thicketMeshes) th.rustle = Math.max(0, th.rustle - dt * 2);
    }
    this.fx.update(dt); this.smoke.update(dt);
  }

  updateMines(sim) {
    for (const m of this.mines) {
      const armed = sim.mineArmed(m.def);
      m.led.color.setRGB(armed ? (Math.sin(this.t * 8) > 0 ? 3 : 0.4) : 0.05, armed ? 0.1 : 0.05, 0.05);
      m.group.scale.setScalar(armed ? 1 : 0.6);
    }
  }

  updateObjectives(sim, t) {
    sim.objectives.forEach((ob, i) => {
      const p = this.pads[i];
      const own = ob.owner;
      const col = own === null ? new THREE.Color(1, 0.9, 0.5) : new THREE.Color(FACTION[own].glow);
      p.beaconMat.color.copy(col);
      p.beaconMat.opacity = own === null ? 0 : 0.18 + Math.sin(t * 3 + i) * 0.05;
      p.light.color.copy(col);
      p.light.intensity = own === null ? 0 : 8;
      const k = Math.abs(ob.progress);
      p.ring.geometry.setDrawRange(0, Math.round(k * 64) * 6);
      p.progressMat.color.set(ob.progress >= 0 ? FACTION[0].glow : FACTION[1].glow).multiplyScalar(1.5);
      p.progressMat.opacity = k > 0.01 ? 0.9 : 0;
      if (own !== null && Math.random() < 0.2) {
        this.smoke.emit({ x: ob.def.x + 0.3, y: 0.9, z: ob.def.z, vel: [0.2, 1.2, 0], velRand: 0.2, life: 2.5, size: 0.3, sizeEnd: 1.4, color: [col.r, col.g, col.b, 0.35] });
      }
    });
  }
}
