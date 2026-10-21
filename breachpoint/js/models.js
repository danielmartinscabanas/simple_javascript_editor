import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { FACTION } from './config.js';

// All meshes come from CC0 packs (Quaternius, Kenney). See assets/licenses.
const GLB = {};
const FILES = [
  'u_BlueSoldier_Male', 'u_BlueSoldier_Female', 'u_Soldier_Male', 'u_Ninja_Sand', 'u_Ninja_Sand_Female',
  'm_Leela', 'm_George', 'z_dog', 'w_Rifle', 'w_SMG', 'w_Shotgun', 'w_Pistol',
  'k_enemy-ufo-b-weapon', 'k_craft_speederA', 'k_enemy-ufo-d-weapon', 'b_grenade-a',
  'c_tower-square-base', 'c_tower-square-mid', 'c_tower-square-top', 'c_tower-square-top-roof', 'c_wall', 'c_wall-doorway',
  'c_gate', 'c_flag-wide', 'c_wall-pillar', 'e_Container_Red', 'e_Container_Green', 'e_Barrel', 'e_Pallet',
  'e_TrafficBarrier_1', 'e_WaterTower', 'e_CinderBlock', 'e_PlasticBarrier', 'e_StreetLights', 'e_Wheels_Stack',
  'v_Vehicle_Truck_Armored', 'b_crate-medium', 'b_crate-wide', 's_box-large', 'r_detail-dumpster-closed',
  'r_detail-barrier-strong-type-a',
];

// Weapon grip on the Quaternius character rig's right fist.
const GRIP = { bone: 'FistR', pos: [0, 0.02, 0.12], rot: [Math.PI / 2, 0, Math.PI / 2] };
const RIFLE = { file: 'w_Rifle', len: 0.75, ...GRIP };
const SMG = { file: 'w_SMG', len: 0.5, ...GRIP };
const SHOTGUN = { file: 'w_Shotgun', len: 0.75, ...GRIP };
const PISTOL = { file: 'w_Pistol', len: 0.25, ...GRIP };
const SOLDIER = { idle: 'Idle', move: 'Walk', run: 'Run', attack: 'Shoot_OneHanded', death: 'Death' };

// Per-card models; each side has its own look.
const UNITS = {
  rifleman: {
    ct: { file: 'u_BlueSoldier_Male', h: 1.25, weapon: RIFLE, ...SOLDIER },
    t: { file: 'u_Ninja_Sand', h: 1.25, weapon: RIFLE, ...SOLDIER },
  },
  smg: {
    ct: { file: 'u_BlueSoldier_Female', h: 1.15, weapon: SMG, ...SOLDIER, move: 'Run' },
    t: { file: 'u_Ninja_Sand_Female', h: 1.15, weapon: SMG, ...SOLDIER, move: 'Run' },
  },
  sniper: {
    ct: { file: 'u_BlueSoldier_Male', h: 1.25, weapon: { ...RIFLE, len: 1.0 }, ...SOLDIER, tint: 0x8fa8c8 },
    t: { file: 'u_Ninja_Sand', h: 1.25, weapon: { ...RIFLE, len: 1.0 }, ...SOLDIER, tint: 0xc9b89a },
  },
  heavy: {
    ct: { file: 'u_Soldier_Male', h: 1.55, weapon: SHOTGUN, ...SOLDIER, tint: 0x8a9a8a },
    t: { file: 'u_Ninja_Sand', h: 1.55, weapon: SHOTGUN, ...SOLDIER, tint: 0x9a8a72 },
  },
  breacher: {
    ct: { file: 'u_BlueSoldier_Male', h: 1.25, carry: true, ...SOLDIER, move: 'Run_Carry', run: 'Run_Carry', attack: 'Punch' },
    t: { file: 'u_Ninja_Sand', h: 1.25, carry: true, ...SOLDIER, move: 'Run_Carry', run: 'Run_Carry', attack: 'Punch' },
  },
  mech: {
    ct: { file: 'm_Leela', h: 1.9, idle: 'Idle', move: 'Walk', attack: 'Shoot', death: 'Death' },
    t: { file: 'm_George', h: 1.9, idle: 'Idle', move: 'Walk', attack: 'Shoot', death: 'Death' },
  },
  dog: {
    ct: { file: 'z_dog', h: 0.8, idle: 'Idle', move: 'Run', attack: 'Attack', death: 'Death', collar: true },
    t: { file: 'z_dog', h: 0.8, idle: 'Idle', move: 'Run', attack: 'Attack', death: 'Death', collar: true },
  },
  drone: {
    ct: { file: 'k_enemy-ufo-b-weapon', h: 0.7, flyer: true, paint: true },
    t: { file: 'k_enemy-ufo-b-weapon', h: 0.7, flyer: true, paint: true },
  },
  kamikaze: {
    ct: { file: 'k_craft_speederA', h: 0.35, flyer: true, paint: true, w: 0.9 },
    t: { file: 'k_craft_speederA', h: 0.35, flyer: true, paint: true, w: 0.9 },
  },
  sentry: {
    ct: { file: 'k_enemy-ufo-d-weapon', h: 1.1, building: true, paint: true },
    t: { file: 'k_enemy-ufo-d-weapon', h: 1.1, building: true, paint: true },
  },
};

