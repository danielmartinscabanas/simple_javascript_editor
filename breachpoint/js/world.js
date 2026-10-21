import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  ARENA, WALL_HALF, LONG_X, LONG_HALF, MID_HALF, TUNNEL_X, TUNNEL_HALF, TUNNEL_COVER,
  BLOCKS, SANDS, MINES, MINE, ALTAR, FACTION,
} from './config.js';
import { mirrored } from './nav.js';
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

export class World {
  constructor(scene) {
    this.scene = scene;
    this.t = 0;
    const wallTex = plaster(4);
    this.mats = {
      wall: std({ map: wallTex, color: 0xc49a6a, roughness: 0.95 }),
      wallTop: std({ color: 0x7e5a38, roughness: 0.9 }),
      wood: std({ color: 0x6a4424, roughness: 0.85 }),
      darkWood: std({ color: 0x3e2614, roughness: 0.9 }),
      metal: std({ color: 0x4a4e52, roughness: 0.45, metalness: 0.7 }),
      roof: std({ color: 0x9a7a52, roughness: 0.9, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }),
      shade: std({ color: 0x3a2c1c, roughness: 1 }),
      flame: new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.3, 0.4) }),
    };
    this.lights();
    this.sky();
    this.ground();
    this.centerWall();
    this.crossings();
    this.supplyDrop();
    this.cover();
    this.siteMarks();
    this.sands();
    this.perimeter();
    this.outskirts();
    this.zoneOverlay();
    this.fx = new Particles(scene, 2600, true);
    this.smoke = new Particles(scene, 2200, false);
    this.thicketMeshes = [{ g: this.tunnelRoof, def: { x: TUNNEL_COVER.x, z: TUNNEL_COVER.z }, rustle: 0 }];
  }

  lights() {
    const s = this.scene;
    s.background = new THREE.Color(0x9cc4e6);
    s.fog = new THREE.Fog(0xe2cfa6, 45, 150);
    s.add(new THREE.HemisphereLight(0xcfe3ff, 0xa07848, 1.15));
    s.add(new THREE.AmbientLight(0xfff0dd, 0.35));
    const sun = new THREE.DirectionalLight(0xfff0d0, 2.3);
    sun.position.set(14, 28, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const c = sun.shadow.camera;
    c.left = -15; c.right = 15; c.top = 20; c.bottom = -20; c.near = 1; c.far = 90;
    sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
    s.add(sun);
    const fill = new THREE.DirectionalLight(0xbcd4ff, 0.8);
    fill.position.set(-10, 12, 30);
    s.add(fill);
    this.riftLights = [];
  }

  sky() {
    const geo = new THREE.SphereGeometry(200, 32, 16);
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
    const sunDisk = new THREE.Mesh(new THREE.CircleGeometry(8, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.0, 1.6), fog: false }));
    sunDisk.position.set(60, 70, -150); sunDisk.lookAt(0, 0, 0);
    this.scene.add(sunDisk);
  }

  ground() {
    const sandTex = sand(5);
    const sandMat = std({ map: sandTex, roughness: 1, color: 0xf2dcb0 });
    const g = mesh(new THREE.PlaneGeometry(260, 260), sandMat, false, true);
    g.rotation.x = -Math.PI / 2; g.position.y = -0.03;
    this.scene.add(g);
    for (const s of [1, -1]) {
      const pt = pavers(s > 0 ? 11 : 23, 1024, 768, ARENA.halfW * 2);
      const pm = std({ map: pt, roughness: 0.9, color: 0xffffff });
      const depth = ARENA.halfL - WALL_HALF + 0.3;
      const slab = mesh(new THREE.PlaneGeometry(ARENA.halfW * 2 + 0.3, depth), pm, false, true);
      slab.rotation.x = -Math.PI / 2;
      slab.position.set(0, 0, s * (WALL_HALF + depth / 2 - 0.15));
      this.scene.add(slab);
    }
    // packed-dirt strip under the wall
    const strip = mesh(new THREE.PlaneGeometry(ARENA.halfW * 2 + 0.3, WALL_HALF * 2 + 0.4), std({ map: sandTex, color: 0xc7a46e, roughness: 1 }), false, true);
    strip.rotation.x = -Math.PI / 2; strip.position.y = 0.005;
    this.scene.add(strip);
  }

  wallSegment(x0, x1, h = 1.0) {
    const w = x1 - x0;
    if (w <= 0.05) return;
    const d = WALL_HALF * 2;
    const g = new THREE.Group();
    const body = mesh(new THREE.BoxGeometry(w, h, d), this.mats.wall);
    body.position.set((x0 + x1) / 2, h / 2, 0);
    // UV scale so plaster repeats per metre
    const uv = body.geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 2, uv.getY(i) * h / 2);
    const cap = mesh(new THREE.BoxGeometry(w + 0.08, 0.1, d + 0.08), this.mats.wallTop);
    cap.position.set((x0 + x1) / 2, h + 0.05, 0);
    g.add(body, cap);
    this.scene.add(g);
  }

  centerWall() {
    const W = ARENA.halfW + 0.3;
    const gaps = [[LONG_X - LONG_HALF, LONG_X + LONG_HALF], [-MID_HALF, MID_HALF], [TUNNEL_X - TUNNEL_HALF, TUNNEL_X + TUNNEL_HALF]].sort((a, b) => a[0] - b[0]);
    let x = -W;
    for (const [a, b] of gaps) { this.wallSegment(x, a); x = b; }
    this.wallSegment(x, W);
    // short posts at gap edges
    for (const [a, b] of gaps) for (const px of [a, b]) {
      this.scene.add(at(mesh(new THREE.BoxGeometry(0.3, 1.3, WALL_HALF * 2 + 0.1), this.mats.wallTop), px, 0.65, 0));
    }
  }

  crossings() {
    const m = this.mats;
    // Long Doors: two heavy wooden doors swung open, iron studs, lintel beam
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(LONG_X + s * LONG_HALF, 0, WALL_HALF);
      const door = mesh(new THREE.BoxGeometry(LONG_HALF * 0.9, 1.0, 0.1), m.wood);
      door.position.set(-s * LONG_HALF * 0.45, 0.55, 0);
      for (let k = 0; k < 2; k++) door.add(at(mesh(new THREE.BoxGeometry(LONG_HALF * 0.85, 0.07, 0.12), m.darkWood), 0, -0.25 + k * 0.5, 0));
      pivot.add(door);
      pivot.rotation.y = s * 1.2;
      this.scene.add(pivot);
    }

    // Tunnels: a roofed corridor, dark inside; units under the roof are concealed
    const tc = TUNNEL_COVER;
    for (const s of [-1, 1]) {
      const side = mesh(new THREE.BoxGeometry(0.25, 1.0, tc.hz * 2), m.wall);
      side.position.set(TUNNEL_X + s * (TUNNEL_HALF + 0.15), 0.5, 0);
      this.scene.add(side);
    }
    const floor = mesh(new THREE.PlaneGeometry(TUNNEL_HALF * 2, tc.hz * 2), m.shade, false, true);
    floor.rotation.x = -Math.PI / 2; floor.position.set(TUNNEL_X, 0.012, 0);
    this.scene.add(floor);
    const roof = new THREE.Group();
    const slab = mesh(new THREE.BoxGeometry(tc.hx * 2 + 0.3, 0.08, tc.hz * 2), m.roof, true, false);
    slab.position.y = 1.15;
    roof.add(slab);
    for (let z = -tc.hz + 0.3; z <= tc.hz; z += 1.5) roof.add(at(mesh(new THREE.BoxGeometry(tc.hx * 2 + 0.35, 0.08, 0.1), m.darkWood), 0, 1.22, z));
    roof.position.set(TUNNEL_X, 0, 0);
    this.scene.add(roof);
    this.tunnelRoof = roof;
    const bulb = new THREE.PointLight(0xffc070, 6, 5, 2);
    bulb.position.set(TUNNEL_X, 0.95, 0);
    this.scene.add(bulb);
    // mines
    this.mines = MINES.map((d) => {
      const g = new THREE.Group();
      const plate = mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.08, 14), m.metal);
      plate.position.y = 0.04;
      const ledMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.15, 0.1) });
      const led = mesh(new THREE.SphereGeometry(0.05, 8, 6), ledMat, false, false);
      led.position.y = 0.12;
      g.add(plate, led);
      g.position.set(d.x, 0, d.z);
      this.scene.add(g);
      return { def: d, group: g, led: ledMat, plate };
    });
    this.spikes = [];
  }

  supplyDrop() {
    const g = new THREE.Group();
    this.runeMat = new THREE.MeshBasicMaterial({ map: runeCircle(5), transparent: true, depthWrite: false, color: new THREE.Color(1, 1, 1), opacity: 0.35 });
    const pad = new THREE.Mesh(new THREE.CircleGeometry(ALTAR.r, 40), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false }));
    pad.rotation.x = -Math.PI / 2; pad.position.y = 0.015;
    g.add(pad);
    // painted chevrons
    for (let i = 0; i < 4; i++) {
      const c = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 1.2), new THREE.MeshBasicMaterial({ color: 0xf2d24a, transparent: true, opacity: 0.8, depthWrite: false }));
      c.rotation.x = -Math.PI / 2; c.rotation.z = i * Math.PI / 2 + Math.PI / 4;
      c.position.set(Math.cos(i * Math.PI / 2 + Math.PI / 4) * 1.2, 0.02, Math.sin(i * Math.PI / 2 + Math.PI / 4) * 1.2);
      g.add(c);
    }
    this.progressMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.progressRing = new THREE.Mesh(new THREE.RingGeometry(ALTAR.r - 0.16, ALTAR.r, 64, 1), this.progressMat);
    this.progressRing.rotation.x = -Math.PI / 2; this.progressRing.position.y = 0.03; this.progressRing.renderOrder = 6;
    g.add(this.progressRing);
    // the supply crate under a beacon
    const crate = prop('b_crate-wide', { w: 0.9 }) || prop('s_box-large', { w: 0.8 });
    if (crate) { crate.position.y = 0; g.add(crate); }
    this.beaconMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.35, 24, 12, 1, true), this.beaconMat);
    beam.position.y = 12; g.add(beam);
    this.altarLight = new THREE.PointLight(0xffffff, 0, 6, 1.5);
    this.altarLight.position.set(0, 1.5, 0); g.add(this.altarLight);
    g.position.set(ALTAR.x, 0, ALTAR.z);
    this.scene.add(g);
  }

  // stencilled site letters on the ground by each outpost
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
      // weathering
      g.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.5})`; g.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 6, 2 + Math.random() * 6); }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
      return t;
    };
    const tA = letter('A'), tB = letter('B');
    for (const s of [1, -1]) for (const [x, t] of [[-5.6, tA], [5.6, tB]]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.rotation.z = s > 0 ? 0 : Math.PI;
      m.position.set(x, 0.02, s * 7.7); m.renderOrder = 2;
      this.scene.add(m);
    }
  }

  cover() {
    for (const b of mirrored(BLOCKS)) {
      const rot = b.z < 0 ? Math.PI : 0;
      if (b.kind === 'house') this.house(b, rot);
      else if (b.kind === 'barrierX') {
        for (const dx of [-b.hx / 2, b.hx / 2]) place(this.scene, prop('r_detail-barrier-strong-type-a', { w: b.hx * 1.02 }) || prop('e_TrafficBarrier_1', { w: b.hx }), b.x + dx, b.z, 0);
      }
      else if (b.kind === 'container') place(this.scene, prop(b.x < 0 ? 'e_Container_Red' : 'e_Container_Green', { w: b.hx * 2.05 }), b.x, b.z, rot);
      else if (b.kind === 'crates') {
        const s = b.hx * 2;
        place(this.scene, prop('b_crate-medium', { w: s }), b.x, b.z, rot);
      } else if (b.kind === 'barrels') {
        for (const [dx, dz] of [[-0.18, -0.18], [0.2, -0.12], [0, 0.2]]) place(this.scene, prop('e_Barrel', { h: 0.7 }), b.x + dx, b.z + dz, Math.random() * 3);
      } else if (b.kind === 'barrier') place(this.scene, prop('r_detail-barrier-strong-type-a', { w: b.hz * 2.2 }) || prop('e_TrafficBarrier_1', { w: b.hz * 2 }), b.x, b.z, Math.PI / 2);
    }
  }

  house(b, rot) {
    const m = this.mats;
    const g = new THREE.Group();
    const h = 1.8;
    const body = mesh(new THREE.BoxGeometry(b.hx * 2, h, b.hz * 2), m.wall);
    body.position.y = h / 2;
    const uv = body.geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * b.hx, uv.getY(i) * h / 2);
    const cap = mesh(new THREE.BoxGeometry(b.hx * 2 + 0.15, 0.16, b.hz * 2 + 0.15), m.wallTop);
    cap.position.y = h + 0.08;
    const door = mesh(new THREE.BoxGeometry(0.7, 1.4, 0.06), m.darkWood);
    door.position.set(-0.4, 0.7, -b.hz - 0.01);
    const win = mesh(new THREE.BoxGeometry(0.5, 0.45, 0.06), m.shade);
    win.position.set(0.6, 1.25, -b.hz - 0.01);
    const awning = mesh(new THREE.BoxGeometry(1.2, 0.05, 0.6), std({ color: 0x2f6f8f, roughness: 0.8 }));
    awning.position.set(-0.4, 1.5, -b.hz - 0.3); awning.rotation.x = 0.25;
    g.add(body, cap, door, win, awning);
    const ac = prop('r_detail-dumpster-closed', { w: 0.9 });
    if (ac) { ac.position.set(b.hx + 0.5, 0, 0.2); ac.rotation.y = Math.PI / 2; g.add(ac); }
    g.position.set(b.x, 0, b.z);
    g.rotation.y = rot;
    this.scene.add(g);
  }

  sands() {
    this.mireDefs = mirrored(SANDS);
    for (const s of this.mireDefs) {
      const dune = mesh(new THREE.SphereGeometry(s.r, 20, 10), std({ map: sand(8), color: 0xe8c890, roughness: 1 }), false, true);
      dune.scale.set(1, 0.08, 1); dune.position.set(s.x, 0, s.z);
      this.scene.add(dune);
    }
  }

  perimeter() {
    const W = ARENA.halfW, L = ARENA.halfL;
    // low sandstone curb with wall modules along the long sides
    const curb = [];
    for (const s of [-1, 1]) {
      curb.push(new THREE.BoxGeometry(0.35, 0.28, L * 2 + 0.6).translate(s * (W + 0.25), 0.14, 0));
      curb.push(new THREE.BoxGeometry(W * 2 + 0.85, 0.28, 0.35).translate(0, 0.14, s * (L + 0.25)));
    }
    this.scene.add(mesh(mergeGeometries(curb), this.mats.wallTop));
  }

  dim(obj, k = 0.78) {
    obj.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.multiplyScalar(k); } });
  }

  outskirts() {
    const r = rng(42);
    const W = ARENA.halfW, L = ARENA.halfL;
    const spots = [
      ['v_Vehicle_Truck_Armored', { w: 2.4 }, -W - 3.2, 6, 0.3], ['v_Vehicle_Truck_Armored', { w: 2.4 }, W + 3.4, -7, Math.PI + 0.4],
      ['e_Container_Red', { w: 3 }, -W - 3, -3, 1.4], ['e_Container_Green', { w: 3 }, W + 3, 3, -1.2],
      ['e_Container_Green', { w: 3 }, -W - 3.2, 12, 0.2], ['e_Container_Red', { w: 3 }, W + 3.2, -13, -0.3],
      ['e_Wheels_Stack', { h: 0.9 }, -W - 2, 0.5], ['e_Wheels_Stack', { h: 0.9 }, W + 2, -0.5],
      ['e_Pallet', { w: 1.1 }, W + 2, 11], ['e_Pallet', { w: 1.1 }, -W - 2, -12.5],
      ['b_crate-wide', { w: 1.2 }, W + 2.2, 6.5], ['b_crate-wide', { w: 1.2 }, -W - 2.2, -6.5],
      ['e_PlasticBarrier', { w: 1.4 }, -W - 1.8, 9], ['e_PlasticBarrier', { w: 1.4 }, W + 1.8, -9],
    ];
    for (const [f, opt, x, z, rot = r() * 6] of spots) place(this.scene, prop(f, opt), x, z, rot);
    // distant sandstone town
    const blocks = [];
    for (let i = 0; i < 40; i++) {
      const side = i % 2 ? 1 : -1;
      const x = side * (W + 16 + r() * 40), z = (r() - 0.5) * 90;
      const w = 3 + r() * 4, h = 1.5 + r() * 3.5, d = 3 + r() * 4;
      blocks.push(new THREE.BoxGeometry(w, h, d).translate(x, h / 2, z));
    }
    for (let i = 0; i < 18; i++) {
      const x = (r() - 0.5) * 70, z = (i % 2 ? 1 : -1) * (L + 14 + r() * 30);
      const w = 3 + r() * 5, h = 1.5 + r() * 4, d = 3 + r() * 4;
      blocks.push(new THREE.BoxGeometry(w, h, d).translate(x, h / 2, z));
    }
    void blocks; // distant town dropped: it crowded the battle view
  }

  zoneOverlay() {
    const c = document.createElement('canvas');
    c.width = 36; c.height = 64;
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
    const ctx = this.zoneCanvas.getContext('2d');
    const img = ctx.createImageData(36, 64);
    for (let r = 0; r < 64; r++) for (let c = 0; c < 36; c++) {
      const [x, z] = nav.center(c, r);
      const ok = valid(x, z);
      const i = (r * 36 + c) * 4;
      if (!ok) { img.data[i] = 200; img.data[i + 1] = 30; img.data[i + 2] = 20; img.data[i + 3] = 80; }
      else { img.data[i] = 120; img.data[i + 1] = 220; img.data[i + 2] = 120; img.data[i + 3] = 22; }
    }
    ctx.putImageData(img, 0, 0);
    this.zoneTex.needsUpdate = true;
  }

  update(dt, sim) {
    this.t += dt;
    // drifting dust
    if (Math.random() < dt * 10) {
      this.smoke.emit({ x: (Math.random() - 0.5) * 30, y: 0.3 + Math.random() * 2, z: (Math.random() - 0.5) * 34, vel: [1.4, 0.05, 0.3], velRand: 0.3, life: 6, size: 0.4, sizeEnd: 2.2, color: [0.85, 0.72, 0.52, 0.18] });
    }
    if (sim) {
      this.updateMines(sim);
      this.updateAltar(sim, this.t);
      const th = this.thicketMeshes[0];
      th.rustle = Math.max(0, th.rustle - dt * 2);
    }
    this.fx.update(dt); this.smoke.update(dt);
  }

  updateMines(sim) {
    for (const m of this.mines) {
      const armed = sim.mineArmed(m.def);
      m.group.visible = true;
      m.plate.material = this.mats.metal;
      m.led.color.setRGB(armed ? (Math.sin(this.t * 8) > 0 ? 3 : 0.4) : 0.05, armed ? 0.1 : 0.05, 0.05);
      m.group.scale.setScalar(armed ? 1 : 0.6);
    }
  }

  updateAltar(sim, t) {
    const a = sim.altar;
    const own = a.owner;
    const col = own === null ? new THREE.Color(1, 0.9, 0.5) : new THREE.Color(FACTION[own].glow);
    this.beaconMat.color.copy(col);
    this.beaconMat.opacity = own === null ? 0 : 0.18 + Math.sin(t * 3) * 0.05;
    this.altarLight.color.copy(col);
    this.altarLight.intensity = own === null ? 0 : 8;
    const p = Math.abs(a.progress);
    this.progressRing.geometry.setDrawRange(0, Math.round(p * 64) * 6);
    this.progressMat.color.set(a.progress >= 0 ? FACTION[0].glow : FACTION[1].glow).multiplyScalar(1.5);
    this.progressMat.opacity = p > 0.01 ? 0.9 : 0;
    if (own !== null && Math.random() < 0.3) {
      const c = col;
      this.smoke.emit({ x: 0.3, y: 0.9, z: 0, vel: [0.2, 1.2, 0], velRand: 0.2, life: 2.5, size: 0.3, sizeEnd: 1.4, color: [c.r, c.g, c.b, 0.35] });
    }
  }
}
