import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ARENA, RIVER, LANES, BASE, LEG, TUNNEL_COVER, OBJECTIVES, TOWERS, FACTION } from './config.js';
import { ALL_BLOCKS, ALL_SANDS, ALL_MINES, onBridge } from './nav.js';
import { sand, pavers, plaster, rng, runeCircle } from './textures.js';
import { prop } from './models.js';
import { Particles } from './particles.js';

const std = (o) => new THREE.MeshStandardMaterial(o);
const at = (o, x, y, z) => { o.position.set(x, y, z); return o; };
function mesh(geo, mat, cast = true, receive = true) {
  const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = receive; return m;
}
function place(scene, p, x, z, rotY = 0, y = 0) {
  if (!p) return null;
  p.position.x += x; p.position.z += z; p.position.y += y;
  p.rotation.y = rotY;
  scene.add(p);
  return p;
}
// a flat ground strip with its texture repeated per metre
function strip(tex, metres, w, d, x, z, y, color = 0xffffff) {
  const t = tex.clone(); t.needsUpdate = true; t.repeat.set(w / metres, d / metres);
  const m = mesh(new THREE.PlaneGeometry(w, d), std({ map: t, roughness: 0.92, color }), false, true);
  m.rotation.x = -Math.PI / 2; m.position.set(x, y, z);
  return m;
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.t = 0;
    const wallTex = plaster(4);
    this.mats = {
      wall: std({ map: wallTex, color: 0xc49a6a, roughness: 0.95 }),
      wallTop: std({ color: 0x7e5a38, roughness: 0.9 }),
      roofTop: std({ color: 0x9c7b56, roughness: 0.95 }),
      wood: std({ color: 0x6a4424, roughness: 0.85 }),
      darkWood: std({ color: 0x3e2614, roughness: 0.9 }),
      metal: std({ color: 0x4a4e52, roughness: 0.45, metalness: 0.7 }),
      shade: std({ color: 0x3a2c1c, roughness: 1 }),
    };
    this.lights();
    this.sky();
    this.ground();
    this.river();
    this.blocks();
    this.tunnels();
    this.mineField();
    this.objectivePads();
    this.siteMarks();
    this.sands();
    this.perimeter();
    this.outskirts();
    this.zoneOverlay();
    this.fx = new Particles(scene, 3200, true);
    this.smoke = new Particles(scene, 2800, false);
    this.thicketMeshes = [{ g: this.tunnelGroup, def: { x: TUNNEL_COVER.x, z: TUNNEL_COVER.z }, rustle: 0 }];
  }

  lights() {
    const s = this.scene;
    s.background = new THREE.Color(0x9cc4e6);
    s.fog = new THREE.Fog(0xe2cfa6, 70, 190);
    s.add(new THREE.HemisphereLight(0xcfe3ff, 0xa07848, 1.15));
    s.add(new THREE.AmbientLight(0xfff0dd, 0.35));
    const sun = new THREE.DirectionalLight(0xfff0d0, 2.3);
    sun.position.set(18, 34, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    const c = sun.shadow.camera;
    c.left = -26; c.right = 26; c.top = 40; c.bottom = -40; c.near = 1; c.far = 120;
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
    s.add(sun);
    const fill = new THREE.DirectionalLight(0xbcd4ff, 0.8);
    fill.position.set(-10, 12, 30);
    s.add(fill);
  }

  sky() {
    const geo = new THREE.SphereGeometry(260, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: `varying vec3 vP;
        void main(){
          float h = vP.y;
          vec3 top = vec3(0.30,0.55,0.86);
          vec3 hor = vec3(0.93,0.84,0.66);
          gl_FragColor = vec4(mix(hor, top, smoothstep(-0.02, 0.5, h)), 1.0);
        }`,
    });
    this.scene.add(new THREE.Mesh(geo, mat));
  }

  ground() {
    const W = ARENA.halfW, L = ARENA.halfL;
    const sandTex = sand(5);
    this.sandTex = sandTex;
    const g = mesh(new THREE.PlaneGeometry(320, 320), std({ map: sandTex, roughness: 1, color: 0xf2dcb0 }), false, true);
    g.rotation.x = -Math.PI / 2; g.position.y = -0.03;
    this.scene.add(g);
    // the playable jungle: packed dirt, a touch darker than the dunes outside
    const dirt = sand(9);
    this.scene.add(strip(dirt, 6, W * 2, L * 2, 0, 0, -0.01, 0xd8bb88));
    // paved lanes, the base plazas and the turns into them
    const pv = pavers(11, 1024, 1024, 8);
    for (const s of [1, -1]) {
      for (const lane of Object.values(LANES)) {
        const z0 = RIVER.half, z1 = lane.x === 0 ? BASE.z0 : LEG.z1;
        this.scene.add(strip(pv, 8, lane.half * 2, z1 - z0, lane.x, s * (z0 + z1) / 2, 0.004));
      }
      for (const sx of [-1, 1]) {
        const x0 = BASE.hx, x1 = Math.abs(LANES.L.x) + LANES.L.half;
        this.scene.add(strip(pv, 8, x1 - x0, LEG.z1 - LEG.z0, sx * (x0 + x1) / 2, s * (LEG.z0 + LEG.z1) / 2, 0.005));
      }
      this.scene.add(strip(pv, 8, BASE.hx * 2, L - BASE.z0, 0, s * (BASE.z0 + L) / 2, 0.006, 0xf4e6cc));
    }
  }

  river() {
    // dry riverbed: deep sand everywhere but the bridges and the objective islands
    const bed = strip(sand(21), 5, ARENA.halfW * 2, RIVER.half * 2, 0, 0, 0.003, 0xa98a5c);
    this.scene.add(bed);
    const pebbles = [];
    const r = rng(77);
    for (let i = 0; i < 160; i++) {
      const x = (r() - 0.5) * ARENA.halfW * 2, z = (r() - 0.5) * RIVER.half * 1.8;
      if (onBridge(x) || OBJECTIVES.some((o) => Math.hypot(x - o.x, z - o.z) < o.r + 0.5)) continue;
      const s = 0.05 + r() * 0.12;
      pebbles.push(new THREE.DodecahedronGeometry(s, 0).translate(x, s * 0.4, z));
    }
    if (pebbles.length) this.scene.add(mesh(mergeGeometries(pebbles), std({ color: 0x8a7458, roughness: 1 }), false, true));
    // plank bridges with rails over each lane
    const m = this.mats;
    for (const lane of Object.values(LANES)) {
      const w = lane.half * 2;
      const deck = mesh(new THREE.BoxGeometry(w, 0.08, RIVER.half * 2 + 0.6), m.wood, false, true);
      deck.position.set(lane.x, 0.04, 0);
      this.scene.add(deck);
      for (let z = -RIVER.half; z <= RIVER.half; z += 0.5) this.scene.add(at(mesh(new THREE.BoxGeometry(w, 0.02, 0.06), m.darkWood, false, true), lane.x, 0.09, z));
      if (lane.x === TUNNEL_COVER.x) continue;
      for (const s of [-1, 1]) {
        const rail = mesh(new THREE.BoxGeometry(0.08, 0.08, RIVER.half * 2 + 0.6), m.darkWood);
        rail.position.set(lane.x + s * (lane.half - 0.06), 0.55, 0);
        this.scene.add(rail);
        for (const z of [-RIVER.half, 0, RIVER.half]) this.scene.add(at(mesh(new THREE.BoxGeometry(0.1, 0.55, 0.1), m.darkWood), lane.x + s * (lane.half - 0.06), 0.27, z));
      }
    }
  }

  wallBox(b, h) {
    const g = new THREE.Group();
    const body = mesh(new THREE.BoxGeometry(b.hx * 2, h, b.hz * 2), this.mats.wall);
    body.position.y = h / 2;
    const uv = body.geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.max(b.hx, b.hz), uv.getY(i) * h / 2);
    const cap = mesh(new THREE.BoxGeometry(b.hx * 2 + 0.08, 0.1, b.hz * 2 + 0.08), this.mats.wallTop);
    cap.position.y = h + 0.05;
    g.add(body, cap);
    g.position.set(b.x, 0, b.z);
    this.scene.add(g);
    return g;
  }

  blocks() {
    for (const b of ALL_BLOCKS) {
      const rot = b.z < 0 ? Math.PI : 0;
      if (b.kind === 'wall') this.wallBox(b, 0.95);
      else if (b.kind === 'house') this.house(b, rot);
      else if (b.kind === 'container') place(this.scene, prop(b.x < 0 ? 'e_Container_Red' : 'e_Container_Green', { w: b.hx * 2.05 }), b.x, b.z, rot);
      else if (b.kind === 'crates') place(this.scene, prop('b_crate-medium', { w: b.hx * 2 }), b.x, b.z, rot);
      else if (b.kind === 'barrels') {
        for (const [dx, dz] of [[-0.18, -0.18], [0.2, -0.12], [0, 0.2]]) place(this.scene, prop('e_Barrel', { h: 0.7 }), b.x + dx, b.z + dz, Math.random() * 3);
      } else if (b.kind === 'barrier') {
        const along = b.hx > b.hz;
        place(this.scene, prop('r_detail-barrier-strong-type-a', { w: Math.max(b.hx, b.hz) * 2.1 }) || prop('e_TrafficBarrier_1', { w: Math.max(b.hx, b.hz) * 2 }), b.x, b.z, along ? 0 : Math.PI / 2);
      }
    }
  }

  house(b, rot) {
    const m = this.mats;
    const h = 1.3;
    const g = this.wallBox(b, h);
    g.children[1].material = m.roofTop;
    // parapet lip around the flat roof
    const lip = [];
    for (const [w, d, x, z] of [[b.hx * 2, 0.12, 0, b.hz], [b.hx * 2, 0.12, 0, -b.hz], [0.12, b.hz * 2, b.hx, 0], [0.12, b.hz * 2, -b.hx, 0]]) {
      lip.push(new THREE.BoxGeometry(w + 0.08, 0.16, d + 0.08).translate(x, h + 0.16, z));
    }
    g.add(mesh(mergeGeometries(lip), m.wallTop));
    const face = rot ? 1 : -1;
    const door = mesh(new THREE.BoxGeometry(0.6, 0.95, 0.06), m.darkWood);
    door.position.set(-b.hx * 0.35, 0.48, face * (b.hz + 0.01));
    const win = mesh(new THREE.BoxGeometry(0.5, 0.35, 0.06), m.shade);
    win.position.set(b.hx * 0.4, 0.85, face * (b.hz + 0.01));
    const awning = mesh(new THREE.BoxGeometry(1.0, 0.04, 0.5), std({ color: [0x2f6f8f, 0x8f3f2f, 0x5f7f3f][Math.abs(Math.round(b.x * 3 + b.z)) % 3], roughness: 0.8 }));
    awning.position.set(-b.hx * 0.35, 1.1, face * (b.hz + 0.26)); awning.rotation.x = face * -0.25;
    g.add(door, win, awning);
    const ac = prop('r_detail-dumpster-closed', { w: 0.8 });
    if (ac) { ac.position.set(b.hx + 0.45, 0, 0); ac.rotation.y = Math.PI / 2; g.add(ac); }
  }

  tunnels() {
    // the walled stretch of the right lane around the river: dark floor, units inside are concealed
    const tc = TUNNEL_COVER, m = this.mats;
    const g = new THREE.Group();
    const floor = mesh(new THREE.PlaneGeometry(tc.hx * 2, tc.hz * 2), std({ color: 0x4a3a28, roughness: 1, transparent: true, opacity: 0.55 }), false, true);
    floor.rotation.x = -Math.PI / 2; floor.position.set(tc.x, 0.1, tc.z);
    g.add(floor);
    for (const s of [-1, 1]) {
      const post = mesh(new THREE.BoxGeometry(0.4, 1.3, 0.4), m.wallTop);
      post.position.set(tc.x - tc.hx + 0.2, 0.65, s * tc.hz);
      g.add(post);
      const beam = mesh(new THREE.BoxGeometry(tc.hx * 2, 0.16, 0.16), m.darkWood);
      beam.position.set(tc.x, 0.18, s * tc.hz);
      g.add(beam);
    }
    this.scene.add(g);
    this.tunnelGroup = g;
    // Long Doors: a pair of swung wooden gates where Long meets the river
    for (const sz of [-1, 1]) for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      const lane = LANES.L;
      pivot.position.set(lane.x + s * lane.half, 0, sz * (RIVER.half + 0.5));
      const door = mesh(new THREE.BoxGeometry(lane.half * 0.8, 1.0, 0.1), m.wood);
      door.position.set(-s * lane.half * 0.4, 0.55, 0);
      pivot.add(door);
      pivot.rotation.y = s * sz * 1.25;
      this.scene.add(pivot);
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
      this.scene.add(g);
      return { def: d, group: g, led: ledMat, plate };
    });
  }

  objectivePads() {
    const tint = { drop: 0xf2d24a, armory: 0xff6a3c, medic: 0xf4f4f4 };
    this.pads = OBJECTIVES.map((o) => {
      const g = new THREE.Group();
      const island = mesh(new THREE.CylinderGeometry(o.r + 0.4, o.r + 0.6, 0.12, 40), std({ color: 0xb79a6a, roughness: 1 }), false, true);
      island.position.y = 0.0;
      g.add(island);
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
      const crate = o.id === 'drop' ? prop('b_crate-wide', { w: 0.9 }) : o.id === 'armory' ? prop('e_Pallet', { w: 1.0 }) : prop('s_box-large', { w: 0.7 });
      if (crate) { crate.position.y = 0.06; g.add(crate); }
      if (o.id === 'armory') { const c2 = prop('b_crate-medium', { w: 0.55 }); if (c2) { c2.position.set(0.1, 0.18, 0); g.add(c2); } }
      const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending });
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.35, 24, 12, 1, true), beaconMat);
      beam.position.y = 12; g.add(beam);
      const light = new THREE.PointLight(0xffffff, 0, 6, 1.5);
      light.position.set(0, 1.5, 0); g.add(light);
      g.position.set(o.x, 0, o.z);
      this.scene.add(g);
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
    const tex = { L: letter('A'), M: letter('M'), R: letter('B') };
    for (const s of [1, -1]) for (const t of TOWERS.filter((t) => t.tier === 1)) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({ map: tex[t.lane], transparent: true, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.rotation.z = s > 0 ? 0 : Math.PI;
      m.position.set(t.x + (t.x === 0 ? 1.7 : 0), 0.02, s * (t.z - 2.6)); m.renderOrder = 2;
      this.scene.add(m);
    }
  }

  sands() {
    this.mireDefs = ALL_SANDS;
    for (const s of this.mireDefs) {
      const dune = mesh(new THREE.SphereGeometry(s.r, 20, 10), std({ map: this.sandTex, color: 0xe8c890, roughness: 1 }), false, true);
      dune.scale.set(1, 0.08, 1); dune.position.set(s.x, 0, s.z);
      this.scene.add(dune);
    }
  }

  perimeter() {
    const W = ARENA.halfW, L = ARENA.halfL;
    const curb = [];
    for (const s of [-1, 1]) {
      curb.push(new THREE.BoxGeometry(0.35, 0.28, L * 2 + 0.6).translate(s * (W + 0.25), 0.14, 0));
      curb.push(new THREE.BoxGeometry(W * 2 + 0.85, 0.28, 0.35).translate(0, 0.14, s * (L + 0.25)));
    }
    this.scene.add(mesh(mergeGeometries(curb), this.mats.wallTop));
  }

  outskirts() {
    const r = rng(42);
    const W = ARENA.halfW, L = ARENA.halfL;
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
    for (const [f, opt, x, z, rot] of spots) place(this.scene, prop(f, opt), x, z, rot);
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
    this.scene.add(p);
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
    if (Math.random() < dt * 14) {
      this.smoke.emit({ x: (Math.random() - 0.5) * 50, y: 0.3 + Math.random() * 2, z: (Math.random() - 0.5) * 70, vel: [1.4, 0.05, 0.3], velRand: 0.3, life: 6, size: 0.4, sizeEnd: 2.2, color: [0.85, 0.72, 0.52, 0.16] });
    }
    if (sim) {
      this.updateMines(sim);
      this.updateObjectives(sim, this.t);
      const th = this.thicketMeshes[0];
      th.rustle = Math.max(0, th.rustle - dt * 2);
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