export async function loadAssets(base = './assets/models/') {
  const loader = new GLTFLoader();
  let packed = null;
  try { packed = (await import('./assets-data.js')).default; } catch { /* fall back to loose .glb files */ }
  const decode = (b64) => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; };
  await Promise.allSettled(FILES.map(async (f) => {
    const g = packed?.[f] ? await loader.parseAsync(decode(packed[f]), '') : await loader.loadAsync(`${base}${f}.glb`);
    const box = boundsOf(g.scene);
    GLB[f] = { scene: g.scene, animations: g.animations, box, height: box.max.y - Math.min(0, box.min.y) };
  }));
  return Object.keys(GLB).length;
}
export const hasAsset = (f) => !!GLB[f];

export function boundsOf(obj) {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3(), tmp = new THREE.Box3();
  obj.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    if (o.isSkinnedMesh) { o.computeBoundingBox(); tmp.copy(o.boundingBox).applyMatrix4(o.matrixWorld); }
    else { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); tmp.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld); }
    box.union(tmp);
  });
  return box;
}

// ---------- shared materials ----------
const teamCache = [null, null];
export function teamMats(team) {
  const f = FACTION[team];
  if (teamCache[team]?.id === f.id) return teamCache[team];
  const glow = new THREE.Color(f.glow);
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const m = {
    id: f.id,
    darkStone: std({ color: 0x9c7d55, roughness: 0.95, flatShading: true }),
    cloth: std({ color: f.cloth, roughness: 0.9, side: THREE.DoubleSide }),
    banner: std({ color: f.banner, roughness: 1, side: THREE.DoubleSide }),
    glow: new THREE.MeshBasicMaterial({ color: glow.clone().multiplyScalar(2.6) }),
    glowColor: glow,
  };
  teamCache[team] = m;
  return m;
}

// ---------- props ----------
// A static clone of a GLB prop, scaled so its largest footprint side (or height) matches.
export function prop(file, { w, h, d } = {}) {
  const src = GLB[file];
  if (!src) return null;
  const obj = src.scene.clone(true);
  const size = src.box.getSize(new THREE.Vector3());
  let s = 1;
  if (h) s = h / size.y;
  else if (w) s = w / Math.max(size.x, 0.001);
  else if (d) s = d / Math.max(size.z, 0.001);
  obj.scale.setScalar(s);
  const c = src.box.getCenter(new THREE.Vector3());
  obj.position.set(-c.x * s, -src.box.min.y * s, -c.z * s);
  const g = new THREE.Group();
  g.add(obj);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.userData.size = size.multiplyScalar(s);
  return g;
}

// ---------- rigged units ----------
function paintTeam(root, team) {
  const glow = new THREE.Color(FACTION[team].glow);
  root.traverse((o) => {
    if (!o.isMesh) return;
    const c = o.material.clone();
    // Kenney palette: pull the brightest accent colours toward the team colour
    const hsl = {}; c.color.getHSL(hsl);
    if (hsl.s > 0.35) c.color.lerp(glow, 0.75);
    o.material = c;
  });
}

// The gun follows the hand bone's position but always points where the unit faces (+Z in root space).
function attachWeapon(body, spec, root) {
  const w = spec.weapon;
  if (!w || !GLB[w.file]) return null;
  const bone = body.getObjectByName(w.bone) || body.getObjectByName('Fist.R');
  if (!bone) return null;
  const src = GLB[w.file];
  const gun = src.scene.clone(true);
  const size = src.box.getSize(new THREE.Vector3());
  const c = src.box.getCenter(new THREE.Vector3());
  const longest = Math.max(size.x, size.y, size.z);
  const s = w.len / longest;
  gun.scale.setScalar(s);
  gun.position.set(-c.x * s, -c.y * s, -c.z * s);
  const holder = new THREE.Group();
  const orient = new THREE.Group();
  orient.add(gun);
  // swing the gun's long axis onto +Z
  if (size.x >= size.z && size.x >= size.y) orient.rotation.y = w.flip ? Math.PI / 2 : -Math.PI / 2;
  else if (size.y > size.z) orient.rotation.x = Math.PI / 2;
  else if (w.flip) orient.rotation.y = Math.PI;
  holder.add(orient);
  holder.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  root.add(holder);
  return { holder, bone, offset: new THREE.Vector3(0, 0, w.len * 0.3) };
}

