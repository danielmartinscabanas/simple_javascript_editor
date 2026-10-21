import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  ARENA, RIFT_HALF, ISLAND_R, CAUSEWAY_HALF, BRIDGES, BRIDGE_HALF,
  MAUSOLEUMS, STATUES, THICKETS, MIRES, SPIKES, SPIKE_WARN, SPIKE_UP, ALTAR, FACTION,
} from './config.js';
import { mirrored } from './nav.js';
import { flagstones, soil, rockWall, magma, mist, runeCircle, rng } from './textures.js';
import { teamMats } from './models.js';
import { Particles } from './particles.js';

const std = (o) => new THREE.MeshStandardMaterial(o);
function mesh(geo, mat, cast = true, receive = true) {
  const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = receive; return m;
}
const at = (o, x, y, z) => { o.position.set(x, y, z); return o; };

function mergeGroup(g, mat, cast = true) {
  g.updateMatrixWorld(true);
  const geos = [];
  g.traverse((o) => {
    if (!o.isMesh) return;
    let geo = o.geometry.clone();
    if (geo.index) geo = geo.toNonIndexed();
    geo.applyMatrix4(o.matrixWorld);
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    geos.push(geo);
  });
  if (!geos.length) return new THREE.Group();
  return mesh(mergeGeometries(geos), mat, cast, true);
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.t = 0;
    this.mats = {
      stone: std({ color: 0x5b5754, roughness: 0.95, flatShading: true }),
      darkStone: std({ color: 0x2e2b2a, roughness: 0.95, flatShading: true }),
      slate: std({ color: 0x1d1e25, roughness: 0.75, metalness: 0.2, flatShading: true }),
      iron: std({ color: 0x1c1c20, roughness: 0.45, metalness: 0.85 }),
      bark: std({ color: 0x1a1512, roughness: 1, flatShading: true }),
      thorn: std({ color: 0x15140f, roughness: 0.8, flatShading: true }),
      leaf: std({ color: 0x1f2618, roughness: 0.9, flatShading: true }),
      leafDark: std({ color: 0x24131a, roughness: 0.9, flatShading: true }),
      wax: std({ color: 0xd9ccb0, roughness: 0.6 }),
      flame: new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 2.0, 0.5) }),
    };
    this.lights();
    this.sky();
    this.ground();
    this.rift();
    this.crossings();
    this.altar();
    this.landmarks();
    this.thickets();
    this.mires();
    this.perimeter();
    this.outskirts();
    this.braziers();
    this.zoneOverlay();
    this.fx = new Particles(scene, 2600, true);
    this.smoke = new Particles(scene, 1400, false);
  }

  lights() {
    const s = this.scene;
    s.background = new THREE.Color(0x050407);
    s.fog = new THREE.FogExp2(0x07060a, 0.008);
    s.add(new THREE.HemisphereLight(0x8a96c0, 0x3a2618, 3.0));
    s.add(new THREE.AmbientLight(0x4a5060, 1.0));
    // front fill from the player's side so units read clearly
    const fill = new THREE.DirectionalLight(0xfff0dc, 1.6);
    fill.position.set(0, 20, 34);
    s.add(fill);
    const moon = new THREE.DirectionalLight(0xc4d0ff, 4.2);
    moon.position.set(-8, 36, 10);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    const c = moon.shadow.camera;
    c.left = -14; c.right = 14; c.top = 20; c.bottom = -20; c.near = 1; c.far = 80;
    moon.shadow.bias = -0.0006; moon.shadow.normalBias = 0.03;
    s.add(moon); this.moon = moon;
    const rim = new THREE.DirectionalLight(0xff5530, 0.35);
    rim.position.set(10, 6, 20);
    s.add(rim);
    this.riftLights = [-6.2, 0, 6.2].map((x) => {
      const l = new THREE.PointLight(0xff2a10, 30, 11, 1.6);
      l.position.set(x, -2.2, 0); s.add(l); return l;
    });
  }

  sky() {
    const geo = new THREE.SphereGeometry(180, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {},
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: `varying vec3 vP;
        void main(){
          float h = vP.y;
          vec3 top = vec3(0.012,0.012,0.03);
          vec3 hor = vec3(0.09,0.03,0.035);
          vec3 c = mix(hor, top, smoothstep(-0.05, 0.45, h));
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.scene.add(new THREE.Mesh(geo, mat));
    const moonDisk = new THREE.Mesh(new THREE.CircleGeometry(7, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.55, 1.4), fog: false }));
    moonDisk.position.set(-34, 22, -150); moonDisk.lookAt(0, 0, 0);
    this.scene.add(moonDisk);
    const halo = new THREE.Mesh(new THREE.CircleGeometry(16, 40), new THREE.MeshBasicMaterial({ color: 0x3a3550, transparent: true, opacity: 0.25, fog: false, depthWrite: false }));
    halo.position.copy(moonDisk.position).multiplyScalar(1.01); halo.lookAt(0, 0, 0);
    this.scene.add(halo);
  }

  ground() {
    const soilTex = soil(5);
    const soilMat = std({ map: soilTex, roughness: 1, bumpMap: soilTex, bumpScale: 0.6 });
    for (const s of [1, -1]) {
      const g = mesh(new THREE.PlaneGeometry(140, 70), soilMat, false, true);
      g.rotation.x = -Math.PI / 2;
      g.position.set(0, -0.06, s * (RIFT_HALF + 35));
      this.scene.add(g);
      // arena flagstones
      const ft = flagstones(s > 0 ? 11 : 23, 1024, 768, ARENA.halfW * 2);
      const fm = std({ map: ft, roughness: 0.92, bumpMap: ft, bumpScale: 1.2, color: 0xffffff });
      const depth = ARENA.halfL - RIFT_HALF + 0.4;
      const slab = mesh(new THREE.PlaneGeometry(ARENA.halfW * 2 + 0.2, depth), fm, false, true);
      slab.rotation.x = -Math.PI / 2;
      slab.position.set(0, 0, s * (RIFT_HALF + depth / 2));
      this.scene.add(slab);
    }
  }

  rift() {
    const wallTex = rockWall(3);
    wallTex.repeat.set(28, 1);
    const wallMat = std({ map: wallTex, roughness: 1, color: 0x9a8f88, side: THREE.DoubleSide });
    const D = 7;
    for (const s of [1, -1]) {
      const w = mesh(new THREE.PlaneGeometry(140, D), wallMat, false, true);
      w.position.set(0, -D / 2, s * RIFT_HALF);
      w.rotation.y = s > 0 ? Math.PI : 0;
      this.scene.add(w);
      // jagged lip stones along the edge
      const lip = new THREE.Group();
      const r = rng(s > 0 ? 4 : 8);
      for (let x = -ARENA.halfW - 6; x < ARENA.halfW + 6; x += 0.55) {
        if (Math.abs(x) < CAUSEWAY_HALF + 0.1 || BRIDGES.some((b) => Math.abs(x - b) < BRIDGE_HALF + 0.1)) continue;
        const st = mesh(new THREE.DodecahedronGeometry(0.22 + r() * 0.2, 0), this.mats.darkStone);
        st.position.set(x, -0.05, s * (RIFT_HALF + (r() - 0.5) * 0.15));
        st.scale.y = 0.5; st.rotation.set(r() * 3, r() * 3, r() * 3);
        lip.add(st);
      }
      this.scene.add(mergeGroup(lip, this.mats.darkStone));
    }
    const magmaTex = magma(12);
    this.magmaTex = magmaTex;
    const lava = new THREE.Mesh(new THREE.PlaneGeometry(140, RIFT_HALF * 2), new THREE.MeshBasicMaterial({ map: magmaTex, color: new THREE.Color(2.2, 1.2, 1.0) }));
    lava.rotation.x = -Math.PI / 2; lava.position.y = -D + 0.2;
    magmaTex.repeat.set(30, 1.5);
    this.scene.add(lava);
    const mistTex = mist();
    this.mistLayers = [];
    for (let i = 0; i < 4; i++) {
      const t = mistTex.clone(); t.needsUpdate = true; t.repeat.set(8, 1);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(140, RIFT_HALF * 2 + 0.6), new THREE.MeshBasicMaterial({
        map: t, transparent: true, depthWrite: false, opacity: 0.9 - i * 0.12,
        color: i < 2 ? new THREE.Color(1.6, 0.25, 0.08) : new THREE.Color(0.5, 0.2, 0.25),
        blending: i < 2 ? THREE.AdditiveBlending : THREE.NormalBlending,
      }));
      m.rotation.x = -Math.PI / 2; m.position.y = -5.5 + i * 1.3;
      m.renderOrder = 5;
      this.scene.add(m); this.mistLayers.push(m);
    }
  }

  crossings() {
    const deckTex = flagstones(31, 256, 512, 2);
    const deckMat = std({ map: deckTex, roughness: 0.95, color: 0xa8a098 });
    const m = this.mats;
    // side bridges
    for (const bx of BRIDGES) {
      const deck = mesh(new THREE.BoxGeometry(BRIDGE_HALF * 2, 0.5, RIFT_HALF * 2 + 0.2), [m.darkStone, m.darkStone, deckMat, m.darkStone, m.darkStone, m.darkStone]);
      deck.position.set(bx, -0.25, 0);
      this.scene.add(deck);
      const rail = new THREE.Group();
      for (const s of [-1, 1]) {
        rail.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.32, RIFT_HALF * 2)), bx + s * (BRIDGE_HALF + 0.02), 0.16, 0));
        for (let z = -RIFT_HALF; z <= RIFT_HALF + 0.01; z += 1.5) {
          rail.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.6, 0.26)), bx + s * (BRIDGE_HALF + 0.02), 0.3, z));
          rail.add(at(new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.32, 4)), bx + s * (BRIDGE_HALF + 0.02), 0.75, z));
        }
      }
      // arches beneath
      for (const z of [-1.6, 1.6]) {
        rail.add(at(new THREE.Mesh(new THREE.BoxGeometry(BRIDGE_HALF * 1.6, 6, 0.6)), bx, -3.5, z));
      }
      this.scene.add(mergeGroup(rail, m.stone));
      // hanging chains + cages beneath
      const cage = at(mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.7, 6, 1, true), m.iron), bx + 0.4, -1.6, 0.6);
      cage.material = m.iron;
      this.scene.add(cage, at(mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.2, 3), m.iron), bx + 0.4, -0.7, 0.6));
    }
    // island + causeway
    const islandTop = flagstones(41, 256, 256, 3.2);
    const islandMat = std({ map: islandTop, roughness: 0.9, color: 0x9d958c });
    const wallTex = rockWall(7); wallTex.repeat.set(3, 1);
    const island = mesh(new THREE.CylinderGeometry(ISLAND_R, ISLAND_R * 0.55, 6.5, 18), [std({ map: wallTex, roughness: 1 }), islandMat, m.darkStone]);
    island.position.y = -3.25;
    this.scene.add(island);
    for (const s of [1, -1]) {
      const len = RIFT_HALF - ISLAND_R + 0.4;
      const cw = mesh(new THREE.BoxGeometry(CAUSEWAY_HALF * 2, 0.45, len), [m.darkStone, m.darkStone, deckMat, m.darkStone, m.darkStone, m.darkStone]);
      cw.position.set(0, -0.225, s * (ISLAND_R + len / 2 - 0.2));
      this.scene.add(cw);
      const pillar = at(mesh(new THREE.CylinderGeometry(0.35, 0.55, 6, 6), m.darkStone), 0, -3.4, s * 2.4);
      this.scene.add(pillar);
    }
    // spike galleries
    this.spikes = SPIKES.map((sp) => {
      const g = new THREE.Group();
      g.position.set(sp.x, 0, sp.z);
      const plateMat = std({ color: 0x1a1414, roughness: 0.5, metalness: 0.7, emissive: 0xff1a00, emissiveIntensity: 0 });
      const plate = mesh(new THREE.BoxGeometry(sp.hx * 2 - 0.08, 0.04, sp.hz * 2 - 0.08), plateMat, false, true);
      plate.position.y = 0.02;
      g.add(plate);
      // groove lines
      const grooves = new THREE.Group();
      const spikes = new THREE.Group();
      for (let x = -sp.hx + 0.2; x < sp.hx - 0.1; x += 0.3) {
        for (let z = -sp.hz + 0.2; z < sp.hz - 0.1; z += 0.3) {
          grooves.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.01, 0.08)), x, 0.045, z));
          const c = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.55, 4));
          c.position.set(x + (Math.random() - 0.5) * 0.05, 0.27, z + (Math.random() - 0.5) * 0.05);
          c.rotation.set((Math.random() - 0.5) * 0.25, 0, (Math.random() - 0.5) * 0.25);
          spikes.add(c);
        }
      }
      g.add(mergeGroup(grooves, new THREE.MeshBasicMaterial({ color: 0x050303 }), false));
      const spikeMesh = mergeGroup(spikes, std({ color: 0x5a5a60, metalness: 0.9, roughness: 0.3 }));
      spikeMesh.position.y = -0.6;
      g.add(spikeMesh);
      // bloodstain beneath
      this.scene.add(g);
      return { def: sp, group: g, plateMat, spikeMesh, state: 'idle', phase: 0 };
    });
  }

  altar() {
    const m = this.mats;
    const g = new THREE.Group();
    g.add(at(mesh(new THREE.CylinderGeometry(0.85, 0.95, 0.18, 8), m.darkStone), 0, 0.09, 0));
    g.add(at(mesh(new THREE.CylinderGeometry(0.6, 0.7, 0.18, 8), m.stone), 0, 0.27, 0));
    const ob = mesh(new THREE.CylinderGeometry(0.12, 0.3, 2.2, 4), m.slate);
    ob.position.y = 1.45; ob.rotation.y = Math.PI / 4;
    g.add(ob);
    this.crystalMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.1, 1.9) });
    this.crystal = at(mesh(new THREE.OctahedronGeometry(0.26, 0), this.crystalMat, false, false), 0, 3.0, 0);
    this.crystal.scale.y = 1.6;
    g.add(this.crystal);
    // candles
    const cg = new THREE.Group();
    const flames = new THREE.Group();
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2, r = 1.15 + (i % 3) * 0.12;
      const h = 0.12 + ((i * 7) % 5) * 0.05;
      cg.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, h, 6)), Math.cos(a) * r, h / 2, Math.sin(a) * r));
      flames.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.03, 5, 4)), Math.cos(a) * r, h + 0.04, Math.sin(a) * r));
    }
    g.add(mergeGroup(cg, m.wax));
    g.add(mergeGroup(flames, m.flame, false));
    this.runeMat = new THREE.MeshBasicMaterial({ map: runeCircle(5), transparent: true, depthWrite: false, color: new THREE.Color(1.2, 1.1, 1.0), opacity: 0.55 });
    const rune = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 3.1), this.runeMat);
    rune.rotation.x = -Math.PI / 2; rune.position.y = 0.02; rune.renderOrder = 4;
    g.add(rune); this.rune = rune;
    this.progressMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.progressRing = new THREE.Mesh(new THREE.RingGeometry(1.42, 1.55, 64, 1), this.progressMat);
    this.progressRing.rotation.x = -Math.PI / 2; this.progressRing.position.y = 0.03; this.progressRing.renderOrder = 6;
    g.add(this.progressRing);
    this.altarLight = new THREE.PointLight(0xdedcff, 12, 7, 1.5);
    this.altarLight.position.set(0, 2.6, 0);
    g.add(this.altarLight);
    // beam
    this.beamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.5, 30, 12, 1, true), this.beamMat);
    beam.position.y = 15; g.add(beam);
    g.position.set(ALTAR.x, 0, ALTAR.z);
    this.scene.add(g);
  }

  mausoleum(x, z, hx, hz, facing) {
    const m = this.mats;
    const g = new THREE.Group();
    g.add(at(mesh(new THREE.BoxGeometry(hx * 2 + 0.3, 0.3, hz * 2 + 0.3), m.darkStone), 0, 0.15, 0));
    g.add(at(mesh(new THREE.BoxGeometry(hx * 2 - 0.4, 1.7, hz * 2 - 0.3), m.stone), 0, 1.15, 0));
    for (const sx of [-1, -0.33, 0.33, 1]) for (const sz of [-1, 1]) {
      g.add(at(mesh(new THREE.CylinderGeometry(0.12, 0.14, 1.8, 8), m.stone), sx * (hx - 0.1), 1.2, sz * (hz - 0.05)));
    }
    g.add(at(mesh(new THREE.BoxGeometry(hx * 2 + 0.2, 0.2, hz * 2 + 0.2), m.darkStone), 0, 2.2, 0));
    const roof = mesh(new THREE.CylinderGeometry(0.01, 1, hx * 2 + 0.2, 3, 1), m.slate);
    roof.rotation.z = Math.PI / 2; roof.scale.set(0.9, 1, hz * 1.2);
    roof.position.y = 2.65; g.add(roof);
    g.add(at(mesh(new THREE.BoxGeometry(0.7, 1.2, 0.05), m.iron), 0, 0.95, facing * (hz - 0.13)));
    // weeping statue on the roof
    const st = new THREE.Group();
    st.add(at(mesh(new THREE.ConeGeometry(0.22, 0.8, 8), m.stone), 0, 0.4, 0));
    st.add(at(mesh(new THREE.SphereGeometry(0.11, 8, 6), m.stone), 0, 0.88, 0.04));
    st.position.set(0, 3.1, 0);
    g.add(st);
    // urns + candles
    for (const sx of [-1, 1]) {
      g.add(at(mesh(new THREE.SphereGeometry(0.16, 8, 6), m.darkStone), sx * (hx + 0.05), 0.42, facing * (hz + 0.05)));
    }
    g.position.set(x, 0, z);
    this.scene.add(g);
  }

  weepingAngel(x, z, face) {
    const m = this.mats;
    const g = new THREE.Group();
    g.add(at(mesh(new THREE.BoxGeometry(0.75, 0.6, 0.75), m.darkStone), 0, 0.3, 0));
    g.add(at(mesh(new THREE.ConeGeometry(0.26, 1.2, 8), m.stone), 0, 1.2, 0));
    g.add(at(mesh(new THREE.SphereGeometry(0.13, 8, 6), m.stone), 0, 1.85, 0.06));
    for (const s of [-1, 1]) {
      const w = mesh(new THREE.BoxGeometry(0.06, 1.1, 0.5), m.stone);
      w.position.set(s * 0.22, 1.5, -0.2); w.rotation.set(0.3, s * 0.5, s * 0.25);
      g.add(w);
    }
    const hands = at(mesh(new THREE.BoxGeometry(0.2, 0.12, 0.12), m.stone), 0, 1.75, 0.18);
    g.add(hands);
    g.rotation.y = face;
    g.position.set(x, 0, z);
    this.scene.add(g);
  }

  landmarks() {
    for (const mz of mirrored(MAUSOLEUMS)) this.mausoleum(mz.x, mz.z, mz.hx, mz.hz, mz.z > 0 ? -1 : 1);
    for (const st of mirrored(STATUES)) this.weepingAngel(st.x, st.z, st.z > 0 ? Math.PI : 0);
  }

  thickets() {
    this.thicketMeshes = [];
    const m = this.mats;
    for (const t of mirrored(THICKETS)) {
      const r = rng(Math.floor(t.x * 100 + t.z * 7 + 1000));
      const thorns = new THREE.Group();
      const leaves = new THREE.Group();
      const n = Math.floor(t.r * t.r * 38);
      for (let i = 0; i < n; i++) {
        const a = r() * Math.PI * 2, d = Math.sqrt(r()) * t.r;
        const h = 0.5 + r() * 0.8;
        const c = new THREE.Mesh(new THREE.ConeGeometry(0.04 + r() * 0.03, h, 4));
        c.position.set(Math.cos(a) * d, h * 0.4, Math.sin(a) * d);
        c.rotation.set((r() - 0.5) * 1.6, r() * 3, (r() - 0.5) * 1.6);
        thorns.add(c);
        if (i % 2 === 0) {
          const l = new THREE.Mesh(new THREE.IcosahedronGeometry(0.18 + r() * 0.22, 0));
          l.position.set(Math.cos(a) * d * 0.9, 0.2 + r() * 0.55, Math.sin(a) * d * 0.9);
          l.scale.set(1, 0.7, 1);
          leaves.add(l);
        }
      }
      // twisted vines
      for (let i = 0; i < 6; i++) {
        const a = r() * Math.PI * 2;
        const tor = new THREE.Mesh(new THREE.TorusGeometry(t.r * (0.4 + r() * 0.4), 0.025, 3, 16, Math.PI * (0.6 + r())));
        tor.position.set(Math.cos(a) * 0.2, 0.3 + r() * 0.4, Math.sin(a) * 0.2);
        tor.rotation.set(r() * 3, r() * 3, r() * 3);
        thorns.add(tor);
      }
      const g = new THREE.Group();
      g.add(mergeGroup(thorns, m.thorn));
      g.add(mergeGroup(leaves, r() > 0.5 ? m.leaf : m.leafDark));
      // a few blood-red roses — the romance in the rot
      const roses = new THREE.Group();
      for (let i = 0; i < Math.ceil(t.r * 5); i++) {
        const a = r() * Math.PI * 2, d = r() * t.r * 0.9;
        roses.add(at(new THREE.Mesh(new THREE.DodecahedronGeometry(0.06, 0)), Math.cos(a) * d, 0.55 + r() * 0.35, Math.sin(a) * d));
      }
      g.add(mergeGroup(roses, std({ color: 0x5a0610, roughness: 0.5, emissive: 0x200004 })));
      const shadow = new THREE.Mesh(new THREE.CircleGeometry(t.r * 1.05, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false }));
      shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.012;
      g.add(shadow);
      g.position.set(t.x, 0, t.z);
      this.scene.add(g);
      this.thicketMeshes.push({ g, def: t, rustle: 0 });
    }
  }

  mires() {
    this.mireDefs = mirrored(MIRES);
    for (const mi of this.mireDefs) {
      const shape = new THREE.Shape();
      const r = rng(Math.floor(mi.x * 31 + mi.z * 13 + 500));
      const N = 22;
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * Math.PI * 2;
        const rr = mi.r * (0.85 + r() * 0.3);
        if (i === 0) shape.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else shape.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      const tar = new THREE.Mesh(new THREE.ShapeGeometry(shape), std({ color: 0x0b0d08, roughness: 0.08, metalness: 0.4, emissive: 0x050803 }));
      tar.rotation.x = -Math.PI / 2; tar.position.set(mi.x, 0.012, mi.z);
      tar.receiveShadow = true;
      this.scene.add(tar);
      const edge = new THREE.Mesh(new THREE.RingGeometry(mi.r * 0.95, mi.r * 1.25, 24), new THREE.MeshBasicMaterial({ color: 0x0a0a06, transparent: true, opacity: 0.6, depthWrite: false }));
      edge.rotation.x = -Math.PI / 2; edge.position.set(mi.x, 0.01, mi.z);
      this.scene.add(edge);
      // reeds + drowned hand
      const reeds = new THREE.Group();
      for (let i = 0; i < 14; i++) {
        const a = r() * Math.PI * 2, d = mi.r * (0.8 + r() * 0.4);
        const h = 0.3 + r() * 0.4;
        const c = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.015, h, 3));
        c.position.set(mi.x + Math.cos(a) * d, h / 2, mi.z + Math.sin(a) * d);
        c.rotation.z = (r() - 0.5) * 0.4;
        reeds.add(c);
      }
      this.scene.add(mergeGroup(reeds, this.mats.leaf));
    }
  }

  perimeter() {
    const m = this.mats;
    const curb = new THREE.Group();
    const W = ARENA.halfW, L = ARENA.halfL;
    for (const s of [-1, 1]) {
      for (const zs of [1, -1]) {
        const len = L - RIFT_HALF;
        curb.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.35, len)), s * (W + 0.2), 0.17, zs * (RIFT_HALF + len / 2)));
      }
      curb.add(at(new THREE.Mesh(new THREE.BoxGeometry(W * 2 + 0.8, 0.35, 0.4)), 0, 0.17, s * (L + 0.2)));
    }
    this.scene.add(mergeGroup(curb, m.darkStone));
    // iron fence of spear-points
    const posts = [];
    for (const s of [-1, 1]) {
      for (let z = -L; z <= L; z += 0.45) if (Math.abs(z) > RIFT_HALF + 0.1) posts.push([s * (W + 0.2), z]);
      for (let x = -W; x <= W; x += 0.45) posts.push([x, s * (L + 0.2)]);
    }
    const postGeo = mergeGeometries([
      new THREE.CylinderGeometry(0.02, 0.02, 1.0, 4).translate(0, 0.85, 0).toNonIndexed(),
      new THREE.ConeGeometry(0.05, 0.16, 4).translate(0, 1.42, 0).toNonIndexed(),
    ]);
    const inst = new THREE.InstancedMesh(postGeo, m.iron, posts.length);
    const mtx = new THREE.Matrix4();
    posts.forEach(([x, z], i) => { mtx.makeTranslation(x, 0, z); inst.setMatrixAt(i, mtx); });
    inst.castShadow = true;
    this.scene.add(inst);
    const railGeo = new THREE.Group();
    for (const s of [-1, 1]) {
      for (const zs of [1, -1]) {
        const len = L - RIFT_HALF;
        for (const y of [0.55, 1.2]) railGeo.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, len)), s * (W + 0.2), y, zs * (RIFT_HALF + len / 2)));
      }
      for (const y of [0.55, 1.2]) railGeo.add(at(new THREE.Mesh(new THREE.BoxGeometry(W * 2, 0.03, 0.03)), 0, y, s * (L + 0.2)));
    }
    this.scene.add(mergeGroup(railGeo, m.iron));
    // corner gargoyle pillars
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const g = new THREE.Group();
      g.add(at(mesh(new THREE.BoxGeometry(0.8, 2.2, 0.8), m.darkStone), 0, 1.1, 0));
      g.add(at(mesh(new THREE.BoxGeometry(1.0, 0.2, 1.0), m.stone), 0, 2.25, 0));
      const body = at(mesh(new THREE.SphereGeometry(0.32, 7, 5), m.stone), 0, 2.65, 0.05); body.scale.set(1, 1.1, 0.9);
      const head = at(mesh(new THREE.SphereGeometry(0.17, 6, 5), m.stone), 0, 2.95, 0.28);
      for (const ws of [-1, 1]) {
        const w = mesh(new THREE.BoxGeometry(0.05, 0.6, 0.5), m.stone);
        w.position.set(ws * 0.32, 2.85, -0.1); w.rotation.z = ws * -0.5;
        g.add(w);
      }
      g.add(body, head);
      g.position.set(sx * (W + 0.6), 0, sz * (L + 0.6));
      g.rotation.y = Math.atan2(-sx, -sz);
      this.scene.add(g);
    }
  }

  deadTree(r, scale) {
    const g = new THREE.Group();
    const branch = (len, rad, depth, parent) => {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(rad * 0.6, rad, len, 5));
      c.position.y = len / 2;
      const node = new THREE.Group();
      node.add(c);
      parent.add(node);
      if (depth <= 0) return node;
      const kids = 2 + (r() > 0.6 ? 1 : 0);
      for (let i = 0; i < kids; i++) {
        const k = new THREE.Group();
        k.position.y = len * (0.65 + r() * 0.3);
        k.rotation.set((r() - 0.5) * 1.6, r() * Math.PI * 2, (r() - 0.5) * 1.6);
        node.add(k);
        branch(len * (0.55 + r() * 0.2), rad * 0.6, depth - 1, k);
      }
      return node;
    };
    branch(1.6 * scale, 0.16 * scale, 3, g);
    return g;
  }

  outskirts() {
    const m = this.mats;
    const r = rng(99);
    const trees = new THREE.Group();
    const graves = new THREE.Group();
    const place = (x, z) => Math.abs(z) > RIFT_HALF + 0.8;
    for (let i = 0; i < 46; i++) {
      const side = r() > 0.5 ? 1 : -1;
      const x = side * (ARENA.halfW + 2 + r() * 14);
      const z = (r() - 0.5) * 50;
      if (!place(x, z)) continue;
      const t = this.deadTree(r, 0.9 + r() * 1.4);
      t.position.set(x, 0, z); t.rotation.y = r() * 6;
      trees.add(t);
    }
    for (let i = 0; i < 26; i++) {
      const x = (r() - 0.5) * 34, z = (r() > 0.5 ? 1 : -1) * (ARENA.halfL + 2 + r() * 10);
      const t = this.deadTree(r, 1 + r() * 1.5);
      t.position.set(x, 0, z); trees.add(t);
    }
    this.scene.add(mergeGroup(trees, m.bark));
    for (let i = 0; i < 120; i++) {
      const side = r() > 0.5 ? 1 : -1;
      const x = side * (ARENA.halfW + 1.0 + r() * 7);
      const z = (r() - 0.5) * 36;
      if (!place(x, z)) continue;
      const kind = r();
      const g = new THREE.Group();
      if (kind < 0.55) {
        g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.55, 0.1)), 0, 0.27, 0));
        const top = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.1, 10, 1, false, 0, Math.PI));
        top.rotation.set(Math.PI / 2, Math.PI / 2, 0); top.rotation.order = 'YXZ';
        top.position.y = 0.55; g.add(top);
      } else if (kind < 0.85) {
        g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.8, 0.08)), 0, 0.4, 0));
        g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.08)), 0, 0.58, 0));
      } else {
        g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.25, 1.1)), 0, 0.12, 0));
      }
      g.position.set(x, 0, z);
      g.rotation.set((r() - 0.5) * 0.3, (r() - 0.5) * 0.8 + (side > 0 ? -Math.PI / 2 : Math.PI / 2), (r() - 0.5) * 0.3);
      graves.add(g);
    }
    this.scene.add(mergeGroup(graves, m.stone));
    this.skyline();
  }

  skyline() {
    const m = this.mats;
    const sil = std({ color: 0x0a090c, roughness: 1 });
    const g = new THREE.Group();
    const r = rng(1234);
    const winGeos = [];
    for (let i = 0; i < 9; i++) {
      const x = -36 + i * 9 + (r() - 0.5) * 4;
      const h = 10 + r() * 16;
      const w = 3 + r() * 4;
      g.add(at(new THREE.Mesh(new THREE.BoxGeometry(w, h, 4)), x, h / 2, 0));
      g.add(at(new THREE.Mesh(new THREE.ConeGeometry(w * 0.6, h * 0.7, 4)), x, h + h * 0.35, 0));
      for (let k = 0; k < 4; k++) {
        if (r() > 0.6) continue;
        winGeos.push(new THREE.PlaneGeometry(0.3, 0.8).translate(x + (r() - 0.5) * w * 0.6, h * (0.3 + r() * 0.6), 2.05).toNonIndexed());
      }
    }
    // the great cathedral
    g.add(at(new THREE.Mesh(new THREE.BoxGeometry(18, 22, 8)), 0, 11, -6));
    for (const s of [-1, 1]) {
      g.add(at(new THREE.Mesh(new THREE.BoxGeometry(5, 34, 5)), s * 8, 17, -4));
      g.add(at(new THREE.Mesh(new THREE.ConeGeometry(3.6, 22, 4)), s * 8, 45, -4));
    }
    g.add(at(new THREE.Mesh(new THREE.ConeGeometry(4, 30, 4)), 0, 37, -6));
    const skylineMesh = mergeGroup(g, sil, false);
    skylineMesh.position.set(0, -14, -125);
    this.scene.add(skylineMesh);
    winGeos.push(new THREE.CircleGeometry(3.2, 20).translate(0, 16, -1.9).toNonIndexed());
    const wins = new THREE.Mesh(mergeGeometries(winGeos), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.28, 0.08), fog: false }));
    wins.position.set(0, -14, -125);
    this.scene.add(wins);
  }

  braziers() {
    const m = this.mats;
    this.brazierFlames = [];
    const spots = [[-3.2, 12.2], [3.2, 12.2], [-3.2, -12.2], [3.2, -12.2], [-8.3, 1.4 + RIFT_HALF], [8.3, -1.4 - RIFT_HALF]];
    spots.forEach(([x, z], i) => {
      const g = new THREE.Group();
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2;
        const leg = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 4), m.iron);
        leg.position.set(Math.cos(a) * 0.15, 0.45, Math.sin(a) * 0.15);
        leg.rotation.set(Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25);
        g.add(leg);
      }
      g.add(at(mesh(new THREE.CylinderGeometry(0.32, 0.16, 0.22, 8, 1, true), m.iron), 0, 0.95, 0));
      const coals = at(new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.05, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.7, 0.1) })), 0, 1.0, 0);
      const flame = at(new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.55, 7), m.flame), 0, 1.3, 0);
      g.add(coals, flame);
      const light = i < 4 ? new THREE.PointLight(0xff7a30, 14, 9, 1.6) : null;
      if (light) { light.position.y = 1.6; g.add(light); }
      g.position.set(x, 0, z);
      this.scene.add(g);
      this.brazierFlames.push({ flame, light, x, z, seed: i * 1.7 });
    });
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
      // canvas row 0 = top of texture = -z after plane rotation
      const i = (r * 36 + c) * 4;
      if (!ok) { img.data[i] = 150; img.data[i + 1] = 10; img.data[i + 2] = 10; img.data[i + 3] = 70; }
      else { img.data[i] = 150; img.data[i + 1] = 200; img.data[i + 2] = 255; img.data[i + 3] = 18; }
    }
    ctx.putImageData(img, 0, 0);
    this.zoneTex.needsUpdate = true;
  }

  update(dt, sim) {
    this.t += dt;
    const t = this.t;
    this.magmaTex.offset.x = t * 0.01; this.magmaTex.offset.y = Math.sin(t * 0.2) * 0.05;
    this.mistLayers.forEach((m, i) => { m.material.map.offset.x = t * (0.004 + i * 0.003) * (i % 2 ? -1 : 1); });
    this.riftLights.forEach((l, i) => { l.intensity = 26 + Math.sin(t * 1.7 + i * 2) * 6 + Math.random() * 3; });
    for (const b of this.brazierFlames) {
      const f = 1 + Math.sin(t * 13 + b.seed) * 0.12 + Math.sin(t * 7.3 + b.seed * 2) * 0.1;
      b.flame.scale.set(1, f, 1);
      if (b.light) b.light.intensity = 12 + Math.sin(t * 11 + b.seed) * 2.5 + Math.random() * 2;
      if (Math.random() < dt * 9) this.fx.emit({ x: b.x, y: 1.45, z: b.z, spread: 0.1, vel: [0, 1.2, 0], velRand: 0.25, life: 0.9, size: 0.12, color: [1.8, 0.6, 0.15, 1] });
    }
    // rising embers from the rift
    for (let i = 0; i < 3; i++) {
      if (Math.random() < dt * 30) {
        this.fx.emit({ x: (Math.random() - 0.5) * 26, y: -2.5, z: (Math.random() - 0.5) * RIFT_HALF * 1.8, vel: [0, 1.6, 0], velRand: 0.4, life: 2.6, size: 0.1, color: [2.2, 0.55, 0.12, 1], drag: 0.2 });
      }
    }
    // falling ash
    if (Math.random() < dt * 12) {
      this.smoke.emit({ x: (Math.random() - 0.5) * 24, y: 8, z: (Math.random() - 0.5) * 34, vel: [0.3, -0.6, 0.1], velRand: 0.2, life: 9, size: 0.07, sizeEnd: 1, color: [0.55, 0.52, 0.5, 0.7] });
    }
    this.crystal.rotation.y += dt * 0.8;
    this.crystal.position.y = 3.0 + Math.sin(t * 1.4) * 0.12;
    if (sim) {
      this.updateSpikes(sim);
      this.updateAltar(sim, t);
      for (const th of this.thicketMeshes) {
        th.rustle = Math.max(0, th.rustle - dt * 2);
        const w = th.rustle * Math.sin(t * 30) * 0.03;
        th.g.rotation.z = w; th.g.scale.y = 1 + th.rustle * 0.03;
      }
      for (const mi of this.mireDefs) {
        if (Math.random() < dt * 1.5) this.smoke.emit({ x: mi.x + (Math.random() - 0.5) * mi.r, y: 0.05, z: mi.z + (Math.random() - 0.5) * mi.r, vel: [0, 0.15, 0], life: 1.5, size: 0.18, sizeEnd: 1.6, color: [0.12, 0.14, 0.08, 0.5] });
      }
    }
    this.fx.update(dt); this.smoke.update(dt);
  }

  updateSpikes(sim) {
    for (const s of this.spikes) {
      const st = sim.spikeState(s.def);
      s.plateMat.emissiveIntensity = st.warn ? 0.6 + Math.sin(this.t * 30) * 0.4 : 0;
      const target = st.up ? 0 : -0.6;
      s.spikeMesh.position.y += (target - s.spikeMesh.position.y) * (st.up ? 0.6 : 0.12);
    }
  }

  updateAltar(sim, t) {
    const a = sim.altar;
    const own = a.owner;
    const col = own === null ? new THREE.Color(1.0, 0.95, 0.9) : new THREE.Color(FACTION[own].glow);
    this.crystalMat.color.copy(col).multiplyScalar(own === null ? 1.6 : 3.2);
    this.altarLight.color.copy(col);
    this.altarLight.intensity = 10 + Math.sin(t * 2) * 2;
    this.runeMat.color.copy(col).multiplyScalar(own === null ? 0.9 : 1.6);
    this.runeMat.opacity = own === null ? 0.35 : 0.7;
    this.rune.rotation.z = t * 0.05;
    this.beamMat.color.copy(col);
    this.beamMat.opacity = own === null ? 0 : 0.07 + Math.sin(t * 3) * 0.02;
    const p = Math.abs(a.progress);
    const segs = Math.round(p * 64);
    this.progressRing.geometry.setDrawRange(0, segs * 6);
    const pc = a.progress >= 0 ? FACTION[0].glow : FACTION[1].glow;
    this.progressMat.color.set(pc).multiplyScalar(2);
    this.progressMat.opacity = p > 0.01 ? 0.85 : 0;
  }
}