const _v = new THREE.Vector3();
export function syncWeapon(rig, root) {
  const g = rig.gun;
  if (!g) return;
  root.updateMatrixWorld(true);
  g.bone.getWorldPosition(_v);
  root.worldToLocal(_v);
  g.holder.position.copy(_v).add(g.offset);
}

function rigged(spec, team) {
  const src = GLB[spec.file];
  const body = SkeletonUtils.clone(src.scene);
  body.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  if (spec.paint) paintTeam(body, team);
  if (spec.tint) body.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.multiply(new THREE.Color(spec.tint)); } });
  const size = src.box.getSize(new THREE.Vector3());
  const s = spec.w ? spec.w / Math.max(size.x, size.z) : spec.h / src.height;
  body.scale.setScalar(s);
  const c = src.box.getCenter(new THREE.Vector3());
  if (spec.flyer || spec.building || spec.paint) body.position.set(-c.x * s, -Math.min(0, src.box.min.y) * s, -c.z * s);
  const root = new THREE.Group();
  root.add(body);
  const gun = attachWeapon(body, spec, root);
  const m = teamMats(team);
  if (spec.carry) {
    const charge = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.24, 0.22), new THREE.MeshStandardMaterial({ color: 0x3a3f2a, roughness: 0.8 }));
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.02), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.2, 0.1) }));
    led.position.set(0.08, 0.06, 0.115);
    charge.add(led);
    charge.position.set(0, spec.h * 0.55, 0.28);
    charge.castShadow = true;
    root.add(charge);
  }
  if (spec.collar) {
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.42), m.cloth);
    vest.position.set(0, spec.h * 0.78, -0.02);
    root.add(vest);
  }
  const mixer = new THREE.AnimationMixer(body);
  const actions = {};
  for (const clip of src.animations) actions[clip.name] = mixer.clipAction(clip);
  const rig = { gltf: true, mixer, actions, spec, current: null, body: root, flyer: !!spec.flyer, building: !!spec.building, gun };
  if (spec.idle && actions[spec.idle]) { playClip(rig, spec.idle, 0); mixer.update(0.01); }
  syncWeapon(rig, root);
  return { root, rig, height: spec.h };
}

export function playClip(rig, name, fade = 0.15, once = false, speed = 1) {
  const a = rig.actions[name];
  if (!a) return;
  if (rig.current === a && !once) { a.timeScale = speed; return; }
  a.reset();
  a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
  a.clampWhenFinished = once;
  a.timeScale = speed;
  a.play();
  if (rig.current && rig.current !== a) rig.current.crossFadeTo(a, fade, false);
  rig.current = a;
}

// ---------- spell icons (card art + ghosts) ----------
function canister(team, color, band) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.5, 14), new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.4 }));
  body.position.y = 0.3;
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.165, 0.08, 14), new THREE.MeshStandardMaterial({ color: band, roughness: 0.4 }));
  ring.position.y = 0.38;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.1, 10), new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.8, roughness: 0.3 }));
  cap.position.y = 0.6;
  const lever = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.32, 0.06), new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.8, roughness: 0.3 }));
  lever.position.set(0.17, 0.48, 0); lever.rotation.z = 0.15;
  g.add(body, ring, cap, lever);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function spellModel(name, team) {
  if (name === 'grenade') {
    const p = prop('b_grenade-a', { h: 0.7 });
    if (p) return p;
    return canister(team, 0x4a5a32, 0x2a3320);
  }
  if (name === 'smokecan') return canister(team, 0x8a9096, 0xdddddd);
  if (name === 'flashcan') return canister(team, 0x6a7078, 0xf2e04a);
  if (name === 'molotov') {
    const g = new THREE.Group();
    const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 0.42, 12), new THREE.MeshStandardMaterial({ color: 0x5a7a2a, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85 }));
    bottle.position.y = 0.21;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.12, 0.22, 10), bottle.material);
    neck.position.y = 0.52;
    const rag = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 6), new THREE.MeshStandardMaterial({ color: 0xd8c8a0 }));
    rag.position.y = 0.72;
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.1, 0.2) }));
    flame.position.y = 0.9;
    g.add(bottle, neck, rag, flame);
    return g;
  }
  return new THREE.Group();
}

export function buildModel(name, team) {
  const side = FACTION[team].id;
  const spec = UNITS[name]?.[side];
  if (spec && GLB[spec.file]) {
    const out = rigged(spec, team);
    out.root.traverse((o) => { if (o.isMesh) o.userData.baseMat = o.material; });
    return out;
  }
  if (UNITS[name]) return fallbackUnit(team, spec?.h || 1.2, spec?.flyer);
  const root = new THREE.Group();
  root.add(spellModel(name, team));
  return { root, rig: { body: root }, height: 0.9 };
}

function fallbackUnit(team, h, flyer) {
  const m = teamMats(team);
  const root = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, h * 0.5, 4, 8), m.cloth);
  body.position.y = h * 0.5;
  root.add(body);
  return { root, rig: { body: root, flyer }, height: h };
}

// ---------- towers (stacked Kenney castle-kit modules) ----------
// maxH squashes the stack vertically so outposts stay low and don't hide the field
function stack(pieces, width, maxH = Infinity) {
  const g = new THREE.Group();
  let y = 0;
  for (const name of pieces) {
    const p = prop(name, { w: width });
    if (!p) continue;
    p.position.y = y;
    y += p.userData.size.y;
    g.add(p);
  }
  const k = Math.min(1, maxH / y);
  g.scale.y = k;
  g.userData.top = y * k;
  return g;
}

function gunner(team) {
  const side = FACTION[team].id;
  const spec = UNITS.rifleman[side];
  if (!GLB[spec.file]) return null;
  return rigged({ ...spec, h: 1.5 }, team);
}

function teamBanners(g, team, width, y, h) {
  const m = teamMats(team);
  for (const s of [-1, 1]) {
    const ban = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.42, h), m.banner);
    ban.position.set(0, y, s * (width / 2 + 0.02));
    ban.rotation.y = s > 0 ? 0 : Math.PI;
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.08, h * 0.9), m.glow);
    stripe.position.set(0, y, s * (width / 2 + 0.03));
    stripe.rotation.y = ban.rotation.y;
    g.add(ban, stripe);
  }
}

export function bellTower(team) {
  const root = new THREE.Group();
  const width = 2.3;
  const t = stack(['c_tower-square-base', 'c_tower-square-top'], width, 1.5);
  root.add(t);
  const top = t.userData.top || 4;
  teamBanners(root, team, width, top * 0.55, top * 0.35);
  const gun = gunner(team);
  if (gun) { gun.root.position.y = top - 0.35; root.add(gun.root); }
  const plate = new THREE.Mesh(new THREE.RingGeometry(1.25, 1.45, 32), teamMats(team).glow);
  plate.rotation.x = -Math.PI / 2; plate.position.y = 0.03;
  root.add(plate);
  return { root, rig: { gunner: gun, muzzleY: top + 0.6 }, height: top + 1.4 };
}

export function cathedralKeep(team) {
  const root = new THREE.Group();
  const width = 3.1;
  const t = stack(['c_tower-square-base', 'c_tower-square-mid', 'c_tower-square-top'], width, 2.1);
  root.add(t);
  const top = t.userData.top || 6;
  teamBanners(root, team, width, top * 0.5, top * 0.4);
  const turret = prop('k_enemy-ufo-d-weapon', { w: 1.3 });
  const turretPivot = new THREE.Group();
  if (turret) { paintTeam(turret, team); turretPivot.add(turret); }
  turretPivot.position.y = top - 0.25;
  root.add(turretPivot);
  const flag = prop('c_flag-wide', { h: 1.4 });
  if (flag) {
    flag.position.set(width * 0.38, top - 0.2, width * 0.38);
    flag.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); const hsl = {}; o.material.color.getHSL(hsl); if (hsl.s > 0.3) o.material.color.set(FACTION[team].banner); } });
    root.add(flag);
  }
  const eyes = new THREE.Group(); eyes.visible = false; // "awake" marker
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), teamMats(team).glow);
  lamp.position.y = 1.0; eyes.add(lamp);
  turretPivot.add(eyes);
  const plate = new THREE.Mesh(new THREE.RingGeometry(1.7, 1.95, 40), teamMats(team).glow);
  plate.rotation.x = -Math.PI / 2; plate.position.y = 0.03;
  root.add(plate);
  return { root, rig: { statue: turretPivot, statueEyes: eyes, muzzleY: top + 0.5 }, height: top + 1.4 };
}

export function healthBar(width, team) {
  const g = new THREE.Group();
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(width + 0.06, 0.13), new THREE.MeshBasicMaterial({ color: 0x050405, depthTest: false, transparent: true, opacity: 0.85 }));
  const col = new THREE.Color(FACTION[team].glow).multiplyScalar(1.3);
  const fg = new THREE.Mesh(new THREE.PlaneGeometry(width, 0.08), new THREE.MeshBasicMaterial({ color: col, depthTest: false, transparent: true }));
  fg.geometry.translate(width / 2, 0, 0);
  fg.position.x = -width / 2; fg.position.z = 0.001;
  bg.renderOrder = 998; fg.renderOrder = 999;
  g.add(bg, fg);
  g.userData.fg = fg;
  return g;
}

export function crow() { return new THREE.Group(); }
